import { readFile, writeFile } from 'node:fs/promises';

export type IntelligenceResult = {
  scoutRank: number;
  scoutRoute: string;
  scoutSpreadBps: number;
  status: string;
  reason: string;
  pinnedBlock?: string;
  exactPoolMatch?: boolean;
  bestTradeSizeUsdc?: string;
  bestEstimatedNetUsdc?: string;
  decision?: string;
};

type VerificationReport = {
  generatedAt: string;
  pinnedBlock: string;
  scoutLeadCount: number;
  results: IntelligenceResult[];
};

export type IntelligenceRun = {
  generatedAt: string;
  pinnedBlock: string;
  scoutLeadCount: number;
  results: IntelligenceResult[];
};

export type IntelligenceHistory = {
  version: number;
  timezone: string;
  retentionDays: number;
  updatedAt: string | null;
  runs: IntelligenceRun[];
};

export function mergeIntelligence(
  current: IntelligenceHistory,
  report: VerificationReport,
  now = Date.now(),
): IntelligenceHistory {
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  const byKey = new Map<string, IntelligenceRun>();
  for (const run of current.runs || []) {
    if (Number.isFinite(Date.parse(run.generatedAt)) && Date.parse(run.generatedAt) >= cutoff) {
      byKey.set(run.generatedAt + '|' + run.pinnedBlock, run);
    }
  }
  if (!Number.isFinite(Date.parse(report.generatedAt)) ||
      !Array.isArray(report.results) ||
      !Number.isFinite(report.scoutLeadCount) ||
      typeof report.pinnedBlock !== 'string') {
    throw new Error('Invalid scout verification report');
  }
  if (Date.parse(report.generatedAt) >= cutoff) {
    const run = {
      generatedAt: report.generatedAt,
      pinnedBlock: report.pinnedBlock,
      scoutLeadCount: report.scoutLeadCount,
      results: report.results.map((item) => ({
        scoutRank: item.scoutRank,
        scoutRoute: item.scoutRoute,
        scoutSpreadBps: item.scoutSpreadBps,
        status: item.status,
        reason: item.reason,
        pinnedBlock: item.pinnedBlock,
        exactPoolMatch: item.exactPoolMatch,
        bestTradeSizeUsdc: item.bestTradeSizeUsdc,
        bestEstimatedNetUsdc: item.bestEstimatedNetUsdc,
        decision: item.decision,
      })),
    };
    byKey.set(run.generatedAt + '|' + run.pinnedBlock, run);
  }
  return {
    version: 1,
    timezone: 'America/Chicago',
    retentionDays: 30,
    updatedAt: new Date(now).toISOString(),
    runs: [...byKey.values()].sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt)),
  };
}

async function main(): Promise<void> {
  const [inputHistory, inputReport] = await Promise.all([
    readFile(process.argv[2] || 'artifacts/central/intelligence-history.json', 'utf8'),
    readFile(process.argv[3] || 'artifacts/scout-verification.json', 'utf8'),
  ]);
  const current = JSON.parse(inputHistory) as IntelligenceHistory;
  const report = JSON.parse(inputReport) as VerificationReport;
  const updated = mergeIntelligence(current, report);
  const path = process.argv[4] || 'artifacts/central/intelligence-history.next.json';
  await writeFile(path, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  console.log('Opportunity Intelligence: ' + updated.runs.length + ' saved verifier runs');
}

if (process.argv[1]?.endsWith('update-intelligence-history.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
