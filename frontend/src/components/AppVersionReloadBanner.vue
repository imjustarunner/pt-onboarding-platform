<template>
  <div v-if="updateAvailable" class="app-version-banner" role="alert">
    <span class="app-version-banner__text">
      <strong>{{ bannerLabel }}</strong> has a new version — please reload to get the latest fixes.
    </span>
    <div class="app-version-banner__actions">
      <button type="button" class="app-version-banner__reload" @click="reload">Reload now</button>
      <button type="button" class="app-version-banner__dismiss" aria-label="Dismiss" @click="dismiss">✕</button>
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

function dismiss() {
  dismissed.value = true;
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
  padding: 10px 16px;
  background: #ecfdf5;
  border-bottom: 1px solid #99f6e4;
  color: #0f172a;
  font-size: 0.9rem;
}
.app-version-banner__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.app-version-banner__reload {
  border: none;
  background: #0f766e;
  color: #fff;
  font-weight: 700;
  font-size: 0.82rem;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.app-version-banner__reload:hover {
  background: #0d9488;
}
.app-version-banner__dismiss {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 1rem;
  cursor: pointer;
  padding: 4px 6px;
}
</style>
