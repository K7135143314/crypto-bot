# Verified pools -> read-only modeled economics, V1

This development branch composes existing modules, rather than duplicating quote or profit math. The mandatory path is **two-provider observed block hash agreement** (unsafe, not final) -> **both approved factory-bound exact pool states** -> **same pinned block on-chain quote legs** -> **second hash agreement** -> **existing PROFIT_POLICY cost classification**.

The exported `proveReadOnlyMarket` accepts injected dependencies for safe tests and future live observation wiring. It cannot send transactions. Even a `MODELED_CANDIDATE` is explicitly not an atomic simulation, executable fill, realized profit, or authorization. No continuous live service or paid provider configured.

Limitations: both RPC providers may share upstream; historical block-tagged contract reads are not bound to a specific hash by EIP-1898; block identity is rechecked after quotes but this is not atomic; fee reserves are modeled; V3 active liquidity is not equivalent to tradeable size. A follow-up live smoke must verify fee/pool details and actual contract return shapes; only then connect to the stream. Do not merge this branch without CI.

No wallet, approvals, secrets, financial operations, subscriptions or production modifications.
