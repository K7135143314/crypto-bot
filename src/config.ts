import { getAddress, parseUnits, type Address } from 'viem';

export const CHAIN_ID = 8453;

const configuredRpcUrls = (process.env.BASE_RPC_URLS || process.env.BASE_RPC_URL || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

export const BASE_RPC_URLS = Array.from(new Set([
  ...configuredRpcUrls,
  'https://base-rpc.publicnode.com',
  'https://public.1rpc.io/base',
  'https://mainnet.base.org',
]));

export const TOKENS = {
  WETH: {
    symbol: 'WETH',
    address: getAddress('0x4200000000000000000000000000000000000006') as Address,
    decimals: 18,
  },
  USDC: {
    symbol: 'USDC',
    address: getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as Address,
    decimals: 6,
  },
  cbBTC: {
    symbol: 'cbBTC',
    // Native Base cbBTC, not Ethereum BTC or a bridged substitute.
    address: getAddress('0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf') as Address,
    decimals: 8,
  },
} as const;

export const CONTRACTS = {
  aerodromeRouter: getAddress('0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43') as Address,
  aerodromePoolFactory: getAddress('0x420DD381b31aEf6683db6B902084cB0FFECe40Da') as Address,
  // Official Aerodrome initial Slipstream deployment. New CL factories require
  // their own independently verified quoter and may not use this quoter.
  aerodromeSlipstreamV1Factory: getAddress('0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A') as Address,
  aerodromeSlipstreamV1Quoter: getAddress('0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0') as Address,
  uniswapV3QuoterV2: getAddress('0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a') as Address,
  aaveV3Pool: getAddress('0xA238Dd80C259a72e81d7e4664a9801593F98d1c5') as Address,
} as const;

// Recognize all three observed Aerodrome Slipstream CL factory generations,
// but only V1 has a verified QuoterV2 deployed in our approved configuration.
// Any other CL factory remains UNVERIFIED for quoting (never assumes fees).
export const AERODROME_SLIPSTREAM_CL_FACTORIES = [
  CONTRACTS.aerodromeSlipstreamV1Factory,
  getAddress('0xaDe65c38CD4849aDBA595a4323a8C7DdfE89716a') as Address,
  getAddress('0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef') as Address,
] as const;

export const UNISWAP_V3_FEES = [100, 500, 3000, 10000] as const;

const configuredSizes = (process.env.TRADE_SIZES_USDC || '100,250,500,1000,2500,5000,10000')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

export const TRADE_SIZES_USDC = configuredSizes;

export const GAS_UNIT_SCENARIOS = (process.env.GAS_UNIT_SCENARIOS || '300000,500000,800000')
  .split(',')
  .map((x) => Number(x.trim()))
  .filter((x) => Number.isFinite(x) && x > 0);

export const PROFIT_POLICY = {
  gasReserveUnits: Number(process.env.GAS_RESERVE_UNITS || '800000'),
  l1DataFeeReserveUsdc: parseUnits(process.env.L1_DATA_FEE_RESERVE_USDC || '0.05', TOKENS.USDC.decimals),
  slippageReserveBps: BigInt(process.env.SLIPPAGE_RESERVE_BPS || '10'),
  mevReserveBps: BigInt(process.env.MEV_RESERVE_BPS || '10'),
  minNetProfitUsdc: parseUnits(process.env.MIN_NET_PROFIT_USDC || '1', TOKENS.USDC.decimals),
} as const;
