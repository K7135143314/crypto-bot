import { evaluateOpportunity, type ProfitPolicy } from './profit.js';

export type AtomicVenue = 'aerodrome' | 'uniswap-v3';

export type AtomicLeg = {
  venue: AtomicVenue;
  amountIn: bigint;
  amountOut: bigint;
  quotedAtBlock: bigint;
};

export type AtomicPreflightInput = {
  startUsdc: bigint;
  firstLeg: AtomicLeg;
  secondLeg: AtomicLeg;
  flashLoanPremiumBps: bigint;
  gasPriceWei: bigint;
  ethPriceUsdcMicros: bigint;
  policy: Omit<ProfitPolicy, 'flashLoanPremiumBps'>;
};

export type AtomicPreflightResult = {
  atomicStructureValid: boolean;
  samePinnedBlock: boolean;
  routeOrderValid: boolean;
  legContinuityValid: boolean;
  positiveAmountsValid: boolean;
  flashRepaymentUsdc: bigint;
  grossProfitUsdc: bigint;
  endingUsdcBeforeCosts: bigint;
  estimatedNetProfitUsdc: bigint;
  decision: ReturnType<typeof evaluateOpportunity>['decision'];
  outcome:
    | 'REJECT_STRUCTURE'
    | 'REJECT_NOT_SELF_REPAYING'
    | 'REJECT_POLICY'
    | 'SIMULATION_CANDIDATE';
};

export function runAtomicPreflight(input: AtomicPreflightInput): AtomicPreflightResult {
  const samePinnedBlock =
    input.firstLeg.quotedAtBlock === input.secondLeg.quotedAtBlock;

  const routeOrderValid =
    input.firstLeg.venue !== input.secondLeg.venue;

  const legContinuityValid =
    input.firstLeg.amountOut === input.secondLeg.amountIn;

  const positiveAmountsValid =
    input.startUsdc > 0n &&
    input.firstLeg.amountIn > 0n &&
    input.firstLeg.amountOut > 0n &&
    input.secondLeg.amountIn > 0n &&
    input.secondLeg.amountOut > 0n;

  const atomicStructureValid =
    input.firstLeg.amountIn === input.startUsdc &&
    samePinnedBlock &&
    routeOrderValid &&
    legContinuityValid &&
    positiveAmountsValid;

  const endingUsdcBeforeCosts = input.secondLeg.amountOut;
  const grossProfitUsdc = endingUsdcBeforeCosts - input.startUsdc;
  const flashLoanFeeUsdc =
    (input.startUsdc * input.flashLoanPremiumBps) / 10_000n;
  const flashRepaymentUsdc = input.startUsdc + flashLoanFeeUsdc;

  if (!atomicStructureValid) {
    return {
      atomicStructureValid,
      samePinnedBlock,
      routeOrderValid,
      legContinuityValid,
      positiveAmountsValid,
      flashRepaymentUsdc,
      grossProfitUsdc,
      endingUsdcBeforeCosts,
      estimatedNetProfitUsdc: grossProfitUsdc,
      decision: 'REJECT_RAW_LOSS',
      outcome: 'REJECT_STRUCTURE',
    };
  }

  const evaluation = evaluateOpportunity({
    startUsdc: input.startUsdc,
    grossProfitUsdc,
    gasPriceWei: input.gasPriceWei,
    ethPriceUsdcMicros: input.ethPriceUsdcMicros,
    policy: {
      flashLoanPremiumBps: input.flashLoanPremiumBps,
      ...input.policy,
    },
  });

  if (endingUsdcBeforeCosts < flashRepaymentUsdc) {
    return {
      atomicStructureValid,
      samePinnedBlock,
      routeOrderValid,
      legContinuityValid,
      positiveAmountsValid,
      flashRepaymentUsdc,
      grossProfitUsdc,
      endingUsdcBeforeCosts,
      estimatedNetProfitUsdc: evaluation.estimatedNetProfitUsdc,
      decision: evaluation.decision,
      outcome: 'REJECT_NOT_SELF_REPAYING',
    };
  }

  return {
    atomicStructureValid,
    samePinnedBlock,
    routeOrderValid,
    legContinuityValid,
    positiveAmountsValid,
    flashRepaymentUsdc,
    grossProfitUsdc,
    endingUsdcBeforeCosts,
    estimatedNetProfitUsdc: evaluation.estimatedNetProfitUsdc,
    decision: evaluation.decision,
    outcome:
      evaluation.decision === 'CANDIDATE'
        ? 'SIMULATION_CANDIDATE'
        : 'REJECT_POLICY',
  };
}
