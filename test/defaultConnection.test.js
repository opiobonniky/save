import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('a fresh installation has the development connection without user configuration', t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'save-default-connection-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const entry = fileURLToPath(new URL('../bin/save.js', import.meta.url));
  const output = execFileSync(process.execPath, [entry, 'config', 'get'], {
    encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: directory, APPDATA: directory, HOME: directory },
  });
  assert.equal(JSON.parse(output).backendUrl, 'http://localhost:8080/api/v1');
});
