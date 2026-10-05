export type ProfitPolicy = {
  flashLoanPremiumBps: bigint;
  gasReserveUnits: number;
  executionBufferBps: bigint;
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
  gasReserveUsdc: bigint;
  executionBufferUsdc: bigint;
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
  const gasReserveUsdc = estimateGasUsdc(
    gasPriceWei,
    policy.gasReserveUnits,
    ethPriceUsdcMicros,
  );
  const executionBufferUsdc = applyBps(startUsdc, policy.executionBufferBps);

  const estimatedNetProfitUsdc =
    grossProfitUsdc -
    flashLoanFeeUsdc -
    gasReserveUsdc -
    executionBufferUsdc;

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
    gasReserveUsdc,
    executionBufferUsdc,
    estimatedNetProfitUsdc,
    decision,
  };
}
