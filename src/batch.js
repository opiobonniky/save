export function parseBatchLines(fileContent) {
  return fileContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

export async function runWorkerPool(items, jobs, worker) {
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, () => runWorker()));
}
