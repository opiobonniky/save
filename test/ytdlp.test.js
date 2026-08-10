import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ytDlpArgs } from '../src/ytdlp.js';

test('converts downloader options to yt-dlp arguments', () => {
  assert.deepEqual(
    ytDlpArgs({
      dumpSingleJson: true,
      noWarnings: true,
      concurrentFragments: 4,
      ffmpegLocation: '/tmp/path with spaces/ffmpeg',
      playlistItems: undefined,
    }),
    [
      '--dump-single-json',
      '--no-warnings',
      '--concurrent-fragments',
      '4',
      '--ffmpeg-location',
      '/tmp/path with spaces/ffmpeg',
    ]
  );
});
