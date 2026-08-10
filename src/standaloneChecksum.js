export function parseExpectedChecksum(checksumText, assetName, assetSpecific = false) {
  const matchingLine = checksumText
    .split(/\r?\n/)
    .find(entry => entry.trim().split(/\s+/).at(-1)?.replace(/^\*/, '') === assetName);
  const lineChecksum = matchingLine?.match(/[a-fA-F0-9]{64}/)?.[0];
  if (lineChecksum) return lineChecksum.toLowerCase();

  // Deno's Windows checksum files use separate "Hash:" and "Path:" lines.
  if (assetSpecific && checksumText.includes(assetName)) {
    return checksumText.match(/^Hash\s*:\s*([a-fA-F0-9]{64})\s*$/im)?.[1]?.toLowerCase() || null;
  }
  return null;
}
