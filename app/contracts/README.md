# Smart contracts

Network: **Arc Testnet** (`chainId` `5042002`)  
Explorer: https://explorer.testnet.arc.io

Canonical onchain addresses live in:

- `mock-stablecoin/deployments.json`
- `mock-fx/deployments.json`
- `mock-equities/deployments.json`

Update this README when those files change.

---

## Deployed by Sancus

### Face / settlement

```
Sancus Face USDC (fUSDC): 0x5ae6d882b075628ea839e57cf422172434f27e0c
```

- Source: `mock-stablecoin/SancusMockStablecoin.sol`
- Deploy: `scripts/deploy-mock-stablecoins.mjs`
- Explorer: https://explorer.testnet.arc.io/address/0x5ae6d882b075628ea839e57cf422172434f27e0c

### Local-rail mock stablecoins

Same `SancusMockStablecoin` bytecode; one token per local currency rail.

```
Sancus Mock Brazilian Real (mBRL): 0xa4998745ede2f259f392ee4b71156badb5da8755
Sancus Mock Indonesian Rupiah (mIDR): 0xdca139d380fbd00c61b4ed696d8f81e659957ae6
Sancus Mock Thai Baht (mTHB): 0x00bf05794364ef67815094d7158a0270e555f944
```

| Symbol | Currency | Rail | Explorer |
|---|---|---|---|
| mBRL | BRL | PIX | https://explorer.testnet.arc.io/address/0xa4998745ede2f259f392ee4b71156badb5da8755 |
| mIDR | IDR | QRIS | https://explorer.testnet.arc.io/address/0xdca139d380fbd00c61b4ed696d8f81e659957ae6 |
| mTHB | THB | PromptPay | https://explorer.testnet.arc.io/address/0x00bf05794364ef67815094d7158a0270e555f944 |

### Fixed-rate FX

```
Sancus Fixed FX: 0x88f731c91b23ef05fd3bb448a148f7cf46b08a90
```

- Source: `mock-fx/SancusFixedFx.sol`
- Deploy/configure: `npm run contracts:fx:deploy`
- Explorer: https://explorer.testnet.arc.io/address/0x88f731c91b23ef05fd3bb448a148f7cf46b08a90
- Burns the source test currency and mints the destination test currency atomically.
- Fixed rates: `1 USD = 5.4123 BRL`, `16,000 IDR`, or `35 THB`; fUSDC is `1:1`.
- `swapExact` returns output to the caller for multicall composition; `swapExactTo` mints directly to a destination wallet.

### Mock equities (treasury stretch)

```
Mock NVDA: 0x337a410f3a881b41d4a1c10e4bcea5516777a0d2
Mock GOOGL: 0xf14a659386a00d9bb4e51b73a822c25c098a2e53
Mock Equity Broker: 0x92a9e4cfaa4d35dd1f27a28c1728bdf1d5719a04
```

- Broker source: `mock-equities/MockEquityBroker.sol`
- Deploy: `scripts/deploy-mock-equities.mjs`
- Settles against fUSDC above

---

## Used but not deployed by Sancus

Circle / Arc infrastructure contracts the app calls:

```
Arc Testnet USDC: 0x3600000000000000000000000000000000000000
Circle Gateway Wallet: 0x0077777d7EBA4688BDeF3E311b846F25870A19B9
Circle Gateway Minter: 0x0022222ABE238Cc2C7Bb1f21003F0a260052475B
```

Referenced from `lib/constants/usdc-addresses.ts`, `lib/circle/gateway-sdk.ts`, and `lib/sancus/x402.ts`.

Other testnet USDC / EURC addresses (Sepolia, Fuji, Base Sepolia, etc.) are listed in:

- `lib/constants/usdc-addresses.ts`
- `lib/constants/eurc-addresses.ts`

---

## Copy-paste block (all)

```
Sancus Face USDC (fUSDC): 0x5ae6d882b075628ea839e57cf422172434f27e0c
Sancus Mock Brazilian Real (mBRL): 0xa4998745ede2f259f392ee4b71156badb5da8755
Sancus Mock Indonesian Rupiah (mIDR): 0xdca139d380fbd00c61b4ed696d8f81e659957ae6
Sancus Mock Thai Baht (mTHB): 0x00bf05794364ef67815094d7158a0270e555f944
Sancus Fixed FX: 0x88f731c91b23ef05fd3bb448a148f7cf46b08a90
Mock NVDA: 0x337a410f3a881b41d4a1c10e4bcea5516777a0d2
Mock GOOGL: 0xf14a659386a00d9bb4e51b73a822c25c098a2e53
Mock Equity Broker: 0x92a9e4cfaa4d35dd1f27a28c1728bdf1d5719a04
Arc Testnet USDC: 0x3600000000000000000000000000000000000000
Circle Gateway Wallet: 0x0077777d7EBA4688BDeF3E311b846F25870A19B9
Circle Gateway Minter: 0x0022222ABE238Cc2C7Bb1f21003F0a260052475B
```
