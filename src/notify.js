import { execFileSync, spawn } from 'child_process';
import { pathToFileURL } from 'url';

function commandExists(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runDetached(command, args) {
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function notifySendSupportsActions() {
  try {
    const help = execFileSync('notify-send', ['--help'], { encoding: 'utf8' });
    return help.includes('--action');
  } catch {
    return false;
  }
}

/**
 * Sends a desktop notification when a download finishes, so the user can
 * paste a link, tab away, and get pinged instead of watching the terminal.
 * Silently does nothing if no notification tool is available (headless
 * servers, minimal installs, unsupported platforms) — this is a nice-to-have,
 * never something that should break or delay the actual download. Where the
 * platform supports notification actions, clicking it opens `openPath`.
 */
export function notifyDone(title, body, openPath) {
  try {
    if (commandExists('notify-send')) {
      if (openPath && commandExists('xdg-open') && notifySendSupportsActions()) {
        // Wait for the click in a detached shell so the CLI can exit immediately.
        const actionScript =
          'action=$(notify-send --app-name=download-me --action="default=Open folder" "$1" "$2"); ' +
          '[ "$action" = default ] && xdg-open "$3" >/dev/null 2>&1';
        runDetached('sh', ['-c', actionScript, 'download-me-notify', title, body, openPath]);
      } else {
        runDetached('notify-send', ['--app-name=download-me', title, body]);
      }
    } else if (commandExists('terminal-notifier')) {
      const args = ['-title', title, '-message', body, '-group', 'download-me'];
      if (openPath) args.push('-open', pathToFileURL(openPath).href);
      runDetached('terminal-notifier', args);
    } else if (commandExists('osascript')) {
      const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`;
      runDetached('osascript', ['-e', script]);
    }
    // No supported notifier found — silently skip. The terminal output is
    // still the source of truth; this is purely a convenience layer on top.
  } catch {
    // Never let a notification failure affect the actual download result.
  }
}
