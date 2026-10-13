import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeScoutDex, verifyScoutOpportunity } from './scout-verifier.js';

test('normalizes only proven verifier adapters', () => {
  assert.equal(normalizeScoutDex('uniswap'), 'uniswap');
  assert.equal(normalizeScoutDex('uniswap-v3'), 'uniswap');
  assert.equal(normalizeScoutDex('aerodrome'), 'aerodrome');
  assert.equal(normalizeScoutDex('pancakeswap'), null);
  assert.equal(normalizeScoutDex('quickswap'), null);
});

test('normalization is case-insensitive and trims whitespace', () => {
  assert.equal(normalizeScoutDex('  UniSwap  '), 'uniswap');
  assert.equal(normalizeScoutDex('AERODROME'), 'aerodrome');
});

test('invalid bytes32 discovery pool IDs are rejected before RPC', async () => {
  const result = await verifyScoutOpportunity({
    buyDex: 'aerodrome', buyPairAddress: '0x' + 'f'.repeat(64), buyPriceUsd: 3500,
    sellDex: 'uniswap', sellPairAddress: '0x' + 'a'.repeat(40), sellPriceUsd: 3510,
    indicatedSpreadBps: 28.57, minLiquidityUsd: 1000000,
    minVolume24hUsd: 500000, status: 'SHORTLIST',
  }, 1, 123n);
  assert.equal(result.status, 'INVALID_POOL_ADDRESS');
  assert.equal(result.exactPoolMatch, false);
  assert.equal('bestEstimatedNetUsdc' in result, false);
});
