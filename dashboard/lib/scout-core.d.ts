import type { DexScreenerPair, EligiblePool, ScoutConfig, ScoutOpportunity } from '../../src/scout.js';
export const SCOUT_TOKENS: Readonly<{ WETH: string; USDC: string }>;
export const DEFAULT_SCOUT_POLICY: Readonly<ScoutConfig>;
export function selectEligiblePools(pairs: readonly DexScreenerPair[], config?: ScoutConfig): EligiblePool[];
export function rankCrossDexOpportunities(pools: readonly EligiblePool[], config?: ScoutConfig): ScoutOpportunity[];
