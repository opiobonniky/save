import Conf from 'conf';

/**
 * Persistent user config for defaults (preferred output dir, default format,
 * default subtitle languages, etc). Stored in the OS's standard config
 * location for the current user (e.g. ~/.config/download-me on Linux).
 */
const config = new Conf({
  projectName: 'download-me',
  defaults: {
    outputDir: null,   // null = fall back to cwd/trailing-arg behavior
    subLangs: 'en',
    quality: '1080p',
    connections: 4,
  },
});

export function getConfig() {
  return config;
}
