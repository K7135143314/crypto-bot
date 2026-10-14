import assert from 'node:assert/strict';
import test from 'node:test';
import { SCOUT_TOKENS, DEFAULT_SCOUT_POLICY, selectEligiblePools, rankCrossDexOpportunities } from './scout-core.js';
import dashboardHandler from '../api/scout.js';
const addr = (digit) => '0x' + digit.repeat(40);
const pair = (dexId, pairAddress, priceUsd, chainId = 'base') => ({
  chainId, dexId, pairAddress, priceUsd,
  baseToken: { address: SCOUT_TOKENS.WETH },
  quoteToken: { address: SCOUT_TOKENS.USDC },
  liquidity: { usd: 1_000_000 }, volume: { h24: 200_000 },
});
const sample = () => [
  pair('aerodrome', addr('a'), '3500'),
  pair('uniswap', addr('b'), '3503.5'),
  pair('fake', '0x' + 'c'.repeat(64), '1000'),
  pair('wrong', addr('d'), '4000', 'ethereum'),
];

test('one canonical discovery implementation rejects bytes32 and non-Base pools', () => {
  const pools = selectEligiblePools(sample(), DEFAULT_SCOUT_POLICY);
  assert.equal(pools.length, 2);
  const leads = rankCrossDexOpportunities(pools, DEFAULT_SCOUT_POLICY);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].indicatedSpreadBps, 10);
  assert.equal(leads[0].status, 'SHORTLIST');
  assert.notEqual(leads[0].buyPairAddress, '0x' + 'c'.repeat(64));
});

test('reject malformed data and invalid scout configuration', () => {
  assert.throws(() => selectEligiblePools(null));
  assert.throws(() => selectEligiblePools([], { ...DEFAULT_SCOUT_POLICY, maxPools: -1 }));
  assert.equal(selectEligiblePools([null, {}], DEFAULT_SCOUT_POLICY).length, 0);
});

test('dashboard API delegates to same rules, preserves read-only API shape', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => sample() });
  try {
    let statusCode = null, responseBody = null;
    const res = {
      setHeader() { return this; },
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; return this; },
    };
    await dashboardHandler({}, res);
    assert.equal(statusCode, 200);
    assert.equal(responseBody.ok, true);
    assert.equal(responseBody.readOnly, true);
    assert.equal(responseBody.executionAuthorized, false);
    assert.equal(responseBody.eligiblePoolCount, 2);
    assert.equal(responseBody.shortlistCount, 1);
    const expected = rankCrossDexOpportunities(selectEligiblePools(sample(), DEFAULT_SCOUT_POLICY), DEFAULT_SCOUT_POLICY);
    assert.deepEqual(responseBody.opportunities, expected);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
