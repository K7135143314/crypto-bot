import assert from 'node:assert/strict';
import test from 'node:test';
import { BaseHeadsSession } from './base-heads-session.js';
const hash=(x:string)=>'0x'+x.repeat(64);
const init=(s:BaseHeadsSession)=>{
 assert.equal(s.ingest({jsonrpc:'2.0',id:1,result:'0x2105'}).kind,'CHAIN_OK');
 assert.equal(s.ingest({jsonrpc:'2.0',id:2,result:'0xabc'}).kind,'SUBSCRIBED');
};
const head=(n:number,h:string,p:string)=>({jsonrpc:'2.0',method:'eth_subscription',params:{
 subscription:'0xabc',result:{number:'0x'+n.toString(16),hash:hash(h),parentHash:hash(p)}}});
test('rejects wrong chain and subscription while preserving disabled trading',()=>{
 const s=new BaseHeadsSession();
 assert.equal(s.ingest(head(1,'a','0')).kind,'IGNORED');
 assert.equal(s.ingest({jsonrpc:'2.0',id:1,result:'0x1'}).kind,'FATAL');
 init(s);
 const v=s.ingest(head(10,'a','0'),1000);
 assert.equal(v.kind,'HEAD');
 if(v.kind==='HEAD'){assert.equal(v.status,'ACCEPTED_UNVERIFIED');assert.equal(v.usableForTrading,false);}
 assert.equal(s.snapshot().canonicalVerified,false);
});
test('detects duplicates, gaps, parent discontinuity and refuses automatic trust restoration',()=>{
 const s=new BaseHeadsSession();init(s);
 s.ingest(head(10,'a','0'),1000);
 const du=s.ingest(head(10,'a','0'),1200);
 if(du.kind==='HEAD')assert.equal(du.status,'DUPLICATE');
 const gap=s.ingest(head(12,'c','b'),1400);
 if(gap.kind==='HEAD')assert.equal(gap.status,'GAP');
 const rest=s.ingest(head(13,'d','c'),1600);
 if(rest.kind==='HEAD')assert.equal(rest.status,'UNTRUSTED');
 assert.equal(s.snapshot().trustedSequence,false);
 const reorg=s.ingest(head(14,'e','0'),1800);
 if(reorg.kind==='HEAD')assert.equal(reorg.status,'REORG_WARNING');
});
test('bad payload invalidates sequence, reconnect resets subscription',()=>{
 const s=new BaseHeadsSession();init(s);
 s.ingest(head(10,'a','0'),1000);
 const bad=s.ingest(head(11,'b','bad'),1200);
 if(bad.kind==='HEAD')assert.equal(bad.status,'INVALID');
 s.reset(); assert.equal(s.ready,false);
 assert.equal(s.ingest(head(11,'b','a')).kind,'IGNORED');
});
