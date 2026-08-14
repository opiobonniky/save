import { execFileSync } from 'child_process';
import { getFfmpegExecutablePath, getManagedFfmpegPath } from './ffmpeg.js';
import { getManagedYtDlpPath, getYtDlpExecutablePath } from './ytdlp.js';
import { canRun, getBundledExecutable } from './executables.js';

// TikTok currently blocks Chrome user-agent majors 140-149. Chrome 139 avoids
// that site-maintenance response while remaining recent enough for other sites.
// Override with --user-agent if site behavior changes again.
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

export const TIKTOK_EXTRACTOR_ARGS =
  'tiktok:app_info=/musical_ly/35.1.3/2023501030/1233';

export function getSiteRuntimeOptions(url) {
  try {
    return /(^|\.)tiktok\.com$/i.test(new URL(url).hostname)
      ? { extractorArgs: TIKTOK_EXTRACTOR_ARGS }
      : {};
  } catch {
    return {};
  }
}

export function getCommandVersion(command, args = ['--version']) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function getYtDlpRuntimeOptions(url) {
  const siteOptions = getSiteRuntimeOptions(url);
  const deno = getBundledExecutable('deno') || (canRun('deno') ? 'deno' : null);
  if (deno) return { userAgent: BROWSER_USER_AGENT, jsRuntimes: `deno:${deno}`, ...siteOptions };

  const nodeVersion = getCommandVersion('node');
  const nodeMajor = Number(nodeVersion?.match(/v?(\d+)/)?.[1]);
  return {
    userAgent: BROWSER_USER_AGENT,
    ...(nodeMajor >= 22 ? { jsRuntimes: 'node' } : {}),
    ...siteOptions,
  };
}

export function getRuntimeDiagnostics() {
  const deno = getCommandVersion('deno');
  const node = getCommandVersion('node');
  const nodeMajor = Number(node?.match(/v?(\d+)/)?.[1]);
  const bundledDeno = getBundledExecutable('deno');
  const bundledFfmpeg = getBundledExecutable('ffmpeg');
  const bundledYtDlp = getBundledExecutable('yt-dlp');
  const denoPath = bundledDeno || (deno ? 'deno' : null);
  const ffmpegPath = getFfmpegExecutablePath();
  const ffmpeg = getCommandVersion(ffmpegPath, ['-version'])?.split('\n')[0] || null;
  const ytDlpPath = getYtDlpExecutablePath();

  return {
    ytDlp: getCommandVersion(ytDlpPath),
    ytDlpSource: bundledYtDlp ? 'bundled' : getManagedYtDlpPath() ? 'managed' : ytDlpPath ? 'system' : null,
    ffmpeg,
    ffmpegSource: ffmpeg
      ? bundledFfmpeg
        ? 'bundled'
        : getManagedFfmpegPath()
          ? 'managed'
          : 'system'
      : null,
    aria2c: getCommandVersion('aria2c')?.split('\n')[0] || null,
    deno: getCommandVersion(denoPath)?.split('\n')[0] || null,
    denoSource: bundledDeno ? 'bundled' : denoPath ? 'system' : null,
    node,
    javascriptReady: Boolean(denoPath || nodeMajor >= 22),
  };
}
