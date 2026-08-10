import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlaylistEntries } from '../src/extract.js';

describe('playlist entry resolution', () => {
  test('preserves the playlist index when available', () => {
    const { entries } = resolvePlaylistEntries([
      { id: 'a1', title: 'A', playlist_index: 7 },
    ]);
    assert.equal(entries[0].index, 7);
  });

  test('uses list position when playlist_index is unavailable', () => {
    const { entries } = resolvePlaylistEntries([{ id: 'a1', title: 'A' }]);
    assert.equal(entries[0].index, 1);
  });

  test('drops null/undefined entries safely (deleted/private videos)', () => {
    const { entries, skipped } = resolvePlaylistEntries([
      null,
      undefined,
      { id: 'a1', title: 'A' },
    ]);
    assert.equal(entries.length, 1);
    assert.equal(skipped, 2);
  });

  test('falls back to id as title when title is missing', () => {
    const { entries } = resolvePlaylistEntries([
      { id: 'a1' },
    ]);
    assert.equal(entries[0].title, 'a1');
  });
});
