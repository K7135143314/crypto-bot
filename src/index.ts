import { CHAIN_ID, TRADE_SIZES_USDC } from './config.js';
import { client, formatUsdc, formatWeth, quoteRoundTrip } from './quotes.js';

async function main(): Promise<void> {
  const [chainId, blockNumber] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
  ]);

  if (chainId !== CHAIN_ID) {
    throw new Error(`Wrong chain: expected Base ${CHAIN_ID}, got ${chainId}`);
  }

  console.log('DEX Arbitrage Scanner V0.1 — READ ONLY');
  console.log(`Base block: ${blockNumber}`);
  console.log('Pair: WETH / USDC');
  console.log('DEXs: Aerodrome classic / Uniswap v3');
  console.log('No wallet. No signing. No transactions.\n');

  for (const size of TRADE_SIZES_USDC) {
    for (const firstDex of ['aerodrome', 'uniswap-v3'] as const) {
      const routeName = firstDex === 'aerodrome'
        ? 'Aerodrome -> Uniswap v3'
        : 'Uniswap v3 -> Aerodrome';

      try {
        const result = await quoteRoundTrip(client, size, firstDex);
        const profitable = result.grossProfitUsdc > 0n;

        console.log(`${routeName} | start $${size}`);
        console.log(`  WETH after leg 1: ${formatWeth(result.wethReceived)}`);
        console.log(`  Final USDC:       $${formatUsdc(result.finalUsdc)}`);
        console.log(`  Gross delta:      $${formatUsdc(result.grossProfitUsdc)}`);
        if (result.first.feeTier) console.log(`  Uniswap fee tier: ${result.first.feeTier}`);
        if (result.second.feeTier) console.log(`  Uniswap fee tier: ${result.second.feeTier}`);
        console.log(`  Raw status:       ${profitable ? 'POSITIVE' : 'NEGATIVE'}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`${routeName} | start $${size}`);
        console.log(`  STATUS: QUOTE FAILED — ${message}\n`);
      }
    }
  }

  console.log('NOTE: V0.1 reports raw round-trip quote delta only.');
  console.log('Gas, MEV protection, safety margin, and Aerodrome Slipstream are not yet included.');
  console.log('A positive raw delta is NOT yet a trade signal.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
