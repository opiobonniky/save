import youtubeDlExec from 'youtube-dl-exec';
import { spawn } from 'child_process';
import { canRun, getBundledExecutable, isExecutable } from './executables.js';

// Child binaries cannot run from a pkg snapshot, so release archives keep them
// beside the app. Normal npm installs use youtube-dl-exec's managed copy.
export const youtubedl = process.pkg ? youtubeDlExec.create('yt-dlp') : youtubeDlExec;

export function getManagedYtDlpPath() {
  const managed = !process.pkg ? youtubeDlExec.constants.YOUTUBE_DL_PATH : null;
  return isExecutable(managed) ? managed : null;
}

export function getYtDlpExecutablePath() {
  return (
    getBundledExecutable('yt-dlp') ||
    getManagedYtDlpPath() ||
    (canRun('yt-dlp') ? 'yt-dlp' : null)
  );
}

export function spawnYtDlp(url, options) {
  const executable = getYtDlpExecutablePath();
  if (!executable) throw new Error('yt-dlp is unavailable. Run download-me doctor for details.');
  const subprocess = spawn(executable, [url, ...youtubeDlExec.args(options)], {
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
