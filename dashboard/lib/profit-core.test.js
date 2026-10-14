import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOpportunity, DEFAULT_PROFIT_RESERVES, estimateGasUsdc } from './profit-core.js';
const inputs = {startUsdc:1_000_000_000n,gasPriceWei:6_000_000n,ethPriceUsdcMicros:2_700_000_000n,policy:{...DEFAULT_PROFIT_RESERVES,flashLoanPremiumBps:5n}};
test('matches the original USDC profit classification and modeled reserve accounting',()=>{
  const a=evaluateOpportunity({...inputs,grossProfitUsdc:10_000_000n});
  assert.equal(a.decision,'CANDIDATE');
  assert.equal(a.l2GasReserveUsdc,12_960n);
  assert.equal(a.totalModeledCostsUsdc,2_562_960n);
  assert.equal(a.estimatedNetProfitUsdc,7_437_040n);
  assert.equal(evaluateOpportunity({...inputs,grossProfitUsdc:-1n}).decision,'REJECT_RAW_LOSS');
  assert.equal(evaluateOpportunity({...inputs,grossProfitUsdc:400_000n}).decision,'REJECT_FLASH_FEE');
  assert.equal(evaluateOpportunity({...inputs,grossProfitUsdc:1_500_000n}).decision,'REJECT_COSTS');
});
test('invalid economic inputs fail closed',()=>{
  assert.throws(()=>evaluateOpportunity({...inputs,ethPriceUsdcMicros:0n}));
  assert.throws(()=>evaluateOpportunity({...inputs,gasPriceWei:-1n}));
  assert.throws(()=>evaluateOpportunity({...inputs,policy:{...inputs.policy,slippageReserveBps:-1n}}));
  assert.throws(()=>evaluateOpportunity({...inputs,policy:{...inputs.policy,gasReserveUnits:0}}));
  assert.throws(()=>estimateGasUsdc(2n,Number.NaN,100n));
});

test('zero-cost synthetic preflight is allowed but nonzero gas requires a reference price', () => {
  const v=evaluateOpportunity({...inputs,gasPriceWei:0n,ethPriceUsdcMicros:0n,policy:{...inputs.policy,gasReserveUnits:0},grossProfitUsdc:2_000_000n});
  assert.equal(v.l2GasReserveUsdc,0n);
  assert.equal(v.decision,'CANDIDATE');
  assert.throws(()=>evaluateOpportunity({...inputs,ethPriceUsdcMicros:0n,grossProfitUsdc:2_000_000n}));
});
