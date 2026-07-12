<template>
  <div class="se-page" role="main">
    <div
      class="se-stage"
      :style="{ backgroundImage: `url(${imageUrl})` }"
    >
      <!-- Hotspot over the designed "Click here to log back in" CTA -->
      <button
        type="button"
        class="se-hotspot"
        aria-label="Click here to log back in"
        @click="goLogin"
      />

      <!-- Always-visible fallback so login is reachable if hotspot misses -->
      <button type="button" class="se-fallback-btn" @click="goLogin">
        <span class="se-fallback-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
        Click here to log back in
      </button>
    </div>
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

const loginUrl = computed(() => {
  const fromQuery = typeof route.query?.login === 'string' ? route.query.login : '';
  if (fromQuery && fromQuery.startsWith('/')) return fromQuery;
  if (stored.loginUrl && stored.loginUrl.startsWith('/')) return stored.loginUrl;
  const slug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  if (slug) return `/${slug}/login`;
  return '/login';
});

function goLogin() {
  const target = loginUrl.value || '/login';
  clearSessionEndedContext();
  // Hard navigation so we leave Session Ended fully and land on tenant login.
  window.location.assign(target);
}

function blockBack(e) {
  // Keep user on Session Ended until they choose to log back in.
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
}

/* Align with the designed green-bordered CTA on SessionEnded art (left column). */
.se-hotspot {
  position: absolute;
  left: clamp(4%, 5.5vw, 8%);
  top: clamp(48%, 54%, 58%);
  width: min(380px, 42vw);
  height: clamp(52px, 7.5vh, 68px);
  border: 2px solid transparent;
  border-radius: 14px;
  background: transparent;
  cursor: pointer;
  z-index: 2;
}
.se-hotspot:focus-visible {
  outline: 3px solid rgba(255, 255, 255, 0.85);
  outline-offset: 3px;
}

.se-fallback-btn {
  position: absolute;
  left: clamp(4%, 5.5vw, 8%);
  bottom: clamp(18px, 4vh, 40px);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 12px;
  border: 1.5px solid rgba(134, 239, 172, 0.65);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(6px);
}
.se-fallback-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}
.se-fallback-icon {
  display: grid;
  place-items: center;
}

@media (max-width: 720px) {
  .se-hotspot {
    width: min(92vw, 420px);
    left: 4%;
    top: auto;
    bottom: 24%;
  }
}
</style>
