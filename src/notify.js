import { execSync } from 'child_process';

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sends a desktop notification when a download finishes, so the user can
 * paste a link, tab away, and get pinged instead of watching the terminal.
 * Silently does nothing if no notification tool is available (headless
 * servers, minimal installs, unsupported platforms) — this is a nice-to-have,
 * never something that should break or delay the actual download.
 */
export function notifyDone(title, body) {
  try {
    if (commandExists('notify-send')) {
      // Linux (most desktop environments)
      execSync(`notify-send ${JSON.stringify(title)} ${JSON.stringify(body)}`, { stdio: 'ignore' });
    } else if (commandExists('osascript')) {
      // macOS
      const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`;
      execSync(`osascript -e ${JSON.stringify(script)}`, { stdio: 'ignore' });
    }
    // No supported notifier found — silently skip. The terminal output is
    // still the source of truth; this is purely a convenience layer on top.
  } catch {
    // Never let a notification failure affect the actual download result.
  }
}
