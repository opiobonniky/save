import { youtubedl } from './ytdlp.js';
import { getYtDlpRuntimeOptions } from './runtime.js';

export function resolvePlaylistEntries(rawEntries) {
  const entries = rawEntries
    .map((entry, index) => entry && ({
      id: entry.id,
      title: entry.title || entry.id || 'Untitled',
      index: entry.playlist_index || index + 1,
    }))
    .filter(Boolean);
  return { entries, skipped: rawEntries.length - entries.length };
}

export function normalizeFormats(formats) {
  return formats
    .filter(format =>
      (format.vcodec && format.vcodec !== 'none') ||
      (format.acodec && format.acodec !== 'none'))
    .map(format => ({
      format_id: format.format_id,
      ext: format.ext,
      resolution: format.resolution,
      width: format.width,
      height: format.height,
      filesize: format.filesize || format.filesize_approx || null,
      note: format.format_note || '',
      vcodec: format.vcodec,
      acodec: format.acodec,
      protocol: format.protocol,
    }));
}

export function getExtractOptions(options = {}) {
  return {
    dumpJson: !options.flatPlaylist,
    dumpSingleJson: options.flatPlaylist,
    noWarnings: true,
    noCheckCertificates: true,
    flatPlaylist: options.flatPlaylist,
    proxy: options.proxy,
    ...getYtDlpRuntimeOptions(),
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
    ...(options.cookiesFromBrowser ? { cookiesFromBrowser: options.cookiesFromBrowser } : {}),
  };
}

const ANTI_BOT_CHALLENGE_RE = /unable to extract universal data|unexpected response/i;

export function isRetryableExtractionError(error) {
  const detail = `${error?.stderr || ''}\n${error?.message || ''}`;
  return ANTI_BOT_CHALLENGE_RE.test(detail) || /timed? out|connection reset|HTTP Error (?:429|5\d\d)/i.test(detail);
}

/** True when a site (e.g. TikTok) served an anti-bot challenge instead of the page. */
export function isAntiBotChallenge(error) {
  return ANTI_BOT_CHALLENGE_RE.test(`${error?.stderr || ''}\n${error?.message || ''}`);
}

const EXTRACTION_ERROR_HINTS = [
  {
    re: /video unavailable|this video has been removed|this video is no longer available|unavailable for legal reasons/i,
    message: 'This video is unavailable (removed, private, or deleted).',
  },
  {
    re: /private video|this video is private/i,
    message: 'This video is private and requires access.',
  },
  {
    re: /georestrict|not available in your country|blocked in your country|watch on .* to view/i,
    message: 'This video is blocked in your region — try a VPN or pass --proxy.',
  },
  {
    re: /sign in to confirm|please verify you are a human|bot detection/i,
    message: 'The site asked for a browser check (bot detection) — retry, or use a different network or --proxy.',
  },
  {
    re: /timed? out|timeout|ECONNRESET|ECONNREFUSED|ENOTFOUND|name or service not known|connection reset|failed to resolve|couldn't connect/i,
    message: 'Could not reach the site — check your network, use a VPN, or pass --proxy.',
  },
  {
    re: /HTTP Error (?:429|5\d\d)/i,
    message: 'The site returned an error or is rate-limiting — wait a moment and retry.',
  },
  {
    re: /requires login|login required|log in to confirm/i,
    message: 'This content requires a login — pass real browser cookies (yt-dlp --cookies-from-browser).',
  },
  {
    re: /unable to extract/i,
    message:
      'The site changed its layout or is serving an anti-bot challenge, so yt-dlp cannot parse it yet (an upstream issue). Try again later, update yt-dlp, or pass browser cookies with --cookies-from-browser <browser>.',
  },
];

/** A short, human explanation for a failed extraction, or null when unknown. */
export function explainExtractionError(error) {
  const detail = `${error?.stderr || ''}\n${error?.message || ''}`;
  for (const hint of EXTRACTION_ERROR_HINTS) {
    if (hint.re.test(detail)) return hint.message;
  }
  return null;
}

/** The site name yt-dlp reported in its error, e.g. "imdb" from "[imdb] ...". */
export function extractionSiteName(error) {
  const match = `${error?.stderr || ''}`.match(/\[([A-Za-z0-9:_]+)\]/);
  return match ? match[1] : null;
}

/**
 * Fetches video metadata and available formats for a given URL
 * without downloading anything. Works for any site yt-dlp supports
 * (YouTube, TikTok, Facebook, Instagram, Twitter/X, Vimeo, etc.)
 *
 * For playlist URLs, returns { isPlaylist: true, entries: [...] } instead
 * of formats — the caller decides whether to download the whole playlist
 * or let the user pick specific videos from it.
 */
export async function extractFormats(url, options = {}) {
  let info;
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      info = await youtubedl(url, getExtractOptions(options));
      break;
    } catch (err) {
      lastError = err;
      if (!isRetryableExtractionError(err)) break;
      const antiBot = isAntiBotChallenge(err);
      // Anti-bot challenges (TikTok) are rate-based and can take a few seconds
      // to clear, so retry more times with a longer backoff. Other transient
      // errors keep the original 3 attempts.
      if (attempt >= (antiBot ? 4 : 2)) break;
      const backoffMs = (antiBot ? 1500 : 500) * (attempt + 1);
      if (antiBot) {
        console.error(
          `The site returned an unexpected or anti-bot response — retrying in ${Math.ceil(backoffMs / 1000)}s...`
        );
      }
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
  if (!info && lastError) {
    const detail = lastError.stderr?.trim() || lastError.message;
    const explanation = explainExtractionError(lastError);
    const site = extractionSiteName(lastError);
    const headline = explanation
      ? `${explanation}${site ? ` (site: ${site})` : ''}`
      : 'Could not read video information from this URL.';
    throw new Error(`${headline}\n\n${detail}`);
  }

  if (!info) {
    throw new Error('Could not extract video information from this URL.');
  }

  if (info._type === 'playlist' || Array.isArray(info.entries)) {
    const rawEntries = info.entries || [];
    const { entries, skipped } = resolvePlaylistEntries(rawEntries);
    if (skipped > 0) {
      console.error(
        `Note: ${skipped} unavailable playlist entr${skipped === 1 ? 'y was' : 'ies were'} skipped.`
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
    formats: normalizeFormats(info.formats),
  };
}
