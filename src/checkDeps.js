import { execSync } from 'child_process';
import chalk from 'chalk';

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

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
  if (!commandExists('yt-dlp')) missing.push('yt-dlp');
  if (requireFfmpeg && !commandExists('ffmpeg')) missing.push('ffmpeg');

  if (missing.length > 0) {
    console.error(
      chalk.red(
        `\nMissing required tool(s): ${missing.join(', ')}\n` +
          `These are normally installed automatically when download-me is installed.\n` +
          `Install them manually and try again:\n` +
          `  sudo apt install ${missing.join(' ')}\n`
      )
    );
    process.exit(1);
  }
}
