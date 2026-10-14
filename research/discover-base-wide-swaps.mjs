// Bounded Base-wide research: no pool address filter; only two recognized Swap signatures.
// Does not discover ALL DEX protocols or certify profit. No wallet/transaction execution.
import {createPublicClient,fallback,http,keccak256,toBytes,toHex} from 'viem';
import {base} from 'viem/chains';
import {SWAP_V3,SWAP_CLASSIC,summarizeExpandedSwapReceipt} from './lib/base-receipt-evidence.js';
import {summarizeReceiptTokenFlows} from './lib/base-transfer-flows.js';
import {classifyCircularUsdcEvidence} from './lib/circular-usdc-evidence.js';
import {selectUnrestrictedMultiSwapLeads} from './lib/unrestricted-swap-leads.js';
import {SEED_POOLS} from './lib/base-research-pools.js';
const configured=(process.env.BASE_RPC_URLS||process.env.BASE_RPC_URL||'').split(',').map(x=>x.trim()).filter(Boolean);
const urls=[...new Set([...configured,'https://base-rpc.publicnode.com','https://mainnet.base.org'])];
const client=createPublicClient({chain:base,transport:fallback(urls.map(url=>http(url,{timeout:16000,retryCount:0})))});
const topics=[keccak256(toBytes(SWAP_V3)),keccak256(toBytes(SWAP_CLASSIC))];
const depth=Math.min(Math.max(Number(process.env.WIDE_BLOCK_DEPTH||'3')||3,1),8);
const receiptLimit=Math.min(Math.max(Number(process.env.WIDE_RECEIPT_LIMIT||'8')||8,1),12);
let tip=null,logs=[],receipts=[],state='COMPLETE',error=null,selection=null,blocksProcessed=0;
try{
 tip=await client.getBlockNumber();
 const from=tip-BigInt(depth-1);
 // Hard upper bound: 8 blocks x 2 event topics, one block per request.
 for(let block=from;block<=tip;block++){
  for(const topic of topics){
   const batch=await client.request({method:'eth_getLogs',params:[{topics:[topic],fromBlock:toHex(block),toBlock:toHex(block)}]});
   logs.push(...batch);
  }
  blocksProcessed++;
 }
 selection=selectUnrestrictedMultiSwapLeads(logs,SEED_POOLS,receiptLimit);
 for(const lead of selection.selectedLeads){
  const receipt=await client.getTransactionReceipt({hash:lead.txHash});
  receipts.push({txHash:lead.txHash,blockNumber:lead.blockNumber,
   outsideTrackedPoolEmitters:lead.outsideTrackedPoolEmitters,
   recognizedSwapEvents:lead.recognizedSwapEvents,
   receiptEvidence:summarizeExpandedSwapReceipt(receipt,SEED_POOLS,topics),
   tokenFlows:summarizeReceiptTokenFlows(receipt),
   circularUsdcEvidence:classifyCircularUsdcEvidence(receipt,topics)});
 }
}catch(e){state='SOURCE_ERROR';error=String(e).slice(0,600)}
console.log(JSON.stringify({version:1,generatedAt:new Date().toISOString(),readOnly:true,executionAuthorized:false,
 chainId:8453,state,error,tipBlock:tip?.toString()??null,blocksRequested:depth,blocksProcessed,
 scope:'TWO_SWAP_SIGNATURES_NO_POOL_ADDRESS_FILTER',
 sourceCompleteness:state==='COMPLETE'?'BOUNDED_WINDOW_COMPLETE':'INCOMPLETE_DO_NOT_INFER_ZERO',
 observedEventCount:logs.length,selection,receipts,
 verifiedProfitableArbitrage:0,
 note:'This short window of two signature families cannot prove broad absence of arbitrage. Multi-emitter receipts and round-trip token flows require full actor, liabilities, fees, internal/native transfers and pool provenance before any profit claim.'},null,2));
if(state!=='COMPLETE')process.exitCode=1;
