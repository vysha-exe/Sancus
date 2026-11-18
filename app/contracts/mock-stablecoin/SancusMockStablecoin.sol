// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SancusMockStablecoin
/// @notice TEST TOKEN WITH NO VALUE. Simulates a local-currency rail (BRL / IDR / THB) for
///         Sancus on Arc testnet. Sancus's rail bot mints tokens when a sandbox payment
///         (QRIS, PromptPay, Pix) completes and burns them when money leaves via a local
///         payout. Standard ERC-20 otherwise, so any wallet or explorer can display it.
contract SancusMockStablecoin {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    string public constant notice =
        "TEST TOKEN - no value. Simulates a local-currency payment rail for Sancus on Arc testnet.";

    uint256 public totalSupply;
    address public owner;
    mapping(address => bool) public minters;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MinterSet(address indexed minter, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    /// @dev `ref` links the mint/burn to the sandbox payment that caused it.
    event RailMint(address indexed to, uint256 value, string ref);
    event RailBurn(address indexed from, uint256 value, string ref);

    error NotOwner();
    error NotMinter();
    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyMinter() {
        if (!minters[msg.sender]) revert NotMinter();
        _;
    }

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        owner = msg.sender;
        minters[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit MinterSet(msg.sender, true);
    }

    // ---------- ERC-20 ----------

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    // ---------- rail bot ----------

    /// @notice Local currency arrived through a (sandbox) rail: credit `to`.
    function mint(address to, uint256 value, string calldata ref) external onlyMinter {
        if (to == address(0)) revert ZeroAddress();
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
        emit RailMint(to, value, ref);
    }

    /// @notice Local currency left through a (sandbox) rail: debit `from`.
    /// @dev Test-token power: the rail bot can redeem from any holder.
    function burn(address from, uint256 value, string calldata ref) external onlyMinter {
        uint256 bal = balanceOf[from];
        if (bal < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = bal - value;
            totalSupply -= value;
        }
        emit Transfer(from, address(0), value);
        emit RailBurn(from, value, ref);
    }

    // ---------- admin ----------

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _transfer(address from, address to, uint256 value) private {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = balanceOf[from];
        if (bal < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = bal - value;
        }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
