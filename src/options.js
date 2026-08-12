import os from 'os';
import path from 'path';

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

export function normalizeMediaUrl(value) {
  try {
    const url = new URL(value);
    if (/(^|\.)tiktok\.com$/i.test(url.hostname) && /\/@[^/]+\/(?:video|photo)\/\d+\/?$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace('/photo/', '/video/');
      url.search = '';
      url.hash = '';
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
} = {}) {
  const stdinInteractive = stdinTTY ?? !!process.stdin.isTTY;
  const stdoutInteractive = stdoutTTY ?? !!process.stdout.isTTY;
  const stderrInteractive = stderrTTY ?? !!process.stderr.isTTY;
  return !batchMode && !stdinInteractive && (stdoutInteractive || stderrInteractive);
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
