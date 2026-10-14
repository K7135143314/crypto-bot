import assert from 'node:assert/strict';
import test from 'node:test';
import {summarizeSwapReceipt} from './base-receipt-evidence.js';
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),t='0x'+'c'.repeat(64);
test('one receipt with two tracked swap pools is an event observation, not profit',()=>{
 const out=summarizeSwapReceipt({transactionHash:t,status:'success',blockNumber:100n,gasUsed:100n,effectiveGasPrice:5n,
 logs:[{address:a,topics:[t]},{address:b,topics:[t]}]},[a,b],[t]);
 assert.equal(out.classification,'MULTI_TRACKED_POOL_SWAP');
 assert.equal(out.observedDistinctTrackedPools,2);
 assert.equal(out.feePaidWei,'500');
 assert.equal(out.netProfitUsdc,null);
 assert.equal(out.executionAuthorized,false);
});
test('rejects unrelated topics and failed receipts',()=>{
 const o=summarizeSwapReceipt({status:'reverted',logs:[{address:a,topics:[t]}]},[a],[t]);
 assert.equal(o.classification,'FAILED_TX');
 assert.equal(o.netProfitUsdc,null);
 const v=summarizeSwapReceipt({status:'success',logs:[{address:a,topics:[t]}]},[a],[t]);
 assert.equal(v.classification,'SINGLE_TRACKED_POOL_SWAP');
 const n=summarizeSwapReceipt({status:'success',logs:[{address:a,topics:[t]}]},[b],[t]);
 assert.equal(n.observedSwapEvents,0);
});
