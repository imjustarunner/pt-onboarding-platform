/**
 * Preload a set of image URLs (best-effort).
 * Resolves when all have loaded/errored, or when timeout is reached.
 */
export async function preloadImages(urls, opts = {}) {
  const list = Array.from(new Set((urls || []).filter(Boolean).map(String)));
  if (list.length === 0) return { loaded: 0, errored: 0, total: 0 };

  const concurrency = Number.isFinite(opts.concurrency) ? Math.max(1, opts.concurrency) : 6;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? Math.max(0, opts.timeoutMs) : 8000;

  let loaded = 0;
  let errored = 0;

  const withTimeout = (p) => {
    if (!timeoutMs) return p;
    return Promise.race([
      p,
      new Promise((resolve) => {
        setTimeout(() => resolve('timeout'), timeoutMs);
      })
    ]);
  };

  const loadOne = (url) =>
    withTimeout(new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve('loaded');
      img.onerror = () => resolve('error');
      img.src = url;
    }));

  let idx = 0;
  const workers = new Array(Math.min(concurrency, list.length)).fill(null).map(async () => {
    while (idx < list.length) {
      const myIdx = idx++;
      const url = list[myIdx];
      const r = await loadOne(url);
      if (r === 'loaded') loaded += 1;
      else errored += 1; // includes 'error' and 'timeout'
    }
  });

  await Promise.all(workers);
  return { loaded, errored, total: list.length };
}

