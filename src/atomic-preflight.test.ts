import assert from 'node:assert/strict';
import test from 'node:test';
import { runAtomicPreflight, type AtomicPreflightInput } from './atomic-preflight.js';

const policy = {
  gasReserveUnits: 0,
  l1DataFeeReserveUsdc: 0n,
  slippageReserveBps: 0n,
  mevReserveBps: 0n,
  minNetProfitUsdc: 1_000_000n,
} as const;

function baseInput(): AtomicPreflightInput {
  return {
    startUsdc: 100_000_000n,
    firstLeg: {
      venue: 'aerodrome',
      amountIn: 100_000_000n,
      amountOut: 50_000_000_000_000_000n,
      quotedAtBlock: 52_212_782n,
    },
    secondLeg: {
      venue: 'uniswap-v3',
      amountIn: 50_000_000_000_000_000n,
      amountOut: 102_000_000n,
      quotedAtBlock: 52_212_782n,
    },
    flashLoanPremiumBps: 5n,
    gasPriceWei: 0n,
    ethPriceUsdcMicros: 0n,
    policy,
  };
}

test('accepts a structurally valid self-repaying simulation candidate', () => {
  const result = runAtomicPreflight(baseInput());

  assert.equal(result.atomicStructureValid, true);
  assert.equal(result.samePinnedBlock, true);
  assert.equal(result.routeOrderValid, true);
  assert.equal(result.legContinuityValid, true);
  assert.equal(result.positiveAmountsValid, true);
  assert.equal(result.flashRepaymentUsdc, 100_050_000n);
  assert.equal(result.estimatedNetProfitUsdc, 1_950_000n);
  assert.equal(result.decision, 'CANDIDATE');
  assert.equal(result.outcome, 'SIMULATION_CANDIDATE');
});

test('rejects mismatched pinned blocks before simulation', () => {
  const input = baseInput();
  input.secondLeg.quotedAtBlock += 1n;

  const result = runAtomicPreflight(input);

  assert.equal(result.samePinnedBlock, false);
  assert.equal(result.atomicStructureValid, false);
  assert.equal(result.outcome, 'REJECT_STRUCTURE');
});

test('rejects broken leg continuity before simulation', () => {
  const input = baseInput();
  input.secondLeg.amountIn -= 1n;

  const result = runAtomicPreflight(input);

  assert.equal(result.legContinuityValid, false);
  assert.equal(result.atomicStructureValid, false);
  assert.equal(result.outcome, 'REJECT_STRUCTURE');
});

test('rejects a route that repeats the same DEX', () => {
  const input = baseInput();
  input.secondLeg.venue = 'aerodrome';

  const result = runAtomicPreflight(input);

  assert.equal(result.routeOrderValid, false);
  assert.equal(result.atomicStructureValid, false);
  assert.equal(result.outcome, 'REJECT_STRUCTURE');
});

test('rejects a route that cannot repay principal plus premium', () => {
  const input = baseInput();
  input.secondLeg.amountOut = 100_049_999n;

  const result = runAtomicPreflight(input);

  assert.equal(result.atomicStructureValid, true);
  assert.equal(result.flashRepaymentUsdc, 100_050_000n);
  assert.equal(result.outcome, 'REJECT_NOT_SELF_REPAYING');
});

test('rejects a self-repaying route that misses the minimum-profit policy', () => {
  const input = baseInput();
  input.secondLeg.amountOut = 100_800_000n;

  const result = runAtomicPreflight(input);

  assert.equal(result.atomicStructureValid, true);
  assert.equal(result.outcome, 'REJECT_POLICY');
  assert.equal(result.decision, 'REJECT_MIN_PROFIT');
});
