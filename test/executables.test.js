import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { getBundledExecutable } from '../src/executables.js';
import { BROWSER_USER_AGENT, getSiteRuntimeOptions, getYtDlpRuntimeOptions, TIKTOK_EXTRACTOR_ARGS } from '../src/runtime.js';

const temporaryDirectories = [];

afterEach(() => {
  delete process.env.SAVE_DENO;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createExecutable(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, '');
  chmodSync(filePath, 0o755);
}

test('resolves a bundled executable beside a packaged app with spaces in its path', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'save app-'));
  temporaryDirectories.push(directory);
  const execPath = path.join(directory, 'save');
  const ytDlpPath = path.join(directory, 'libexec', 'yt-dlp');
  createExecutable(ytDlpPath);

  assert.equal(
    getBundledExecutable('yt-dlp', { env: {}, execPath, isPackaged: true, platform: 'linux' }),
    ytDlpPath
  );
});

test('uses Windows executable names', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'save-win-'));
  temporaryDirectories.push(directory);
  const execPath = path.join(directory, 'save.exe');
  const ffmpegPath = path.join(directory, 'libexec', 'ffmpeg.exe');
  createExecutable(ffmpegPath);

  assert.equal(
    getBundledExecutable('ffmpeg', { env: {}, execPath, isPackaged: true, platform: 'win32' }),
    ffmpegPath
  );
});

test('explicit tool overrides work outside packaged mode', () => {
  assert.equal(
    getBundledExecutable('deno', {
      env: { SAVE_DENO: process.execPath },
      isPackaged: false,
    }),
    process.execPath
  );
});

test('passes a bundled Deno path explicitly to yt-dlp', () => {
  process.env.SAVE_DENO = process.execPath;
  assert.match(BROWSER_USER_AGENT, /Chrome\/139\./);
  assert.deepEqual(getYtDlpRuntimeOptions(), {
    userAgent: BROWSER_USER_AGENT,
    jsRuntimes: `deno:${process.execPath}`,
  });
});

test('tries TikTok mobile API metadata before the webpage fallback', () => {
  assert.deepEqual(getSiteRuntimeOptions('https://www.tiktok.com/@creator/video/123'), {
    extractorArgs: TIKTOK_EXTRACTOR_ARGS,
  });
  assert.deepEqual(getSiteRuntimeOptions('https://www.youtube.com/watch?v=123'), {});
});
