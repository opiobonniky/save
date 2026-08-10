import youtubeDlExec from 'youtube-dl-exec';
import { spawn } from 'child_process';

// Packaged binaries use the system executable because child binaries cannot run
// from a pkg snapshot. Normal npm installs use youtube-dl-exec's managed copy.
export const youtubedl = process.pkg ? youtubeDlExec.create('yt-dlp') : youtubeDlExec;

export function spawnYtDlp(url, options) {
  const executable = process.pkg ? 'yt-dlp' : youtubeDlExec.constants.YOUTUBE_DL_PATH;
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
