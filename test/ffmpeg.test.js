import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFfmpegOptions } from '../src/ffmpeg.js';

test('uses an explicit ffmpeg override without an install script', () => {
  process.env.SAVE_FFMPEG = process.execPath;
  assert.deepEqual(getFfmpegOptions(), { ffmpegLocation: process.execPath });
  delete process.env.SAVE_FFMPEG;
});
