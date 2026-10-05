import assert from 'node:assert/strict';
import test from 'node:test';
import {
  summarizeRollingHistory,
} from './rolling-history.js';
import type { HistoricalScanReport } from './history.js';

function report(
  generatedAt: string,
  estimatedNetUsdc: string,
  candidateCount = 0,
): HistoricalScanReport {
  return {
    generatedAt,
    blockNumber: '1',
    candidateCount,
    rows: [
      {
        route: 'Uniswap v3 -> Aerodrome',
        startUsdc: '100',
        estimatedNetUsdc,
        decision: candidateCount > 0 ? 'CANDIDATE' : 'REJECT_RAW_LOSS',
      },
    ],
  };
}

test('returns NO_HISTORY with no reports', () => {
  const result = summarizeRollingHistory([]);
  assert.equal(result.direction, 'NO_HISTORY');
  assert.equal(result.sampleCount, 0);
});

test('detects a rolling improvement', () => {
  const result = summarizeRollingHistory([
    report('2026-10-05T01:00:00Z', '-0.50'),
    report('2026-10-05T02:00:00Z', '-0.40'),
    report('2026-10-05T03:00:00Z', '-0.20'),
  ]);

  assert.equal(result.direction, 'IMPROVING');
  assert.equal(result.sampleCount, 3);
  assert.ok((result.netChangeFromFirstUsdc ?? 0) > 0);
});

test('detects a rolling worsening', () => {
  const result = summarizeRollingHistory([
    report('2026-10-05T01:00:00Z', '-0.10'),
    report('2026-10-05T02:00:00Z', '-0.30'),
  ]);

  assert.equal(result.direction, 'WORSENING');
});

test('counts scans and routes with candidates', () => {
  const result = summarizeRollingHistory([
    report('2026-10-05T01:00:00Z', '-0.10', 0),
    report('2026-10-05T02:00:00Z', '1.20', 2),
    report('2026-10-05T03:00:00Z', '0.90', 1),
  ]);

  assert.equal(result.candidateScanCount, 2);
  assert.equal(result.candidateRouteCount, 3);
  assert.equal(result.bestEverNetUsdc, 1.2);
});

test('sorts reports by timestamp before comparing first and latest', () => {
  const result = summarizeRollingHistory([
    report('2026-10-05T03:00:00Z', '-0.10'),
    report('2026-10-05T01:00:00Z', '-0.50'),
  ]);

  assert.equal(result.direction, 'IMPROVING');
  assert.equal(result.firstBestNetUsdc, -0.5);
  assert.equal(result.latestBestNetUsdc, -0.1);
});
