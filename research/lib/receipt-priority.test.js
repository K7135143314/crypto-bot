import test from 'node:test';import assert from 'node:assert/strict';
import {selectPriorityReceipts} from './receipt-priority.js';
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),c='0x'+'c'.repeat(40);
const tx=n=>'0x'+n.toString(16).padStart(64,'0');
const log=(id,pool,index,block=100n)=>({transactionHash:tx(id),address:pool,logIndex:index,blockNumber:block});
test('multi-pool evidence takes priority ahead of first single receipt',()=>{
 const r=selectPriorityReceipts([log(1,a,0),log(2,a,1),log(2,b,2),log(3,c,3)],[a,b,c],2);
 assert.equal(r.selected[0].txHash,tx(2));assert.equal(r.selectedMultiTracked,1);
 assert.equal(r.selected.length,2);assert.equal(r.skippedTransactionCount,1);
});
test('repeated tracked swap outranks single swaps',()=>{
 const r=selectPriorityReceipts([log(1,a,0),log(1,a,1),log(2,b,2)],[a,b],1);
 assert.equal(r.selected[0].txHash,tx(1));assert.equal(r.selectedRepeated,1);
});
test('deduplicates log indexes and transaction hashes without repeating receipts',()=>{
 const logs=[log(1,a,0),log(1,a,0),log(1,b,1),log(1,b,1)];
 const r=selectPriorityReceipts(logs,[a,b],5);
 assert.equal(r.uniqueTransactionCount,1);assert.equal(r.duplicateLogIndexes,2);
 assert.equal(r.selected[0].trackedSwapEventCount,2);
});
test('selection bounded, deterministic, diversified and explicitly not profitable',()=>{
 const logs=[log(1,a,0),log(2,a,1),log(3,b,2),log(4,c,3)];
 const x=selectPriorityReceipts(logs,[a,b,c],3),y=selectPriorityReceipts([...logs].reverse(),[a,b,c],3);
 assert.deepEqual(x.selected.map(z=>z.txHash),y.selected.map(z=>z.txHash));
 assert.equal(x.selectedTrackedPoolCoverage,3);assert.equal(x.selected.length,3);
 assert.equal(x.selected.some(z=>'netProfitUsdc'in z),false);
});
test('invalid hashes, unknown pools and zero budget fail closed',()=>{
 const r=selectPriorityReceipts([log(1,a,0),log(2,b,1),{transactionHash:'bad',address:a}],[a],0);
 assert.equal(r.selected.length,0);assert.equal(r.invalidOrUnsupportedLogs,2);
});
