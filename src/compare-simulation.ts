import { readFile, writeFile } from 'node:fs/promises';

type ScannerRoute = {
  route: string;
  direction: string;
  startUsdcRaw: string;
  predictedWethAfterLeg1Raw: string;
  predictedFinalUsdcRaw: string;
  predictedGrossProfitUsdcRaw: string;
  uniswapFee: number;
};

type SimulationRoute = {
  route: string;
  direction: string;
  actualWethAfterLeg1Raw: string;
  actualFinalUsdcRaw: string;
  transactionGasUsed: string | null;
  outcome: string;
};

const plan = JSON.parse(
  await readFile('simulation/results/scanner-plan.json', 'utf8'),
) as { sourceBlock: string; routes: ScannerRoute[] };

const simulation = JSON.parse(
  await readFile('simulation/results/atomic-fork-result.json', 'utf8'),
) as { sourceBlock: number; routes: SimulationRoute[] };

if (plan.sourceBlock !== String(simulation.sourceBlock)) {
  throw new Error(
    `Source block mismatch: scanner ${plan.sourceBlock}, simulator ${simulation.sourceBlock}.`,
  );
}

const comparisons = plan.routes.map((predicted) => {
  const actual = simulation.routes.find(
    (route) => route.direction === predicted.direction,
  );

  if (!actual) {
    throw new Error(`Missing simulated route ${predicted.direction}.`);
  }

  const wethDelta =
    BigInt(actual.actualWethAfterLeg1Raw) -
    BigInt(predicted.predictedWethAfterLeg1Raw);
  const usdcDelta =
    BigInt(actual.actualFinalUsdcRaw) -
    BigInt(predicted.predictedFinalUsdcRaw);

  const absWethDelta = wethDelta < 0n ? -wethDelta : wethDelta;
  const absUsdcDelta = usdcDelta < 0n ? -usdcDelta : usdcDelta;

  const withinTolerance = absWethDelta <= 1n && absUsdcDelta <= 1n;

  return {
    route: predicted.route,
    sourceBlock: plan.sourceBlock,
    uniswapFee: predicted.uniswapFee,
    predictedWethAfterLeg1Raw: predicted.predictedWethAfterLeg1Raw,
    actualWethAfterLeg1Raw: actual.actualWethAfterLeg1Raw,
    wethDeltaRaw: wethDelta.toString(),
    predictedFinalUsdcRaw: predicted.predictedFinalUsdcRaw,
    actualFinalUsdcRaw: actual.actualFinalUsdcRaw,
    usdcDeltaRaw: usdcDelta.toString(),
    transactionGasUsed: actual.transactionGasUsed,
    outcome: actual.outcome,
    withinTolerance,
  };
});

if (comparisons.some((row) => !row.withinTolerance)) {
  throw new Error(
    'Scanner estimate and fork execution differed by more than one raw token unit.',
  );
}

const report = {
  milestone: 'V0.8',
  comparison: 'scanner-estimate-vs-atomic-fork',
  sourceBlock: plan.sourceBlock,
  tolerance: {
    wethWei: '1',
    usdcRaw: '1',
  },
  passed: true,
  routes: comparisons,
};

await writeFile(
  'simulation/results/scanner-vs-fork.json',
  JSON.stringify(report, null, 2) + '\n',
  'utf8',
);

console.log(JSON.stringify(report, null, 2));
