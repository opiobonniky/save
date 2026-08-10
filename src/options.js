export const QUALITY_SELECTORS = {
  best: 'bestvideo+bestaudio/best',
  '2160p': 'bestvideo[height<=2160]+bestaudio/best[height<=2160]',
  '1440p': 'bestvideo[height<=1440]+bestaudio/best[height<=1440]',
  '1080p': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
  '720p': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
  '480p': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
  '360p': 'bestvideo[height<=360]+bestaudio/best[height<=360]',
};

export function resolveQualitySelector(quality = '1080p') {
  const selector = QUALITY_SELECTORS[quality];
  if (!selector) {
    throw new Error(`Unknown quality "${quality}". Choose: ${Object.keys(QUALITY_SELECTORS).join(', ')}`);
  }
  return selector;
}

export function parseCount(value, name, { min = 1, max = 16 } = {}) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < min || count > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return count;
}

export function isLikelyPlaylistUrl(value) {
  try {
    const url = new URL(value);
    if (url.searchParams.has('list') || url.searchParams.has('playlist')) return true;
    return /\/(?:playlist|sets|albums?|collections?|channels?|users?|shows?)(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}
