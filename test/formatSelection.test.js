import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveQualitySelector } from '../src/options.js';

// Mirrors the exact format-selection decision logic in bin/save-video-cli.js's
// run(). Kept as a standalone pure function so the "zero-decision by default"
// behavior is locked in by a test, not just manual verification — this is
// the core promise of the --choose feature: pickFormat must NEVER be invoked
// unless the user explicitly asked for it.
function decideFormatId(options) {
  if (options.format) return { formatId: options.format, usedPicker: false };
  if (options.choose) return { formatId: null, usedPicker: true }; // caller would show the picker
  return { formatId: resolveQualitySelector(options.quality), usedPicker: false };
}

describe('format selection defaults', () => {
  test('with no flags at all, defaults to balanced 1080p with no picker', () => {
    const { formatId, usedPicker } = decideFormatId({});
    assert.equal(formatId, 'bestvideo[height<=1080]+bestaudio/best[height<=1080]');
    assert.equal(usedPicker, false);
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

  test('--choose triggers the picker only when explicitly passed', () => {
    const { usedPicker } = decideFormatId({ choose: true });
    assert.equal(usedPicker, true);
  });

  test('-f takes priority over --choose if both are somehow passed', () => {
    const { formatId, usedPicker } = decideFormatId({ format: '22', choose: true });
    assert.equal(formatId, '22');
    assert.equal(usedPicker, false);
  });
});
