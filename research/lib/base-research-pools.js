// Candidate pool addresses only, NEVER proof of pool ownership or arb profit.
export const POOL_ADDRESS=/^0x[0-9a-f]{40}$/;
export const SEED_POOLS=Object.freeze([
 '0xec558e484cc9f2210714e345298fdc53b253c27d',
 '0x4e962bb3889bf030368f56810a9c96b83cb3e778',
 '0x0b1c2dcbbfa744ebd3fc17ff1a96a1e1eb4b2d69',
 '0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59',
]);
export const MAX_TRACKED_POOLS=16;
const norm=(x)=>String(x??'').trim().toLowerCase();
function latestRun(snapshot){
 const runs=Array.isArray(snapshot?.runs)?snapshot.runs:[];
 return [...runs].filter(x=>Number.isFinite(Date.parse(x?.generatedAt)))
   .sort((a,b)=>Date.parse(b.generatedAt)-Date.parse(a.generatedAt))[0]??null;
}
export function selectBaseResearchPools(marketHistory,verificationHistory,now=Date.now()){
 const unique=new Set(SEED_POOLS),sources=[];
 const inputs=[
  ['market-history',latestRun(marketHistory),'markets'],
  ['verification-history',latestRun(verificationHistory),'results'],
 ];
 for(const [name,run,key] of inputs){
  const at=run?.generatedAt;
  const fresh=Number.isFinite(Date.parse(at)) && Date.parse(at)<=now &&
    now-Date.parse(at)<=24*60*60*1000;
  sources.push({name,generatedAt:at??null,state:fresh?'CURRENT':'UNAVAILABLE_OR_STALE'});
  if(!fresh)continue;
  for(const record of run[key]||[]){
   for(const field of ['buyPool','sellPool']){
    const address=norm(record[field]);
    if(POOL_ADDRESS.test(address) && address!=='0x'+'0'.repeat(40))unique.add(address);
   }
  }
 }
 return {poolAddresses:[...unique].slice(0,MAX_TRACKED_POOLS),
  seedCount:SEED_POOLS.length,sources,
  note:'Discovery/verification addresses are hints; no pool factory verification performed here.'};
}
