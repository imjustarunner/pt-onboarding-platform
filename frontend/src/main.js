import { createApp, watchEffect } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';
import 'driver.js/dist/driver.css';

import { useAgencyStore } from './store/agency';
import { useBrandingStore } from './store/branding';

const CHUNK_RELOAD_KEY = '__pt_chunk_reload__';

const isChunkLoadError = (err) => {
  const msg = String(err?.message || err || '');
  // Standard dynamic import failures
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch') ||
    msg.includes('ERR_ABORTED') ||
    msg.includes('404') ||
    msg.includes('Failed to load resource')
  ) {
    return true;
  }
  // Network/resource errors often surface differently across browsers
  const target = err?.target || err?.srcElement;
  if (target?.tagName === 'SCRIPT' && (target?.src || '').includes('.js')) {
    return true;
  }
  return false;
};

const attemptChunkReload = (err) => {
  if (!isChunkLoadError(err)) return;
  const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
  if (alreadyReloaded) return;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  // Preserve current URL – reload will fetch fresh index.html with correct chunk refs
  window.location.reload();
};

// Vite emits vite:preloadError when dynamic imports fail (e.g. chunk 404 after deploy).
// This is the recommended way to handle version skew between cached HTML and new chunks.
window.addEventListener('vite:preloadError', () => {
  attemptChunkReload({ message: 'vite:preloadError' });
});

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);

  // If a deploy happens while someone is using the app, lazy-loaded route chunks can 404.
  // This reloads once to pick up the new index/assets, avoiding a broken editor experience.
  router.onError((err) => {
    attemptChunkReload(err);
  });

  // Also catch chunk load failures (e.g. script 404). For resource load errors,
  // event.error can be null; event.target is the failing script/link element.
  window.addEventListener('error', (event) => {
    const err = event?.error || event;
    if (!err && event?.target?.tagName === 'SCRIPT') {
      attemptChunkReload({ target: event.target });
    } else {
      attemptChunkReload(err);
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    attemptChunkReload(event?.reason || event);
  });

  // Preload branding before first paint to prevent “wrong theme/logo flash”
  const brandingStore = useBrandingStore(pinia);
  const agencyStore = useAgencyStore(pinia);

  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isLogin = path === '/login';

  // Best-effort: initialize portal theme based on host (subdomain or custom domain).
  // This enables branded /login on custom domains like app.agency2.com.
  await brandingStore.initializePortalTheme();

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
  router.afterEach(() => setTitle());

  await router.isReady();
  // Clear reload guard after a successful boot.
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  app.mount('#app');
}

bootstrap();

