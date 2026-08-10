import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLikelyPlaylistUrl,
  normalizeMediaUrl,
  parseCount,
  parseProxy,
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

describe('proxy validation', () => {
  test('accepts HTTP and SOCKS proxy URLs', () => {
    assert.equal(parseProxy('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
    assert.equal(parseProxy('socks5h://127.0.0.1:1080'), 'socks5h://127.0.0.1:1080');
  });

  test('rejects malformed and unsupported proxy URLs', () => {
    assert.throws(() => parseProxy('127.0.0.1:8080'), /valid HTTP\(S\) or SOCKS URL/);
    assert.throws(() => parseProxy('ftp://127.0.0.1'), /must use http/);
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

describe('media URL normalization', () => {
  test('removes unstable tracking parameters from TikTok video URLs', () => {
    assert.equal(
      normalizeMediaUrl('https://www.tiktok.com/@user/video/123?is_from_webapp=1&sender_device=pc'),
      'https://www.tiktok.com/@user/video/123'
    );
  });

  test('does not modify unrelated URLs', () => {
    const url = 'https://youtu.be/abc?si=tracking';
    assert.equal(normalizeMediaUrl(url), url);
  });
});
