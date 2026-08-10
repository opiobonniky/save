import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isVideoOnly,
  isAudioOnly,
  formatSize,
  formatKind,
  formatQuality,
  formatRow,
  formatChoiceLabel,
} from '../src/formatUtils.js';

describe('isVideoOnly', () => {
  test('true for video codec with no audio codec', () => {
    assert.equal(isVideoOnly({ vcodec: 'avc1', acodec: 'none' }), true);
  });
  test('false when both codecs present', () => {
    assert.equal(isVideoOnly({ vcodec: 'avc1', acodec: 'mp4a' }), false);
  });
  test('false when acodec is missing entirely (audio-only format)', () => {
    assert.equal(isVideoOnly({ vcodec: 'none', acodec: 'mp4a' }), false);
  });
  test('handles missing vcodec field gracefully', () => {
    assert.equal(isVideoOnly({ acodec: 'none' }), false);
  });
});

describe('isAudioOnly', () => {
  test('true for audio codec with no video codec', () => {
    assert.equal(isAudioOnly({ vcodec: 'none', acodec: 'mp4a' }), true);
  });
  test('false when both codecs present', () => {
    assert.equal(isAudioOnly({ vcodec: 'avc1', acodec: 'mp4a' }), false);
  });
});

describe('formatSize', () => {
  test('formats bytes to MB with one decimal', () => {
    assert.equal(formatSize(50000000), '50.0MB');
  });
  test('returns ? for null/undefined/zero', () => {
    assert.equal(formatSize(null), '?');
    assert.equal(formatSize(undefined), '?');
    assert.equal(formatSize(0), '?');
  });
});

describe('formatKind', () => {
  test('labels video-only correctly', () => {
    assert.equal(formatKind({ vcodec: 'avc1', acodec: 'none' }), 'video only');
  });
  test('labels audio-only correctly', () => {
    assert.equal(formatKind({ vcodec: 'none', acodec: 'mp4a' }), 'audio only');
  });
  test('labels combined format correctly', () => {
    assert.equal(formatKind({ vcodec: 'avc1', acodec: 'mp4a' }), 'video+audio');
  });
});

describe('formatQuality', () => {
  test('uses familiar vertical quality labels', () => {
    assert.equal(formatQuality({ height: 1080, vcodec: 'avc1', acodec: 'none' }), '1080p');
  });

  test('derives quality from raw dimensions when height is unavailable', () => {
    assert.equal(
      formatQuality({ resolution: '640x360', vcodec: 'avc1', acodec: 'none' }),
      '360p'
    );
  });

  test('labels audio formats clearly', () => {
    assert.equal(formatQuality({ vcodec: 'none', acodec: 'opus' }), 'audio only');
  });
});

describe('formatRow', () => {
  test('produces a row without throwing on missing optional fields', () => {
    const row = formatRow({
      format_id: '137',
      ext: 'mp4',
      resolution: null,
      filesize: null,
      note: '',
      vcodec: 'avc1',
      acodec: 'none',
    });
    assert.match(row, /137/);
    assert.match(row, /video only/);
    assert.match(row, /\?/); // unknown size shown as '?'
  });
});

describe('formatChoiceLabel', () => {
  test('tags video-only formats with a merge hint', () => {
    const label = formatChoiceLabel({ format_id: '137', ext: 'mp4', resolution: '1920x1080', height: 1080, filesize: 1000000, vcodec: 'avc1', acodec: 'none' });
    assert.match(label, /^1080p/);
    assert.match(label, /ID 137/);
    assert.match(label, /video only — audio merged automatically/);
  });
  test('does not tag combined formats', () => {
    const label = formatChoiceLabel({ format_id: '22', ext: 'mp4', resolution: '720p', filesize: 1000000, vcodec: 'avc1', acodec: 'mp4a' });
    assert.doesNotMatch(label, /merged automatically/);
  });
});
