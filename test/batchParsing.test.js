import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseBatchLines, runWorkerPool } from '../src/batch.js';

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

describe('batch worker pool', () => {
  test('processes each item once with bounded concurrency', async () => {
    let active = 0;
    let maximumActive = 0;
    const processed = [];

    await runWorkerPool(['a', 'b', 'c', 'd'], 2, async item => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      processed.push(item);
      active--;
    });

    assert.equal(maximumActive, 2);
    assert.deepEqual(processed.sort(), ['a', 'b', 'c', 'd']);
  });
});
