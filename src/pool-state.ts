import { getAddress, isAddress, type Address } from 'viem';
import { TOKENS } from './config.js';
import { normalizeScoutDex, resolveExactPool, type ExactPoolMatch, type SupportedDex } from './scout-verifier.js';

const commonAbi=[
 {type:'function',name:'token0',stateMutability:'view',inputs:[],outputs:[{type:'address'}]},
 {type:'function',name:'token1',stateMutability:'view',inputs:[],outputs:[{type:'address'}]},
] as const;
const classicAbi=[{type:'function',name:'getReserves',stateMutability:'view',inputs:[],
 outputs:[{type:'uint256',name:'reserve0'},{type:'uint256',name:'reserve1'},{type:'uint256',name:'blockTimestampLast'}]}] as const;
const v3Abi=[
 {type:'function',name:'liquidity',stateMutability:'view',inputs:[],outputs:[{type:'uint128'}]},
 {type:'function',name:'slot0',stateMutability:'view',inputs:[],outputs:[
  {type:'uint160',name:'sqrtPriceX96'},{type:'int24',name:'tick'},
  {type:'uint16',name:'observationIndex'},{type:'uint16',name:'observationCardinality'},
  {type:'uint16',name:'observationCardinalityNext'},{type:'uint8',name:'feeProtocol'},
  {type:'bool',name:'unlocked'}]},
] as const;
export type PoolRead = (address:Address,abi:readonly unknown[],functionName:string,blockNumber:bigint)=>Promise<unknown>;
export type PoolStateStatus='VALID_POOL_STATE_UNFINALIZED'|'INVALID_INPUT'|'POOL_UNVERIFIED'|'WRONG_TOKENS'|'NO_LIQUIDITY'|'BAD_STATE'|'RPC_ERROR';
export type PoolStateResult={status:PoolStateStatus;dex:string;pool:string;blockNumber:string;readOnly:true;executionAuthorized:false;
 reason:string;state?:{token0:Address;token1:Address;variant:string;feeTier?:number;stable?:boolean;
 reserves?:[string,string];activeLiquidity?:string;sqrtPriceX96?:string;tick?:number}};
const addr=(x:unknown):Address|null=>typeof x==='string'&&isAddress(x,{strict:false})?getAddress(x):null;
export async function inspectPoolState(args:{
 dex:string;pool:string;blockNumber:bigint;tokenA?:Address;tokenB?:Address;
 match?:(dex:SupportedDex,pool:string,blockNumber:bigint,tokenA:Address,tokenB:Address)=>Promise<ExactPoolMatch|null>;
 read:PoolRead;
}):Promise<PoolStateResult>{
 const base={dex:args.dex,pool:args.pool,blockNumber:String(args.blockNumber),readOnly:true as const,executionAuthorized:false as const};
 const dex=normalizeScoutDex(args.dex),pool=addr(args.pool),a=addr(args.tokenA??TOKENS.WETH.address),b=addr(args.tokenB??TOKENS.USDC.address);
 if(!dex||!pool||!a||!b||a===b||args.blockNumber<=0n)
  return {...base,status:'INVALID_INPUT',reason:'Invalid DEX, pool, token pair or block'} ;
 try{
  const match=await (args.match??resolveExactPool)(dex,pool,args.blockNumber,a,b);
  if(!match||getAddress(match.pairAddress)!==pool||match.dex!==dex)
   return {...base,status:'POOL_UNVERIFIED',reason:'Pool must match approved factory at the pinned block'};
  const [token0Raw,token1Raw]=await Promise.all([
   args.read(pool,commonAbi,'token0',args.blockNumber),
   args.read(pool,commonAbi,'token1',args.blockNumber),
  ]);
  const token0=addr(token0Raw),token1=addr(token1Raw);
  if(!token0||!token1||!((token0===a&&token1===b)||(token0===b&&token1===a)))
   return {...base,status:'WRONG_TOKENS',reason:'On-chain pool token identity disagrees with requested pair'};
  const shared={token0,token1,variant:match.variant??'UNISWAP_V3',feeTier:match.feeTier,stable:match.stable};
  if(dex==='aerodrome'&&match.variant==='AERODROME_CLASSIC'){
   const result=await args.read(pool,classicAbi,'getReserves',args.blockNumber);
   if(!Array.isArray(result)||result.length<2||typeof result[0]!=='bigint'||typeof result[1]!=='bigint')
    return {...base,status:'BAD_STATE',reason:'Invalid reserve return'};
   const [r0,r1]=result;
   if(r0<=0n||r1<=0n)return {...base,status:'NO_LIQUIDITY',reason:'Zero Classic reserve'};
   return {...base,status:'VALID_POOL_STATE_UNFINALIZED',reason:'Factory, tokens and pinned reserves checked; not executable profit',
    state:{...shared,reserves:[r0.toString(),r1.toString()] as [string,string]}};
  }
  if(dex==='uniswap'&&Number.isInteger(match.feeTier)&&match.feeTier!>0){
   const [liq,slot]=await Promise.all([
    args.read(pool,v3Abi,'liquidity',args.blockNumber),
    args.read(pool,v3Abi,'slot0',args.blockNumber),
   ]);
   if(typeof liq!=='bigint'||!Array.isArray(slot)||typeof slot[0]!=='bigint'||typeof slot[1]!=='number'||
     typeof slot[6]!=='boolean'||slot[0]<=0n||slot[0]>=2n**160n||slot[1]<-887272||slot[1]>887272)
    return {...base,status:'BAD_STATE',reason:'Invalid concentrated-liquidity state'};
   if(liq<=0n||!slot[6])return {...base,status:'NO_LIQUIDITY',reason:'Zero active liquidity or locked pool'};
   return {...base,status:'VALID_POOL_STATE_UNFINALIZED',reason:'Factory, tokens, fee and pinned active liquidity checked; not executable profit',
    state:{...shared,activeLiquidity:liq.toString(),sqrtPriceX96:slot[0].toString(),tick:slot[1]}};
  }
  return {...base,status:'POOL_UNVERIFIED',reason:'Pool variant needs a separately approved state adapter'};
 }catch{return {...base,status:'RPC_ERROR',reason:'Pinned contract read or pool resolution failed'};}
}
