// Choose only concrete IDs advertised by the backend; no yt-dlp expressions.
export function chooseBackendFormat(formats, { format, quality = 'best', audio = false } = {}) {
  if (!Array.isArray(formats) || !formats.length) throw new Error('The backend returned no formats.');
  let candidates = formats;
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
  return `${format.hasVideo ? `${format.height}p` : 'Audio'} · ${format.extension} · ${format.id}`;
}
