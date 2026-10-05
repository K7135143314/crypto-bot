import { getAddress, type Address } from 'viem';

export const CHAIN_ID = 8453;
export const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

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
} as const;

export const CONTRACTS = {
  aerodromeRouter: getAddress('0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43') as Address,
  aerodromePoolFactory: getAddress('0x420DD381b31aEf6683db6B902084cB0FFECe40Da') as Address,
  uniswapV3QuoterV2: getAddress('0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a') as Address,
} as const;

export const UNISWAP_V3_FEES = [100, 500, 3000, 10000] as const;

const configuredSizes = (process.env.TRADE_SIZES_USDC || '100,250,500,1000,2500,5000,10000')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

export const TRADE_SIZES_USDC = configuredSizes;
