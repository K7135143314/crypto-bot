import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMarketHistory, MARKET_KEYS } from './market-history.js';
const report = (date) => ({ readOnly:true, executionAuthorized:false,generatedAt:date,
 markets:MARKET_KEYS.map((market)=>({market,status:'NO_ELIGIBLE_POOLS_IN_SOURCE',sourceCoverage:'TWO_TOKEN_SEARCH',
 eligiblePools:0,eligibleDexes:0,best:null})) });
test('six markets persist without claiming verified profit',()=>{
 const now=Date.parse('2026-10-08T02:00:00Z'), first=report('2026-10-08T01:00:00Z');
 const saved=mergeMarketHistory({runs:[]}, first, now);
 assert.equal(saved.runs.length,1);
 assert.equal(saved.runs[0].markets.length,6);
 assert.ok(saved.runs[0].markets.every((m)=>m.verification==='NOT_VERIFIED'));
 assert.equal(mergeMarketHistory(saved,first,now).runs.length,1);
});
test('removes expired observations',()=>{
 const now=Date.parse('2026-10-08T02:00:00Z');
 const saved=mergeMarketHistory({runs:[{generatedAt:'2026-08-01T00:00:00Z'}]},report('2026-10-08T01:00:00Z'),now);
 assert.equal(saved.runs.length,1);
});
test('refuses malformed or non-read-only reports',()=>{
 assert.throws(()=>mergeMarketHistory(null,{...report('2026-10-08T01:00:00Z'),executionAuthorized:true}));
});
