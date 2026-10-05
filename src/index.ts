import { mkdir, writeFile } from 'node:fs/promises';
import { aaveV3PoolAbi } from './abis.js';
import {
  CHAIN_ID,
  CONTRACTS,
  GAS_UNIT_SCENARIOS,
  PROFIT_POLICY,
  TRADE_SIZES_USDC,
} from './config.js';
import { evaluateOpportunity } from './profit.js';
import { client, formatUsdc, formatWeth, quoteMatrix } from './quotes.js';

function estimateEthPriceUsdc(rows: Awaited<ReturnType<typeof quoteMatrix>>): number {
  const anchor = rows.find(
    (row) => row.firstDex === 'uniswap-v3' && row.startUsdcText === TRADE_SIZES_USDC[0],
  );

  if (!anchor) return 0;

  const startUsdc = Number(anchor.startUsdc) / 1e6;
  const weth = Number(anchor.wethReceived) / 1e18;
  return weth > 0 ? startUsdc / weth : 0;
}

function decisionText(decision: ReturnType<typeof evaluateOpportunity>['decision']): string {
  switch (decision) {
    case 'REJECT_RAW_LOSS':
      return 'REJECT — raw round trip already loses money';
    case 'REJECT_FLASH_FEE':
      return 'REJECT — flash-loan premium removes the raw profit';
    case 'REJECT_COSTS':
      return 'REJECT — modeled gas reserve / execution buffer removes the profit';
    case 'REJECT_MIN_PROFIT':
      return 'REJECT — estimated net profit is below the configured minimum';
    case 'CANDIDATE':
      return 'CANDIDATE — clears current read-only profitability gates';
  }
}

async function main(): Promise<void> {
  const chainId = await client.getChainId();
  const blockNumber = await client.getBlockNumber();

  if (chainId !== CHAIN_ID) {
    throw new Error(`Wrong chain: expected Base ${CHAIN_ID}, got ${chainId}`);
  }

  const [flashLoanPremiumBps, gasPrice] = await Promise.all([
    client.readContract({
      address: CONTRACTS.aaveV3Pool,
      abi: aaveV3PoolAbi,
      functionName: 'FLASHLOAN_PREMIUM_TOTAL',
      blockNumber,
    }),
    client.getGasPrice(),
  ]);

  console.log('DEX Arbitrage Scanner V0.5 — READ ONLY');
  console.log(`Pinned Base block: ${blockNumber}`);
  console.log('Pair: WETH / USDC');
  console.log('DEXs: Aerodrome classic / Uniswap v3');
  console.log(`Aave V3 hypothetical flash-loan premium: ${flashLoanPremiumBps} bps (${Number(flashLoanPremiumBps) / 100}%)`);
  console.log(`Live Base gas price: ${(Number(gasPrice) / 1e9).toFixed(6)} gwei`);
  console.log(`Policy execution buffer: ${PROFIT_POLICY.executionBufferBps} bps (${Number(PROFIT_POLICY.executionBufferBps) / 100}%)`);
  console.log(`Policy gas reserve: ${PROFIT_POLICY.gasReserveUnits.toLocaleString()} gas units`);
  console.log(`Minimum estimated net profit: $${formatUsdc(PROFIT_POLICY.minNetProfitUsdc)}`);
  console.log('No wallet. No signing. No transactions.\n');

  const rows = await quoteMatrix(client, TRADE_SIZES_USDC, blockNumber);
  const ethPriceUsdc = estimateEthPriceUsdc(rows);
  const ethPriceUsdcMicros = BigInt(Math.round(ethPriceUsdc * 1_000_000));

  console.log(`Approximate WETH reference price from live quote: $${ethPriceUsdc.toFixed(2)}`);
  console.log('L2 execution-only gas scenarios (not full Base transaction cost):');

  for (const units of GAS_UNIT_SCENARIOS) {
    const gasEth = (Number(gasPrice) * units) / 1e18;
    const gasUsdc = gasEth * ethPriceUsdc;
    console.log(`  ${units.toLocaleString()} gas -> about $${gasUsdc.toFixed(6)} USDC`);
  }

  console.log('');

  let candidateCount = 0;
  const reportRows: Array<Record<string, string | number>> = [];
  const candidateRows: Array<Record<string, string | number>> = [];

  for (const result of rows) {
    const routeName = result.firstDex === 'aerodrome'
      ? 'Aerodrome -> Uniswap v3'
      : 'Uniswap v3 -> Aerodrome';

    const deltaUsd = Number(formatUsdc(result.grossProfitUsdc));
    const deltaPct = (deltaUsd / Number(result.startUsdcText)) * 100;

    const evaluation = evaluateOpportunity({
      startUsdc: result.startUsdc,
      grossProfitUsdc: result.grossProfitUsdc,
      gasPriceWei: gasPrice,
      ethPriceUsdcMicros,
      policy: {
        flashLoanPremiumBps,
        gasReserveUnits: PROFIT_POLICY.gasReserveUnits,
        executionBufferBps: PROFIT_POLICY.executionBufferBps,
        minNetProfitUsdc: PROFIT_POLICY.minNetProfitUsdc,
      },
    });

    if (evaluation.decision === 'CANDIDATE') candidateCount += 1;

    console.log(`${routeName} | start $${result.startUsdcText}`);
    console.log(`  WETH after leg 1:       ${formatWeth(result.wethReceived)}`);
    console.log(`  Final USDC:             $${formatUsdc(result.finalUsdc)}`);
    console.log(`  Gross delta:            $${formatUsdc(result.grossProfitUsdc)} (${deltaPct.toFixed(4)}%)`);
    console.log(`  Flash-loan fee:         $${formatUsdc(evaluation.flashLoanFeeUsdc)}`);
    console.log(`  Gas reserve estimate:   $${formatUsdc(evaluation.gasReserveUsdc)}`);
    console.log(`  Execution buffer:       $${formatUsdc(evaluation.executionBufferUsdc)}`);
    console.log(`  Estimated net:          $${formatUsdc(evaluation.estimatedNetProfitUsdc)}`);
    if (result.first.feeTier) console.log(`  Uniswap fee tier:       ${result.first.feeTier}`);
    if (result.second.feeTier) console.log(`  Uniswap fee tier:       ${result.second.feeTier}`);
    console.log(`  Decision:               ${decisionText(evaluation.decision)}\n`);

    const uniswapFeeTier = result.first.feeTier ?? result.second.feeTier ?? 0;

    const reportRow = {
      route: routeName,
      startUsdc: result.startUsdcText,
      wethAfterLeg1: formatWeth(result.wethReceived),
      finalUsdc: formatUsdc(result.finalUsdc),
      grossDeltaUsdc: formatUsdc(result.grossProfitUsdc),
      grossDeltaPct: Number(deltaPct.toFixed(6)),
      flashLoanFeeUsdc: formatUsdc(evaluation.flashLoanFeeUsdc),
      gasReserveUsdc: formatUsdc(evaluation.gasReserveUsdc),
      executionBufferUsdc: formatUsdc(evaluation.executionBufferUsdc),
      estimatedNetUsdc: formatUsdc(evaluation.estimatedNetProfitUsdc),
      uniswapFeeTier,
      decision: evaluation.decision,
    };

    reportRows.push(reportRow);

    if (evaluation.decision === 'CANDIDATE') {
      candidateRows.push(reportRow);
    }
  }

  const expectedRoutes = TRADE_SIZES_USDC.length * 2;
  console.log(`Matrix completeness: ${rows.length}/${expectedRoutes} routes completed.`);
  console.log(`Candidates clearing current policy: ${candidateCount}`);

  if (rows.length !== expectedRoutes) {
    throw new Error(`Incomplete quote matrix: expected ${expectedRoutes}, received ${rows.length}.`);
  }

  const bestRow = [...reportRows].sort(
    (a, b) => Number(b.estimatedNetUsdc) - Number(a.estimatedNetUsdc),
  )[0];

  const report = {
    scannerVersion: '0.5.0',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    chain: 'Base',
    chainId,
    blockNumber: blockNumber.toString(),
    pair: 'WETH/USDC',
    dexes: ['Aerodrome classic', 'Uniswap v3'],
    liveInputs: {
      flashLoanPremiumBps: flashLoanPremiumBps.toString(),
      gasPriceWei: gasPrice.toString(),
      gasPriceGwei: Number(gasPrice) / 1e9,
      approximateWethPriceUsdc: Number(ethPriceUsdc.toFixed(6)),
    },
    policy: {
      gasReserveUnits: PROFIT_POLICY.gasReserveUnits,
      executionBufferBps: PROFIT_POLICY.executionBufferBps.toString(),
      minNetProfitUsdc: formatUsdc(PROFIT_POLICY.minNetProfitUsdc),
    },
    matrixCompleteness: {
      completed: rows.length,
      expected: expectedRoutes,
    },
    candidateCount,
    rows: reportRows,
  };

  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/latest-scan.json', JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log('Saved machine-readable report: artifacts/latest-scan.json');

  const summaryLines = [
    '# Read-only arbitrage scan',
    '',
    `- Base block: ${blockNumber}`,
    `- Matrix: ${rows.length}/${expectedRoutes} routes completed`,
    `- Candidates: ${candidateCount}`,
    `- Aave flash-loan premium: ${flashLoanPremiumBps} bps`,
    `- Base gas price: ${(Number(gasPrice) / 1e9).toFixed(6)} gwei`,
    `- WETH reference price: ${ethPriceUsdc.toFixed(2)}`,
    '',
    '## Best route in this scan',
    '',
    bestRow
      ? `**${bestRow.route}** starting with **${bestRow.startUsdc}** — estimated net **${bestRow.estimatedNetUsdc}**, decision **${bestRow.decision}**.`
      : 'No completed route was available.',
    '',
    '> Research-only observation. No wallet, signing, or transaction execution is enabled.',
    '',
  ];

  await writeFile('artifacts/summary.md', summaryLines.join('\n'), 'utf8');
  console.log('Saved human-readable summary: artifacts/summary.md');

  if (candidateRows.length > 0) {
    const candidateReport = {
      generatedAt: report.generatedAt,
      blockNumber: report.blockNumber,
      readOnly: true,
      candidateCount: candidateRows.length,
      candidates: candidateRows,
      note: 'Research/simulation candidates only. No wallet, signing, or transactions are enabled.',
    };

    await writeFile(
      'artifacts/candidates.json',
      JSON.stringify(candidateReport, null, 2) + '\n',
      'utf8',
    );

    console.log('Saved candidate-only report: artifacts/candidates.json');

    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(
        `::warning title=Read-only arbitrage candidate detected::${candidateRows.length} route(s) cleared the configured research gates. Review the candidate artifact before any further simulation.`,
      );
    }
  } else {
    console.log('No candidate-only report created because no route cleared the configured gates.');
  }

  console.log('COST MODEL STATUS: CONSERVATIVE READ-ONLY GATE.');
  console.log('DEX quote output includes pool fee and price impact at the quoted size.');
  console.log('Aave flash-loan premium and gas price are read live on-chain.');
  console.log('Gas reserve units, execution buffer, and minimum profit are configurable policy values.');
  console.log('Exact full transaction cost, MEV behavior, and executable safety are not yet proven.');
  console.log('CANDIDATE means research/simulation candidate only — not permission to trade.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
