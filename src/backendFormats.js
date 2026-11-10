// Choose only concrete IDs advertised by the backend; no yt-dlp expressions.
export function chooseBackendFormat(formats, { format, quality = 'best', audio = false } = {}) {
  if (!Array.isArray(formats) || !formats.length) throw new Error('The backend returned no formats.');
  let candidates = format ? formats : selectCompatibleFormats(formats);
  if (format) {
    candidates = candidates.filter(item => item.id === format);
  } else if (audio) {
    candidates = candidates.filter(item => item.hasAudio && !item.hasVideo);
  } else {
    candidates = candidates.filter(item => item.hasVideo);
    if (quality !== 'best') {
      if (!/^\d{3,4}p$/.test(quality)) throw new Error('Quality must be best or a resolution such as 1080p.');
      candidates = candidates.filter(item => item.height === Number(quality.slice(0, -1)));
    }
  }
  if (audio) candidates = candidates.filter(item => item.hasAudio && !item.hasVideo);
  if (!candidates.length) throw new Error('The requested format/quality is not available. No lower quality was substituted.');
  return [...candidates].sort((a, b) => (b.height || 0) - (a.height || 0)
    || Number(b.extension === 'mp4') - Number(a.extension === 'mp4')
    || Number(b.hasAudio) - Number(a.hasAudio)
    || (b.filesize || 0) - (a.filesize || 0))[0];
}

export function backendFormatLabel(format) {
  const fps = format.hasVideo && format.fps ? ` · ${format.fps} fps` : '';
  return `${format.hasVideo ? `${format.height}p` : 'Audio only'}${fps} · ${format.extension.toUpperCase()} · ${formatSize(format)}`;
}

export function formatSize(format) {
  if (!(format.filesize > 0)) return 'Size unknown';
  return `${format.filesizeApproximate ? '≈ ' : ''}${(format.filesize / 1_000_000).toFixed(1)} MB`;
}

// Keep in sync with web/features/downloads/hooks/formatSelection.ts: concrete IDs,
// one per height, H.264/MP4 preferred, then a single compatible audio source.
export function selectCompatibleFormats(formats) {
  const byHeight = new Map();
  let audio;
  for (const format of formats) {
    if (format.hasVideo && Number.isInteger(format.height) && format.height > 0) {
      const current = byHeight.get(format.height);
      if (!current || prefer(format, current)) byHeight.set(format.height, format);
    } else if (!format.hasVideo && format.hasAudio && (!audio || prefer(format, audio))) audio = format;
  }
  const selected = [...byHeight.values()].sort((a, b) => b.height - a.height);
  if (audio) selected.push(audio);
  return selected;
}

function prefer(candidate, current) {
  const left = rank(candidate);
  const right = rank(current);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return candidate.id.localeCompare(current.id, 'en', { numeric: true }) < 0;
}

function rank(format) {
  const extension = format.extension.toLowerCase();
  const video = format.videoCodec?.toLowerCase() || '';
  const audio = format.audioCodec?.toLowerCase() || '';
  const compatibility = format.hasVideo
    ? extension === 'mp4' && /^(avc1|h264)/.test(video) ? 5
      : /^(avc1|h264)/.test(video) ? 4
        : /^(vp9|vp09)/.test(video) ? 3 : extension === 'mp4' ? 2 : 1
    : ['m4a', 'mp4', 'aac'].includes(extension) && /^(mp4a|aac)/.test(audio) ? 5
      : extension === 'mp3' || audio === 'mp3' ? 4 : ['m4a', 'aac'].includes(extension) ? 3 : 1;
  return [(format.filesize || 0) <= 500_000_000 ? 1 : 0, compatibility,
    format.hasVideo && format.hasAudio ? 1 : 0, (format.filesize || 0) > 0 ? 1 : 0,
    format.filesizeApproximate ? 0 : 1, format.fps || 0, format.filesize || 0];
}

export function buildBackendChoices(formats) {
  const selected = selectCompatibleFormats(formats);
  const choices = selected.map(format => ({ name: backendFormatLabel(format),
    value: { formatId: format.id, outputKind: 'original' },
    disabled: format.filesize > 500_000_000 ? 'Over 500 MB' : false }));
  const audio = selected.find(format => !format.hasVideo && format.hasAudio);
  if (audio) choices.push({ name: `MP3 audio · ${formatSize(audio)} source (converted size varies)`,
    value: { formatId: audio.id, outputKind: 'mp3' }, disabled: audio.filesize > 500_000_000 ? 'Over 500 MB' : false });
  return choices;
}
