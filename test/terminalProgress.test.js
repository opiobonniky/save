import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerminalProgress } from '../src/terminalProgress.js';

function fixture(isTTY) {
  const output = [];
  const ui = new TerminalProgress({ stream: { isTTY, columns: 150, write: text => output.push(text) }, now: () => 1000 });
  return { ui, output };
}

test('TTY phases use animated activity and real progress rather than fake percentages', () => {
  const { ui, output } = fixture(true);
  try {
    ui.start('Getting video details');
    assert.doesNotMatch(output.at(-1), /\d+%/);
    ui.job({ status: 'RUNNING', progress: 0 });
    assert.match(output.at(-1), /Connecting to video source/);
    assert.doesNotMatch(output.at(-1), /\d+%/);
    ui.job({ status: 'RUNNING', progress: 42 });
    assert.match(output.at(-1), /42%/);
    ui.job({ status: 'PROCESSING', progress: 95 });
    assert.doesNotMatch(output.at(-1), /\d+%/);
    ui.transfer({ received: 1_000_000, total: 2_000_000 });
    assert.match(output.at(-1), /50%.*1.0 MB \/ 2.0 MB/);
  } finally { ui.stop(); }
  assert.equal(ui.timer, null);
});

test('non-interactive logs contain phase changes without escape codes or repeated progress lines', () => {
  const { ui, output } = fixture(false);
  ui.start('Preparing');
  ui.job({ status: 'RUNNING', progress: 20 });
  ui.job({ status: 'RUNNING', progress: 40 });
  ui.transfer({ received: 1_000_000, total: null });
  ui.transfer({ received: 2_000_000, total: null });
  ui.stop();
  assert.equal(output.filter(line => line.includes('Downloading selected quality')).length, 1);
  assert.equal(output.filter(line => line.includes('Saving file')).length, 1);
  assert.doesNotMatch(output.join(''), /\x1b/);
});
