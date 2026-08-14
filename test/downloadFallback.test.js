import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getForbiddenFallbackFormat } from '../src/download.js';

test('falls back from a forbidden video stream once', () => {
  const detail = 'ERROR: unable to download video data: HTTP Error 403: Forbidden';
  assert.equal(getForbiddenFallbackFormat('137+bestaudio', detail), 'bestvideo+bestaudio/best');
  assert.equal(getForbiddenFallbackFormat('137+bestaudio', detail, { retriedForbidden: true }), null);
  assert.equal(getForbiddenFallbackFormat('bestaudio/best', detail, { audio: true }), null);
});

test('does not change formats for unrelated failures', () => {
  assert.equal(getForbiddenFallbackFormat('137+bestaudio', 'HTTP Error 500'), null);
});
