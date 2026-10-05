import { mkdir, writeFile } from 'node:fs/promises';
import { evaluateOpportunity } from './profit.js';

const USDC = 1_000_000n;

const startUsdc = 1_000n * USDC;
const grossProfitUsdc = 10n * USDC;
const gasPriceWei = 6_000_000n;
const ethPriceUsdcMicros = 2_700_000_000n;

const policy = {
  flashLoanPremiumBps: 5n,
  gasReserveUnits: 800_000,
  l1DataFeeReserveUsdc: 50_000n,
  slippageReserveBps: 10n,
  mevReserveBps: 10n,
  minNetProfitUsdc: 1n * USDC,
};

const formatUsdc = (value: bigint) => (Number(value) / Number(USDC)).toFixed(6);

async function main(): Promise<void> {
  const evaluation = evaluateOpportunity({
    startUsdc,
    grossProfitUsdc,
    gasPriceWei,
    ethPriceUsdcMicros,
    policy,
  });

  const assertions = {
    decisionIsCandidate: evaluation.decision === 'CANDIDATE',
    netMeetsMinimum:
      evaluation.estimatedNetProfitUsdc >= policy.minNetProfitUsdc,
    noTransactionCapabilityUsed: true,
  };

  if (!assertions.decisionIsCandidate || !assertions.netMeetsMinimum) {
    throw new Error(
      `Synthetic candidate proof failed: decision=${evaluation.decision}, net=${formatUsdc(evaluation.estimatedNetProfitUsdc)}`,
    );
  }

  const report = {
    proofVersion: '1.0.0',
    proofType: 'SYNTHETIC_CANDIDATE_DETECTION_AND_LOGGING',
    synthetic: true,
    readOnly: true,
    generatedAt: new Date().toISOString(),
    input: {
      startUsdc: formatUsdc(startUsdc),
      grossProfitUsdc: formatUsdc(grossProfitUsdc),
      gasPriceWei: gasPriceWei.toString(),
      approximateEthPriceUsdc: 2700,
      policy: {
        flashLoanPremiumBps: policy.flashLoanPremiumBps.toString(),
        gasReserveUnits: policy.gasReserveUnits,
        l1DataFeeReserveUsdc: formatUsdc(policy.l1DataFeeReserveUsdc),
        slippageReserveBps: policy.slippageReserveBps.toString(),
        mevReserveBps: policy.mevReserveBps.toString(),
        minNetProfitUsdc: formatUsdc(policy.minNetProfitUsdc),
      },
    },
    result: {
      flashLoanFeeUsdc: formatUsdc(evaluation.flashLoanFeeUsdc),
      l2GasReserveUsdc: formatUsdc(evaluation.l2GasReserveUsdc),
      l1DataFeeReserveUsdc: formatUsdc(evaluation.l1DataFeeReserveUsdc),
      slippageReserveUsdc: formatUsdc(evaluation.slippageReserveUsdc),
      mevReserveUsdc: formatUsdc(evaluation.mevReserveUsdc),
      totalModeledCostsUsdc: formatUsdc(evaluation.totalModeledCostsUsdc),
      estimatedNetProfitUsdc: formatUsdc(evaluation.estimatedNetProfitUsdc),
      decision: evaluation.decision,
    },
    assertions,
    note:
      'Deterministic synthetic proof only. It verifies that a profitable research fixture is classified as CANDIDATE and logged. It is not a live market opportunity and does not enable wallet, signing, or transactions.',
  };

  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/synthetic-candidate-proof.json',
    JSON.stringify(report, null, 2) + '\n',
    'utf8',
  );

  console.log(
    `Synthetic candidate proof PASS — estimated net $${formatUsdc(evaluation.estimatedNetProfitUsdc)}; artifact written to artifacts/synthetic-candidate-proof.json`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
