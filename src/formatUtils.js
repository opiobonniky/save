/**
 * Shared helpers for working with yt-dlp format objects, used by
 * both the interactive picker and the --list-formats output.
 */

/** True if a format has video but no audio track (needs merging with an audio stream). */
export function isVideoOnly(f) {
  return Boolean(f.vcodec && f.vcodec !== 'none' && (!f.acodec || f.acodec === 'none'));
}

/** True if a format has audio but no video track. */
export function isAudioOnly(f) {
  return Boolean((!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none');
}

/** Human-readable size string, or '?' if unknown. */
export function formatSize(bytes) {
  if (!bytes) return '?';
  return `${(bytes / 1_000_000).toFixed(1)}MB`;
}

/** One label describing what kind of format this is, for display. */
export function formatKind(f) {
  if (isVideoOnly(f)) return 'video only';
  if (isAudioOnly(f)) return 'audio only';
  return 'video+audio';
}

/** Familiar quality label such as 360p/1080p instead of raw dimensions. */
export function formatQuality(f) {
  if (isAudioOnly(f)) return 'audio only';

  const notedQuality = f.note?.match(/\b(\d{2,4}p)\b/i)?.[1];
  if (notedQuality) return notedQuality.toLowerCase();
  if (f.height) return `${f.height}p`;

  const dimensions = f.resolution?.match(/(\d+)x(\d+)/i);
  if (dimensions) return `${Math.min(Number(dimensions[1]), Number(dimensions[2]))}p`;
  return f.resolution || 'video';
}

/** A single aligned text row, used for --list-formats. */
export function formatRow(f) {
  return (
    f.format_id.padEnd(10) +
    f.ext.padEnd(8) +
    formatQuality(f).padEnd(12) +
    formatSize(f.filesize).padEnd(10) +
    formatKind(f).padEnd(14) +
    (f.note || '')
  );
}

/** A single choice label for the interactive inquirer picker. */
export function formatChoiceLabel(f) {
  const tag = isVideoOnly(f) ? ' (video only — audio merged automatically)' : '';
  return (
    `${formatQuality(f).padEnd(10)} | ${f.ext.padEnd(5)} | ${formatSize(f.filesize).padEnd(10)} | ` +
    `ID ${f.format_id}${tag}`
  );
}
