/**
 * Network-upgrade compatible, read-only Base 'newHeads' observer.
 * Does NOT claim finality, canonicality, an executable price or a trade signal.
 * Before Denim a provider may emit Flashblocks-style/preconfirmed heads;
 * after Denim every ~200ms interval is expected to be a real unsafe L2 block.
 * Caller MUST independently reconcile canonical state before using prices.
 */
export type HeadStatus =
  | 'ACCEPTED_UNVERIFIED' | 'DUPLICATE' | 'GAP' | 'REORG_WARNING'
  | 'OUT_OF_ORDER' | 'INVALID' | 'UNTRUSTED';
export type HeadEvent =
  | { kind: 'CHAIN_OK'; chainId: 8453 }
  | { kind: 'SUBSCRIBED'; subscription: string }
  | { kind: 'HEAD'; status: HeadStatus; number: string | null; hash: string | null; arrivalAt: string; note: string; usableForTrading: false }
  | { kind: 'IGNORED'; reason: string }
  | { kind: 'FATAL'; reason: string };
type Obj = Record<string, unknown>;
const object = (x: unknown): Obj | null =>
  x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Obj : null;
const hexHash = (x: unknown): x is string => typeof x === 'string' && /^0x[0-9a-fA-F]{64}$/.test(x);
const hexQuantity = (x: unknown): x is string => typeof x === 'string' && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(x);

type Header = { number: bigint; hash: string; parentHash: string };
function parseHeader(x: unknown): Header | null {
  const v = object(x);
  if (!v || !hexQuantity(v.number) || !hexHash(v.hash) || !hexHash(v.parentHash)) return null;
  const number = BigInt(v.number);
  if (number < 1n) return null;
  return { number, hash: v.hash.toLowerCase(), parentHash: v.parentHash.toLowerCase() };
}

export class BaseHeadsSession {
  private chainOK = false;
  private subscription: string | null = null;
  private previous: Header | null = null;
  private trustedSequence = false;
  private counts: Record<HeadStatus, number> = {
    ACCEPTED_UNVERIFIED: 0, DUPLICATE: 0, GAP: 0, REORG_WARNING: 0,
    OUT_OF_ORDER: 0, INVALID: 0, UNTRUSTED: 0,
  };
  get ready() { return this.chainOK && this.subscription !== null; }
  snapshot() {
    return { ready:this.ready, trustedSequence:this.trustedSequence,
      lastObservedHead:this.previous?.number.toString() ?? null,
      counts:{...this.counts}, canonicalVerified:false, usableForTrading:false };
  }
  reset() {
    this.chainOK=false; this.subscription=null; this.previous=null; this.trustedSequence=false;
  }
  ingest(message: unknown, receivedAtMs: number = Date.now()): HeadEvent {
    const msg=object(message);
    if(!msg || msg.jsonrpc!=='2.0') return {kind:'IGNORED',reason:'Not JSON-RPC'};
    if(msg.id===1){
      if(msg.error!==undefined || msg.result!=='0x2105'){
        this.reset(); return {kind:'FATAL',reason:'Chain mismatch or RPC error'};
      }
      this.chainOK=true;return {kind:'CHAIN_OK',chainId:8453};
    }
    if(msg.id===2){
      if(!this.chainOK || msg.error!==undefined ||
        typeof msg.result!=='string' || !/^0x[0-9a-fA-F]+$/.test(msg.result)){
        this.reset(); return {kind:'FATAL',reason:'Invalid subscription handshake'};
      }
      this.subscription=msg.result.toLowerCase();
      return {kind:'SUBSCRIBED',subscription:this.subscription};
    }
    if(msg.method!=='eth_subscription')return {kind:'IGNORED',reason:'Unrelated RPC message'};
    const params=object(msg.params);
    if(!this.ready || !params || typeof params.subscription!=='string' ||
      params.subscription.toLowerCase()!==this.subscription)
      return {kind:'IGNORED',reason:'Unverified subscription'};
    const clockOK=Number.isFinite(receivedAtMs) && receivedAtMs>=0 &&
      receivedAtMs<=8_640_000_000_000_000;
    const header=parseHeader(params.result);
    let status:HeadStatus, note:string;
    if(!header || !clockOK){
      status='INVALID';note='Malformed header or observation clock';this.trustedSequence=false;
      this.previous=null;
    }else if(!this.previous){
      status='ACCEPTED_UNVERIFIED';note='New sequence baseline, independently unverified';
      this.previous=header;this.trustedSequence=true;
    }else if(header.number===this.previous.number){
      if(header.hash===this.previous.hash){
        status='DUPLICATE';note='Repeated head';
      }else{
        status='REORG_WARNING';note='Same block number, different hash; recheck chain';
        this.previous=header;this.trustedSequence=false;
      }
    }else if(header.number<this.previous.number){
      status='OUT_OF_ORDER';note='Older block number observed; distrust stream';
      this.trustedSequence=false;
    }else if(header.number>this.previous.number+1n){
      status='GAP';note='Missed one or more heads; independently resynchronize';
      this.previous=header;this.trustedSequence=false;
    }else if(header.parentHash!==this.previous.hash){
      status='REORG_WARNING';note='Parent hash discontinuity; independent reconciliation required';
      this.previous=header;this.trustedSequence=false;
    }else{
      status=this.trustedSequence?'ACCEPTED_UNVERIFIED':'UNTRUSTED';
      note=this.trustedSequence?'Continuous but not independently verified head':
        'Stream has not been resynchronized';
      this.previous=header;
    }
    this.counts[status]++;
    return {kind:'HEAD',status,number:header?.number.toString() ?? null,
      hash:header?.hash ?? null,
      arrivalAt:clockOK?new Date(receivedAtMs).toISOString():'INVALID',
      note,usableForTrading:false};
  }
}
