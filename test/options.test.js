import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLikelyPlaylistUrl,
  parseCount,
  resolveQualitySelector,
} from '../src/options.js';

describe('quality presets', () => {
  test('limits balanced quality to 1080p', () => {
    assert.equal(
      resolveQualitySelector('1080p'),
      'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
    );
  });

  test('keeps an unlimited best preset', () => {
    assert.equal(resolveQualitySelector('best'), 'bestvideo+bestaudio/best');
  });

  test('rejects unknown presets', () => {
    assert.throws(() => resolveQualitySelector('8k'), /Unknown quality/);
  });
});

describe('count validation', () => {
  test('accepts an integer within range', () => {
    assert.equal(parseCount('4', 'connections'), 4);
  });

  test('rejects out-of-range and fractional values', () => {
    assert.throws(() => parseCount('17', 'connections'), /1 to 16/);
    assert.throws(() => parseCount('2.5', 'connections'), /integer/);
  });
});

describe('playlist URL detection', () => {
  test('detects YouTube list parameters and playlist paths', () => {
    assert.equal(isLikelyPlaylistUrl('https://youtube.com/watch?v=x&list=abc'), true);
    assert.equal(isLikelyPlaylistUrl('https://youtube.com/playlist?list=abc'), true);
  });

  test('does not classify a direct video as a playlist', () => {
    assert.equal(isLikelyPlaylistUrl('https://youtu.be/abc?t=2'), false);
  });
});
