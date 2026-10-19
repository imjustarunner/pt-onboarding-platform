import { describe, it, expect, vi } from 'vitest';
import { createAppReleaseMonitor, readyFrontendRelease } from '../appReleaseMonitor.js';
const fe = (id = 'b') => ({ schemaVersion: 1, buildId: id, requiredBackendBuildId: id });
const be = (id = 'b') => ({ buildId: id, ready: true });
function harness({ loaded = 'a', storage = new Map() } = {}) {
  let clock = 0;
  const state = { frontend: fe(), backend: be(), fail: false };
  const onChange = vi.fn();
  const fetchJson = vi.fn(async url => { if (state.fail) throw Error('network'); return url.startsWith('/api') ? state.backend : state.frontend; });
  const monitor = createAppReleaseMonitor({ loadedBuildId: loaded, fetchJson, onChange, now: () => clock, storage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) } });
  return { monitor, state, onChange, fetchJson, storage, advance: () => { clock += 15000; }, visible: () => onChange.mock.lastCall?.[0] };
}
describe('release readiness', () => {
  it('does not reload the current bundle or for a backend-only deployment', () => {
    expect(readyFrontendRelease('b', fe(), be())).toBeNull();
    expect(readyFrontendRelease('b', fe(), be('c'))).toBeNull();
  });
  it('requires complete, matching metadata and a ready backend', () => {
    for (const backend of [null, {}, { buildId: 'b' }, be('a')]) expect(readyFrontendRelease('a', fe(), backend)).toBeNull();
    expect(readyFrontendRelease('dev', fe(), be())).toBeNull();
    expect(readyFrontendRelease('a', { buildId: 'b' }, be())).toBeNull();
    expect(readyFrontendRelease('a', { ...fe(), requiredBackendBuildId: null }, be())).toBeNull();
    expect(readyFrontendRelease('a', fe(), be())).toBe('b');
  });
  it('waits for two stable observations and withdraws the banner during a rollout', async () => {
    const h = harness(); await h.monitor.check(); expect(h.visible()).toBeNull();
    h.advance(); await h.monitor.check(); expect(h.visible()).toBe('b');
    h.state.backend = be('c'); await h.monitor.check(); expect(h.visible()).toBeNull();
    h.state.backend = be(); await h.monitor.check(); expect(h.visible()).toBeNull();
  });
  it('rechecks backend readiness when clicked', async () => {
    const h = harness(); await h.monitor.check(); h.advance(); await h.monitor.check();
    h.state.backend = be('a'); expect(await h.monitor.prepareReload()).toBe(false); expect(h.visible()).toBeNull();
  });
  it('does not loop if reloading returns the old cached bundle', async () => {
    const h = harness(); await h.monitor.check(); h.advance(); await h.monitor.check(); expect(await h.monitor.prepareReload()).toBe(true);
    const stale = harness({ storage: h.storage }); await stale.monitor.check(); stale.advance(); await stale.monitor.check(); expect(stale.visible()).toBeNull();
    stale.state.frontend = fe('c'); stale.state.backend = be('c'); await stale.monitor.check(); stale.advance(); await stale.monitor.check(); expect(stale.visible()).toBe('c');
    const fresh = harness({ loaded:'b', storage:h.storage }); await fresh.monitor.check(); fresh.advance(); await fresh.monitor.check(); expect(fresh.visible()).toBeNull();
  });
  it('dismisses a release while continuing to watch future releases', async () => {
    const h = harness(); await h.monitor.check(); h.advance(); await h.monitor.check(); h.monitor.dismiss(); await h.monitor.check(); expect(h.visible()).toBeNull();
    h.state.frontend = fe('c'); h.state.backend = be('c'); await h.monitor.check(); h.advance(); await h.monitor.check(); expect(h.visible()).toBe('c');
  });
  it('withdraws stale offers on network failure', async () => {
    const h = harness(); await h.monitor.check(); h.advance(); await h.monitor.check(); h.state.fail=true;
    expect(await h.monitor.prepareReload()).toBe(false); expect(h.visible()).toBeNull();
  });
  it('ignores late responses after logout and coalesces overlapping polls', async () => {
    let finish; const deferred = new Promise(r => { finish = r; }); const onChange=vi.fn();
    const fetchJson=vi.fn(url => deferred.then(() => url.startsWith('/api') ? be() : fe()));
    const m=createAppReleaseMonitor({ loadedBuildId:'a',fetchJson,onChange }); const one=m.check(); const two=m.check(); expect(fetchJson).toHaveBeenCalledTimes(2);
    m.dispose(); finish(); await Promise.all([one,two]); expect(onChange).toHaveBeenCalledTimes(1); expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
