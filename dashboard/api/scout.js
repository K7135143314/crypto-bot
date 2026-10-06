const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const POLICY = {
  minLiquidityUsd: 100000,
  minVolume24hUsd: 50000,
  minSpreadBps: 5,
  maxPools: 20,
  maxOpportunities: 20,
};

const lower = (value = '') => String(value).toLowerCase();

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function selectEligiblePools(pairs) {
  return pairs
    .filter((pair) => lower(pair.chainId) === 'base')
    .filter((pair) => lower(pair.baseToken?.address) === lower(WETH))
    .filter((pair) => lower(pair.quoteToken?.address) === lower(USDC))
    .map((pair) => {
      const wethPriceUsd = positiveNumber(pair.priceUsd);
      const liquidityUsd = positiveNumber(pair.liquidity?.usd);
      const volume24hUsd = positiveNumber(pair.volume?.h24);
      const dexId = pair.dexId?.trim();
      const pairAddress = pair.pairAddress?.trim();

      if (!wethPriceUsd || !liquidityUsd || !volume24hUsd || !dexId || !pairAddress) {
        return null;
      }

      if (
        liquidityUsd < POLICY.minLiquidityUsd ||
        volume24hUsd < POLICY.minVolume24hUsd
      ) {
        return null;
      }

      return {
        dexId,
        pairAddress,
        url: pair.url || null,
        labels: pair.labels || [],
        wethPriceUsd,
        liquidityUsd,
        volume24hUsd,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
    .slice(0, POLICY.maxPools);
}

function rankOpportunities(pools) {
  const opportunities = [];

  for (let i = 0; i < pools.length; i += 1) {
    for (let j = i + 1; j < pools.length; j += 1) {
      const a = pools[i];
      const b = pools[j];

      if (a.dexId === b.dexId) continue;

      const buy = a.wethPriceUsd <= b.wethPriceUsd ? a : b;
      const sell = buy === a ? b : a;
      const indicatedSpreadBps =
        ((sell.wethPriceUsd - buy.wethPriceUsd) / buy.wethPriceUsd) * 10000;

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
        status: indicatedSpreadBps >= POLICY.minSpreadBps ? 'SHORTLIST' : 'WATCH',
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
    .slice(0, POLICY.maxOpportunities);
}

export default async function handler(req, res) {
  try {
    const endpoint =
      'https://api.dexscreener.com/token-pairs/v1/base/' + WETH;

    const response = await fetch(endpoint, {
      headers: {
        accept: 'application/json',
        'user-agent': 'crypto-bot-dashboard-scout/0.1',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      throw new Error('DEX Screener request failed: HTTP ' + response.status);
    }

    const pairs = await response.json();

    if (!Array.isArray(pairs)) {
      throw new Error('DEX Screener returned an unexpected response shape');
    }

    const eligiblePools = selectEligiblePools(pairs);
    const opportunities = rankOpportunities(eligiblePools);
    const shortlistCount = opportunities.filter(
      (item) => item.status === 'SHORTLIST'
    ).length;

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      ok: true,
      readOnly: true,
      executionAuthorized: false,
      generatedAt: new Date().toISOString(),
      source: 'DEX Screener',
      chain: 'Base',
      pair: 'WETH/USDC',
      policy: POLICY,
      sourcePairCount: pairs.length,
      eligiblePoolCount: eligiblePools.length,
      shortlistCount,
      best: opportunities[0] || null,
      opportunities: opportunities.slice(0, 5),
      note:
        'Discovery lead only. Direct on-chain quote and existing profitability/simulation gates remain required.',
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(500).json({
      ok: false,
      readOnly: true,
      executionAuthorized: false,
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
