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
    f.format_id.padEnd(24) +
    f.ext.padEnd(8) +
    formatQuality(f).padEnd(12) +
    formatSize(f.filesize).padEnd(10) +
    formatKind(f).padEnd(14) +
    (f.note || '')
  );
}

/** One simplified label for the interactive picker, without cryptic format IDs. */
export function pickerLabel(f) {
  return `${formatQuality(f).padEnd(10)} | ${f.ext.padEnd(5)} | ${formatSize(f.filesize).padEnd(8)}`;
}

function qualityRankOf(f) {
  const match = String(formatQuality(f)).match(/(\d+)p/i);
  return match ? Number(match[1]) : -1;
}

/**
 * Builds a small, human-friendly format menu from yt-dlp's full format list.
 * Sites like TikTok return many near-duplicate formats per resolution; normal
 * users just want "one row per quality", so we collapse each quality tier down
 * to its best single format (preferring combined video+audio, then the largest
 * file). Each row keeps a real yt-dlp format id so downloads work exactly as
 * before, and a "Best quality" option covers the highest available resolution.
 */
export function buildPickerChoices(formats) {
  const hasVideo = formats.some(f => !isAudioOnly(f));
  const hasAudio = formats.some(f => isAudioOnly(f) || !isVideoOnly(f));

  const byQuality = new Map();
  for (const f of formats) {
    if (isAudioOnly(f)) continue;
    const quality = formatQuality(f);
    const existing = byQuality.get(quality);
    const rank = item => (isVideoOnly(item) ? 0 : 1) * 1e9 + (item.filesize || 0);
    if (!existing || rank(f) > rank(existing)) byQuality.set(quality, f);
  }

  // Only show tiers with a known quality — "Best quality" already covers the rest,
  // and a row like "video | mp4 | ?" only confuses normal users.
  const tiers = [...byQuality.values()]
    .sort((a, b) => qualityRankOf(b) - qualityRankOf(a))
    .filter(f => qualityRankOf(f) >= 0);

  const choices = [];
  if (hasVideo) {
    choices.push({ name: 'Best quality (recommended)', value: 'bestvideo+bestaudio/best' });
    for (const f of tiers) choices.push({ name: pickerLabel(f), value: f.format_id });
  }
  // mp3 is never a format a site serves — it's a conversion done with ffmpeg.
  if (hasAudio) choices.push({ name: 'Audio only (MP3)', value: 'mp3' });
  return choices;
}
