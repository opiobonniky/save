import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Mirrors the exact entry-resolution logic in src/extract.js's playlist branch.
// Kept as a standalone pure function here so it's testable without needing
// network access to actually call yt-dlp.
function resolvePlaylistEntries(rawEntries) {
  const entries = rawEntries
    .filter(e => e && (e.webpage_url || e.original_url || (typeof e.url === 'string' && e.url.startsWith('http'))))
    .map(e => ({
      id: e.id,
      title: e.title || e.id || 'Untitled',
      url: e.webpage_url || e.original_url || e.url,
    }));
  return { entries, skipped: rawEntries.length - entries.length };
}

describe('playlist entry resolution', () => {
  test('prefers webpage_url when available', () => {
    const { entries } = resolvePlaylistEntries([
      { id: 'a1', title: 'A', url: 'a1', webpage_url: 'https://example.com/watch?v=a1' },
    ]);
    assert.equal(entries[0].url, 'https://example.com/watch?v=a1');
  });

  test('drops entries with no resolvable http url instead of guessing one', () => {
    const { entries, skipped } = resolvePlaylistEntries([
      { id: 'a1', title: 'A', url: 'a1' }, // no webpage_url, url is not http - unusable
    ]);
    assert.equal(entries.length, 0);
    assert.equal(skipped, 1);
  });

  test('drops null/undefined entries safely (deleted/private videos)', () => {
    const { entries, skipped } = resolvePlaylistEntries([
      null,
      undefined,
      { id: 'a1', title: 'A', webpage_url: 'https://example.com/watch?v=a1' },
    ]);
    assert.equal(entries.length, 1);
    assert.equal(skipped, 2);
  });

  test('falls back to id as title when title is missing', () => {
    const { entries } = resolvePlaylistEntries([
      { id: 'a1', webpage_url: 'https://example.com/watch?v=a1' },
    ]);
    assert.equal(entries[0].title, 'a1');
  });
});
