// Research-only verification history. Never treat a quote as a simulated/executed trade.
export const emptyHistory = () => ({
  version:1, timezone:'America/Chicago', retentionDays:30, updatedAt:null, runs:[],
});
export function mergeVerificationHistory(previous, report, now=Date.now()) {
  if (!report || report.readOnly!==true || report.executionAuthorized!==false ||
      !Number.isFinite(Date.parse(report.generatedAt)) ||
      !/^\d+$/.test(String(report.pinnedBlock)) || !Array.isArray(report.results)) {
    throw new Error('Invalid read-only verification report');
  }
  const cutoff=now-30*24*60*60*1000;
  const runs=new Map();
  for(const run of previous?.runs || []){
    if(!Number.isFinite(Date.parse(run?.generatedAt)) ||
       Date.parse(run.generatedAt)<cutoff || !/^\d+$/.test(String(run.pinnedBlock))) continue;
    runs.set(run.generatedAt+'|'+run.pinnedBlock,run);
  }
  if(Date.parse(report.generatedAt)>=cutoff){
    const normalized={
      generatedAt:report.generatedAt, pinnedBlock:report.pinnedBlock,
      readOnly:true, executionAuthorized:false, referenceError:String(report.referenceError||''),
      results:report.results.map((r)=>({
        market:String(r.market||''), status:String(r.status||'ERROR'),
        indicatedSpreadBps:Number.isFinite(r.indicatedSpreadBps)?r.indicatedSpreadBps:null,
        buyDex:r.buyDex||null,sellDex:r.sellDex||null,buyPool:r.buyPool||null,sellPool:r.sellPool||null,
        exactPoolMatch:r.exactPoolMatch===true,
        bestTradeSizeUsdc:r.bestTradeSizeUsdc||null,
        bestEstimatedNetUsdc:r.bestEstimatedNetUsdc||null,
        reason:String(r.reason||''),
        atomicSimulation:'NOT_RUN',
        rows:Array.isArray(r.rows)?r.rows:[],
      })),
    };
    runs.set(normalized.generatedAt+'|'+normalized.pinnedBlock,normalized);
  }
  return {
    version:1, timezone:'America/Chicago',retentionDays:30,
    updatedAt:new Date(now).toISOString(),
    runs:[...runs.values()].sort((a,b)=>Date.parse(a.generatedAt)-Date.parse(b.generatedAt)),
  };
}
