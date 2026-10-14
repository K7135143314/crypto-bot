import { FlashblockObserver, type FeedObservation } from './flashblock-observer.js';

export type ListenerEvent =
  | { kind: 'CHAIN_OK'; chainId: 8453 }
  | { kind: 'SUBSCRIBED'; subscription: string }
  | { kind: 'FATAL'; reason: string }
  | { kind: 'IGNORED'; reason: string }
  | { kind: 'FRAME'; observation: FeedObservation; blockNumber: string | null };

type RecordValue = Record<string, unknown>;

const object = (value: unknown): RecordValue | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RecordValue : null;

function blockNumber(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    return String(value);
  if (typeof value !== 'string' || !/^(0x[\da-fA-F]+|[1-9]\d*)$/.test(value))
    return null;
  try {
    const n = BigInt(value);
    return n > 0n ? n.toString() : null;
  } catch { return null; }
}

function validatedFrame(value: unknown): { payload_id: string; index: number; block: string | null } | null {
  const frame = object(value);
  if (!frame || typeof frame.payload_id !== 'string' ||
      !/^0x[\da-fA-F]{2,64}$/.test(frame.payload_id) ||
      !Number.isSafeInteger(frame.index) || Number(frame.index) < 0 ||
      !object(frame.diff)) return null;
  const diff = object(frame.diff)!;
  if (diff.transactions !== undefined &&
      (!Array.isArray(diff.transactions) ||
       !diff.transactions.every(tx => typeof tx === 'string' && /^0x[\da-fA-F]*$/.test(tx))))
    return null;

  const index = Number(frame.index);
  const baseBlock = blockNumber(object(frame.base)?.block_number);
  const metadataValue = object(frame.metadata)?.block_number;
  const metadataBlock = metadataValue === undefined ? null : blockNumber(metadataValue);
  if (metadataValue !== undefined && metadataBlock === null) return null;
  if (index === 0 && (!baseBlock || (metadataBlock && baseBlock !== metadataBlock))) return null;
  if (index > 0 && frame.base !== undefined) return null;
  return { payload_id: frame.payload_id.toLowerCase(), index, block: baseBlock ?? metadataBlock };
}

/**
 * Validates RPC chain and subscription ownership before applying the existing
 * fail-closed Flashblocks sequence guard. Does not decode pool state.
 */
export class BaseFlashblocksSession {
  private chainOK = false;
  private subscription: string | null = null;
  private observer = new FlashblockObserver();
  private currentBlock: string | null = null;
  private currentPayload: string | null = null;
  private frameCount = 0;

  get ready(): boolean { return this.chainOK && this.subscription !== null; }
  get framesSeen(): number { return this.frameCount; }
  snapshot() { return { ready: this.ready, framesSeen: this.frameCount, ...this.observer.summary() }; }

  reset(): void {
    this.chainOK = false;
    this.subscription = null;
    this.observer = new FlashblockObserver();
    this.currentBlock = null;
    this.currentPayload = null;
    this.frameCount = 0;
  }

  ingest(message: unknown, receivedAtMs = Date.now()): ListenerEvent {
    const msg = object(message);
    if (!msg || msg.jsonrpc !== '2.0')
      return { kind: 'IGNORED', reason: 'Non JSON-RPC notification' };
    if (msg.id === 1) {
      if (msg.result !== '0x2105' || msg.error !== undefined) {
        this.reset();
        return { kind: 'FATAL', reason: 'Base chain ID verification failed' };
      }
      this.chainOK = true;
      return { kind: 'CHAIN_OK', chainId: 8453 };
    }
    if (msg.id === 2) {
      if (!this.chainOK || typeof msg.result !== 'string' ||
          !/^0x[\da-fA-F]+$/.test(msg.result) || msg.error !== undefined) {
        this.reset();
        return { kind: 'FATAL', reason: 'Subscription handshake failed' };
      }
      this.subscription = msg.result.toLowerCase();
      return { kind: 'SUBSCRIBED', subscription: this.subscription };
    }
    if (msg.method !== 'eth_subscription')
      return { kind: 'IGNORED', reason: 'Unrelated RPC message' };
    const params = object(msg.params);
    if (!this.ready || !params || typeof params.subscription !== 'string' ||
        params.subscription.toLowerCase() !== this.subscription)
      return { kind: 'IGNORED', reason: 'Unknown or unverified subscription' };

    this.frameCount++;
    const frame = validatedFrame(params.result);
    if (!frame) {
      // Malformed frame poisons the ongoing cycle. Require a new index 0.
      this.observer = new FlashblockObserver();
      this.currentPayload = null;
      this.currentBlock = null;
      return { kind: 'IGNORED', reason: 'Invalid payload; stream cycle invalidated' };
    }
    if (frame.index > 0 && frame.payload_id === this.currentPayload &&
        frame.block && frame.block !== this.currentBlock) {
      this.observer = new FlashblockObserver();
      this.currentPayload = null;
      this.currentBlock = null;
      return { kind: 'IGNORED', reason: 'Conflicting block number; cycle invalidated' };
    }
    const observation = this.observer.ingest(frame, receivedAtMs);
    if (frame.index === 0 && observation.status === 'ACCEPTED') {
      this.currentPayload = frame.payload_id;
      this.currentBlock = frame.block;
    }
    return {
      kind: 'FRAME',
      observation: {
        ...observation,
        usableForResearch: observation.usableForResearch &&
          this.currentBlock !== null && frame.payload_id === this.currentPayload,
      },
      blockNumber: frame.payload_id === this.currentPayload ? this.currentBlock : null,
    };
  }
}
