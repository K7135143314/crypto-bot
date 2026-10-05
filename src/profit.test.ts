import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOpportunity } from './profit.js';

const basePolicy = {
  flashLoanPremiumBps: 5n,
  gasReserveUnits: 800_000,
  executionBufferBps: 20n,
  minNetProfitUsdc: 1_000_000n,
};

const ethPriceUsdcMicros = 2_700_000_000n;
const gasPriceWei = 6_000_000n;

test('rejects a route that already loses money', () => {
  const result = evaluateOpportunity({
    startUsdc: 100_000_000n,
    grossProfitUsdc: -100_000n,
    gasPriceWei,
    ethPriceUsdcMicros,
    policy: basePolicy,
  });

  assert.equal(result.decision, 'REJECT_RAW_LOSS');
});

test('rejects a route whose raw gain cannot cover flash-loan premium', () => {
  const result = evaluateOpportunity({
    startUsdc: 1_000_000_000n,
    grossProfitUsdc: 400_000n,
    gasPriceWei,
    ethPriceUsdcMicros,
    policy: basePolicy,
  });

  assert.equal(result.decision, 'REJECT_FLASH_FEE');
});

test('rejects a positive route when modeled costs consume the gain', () => {
  const result = evaluateOpportunity({
    startUsdc: 1_000_000_000n,
    grossProfitUsdc: 1_500_000n,
    gasPriceWei,
    ethPriceUsdcMicros,
    policy: basePolicy,
  });

  assert.equal(result.decision, 'REJECT_COSTS');
});

test('rejects a route that is positive but below the minimum profit floor', () => {
  const result = evaluateOpportunity({
    startUsdc: 100_000_000n,
    grossProfitUsdc: 900_000n,
    gasPriceWei,
    ethPriceUsdcMicros,
    policy: basePolicy,
  });

  assert.equal(result.decision, 'REJECT_MIN_PROFIT');
});

test('marks a route candidate only after all configured gates clear', () => {
  const result = evaluateOpportunity({
    startUsdc: 1_000_000_000n,
    grossProfitUsdc: 10_000_000n,
    gasPriceWei,
    ethPriceUsdcMicros,
    policy: basePolicy,
  });

  assert.equal(result.decision, 'CANDIDATE');
  assert.ok(result.estimatedNetProfitUsdc >= basePolicy.minNetProfitUsdc);
});
