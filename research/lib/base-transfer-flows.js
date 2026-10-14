// Phase 1 — receipt-level ERC-20 movement evidence. No arbitrage profit assertions.
// Transfer logs omit native/internal transfers, allowances, pre-existing balances,
// debt, flash-loan repayments, builders' payments and offchain ETH/USD valuation.
export const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const DATA_WORD = /^0x[0-9a-f]{64}$/i;
const normalize = (v) => String(v ?? '').toLowerCase();
const topicAddress = (v) => {
  if (!DATA_WORD.test(String(v))) return null;
  const address = '0x' + v.slice(-40).toLowerCase();
  return ADDRESS.test(address) ? address : null;
};
const gasWei = (receipt) => {
  if (receipt?.gasUsed == null || receipt?.effectiveGasPrice == null)
    return null;
  try {
    const used = BigInt(receipt.gasUsed);
    const price = BigInt(receipt.effectiveGasPrice);
    return used >= 0n && price >= 0n ? String(used * price) : null;
  } catch { return null; }
};
// Counts only standard ERC-20 Transfer(address,address,uint256) logs. Standard
// ERC-721 Transfer events have the amount indexed, not in a 32-byte data word.
export function summarizeReceiptTokenFlows(receipt) {
  const byActor = new Map();
  const tokenSet = new Set();
  let transferCount = 0;
  let malformedTransferLogs = 0;
  for (const log of receipt?.logs ?? []) {
    if (normalize(log?.topics?.[0]) !== TRANSFER_TOPIC) continue;
    if (!ADDRESS.test(String(log?.address ?? '')) ||
        log?.topics?.length !== 3 || !DATA_WORD.test(String(log?.data ?? ''))) {
      malformedTransferLogs++;
      continue;
    }
    const from = topicAddress(log.topics[1]);
    const to = topicAddress(log.topics[2]);
    if (!from || !to) { malformedTransferLogs++; continue; }
    const token = normalize(log.address);
    const amount = BigInt(log.data);
    tokenSet.add(token);
    transferCount++;
    for (const [actor, sign] of [[from, -1n], [to, 1n]]) {
      const key = actor + '|' + token;
      byActor.set(key, (byActor.get(key) ?? 0n) + sign * amount);
    }
  }
  const usdcMovements = [...byActor].filter(([key, delta]) =>
    key.endsWith('|' + BASE_USDC) && delta !== 0n)
    .map(([key, delta]) => ({address:key.slice(0, 42), netRawUnits:String(delta)}))
    .sort((a, b) => a.address.localeCompare(b.address));
  const txFrom = ADDRESS.test(String(receipt?.from ?? '')) ? normalize(receipt.from) : null;
  const txTo = ADDRESS.test(String(receipt?.to ?? '')) ? normalize(receipt.to) : null;
  const deltas = new Map(usdcMovements.map(x => [x.address, x.netRawUnits]));
  return {
    evidenceType:'ONCHAIN_ERC20_TRANSFER_LOGS_ONLY',
    txHash:receipt?.transactionHash ?? null,
    receiptStatus:receipt?.status ?? 'unknown',
    txFrom, txTo,
    observedErc20Transfers:transferCount,
    malformedOrUnsupportedTransferLogs:malformedTransferLogs,
    observedTokenContracts:tokenSet.size,
    addressTokenEntries:byActor.size,
    usdcActorMovements:usdcMovements.slice(0, 20),
    usdcMovementsTruncated:usdcMovements.length > 20,
    txFromNetUsdcRawUnits:txFrom ? deltas.get(txFrom) ?? '0' : null,
    txToNetUsdcRawUnits:txTo ? deltas.get(txTo) ?? '0' : null,
    reportedExecutionFeeWei:gasWei(receipt),
    reportedL1FeeWei:receipt?.l1Fee === undefined ? null : String(receipt.l1Fee),
    executionFeeIncludesL1Unknown:true,
    netProfitUsdc:null, actualArbitrageConfirmed:false,
    executionAuthorized:false,
    evidenceLimitation:'Token transfer logs and a receipt cannot establish beneficial owner, all native/ETH flows, flash-loan liabilities, external payments, or fee-adjusted net profit.'
  };
}
