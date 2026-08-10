import { createHash } from 'crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { isExecutable } from './executables.js';
import { YT_DLP_VERSION } from './toolVersions.js';

const assets = {
  'darwin-arm64': 'yt-dlp_macos',
  'darwin-x64': 'yt-dlp_macos',
  'linux-arm64': 'yt-dlp_linux_aarch64',
  'linux-x64': 'yt-dlp_linux',
  'win32-x64': 'yt-dlp.exe',
};
let pendingPreparation = null;

function getCacheDirectory() {
  if (process.env.DOWNLOAD_ME_CACHE_DIR) return process.env.DOWNLOAD_ME_CACHE_DIR;
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'download-me');
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'download-me');
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'download-me');
}

export function getManagedYtDlpPath() {
  if (process.pkg) return null;
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return path.join(getCacheDirectory(), `yt-dlp-${YT_DLP_VERSION}${suffix}`);
}

async function download(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function prepareManagedYtDlp(destination) {
  const asset = assets[`${process.platform}-${process.arch}`];
  if (!asset) {
    throw new Error(`No managed yt-dlp binary is available for ${process.platform}-${process.arch}.`);
  }

  console.log(`Preparing yt-dlp ${YT_DLP_VERSION} for first use...`);
  const baseUrl = `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}`;
  const [binary, checksumFile] = await Promise.all([
    download(`${baseUrl}/${asset}`),
    download(`${baseUrl}/SHA2-256SUMS`),
  ]);
  const checksumLine = checksumFile
    .toString('utf8')
    .split(/\r?\n/)
    .find(line => line.trim().split(/\s+/).at(-1)?.replace(/^\*/, '') === asset);
  const expected = checksumLine?.match(/[a-fA-F0-9]{64}/)?.[0]?.toLowerCase();
  const actual = createHash('sha256').update(binary).digest('hex');
  if (!expected || expected !== actual) throw new Error('yt-dlp checksum verification failed.');

  mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, binary, { mode: 0o755 });
    if (process.platform !== 'win32') chmodSync(temporary, 0o755);
    if (existsSync(destination)) rmSync(destination);
    renameSync(temporary, destination);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
  return destination;
}

export async function ensureManagedYtDlp() {
  if (process.pkg) return null;
  const destination = getManagedYtDlpPath();
  if (isExecutable(destination)) return destination;
  if (!pendingPreparation) {
    pendingPreparation = prepareManagedYtDlp(destination).finally(() => {
      pendingPreparation = null;
    });
  }
  return pendingPreparation;
}
