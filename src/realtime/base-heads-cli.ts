import { EvidenceWriter } from './head-evidence.js';
import { ReadOnlyHeadPipeline } from './head-pipeline.js';
const endpoint=process.env.BASE_HEADS_WSS;
const rpcA=process.env.BASE_VERIFY_RPC_A,rpcB=process.env.BASE_VERIFY_RPC_B;
if(!endpoint||!rpcA||!rpcB)throw Error('BASE_HEADS_WSS and both BASE_VERIFY_RPC_A/B required; no providers provisioned');
for(const value of [endpoint,rpcA,rpcB]){
 const u=new URL(value);
 if(u.protocol!==(value===endpoint?'wss:':'https:')||u.username||u.password||!u.hostname)
  throw Error('Only credential-free URL fields with secure protocol supported; use provider environment configuration');
}
if(rpcA===rpcB)throw Error('Two distinct RPC endpoints required');
const seconds=Number(process.env.LISTEN_SECONDS??'30');
if(!Number.isSafeInteger(seconds)||seconds<5||seconds>120)throw Error('LISTEN_SECONDS must be 5..120');
const evidencePath=process.env.BASE_EVIDENCE_PATH??'artifacts/base-head-evidence.jsonl';
const writer=await EvidenceWriter.open(evidencePath);
const pipeline=new ReadOnlyHeadPipeline(writer,[{name:'primary',url:rpcA},{name:'secondary',url:rpcB}]);
const socket=new WebSocket(endpoint);
let connected=false,failures=0,heads=0,closed=false;
const stop=()=>{if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();};
const watchdog=setTimeout(stop,seconds*1000);
socket.addEventListener('open',()=>{
 connected=true;
 socket.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}));
 socket.send(JSON.stringify({jsonrpc:'2.0',id:2,method:'eth_subscribe',params:['newHeads']}));
});
socket.addEventListener('message',ev=>{
 try{
  const result=pipeline.ingest(JSON.parse(String(ev.data)));
  if(result.kind==='HEAD')heads++;
 }catch{failures++;stop();}
});
socket.addEventListener('error',()=>{failures++;stop()});
socket.addEventListener('close',()=>{
 if(closed)return;closed=true;clearTimeout(watchdog);
 void (async()=>{
  try{await pipeline.drain()}catch{failures++}
  console.log(JSON.stringify({readOnly:true,executionAuthorized:false,connected,heads,failures,
   evidenceRecords:writer.count,pipeline:pipeline.snapshot(),
   note:'RPC matching is unsafe/nonfinal, not verified profit or permission to trade'}));
  if(!connected||failures||!heads||pipeline.snapshot().stopped)process.exitCode=1;
 })();
});
