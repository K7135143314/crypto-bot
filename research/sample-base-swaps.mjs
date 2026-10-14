// Small read-only Base RPC sample. Does not claim arbitrage profitability.
// Collect a bounded set of swap-event receipts from the last N blocks.
import {createPublicClient, http, fallback, keccak256, toBytes, toHex} from 'viem';
import {base} from 'viem/chains';
import {summarizeExpandedSwapReceipt,SWAP_V3,SWAP_CLASSIC} from './lib/base-receipt-evidence.js';
const rpc=(process.env.BASE_RPC_URLS||process.env.BASE_RPC_URL||'').split(',').map(x=>x.trim()).filter(Boolean);
const urls=[...new Set([...rpc,'https://base-rpc.publicnode.com','https://mainnet.base.org'])];
const client=createPublicClient({chain:base,transport:fallback(urls.map(url=>http(url,{timeout:18000,retryCount:0})))});
import {selectBaseResearchPools} from './lib/base-research-pools.js';
const source='https://raw.githubusercontent.com/K7135143314/crypto-bot/observer-data/data/';
async function history(path){
 try{
  const response=await fetch(source+path,{signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  return await response.json();
 }catch{return {runs:[]}}
}
const selected=selectBaseResearchPools(await history('markets.json'),await history('verification.json'));
const pools=selected.poolAddresses;
const topics=[keccak256(toBytes(SWAP_V3)),keccak256(toBytes(SWAP_CLASSIC))];
const depth=Math.min(Math.max(Number(process.env.SAMPLE_BLOCK_DEPTH||'20')||20,1),100);
const limit=Math.min(Math.max(Number(process.env.SAMPLE_RECEIPT_LIMIT||'12')||12,1),25);
let state='COMPLETE',error=null,tip=null,logs=[],receipts=[];
try{
 tip=await client.getBlockNumber();
 const fromBlock=tip-BigInt(depth-1);
 for(const topic of topics){
  for(let start=0;start<pools.length;start+=4){
   const batch=pools.slice(start,start+4);
   try{const group=await client.request({method:'eth_getLogs',params:[{address:batch,topics:[topic],fromBlock:toHex(fromBlock),toBlock:toHex(tip)}]});logs.push(...group)}
   catch(e){throw Error('getLogs batch '+start+' failed: '+String(e).slice(0,350))}
  }
 }
 const hashes=[...new Set(logs.map(l=>l.transactionHash))].slice(0,limit);
 for(const hash of hashes){
  const receipt=await client.getTransactionReceipt({hash});
  receipts.push(summarizeExpandedSwapReceipt(receipt,pools,topics));
 }
}catch(e){state='SOURCE_ERROR';error=String(e).slice(0,700)}
const report={version:1,generatedAt:new Date().toISOString(),readOnly:true,
 executionAuthorized:false,chainId:8453,state,error,
 sampleDepthBlocks:depth,sampledMaxReceipts:limit,tipBlock:tip?.toString()||null,
 poolAddresses:pools,poolSources:selected.sources,observedEventCount:logs.length,receipts,
 historicalNetProfitsConfirmed:0,
 note:'Sampled up to 16 research pools and all recognized swap events within selected receipts; does not cover all Base arbitrage. Success and multi-pool swaps do NOT prove net profitability; net cash flows and all fees not reconstructed.'};
console.log(JSON.stringify(report,null,2));
if(state!=='COMPLETE')process.exitCode=1;
