import { Transform } from 'node:stream';

const clean = value => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
const bytes = value => `${(value / 1_000_000).toFixed(1)} MB`;

/** Honest phase activity: spinner for unknown totals, percentage bar for known work. */
export class TerminalProgress {
  constructor({ stream = process.stderr, now = Date.now } = {}) {
    this.stream = stream;
    this.now = now;
    this.frame = 0;
    this.timer = null;
    this.previous = '';
    this.active = false;
  }

  start(label) {
    this.stop();
    this.active = true;
    this.started = this.now();
    this.label = clean(label);
    this.percent = null;
    this.previous = '';
    this.render();
    if (this.stream.isTTY) {
      this.timer = setInterval(() => { this.frame++; this.render(); }, 100);
      this.timer.unref();
    }
  }

  update(label, percent = null) {
    this.label = clean(label);
    this.percent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null;
    this.render();
  }

  job(job) {
    const labels = { QUEUED: 'Waiting to start', RUNNING: 'Downloading selected quality', PROCESSING: 'Finishing audio/video', READY: 'File prepared' };
    // RUNNING at zero means extraction/startup, not a stalled 0% transfer.
    const label = job.status === 'RUNNING' && !job.progress ? 'Connecting to video source' : labels[job.status] || job.status;
    this.update(label, job.status === 'READY' ? 100 : job.progress > 0 && job.status !== 'PROCESSING' ? job.progress : null);
  }

  transfer({ received, total }) {
    const elapsed = Math.max((this.now() - this.started) / 1000, 0.1);
    const rate = received / elapsed;
    const eta = total > received && rate > 0 ? ` · ${Math.ceil((total - received) / rate)}s left` : '';
    this.update(`Saving file · ${bytes(received)}${total ? ` / ${bytes(total)}` : ''} · ${bytes(rate)}/s${eta}`,
      total ? received / total * 100 : null);
  }

  render() {
    if (!this.active) return;
    const elapsed = Math.max(0, Math.floor((this.now() - this.started) / 1000));
    if (!this.stream.isTTY) {
      // Pipes and logs get stable phase updates, not ANSI escapes or progress spam.
      const phase = this.label.split(' · ')[0];
      if (phase !== this.previous) { this.stream.write(`${phase}\n`); this.previous = phase; }
      return;
    }
    const width = Math.max(6, Math.min(20, (this.stream.columns || 80) - 45));
    const filled = this.percent === null ? 0 : Math.round(width * this.percent / 100);
    const indicator = this.percent === null ? ['◐', '◓', '◑', '◒'][this.frame % 4]
      : `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${Math.floor(this.percent)}%`;
    const text = `${indicator} ${this.label} · ${elapsed}s`;
    this.stream.write(`\r\x1b[2K${text.slice(0, Math.max(10, (this.stream.columns || 100) - 1))}`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.active && this.stream.isTTY) this.stream.write('\r\x1b[2K');
    this.active = false;
  }
}

export function transferMeter(total, onProgress) {
  let received = 0;
  return new Transform({ transform(chunk, encoding, callback) {
    try {
      received += chunk.length;
      onProgress({ received, total });
      callback(null, chunk);
    } catch (error) { callback(error); }
  } });
}
