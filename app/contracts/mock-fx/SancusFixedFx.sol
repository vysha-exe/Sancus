// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISancusFxToken {
    function mint(address to, uint256 value, string calldata ref) external;
    function burn(address from, uint256 value, string calldata ref) external;
}

/// @title SancusFixedFx
/// @notice TESTNET-ONLY fixed-rate FX for Sancus mock currencies. The contract burns the
///         source test token and mints the destination test token atomically. Rates are
///         expressed as micro currency units per USD and do not expire.
contract SancusFixedFx {
    struct Asset {
        uint64 unitsPerUsdMicro;
        uint8 decimals;
        bool enabled;
    }

    address public owner;
    bool public paused;
    uint64 public rateVersion;
    mapping(address => Asset) public assets;
    mapping(bytes32 => bool) public processedRefs;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AssetSet(address indexed token, uint64 unitsPerUsdMicro, uint8 decimals, bool enabled, uint64 rateVersion);
    event PausedSet(bool paused);
    event FxConverted(
        bytes32 indexed ref,
        address indexed sourceToken,
        address indexed destinationToken,
        address sourceHolder,
        address recipient,
        uint256 sourceAmount,
        uint256 destinationAmount,
        uint64 rateVersion
    );

    error NotOwner();
    error Paused();
    error InvalidAsset();
    error InvalidAmount();
    error Slippage();
    error ZeroAddress();
    error RefAlreadyProcessed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
        rateVersion = 1;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /// @notice Configure a fixed rate. `unitsPerUsdMicro` is currency units per USD × 1e6.
    function setAsset(address token, uint64 unitsPerUsdMicro, uint8 decimals, bool enabled) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (unitsPerUsdMicro == 0 || decimals > 18) revert InvalidAsset();
        unchecked {
            rateVersion += 1;
        }
        assets[token] = Asset(unitsPerUsdMicro, decimals, enabled);
        emit AssetSet(token, unitsPerUsdMicro, decimals, enabled, rateVersion);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PausedSet(value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function quote(address sourceToken, address destinationToken, uint256 sourceAmount) public view returns (uint256) {
        if (sourceAmount == 0) revert InvalidAmount();
        Asset memory source = assets[sourceToken];
        Asset memory destination = assets[destinationToken];
        if (!source.enabled || !destination.enabled) revert InvalidAsset();
        if (sourceToken == destinationToken) return sourceAmount;

        uint256 numerator = sourceAmount * uint256(destination.unitsPerUsdMicro) * (10 ** destination.decimals);
        uint256 denominator = uint256(source.unitsPerUsdMicro) * (10 ** source.decimals);
        return numerator / denominator;
    }

    /// @notice Burn the caller's source token and mint the result back to the caller.
    ///         This is the composable form intended for a following transfer in a multicall.
    function swapExact(
        address sourceToken,
        address destinationToken,
        uint256 sourceAmount,
        uint256 minDestinationAmount,
        bytes32 ref
    ) external whenNotPaused returns (uint256 destinationAmount) {
        return _convert(sourceToken, destinationToken, msg.sender, msg.sender, sourceAmount, minDestinationAmount, ref);
    }

    /// @notice Burn the caller's source token and mint directly to the destination wallet.
    function swapExactTo(
        address sourceToken,
        address destinationToken,
        address recipient,
        uint256 sourceAmount,
        uint256 minDestinationAmount,
        bytes32 ref
    ) external whenNotPaused returns (uint256 destinationAmount) {
        return _convert(sourceToken, destinationToken, msg.sender, recipient, sourceAmount, minDestinationAmount, ref);
    }

    /// @notice Rail-bot path for developer-controlled wallets. The owner executes the conversion,
    ///         while the burn and mint are attributed to the actual branch wallet addresses.
    function operatorSwapFromTo(
        address sourceToken,
        address destinationToken,
        address sourceHolder,
        address recipient,
        uint256 sourceAmount,
        uint256 minDestinationAmount,
        bytes32 ref
    ) external onlyOwner whenNotPaused returns (uint256 destinationAmount) {
        return _convert(sourceToken, destinationToken, sourceHolder, recipient, sourceAmount, minDestinationAmount, ref);
    }

    function _convert(
        address sourceToken,
        address destinationToken,
        address sourceHolder,
        address recipient,
        uint256 sourceAmount,
        uint256 minDestinationAmount,
        bytes32 ref
    ) private returns (uint256 destinationAmount) {
        if (sourceHolder == address(0) || recipient == address(0)) revert ZeroAddress();
        if (processedRefs[ref]) revert RefAlreadyProcessed();
        destinationAmount = quote(sourceToken, destinationToken, sourceAmount);
        if (destinationAmount < minDestinationAmount) revert Slippage();

        processedRefs[ref] = true;
        ISancusFxToken(sourceToken).burn(sourceHolder, sourceAmount, _refLabel(ref, "FX_BURN"));
        ISancusFxToken(destinationToken).mint(recipient, destinationAmount, _refLabel(ref, "FX_MINT"));
        emit FxConverted(
            ref,
            sourceToken,
            destinationToken,
            sourceHolder,
            recipient,
            sourceAmount,
            destinationAmount,
            rateVersion
        );
    }

    function _refLabel(bytes32 ref, string memory action) private pure returns (string memory) {
        bytes memory out = new bytes(64 + 1 + bytes(action).length);
        bytes16 alphabet = "0123456789abcdef";
        for (uint256 i = 0; i < 32; i++) {
            out[i * 2] = alphabet[uint8(ref[i] >> 4)];
            out[i * 2 + 1] = alphabet[uint8(ref[i] & 0x0f)];
        }
        out[64] = bytes1(":");
        bytes memory suffix = bytes(action);
        for (uint256 i = 0; i < suffix.length; i++) out[65 + i] = suffix[i];
        return string(out);
    }
}
