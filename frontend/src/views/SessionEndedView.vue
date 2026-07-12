<template>
  <div class="se-page" role="main">
    <div
      class="se-stage"
      :style="{ backgroundImage: `url(${imageUrl})` }"
    >
      <!-- Hotspot over the designed CTA; visible focus ring for a11y -->
      <button
        type="button"
        class="se-hotspot"
        :aria-label="'Click here to log back in'"
        @click="goLogin"
      />

      <!-- Fallback CTA if image layout differs on narrow screens -->
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
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  readSessionEndedContext,
  clearSessionEndedContext,
  normalizeSessionTimeoutTenantKey,
  getSessionEndedImageUrl,
  resolveSessionTimeoutTenantKey
} from '../utils/sessionTimeoutBranding.js';
import { getCurrentPortalSlugFromHostCache, getCurrentPortalSlugFromPath } from '../utils/loginRedirect.js';

const route = useRoute();
const router = useRouter();

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
  router.replace(target).catch(() => {
    window.location.href = target;
  });
}

onMounted(() => {
  // Ensure we never leave a stale auth shell on this public page
  document.title = 'Session timed out';
});
</script>

<style scoped>
.se-page {
  min-height: 100vh;
  min-height: 100dvh;
  background: #000;
}

.se-stage {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: #0a0a12;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* Transparent clickable region over the designed pill button (left column). */
.se-hotspot {
  position: absolute;
  left: clamp(4%, 6vw, 9%);
  top: clamp(52%, 58%, 64%);
  width: min(420px, 46vw);
  height: clamp(48px, 7vh, 64px);
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

/* Always-available fallback so login is reachable if hotspot misses */
.se-fallback-btn {
  position: absolute;
  left: clamp(4%, 6vw, 9%);
  bottom: clamp(18px, 4vh, 40px);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 12px;
  border: 1.5px solid rgba(255, 255, 255, 0.55);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(6px);
}
.se-fallback-btn:hover {
  background: rgba(0, 0, 0, 0.65);
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
    bottom: 22%;
  }
}
</style>
