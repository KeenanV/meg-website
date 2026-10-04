import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clampAudioTime, formatAudioTime} from '../src/lib/audio.ts';

test('media timeline remains usable with missing metadata and long meditations', () => {
  for (const value of [NaN, Infinity, -Infinity, -3]) assert.equal(formatAudioTime(value), '0:00');
  assert.equal(formatAudioTime(65.9), '1:05');
  assert.equal(formatAudioTime(3605), '1:00:05');
  assert.equal(clampAudioTime(60, NaN), 0);
  assert.equal(clampAudioTime(Infinity, 600), 0);
  assert.equal(clampAudioTime(-20, 600), 0);
  assert.equal(clampAudioTime(700, 600), 600);
  assert.equal(clampAudioTime(123.5, 600), 123.5);
});
