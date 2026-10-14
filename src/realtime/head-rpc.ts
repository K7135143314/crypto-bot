import { reconcileHead, type ProviderRead, type Reconciliation } from './head-reconcile.js';
export type RpcSource={name:string;url:string};
export async function verifyObservedHead(
 observed:unknown,sources:readonly RpcSource[],
 fetcher:typeof fetch=fetch,
):Promise<Reconciliation>{
 if(sources.length<2||new Set(sources.map(x=>x.name)).size!==sources.length)
  return reconcileHead(observed,[]);
 if(sources.some(s=>{
  try{const u=new URL(s.url);return u.protocol!=='https:'||!!u.username||!!u.password}
  catch{return true}
 }))return reconcileHead(observed,[]);
 const input=observed as {number?:unknown}|null;
 const number=typeof input?.number==='string'?input.number:null;
 // Observer emits decimal while Base RPC requires a hexadecimal quantity.
 // Lookup is limited to the exact observed block, never 'latest'.
 if(!number|| !(/^(0x[0-9a-fA-F]+|[1-9][0-9]*)$/.test(number)))return reconcileHead(observed,[]);
 const blockTag='0x'+BigInt(number).toString(16);
 const reads:ProviderRead[]=await Promise.all(sources.map(async source=>{
  try{
   const request=async(id:number,method:string,params:unknown[])=>{
    const response=await fetcher(source.url,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('RPC HTTP error');
    const json=await response.json() as Record<string,unknown>;
    if(json.error||json.id!==id||json.jsonrpc!=='2.0')throw Error('RPC invalid response');
    return json.result;
   };
   const chainId=await request(1,'eth_chainId',[]);
   if(chainId!=='0x2105')return {source:source.name,chainId,block:null};
   const block=await request(2,'eth_getBlockByNumber',[blockTag,false]);
   return {source:source.name,chainId,block};
  }catch{return {source:source.name,chainId:'0x2105',block:null,error:'RPC lookup failed'}}
 }));
 return reconcileHead(observed,reads);
}
