import youtubedl from 'youtube-dl-exec';

/**
 * Fetches video metadata and available formats for a given URL
 * without downloading anything. Works for any site yt-dlp supports
 * (YouTube, TikTok, Facebook, Instagram, Twitter/X, Vimeo, etc.)
 *
 * For playlist URLs, returns { isPlaylist: true, entries: [...] } instead
 * of formats — the caller decides whether to download the whole playlist
 * or let the user pick specific videos from it.
 */
export async function extractFormats(url) {
  let info;
  try {
    info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      // Deliberately NOT using --flat-playlist: with it, yt-dlp often gives
      // just a bare video ID as `url` with no `webpage_url`, which produces
      // unusable, unfetchable "URLs" for playlist entries. Full extraction
      // is slower for large playlists but reliably gives a real webpage_url
      // for every entry across extractors (YouTube, TikTok, etc).
    });
  } catch (err) {
    const detail = err.stderr ? `\n${err.stderr.trim()}` : err.message;
    throw new Error(`Could not read this URL.${detail}`);
  }

  if (!info) {
    throw new Error('Could not extract video information from this URL.');
  }

  if (info._type === 'playlist' || Array.isArray(info.entries)) {
    const rawEntries = info.entries || [];
    const entries = rawEntries
      .filter(e => e && (e.webpage_url || e.original_url || (typeof e.url === 'string' && e.url.startsWith('http'))))
      .map(e => ({
        id: e.id,
        title: e.title || e.id || 'Untitled',
        url: e.webpage_url || e.original_url || e.url,
      }));

    const skipped = rawEntries.length - entries.length;
    if (skipped > 0) {
      console.error(
        `Note: ${skipped} playlist entr${skipped === 1 ? 'y was' : 'ies were'} skipped (unavailable or no resolvable URL, e.g. deleted/private videos).`
      );
    }

    if (entries.length === 0) {
      throw new Error('This playlist has no downloadable entries.');
    }

    return {
      isPlaylist: true,
      title: info.title || 'Untitled playlist',
      entries,
    };
  }

  if (!info.formats || info.formats.length === 0) {
    throw new Error('No downloadable formats were found for this URL.');
  }

  return {
    isPlaylist: false,
    title: info.title || 'Untitled',
    formats: info.formats.map(f => ({
      format_id: f.format_id,
      ext: f.ext,
      resolution: f.resolution,
      filesize: f.filesize || f.filesize_approx || null,
      note: f.format_note || '',
      vcodec: f.vcodec,
      acodec: f.acodec,
    })),
  };
}
