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

const program = new Command();

program
  .name('download-me')
  .description('Download videos from YouTube, TikTok, Facebook, and other platforms')
  .version('1.0.0')
  .argument('[url]', 'video or playlist URL')
  .argument('[outputDir]', 'directory to save the video (defaults to current directory)')
  .option('-f, --format <formatId>', 'skip picker, use specific format id')
  .option('--choose', 'show the interactive format picker (default: best quality, no prompt)')
  .option('--audio', 'download audio only, converted to mp3 (requires ffmpeg)')
  .option('--list-formats', 'just list available formats, do not download')
  .option('--overwrite', 'force re-download even if the file already exists')
  .option('--subs [langs]', 'download subtitles (default language: en; comma-separate for more)')
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
    cfg.set(key, key === 'outputDir' ? path.resolve(value.replace(/^~/, process.env.HOME || '~')) : value);
    console.log(chalk.green(`Set ${key} = ${cfg.get(key)}`));
  });

configCmd
  .command('reset')
  .description('clear all saved defaults')
  .action(() => {
    getConfig().clear();
    console.log(chalk.green('Config reset.'));
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
  checkDependencies({ requireFfmpeg: false });

  const outputDir = await resolveOutputDir(outputDirArg);
  ensureOutputDir(outputDir);

  console.log(chalk.blue('Fetching video info...'));
  const result = await extractFormats(url);
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

  const downloadOpts = {
    audio: !!options.audio,
    overwrite: !!options.overwrite,
    subs: !!options.subs,
    subLangs: typeof options.subs === 'string' ? options.subs : getConfig().get('subLangs'),
  };

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
      formatId = 'bestvideo+bestaudio/best';
      console.log(chalk.gray('Using best available quality (pass --choose to pick a format instead).'));
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
    await downloadPlaylist(url, outputDir, { audio: !!options.audio });
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
    await downloadPlaylist(url, outputDir, { audio: !!options.audio });
    return;
  }

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select videos to download:',
      choices: result.entries.map(e => ({ name: e.title, value: e.url })),
      pageSize: 15,
    },
  ]);

  if (selected.length === 0) {
    console.log(chalk.yellow('Nothing selected.'));
    return;
  }

  for (const entryUrl of selected) {
    console.log(chalk.cyan(`\n--- ${entryUrl} ---`));
    try {
      await run(entryUrl, outputDir, options);
    } catch (err) {
      console.error(chalk.red(`Skipped (error): ${err.message}`));
    }
  }
}

async function runBatch(batchFile, outputDirArg, options) {
  const resolvedBatchFile = path.resolve(batchFile);
  if (!fs.existsSync(resolvedBatchFile)) {
    throw new Error(`Batch file not found: ${resolvedBatchFile}`);
  }

  const lines = fs
    .readFileSync(resolvedBatchFile, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  if (lines.length === 0) {
    throw new Error('Batch file is empty (or only contains comments).');
  }

  console.log(chalk.cyan(`Batch mode: ${lines.length} URL(s) to process.`));

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < lines.length; i++) {
    const url = lines[i];
    console.log(chalk.cyan(`\n[${i + 1}/${lines.length}] ${url}`));
    try {
      // Batch mode always uses -f/--audio non-interactively if provided;
      // otherwise defaults to best combined quality to avoid blocking on prompts.
      const batchOptions = {
        ...options,
        format: options.format || 'bestvideo+bestaudio/best',
        batchMode: true,
      };
      await run(url, outputDirArg, batchOptions);
      succeeded++;
    } catch (err) {
      console.error(chalk.red(`Failed: ${err.message}`));
      failed++;
    }
  }

  console.log(chalk.bold(`\nBatch complete: ${succeeded} succeeded, ${failed} failed.`));
}

program.parse();
