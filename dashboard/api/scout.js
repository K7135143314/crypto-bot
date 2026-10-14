import { SCOUT_TOKENS, DEFAULT_SCOUT_POLICY, selectEligiblePools, rankCrossDexOpportunities } from '../lib/scout-core.js';

const WETH = SCOUT_TOKENS.WETH;
const POLICY = DEFAULT_SCOUT_POLICY;

export default async function handler(req, res) {
  try {
    const endpoint =
      'https://api.dexscreener.com/token-pairs/v1/base/' + WETH;

    const response = await fetch(endpoint, {
      headers: {
        accept: 'application/json',
        'user-agent': 'crypto-bot-dashboard-scout/0.1',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      throw new Error('DEX Screener request failed: HTTP ' + response.status);
    }

    const pairs = await response.json();

    if (!Array.isArray(pairs)) {
      throw new Error('DEX Screener returned an unexpected response shape');
    }

    const eligiblePools = selectEligiblePools(pairs, POLICY);
    const opportunities = rankCrossDexOpportunities(eligiblePools, POLICY);
    const shortlistCount = opportunities.filter(
      (item) => item.status === 'SHORTLIST'
    ).length;

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      ok: true,
      readOnly: true,
      executionAuthorized: false,
      generatedAt: new Date().toISOString(),
      source: 'DEX Screener',
      chain: 'Base',
      pair: 'WETH/USDC',
      policy: POLICY,
      sourcePairCount: pairs.length,
      eligiblePoolCount: eligiblePools.length,
      shortlistCount,
      best: opportunities[0] || null,
      opportunities: opportunities.slice(0, 5),
      note:
        'Discovery lead only. Direct on-chain quote and existing profitability/simulation gates remain required.',
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(500).json({
      ok: false,
      readOnly: true,
      executionAuthorized: false,
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
