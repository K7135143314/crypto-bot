import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
const backfillDir = process.argv[5];

function bestRow(report: ScanReport): ScanRow {
  const row = [...report.rows].sort(
    (a, b) => Number(b.estimatedNetUsdc) - Number(a.estimatedNetUsdc),
  )[0];

  if (!row) throw new Error('Latest scan has no rows');
  return row;
}

function observationFromScan(scan: ScanReport): Observation {
  const best = bestRow(scan);

  return {
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
}

async function readBackfillScans(directory: string | undefined): Promise<ScanReport[]> {
  if (!directory) return [];

  const files = (await readdir(directory))
    .filter((name) => name.endsWith('.json'))
    .sort();

  const scans: ScanReport[] = [];

  for (const file of files) {
    try {
      const scan = JSON.parse(
        await readFile(join(directory, file), 'utf8'),
      ) as ScanReport;

      if (
        typeof scan.generatedAt === 'string' &&
        typeof scan.blockNumber === 'string' &&
        Array.isArray(scan.rows)
      ) {
        scans.push(scan);
      }
    } catch (error) {
      console.warn(`Skipping invalid backfill file ${file}`, error);
    }
  }

  return scans;
}

async function main(): Promise<void> {
  const [historyRaw, scanRaw, backfillScans] = await Promise.all([
    readFile(historyPath, 'utf8'),
    readFile(scanPath, 'utf8'),
    readBackfillScans(backfillDir),
  ]);

  const history = JSON.parse(historyRaw) as CentralHistory;
  const scan = JSON.parse(scanRaw) as ScanReport;
  const observation = observationFromScan(scan);

  const retentionDays = 30;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const byTimestamp = new Map<string, Observation>();

  for (const item of history.observations || []) {
    if (Date.parse(item.generatedAt) >= cutoff) {
      byTimestamp.set(item.generatedAt, item);
    }
  }

  for (const historicalScan of backfillScans) {
    const item = observationFromScan(historicalScan);
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
    `Central history updated: ${observations.length} observation(s), including ${backfillScans.length} backfill scan file(s), latest ${observation.generatedAt}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
