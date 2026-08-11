import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { VERSION } from '../src/version.js';

test('CLI version matches package.json', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, packageJson.version);
});

test('npm package exposes the preferred and compatibility commands', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.name, '@opiobonniky/vidfetch');
  assert.deepEqual(Object.keys(packageJson.bin).sort(), [
    'download-me',
    'save',
    'save-video',
    'save-video-cli',
  ]);
});
