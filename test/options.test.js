import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  AUDIO_FORMAT_SELECTOR,
  detectBackgroundedRun,
  expandHomePath,
  getDefaultDownloadsDir,
  isLikelyPlaylistUrl,
  looksShellTruncated,
  normalizeMediaUrl,
  parseCount,
  parseProxy,
  resolveQualitySelector,
  resolveMediaUrl,
} from '../src/options.js';

test('audio selection falls back to combined streams', () => {
  assert.equal(AUDIO_FORMAT_SELECTOR, 'bestaudio/best');
});

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

  test('strips share tracking parameters from YouTube Shorts URLs', () => {
    assert.equal(
      normalizeMediaUrl('https://youtube.com/shorts/abc123?si=tracking&feature=share'),
      'https://youtube.com/shorts/abc123'
    );
  });

  test('keeps meaningful parameters on YouTube Shorts URLs', () => {
    assert.equal(
      normalizeMediaUrl('https://youtube.com/shorts/abc123?t=30'),
      'https://youtube.com/shorts/abc123?t=30'
    );
  });

  test('strips tracking parameters from Instagram reels', () => {
    assert.equal(
      normalizeMediaUrl(
        'https://www.instagram.com/reel/AbCdEf/?igsh=xyz&utm_source=ig_web_button_share_sheet'
      ),
      'https://www.instagram.com/reel/AbCdEf/'
    );
  });

  test('strips TikTok-style _r/_t parameters from Instagram reels', () => {
    assert.equal(
      normalizeMediaUrl('https://www.instagram.com/reel/AbCdEf/?_r=1&_t=tracking'),
      'https://www.instagram.com/reel/AbCdEf/'
    );
  });

  test('strips share parameters from X/Twitter status URLs with a trailing slash', () => {
    assert.equal(
      normalizeMediaUrl('https://twitter.com/someuser/status/1234567890/?s=20'),
      'https://twitter.com/someuser/status/1234567890/'
    );
  });

  test('does not strip private-video hashes from Vimeo URLs', () => {
    const url = 'https://vimeo.com/123456?h=privatehash';
    assert.equal(normalizeMediaUrl(url), url);
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
    assert.equal(getDefaultDownloadsDir({ home: '/home/alice' }), path.join('/home/alice', 'Downloads'));
  });

  test('honors the XDG_DOWNLOAD_DIR override on Linux', () => {
    assert.equal(
      getDefaultDownloadsDir({ home: '/home/alice', xdgDownloadDir: '/mnt/big/downloads' }),
      '/mnt/big/downloads'
    );
  });
});

describe('home directory expansion', () => {
  test('expands POSIX and Windows home-relative paths', () => {
    assert.equal(expandHomePath('~/Videos', '/home/alice'), '/home/alice/Videos');
    assert.equal(expandHomePath('~\\Videos', 'C:\\Users\\Alice'), 'C:\\Users\\Alice\\Videos');
  });

  test('does not treat another user name or an ordinary tilde as the current home', () => {
    assert.equal(expandHomePath('~bob/Videos', '/home/alice'), '~bob/Videos');
    assert.equal(expandHomePath('archive~1', '/home/alice'), 'archive~1');
  });
});

describe('backgrounded run detection', () => {
  test('detects a command backgrounded by an unquoted "&"', () => {
    assert.equal(
      detectBackgroundedRun({ stdinTTY: false, stdoutTTY: true, stderrTTY: true }),
      true
    );
  });

  test('detects an interactive-shell background job via its process group', () => {
    // Interactive bash keeps stdin on the terminal for "&" jobs; ps then
    // reports a STAT column without the "+" foreground marker.
    assert.equal(
      detectBackgroundedRun({ stdinTTY: true, stdoutTTY: true, stderrTTY: true, statLine: 'Ss' }),
      true
    );
  });

  test('does not flag a normal interactive terminal', () => {
    assert.equal(
      detectBackgroundedRun({ stdinTTY: true, stdoutTTY: true, stderrTTY: true, statLine: 'Ss+' }),
      false
    );
  });

  test('assumes foreground when the ps STAT line is unavailable', () => {
    assert.equal(
      detectBackgroundedRun({ stdinTTY: true, stdoutTTY: true, stderrTTY: true, statLine: '' }),
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
