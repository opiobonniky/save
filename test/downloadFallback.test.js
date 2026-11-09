import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getForbiddenFallbackFormat } from '../src/download.js';

const forbidden = 'ERROR: unable to download video data: HTTP Error 403: Forbidden';

test('widens a forbidden specific format to the generic best stream once', () => {
  assert.equal(getForbiddenFallbackFormat('137+bestaudio', forbidden), 'bestvideo+bestaudio/best');
  assert.equal(
    getForbiddenFallbackFormat('137+bestaudio', forbidden, { retriedForbidden: true }),
    null
  );
  assert.equal(getForbiddenFallbackFormat('bestaudio/best', forbidden, { audio: true }), null);
});

test('never downgrades an explicit best-quality request on a forbidden stream', () => {
  // Retrying "best" through an alternate (SABR-limited) client would silently
  // return a much lower resolution — the "Best quality" pick could come back
  // as 360p. It must fail loudly instead of substituting a worse format.
  assert.equal(getForbiddenFallbackFormat('bestvideo+bestaudio/best', forbidden), null);
});

test('does not change formats for unrelated failures', () => {
  assert.equal(getForbiddenFallbackFormat('137+bestaudio', 'HTTP Error 500'), null);
});
