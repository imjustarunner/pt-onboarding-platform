import { createApp, watchEffect } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';
import 'driver.js/dist/driver.css';

import { useAgencyStore } from './store/agency';
import { useAuthStore } from './store/auth';
import { useBrandingStore } from './store/branding';
import { applyStoredDarkMode } from './utils/darkMode';

const CHUNK_RELOAD_KEY = '__pt_chunk_reload__';

let pendingChunkReloadPath = null;

const isExtensionUrl = (value) => {
  const src = String(value || '').trim().toLowerCase();
  return src.startsWith('chrome-extension://') || src.startsWith('moz-extension://') || src.startsWith('safari-extension://');
};

const isAppAssetUrl = (value) => {
  const src = String(value || '').trim();
  if (!src) return false;
  if (src.startsWith('/')) return true;
  if (src.startsWith(window.location.origin)) return true;
  return false;
};

const isLikelyExtensionError = (err) => {
  const msg = String(err?.message || err || '').toLowerCase();
  const stack = String(err?.stack || '').toLowerCase();
  return (
    msg.includes('runtime.lasterror') ||
    msg.includes('message port closed') ||
    msg.includes('frame does not exist') ||
    msg.includes('back/forward cache') ||
    stack.includes('chrome-extension://') ||
    stack.includes('moz-extension://') ||
    stack.includes('safari-extension://')
  );
};

const isChunkLoadError = (err) => {
  if (isLikelyExtensionError(err)) return false;

  const msg = String(err?.message || err || '');
  // Standard dynamic import failures
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk')
  ) {
    return true;
  }
  // Network/resource chunk errors often surface differently across browsers.
  // Only treat as chunk-load related if they are app script assets.
  const target = err?.target || err?.srcElement;
  if (
    target?.tagName === 'SCRIPT' &&
    (target?.src || '').includes('.js') &&
    isAppAssetUrl(target?.src) &&
    !isExtensionUrl(target?.src)
  ) {
    return true;
  }
  return false;
};

const attemptChunkReload = (err, targetPath) => {
  if (!isChunkLoadError(err)) return;
  const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
  if (alreadyReloaded) return;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  // Full navigation to target URL fetches fresh index.html and lands on the right page
  const path = (targetPath || window.location.pathname + window.location.search + window.location.hash).trim() || '/';
  const url = path.startsWith('http') ? path : window.location.origin + (path.startsWith('/') ? path : '/' + path);
  window.location.href = url;
};

// Vite emits vite:preloadError when dynamic imports fail (e.g. chunk 404 after deploy).
// This is the recommended way to handle version skew between cached HTML and new chunks.
window.addEventListener('vite:preloadError', () => {
  attemptChunkReload({ message: 'vite:preloadError' }, pendingChunkReloadPath);
});

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);

  // Capture intended destination so chunk-reload can navigate there instead of staying on current page.
  router.beforeEach((to, from, next) => {
    pendingChunkReloadPath = to.fullPath;
    next();
  });

  // If a deploy happens while someone is using the app, lazy-loaded route chunks can 404.
  // Navigate to the intended URL so we get fresh index.html and land on the right page.
  router.onError((err) => {
    attemptChunkReload(err, pendingChunkReloadPath);
  });

  // Also catch chunk load failures (e.g. script 404). For resource load errors,
  // event.error can be null; event.target is the failing script/link element.
  window.addEventListener('error', (event) => {
    if (isExtensionUrl(event?.filename) || isExtensionUrl(event?.target?.src) || isLikelyExtensionError(event?.error || event)) {
      return;
    }
    const err = event?.error || event;
    if (!err && event?.target?.tagName === 'SCRIPT' && isAppAssetUrl(event?.target?.src) && !isExtensionUrl(event?.target?.src)) {
      attemptChunkReload({ target: event.target }, pendingChunkReloadPath);
    } else {
      attemptChunkReload(err, pendingChunkReloadPath);
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isLikelyExtensionError(event?.reason || event)) return;
    attemptChunkReload(event?.reason || event, pendingChunkReloadPath);
  });

  // Preload branding before first paint to prevent “wrong theme/logo flash”
  const brandingStore = useBrandingStore(pinia);
  const agencyStore = useAgencyStore(pinia);

  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isLogin = path === '/login';

  // Best-effort: initialize portal theme based on host (subdomain or custom domain).
  // Run in background; do NOT block app mount. Slow resolve/theme (e.g. 30s) caused white screen.
  // App renders with platform defaults; theme applies when ready.
  const portalThemeInit = brandingStore.initializePortalTheme();
  const PORTAL_THEME_TIMEOUT_MS = 6000;
  await Promise.race([
    portalThemeInit,
    new Promise((r) => setTimeout(r, PORTAL_THEME_TIMEOUT_MS))
  ]).catch(() => {});

  const isPlatformLogin = isLogin && !brandingStore.portalHostPortalUrl;

  if (isLogin) {
    // Always clear org selection on login screens to avoid stale state.
    agencyStore.setCurrentAgency(null);
  }
  if (isPlatformLogin) {
    // Ensure stale org theme/agency context doesn't affect the platform login.
    brandingStore.clearPortalTheme();
    brandingStore.clearPortalHostOverride();
  }

  // Always fetch platform branding early so /login renders correctly immediately.
  // On /login we force refresh to pick up latest logo/colors.
  await brandingStore.fetchPlatformBranding(isPlatformLogin);

  // Keep the browser tab title aligned with the active portal/client.
  // - For custom domains (app.<client-domain>) we resolve portalHostPortalUrl and fetch portal theme.
  // - For slug routes (/:organizationSlug/...) we can also infer the slug from the route.
  const setTitle = () => {
    try {
      const portalName = String(brandingStore.portalAgency?.name || '').trim();
      const platformName = String(brandingStore.platformBranding?.organization_name || '').trim();
      const slug =
        typeof router.currentRoute.value?.params?.organizationSlug === 'string'
          ? String(router.currentRoute.value.params.organizationSlug).trim()
          : '';

      const base =
        portalName ||
        platformName ||
        (slug ? slug.toUpperCase() : '') ||
        'Portal';

      // Avoid "X Portal Portal" if an org name already contains "Portal".
      const next = base.toLowerCase().includes('portal') ? base : `${base} Portal`;
      document.title = next;
    } catch {
      // ignore
    }
  };

  const setFavicon = (url) => {
    try {
      const href = String(url || '').trim();
      if (!href) return;

      const iconEl = document.querySelector('#app-favicon');
      const appleEl = document.querySelector('#app-apple-touch-icon');

      // Replace/seed standard favicon
      if (iconEl) {
        iconEl.setAttribute('href', href);
      } else {
        const link = document.createElement('link');
        link.id = 'app-favicon';
        link.rel = 'icon';
        link.href = href;
        document.head.appendChild(link);
      }

      // Best-effort: also set apple touch icon so iOS home-screen/bookmarks match.
      if (appleEl) {
        appleEl.setAttribute('href', href);
      } else {
        const link = document.createElement('link');
        link.id = 'app-apple-touch-icon';
        link.rel = 'apple-touch-icon';
        link.href = href;
        document.head.appendChild(link);
      }
    } catch {
      // ignore
    }
  };

  const setBrandingChrome = () => {
    setTitle();
    // Use the same logo the UI uses (already cache-busted by store).
    const logo = brandingStore.displayLogoUrl;
    if (logo) setFavicon(logo);
  };

  watchEffect(setBrandingChrome);
  const authStore = useAuthStore(pinia);

  // Re-apply dark mode from localStorage on every navigation (safety net – prevents reset)
  router.afterEach(() => {
    setTitle();
    applyStoredDarkMode(authStore.user?.id);
  });

  await router.isReady();

  // Apply dark mode from localStorage before first paint (user preference)
  const userId = authStore.user?.id;
  if (userId) {
    applyStoredDarkMode(userId);
  }

  // Register service worker for push notifications (best-effort)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }

  // Clear reload guard after a successful boot.
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  app.mount('#app');
}

bootstrap();

