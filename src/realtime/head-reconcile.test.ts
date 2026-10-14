import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileHead } from './head-reconcile.js';
const h=(x:string)=>'0x'+x.repeat(64);
const observed={number:'0x10',hash:h('a'),parentHash:h('b')};
const read=(source:string,block:unknown=observed,chainId:unknown='0x2105')=>({source,block,chainId});
test('only two distinct matching chain-verified RPCs produce matched UNSAFE, never tradable',()=>{
 const r=reconcileHead(observed,[read('A'),read('B')]);
 assert.equal(r.verdict,'MATCHED_UNSAFE');assert.equal(r.usableForTrading,false);
});
test('reject wrong chain, missing independent provider, and unavailable RPC',()=>{
 assert.equal(reconcileHead(observed,[read('A')]).verdict,'INVALID_INPUT');
 assert.equal(reconcileHead(observed,[read('A'),read('A')]).verdict,'INVALID_INPUT');
 assert.equal(reconcileHead(observed,[read('A'),read('B',observed,'0x1')]).verdict,'WRONG_CHAIN');
 assert.equal(reconcileHead(observed,[read('A'),read('B',null)]).verdict,'RPC_UNAVAILABLE');
});
test('different provider heads and incorrect observed identity fail closed',()=>{
 assert.equal(reconcileHead(observed,[read('A'),read('B',{...observed,hash:h('c')})]).verdict,'PROVIDER_DISAGREEMENT');
 assert.equal(reconcileHead({...observed,hash:h('d')},[read('A'),read('B')]).verdict,'OBSERVED_MISMATCH');
 assert.equal(reconcileHead({...observed,parentHash:'bad'},[read('A'),read('B')]).verdict,'INVALID_INPUT');
});
