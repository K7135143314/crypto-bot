import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyObservedHead } from './head-rpc.js';
const h=(d:string)=>'0x'+d.repeat(64);
const header={number:'16',hash:h('a'),parentHash:h('b')};
test('looks up exact hex block using separate sources and returns nontradable match',async()=>{
 const calls:string[]=[];
 const mock=(async(url:string|URL|Request,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body));calls.push(body.method+':'+JSON.stringify(body.params));
  const result=body.method==='eth_chainId'?'0x2105':
   {number:'0x10',hash:header.hash,parentHash:header.parentHash};
  return {ok:true,json:async()=>({jsonrpc:'2.0',id:body.id,result})} as Response;
 }) as typeof fetch;
 const r=await verifyObservedHead(header,[{name:'A',url:'https://rpc-a.example'},{name:'B',url:'https://rpc-b.example'}],mock);
 assert.equal(r.verdict,'MATCHED_UNSAFE');assert.equal(r.usableForTrading,false);
 assert.equal(calls.filter(v=>v.includes('eth_getBlockByNumber')).every(x=>x.includes('0x10')),true);
});
test('RPC failure remains unavailable, not a confirmed match',async()=>{
 const mock=(async()=>{throw Error('no service')}) as typeof fetch;
 const r=await verifyObservedHead(header,[{name:'A',url:'https://rpc-a.example'},{name:'B',url:'https://rpc-b.example'}],mock);
 assert.equal(r.verdict,'RPC_UNAVAILABLE');
});
