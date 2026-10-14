# Denim-ready Base heads observation — read only

The Base Denim upgrade is targeting November 2026; verify the activation date against official Base notices before operational deployment. The older Flashblocks `newFlashblocks` subscription should not be assumed to work after migration.

This branch adds `BaseHeadsSession`, a separate observation-only `eth_subscribe newHeads` parser, with chain-id 8453 verification, subscription identity checks, block-number continuity, parent-hash checks, missing-head detection, reorg warnings, and reconnection reset. It never labels a head finalized, canonical, profitable, or tradable. Both legacy Flashblocks and newHeads modules remain for a controlled transition, not concurrent duplicated trading logic.

To smoke test later against an approved WSS provider, securely configure `BASE_HEADS_WSS`; run `LISTEN_SECONDS=30 npm run listen:heads`. This connection was **not** run when authoring the branch; no provider credentials or service subscriptions were created. Live provider results and final Denim chain behavior require independent verification.

Essential follow-up: canonical `eth_getBlockByNumber` reconciliation, bounded persistence, provider timestamp evidence, source-provenance tagging, real-time pool-state verification, and continuous uptime monitoring. A serverless Vercel function is not the intended always-on listener process. No signing, broadcast or wallet operations.
