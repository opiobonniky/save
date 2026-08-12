import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  explainExtractionError,
  extractionSiteName,
  getExtractOptions,
  isRetryableExtractionError,
  normalizeFormats,
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
