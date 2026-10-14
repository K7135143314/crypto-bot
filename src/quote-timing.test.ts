import assert from 'node:assert/strict';
import test from 'node:test';
import { durationMs, timeStage, type StageTiming } from './quote-timing.js';
test('captures monotonic successful stage duration and value', async () => {
  const samples: StageTiming[] = [];
  const ticks = [10, 11.123456];
  const result = await timeStage('test', async () => 42, x => samples.push(x), () => ticks.shift()!);
  assert.equal(result, 42);
  assert.deepEqual(samples, [{stage:'test',durationMs:1123.456,success:true}]);
});
test('retains original failure while recording unsuccessful duration', async () => {
  const samples: StageTiming[] = [];
  const err = new Error('provider failed');
  const ticks = [5, 5.5];
  await assert.rejects(timeStage('rpc', async () => { throw err; }, x => samples.push(x), () => ticks.shift()!), e => e === err);
  assert.deepEqual(samples, [{stage:'rpc',durationMs:500,success:false}]);
});
test('does not accept invalid or reversed clocks', () => {
  assert.throws(() => durationMs(5,4));
  assert.throws(() => durationMs(NaN,5));
});
