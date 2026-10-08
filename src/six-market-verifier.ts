import { getAddress, formatUnits, parseUnits } from 'viem';
import { client, quoteMatrix } from './quotes.js';
import { TOKENS, TRADE_SIZES_USDC, PROFIT_POLICY, CONTRACTS } from './config.js';
import { aaveV3PoolAbi } from './abis.js';
import { normalizeScoutDex, resolveExactPool, quoteDex } from './scout-verifier.js';
import { evaluateOpportunity } from './profit.js';
import { fetchScoutOpportunities } from './scout-verifier.js';

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
export function chooseLeads(market:{topLeads?:MarketLead[]},count=2):MarketLead[]{
  return (market.topLeads || []).filter(l=>l.status==='SHORTLIST').slice(0,count);
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
  const opportunities=await fetchScoutOpportunities();
  const report={markets:[{market:'WETH/USDC',topLeads:opportunities.map(o=>({buyDex:o.buyDex,sellDex:o.sellDex,buyPool:o.buyPairAddress,sellPool:o.sellPairAddress,indicatedSpreadBps:o.indicatedSpreadBps,status:o.status}))},{market:'AERO/USDC',topLeads:[]}]};
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
  return {version:1,generatedAt:new Date().toISOString(),pinnedBlock:blockNumber.toString(),
    readOnly:true,executionAuthorized:false,referenceError,results,
    note:'QUOTE_CANDIDATE is not atomic-simulation verified and not executable profit.'};
}
