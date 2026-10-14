# V1.8 Phase 2 — First real Base RPC receipt sample

Observation: 2026-10-14 00:18 UTC (October 13 Central). Source: public Base RPC via the existing crypto-bot GitHub Actions environment, not Dune or Blockscout.

Proof: [GitHub Actions verification run](https://github.com/K7135143314/crypto-bot/actions/runs/38489310884), job step **Sample recent Base swap receipt evidence (read only)**; downloadable `base-receipt-evidence` workflow artifact, seven-day retention.

- Base chain ID 8453; sampled 20 recent blocks through block **52573866**, across four fixed pool contract addresses already in our scanner.
- 17 tracked swap events located.
- 12 distinct transaction receipts fetched with successful status, recorded gasUsed × effectiveGasPrice, and L1 fee fields when returned.
- All 12 inspected receipts had swap events from exactly **one of the four tracked pool addresses**. Classification `SINGLE_TRACKED_POOL_SWAP`.
- No inspected transaction provided evidence of a two-pool arbitrage within this four-pool sample. This does **not** rule out other pools or other swap legs in the same transactions.
- **Zero independently confirmed profitable arbitrage transactions.** All `netProfitUsdc` fields remain `null`.

Example independently traceable transaction: `0x7ccf79ff639171aa04b1f764f1d49c9fc300bd910eec7f037e612afe12c67a50` (Base block 52573847) included a swap event in pool `0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59`. The reported L2 receipt fee = 10243097200000 wei and reported L1 fee = 1970414192 wei. These numbers alone are not equivalent to profit or full execution cost accounting.

**Next evidence gate:** Extend audited coverage over a wider time window and inspect all distinct swap pool addresses in each sampled receipt, not only the four starting pools. Then reconstruct ERC-20 balance deltas and fee flows to distinguish profitable arbitrage from ordinary routing. Do not add dashboard profit claims on the basis of this sample.
