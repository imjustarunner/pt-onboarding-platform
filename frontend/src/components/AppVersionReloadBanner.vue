<template>
  <div
    v-if="updateAvailable"
    class="app-version-banner"
    role="alert"
    tabindex="0"
    title="Click anywhere to reload"
    @click="onBannerClick"
    @keydown.enter.prevent="reload"
    @keydown.space.prevent="reload"
  >
    <span class="app-version-banner__text">
      <strong>{{ bannerLabel }}</strong> has a new version — please reload to get the latest fixes.
      <em class="app-version-banner__hint">Click anywhere to reload</em>
    </span>
    <div class="app-version-banner__actions">
      <span class="app-version-banner__reload" aria-hidden="true">Reload now</span>
      <button
        type="button"
        class="app-version-banner__dismiss"
        aria-label="Dismiss"
        @click.stop="dismiss"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { useAgencyStore } from '../store/agency';
import { resolveTenantAppProfileBySlug } from '../config/tenantAppProfiles.js';

const POLL_MS = 3 * 60 * 1000;

const props = defineProps({
  authenticated: { type: Boolean, default: false }
});

const agencyStore = useAgencyStore();
const updateAvailable = ref(false);
const dismissed = ref(false);
let timer = null;

const baseline = {
  frontend: String(import.meta.env.VITE_APP_BUILD_ID || 'dev').trim(),
  backend: null
};

const isItscoContext = computed(() => {
  if (!props.authenticated) return false;
  const slug =
    agencyStore.currentAgency?.slug
    || agencyStore.currentAgency?.organization_slug
    || '';
  if (resolveTenantAppProfileBySlug(slug).id === 'itsco') return true;
  const agencies = agencyStore.agencies || agencyStore.userAgencies || [];
  return (agencies || []).some((a) =>
    resolveTenantAppProfileBySlug(a?.slug || a?.organization_slug).id === 'itsco'
  );
});

const bannerLabel = computed(() => (isItscoContext.value ? 'ITSCO\'s App' : 'This app'));

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) return null;
  return res.json();
}

async function poll() {
  if (!isItscoContext.value || dismissed.value || updateAvailable.value) return;
  try {
    const [fe, be] = await Promise.all([
      fetchJson(`/version.json?t=${Date.now()}`),
      fetchJson(`/api/app-version?t=${Date.now()}`)
    ]);
    const remoteFe = String(fe?.buildId || '').trim();
    const remoteBe = String(be?.buildId || '').trim();
    if (remoteFe && remoteFe !== baseline.frontend) {
      updateAvailable.value = true;
      return;
    }
    if (remoteBe) {
      if (baseline.backend == null) baseline.backend = remoteBe;
      else if (remoteBe !== baseline.backend) updateAvailable.value = true;
    }
  } catch {
    // ignore
  }
}

function startPolling() {
  stopPolling();
  if (!isItscoContext.value) return;
  void poll();
  timer = window.setInterval(poll, POLL_MS);
}

function stopPolling() {
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
}

function reload() {
  window.location.reload();
}

function onBannerClick() {
  reload();
}

function dismiss() {
  dismissed.value = true;
  updateAvailable.value = false;
  stopPolling();
}

watch(isItscoContext, (ok) => {
  if (ok) startPolling();
  else stopPolling();
}, { immediate: true });

onUnmounted(stopPolling);
</script>

<style scoped>
.app-version-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 12px 20px;
  background: #ecfdf5;
  border-bottom: 2px solid #5eead4;
  color: #0f172a;
  font-size: 0.95rem;
  cursor: pointer;
  user-select: none;
}
.app-version-banner:hover {
  background: #d1fae5;
}
.app-version-banner:focus-visible {
  outline: 2px solid #0f766e;
  outline-offset: -2px;
}
.app-version-banner__text {
  flex: 1;
  min-width: 12rem;
}
.app-version-banner__hint {
  display: inline-block;
  margin-left: 0.5rem;
  font-style: normal;
  font-size: 0.82rem;
  font-weight: 600;
  color: #0f766e;
}
.app-version-banner__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.app-version-banner__reload {
  border: none;
  background: #0f766e;
  color: #fff;
  font-weight: 700;
  font-size: 0.82rem;
  padding: 6px 12px;
  border-radius: 8px;
  pointer-events: none;
}
.app-version-banner:hover .app-version-banner__reload {
  background: #0d9488;
}
.app-version-banner__dismiss {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 1rem;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
}
.app-version-banner__dismiss:hover {
  background: rgba(15, 23, 42, 0.06);
  color: #0f172a;
}
</style>
