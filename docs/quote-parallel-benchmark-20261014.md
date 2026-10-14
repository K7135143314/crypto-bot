# Read-only pinned-block quote performance experiment

This PR adds timing telemetry and an opt-in comparison mode:

- Default: existing sequential first-leg request behavior, including the 600 ms pause.
- `QUOTE_PARALLEL_FIRST_LEGS=true`: request Aerodrome and Uniswap USDC→WETH quotes concurrently, both at the **same Base block number**, with no alteration to later dependent legs.
- The two second legs remain sequential. Existing provider backoff, error handling and quote calculations remain unchanged.
- No claim that concurrent quotes are faster or more reliable until measured against real provider traffic and same-block outputs. Excessive simultaneous requests can trigger provider throttling.
- Timing fields measure local RPC wall time, **not** Flashblocks feed delay, sequencer inclusion, or realized trading returns.
- The setting must stay off until repeatable comparisons establish correctness and observed benefit; it is not a live trading control.

Benchmark gate: run repeated sequential and parallel **read-only** scans against the same provider/market windows, record median/p95/p99 wall-clock latency and rate-limit/failure counts; compare routes on matching pinned blocks when possible. Do not infer latency improvement from CI status or synthetic tests.

Existing profit model still uses conservative policy reserves. No wallet, allowance, key, signing, broadcast, or paid service is present.
