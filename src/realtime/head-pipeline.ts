import { BaseHeadsSession, type HeadEvent } from './base-heads-session.js';
import { EvidenceWriter } from './head-evidence.js';
import { verifyObservedHead, type RpcSource } from './head-rpc.js';
import { reconcileHead } from './head-reconcile.js';

/** A single-writer, bounded read-only queue. Never drops a head silently. */
export class ReadOnlyHeadPipeline {
  readonly session=new BaseHeadsSession();
  private queue: Promise<void>=Promise.resolve();
  private pending=0;
  private stopped=false;
  private processed=0;
  private failures=0;
  constructor(private readonly writer:EvidenceWriter,private readonly sources:readonly RpcSource[],
    private readonly verify:typeof verifyObservedHead=verifyObservedHead,private readonly maxPending=8){
    if(!Number.isSafeInteger(maxPending)||maxPending<1||maxPending>128)throw Error('Invalid queue bound');
  }
  ingest(message:unknown,at=Date.now()):HeadEvent{
    if(this.stopped)throw Error('Research pipeline has stopped');
    const event=this.session.ingest(message,at);
    if(event.kind==='FATAL'){this.stopped=true;throw Error('Unverified chain/subscription; stop pipeline')}
    if(event.kind!=='HEAD'||event.status==='DUPLICATE')return event;
    if(this.pending>=this.maxPending){this.stopped=true;throw Error('Head queue overflow; stop rather than lose evidence')}
    this.pending++;
    const observed=event.number&&event.hash&&event.parentHash
      ?{number:event.number,hash:event.hash,parentHash:event.parentHash}:null;
    this.queue=this.queue.then(async()=>{
      // Only continuous, structurally valid heads can earn MATCHED_UNSAFE.
      // All other stream outcomes must be preserved as rejected evidence.
      let result;
      if(event.status==='ACCEPTED_UNVERIFIED'&&observed){
        result=await this.verify(observed,this.sources);
      }else{
        result=reconcileHead(observed,[]);
        result={...result,reason:'Rejected stream state '+event.status+': '+event.note};
      }
      await this.writer.append({observedAt:event.arrivalAt,reconciliation:result});
      this.processed++;
    }).catch(error=>{this.failures++;this.stopped=true;throw error;}).finally(()=>{this.pending--;});
    // Prevent an unhandled rejection before drain is called.
    void this.queue.catch(()=>{});
    return event;
  }
  async drain(){await this.queue;}
  snapshot(){return {readOnly:true,executionAuthorized:false,stopped:this.stopped,pending:this.pending,
    processed:this.processed,failures:this.failures,session:this.session.snapshot()};}
}
