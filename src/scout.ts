import { TOKENS } from './config.js';

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

const lower = (value?: string) => (value || '').toLowerCase();

function positiveNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function selectEligiblePools(
  pairs: readonly DexScreenerPair[],
  config: ScoutConfig,
): EligiblePool[] {
  const weth = lower(TOKENS.WETH.address);
  const usdc = lower(TOKENS.USDC.address);

  return pairs
    .filter((pair) => lower(pair.chainId) === 'base')
    .filter((pair) => lower(pair.baseToken?.address) === weth)
    .filter((pair) => lower(pair.quoteToken?.address) === usdc)
    .map((pair): EligiblePool | null => {
      const wethPriceUsd = positiveNumber(pair.priceUsd);
      const liquidityUsd = positiveNumber(pair.liquidity?.usd);
      const volume24hUsd = positiveNumber(pair.volume?.h24);
      const dexId = pair.dexId?.trim();
      const pairAddress = pair.pairAddress?.trim();

      if (!wethPriceUsd || !liquidityUsd || !volume24hUsd || !dexId || !pairAddress) {
        return null;
      }

      if (liquidityUsd < config.minLiquidityUsd || volume24hUsd < config.minVolume24hUsd) {
        return null;
      }

      return {
        dexId,
        pairAddress,
        url: pair.url,
        labels: pair.labels || [],
        wethPriceUsd,
        liquidityUsd,
        volume24hUsd,
      };
    })
    .filter((pool): pool is EligiblePool => pool !== null)
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
    .slice(0, config.maxPools);
}

export function rankCrossDexOpportunities(
  pools: readonly EligiblePool[],
  config: ScoutConfig,
): ScoutOpportunity[] {
  const opportunities: ScoutOpportunity[] = [];

  for (let i = 0; i < pools.length; i += 1) {
    for (let j = i + 1; j < pools.length; j += 1) {
      const a = pools[i]!;
      const b = pools[j]!;

      if (a.dexId === b.dexId) continue;

      const buy = a.wethPriceUsd <= b.wethPriceUsd ? a : b;
      const sell = buy === a ? b : a;
      const indicatedSpreadBps = ((sell.wethPriceUsd - buy.wethPriceUsd) / buy.wethPriceUsd) * 10_000;

      opportunities.push({
        buyDex: buy.dexId,
        buyPairAddress: buy.pairAddress,
        buyPriceUsd: buy.wethPriceUsd,
        sellDex: sell.dexId,
        sellPairAddress: sell.pairAddress,
        sellPriceUsd: sell.wethPriceUsd,
        indicatedSpreadBps: Number(indicatedSpreadBps.toFixed(4)),
        minLiquidityUsd: Math.min(a.liquidityUsd, b.liquidityUsd),
        minVolume24hUsd: Math.min(a.volume24hUsd, b.volume24hUsd),
        status: indicatedSpreadBps >= config.minSpreadBps ? 'SHORTLIST' : 'WATCH',
      });
    }
  }

  return opportunities
    .sort((a, b) => {
      if (b.indicatedSpreadBps !== a.indicatedSpreadBps) {
        return b.indicatedSpreadBps - a.indicatedSpreadBps;
      }
      return b.minLiquidityUsd - a.minLiquidityUsd;
    })
    .slice(0, config.maxOpportunities);
}

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
