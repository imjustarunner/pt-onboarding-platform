const ATTEMPT_KEY = 'app-version-reload-attempt';
const knownBuild = id => typeof id === 'string' && !!id.trim() && !['dev', 'unknown'].includes(id.trim());

export function readyFrontendRelease(loadedBuildId, frontend, backend) {
  if (!knownBuild(loadedBuildId) || frontend?.schemaVersion !== 1 || backend?.ready !== true) return null;
  const target = frontend.buildId;
  const requiredBackend = frontend.requiredBackendBuildId;
  if (!knownBuild(target) || !knownBuild(requiredBackend) || target === loadedBuildId) return null;
  return backend.buildId === requiredBackend ? target : null;
}

export function createAppReleaseMonitor({ loadedBuildId, fetchJson, storage, onChange, now = Date.now, settleMs = 15000 }) {
  let candidate = null;
  let target = null;
  let dismissed = null;
  let disposed = false;
  let pending = null;
  const publish = value => { target = value; onChange(value); };
  const alreadyAttempted = value => {
    try {
      const attempt = JSON.parse(storage?.getItem(ATTEMPT_KEY) || 'null');
      return attempt?.from === loadedBuildId && attempt?.to === value;
    } catch { return false; }
  };
  async function read() {
    try {
      const [frontend, backend] = await Promise.all([
        fetchJson(`/version.json?t=${now()}`),
        fetchJson(`/api/app-version?t=${now()}`)
      ]);
      if (disposed) return null;
      const ready = readyFrontendRelease(loadedBuildId, frontend, backend);
      if (!ready || ready === dismissed || alreadyAttempted(ready)) {
        candidate = null;
        publish(null);
        return null;
      }
      // Confirm the same pair again after a settling interval. A rollout or
      // rollback must clear an already-visible banner, not freeze it on screen.
      const pair = `${ready}:${frontend.requiredBackendBuildId}`;
      if (candidate?.pair !== pair) candidate = { pair, since: now() };
      publish(now() - candidate.since >= settleMs ? ready : null);
      return target;
    } catch {
      if (!disposed) { candidate = null; publish(null); }
      return null;
    }
  }
  function check() {
    if (disposed) return Promise.resolve(null);
    if (!pending) pending = read().finally(() => { pending = null; });
    return pending;
  }
  return {
    check,
    dismiss() { dismissed = target; candidate = null; publish(null); },
    async prepareReload() {
      const offered = target;
      if (!offered || await check() !== offered || disposed) return false;
      // If a proxy/browser serves the old bundle again, do not repeatedly ask
      // this tab to reload for the very same release.
      try { storage?.setItem(ATTEMPT_KEY, JSON.stringify({ from: loadedBuildId, to: offered })); } catch { /* storage may be disabled */ }
      publish(null);
      return true;
    },
    dispose() { disposed = true; candidate = null; publish(null); }
  };
}
