import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeReceiptTokenFlows, TRANSFER_TOPIC, BASE_USDC} from './base-transfer-flows.js';
const a='0x'+'a'.repeat(40), b='0x'+'b'.repeat(40), p='0x'+'c'.repeat(40);
const topic=(x)=>'0x'+'0'.repeat(24)+x.slice(2);
const word=(n)=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const transfer=(from,to,amount,token=BASE_USDC)=>({address:token,topics:[TRANSFER_TOPIC,topic(from),topic(to)],data:word(amount)});
test('conserves USDC movement across sender and recipient without asserting profit',()=>{
 const receipt={transactionHash:'0x'+'1'.repeat(64),status:'success',from:a,to:p,gasUsed:100n,effectiveGasPrice:20n,
 logs:[transfer(a,p,1000000n),transfer(p,a,1200000n)]};
 const report=summarizeReceiptTokenFlows(receipt);
 assert.equal(report.txFromNetUsdcRawUnits,'200000');
 assert.equal(report.txToNetUsdcRawUnits,'-200000');
 assert.equal(report.reportedExecutionFeeWei,'2000');
 assert.equal(report.netProfitUsdc,null);
 assert.equal(report.actualArbitrageConfirmed,false);
 assert.equal(report.executionAuthorized,false);
});
test('rejects incomplete and non-standard transfer logs safely',()=>{
 const x=summarizeReceiptTokenFlows({status:'success',logs:[
 {address:BASE_USDC,topics:[TRANSFER_TOPIC,topic(a)],data:word(42)},
 {address:BASE_USDC,topics:[TRANSFER_TOPIC,topic(a),topic(b),topic(p)],data:'0x'},
 {address:BASE_USDC,topics:[TRANSFER_TOPIC,topic(a),topic(b)],data:'0x00'}]});
 assert.equal(x.observedErc20Transfers,0);
 assert.equal(x.malformedOrUnsupportedTransferLogs,3);
 assert.equal(x.netProfitUsdc,null);
});
test('failed and empty receipts never pass profit gate',()=>{
 const x=summarizeReceiptTokenFlows({status:'reverted',logs:[],gasUsed:null});
 assert.equal(x.observedErc20Transfers,0);
 assert.equal(x.netProfitUsdc,null);
 assert.equal(x.reportedExecutionFeeWei,null);
});
