import { accessSync, constants } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const TOOL_ENV = {
  deno: 'SAVE_DENO',
  ffmpeg: 'SAVE_FFMPEG',
  'yt-dlp': 'SAVE_YTDLP',
};

export function isExecutable(filePath, platform = process.platform) {
  if (!filePath) return false;

  try {
    accessSync(filePath, platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function getBundledExecutable(
  tool,
  {
    env = process.env,
    execPath = process.execPath,
    isPackaged = Boolean(process.pkg),
    platform = process.platform,
  } = {}
) {
  const override = env[TOOL_ENV[tool]];
  if (override && isExecutable(override, platform)) return override;
  if (!isPackaged) return null;

  const filename = platform === 'win32' ? `${tool}.exe` : tool;
  const bundled = path.join(path.dirname(execPath), 'libexec', filename);
  return isExecutable(bundled, platform) ? bundled : null;
}

export function canRun(command, args = ['--version']) {
  if (!command) return false;
  const result = spawnSync(command, args, { stdio: 'ignore', windowsHide: true });
  return !result.error;
}
