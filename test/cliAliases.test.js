import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../bin/save.js', import.meta.url));

test('help documents every short/long option pair', () => {
  const help = execFileSync(process.execPath, [entry, '-h'], { encoding: 'utf8' });
  for (const pair of ['-q, --quality', '-a, --audio', '-f, --format', '-c, --choose',
    '-l, --list-formats', '-b, --batch', '-s, --backend', '-o, --overwrite', '-r, --report-usage']) {
    assert.ok(help.includes(pair), `Missing alias ${pair}`);
  }
});

test('short audio and quality flags behave like long flags', () => {
  for (const flags of [['-a', '-q', '1080p'], ['--audio', '--quality', '1080p']]) {
    const result = spawnSync(process.execPath, [entry, 'https://youtu.be/VIDEO_ID', ...flags], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--audio cannot be combined with --quality/);
    assert.doesNotMatch(result.stderr, /unknown option/);
  }
});

test('doctor also exposes the short backend option', () => {
  const help = execFileSync(process.execPath, [entry, 'doctor', '-h'], { encoding: 'utf8' });
  assert.ok(help.includes('-s, --backend'));
});

test('lowercase -v prints the version, just like -V and --version', () => {
  const version = execFileSync(process.execPath, [entry, '--version'], { encoding: 'utf8' });
  assert.equal(execFileSync(process.execPath, [entry, '-v'], { encoding: 'utf8' }), version);
  assert.equal(execFileSync(process.execPath, [entry, '-V'], { encoding: 'utf8' }), version);
});
