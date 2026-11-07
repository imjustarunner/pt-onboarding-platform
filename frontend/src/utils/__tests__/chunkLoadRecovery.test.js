import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChunkLoadRecovery, installChunkLoadRecovery, isChunkLoadError } from '../chunkLoadRecovery.js';

const origin = 'https://app.example.test';
const missing = new TypeError(`Failed to fetch dynamically imported module: ${origin}/assets/Notes-old.js`);
function browser(storage = new Map()) {
  return {
    location: { origin, href: `${origin}/dashboard?tab=overview`, assign: vi.fn() },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    document
  };
}
function expectFreshNavigation(win, path) {
  expect(win.location.assign).toHaveBeenCalledOnce();
  const url = new URL(win.location.assign.mock.calls[0][0]);
  expect(url.searchParams.get('_app_reload')).toBeTruthy();
  url.searchParams.delete('_app_reload');
  expect(url.href).toBe(new URL(path, origin).href);
}
afterEach(() => { document.body.replaceChildren(); });

describe('missing lazy module recovery', () => {
  it('recovers the intended route once and preserves its query/hash', () => {
    const win = browser();
    const recovery = createChunkLoadRecovery({ win, buildId: 'release-a' });
    expect(recovery.recover(missing, '/note-aid?noteId=71#review')).toBe(true);
    recovery.recover(missing, '/note-aid');
    expectFreshNavigation(win, '/note-aid?noteId=71#review');
  });

  it('does not loop when the same build boots successfully but its lazy module still fails', () => {
    const storage = new Map();
    createChunkLoadRecovery({ win: browser(storage), buildId: 'release-a' }).recover(missing);
    const win = browser(storage), onFailure = vi.fn();
    createChunkLoadRecovery({ win, buildId: 'release-a', onFailure }).recover(missing, '/note-aid');
    expect(win.location.assign).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledOnce();
    onFailure.mock.calls[0][1]();
    expectFreshNavigation(win, '/note-aid');
    const newer = browser(storage);
    createChunkLoadRecovery({ win: newer, buildId: 'release-b' }).recover(missing);
    expect(newer.location.assign).toHaveBeenCalledOnce();
  });

  it('shows a recovery action without looping if session storage is unavailable', () => {
    const win = browser(), onFailure = vi.fn();
    win.sessionStorage.getItem = () => { throw new Error('storage denied'); };
    createChunkLoadRecovery({ win, buildId: 'release-a', onFailure }).recover(missing);
    expect(win.location.assign).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it('handles the real Vite payload and captures non-bubbling resource errors', () => {
    const win = browser(), recovery = createChunkLoadRecovery({ win, buildId: 'release-a' });
    const dispose = installChunkLoadRecovery({ win, recovery, destination: () => '/note-aid' });
    const preload = win.addEventListener.mock.calls.find(([type]) => type === 'vite:preloadError')[1];
    const event = { payload: new Error('Unable to preload CSS for /assets/Notes-old.css'), preventDefault: vi.fn() };
    preload(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expectFreshNavigation(win, '/note-aid');
    expect(win.addEventListener).toHaveBeenCalledWith('error', expect.any(Function), true);
    dispose();
    expect(win.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function), true);
  });

  it('ignores API, external module, browser extension, and ordinary application errors', () => {
    const win = browser(), recovery = createChunkLoadRecovery({ win, buildId: 'release-a' });
    for (const error of [
      new TypeError('Failed to fetch'), new Error('Cannot read properties of undefined'),
      new Error('Failed to fetch dynamically imported module: https://external.test/assets/a.js'),
      { message: missing.message, stack: 'chrome-extension://tool/script.js' },
      { target: { tagName: 'SCRIPT', src: `${origin}.external.test/assets/a.js` } },
      { target: { tagName: 'IMG', src: `${origin}/assets/icon.png` } }
    ]) expect(recovery.recover(error)).toBe(false);
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it('offers manual recovery for an in-place lazy component without discarding open work', () => {
    const win = browser(), onFailure = vi.fn();
    const recovery = createChunkLoadRecovery({ win, buildId: 'release-a', onFailure });
    installChunkLoadRecovery({ win, recovery });
    const preload = win.addEventListener.mock.calls.find(([type]) => type === 'vite:preloadError')[1];
    preload({ payload: missing, preventDefault: vi.fn() });
    expect(win.location.assign).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it('recognizes Safari imports and same-origin module/CSS resource failures', () => {
    for (const error of [
      new TypeError('Importing a module script failed.'),
      { target: { tagName: 'SCRIPT', src: `${origin}/assets/Notes-old.js` } },
      { target: { tagName: 'LINK', rel: 'stylesheet', href: `${origin}/assets/Notes-old.css` } }
    ]) expect(isChunkLoadError(error, origin)).toBe(true);
  });

  it('never follows a cross-origin intended destination', () => {
    const win = browser();
    createChunkLoadRecovery({ win, buildId: 'release-a' }).recover(missing, '//external.test/note-aid');
    expectFreshNavigation(win, win.location.href);
  });

  it('renders one accessible retry notice after a persistent failure', () => {
    const win = browser();
    win.sessionStorage.getItem = () => 'release-a';
    const recovery = createChunkLoadRecovery({ win, buildId: 'release-a' });
    recovery.recover(missing, '/note-aid');
    recovery.recover(missing, '/note-aid');
    const notices = document.querySelectorAll('#app-chunk-recovery-notice');
    expect(notices).toHaveLength(1);
    expect(notices[0].getAttribute('role')).toBe('alert');
    notices[0].querySelector('button').click();
    expectFreshNavigation(win, '/note-aid');
    notices[0].remove();
  });

  it('recovers the initial async workspace even after the router finished', () => {
    document.body.innerHTML = '<div id="app"><!----></div>';
    const win = browser(), onFailure = vi.fn();
    installChunkLoadRecovery({ win, recovery: createChunkLoadRecovery({ win, buildId: 'a', onFailure }) });
    const preload = win.addEventListener.mock.calls.find(([type]) => type === 'vite:preloadError')[1];
    const event = { payload: missing, preventDefault: vi.fn() };
    preload(event);
    expectFreshNavigation(win, win.location.href);
    expect(onFailure).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('keeps an already rendered form intact when a later import fails', () => {
    document.body.innerHTML = '<div id="app"><form><textarea>Unsaved note</textarea></form></div>';
    const win = browser(), onFailure = vi.fn();
    installChunkLoadRecovery({ win, recovery: createChunkLoadRecovery({ win, buildId: 'a', onFailure }) });
    const preload = win.addEventListener.mock.calls.find(([type]) => type === 'vite:preloadError')[1];
    preload({ payload: missing, preventDefault: vi.fn() });
    expect(win.location.assign).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledOnce();
    expect(document.querySelector('textarea').value).toBe('Unsaved note');
  });

  it('does not mistake speculative module hints for a failed screen', () => {
    document.body.innerHTML = '<div id="app"><!----></div>';
    const win = browser(), onFailure = vi.fn();
    installChunkLoadRecovery({ win, recovery: createChunkLoadRecovery({ win, buildId: 'a', onFailure }) });
    const resource = win.addEventListener.mock.calls.find(([type]) => type === 'error')[1];
    for (const rel of ['modulepreload', 'preload', 'prefetch']) {
      resource({ target: { tagName: 'LINK', rel, href: `${origin}/assets/Notes-old.js` } });
    }
    expect(win.location.assign).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('leaves unrelated import evaluation errors to the normal error handler', () => {
    const win = browser(), onFailure = vi.fn();
    installChunkLoadRecovery({ win, recovery: createChunkLoadRecovery({ win, buildId: 'a', onFailure }), destination: () => '/dashboard' });
    const preload = win.addEventListener.mock.calls.find(([type]) => type === 'vite:preloadError')[1];
    const event = { payload: new Error('Application validation failed'), preventDefault: vi.fn() };
    preload(event);
    expect(win.location.assign).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('manual retries force a new document even at the same URL and fragment', () => {
    const win = browser(), onFailure = vi.fn();
    win.location.href = `${origin}/dashboard?tab=overview#schedule`;
    const recovery = createChunkLoadRecovery({ win, buildId: 'a', onFailure });
    recovery.recover(missing, win.location.href, { automatic: false });
    const retry = onFailure.mock.calls[0][1];
    retry();
    expectFreshNavigation(win, win.location.href);
    retry();
    expect(win.location.assign.mock.calls[1][0]).not.toBe(win.location.assign.mock.calls[0][0]);
  });

  it('offers the verified ITSCO alternate without copying session parameters', () => {
    const win = browser();
    win.location.origin = 'https://app.itsco.health';
    win.location.href = 'https://app.itsco.health/dashboard?token=private#schedule';
    createChunkLoadRecovery({ win, buildId: 'a' }).recover(new TypeError('Importing a module script failed.'), null, { automatic: false });
    const alternate = document.querySelector('#app-chunk-recovery-notice a');
    expect(alternate.href).toBe('https://plottwisthq.com/itsco/login');
    expect(alternate.textContent).toBe('Use alternate ITSCO sign-in');
    expect(win.location.assign).not.toHaveBeenCalled();
  });
});
