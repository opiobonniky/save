import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBackgroundedRun,
  getDefaultDownloadsDir,
  isLikelyPlaylistUrl,
  looksShellTruncated,
  normalizeMediaUrl,
  parseCount,
  parseProxy,
  resolveQualitySelector,
  resolveMediaUrl,
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

  test('rewrites TikTok photo posts to the extractor-supported video route', () => {
    assert.equal(
      normalizeMediaUrl('https://www.tiktok.com/@user/photo/123?_r=1&_t=tracking'),
      'https://www.tiktok.com/@user/video/123'
    );
  });

  test('resolves TikTok short links before normalizing them', async () => {
    const fetchImpl = async () => ({
      url: 'https://www.tiktok.com/@user/photo/123?_r=1&_t=tracking',
    });
    assert.equal(
      await resolveMediaUrl('https://vt.tiktok.com/example/', fetchImpl),
      'https://www.tiktok.com/@user/video/123'
    );
  });

  test('does not modify unrelated URLs', () => {
    const url = 'https://youtu.be/abc?si=tracking';
    assert.equal(normalizeMediaUrl(url), url);
  });
});

describe('shell truncation detection', () => {
  test('flags a dangling query value from a split "&"', () => {
    assert.equal(looksShellTruncated('https://youtu.be/abc?si=1&t='), true);
  });

  test('flags a bare trailing question mark', () => {
    assert.equal(looksShellTruncated('https://youtu.be/abc?'), true);
  });

  test('accepts complete query strings', () => {
    assert.equal(looksShellTruncated('https://youtu.be/abc?si=1&t=2'), false);
    assert.equal(looksShellTruncated('https://youtu.be/abc'), false);
  });
});

describe('default downloads directory', () => {
  test('defaults to the user Downloads folder', () => {
    assert.equal(getDefaultDownloadsDir({ home: '/home/alice' }), '/home/alice/Downloads');
  });

  test('honors the XDG_DOWNLOAD_DIR override on Linux', () => {
    assert.equal(
      getDefaultDownloadsDir({ home: '/home/alice', xdgDownloadDir: '/mnt/big/downloads' }),
      '/mnt/big/downloads'
    );
  });
});

describe('backgrounded run detection', () => {
  test('detects a command backgrounded by an unquoted "&"', () => {
    assert.equal(
      detectBackgroundedRun({ stdinTTY: false, stdoutTTY: true, stderrTTY: true }),
      true
    );
  });

  test('does not flag a normal interactive terminal', () => {
    assert.equal(
      detectBackgroundedRun({ stdinTTY: true, stdoutTTY: true, stderrTTY: true }),
      false
    );
  });

  test('does not flag batch mode reading from a file', () => {
    assert.equal(
      detectBackgroundedRun({ stdinTTY: false, stdoutTTY: true, stderrTTY: true, batchMode: true }),
      false
    );
  });

  test('does not flag a fully redirected run (e.g. piped output)', () => {
    assert.equal(
      detectBackgroundedRun({ stdinTTY: false, stdoutTTY: false, stderrTTY: false }),
      false
    );
  });
});
