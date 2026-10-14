# Bounded Live Base Pool-to-Profit Research — October 14, 2026

## Evidence
- Pull request: [#51](https://github.com/K7135143314/crypto-bot/pull/51), development branch only.
- First live test: [run 38561407484](https://github.com/K7135143314/crypto-bot/actions/runs/38561407484). One $100 size, two routes, historical block 52595123, both MODELED_REJECT (REJECT_RAW_LOSS), ~1994.855ms total.
- Expanded live test: [run 38561740394](https://github.com/K7135143314/crypto-bot/actions/runs/38561740394). Historical block 52595207, same block hash used within the sample, two directions at each of three sizes, ~8439.05ms total.
- Exact Aerodrome Classic pool: `0xcDAC0d6c6C59727a65F871236188350531885C43`.
- Exact Uniswap V3 pool: `0xd0b53D9277642d899DF5C87A3966A349A798F224`.

## Expanded sample: modeled USDC net returns (NOT realized P&L)

| USDC test notional | Aerodrome buy → Uniswap sell | Uniswap buy → Aerodrome sell |
|---:|---:|---:|
| $100 | -$0.424167 | -$0.903814 |
| $500 | -$1.919023 | -$4.316910 |
| $1,000 | -$3.892453 | -$8.687357 |

All six outcomes were MODELED_REJECT and REJECT_RAW_LOSS. Zero modeled positive candidates. These are not losses incurred by the project: **no trade or financial transaction took place**.

## What passed
- CI typecheck, scanner/unit suite and bounded on-chain research job completed.
- Dual-provider same-number/hash head checks returned `MATCHED_UNSAFE`, not finalized.
- Factory pool identity, token0/token1, Classic reserves / V3 active liquidity checked at the pinned block.
- Existing `quoteDex` and `evaluateOpportunity` reused (no third profit calculator).
- Two directions and multiple trade sizes were tested with existing configured routes.
- Shared per-block pool state was cached only within one research sample to eliminate needless repeated contract reads.
- Complete JSON artifacts uploaded in the GitHub Actions runs above.

## What is NOT proven
- Six quotes at one recent historical block do not establish strategy profitability, statistical edge, real transaction inclusion or competitive end-to-end speed.
- The sampled 1.995-second and 8.439-second times include RPC operations and quote work, not sequencer receipt-to-trade latency.
- Provider agreement does not ensure decentralization or finality.
- Quoting at a block number is not by-hash atomic. The current model rechecks observed hashes but is not a guaranteed immutable execution snapshot.
- Public RPC historical data coverage, request budgets and provider latency can change.
- Gas pricing sampled at test time is not exact historical cost or future inclusion cost.
- The WETH price reference is derived from an existing on-chain route, not from an independent oracle.
- No flash-loan, settlement, slippage-at-inclusion, revert-cost or realized economics are demonstrated.

## Next engineering gate
Focus on **repeatable evidence**, not more dashboard screens:
1. Add 30–100 bounded, time-separated, pinned-block samples within public provider limits and quantify how often gross/net-positive candidates appear; report gaps/errors and timestamps. No perpetual job or paid provider yet.
2. Make accounting more accurate: align historical gas/base fee, contract data fees, and block provenance before claiming net profitability.
3. Compare other verified fee tiers and markets only if they can be resolved with existing trusted adapters and confidence in token decimals/liquidity.
4. Keep trade execution disabled. Do not buy low-latency infrastructure unless a repeatable after-cost edge is supported by evidence.

No changes to production, wallets, contracts, allowances or payments. No new subscriptions.
