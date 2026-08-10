import { execFileSync } from 'child_process';

export function getCommandVersion(command, args = ['--version']) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function getYtDlpRuntimeOptions() {
  if (getCommandVersion('deno')) return {};

  const nodeVersion = getCommandVersion('node');
  const nodeMajor = Number(nodeVersion?.match(/v?(\d+)/)?.[1]);
  return nodeMajor >= 22 ? { jsRuntimes: 'node' } : {};
}

export function getRuntimeDiagnostics() {
  const deno = getCommandVersion('deno');
  const node = getCommandVersion('node');
  const nodeMajor = Number(node?.match(/v?(\d+)/)?.[1]);

  return {
    ytDlp: getCommandVersion('yt-dlp'),
    ffmpeg: getCommandVersion('ffmpeg', ['-version'])?.split('\n')[0] || null,
    aria2c: getCommandVersion('aria2c')?.split('\n')[0] || null,
    deno: deno?.split('\n')[0] || null,
    node,
    javascriptReady: Boolean(deno || nodeMajor >= 22),
  };
}
