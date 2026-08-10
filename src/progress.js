/**
 * Extracts progress reports from yt-dlp and aria2c output. aria2c writes its
 * live status to stderr, while yt-dlp normally writes progress to stdout.
 */
export function parseProgressEvents(output) {
  const events = [];

  for (const match of output.matchAll(/\[download\]\s+(\d+(?:\.\d+)?)%[^\r\n]*/gi)) {
    const speed = match[0].match(/\bat\s+([\d.]+\s*(?:[KMGTPE]i?)?B\/s)/i)?.[1];
    events.push({
      index: match.index,
      percentage: Number(match[1]),
      speed: speed?.replace(/\s+/g, '') || null,
    });
  }

  for (const match of output.matchAll(/\((\d+(?:\.\d+)?)%\)[^\r\n\]]*?\bDL:([^\s\]]+)/gi)) {
    events.push({
      index: match.index,
      percentage: Number(match[1]),
      speed: `${match[2]}/s`,
    });
  }

  return events
    .sort((a, b) => a.index - b.index)
    .map(({ percentage, speed }) => ({ percentage, speed }));
}
