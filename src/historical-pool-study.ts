import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
const count=Number(process.env.STUDY_BLOCK_COUNT??'4');
const spacing=Number(process.env.STUDY_BLOCK_SPACING??'300');
if(!Number.isSafeInteger(count)||count<1||count>8||
 !Number.isSafeInteger(spacing)||spacing<20||spacing>3000)
 throw Error('Research bound invalid; allowed 1..8 blocks and 20..3000 block spacing');
const latest=await (await fetch('https://base-rpc.publicnode.com',{method:'POST',
 headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]}),
 signal:AbortSignal.timeout(9000)})).json() as {result?:string};
if(!latest.result||!/^0x[0-9a-f]+$/i.test(latest.result))throw Error('Unable to resolve Base head before selecting sample');
const head=BigInt(latest.result);
const anchor=head-100n;
const selected=Array.from({length:count},(_,i)=>(anchor-BigInt(i*spacing)).toString());
await mkdir('artifacts',{recursive:true});
const samples:unknown[]=[];
const started=performance.now();
for(let i=0;i<selected.length;i++){
 const filename='artifacts/historical-block-'+i+'.json';
 const run=spawnSync(process.execPath,['--import','tsx','src/live-pool-profit-smoke.ts'],{
   env:{...process.env,STUDY_BLOCK_NUMBER:selected[i],STUDY_OUTPUT_FILE:filename},
   encoding:'utf8',timeout:120_000,maxBuffer:1_000_000,
 });
 let record:unknown=null;
 try{record=JSON.parse(await readFile(filename,'utf8'))}catch{}
 samples.push({selectedBlock:selected[i],exitCode:run.status,timedOut:run.error?.message??null,
   record,error:record===null?(run.stderr||run.stdout).slice(-350):null});
 console.log(JSON.stringify({selectedBlock:selected[i],ok:run.status===0,hasArtifact:record!==null}));
}
const reports=samples.map(x=>x as {record?:{status?:string;proofs?:Array<{status:string}>}|null});
const completed=reports.filter(x=>x.record?.status==='COMPLETE_READ_ONLY').length;
const modeledCandidates=reports.reduce((n,x)=>n+(x.record?.proofs?.filter(p=>p.status==='MODELED_CANDIDATE').length??0),0);
const modeledRejects=reports.reduce((n,x)=>n+(x.record?.proofs?.filter(p=>p.status==='MODELED_REJECT').length??0),0);
const summary={readOnly:true,executionAuthorized:false,selectionRule:'Precommitted anchor head-100, then fixed spacings backwards',
 samplingNotIndependent:'Nearby Base block observations are correlated; do not interpret as independent trials',
selectedBlockCount:count,blocksCompleted:completed,blocksFailed:count-completed,modeledCandidates,modeledRejects,
elapsedMs:Math.round(performance.now()-started),selected,observations:samples};
await writeFile('artifacts/base-historical-pool-study.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({blocksCompleted:completed,blocksFailed:count-completed,modeledCandidates,modeledRejects,elapsedMs:summary.elapsedMs}));
if(completed!==count)process.exitCode=1;
