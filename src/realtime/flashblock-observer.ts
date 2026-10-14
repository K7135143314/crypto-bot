/**
 * Read-only Base Flashblocks sequencing and arrival-time instrumentation.
 * No market quotes, wallets, transaction construction, or broadcasts.
 *
 * Flashblock indices are NOT trade-confirmation signals. A missing index means
 * the entire payload must be treated as incomplete until its next index 0.
 */
export type FeedStatus = 'ACCEPTED' | 'DUPLICATE' | 'OUT_OF_ORDER' | 'GAP' | 'UNTRUSTED' | 'STALE' | 'INVALID';

export type FeedObservation = {
  status: FeedStatus;
  receivedAt: string;
  payloadId: string | null;
  index: number | null;
  arrivalGapMs: number | null;
  usableForResearch: boolean;
  note: string;
};

export type TimingSummary = {
  observations: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
};

function validPayload(raw: unknown): { payloadId: string; index: number } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.payload_id !== 'string' || item.payload_id.length === 0 ||
      item.payload_id.length > 256 || !Number.isSafeInteger(item.index) ||
      Number(item.index) < 0) return null;
  return { payloadId: item.payload_id, index: Number(item.index) };
}

export function percentile(values: readonly number[], proportion: number): number | null {
  if (!values.length || !Number.isFinite(proportion) || proportion < 0 || proportion > 1) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(proportion * ordered.length) - 1 < 0 ? 0 : Math.ceil(proportion * ordered.length) - 1] ?? null;
}

export class FlashblockObserver {
  private lastPayloadId: string | null = null;
  private lastIndex = -1;
  private lastReceivedMs: number | null = null;
  private synchronized = false;
  private readonly gapsMs: number[] = [];
  private readonly counts: Record<FeedStatus, number> = {
    ACCEPTED: 0, DUPLICATE: 0, OUT_OF_ORDER: 0, GAP: 0, UNTRUSTED: 0, STALE: 0, INVALID: 0,
  };

  constructor(private readonly maxArrivalGapMs = 2000) {
    if (!Number.isFinite(maxArrivalGapMs) || maxArrivalGapMs <= 0) {
      throw new Error('maxArrivalGapMs must be positive');
    }
  }

  ingest(raw: unknown, receivedAtMs: number = Date.now()): FeedObservation {
    const validTime = Number.isFinite(receivedAtMs) && receivedAtMs >= 0;
    const payload = validPayload(raw);
    const receivedAt = validTime ? new Date(receivedAtMs).toISOString() : 'INVALID';
    const arrivalGapMs = validTime && this.lastReceivedMs !== null
      ? receivedAtMs - this.lastReceivedMs : null;
    let status: FeedStatus = 'INVALID';
    let note = 'Invalid Flashblocks payload or arrival clock';

    // Never advance sequence state on a malformed message/clock.
    if (payload && validTime && (arrivalGapMs === null || arrivalGapMs >= 0)) {
      const arrivalStale = arrivalGapMs !== null && arrivalGapMs > this.maxArrivalGapMs;
      this.lastReceivedMs = receivedAtMs;
      if (arrivalGapMs !== null) {
        this.gapsMs.push(arrivalGapMs);
        if (this.gapsMs.length > 10000) this.gapsMs.shift();
      }

      if (arrivalStale) this.synchronized = false;
      if (payload.index === 0) {
        if (payload.payloadId === this.lastPayloadId && this.lastIndex === 0 && !arrivalStale) {
          status = 'DUPLICATE';
          note = 'Repeated initial update';
        } else if (payload.payloadId === this.lastPayloadId && this.lastIndex > 0) {
          status = 'OUT_OF_ORDER';
          note = 'Unexpected reset within same payload';
          this.synchronized = false;
        } else {
          status = arrivalStale ? 'STALE' : 'ACCEPTED';
          note = arrivalStale ? 'Arrival gap exceeded budget; new payload baseline only' : 'New payload baseline';
          this.synchronized = !arrivalStale;
          this.lastPayloadId = payload.payloadId;
          this.lastIndex = 0;
        }
      } else if (!this.synchronized || payload.payloadId !== this.lastPayloadId) {
        status = 'UNTRUSTED';
        note = 'Missing trusted index 0; await next payload baseline';
      } else if (payload.index === this.lastIndex) {
        status = 'DUPLICATE';
        note = 'Repeated Flashblock index';
      } else if (payload.index < this.lastIndex) {
        status = 'OUT_OF_ORDER';
        note = 'Regressed Flashblock index';
        this.synchronized = false;
      } else if (payload.index > this.lastIndex + 1) {
        status = 'GAP';
        note = 'Missing Flashblock index; discard cycle until next index 0';
        this.synchronized = false;
      } else if (arrivalStale) {
        status = 'STALE';
        note = 'Interarrival gap exceeded budget; discard cycle';
      } else {
        status = 'ACCEPTED';
        note = 'Contiguous Flashblock index';
        this.lastIndex = payload.index;
      }
    }

    this.counts[status] += 1;
    return {
      status, receivedAt, payloadId: payload?.payloadId ?? null,
      index: payload?.index ?? null, arrivalGapMs,
      usableForResearch: status === 'ACCEPTED' && this.synchronized,
      note,
    };
  }

  summary(): { counts: Record<FeedStatus, number>; timing: TimingSummary; synchronized: boolean } {
    return {
      counts: { ...this.counts },
      timing: {
        observations: this.gapsMs.length,
        p50Ms: percentile(this.gapsMs, 0.5),
        p95Ms: percentile(this.gapsMs, 0.95),
        p99Ms: percentile(this.gapsMs, 0.99),
      },
      synchronized: this.synchronized,
    };
  }
}
