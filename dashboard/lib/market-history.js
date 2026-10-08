export const MARKET_KEYS = ['WETH/USDC','AERO/USDC','cbBTC/USDC','VIRTUAL/WETH','WETH/USDT','USDC/USDT'];
export function mergeMarketHistory(previous, report, now = Date.now()) {
  if (!report || report.readOnly !== true || report.executionAuthorized !== false ||
      !Array.isArray(report.markets) || report.markets.length !== 6 ||
      !Number.isFinite(Date.parse(report.generatedAt)) ||
      !MARKET_KEYS.every((key) => report.markets.some((market) => market.market === key))) {
    throw new Error('Invalid six-market research report');
  }
  const cutoff = now - 30 * 86400_000;
  const records = new Map();
  for (const run of previous?.runs || []) {
    if (Number.isFinite(Date.parse(run.generatedAt)) && Date.parse(run.generatedAt) >= cutoff) records.set(run.generatedAt, run);
  }
  if (Date.parse(report.generatedAt) >= cutoff) {
    records.set(report.generatedAt, {
      generatedAt: report.generatedAt, source: 'scheduled-six-market-collector',
      markets: report.markets.map((m) => ({
        market: m.market, status: m.status, sourceCoverage: m.sourceCoverage || 'UNKNOWN',
        eligiblePools: m.eligiblePools, eligibleDexes: m.eligibleDexes,
        indicatedSpreadBps: m.best?.indicatedSpreadBps ?? null,
        buyDex: m.best?.buyDex || null, sellDex: m.best?.sellDex || null,
        buyPool: m.best?.buyPool || null, sellPool: m.best?.sellPool || null,
        verifiedCandidates: 0, verification: 'NOT_VERIFIED',
      })),
    });
  }
  const runs = [...records.values()].sort((a, b) => Date.parse(a.generatedAt)-Date.parse(b.generatedAt));
  return { version: 1, timezone: 'America/Chicago', retentionDays: 30,
    updatedAt: new Date(now).toISOString(), runs };
}
