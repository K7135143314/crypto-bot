import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { CHAIN_ID, TRADE_SIZES_USDC } from './config.js';
import { client, quoteMatrix } from './quotes.js';
import { fingerprint, checkParity, summarize, type Trial } from './quote-benchmark.js';

const repeats = Number(process.env.BENCHMARK_REPEATS ?? '2');
if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 5) {
  throw new Error('BENCHMARK_REPEATS must be between 1 and 5');
}
const sizes = TRADE_SIZES_USDC.slice(0, 3);
const trials: Trial[] = [];
let parityFailures=0;
const chainId = await client.getChainId();
if(chainId!==CHAIN_ID) throw new Error('Wrong chain; no benchmark performed');
for(let i=0;i<repeats;i++){
  const block = await client.getBlockNumber();
  const sequence = i%2 ? [true,false] : [false,true];
  const pair: Trial[] = [];
  for(const parallelFirstLegs of sequence){
    const mode = parallelFirstLegs ? 'parallel' : 'sequential';
    const started = performance.now();
    try{
      const rows = await quoteMatrix(client,sizes,block,undefined,{parallelFirstLegs});
      if(rows.length !== sizes.length*2) throw new Error('Incomplete quote matrix');
      pair.push({mode,block:block.toString(),elapsedMs:Math.round((performance.now()-started)*1000)/1000,
        success:true,quoteFingerprints:fingerprint(rows)});
    }catch(error){
      pair.push({mode,block:block.toString(),elapsedMs:Math.round((performance.now()-started)*1000)/1000,
        success:false,error: error instanceof Error ? error.message.slice(0,500) : String(error).slice(0,500)});
    }
  }
  trials.push(...pair);
  if(!checkParity(pair[0]!,pair[1]!)) parityFailures++;
}
const report={
  version:1,generatedAt:new Date().toISOString(),readOnly:true,executionAuthorized:false,
  source:'pinned-block-rpc-quote-ab',chainId, sizes, attemptedPairs:repeats,
  matchingPairs:repeats-parityFailures, parityFailures, timings:summarize(trials),trials,
  note:'A/B quotes at same pinned Base block, but sequential observations may be subject to provider historical-state availability. Timings include RPC, throttling and retries, not network inclusion; small sample not evidence of competitive performance.',
};
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/quote-ab-benchmark.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({chainId,attemptedPairs:report.attemptedPairs,matchingPairs:report.matchingPairs,
  parityFailures,timings:report.timings}));
if(parityFailures) process.exitCode=1;
