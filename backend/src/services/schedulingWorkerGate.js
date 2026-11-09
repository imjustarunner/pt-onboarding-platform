/** A preview or retired revision must not maintain the production calendars.
 * The untagged service version endpoint identifies the build serving live traffic.
 * Failure to verify ownership pauses maintenance; it never authorizes stale work.
 */
export function createSchedulingWorkerGate({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now, warn = console.warn, requireRevisionMatch = false } = {}) {
  let cached = null;
  let pending = null;
  return async function canRun() {
    if (!env.K_REVISION) return env.SCHEDULING_WORKERS_ENABLED === 'true';
    const build = String(env.APP_BUILD_ID || '').trim();
    const rawUrl = String(env.SCHEDULING_WORKER_AUTHORITY_URL || '').trim();
    let url;
    try { url = new URL(rawUrl); } catch { return false; }
    if (!build || url.protocol !== 'https:' || !url.hostname.endsWith('.run.app')
      || url.username || url.password || url.search || url.hash || url.pathname !== '/api/app-version') return false;
    const key = `${env.K_REVISION}:${build}:${rawUrl}`;
    if (cached?.key === key && cached.expiresAt > now()) return cached.allowed;
    if (pending?.key === key) return pending.promise;
    const promise = (async () => {
      let allowed = false;
      try {
        const response = await fetchImpl(url.href, { signal: AbortSignal.timeout(4000), redirect: 'error', cache: 'no-store' });
        if (!response.ok) throw Error('version_endpoint_unavailable');
        const version = await response.json();
        allowed = version.ready === true && String(version.buildId || '') === build
          && (!requireRevisionMatch || version.revision === env.K_REVISION);
      } catch {
        warn('[Scheduling workers] Live build verification unavailable; maintenance deferred');
      }
      cached = { key, allowed, expiresAt: now() + (allowed ? 30000 : 10000) };
      return allowed;
    })();
    pending = { key, promise };
    try { return await promise; } finally { if (pending?.promise === promise) pending = null; }
  };
}

export const canRunSchedulingMaintenance = createSchedulingWorkerGate();
export const canRunMeetingPhoneMaintenance = createSchedulingWorkerGate({requireRevisionMatch:true});
