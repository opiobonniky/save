import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, link, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { VERSION } from './version.js';
import { transferMeter } from './terminalProgress.js';

export function backendUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Backend must be an HTTP(S) API URL without credentials, query or fragment.');
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Use HTTPS for a remote backend (HTTP is allowed only on localhost).');
  }
  return url.href.replace(/\/$/, '');
}

export function artifactFilename(disposition) {
  let filename;
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try { filename = decodeURIComponent(encoded[1]); } catch { /* fall back below */ }
  }
  filename ||= disposition?.match(/filename="([^"]+)"/i)?.[1];
  // Never let server-provided names escape the output directory (including Windows paths).
  filename = filename?.split(/[\\/]/).pop()?.replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/[. ]+$/, '');
  if (!filename || filename === '.' || filename === '..' || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(filename)) filename = 'download.bin';
  return filename;
}

export class BackendClient {
  constructor(baseUrl, { pollMs = 500, timeoutMs = 15 * 60_000 } = {}) {
    this.base = backendUrl(baseUrl);
    this.pollMs = pollMs;
    this.timeoutMs = timeoutMs;
    this.cookies = new Map();
  }

  async response(route, { method = 'GET', body, signal } = {}) {
    // Routes are constructed locally, never follow redirects or server-provided URLs.
    const url = new URL(`${this.base}${route}`);
    const headers = {
      Accept: 'application/json',
      'User-Agent': `save/${VERSION} (${process.platform}; ${process.arch})`,
      Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && this.csrf) headers['X-CSRF-TOKEN'] = this.csrf;
    const transport = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const request = transport.request(url, { method, headers, signal }, response => {
        for (const cookie of response.headers['set-cookie'] || []) {
          const pair = cookie.split(';')[0];
          const index = pair.indexOf('=');
          if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
        }
        resolve(response);
      });
      request.setTimeout(30_000, () => request.destroy(new Error('Backend request timed out.')));
      request.on('error', reject);
      request.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }

  async json(route, options) {
    const response = await this.response(route, options);
    let bytes = 0;
    const chunks = [];
    for await (const chunk of response) {
      bytes += chunk.length;
      if (bytes > 2_000_000) { response.destroy(); throw new Error('Backend response is too large.'); }
      chunks.push(chunk);
    }
    let envelope;
    try { envelope = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new Error(`Invalid backend response (HTTP ${response.statusCode}).`); }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(typeof envelope.message === 'string' ? envelope.message : `Backend request failed (HTTP ${response.statusCode}).`);
    }
    if (!Number.isInteger(envelope.code)) throw new Error('Invalid backend response envelope.');
    return envelope.data;
  }

  async connect(signal) {
    const session = await this.json('/session', { signal });
    if (!session?.csrfToken || session.csrfHeaderName !== 'X-CSRF-TOKEN') throw new Error('Invalid backend session.');
    this.csrf = session.csrfToken;
  }

  async poll(initial, route, { signal, onProgress = () => {} } = {}) {
    const deadline = Date.now() + this.timeoutMs;
    let job = initial;
    while (true) {
      signal?.throwIfAborted();
      if (!job?.id || !['QUEUED', 'RUNNING', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED'].includes(job.status)) throw new Error('Invalid backend job.');
      onProgress(job);
      if (job.status === 'READY') return job;
      if (['FAILED', 'CANCELLED'].includes(job.status)) throw new Error(`Backend job ${job.status.toLowerCase()}${job.errorCode ? ` (${job.errorCode})` : ''}. No lower quality was substituted.`);
      if (Date.now() >= deadline) throw new Error('Timed out waiting for the backend job.');
      await delay(this.pollMs, undefined, { signal });
      job = await this.json(`${route}/${encodeURIComponent(job.id)}`, { signal });
    }
  }

  async inspect(url, options = {}) {
    const job = await this.json('/extractions', { method: 'POST', body: { url }, signal: options.signal });
    return this.poll(job, '/extractions', options);
  }

  async prepare(extractionId, formatId, outputKind, options = {}) {
    const body = { extractionId, formatId, outputKind, requestKey: randomUUID(), source: 'CLI' };
    const job = await this.json('/downloads', { method: 'POST', body, signal: options.signal });
    this.activeJob = job.id;
    try {
      return await this.poll(job, '/downloads', options);
    } catch (error) {
      // Cancel an outstanding server download on interruption or polling timeout.
      // Use a fresh signal because the original may already be aborted.
      await this.cancel(job.id).catch(() => {});
      throw error;
    } finally {
      this.activeJob = null;
    }
  }

  cancel(id) {
    return this.json(`/downloads/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {}, signal: AbortSignal.timeout(5000) });
  }

  async saveArtifact(job, directory, { overwrite = false, signal, onProgress = () => {} } = {}) {
    const response = await this.response(`/downloads/${encodeURIComponent(job.id)}/artifact`, { signal });
    if (response.statusCode !== 200) { response.resume(); throw new Error(`Could not retrieve backend file (HTTP ${response.statusCode}).`); }
    const filename = artifactFilename(response.headers['content-disposition']);
    const destination = path.join(directory, filename);
    const temporary = path.join(directory, `.save-${randomUUID()}.part`);
    try {
      await mkdir(directory, { recursive: true });
      const total = Number(response.headers['content-length']) || null;
      await pipeline(response, transferMeter(total, onProgress), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), { signal });
      if (overwrite) await rename(temporary, destination);
      else await link(temporary, destination); // Atomic no-clobber; never replace existing user files.
      return destination;
    } catch (error) {
      response.destroy();
      if (error.code === 'EEXIST') throw new Error(`File already exists: ${destination}. Use --overwrite to replace it.`);
      throw error;
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
