import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessSync, constants } from 'fs';
import { getFfmpegOptions, getManagedFfmpegPath } from '../src/ffmpeg.js';

test('resolves the executable managed ffmpeg binary for npm installs', () => {
  const ffmpegPath = getManagedFfmpegPath();

  assert.ok(ffmpegPath);
  assert.doesNotThrow(() => accessSync(ffmpegPath, constants.X_OK));
  assert.deepEqual(getFfmpegOptions(), { ffmpegLocation: ffmpegPath });
});
