export type ProfitPolicy = {
  flashLoanPremiumBps: bigint; gasReserveUnits: number;
  l1DataFeeReserveUsdc: bigint; slippageReserveBps: bigint;
  mevReserveBps: bigint; minNetProfitUsdc: bigint;
};
export type ProfitDecision = 'REJECT_RAW_LOSS' | 'REJECT_FLASH_FEE' | 'REJECT_COSTS' | 'REJECT_MIN_PROFIT' | 'CANDIDATE';
export type ProfitEvaluation = {
 flashLoanFeeUsdc: bigint; l2GasReserveUsdc: bigint; l1DataFeeReserveUsdc: bigint;
 slippageReserveUsdc: bigint; mevReserveUsdc: bigint; totalModeledCostsUsdc: bigint;
 estimatedNetProfitUsdc: bigint; decision: ProfitDecision;
};
export const DEFAULT_PROFIT_RESERVES: Readonly<Omit<ProfitPolicy, 'flashLoanPremiumBps'>>;
export function applyBps(amount: bigint, bps: bigint): bigint;
export function estimateGasUsdc(gasPriceWei: bigint, gasUnits: number, ethPriceUsdcMicros: bigint): bigint;
export function evaluateOpportunity(args: { startUsdc: bigint; grossProfitUsdc: bigint;
 gasPriceWei: bigint; ethPriceUsdcMicros: bigint; policy: ProfitPolicy }): ProfitEvaluation;
