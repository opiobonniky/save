import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BackendClient, artifactFilename, backendUrl } from '../src/backendClient.js';
import { chooseBackendFormat } from '../src/backendFormats.js';

async function fixture(t, handler) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(error => { res.statusCode = 500; res.end(JSON.stringify({ message: error.message })); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return new BackendClient(`http://127.0.0.1:${server.address().port}/api/v1`, { pollMs: 1 });
}
function json(res, data, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: status, data })); }
async function body(req) { let value = ''; for await (const chunk of req) value += chunk; return JSON.parse(value); }
async function output(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'save-backend-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('complete backend workflow retains session/CSRF and streams Unicode attachment', async t => {
  let selection;
  const client = await fixture(t, async (req, res) => {
    if (req.url === '/api/v1/session') {
      res.setHeader('Set-Cookie', ['JSESSIONID=session; Path=/; HttpOnly']);
      return json(res, { csrfToken: 'csrf', csrfHeaderName: 'X-CSRF-TOKEN' });
    }
    assert.equal(req.headers.cookie, 'JSESSIONID=session');
    assert.match(req.headers['user-agent'], /^save\//);
    if (req.method === 'POST') assert.equal(req.headers['x-csrf-token'], 'csrf');
    if (req.url === '/api/v1/extractions' && req.method === 'POST') {
      assert.deepEqual(await body(req), { url: 'https://youtu.be/example' });
      return json(res, { id: 'extract', status: 'QUEUED' }, 202);
    }
    if (req.url === '/api/v1/extractions/extract') return json(res, { id: 'extract', status: 'READY', title: 'Video', formats: [{ id: '137' }] });
    if (req.url === '/api/v1/downloads' && req.method === 'POST') {
      selection = await body(req);
      return json(res, { id: 'job', status: 'QUEUED', progress: 0 }, 202);
    }
    if (req.url === '/api/v1/downloads/job') return json(res, { id: 'job', status: 'READY', progress: 100 });
    if (req.url === '/api/v1/downloads/job/artifact') {
      res.writeHead(200, { 'Content-Disposition': "attachment; filename*=UTF-8''Caf%C3%A9.mkv" });
      return res.end('verified media bytes');
    }
    res.writeHead(404); res.end();
  });
  await client.connect();
  const extraction = await client.inspect('https://youtu.be/example');
  const job = await client.prepare(extraction.id, '137', 'original');
  assert.equal(selection.source, 'CLI');
  assert.equal(selection.formatId, '137');
  assert.match(selection.requestKey, /^[0-9a-f-]{36}$/);
  const dir = await output(t);
  const file = await client.saveArtifact(job, dir);
  assert.equal(path.basename(file), 'Café.mkv');
  assert.equal(await readFile(file, 'utf8'), 'verified media bytes');
  assert.deepEqual(await readdir(dir), ['Café.mkv']);
});

test('existing files survive unless overwrite is explicitly requested', async t => {
  const client = await fixture(t, (req, res) => { res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"'); res.end('new'); });
  const dir = await output(t);
  await writeFile(path.join(dir, 'video.mp4'), 'old');
  await assert.rejects(client.saveArtifact({ id: 'job' }, dir), /already exists/);
  assert.equal(await readFile(path.join(dir, 'video.mp4'), 'utf8'), 'old');
  assert.deepEqual(await readdir(dir), ['video.mp4']);
  await client.saveArtifact({ id: 'job' }, dir, { overwrite: true });
  assert.equal(await readFile(path.join(dir, 'video.mp4'), 'utf8'), 'new');
});

test('interrupted transfer cleans partial files and never publishes a destination', async t => {
  const client = await fixture(t, (req, res) => {
    res.writeHead(200, { 'Content-Disposition': 'attachment; filename="video.mp4"', 'Content-Length': '1000' });
    res.write('partial');
    setImmediate(() => res.destroy());
  });
  const dir = await output(t);
  await assert.rejects(client.saveArtifact({ id: 'job' }, dir));
  assert.deepEqual(await readdir(dir), []);
});

test('backend errors surface readable messages, never fall back to local tools', async t => {
  const client = await fixture(t, (req, res) => { res.writeHead(429); res.end(JSON.stringify({ code: 429, message: 'Please wait.' })); });
  await assert.rejects(client.inspect('url'), /Please wait/);
});

test('polling timeout cancels the outstanding backend download', async t => {
  let cancelled = false;
  const client = await fixture(t, async (req, res) => {
    if (req.url.endsWith('/cancel')) { cancelled = true; return json(res, { id: 'job', status: 'CANCELLED' }); }
    json(res, { id: 'job', status: 'RUNNING' });
  });
  client.timeoutMs = 0;
  await assert.rejects(client.prepare('extraction', '137', 'original'), /Timed out/);
  assert.equal(cancelled, true);
});

test('safe filenames and remote HTTPS requirement', () => {
  assert.equal(artifactFilename('attachment; filename="../../danger.mp4"'), 'danger.mp4');
  assert.equal(artifactFilename('attachment; filename="C:\\secret\\video.mp4"'), 'video.mp4');
  assert.equal(artifactFilename('attachment; filename="CON"'), 'download.bin');
  assert.throws(() => backendUrl('http://remote.example/api/v1'), /HTTPS/);
  assert.throws(() => backendUrl('https://user:pass@remote.example'), /credentials/);
});

test('selection uses advertised exact IDs and refuses silent quality downgrade', () => {
  const formats = [
    { id: '160', height: 144, hasVideo: true, extension: 'mp4' },
    { id: '137', height: 1080, hasVideo: true, extension: 'mp4' },
    { id: '251', hasAudio: true, hasVideo: false, extension: 'webm' },
  ];
  assert.equal(chooseBackendFormat(formats).id, '137');
  assert.equal(chooseBackendFormat(formats, { audio: true }).id, '251');
  assert.throws(() => chooseBackendFormat(formats, { quality: '720p' }), /No lower quality/);
  assert.throws(() => chooseBackendFormat(formats, { format: '137+bestaudio' }), /not available/);
});

test('packaged executable completes an API download with no tools on PATH', { skip: !process.env.SAVE_TEST_EXECUTABLE }, async t => {
  const client = await fixture(t, async (req, res) => {
    if (req.url === '/api/v1/session') {
      res.setHeader('Set-Cookie', 'JSESSIONID=standalone; Path=/; HttpOnly');
      return json(res, { csrfToken: 'token', csrfHeaderName: 'X-CSRF-TOKEN' });
    }
    assert.equal(req.headers.cookie, 'JSESSIONID=standalone');
    if (req.method === 'POST') assert.equal(req.headers['x-csrf-token'], 'token');
    if (req.url === '/api/v1/extractions') return json(res, { id: 'extract', status: 'READY', title: 'Test', formats: [
      { id: '137', extension: 'mp4', height: 1080, hasVideo: true, hasAudio: false },
    ] }, 202);
    if (req.url === '/api/v1/downloads') {
      const selection = await body(req);
      assert.equal(selection.source, 'CLI');
      assert.equal(selection.formatId, '137');
      return json(res, { id: 'job', status: 'READY', progress: 100 }, 202);
    }
    if (req.url === '/api/v1/downloads/job/artifact') {
      res.setHeader('Content-Disposition', 'attachment; filename="test.mkv"');
      return res.end('server-prepared-media');
    }
    throw new Error(`Unexpected route ${req.url}`);
  });
  const dir = await output(t);
  const result = await promisify(execFile)(process.env.SAVE_TEST_EXECUTABLE,
    ['https://youtu.be/KK4dC7rASYs', dir, '--backend', client.base, '--quality', '1080p'],
    { env: { ...process.env, PATH: '', XDG_CONFIG_HOME: dir }, timeout: 15_000 });
  assert.match(result.stdout, /Saved:/);
  assert.equal(await readFile(path.join(dir, 'test.mkv'), 'utf8'), 'server-prepared-media');
});
