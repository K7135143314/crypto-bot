import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { compareScans, type HistoricalScanReport } from './history.js';

const previousPath = process.argv[2] || 'artifacts/previous-scan.json';
const currentPath = process.argv[3] || 'artifacts/latest-scan.json';

async function readReport(path: string): Promise<HistoricalScanReport> {
  return JSON.parse(await readFile(path, 'utf8')) as HistoricalScanReport;
}

async function main(): Promise<void> {
  const current = await readReport(currentPath);
  const previous = existsSync(previousPath)
    ? await readReport(previousPath)
    : undefined;

  const comparison = compareScans(previous, current);
  const best = comparison.currentBest;

  const changeText =
    comparison.estimatedNetChangeUsdc === undefined
      ? 'n/a'
      : `${comparison.estimatedNetChangeUsdc >= 0 ? '+' : ''}${comparison.estimatedNetChangeUsdc.toFixed(6)} USDC`;

  const summary = [
    '# Scan trend',
    '',
    `- Direction: **${comparison.direction}**`,
    `- Previous candidates: ${comparison.previousCandidateCount}`,
    `- Current candidates: ${comparison.currentCandidateCount}`,
    `- Comparable-route estimated net change: ${changeText}`,
    best
      ? `- Current best: **${best.route}**, start **$${best.startUsdc}**, estimated net **$${best.estimatedNetUsdc}**, decision **${best.decision}**`
      : '- Current best: unavailable',
    '',
    '> Read-only historical comparison. This is not a trade instruction.',
    '',
  ].join('\n');

  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/trend.json', JSON.stringify(comparison, null, 2) + '\n', 'utf8');
  await writeFile('artifacts/trend.md', summary, 'utf8');

  console.log(summary);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
