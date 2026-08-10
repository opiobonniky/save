import AdmZip from 'adm-zip';
import { createHash } from 'crypto';
import { chmodSync, copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

const DENO_VERSION = 'v2.9.5';
const YT_DLP_VERSION = '2026.07.04';
const root = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const platform = process.platform;
const arch = process.arch;

const targets = {
  'linux-x64': {
    pkg: 'node18-linux-x64',
    ytDlp: 'yt-dlp_linux',
    deno: 'deno-x86_64-unknown-linux-gnu.zip',
  },
  'win32-x64': {
    pkg: 'node18-win-x64',
    ytDlp: 'yt-dlp.exe',
    deno: 'deno-x86_64-pc-windows-msvc.zip',
  },
  'darwin-x64': {
    pkg: 'node18-macos-x64',
    ytDlp: 'yt-dlp_macos',
    deno: 'deno-x86_64-apple-darwin.zip',
  },
  'darwin-arm64': {
    pkg: 'node18-macos-arm64',
    ytDlp: 'yt-dlp_macos',
    deno: 'deno-aarch64-apple-darwin.zip',
  },
};

const target = targets[`${platform}-${arch}`];
if (!target) throw new Error(`Unsupported standalone target: ${platform}-${arch}`);

const platformName = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform;
const executableSuffix = platform === 'win32' ? '.exe' : '';
const artifactName = `download-me-${packageJson.version}-${platformName}-${arch}`;
const packageDir = path.join(root, 'dist', artifactName);
const libexecDir = path.join(packageDir, 'libexec');
const cacheDir = path.join(root, 'dist', '.standalone-cache');
const appPath = path.join(packageDir, `download-me${executableSuffix}`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

async function downloadVerified(url, checksumUrl, destination, assetName) {
  const checksumPath = `${destination}.sha256`;
  await Promise.all([download(url, destination), download(checksumUrl, checksumPath)]);
  const checksumText = readFileSync(checksumPath, 'utf8');
  const line = checksumText
    .split(/\r?\n/)
    .find(entry => entry.trim().split(/\s+/).at(-1)?.replace(/^\*/, '') === assetName);
  const expected = line?.match(/[a-fA-F0-9]{64}/)?.[0]?.toLowerCase();
  const actual = sha256(destination);
  if (!expected || expected !== actual) throw new Error(`Checksum verification failed for ${assetName}`);
}

function copyExecutable(source, destination) {
  copyFileSync(source, destination);
  if (platform !== 'win32') chmodSync(destination, 0o755);
}

mkdirSync(path.join(root, 'dist'), { recursive: true });
mkdirSync(cacheDir, { recursive: true });
rmSync(packageDir, { recursive: true, force: true });
mkdirSync(libexecDir, { recursive: true });

run(platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:bundle']);
const pkgBin = path.join(root, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
const builtApp = path.join(root, 'dist', `download-me-${platformName}-${arch}${executableSuffix}`);
run(process.execPath, [pkgBin, 'dist/download-me.cjs', '--targets', target.pkg, '--output', builtApp]);
copyExecutable(builtApp, appPath);

const ytDlpDestination = path.join(libexecDir, `yt-dlp${executableSuffix}`);
await downloadVerified(
  `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/${target.ytDlp}`,
  `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/SHA2-256SUMS`,
  ytDlpDestination,
  target.ytDlp
);
if (platform !== 'win32') chmodSync(ytDlpDestination, 0o755);

const denoArchive = path.join(cacheDir, target.deno);
await downloadVerified(
  `https://github.com/denoland/deno/releases/download/${DENO_VERSION}/${target.deno}`,
  `https://github.com/denoland/deno/releases/download/${DENO_VERSION}/${target.deno}.sha256sum`,
  denoArchive,
  target.deno
);
new AdmZip(denoArchive).extractAllTo(libexecDir, true);
if (platform !== 'win32') chmodSync(path.join(libexecDir, 'deno'), 0o755);

copyExecutable(ffmpegPath, path.join(libexecDir, `ffmpeg${executableSuffix}`));
copyExecutable(ffprobeInstaller.path, path.join(libexecDir, `ffprobe${executableSuffix}`));

cpSync(path.join(root, 'README.md'), path.join(packageDir, 'README.md'));
cpSync(path.join(root, 'LICENSE'), path.join(packageDir, 'LICENSE'));
cpSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(packageDir, 'THIRD_PARTY_NOTICES.md'));
if (platform !== 'win32') {
  copyExecutable(path.join(root, 'install-standalone.sh'), path.join(packageDir, 'install.sh'));
  copyExecutable(path.join(root, 'uninstall.sh'), path.join(packageDir, 'uninstall.sh'));
}
mkdirSync(path.join(packageDir, 'licenses'), { recursive: true });
cpSync(
  path.join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.LICENSE'),
  path.join(packageDir, 'licenses', 'FFMPEG-GPL-3.0.txt')
);
cpSync(
  path.join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.README'),
  path.join(packageDir, 'licenses', 'FFMPEG-BUILD-README.txt')
);
await Promise.all([
  download(
    `https://raw.githubusercontent.com/denoland/deno/${DENO_VERSION}/LICENSE.md`,
    path.join(packageDir, 'licenses', 'DENO-LICENSE.md')
  ),
  download(
    `https://raw.githubusercontent.com/yt-dlp/yt-dlp/${YT_DLP_VERSION}/LICENSE`,
    path.join(packageDir, 'licenses', 'YT-DLP-LICENSE.txt')
  ),
  download(
    `https://raw.githubusercontent.com/yt-dlp/yt-dlp/${YT_DLP_VERSION}/THIRD_PARTY_LICENSES.txt`,
    path.join(packageDir, 'licenses', 'YT-DLP-THIRD-PARTY-LICENSES.txt')
  ),
]);

if (platform === 'darwin') {
  const binaries = [appPath, ...['yt-dlp', 'ffmpeg', 'ffprobe', 'deno'].map(name => path.join(libexecDir, name))];
  for (const binary of binaries) run('codesign', ['--force', '--sign', '-', binary]);
}

const checksums = ['download-me', 'yt-dlp', 'ffmpeg', 'ffprobe', 'deno']
  .map(name => {
    const relative = `${name === 'download-me' ? '' : 'libexec/'}${name}${executableSuffix}`;
    return `${sha256(path.join(packageDir, relative))}  ${relative}`;
  })
  .join('\n');
writeFileSync(path.join(packageDir, 'SHA256SUMS'), `${checksums}\n`);

const cleanEnv = { ...process.env, PATH: libexecDir };
run(appPath, ['--version'], { env: cleanEnv });
run(appPath, ['doctor'], { env: cleanEnv });

let archivePath;
if (platform === 'win32') {
  archivePath = path.join(root, 'dist', `${artifactName}.zip`);
  const archive = new AdmZip();
  archive.addLocalFolder(packageDir, artifactName);
  archive.writeZip(archivePath);
} else {
  archivePath = path.join(root, 'dist', `${artifactName}.tar.gz`);
  run('tar', ['-czf', archivePath, '-C', path.join(root, 'dist'), artifactName]);
}
writeFileSync(`${archivePath}.sha256`, `${sha256(archivePath)}  ${path.basename(archivePath)}\n`);
console.log(`Built ${path.relative(root, archivePath)}`);
