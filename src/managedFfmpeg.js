import { createHash } from 'crypto';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { gunzipSync } from 'zlib';
import { isExecutable } from './executables.js';
import { FFMPEG_VERSION } from './toolVersions.js';

const assets = {
  'darwin-arm64': ['ffmpeg-darwin-arm64.gz', '8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa'],
  'darwin-x64': ['ffmpeg-darwin-x64.gz', '929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106'],
  'linux-arm64': ['ffmpeg-linux-arm64.gz', '754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0'],
  'linux-x64': ['ffmpeg-linux-x64.gz', 'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa'],
  'win32-x64': ['ffmpeg-win32-x64.gz', '8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77'],
};
let pendingPreparation = null;

function getCacheDirectory() {
  if (process.env.SAVE_CACHE_DIR) return process.env.SAVE_CACHE_DIR;
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'save');
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'save');
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'save');
}

export function getManagedFfmpegPath() {
  if (process.pkg) return null;
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return path.join(getCacheDirectory(), `ffmpeg-${FFMPEG_VERSION}${suffix}`);
}

async function prepareManagedFfmpeg(destination) {
  const [asset, expected] = assets[`${process.platform}-${process.arch}`] || [];
  if (!asset) {
    throw new Error(`No managed ffmpeg binary is available for ${process.platform}-${process.arch}.`);
  }

  console.log(`Preparing ffmpeg ${FFMPEG_VERSION} for first use...`);
  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_VERSION}/${asset}`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const compressed = Buffer.from(await response.arrayBuffer());
  const actual = createHash('sha256').update(compressed).digest('hex');
  if (actual !== expected) throw new Error('ffmpeg checksum verification failed.');

  mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, gunzipSync(compressed), { mode: 0o755 });
    if (process.platform !== 'win32') chmodSync(temporary, 0o755);
    if (existsSync(destination)) rmSync(destination);
    renameSync(temporary, destination);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
  return destination;
}

export async function ensureManagedFfmpeg() {
  if (process.pkg) return null;
  const destination = getManagedFfmpegPath();
  if (isExecutable(destination)) return destination;
  if (!pendingPreparation) {
    pendingPreparation = prepareManagedFfmpeg(destination).finally(() => {
      pendingPreparation = null;
    });
  }
  return pendingPreparation;
}
