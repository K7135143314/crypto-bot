const URL =
  'https://raw.githubusercontent.com/K7135143314/crypto-bot/observer-data/data/intelligence.json';

export default async function handler(request, response) {
  try {
    const upstream = await fetch(URL, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!upstream.ok) throw new Error('Intelligence history HTTP ' + upstream.status);
    const data = await upstream.json();
    if (!Array.isArray(data.runs)) throw new Error('Invalid intelligence history');
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.status(200).json({
      ok: true,
      ...data,
      note: 'Research only. These are quote-based estimates, not executable-profit guarantees.',
    });
  } catch (error) {
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
