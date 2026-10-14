import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCircularUsdcEvidence} from './circular-usdc-evidence.js';
import {TRANSFER_TOPIC,BASE_USDC} from './base-transfer-flows.js';
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),c='0x'+'c'.repeat(40),d='0x'+'d'.repeat(40);
const other='0x'+'e'.repeat(40),sw='0x'+'f'.repeat(64);
const word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const topic=x=>'0x'+'0'.repeat(24)+x.slice(2);
const t=(from,to,amount,token=BASE_USDC)=>({address:token,topics:[TRANSFER_TOPIC,topic(from),topic(to)],data:word(amount)});
const s=(address)=>({address,topics:[sw]});
const receipt=(logs)=>({status:'success',from:a,to:b,transactionHash:'0x'+'1'.repeat(64),blockNumber:123n,logs});
test('read-only conservative USDC surplus classified as candidate, not verified profit',()=>{
 const r=classifyCircularUsdcEvidence(receipt([t(a,b,1000000),t(b,a,1200000),s(c),s(d)]),[sw]);
 assert.equal(r.classification,'POSSIBLE_CIRCULAR_USDC_TRANSFER_FLOW');
 assert.equal(r.strictCashflowCandidates[0].surplusUsdcFormatted,'0.200000');
 assert.equal(r.actualArbitrageConfirmed,false);
 assert.equal(r.netProfitUsdc,null);
 assert.equal(r.executionAuthorized,false);
});
test('ordinary one-way split-route payout is not arbitrage',()=>{
 const r=classifyCircularUsdcEvidence(receipt([t(c,a,200134434),s(c),s(d)]),[sw]);
 assert.equal(r.classification,'NO_CIRCULAR_USDC_TRANSFER_EVIDENCE');
 assert.equal(r.strictCashflowCandidates.length,0);
});
test('other-token spend disqualifies strict candidate',()=>{
 const r=classifyCircularUsdcEvidence(receipt([t(a,b,1000000),t(b,a,1200000),t(a,c,500,other),s(c),s(d)]),[sw]);
 assert.equal(r.classification,'NO_CIRCULAR_USDC_TRANSFER_EVIDENCE');
 assert.equal(r.observedActorsWithBothUSDCFlows.length,2);
});
test('one swap emitter cannot form strict candidate',()=>{
 const r=classifyCircularUsdcEvidence(receipt([t(a,b,1000000),t(b,a,1200000),s(c)]),[sw]);
 assert.equal(r.classification,'INSUFFICIENT_DISTINCT_SWAP_EMITTERS');
});
test('malformed USDC transfers and failed receipts fail closed',()=>{
 const broken={address:BASE_USDC,topics:[TRANSFER_TOPIC,topic(a)],data:word(1)};
 const r=classifyCircularUsdcEvidence(receipt([t(a,b,100),t(b,a,200),broken,s(c),s(d)]),[sw]);
 assert.equal(r.classification,'INCOMPLETE_USDC_TRANSFER_EVIDENCE');
 assert.equal(classifyCircularUsdcEvidence({...receipt([s(c),s(d)]),status:'reverted'},[sw]).classification,'FAILED_OR_UNKNOWN_RECEIPT');
});
