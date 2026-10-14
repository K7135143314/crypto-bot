
export type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  labels?: string[];
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string | null;
  liquidity?: { usd?: number | null } | null;
  volume?: Record<string, number> | null;
};

export type ScoutConfig = {
  minLiquidityUsd: number;
  minVolume24hUsd: number;
  minSpreadBps: number;
  maxPools: number;
  maxOpportunities: number;
};

export type EligiblePool = {
  dexId: string;
  pairAddress: string;
  url?: string;
  labels: string[];
  wethPriceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
};

export type ScoutOpportunity = {
  buyDex: string;
  buyPairAddress: string;
  buyPriceUsd: number;
  sellDex: string;
  sellPairAddress: string;
  sellPriceUsd: number;
  indicatedSpreadBps: number;
  minLiquidityUsd: number;
  minVolume24hUsd: number;
  status: 'SHORTLIST' | 'WATCH';
};

// Canonical implementation also powers dashboard/api/scout.js.
export { selectEligiblePools, rankCrossDexOpportunities } from '../dashboard/lib/scout-core.js';
import { selectEligiblePools, rankCrossDexOpportunities } from '../dashboard/lib/scout-core.js';

export function buildScoutReport(
  pairs: readonly DexScreenerPair[],
  config: ScoutConfig,
  generatedAt = new Date().toISOString(),
) {
  const eligiblePools = selectEligiblePools(pairs, config);
  const opportunities = rankCrossDexOpportunities(eligiblePools, config);

  return {
    scoutVersion: '0.1.0',
    readOnly: true,
    executionAuthorized: false,
    generatedAt,
    chain: 'Base',
    chainId: 8453,
    pair: 'WETH/USDC',
    discoverySource: 'DEX Screener',
    policy: config,
    sourcePairCount: pairs.length,
    eligiblePoolCount: eligiblePools.length,
    shortlistCount: opportunities.filter((x) => x.status === 'SHORTLIST').length,
    eligiblePools,
    opportunities,
    note: 'Discovery data is indicative only. Every opportunity must be re-quoted directly on-chain at one pinned Base block and pass the existing profitability and simulation gates before further consideration.',
  };
}
