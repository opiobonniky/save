#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { extractFormats } from '../src/extract.js';
import { pickFormat } from '../src/prompt.js';
import { downloadVideo, downloadPlaylist } from '../src/download.js';
import { formatRow, isVideoOnly } from '../src/formatUtils.js';
import { checkDependencies } from '../src/checkDeps.js';
import { getConfig } from '../src/config.js';
import {
  detectBackgroundedRun,
  getDefaultDownloadsDir,
  isLikelyPlaylistUrl,
  looksShellTruncated,
  parseCount,
  parseProxy,
  resolveMediaUrl,
  resolveQualitySelector,
} from '../src/options.js';
import { getRuntimeDiagnostics } from '../src/runtime.js';
import { parseBatchLines, runWorkerPool } from '../src/batch.js';
import { VERSION } from '../src/version.js';
import { ensureManagedYtDlp } from '../src/managedYtDlp.js';
import { getYtDlpExecutablePath } from '../src/ytdlp.js';
import { ensureManagedFfmpeg } from '../src/managedFfmpeg.js';
import { getFfmpegExecutablePath } from '../src/ffmpeg.js';

const program = new Command();

program
  .name('save')
  .description('Fast, friendly video and audio downloads powered by yt-dlp')
  .usage('[options] <url> [outputDir]\n       save --batch <file> [outputDir]\n       save <command>')
  .version(VERSION)
  .showSuggestionAfterError()
  .showHelpAfterError()
  .configureHelp({ sortSubcommands: true })
  .argument('[url]', 'video, audio, or playlist URL (quote URLs containing & or ?)')
  .argument('[outputDir]', 'destination directory (your Downloads folder by default, or a saved default)')
  .option('-f, --format <id>', 'use an exact yt-dlp format ID; inspect IDs with --list-formats')
  .option('-q, --quality <preset>', 'quality: 360p, 480p, 720p, 1080p, 1440p, 2160p, or best')
  .option('--choose', 'open the interactive format picker (the default without a selection flag)')
  .option('--audio', 'save best available audio as MP3 (requires ffmpeg)')
  .option('--list-formats', 'display downloadable formats and exit')
  .option('--overwrite', 'replace an existing download instead of skipping it')
  .option('--subs [langs]', 'save SRT subtitles; languages are comma-separated (default: en)')
  .option('--aria2', 'opt in to aria2c for large direct files (slower startup)')
  .option('--proxy <url>', 'route site requests through an HTTP(S) or SOCKS proxy')
  .option('--user-agent <ua>', 'custom browser User-Agent (default: a current Chrome UA to pass bot checks)')
  .option('--cookies-from-browser <browser>', 'use cookies from your browser to pass login/bot/WAF checks (chrome, firefox, edge, brave, safari...)')
  .option('-N, --connections <count>', 'native fragment or aria2 connection count, 1-16 (default: 4)')
  .option('-j, --jobs <count>', 'simultaneous batch downloads, 1-4', '1')
  .option('--timing', 'print preflight, startup, transfer, processing, and total times')
  .option('--playlist', 'force playlist detection and interactive item selection')
  .option('--batch <file>', 'read URLs from a text file; blank lines and # comments are ignored')
  .action(async (url, outputDir, options) => {
    try {
      if (options.batch) {
        await runBatch(options.batch, outputDir, options);
      } else {
        if (!url) {
          console.error(chalk.red('Error: a URL is required (or use --batch <file>).'));
          process.exit(1);
        }
        await run(url, outputDir, options);
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  })
  .addHelpText('after', `
Defaults:
  Single videos prompt for a format and connections is 4. Skip the picker with:
    save <url> --quality 1080p
  Change saved defaults with:
    save config set quality 720p
    save config set connections 4
    save config set outputDir ~/Videos

Examples:
  save "https://youtu.be/VIDEO_ID"
  save "https://youtu.be/VIDEO_ID" ~/Videos --quality 720p
  save "https://youtu.be/VIDEO_ID" --choose
  save "https://youtu.be/VIDEO_ID" --audio
  save "https://youtu.be/VIDEO_ID" --subs en,fr
  save "https://youtube.com/playlist?list=LIST_ID"
  save --batch urls.txt ~/Videos --jobs 2
  save "https://example.com/large-video" --aria2 --connections 4
  save "https://example.com/video" --proxy "socks5://127.0.0.1:1080"
  save "https://youtu.be/VIDEO_ID" --timing

Useful commands:
  save doctor          Check yt-dlp, ffmpeg, aria2c, and JS runtime support
  save config get      Show saved defaults
  save config reset    Restore all defaults

Notes:
  Always quote URLs containing ? or &; otherwise the shell may split or background the command.
  --quality best may download very large 1440p or 4K files.
  Use --aria2 only when native downloading does not fill your connection.
  Respect site terms and content rights.`);

// --- config subcommand: save config <get|set|reset> ---
const configCmd = program
  .command('config')
  .description('view or change saved defaults')
  .addHelpText('after', `
Examples:
  save config get
  save config set outputDir ~/Videos
  save config set quality 720p
  save config set connections 4
  save config set subLangs en,fr
  save config reset

Known keys: outputDir, quality, connections, subLangs`);

configCmd
  .command('get')
  .description('show current saved defaults')
  .action(() => {
    const cfg = getConfig();
    console.log(JSON.stringify(cfg.store, null, 2));
  });

configCmd
  .command('set <key> <value>')
  .description('set a default, e.g. "config set outputDir ~/Videos"')
  .action((key, value) => {
    const cfg = getConfig();
    if (!(key in cfg.store)) {
      console.error(chalk.red(`Unknown config key "${key}". Known keys: ${Object.keys(cfg.store).join(', ')}`));
      process.exit(1);
    }
    if (key === 'quality') resolveQualitySelector(value);
    const storedValue = key === 'outputDir'
      ? path.resolve(value.replace(/^~/, process.env.HOME || '~'))
      : key === 'connections'
        ? parseCount(value, 'connections')
        : value;
    cfg.set(key, storedValue);
    console.log(chalk.green(`Set ${key} = ${cfg.get(key)}`));
  });

configCmd
  .command('reset')
  .description('clear all saved defaults')
  .action(() => {
    getConfig().clear();
    console.log(chalk.green('Config reset.'));
  });

program
  .command('doctor')
  .description('check downloader dependencies and YouTube runtime support')
  .action(async () => {
    if (!getYtDlpExecutablePath()) {
      try {
        await ensureManagedYtDlp();
      } catch (error) {
        console.error(chalk.red(`yt-dlp setup failed: ${error.message}`));
      }
    }
    if (!getFfmpegExecutablePath()) {
      try {
        await ensureManagedFfmpeg();
      } catch (error) {
        console.error(chalk.red(`ffmpeg setup failed: ${error.message}`));
      }
    }
    const diagnostics = getRuntimeDiagnostics();
    console.log(
      `yt-dlp: ${diagnostics.ytDlp || 'missing'}${diagnostics.ytDlpSource ? ` (${diagnostics.ytDlpSource})` : ''}`
    );
    console.log(
      `ffmpeg: ${diagnostics.ffmpeg || 'missing'}${diagnostics.ffmpegSource ? ` (${diagnostics.ffmpegSource})` : ''}`
    );
    console.log(`aria2c: ${diagnostics.aria2c || 'not installed (optional)'}`);
    console.log(
      `Deno: ${diagnostics.deno || 'not installed'}${diagnostics.denoSource ? ` (${diagnostics.denoSource})` : ''}`
    );
    console.log(`Node.js: ${diagnostics.node || 'missing'}`);
    if (diagnostics.javascriptReady) {
      console.log(chalk.green('YouTube JavaScript runtime: ready'));
    } else {
      console.log(chalk.yellow('YouTube JavaScript runtime: unavailable'));
      console.log('Install Deno 2.3+ (recommended) or use Node.js 22+.');
      process.exitCode = 1;
    }
  })
  .addHelpText('after', `
Checks:
  yt-dlp       Site extraction and media transfer
  ffmpeg       Video/audio merging, MP3, and subtitle conversion
  aria2c       Optional direct-file acceleration
  Deno/Node    YouTube JavaScript challenge support

Deno 2.3+ is the recommended YouTube JavaScript runtime.`);

async function resolveOutputDir(outputDirArg) {
  if (outputDirArg) return path.resolve(outputDirArg);
  const cfg = getConfig();
  const saved = cfg.get('outputDir');
  if (saved) return saved;
  return getDefaultDownloadsDir();
}

function ensureOutputDir(outputDir) {
  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(chalk.yellow(`Created directory: ${outputDir}`));
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new Error(
          `No permission to create "${outputDir}". Choose a different directory or check its permissions.`
        );
      }
      throw err;
    }
  }
}

async function run(url, outputDirArg, options) {
  const backgrounded = detectBackgroundedRun();
  if (backgrounded) {
    console.error(
      chalk.red.bold(
        '\nThis command was split by your shell: the URL is not quoted and contains "&",\n' +
          'so the terminal ran save in the background and cut the URL at the "&".\n' +
          'A backgrounded save cannot ask you to choose a format.\n'
      ) +
        chalk.yellow(
          `To run it in the foreground instead, quote the URL:\n  save "${url}"\n`
        ) +
        chalk.gray('Continuing this background run automatically with best available quality.\n')
    );
  }
  url = await resolveMediaUrl(url);
  if (!options.batchMode && looksShellTruncated(url)) {
    console.warn(
      chalk.yellow(
        'Note: this URL looks like it may have been cut off by an unquoted "&".\n' +
          'Tip: quote the whole URL, e.g.  save "https://example.com/watch?v=1&t=2"'
      )
    );
  }
  const operationStartedAt = Date.now();
  if (!getYtDlpExecutablePath()) await ensureManagedYtDlp();
  if (!getFfmpegExecutablePath()) await ensureManagedFfmpeg();
  checkDependencies({ requireFfmpeg: false });

  const outputDir = await resolveOutputDir(outputDirArg);
  ensureOutputDir(outputDir);

  const cfg = getConfig();
  const quality = options.quality || cfg.get('quality') || (options.batchMode ? '1080p' : null);
  const qualitySelector = quality ? resolveQualitySelector(quality) : null;
  const connections = parseCount(options.connections || cfg.get('connections') || 4, 'connections');
  const proxy = parseProxy(options.proxy);
  const userAgent = options.userAgent;
  const cookiesFromBrowser = options.cookiesFromBrowser;
  const downloadOpts = {
    audio: !!options.audio,
    overwrite: !!options.overwrite,
    subs: !!options.subs,
    subLangs: typeof options.subs === 'string' ? options.subs : cfg.get('subLangs'),
    aria2: !!options.aria2,
    connections,
    timing: !!options.timing,
    noProgress: !!options.noProgress,
    proxy,
    userAgent,
    cookiesFromBrowser,
  };

  const likelyPlaylist = isLikelyPlaylistUrl(url);
  const needsMetadata =
    options.choose ||
    options.listFormats ||
    options.format ||
    options.playlist ||
    likelyPlaylist ||
    (!options.audio && !quality);

  if (!needsMetadata) {
    checkDependencies({ requireFfmpeg: true });
    console.log(chalk.gray(options.audio ? 'Using best available audio.' : `Using ${quality} quality.`));
    console.log(chalk.gray(`Saving to: ${outputDir}`));
    await downloadVideo(url, options.audio ? 'bestaudio' : qualitySelector, outputDir, {
      ...downloadOpts,
      noPlaylist: true,
    });
    return;
  }

  console.log(chalk.blue('Fetching video information...'));
  const result = await extractFormats(url, { proxy, flatPlaylist: likelyPlaylist, userAgent, cookiesFromBrowser });
  downloadOpts.preflightSeconds = (Date.now() - operationStartedAt) / 1000;
  console.log(chalk.green(`Found: ${result.title}`));

  if (result.isPlaylist) {
    await handlePlaylist(url, result, outputDir, options);
    return;
  }

  const { formats } = result;

  if (options.listFormats) {
    console.log(
      chalk.bold(
        `\n${'ID'.padEnd(24)}${'Ext'.padEnd(8)}${'Quality'.padEnd(12)}${'Size'.padEnd(10)}${'Type'.padEnd(14)}Note`
      )
    );
    formats.forEach(f => console.log(formatRow(f)));
    return;
  }

  if (options.audio) {
    checkDependencies({ requireFfmpeg: true });
    console.log(chalk.gray(`Saving to: ${outputDir}`));
    await downloadVideo(url, 'bestaudio', outputDir, downloadOpts);
    return;
  }

  let formatId = options.format;
  if (!formatId) {
    if (options.choose || !quality) {
      if (process.stdin.isTTY) {
        formatId = await pickFormat(formats);
      } else {
        formatId = 'bestvideo+bestaudio/best';
        console.log(chalk.gray('Non-interactive terminal: using best available quality.'));
      }
    } else {
      formatId = qualitySelector;
      console.log(chalk.gray(`Using ${quality} quality.`));
    }
  }

  if (formatId === 'mp3') {
    checkDependencies({ requireFfmpeg: true });
    console.log(chalk.gray('Downloading best audio and converting to MP3...'));
    console.log(chalk.gray(`Saving to: ${outputDir}`));
    await downloadVideo(url, 'bestaudio', outputDir, { ...downloadOpts, audio: true });
    return;
  }

  const chosen = formats.find(f => f.format_id === formatId);
  const looksLikeMergeSelector = formatId.includes('+') || formatId.includes('/');

  if ((chosen && isVideoOnly(chosen)) || (!chosen && looksLikeMergeSelector)) {
    checkDependencies({ requireFfmpeg: true });
  }

  if (chosen && isVideoOnly(chosen)) {
    console.log(chalk.gray(`"${formatId}" has no audio track — merging with best audio (requires ffmpeg).`));
    formatId = `${formatId}+bestaudio`;
  }

  console.log(chalk.gray(`Saving to: ${outputDir}`));
  await downloadVideo(url, formatId, outputDir, downloadOpts);
}

async function handlePlaylist(url, result, outputDir, options) {
  console.log(chalk.cyan(`This is a playlist with ${result.entries.length} video(s).`));

  checkDependencies({ requireFfmpeg: true }); // playlist downloads merge video+audio by default

  // Batch/non-interactive mode: don't block on a prompt — just grab the whole playlist.
  if (options.batchMode || !process.stdin.isTTY) {
    if (options.batchMode) console.log(chalk.gray('Batch mode: downloading entire playlist automatically.'));
    else console.log(chalk.gray('Non-interactive terminal: downloading the entire playlist automatically.'));
    console.log(chalk.gray(`Saving to: ${outputDir}`));
    await downloadPlaylist(url, outputDir, getPlaylistOptions(options));
    return;
  }

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'What would you like to do?',
      choices: [
        { name: 'Download the entire playlist (best quality)', value: 'all' },
        { name: 'Choose specific videos', value: 'pick' },
      ],
    },
  ]);

  if (choice === 'all') {
    console.log(chalk.gray(`Saving to: ${outputDir}`));
    await downloadPlaylist(url, outputDir, getPlaylistOptions(options));
    return;
  }

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select videos to download:',
      choices: result.entries.map(e => ({ name: e.title, value: e.index })),
      pageSize: 15,
    },
  ]);

  if (selected.length === 0) {
    console.log(chalk.yellow('Nothing selected.'));
    return;
  }

  console.log(chalk.gray(`Saving ${selected.length} selected video(s) to: ${outputDir}`));
  await downloadPlaylist(url, outputDir, { ...getPlaylistOptions(options), playlistItems: selected });
}

function getPlaylistOptions(options) {
  const cfg = getConfig();
  const quality = options.quality || cfg.get('quality') || '1080p';
  return {
    audio: !!options.audio,
    aria2: !!options.aria2,
    format: resolveQualitySelector(quality),
    connections: parseCount(options.connections || cfg.get('connections') || 4, 'connections'),
    overwrite: !!options.overwrite,
    subs: !!options.subs,
    subLangs: typeof options.subs === 'string' ? options.subs : cfg.get('subLangs'),
    noProgress: !!options.noProgress,
    proxy: parseProxy(options.proxy),
    userAgent: options.userAgent,
    cookiesFromBrowser: options.cookiesFromBrowser,
  };
}

async function runBatch(batchFile, outputDirArg, options) {
  const resolvedBatchFile = path.resolve(batchFile);
  if (!fs.existsSync(resolvedBatchFile)) {
    throw new Error(`Batch file not found: ${resolvedBatchFile}`);
  }

  const lines = parseBatchLines(fs.readFileSync(resolvedBatchFile, 'utf-8'));

  if (lines.length === 0) {
    throw new Error('Batch file is empty (or only contains comments).');
  }

  const jobs = parseCount(options.jobs || 1, 'jobs', { max: 4 });
  console.log(chalk.cyan(`Batch mode: ${lines.length} URL(s), ${jobs} worker(s).`));

  let succeeded = 0;
  let failed = 0;

  await runWorkerPool(lines, jobs, async (url, i) => {
    console.log(chalk.cyan(`\n[${i + 1}/${lines.length}] ${url}`));
    try {
      await run(url, outputDirArg, {
        ...options,
        batchMode: true,
        noProgress: jobs > 1,
      });
      succeeded++;
    } catch (err) {
      console.error(chalk.red(`[${i + 1}/${lines.length}] Failed: ${err.message}`));
      failed++;
    }
  });

  console.log(chalk.bold(`\nBatch complete: ${succeeded} succeeded, ${failed} failed.`));
}

program.parseAsync();
