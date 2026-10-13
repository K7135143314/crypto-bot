// Deterministic read-only watchlist from centrally saved, pinned-block quote history.
// This NEVER estimates missing scans, executes transactions, or asserts executable profit.
const QUOTED = new Set(['QUOTE_REJECT', 'QUOTE_CANDIDATE']);
const ADDRESS = /^0x[a-f0-9]{40}$/i;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const FRESH_MS = 2 * 60 * 60 * 1000;
const TREND_THRESHOLD_USDC = 0.05;

const finiteValue = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const safeRun = (run, now) => run?.readOnly === true &&
  run.executionAuthorized === false && Array.isArray(run.results) &&
  Number.isFinite(Date.parse(run.generatedAt)) &&
  Date.parse(run.generatedAt) <= now;

const routeKey = (r) => [
  r.market, r.buyDex, r.sellDex, r.buyPool, r.sellPool,
].map((part) => String(part || '').toLowerCase()).join('|');

function isQuote(r) {
  return r && QUOTED.has(r.status) && r.exactPoolMatch === true &&
    typeof r.market === 'string' && r.market.includes('/') &&
    typeof r.buyDex === 'string' && typeof r.sellDex === 'string' &&
    ADDRESS.test(r.buyPool || '') && ADDRESS.test(r.sellPool || '');
}
function quotedNetAtSize(result, size) {
  if (!isQuote(result)) return null;
  const fromRow = Array.isArray(result.rows)
    ? result.rows.find((r) => String(r.sizeUsdc) === String(size) &&
        finiteValue(r.estimatedNetUsdc) !== null)
    : null;
  if (fromRow) return finiteValue(fromRow.estimatedNetUsdc);
  if (String(result.bestTradeSizeUsdc) === String(size))
    return finiteValue(result.bestEstimatedNetUsdc);
  return null;
}

export function buildOpportunityWatchlist(history, now = Date.now(), maxItems = 5) {
  if (!Number.isFinite(now)) throw new TypeError('Invalid measurement time');
  const runs = (Array.isArray(history?.runs) ? history.runs : [])
    .filter((run) => safeRun(run, now))
    .sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));
  const latest = runs.at(-1);
  const latestAt = latest?.generatedAt ?? null;
  const latestAgeMinutes = latestAt === null ? null :
    Math.floor((now - Date.parse(latestAt)) / 60000);
  if (!latest) {
    return {readOnly:true,executionAuthorized:false,latestAt:null,
      latestAgeMinutes:null,state:'NO_DATA',candidates:0,
      quotedRoutes:0,unverifiedResults:0,items:[]};
  }

  const unique = new Map();
  for (const result of latest.results) {
    if (!isQuote(result)) continue;
    const size = String(result.bestTradeSizeUsdc ?? '');
    const net = quotedNetAtSize(result, size);
    if (!size || finiteValue(size) === null || Number(size) <= 0 || net === null) continue;
    const key = routeKey(result);
    const previous = unique.get(key);
    if (!previous || net > previous.net) unique.set(key, {result, size, net});
  }

  const earlier = runs.slice(0, -1).filter((run) =>
    Date.parse(run.generatedAt) >= Date.parse(latest.generatedAt) - LOOKBACK_MS);
  const items = [...unique.values()].map(({result, size, net}) => {
    const key = routeKey(result);
    let baseline = null;
    for (let i = earlier.length - 1; i >= 0 && !baseline; i--) {
      const run = earlier[i];
      for (const prior of run.results) {
        if (routeKey(prior) !== key) continue;
        const earlierNet = quotedNetAtSize(prior, size);
        if (earlierNet === null) continue;
        baseline = {net:earlierNet,at:run.generatedAt};
        break;
      }
    }
    const deltaNetUsdc = baseline === null ? null :
      Number((net - baseline.net).toFixed(6));
    const trend = deltaNetUsdc === null ? 'NO_COMPARABLE_SCAN' :
      deltaNetUsdc >= TREND_THRESHOLD_USDC ? 'IMPROVING' :
      deltaNetUsdc <= -TREND_THRESHOLD_USDC ? 'WORSENING' : 'STABLE';
    return {
      market:result.market,buyDex:result.buyDex,sellDex:result.sellDex,
      buyPool:result.buyPool,sellPool:result.sellPool,
      bestTradeSizeUsdc:size,latestNetUsdc:Number(net.toFixed(6)),
      previousNetUsdc:baseline?.net ?? null,
      previousAt:baseline?.at ?? null,deltaNetUsdc,trend,
      quoteStatus:result.status,atomicSimulation:'NOT_RUN',
      modeledCandidate:result.status === 'QUOTE_CANDIDATE' && net > 0,
      requiresForkSimulation:result.status === 'QUOTE_CANDIDATE' && net > 0,
    };
  }).sort((a,b)=>
    Number(b.modeledCandidate)-Number(a.modeledCandidate) ||
    b.latestNetUsdc-a.latestNetUsdc ||
    String(a.market).localeCompare(String(b.market)) ||
    String(a.buyPool).localeCompare(String(b.buyPool)));

  return {readOnly:true,executionAuthorized:false,
    latestAt,latestAgeMinutes,
    state:now-Date.parse(latestAt)>FRESH_MS?'STALE':'CURRENT',
    candidates:items.filter((r)=>r.modeledCandidate).length,
    quotedRoutes:items.length,
    unverifiedResults:latest.results.length - [...latest.results].filter(isQuote).length,
    items:items.slice(0,Math.max(0,Math.min(10,Math.floor(maxItems)||0))),
    note:'A watchlist ranks only pinned-block cost-adjusted quotes from the most recent saved run. Improvements compare the same market, buy and sell pools, direction, and USDC trade size. No prediction, execution, or fork confirmation.',
  };
}
