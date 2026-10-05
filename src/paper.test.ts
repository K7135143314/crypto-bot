import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPaperOutcome,
  summarizePaperReplay,
  type PaperReplayItem,
} from './paper.js';

test('classifies candidate persistence outcomes', () => {
  assert.equal(classifyPaperOutcome('CANDIDATE'), 'SURVIVED');
  assert.equal(classifyPaperOutcome('REJECT_COSTS'), 'EXPIRED');
  assert.equal(classifyPaperOutcome(null), 'NOT_COMPARABLE');
});

test('summarizes paper candidate survival rate', () => {
  const items: PaperReplayItem[] = [
    {
      route: 'A',
      startUsdc: '100',
      initialEstimatedNetUsdc: 2,
      laterEstimatedNetUsdc: 1.5,
      initialDecision: 'CANDIDATE',
      laterDecision: 'CANDIDATE',
      outcome: 'SURVIVED',
      blocksElapsed: 3,
    },
    {
      route: 'B',
      startUsdc: '250',
      initialEstimatedNetUsdc: 3,
      laterEstimatedNetUsdc: -0.2,
      initialDecision: 'CANDIDATE',
      laterDecision: 'REJECT_COSTS',
      outcome: 'EXPIRED',
      blocksElapsed: 4,
    },
  ];

  const summary = summarizePaperReplay(items);

  assert.equal(summary.initialCandidateCount, 2);
  assert.equal(summary.comparableCount, 2);
  assert.equal(summary.survivedCount, 1);
  assert.equal(summary.expiredCount, 1);
  assert.equal(summary.survivalRatePct, 50);
  assert.equal(summary.averageBlocksElapsed, 3.5);
});

test('handles a run with no candidates', () => {
  const summary = summarizePaperReplay([]);
  assert.equal(summary.initialCandidateCount, 0);
  assert.equal(summary.survivalRatePct, null);
  assert.equal(summary.averageBlocksElapsed, null);
});
