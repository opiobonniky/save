import inquirer from 'inquirer';
import { formatChoiceLabel } from './formatUtils.js';

/**
 * Shows an interactive list of available formats and lets the
 * user pick one with arrow keys. Returns the chosen format_id.
 * Video-only formats are labeled — they'll be auto-merged with
 * the best audio track at download time (see download.js).
 */
export async function pickFormat(formats) {
  const choices = formats.map(f => ({
    name: formatChoiceLabel(f),
    value: f.format_id,
  }));

  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message: 'Choose a format to download:',
      choices,
      pageSize: 15,
    },
  ]);

  return selected;
}
