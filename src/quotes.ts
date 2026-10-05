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
  transport: http(BASE_RPC_URL, { timeout: 15_000, retryCount: 0 }),
});

type BasePublicClient = typeof client;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const RPC_MIN_GAP_MS = Number(process.env.RPC_MIN_GAP_MS || '1200');
let lastRpcAt = 0;

async function waitForRpcSlot(): Promise<void> {
  const elapsed = Date.now() - lastRpcAt;
  const waitMs = Math.max(0, RPC_MIN_GAP_MS - elapsed);
  if (waitMs > 0) await sleep(waitMs);
  lastRpcAt = Date.now();
}

function errorSummary(error: unknown): string {
  const e = error as Error & { shortMessage?: string; details?: string };
  return e.shortMessage || e.details || e.message?.split('\n')[0] || String(error);
}

export async function quoteAerodrome(
  publicClient: BasePublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  blockNumber: bigint,
): Promise<DexQuote> {
  const route = [{
    from: tokenIn,
    to: tokenOut,
    stable: false,
    factory: CONTRACTS.aerodromePoolFactory,
  }] as const;

  const failures: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await waitForRpcSlot();

      const amounts = await publicClient.readContract({
        address: CONTRACTS.aerodromeRouter,
        abi: aerodromeRouterAbi,
        functionName: 'getAmountsOut',
        args: [amountIn, route],
        blockNumber,
      });

      const amountOut = amounts[amounts.length - 1];
      if (amountOut === undefined || amountOut <= 0n) {
        throw new Error('Aerodrome returned no output amount');
      }

      return { dex: 'aerodrome', tokenIn, tokenOut, amountIn, amountOut };
    } catch (error) {
      failures.push(`attempt ${attempt}: ${errorSummary(error)}`);
      if (attempt < 3) await sleep(700 * attempt);
    }
  }

  throw new Error(`Aerodrome quote failed. Diagnostics: ${failures.join(' | ')}`);
}

export async function quoteUniswapV3(
  publicClient: BasePublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  blockNumber: bigint,
): Promise<DexQuote> {
  const successful: DexQuote[] = [];
  const failures: string[] = [];

  for (const fee of UNISWAP_V3_FEES) {
    let completed = false;

    for (let attempt = 1; attempt <= 3 && !completed; attempt += 1) {
      try {
        await waitForRpcSlot();

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
          blockNumber,
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

        completed = true;
      } catch (error) {
        if (attempt === 3) {
          failures.push(`${fee}: ${errorSummary(error)}`);
        } else {
          await sleep(700 * attempt);
        }
      }
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
  blockNumber: bigint,
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
    ? await quoteAerodrome(publicClient, TOKENS.USDC.address, TOKENS.WETH.address, start, blockNumber)
    : await quoteUniswapV3(publicClient, TOKENS.USDC.address, TOKENS.WETH.address, start, blockNumber);

  const second = firstDex === 'aerodrome'
    ? await quoteUniswapV3(publicClient, TOKENS.WETH.address, TOKENS.USDC.address, first.amountOut, blockNumber)
    : await quoteAerodrome(publicClient, TOKENS.WETH.address, TOKENS.USDC.address, first.amountOut, blockNumber);

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
