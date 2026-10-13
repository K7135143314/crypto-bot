import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR_MS,
  EXPECTED_HOUR_BUCKETS,
  isScheduledResearchObservation,
  summarizeCollection,
} from './coverage.js';

const now = Date.parse('2026-10-13T18:45:00.000Z');
const entry = (hoursAgo, extra = {}) =>
  ({ generatedAt: new Date(now - hoursAgo * HOUR_MS).toISOString(), ...extra });

test('recovered browser history is never treated as scheduled market coverage', () => {
  const rows = [
    entry(0, { source: 'legacy-browser-localStorage', blockNumber: '52561859' }),
    entry(0, { blockNumber: 'historical-recovered' }),
    entry(1, { blockNumber: '52561859' }),
  ];
  assert.equal(isScheduledResearchObservation(rows[0]), false);
  assert.equal(isScheduledResearchObservation(rows[1]), false);
  assert.equal(isScheduledResearchObservation(rows[2]), true);
  const result = summarizeCollection('research', rows, now);
  assert.equal(result.savedRows, 3);
  assert.equal(result.eligibleRows, 1);
  assert.equal(result.recoveredRows, 2);
  assert.equal(result.hoursCovered, 1);
  assert.equal(result.state, 'CURRENT');
});

test('only distinct hourly buckets count, repeated scans do not inflate coverage', () => {
  const rows = [entry(0), entry(0.15), entry(1), entry(23), entry(24)];
  const result = summarizeCollection('markets', rows, now);
  assert.equal(result.hoursCovered, 3);
  assert.equal(result.samplesInWindow, 4);
  assert.equal(result.hoursExpected, EXPECTED_HOUR_BUCKETS);
});

test('older streams report late even when GitHub stored a successful old snapshot', () => {
  const result = summarizeCollection('verification', [entry(3), entry(5)], now);
  assert.equal(result.state, 'LATE');
  assert.equal(result.ageMinutes, 180);
  assert.equal(result.hoursCovered, 2);
});

test('empty, invalid and future dated source results do not look healthy', () => {
  const rows = [{ generatedAt: 'not-a-date' }, entry(-1)];
  const result = summarizeCollection('intelligence', rows, now);
  assert.equal(result.state, 'NO_DATA');
  assert.equal(result.latestAt, null);
  assert.equal(result.hoursCovered, 0);
  assert.throws(() => summarizeCollection('research', null, now), /array/);
});

test('coverage does not equate negative profit with failed data collection', () => {
  const result = summarizeCollection('verification', [entry(0, {
    results: [{status:'QUOTE_REJECT',bestEstimatedNetUsdc:'-0.41'}],
  })], now);
  assert.equal(result.state, 'CURRENT');
  assert.equal(result.hoursCovered, 1);
});
