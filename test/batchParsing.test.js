import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Mirrors the exact line-parsing logic in bin/download-me.js's runBatch().
function parseBatchLines(fileContent) {
  return fileContent
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

describe('batch file parsing', () => {
  test('skips comment lines starting with #', () => {
    const lines = parseBatchLines('# comment\nhttps://a.com\n# another comment\nhttps://b.com');
    assert.deepEqual(lines, ['https://a.com', 'https://b.com']);
  });

  test('skips blank lines', () => {
    const lines = parseBatchLines('https://a.com\n\n\nhttps://b.com\n');
    assert.deepEqual(lines, ['https://a.com', 'https://b.com']);
  });

  test('trims whitespace around URLs', () => {
    const lines = parseBatchLines('  https://a.com  \n\thttps://b.com\t');
    assert.deepEqual(lines, ['https://a.com', 'https://b.com']);
  });

  test('returns empty array for a fully-commented file', () => {
    const lines = parseBatchLines('# only comments\n# nothing else');
    assert.deepEqual(lines, []);
  });
});
