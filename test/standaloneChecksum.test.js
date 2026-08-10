import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExpectedChecksum } from '../src/standaloneChecksum.js';

const checksum = '171efab55ac6b9881fd53ee4c20f8bf3bb1340ffc618483746909014db12216a';
const asset = 'deno-x86_64-pc-windows-msvc.zip';

test('parses standard checksum lines', () => {
  assert.equal(parseExpectedChecksum(`${checksum}  ${asset}\n`, asset), checksum);
});

test('parses Deno Windows checksum output for an asset-specific file', () => {
  const windowsChecksum = `\r\nAlgorithm : SHA256\r\nHash      : ${checksum.toUpperCase()}\r\nPath      : C:\\a\\deno\\${asset}\r\n`;
  assert.equal(parseExpectedChecksum(windowsChecksum, asset, true), checksum);
});

test('does not accept a detached hash without the expected asset path', () => {
  assert.equal(parseExpectedChecksum(`Hash: ${checksum}\nPath: other.zip\n`, asset, true), null);
});
