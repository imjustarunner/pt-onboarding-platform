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
  if (['SCRIPT', 'LINK'].includes(target?.tagName) && appAsset(target.src || target.href, origin)) return true;
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
  (doc.body || doc.documentElement).append(notice);
}

/** One automatic recovery per loaded build, including when storage is disabled. */
export function createChunkLoadRecovery({ win = window, buildId, onFailure = recoveryNotice } = {}) {
  const release = String(buildId || import.meta.url);
  let navigating = false;
  let failedTarget = null;
  const targetUrl = path => {
    try {
      const url = new URL(path || win.location.href, win.location.origin);
      if (url.origin === win.location.origin) return url.href;
    } catch { /* stay on this app */ }
    return win.location.href;
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
      win.location.assign(failedTarget);
    } else {
      onFailure(win, () => win.location.assign(failedTarget));
    }
    return true;
  }
  return { recover };
}

export function installChunkLoadRecovery({ win = window, recovery, destination = () => null }) {
  const preload = event => {
    // Vite supplies the actual import/CSS error in payload, not message.
    const path = destination();
    if (recovery.recover(event.payload, path, { preload: true, automatic: !!path })) event.preventDefault();
  };
  // A modal import can fail while a form contains unsaved work. Only route
  // transitions recover automatically; in-place failures offer a reload action.
  const resource = event => {
    const path = destination();
    recovery.recover(event.error || event, path, { automatic: !!path });
  };
  const rejection = event => {
    const path = destination();
    recovery.recover(event.reason || event, path, { automatic: !!path });
  };
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
