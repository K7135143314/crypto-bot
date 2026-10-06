import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeScoutDex } from './scout-verifier.js';

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
