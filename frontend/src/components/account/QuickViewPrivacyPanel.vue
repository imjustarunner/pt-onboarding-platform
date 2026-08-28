<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';

const loading = ref(false);
const busy = ref(false);
const error = ref('');
const status = ref(null);
const confirmSecret = ref('');
const shownTokenUrl = ref('');
const shownPasscode = ref('');
/** null | 'token' | 'passcode' | 'reveal' */
const confirmAction = ref(null);
const copied = ref(false);

const requiresPassword = computed(() => status.value?.requiresPassword !== false);
const confirmLabel = computed(() =>
  requiresPassword.value ? 'Account password' : 'Type CONFIRM'
);
const confirmPlaceholder = computed(() =>
  requiresPassword.value ? 'Account password' : 'CONFIRM'
);

async function loadStatus() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/quick-view/me/status', { skipGlobalLoading: true });
    status.value = data;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not load Quick View status';
  } finally {
    loading.value = false;
  }
}

function openConfirm(action) {
  confirmAction.value = action;
  confirmSecret.value = '';
  error.value = '';
  if (action !== 'reveal') {
    shownTokenUrl.value = '';
    shownPasscode.value = '';
  }
}

function bodyForConfirm() {
  if (requiresPassword.value) return { password: confirmSecret.value };
  return { confirmPhrase: confirmSecret.value };
}

async function runAction() {
  if (!confirmAction.value || !confirmSecret.value) {
    error.value = requiresPassword.value
      ? 'Enter your account password to continue'
      : 'Type CONFIRM to continue';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    if (confirmAction.value === 'reveal') {
      const { data } = await api.post('/quick-view/me/reveal-token', bodyForConfirm(), {
        skipGlobalLoading: true
      });
      shownTokenUrl.value = data.url || '';
    } else if (confirmAction.value === 'token') {
      const { data } = await api.post('/quick-view/me/regenerate-token', bodyForConfirm(), {
        skipGlobalLoading: true
      });
      shownTokenUrl.value = data.url || '';
      await loadStatus();
    } else {
      const { data } = await api.post('/quick-view/me/reset-passcode', bodyForConfirm(), {
        skipGlobalLoading: true
      });
      shownPasscode.value = data.passcode || '';
      await loadStatus();
    }
    confirmSecret.value = '';
    confirmAction.value = null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Action failed';
  } finally {
    busy.value = false;
  }
}

async function copyUrl() {
  if (!shownTokenUrl.value) return;
  try {
    await navigator.clipboard.writeText(shownTokenUrl.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1800);
  } catch {
    error.value = 'Could not copy — select the link and copy manually';
  }
}

onMounted(loadStatus);
</script>

<template>
  <div class="qv-privacy">
    <div class="section-header">
      <h3 style="margin: 0;">Quick View</h3>
    </div>
    <p class="hint" style="margin-top: 6px;">
      Private mobile link + separate <strong>6-digit passcode</strong> (not your kiosk or session PIN).
      Open the link on your phone, then use <strong>Share → Add to Home Screen</strong> from that page
      so the icon opens your token URL (not the main login).
    </p>

    <div v-if="loading" class="hint">Loading…</div>
    <div v-else-if="status" class="qv-status">
      <div class="qv-row">
        <span>Custom link</span>
        <strong>{{ status.hasToken ? `Active (v${status.tokenVersion})` : 'Not created yet' }}</strong>
      </div>
      <div class="qv-row">
        <span>6-digit passcode</span>
        <strong>{{ status.hasPasscode ? `Set (v${status.passcodeVersion})` : 'Not set yet' }}</strong>
      </div>
      <div v-if="status.lockedUntil" class="err">Passcode locked until {{ status.lockedUntil }}</div>
    </div>

    <div class="qv-actions">
      <button
        v-if="status?.hasToken && status?.canRevealToken"
        type="button"
        class="btn btn-primary"
        :disabled="busy"
        @click="openConfirm('reveal')"
      >
        Show my Quick View link
      </button>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="openConfirm('token')">
        {{ status?.hasToken ? 'Regenerate link' : 'Create Quick View link' }}
      </button>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="openConfirm('passcode')">
        {{ status?.hasPasscode ? 'Reset 6-digit passcode' : 'Create 6-digit passcode' }}
      </button>
    </div>

    <div v-if="confirmAction" class="qv-confirm">
      <p class="hint">
        <template v-if="confirmAction === 'reveal'">
          Confirm to show your current Quick View URL.
        </template>
        <template v-else>
          Confirm to {{ confirmAction === 'token' ? 'create/regenerate the URL' : 'create/reset the passcode' }}.
          This invalidates the previous {{ confirmAction === 'token' ? 'URL' : 'passcode' }} immediately.
        </template>
      </p>
      <label class="qv-label">{{ confirmLabel }}</label>
      <input
        v-model="confirmSecret"
        :type="requiresPassword ? 'password' : 'text'"
        :autocomplete="requiresPassword ? 'current-password' : 'off'"
        :placeholder="confirmPlaceholder"
        class="qv-input"
        @keyup.enter="runAction"
      />
      <div class="qv-confirm-actions">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="confirmAction = null; confirmSecret = ''">
          Cancel
        </button>
        <button type="button" class="btn btn-primary" :disabled="busy || !confirmSecret" @click="runAction">
          {{ busy ? 'Working…' : 'Confirm' }}
        </button>
      </div>
    </div>

    <div v-if="shownTokenUrl" class="qv-once">
      <strong>Your Quick View link</strong>
      <code>{{ shownTokenUrl }}</code>
      <button type="button" class="btn btn-secondary btn-sm" @click="copyUrl">
        {{ copied ? 'Copied' : 'Copy link' }}
      </button>
      <p class="hint" style="margin: 8px 0 0;">
        On iPhone: open this URL → Share → Add to Home Screen. Adding the site root will open login instead.
      </p>
    </div>
    <div v-if="shownPasscode" class="qv-once">
      <strong>Save this passcode now — it is only shown here once:</strong>
      <code class="pin">{{ shownPasscode }}</code>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
  </div>
</template>

<style scoped>
.qv-privacy { margin-top: 0; }
.qv-status { display: grid; gap: 6px; font-size: 0.9rem; margin: 10px 0; }
.qv-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 6px 0;
  border-bottom: 1px solid #eef2f7;
}
.qv-row span { color: #64748b; }
.qv-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.qv-confirm {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.qv-label { display: block; font-size: 0.8rem; font-weight: 600; margin-top: 6px; }
.qv-input {
  width: 100%;
  max-width: 320px;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  margin-top: 6px;
}
.qv-confirm-actions { display: flex; gap: 8px; margin-top: 10px; }
.qv-once {
  margin-top: 12px;
  padding: 12px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  display: grid;
  gap: 8px;
}
.qv-once code {
  word-break: break-all;
  font-size: 0.85rem;
}
.qv-once code.pin {
  font-size: 1.4rem;
  letter-spacing: 0.2em;
  font-weight: 700;
}
.btn-sm { padding: 6px 10px; font-size: 0.85rem; width: fit-content; }
.err { color: #b91c1c; margin-top: 8px; }
.hint { color: #64748b; font-size: 0.85rem; }
</style>
