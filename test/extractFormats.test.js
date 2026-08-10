import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getExtractOptions, isRetryableExtractionError, normalizeFormats } from '../src/extract.js';

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
