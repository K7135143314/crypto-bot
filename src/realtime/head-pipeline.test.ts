import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceWriter } from './head-evidence.js';
import { ReadOnlyHeadPipeline } from './head-pipeline.js';
const h=(v:string)=>'0x'+v.repeat(64);
const head=(n:number,hash:string,parent:string)=>({jsonrpc:'2.0',method:'eth_subscription',params:{subscription:'0xabc',result:{number:'0x'+n.toString(16),hash:h(hash),parentHash:h(parent)}}});
test('records verified, duplicate-skipped, and unsafe gap outcomes without trading',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'headpipe-'));
 try{
  const writer=await EvidenceWriter.open(join(dir,'events.jsonl'));
  let checks=0;
  const verifier=async()=>{checks++;return {verdict:'MATCHED_UNSAFE' as const,observed:{number:'10',hash:h('a'),parentHash:h('b')},providerCount:2,checkedProviders:2,usableForTrading:false as const,reason:'independent match'}};
  const p=new ReadOnlyHeadPipeline(writer,[{name:'A',url:'https://a.example'},{name:'B',url:'https://b.example'}],verifier);
  p.ingest({jsonrpc:'2.0',id:1,result:'0x2105'});
  p.ingest({jsonrpc:'2.0',id:2,result:'0xabc'});
  p.ingest(head(10,'a','b'),1000);
  p.ingest(head(10,'a','b'),1100);
  p.ingest(head(12,'c','b'),1200);
  await p.drain();
  assert.equal(checks,1);assert.equal(writer.count,2);
  assert.equal(p.snapshot().executionAuthorized,false);
  assert.equal(p.snapshot().processed,2);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('overload stops the pipeline rather than silently dropping events',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'headpipe-'));
 try{
 const w=await EvidenceWriter.open(join(dir,'events.jsonl'));
 const p=new ReadOnlyHeadPipeline(w,[{name:'A',url:'https://a.example'},{name:'B',url:'https://b.example'}],async()=>({
 verdict:'RPC_UNAVAILABLE' as const,observed:null,providerCount:2,checkedProviders:0,usableForTrading:false as const,reason:'missing'
 }),1);
 p.ingest({jsonrpc:'2.0',id:1,result:'0x2105'});
 p.ingest({jsonrpc:'2.0',id:2,result:'0xabc'});
 p.ingest(head(10,'a','b'),1000);
 assert.throws(()=>p.ingest(head(11,'c','a'),1200),/overflow/);
 await p.drain();
 assert.equal(p.snapshot().stopped,true);
 }finally{await rm(dir,{recursive:true,force:true})}
});
