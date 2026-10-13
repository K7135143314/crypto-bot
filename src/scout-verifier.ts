import { getAddress, isAddress, parseUnits, type Address } from 'viem';
import { aaveV3PoolAbi, aerodromeRouterAbi, uniswapV3QuoterV2Abi } from './abis.js';
import {
  CONTRACTS,
  PROFIT_POLICY,
  TOKENS,
  TRADE_SIZES_USDC,
  UNISWAP_V3_FEES,
  AERODROME_SLIPSTREAM_CL_FACTORIES,
} from './config.js';
import { evaluateOpportunity } from './profit.js';
import { buildScoutReport, type ScoutConfig, type ScoutOpportunity } from './scout.js';
import { client, formatUsdc, formatWeth } from './quotes.js';

const UNISWAP_V3_FACTORY = getAddress('0x33128a8fC17869897dcE68Ed026d694621f6FDfD') as Address;

const uniswapFactoryAbi = [{
  type: 'function',
  name: 'getPool',
  stateMutability: 'view',
  inputs: [
    { name: 'tokenA', type: 'address' },
    { name: 'tokenB', type: 'address' },
    { name: 'fee', type: 'uint24' },
  ],
  outputs: [{ name: 'pool', type: 'address' }],
}] as const;

const aerodromeFactoryAbi = [{
  type: 'function',
  name: 'getPool',
  stateMutability: 'view',
  inputs: [
    { name: 'tokenA', type: 'address' },
    { name: 'tokenB', type: 'address' },
    { name: 'stable', type: 'bool' },
  ],
  outputs: [{ name: 'pool', type: 'address' }],
}] as const;

export type SupportedDex = 'uniswap' | 'aerodrome';

export function normalizeScoutDex(dexId: string): SupportedDex | null {
  const value = dexId.trim().toLowerCase();
  if (value === 'uniswap' || value === 'uniswap-v3') return 'uniswap';
  if (value === 'aerodrome') return 'aerodrome';
  return null;
}

const slipstreamPoolAbi = [{
  type: 'function', name: 'tickSpacing', stateMutability: 'view',
  inputs: [], outputs: [{type: 'int24', name: ''}],
}] as const;
const slipstreamFactoryAbi = [{
  type: 'function', name: 'getPool', stateMutability: 'view',
  inputs: [
    {name:'tokenA',type:'address'}, {name:'tokenB',type:'address'},
    {name:'tickSpacing',type:'int24'},
  ], outputs:[{name:'pool',type:'address'}],
}] as const;
const slipstreamQuoterAbi = [{
  type: 'function', name: 'quoteExactInputSingle', stateMutability: 'nonpayable',
  inputs: [{name:'params',type:'tuple',components:[
    {name:'tokenIn',type:'address'}, {name:'tokenOut',type:'address'},
    {name:'amountIn',type:'uint256'}, {name:'tickSpacing',type:'int24'},
    {name:'sqrtPriceLimitX96',type:'uint160'},
  ]}],
  outputs: [
    {name:'amountOut',type:'uint256'},
    {name:'sqrtPriceX96After',type:'uint160'},
    {name:'initializedTicksCrossed',type:'uint32'},
    {name:'gasEstimate',type:'uint256'},
  ],
}] as const;

export type ExactPoolMatch = {
  dex: SupportedDex;
  pairAddress: Address;
  feeTier?: number;
  variant?: 'AERODROME_CLASSIC' | 'AERODROME_SLIPSTREAM_V1';
  stable?: boolean;
  tickSpacing?: number;
};

// Only the exact pool returned by an approved factory can be quoted.
export function classicPoolMatch(
  candidate: Address, discovered: Address, stable: boolean,
): ExactPoolMatch | null {
  return getAddress(candidate) === getAddress(discovered)
    ? {dex:'aerodrome', pairAddress:getAddress(discovered),
       variant:'AERODROME_CLASSIC',stable} : null;
}
export function classicStableFlag(pool: ExactPoolMatch): boolean {
  if (pool.dex !== 'aerodrome' || (pool.variant !== undefined &&
       pool.variant !== 'AERODROME_CLASSIC')) {
    throw new Error('Not an approved Aerodrome Classic pool');
  }
  return pool.stable === true;
}

export async function resolveExactPool(
  dex: SupportedDex,
  scoutPairAddress: string,
  blockNumber: bigint,
  tokenA: Address = TOKENS.WETH.address,
  tokenB: Address = TOKENS.USDC.address,
): Promise<ExactPoolMatch | null> {
  const scoutAddress = getAddress(scoutPairAddress);

  if (dex === 'aerodrome') {
    const pool = await client.readContract({
      address: CONTRACTS.aerodromePoolFactory,
      abi: aerodromeFactoryAbi,
      functionName: 'getPool',
      args: [tokenA, tokenB, false],
      blockNumber,
    });

    const classicVolatile = classicPoolMatch(pool, scoutAddress, false);
    if (classicVolatile) return classicVolatile;
    const stablePool = await client.readContract({
      address: CONTRACTS.aerodromePoolFactory, abi: aerodromeFactoryAbi,
      functionName:'getPool', args:[tokenA, tokenB, true], blockNumber,
    });
    const classicStable = classicPoolMatch(stablePool, scoutAddress, true);
    if (classicStable) return classicStable;
    // The pool itself supplies tick spacing; verify it against the allowed
    // factory at this same block, never infer spacing from discovery spreads.
    let tickSpacing: number;
    try {
      tickSpacing = await client.readContract({
        address: scoutAddress, abi: slipstreamPoolAbi,
        functionName: 'tickSpacing', blockNumber,
      });
    } catch {
      return null;
    }
    if (!Number.isInteger(tickSpacing) || tickSpacing <= 0 || tickSpacing > 32767) return null;
    for (const factory of AERODROME_SLIPSTREAM_CL_FACTORIES) {
      let actual: Address;
      try {
        actual = await client.readContract({
          address: factory, abi: slipstreamFactoryAbi, functionName: 'getPool',
          args: [tokenA, tokenB, tickSpacing], blockNumber,
        });
      } catch { continue; }
      if (getAddress(actual) === scoutAddress) {
        // Other recognized factory generations lack an approved matching
        // QuoterV2. Fail closed; never use V1 router on an unknown version.
        if (factory !== CONTRACTS.aerodromeSlipstreamV1Factory) return null;
        return {dex, pairAddress: scoutAddress,
          variant: 'AERODROME_SLIPSTREAM_V1', tickSpacing};
      }
    }
    return null;
  }

  for (const fee of UNISWAP_V3_FEES) {
    const pool = await client.readContract({
      address: UNISWAP_V3_FACTORY,
      abi: uniswapFactoryAbi,
      functionName: 'getPool',
      args: [tokenA, tokenB, fee],
      blockNumber,
    });

    if (getAddress(pool) === scoutAddress) {
      return { dex, pairAddress: scoutAddress, feeTier: fee };
    }
  }

  return null;
}

async function quoteAerodrome(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  blockNumber: bigint,
  stable = false,
): Promise<bigint> {
  const route = [{
    from: tokenIn,
    to: tokenOut,
    stable,
    factory: CONTRACTS.aerodromePoolFactory,
  }] as const;

  const amounts = await client.readContract({
    address: CONTRACTS.aerodromeRouter,
    abi: aerodromeRouterAbi,
    functionName: 'getAmountsOut',
    args: [amountIn, route],
    blockNumber,
  });

  const amountOut = amounts[amounts.length - 1];
  if (amountOut === undefined || amountOut <= 0n) {
    throw new Error('Aerodrome returned no output');
  }
  return amountOut;
}

export async function quoteUniswap(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  feeTier: number,
  blockNumber: bigint,
): Promise<bigint> {
  const result = await client.readContract({
    address: CONTRACTS.uniswapV3QuoterV2,
    abi: uniswapV3QuoterV2Abi,
    functionName: 'quoteExactInputSingle',
    args: [{
      tokenIn,
      tokenOut,
      amountIn,
      fee: feeTier,
      sqrtPriceLimitX96: 0n,
    }],
    blockNumber,
  });

  const amountOut = result[0];
  if (amountOut <= 0n) throw new Error('Uniswap returned no output');
  return amountOut;
}

export async function quoteDex(
  pool: ExactPoolMatch,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  blockNumber: bigint,
): Promise<bigint> {
  if (pool.dex === 'aerodrome') {
    if (pool.variant === 'AERODROME_SLIPSTREAM_V1') {
      if (!pool.tickSpacing || !Number.isInteger(pool.tickSpacing)) {
        throw new Error('Slipstream V1 match missing verified tick spacing');
      }
      const quoted = await client.readContract({
        address: CONTRACTS.aerodromeSlipstreamV1Quoter,
        abi: slipstreamQuoterAbi, functionName: 'quoteExactInputSingle',
        args: [{tokenIn, tokenOut, amountIn, tickSpacing: pool.tickSpacing,
          sqrtPriceLimitX96: 0n}], blockNumber,
      });
      if (quoted[0] <= 0n) throw new Error('Slipstream V1 returned no output');
      return quoted[0];
    }
    if (pool.variant !== undefined && pool.variant !== 'AERODROME_CLASSIC') {
      throw new Error('Unapproved Aerodrome pool variant');
    }
    return quoteAerodrome(tokenIn, tokenOut, amountIn, blockNumber,
      classicStableFlag(pool));
  }

  if (!pool.feeTier) throw new Error('Uniswap exact pool is missing fee tier');
  return quoteUniswap(tokenIn, tokenOut, amountIn, pool.feeTier, blockNumber);
}

export type VerificationStatus =
  | 'VERIFIED_CANDIDATE'
  | 'VERIFIED_REJECT'
  | 'UNSUPPORTED_DEX'
  | 'UNSUPPORTED_POOL_VARIANT'
  | 'INVALID_POOL_ADDRESS'
  | 'NOT_SHORTLISTED'
  | 'ERROR';

export type HandoffVerification = {
  scoutRank: number;
  scoutRoute: string;
  scoutSpreadBps: number;
  status: VerificationStatus;
  reason: string;
  pinnedBlock?: string;
  exactPoolMatch?: boolean;
  bestTradeSizeUsdc?: string;
  bestEstimatedNetUsdc?: string;
  decision?: string;
  rows?: Array<{
    startUsdc: string;
    finalUsdc: string;
    grossDeltaUsdc: string;
    estimatedNetUsdc: string;
    decision: string;
  }>;
};

export async function verifyScoutOpportunity(
  opportunity: ScoutOpportunity,
  scoutRank: number,
  blockNumber: bigint,
): Promise<HandoffVerification> {
  const buyDex = normalizeScoutDex(opportunity.buyDex);
  const sellDex = normalizeScoutDex(opportunity.sellDex);
  const scoutRoute = `${opportunity.buyDex} -> ${opportunity.sellDex}`;

  if (opportunity.status !== 'SHORTLIST') {
    return {
      scoutRank,
      scoutRoute,
      scoutSpreadBps: opportunity.indicatedSpreadBps,
      status: 'NOT_SHORTLISTED',
      reason: 'Scout lead did not clear the discovery shortlist threshold.',
    };
  }

  if (!buyDex || !sellDex) {
    return {
      scoutRank,
      scoutRoute,
      scoutSpreadBps: opportunity.indicatedSpreadBps,
      status: 'UNSUPPORTED_DEX',
      reason: 'One or both DEXs do not yet have a proven Base on-chain quote adapter.',
    };
  }

  // A discovery source may supply a bytes32 pool ID instead of a 20-byte
  // EVM address. Classify it before calling viem or any RPC contract.
  if (!isAddress(opportunity.buyPairAddress, { strict: false }) ||
      !isAddress(opportunity.sellPairAddress, { strict: false })) {
    return {
      scoutRank,
      scoutRoute,
      scoutSpreadBps: opportunity.indicatedSpreadBps,
      status: 'INVALID_POOL_ADDRESS',
      reason: 'Discovery pool identifier is not a 20-byte EVM address; no on-chain quote attempted.',
      pinnedBlock: blockNumber.toString(),
      exactPoolMatch: false,
    };
  }

  try {
    const [buyPool, sellPool] = await Promise.all([
      resolveExactPool(buyDex, opportunity.buyPairAddress, blockNumber),
      resolveExactPool(sellDex, opportunity.sellPairAddress, blockNumber),
    ]);

    if (!buyPool || !sellPool) {
      return {
        scoutRank,
        scoutRoute,
        scoutSpreadBps: opportunity.indicatedSpreadBps,
        status: 'UNSUPPORTED_POOL_VARIANT',
        reason: 'The scout pool address does not match the exact Uniswap V3 or Aerodrome Classic pool supported by this verifier.',
        pinnedBlock: blockNumber.toString(),
        exactPoolMatch: false,
      };
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

    const rows = [];
    let ethPriceUsdcMicros = 0n;

    for (const sizeText of TRADE_SIZES_USDC) {
      const startUsdc = parseUnits(sizeText, TOKENS.USDC.decimals);
      const wethReceived = await quoteDex(
        buyPool,
        TOKENS.USDC.address,
        TOKENS.WETH.address,
        startUsdc,
        blockNumber,
      );

      if (ethPriceUsdcMicros === 0n) {
        const startMicros = BigInt(Math.round(Number(sizeText) * 1_000_000));
        ethPriceUsdcMicros = (startMicros * 10n ** 18n) / wethReceived;
      }

      const finalUsdc = await quoteDex(
        sellPool,
        TOKENS.WETH.address,
        TOKENS.USDC.address,
        wethReceived,
        blockNumber,
      );
      const grossProfitUsdc = finalUsdc - startUsdc;

      const evaluation = evaluateOpportunity({
        startUsdc,
        grossProfitUsdc,
        gasPriceWei: gasPrice,
        ethPriceUsdcMicros,
        policy: {
          flashLoanPremiumBps,
          gasReserveUnits: PROFIT_POLICY.gasReserveUnits,
          l1DataFeeReserveUsdc: PROFIT_POLICY.l1DataFeeReserveUsdc,
          slippageReserveBps: PROFIT_POLICY.slippageReserveBps,
          mevReserveBps: PROFIT_POLICY.mevReserveBps,
          minNetProfitUsdc: PROFIT_POLICY.minNetProfitUsdc,
        },
      });

      rows.push({
        startUsdc: sizeText,
        finalUsdc: formatUsdc(finalUsdc),
        grossDeltaUsdc: formatUsdc(grossProfitUsdc),
        estimatedNetUsdc: formatUsdc(evaluation.estimatedNetProfitUsdc),
        decision: evaluation.decision,
      });
    }

    const best = [...rows].sort(
      (a, b) => Number(b.estimatedNetUsdc) - Number(a.estimatedNetUsdc),
    )[0];

    const candidate = rows.some((row) => row.decision === 'CANDIDATE');

    return {
      scoutRank,
      scoutRoute,
      scoutSpreadBps: opportunity.indicatedSpreadBps,
      status: candidate ? 'VERIFIED_CANDIDATE' : 'VERIFIED_REJECT',
      reason: candidate
        ? 'Exact scout pools matched supported adapters and at least one tested size cleared the existing profitability gates.'
        : 'Exact scout pools matched supported adapters, but no tested size cleared the existing profitability gates.',
      pinnedBlock: blockNumber.toString(),
      exactPoolMatch: true,
      bestTradeSizeUsdc: best?.startUsdc,
      bestEstimatedNetUsdc: best?.estimatedNetUsdc,
      decision: best?.decision,
      rows,
    };
  } catch (error) {
    return {
      scoutRank,
      scoutRoute,
      scoutSpreadBps: opportunity.indicatedSpreadBps,
      status: 'ERROR',
      reason: error instanceof Error ? error.message : String(error),
      pinnedBlock: blockNumber.toString(),
    };
  }
}

export async function fetchScoutOpportunities(): Promise<ScoutOpportunity[]> {
  const response = await fetch(
    `https://api.dexscreener.com/token-pairs/v1/base/${TOKENS.WETH.address}`,
    {
      headers: {
        accept: 'application/json',
        'user-agent': 'crypto-bot-scout-verifier/0.1',
      },
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) {
    throw new Error(`DEX Screener request failed: HTTP ${response.status}`);
  }

  const pairs = await response.json();
  if (!Array.isArray(pairs)) {
    throw new Error('DEX Screener returned an unexpected response shape');
  }

  const config: ScoutConfig = {
    minLiquidityUsd: Number(process.env.SCOUT_MIN_LIQUIDITY_USD || '100000'),
    minVolume24hUsd: Number(process.env.SCOUT_MIN_VOLUME_24H_USD || '50000'),
    minSpreadBps: Number(process.env.SCOUT_MIN_SPREAD_BPS || '5'),
    maxPools: Number(process.env.SCOUT_MAX_POOLS || '20'),
    maxOpportunities: Number(process.env.SCOUT_MAX_OPPORTUNITIES || '20'),
  };

  return buildScoutReport(pairs, config).opportunities;
}
