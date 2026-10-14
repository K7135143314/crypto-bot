import { getAddress, parseUnits, type Address } from 'viem';
import { TOKENS, PROFIT_POLICY } from './config.js';
import { evaluateOpportunity } from './profit.js';
import type { ExactPoolMatch } from './scout-verifier.js';
import type { PoolStateResult } from './pool-state.js';
import type { HeadRef, Reconciliation } from './realtime/head-reconcile.js';

/**
 * Strictly read-only, same-block proof chain:
 * block agreement -> exact pool states -> quotes -> modeled costs -> block agreement.
 * A modeled candidate is NEVER executable or realized profit.
 */
export type MarketProofDeps = {
  reconcile: (observed: HeadRef) => Promise<Reconciliation>;
  inspect: (pool: ExactPoolMatch, blockNumber: bigint) => Promise<PoolStateResult>;
  quote: (pool: ExactPoolMatch, tokenIn: Address, tokenOut: Address,
    amountIn: bigint, blockNumber: bigint) => Promise<bigint>;
};
export type MarketProofStatus =
  'INVALID_INPUT'|'BLOCK_UNVERIFIED'|'POOL_REJECTED'|'QUOTE_ERROR'|
  'BLOCK_CHANGED'|'MODELED_REJECT'|'MODELED_CANDIDATE';
export type MarketProof = {
 status: MarketProofStatus; readOnly: true; executionAuthorized: false;
 atomicSimulation: 'NOT_RUN'; realizedNetUsdc: null;
 blockNumber: string; blockHash: string; reason: string;
 firstPoolState?: PoolStateResult['status']; secondPoolState?: PoolStateResult['status'];
 quote?: {sizeUsdc:string;wethReceivedWei:string;finalUsdcMicros:string;
 grossProfitMicros:string;estimatedNetProfitMicros:string;costModelDecision:string};
};

function completeMatch(result: Reconciliation, expected: HeadRef): boolean {
 return result.verdict==='MATCHED_UNSAFE'&&
   result.observed?.number===expected.number &&
   result.observed?.hash===expected.hash.toLowerCase() &&
   result.observed?.parentHash===expected.parentHash.toLowerCase();
}

export async function proveReadOnlyMarket(args:{
  observed: HeadRef; buyPool: ExactPoolMatch; sellPool: ExactPoolMatch; sizeUsdc: string;
  costs: {gasPriceWei: bigint; ethPriceUsdcMicros: bigint; flashLoanPremiumBps: bigint};
}, deps: MarketProofDeps): Promise<MarketProof> {
 const {observed,buyPool,sellPool,costs}=args;
 const base={
  readOnly:true as const,executionAuthorized:false as const,atomicSimulation:'NOT_RUN' as const,
  realizedNetUsdc:null,blockNumber:observed.number,blockHash:observed.hash,
 };
 const fail=(status:MarketProofStatus,reason:string,additional:Partial<MarketProof>={}): MarketProof =>
   ({...base,status,reason,...additional});
 let blockNumber:bigint, size:bigint;
 try {
  blockNumber=BigInt(observed.number);
  size=parseUnits(args.sizeUsdc,TOKENS.USDC.decimals);
  if(blockNumber<=0n||size<=0n||!/^0x[0-9a-fA-F]{64}$/.test(observed.hash)||
    !/^0x[0-9a-fA-F]{64}$/.test(observed.parentHash)||
    buyPool.dex===sellPool.dex ||
    getAddress(buyPool.pairAddress)===getAddress(sellPool.pairAddress) ||
    costs.gasPriceWei<=0n||costs.ethPriceUsdcMicros<=0n||costs.flashLoanPremiumBps<0n||
    costs.flashLoanPremiumBps>10_000n)throw Error('Invalid pool route, block or cost inputs');
 } catch {return fail('INVALID_INPUT','Route, trade size, block or model costs invalid');}
 try {
  if(!completeMatch(await deps.reconcile(observed),observed))
   return fail('BLOCK_UNVERIFIED','Two-source block identity could not be verified before quoting');
  const [first,second]=await Promise.all([
   deps.inspect(buyPool,blockNumber),deps.inspect(sellPool,blockNumber),
  ]);
  const stateData={firstPoolState:first.status,secondPoolState:second.status};
  const expected=(pool:ExactPoolMatch,state:PoolStateResult)=>
    state.status==='VALID_POOL_STATE_UNFINALIZED'&&state.blockNumber===observed.number&&
    state.pool.toLowerCase()===pool.pairAddress.toLowerCase()&&
    state.dex===pool.dex&&state.executionAuthorized===false;
  if(!expected(buyPool,first)||!expected(sellPool,second))
   return fail('POOL_REJECTED','Missing, unsupported, stale or mismatched exact pool state',stateData);
  // Read existing approved quote adapters only; no on-chain transaction.
  const weth=await deps.quote(buyPool,TOKENS.USDC.address,TOKENS.WETH.address,size,blockNumber);
  if(weth<=0n)throw Error('Invalid first-leg output');
  const final=await deps.quote(sellPool,TOKENS.WETH.address,TOKENS.USDC.address,weth,blockNumber);
  if(final<=0n)throw Error('Invalid second-leg output');
  if(!completeMatch(await deps.reconcile(observed),observed))
   return fail('BLOCK_CHANGED','Pinned block hash no longer agrees with both RPCs',stateData);
  const evaluation=evaluateOpportunity({
    startUsdc:size,grossProfitUsdc:final-size,
    gasPriceWei:costs.gasPriceWei,ethPriceUsdcMicros:costs.ethPriceUsdcMicros,
    policy:{...PROFIT_POLICY,flashLoanPremiumBps:costs.flashLoanPremiumBps},
  });
  return {...base,...stateData,
   status:evaluation.decision==='CANDIDATE'?'MODELED_CANDIDATE':'MODELED_REJECT',
   reason:'Pinned-block quote and policy-reserve estimate only; no atomic simulation or actual execution',
   quote:{
    sizeUsdc:args.sizeUsdc,wethReceivedWei:weth.toString(),
    finalUsdcMicros:final.toString(),grossProfitMicros:(final-size).toString(),
    estimatedNetProfitMicros:evaluation.estimatedNetProfitUsdc.toString(),
    costModelDecision:evaluation.decision,
   },
  };
 }catch{
  return fail('QUOTE_ERROR','RPC, pool verification or quote failed; no candidate may be reported');
 }
}
