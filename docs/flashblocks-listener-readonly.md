# Base Flashblocks read-only subscription smoke test

This branch builds on PR #38. Set `BASE_FLASHBLOCKS_WSS` through a protected environment or approved provider connection, then run `npm run listen:flashblocks` using Node 22+ with `LISTEN_SECONDS=30` (5–120 seconds). No endpoint is provisioned or billed by this branch.

The session verifies `eth_chainId = 0x2105` (8453), accepts only the subscribed JSON-RPC ID, checks `payload_id`, index ordering, the initial `base.block_number`, and limits transaction diff shape. The initial schema is an **assumption pending a captured provider-specific feed fixture**, not evidence of real subscription compatibility. Test this against official Base Flashblocks-enabled provider data before using any frame for pool-state extraction.

A failure invalidates observations; a new process/session must verify chain and subscription again. No wallet, private keys, transaction simulation, signing, trade execution, quote calculation, or background deployment. Successful feed message ingestion is not enough to derive an executable trade.

The CLI performs one bounded subscription, emits only sanitized counters and inter-arrival timing, and does not log endpoint secrets. The endpoint is opt-in, and the code is not attached to a deployment. Future work must add real provider-fidelity fixture tests, canonical block reconciliation, watchdog/reconnect policies, event-source timestamps, durable storage and independently reviewed market-state parsing.

Safety: The early Flashblocks content is preconfirmed; do not treat it as a finalized state. Do not measure true provider latency from message inter-arrival intervals alone.
