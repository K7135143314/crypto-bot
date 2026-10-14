import test from 'node:test';import assert from 'node:assert/strict';
import {selectUnrestrictedMultiSwapLeads} from './unrestricted-swap-leads.js';
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),c='0x'+'c'.repeat(40);
const h=n=>'0x'+n.toString(16).padStart(64,'0');
const l=(n,address,i)=>({transactionHash:h(n),address,logIndex:i,blockNumber:100n});
test('finds outside-watchlist multi-emitter leads and rejects single swaps',()=>{
 const x=selectUnrestrictedMultiSwapLeads([l(1,a,0),l(2,a,1),l(2,b,2),l(3,b,3),l(3,c,4)],[a],1);
 assert.equal(x.observedTransactions,3);assert.equal(x.multiEmitterTransactions,2);
 assert.equal(x.selectedLeads[0].outsideTrackedPoolEmitters,2);
 assert.equal(x.selectedLeads.length,1);assert.equal(x.actualArbitrageConfirmed,false);
});
test('repeated same emitter and duplicate logs do not count as multi',()=>{
 const x=selectUnrestrictedMultiSwapLeads([l(1,a,0),l(1,a,1),l(1,a,1),l(2,a,2),l(2,b,3)],[a],10);
 assert.equal(x.duplicateLogs,1);assert.equal(x.multiEmitterTransactions,1);
});
test('invalid block/hash excluded and deterministic order maintained',()=>{
 const logs=[l(2,a,0),l(2,b,1),l(1,b,2),l(1,c,3),{...l(3,a,4),blockNumber:null}];
 const x=selectUnrestrictedMultiSwapLeads(logs,[a],10);
 assert.equal(x.invalidLogs,1);
 assert.deepEqual(x.selectedLeads.map(z=>z.txHash),selectUnrestrictedMultiSwapLeads(logs.slice().reverse(),[a],10).selectedLeads.map(z=>z.txHash));
});
