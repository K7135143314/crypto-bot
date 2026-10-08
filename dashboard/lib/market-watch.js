// Read-only, six-market discovery on Base. No wallet, transaction or profit assertions.
export const TOKENS = Object.freeze({
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  AERO: '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
  cbBTC: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
  VIRTUAL: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',
  USDT: '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2',
});
export const MARKETS = Object.freeze([
  { key: 'WETH/USDC', base: TOKENS.WETH, quote: TOKENS.USDC },
  { key: 'AERO/USDC', base: TOKENS.AERO, quote: TOKENS.USDC },
  { key: 'cbBTC/USDC', base: TOKENS.cbBTC, quote: TOKENS.USDC },
  { key: 'VIRTUAL/WETH', base: TOKENS.VIRTUAL, quote: TOKENS.WETH },
  { key: 'WETH/USDT', base: TOKENS.WETH, quote: TOKENS.USDT },
  { key: 'USDC/USDT', base: TOKENS.USDC, quote: TOKENS.USDT },
]);
export const POLICY = Object.freeze({
  minLiquidityUsd: 100000,
  minVolume24hUsd: 50000,
  minSpreadBps: 5,
  maxPools: 20,
});
const lower = (x) => String(x || '').toLowerCase();
const positive = (x) => {
  const value = Number(x);
  return Number.isFinite(value) && value > 0 ? value : null;
};
const validAddress = (x) => /^0x[a-f0-9]{40}$/.test(lower(x));

export function eligibleMarketPools(market, inputPairs, policy = POLICY) {
  if (!Array.isArray(inputPairs)) return [];
  const deduplicated = new Map();
  for (const pair of inputPairs) {
    if (lower(pair?.chainId) !== 'base') continue;
    const first = lower(pair.baseToken?.address);
    const second = lower(pair.quoteToken?.address);
    const forward = first === market.base && second === market.quote;
    const reverse = second === market.base && first === market.quote;
    if (!forward && !reverse) continue;
    // DEX Screener priceNative is in QUOTE tokens per BASE token, not USD.
    // For reversed pool ordering, invert it to express all quotes consistently.
    const nativePrice = positive(pair.priceNative);
    const quotePerBase = nativePrice && (forward ? nativePrice : 1 / nativePrice);
    const liquidityUsd = positive(pair.liquidity?.usd);
    const volume24hUsd = positive(pair.volume?.h24);
    const dexId = lower(pair.dexId);
    const address = lower(pair.pairAddress);
    if (!validAddress(address) || !dexId || !positive(quotePerBase) ||
        !liquidityUsd || !volume24hUsd ||
        liquidityUsd < policy.minLiquidityUsd ||
        volume24hUsd < policy.minVolume24hUsd) continue;
    const item = { dex: dexId, address, quotePerBase, liquidityUsd, volume24hUsd };
    deduplicated.set(address, item);
  }
  return [...deduplicated.values()].sort((a, b) => b.liquidityUsd - a.liquidityUsd)
    .slice(0, policy.maxPools);
}

export function evaluateMarket(market, pairs, observedAt, policy = POLICY) {
  const pools = eligibleMarketPools(market, pairs, policy);
  const exchanges = new Set(pools.map((p) => p.dex));
  const leads = [];
  for (let i = 0; i < pools.length; i += 1) {
    for (let j = i + 1; j < pools.length; j += 1) {
      const a = pools[i], b = pools[j];
      if (a.dex === b.dex) continue;
      const buy = a.quotePerBase <= b.quotePerBase ? a : b;
      const sell = buy === a ? b : a;
      const spreadBps = (sell.quotePerBase / buy.quotePerBase - 1) * 10000;
      if (!Number.isFinite(spreadBps) || spreadBps < 0) continue;
      leads.push({
        buyDex: buy.dex, sellDex: sell.dex,
        buyPool: buy.address, sellPool: sell.address,
        indicatedSpreadBps: Number(spreadBps.toFixed(4)),
        minLiquidityUsd: Math.min(buy.liquidityUsd, sell.liquidityUsd),
        minVolume24hUsd: Math.min(buy.volume24hUsd, sell.volume24hUsd),
        status: spreadBps >= policy.minSpreadBps ? 'SHORTLIST' : 'WATCH',
        verification: 'NOT_VERIFIED',
      });
    }
  }
  leads.sort((a, b) => b.indicatedSpreadBps - a.indicatedSpreadBps);
  return {
    market: market.key, observedAt, chain: 'Base', status:
      pools.length === 0 ? 'NO_ELIGIBLE_POOLS_IN_SOURCE' :
      exchanges.size < 2 ? 'INSUFFICIENT_DEX_COVERAGE' : 'DISCOVERY_ONLY',
    eligiblePools: pools.length, eligibleDexes: exchanges.size,
    sourcePairCount: Array.isArray(pairs) ? pairs.length : 0,
    best: leads[0] || null, topLeads: leads.slice(0, 3),
    verifiedCandidates: 0, verification: 'NOT_VERIFIED',
  };
}

export async function fetchTokenPairs(address, fetchImpl = fetch) {
  const endpoint = 'https://api.dexscreener.com/token-pairs/v1/base/' + address;
  const response = await fetchImpl(endpoint, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('DEX Screener HTTP ' + response.status);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Unexpected DEX Screener response');
  return rows;
}

export async function scanSixMarkets(fetchImpl = fetch, observedAt = new Date().toISOString()) {
  // A token endpoint may not return every relevant pool. Search both tokens
  // for each requested pair, then deduplicate exact pool addresses.
  const tokens = [...new Set(MARKETS.flatMap((market) => [market.base, market.quote]))];
  const fetched = new Map();
  for (const token of tokens) {
    try { fetched.set(token, { pairs: await fetchTokenPairs(token, fetchImpl) }); }
    catch (error) { fetched.set(token, { error: String(error) }); }
  }
  const results = [];
  for (const market of MARKETS) {
    const left = fetched.get(market.base), right = fetched.get(market.quote);
    // One successful token lookup is still usable, but source coverage is partial.
    const records = [left, right].filter((record) => Array.isArray(record?.pairs));
    const allPairs = records.flatMap((record) => record.pairs);
    const data = evaluateMarket(market, allPairs, observedAt);
    data.sourceCoverage = records.length === 2 ? 'TWO_TOKEN_SEARCH' :
      records.length === 1 ? 'PARTIAL_SOURCE' : 'SOURCE_ERROR';
    if (records.length === 0) {
      data.status = 'SOURCE_ERROR';
      data.best = null;
      data.topLeads = [];
      data.reason = [left.error, right.error].join(' | ');
    } else if (records.length === 1) {
      data.reason = 'One token search failed; results may omit eligible pools.';
    }
    results.push(data);
  }
  return { version: 1, source: 'DEX Screener', chain: 'Base',
    readOnly: true, executionAuthorized: false, generatedAt: observedAt,
    disclaimer: 'Indicative pool-price discovery only; not executable quotes or net profits.',
    markets: results };
}
