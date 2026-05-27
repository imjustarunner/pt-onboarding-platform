<template>
  <div class="kiosk-entry">
    <div class="kiosk-card">
      <h1 class="kiosk-title">Kiosk</h1>
      <p class="kiosk-lead muted">Choose how you are using this station.</p>

      <div class="mode-tabs" role="tablist" aria-label="Kiosk mode">
        <button
          type="button"
          role="tab"
          class="mode-tab"
          :class="{ active: mode === 'event' }"
          :aria-selected="mode === 'event'"
          @click="setMode('event')"
        >
          Event check-in
        </button>
        <button
          type="button"
          role="tab"
          class="mode-tab"
          :class="{ active: mode === 'office' }"
          :aria-selected="mode === 'office'"
          @click="setMode('office')"
        >
          Office kiosk
        </button>
      </div>

      <section v-if="mode === 'event'" role="tabpanel" class="kiosk-panel">
        <p class="panel-lead muted">
          Enter the 6-digit station PIN from today’s event settings. Staff may use their personal 4-digit kiosk PIN on the
          next screen when required.
        </p>
        <div v-if="eventError" class="error">{{ eventError }}</div>
        <form class="kiosk-form" @submit.prevent="submitEventPin">
          <label class="field-label" for="event-pin">Event station PIN</label>
          <input
            id="event-pin"
            v-model="eventPin"
            class="input pin-input"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="••••••"
            :disabled="eventBusy"
            @input="eventPin = ($event.target?.value || '').replace(/\D/g, '').slice(0, 6)"
          />
          <button type="submit" class="btn btn-primary" :disabled="eventBusy || eventPin.length !== 6">
            {{ eventBusy ? 'Checking…' : 'Continue to event' }}
          </button>
        </form>
      </section>

      <section v-else role="tabpanel" class="kiosk-panel">
        <p class="panel-lead muted">Sign in with your office kiosk account to clock in or use location features.</p>
        <div v-if="officeError" class="error">{{ officeError }}</div>
        <form class="kiosk-form" @submit.prevent="submitOfficeLogin">
          <div class="form-group">
            <label for="kiosk-username">Username</label>
            <input
              id="kiosk-username"
              v-model="username"
              type="text"
              required
              placeholder="Enter username"
              autocomplete="username"
              :disabled="officeBusy"
            />
          </div>
          <div class="form-group">
            <label for="kiosk-password">Password</label>
            <input
              id="kiosk-password"
              v-model="password"
              type="password"
              required
              placeholder="Enter password"
              autocomplete="current-password"
              :disabled="officeBusy"
            />
          </div>
          <button type="submit" class="btn btn-primary" :disabled="officeBusy">
            {{ officeBusy ? 'Signing in…' : 'Sign in to office kiosk' }}
          </button>
        </form>
        <p class="hint">Contact your administrator if you need a kiosk account.</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import { buildEventKioskStationPath, resolvePortalSlug } from '../utils/orgScopedPath';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const slug = computed(() =>
  resolvePortalSlug(route.params, brandingStore.portalHostPortalUrl)
);

const mode = ref(String(route.query?.mode || '').toLowerCase() === 'office' ? 'office' : 'event');

watch(
  () => route.query?.mode,
  (value) => {
    mode.value = String(value || '').toLowerCase() === 'office' ? 'office' : 'event';
  }
);

function setMode(next) {
  mode.value = next;
  router.replace({ query: next === 'office' ? { mode: 'office' } : {} });
}

const eventPin = ref('');
const eventBusy = ref(false);
const eventError = ref('');

const username = ref('');
const password = ref('');
const officeBusy = ref(false);
const officeError = ref('');

function eventStorageKey() {
  return `skillBuildersEventKiosk:${slug.value}`;
}

async function submitEventPin() {
  eventError.value = '';
  if (!slug.value) {
    eventError.value =
      'Could not determine your organization. Use the kiosk link from event settings, or open /{your-org}/kiosk.';
    return;
  }
  const pin = eventPin.value.replace(/\D/g, '').slice(0, 6);
  if (pin.length !== 6) {
    eventError.value = 'Enter all 6 digits.';
    return;
  }
  eventBusy.value = true;
  try {
    const res = await api.post(
      `/public/skill-builders/agency/${encodeURIComponent(slug.value.toLowerCase())}/kiosk/unlock`,
      { pin },
      { skipGlobalLoading: true, skipAuthRedirect: true }
    );
    const token = res.data?.token;
    const eventId = Number(res.data?.eventId);
    const kind = String(res.data?.kind || 'skill_builders');
    if (!token || !eventId) {
      eventError.value = 'Unexpected response from server.';
      return;
    }
    sessionStorage.setItem(
      eventStorageKey(),
      JSON.stringify({ token, eventId, kind, savedAt: Date.now() })
    );
    await router.push(
      buildEventKioskStationPath(slug.value, { eventId, kind }, null, brandingStore.portalHostPortalUrl)
    );
  } catch (e) {
    eventError.value = e.response?.data?.error?.message || e.message || 'Could not unlock event';
  } finally {
    eventBusy.value = false;
  }
}

async function submitOfficeLogin() {
  officeError.value = '';
  officeBusy.value = true;
  const result = await authStore.login(username.value, password.value, null);
  if (result.success) {
    if (authStore.user?.role?.toLowerCase() !== 'kiosk') {
      authStore.clearAuth();
      officeError.value = 'This login is for kiosk accounts only. Please use the standard login.';
      officeBusy.value = false;
      return;
    }
    router.push('/kiosk/app');
  } else {
    officeError.value = result.error || 'Login failed';
  }
  officeBusy.value = false;
}
</script>

<style scoped>
.kiosk-entry {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-alt, #f1f5f9);
  padding: 20px;
}
.kiosk-card {
  width: min(440px, 100%);
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.kiosk-title {
  margin: 0 0 6px;
  font-size: 24px;
  color: var(--primary, #0f766e);
}
.kiosk-lead {
  margin: 0 0 20px;
  font-size: 14px;
}
.mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 20px;
}
.mode-tab {
  border: 1px solid var(--border, #e2e8f0);
  background: var(--surface, #fff);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
}
.mode-tab.active {
  border-color: var(--primary, #0f766e);
  background: color-mix(in srgb, var(--primary, #0f766e) 8%, white);
  color: var(--primary, #0f766e);
}
.kiosk-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel-lead {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
.kiosk-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field-label,
.form-group label {
  font-weight: 600;
  font-size: 14px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group input,
.pin-input {
  padding: 10px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 16px;
}
.pin-input {
  font-size: 1.35rem;
  letter-spacing: 0.2em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.error {
  background: #fee;
  color: #c00;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.muted {
  color: var(--text-secondary, #64748b);
}
</style>
