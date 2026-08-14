import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectories = [];

function executable(filePath, contents = '#!/bin/sh\nexit 0\n') {
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

function fixture() {
  const base = mkdtempSync(path.join(os.tmpdir(), 'save installer-'));
  temporaryDirectories.push(base);
  const archive = path.join(base, 'archive');
  const prefix = path.join(base, 'prefix');
  const oldBin = path.join(base, 'old-bin');
  mkdirSync(path.join(archive, 'libexec'), { recursive: true });
  mkdirSync(oldBin);
  executable(path.join(archive, 'save'), '#!/bin/sh\nprintf "1.1.9\\n"\n');
  for (const tool of ['yt-dlp', 'ffmpeg', 'ffprobe', 'deno']) {
    executable(path.join(archive, 'libexec', tool));
  }
  writeFileSync(path.join(archive, '.standalone-package'), '@opiobonniky/save standalone\n');
  cpSync(path.join(root, 'install-standalone.sh'), path.join(archive, 'install.sh'));
  cpSync(path.join(root, 'uninstall.sh'), path.join(archive, 'uninstall.sh'));
  chmodSync(path.join(archive, 'install.sh'), 0o755);
  chmodSync(path.join(archive, 'uninstall.sh'), 0o755);
  return { archive, base, oldBin, prefix };
}

function run(script, { cwd, oldBin, prefix }) {
  const env = {
    ...process.env,
    PATH: `${oldBin}${path.delimiter}${process.env.PATH}`,
    SAVE_INSTALL_PREFIX: prefix,
  };
  delete env.SUDO_USER;
  return spawnSync('bash', [script], { cwd, env, encoding: 'utf8' });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('standalone installer', { skip: process.platform === 'win32' }, () => {
  test('redirects a shadowing npm link and removes it on uninstall', () => {
    const paths = fixture();
    const oldPackage = path.join(paths.base, 'old-package');
    mkdirSync(path.join(oldPackage, 'bin'), { recursive: true });
    writeFileSync(
      path.join(oldPackage, 'package.json'),
      `${JSON.stringify({ name: '@opiobonniky/save' }, null, 2)}\n`
    );
    executable(path.join(oldPackage, 'bin', 'save.js'));
    const oldCommand = path.join(paths.oldBin, 'save');
    symlinkSync(path.join(oldPackage, 'bin', 'save.js'), oldCommand);

    const installed = run(path.join(paths.archive, 'install.sh'), {
      cwd: paths.archive,
      oldBin: paths.oldBin,
      prefix: paths.prefix,
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    const installedApp = path.join(paths.prefix, 'lib', 'save', 'save');
    assert.equal(readlinkSync(oldCommand), installedApp);
    assert.equal(readlinkSync(path.join(paths.prefix, 'bin', 'save')), installedApp);

    const reinstalled = run(path.join(paths.archive, 'install.sh'), {
      cwd: paths.archive,
      oldBin: paths.oldBin,
      prefix: paths.prefix,
    });
    assert.equal(reinstalled.status, 0, reinstalled.stderr || reinstalled.stdout);
    assert.equal(readlinkSync(oldCommand), installedApp);

    const version = spawnSync(oldCommand, ['--version'], { encoding: 'utf8' });
    assert.equal(version.stdout.trim(), '1.1.9');

    const removed = run(path.join(paths.prefix, 'lib', 'save', 'uninstall.sh'), {
      cwd: paths.base,
      oldBin: paths.oldBin,
      prefix: paths.prefix,
    });
    assert.equal(removed.status, 0, removed.stderr || removed.stdout);
    assert.equal(existsSync(oldCommand), false);
    assert.equal(existsSync(path.join(paths.prefix, 'lib', 'save')), false);
  });

  test('refuses to replace an unrelated shadowing command', () => {
    const paths = fixture();
    executable(path.join(paths.oldBin, 'save'));

    const result = run(path.join(paths.archive, 'install.sh'), {
      cwd: paths.archive,
      oldBin: paths.oldBin,
      prefix: paths.prefix,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /could not be verified as @opiobonniky\/save/);
    assert.equal(existsSync(path.join(paths.prefix, 'lib', 'save')), false);
  });

  test('verifies an update before replacing the working installation', () => {
    const paths = fixture();
    const targetDir = path.join(paths.prefix, 'lib', 'save');
    mkdirSync(path.join(targetDir, 'libexec'), { recursive: true });
    executable(path.join(targetDir, 'save'), '#!/bin/sh\nprintf "working\\n"\n');
    executable(path.join(targetDir, 'libexec', 'yt-dlp'));
    cpSync(path.join(paths.archive, 'install.sh'), path.join(targetDir, 'install.sh'));
    writeFileSync(path.join(targetDir, '.standalone-package'), '@opiobonniky/save standalone\n');
    executable(path.join(paths.archive, 'save'), '#!/bin/sh\nexit 1\n');

    const result = run(path.join(paths.archive, 'install.sh'), {
      cwd: paths.archive,
      oldBin: paths.oldBin,
      prefix: paths.prefix,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /existing installation was not changed/);
    const current = spawnSync(path.join(targetDir, 'save'), [], { encoding: 'utf8' });
    assert.equal(current.stdout.trim(), 'working');
  });
});
