import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuoteDeps } from './six-market-verifier.js';
import { checkTokenDecimals, chooseLeads, rankQuoteResults, roundTripBps, MAX_RESEARCH_TRADE_SIZES, supportedMarket, verifyMarketLead } from './six-market-verifier.js';
import { TOKENS } from './config.js';
const lead={buyDex:'uniswap',sellDex:'aerodrome',buyPool:'0x'+'a'.repeat(40),
sellPool:'0x'+'b'.repeat(40),indicatedSpreadBps:100,status:'SHORTLIST'};
const costs={gasPriceWei:1000000n,premiumBps:5n,ethPriceUsdcMicros:3000000000n};
test('approved cbBTC contract is Base-native 8-decimal token',()=>{
 assert.equal(TOKENS.cbBTC.address.toLowerCase(),'0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf');
 assert.equal(TOKENS.cbBTC.decimals,8);
 assert.equal(checkTokenDecimals(8,TOKENS.cbBTC.decimals),true);
 assert.equal(checkTokenDecimals(18,TOKENS.cbBTC.decimals),false);
 assert.equal(checkTokenDecimals(NaN,TOKENS.cbBTC.decimals),false);
});
test('USDC-quoted pairs are eligible for exact on-chain quote verification',()=>{
  assert.equal(supportedMarket('AERO/USDC'),true);
  assert.equal(supportedMarket('WETH/USDC'),true);
  assert.equal(supportedMarket('cbBTC/USDC'),true);
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

test('cbBTC exact-pool round trip uses satoshi-sized raw output, same pinned block, USDC input/output',async()=>{
 const observations:{rawReceived?:bigint;legs:string[];matchedTokens:string[]}={legs:[],matchedTokens:[]};
 const deps:QuoteDeps={
  match:async(_dex,_pool,block,tokenA,tokenB)=>{
   assert.equal(block,54321n);
   assert.equal(tokenA?.toLowerCase(),TOKENS.cbBTC.address.toLowerCase());
   assert.equal(tokenB?.toLowerCase(),TOKENS.USDC.address.toLowerCase());
   observations.matchedTokens.push(String(tokenA));
   return {dex:'aerodrome',pairAddress:('0x'+'c'.repeat(40)) as `0x${string}`};
  },
  quote:async(_pool,tokenIn,tokenOut,amount,block)=>{
   assert.equal(block,54321n);
   observations.legs.push(tokenIn.toLowerCase()+' -> '+tokenOut.toLowerCase());
   if(tokenIn.toLowerCase()===TOKENS.USDC.address.toLowerCase()){
     assert.ok(amount>=100_000_000n); // USDC has six decimals
     observations.rawReceived=123456n; // 0.00123456 cbBTC, not 18-decimal WETH
     return 123456n;
   }
   assert.equal(tokenIn.toLowerCase(),TOKENS.cbBTC.address.toLowerCase());
   assert.equal(amount,123456n);
   return 99_800_000n; // Loss of $0.20, before all modeled costs
  },
 };
 const result=await verifyMarketLead('cbBTC/USDC',lead,54321n,costs,deps);
 assert.equal(result.status,'QUOTE_REJECT');
 assert.equal('exactPoolMatch' in result && result.exactPoolMatch,true);
 assert.equal(result.atomicSimulation,'NOT_RUN');
 assert.equal(result.readOnly,true);
 assert.equal(result.executionAuthorized,false);
 assert.ok('bestEstimatedNetUsdc' in result && result.bestEstimatedNetUsdc?.startsWith('-'));
 assert.ok('rows' in result && result.rows?.[0]?.receivedBaseToken === '0.00123456');
 assert.ok('rows' in result && result.rows?.[0]?.baseTokenDecimals === 8);
 assert.equal(observations.matchedTokens.length,2);
 assert.ok(observations.legs.length>=2);
});
test('cbBTC unsupported exact-pool routes never report a profit',async()=>{
 const deps: QuoteDeps={match:async()=>null,quote:async()=>{throw Error('quote must not run');}};
 const result=await verifyMarketLead('cbBTC/USDC',lead,54321n,costs,deps);
 assert.equal(result.status,'UNSUPPORTED_POOL_VARIANT');
 assert.equal('bestEstimatedNetUsdc' in result,false);
});

test('partial exact pool match reports which route leg is unsupported',async()=>{
 const deps:QuoteDeps={
   match:async(dex)=>dex==='uniswap'?{dex:'uniswap',pairAddress:('0x'+'c'.repeat(40)) as `0x${string}`,feeTier:500}:null,
   quote:async()=>{throw Error('should not quote unmatched route');}
 };
 const result=await verifyMarketLead('cbBTC/USDC',lead,54321n,costs,deps);
 assert.equal(result.status,'UNSUPPORTED_POOL_VARIANT');
 assert.ok('poolDiagnosis' in result && result.poolDiagnosis==='SELL_POOL_UNMATCHED');
 assert.ok('buyPoolMatch' in result && result.buyPoolMatch?.feeTier===500);
 assert.equal('bestEstimatedNetUsdc' in result,false);
});

test('USDC round trip basis points and seven-size cap are deterministic',()=>{
 assert.equal(roundTripBps(100_000_000n,-250_000n),-25);
 assert.equal(roundTripBps(250_000_000n,500_000n),20);
 assert.equal(MAX_RESEARCH_TRADE_SIZES,7);
 assert.throws(()=>roundTripBps(0n,0n),/positive/);
});
test('cbBTC research quotes preserve fee breakdown and distinct seven trade sizes',async()=>{
 const calledSizes:string[]=[];
 const deps:QuoteDeps={
  match:async()=>({dex:'aerodrome',pairAddress:('0x'+'c'.repeat(40)) as `0x${string}`}),
  quote:async(_pool,tokenIn,_tokenOut,amount,block)=>{
   assert.equal(block,54321n);
   if(tokenIn.toLowerCase()===TOKENS.USDC.address.toLowerCase()){
     calledSizes.push(String(amount));
     return amount/1000n;
   }
   return amount*998n;
  },
 };
 const result=await verifyMarketLead('cbBTC/USDC',lead,54321n,costs,deps);
 assert.equal(result.status,'QUOTE_REJECT');
 assert.ok('rows' in result);
 if(!('rows' in result))return;
 assert.equal(result.rows?.length,7);
 assert.equal(new Set(calledSizes).size,7);
 assert.ok('tradeSizesQuoted' in result && result.tradeSizesQuoted===7);
 assert.equal(result.rows?.[0]?.sizeUsdc,'100');
 assert.equal(result.rows?.[6]?.sizeUsdc,'10000');
 assert.equal(result.rows?.[0]?.modeledCostsUsdc!==undefined,true);
 assert.equal(result.rows?.[0]?.costBreakdownUsdc?.flashLoanPremium!==undefined,true);
 assert.equal(result.rows?.[0]?.grossReturnBps,-20);
 assert.equal(result.rows?.[0]?.relativeQuoteDeteriorationBps,0);
 assert.equal(result.atomicSimulation,'NOT_RUN');
});
