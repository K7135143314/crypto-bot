import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyHistory,mergeVerificationHistory} from './verification-history.js';
const stamp='2026-10-08T02:09:05.000Z';
const source={readOnly:true,executionAuthorized:false,generatedAt:stamp,
 pinnedBlock:'52317997',results:[
 {market:'AERO/USDC',status:'QUOTE_REJECT',indicatedSpreadBps:86.22,bestTradeSizeUsdc:'100',
  bestEstimatedNetUsdc:'-0.73',rows:[{sizeUsdc:'100',decision:'REJECT_COSTS'}]},
 {market:'VIRTUAL/WETH',status:'UNSUPPORTED_MARKET'}]};
test('persists exact-pool quote rejection without claiming execution',()=>{
 const now=Date.parse('2026-10-08T03:00:00Z');
 const h=mergeVerificationHistory(emptyHistory(),source,now);
 assert.equal(h.runs.length,1);
 assert.equal(h.runs[0].results[0].status,'QUOTE_REJECT');
 assert.equal(h.runs[0].results[0].atomicSimulation,'NOT_RUN');
 assert.equal(h.runs[0].executionAuthorized,false);
 assert.equal(mergeVerificationHistory(h,source,now).runs.length,1);
});
test('history filters observations older than 30 days',()=>{
 const now=Date.parse('2026-10-08T03:00:00Z');
 const old={...source,generatedAt:'2026-08-02T00:00:00Z',pinnedBlock:'111'};
 const a=mergeVerificationHistory(emptyHistory(),old,now);
 assert.equal(a.runs.length,0);
});
test('rejects any report purporting to authorize trading',()=>{
 assert.throws(()=>mergeVerificationHistory(emptyHistory(),{...source,executionAuthorized:true}));
 assert.throws(()=>mergeVerificationHistory(emptyHistory(),{...source,pinnedBlock:'not-a-block'}));
});

test('saves unmatched pool leg classification without claiming quoted profit',()=>{
 const now=Date.parse('2026-10-08T03:00:00Z');
 const report={...source,results:[{market:'cbBTC/USDC',status:'UNSUPPORTED_POOL_VARIANT',
  poolDiagnosis:'BUY_POOL_UNMATCHED',
  buyPoolMatch:null,sellPoolMatch:{variant:'UNISWAP_V3',feeTier:500}}]};
 const row=mergeVerificationHistory(emptyHistory(),report,now).runs[0].results[0];
 assert.equal(row.poolDiagnosis,'BUY_POOL_UNMATCHED');
 assert.equal(row.sellPoolMatch.feeTier,500);
 assert.equal(row.bestEstimatedNetUsdc,null);
 assert.equal(row.atomicSimulation,'NOT_RUN');
});

test('retains size comparisons and modeled cost explanations, never enables execution',()=>{
 const now=Date.parse('2026-10-08T03:00:00Z');
 const report={...source,results:[{market:'cbBTC/USDC',status:'QUOTE_REJECT',
  tradeSizesQuoted:2,tradeSizesRequested:7,
  quoteComparisonNote:'Gross round trip not pure price impact',
  rows:[{sizeUsdc:'100',modeledCostsUsdc:'0.30',
    costBreakdownUsdc:{flashLoanPremium:'0.05',l2GasReserve:'0.1'},
    grossReturnBps:-20,relativeQuoteDeteriorationBps:0,
    estimatedNetUsdc:'-0.5',decision:'REJECT_RAW_LOSS'}]}]};
 const result=mergeVerificationHistory(emptyHistory(),report,now).runs[0].results[0];
 assert.equal(result.tradeSizesQuoted,2);
 assert.equal(result.tradeSizesRequested,7);
 assert.equal(result.rows[0].modeledCostsUsdc,'0.30');
 assert.equal(result.rows[0].relativeQuoteDeteriorationBps,0);
 assert.equal(result.atomicSimulation,'NOT_RUN');
});
