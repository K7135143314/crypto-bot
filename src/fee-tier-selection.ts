import { UNISWAP_V3_FEES } from './config.js';

/**
 * Caps on-chain venue discovery to the already approved fee tiers.
 * Default matches the existing narrow smoke test for backward compatibility.
 * Opt-in sweep is research only and never authorizes a trade.
 */
export function chooseApprovedUniswapFees(sweep:boolean): number[] {
  const selected=UNISWAP_V3_FEES.filter(fee=>sweep||(fee===500||fee===3000));
  return [...new Set(selected)].slice(0,4);
}
export function acceptableTierResult(status:string):boolean {
  return status==='VALID_POOL_STATE_UNFINALIZED';
}
