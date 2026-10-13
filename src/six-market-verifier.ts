import { getAddress, isAddress, formatUnits, parseUnits } from 'viem';
import { client, quoteMatrix } from './quotes.js';
import { TOKENS, TRADE_SIZES_USDC, PROFIT_POLICY, CONTRACTS } from './config.js';
import { aaveV3PoolAbi } from './abis.js';
import { normalizeScoutDex, resolveExactPool, quoteDex } from './scout-verifier.js';
import { evaluateOpportunity } from './profit.js';
// @ts-ignore dashboard JS discovery module is covered by its own Node test suite
import { scanSixMarkets } from '../dashboard/lib/market-watch.js';

const AERO = getAddress('0x940181a94a35a4569e4529a3cdfb74e38fd98631');
const SUPPORTED = {
  'WETH/USDC': { token:TOKENS.WETH.address, decimals:18 },
  'AERO/USDC': { token:AERO, decimals:18 },
} as const;
export type MarketKey = keyof typeof SUPPORTED;
export type MarketLead = {
  buyDex:string;sellDex:string;buyPool:string;sellPool:string;indicatedSpreadBps:number;status:string;
};
export function supportedMarket(key:string): key is MarketKey { return key in SUPPORTED; }
export function chooseLeads(market:{topLeads?:MarketLead[];verificationLeads?:MarketLead[]},count=4):MarketLead[]{
  const leads=market.verificationLeads ?? market.topLeads ?? [];
  return leads.filter(l=>l.status==='SHORTLIST')
    .sort((a,b)=>Number(Boolean(normalizeScoutDex(b.buyDex)&&normalizeScoutDex(b.sellDex)))-
                 Number(Boolean(normalizeScoutDex(a.buyDex)&&normalizeScoutDex(a.sellDex))) ||
                 b.indicatedSpreadBps-a.indicatedSpreadBps)
    .slice(0,Math.max(0,count));
}

// Only on-chain quoted routes can be ordered by modeled USDC profitability.
export function rankQuoteResults<T extends {
  status:string;bestEstimatedNetUsdc?:string;indicatedSpreadBps?:number
}>(results:readonly T[]):T[]{
  const net=(r:T)=>{
    if(r.status!=='QUOTE_CANDIDATE'&&r.status!=='QUOTE_REJECT')return null;
    const value=Number(r.bestEstimatedNetUsdc);
    return r.bestEstimatedNetUsdc!==undefined&&Number.isFinite(value)?value:null;
  };
  return [...results].sort((a,b)=>{
    const aNet=net(a),bNet=net(b);
    if(aNet!==null&&bNet!==null)return bNet-aNet;
    if(aNet!==null)return -1;
    if(bNet!==null)return 1;
    return 0;
  });
}
export type QuoteDeps = {
  match: typeof resolveExactPool;
  quote: typeof quoteDex;
};
export type SharedCosts={gasPriceWei:bigint;premiumBps:bigint;ethPriceUsdcMicros:bigint};
export async function verifyMarketLead(market:string,lead:MarketLead,blockNumber:bigint,shared:SharedCosts,
  deps:QuoteDeps={match:resolveExactPool,quote:quoteDex}) {
  const base={market,indicatedSpreadBps:lead.indicatedSpreadBps,blockNumber:blockNumber.toString(),
    buyDex:lead.buyDex,sellDex:lead.sellDex,buyPool:lead.buyPool,sellPool:lead.sellPool,
    readOnly:true,executionAuthorized:false,atomicSimulation:'NOT_RUN' as const};
  if(!supportedMarket(market))return {...base,status:'UNSUPPORTED_MARKET',reason:'This market needs an additional quote-currency adapter.'};
  const buy=normalizeScoutDex(lead.buyDex),sell=normalizeScoutDex(lead.sellDex);
  if(!buy||!sell)return {...base,status:'UNSUPPORTED_DEX',reason:'At least one exchange has no approved on-chain adapter.'};
  if(!isAddress(lead.buyPool,{strict:false})||!isAddress(lead.sellPool,{strict:false}))
    return {...base,status:'INVALID_POOL_ADDRESS',reason:'Pool identifier is not a 20-byte EVM address; no quote attempted.'};
  try{
    const [first,second]=await Promise.all([
      deps.match(buy,lead.buyPool,blockNumber,SUPPORTED[market].token,TOKENS.USDC.address),
      deps.match(sell,lead.sellPool,blockNumber,SUPPORTED[market].token,TOKENS.USDC.address),
    ]);
    if(!first||!second)return {...base,status:'UNSUPPORTED_POOL_VARIANT',reason:'One or both pool addresses did not match an approved on-chain factory/fee tier.'};
    if(shared.ethPriceUsdcMicros<=0n||shared.gasPriceWei<=0n)return {...base,status:'REFERENCE_UNAVAILABLE',reason:'Independent ETH/USDC reference or gas price missing.'};
    const rows=[];
    for(const size of TRADE_SIZES_USDC.slice(0,4)){
      try {
        const input=parseUnits(size,6);
        const received=await deps.quote(first,TOKENS.USDC.address,SUPPORTED[market].token,input,blockNumber);
        if(received<=0n)throw new Error('First quote returned no output');
        const final=await deps.quote(second,SUPPORTED[market].token,TOKENS.USDC.address,received,blockNumber);
        if(final<=0n)throw new Error('Second quote returned no output');
        const result=evaluateOpportunity({startUsdc:input,grossProfitUsdc:final-input,
          gasPriceWei:shared.gasPriceWei,ethPriceUsdcMicros:shared.ethPriceUsdcMicros,
          policy:{...PROFIT_POLICY,flashLoanPremiumBps:shared.premiumBps}});
        rows.push({sizeUsdc:size,finalUsdc:formatUnits(final,6),
          estimatedNetUsdc:formatUnits(result.estimatedNetProfitUsdc,6),decision:result.decision});
      }catch(error){rows.push({sizeUsdc:size,decision:'QUOTE_ERROR',reason:String(error)});}
    }
    const valid=rows.filter(r=>r.estimatedNetUsdc!==undefined);
    if(!valid.length)return {...base,status:'QUOTE_ERROR',exactPoolMatch:true,
      reason:'All requested quote sizes failed.',rows};
    const best=[...valid].sort((a,b)=>Number(b.estimatedNetUsdc)-Number(a.estimatedNetUsdc))[0]!;
    return {...base,exactPoolMatch:true,status:valid.some(r=>r.decision==='CANDIDATE')?'QUOTE_CANDIDATE':'QUOTE_REJECT',
      reason:'Pinned-block read-only round-trip quote after modeled costs; atomic simulation not run.',
      bestTradeSizeUsdc:best.sizeUsdc,bestEstimatedNetUsdc:best.estimatedNetUsdc,rows};
  }catch(error){return {...base,status:'ERROR',reason:String(error)};}
}
export async function runSixMarketVerifier(){
  const blockNumber=await client.getBlockNumber();
  const report=await scanSixMarkets() as {markets:Array<{market:string,topLeads:MarketLead[];verificationLeads?:MarketLead[]}>};
  let shared:SharedCosts={gasPriceWei:0n,premiumBps:0n,ethPriceUsdcMicros:0n};
  let referenceError='';
  try{
    const [gasPriceWei,premiumBps,quotes]=await Promise.all([
      client.getGasPrice(),
      client.readContract({address:CONTRACTS.aaveV3Pool,abi:aaveV3PoolAbi,functionName:'FLASHLOAN_PREMIUM_TOTAL',blockNumber}),
      quoteMatrix(client,['100'],blockNumber),
    ]);
    const weth=quotes.find(q=>q.wethReceived>0n)?.wethReceived;
    if(!weth)throw Error('No independent WETH/USDC reference quote');
    shared={gasPriceWei,premiumBps,ethPriceUsdcMicros:(100_000_000n*10n**18n)/weth};
  }catch(error){referenceError=String(error);}
  const results=[];
  for(const market of report.markets){
    if(!supportedMarket(market.market)){results.push({market:market.market,status:'UNSUPPORTED_MARKET',reason:'Non-USDC cost/quote adapter pending.',atomicSimulation:'NOT_RUN'});continue;}
    const leads=chooseLeads(market);
    if(!leads.length){results.push({market:market.market,status:'NO_SHORTLIST',reason:'No eligible shortlists.',atomicSimulation:'NOT_RUN'});continue;}
    for(const lead of leads)results.push(await verifyMarketLead(market.market,lead,blockNumber,shared));
  }
  const ranked=rankQuoteResults(results);
  const quoteCheckedCount=ranked.filter(r=>r.status==='QUOTE_REJECT'||r.status==='QUOTE_CANDIDATE').length;
  const quoteCandidateCount=ranked.filter(r=>r.status==='QUOTE_CANDIDATE').length;
  return {version:2,generatedAt:new Date().toISOString(),pinnedBlock:blockNumber.toString(),
    readOnly:true,executionAuthorized:false,referenceError,results:ranked,
    quoteCheckedCount,quoteCandidateCount,
    note:'Ranked by on-chain quote net USDC where available. Unsupported is NOT a loss. Atomic simulation not run.'};
}
