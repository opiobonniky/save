import { spawnYtDlp } from './ytdlp.js';
import cliProgress from 'cli-progress';
import path from 'path';
import { notifyDone } from './notify.js';
import { parseProgressEvents } from './progress.js';
import { getYtDlpRuntimeOptions } from './runtime.js';
import { getFfmpegOptions } from './ffmpeg.js';
import { canRun } from './executables.js';

function createProgressBar(options, preset, disabled) {
  if (!disabled) return new cliProgress.SingleBar(options, preset);
  return {
    value: 0,
    payload: {},
    start(total, value, payload = {}) {
      this.value = value;
      this.payload = payload;
    },
    update(value, payload = {}) {
      if (typeof value === 'number') this.value = value;
      Object.assign(this.payload, payload);
    },
    stop() {},
  };
}

/**
 * Downloads the video at `url` using the given format id, saving it
 * into outputDir, with a live progress bar.
 *
 * Speed strategy:
 * Native concurrent-fragment downloading is the default because it starts
 * quickly and exposes better progress data. aria2c remains an explicit opt-in
 * for large direct files where additional connections are worth the startup.
 *
 * Reliability: retries transient failures automatically (network blips,
 * rate limits) instead of failing on the first hiccup. Partial downloads
 * resume automatically — this is yt-dlp's own default behavior via .part
 * files, surfaced here with a clear log line so it isn't silent.
 *
 * @param {string} url
 * @param {string} formatId       - a yt-dlp format id, or an expression like "137+bestaudio"
 * @param {string} outputDir
 * @param {object} opts
 * @param {boolean} opts.audio      - extract audio, convert to mp3 (requires ffmpeg)
 * @param {boolean} opts.overwrite  - force re-download even if the file already exists
 * @param {boolean} opts.subs       - download subtitles alongside the video
 * @param {string}  opts.subLangs   - subtitle language codes, e.g. "en,es" (default: "en")
 * @param {boolean} opts.aria2      - opt in to aria2c multi-connection downloading
 * @param {number} opts.connections - fragment/aria2 connection count
 * @param {boolean} opts.timing     - print phase timings after completion
 */
export async function downloadVideo(url, formatId, outputDir, opts = {}) {
  const startedAt = Date.now();
  let firstProgressAt = null;
  let processingStartedAt = null;
  const bar = createProgressBar(
    {
      format: 'Downloading |{bar}| {percentage}% | {speed} | {status}',
      hideCursor: true,
      fps: 10,
      synchronousUpdate: true,
      forceRedraw: true,
    },
    cliProgress.Presets.shades_classic,
    opts.noProgress
  );

  const preparationStartedAt = Date.now();
  const spinnerFrames = ['-', '\\', '|', '/'];
  let spinnerIndex = 0;
  let preparationPhase = 'Starting downloader';
  let progressStarted = false;

  bar.start(100, 0, { speed: 'waiting', status: `- ${preparationPhase} (0s)` });

  const preparationTimer = setInterval(() => {
    if (progressStarted) return;
    const elapsed = Math.floor((Date.now() - preparationStartedAt) / 1000);
    const spinner = spinnerFrames[spinnerIndex++ % spinnerFrames.length];
    bar.update(0, { speed: 'waiting', status: `${spinner} ${preparationPhase} (${elapsed}s)` });
  }, 200);

  const outputTemplate = path.join(outputDir, '%(title)s.%(ext)s');

  const ytdlOptions = {
    format: formatId,
    output: outputTemplate,
    newline: true,
    noWarnings: true,
    noCheckCertificates: true,
    mergeOutputFormat: 'mp4',
    retries: 10, // auto-retry transient network failures instead of failing immediately
    fragmentRetries: 10,
    progressDelta: 0.25,
    proxy: opts.proxy,
    ...getYtDlpRuntimeOptions(),
    ...getFfmpegOptions(),
  };

  if (opts.noPlaylist) ytdlOptions.noPlaylist = true;

  const usingAria2c = opts.aria2 && canRun('aria2c');
  const connections = opts.connections || 4;

  if (usingAria2c) {
    ytdlOptions.externalDownloader = 'aria2c';
    ytdlOptions.externalDownloaderArgs = `aria2c:-x${connections} -s${connections} -k4M`;
  } else {
    ytdlOptions.concurrentFragments = connections;
  }

  if (opts.audio) {
    ytdlOptions.extractAudio = true;
    ytdlOptions.audioFormat = 'mp3';
  }

  if (opts.overwrite) {
    ytdlOptions.forceOverwrites = true;
  }

  if (opts.subs) {
    ytdlOptions.writeSubs = true;
    ytdlOptions.writeAutoSubs = true; // fall back to auto-generated subs if no manual ones exist
    ytdlOptions.subLangs = opts.subLangs || 'en';
    ytdlOptions.convertSubs = 'srt';
  }

  const { subprocess, completion } = spawnYtDlp(url, ytdlOptions);

  let stderrBuffer = '';
  let sawAlreadyDownloaded = false;
  let sawResuming = false;

  const updatePhase = (line) => {
    if (/Downloading \d+ format/i.test(line)) preparationPhase = 'Preparing media';
    if (/Destination:/i.test(line)) preparationPhase = 'Opening output file';
    if (/temporary cookies file/i.test(line)) preparationPhase = 'Starting aria2c';
    if (/\[(?:Merger|ExtractAudio)\]/i.test(line)) {
      progressStarted = true;
      processingStartedAt ||= Date.now();
      bar.update(bar.value, { status: 'Processing final file' });
    }
  };

  const updateProgress = (data) => {
    const events = parseProgressEvents(data.toString());
    for (const event of events) {
      progressStarted = true;
      firstProgressAt ||= Date.now();
      bar.update(event.percentage, {
        speed: event.speed || bar.payload.speed || 'calculating...',
        status: 'Transferring',
      });
    }
    return events.length;
  };

  subprocess.stdout.on('data', (data) => {
    const line = data.toString();
    updatePhase(line);

    if (/has already been downloaded/i.test(line)) {
      sawAlreadyDownloaded = true;
    }
    if (/\.part["']?$/im.test(line) || /Resuming download/i.test(line)) {
      sawResuming = true;
    }

    const progressEvents = updateProgress(data);

    const speedOnly = progressEvents === 0 && line.match(/at\s+([\d.]+\w+\/s)/);
    if (speedOnly) {
      bar.update(bar.value, { speed: `${speedOnly[1]} (size unknown)` });
    }
  });

  subprocess.stderr.on('data', (data) => {
    const line = data.toString();
    stderrBuffer = `${stderrBuffer}${line}`.slice(-65536);
    updatePhase(line);
    updateProgress(data);
  });

  try {
    await completion;
  } catch (err) {
    clearInterval(preparationTimer);
    bar.stop();
    const hint = /(?:timed? out|timeout)/i.test(stderrBuffer)
      ? '\n(The site connection timed out. Check your network, use a system-wide VPN, or pass --proxy <url> if the site is blocked.)'
      : /ffmpeg/i.test(stderrBuffer)
      ? '\n(ffmpeg processing failed. Run save doctor and reinstall the package if ffmpeg is missing.)'
      : usingAria2c
        ? '\n(aria2c was used for this download — try again without it if this persists.)'
        : '';
    const detail = stderrBuffer.trim() || err.message;
    throw new Error(`Download failed.\n${detail}${hint}`);
  }

  clearInterval(preparationTimer);
  bar.update(100, { status: 'Complete' });
  bar.stop();

  if (sawAlreadyDownloaded && !opts.overwrite) {
    console.log(
      `\nAlready downloaded previously — skipped. Use --overwrite to force a fresh download.`
    );
    return { skipped: true };
  }

  if (sawResuming) {
    console.log(`\nResumed a previously interrupted download.`);
  }

  console.log(`\nDone. Saved to: ${outputDir}${usingAria2c ? ' (accelerated via aria2c)' : ''}`);
  if (opts.timing) {
    const finishedAt = Date.now();
    const startupSeconds = ((firstProgressAt || finishedAt) - startedAt) / 1000;
    const transferEnd = processingStartedAt || finishedAt;
    const transferSeconds = firstProgressAt ? (transferEnd - firstProgressAt) / 1000 : 0;
    const processingSeconds = processingStartedAt ? (finishedAt - processingStartedAt) / 1000 : 0;
    const preflightSeconds = opts.preflightSeconds || 0;
    console.log(
      `Timing: preflight ${preflightSeconds.toFixed(2)}s, startup ${startupSeconds.toFixed(2)}s, ` +
        `transfer ${transferSeconds.toFixed(2)}s, processing ${processingSeconds.toFixed(2)}s, ` +
        `total ${(preflightSeconds + (finishedAt - startedAt) / 1000).toFixed(2)}s`
    );
  }
  notifyDone('Download complete', `Saved to ${outputDir}`, outputDir);
  return { skipped: false };
}

/**
 * Downloads an entire playlist by letting yt-dlp handle it natively —
 * far more robust than looping through entries manually in JS, since
 * yt-dlp already handles per-video failures, numbering, and resuming.
 *
 * @param {string} url
 * @param {string} outputDir
 * @param {object} opts
 * @param {boolean} opts.audio - download audio-only (mp3) for every video in the playlist
 * @param {boolean} opts.aria2 - opt in to aria2c multi-connection downloading
 */
export async function downloadPlaylist(url, outputDir, opts = {}) {
  const bar = createProgressBar(
    {
      format: 'Playlist |{bar}| {percentage}% | {status}',
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
    opts.noProgress
  );
  bar.start(100, 0, { status: 'starting...' });

  const outputTemplate = path.join(outputDir, '%(playlist_index)s - %(title)s.%(ext)s');

  const ytdlOptions = {
    output: outputTemplate,
    newline: true,
    noWarnings: true,
    noCheckCertificates: true,
    mergeOutputFormat: 'mp4',
    retries: 10,
    fragmentRetries: 10,
    yesPlaylist: true,
    proxy: opts.proxy,
    ignoreErrors: true, // one broken video in a playlist shouldn't abort the whole batch
    format: opts.audio ? 'bestaudio' : opts.format || 'bestvideo+bestaudio/best',
    concurrentFragments: opts.connections || 4,
    ...getYtDlpRuntimeOptions(),
    ...getFfmpegOptions(),
  };

  if (opts.playlistItems?.length) ytdlOptions.playlistItems = opts.playlistItems.join(',');
  if (opts.overwrite) ytdlOptions.forceOverwrites = true;
  if (opts.subs) {
    ytdlOptions.writeSubs = true;
    ytdlOptions.writeAutoSubs = true;
    ytdlOptions.subLangs = opts.subLangs || 'en';
    ytdlOptions.convertSubs = 'srt';
  }

  if (opts.aria2 && canRun('aria2c')) {
    const connections = opts.connections || 4;
    ytdlOptions.externalDownloader = 'aria2c';
    ytdlOptions.externalDownloaderArgs = `aria2c:-x${connections} -s${connections} -k4M`;
  }

  if (opts.audio) {
    ytdlOptions.extractAudio = true;
    ytdlOptions.audioFormat = 'mp3';
  }

  const { subprocess, completion } = spawnYtDlp(url, ytdlOptions);

  let stderrBuffer = '';
  let currentItem = 0;
  let totalItems = 0;

  subprocess.stdout.on('data', (data) => {
    const line = data.toString();

    const itemMatch = line.match(/\[download\] Downloading (?:video|item) (\d+) of (\d+)/i);
    if (itemMatch) {
      currentItem = parseInt(itemMatch[1], 10);
      totalItems = parseInt(itemMatch[2], 10);
      bar.update(Math.round((currentItem / totalItems) * 100), {
        status: `video ${currentItem}/${totalItems}`,
      });
    }
  });

  subprocess.stderr.on('data', (data) => {
    stderrBuffer = `${stderrBuffer}${data.toString()}`.slice(-65536);
  });

  try {
    await completion;
  } catch (err) {
    bar.stop();
    const detail = stderrBuffer.trim() || err.message;
    throw new Error(`Playlist download failed.\n${detail}`);
  }

  bar.update(100, { status: 'done' });
  bar.stop();
  console.log(`\nDone. Playlist saved to: ${outputDir}`);
  if (totalItems > 0) {
    console.log(`(${totalItems} video(s) processed — any that failed were skipped, not fatal.)`);
  }
  notifyDone('Playlist download complete', `Saved to ${outputDir}`, outputDir);
}
