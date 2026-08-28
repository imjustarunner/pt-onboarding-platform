<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const loading = ref(false);
const busy = ref(false);
const error = ref('');
const status = ref(null);
const password = ref('');
const shownTokenUrl = ref('');
const shownPasscode = ref('');
const confirmAction = ref(null); // 'token' | 'passcode'

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

async function runAction() {
  if (!confirmAction.value || !password.value) {
    error.value = 'Enter your account password to continue';
    return;
  }
  busy.value = true;
  error.value = '';
  shownTokenUrl.value = '';
  shownPasscode.value = '';
  try {
    if (confirmAction.value === 'token') {
      const { data } = await api.post('/quick-view/me/regenerate-token', {
        password: password.value
      }, { skipGlobalLoading: true });
      shownTokenUrl.value = data.url || '';
      await loadStatus();
    } else {
      const { data } = await api.post('/quick-view/me/reset-passcode', {
        password: password.value
      }, { skipGlobalLoading: true });
      shownPasscode.value = data.passcode || '';
      await loadStatus();
    }
    password.value = '';
    confirmAction.value = null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Action failed';
  } finally {
    busy.value = false;
  }
}

onMounted(loadStatus);
</script>

<template>
  <div class="qv-privacy">
    <div class="section-header">
      <h3 style="margin: 0;">Privacy · Quick View</h3>
    </div>
    <p class="hint" style="margin-top: 8px;">
      Quick View is a mobile-only communications gate with a private URL and a separate 6-digit passcode
      (not your kiosk PIN). Credentials are never recoverable — regenerating shows the new value once.
    </p>

    <div v-if="loading" class="hint">Loading…</div>
    <div v-else-if="status" class="qv-status">
      <div>URL token: <strong>{{ status.hasToken ? `set (v${status.tokenVersion})` : 'not set' }}</strong></div>
      <div>Passcode: <strong>{{ status.hasPasscode ? `set (v${status.passcodeVersion})` : 'not set' }}</strong></div>
      <div v-if="status.lockedUntil" class="err">Passcode locked until {{ status.lockedUntil }}</div>
    </div>

    <div class="qv-actions">
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="confirmAction = 'token'; shownTokenUrl = ''; shownPasscode = ''">
        {{ status?.hasToken ? 'Regenerate Quick View URL' : 'Create Quick View URL' }}
      </button>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="confirmAction = 'passcode'; shownTokenUrl = ''; shownPasscode = ''">
        {{ status?.hasPasscode ? 'Reset 6-digit passcode' : 'Create 6-digit passcode' }}
      </button>
    </div>

    <div v-if="confirmAction" class="qv-confirm">
      <p class="hint">
        Confirm with your account password. This invalidates the previous
        {{ confirmAction === 'token' ? 'URL' : 'passcode' }} immediately.
      </p>
      <input
        v-model="password"
        type="password"
        autocomplete="current-password"
        placeholder="Account password"
        class="qv-input"
      />
      <div class="qv-confirm-actions">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="confirmAction = null; password = ''">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="busy || !password" @click="runAction">
          {{ busy ? 'Working…' : 'Confirm' }}
        </button>
      </div>
    </div>

    <div v-if="shownTokenUrl" class="qv-once">
      <strong>Save this URL now — it will not be shown again:</strong>
      <code>{{ shownTokenUrl }}</code>
    </div>
    <div v-if="shownPasscode" class="qv-once">
      <strong>Save this passcode now — it will not be shown again:</strong>
      <code class="pin">{{ shownPasscode }}</code>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
  </div>
</template>

<style scoped>
.qv-privacy { margin-top: 8px; }
.qv-status { display: grid; gap: 4px; font-size: 0.9rem; margin: 10px 0; }
.qv-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.qv-confirm {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.qv-input {
  width: 100%;
  max-width: 320px;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  margin-top: 8px;
}
.qv-confirm-actions { display: flex; gap: 8px; margin-top: 10px; }
.qv-once {
  margin-top: 12px;
  padding: 12px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  display: grid;
  gap: 6px;
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
.err { color: #b91c1c; margin-top: 8px; }
.hint { color: #64748b; font-size: 0.85rem; }
</style>
