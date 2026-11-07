const RELOAD_KEY = '__pt_chunk_reload_v2__';
const NOTICE_ID = 'app-chunk-recovery-notice';

function extensionError(error) {
  return /(?:chrome|moz|safari)-extension:\/\/|runtime\.lasterror|message port closed|frame does not exist/i.test(
    `${error?.message || ''} ${error?.stack || ''} ${error?.filename || ''}`
  );
}

function appAsset(value, origin) {
  try {
    const url = new URL(value, origin);
    return url.origin === origin && /^\/assets\/.+\.(?:m?js|css)$/.test(url.pathname);
  } catch { return false; }
}

export function isChunkLoadError(error, origin) {
  if (!error || extensionError(error)) return false;
  const target = error.target || error.srcElement;
  // A modulepreload link is only a hint. Its failure does not establish that
  // import() failed; Safari can still load the module normally afterward.
  const requiredResource = target?.tagName === 'SCRIPT' ||
    (target?.tagName === 'LINK' && target.rel === 'stylesheet');
  if (requiredResource && appAsset(target.src || target.href, origin)) return true;
  const message = String(error.message || error);
  if (!/Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading (?:CSS )?chunk|Unable to preload CSS/i.test(message)) return false;
  const url = message.match(/https?:\/\/[^\s"']+/)?.[0];
  return !url || appAsset(url, origin);
}

function recoveryNotice(win, retry) {
  const doc = win.document;
  if (!doc || doc.getElementById(NOTICE_ID)) return;
  const notice = doc.createElement('section');
  notice.id = NOTICE_ID;
  notice.setAttribute('role', 'alert');
  notice.style.cssText = 'position:fixed;inset:12px 12px auto;z-index:2147483647;padding:16px;background:#fff7ed;color:#7c2d12;border:1px solid #fdba74;border-radius:8px;font:16px/1.4 system-ui;box-shadow:0 4px 20px #0002';
  const text = doc.createElement('p');
  text.textContent = 'This screen could not load its app files. Save any open work, then reload to try again.';
  text.style.margin = '0 0 8px';
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = 'Reload this screen';
  button.addEventListener('click', retry);
  notice.append(text, button);
  if (win.location.origin === 'https://app.itsco.health') {
    const alternate = doc.createElement('a');
    alternate.href = 'https://plottwisthq.com/itsco/login';
    alternate.textContent = 'Use alternate ITSCO sign-in';
    alternate.style.cssText = 'display:block;margin-top:12px;color:inherit;text-decoration:underline';
    notice.append(alternate);
  }
  (doc.body || doc.documentElement).append(notice);
}

/** At most one automatic recovery per build; manual recovery if storage is denied. */
export function createChunkLoadRecovery({ win = window, buildId, onFailure = recoveryNotice } = {}) {
  const release = String(buildId || import.meta.url);
  let navigating = false;
  let failedTarget = null;
  let retryNumber = 0;
  const targetUrl = path => {
    try {
      const url = new URL(path || win.location.href, win.location.origin);
      if (url.origin === win.location.origin) return url.href;
    } catch { /* stay on this app */ }
    return win.location.href;
  };
  const reload = () => {
    const url = new URL(failedTarget);
    // A different document URL bypasses stale browser/CDN HTML and also forces
    // a real navigation when the failed destination contains a fragment.
    url.searchParams.set('_app_reload', `${Date.now().toString(36)}-${++retryNumber}`);
    win.location.assign(url.href);
  };
  function recover(error, targetPath, { preload = false, automatic = true } = {}) {
    if (!preload && !isChunkLoadError(error, win.location.origin)) return false;
    if (extensionError(error)) return false;
    if (navigating) return true;
    failedTarget = targetUrl(targetPath);
    let canReload = false;
    try {
      // Do not clear this at mount: the missing module may only load afterward.
      canReload = automatic && win.sessionStorage.getItem(RELOAD_KEY) !== release;
      if (canReload) win.sessionStorage.setItem(RELOAD_KEY, release);
    } catch {
      // Without a persistent guard, automatic navigation could loop forever.
      canReload = false;
    }
    if (canReload) {
      navigating = true;
      reload();
    } else {
      onFailure(win, reload);
    }
    return true;
  }
  return { recover };
}

export function installChunkLoadRecovery({ win = window, recovery, destination = () => null }) {
  const recover = error => {
    const path = destination();
    // The route can finish before the async AppWorkspace shell loads. There is
    // no open form to lose while #app still contains only its placeholder.
    const app = win.document?.getElementById('app');
    const starting = !!app && app.childElementCount === 0;
    recovery.recover(error, path, { automatic: !!path || starting });
  };
  const preload = event => {
    // Vite supplies the actual import/CSS error in payload, not message.
    // Do not preventDefault: Vite then turns a rejected import into undefined,
    // hiding the failure from Vue Router and async component error handling.
    recover(event.payload);
  };
  // A modal import can fail while a form contains unsaved work. Only route
  // transitions recover automatically; in-place failures offer a reload action.
  const resource = event => recover(event.error || event);
  const rejection = event => recover(event.reason || event);
  win.addEventListener('vite:preloadError', preload);
  // Resource errors do not bubble.
  win.addEventListener('error', resource, true);
  win.addEventListener('unhandledrejection', rejection);
  return () => {
    win.removeEventListener('vite:preloadError', preload);
    win.removeEventListener('error', resource, true);
    win.removeEventListener('unhandledrejection', rejection);
  };
}
