import { randomUUID } from 'node:crypto';
import { VERSION } from './version.js';

// Explicit opt-in only. Never send media URLs, filenames, hostnames or local paths.
export async function reportUsage(apiBase, fetchImpl = fetch) {
  if (!apiBase) return false;
  try {
    const base = new URL(apiBase);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) return false;
    if (base.username || base.password || base.search || base.hash) return false;
    const root = base.href.replace(/\/$/, '');
    const headers = { 'User-Agent': `save/${VERSION} (${process.platform}; ${process.arch}; Node/${process.versions.node})` };
    const session = await fetchImpl(`${root}/session`, { headers, signal: AbortSignal.timeout(3000), redirect: 'error' });
    if (!session.ok) return false;
    const { data } = await session.json();
    if (!data?.csrfToken || data.csrfHeaderName !== 'X-CSRF-TOKEN') return false;
    const cookies = typeof session.headers.getSetCookie === 'function'
      ? session.headers.getSetCookie() : [session.headers.get('set-cookie')].filter(Boolean);
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    if (!cookie) return false;
    const response = await fetchImpl(`${root}/tracking/page-views`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000),
      headers: { ...headers, Cookie: cookie, 'X-CSRF-TOKEN': data.csrfToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: randomUUID(), page: 'downloads', source: 'CLI' }),
    });
    return response.ok;
  } catch {
    return false; // Analytics must not prevent downloads, including offline runs.
  }
}
