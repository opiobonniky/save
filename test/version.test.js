import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { VERSION } from '../src/version.js';

test('CLI version matches package.json', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, packageJson.version);
});

test('npm package exposes only the save command', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.name, '@opiobonniky/save');
  assert.deepEqual(packageJson.bin, { save: 'bin/save.js' });
});
