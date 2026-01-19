import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';

import { useAgencyStore } from './store/agency';
import { useBrandingStore } from './store/branding';

const CHUNK_RELOAD_KEY = '__pt_chunk_reload__';

const isChunkLoadError = (err) => {
  const msg = String(err?.message || err || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch')
  );
};

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);

  // If a deploy happens while someone is using the app, lazy-loaded route chunks can 404.
  // This reloads once to pick up the new index/assets, avoiding a broken editor experience.
  router.onError((err) => {
    if (!isChunkLoadError(err)) return;
    const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
    if (alreadyReloaded) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    window.location.reload();
  });

  // Preload branding before first paint to prevent “wrong theme/logo flash”
  const brandingStore = useBrandingStore(pinia);
  const agencyStore = useAgencyStore(pinia);

  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isPlatformLogin = path === '/login';

  if (isPlatformLogin) {
    // Ensure stale org theme/agency context doesn't affect the platform login.
    brandingStore.clearPortalTheme();
    agencyStore.setCurrentAgency(null);
  }

  // Always fetch platform branding early so /login renders correctly immediately.
  // On /login we force refresh to pick up latest logo/colors.
  await brandingStore.fetchPlatformBranding(isPlatformLogin);

  await router.isReady();
  // Clear reload guard after a successful boot.
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  app.mount('#app');
}

bootstrap();

