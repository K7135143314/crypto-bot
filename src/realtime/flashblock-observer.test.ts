import assert from 'node:assert/strict';
import test from 'node:test';
import { FlashblockObserver, percentile } from './flashblock-observer.js';

const frame = (payload_id: string, index: number) => ({ payload_id, index });

test('accepts an uninterrupted indexed cycle without claiming profit', () => {
  const observer = new FlashblockObserver();
  assert.equal(observer.ingest(frame('a', 0), 1000).status, 'ACCEPTED');
  assert.equal(observer.ingest(frame('a', 1), 1200).usableForResearch, true);
  assert.equal(observer.ingest(frame('a', 2), 1400).status, 'ACCEPTED');
  assert.equal(observer.summary().counts.ACCEPTED, 3);
});

test('duplicates are not processed as new observations', () => {
  const observer = new FlashblockObserver();
  observer.ingest(frame('a', 0), 1000);
  observer.ingest(frame('a', 1), 1200);
  assert.equal(observer.ingest(frame('a', 1), 1250).status, 'DUPLICATE');
  assert.equal(observer.ingest(frame('a', 2), 1400).status, 'ACCEPTED');
});

test('missing index closes cycle until a fresh payload baseline', () => {
  const observer = new FlashblockObserver();
  observer.ingest(frame('a', 0), 1000);
  assert.equal(observer.ingest(frame('a', 2), 1200).status, 'GAP');
  assert.equal(observer.ingest(frame('a', 1), 1400).status, 'UNTRUSTED');
  assert.equal(observer.ingest(frame('b', 0), 1600).status, 'ACCEPTED');
  assert.equal(observer.ingest(frame('b', 1), 1800).usableForResearch, true);
});

test('rejects a missing baseline and out-of-order index', () => {
  const observer = new FlashblockObserver();
  assert.equal(observer.ingest(frame('a', 1), 1000).status, 'UNTRUSTED');
  observer.ingest(frame('a', 0), 1200);
  observer.ingest(frame('a', 1), 1400);
  assert.equal(observer.ingest(frame('a', 0), 1600).status, 'OUT_OF_ORDER');
  assert.equal(observer.summary().synchronized, false);
});

test('stale interarrival never passes the freshness gate', () => {
  const observer = new FlashblockObserver(300);
  observer.ingest(frame('a', 0), 1000);
  assert.equal(observer.ingest(frame('a', 1), 2000).status, 'UNTRUSTED');
  assert.equal(observer.ingest(frame('b', 0), 2100).status, 'ACCEPTED');
});

test('malformed payloads and clocks cannot become usable', () => {
  const observer = new FlashblockObserver();
  assert.equal(observer.ingest({ payload_id: '', index: 0 }).status, 'INVALID');
  assert.equal(observer.ingest(frame('a', -1)).status, 'INVALID');
  assert.equal(observer.ingest(frame('a', 0), Number.NaN).status, 'INVALID');
  assert.equal(observer.summary().counts.ACCEPTED, 0);
});

test('timing percentiles are calculated from intervals, not fake provider latency', () => {
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([10, 40, 20, 30], 0.5), 20);
  assert.equal(percentile([10, 40, 20, 30], 0.95), 40);
  const observer = new FlashblockObserver();
  observer.ingest(frame('a', 0), 1000);
  observer.ingest(frame('a', 1), 1010);
  observer.ingest(frame('a', 2), 1050);
  assert.equal(observer.summary().timing.p50Ms, 10);
  assert.equal(observer.summary().timing.p99Ms, 40);
});
