import youtubedl from 'youtube-dl-exec';
import cliProgress from 'cli-progress';
import path from 'path';
import { execSync } from 'child_process';
import { notifyDone } from './notify.js';

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads the video at `url` using the given format id, saving it
 * into outputDir, with a live progress bar.
 *
 * Speed strategy:
 * 1. If `aria2c` is installed, hand the actual file transfer off to it —
 *    aria2c splits the download across multiple simultaneous connections.
 * 2. Otherwise, fall back to yt-dlp's own native concurrent-fragment
 *    downloading, which still parallelizes DASH/HLS streams.
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
 */
export async function downloadVideo(url, formatId, outputDir, opts = {}) {
  const bar = new cliProgress.SingleBar(
    {
      format: 'Downloading |{bar}| {percentage}% | {speed}',
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );

  bar.start(100, 0, { speed: '0 KB/s' });

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
  };

  const usingAria2c = commandExists('aria2c');

  if (usingAria2c) {
    ytdlOptions.externalDownloader = 'aria2c';
    ytdlOptions.externalDownloaderArgs = 'aria2c:-x16 -s16 -k1M -j16';
  } else {
    ytdlOptions.concurrentFragments = 8;
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

  const subprocess = youtubedl.exec(url, ytdlOptions);

  let stderrBuffer = '';
  let sawAlreadyDownloaded = false;
  let sawResuming = false;

  subprocess.stdout.on('data', (data) => {
    const line = data.toString();

    if (/has already been downloaded/i.test(line)) {
      sawAlreadyDownloaded = true;
    }
    if (/\.part["']?$/im.test(line) || /Resuming download/i.test(line)) {
      sawResuming = true;
    }

    const withPercent = line.match(/(\d+(?:\.\d+)?)% .*?at\s+([\d.]+\w+\/s)/);
    if (withPercent) {
      bar.update(parseFloat(withPercent[1]), { speed: withPercent[2] });
      return;
    }
    const speedOnly = line.match(/at\s+([\d.]+\w+\/s)/);
    if (speedOnly) {
      bar.update(bar.value, { speed: `${speedOnly[1]} (size unknown)` });
    }
  });

  subprocess.stderr.on('data', (data) => {
    stderrBuffer += data.toString();
  });

  try {
    await subprocess;
  } catch (err) {
    bar.stop();
    const hint = /ffmpeg/i.test(stderrBuffer)
      ? '\n(This likely requires ffmpeg to merge/convert the file — install it and try again.)'
      : usingAria2c
        ? '\n(aria2c was used for this download — try again without it if this persists.)'
        : '';
    const detail = stderrBuffer.trim() || err.message;
    throw new Error(`Download failed.\n${detail}${hint}`);
  }

  bar.update(100);
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
  notifyDone('Download complete', `Saved to ${outputDir}`);
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
 */
export async function downloadPlaylist(url, outputDir, opts = {}) {
  const bar = new cliProgress.SingleBar(
    {
      format: 'Playlist |{bar}| {percentage}% | {status}',
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
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
    ignoreErrors: true, // one broken video in a playlist shouldn't abort the whole batch
    format: opts.audio ? 'bestaudio' : 'bestvideo+bestaudio/best',
  };

  if (commandExists('aria2c')) {
    ytdlOptions.externalDownloader = 'aria2c';
    ytdlOptions.externalDownloaderArgs = 'aria2c:-x16 -s16 -k1M -j16';
  } else {
    ytdlOptions.concurrentFragments = 8;
  }

  if (opts.audio) {
    ytdlOptions.extractAudio = true;
    ytdlOptions.audioFormat = 'mp3';
  }

  const subprocess = youtubedl.exec(url, ytdlOptions);

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
    stderrBuffer += data.toString();
  });

  try {
    await subprocess;
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
  notifyDone('Playlist download complete', `Saved to ${outputDir}`);
}
