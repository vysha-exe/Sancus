// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract MockEquityToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public owner;
    address public broker;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(string memory name_, string memory symbol_) { name = name_; symbol = symbol_; owner = msg.sender; }
    function setBroker(address next) external { require(msg.sender == owner, "owner"); broker = next; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; emit Approval(msg.sender, spender, amount); return true; }
    function transfer(address to, uint256 amount) external returns (bool) { _move(msg.sender, to, amount); return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender]; require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount); return true;
    }
    function mint(address to, uint256 amount) external { require(msg.sender == broker, "broker"); totalSupply += amount; balanceOf[to] += amount; emit Transfer(address(0), to, amount); }
    function burn(address from, uint256 amount) external { require(msg.sender == broker, "broker"); require(balanceOf[from] >= amount, "balance"); balanceOf[from] -= amount; totalSupply -= amount; emit Transfer(from, address(0), amount); }
    function _move(address from, address to, uint256 amount) private { require(to != address(0), "zero"); require(balanceOf[from] >= amount, "balance"); balanceOf[from] -= amount; balanceOf[to] += amount; emit Transfer(from, to, amount); }
}

contract MockEquityBroker {
    IERC20Like public immutable settlement;
    address public owner;
    mapping(address => uint256) public priceMicroUsdc;
    mapping(address => bool) public supported;

    event PriceUpdated(address indexed asset, uint256 priceMicroUsdc);
    event Bought(address indexed buyer, address indexed asset, uint256 usdcIn, uint256 sharesOut);
    event Sold(address indexed seller, address indexed asset, uint256 sharesIn, uint256 usdcOut);

    constructor(address settlement_) { settlement = IERC20Like(settlement_); owner = msg.sender; }
    function setAsset(address asset, uint256 price) external { require(msg.sender == owner, "owner"); require(price > 0, "price"); supported[asset] = true; priceMicroUsdc[asset] = price; emit PriceUpdated(asset, price); }
    function quoteBuy(address asset, uint256 usdcAmount) public view returns (uint256) { require(supported[asset], "asset"); return usdcAmount * 1e18 / priceMicroUsdc[asset]; }
    function quoteSell(address asset, uint256 shares) public view returns (uint256) { require(supported[asset], "asset"); return shares * priceMicroUsdc[asset] / 1e18; }
    function buy(address asset, uint256 usdcAmount, uint256 minSharesOut) external returns (uint256 shares) {
        shares = quoteBuy(asset, usdcAmount); require(shares > 0 && shares >= minSharesOut, "slippage");
        require(settlement.transferFrom(msg.sender, address(this), usdcAmount), "payment");
        MockEquityToken(asset).mint(msg.sender, shares); emit Bought(msg.sender, asset, usdcAmount, shares);
    }
    function sell(address asset, uint256 shares, uint256 minUsdcOut) external returns (uint256 usdcOut) {
        usdcOut = quoteSell(asset, shares); require(usdcOut > 0 && usdcOut >= minUsdcOut, "slippage");
        MockEquityToken(asset).burn(msg.sender, shares); require(settlement.transfer(msg.sender, usdcOut), "liquidity");
        emit Sold(msg.sender, asset, shares, usdcOut);
    }
}
