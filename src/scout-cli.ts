import { mkdir, writeFile } from 'node:fs/promises';
import { TOKENS } from './config.js';
import { buildScoutReport, type DexScreenerPair, type ScoutConfig } from './scout.js';

const config: ScoutConfig = {
  minLiquidityUsd: Number(process.env.SCOUT_MIN_LIQUIDITY_USD || '100000'),
  minVolume24hUsd: Number(process.env.SCOUT_MIN_VOLUME_24H_USD || '50000'),
  minSpreadBps: Number(process.env.SCOUT_MIN_SPREAD_BPS || '5'),
  maxPools: Number(process.env.SCOUT_MAX_POOLS || '20'),
  maxOpportunities: Number(process.env.SCOUT_MAX_OPPORTUNITIES || '20'),
};

function assertPositiveConfig(): void {
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid scout configuration ${key}=${value}`);
    }
  }
}

async function fetchPairs(): Promise<DexScreenerPair[]> {
  const endpoint = `https://api.dexscreener.com/token-pairs/v1/base/${TOKENS.WETH.address}`;
  const response = await fetch(endpoint, {
    headers: {
      accept: 'application/json',
      'user-agent': 'crypto-bot-opportunity-scout/0.1',
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`DEX Screener request failed: HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('DEX Screener returned an unexpected response shape.');
  }

  return data as DexScreenerPair[];
}

async function main(): Promise<void> {
  assertPositiveConfig();
  const pairs = await fetchPairs();
  const report = buildScoutReport(pairs, config);

  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/opportunity-scout.json', JSON.stringify(report, null, 2) + '\n', 'utf8');

  const best = report.opportunities[0];
  const lines = [
    '# Opportunity scout — read only',
    '',
    `- Source: ${report.discoverySource}`,
    `- Chain: ${report.chain}`,
    `- Pair: ${report.pair}`,
    `- Source pools returned: ${report.sourcePairCount}`,
    `- Eligible liquid pools: ${report.eligiblePoolCount}`,
    `- Discovery shortlists: ${report.shortlistCount}`,
    '',
    '## Best indicated cross-DEX spread',
    '',
    best
      ? `**${best.buyDex} → ${best.sellDex}** — indicated spread **${best.indicatedSpreadBps.toFixed(4)} bps**, status **${best.status}**.`
      : 'No eligible cross-DEX pool comparison was available.',
    '',
    '> Discovery data is a lead, not an executable quote. The existing direct on-chain scanner remains the verification gate.',
    '',
  ];

  await writeFile('artifacts/opportunity-scout.md', lines.join('\n'), 'utf8');

  console.log('Opportunity Scout V0.1 — READ ONLY');
  console.log(`DEX Screener pools returned: ${report.sourcePairCount}`);
  console.log(`Eligible Base WETH/USDC pools: ${report.eligiblePoolCount}`);
  console.log(`Shortlisted indicated spreads: ${report.shortlistCount}`);
  if (best) {
    console.log(`Best discovery lead: ${best.buyDex} -> ${best.sellDex} at ${best.indicatedSpreadBps.toFixed(4)} bps (${best.status})`);
  }
  console.log('No wallet. No signing. No transactions.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
