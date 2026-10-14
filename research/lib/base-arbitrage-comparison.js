// V1.8: comparison of exported, untrusted Dune candidate rows against
// our own historically saved read-only scanner pool addresses.
// Never labels an arbitrage as net profitable or a route as executable.
export const BASE_USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
export const SUPPORTED_BASE_TOKENS=Object.freeze({
  '0x4200000000000000000000000000000000000006':'WETH/USDC',
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631':'AERO/USDC',
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf':'cbBTC/USDC',
});
const ADDRESS=/^0x[0-9a-f]{40}$/;
const TX_HASH=/^0x[0-9a-f]{64}$/;
const normalize=(value)=>String(value??'').trim().toLowerCase();
const validTime=(value)=>{
  if(typeof value!=='string')return null;
  const v=value.trim().replace(' ','T');
  const time=Date.parse(/[Zz]|[+-]\d\d:\d\d$/.test(v)?v:v+'Z');
  return Number.isFinite(time)?time:null;
};
const isVerifiedQuote=(r)=>r && r.exactPoolMatch===true &&
  (r.status==='QUOTE_REJECT'||r.status==='QUOTE_CANDIDATE') &&
  ADDRESS.test(normalize(r.buyPool)) && ADDRESS.test(normalize(r.sellPool));
const approvedDex=(v)=>['uniswap','uniswap-v3','aerodrome'].includes(normalize(v));
const fixed=(v)=>Number.isFinite(Number(v)) && v!==null && v!==undefined &&
  String(v).trim()!==''?Number(v):null;
export function compareBaseArbitrageCandidates(dataset,scannerHistory,now=Date.now()){
  if(!Number.isFinite(now))throw Error('Invalid time');
  const rows=Array.isArray(dataset?.rows)?dataset.rows:[];
  const watermark=validTime(dataset?.executedAt);
  const windowStart=now-7*24*3600000;
  const historyRuns=Array.isArray(scannerHistory?.runs)?scannerHistory.runs:[];
  // Evidence must predate the historic transaction; future runs cannot count.\n  const findings=[];
  for(const r of rows.slice(0,250)){
    const txHash=normalize(r?.tx_hash);
    const ts=validTime(r?.block_time_utc??r?.block_time);
    if(!TX_HASH.test(txHash)||ts===null||ts<windowStart||ts>now) {
      findings.push({txHash:TX_HASH.test(txHash)?txHash:null,
        classification:'INVALID_OR_OUT_OF_WINDOW',evidenceGrade:'NOT_VERIFIED'});
      continue;
    }
    const firstDex=normalize(r.first_dex),secondDex=normalize(r.second_dex);
    const firstPool=normalize(r.first_contract_hint),secondPool=normalize(r.second_contract_hint);
    const middle=normalize(r.intermediate_token);
    const market=SUPPORTED_BASE_TOKENS[middle]||null;
    // The SQL contract-address fields are HINTS: historic exact ownership at
    // transaction block and actual token balances still require receipt proof.
    const pairKey=[market,firstDex,secondDex,firstPool,secondPool].join('|');
    let classification='POOL_IDENTIFICATION_REQUIRED';
    if(!market)classification='MARKET_UNSUPPORTED';
    else if(!approvedDex(firstDex)||!approvedDex(secondDex))classification='DEX_UNSUPPORTED';
    else if(!ADDRESS.test(firstPool)||!ADDRESS.test(secondPool))classification='POOL_HINTS_MISSING';
    else {\n      const eligible=historyRuns.filter(run => run?.readOnly===true &&\n        run?.executionAuthorized===false && Array.isArray(run.results) &&\n        validTime(run.generatedAt)!==null && validTime(run.generatedAt)<=ts &&\n        ts-validTime(run.generatedAt)<=2*3600000);\n      if(eligible.some(run=>run.results.some(q=>isVerifiedQuote(q) &&\n        [q.market,normalize(q.buyDex),normalize(q.sellDex),\n          normalize(q.buyPool),normalize(q.sellPool)].join('|')===pairKey)))\n        classification='SAME_POOLS_SEEN_IN_PRIOR_SCANNER';\n      else classification='NO_PRIOR_SCANNER_MATCH';\n    }
    const gross=fixed(r.gross_delta_usdc);
    const feeEth=fixed(r.modeled_tx_fee_eth);
    findings.push({txHash,blockTimeUtc:new Date(ts).toISOString(),market,
      firstDex,secondDex,firstPoolHint:ADDRESS.test(firstPool)?firstPool:null,
      secondPoolHint:ADDRESS.test(secondPool)?secondPool:null,
      grossDeltaUsdc:gross,reportedFeeEth:feeEth,
      classification,evidenceGrade:'GROSS_CANDIDATE_ONLY',
      netProfitUsdc:null,executionSimulated:false,executionAuthorized:false,
      warning:'DEX swaps alone do not prove transaction ownership, net cash flow, fee-adjusted profit, or future opportunity.'});
  }
  const queryProvenance=typeof dataset?.queryId==='string'&&/^\d+$/.test(dataset.queryId) &&
    watermark!==null && watermark<=now && watermark>=windowStart;
  return {version:1,readOnly:true,executionAuthorized:false,
    dataSource:'DUNE_EXPORT_UNTRUSTED',queryProvenanceVerified:false,
    exportMetadataPresent:queryProvenance,
    analysisAt:new Date(now).toISOString(),
    rowsReceived:rows.length,rowsAnalyzed:findings.length,
    actualNetProfitsConfirmed:0,
    scannerPoolAddressMatches:findings.filter(x=>x.classification==='SAME_POOLS_SEEN_IN_PRIOR_SCANNER').length,
    findings,
    note:'Only scanner observations within two hours BEFORE historic transactions can match; matching is pool-coverage evidence, never proof of opportunity timing. No source chain transaction receipts were verified. This report NEVER certifies historical net profit. Inputs must be independently reviewed, and pool identity verified at the historical block.',
  };
}
