export type PaperReplayItem = {
  route: string;
  startUsdc: string;
  initialEstimatedNetUsdc: number;
  laterEstimatedNetUsdc: number | null;
  initialDecision: string;
  laterDecision: string | null;
  outcome: 'SURVIVED' | 'EXPIRED' | 'NOT_COMPARABLE';
  blocksElapsed: number;
};

export type PaperReplaySummary = {
  initialCandidateCount: number;
  comparableCount: number;
  survivedCount: number;
  expiredCount: number;
  notComparableCount: number;
  survivalRatePct: number | null;
  averageBlocksElapsed: number | null;
};

export function classifyPaperOutcome(
  laterDecision: string | null,
): PaperReplayItem['outcome'] {
  if (laterDecision === null) return 'NOT_COMPARABLE';
  return laterDecision === 'CANDIDATE' ? 'SURVIVED' : 'EXPIRED';
}

export function summarizePaperReplay(
  items: readonly PaperReplayItem[],
): PaperReplaySummary {
  const comparable = items.filter((item) => item.outcome !== 'NOT_COMPARABLE');
  const survived = comparable.filter((item) => item.outcome === 'SURVIVED');
  const expired = comparable.filter((item) => item.outcome === 'EXPIRED');
  const notComparable = items.filter((item) => item.outcome === 'NOT_COMPARABLE');

  return {
    initialCandidateCount: items.length,
    comparableCount: comparable.length,
    survivedCount: survived.length,
    expiredCount: expired.length,
    notComparableCount: notComparable.length,
    survivalRatePct:
      comparable.length > 0
        ? Number(((survived.length / comparable.length) * 100).toFixed(2))
        : null,
    averageBlocksElapsed:
      comparable.length > 0
        ? Number(
            (
              comparable.reduce((sum, item) => sum + item.blocksElapsed, 0) /
              comparable.length
            ).toFixed(2),
          )
        : null,
  };
}
