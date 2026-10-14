import assert from 'node:assert/strict';import test from 'node:test';
import {selectBaseResearchPools} from './base-research-pools.js';
import {summarizeExpandedSwapReceipt} from './base-receipt-evidence.js';
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),topic='0x'+'c'.repeat(64);
test('recent saved pools are selected with bounded deduplication',()=>{
 const x=selectBaseResearchPools({runs:[{generatedAt:'2026-10-13T23:50:00Z',markets:[{buyPool:a,sellPool:b}]}]},{runs:[]},Date.parse('2026-10-13T23:59:00Z'));
 assert.equal(x.poolAddresses.includes(a),true);assert.equal(x.poolAddresses.includes(b),true);
 assert.ok(x.poolAddresses.length<=16);
});
test('multi emitter receipt remains an unconfirmed candidate, never profit',()=>{
 const x=summarizeExpandedSwapReceipt({status:'success',logs:[{address:a,topics:[topic]},{address:b,topics:[topic]}]},[a],[topic]);
 assert.equal(x.classification,'MULTI_SWAP_EMITTER_CANDIDATE');
 assert.equal(x.outsideTrackedPoolCount,1);assert.equal(x.actualArbitrageConfirmed,false);
 assert.equal(x.netProfitUsdc,null);assert.equal(x.executionAuthorized,false);
});
test('unrecognized topics and reverted receipts do not qualify',()=>{
 const x=summarizeExpandedSwapReceipt({status:'success',logs:[{address:a,topics:[]}]},[a],[topic]);
 assert.equal(x.classification,'NO_RECOGNIZED_SWAP');
 assert.equal(summarizeExpandedSwapReceipt({status:'reverted',logs:[{address:a,topics:[topic]}]},[a],[topic]).classification,'FAILED_TX');
});
