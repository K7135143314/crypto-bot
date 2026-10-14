import assert from 'node:assert/strict';
import test from 'node:test';
import { checkParity, percentile, summarize, type Trial } from './quote-benchmark.js';
const trial=(mode:'sequential'|'parallel',f:string[]):Trial=>({mode,block:'123',elapsedMs:100,success:true,quoteFingerprints:f});
test('comparison rejects mismatched pool quote outcomes even at same block',()=>{
 assert.equal(checkParity(trial('sequential',['a']),trial('parallel',['a'])),true);
 assert.equal(checkParity(trial('sequential',['a']),trial('parallel',['b'])),false);
 assert.equal(checkParity(trial('sequential',[]),trial('parallel',[])),false);
});
test('quantiles are correctly ordered and failure samples excluded',()=>{
 assert.equal(percentile([50,10,40,20],.5),20);
 assert.equal(percentile([50,10,40,20],.95),50);
 assert.equal(percentile([], .5),null);
 const s=summarize([trial('sequential',['a']),{...trial('parallel',['a']),success:false}]);
 assert.equal(s[0]?.p50Ms,100);
 assert.equal(s[1]?.failed,1);
 assert.equal(s[1]?.p99Ms,null);
});
