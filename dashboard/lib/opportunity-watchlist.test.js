import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOpportunityWatchlist} from './opportunity-watchlist.js';
const now=Date.parse('2026-10-13T23:00:00Z');
const base={market:'cbBTC/USDC',buyDex:'aerodrome',sellDex:'uniswap',
 buyPool:'0x'+'a'.repeat(40),sellPool:'0x'+'b'.repeat(40),status:'QUOTE_REJECT',
 exactPoolMatch:true,bestTradeSizeUsdc:'100',bestEstimatedNetUsdc:'-0.5',
 rows:[{sizeUsdc:'100',estimatedNetUsdc:'-0.5'},{sizeUsdc:'250',estimatedNetUsdc:'-2'}]};
const run=(at,results)=>({readOnly:true,executionAuthorized:false,generatedAt:at,results});
test('trends match exact pools, direction, and USDC size',()=>{
 const old={...base,rows:[{sizeUsdc:'100',estimatedNetUsdc:'-0.75'}],bestEstimatedNetUsdc:'-0.75'};
 const history={runs:[run('2026-10-13T21:00:00Z',[old]),
 run('2026-10-13T22:30:00Z',[base])]};
 const result=buildOpportunityWatchlist(history,now);
 assert.equal(result.state,'CURRENT');
 assert.equal(result.items[0].latestNetUsdc,-0.5);
 assert.equal(result.items[0].previousNetUsdc,-0.75);
 assert.equal(result.items[0].deltaNetUsdc,0.25);
 assert.equal(result.items[0].trend,'IMPROVING');
 assert.equal(result.candidates,0);
 assert.equal(result.items[0].requiresForkSimulation,false);
});
test('same symbol with different exact pool is not a comparable baseline',()=>{
 const other={...base,buyPool:'0x'+'c'.repeat(40),bestEstimatedNetUsdc:'-0.8'};
 const r=buildOpportunityWatchlist({runs:[
 run('2026-10-13T21:00:00Z',[other]),run('2026-10-13T22:30:00Z',[base])
 ]},now);
 assert.equal(r.items[0].trend,'NO_COMPARABLE_SCAN');
});
test('unverified and malicious artificial values cannot become candidates',()=>{
 const spoof={...base,status:'UNSUPPORTED_POOL_VARIANT',bestEstimatedNetUsdc:'99999'};
 const result=buildOpportunityWatchlist({runs:[run('2026-10-13T22:30:00Z',[spoof,base])]},now);
 assert.equal(result.items.length,1);
 assert.equal(result.candidates,0);
 assert.equal(result.unverifiedResults,1);
});
test('positive quote candidate is research-only and requires simulation',()=>{
 const positive={...base,status:'QUOTE_CANDIDATE',rows:[{sizeUsdc:'100',estimatedNetUsdc:'1.45'}],bestEstimatedNetUsdc:'1.45'};
 const result=buildOpportunityWatchlist({runs:[run('2026-10-13T22:30:00Z',[positive])]},now);
 assert.equal(result.candidates,1);
 assert.equal(result.items[0].requiresForkSimulation,true);
 assert.equal(result.executionAuthorized,false);
 assert.equal(result.items[0].atomicSimulation,'NOT_RUN');
});
test('stale and absent data never look live',()=>{
 const old=buildOpportunityWatchlist({runs:[run('2026-10-13T20:00:00Z',[base])]},now);
 assert.equal(old.state,'STALE');
 assert.equal(buildOpportunityWatchlist({runs:[]},now).state,'NO_DATA');
});
test('compares the identical size rather than previous best',()=>{
 const prior={...base,bestTradeSizeUsdc:'250',bestEstimatedNetUsdc:'-0.1',
 rows:[{sizeUsdc:'100',estimatedNetUsdc:'-0.6'},{sizeUsdc:'250',estimatedNetUsdc:'-0.1'}]};
 const result=buildOpportunityWatchlist({runs:[run('2026-10-13T21:00:00Z',[prior]),
 run('2026-10-13T22:30:00Z',[base])]},now);
 assert.equal(result.items[0].previousNetUsdc,-0.6);
});
