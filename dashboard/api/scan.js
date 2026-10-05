import {
  createPublicClient,
  fallback,
  formatUnits,
  http,
  parseUnits,
} from 'viem';
import { base } from 'viem/chains';

const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43';
const AERODROME_FACTORY = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';
const UNISWAP_QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const AAVE_POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';

const SIZES = ['100','250','500','1000','2500','5000','10000'];
const FEES = [100,500,3000,10000];
const GAS_RESERVE_UNITS = 800000n;
const L1_DATA_FEE_RESERVE_USDC = parseUnits('0.05', 6);
const SLIPPAGE_RESERVE_BPS = 10n;
const MEV_RESERVE_BPS = 10n;
const MIN_NET_USDC = parseUnits('1', 6);

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://base-rpc.publicnode.com', { timeout: 12000, retryCount: 0 }),
    http('https://public.1rpc.io/base', { timeout: 12000, retryCount: 0 }),
    http('https://mainnet.base.org', { timeout: 12000, retryCount: 0 }),
  ], { rank: false }),
});

const aerodromeAbi=[{
  type:'function',name:'getAmountsOut',stateMutability:'view',
  inputs:[
    {name:'amountIn',type:'uint256'},
    {name:'routes',type:'tuple[]',components:[
      {name:'from',type:'address'},{name:'to',type:'address'},
      {name:'stable',type:'bool'},{name:'factory',type:'address'}
    ]}
  ],
  outputs:[{name:'amounts',type:'uint256[]'}]
}];

const quoterAbi=[{
  type:'function',name:'quoteExactInputSingle',stateMutability:'nonpayable',
  inputs:[{name:'params',type:'tuple',components:[
    {name:'tokenIn',type:'address'},{name:'tokenOut',type:'address'},
    {name:'amountIn',type:'uint256'},{name:'fee',type:'uint24'},
    {name:'sqrtPriceLimitX96',type:'uint160'}
  ]}],
  outputs:[
    {name:'amountOut',type:'uint256'},{name:'sqrtPriceX96After',type:'uint160'},
    {name:'initializedTicksCrossed',type:'uint32'},{name:'gasEstimate',type:'uint256'}
  ]
}];

const aaveAbi=[{
  type:'function',name:'FLASHLOAN_PREMIUM_TOTAL',stateMutability:'view',
  inputs:[],outputs:[{name:'',type:'uint128'}]
}];

const bps=(amount,b)=>amount*b/10000n;
const usdc=(v)=>Number(formatUnits(v,6));

async function quoteAerodrome(tokenIn,tokenOut,amounts,blockNumber){
  const route=[{from:tokenIn,to:tokenOut,stable:false,factory:AERODROME_FACTORY}];
  const results=await client.multicall({
    blockNumber,allowFailure:true,
    contracts:amounts.map((amountIn)=>({
      address:AERODROME_ROUTER,abi:aerodromeAbi,functionName:'getAmountsOut',
      args:[amountIn,route]
    }))
  });
  return results.map((r,i)=>{
    if(r.status!=='success') throw new Error('Aerodrome quote failed at '+i);
    const out=r.result[r.result.length-1];
    if(!out) throw new Error('Aerodrome returned no output at '+i);
    return out;
  });
}

async function quoteUniswap(tokenIn,tokenOut,amounts,blockNumber){
  const out=[];
  for(const amountIn of amounts){
    const results=await client.multicall({
      blockNumber,allowFailure:true,
      contracts:FEES.map((fee)=>({
        address:UNISWAP_QUOTER,abi:quoterAbi,functionName:'quoteExactInputSingle',
        args:[{tokenIn,tokenOut,amountIn,fee,sqrtPriceLimitX96:0n}]
      }))
    });
    const candidates=[];
    results.forEach((r,i)=>{
      if(r.status==='success' && r.result[0]>0n){
        candidates.push({amountOut:r.result[0],feeTier:FEES[i]});
      }
    });
    candidates.sort((a,b)=>a.amountOut>b.amountOut?-1:a.amountOut<b.amountOut?1:0);
    if(!candidates[0]) throw new Error('No Uniswap quote available');
    out.push(candidates[0]);
  }
  return out;
}

export default async function handler(req,res){
  try{
    const blockNumber=await client.getBlockNumber();
    const [gasPrice,flashBps]=await Promise.all([
      client.getGasPrice(),
      client.readContract({
        address:AAVE_POOL,abi:aaveAbi,functionName:'FLASHLOAN_PREMIUM_TOTAL',blockNumber
      })
    ]);

    const starts=SIZES.map((s)=>parseUnits(s,6));
    const aeroFirst=await quoteAerodrome(USDC,WETH,starts,blockNumber);
    const uniFirst=await quoteUniswap(USDC,WETH,starts,blockNumber);
    const uniSecond=await quoteUniswap(WETH,USDC,aeroFirst,blockNumber);
    const aeroSecond=await quoteAerodrome(WETH,USDC,uniFirst.map(q=>q.amountOut),blockNumber);

    const wethReferencePrice=Number(SIZES[0])/Number(formatUnits(uniFirst[0].amountOut,18));
    const ethMicros=BigInt(Math.round(wethReferencePrice*1_000_000));
    const gasReserve=(gasPrice*GAS_RESERVE_UNITS*ethMicros)/1_000_000_000_000_000_000n;

    const rows=[];
    for(let i=0;i<SIZES.length;i++){
      const start=starts[i];
      const routes=[
        {route:'Aerodrome → Uniswap v3',final:uniSecond[i].amountOut,feeTier:uniSecond[i].feeTier},
        {route:'Uniswap v3 → Aerodrome',final:aeroSecond[i],feeTier:uniFirst[i].feeTier},
      ];
      for(const x of routes){
        const gross=x.final-start;
        const flashFee=bps(start,flashBps);
        const slippageReserve=bps(start,SLIPPAGE_RESERVE_BPS);
        const mevReserve=bps(start,MEV_RESERVE_BPS);
        const totalModeledCosts=flashFee+gasReserve+L1_DATA_FEE_RESERVE_USDC+slippageReserve+mevReserve;
        const net=gross-totalModeledCosts;
        let decision='CANDIDATE';
        if(gross<=0n) decision='REJECT_RAW_LOSS';
        else if(gross-flashFee<=0n) decision='REJECT_FLASH_FEE';
        else if(net<=0n) decision='REJECT_COSTS';
        else if(net<MIN_NET_USDC) decision='REJECT_MIN_PROFIT';

        rows.push({
          route:x.route,
          startUsdc:Number(SIZES[i]),
          finalUsdc:usdc(x.final),
          grossDeltaUsdc:usdc(gross),
          flashLoanFeeUsdc:usdc(flashFee),
          l2GasReserveUsdc:usdc(gasReserve),
          l1DataFeeReserveUsdc:usdc(L1_DATA_FEE_RESERVE_USDC),
          slippageReserveUsdc:usdc(slippageReserve),
          mevReserveUsdc:usdc(mevReserve),
          totalModeledCostsUsdc:usdc(totalModeledCosts),
          estimatedNetUsdc:usdc(net),
          decision,
          uniswapFeeTier:x.feeTier,
        });
      }
    }

    const candidateCount=rows.filter(r=>r.decision==='CANDIDATE').length;
    const best=[...rows].sort((a,b)=>b.estimatedNetUsdc-a.estimatedNetUsdc)[0];

    res.setHeader('Cache-Control','no-store, max-age=0');
    res.status(200).json({
      ok:true,readOnly:true,generatedAt:new Date().toISOString(),
      blockNumber:blockNumber.toString(),
      gasPriceGwei:Number(gasPrice)/1e9,
      flashLoanPremiumBps:Number(flashBps),
      wethReferencePrice,
      matrixComplete:rows.length,
      candidateCount,best,rows
    });
  }catch(error){
    res.setHeader('Cache-Control','no-store, max-age=0');
    res.status(500).json({
      ok:false,readOnly:true,generatedAt:new Date().toISOString(),
      error:error instanceof Error?error.message:String(error)
    });
  }
}
