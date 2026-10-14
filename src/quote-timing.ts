/**
 * Measures local elapsed computation/RPC wall time, never blockchain inclusion
 * or provider event delivery delay. Monotonic clock avoids wall-clock jumps.
 */
export type StageTiming = { stage: string; durationMs: number; success: boolean };
export type QuoteTimingSummary = { totalMs: number; stages: StageTiming[]; completed: boolean };
export function durationMs(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new TypeError('Invalid monotonic timing sample');
  }
  return Math.round((end - start) * 1000) / 1000;
}
export async function timeStage<T>(
  stage: string, action: () => Promise<T>, sink: (entry: StageTiming) => void,
  clock: () => number = () => performance.now(),
): Promise<T> {
  if (!stage || typeof stage !== 'string') throw new TypeError('Invalid stage name');
  const start = clock();
  try {
    const value = await action();
    sink({ stage, durationMs: durationMs(start, clock()), success: true });
    return value;
  } catch (error) {
    sink({ stage, durationMs: durationMs(start, clock()), success: false });
    throw error;
  }
}
