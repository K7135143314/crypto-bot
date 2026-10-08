import { scanSixMarkets } from '../lib/market-watch.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    const report = await scanSixMarkets();
    res.status(200).json({ ok: true, ...report });
  } catch (error) {
    res.status(502).json({ ok: false, readOnly: true, executionAuthorized: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}
