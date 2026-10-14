# Phase 1 — Read-only Flashblocks observer foundation

Date: 2026-10-14. Branch: `research/flashblocks-observer-foundation-20261014`.

## Evidence-based architecture decisions

Keep the on-chain quoting and conservative profit classifier as the authoritative research path. Preserve existing scheduled observation history. Do not deploy a wallet or trade executor.

A continuously running engine is **not** present in this change. This commits a pure, deterministic feed sequencing and arrival instrumentation module with synthetic tests, so later live-provider work has a reject-on-gap foundation. It does not connect to a WebSocket, calculate trading profit, or validate any provider's observed latency.

Input expects an object with `payload_id` and nonnegative integral `index` matching Base's Flashblocks stream envelope. The caller is responsible for checking event origin, chain, JSON-RPC subscription, full block parent/hash coherence, timestamps, provider-specific payload structure, and event signatures before market data is accepted. An accepted sequence here is **necessary but not sufficient** for trusted pool state.

### Safety / important limitation

Inter-arrival time is not provider delay. There is no authoritative chain event timestamp in this module. If an indexed update is missed or delayed, reject that cycle until a fresh index-0 baseline. A long arrival gap also invalidates trust. Do not use Flashblocks preconfirmations as final settlement proof. Reorg/replacement reconciliation is a separate required stage.

## Next gates

1. Verify official Flashblocks endpoint and message schema using a real read-only provider; provide sample source, provider details, time synchronization and unit tests for every parser.
2. Make provider reconnect reinitialize its baseline; reconcile canonical blocks, detect dropped event sequences and retain immutable sample records.
3. Measure end-to-end timing on an approved, continuously running inexpensive test host, including separate RPC request/response, local calculation, and inclusion timing.
4. Only after benchmarking, connect trusted DEX pool-state updates and reuse existing `src/profit.ts`; do not copy `dashboard/api/scan.js` calculations into a third engine.

## Forensic disposition

KEEP: `src/profit.ts`, `src/atomic-preflight.ts`, read-only market scanner, test suite, fork simulation, historical research and dashboard.

IMPROVE: conservative modeled costs versus measured costs, pool identifiers, staleness/reorg checks, CI observation provenance, central data retention and monitoring.

CONSOLIDATE: duplicated quote/cost calculations in `dashboard/api/scan.js` and `src/quotes.ts`. Do not remove either until cross-checked replacement passes identical historical fixtures.

ARCHIVE (not delete): legacy browser history and superseded snapshot reports, with provenance tags.

RETIRE later, after proving replacement: scheduled GitHub Actions for time-critical research, while retaining slow retrospective verification.

REBUILD/NEW: streaming ingestion, exact quote verification from trusted state, and independently auditable durable event log. No authorization to build a live transaction path.

Current source of truth: GitHub `observer-data` branch provides historical JSON to Vercel read endpoints. This is not a transaction-grade database. GitHub workflows are best-effort scheduled jobs. No verified positive net profit established.

## Operating costs

No new infrastructure, purchases, subscriptions, live deployments or financial transactions made by this branch. Existing Vercel team's Pro plan was reported by the connected deployment context, but project-specific marginal charges are unverified.

## Testing

Run `npm run typecheck` and `npm run test:realtime`. All outcomes must be confirmed by the new PR workflow run; source changes alone are not evidence that tests passed.
