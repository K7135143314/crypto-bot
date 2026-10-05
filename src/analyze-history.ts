import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HistoricalScanReport } from './history.js';
import { summarizeRollingHistory } from './rolling-history.js';

const historyDir = process.argv[2] || 'artifacts/history';

async function main(): Promise<void> {
  const files = (await readdir(historyDir))
    .filter((name) => name.endsWith('.json'))
    .sort();

  const reports: HistoricalScanReport[] = [];

  for (const file of files) {
    const report = JSON.parse(
      await readFile(join(historyDir, file), 'utf8'),
    ) as HistoricalScanReport;
    reports.push(report);
  }

  const summary = summarizeRollingHistory(reports);

  const money = (value: number | undefined) =>
    value === undefined ? 'n/a' : `$${value.toFixed(6)}`;

  const markdown = [
    '# Rolling observation history',
    '',
    `- Samples: **${summary.sampleCount}**`,
    `- Rolling direction: **${summary.direction}**`,
    `- Candidate scans: **${summary.candidateScanCount}**`,
    `- Candidate routes observed: **${summary.candidateRouteCount}**`,
    `- First best estimated net: **${money(summary.firstBestNetUsdc)}**`,
    `- Latest best estimated net: **${money(summary.latestBestNetUsdc)}**`,
    `- Change from first sample: **${money(summary.netChangeFromFirstUsdc)}**`,
    `- Average best estimated net: **${money(summary.averageBestNetUsdc)}**`,
    `- Best estimated net seen: **${money(summary.bestEverNetUsdc)}**`,
    summary.bestEverRow
      ? `- Best observed route: **${summary.bestEverRow.route}**, start **$${summary.bestEverRow.startUsdc}**`
      : '- Best observed route: unavailable',
    '',
    '> Rolling read-only research data. Historical improvement does not guarantee an executable profit.',
    '',
  ].join('\n');

  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/rolling-history.json',
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  );
  await writeFile('artifacts/rolling-history.md', markdown, 'utf8');

  console.log(markdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
