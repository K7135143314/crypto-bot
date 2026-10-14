/**
 * One authoritative read-only profit POLICY model for CLI and dashboard.
 * All USDC amounts are integer micro-USDC. This is a modeled candidate gate,
 * NOT measured execution costs and never a permission to broadcast a trade.
 */
export const DEFAULT_PROFIT_RESERVES = Object.freeze({
  gasReserveUnits: 800_000,
  l1DataFeeReserveUsdc: 50_000n,
  slippageReserveBps: 10n,
  mevReserveBps: 10n,
  minNetProfitUsdc: 1_000_000n,
});

function requireBigInt(name, value, min = 0n) {
  if (typeof value !== 'bigint' || value < min) {
    throw new TypeError(name + ' must be a bigint >= ' + min);
  }
}

export function applyBps(amount, bps) {
  requireBigInt('amount', amount);
  requireBigInt('bps', bps);
  return (amount * bps) / 10_000n;
}

export function estimateGasUsdc(gasPriceWei, gasUnits, ethPriceUsdcMicros) {
  requireBigInt('gasPriceWei', gasPriceWei);
  requireBigInt('ethPriceUsdcMicros', ethPriceUsdcMicros, 1n);
  if (!Number.isSafeInteger(gasUnits) || gasUnits <= 0) {
    throw new TypeError('gasUnits must be a positive safe integer');
  }
  return (gasPriceWei * BigInt(gasUnits) * ethPriceUsdcMicros) /
    1_000_000_000_000_000_000n;
}

function assertValidOpportunity(args) {
  if (!args || typeof args !== 'object' || !args.policy) {
    throw new TypeError('Missing opportunity or cost policy');
  }
  requireBigInt('startUsdc', args.startUsdc, 1n);
  if (typeof args.grossProfitUsdc !== 'bigint') {
    throw new TypeError('grossProfitUsdc must be bigint');
  }
  const p = args.policy;
  for (const key of ['flashLoanPremiumBps', 'l1DataFeeReserveUsdc', 'slippageReserveBps',
    'mevReserveBps', 'minNetProfitUsdc']) {
    requireBigInt(key, p[key]);
  }
  for (const key of ['flashLoanPremiumBps', 'slippageReserveBps', 'mevReserveBps']) {
    if (p[key] > 10_000n) throw new TypeError(key + ' must be <= 10000 bps');
  }
  if (!Number.isSafeInteger(p.gasReserveUnits) || p.gasReserveUnits <= 0) {
    throw new TypeError('Invalid gas reserve units');
  }
  requireBigInt('gasPriceWei', args.gasPriceWei);
  requireBigInt('ethPriceUsdcMicros', args.ethPriceUsdcMicros, 1n);
}

export function evaluateOpportunity(args) {
  assertValidOpportunity(args);
  const { startUsdc, grossProfitUsdc, gasPriceWei, ethPriceUsdcMicros, policy } = args;
  const flashLoanFeeUsdc = applyBps(startUsdc, policy.flashLoanPremiumBps);
  const l2GasReserveUsdc = estimateGasUsdc(gasPriceWei, policy.gasReserveUnits, ethPriceUsdcMicros);
  const l1DataFeeReserveUsdc = policy.l1DataFeeReserveUsdc;
  const slippageReserveUsdc = applyBps(startUsdc, policy.slippageReserveBps);
  const mevReserveUsdc = applyBps(startUsdc, policy.mevReserveBps);
  const totalModeledCostsUsdc =
    flashLoanFeeUsdc + l2GasReserveUsdc + l1DataFeeReserveUsdc +
    slippageReserveUsdc + mevReserveUsdc;
  const estimatedNetProfitUsdc = grossProfitUsdc - totalModeledCostsUsdc;

  let decision = 'CANDIDATE';
  if (grossProfitUsdc <= 0n) decision = 'REJECT_RAW_LOSS';
  else if (grossProfitUsdc - flashLoanFeeUsdc <= 0n) decision = 'REJECT_FLASH_FEE';
  else if (estimatedNetProfitUsdc <= 0n) decision = 'REJECT_COSTS';
  else if (estimatedNetProfitUsdc < policy.minNetProfitUsdc) decision = 'REJECT_MIN_PROFIT';

  return {
    flashLoanFeeUsdc,
    l2GasReserveUsdc,
    l1DataFeeReserveUsdc,
    slippageReserveUsdc,
    mevReserveUsdc,
    totalModeledCostsUsdc,
    estimatedNetProfitUsdc,
    decision,
  };
}
