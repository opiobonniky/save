import Conf from 'conf';

/**
 * Persistent user config for defaults (preferred output dir, default format,
 * default subtitle languages, etc). Stored in the OS's standard config
 * location for the current user (e.g. ~/.config/save on Linux).
 */
const config = new Conf({
  projectName: 'save',
  defaults: {
    outputDir: null,   // null = fall back to cwd/trailing-arg behavior
    subLangs: 'en',
    quality: null,
    connections: 4,
  },
});

export function getConfig() {
  return config;
}
