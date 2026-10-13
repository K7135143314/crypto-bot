// Pure read-only collection coverage calculations. No estimates of missing market prices.
export const HOUR_MS = 60 * 60 * 1000;
export const EXPECTED_HOUR_BUCKETS = 24;
export const LATE_AFTER_MS = 2 * HOUR_MS;

export function isScheduledResearchObservation(observation) {
  if (!observation || typeof observation !== 'object') return false;
  if (String(observation.source || '').startsWith('legacy-browser')) return false;
  // Recovered local observations may not have a real pinned Base block.
  return /^[1-9][0-9]*$/.test(String(observation.blockNumber || ''));
}

export function summarizeCollection(key, rows, now = Date.now()) {
  if (!Array.isArray(rows)) throw new TypeError('Collection history must be an array');
  if (!Number.isFinite(now)) throw new TypeError('Current timestamp is invalid');

  const eligible = key === 'research'
    ? rows.filter(isScheduledResearchObservation)
    : rows;
  const timestamps = eligible
    .map((row) => Date.parse(row?.generatedAt))
    .filter((time) => Number.isFinite(time) && time > 0 && time <= now);

  const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const earliestHour = currentHour - (EXPECTED_HOUR_BUCKETS - 1) * HOUR_MS;
  const inWindow = timestamps.filter((time) => time >= earliestHour);
  const hoursCovered = new Set(
    inWindow.map((time) => Math.floor(time / HOUR_MS) * HOUR_MS),
  ).size;
  const latest = timestamps.length ? Math.max(...timestamps) : null;
  const ageMinutes = latest === null ? null : Math.floor((now - latest) / 60_000);

  return {
    key,
    savedRows: rows.length,
    eligibleRows: eligible.length,
    recoveredRows: key === 'research' ? rows.length - eligible.length : 0,
    latestAt: latest === null ? null : new Date(latest).toISOString(),
    ageMinutes,
    hoursCovered,
    hoursExpected: EXPECTED_HOUR_BUCKETS,
    samplesInWindow: inWindow.length,
    state: latest === null ? 'NO_DATA' : now - latest > LATE_AFTER_MS ? 'LATE' : 'CURRENT',
  };
}
