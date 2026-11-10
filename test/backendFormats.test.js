import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectCompatibleFormats, chooseBackendFormat, backendFormatLabel, buildBackendChoices } from '../src/backendFormats.js';

const h264 = { id: '137', extension: 'mp4', height: 1080, fps: 25, hasVideo: true, hasAudio: false, videoCodec: 'avc1.640028', filesize: 103_800_000 };
const audio = { id: '140', extension: 'm4a', hasVideo: false, hasAudio: true, audioCodec: 'mp4a.40.2', filesize: 4_200_000 };

test('matches web: one real format per resolution, descending, and one audio source', () => {
  const formats = [
    { ...h264, id: '399', videoCodec: 'av01.0', filesize: 200_000_000 },
    { ...h264, id: '270', filesize: null }, h264,
    { ...h264, id: '136', height: 720 },
    { ...audio, id: '251', extension: 'webm', audioCodec: 'opus', filesize: 5_000_000 }, audio,
  ];
  assert.deepEqual(selectCompatibleFormats(formats).map(format => format.id), ['137', '136', '140']);
  assert.equal(formats.length, 6);
  assert.equal(chooseBackendFormat(formats).id, '137');
  assert.equal(chooseBackendFormat(formats, { audio: true }).id, '140');
});

test('matches web: combined tracks, VP9 for 4K, and downloadable alternatives win', () => {
  const formats = [h264, { ...h264, id: '18', hasAudio: true },
    { ...h264, id: '401', height: 2160, videoCodec: 'av01.0' },
    { ...h264, id: '313', height: 2160, extension: 'webm', videoCodec: 'vp9' }];
  assert.deepEqual(selectCompatibleFormats(formats).map(format => format.id), ['313', '18']);
  assert.equal(selectCompatibleFormats([{ ...h264, filesize: 600_000_000 },
    { ...h264, id: '248', extension: 'webm', videoCodec: 'vp9' }])[0].id, '248');
});

test('unknown sizes are honest and approximate sizes are marked', () => {
  assert.match(backendFormatLabel(h264), /1080p · 25 fps · MP4 · 103.8 MB/);
  assert.match(backendFormatLabel({ ...h264, filesizeApproximate: true }), /≈ 103.8 MB/);
  assert.match(backendFormatLabel({ ...h264, filesize: null }), /Size unknown/);
});

test('menu preserves original and MP3 actions without multiplying audio sources', () => {
  const choices = buildBackendChoices([h264, audio, { ...audio, id: '139', filesize: 1_000_000 }]);
  assert.equal(choices.length, 3);
  assert.deepEqual(choices[1].value, { formatId: '140', outputKind: 'original' });
  assert.deepEqual(choices[2].value, { formatId: '140', outputKind: 'mp3' });
  assert.match(choices[2].name, /converted size varies/);
  assert.equal(buildBackendChoices([{ ...h264, filesize: 600_000_000 }])[0].disabled, 'Over 500 MB');
});

test('explicit format IDs remain available, but unavailable quality never downgrades', () => {
  const alternate = { ...h264, id: '399', videoCodec: 'av01.0' };
  assert.equal(chooseBackendFormat([h264, alternate], { format: '399' }).id, '399');
  assert.throws(() => chooseBackendFormat([h264], { quality: '720p' }), /No lower quality/);
});
