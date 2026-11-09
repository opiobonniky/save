const SITE_NAMES = {
  youtube: 'YouTube',
  'music.youtube': 'YouTube Music',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  twitter: 'X (Twitter)',
  x: 'X (Twitter)',
  vimeo: 'Vimeo',
  twitch: 'Twitch',
  reddit: 'Reddit',
  soundcloud: 'SoundCloud',
  pinterest: 'Pinterest',
  bilibili: 'Bilibili',
  dailymotion: 'Dailymotion',
};

/** A friendly display name for a site id reported by yt-dlp, or "the server". */
export function prettySiteName(site) {
  if (!site) return 'the server';
  const base = String(site).split(':')[0];
  return SITE_NAMES[base] || base;
}

export function extractionStatus(event) {
  if (event.type !== 'attempt' || event.attempt !== 1) return null;
  return `Fetching video info from ${prettySiteName(event.site)}…`;
}

/**
 * A single-line, indeterminate progress bar for phases without a known total
 * (fetching metadata, retrying a stream). A shaded block sweeps back and forth
 * while the status label updates in place without exposing transient failures.
 *
 * Falls back to no output on non-TTY streams or when progress is disabled, so
 * callers can print a plain one-shot line instead.
 */
export class StatusBar {
  constructor({ stream = process.stderr, noProgress = false, width = 14 } = {}) {
    this.stream = stream;
    this.enabled = !noProgress && Boolean(stream.isTTY);
    this.width = Math.max(6, width);
    this.status = '';
    this.timer = null;
    this.frame = 0;
  }

  start(status) {
    this.status = status;
    if (!this.enabled) return;
    this.render();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.frame++;
      this.render();
    }, 90);
    this.timer.unref();
  }

  update(status) {
    this.status = status;
    if (this.enabled) this.render();
  }

  render() {
    const width = this.width;
    const span = 2 * (width - 1);
    let position = this.frame % span;
    if (position >= width) position = span - position;
    let bar = '';
    for (let i = 0; i < width; i++) {
      const distance = Math.abs(i - position);
      bar += distance === 0 ? '█' : distance === 1 ? '▓' : distance === 2 ? '▒' : '░';
    }
    this.stream.write(`\r\x1b[2K[${bar}] ${this.status}`);
  }

  clear() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.enabled) this.stream.write('\r\x1b[2K');
  }
}
