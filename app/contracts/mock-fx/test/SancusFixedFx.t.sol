// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../SancusFixedFx.sol";
import "../../mock-stablecoin/SancusMockStablecoin.sol";

contract FxActor {
    function swapExact(
        SancusFixedFx fx,
        address source,
        address destination,
        uint256 amount,
        uint256 minOut,
        bytes32 ref
    ) external returns (uint256) {
        return fx.swapExact(source, destination, amount, minOut, ref);
    }

    function setAsset(SancusFixedFx fx, address token) external {
        fx.setAsset(token, 1_000_000, 6, true);
    }
}

contract SancusFixedFxTest {
    SancusFixedFx private fx;
    SancusMockStablecoin private brl;
    SancusMockStablecoin private thb;
    FxActor private actor;

    function setUp() public {
        fx = new SancusFixedFx();
        brl = new SancusMockStablecoin("Mock BRL", "mBRL", 2);
        thb = new SancusMockStablecoin("Mock THB", "mTHB", 2);
        actor = new FxActor();
        fx.setAsset(address(brl), 5_412_300, 2, true);
        fx.setAsset(address(thb), 35_000_000, 2, true);
        brl.setMinter(address(fx), true);
        thb.setMinter(address(fx), true);
    }

    function testQuotesAndConvertsBrazilToThailand() public {
        brl.mint(address(actor), 5_412, "seed");
        uint256 quoted = fx.quote(address(brl), address(thb), 5_412);
        require(quoted == 34_998, "unexpected rounded quote");
        uint256 received = actor.swapExact(fx, address(brl), address(thb), 5_412, 34_998, keccak256("br-th-1"));
        require(received == 34_998, "wrong output");
        require(brl.balanceOf(address(actor)) == 0, "source not burned");
        require(thb.balanceOf(address(actor)) == 34_998, "destination not minted to sender");
    }

    function testMinimumOutputProtectsConversion() public {
        brl.mint(address(actor), 5_412, "seed");
        (bool ok,) = address(actor).call(
            abi.encodeCall(actor.swapExact, (fx, address(brl), address(thb), 5_412, 35_000, keccak256("slippage")))
        );
        require(!ok, "minimum output should revert");
        require(brl.balanceOf(address(actor)) == 5_412, "reverted burn changed balance");
    }

    function testReferenceCannotBeReplayed() public {
        bytes32 ref = keccak256("replay");
        brl.mint(address(actor), 10_824, "seed");
        actor.swapExact(fx, address(brl), address(thb), 5_412, 0, ref);
        (bool ok,) = address(actor).call(
            abi.encodeCall(actor.swapExact, (fx, address(brl), address(thb), 5_412, 0, ref))
        );
        require(!ok, "replayed reference should revert");
    }

    function testOnlyOwnerCanChangeRates() public {
        (bool ok,) = address(actor).call(abi.encodeCall(actor.setAsset, (fx, address(brl))));
        require(!ok, "non-owner changed a rate");
    }

    function testPauseStopsSwaps() public {
        brl.mint(address(actor), 5_412, "seed");
        fx.setPaused(true);
        (bool ok,) = address(actor).call(
            abi.encodeCall(actor.swapExact, (fx, address(brl), address(thb), 5_412, 0, keccak256("paused")))
        );
        require(!ok, "paused swap should revert");
    }
}
