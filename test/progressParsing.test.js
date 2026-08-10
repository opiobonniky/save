import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgressEvents } from '../src/progress.js';

describe('progress output parsing', () => {
  test('parses yt-dlp percentage and speed', () => {
    const events = parseProgressEvents(
      '[download]  58.0% of 13.78MiB at 11.01MiB/s ETA 00:00\n'
    );
    assert.deepEqual(events, [{ percentage: 58, speed: '11.01MiB/s' }]);
  });

  test('parses aria2c percentage and download speed', () => {
    const events = parseProgressEvents('[#1f630e 10MiB/13MiB(74%) CN:12 DL:10MiB]\r');
    assert.deepEqual(events, [{ percentage: 74, speed: '10MiB/s' }]);
  });

  test('returns every report in output order', () => {
    const events = parseProgressEvents(
      '[#abc 1MiB/10MiB(10%) CN:8 DL:2MiB]\r' +
        '[#abc 5MiB/10MiB(50%) CN:8 DL:4MiB]\r'
    );
    assert.deepEqual(events, [
      { percentage: 10, speed: '2MiB/s' },
      { percentage: 50, speed: '4MiB/s' },
    ]);
  });

  test('handles yt-dlp reports whose speed is unknown', () => {
    const events = parseProgressEvents(
      '[download] 71.6% of 13.78MiB at Unknown B/s ETA Unknown\n'
    );
    assert.deepEqual(events, [{ percentage: 71.6, speed: null }]);
  });
});
