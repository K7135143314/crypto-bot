// Deterministic, bounded read-only receipt selection from Base swap logs.
// This is DISCOVERY PRIORITIZATION ONLY; a repeated or multi-pool swap is not arbitrage.
const ADDR=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const low=v=>String(v??'').toLowerCase();
const tierRank=Object.freeze({MULTI_TRACKED_POOL:0,REPEATED_TRACKED_SWAP_EVENTS:1,SINGLE_TRACKED_SWAP_EVENT:2});
const safeBlock=v=>{try{if(v===null||v===undefined)return 0n;const n=BigInt(v);return n>=0n?n:0n;}catch{return 0n;}};
const sortLead=(a,b)=>
  b.trackedPoolCount-a.trackedPoolCount ||
  b.trackedSwapEventCount-a.trackedSwapEventCount ||
  (a.block>b.block?-1:a.block<b.block?1:0) ||
  a.txHash.localeCompare(b.txHash);

export function selectPriorityReceipts(logs,trackedPools,limit=20){
  const budget=Number.isSafeInteger(limit)?Math.max(0,Math.min(25,limit)):20;
  const tracked=new Set((trackedPools||[]).map(low).filter(x=>ADDR.test(x)));
  const groups=new Map();
  let invalidOrUnsupportedLogs=0,duplicateLogIndexes=0;
  for(const log of Array.isArray(logs)?logs:[]){
    const txHash=low(log?.transactionHash), pool=low(log?.address);
    if(!HASH.test(txHash)||!ADDR.test(pool)||!tracked.has(pool)){
      invalidOrUnsupportedLogs++;
      continue;
    }
    let row=groups.get(txHash);
    if(!row){
      row={txHash,block:0n,pools:new Set(),seenIndexes:new Set(),count:0};
      groups.set(txHash,row);
    }
    // Duplicate logs may appear across RPC sources or overlapping collection calls.
    const identity=log.logIndex==null?null:String(log.logIndex);
    if(identity!==null&&row.seenIndexes.has(identity)){duplicateLogIndexes++;continue;}
    if(identity!==null)row.seenIndexes.add(identity);
    row.count++;
    row.pools.add(pool);
    const block=safeBlock(log.blockNumber);
    if(block>row.block)row.block=block;
  }
  const all=[...groups.values()].map(row=>{
    const trackedPoolCount=row.pools.size;
    const trackedSwapEventCount=row.count;
    const tier=trackedPoolCount>=2?'MULTI_TRACKED_POOL':
      trackedSwapEventCount>=2?'REPEATED_TRACKED_SWAP_EVENTS':'SINGLE_TRACKED_SWAP_EVENT';
    return {txHash:row.txHash,block:row.block,
      blockNumber:row.block.toString(),tier,trackedPoolCount,
      trackedSwapEventCount,trackedPoolAddresses:[...row.pools].sort()};
  });
  const remaining=[...all],selected=[],covered=new Set();
  // Rank evidence strength first; diversify across tracked pools within a tier.
  while(selected.length<budget&&remaining.length){
    remaining.sort((a,b)=>{
      const rank=tierRank[a.tier]-tierRank[b.tier];
      if(rank!==0)return rank;
      const newA=a.trackedPoolAddresses.filter(x=>!covered.has(x)).length;
      const newB=b.trackedPoolAddresses.filter(x=>!covered.has(x)).length;
      return newB-newA||sortLead(a,b);
    });
    const next=remaining.shift();
    selected.push(next);
    for(const addr of next.trackedPoolAddresses)covered.add(addr);
  }
  const countTier=(rows,tier)=>rows.filter(x=>x.tier===tier).length;
  return {
    version:1,policy:'MULTI_TRACKED_FIRST_THEN_REPEAT_THEN_DIVERSE_SINGLE',
    budget,rawEventCount:Array.isArray(logs)?logs.length:0,
    invalidOrUnsupportedLogs,duplicateLogIndexes,
    uniqueTransactionCount:all.length,
    distinctTrackedPoolsInInput:new Set(all.flatMap(x=>x.trackedPoolAddresses)).size,
    selectedTrackedPoolCoverage:covered.size,
    multiTrackedTransactionsObserved:countTier(all,'MULTI_TRACKED_POOL'),
    repeatedTrackedTransactionsObserved:countTier(all,'REPEATED_TRACKED_SWAP_EVENTS'),
    selectedMultiTracked:countTier(selected,'MULTI_TRACKED_POOL'),
    selectedRepeated:countTier(selected,'REPEATED_TRACKED_SWAP_EVENTS'),
    selectedSingle:countTier(selected,'SINGLE_TRACKED_SWAP_EVENT'),
    skippedTransactionCount:remaining.length,
    selected:selected.map(({block,...details})=>details),
    note:'Selection sees only event logs from tracked pools; receipts can reveal other emitters. A multi-pool event or USDC cash-flow lead does not prove arbitrage or profit.'
  };
}
