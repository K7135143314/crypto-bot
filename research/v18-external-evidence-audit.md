# V1.8 external evidence audit — October 13, 2026

**Status: RESEARCH QUERY PREPARED; 7-DAY TRANSACTION STUDY NOT YET VERIFIED.**

Research window: October 6–13, 2026 (UTC; dynamic Dune query uses last 7 days at execution time). We checked public Base arbitrage investigations and protocol data sources. Historical results may guide research but cannot establish current profitability.

## What we can and cannot claim

- A transaction with two decoded USDC-circular DEX swaps is only an **arbitrage candidate**. A decoded DEX table can omit swap legs or label routers rather than exact pools.
- A successful Base transaction is not necessarily net profitable. To establish net profit, reconcile tx receipts, ERC-20 balance changes, L2 gas, L1 data fee, builder payments, flash-loan premiums, and all transfers; where applicable value token deltas at the corresponding historical block.
- Data in Dune is indexed and may be delayed. The query itself must be executed and spot-checked against the source-chain transactions.
- Dune's query source and layout are not a paid integration. See [Base two-swap candidate query](./base-two-swap-arbitrage-last7d.sql).
- The Blockscout research connector became available on Oct 13, but its first Base query returned HTTP 402, **PRO API credits exhausted**. That was not bypassed and no transaction evidence was retrieved from that connector.
- We have **zero independently verified profitable Base transaction examples for this exact seven-day window** from this research step. Do not insert synthetic transaction hashes or advertised net profits into the central history.

## Investigation sequence

1. Run the included SQL in Dune, logging query ID, execution timestamp, exact query text/version, and returned transaction hashes.
2. Open a bounded sample of hashes on Base blockchain explorers or through available free read-only APIs. Reconstruct all swap legs and cash flows; flag pool identifiers as hints until on-chain ownership is proven.
3. Require transaction receipt success, gas fee breakdown, net token balances, consistent decimals and any external transfers before classifying **NET_PROFIT_CONFIRMED**.
4. Compare confirmed route's market, DEX, pool version and trade size with our read-only scanner. Use **COVERED**, **POOL_UNSUPPORTED**, **DEX_UNSUPPORTED**, **MARKET_UNSUPPORTED**, or **INSUFFICIENT_EVIDENCE**.
5. Only then prepare a small read-only dashboard section for independently verifiable findings, with a transaction hash and provenance for every claim.

## Outcome and next release gate

The Dune query is a starting point, not a validated dataset. Existing central scanner quotes remain separate. No new exchange adapters, changes to live trading, subscriptions, wallets, or funds are authorized by this audit.

## Coverage comparator (tested code, not verified transactions)

The new `research/lib/base-arbitrage-comparison.js` works on a separately exported Dune candidate result and the existing saved scanner history. It compares market, DEX order, exact pool address hints and supported tokens. Results are strictly classified as source-data candidates, and `netProfitUsdc` remains `null` regardless of apparent gross profits. It does **not** pretend that a contract hint proves pool identity, that identical pool names mean identical routes, or that a historic transaction was reproducible by our scanner.

Safety rules: hashes must be 32-byte hexadecimal; observations outside the seven-day window are excluded; missing quotes and unsupported markets cannot become candidates; and results cannot authorize execution. Even an address match with our scanner is `SAME_POOLS_SEEN_IN_SCANNER`, **not confirmed historical net profit**.

## Dune schema and execution caveat

The checked-in SQL targets `dex.trades` and `base.transactions`, intended for DuneSQL/Trino. Static field inspection and GitHub CI **do not establish that Dune accepted or executed this SQL**. Before calling the research query validated, execute it on Dune, confirm `evt_index`, `project_contract_address`, `gas_used`, `gas_price`, and `l1_fee` in its actual schema, record the execution ID, then inspect at least a sample of raw Base transaction receipts. Decoded DEX tables are not a full transaction-level accounting ledger.

No current October 6–13 net-profitable transaction evidence was retrieved in this task. The comparison code and synthetic test fixtures establish **correct categorization logic only**, not verified live arbitrage.
