import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  explainExtractionError,
  extractFormats,
  extractionSiteName,
  getAntiBotBackoffMs,
  getExtractOptions,
  isAntiBotChallenge,
  isRetryableExtractionError,
  normalizeFormats,
  retryReason,
  siteNameFromUrl,
} from '../src/extract.js';

describe('format normalization', () => {
  test('removes YouTube storyboard formats', () => {
    const formats = normalizeFormats([
      { format_id: 'sb0', ext: 'mhtml', resolution: '320x180', vcodec: 'none', acodec: 'none' },
      { format_id: '18', ext: 'mp4', resolution: '640x360', height: 360, vcodec: 'avc1', acodec: 'mp4a' },
    ]);

    assert.deepEqual(formats.map(format => format.format_id), ['18']);
  });

  test('keeps audio-only and video-only formats', () => {
    const formats = normalizeFormats([
      { format_id: '251', ext: 'webm', vcodec: 'none', acodec: 'opus' },
      { format_id: '137', ext: 'mp4', height: 1080, vcodec: 'avc1', acodec: 'none' },
    ]);

    assert.deepEqual(formats.map(format => format.format_id), ['251', '137']);
  });
});

test('uses flat extraction only when the caller identifies a playlist', () => {
  const video = getExtractOptions();
  const playlist = getExtractOptions({ flatPlaylist: true });
  assert.equal(video.dumpJson, true);
  assert.equal(video.dumpSingleJson, undefined);
  assert.equal(video.flatPlaylist, undefined);
  assert.equal(playlist.dumpJson, false);
  assert.equal(playlist.dumpSingleJson, true);
  assert.equal(playlist.flatPlaylist, true);
});

test('retries transient extraction failures but not permanent errors', () => {
  assert.equal(isRetryableExtractionError({ stderr: 'Unable to extract universal data for rehydration' }), true);
  assert.equal(isRetryableExtractionError({ stderr: 'HTTP Error 429: Too Many Requests' }), true);
  assert.equal(isRetryableExtractionError({ stderr: 'This video is private' }), false);
});

test('classifies anti-bot challenges for longer retries', () => {
  assert.equal(isAntiBotChallenge({ stderr: 'Unable to extract universal data for rehydration' }), true);
  assert.equal(
    isAntiBotChallenge({ stderr: 'ERROR: [TikTok] 123: Unexpected response from webpage request' }),
    true
  );
  assert.equal(isAntiBotChallenge({ stderr: 'HTTP Error 429: Too Many Requests' }), false);
  assert.equal(isAntiBotChallenge({ stderr: 'This video is private' }), false);
});

test('backs off across four anti-bot retries before stopping', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(getAntiBotBackoffMs),
    [1500, 3000, 4500, 6000, null]
  );
});

describe('explainExtractionError', () => {
  test('explains an upstream site-layout failure', () => {
    const message = explainExtractionError({
      stderr: 'ERROR: [imdb] 3877612057: Unable to extract next.js data',
    });
    assert.match(message, /site changed its layout/);
    assert.match(message, /cookies-from-browser/);
  });

  test('explains an unavailable video', () => {
    const message = explainExtractionError({ stderr: 'ERROR: [youtube] abcd: Video unavailable' });
    assert.match(message, /unavailable/);
  });

  test('explains a region block', () => {
    const message = explainExtractionError({ stderr: 'This video is not available in your country' });
    assert.match(message, /blocked in your region/);
  });

  test('explains a network failure', () => {
    const message = explainExtractionError({ stderr: 'Name or service not known' });
    assert.match(message, /Could not reach the site/);
  });

  test('returns null for unknown errors', () => {
    assert.equal(explainExtractionError({ stderr: 'something else entirely' }), null);
  });

  test('extracts the reported site name', () => {
    assert.equal(extractionSiteName({ stderr: 'ERROR: [imdb] 3877612057: Unable to extract' }), 'imdb');
    assert.equal(extractionSiteName({ stderr: 'ERROR: [youtube:playlist] x' }), 'youtube:playlist');
    assert.equal(extractionSiteName({ stderr: 'no brackets here' }), null);
  });
});

describe('siteNameFromUrl', () => {
  test('maps well-known hosts to site ids', () => {
    assert.equal(siteNameFromUrl('https://www.youtube.com/watch?v=1'), 'youtube');
    assert.equal(siteNameFromUrl('https://youtu.be/abc'), 'youtube');
    assert.equal(siteNameFromUrl('https://vm.tiktok.com/xyz'), 'tiktok');
    assert.equal(siteNameFromUrl('http://instagram.com/p/x'), 'instagram');
  });

  test('falls back to the hostname for unknown sites', () => {
    assert.equal(siteNameFromUrl('https://mysite.example/video'), 'mysite');
  });

  test('returns null for unparseable URLs', () => {
    assert.equal(siteNameFromUrl('not a url'), null);
  });
});

describe('retryReason', () => {
  test('reports human phrasing for each failure class', () => {
    assert.match(retryReason({ stderr: 'Unable to extract universal data' }), /not a bot/);
    assert.match(retryReason({ stderr: 'connection reset by peer' }), /dropped the connection/);
    assert.match(retryReason({ stderr: 'HTTP Error 429: Too Many Requests' }), /rate-limiting/);
    assert.match(retryReason({ stderr: 'HTTP Error 503: Service Unavailable' }), /temporary server error/);
    assert.match(retryReason({ stderr: 'something else' }), /temporary glitch/);
  });
});

test('emits attempt and waiting status events when retrying', async () => {
  const events = [];
  let calls = 0;
  const runner = async () => {
    calls++;
    if (calls === 1) {
      const err = new Error('boom');
      err.stderr = 'ERROR: connection reset by peer';
      throw err;
    }
    return {
      _type: 'video',
      title: 'Test',
      formats: [{ format_id: '18', ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a' }],
    };
  };
  const result = await extractFormats('https://example.com/watch?v=1', {
    runner,
    onStatus: event => events.push(event),
  });
  assert.equal(calls, 2);
  assert.deepEqual(events.map(event => event.type), ['attempt', 'waiting', 'attempt']);
  assert.equal(events[0].attempt, 1);
  assert.equal(events[0].site, 'example');
  assert.equal(events[1].type, 'waiting');
  assert.equal(events[1].backoffMs, 500);
  assert.equal(events[2].attempt, 2);
  assert.equal(events[2].total, 6);
  assert.equal(result.isPlaylist, false);
  assert.equal(result.title, 'Test');
});

test('labels anti-bot retries in status events', async () => {
  const events = [];
  let calls = 0;
  const runner = async () => {
    calls++;
    if (calls === 1) {
      const err = new Error('blocked');
      err.stderr = 'ERROR: [TikTok] 123: Unexpected response from webpage request';
      throw err;
    }
    return {
      _type: 'video',
      title: 'TikTok test',
      formats: [{ format_id: '18', ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a' }],
    };
  };
  const result = await extractFormats('https://vm.tiktok.com/xyz', {
    runner,
    onStatus: event => events.push(event),
  });
  assert.equal(calls, 2);
  const waiting = events.find(event => event.type === 'waiting');
  assert.equal(waiting.antiBot, true);
  assert.match(waiting.site, /^tiktok$/i);
  assert.match(waiting.reason, /not a bot/);
  assert.equal(result.title, 'TikTok test');
});

test('does not retry permanent extraction errors', async () => {
  const events = [];
  const runner = async () => {
    const err = new Error('private video');
    err.stderr = 'ERROR: This video is private';
    throw err;
  };
  await assert.rejects(
    extractFormats('https://example.com/x', { runner, onStatus: event => events.push(event) }),
    /private/
  );
  assert.deepEqual(events.map(event => event.type), ['attempt']);
});
