import { aaveV3PoolAbi } from './abis.js';
import {
  CHAIN_ID,
  CONTRACTS,
  GAS_UNIT_SCENARIOS,
  TRADE_SIZES_USDC,
} from './config.js';
import { client, formatUsdc, formatWeth, quoteMatrix } from './quotes.js';

function applyBps(amount: bigint, bps: bigint): bigint {
  return (amount * bps) / 10_000n;
}

function estimateEthPriceUsdc(rows: Awaited<ReturnType<typeof quoteMatrix>>): number {
  const anchor = rows.find(
    (row) => row.firstDex === 'uniswap-v3' && row.startUsdcText === TRADE_SIZES_USDC[0],
  );

  if (!anchor) return 0;

  const startUsdc = Number(anchor.startUsdc) / 1e6;
  const weth = Number(anchor.wethReceived) / 1e18;
  return weth > 0 ? startUsdc / weth : 0;
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

  console.log('DEX Arbitrage Scanner V0.3 — READ ONLY');
  console.log(`Pinned Base block: ${blockNumber}`);
  console.log('Pair: WETH / USDC');
  console.log('DEXs: Aerodrome classic / Uniswap v3');
  console.log(`Aave V3 hypothetical flash-loan premium: ${flashLoanPremiumBps} bps (${Number(flashLoanPremiumBps) / 100}%)`);
  console.log(`Live Base gas price: ${(Number(gasPrice) / 1e9).toFixed(6)} gwei`);
  console.log('No wallet. No signing. No transactions.\n');

  const rows = await quoteMatrix(client, TRADE_SIZES_USDC, blockNumber);
  const ethPriceUsdc = estimateEthPriceUsdc(rows);

  console.log(`Approximate WETH reference price from live quote: $${ethPriceUsdc.toFixed(2)}`);
  console.log('L2 execution-only gas scenarios (not full Base transaction cost):');

  for (const units of GAS_UNIT_SCENARIOS) {
    const gasEth = (Number(gasPrice) * units) / 1e18;
    const gasUsdc = gasEth * ethPriceUsdc;
    console.log(`  ${units.toLocaleString()} gas -> about $${gasUsdc.toFixed(6)} USDC`);
  }

  console.log('');

  for (const result of rows) {
    const routeName = result.firstDex === 'aerodrome'
      ? 'Aerodrome -> Uniswap v3'
      : 'Uniswap v3 -> Aerodrome';

    const deltaUsd = Number(formatUsdc(result.grossProfitUsdc));
    const deltaPct = (deltaUsd / Number(result.startUsdcText)) * 100;
    const hypotheticalFlashFee = applyBps(result.startUsdc, flashLoanPremiumBps);
    const afterFlashLoan = result.grossProfitUsdc - hypotheticalFlashFee;
    const remainingCostBudget = afterFlashLoan > 0n ? afterFlashLoan : 0n;

    let decision: string;
    if (result.grossProfitUsdc <= 0n) {
      decision = 'REJECT — raw round trip already loses money';
    } else if (afterFlashLoan <= 0n) {
      decision = 'REJECT — flash-loan premium removes the raw profit';
    } else {
      decision = 'WATCH ONLY — positive before full gas/MEV/safety costs';
    }

    console.log(`${routeName} | start $${result.startUsdcText}`);
    console.log(`  WETH after leg 1:       ${formatWeth(result.wethReceived)}`);
    console.log(`  Final USDC:             $${formatUsdc(result.finalUsdc)}`);
    console.log(`  Gross delta:            $${formatUsdc(result.grossProfitUsdc)} (${deltaPct.toFixed(4)}%)`);
    console.log(`  Hypothetical flash fee: $${formatUsdc(hypotheticalFlashFee)}`);
    console.log(`  After flash-loan fee:   $${formatUsdc(afterFlashLoan)}`);
    console.log(`  Cost budget left:       $${formatUsdc(remainingCostBudget)}`);
    if (result.first.feeTier) console.log(`  Uniswap fee tier:       ${result.first.feeTier}`);
    if (result.second.feeTier) console.log(`  Uniswap fee tier:       ${result.second.feeTier}`);
    console.log(`  Decision:               ${decision}\n`);
  }

  const expectedRoutes = TRADE_SIZES_USDC.length * 2;
  console.log(`Matrix completeness: ${rows.length}/${expectedRoutes} routes completed.`);

  if (rows.length !== expectedRoutes) {
    throw new Error(`Incomplete quote matrix: expected ${expectedRoutes}, received ${rows.length}.`);
  }

  console.log('COST MODEL STATUS: PARTIAL.');
  console.log('DEX quote output already includes pool fee and price impact at the quoted size.');
  console.log('Aave flash-loan premium is read live on-chain and shown hypothetically.');
  console.log('Gas price is live, but gas-unit scenarios are illustrative only.');
  console.log('Exact Base transaction cost requires an actual executor transaction to simulate.');
  console.log('MEV/execution risk and a safety buffer are not yet proven.');
  console.log('Therefore WATCH ONLY is not permission to trade.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
