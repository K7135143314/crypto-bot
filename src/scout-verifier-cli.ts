import { mkdir, writeFile } from 'node:fs/promises';
import { client } from './quotes.js';
import {
  fetchScoutOpportunities,
  verifyScoutOpportunity,
  type HandoffVerification,
} from './scout-verifier.js';

async function main(): Promise<void> {
  const blockNumber = await client.getBlockNumber();
  const opportunities = await fetchScoutOpportunities();
  const top = opportunities.slice(0, 5);
  const results: HandoffVerification[] = [];

  for (let i = 0; i < top.length; i += 1) {
    results.push(await verifyScoutOpportunity(top[i]!, i + 1, blockNumber));
  }

  const verifiedCandidates = results.filter((x) => x.status === 'VERIFIED_CANDIDATE');
  const verifiedRejects = results.filter((x) => x.status === 'VERIFIED_REJECT');
  const unsupported = results.filter((x) =>
    x.status === 'UNSUPPORTED_DEX' || x.status === 'UNSUPPORTED_POOL_VARIANT'
  );

  const report = {
    verifierVersion: '0.1.0',
    readOnly: true,
    executionAuthorized: false,
    generatedAt: new Date().toISOString(),
    chain: 'Base',
    pinnedBlock: blockNumber.toString(),
    scoutLeadCount: top.length,
    verifiedCandidateCount: verifiedCandidates.length,
    verifiedRejectCount: verifiedRejects.length,
    unsupportedCount: unsupported.length,
    results,
    note: 'A VERIFIED_CANDIDATE is still a research/simulation candidate only. No wallet, signing, or transaction execution is enabled.',
  };

  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/scout-verification.json',
    JSON.stringify(report, null, 2) + '\n',
    'utf8',
  );

  const lines = [
    '# Scout → direct verifier handoff',
    '',
    `- Base block: ${report.pinnedBlock}`,
    `- Scout leads reviewed: ${report.scoutLeadCount}`,
    `- Verified candidates: ${report.verifiedCandidateCount}`,
    `- Verified rejects: ${report.verifiedRejectCount}`,
    `- Unsupported/unverified leads: ${report.unsupportedCount}`,
    '',
    '## Results',
    '',
    ...results.map((result) =>
      `- #${result.scoutRank} **${result.scoutRoute}** — scout ${result.scoutSpreadBps.toFixed(2)} bps — **${result.status}** — ${result.reason}`
    ),
    '',
    '> Read only. No wallet, signing, or transactions.',
    '',
  ];

  await writeFile('artifacts/scout-verification.md', lines.join('\n'), 'utf8');

  console.log('Scout → Direct Verifier V0.1 — READ ONLY');
  for (const result of results) {
    console.log(
      `#${result.scoutRank} ${result.scoutRoute} | ${result.scoutSpreadBps.toFixed(2)} bps | ${result.status}`,
    );
  }
  console.log('No wallet. No signing. No transactions.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
