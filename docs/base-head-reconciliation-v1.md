# Base head reconciliation and evidence (research only)

This branch builds on PR #45. Compare a streamed block's number/hash/parent hash against two distinct configured HTTPS Base RPCs via `verifyObservedHead`. Each RPC receives an independent `eth_chainId` query followed by a pinned `eth_getBlockByNumber`. A mismatch or unavailable lookup does not produce a trusted state. Both matching responses are labelled **MATCHED_UNSAFE**, not finalized or tradable. Distinct configured names do not by themselves prove independent provider infrastructure. Avoid using two URLs routed to the same backend.

`EvidenceWriter` is a **local single-writer** newline JSON audit with sequence numbers, SHA256 linkage, fsync and tamper checks on reopen. It has not been wired to the live WebSocket runner or deployed to durable cloud storage. It is not safe for concurrent processes, hostile filesystem mutation, partial-write recovery or multi-host use. It does not prove historical profit, finality, or execution readiness. The next implementation must queue observations, serialize writes, handle torn tails and restore from backups; then add provider-independent block and state reconciliation under bounded retries.

Safety: No credential management, live trade, wallet, allowances, signing or transactions. No paid infrastructure. All output remains **read only**.
