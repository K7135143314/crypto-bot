import assert from 'node:assert/strict';
import test from 'node:test';
import { BaseFlashblocksSession } from './base-flashblocks-session.js';
const id='0x'+'a'.repeat(64);
const msg=(index:number,payload=id,block='0x31')=>({jsonrpc:'2.0',method:'eth_subscription',params:{subscription:'0x123',result:{payload_id:payload,index,...(index===0?{base:{block_number:block}}:{}),diff:{transactions:[]}}}});
const handshake=(s:BaseFlashblocksSession)=>{
 assert.equal(s.ingest({jsonrpc:'2.0',id:1,result:'0x2105'}).kind,'CHAIN_OK');
 assert.equal(s.ingest({jsonrpc:'2.0',id:2,result:'0x123'}).kind,'SUBSCRIBED');
};
test('chain and subscription identity are required',()=>{
 const s=new BaseFlashblocksSession();
 assert.equal(s.ingest(msg(0)).kind,'IGNORED');
 assert.equal(s.ingest({jsonrpc:'2.0',id:1,result:'0x1'}).kind,'FATAL');
 handshake(s);
 assert.equal(s.ingest({...msg(0),params:{...msg(0).params,subscription:'0xBAD'}}).kind,'IGNORED');
 assert.equal(s.ingest(msg(0),1000).kind,'FRAME');
});
test('sequence gaps and malformed frames never produce usable market state',()=>{
 const s=new BaseFlashblocksSession();handshake(s);
 const first=s.ingest(msg(0),1000);assert.equal(first.kind,'FRAME');
 if(first.kind==='FRAME')assert.equal(first.observation.usableForResearch,true);
 const gap=s.ingest(msg(2),1200);assert.equal(gap.kind,'FRAME');
 if(gap.kind==='FRAME')assert.equal(gap.observation.usableForResearch,false);
 const wrong=s.ingest(msg(3),1400);if(wrong.kind==='FRAME') assert.equal(wrong.observation.usableForResearch,false);
 assert.equal(s.ingest({...msg(0),params:{subscription:'0x123',result:{payload_id:id,index:0}}}).kind,'IGNORED');
 const stale=s.ingest(msg(1),1600);if(stale.kind==='FRAME')assert.equal(stale.observation.usableForResearch,false);
 const next=s.ingest(msg(0,'0x'+'b'.repeat(64),'0x32'),1800);assert.equal(next.kind,'FRAME');
 if(next.kind==='FRAME')assert.equal(next.observation.usableForResearch,true);
});
test('reconnection requires full chain and subscription reauthentication',()=>{
 const s=new BaseFlashblocksSession();handshake(s);s.ingest(msg(0),1000);s.reset();
 assert.equal(s.ready,false);assert.equal(s.ingest(msg(0),1200).kind,'IGNORED');
 handshake(s);assert.equal(s.ingest(msg(0),1400).kind,'FRAME');
});
