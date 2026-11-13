import { conversaEventBrowserBranding } from './constants/conversa.js';
import { vAddressAutocomplete } from './directives/addressAutocomplete.js';
import './styles/addressAutocomplete.css';
import { schoolCareBridgeBrowserBrand } from './composables/useSchoolCareBridgeBranding';
import { fundthredBrowserBrand } from './composables/useFundThredBranding';
import { PLATFORM_BRAND } from './config/platformBrand.js';
import { publicBrowserBranding, legacyTisiPublicDestination } from './utils/publicBrowserBranding.js';
import { createApp, watchEffect } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';
import './styles/data-surfaces.css';
import './styles/application-appearance.css';
import './styles/conversa.css';
import 'driver.js/dist/driver.css';

import { useAgencyStore } from './store/agency';
import { useAuthStore } from './store/auth';
import { useBrandingStore } from './store/branding';
import { applyStoredDarkMode } from './utils/darkMode';
import { isStandalonePwa } from './utils/pwa';
import { tenantFaviconUrl } from './utils/tenantBrandAssets';
import { i18n } from './i18n';
import { startStartupBranding } from './utils/startupBranding.js';
import { createChunkLoadRecovery, installChunkLoadRecovery } from './utils/chunkLoadRecovery.js';
import api from './services/api.js';
import { verifyStartupSession } from './utils/startupSession.js';
import { isDemoWindowSession } from './utils/demoWindowSession.js';
import { prepareMobileMainHandoff, completeMobileMainHandoff } from './utils/mobileMainHandoff.js';

/** Bump when shell assets change materially (forces one reload so users pick up new schedule UI). */
const APP_SHELL_VERSION = '2026-09-25-plot-twist-brand-settings';
let pendingChunkReloadPath = null;
const chunkRecovery = createChunkLoadRecovery({ buildId: import.meta.env.VITE_APP_BUILD_ID });
installChunkLoadRecovery({ recovery: chunkRecovery, destination: () => pendingChunkReloadPath });
// Register before app.use(router), which starts the initial lazy route import.
router.beforeEach((to) => { pendingChunkReloadPath = to.fullPath; });
router.afterEach((_to, _from, failure) => { if (!failure) pendingChunkReloadPath = null; });
router.onError((error, to) => { chunkRecovery.recover(error, to?.fullPath || pendingChunkReloadPath); });

async function bootstrap() {
  const priorShell = localStorage.getItem('appShellVersion');
  if (priorShell !== APP_SHELL_VERSION) {
    localStorage.setItem('appShellVersion', APP_SHELL_VERSION);
    if (sessionStorage.getItem('appShellReload') !== APP_SHELL_VERSION) {
      sessionStorage.setItem('appShellReload', APP_SHELL_VERSION);
      window.location.reload();
      return;
    }
  }
  const mobileMainHandoff = prepareMobileMainHandoff();
  if (isStandalonePwa()) {
    document.documentElement.classList.add('is-standalone-pwa');
    document.documentElement.setAttribute('data-display-mode', 'standalone');
  } else {
    document.documentElement.setAttribute('data-display-mode', 'browser');
  }

  const app = createApp(App);
  app.directive('address-autocomplete', vAddressAutocomplete);
  const pinia = createPinia();

  app.use(pinia);
  const authStore = useAuthStore(pinia);
  if (mobileMainHandoff) {
    try {
      await completeMobileMainHandoff({
        api, authStore, agencyStore: useAgencyStore(pinia), handoff: mobileMainHandoff,
        startActivityTracking: async options => (await import('./utils/activityTracker.js')).startActivityTracking(options)
      });
    } catch {
      // A marker cannot authorize cached identity. Normal sign-in, lock and MFA
      // recovery stay in force when the new cookie cannot be verified.
      authStore.clearAuth();
    }
  } else await verifyStartupSession({
    api, authStore,
    route: router.resolve(window.location.pathname + window.location.search + window.location.hash),
    demo: isDemoWindowSession()
  });
  app.use(router);
  app.use(i18n);

  // Preload branding before first paint to prevent “wrong theme/logo flash”
  const brandingStore = useBrandingStore(pinia);
  const agencyStore = useAgencyStore(pinia);

  startStartupBranding(brandingStore, agencyStore, window.location.pathname);

  // Keep the browser tab title aligned with the active portal/client.
  // - For custom domains (app.<client-domain>) we resolve portalHostPortalUrl and fetch portal theme.
  // - For slug routes (/:organizationSlug/...) we can also infer the slug from the route.
  const conversaBrowserBrand = () => conversaEventBrowserBranding(
    router.currentRoute.value?.matched?.length ? router.currentRoute.value.path : window.location.pathname
  );
  const setTitle = () => {
    try {
      const conversa = conversaBrowserBrand();
      if (conversa) { document.title = conversa.title; return; }
      if (fundthredBrowserBrand.value) { document.title = fundthredBrowserBrand.value.title; return; }
      if (schoolCareBridgeBrowserBrand.value) { document.title = schoolCareBridgeBrowserBrand.value.title; return; }
      const website = publicBrowserBranding(window.location.hostname, router.currentRoute.value?.path);
      const publicTitle = router.currentRoute.value?.meta?.publicMarketingTitle || website?.title;
      if (typeof publicTitle === 'string' && publicTitle.trim()) {
        document.title = publicTitle;
        return;
      }
      const portalName = String(brandingStore.portalAgency?.name || '').trim();
      const platformName = String(brandingStore.platformBranding?.organization_name || '').trim();
      const slug =
        typeof router.currentRoute.value?.params?.organizationSlug === 'string'
          ? String(router.currentRoute.value.params.organizationSlug).trim()
          : '';

      const platformSelected = agencyStore.platformMode && !agencyStore.currentAgency && !slug;
      const base =
        brandingStore.displayName || (platformSelected ? PLATFORM_BRAND.name : portalName) ||
        platformName ||
        (slug ? slug.toUpperCase() : '') ||
        'Portal';

      // Avoid "X Portal Portal" if an org name already contains "Portal".
      const next = base || 'Portal';
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
    const conversa = conversaBrowserBrand();
    if (conversa) { setFavicon(conversa.favicon); return; }
    // Prefer tenant printing-asset marks for browser tabs (e.g. NLU watermark).
    // Explicit route-slug tours (/:tenant/...) win over the hostname. Flat routes
    // on dedicated tenant hosts then fall back to the host portal/hostname.
    const tenantFav =
      publicBrowserBranding(window.location.hostname, router.currentRoute.value?.path)?.favicon ||
      tenantFaviconUrl(brandingStore.activeRouteSlug) ||
      tenantFaviconUrl(brandingStore.portalHostPortalUrl) ||
      tenantFaviconUrl(typeof window !== 'undefined' ? window.location.hostname : '') ||
      tenantFaviconUrl(brandingStore.portalAgency?.slug || brandingStore.portalAgency?.portal_url) ||
      tenantFaviconUrl(agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url);
    // Favicon: tenant mark, else organization master icon, else full logo.
    const platformSelected = authStore.isAuthenticated && agencyStore.platformMode && !agencyStore.currentAgency && !brandingStore.activeRouteSlug;
    const mark = fundthredBrowserBrand.value?.favicon || schoolCareBridgeBrowserBrand.value?.favicon || (platformSelected ? PLATFORM_BRAND.logo : tenantFav) || brandingStore.displayChromeIconUrl || brandingStore.displayLogoUrl;
    if (mark) setFavicon(mark);
  };

  watchEffect(setBrandingChrome);

  const applySavedAppearance = () => {
    const uid = authStore.user?.id;
    // The signed-in user's preference wins; login pages use the browser's choice.
    if (!uid || !applyStoredDarkMode(uid)) applyStoredDarkMode();
  };

  // Restore the saved appearance on navigation, including timeout and login pages.
  router.afterEach(() => {
    setTitle();
    applySavedAppearance();
  });

  try {
    await router.isReady();
  } catch (error) {
    // Keep the recovery action available after an initial route import fails;
    // do not mount an unrelated workspace against an unresolved route.
    if (chunkRecovery.recover(error, pendingChunkReloadPath)) return;
    throw error;
  }

  // Apply dark mode from localStorage before first paint (user preference)
  applySavedAppearance();

  // Register service worker for push notifications (best-effort)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }

  app.mount('#app');
  document.getElementById('portal-startup-status')?.remove();
}

const legacyPublicDestination = legacyTisiPublicDestination(window.location.href);
if (legacyPublicDestination) window.location.replace(legacyPublicDestination);
else bootstrap();
