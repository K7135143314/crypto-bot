export type ProfitPolicy = {
  flashLoanPremiumBps: bigint;
  gasReserveUnits: number;
  l1DataFeeReserveUsdc: bigint;
  slippageReserveBps: bigint;
  mevReserveBps: bigint;
  minNetProfitUsdc: bigint;
};

export type ProfitDecision =
  | 'REJECT_RAW_LOSS'
  | 'REJECT_FLASH_FEE'
  | 'REJECT_COSTS'
  | 'REJECT_MIN_PROFIT'
  | 'CANDIDATE';

export type ProfitEvaluation = {
  flashLoanFeeUsdc: bigint;
  l2GasReserveUsdc: bigint;
  l1DataFeeReserveUsdc: bigint;
  slippageReserveUsdc: bigint;
  mevReserveUsdc: bigint;
  totalModeledCostsUsdc: bigint;
  estimatedNetProfitUsdc: bigint;
  decision: ProfitDecision;
};

export function applyBps(amount: bigint, bps: bigint): bigint {
  return (amount * bps) / 10_000n;
}

export function estimateGasUsdc(
  gasPriceWei: bigint,
  gasUnits: number,
  ethPriceUsdcMicros: bigint,
): bigint {
  const gasWei = gasPriceWei * BigInt(gasUnits);
  return (gasWei * ethPriceUsdcMicros) / 1_000_000_000_000_000_000n;
}

export function evaluateOpportunity(args: {
  startUsdc: bigint;
  grossProfitUsdc: bigint;
  gasPriceWei: bigint;
  ethPriceUsdcMicros: bigint;
  policy: ProfitPolicy;
}): ProfitEvaluation {
  const {
    startUsdc,
    grossProfitUsdc,
    gasPriceWei,
    ethPriceUsdcMicros,
    policy,
  } = args;

  const flashLoanFeeUsdc = applyBps(startUsdc, policy.flashLoanPremiumBps);
  const l2GasReserveUsdc = estimateGasUsdc(
    gasPriceWei,
    policy.gasReserveUnits,
    ethPriceUsdcMicros,
  );
  const l1DataFeeReserveUsdc = policy.l1DataFeeReserveUsdc;
  const slippageReserveUsdc = applyBps(startUsdc, policy.slippageReserveBps);
  const mevReserveUsdc = applyBps(startUsdc, policy.mevReserveBps);

  const totalModeledCostsUsdc =
    flashLoanFeeUsdc +
    l2GasReserveUsdc +
    l1DataFeeReserveUsdc +
    slippageReserveUsdc +
    mevReserveUsdc;

  const estimatedNetProfitUsdc = grossProfitUsdc - totalModeledCostsUsdc;

  let decision: ProfitDecision;

  if (grossProfitUsdc <= 0n) {
    decision = 'REJECT_RAW_LOSS';
  } else if (grossProfitUsdc - flashLoanFeeUsdc <= 0n) {
    decision = 'REJECT_FLASH_FEE';
  } else if (estimatedNetProfitUsdc <= 0n) {
    decision = 'REJECT_COSTS';
  } else if (estimatedNetProfitUsdc < policy.minNetProfitUsdc) {
    decision = 'REJECT_MIN_PROFIT';
  } else {
    decision = 'CANDIDATE';
  }

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
