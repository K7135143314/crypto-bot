# Phase 1 reference transaction investigation — 2026-10-14 UTC

## Evidence

- Real Base mainnet transaction: [0x5cdd56c9c3a043b9ba6ba328a8f290185cfb41765aa149542dcb9f9108558c68](https://basescan.org/tx/0x5cdd56c9c3a043b9ba6ba328a8f290185cfb41765aa149542dcb9f9108558c68)
- Block **52575023**, timestamp **2026-10-14 00:56:33 UTC**.
- Proof: [GitHub Actions #176](https://github.com/K7135143314/crypto-bot/actions/runs/38494094010), `reference-tx-evidence` artifact; `research/audit-reference-transaction.mjs` regenerates from read-only Base RPC.
- Receipt status **success**; **3 V3 swap event signatures** from three distinct pool/event-emitter addresses, **8 ERC-20 transfer events**, zero native ETH value in tx input.
- The sender **0xd0d08887e8a5b16049534a7f3fc1de92848f5bea** transferred out **1780 EDGE** (`0xed6e000def95780fb89734c07ee2ce9f6dcaf110`) to intermediary **0x8f10b468b06c6fd214b65f87778827f7d113f996**.
- That intermediary routed **1194.73066 EDGE** to **0x99571b348e9bd9cec1eb4dfc053be41a7a698b58**, receiving **134.431656 USDC**; sent **585.26934 EDGE** to **0x5230845439fa66fbea20af7cf09bc413b99e10b7**, receiving **0.00078805 cbBTC**, and then sent this cbBTC to **0x4e962bb3889bf030368f56810a9c96b83cb3e778**, receiving **65.702778 USDC**.
- The intermediary transferred the combined **200.134434 USDC** to **0xd5283cabd64fd553f58da2cc64ec9ab5224c14a1**. This output is NOT profit; 1780 EDGE was input, and beneficial ownership of recipient is not independently established.
- Receipt `gasUsed=1060166`; `effectiveGasPrice=5200000 wei`; product **5512863200000 wei**; separately reported L1 field **6754813541 wei**. It is not yet established whether the product includes all fees, nor have offchain payments been accounted for.

## Classification and implications

**Classification: LIKELY_SPLIT_ROUTE_TOKEN_SALE, NOT A VERIFIED CIRCULAR ARBITRAGE.**
The ERC-20 movements are consistent with splitting an EDGE token sale into two routes ending in USDC, one through cbBTC. No transfer log establishes that an arbitrageur started with USDC and finished with more USDC. Successful multi-pool swaps are therefore NOT a profit signal.

- Market coverage: EDGE/USDC and EDGE/cbBTC are not part of the present three supported USDC-base scanner pairs (WETH/USDC, AERO/USDC, cbBTC/USDC). One cbBTC/USDC pool appears in the existing tracked pool set, but this does NOT prove profitable scanner coverage.
- Correct action: reject this example as independently proven arbitrage; do not include its +200.134434 USDC output as bot profit or use it to approve execution.
- Future evidence gates: independently identify factory-confirmed pools and actors; trace all native/internal transfers and liabilities; find transactions with genuine circular same-asset flow; reproduce pre-block quotes and fees. Distinguish split routing from true arbitrage in future samples.

This report records observed on-chain events and an evidence-limited interpretation. It does not validate a live trading strategy, net earnings, or authorize wallet/executor deployment.
