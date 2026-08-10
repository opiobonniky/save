import { execFileSync } from 'child_process';
import { getFfmpegExecutablePath, getManagedFfmpegPath } from './ffmpeg.js';
import { getManagedYtDlpPath, getYtDlpExecutablePath } from './ytdlp.js';
import { canRun, getBundledExecutable } from './executables.js';

export function getCommandVersion(command, args = ['--version']) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function getYtDlpRuntimeOptions() {
  const deno = getBundledExecutable('deno') || (canRun('deno') ? 'deno' : null);
  if (deno) return { jsRuntimes: `deno:${deno}` };

  const nodeVersion = getCommandVersion('node');
  const nodeMajor = Number(nodeVersion?.match(/v?(\d+)/)?.[1]);
  return nodeMajor >= 22 ? { jsRuntimes: 'node' } : {};
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
