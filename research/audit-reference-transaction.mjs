// Research-only Base transaction audit: no keys, signing, trading, or net-profit claims.
// Run: TARGET_TX_HASH=0x... node research/audit-reference-transaction.mjs
import {createPublicClient, fallback, http, keccak256, toBytes} from 'viem';
import {base} from 'viem/chains';
import {summarizeExpandedSwapReceipt, SWAP_V3, SWAP_CLASSIC} from './lib/base-receipt-evidence.js';
import {summarizeReceiptTokenFlows, TRANSFER_TOPIC, BASE_USDC} from './lib/base-transfer-flows.js';

const DEFAULT_TX = '0x5cdd56c9c3a043b9ba6ba328a8f290185cfb41765aa149542dcb9f9108558c68';
const HASH=/^0x[0-9a-f]{64}$/i;
const WORD=/^0x[0-9a-f]{64}$/i;
const addr=(x)=>String(x||'').toLowerCase();
const selected = process.env.TARGET_TX_HASH || DEFAULT_TX;
if (!HASH.test(selected)) throw Error('Invalid transaction hash');
const urls=[...new Set([...(process.env.BASE_RPC_URLS||process.env.BASE_RPC_URL||'').split(',').map(s=>s.trim()).filter(Boolean),
  'https://base-rpc.publicnode.com','https://mainnet.base.org'])];
const client=createPublicClient({chain:base,transport:fallback(urls.map(url=>http(url,{timeout:18000,retryCount:0})))});
const swapTopics=[keccak256(toBytes(SWAP_V3)),keccak256(toBytes(SWAP_CLASSIC))].map(addr);
const metadataAbi=[
 {name:'symbol',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'string'}]},
 {name:'decimals',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'uint8'}]},
];
const tokenLabels={
 [BASE_USDC]:{symbol:'USDC',decimals:6,source:'BASE_CANONICAL_KNOWN'},
 '0x4200000000000000000000000000000000000006':{symbol:'WETH',decimals:18,source:'BASE_CANONICAL_KNOWN'},
 '0x940181a94a35a4569e4529a3cdfb74e38fd98631':{symbol:'AERO',decimals:18,source:'BASE_CANONICAL_KNOWN'},
 '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf':{symbol:'cbBTC',decimals:8,source:'BASE_CANONICAL_KNOWN'}
};
const formatAmount=(value,decimals)=>{
 if(!Number.isInteger(decimals)||decimals<0||decimals>36)return null;
 const n=BigInt(value),sign=n<0n?'-':'',v=n<0n?-n:n;
 const divisor=10n**BigInt(decimals);
 const fraction=(v%divisor).toString().padStart(decimals,'0').replace(/0+$/,'');
 return sign+(v/divisor).toString()+(fraction?'.'+fraction:'');
};
async function main(){
 const [receipt,tx]=await Promise.all([
  client.getTransactionReceipt({hash:selected}),
  client.getTransaction({hash:selected})
 ]);
 if(addr(receipt.transactionHash)!==addr(selected)||addr(tx.hash)!==addr(selected))throw Error('RPC hash mismatch');
 const [block,summary]=await Promise.all([
  client.getBlock({blockNumber:receipt.blockNumber}),
  Promise.resolve(summarizeReceiptTokenFlows(receipt))
 ]);
 const transferLogs=receipt.logs.filter(log=>addr(log.topics?.[0])===TRANSFER_TOPIC &&
  log.topics?.length===3 && WORD.test(String(log.data||'')) &&
  WORD.test(String(log.topics[1])) && WORD.test(String(log.topics[2])));
 const tokenAddresses=[...new Set(transferLogs.map(l=>addr(l.address)))];
 const tokenInfo={...tokenLabels};
 for(const token of tokenAddresses){
  if(tokenInfo[token])continue;
  let symbol=null,decimals=null;
  try{symbol=await client.readContract({address:token,abi:metadataAbi,functionName:'symbol',blockNumber:receipt.blockNumber})}catch{}
  try{decimals=Number(await client.readContract({address:token,abi:metadataAbi,functionName:'decimals',blockNumber:receipt.blockNumber}))}catch{}
  tokenInfo[token]={symbol,decimals,source:symbol!==null||decimals!==null?'HISTORIC_ERC20_CALL':'UNKNOWN'};
 }
 const transferEvents=transferLogs.map(log=>{
  const token=addr(log.address),meta=tokenInfo[token]??{};
  const amount=BigInt(log.data).toString();
  return {logIndex:Number(log.logIndex),token,tokenSymbol:meta.symbol??null,
   from:'0x'+log.topics[1].slice(-40).toLowerCase(),
   to:'0x'+log.topics[2].slice(-40).toLowerCase(),
   rawAmount:amount,displayAmount:formatAmount(amount,meta.decimals)};
 }).sort((a,b)=>a.logIndex-b.logIndex);
 const emitters=receipt.logs.filter(log=>swapTopics.includes(addr(log.topics?.[0])))
  .map(log=>({logIndex:Number(log.logIndex),address:addr(log.address),
   eventType:addr(log.topics[0])===swapTopics[0]?'SWAP_V3_SIGNATURE':'SWAP_CLASSIC_SIGNATURE'}))
  .sort((a,b)=>a.logIndex-b.logIndex);
 const addresses=[...new Set(transferEvents.flatMap(e=>[e.from,e.to]))];
 const movements=[];
 for(const address of addresses){
  for(const token of tokenAddresses){
   const all=transferEvents.filter(e=>e.token===token);
   let net=0n;
   for(const e of all){if(e.from===address)net-=BigInt(e.rawAmount);if(e.to===address)net+=BigInt(e.rawAmount)}
   if(net===0n)continue;
   movements.push({address,token,symbol:tokenInfo[token]?.symbol??null,
    netRawUnits:String(net),netFormatted:formatAmount(net,tokenInfo[token]?.decimals)});
  }
 }
 const generic=summarizeExpandedSwapReceipt(receipt,[],swapTopics);
 const report={
  version:1,chainId:8453,observedAt:new Date().toISOString(),
  txHash:addr(selected),blockNumber:receipt.blockNumber.toString(),blockTimestamp:new Date(Number(block.timestamp)*1000).toISOString(),
  status:receipt.status,from:addr(tx.from),to:tx.to?addr(tx.to):null,
  txValueWei:tx.value.toString(),methodSelector:String(tx.input||'').slice(0,10),
  receiptGasUsed:receipt.gasUsed.toString(),receiptEffectiveGasPriceWei:receipt.effectiveGasPrice?.toString()??null,
  receiptReportedL1FeeWei:receipt.l1Fee?.toString()??null,
  gasUsedTimesEffectiveGasPriceWei:receipt.effectiveGasPrice===undefined?null:(receipt.gasUsed*receipt.effectiveGasPrice).toString(),
  feeNote:'L2 gas product and reported L1 fee are separate source fields; avoid double-counting and do not infer total cost until chain fee semantics and side payments are audited.',
  swapEvents:emitters,swapEvidenceClassification:generic.classification,
  transferEvents,tokenMetadata:Object.fromEntries(tokenAddresses.map(token=>[token,tokenInfo[token]??{}])),
  netErc20TransferMovements:movements,
  txSenderUSDC:summary.txFromNetUsdcRawUnits,txRecipientUSDC:summary.txToNetUsdcRawUnits,
  observedSwapEmitterCount:generic.allDistinctSwapEmitters,
  observedTransferCount:summary.observedErc20Transfers,
  supportedRouteVerified:false,transactionBeneficiaryVerified:false,
  executionComparable:false,allNativeAndInternalTransfersAccounted:false,
  flashLoanAndDebtsVerified:false,totalFeeUSDCVerified:false,
  actualArbitrageConfirmed:false,netProfitUsdc:null,executionAuthorized:false,
  note:'Three swaps may be aggregator routing, not arbitrage. ERC-20 event movements are NOT trader profits. Token metadata may be unknown or fetched at historical state; pool factory identity, trace, full liabilities and historical price must be independently verified.'
 };
 console.log(JSON.stringify(report,null,2));
}
await main();
