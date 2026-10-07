const HISTORY_URL =
  'https://raw.githubusercontent.com/K7135143314/crypto-bot/observer-data/data/history.json';

export default async function handler(request, response) {
  try {
    const upstream = await fetch(HISTORY_URL, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
      },
    });

    if (!upstream.ok) {
      throw new Error(`Central history returned HTTP ${upstream.status}`);
    }

    const history = await upstream.json();

    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.status(200).json({
      ok: true,
      ...history,
    });
  } catch (error) {
    response.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
