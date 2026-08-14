import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { StatusBar, prettySiteName } from '../src/status.js';

describe('prettySiteName', () => {
  test('maps known sites to friendly names', () => {
    assert.equal(prettySiteName('youtube'), 'YouTube');
    assert.equal(prettySiteName('tiktok'), 'TikTok');
    assert.equal(prettySiteName('youtube:playlist'), 'YouTube');
    assert.equal(prettySiteName('example.com'), 'example.com');
    assert.equal(prettySiteName(null), 'the server');
    assert.equal(prettySiteName(''), 'the server');
  });
});

function fakeStream() {
  return {
    isTTY: true,
    writes: [],
    write(text) {
      this.writes.push(text);
    },
  };
}

describe('StatusBar', () => {
  test('draws a sweeping bar and status on a single line', () => {
    const stream = fakeStream();
    const bar = new StatusBar({ stream });
    assert.equal(bar.enabled, true);

    bar.start('Fetching…');
    const writes = stream.writes.join('');
    assert.ok(writes.includes('['));
    assert.ok(writes.includes('] Fetching…'));
    assert.ok(/[█▓▒░]/.test(writes), 'bar contains shaded block characters');
    assert.ok(!writes.includes('\n'), 'stays on one line');
  });

  test('updates the status label in place', () => {
    const stream = fakeStream();
    const bar = new StatusBar({ stream });
    bar.start('Fetching video info from YouTube…');
    stream.writes.length = 0;
    bar.update('Anti-bot check — TikTok is checking to make sure we are not a bot — retry 2/6 in 3s');
    assert.ok(stream.writes.join('').includes('Anti-bot check — TikTok is checking'));
  });

  test('clears the line when finished', () => {
    const stream = fakeStream();
    const bar = new StatusBar({ stream });
    bar.start('x');
    bar.clear();
    assert.ok(stream.writes.join('').includes('\x1b[2K'));
    assert.equal(bar.timer, null);
  });

  test('stays silent when progress is disabled', () => {
    const stream = fakeStream();
    const bar = new StatusBar({ stream, noProgress: true });
    assert.equal(bar.enabled, false);
    bar.start('x');
    bar.update('y');
    bar.clear();
    assert.equal(stream.writes.length, 0);
  });

  test('stays silent on a non-TTY stream', () => {
    const stream = { isTTY: false, writes: [], write(text) { this.writes.push(text); } };
    const bar = new StatusBar({ stream });
    assert.equal(bar.enabled, false);
    bar.start('x');
    assert.equal(stream.writes.length, 0);
  });
});