import { readFile, writeFile } from 'node:fs/promises';

type ScanRow = {
  route: string;
  startUsdc: string;
  estimatedNetUsdc: string;
  decision: string;
};

type ScanReport = {
  generatedAt: string;
  blockNumber: string;
  candidateCount: number;
  liveInputs?: {
    approximateWethPriceUsdc?: number;
    gasPriceGwei?: number;
  };
  rows: ScanRow[];
};

type Observation = {
  generatedAt: string;
  blockNumber: string;
  candidateCount: number;
  bestRoute: string;
  bestStartUsdc: number;
  bestNetUsdc: number;
  wethReferencePrice: number | null;
  gasPriceGwei: number | null;
};

type CentralHistory = {
  version: number;
  source: string;
  timezone: string;
  retentionDays: number;
  updatedAt: string | null;
  observations: Observation[];
};

const historyPath = process.argv[2] || 'data/history.json';
const scanPath = process.argv[3] || 'artifacts/latest-scan.json';
const outputPath = process.argv[4] || 'artifacts/central-history.json';

function bestRow(report: ScanReport): ScanRow {
  const row = [...report.rows].sort(
    (a, b) => Number(b.estimatedNetUsdc) - Number(a.estimatedNetUsdc),
  )[0];

  if (!row) throw new Error('Latest scan has no rows');
  return row;
}

async function main(): Promise<void> {
  const [historyRaw, scanRaw] = await Promise.all([
    readFile(historyPath, 'utf8'),
    readFile(scanPath, 'utf8'),
  ]);

  const history = JSON.parse(historyRaw) as CentralHistory;
  const scan = JSON.parse(scanRaw) as ScanReport;
  const best = bestRow(scan);

  const observation: Observation = {
    generatedAt: scan.generatedAt,
    blockNumber: scan.blockNumber,
    candidateCount: scan.candidateCount,
    bestRoute: best.route,
    bestStartUsdc: Number(best.startUsdc),
    bestNetUsdc: Number(best.estimatedNetUsdc),
    wethReferencePrice:
      Number.isFinite(Number(scan.liveInputs?.approximateWethPriceUsdc))
        ? Number(scan.liveInputs?.approximateWethPriceUsdc)
        : null,
    gasPriceGwei:
      Number.isFinite(Number(scan.liveInputs?.gasPriceGwei))
        ? Number(scan.liveInputs?.gasPriceGwei)
        : null,
  };

  const retentionDays = 30;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const byTimestamp = new Map<string, Observation>();

  for (const item of history.observations || []) {
    if (Date.parse(item.generatedAt) >= cutoff) {
      byTimestamp.set(item.generatedAt, item);
    }
  }

  byTimestamp.set(observation.generatedAt, observation);

  const observations = [...byTimestamp.values()]
    .filter((item) => Number.isFinite(Date.parse(item.generatedAt)))
    .sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));

  const next: CentralHistory = {
    version: 1,
    source: 'hourly-research-collector',
    timezone: 'America/Chicago',
    retentionDays,
    updatedAt: new Date().toISOString(),
    observations,
  };

  await writeFile(outputPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(
    `Central history updated: ${observations.length} observation(s), latest ${observation.generatedAt}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
