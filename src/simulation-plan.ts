import { mkdir, writeFile } from 'node:fs/promises';
import { quoteMatrix, client } from './quotes.js';

const sourceBlock = BigInt(process.env.BASE_FORK_BLOCK || '52216060');
const rows = await quoteMatrix(client, ['100'], sourceBlock);

if (rows.length !== 2) {
  throw new Error(`Expected two $100 routes at block ${sourceBlock}, received ${rows.length}.`);
}

const routes = rows.map((row) => ({
  route:
    row.firstDex === 'aerodrome'
      ? 'Aerodrome -> Uniswap v3'
      : 'Uniswap v3 -> Aerodrome',
  direction:
    row.firstDex === 'aerodrome'
      ? 'AERODROME_TO_UNISWAP'
      : 'UNISWAP_TO_AERODROME',
  startUsdcRaw: row.startUsdc.toString(),
  predictedWethAfterLeg1Raw: row.wethReceived.toString(),
  predictedFinalUsdcRaw: row.finalUsdc.toString(),
  predictedGrossProfitUsdcRaw: row.grossProfitUsdc.toString(),
  uniswapFee: row.first.feeTier ?? row.second.feeTier ?? 0,
}));

for (const route of routes) {
  if (!route.uniswapFee) {
    throw new Error(`Missing Uniswap fee tier for ${route.route}.`);
  }
}

const plan = {
  milestone: 'V0.8',
  readOnlyScannerInput: true,
  sourceBlock: sourceBlock.toString(),
  candidateAmountUsdc: '100',
  routes,
};

await mkdir('simulation/results', { recursive: true });
await writeFile(
  'simulation/results/scanner-plan.json',
  JSON.stringify(plan, null, 2) + '\n',
  'utf8',
);

console.log(JSON.stringify(plan, null, 2));
