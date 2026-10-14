// Classifies ONLY swap event evidence; a receipt is never proof of net profit.
export const ADDR = /^0x[0-9a-f]{40}$/i;
export const HASH = /^0x[0-9a-f]{64}$/i;
export const SWAP_V3 = 'Swap(address,address,int256,int256,uint160,uint128,int24)';
export const SWAP_CLASSIC = 'Swap(address,uint256,uint256,uint256,uint256,address)';
export function summarizeSwapReceipt(receipt,poolAddresses,swapTopics){
 const accepted=new Set(poolAddresses.map(x=>String(x).toLowerCase()));
 const topics=new Set(swapTopics.map(x=>String(x).toLowerCase()));
 const swaps=(receipt?.logs||[]).filter(log=>accepted.has(String(log.address).toLowerCase()) &&
   topics.has(String(log.topics?.[0]).toLowerCase()));
 const unique=[...new Set(swaps.map(x=>x.address.toLowerCase()))];
 return {
   txHash:receipt?.transactionHash||null,
   blockNumber:receipt?.blockNumber?.toString()||null,
   receiptStatus:receipt?.status||'unknown',
   observedSwapEvents:swaps.length,
   observedDistinctTrackedPools:unique.length,
   trackedPoolAddresses:unique,
   classification:receipt?.status!=='success'?'FAILED_TX':
     unique.length>=2?'MULTI_TRACKED_POOL_SWAP':
     unique.length===1?'SINGLE_TRACKED_POOL_SWAP':'NO_TRACKED_SWAP',
   feePaidWei:receipt?.gasUsed!==undefined&&receipt?.effectiveGasPrice!==undefined?
     (receipt.gasUsed*receipt.effectiveGasPrice).toString():null,
   l1FeeWei:receipt?.l1Fee!==undefined?String(receipt.l1Fee):null,
   netProfitUsdc:null,
   evidenceGrade:'ONCHAIN_RECEIPT_SWAP_EVENTS_ONLY',
   executionAuthorized:false,
 };
}
