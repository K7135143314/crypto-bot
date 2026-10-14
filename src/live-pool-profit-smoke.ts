import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { getAddress, isAddress, parseUnits, type Abi, type Address } from 'viem';
import { aaveV3PoolAbi } from './abis.js';
import { CHAIN_ID, CONTRACTS, TOKENS, TRADE_SIZES_USDC } from './config.js';
import { client } from './quotes.js';
import { quoteDex, resolveExactPool, type ExactPoolMatch } from './scout-verifier.js';
import { inspectPoolState, type PoolRead } from './pool-state.js';
import { proveReadOnlyMarket, type MarketProof } from './pool-gated-market.js';
import { verifyObservedHead, type RpcSource } from './realtime/head-rpc.js';
import type { HeadRef } from './realtime/head-reconcile.js';

/**
 * One bounded, read-only live WETH/USDC round-trip research sample.
 * Uses existing on-chain pools, quote adapters and profit policy; no transactions.
 */
const ZERO = '0x0000000000000000000000000000000000000000';
const aeroPoolFactoryAbi=[{type:'function',name:'getPool',stateMutability:'view',
 inputs:[{type:'address',name:'tokenA'},{type:'address',name:'tokenB'},{type:'bool',name:'stable'}],
 outputs:[{type:'address',name:'pool'}]}] as const;
const uniswapPoolFactoryAbi=[{type:'function',name:'getPool',stateMutability:'view',
 inputs:[{type:'address',name:'tokenA'},{type:'address',name:'tokenB'},{type:'uint24',name:'fee'}],
 outputs:[{type:'address',name:'pool'}]}] as const;
const UNISWAP_BASE_FACTORY='0x33128a8fC17869897dcE68Ed026d694621f6FDfD' as Address;
const publicRpcs:RpcSource[]=[
 {name:'base-publicnode',url:'https://base-rpc.publicnode.com'},
 {name:'base-official',url:'https://mainnet.base.org'},
];
const read:PoolRead=async(address,abi,functionName,blockNumber)=>
 client.readContract({address,abi:abi as Abi,functionName,blockNumber});
const outPath='artifacts/base-pool-to-profit-live.json';
const started=performance.now();
const report:{
 version:number;readOnly:true;executionAuthorized:false;atomicSimulation:'NOT_RUN';
 generatedAt:string;source:string;chainId:number|null;blockNumber:string|null;blockHash:string|null;
 status:string;reason:string;routeCount:number;testedSizesUsdc:string[];poolAddresses:Record<string,string>;
 proofs:MarketProof[];timingMs:number;assumptions:string[];
}={
 version:1,readOnly:true,executionAuthorized:false,atomicSimulation:'NOT_RUN',
 generatedAt:new Date().toISOString(),source:'bounded-pinned-Base-contract-reads',
 chainId:null,blockNumber:null,blockHash:null,status:'NOT_STARTED',reason:'',
 routeCount:0,testedSizesUsdc:[],poolAddresses:{},proofs:[],timingMs:0,
 assumptions:[
  'MATCHED_UNSAFE means two queried sources agreed, not finality or execution readiness',
  'Two public RPC hostnames do not guarantee fully independent upstream infrastructure',
  'Historical contract reads are pinned by block number; reconciling before/after is not a by-hash atomic snapshot',
  'Gas price is sampled at test time, not an execution inclusion quote',
  'WETH reference price is derived from a pinned same-market route, not a separate price oracle',
  'Modeled policy reserves do not prove actual full execution costs, fee delivery, or realized P&L',
 ],
};
try {
 const chain=await client.getChainId();
 report.chainId=chain;
 if(chain!==CHAIN_ID)throw Error('Base chain ID mismatch');
 const latest=await client.getBlockNumber();
 if(latest<=30n)throw Error('Base head unavailable');
 // Move back from the tip for public provider agreement; not a finality promise.
 const blockNumber=latest-20n;
 const block=await client.getBlock({blockNumber});
 if(!block.hash||!block.parentHash||block.number!==blockNumber)
  throw Error('Pinned block unavailable or inconsistent');
 const observed:HeadRef={number:block.number.toString(),hash:block.hash,parentHash:block.parentHash};
 report.blockNumber=observed.number;
 report.blockHash=observed.hash;
 const verified=await verifyObservedHead(observed,publicRpcs);
 if(verified.verdict!=='MATCHED_UNSAFE'){
  report.status='BLOCK_UNVERIFIED';report.reason=verified.verdict+': '+verified.reason;
 }else{
  const aeroAddress=await client.readContract({
   address:CONTRACTS.aerodromePoolFactory,abi:aeroPoolFactoryAbi,functionName:'getPool',
   args:[TOKENS.WETH.address,TOKENS.USDC.address,false],blockNumber,
  });
  const feeTiers=[500,3000] as const;
  let uniswapMatch:ExactPoolMatch|null=null;
  for(const fee of feeTiers){
   const candidate=await client.readContract({
    address:UNISWAP_BASE_FACTORY,abi:uniswapPoolFactoryAbi,functionName:'getPool',
    args:[TOKENS.WETH.address,TOKENS.USDC.address,fee],blockNumber,
   });
   if(!isAddress(candidate,{strict:false})||candidate.toLowerCase()===ZERO)continue;
   const matched=await resolveExactPool('uniswap',candidate,blockNumber);
   if(matched&&matched.feeTier===fee){uniswapMatch=matched;break;}
  }
  if(!isAddress(aeroAddress,{strict:false})||aeroAddress.toLowerCase()===ZERO||!uniswapMatch){
   report.status='POOL_UNAVAILABLE';
   report.reason='At least one approved on-chain WETH/USDC pool was not found';
  }else{
   const aerodromeMatch=await resolveExactPool('aerodrome',aeroAddress,blockNumber);
   if(!aerodromeMatch||aerodromeMatch.variant!=='AERODROME_CLASSIC'){
    report.status='POOL_UNVERIFIED';report.reason='Aerodrome Classic factory identity was not confirmed';
   }else{
    report.poolAddresses={
     aerodrome:getAddress(aerodromeMatch.pairAddress),
     uniswap:getAddress(uniswapMatch.pairAddress),
    };
    const [gasPriceWei,flashLoanPremiumBps]=await Promise.all([
     client.getGasPrice(),
     client.readContract({address:CONTRACTS.aaveV3Pool,abi:aaveV3PoolAbi,
      functionName:'FLASHLOAN_PREMIUM_TOTAL',blockNumber}),
    ]);
    const referenceInput=parseUnits('100',TOKENS.USDC.decimals);
    const refWeth=await quoteDex(uniswapMatch,TOKENS.USDC.address,TOKENS.WETH.address,
     referenceInput,blockNumber);
    if(refWeth<=0n)throw Error('Independent WETH reference quote failed');
    const costs={
     gasPriceWei,flashLoanPremiumBps,
     ethPriceUsdcMicros:(referenceInput*10n**18n)/refWeth,
    };
    if(!costs.ethPriceUsdcMicros||!gasPriceWei)throw Error('Invalid modeled cost reference');
    // Reuse already checked pool state across multiple trade sizes for the
    // same pinned block/hash. Any rejection is cached as a rejection.
    const poolCache=new Map<string,ReturnType<typeof inspectPoolState>>();
    const deps={
     reconcile:(head:HeadRef)=>verifyObservedHead(head,publicRpcs),
     inspect:(pool:ExactPoolMatch,at:bigint)=>{
      const cacheKey=observed.hash.toLowerCase()+'|'+at.toString()+'|'+pool.pairAddress.toLowerCase();
      let state=poolCache.get(cacheKey);
      if(!state){
       state=inspectPoolState({dex:pool.dex,pool:pool.pairAddress,blockNumber:at,read});
       poolCache.set(cacheKey,state);
      }
      return state;
     },
     quote:quoteDex,
    };
    // Bounded, deduplicated sample drawn from the already approved size policy.
    // Every observation uses exactly the same historical Base block.
    const tradeSizes= [...new Set(TRADE_SIZES_USDC)].filter(x=>['100','500','1000'].includes(x)).slice(0,3);
    if(tradeSizes.length!==3)throw Error('Required bounded comparison sizes missing from current research configuration');
    report.testedSizesUsdc=tradeSizes;
    for(const sizeUsdc of tradeSizes){
     for(const [buyPool,sellPool] of [
      [aerodromeMatch,uniswapMatch],
      [uniswapMatch,aerodromeMatch],
     ] as const){
      report.proofs.push(await proveReadOnlyMarket({
       observed,buyPool,sellPool,sizeUsdc,costs,
      },deps));
     }
    }
    report.routeCount=report.proofs.length;
    report.status=report.proofs.every(p=>p.status==='MODELED_REJECT'||p.status==='MODELED_CANDIDATE')
      ?'COMPLETE_READ_ONLY':'INCOMPLETE_RESEARCH';
    report.reason='Two directions evaluated against exact pool states at pinned Base block';
   }
  }
 }
}catch(error){
 report.status='READ_ONLY_TEST_ERROR';
 report.reason=error instanceof Error ? error.message.slice(0,300) : String(error).slice(0,300);
}finally{
 report.timingMs=Math.round((performance.now()-started)*1000)/1000;
 await mkdir('artifacts',{recursive:true});
 await writeFile(outPath,JSON.stringify(report,null,2)+'\n');
 const summary={
  status:report.status,readOnly:true,executionAuthorized:false,
  blockNumber:report.blockNumber,blockHash:report.blockHash,
  poolAddresses:report.poolAddresses,
  testedSizesUsdc:report.testedSizesUsdc,
  modeledCandidates:report.proofs.filter(p=>p.status==='MODELED_CANDIDATE').length,
  modeledRejects:report.proofs.filter(p=>p.status==='MODELED_REJECT').length,
  results:report.proofs.map(p=>({sizeUsdc:p.quote?.sizeUsdc??null,status:p.status,modelDecision:p.quote?.costModelDecision??null,
   modeledNetUsdcMicros:p.quote?.estimatedNetProfitMicros??null})),
  reason:report.reason,timingMs:report.timingMs,artifact:outPath,
 };
 console.log(JSON.stringify(summary));
 if(report.status!=='COMPLETE_READ_ONLY')process.exitCode=1;
}
