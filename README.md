# DEX Arbitrage Scanner

Read-only DEX-to-DEX arbitrage research project, intentionally isolated from Axtrova OS.

## Milestone V0.1

- Chain: Base mainnet (8453)
- Pair: WETH / USDC
- DEX A: Aerodrome classic pools
- DEX B: Uniswap v3
- Tests both directions
- Tests configurable USDC trade sizes
- Uses contract reads/simulations only
- Has no wallet, private key, token approval, signing, or transaction-sending code

## Security boundary

This repository must remain separate from Axtrova OS. Do not reuse Axtrova databases, environment variables, credentials, deployments, or application code.

V0.1 is observation/simulation software only. A positive raw quote difference is **not** a trading signal. Gas, MEV, safety margin, execution atomicity, and additional Aerodrome liquidity sources must be modeled before any execution work is considered.

## Run

```bash
npm install
npm run typecheck
npm run scan
```

Optional configuration:

```bash
cp .env.example .env
```

## Current status vocabulary

- DESIGNED: architecture/logic written
- CODED: source committed
- TESTED: automated/local checks pass
- LIVE-VERIFIED: live Base contract calls succeed
- PROVEN: scanner calculations independently validated against authoritative quotes

Do not describe V0.1 as PROVEN until those checks are complete.
