import chalk from 'chalk';
import { getFfmpegExecutablePath } from './ffmpeg.js';
import { getYtDlpExecutablePath } from './ytdlp.js';

/**
 * Defense-in-depth check, run every time the CLI starts.
 * Setup (scripts/postinstall.js) already tries to install these
 * automatically when the package is installed — this just catches
 * the case where that failed (no internet, no sudo, unsupported OS)
 * and gives the user one clear message instead of a confusing crash
 * partway through a download.
 */
export function checkDependencies({ requireFfmpeg = false } = {}) {
  const missing = [];
  if (!getYtDlpExecutablePath()) missing.push('yt-dlp');
  if (requireFfmpeg && !getFfmpegExecutablePath()) missing.push('ffmpeg');

  if (missing.length > 0) {
    const recovery = process.pkg
      ? 'The application bundle is incomplete. Extract the full archive again and keep libexec beside download-me.'
      : 'Reinstall save-video-cli so npm can restore its managed tools.';
    console.error(
      chalk.red(
        `\nMissing required tool(s): ${missing.join(', ')}\n` +
          `${recovery}\n`
      )
    );
    process.exit(1);
  }
}
