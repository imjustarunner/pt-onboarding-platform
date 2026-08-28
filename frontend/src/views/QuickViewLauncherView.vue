<template>
  <div class="qv-launch" :style="brandStyle">
    <img v-if="agencyLogoUrl" :src="agencyLogoUrl" alt="" class="logo" />
    <h1>{{ agencyName || 'Quick View' }}</h1>

    <div v-if="error" class="err">{{ error }}</div>

    <template v-if="isLocked">
      <p>Quick View is locked. Sign in to the portal and reset your 6-digit passcode.</p>
      <a v-if="loginUrl" class="btn" :href="loginUrl">Sign in to reset</a>
    </template>

    <template v-else-if="ready">
      <p class="hint">Enter your 6-digit Quick View passcode</p>
      <form class="form" @submit.prevent="unlock">
        <input
          v-model="passcode"
          class="pin"
          type="password"
          inputmode="numeric"
          maxlength="6"
          pattern="\d{6}"
          autocomplete="one-time-code"
          placeholder="••••••"
          aria-label="6-digit Quick View passcode"
        />
        <button type="submit" class="btn" :disabled="busy || passcode.length !== 6">
          {{ busy ? 'Opening…' : 'Open' }}
        </button>
      </form>
      <p v-if="loginUrl" class="muted">
        Locked out? <a :href="loginUrl">Sign in to reset</a>
      </p>
    </template>

    <p v-else class="muted">Loading…</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { getSubdomain, isQuickViewHost, resolveHostForAgencyLookup } from '../utils/subdomain';
import { useBrandingStore } from '../store/branding';

const SESSION_KEY = 'plottwist.quickViewSession';
const apiBase = '/api/quick-view';
const router = useRouter();
const branding = useBrandingStore();

const ready = ref(false);
const busy = ref(false);
const error = ref('');
const passcode = ref('');
const agencyId = ref(null);
const agencyName = ref('');
const agencyLogoUrl = ref('');
const agencyPrimaryColor = ref('');
const loginUrl = ref('');
const isLocked = ref(false);
const portalSlug = ref('');

const brandStyle = computed(() => ({
  '--qv-primary': agencyPrimaryColor.value || '#166534'
}));

async function resolveTenant() {
  error.value = '';
  try {
    await branding.initializePortalTheme?.();
  } catch { /* ignore */ }

  const slug =
    getSubdomain()
    || String(branding.portalHostPortalUrl || '').trim().toLowerCase()
    || '';
  portalSlug.value = slug;

  const host = resolveHostForAgencyLookup();
  const { data } = await axios.get(`${apiBase}/tenant`, {
    params: { portal: slug || undefined, host: host || undefined },
    withCredentials: true
  });
  agencyId.value = data.agencyId;
  agencyName.value = data.agencyName || '';
  agencyLogoUrl.value = data.agencyLogoUrl || '';
  agencyPrimaryColor.value = data.agencyPrimaryColor || '';
  loginUrl.value = data.loginUrl || '';
  ready.value = true;

  // Install PWA manifest for this origin root
  try {
    const origin = window.location.origin;
    const name = agencyName.value ? `${agencyName.value} Quick View` : 'Quick View';
    const href =
      `${apiBase}/pwa-manifest?` +
      new URLSearchParams({
        origin,
        name,
        theme: agencyPrimaryColor.value || '#0f172a',
        icon: agencyLogoUrl.value || '/branding/plottwisthq-platform-bg.png'
      }).toString();
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.setAttribute('href', href);
    document.title = name;
  } catch { /* ignore */ }
}

async function unlock() {
  if (passcode.value.length !== 6 || !agencyId.value) return;
  busy.value = true;
  error.value = '';
  try {
    const { data } = await axios.post(
      `${apiBase}/tenant/unlock`,
      {
        passcode: passcode.value,
        agencyId: agencyId.value,
        portal: portalSlug.value || undefined
      },
      { withCredentials: true }
    );
    try {
      sessionStorage.setItem(SESSION_KEY, data.sessionToken || '');
    } catch { /* ignore */ }
    // Land in the full Quick View shell (session via cookie + stored token)
    router.replace({ name: 'QuickViewApp' });
  } catch (e) {
    const err = e?.response?.data?.error || {};
    error.value = err.message || 'Unlock failed';
    if (err.requiresReset || err.code === 'locked') {
      isLocked.value = true;
      if (err.loginUrl) loginUrl.value = err.loginUrl;
    }
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  // If already bound via old flow, keep supporting redirect
  try {
    const token = String(localStorage.getItem('plottwist.quickViewToken') || '').trim();
    if (token) {
      const dest = isQuickViewHost()
        ? `/t/${encodeURIComponent(token)}`
        : `/quick-view/${encodeURIComponent(token)}`;
      router.replace(dest);
      return;
    }
  } catch { /* ignore */ }

  try {
    await resolveTenant();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not load Quick View for this tenant';
    ready.value = true;
  }
});
</script>

<style scoped>
.qv-launch {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  place-content: center;
  gap: 12px;
  padding: 24px;
  background: #0f172a;
  color: #e2e8f0;
  text-align: center;
  font-family: system-ui, -apple-system, sans-serif;
}
.logo {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  object-fit: contain;
  background: #fff;
}
.qv-launch h1 { margin: 0; font-size: 1.6rem; }
.hint { margin: 0; color: #cbd5e1; }
.form { display: grid; gap: 12px; width: min(100%, 320px); }
.pin {
  width: 100%;
  font-size: 28px;
  letter-spacing: 0.35em;
  text-align: center;
  padding: 14px 12px;
  border-radius: 12px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #fff;
  -webkit-text-security: disc;
  text-security: disc;
}
.btn {
  border: none;
  border-radius: 10px;
  padding: 12px 14px;
  font-weight: 700;
  cursor: pointer;
  background: var(--qv-primary, #166534);
  color: #fff;
  text-decoration: none;
  display: inline-block;
}
.muted { color: #94a3b8; font-size: 0.9rem; margin: 0; }
.muted a, .qv-launch a { color: #93c5fd; }
.err {
  background: #7f1d1d;
  padding: 10px 12px;
  border-radius: 8px;
  max-width: 28rem;
}
</style>
