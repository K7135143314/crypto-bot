import { isAddress } from 'viem';

/**
 * Canonical, read-only indicative DEX Screener discovery rules.
 * Shared by the research CLI and Vercel dashboard. No transactions or signing.
 *
 * Important: displayed spreads are DISCOVERY LEADS, never executable profits.
 */
export const SCOUT_TOKENS = Object.freeze({
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
});

export const DEFAULT_SCOUT_POLICY = Object.freeze({
  minLiquidityUsd: 100_000,
  minVolume24hUsd: 50_000,
  minSpreadBps: 5,
  maxPools: 20,
  maxOpportunities: 20,
});

const lower = (value) => typeof value === 'string' ? value.toLowerCase() : '';

function positiveNumber(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Validate strict eligibility *before* comparing prices: bytes32 DEX identifiers
 * and malformed pool addresses are never allowed into the opportunity shortlist.
 * @param {any[]} pairs
 * @param {typeof DEFAULT_SCOUT_POLICY} config
 */
export function selectEligiblePools(pairs, config = DEFAULT_SCOUT_POLICY) {
  if (!Array.isArray(pairs)) throw new TypeError('DEX Screener pairs must be an array');
  if (!config || Object.values(config).some((value) => !Number.isFinite(value) || value <= 0) ||
      !Number.isInteger(config.maxPools) || !Number.isInteger(config.maxOpportunities)) {
    throw new TypeError('Invalid scout configuration');
  }

  return pairs
    .filter((pair) => pair && lower(pair.chainId) === 'base')
    .filter((pair) => lower(pair.baseToken?.address) === lower(SCOUT_TOKENS.WETH))
    .filter((pair) => lower(pair.quoteToken?.address) === lower(SCOUT_TOKENS.USDC))
    .map((pair) => {
      const wethPriceUsd = positiveNumber(pair.priceUsd);
      const liquidityUsd = positiveNumber(pair.liquidity?.usd);
      const volume24hUsd = positiveNumber(pair.volume?.h24);
      const dexId = typeof pair.dexId === 'string' ? pair.dexId.trim() : '';
      const pairAddress = typeof pair.pairAddress === 'string' ? pair.pairAddress.trim() : '';

      if (!wethPriceUsd || !liquidityUsd || !volume24hUsd || !dexId ||
          !isAddress(pairAddress, { strict: false }) ||
          liquidityUsd < config.minLiquidityUsd || volume24hUsd < config.minVolume24hUsd) {
        return null;
      }

      return {
        dexId,
        pairAddress,
        url: typeof pair.url === 'string' ? pair.url : undefined,
        labels: Array.isArray(pair.labels) ? pair.labels : [],
        wethPriceUsd,
        liquidityUsd,
        volume24hUsd,
      };
    })
    .filter((pool) => pool !== null)
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
    .slice(0, config.maxPools);
}

/**
 * Rank indicative spreads, not tradeable profit. Both DEXes must differ.
 * @param {any[]} pools
 * @param {typeof DEFAULT_SCOUT_POLICY} config
 */
export function rankCrossDexOpportunities(pools, config = DEFAULT_SCOUT_POLICY) {
  const opportunities = [];
  for (let i = 0; i < pools.length; i += 1) {
    for (let j = i + 1; j < pools.length; j += 1) {
      const a = pools[i];
      const b = pools[j];
      if (!a || !b || a.dexId === b.dexId) continue;

      const buy = a.wethPriceUsd <= b.wethPriceUsd ? a : b;
      const sell = buy === a ? b : a;
      const indicatedSpreadBps =
        ((sell.wethPriceUsd - buy.wethPriceUsd) / buy.wethPriceUsd) * 10_000;
      if (!Number.isFinite(indicatedSpreadBps)) continue;

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
