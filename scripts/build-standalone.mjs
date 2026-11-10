import AdmZip from 'adm-zip';
import { chmodSync, copyFileSync, cpSync, mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const platform = process.platform;
const arch = process.arch;
const target = {
  'linux-x64': 'node18-linux-x64',
  'win32-x64': 'node18-win-x64',
  'darwin-x64': 'node18-macos-x64',
  'darwin-arm64': 'node18-macos-arm64',
}[`${platform}-${arch}`];
if (!target) throw new Error(`Unsupported standalone target: ${platform}-${arch}`);

const name = `save-${manifest.version}-${platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform}-${arch}`;
const directory = path.join(root, 'dist', name);
// Never mix an old tool-filled package into a backend-only release.
if (existsSync(directory)) throw new Error(`Output already exists: ${directory}. Move it aside before rebuilding.`);
mkdirSync(directory, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

await build({ entryPoints: [path.join(root, 'bin/save.js')], bundle: true, platform: 'node', format: 'cjs',
  target: 'node18', outfile: path.join(root, 'dist/save.cjs') });
const executable = path.join(directory, platform === 'win32' ? 'save.exe' : 'save');
run(process.execPath, [path.join(root, 'node_modules/@yao-pkg/pkg/lib-es5/bin.js'), 'dist/save.cjs', '--targets', target, '--output', executable]);
if (platform !== 'win32') chmodSync(executable, 0o755);
writeFileSync(path.join(directory, '.standalone-package'), '@opiobonniky/save standalone\n');
for (const filename of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md']) cpSync(path.join(root, filename), path.join(directory, filename));
if (platform === 'win32') writeFileSync(path.join(directory, 'save.cmd'), '@echo off\r\n"%~dp0save.exe" %*\r\n');
else {
  copyFileSync(path.join(root, 'install-standalone.sh'), path.join(directory, 'install.sh'));
  copyFileSync(path.join(root, 'uninstall.sh'), path.join(directory, 'uninstall.sh'));
  chmodSync(path.join(directory, 'install.sh'), 0o755);
  chmodSync(path.join(directory, 'uninstall.sh'), 0o755);
}
if (platform === 'darwin') run('codesign', ['--force', '--sign', '-', executable]);

// The distributed client must run without node, yt-dlp, ffmpeg or a live backend.
for (const args of [['--version'], ['--help']]) run(executable, args, { env: { ...process.env, PATH: '' } });
const zip = new AdmZip();
zip.addLocalFolder(directory, name);
const archive = path.join(root, 'dist', `${name}.zip`);
zip.writeZip(archive);
console.log(`Built backend-only client: ${archive}`);
