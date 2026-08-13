import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

export const QUALITY_SELECTORS = {
  best: 'bestvideo+bestaudio/best',
  '2160p': 'bestvideo[height<=2160]+bestaudio/best[height<=2160]',
  '1440p': 'bestvideo[height<=1440]+bestaudio/best[height<=1440]',
  '1080p': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
  '720p': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
  '480p': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
  '360p': 'bestvideo[height<=360]+bestaudio/best[height<=360]',
};

export function resolveQualitySelector(quality = '1080p') {
  const selector = QUALITY_SELECTORS[quality];
  if (!selector) {
    throw new Error(`Unknown quality "${quality}". Choose: ${Object.keys(QUALITY_SELECTORS).join(', ')}`);
  }
  return selector;
}

export function parseCount(value, name, { min = 1, max = 16 } = {}) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < min || count > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return count;
}

export function parseProxy(value) {
  if (!value) return undefined;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    throw new Error('proxy must be a valid HTTP(S) or SOCKS URL.');
  }
  let proxy;
  try {
    proxy = new URL(value);
  } catch {
    throw new Error('proxy must be a valid HTTP(S) or SOCKS URL.');
  }
  if (!['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'].includes(proxy.protocol)) {
    throw new Error('proxy must use http, https, socks4, socks4a, socks5, or socks5h.');
  }
  return value;
}

export function isLikelyPlaylistUrl(value) {
  try {
    const url = new URL(value);
    if (url.searchParams.has('list') || url.searchParams.has('playlist')) return true;
    return /\/(?:playlist|sets|albums?|collections?|channels?|users?|shows?)(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

// Sites where the media ID lives in the URL path and the query string carries
// only share/tracking parameters. Stripping those makes the URL safe to paste
// unquoted: even if the shell cuts it at an unquoted "&", nothing meaningful
// is lost and the video still resolves. Vimeo is deliberately absent — its
// query can carry private-video hashes (?h=...) that must be preserved.
const QUERY_STRIP_RULES = [
  {
    hostname: /(^|\.)tiktok\.com$/i,
    path: /\/@[^/]+\/(?:video|photo)\/\d+\/?$/i,
    stripAll: true, // every TikTok query param is tracking; the video ID is in the path
    rewritePath: p => p.replace('/photo/', '/video/'), // photo posts need the extractor-supported video route
  },
  {
    hostname: /(^|\.)youtube\.com$/i,
    path: /\/shorts\/[^/]+\/?$/i,
    stripParams: /^(?:si|feature|utm_\w+)$/i, // share buttons add these; keep t=, list=, etc.
  },
  {
    hostname: /(^|\.)instagram\.com$/i,
    path: /\/(?:reel|p|tv)\/[^/]+\/?$/i,
    stripParams: /^(?:igsh|_r|_t|utm_\w+)$/i, // _r/_t are the same share tracking TikTok uses
  },
  {
    hostname: /(^|\.)(?:twitter|x)\.com$/i,
    path: /\/[^/]+\/status\/\d+\/?$/i, // s= is X's share indicator (s=20)
    stripParams: /^(?:s|utm_\w+)$/i,
  },
];

export function normalizeMediaUrl(value) {
  try {
    const url = new URL(value);
    for (const rule of QUERY_STRIP_RULES) {
      if (!rule.hostname.test(url.hostname) || !rule.path.test(url.pathname)) continue;
      if (rule.rewritePath) url.pathname = rule.rewritePath(url.pathname);
      if (rule.stripAll) {
        url.search = '';
        url.hash = '';
      } else {
        const kept = [...url.searchParams.entries()].filter(([name]) => !rule.stripParams.test(name));
        url.search = kept.length ? `?${new URLSearchParams(kept).toString()}` : '';
      }
      return url.toString();
    }
  } catch {
    // Leave invalid input untouched so yt-dlp can report the original error.
  }
  return value;
}

export function looksShellTruncated(value) {
  if (/[?&]$/.test(value)) return true;
  try {
    const search = new URL(value).search;
    if (/[?&][^&=]*=$/.test(search)) return true;
  } catch {
    // Not parseable as a URL — not something we can diagnose here.
  }
  return false;
}

export function detectBackgroundedRun({
  stdinTTY,
  stdoutTTY,
  stderrTTY,
  batchMode = false,
  statLine, // injectable for tests: ps -o stat= output for this process
} = {}) {
  const stdinInteractive = stdinTTY ?? !!process.stdin.isTTY;
  const stdoutInteractive = stdoutTTY ?? !!process.stdout.isTTY;
  const stderrInteractive = stderrTTY ?? !!process.stderr.isTTY;
  if (batchMode) return false;

  // Classic signature: stdin was redirected. POSIX shells point an "&" job's
  // stdin at /dev/null (scripts, cron, CI); the same shape comes from an
  // explicit < /dev/null.
  if (!stdinInteractive && (stdoutInteractive || stderrInteractive)) return true;

  // No terminal at all (piped output, CI) — nothing to warn about.
  if (!stdoutInteractive && !stderrInteractive) return false;

  // Interactive shells (bash job control) keep the terminal on a background
  // job's stdin, so fall back to the process group to catch those splits: ps
  // marks the foreground process group's STAT column with a trailing "+".
  return !isForegroundProcessGroup(statLine);
}

/**
 * True when this process is in the terminal's foreground process group, or
 * when we cannot tell (ps missing/empty) — assume foreground rather than
 * block legitimate runs.
 */
function isForegroundProcessGroup(statLine) {
  if (statLine === undefined) {
    try {
      statLine = execFileSync('ps', ['-o', 'stat=', '-p', String(process.pid)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return true; // ps unavailable — assume foreground rather than block legitimate runs
    }
  }
  const stat = String(statLine).trim();
  return stat.length === 0 || stat.endsWith('+');
}

export function getDefaultDownloadsDir({
  home = os.homedir(),
  platform = process.platform,
  xdgDownloadDir = process.env.XDG_DOWNLOAD_DIR,
} = {}) {
  if (xdgDownloadDir) return xdgDownloadDir;
  return path.join(home, 'Downloads');
}

export async function resolveMediaUrl(value, fetchImpl = globalThis.fetch) {
  try {
    const url = new URL(value);
    if (/^(?:vm|vt)\.tiktok\.com$/i.test(url.hostname)) {
      const response = await fetchImpl(value, { redirect: 'follow' });
      return normalizeMediaUrl(response.url || value);
    }
  } catch {
    // Preserve the original URL so yt-dlp can provide the final diagnostic.
  }
  return normalizeMediaUrl(value);
}
