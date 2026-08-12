import inquirer from 'inquirer';
import { buildPickerChoices } from './formatUtils.js';

/**
 * Shows a small, friendly list of download options (one row per quality,
 * no cryptic format IDs) and lets the user pick one with arrow keys.
 * Returns a yt-dlp format id or selector; video-only formats are
 * auto-merged with the best audio track at download time (see download.js).
 */
export async function pickFormat(formats) {
  const choices = buildPickerChoices(formats);

  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message: 'Choose what to download:',
      choices,
      pageSize: 15,
    },
  ]);

  return selected;
}
