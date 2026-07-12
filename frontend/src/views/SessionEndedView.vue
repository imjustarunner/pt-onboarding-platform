<template>
  <div
    class="se-page"
    role="main"
    tabindex="0"
    aria-label="Session timed out. Click anywhere to log back in."
    @click="goLogin"
    @keydown.enter.prevent="goLogin"
    @keydown.space.prevent="goLogin"
  >
    <div
      class="se-stage"
      :style="{ backgroundImage: `url(${imageUrl})` }"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  readSessionEndedContext,
  clearSessionEndedContext,
  clearSessionEndedRedirecting,
  normalizeSessionTimeoutTenantKey,
  getSessionEndedImageUrl,
  resolveSessionTimeoutTenantKey
} from '../utils/sessionTimeoutBranding.js';
import { getCurrentPortalSlugFromHostCache, getCurrentPortalSlugFromPath } from '../utils/loginRedirect.js';

const route = useRoute();
const stored = readSessionEndedContext();

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

const imageUrl = computed(() => getSessionEndedImageUrl(tenantKey.value));

/** Prefer stored tenant login URL; never leave Session Ended without a login target. */
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

onMounted(() => {
  clearSessionEndedRedirecting();
  document.title = 'Session timed out';
  history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', blockBack);
});

onUnmounted(() => {
  window.removeEventListener('popstate', blockBack);
});
</script>

<style scoped>
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
  position: relative;
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
</style>
