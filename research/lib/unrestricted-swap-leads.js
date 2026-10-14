// Evidence-only grouping for Base-wide eth_getLogs scans.
// Address filter is intentionally absent, but event signatures still limit protocol coverage.
const A=/^0x[0-9a-f]{40}$/i, H=/^0x[0-9a-f]{64}$/i;
const lower=v=>String(v??'').toLowerCase();
const asBlock=x=>{if(x===null||x===undefined||x==='')return null;try{const n=BigInt(x);return n>=0n?n:null;}catch{return null;}};
export function selectUnrestrictedMultiSwapLeads(logs,knownPools,limit=12){
 const tracked=new Set((knownPools||[]).map(lower).filter(x=>A.test(x)));
 const grouped=new Map();let invalidLogs=0,duplicateLogs=0;
 for(const l of Array.isArray(logs)?logs:[]){
  const hash=lower(l?.transactionHash),address=lower(l?.address),block=asBlock(l?.blockNumber);
  if(!H.test(hash)||!A.test(address)||block===null||l?.logIndex===undefined||l?.logIndex===null){
   invalidLogs++;continue;
  }
  let g=grouped.get(hash);
  if(!g){g={txHash:hash,blockNumber:block,emitters:new Set(),eventKeys:new Set(),events:0};grouped.set(hash,g);}
  const index=asBlock(l.logIndex);
  if(index===null){invalidLogs++;continue;}
  const key=index.toString();
  if(g.eventKeys.has(key)){duplicateLogs++;continue;}
  g.eventKeys.add(key);g.emitters.add(address);g.events++;
  if(block>g.blockNumber)g.blockNumber=block;
 }
 const groups=[...grouped.values()].map(g=>{
  const emitterAddresses=[...g.emitters].sort(),knownCount=emitterAddresses.filter(x=>tracked.has(x)).length;
  return {txHash:g.txHash,blockNumber:g.blockNumber.toString(),
   distinctSwapEmitters:emitterAddresses.length,recognizedSwapEvents:g.events,
   trackedPoolEmitters:knownCount,outsideTrackedPoolEmitters:emitterAddresses.length-knownCount,
   emitterAddresses};
 });
 const leads=groups.filter(x=>x.distinctSwapEmitters>=2).sort((a,b)=>
  b.outsideTrackedPoolEmitters-a.outsideTrackedPoolEmitters||
  b.distinctSwapEmitters-a.distinctSwapEmitters||
  b.recognizedSwapEvents-a.recognizedSwapEvents||
  (BigInt(a.blockNumber)>BigInt(b.blockNumber)?-1:BigInt(a.blockNumber)<BigInt(b.blockNumber)?1:0)||
  a.txHash.localeCompare(b.txHash));
 const cap=Number.isSafeInteger(limit)?Math.max(0,Math.min(20,limit)):12;
 return {version:1,selection:'MULTI_EMITTER_FIRST_OUTSIDE_TRACKED_POOLS',
  rawLogCount:Array.isArray(logs)?logs.length:0,invalidLogs,duplicateLogs,
  observedTransactions:groups.length,multiEmitterTransactions:leads.length,
  untrackedMultiEmitterTransactions:leads.filter(x=>x.outsideTrackedPoolEmitters>0).length,
  uniqueSwapEventEmitters:new Set(groups.flatMap(x=>x.emitterAddresses)).size,
  eligibleLeads:leads.length,selectedLeads:leads.slice(0,cap),
  excludedSingleEmitterTransactions:groups.length-leads.length,
  skippedLeads:Math.max(0,leads.length-cap),
  netProfitUsdc:null,actualArbitrageConfirmed:false,executionAuthorized:false,
  warning:'An unrestricted pool-address filter for two swap topics does not cover all DEX protocols; multi-swap events do not prove arbitrage, ownership or profit.'};
}
