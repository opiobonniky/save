import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isVideoOnly,
  isAudioOnly,
  formatSize,
  formatKind,
  formatQuality,
  formatRow,
  buildPickerChoices,
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

describe('buildPickerChoices', () => {
  const mp4 = (format_id, quality, filesize, vcodec = 'avc1', acodec = 'mp4a') => ({
    format_id,
    ext: 'mp4',
    resolution: quality,
    height: Number(quality.replace('p', '')),
    filesize,
    vcodec,
    acodec,
  });

  test('collapses duplicate formats of the same resolution into one row', () => {
    const choices = buildPickerChoices([
      mp4('h264_540p_1-0', '576p', 4900000),
      mp4('h264_540p_1-1', '576p', 4900000),
      mp4('bytevc1_540p_2-0', '576p', 2400000),
      mp4('h264_720p_1-0', '720p', 5800000),
    ]);
    const labels = choices.map(c => c.name);
    assert.equal(choices.filter(c => /576p/.test(c.name)).length, 1);
    assert.equal(choices.filter(c => /720p/.test(c.name)).length, 1);
    assert.ok(labels.some(l => /recommended/.test(l)));
  });

  test('leads with a best-quality recommended option', () => {
    const choices = buildPickerChoices([mp4('a', '720p', 5000000), mp4('b', '480p', 3000000)]);
    assert.equal(choices[0].name, 'Best quality (recommended)');
    assert.equal(choices[0].value, 'bestvideo+bestaudio/best');
  });

  test('orders quality tiers from highest to lowest', () => {
    const choices = buildPickerChoices([
      mp4('low', '480p', 3000000),
      mp4('high', '1080p', 9000000),
      mp4('mid', '720p', 5000000),
    ]);
    const qualityLabels = choices.slice(1).map(c => c.name);
    assert.match(qualityLabels[0], /^1080p/);
    assert.match(qualityLabels[0], /9\.0MB/);
    assert.match(qualityLabels[1], /^720p/);
    assert.match(qualityLabels[2], /^480p/);
  });

  test('keeps real format ids as values', () => {
    const choices = buildPickerChoices([mp4('h264_540p_1-0', '576p', 4900000)]);
    assert.equal(choices[1].value, 'h264_540p_1-0');
  });

  test('appends a single Audio (MP3) option', () => {
    const audio = { format_id: '140', ext: 'm4a', filesize: 11900000, vcodec: 'none', acodec: 'mp4a' };
    const choices = buildPickerChoices([audio, mp4('v', '720p', 5000000)]);
    const last = choices[choices.length - 1];
    assert.equal(last.value, 'mp3');
    assert.match(last.name, /MP3/i);
  });

  test('offers only audio when there are no video formats', () => {
    const audio = { format_id: '140', ext: 'm4a', filesize: 11900000, vcodec: 'none', acodec: 'mp4a' };
    const choices = buildPickerChoices([audio]);
    assert.equal(choices.length, 1);
    assert.equal(choices[0].value, 'mp3');
  });
});
