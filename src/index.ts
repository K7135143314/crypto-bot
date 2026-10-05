import { CHAIN_ID, TRADE_SIZES_USDC } from './config.js';
import { client, formatUsdc, formatWeth, quoteMatrix } from './quotes.js';

async function main(): Promise<void> {
  const chainId = await client.getChainId();
  const blockNumber = await client.getBlockNumber();

  if (chainId !== CHAIN_ID) {
    throw new Error(`Wrong chain: expected Base ${CHAIN_ID}, got ${chainId}`);
  }

  console.log('DEX Arbitrage Scanner V0.1 — READ ONLY');
  console.log(`Pinned Base block: ${blockNumber}`);
  console.log('Pair: WETH / USDC');
  console.log('DEXs: Aerodrome classic / Uniswap v3');
  console.log('No wallet. No signing. No transactions.\n');

  const rows = await quoteMatrix(client, TRADE_SIZES_USDC, blockNumber);

  for (const result of rows) {
    const routeName = result.firstDex === 'aerodrome'
      ? 'Aerodrome -> Uniswap v3'
      : 'Uniswap v3 -> Aerodrome';

    const profitable = result.grossProfitUsdc > 0n;
    const deltaUsd = Number(formatUsdc(result.grossProfitUsdc));
    const deltaPct = (deltaUsd / Number(result.startUsdcText)) * 100;

    console.log(`${routeName} | start $${result.startUsdcText}`);
    console.log(`  WETH after leg 1: ${formatWeth(result.wethReceived)}`);
    console.log(`  Final USDC:       $${formatUsdc(result.finalUsdc)}`);
    console.log(`  Gross delta:      $${formatUsdc(result.grossProfitUsdc)} (${deltaPct.toFixed(4)}%)`);
    if (result.first.feeTier) console.log(`  Uniswap fee tier: ${result.first.feeTier}`);
    if (result.second.feeTier) console.log(`  Uniswap fee tier: ${result.second.feeTier}`);
    console.log(`  Raw status:       ${profitable ? 'POSITIVE' : 'NEGATIVE'}\n`);
  }

  const expectedRoutes = TRADE_SIZES_USDC.length * 2;
  console.log(`Matrix completeness: ${rows.length}/${expectedRoutes} routes completed.`);

  if (rows.length !== expectedRoutes) {
    throw new Error(`Incomplete quote matrix: expected ${expectedRoutes}, received ${rows.length}.`);
  }

  console.log('NOTE: V0.1 reports raw round-trip quote delta only.');
  console.log('Gas, MEV protection, safety margin, and Aerodrome Slipstream are not yet included.');
  console.log('A positive raw delta is NOT yet a trade signal.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
