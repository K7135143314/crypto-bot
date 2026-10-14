# Read-only end-to-end Base head verification (development only)

This change builds on PR #46. The opt-in `listen:heads` CLI now connects streamed Base `newHeads` messages to two independently configured HTTPS Base RPC sources and the local integrity-chained JSONL evidence writer. It serializes work and halts on bounded queue overflow rather than silently drop observations. Duplicate headers are skipped; gaps/reorg warnings are written as rejected evidence, not matched blocks.

Required environment (securely, not in chat): `BASE_HEADS_WSS`, `BASE_VERIFY_RPC_A`, `BASE_VERIFY_RPC_B`. Optional `BASE_EVIDENCE_PATH`, `LISTEN_SECONDS` (5–120 seconds). Sources must be operationally independent: separate URLs alone do not prove independence. The CLI is not deployed by this PR.

Limitations: Block agreement produces `MATCHED_UNSAFE` only. Two providers may share the same upstream. The JSONL writer is single-process and not guaranteed atomic under disk corruption/crash. Provider reconnection/backfill, centralized retention, attack-resistant synchronization, recovery after a torn write, canonical finality reconciliation and live evidence validation are still pending. Never treat this pipeline as a trading signal. No wallets, keys, approvals, transactions or paid services.

This PR does not contain a real WSS run; review CI and perform a controlled provider-backed run before a research deployment.
