import {
  createPublicClient,
  formatUnits,
  http,
  parseUnits,
  type Address,
} from 'viem';
import { base } from 'viem/chains';
import { aerodromeRouterAbi, uniswapV3QuoterV2Abi } from './abis.js';
import {
  BASE_RPC_URL,
  CONTRACTS,
  TOKENS,
  UNISWAP_V3_FEES,
} from './config.js';

export type DexQuote = {
  dex: 'aerodrome' | 'uniswap-v3';
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  feeTier?: number;
  gasEstimate?: bigint;
};

export const client = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL, { timeout: 12_000, retryCount: 1 }),
});

type BasePublicClient = typeof client;

export async function quoteAerodrome(
  publicClient: BasePublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<DexQuote> {
  const route = [{
    from: tokenIn,
    to: tokenOut,
    stable: false,
    factory: CONTRACTS.aerodromePoolFactory,
  }] as const;

  const amounts = await publicClient.readContract({
    address: CONTRACTS.aerodromeRouter,
    abi: aerodromeRouterAbi,
    functionName: 'getAmountsOut',
    args: [amountIn, route],
  });

  const amountOut = amounts[amounts.length - 1];
  if (amountOut === undefined || amountOut <= 0n) {
    throw new Error('Aerodrome returned no output amount');
  }

  return { dex: 'aerodrome', tokenIn, tokenOut, amountIn, amountOut };
}

export async function quoteUniswapV3(
  publicClient: BasePublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<DexQuote> {
  const successful: DexQuote[] = [];
  const failures: string[] = [];

  // Query fee tiers sequentially. Public Base RPC endpoints can throttle bursts,
  // and a throttled request must not be misclassified as "no liquidity".
  for (const fee of UNISWAP_V3_FEES) {
    try {
      const result = await publicClient.simulateContract({
        address: CONTRACTS.uniswapV3QuoterV2,
        abi: uniswapV3QuoterV2Abi,
        functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn,
          tokenOut,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        }],
      });

      const [amountOut, , , gasEstimate] = result.result;
      if (amountOut > 0n) {
        successful.push({
          dex: 'uniswap-v3',
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          feeTier: fee,
          gasEstimate,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      failures.push(`${fee}: ${message}`);
    }
  }

  if (successful.length === 0) {
    throw new Error(
      `No Uniswap v3 fee tier returned a quote. Diagnostics: ${failures.join(' | ')}`,
    );
  }

  successful.sort((a, b) => (a.amountOut > b.amountOut ? -1 : a.amountOut < b.amountOut ? 1 : 0));
  return successful[0]!;
}

export async function quoteRoundTrip(
  publicClient: BasePublicClient,
  startUsdc: string,
  firstDex: 'aerodrome' | 'uniswap-v3',
): Promise<{
  startUsdc: bigint;
  wethReceived: bigint;
  finalUsdc: bigint;
  grossProfitUsdc: bigint;
  first: DexQuote;
  second: DexQuote;
}> {
  const start = parseUnits(startUsdc, TOKENS.USDC.decimals);

  const first = firstDex === 'aerodrome'
    ? await quoteAerodrome(publicClient, TOKENS.USDC.address, TOKENS.WETH.address, start)
    : await quoteUniswapV3(publicClient, TOKENS.USDC.address, TOKENS.WETH.address, start);

  const second = firstDex === 'aerodrome'
    ? await quoteUniswapV3(publicClient, TOKENS.WETH.address, TOKENS.USDC.address, first.amountOut)
    : await quoteAerodrome(publicClient, TOKENS.WETH.address, TOKENS.USDC.address, first.amountOut);

  return {
    startUsdc: start,
    wethReceived: first.amountOut,
    finalUsdc: second.amountOut,
    grossProfitUsdc: second.amountOut - start,
    first,
    second,
  };
}

export function formatUsdc(value: bigint): string {
  return Number(formatUnits(value, TOKENS.USDC.decimals)).toFixed(6);
}

export function formatWeth(value: bigint): string {
  return Number(formatUnits(value, TOKENS.WETH.decimals)).toFixed(8);
}
