import Conf from 'conf';

/**
 * Persistent client defaults (backend URL, output directory and quality).
 * Stored in the OS's standard config
 * location for the current user (e.g. ~/.config/save on Linux).
 */
// Release default: users never need to enter a server address. Keep localhost
// during development; replace this once the public service has a real domain.
export const DEFAULT_BACKEND_URL = 'http://localhost:8080/api/v1';

const config = new Conf({
  projectName: 'save',
  defaults: {
    backendUrl: DEFAULT_BACKEND_URL,
    outputDir: null,   // null = fall back to cwd/trailing-arg behavior
    quality: null,
  },
});

export function getConfig() {
  return config;
}
