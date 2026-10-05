import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HistoricalScanReport } from './history.js';
import {
  classifyPaperOutcome,
  summarizePaperReplay,
  type PaperReplayItem,
} from './paper.js';

const historyDir = process.argv[2] || 'artifacts/history';

function blockNumber(report: HistoricalScanReport): bigint {
  try {
    return BigInt(report.blockNumber);
  } catch {
    return 0n;
  }
}

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

  reports.sort(
    (a, b) =>
      new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime(),
  );

  const items: PaperReplayItem[] = [];

  for (let index = 0; index < reports.length - 1; index += 1) {
    const current = reports[index]!;
    const later = reports[index + 1]!;
    const elapsed = Number(blockNumber(later) - blockNumber(current));

    for (const row of current.rows.filter((x) => x.decision === 'CANDIDATE')) {
      const laterRow = later.rows.find(
        (x) => x.route === row.route && x.startUsdc === row.startUsdc,
      );

      const laterDecision = laterRow?.decision ?? null;

      items.push({
        route: row.route,
        startUsdc: row.startUsdc,
        initialEstimatedNetUsdc: Number(row.estimatedNetUsdc),
        laterEstimatedNetUsdc: laterRow
          ? Number(laterRow.estimatedNetUsdc)
          : null,
        initialDecision: row.decision,
        laterDecision,
        outcome: classifyPaperOutcome(laterDecision),
        blocksElapsed: elapsed >= 0 ? elapsed : 0,
      });
    }
  }

  const summary = summarizePaperReplay(items);

  const survivalText =
    summary.survivalRatePct === null
      ? 'n/a'
      : summary.survivalRatePct.toFixed(2) + '%';

  const markdown = [
    '# Paper candidate persistence',
    '',
    '- Initial theoretical candidates observed: **' + summary.initialCandidateCount + '**',
    '- Comparable on the next saved scan: **' + summary.comparableCount + '**',
    '- Still candidates one saved scan later: **' + summary.survivedCount + '**',
    '- No longer candidates: **' + summary.expiredCount + '**',
    '- Not comparable: **' + summary.notComparableCount + '**',
    '- Survival rate: **' + survivalText + '**',
    '- Average blocks to recheck: **' + (summary.averageBlocksElapsed ?? 'n/a') + '**',
    '',
    '> Paper research only. A surviving quote is not proof of executable profit and no transaction is sent.',
    '',
  ].join('\n');

  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/paper-persistence.json',
    JSON.stringify({ summary, items }, null, 2) + '\n',
    'utf8',
  );
  await writeFile('artifacts/paper-persistence.md', markdown, 'utf8');

  console.log(markdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
