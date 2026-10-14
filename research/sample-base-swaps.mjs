// Small read-only Base RPC sample. Does not claim arbitrage profitability.
// Collect a bounded set of swap-event receipts from the last N blocks.
import {createPublicClient, http, fallback, keccak256, toBytes} from 'viem';
import {base} from 'viem/chains';
import {summarizeSwapReceipt,SWAP_V3,SWAP_CLASSIC} from './lib/base-receipt-evidence.js';
const rpc=(process.env.BASE_RPC_URLS||process.env.BASE_RPC_URL||'').split(',').map(x=>x.trim()).filter(Boolean);
const urls=[...new Set([...rpc,'https://base-rpc.publicnode.com','https://mainnet.base.org'])];
const client=createPublicClient({chain:base,transport:fallback(urls.map(url=>http(url,{timeout:18000,retryCount:0})))});
const pools=['0xec558e484cc9f2210714e345298fdc53b253c27d',
'0x4e962bb3889bf030368f56810a9c96b83cb3e778',
'0x0b1c2dcbbfa744ebd3fc17ff1a96a1e1eb4b2d69',
'0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59'];
const topics=[keccak256(toBytes(SWAP_V3)),keccak256(toBytes(SWAP_CLASSIC))];
const depth=Math.min(Math.max(Number(process.env.SAMPLE_BLOCK_DEPTH||'20')||20,1),100);
const limit=Math.min(Math.max(Number(process.env.SAMPLE_RECEIPT_LIMIT||'12')||12,1),25);
let state='COMPLETE',error=null,tip=null,logs=[],receipts=[];
try{
 tip=await client.getBlockNumber();
 const fromBlock=tip-BigInt(depth-1);
 for(const topic of topics){
  try{const group=await client.getLogs({address:pools,topics:[topic],fromBlock,toBlock:tip});logs.push(...group)}
  catch(e){throw Error('getLogs failed: '+String(e).slice(0,350))}
 }
 const hashes=[...new Set(logs.map(l=>l.transactionHash))].slice(0,limit);
 for(const hash of hashes){
  const receipt=await client.getTransactionReceipt({hash});
  receipts.push(summarizeSwapReceipt(receipt,pools,topics));
 }
}catch(e){state='SOURCE_ERROR';error=String(e).slice(0,700)}
const report={version:1,generatedAt:new Date().toISOString(),readOnly:true,
 executionAuthorized:false,chainId:8453,state,error,
 sampleDepthBlocks:depth,sampledMaxReceipts:limit,tipBlock:tip?.toString()||null,
 poolAddresses:pools,observedEventCount:logs.length,receipts,
 historicalNetProfitsConfirmed:0,
 note:'Sampled a bounded set of specified tracked pools; does not cover all Base arbitrage. Success and multi-pool swaps do NOT prove net profitability; net cash flows and all fees not reconstructed.'};
console.log(JSON.stringify(report,null,2));
if(state!=='COMPLETE')process.exitCode=1;
