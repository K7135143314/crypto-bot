import assert from 'node:assert/strict';
import test from 'node:test';
import { TOKENS } from './config.js';
import {
  buildScoutReport,
  rankCrossDexOpportunities,
  selectEligiblePools,
  type DexScreenerPair,
  type ScoutConfig,
} from './scout.js';

const address = (digit: string) => '0x' + digit.repeat(40);

const config: ScoutConfig = {
  minLiquidityUsd: 100_000,
  minVolume24hUsd: 50_000,
  minSpreadBps: 5,
  maxPools: 20,
  maxOpportunities: 20,
};

function pair(
  dexId: string,
  pairAddress: string,
  priceUsd: string,
  liquidityUsd: number,
  volume24hUsd: number,
): DexScreenerPair {
  return {
    chainId: 'base',
    dexId,
    pairAddress,
    baseToken: { address: TOKENS.WETH.address, symbol: 'WETH' },
    quoteToken: { address: TOKENS.USDC.address, symbol: 'USDC' },
    priceUsd,
    liquidity: { usd: liquidityUsd },
    volume: { h24: volume24hUsd },
  };
}

test('filters to liquid Base WETH/USDC pools', () => {
  const rows: DexScreenerPair[] = [
    pair('aerodrome', address('a'), '3500', 2_000_000, 500_000),
    pair('uniswap', address('b'), '3502', 1_000_000, 300_000),
    pair('tiny', address('c'), '3600', 10_000, 1_000),
    { ...pair('wrong-chain', address('d'), '3500', 1_000_000, 300_000), chainId: 'ethereum' },
  ];

  const pools = selectEligiblePools(rows, config);
  assert.deepEqual(pools.map((x) => x.dexId), ['aerodrome', 'uniswap']);
});

test('rejects bytes32 pool identifiers before shortlisting', () => {
  const report = buildScoutReport([
    pair('aerodrome', '0x' + 'f'.repeat(64), '3600', 5_000_000, 1_000_000),
    pair('aerodrome', address('a'), '3500', 2_000_000, 500_000),
    pair('uniswap', address('b'), '3503.5', 1_000_000, 300_000),
  ], config);
  assert.equal(report.eligiblePoolCount, 2);
  assert.ok(report.opportunities.every((lead) =>
    lead.buyPairAddress !== '0x' + 'f'.repeat(64) &&
    lead.sellPairAddress !== '0x' + 'f'.repeat(64)));
});

test('ranks the cheaper DEX as buy and the higher DEX as sell', () => {
  const pools = selectEligiblePools([
    pair('aerodrome', address('a'), '3500', 2_000_000, 500_000),
    pair('uniswap', address('b'), '3503.5', 1_000_000, 300_000),
    pair('third-dex', address('c'), '3501', 800_000, 250_000),
  ], config);

  const opportunities = rankCrossDexOpportunities(pools, config);
  assert.equal(opportunities[0]?.buyDex, 'aerodrome');
  assert.equal(opportunities[0]?.sellDex, 'uniswap');
  assert.equal(opportunities[0]?.indicatedSpreadBps, 10);
  assert.equal(opportunities[0]?.status, 'SHORTLIST');
});

test('keeps small spreads as watch items instead of calling them executable', () => {
  const report = buildScoutReport([
    pair('aerodrome', address('a'), '3500', 2_000_000, 500_000),
    pair('uniswap', address('b'), '3501', 1_000_000, 300_000),
  ], config, '2026-10-06T00:00:00.000Z');

  assert.equal(report.shortlistCount, 0);
  assert.equal(report.opportunities[0]?.status, 'WATCH');
  assert.equal(report.executionAuthorized, false);
  assert.equal(report.readOnly, true);
});
