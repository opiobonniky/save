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
  isLikelyPlaylistUrl,
  parseCount,
  resolveQualitySelector,
} from '../src/options.js';
import { getRuntimeDiagnostics } from '../src/runtime.js';
import { parseBatchLines, runWorkerPool } from '../src/batch.js';

const program = new Command();

program
  .name('download-me')
  .description('Download videos from YouTube, TikTok, Facebook, and other platforms')
  .version('1.0.0')
  .argument('[url]', 'video or playlist URL')
  .argument('[outputDir]', 'directory to save the video (defaults to current directory)')
  .option('-f, --format <formatId>', 'skip picker, use specific format id')
  .option('-q, --quality <preset>', 'quality preset: 360p, 480p, 720p, 1080p, 1440p, 2160p, best')
  .option('--choose', 'show the interactive format picker instead of using a quality preset')
  .option('--audio', 'download audio only, converted to mp3 (requires ffmpeg)')
  .option('--list-formats', 'just list available formats, do not download')
  .option('--overwrite', 'force re-download even if the file already exists')
  .option('--subs [langs]', 'download subtitles (default language: en; comma-separate for more)')
  .option('--aria2', 'use aria2c acceleration (more connections, but slower startup)')
  .option('-N, --connections <count>', 'fragment or aria2 connection count (1-16)')
  .option('-j, --jobs <count>', 'parallel batch downloads (1-4)', '1')
  .option('--timing', 'print startup, transfer, processing, and total times')
  .option('--playlist', 'force interactive playlist discovery')
  .option('--batch <file>', 'download every URL listed in a text file (one per line)')
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
  });

// --- config subcommand: download-me config <get|set|reset> ---
const configCmd = program.command('config').description('view or change saved defaults');

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
  .action(() => {
    const diagnostics = getRuntimeDiagnostics();
    console.log(`yt-dlp: ${diagnostics.ytDlp || 'missing'}`);
    console.log(`ffmpeg: ${diagnostics.ffmpeg || 'missing'}`);
    console.log(`aria2c: ${diagnostics.aria2c || 'not installed (optional)'}`);
    console.log(`Deno: ${diagnostics.deno || 'not installed'}`);
    console.log(`Node.js: ${diagnostics.node || 'missing'}`);
    if (diagnostics.javascriptReady) {
      console.log(chalk.green('YouTube JavaScript runtime: ready'));
    } else {
      console.log(chalk.yellow('YouTube JavaScript runtime: unavailable'));
      console.log('Install Deno 2.3+ (recommended) or use Node.js 22+.');
      process.exitCode = 1;
    }
  });

async function resolveOutputDir(outputDirArg) {
  if (outputDirArg) return path.resolve(outputDirArg);
  const cfg = getConfig();
  const saved = cfg.get('outputDir');
  if (saved) return saved;
  return process.cwd();
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
  const operationStartedAt = Date.now();
  checkDependencies({ requireFfmpeg: false });

  const outputDir = await resolveOutputDir(outputDirArg);
  ensureOutputDir(outputDir);

  const cfg = getConfig();
  const quality = options.quality || cfg.get('quality') || '1080p';
  const qualitySelector = resolveQualitySelector(quality);
  const connections = parseCount(options.connections || cfg.get('connections') || 4, 'connections');
  const downloadOpts = {
    audio: !!options.audio,
    overwrite: !!options.overwrite,
    subs: !!options.subs,
    subLangs: typeof options.subs === 'string' ? options.subs : cfg.get('subLangs'),
    aria2: !!options.aria2,
    connections,
    timing: !!options.timing,
    noProgress: !!options.noProgress,
  };

  const needsMetadata =
    options.choose || options.listFormats || options.format || options.playlist || isLikelyPlaylistUrl(url);

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

  console.log(chalk.blue('Fetching video info...'));
  const result = await extractFormats(url);
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
        `\n${'ID'.padEnd(10)}${'Ext'.padEnd(8)}${'Res'.padEnd(12)}${'Size'.padEnd(10)}${'Type'.padEnd(14)}Note`
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
    if (options.choose) {
      formatId = await pickFormat(formats);
    } else {
      // Zero-decision default: best available quality, no prompt at all.
      // This is what makes "paste a link, hit enter" actually work end to
      // end without a menu of format IDs blocking the common case.
      formatId = qualitySelector;
      console.log(chalk.gray(`Using ${quality} quality (pass --choose to pick a format instead).`));
    }
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
  if (options.batchMode) {
    console.log(chalk.gray('Batch mode: downloading entire playlist automatically.'));
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

program.parse();
