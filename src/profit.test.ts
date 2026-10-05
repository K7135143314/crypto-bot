import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOpportunity } from './profit.js';

const basePolicy = {
  flashLoanPremiumBps: 5n,
  gasReserveUnits: 800_000,
  l1DataFeeReserveUsdc: 50_000n,
  slippageReserveBps: 10n,
  mevReserveBps: 10n,
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
  assert.equal(
    result.totalModeledCostsUsdc,
    result.flashLoanFeeUsdc +
      result.l2GasReserveUsdc +
      result.l1DataFeeReserveUsdc +
      result.slippageReserveUsdc +
      result.mevReserveUsdc,
  );
});

test('separately reserves Base L1 data fee, slippage, and MEV uncertainty', () => {
  const result = evaluateOpportunity({
    startUsdc: 1_000_000_000n,
    grossProfitUsdc: 10_000_000n,
    gasPriceWei,
    ethPriceUsdcMicros,
    policy: basePolicy,
  });

  assert.equal(result.l1DataFeeReserveUsdc, 50_000n);
  assert.equal(result.slippageReserveUsdc, 1_000_000n);
  assert.equal(result.mevReserveUsdc, 1_000_000n);
});
