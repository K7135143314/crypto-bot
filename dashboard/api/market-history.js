const HISTORY_URL = 'https://raw.githubusercontent.com/K7135143314/crypto-bot/observer-data/data/markets.json';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    const upstream = await fetch(HISTORY_URL, { cache: 'no-store', headers: {accept:'application/json'} });
    if (!upstream.ok) throw new Error('Market history HTTP '+upstream.status);
    const data = await upstream.json();
    if (!Array.isArray(data.runs)) throw new Error('Invalid market history');
    res.status(200).json({ ok:true, ...data, readOnly:true, executionAuthorized:false });
  } catch (error) {
    res.status(502).json({ ok:false, error:error instanceof Error?error.message:String(error)});
  }
}
