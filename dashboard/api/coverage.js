import { summarizeCollection } from '../lib/coverage.js';

const BASE = 'https://raw.githubusercontent.com/K7135143314/crypto-bot/observer-data/data/';
const STREAMS = [
  { key: 'research', file: 'history.json', field: 'observations' },
  { key: 'markets', file: 'markets.json', field: 'runs' },
  { key: 'verification', file: 'verification.json', field: 'runs' },
  { key: 'intelligence', file: 'intelligence.json', field: 'runs' },
];

async function loadStream(stream) {
  const upstream = await fetch(BASE + stream.file, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!upstream.ok) throw new Error('Saved data HTTP ' + upstream.status);
  const doc = await upstream.json();
  if (!Array.isArray(doc?.[stream.field])) throw new Error('Invalid central collection history');
  return doc[stream.field];
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const measuredAt = new Date().toISOString();
  const now = Date.parse(measuredAt);
  const outcomes = await Promise.allSettled(STREAMS.map(loadStream));
  const streams = STREAMS.map((stream, index) => {
    const result = outcomes[index];
    if (result.status === 'fulfilled') {
      return summarizeCollection(stream.key, result.value, now);
    }
    return {
      key: stream.key, savedRows: null, eligibleRows: null, recoveredRows: null,
      latestAt: null, ageMinutes: null, hoursCovered: null, hoursExpected: 24,
      samplesInWindow: null, state: 'SOURCE_ERROR',
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });

  const available = streams.filter((stream) => stream.state !== 'SOURCE_ERROR').length;
  res.status(available ? 200 : 502).json({
    ok: available > 0,
    readOnly: true,
    executionAuthorized: false,
    measuredAt,
    partial: available !== STREAMS.length,
    streams,
    note: 'Coverage means distinct UTC clock hours with saved snapshots in the current 24-hour set, not proof of scheduled workflow success. Missed hours cannot be backfilled with invented prices.',
  });
}
