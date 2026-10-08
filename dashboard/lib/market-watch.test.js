import assert from 'node:assert/strict';
import test from 'node:test';
import { TOKENS, MARKETS, eligibleMarketPools, evaluateMarket, scanSixMarkets } from './market-watch.js';
const market = MARKETS[0];
const pool = (dex, address, priceNative, base = market.base, quote = market.quote, liquidity = 200000, volume = 100000) =>
  ({ chainId: 'base', dexId: dex, pairAddress: address, priceNative: String(priceNative),
     baseToken: { address: base }, quoteToken: { address: quote },
     liquidity: { usd: liquidity }, volume: { h24: volume } });
const a = '0x' + 'a'.repeat(40);
const b = '0x' + 'b'.repeat(40);
test('six approved Base pairs are configured and unique', () => {
  assert.deepEqual(MARKETS.map((m) => m.key),
    ['WETH/USDC','AERO/USDC','cbBTC/USDC','VIRTUAL/WETH','WETH/USDT','USDC/USDT']);
  assert.equal(new Set(MARKETS.map((m) => m.key)).size, 6);
});
test('only exact token contracts, Base and liquid pools count', () => {
  const rows = [pool('uni',a,3000), pool('aero',b,3030),
    pool('fake','0x'+'c'.repeat(40),3100,TOKENS.WETH,TOKENS.USDT),
    { ...pool('other','0x'+'d'.repeat(40),3200), chainId:'ethereum' },
    pool('tiny','0x'+'e'.repeat(40),5000,market.base,market.quote,1000,500)];
  assert.equal(eligibleMarketPools(market, rows).length, 2);
  const result = evaluateMarket(market, rows, '2026-10-07T00:00:00Z');
  assert.equal(result.best.indicatedSpreadBps, 100);
  assert.equal(result.best.verification, 'NOT_VERIFIED');
  assert.equal(result.verifiedCandidates, 0);
});
test('reversed DEX pool token ordering is normalized to quote per base', () => {
  const rows = [pool('uni',a,3000), pool('aero',b,1/3030,market.quote,market.base)];
  const result = evaluateMarket(market, rows, '2026-10-07T00:00:00Z');
  assert.equal(result.eligiblePools,2);
  assert.ok(Math.abs(result.best.indicatedSpreadBps - 100) < 0.001);
});
test('single exchange does not claim an arbitrage lead', () => {
  const rows = [pool('aero',a,3000), pool('aero',b,3010)];
  const result = evaluateMarket(market,rows,'2026-10-07T00:00:00Z');
  assert.equal(result.status,'INSUFFICIENT_DEX_COVERAGE');
  assert.equal(result.best,null);
});
test('failed source is visible; no artificial opportunities or trade claims', async () => {
  const report = await scanSixMarkets(async () => ({ok:false,status:429}), '2026-10-07T00:00:00Z');
  assert.equal(report.markets.length,6);
  assert.ok(report.markets.every((m) => m.status === 'SOURCE_ERROR' && m.best === null));
  assert.equal(report.executionAuthorized,false);
});
