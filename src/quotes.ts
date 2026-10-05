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

export type MatrixRow = {
  startUsdcText: string;
  firstDex: 'aerodrome' | 'uniswap-v3';
  startUsdc: bigint;
  wethReceived: bigint;
  finalUsdc: bigint;
  grossProfitUsdc: bigint;
  first: DexQuote;
  second: DexQuote;
};

export const client = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL, { timeout: 20_000, retryCount: 0 }),
});

type BasePublicClient = typeof client;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorSummary(error: unknown): string {
  const e = error as Error & { shortMessage?: string; details?: string };
  return e.details || e.shortMessage || e.message?.split('\n')[0] || String(error);
}

async function withRpcRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const failures: string[] = [];

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      failures.push(`attempt ${attempt}: ${errorSummary(error)}`);
      if (attempt < 4) await sleep(1000 * attempt);
    }
  }

  throw new Error(`${label} failed. Diagnostics: ${failures.join(' | ')}`);
}

export async function quoteAerodromeBatch(
  publicClient: BasePublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountsIn: readonly bigint[],
  blockNumber: bigint,
): Promise<DexQuote[]> {
  const route = [{
    from: tokenIn,
    to: tokenOut,
    stable: false,
    factory: CONTRACTS.aerodromePoolFactory,
  }] as const;

  const contracts = amountsIn.map((amountIn) => ({
    address: CONTRACTS.aerodromeRouter,
    abi: aerodromeRouterAbi,
    functionName: 'getAmountsOut' as const,
    args: [amountIn, route] as const,
  }));

  const results = await withRpcRetry('Aerodrome batch quote', () =>
    publicClient.multicall({
      contracts,
      allowFailure: true,
      blockNumber,
    }),
  );

  return results.map((result, index) => {
    const amountIn = amountsIn[index]!;

    if (result.status !== 'success') {
      throw new Error(
        `Aerodrome quote failed for amount ${amountIn}: ${errorSummary(result.error)}`,
      );
    }

    const amounts = result.result as readonly bigint[];
    const amountOut = amounts[amounts.length - 1];

    if (amountOut === undefined || amountOut <= 0n) {
      throw new Error(`Aerodrome returned no output for amount ${amountIn}`);
    }

    return {
      dex: 'aerodrome' as const,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
    };
  });
}

export async function quoteUniswapV3Batch(
  publicClient: BasePublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountsIn: readonly bigint[],
  blockNumber: bigint,
): Promise<DexQuote[]> {
  const output: DexQuote[] = [];
  const chunkSize = 2;

  for (let start = 0; start < amountsIn.length; start += chunkSize) {
    const chunk = amountsIn.slice(start, start + chunkSize);

    const contracts = chunk.flatMap((amountIn) =>
      UNISWAP_V3_FEES.map((fee) => ({
        address: CONTRACTS.uniswapV3QuoterV2,
        abi: uniswapV3QuoterV2Abi,
        functionName: 'quoteExactInputSingle' as const,
        args: [{
          tokenIn,
          tokenOut,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        }] as const,
      })),
    );

    const results = await withRpcRetry('Uniswap v3 batch quote', () =>
      publicClient.multicall({
        contracts,
        allowFailure: true,
        blockNumber,
      }),
    );

    for (let localIndex = 0; localIndex < chunk.length; localIndex += 1) {
      const amountIn = chunk[localIndex]!;
      const candidates: DexQuote[] = [];
      const failures: string[] = [];

      for (let feeIndex = 0; feeIndex < UNISWAP_V3_FEES.length; feeIndex += 1) {
        const fee = UNISWAP_V3_FEES[feeIndex]!;
        const resultIndex = localIndex * UNISWAP_V3_FEES.length + feeIndex;
        const result = results[resultIndex];

        if (!result) {
          failures.push(`${fee}: missing result`);
          continue;
        }

        if (result.status !== 'success') {
          failures.push(`${fee}: ${errorSummary(result.error)}`);
          continue;
        }

        const quote = result.result as readonly [bigint, bigint, number, bigint];
        const [amountOut, , , gasEstimate] = quote;

        if (amountOut > 0n) {
          candidates.push({
            dex: 'uniswap-v3',
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            feeTier: fee,
            gasEstimate,
          });
        }
      }

      if (candidates.length === 0) {
        throw new Error(
          `No Uniswap v3 fee tier quoted amount ${amountIn}. Diagnostics: ${failures.join(' | ')}`,
        );
      }

      candidates.sort((a, b) =>
        a.amountOut > b.amountOut ? -1 : a.amountOut < b.amountOut ? 1 : 0,
      );
      output.push(candidates[0]!);
    }

    if (start + chunkSize < amountsIn.length) await sleep(600);
  }

  return output;
}

export async function quoteMatrix(
  publicClient: BasePublicClient,
  tradeSizesUsdc: readonly string[],
  blockNumber: bigint,
): Promise<MatrixRow[]> {
  const starts = tradeSizesUsdc.map((size) => parseUnits(size, TOKENS.USDC.decimals));

  const aerodromeFirst = await quoteAerodromeBatch(
    publicClient,
    TOKENS.USDC.address,
    TOKENS.WETH.address,
    starts,
    blockNumber,
  );

  await sleep(600);

  const uniswapFirst = await quoteUniswapV3Batch(
    publicClient,
    TOKENS.USDC.address,
    TOKENS.WETH.address,
    starts,
    blockNumber,
  );

  await sleep(600);

  const uniswapSecond = await quoteUniswapV3Batch(
    publicClient,
    TOKENS.WETH.address,
    TOKENS.USDC.address,
    aerodromeFirst.map((quote) => quote.amountOut),
    blockNumber,
  );

  await sleep(600);

  const aerodromeSecond = await quoteAerodromeBatch(
    publicClient,
    TOKENS.WETH.address,
    TOKENS.USDC.address,
    uniswapFirst.map((quote) => quote.amountOut),
    blockNumber,
  );

  const rows: MatrixRow[] = [];

  for (let i = 0; i < tradeSizesUsdc.length; i += 1) {
    const startUsdcText = tradeSizesUsdc[i]!;
    const startUsdc = starts[i]!;
    const aeroFirst = aerodromeFirst[i]!;
    const uniFirst = uniswapFirst[i]!;
    const uniSecond = uniswapSecond[i]!;
    const aeroSecond = aerodromeSecond[i]!;

    rows.push({
      startUsdcText,
      firstDex: 'aerodrome',
      startUsdc,
      wethReceived: aeroFirst.amountOut,
      finalUsdc: uniSecond.amountOut,
      grossProfitUsdc: uniSecond.amountOut - startUsdc,
      first: aeroFirst,
      second: uniSecond,
    });

    rows.push({
      startUsdcText,
      firstDex: 'uniswap-v3',
      startUsdc,
      wethReceived: uniFirst.amountOut,
      finalUsdc: aeroSecond.amountOut,
      grossProfitUsdc: aeroSecond.amountOut - startUsdc,
      first: uniFirst,
      second: aeroSecond,
    });
  }

  return rows;
}

export function formatUsdc(value: bigint): string {
  return Number(formatUnits(value, TOKENS.USDC.decimals)).toFixed(6);
}

export function formatWeth(value: bigint): string {
  return Number(formatUnits(value, TOKENS.WETH.decimals)).toFixed(8);
}
