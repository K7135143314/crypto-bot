import type { MatrixRow } from './quotes.js';

export type Trial = { mode: 'sequential'|'parallel'; block: string; elapsedMs: number; success: boolean; error?: string; quoteFingerprints?: string[] };
export const fingerprint = (rows: readonly MatrixRow[]) => rows.map(r =>
  [r.startUsdcText,r.firstDex,r.startUsdc.toString(),r.wethReceived.toString(),
   r.finalUsdc.toString(),r.first.feeTier ?? 0,r.second.feeTier ?? 0].join('|')
).sort();
export function percentile(values: readonly number[], p: number): number|null {
  if (!values.length || !Number.isFinite(p) || p < 0 || p > 1) return null;
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.max(0, Math.ceil(p*sorted.length)-1)] ?? null;
}
export function summarize(trials: readonly Trial[]) {
  return (['sequential','parallel'] as const).map(mode => {
    const subset=trials.filter(t=>t.mode===mode);
    const good=subset.filter(t=>t.success).map(t=>t.elapsedMs);
    return {mode, attempted:subset.length, succeeded:good.length, failed:subset.length-good.length,
      p50Ms:percentile(good,.5),p95Ms:percentile(good,.95),p99Ms:percentile(good,.99)};
  });
}
export function checkParity(a: Trial, b: Trial): boolean {
  return a.success && b.success && a.block===b.block &&
    Array.isArray(a.quoteFingerprints) && Array.isArray(b.quoteFingerprints) &&
    a.quoteFingerprints.length>0 &&
    JSON.stringify(a.quoteFingerprints)===JSON.stringify(b.quoteFingerprints);
}
