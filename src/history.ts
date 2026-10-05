export type HistoricalScanRow = {
  route: string;
  startUsdc: string;
  estimatedNetUsdc: string;
  decision: string;
};

export type HistoricalScanReport = {
  generatedAt: string;
  blockNumber: string;
  candidateCount: number;
  rows: HistoricalScanRow[];
};

export type TrendDirection =
  | 'NO_BASELINE'
  | 'IMPROVING'
  | 'WORSENING'
  | 'FLAT'
  | 'NEW_CANDIDATE';

export type ScanComparison = {
  direction: TrendDirection;
  previousBest?: HistoricalScanRow;
  currentBest?: HistoricalScanRow;
  comparablePreviousRow?: HistoricalScanRow;
  estimatedNetChangeUsdc?: number;
  previousCandidateCount: number;
  currentCandidateCount: number;
};

function net(row: HistoricalScanRow): number {
  return Number(row.estimatedNetUsdc);
}

export function bestRow(report: HistoricalScanReport): HistoricalScanRow | undefined {
  return [...report.rows].sort((a, b) => net(b) - net(a))[0];
}

export function compareScans(
  previous: HistoricalScanReport | undefined,
  current: HistoricalScanReport,
  flatToleranceUsdc = 0.01,
): ScanComparison {
  const currentBest = bestRow(current);

  if (!previous) {
    return {
      direction: 'NO_BASELINE',
      currentBest,
      previousCandidateCount: 0,
      currentCandidateCount: current.candidateCount,
    };
  }

  const previousBest = bestRow(previous);

  if (previous.candidateCount === 0 && current.candidateCount > 0) {
    return {
      direction: 'NEW_CANDIDATE',
      previousBest,
      currentBest,
      previousCandidateCount: previous.candidateCount,
      currentCandidateCount: current.candidateCount,
    };
  }

  if (!currentBest) {
    return {
      direction: 'FLAT',
      previousBest,
      previousCandidateCount: previous.candidateCount,
      currentCandidateCount: current.candidateCount,
    };
  }

  const comparablePreviousRow = previous.rows.find(
    (row) =>
      row.route === currentBest.route &&
      row.startUsdc === currentBest.startUsdc,
  );

  if (!comparablePreviousRow) {
    return {
      direction: 'NO_BASELINE',
      previousBest,
      currentBest,
      previousCandidateCount: previous.candidateCount,
      currentCandidateCount: current.candidateCount,
    };
  }

  const change = net(currentBest) - net(comparablePreviousRow);
  let direction: TrendDirection = 'FLAT';

  if (change > flatToleranceUsdc) direction = 'IMPROVING';
  if (change < -flatToleranceUsdc) direction = 'WORSENING';

  return {
    direction,
    previousBest,
    currentBest,
    comparablePreviousRow,
    estimatedNetChangeUsdc: change,
    previousCandidateCount: previous.candidateCount,
    currentCandidateCount: current.candidateCount,
  };
}
