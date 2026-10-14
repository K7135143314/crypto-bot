/**
 * Read-only comparison of one observed Base head against independent RPC responses.
 * Agreement between two RPC services is *not* consensus finality.
 */
export type HeadRef={number:string;hash:string;parentHash:string};
export type Verdict='MATCHED_UNSAFE'|'OBSERVED_MISMATCH'|'PROVIDER_DISAGREEMENT'|
  'RPC_UNAVAILABLE'|'INVALID_INPUT'|'WRONG_CHAIN';
export type ProviderRead={source:string;chainId:unknown;block:unknown;error?:string};
export type Reconciliation={verdict:Verdict;observed:HeadRef|null;
  providerCount:number;checkedProviders:number;usableForTrading:false;reason:string};
const hash=(x:unknown):x is string=>typeof x==='string'&&/^0x[0-9a-fA-F]{64}$/.test(x);
function numberValue(x:unknown):bigint|null{
 if(typeof x==='bigint')return x>=0n?x:null;
 if(typeof x==='string'&&/^(0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)|(?:0|[1-9][0-9]*))$/.test(x)){
  try{return BigInt(x)}catch{return null}
 }return null;
}
export function normalizeHead(input:unknown):HeadRef|null{
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const x=input as Record<string,unknown>;
 const num=numberValue(x.number);
 if(num===null||num===0n||!hash(x.hash)||!hash(x.parentHash))return null;
 return {number:num.toString(),hash:x.hash.toLowerCase(),parentHash:x.parentHash.toLowerCase()};
}
const same=(a:HeadRef,b:HeadRef)=>a.number===b.number&&a.hash===b.hash&&a.parentHash===b.parentHash;
export function reconcileHead(observedInput:unknown,reads:readonly ProviderRead[]):Reconciliation{
 const observed=normalizeHead(observedInput);
 const base={observed,providerCount:reads.length,checkedProviders:0,usableForTrading:false as const};
 if(!observed||reads.length<2||new Set(reads.map(r=>r.source)).size!==reads.length||
 reads.some(r=>typeof r.source!=='string'||!r.source.trim()))
  return {...base,verdict:'INVALID_INPUT',reason:'Valid head and at least two distinct configured sources required'};
 // A transport failure is not evidence of the wrong chain. Never fabricate
 // a successful chain ID when RPC could not be reached.
 const explicitWrong=reads.some(r=>!r.error&&numberValue(r.chainId)!==null&&numberValue(r.chainId)!==8453n);
 if(explicitWrong)return {...base,verdict:'WRONG_CHAIN',reason:'A reachable RPC explicitly reported a non-Base chain ID'};
 const normalized=reads.map(r=>r.error||numberValue(r.chainId)!==8453n?null:normalizeHead(r.block));
 const checkedProviders=normalized.filter(v=>v!==null).length;
 if(checkedProviders!==reads.length)return {...base,checkedProviders,verdict:'RPC_UNAVAILABLE',reason:'Missing, malformed, failed, or chain-unverified provider response'};
 const rows=normalized as HeadRef[];
 if(!rows.every(r=>same(r,rows[0]!)))
  return {...base,checkedProviders,verdict:'PROVIDER_DISAGREEMENT',reason:'Provider block identities disagree'};
 if(!same(observed,rows[0]!))
  return {...base,checkedProviders,verdict:'OBSERVED_MISMATCH',reason:'Observed block differs from both RPC responses'};
 return {...base,checkedProviders,verdict:'MATCHED_UNSAFE',reason:'Two independent RPC responses agree with observed head; finality NOT established'};
}
