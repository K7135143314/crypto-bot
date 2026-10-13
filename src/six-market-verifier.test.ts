import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuoteDeps } from './six-market-verifier.js';
import { chooseLeads, rankQuoteResults, supportedMarket, verifyMarketLead } from './six-market-verifier.js';
const lead={buyDex:'uniswap',sellDex:'aerodrome',buyPool:'0x'+'a'.repeat(40),
sellPool:'0x'+'b'.repeat(40),indicatedSpreadBps:100,status:'SHORTLIST'};
const costs={gasPriceWei:1000000n,premiumBps:5n,ethPriceUsdcMicros:3000000000n};
test('only USDC-quoted pairs have proven quote paths',()=>{
  assert.equal(supportedMarket('AERO/USDC'),true);
  assert.equal(supportedMarket('WETH/USDC'),true);
  assert.equal(supportedMarket('VIRTUAL/WETH'),false);
});
test('only shortlist leads are passed forward',()=>{
 assert.equal(chooseLeads({topLeads:[{...lead,status:'WATCH'},lead]}).length,1);
});
test('unsupported DEX never receives invented profit',async()=>{
 const result=await verifyMarketLead('AERO/USDC',{...lead,buyDex:'quickswap'},123n,costs);
 assert.equal(result.status,'UNSUPPORTED_DEX');
 assert.equal('bestEstimatedNetUsdc' in result,false);
});
test('unsupported exact pool produces no quote profit',async()=>{
 const result=await verifyMarketLead('AERO/USDC',lead,123n,costs,
 {match:async()=>null,quote:async()=>100n});
 assert.equal(result.status,'UNSUPPORTED_POOL_VARIANT');
 assert.equal('bestEstimatedNetUsdc' in result,false);
});
test('two real legs must be quoted at same block and yield costs',async()=>{
 let matched=0,quoted=0;
 const deps: QuoteDeps={
 match:async()=>{matched++;return {dex:'aerodrome',pairAddress:('0x'+'c'.repeat(40)) as `0x${string}`};},
 quote:async(_pool,_in,_out,amount,block)=>{assert.equal(block,123n);quoted++;return amount;},
 };
 const result=await verifyMarketLead('AERO/USDC',lead,123n,costs,deps);
 assert.equal(result.status,'QUOTE_REJECT');
 assert.equal(matched,2);
 assert.ok(quoted>=2);
 assert.equal(result.atomicSimulation,'NOT_RUN');
});

test('bytes32 pool identifier cannot reach any on-chain adapter',async()=>{
 let called=false;
 const deps:QuoteDeps={match:async()=>{called=true;throw Error('unexpected RPC');},
   quote:async()=>{called=true;throw Error('unexpected quote');}};
 const result=await verifyMarketLead('WETH/USDC',
   {...lead,buyPool:'0x'+'f'.repeat(64)},123n,costs,deps);
 assert.equal(result.status,'INVALID_POOL_ADDRESS');
 assert.equal(called,false);
 assert.equal('bestEstimatedNetUsdc' in result,false);
});

test('quotable routes outrank unsupported high-spread discovery leads',()=>{
 const unsupported={...lead,buyDex:'pancakeswap',indicatedSpreadBps:900};
 const supported={...lead,indicatedSpreadBps:8};
 const selected=chooseLeads({topLeads:[unsupported,supported]},1);
 assert.equal(selected.length,1);
 assert.equal(selected[0]?.buyDex,'uniswap');
});
test('verified on-chain net ranks ahead of unsupported spread and losing quotes',()=>{
 const rows=[
 {status:'UNSUPPORTED_DEX',indicatedSpreadBps:800},
 {status:'QUOTE_REJECT',bestEstimatedNetUsdc:'-0.4',indicatedSpreadBps:12},
 {status:'QUOTE_CANDIDATE',bestEstimatedNetUsdc:'1.4',indicatedSpreadBps:7},
 {status:'QUOTE_REJECT',bestEstimatedNetUsdc:'-0.1',indicatedSpreadBps:10},
 ];
 const ranked=rankQuoteResults(rows);
 assert.deepEqual(ranked.map(r=>r.status),['QUOTE_CANDIDATE','QUOTE_REJECT','QUOTE_REJECT','UNSUPPORTED_DEX']);
 assert.equal(ranked[1]?.bestEstimatedNetUsdc,'-0.1');
});
test('unsupported and malformed quote results never become profit claims',()=>{
 const ranked=rankQuoteResults([
 {status:'UNSUPPORTED_DEX',bestEstimatedNetUsdc:'999'},
 {status:'QUOTE_REJECT',bestEstimatedNetUsdc:'not-a-number'},
 {status:'QUOTE_REJECT',bestEstimatedNetUsdc:'-0.3'},
 ]);
 assert.equal(ranked[0]?.bestEstimatedNetUsdc,'-0.3');
});
