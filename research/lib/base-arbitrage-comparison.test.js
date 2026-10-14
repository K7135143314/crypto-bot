import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBaseArbitrageCandidates} from './base-arbitrage-comparison.js';
const now=Date.parse('2026-10-13T23:59:00Z');
const poolA='0x'+'a'.repeat(40),poolB='0x'+'b'.repeat(40);
const candidate={tx_hash:'0x'+'1'.repeat(64),block_time:'2026-10-12 15:00:00',
 intermediate_token:'0x4200000000000000000000000000000000000006',
 first_dex:'aerodrome',second_dex:'uniswap',first_contract_hint:poolA,
 second_contract_hint:poolB,gross_delta_usdc:1.2,modeled_tx_fee_eth:0.0002};
const history={runs:[{generatedAt:'2026-10-12T14:59:00Z',readOnly:true,executionAuthorized:false,results:[{
 market:'WETH/USDC',buyDex:'aerodrome',sellDex:'uniswap',
 buyPool:poolA,sellPool:poolB,status:'QUOTE_REJECT',exactPoolMatch:true
}]}]};
const data={queryId:'1234567',executedAt:'2026-10-13T23:58:00Z',rows:[candidate]};
test('exact pool match is a coverage hint, not proof of historical profit',()=>{
 const result=compareBaseArbitrageCandidates(data,history,now);
 assert.equal(result.scannerPoolAddressMatches,1);
 assert.equal(result.findings[0].classification,'SAME_POOLS_SEEN_IN_PRIOR_SCANNER');
 assert.equal(result.findings[0].netProfitUsdc,null);
 assert.equal(result.actualNetProfitsConfirmed,0);
 assert.equal(result.executionAuthorized,false);
});
test('different routes or pool addresses cannot be marked covered',()=>{
 const result=compareBaseArbitrageCandidates(data,{runs:[]},now);
 assert.equal(result.findings[0].classification,'NO_PRIOR_SCANNER_MATCH');
 assert.equal(result.scannerPoolAddressMatches,0);
});
test('unsupported token and DEX remain unverified',()=>{
 const custom={...candidate,intermediate_token:'0x'+'f'.repeat(40)};
 const unsupported={...candidate,first_dex:'pancakeswap'};
 const x=compareBaseArbitrageCandidates({...data,rows:[custom,unsupported]},history,now);
 assert.deepEqual(x.findings.map(r=>r.classification),['MARKET_UNSUPPORTED','DEX_UNSUPPORTED']);
});
test('bad hash and old candidate rejected before considering profit',()=>{
 const result=compareBaseArbitrageCandidates({...data,rows:[
 {...candidate,tx_hash:'missing'},
 {...candidate,block_time:'2026-08-01 00:00:00'}]},history,now);
 assert.equal(result.findings.every(r=>r.classification==='INVALID_OR_OUT_OF_WINDOW'),true);
});
test('no evidence is fabricated when there are no rows',()=>{
 const result=compareBaseArbitrageCandidates({rows:[]},{runs:[]},now);
 assert.equal(result.rowsAnalyzed,0);
 assert.equal(result.actualNetProfitsConfirmed,0);
});

test('future scanner quotes cannot establish past route coverage',()=>{
 const future={runs:[{...history.runs[0],generatedAt:'2026-10-12T15:01:00Z'}]};
 const result=compareBaseArbitrageCandidates(data,future,now);
 assert.equal(result.scannerPoolAddressMatches,0);
 assert.equal(result.findings[0].classification,'NO_PRIOR_SCANNER_MATCH');
});
test('old pre-transaction quotes do not imply timely coverage',()=>{
 const stale={runs:[{...history.runs[0],generatedAt:'2026-10-12T10:00:00Z'}]};
 assert.equal(compareBaseArbitrageCandidates(data,stale,now).scannerPoolAddressMatches,0);
});
