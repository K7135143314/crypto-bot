import assert from 'node:assert/strict';
import test from 'node:test';
import { proveReadOnlyMarket, type MarketProofDeps } from './pool-gated-market.js';
import type { ExactPoolMatch } from './scout-verifier.js';
import type { HeadRef } from './realtime/head-reconcile.js';
const h=(c:string)=>'0x'+c.repeat(64);
const b:HeadRef={number:'100',hash:h('a'),parentHash:h('b')};
const buy:ExactPoolMatch={dex:'aerodrome',pairAddress:('0x'+'c'.repeat(40)) as `0x${string}`,variant:'AERODROME_CLASSIC',stable:false};
const sell:ExactPoolMatch={dex:'uniswap',pairAddress:('0x'+'d'.repeat(40)) as `0x${string}`,feeTier:500};
const args={observed:b,buyPool:buy,sellPool:sell,sizeUsdc:'1000',costs:{gasPriceWei:6000000n,ethPriceUsdcMicros:2700000000n,flashLoanPremiumBps:5n}};
const deps=():MarketProofDeps=>({
 reconcile:async observed=>({verdict:'MATCHED_UNSAFE',observed,providerCount:2,checkedProviders:2,usableForTrading:false,reason:'test'}),
 inspect:async(pool,blockNumber)=>({status:'VALID_POOL_STATE_UNFINALIZED',dex:pool.dex,pool:pool.pairAddress,blockNumber:blockNumber.toString(),readOnly:true,executionAuthorized:false,reason:'test'}),
 quote:async(_pool,tokenIn)=>tokenIn.toLowerCase()==='0x833589fcD6edb6e08f4c7c32d4f71b54bdA02913'.toLowerCase()?1000000000000000000n:1010000000n,
});
test('gated candidate is explicitly modeled and never realized',async()=>{
 const r=await proveReadOnlyMarket(args,deps());
 assert.equal(r.status,'MODELED_CANDIDATE');
 assert.equal(r.realizedNetUsdc,null);assert.equal(r.executionAuthorized,false);
 assert.equal(r.quote?.costModelDecision,'CANDIDATE');
});
test('wrong pool state disqualifies quote without any quotation',async()=>{
 let calls=0;const d=deps();
 d.inspect=async(pool,block)=>({status:'POOL_UNVERIFIED',dex:pool.dex,pool:pool.pairAddress,blockNumber:block.toString(),readOnly:true,executionAuthorized:false,reason:'test'});
 d.quote=async()=>{calls++;return 1n};
 const r=await proveReadOnlyMarket(args,d);assert.equal(r.status,'POOL_REJECTED');assert.equal(calls,0);
});
test('block reorg after quotes rejects modeled result',async()=>{
 const d=deps();let calls=0;
 d.reconcile=async observed=>({verdict:++calls===1?'MATCHED_UNSAFE':'OBSERVED_MISMATCH',observed,providerCount:2,checkedProviders:2,usableForTrading:false,reason:'test'});
 const r=await proveReadOnlyMarket(args,d);assert.equal(r.status,'BLOCK_CHANGED');
 assert.equal(r.quote,undefined);
});
test('unavailable independent verification fails before RPC quote',async()=>{
 const d=deps();let calls=0;
 d.reconcile=async observed=>({verdict:'RPC_UNAVAILABLE',observed,providerCount:2,checkedProviders:0,usableForTrading:false,reason:'test'});
 d.quote=async()=>{calls++;return 1n};
 assert.equal((await proveReadOnlyMarket(args,d)).status,'BLOCK_UNVERIFIED');assert.equal(calls,0);
});
