import { execFile, spawn } from 'child_process';
import { canRun, getBundledExecutable, isExecutable } from './executables.js';
import { getManagedYtDlpPath as getManagedPath } from './managedYtDlp.js';

function optionName(name) {
  return `--${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
}

export function ytDlpArgs(options = {}) {
  const args = [];
  for (const [name, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === false) continue;
    const flag = optionName(name);
    if (value === true) {
      args.push(flag);
    } else {
      for (const item of Array.isArray(value) ? value : [value]) args.push(flag, String(item));
    }
  }
  return args;
}

export function getManagedYtDlpPath() {
  const managed = getManagedPath();
  return isExecutable(managed) ? managed : null;
}

export function getYtDlpExecutablePath() {
  return (
    getBundledExecutable('yt-dlp') ||
    getManagedYtDlpPath() ||
    (canRun('yt-dlp') ? 'yt-dlp' : null)
  );
}

export function youtubedl(url, options) {
  return new Promise((resolve, reject) => {
    const executable = getYtDlpExecutablePath();
    if (!executable) {
      reject(new Error('yt-dlp is unavailable. Run save-video-cli doctor for details.'));
      return;
    }
    execFile(
      executable,
      [url, ...ytDlpArgs(options)],
      { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject(new Error(`yt-dlp returned invalid metadata: ${parseError.message}`));
        }
      }
    );
  });
}

export function spawnYtDlp(url, options) {
  const executable = getYtDlpExecutablePath();
  if (!executable) throw new Error('yt-dlp is unavailable. Run save-video-cli doctor for details.');
  const subprocess = spawn(executable, [url, ...ytDlpArgs(options)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const completion = new Promise((resolve, reject) => {
    subprocess.once('error', reject);
    subprocess.once('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with code ${code}`));
    });
  });
  return { subprocess, completion };
}
