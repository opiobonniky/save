import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveQualitySelector } from '../src/options.js';

// Mirrors the format-selection decision in bin/save.js's run().
function decideFormatId(options) {
  if (options.format) return { formatId: options.format, usedPicker: false };
  if (options.choose || !options.quality) return { formatId: null, usedPicker: true };
  return { formatId: resolveQualitySelector(options.quality), usedPicker: false };
}

describe('format selection defaults', () => {
  test('with no selection flags, opens the format picker', () => {
    const { formatId, usedPicker } = decideFormatId({});
    assert.equal(formatId, null);
    assert.equal(usedPicker, true);
  });

  test('--quality best restores unlimited quality', () => {
    const { formatId } = decideFormatId({ quality: 'best' });
    assert.equal(formatId, 'bestvideo+bestaudio/best');
  });

  test('-f/--format always wins and skips the picker', () => {
    const { formatId, usedPicker } = decideFormatId({ format: '137' });
    assert.equal(formatId, '137');
    assert.equal(usedPicker, false);
  });

  test('--choose explicitly triggers the picker', () => {
    const { usedPicker } = decideFormatId({ choose: true });
    assert.equal(usedPicker, true);
  });

  test('-f takes priority over --choose if both are somehow passed', () => {
    const { formatId, usedPicker } = decideFormatId({ format: '22', choose: true });
    assert.equal(formatId, '22');
    assert.equal(usedPicker, false);
  });
});
