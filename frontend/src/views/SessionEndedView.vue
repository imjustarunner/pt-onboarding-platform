<template>
  <div
    class="se-page"
    :class="{ 'se-page--platform': isPlatformBrand, 'se-page--auricwell': isAuricWellPortal }"
    role="main"
    tabindex="0"
    :aria-label="sessionMessage"
    @click="!isMobile && goLogin()"
    @keydown.enter.prevent="goLogin"
    @keydown.space.prevent="goLogin"
  >
    <!-- Background image -->
    <div
      class="se-stage"
      :style="{ backgroundImage: bgUrl ? `url(${bgUrl})` : 'none' }"
    />

    <!-- Mobile: visible card with message + button -->
    <div v-if="isMobile || isPlatformBrand || isAuricWellPortal" class="se-mobile-card">
      <AuricWellAuthBrand v-if="isAuricWellPortal" />
      <img v-else-if="isPlatformBrand" class="se-platform-logo" src="/assets/ptco/logo-flat.webp" alt="Plot Twist Co" /><div v-else class="se-mobile-icon" aria-hidden="true">🔒</div>
      <h1 class="se-mobile-title">You've Been Logged Out</h1>
      <p class="se-mobile-body">
        {{ sessionMessage }}
      </p>
      <button type="button" class="se-mobile-btn" @click="goLogin">
        Log back in
      </button>
    </div>
  </div>
</template>

<script setup>
import AuricWellAuthBrand from '../components/AuricWellAuthBrand.vue';
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  readSessionEndedContext,
  clearSessionEndedContext,
  clearSessionEndedRedirecting,
  normalizeSessionTimeoutTenantKey,
  getSessionEndedImageUrl,
  getMobileTimedownBgUrl,
  resolveSessionTimeoutTenantKey
} from '../utils/sessionTimeoutBranding.js';
import { getCurrentPortalSlugFromHostCache, getCurrentPortalSlugFromPath } from '../utils/loginRedirect.js';

const route = useRoute();
const stored = readSessionEndedContext();
const isAuricWellPortal = /^(www\.)?auricwell\.com$/i.test(window.location.hostname);
const sessionMessage = computed(() => route.query.reason === 'verification'
  ? 'We could not verify your session. Please sign in again to open your portal.'
  : 'Your session has ended. Sign in again to continue securely.');

// ── Mobile detection ──────────────────────────────────────────────────────────
const mobileQuery = typeof window !== 'undefined'
  ? window.matchMedia('(max-width: 640px)')
  : null;
const isMobile = ref(mobileQuery?.matches ?? false);
function onMobileChange(e) { isMobile.value = e.matches; }
onMounted(() => {
  mobileQuery?.addEventListener('change', onMobileChange);
  clearSessionEndedRedirecting();
  document.title = isAuricWellPortal ? 'Sign in again | AuricWell' : 'Session ended';
  history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', blockBack);
});
onUnmounted(() => {
  mobileQuery?.removeEventListener('change', onMobileChange);
  window.removeEventListener('popstate', blockBack);
});

// ── Branding ──────────────────────────────────────────────────────────────────
const tenantKey = computed(() => {
  const fromQuery = route.query?.tenant;
  if (fromQuery) return normalizeSessionTimeoutTenantKey(fromQuery);
  if (stored.tenantKey) return stored.tenantKey;
  const slug = route.params?.organizationSlug || getCurrentPortalSlugFromPath() || '';
  return resolveSessionTimeoutTenantKey({
    slug,
    hostSlug: getCurrentPortalSlugFromHostCache() || ''
  });
});

const isPlatformBrand = computed(() => ['Platform', 'PlotTwistCo'].includes(tenantKey.value));
const bgUrl = computed(() =>
  isAuricWellPortal || isPlatformBrand.value ? null : isMobile.value
    ? getMobileTimedownBgUrl()
    : getSessionEndedImageUrl(tenantKey.value)
);

const loginUrl = computed(() => {
  const fromQuery = typeof route.query?.login === 'string' ? route.query.login : '';
  if (fromQuery && fromQuery.startsWith('/')) return fromQuery;
  if (stored.loginUrl && stored.loginUrl.startsWith('/')) return stored.loginUrl;
  const slug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  if (slug) return `/${slug}/login`;
  const pathSlug = getCurrentPortalSlugFromPath();
  if (pathSlug) return `/${pathSlug}/login`;
  const hostSlug = getCurrentPortalSlugFromHostCache();
  if (hostSlug) return `/${hostSlug}/login`;
  return '/login';
});

function goLogin() {
  const target = loginUrl.value || '/login';
  clearSessionEndedContext();
  window.location.assign(target);
}

function blockBack(e) {
  e.preventDefault();
  history.pushState(null, '', window.location.href);
}
</script>

<style scoped>
.se-page--auricwell .se-stage, .se-page--auricwell .se-mobile-card { background:linear-gradient(160deg,#eff7f5,#edf3fb); }
.se-page--auricwell .se-mobile-title, .se-page--auricwell .se-mobile-body { color:#234166; text-shadow:none; }
.se-page--auricwell .se-mobile-btn { color:#fff; background:#24567d; box-shadow:none; }

.se-page {
  position: fixed;
  inset: 0;
  z-index: 99999;
  min-height: 100vh;
  min-height: 100dvh;
  background: #000;
  cursor: pointer;
  outline: none;
}

.se-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: #0a0a12;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  pointer-events: none;
}

/* ── Mobile card ────────────────────────────────────────────────────────────── */
.se-mobile-card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px 48px;
  background: rgba(0, 0, 0, 0.55);
  text-align: center;
  cursor: default;
}

.se-mobile-icon {
  font-size: 3rem;
  margin-bottom: 16px;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5));
}

.se-mobile-title {
  color: #fff;
  font-size: 1.65rem;
  font-weight: 800;
  line-height: 1.2;
  margin: 0 0 12px;
  text-shadow: 0 1px 8px rgba(0,0,0,0.7);
}

.se-mobile-body {
  color: rgba(255, 255, 255, 0.85);
  font-size: 1rem;
  line-height: 1.55;
  margin: 0 0 36px;
  max-width: 300px;
  text-shadow: 0 1px 4px rgba(0,0,0,0.6);
}

.se-mobile-btn {
  width: 100%;
  max-width: 300px;
  padding: 20px 24px;
  background: #fff;
  color: #0f172a;
  border: none;
  border-radius: 14px;
  font-size: 1.15rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  letter-spacing: 0.01em;
}
.se-mobile-btn:active {
  transform: scale(0.97);
}

.se-page--platform, .se-page--platform .se-stage, .se-page--platform .se-mobile-card { background:var(--bg); }
.se-page--platform .se-mobile-title { color:var(--text-primary); }
.se-page--platform .se-mobile-body { color:var(--text-secondary); }
.se-page--platform .se-mobile-btn { background:#B80016; color:#fff; border:0; }
.se-platform-logo { width:72px; height:96px; object-fit:contain; margin-bottom:24px; }
</style>
