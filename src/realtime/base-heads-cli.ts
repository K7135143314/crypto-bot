import { BaseHeadsSession } from './base-heads-session.js';
const endpoint=process.env.BASE_HEADS_WSS;
if(!endpoint) throw new Error('BASE_HEADS_WSS required; no service provisioned');
const url=new URL(endpoint);
if(url.protocol!=='wss:' || url.username || url.password || !url.hostname) throw new Error('Secure WSS endpoint required');
const seconds=Number(process.env.LISTEN_SECONDS ?? '30');
if(!Number.isSafeInteger(seconds)||seconds<5||seconds>120)throw new Error('LISTEN_SECONDS must be 5..120');
const s=new BaseHeadsSession(), socket=new WebSocket(endpoint);
let connected=false, errors=0, headers=0;
const stop=()=>{if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();};
const timer=setTimeout(stop,seconds*1000);
socket.addEventListener('open',()=>{
 connected=true;
 socket.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}));
 socket.send(JSON.stringify({jsonrpc:'2.0',id:2,method:'eth_subscribe',params:['newHeads']}));
});
socket.addEventListener('message',ev=>{
 try{
  const event=s.ingest(JSON.parse(String(ev.data)));
  if(event.kind==='FATAL'){errors++;stop();}
  if(event.kind==='HEAD')headers++;
 }catch{errors++;s.reset();stop();}
});
socket.addEventListener('error',()=>{errors++;});
socket.addEventListener('close',()=>{
 clearTimeout(timer);
 console.log(JSON.stringify({readOnly:true,executionAuthorized:false,
   connected,headers,errors,session:s.snapshot(),
   note:'Unverified heads only; not canonical confirmation, pool states or trading signals'}));
 if(!connected || errors || !headers)process.exitCode=1;
});
