import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectPoolState, type PoolRead } from './pool-state.js';
import { TOKENS } from './config.js';
const pool=('0x'+'a'.repeat(40)) as `0x${string}`;
const base={dex:'aerodrome',pool,blockNumber:123n};
const match=async()=>({dex:'aerodrome' as const,pairAddress:pool,variant:'AERODROME_CLASSIC' as const,stable:false});
const read:PoolRead=async(_p,_abi,name)=>name==='token0'?TOKENS.USDC.address:name==='token1'?TOKENS.WETH.address:[100000n,200000n,5n];
test('validates exact Classic pool token identity and nonzero pinned reserves',async()=>{
 const result=await inspectPoolState({...base,match,read});
 assert.equal(result.status,'VALID_POOL_STATE_UNFINALIZED');
 assert.deepEqual(result.state?.reserves,['100000','200000']);
 assert.equal(result.executionAuthorized,false);
});
test('fails closed for wrong pair, missing pool and zero liquidity',async()=>{
 const bad=await inspectPoolState({...base,match,read:async(_p,_a,name)=>name==='token0'?TOKENS.USDC.address:name==='token1'?pool:[1n,2n,0n]});
 assert.equal(bad.status,'WRONG_TOKENS');
 assert.equal((await inspectPoolState({...base,match:async()=>null,read})).status,'POOL_UNVERIFIED');
 assert.equal((await inspectPoolState({...base,match,read:async(_p,_a,name)=>name==='token0'?TOKENS.USDC.address:name==='token1'?TOKENS.WETH.address:[0n,2n,0n]})).status,'NO_LIQUIDITY');
});
test('Uniswap V3 must have factory fee, active liquidity and valid price',async()=>{
 const uni={...base,dex:'uniswap'};
 const uniMatch=async()=>({dex:'uniswap' as const,pairAddress:pool,feeTier:500});
 const reader:PoolRead=async(_p,_abi,name)=>name==='token0'?TOKENS.USDC.address:name==='token1'?TOKENS.WETH.address:
   name==='liquidity'?1000n:[2n**96n,0,0,0,0,0,true];
 const ok=await inspectPoolState({...uni,match:uniMatch,read:reader});
 assert.equal(ok.status,'VALID_POOL_STATE_UNFINALIZED');
 assert.equal(ok.state?.activeLiquidity,'1000');
 const zero=await inspectPoolState({...uni,match:uniMatch,read:async(p,a,n,b)=>n==='liquidity'?0n:reader(p,a,n,b)});
 assert.equal(zero.status,'NO_LIQUIDITY');
});
