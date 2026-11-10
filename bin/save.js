#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BackendClient } from '../src/backendClient.js';
import { chooseBackendFormat, backendFormatLabel, selectCompatibleFormats, buildBackendChoices } from '../src/backendFormats.js';
import { TerminalProgress } from '../src/terminalProgress.js';
import { getConfig } from '../src/config.js';
import { VERSION } from '../src/version.js';

const program = new Command();
const config = getConfig();
const apiUrl = options => options.backend || process.env.SAVE_BACKEND_URL || config.get('backendUrl');
const outputPath = value => path.resolve(value?.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value || config.get('outputDir') || path.join(os.homedir(), 'Downloads'));

program.name('save').version(VERSION)
  .option('-v', 'show the installed version', () => { console.log(VERSION); process.exit(0); })
  .description('Save YouTube videos and MP3s. Connects automatically; no extra tools needed.')
  .argument('[url]', 'single YouTube video URL')
  .argument('[outputDir]', 'destination (default: Downloads or saved config)')
  .option('-s, --backend <url>', 'backend API base URL, ending in /api/v1')
  .option('-f, --format <id>', 'exact format ID advertised by the backend')
  .option('-q, --quality <quality>', 'exact resolution, e.g. 1080p, or best')
  .option('-c, --choose', 'choose from backend formats interactively')
  .option('-a, --audio', 'ask the backend to produce MP3 from an audio-only format')
  .option('-l, --list-formats', 'inspect available formats without downloading')
  .option('-o, --overwrite', 'replace an existing destination file')
  .option('-b, --batch <file>', 'download video URLs from a text file, sequentially')
  .option('-r, --report-usage', 'opt in to recording a CLI visit with IP/client details')
  .action(async (url, directory, options) => {
    const activity = new TerminalProgress();
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      if (options.audio && options.quality) throw new Error('--audio cannot be combined with --quality.');
      const urls = options.batch
        ? (await readFile(options.batch, 'utf8')).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
        : [url];
      if (!urls.length || urls.some(value => !value)) throw new Error('Provide a video URL or --batch <file>.');
      const client = new BackendClient(apiUrl(options));
      activity.start('Connecting to Download Me');
      await client.connect(controller.signal);
      activity.stop();
      if (options.reportUsage) {
        await client.json('/tracking/page-views', { method: 'POST', body: { eventId: randomUUID(), page: 'downloads', source: 'CLI' }, signal: controller.signal }).catch(() => {});
      }
      for (const input of urls) {
        activity.start('Finding video qualities and sizes');
        const extraction = await client.inspect(input, { signal: controller.signal });
        activity.stop();
        console.log(extraction.title);
        const recommended = selectCompatibleFormats(extraction.formats);
        if (options.listFormats) {
          for (const format of recommended) console.log(`${backendFormatLabel(format)} · ID ${format.id}`);
          continue;
        }
        console.log('One recommended format per quality. ≈ is estimated; adding audio or MP3 conversion can change the final size.');
        let selection = { format: options.format, quality: options.quality || config.get('quality') || 'best', audio: Boolean(options.audio) };
        let outputKind = options.audio ? 'mp3' : 'original';
        if (!options.audio && !options.format && (options.choose || (!options.quality && !config.get('quality') && process.stdin.isTTY))) {
          if (!process.stdin.isTTY) throw new Error('--choose requires an interactive terminal. Use --quality or --format.');
          const { choice } = await inquirer.prompt([{ type: 'list', name: 'choice', message: 'Choose what to download:',
            choices: buildBackendChoices(extraction.formats), pageSize: 12 }]);
          selection = { format: choice.formatId, audio: choice.outputKind === 'mp3' };
          outputKind = choice.outputKind;
        }
        const format = chooseBackendFormat(extraction.formats, selection);
        console.log(`Selected: ${outputKind === 'mp3' ? 'MP3 · ' : ''}${backendFormatLabel(format)}`);
        activity.start('Preparing your download');
        const job = await client.prepare(extraction.id, format.id, outputKind, {
          signal: controller.signal,
          onProgress: job => activity.job(job),
        });
        activity.start('Saving file to your computer');
        const file = await client.saveArtifact(job, outputPath(options.batch ? directory || url : directory), {
          overwrite: options.overwrite, signal: controller.signal, onProgress: progress => activity.transfer(progress),
        });
        activity.stop();
        console.log(`Saved: ${file}`);
      }
    } catch (error) {
      activity.stop();
      console.error(controller.signal.aborted ? 'Download interrupted.' : `Error: ${error.message}`);
      process.exitCode = controller.signal.aborted ? 130 : 1;
    } finally {
      activity.stop();
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  });

program.command('doctor').description('check backend connectivity (no local tools needed)')
  .option('-s, --backend <url>', 'backend API base URL')
  .action(async options => {
    try {
      const client = new BackendClient(apiUrl(options));
      await client.connect();
      console.log(`Backend session ready: ${client.base}`);
      console.log('Media extraction, downloading and conversion run on the server.');
    } catch (error) { console.error(`Backend unavailable: ${error.message}`); process.exitCode = 1; }
  });

const settings = program.command('config').description('view or change saved client defaults');
settings.command('get').action(() => console.log(JSON.stringify(config.store, null, 2)));
settings.command('set <key> <value>').action((key, value) => {
  if (!['backendUrl', 'outputDir', 'quality'].includes(key)) throw new Error('Supported settings: backendUrl, outputDir, quality');
  if (key === 'outputDir') value = outputPath(value);
  config.set(key, value);
  console.log(`Set ${key} = ${value}`);
});
settings.command('reset').action(() => { config.clear(); console.log('Config reset.'); });

program.parseAsync().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
