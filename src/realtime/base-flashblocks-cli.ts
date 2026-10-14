import { BaseFlashblocksSession } from './base-flashblocks-session.js';
const endpoint=process.env.BASE_FLASHBLOCKS_WSS;
if(!endpoint) throw new Error('BASE_FLASHBLOCKS_WSS required; no default or paid service activated');
const url=new URL(endpoint);
if(url.protocol!=='wss:' || url.username || url.password || !url.hostname)throw new Error('Only secure WSS endpoint permitted');
const session=new BaseFlashblocksSession();
const duration=Number(process.env.LISTEN_SECONDS ?? '30');
if(!Number.isSafeInteger(duration)||duration<5||duration>120)throw new Error('LISTEN_SECONDS must be 5..120');
const socket=new WebSocket(endpoint);
let messages=0;let frames=0;let failures=0;let connected=false;let fatal=false;
const stop=()=>{if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();};
const watchdog=setTimeout(stop,duration*1000);
socket.addEventListener('open',()=>{connected=true;
 socket.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}));
 socket.send(JSON.stringify({jsonrpc:'2.0',id:2,method:'eth_subscribe',params:['newFlashblocks']}));
});
socket.addEventListener('message',(ev)=>{messages++;
 try{
 const value=JSON.parse(typeof ev.data==='string'?ev.data:String(ev.data));
 const result=session.ingest(value);
 if(result.kind==='FATAL'){fatal=true;failures++;stop();}
 if(result.kind==='FRAME')frames++;
 }catch{failures++;session.reset();}
});
socket.addEventListener('error',()=>{failures++;});
socket.addEventListener('close',()=>{clearTimeout(watchdog);
 console.log(JSON.stringify({readOnly:true,executionAuthorized:false,connected,
  messages,frames,failures,fatal,summary:session.snapshot(),
  note:'Arrival intervals are not provider delay; Flashblocks are not final settlement and no DEX states were decoded.'}));
 if(!connected||fatal||failures||!frames)process.exitCode=1;
});
