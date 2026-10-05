import { bestRow, type HistoricalScanReport, type HistoricalScanRow } from './history.js';

export type RollingHistorySummary = {
  sampleCount: number;
  candidateScanCount: number;
  candidateRouteCount: number;
  firstGeneratedAt?: string;
  lastGeneratedAt?: string;
  firstBestNetUsdc?: number;
  latestBestNetUsdc?: number;
  bestEverNetUsdc?: number;
  bestEverRow?: HistoricalScanRow;
  averageBestNetUsdc?: number;
  netChangeFromFirstUsdc?: number;
  direction: 'NO_HISTORY' | 'IMPROVING' | 'WORSENING' | 'FLAT';
};

function timestamp(report: HistoricalScanReport): number {
  const value = Date.parse(report.generatedAt);
  return Number.isFinite(value) ? value : 0;
}

export function summarizeRollingHistory(
  reports: HistoricalScanReport[],
  flatToleranceUsdc = 0.05,
): RollingHistorySummary {
  const ordered = [...reports].sort((a, b) => timestamp(a) - timestamp(b));
  const observations = ordered
    .map((report) => ({ report, best: bestRow(report) }))
    .filter(
      (item): item is { report: HistoricalScanReport; best: HistoricalScanRow } =>
        item.best !== undefined,
    );

  if (observations.length === 0) {
    return {
      sampleCount: 0,
      candidateScanCount: 0,
      candidateRouteCount: 0,
      direction: 'NO_HISTORY',
    };
  }

  const bestNets = observations.map((item) => Number(item.best.estimatedNetUsdc));
  const first = observations[0]!;
  const latest = observations[observations.length - 1]!;
  const firstNet = Number(first.best.estimatedNetUsdc);
  const latestNet = Number(latest.best.estimatedNetUsdc);
  const netChange = latestNet - firstNet;

  let bestEverIndex = 0;
  for (let i = 1; i < bestNets.length; i += 1) {
    if (bestNets[i]! > bestNets[bestEverIndex]!) bestEverIndex = i;
  }

  let direction: RollingHistorySummary['direction'] = 'FLAT';
  if (netChange > flatToleranceUsdc) direction = 'IMPROVING';
  if (netChange < -flatToleranceUsdc) direction = 'WORSENING';

  return {
    sampleCount: observations.length,
    candidateScanCount: ordered.filter((report) => report.candidateCount > 0).length,
    candidateRouteCount: ordered.reduce(
      (sum, report) => sum + report.candidateCount,
      0,
    ),
    firstGeneratedAt: first.report.generatedAt,
    lastGeneratedAt: latest.report.generatedAt,
    firstBestNetUsdc: firstNet,
    latestBestNetUsdc: latestNet,
    bestEverNetUsdc: bestNets[bestEverIndex],
    bestEverRow: observations[bestEverIndex]!.best,
    averageBestNetUsdc:
      bestNets.reduce((sum, value) => sum + value, 0) / bestNets.length,
    netChangeFromFirstUsdc: netChange,
    direction,
  };
}
