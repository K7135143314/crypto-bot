import { CHAIN_ID, TRADE_SIZES_USDC } from './config.js';
import { client, formatUsdc, formatWeth, quoteRoundTrip } from './quotes.js';

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

  let completedRoutes = 0;
  let failedRoutes = 0;

  for (const size of TRADE_SIZES_USDC) {
    for (const firstDex of ['aerodrome', 'uniswap-v3'] as const) {
      const routeName = firstDex === 'aerodrome'
        ? 'Aerodrome -> Uniswap v3'
        : 'Uniswap v3 -> Aerodrome';

      try {
        const result = await quoteRoundTrip(client, size, firstDex, blockNumber);
        const profitable = result.grossProfitUsdc > 0n;
        const deltaUsd = Number(formatUsdc(result.grossProfitUsdc));
        const deltaPct = (deltaUsd / Number(size)) * 100;

        console.log(`${routeName} | start $${size}`);
        console.log(`  WETH after leg 1: ${formatWeth(result.wethReceived)}`);
        console.log(`  Final USDC:       $${formatUsdc(result.finalUsdc)}`);
        console.log(`  Gross delta:      $${formatUsdc(result.grossProfitUsdc)} (${deltaPct.toFixed(4)}%)`);
        if (result.first.feeTier) console.log(`  Uniswap fee tier: ${result.first.feeTier}`);
        if (result.second.feeTier) console.log(`  Uniswap fee tier: ${result.second.feeTier}`);
        console.log(`  Raw status:       ${profitable ? 'POSITIVE' : 'NEGATIVE'}\n`);
        completedRoutes += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`${routeName} | start $${size}`);
        console.log(`  STATUS: QUOTE FAILED — ${message}\n`);
        failedRoutes += 1;
      }
    }
  }

  const expectedRoutes = TRADE_SIZES_USDC.length * 2;
  console.log(`Matrix completeness: ${completedRoutes}/${expectedRoutes} routes completed.`);

  console.log('NOTE: V0.1 reports raw round-trip quote delta only.');
  console.log('Gas, MEV protection, safety margin, and Aerodrome Slipstream are not yet included.');
  console.log('A positive raw delta is NOT yet a trade signal.');

  if (failedRoutes > 0) {
    throw new Error(`Incomplete quote matrix: ${failedRoutes} of ${expectedRoutes} routes failed.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
