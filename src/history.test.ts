import assert from 'node:assert/strict';
import test from 'node:test';
import { compareScans, type HistoricalScanReport } from './history.js';

function report(
  candidateCount: number,
  estimatedNetUsdc: string,
  decision = 'REJECT_RAW_LOSS',
): HistoricalScanReport {
  return {
    generatedAt: '2026-10-05T00:00:00.000Z',
    blockNumber: '1',
    candidateCount,
    rows: [
      {
        route: 'Uniswap v3 -> Aerodrome',
        startUsdc: '100',
        estimatedNetUsdc,
        decision,
      },
    ],
  };
}

test('reports no baseline when there is no previous scan', () => {
  const result = compareScans(undefined, report(0, '-0.20'));
  assert.equal(result.direction, 'NO_BASELINE');
});

test('detects an improving comparable route', () => {
  const result = compareScans(report(0, '-0.30'), report(0, '-0.10'));
  assert.equal(result.direction, 'IMPROVING');
  assert.ok((result.estimatedNetChangeUsdc ?? 0) > 0);
});

test('detects a worsening comparable route', () => {
  const result = compareScans(report(0, '-0.10'), report(0, '-0.30'));
  assert.equal(result.direction, 'WORSENING');
});

test('treats tiny changes as flat', () => {
  const result = compareScans(report(0, '-0.100'), report(0, '-0.095'));
  assert.equal(result.direction, 'FLAT');
});

test('prioritizes a newly appearing candidate', () => {
  const result = compareScans(
    report(0, '-0.10'),
    report(1, '2.50', 'CANDIDATE'),
  );
  assert.equal(result.direction, 'NEW_CANDIDATE');
});
