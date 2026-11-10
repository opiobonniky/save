import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportUsage } from '../src/usage.js';

test('usage reporting is opt-in and rejects insecure remote destinations', async () => {
  let calls = 0;
  const request = async () => { calls++; };
  for (const url of [undefined, '', 'http://example.com/api/v1', 'https://user:secret@example.com']) {
    assert.equal(await reportUsage(url, request), false);
  }
  assert.equal(calls, 0);
});

test('reports one CLI visit using session cookie and CSRF, without download details', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, ...options });
    if (calls.length === 1) return {
      ok: true, headers: new Headers({ 'set-cookie': 'JSESSIONID=example; Path=/; HttpOnly' }),
      json: async () => ({ data: { csrfHeaderName: 'X-CSRF-TOKEN', csrfToken: 'token' } }),
    };
    return { ok: true };
  };
  assert.equal(await reportUsage('http://localhost:8080/api/v1/', request), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'http://localhost:8080/api/v1/tracking/page-views');
  assert.equal(calls[1].headers.Cookie, 'JSESSIONID=example');
  assert.equal(calls[1].headers['X-CSRF-TOKEN'], 'token');
  assert.match(calls[1].headers['User-Agent'], /^save\/.*Node\//);
  const body = JSON.parse(calls[1].body);
  assert.deepEqual(Object.keys(body).sort(), ['eventId', 'page', 'source']);
  assert.equal(body.source, 'CLI');
  assert.equal(body.page, 'downloads');
  assert.match(body.eventId, /^[0-9a-f-]{36}$/);
});

test('reporting failures never interrupt a download', async () => {
  assert.equal(await reportUsage('https://example.com/api/v1', async () => { throw new Error('Offline'); }), false);
  assert.equal(await reportUsage('https://example.com/api/v1', async () => ({ ok: false })), false);
});
