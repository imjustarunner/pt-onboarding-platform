<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';

const props = defineProps({ expectedUserId: [Number, String], agencyId: [Number, String], passcodeOnly: Boolean });
const emit = defineEmits(['passcode-changed', 'busy-change']);

const loading = ref(false);
const busy = ref(false);
const error = ref('');
const status = ref(null);
const confirmSecret = ref('');
const shownTokenUrl = ref('');
const shownHomeUrl = ref('');
const shownPasscode = ref('');
/** null | 'token' | 'passcode' | 'reveal' */
const confirmAction = ref(null);
const copied = ref('');

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
    const { data } = await api.get('/quick-view/me/status', { skipGlobalLoading: true, timeout: 30000,
      ...(props.expectedUserId ? { skipAuthRedirect: true, cookieAuthOnly: true } : {}),
      ...(props.agencyId ? { headers: { 'X-Agency-Id': props.agencyId } } : {}) });
    if (props.expectedUserId && Number(data.userId) !== Number(props.expectedUserId)) {
      throw new Error('Sign in to the account named on this update, then choose Try again.');
    }
    status.value = data;
    if (data?.homeUrl) shownHomeUrl.value = data.homeUrl;
  } catch (e) {
    status.value = null;
    error.value = props.expectedUserId && e?.response?.status === 401
      ? 'Sign in to your account using the link above, then return here and choose Try again.'
      : e?.response?.data?.error?.message || (props.expectedUserId ? e.message : '') || 'Could not load Quick View status';
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
  const scope = { ...(props.expectedUserId ? { expectedUserId: Number(props.expectedUserId) } : {}), ...(props.agencyId ? { agencyId: Number(props.agencyId) } : {}) };
  if (requiresPassword.value) return { ...scope, password: confirmSecret.value };
  return { ...scope, confirmPhrase: confirmSecret.value };
}

async function runAction() {
  if (busy.value || !status.value) return;
  if (!confirmAction.value || !confirmSecret.value) {
    error.value = requiresPassword.value
      ? 'Enter your account password to continue'
      : 'Type CONFIRM to continue';
    return;
  }
  busy.value = true;
  emit('busy-change', true);
  error.value = '';
  try {
    if (confirmAction.value === 'reveal') {
      const { data } = await api.post('/quick-view/me/reveal-token', bodyForConfirm(), {
        skipGlobalLoading: true
      });
      shownTokenUrl.value = data.url || '';
      if (data.homeUrl) shownHomeUrl.value = data.homeUrl;
    } else if (confirmAction.value === 'token') {
      const { data } = await api.post('/quick-view/me/regenerate-token', bodyForConfirm(), {
        skipGlobalLoading: true
      });
      shownTokenUrl.value = data.url || '';
      if (data.homeUrl) shownHomeUrl.value = data.homeUrl;
      await loadStatus();
    } else {
      const { data } = await api.post('/quick-view/me/reset-passcode', bodyForConfirm(), {
        skipGlobalLoading: true,
        timeout: 30000,
        ...(props.expectedUserId ? { skipAuthRedirect: true, cookieAuthOnly: true } : {})
      });
      if (!/^\d{6}$/.test(String(data.passcode || ''))) throw new Error('The new code was not received. Reset it again before confirming this step.');
      shownPasscode.value = data.passcode;
      emit('passcode-changed');
      await loadStatus();
    }
    confirmSecret.value = '';
    confirmAction.value = null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || (confirmAction.value === 'passcode'
      ? 'The reset could not be confirmed. Your old code may no longer work. Reset again and save the new code before continuing.'
      : 'Action failed');
  } finally {
    busy.value = false;
    emit('busy-change', false);
  }
}

async function copyText(value, key) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    copied.value = key;
    setTimeout(() => {
      copied.value = '';
    }, 1800);
  } catch {
    error.value = 'Could not copy — select the link and copy manually';
  }
}

onMounted(loadStatus);
defineExpose({ refreshStatus: loadStatus });
</script>

<template>
  <div class="qv-privacy" data-search-private>
    <div class="section-header">
      <h3 style="margin: 0;">{{ passcodeOnly ? 'Reset your six-digit code here' : 'Quick View — 6-digit code' }}</h3>
    </div>
    <p v-if="passcodeOnly" class="hint">Confirm using your signed-in account. Your old code will stop working. Save the new code, then confirm this update step.</p>
    <p v-else class="hint" style="margin-top: 6px;">
      Tenant Quick View + separate <strong>6-digit passcode</strong> (not your kiosk or session PIN).
      Open your <strong>Home Screen URL</strong> (or Add to Home Screen from it) and unlock with the passcode —
      no setup-link bind step required. Three wrong guesses locks Quick View until you reset the passcode here.
    </p>

    <div v-if="loading" class="hint">Loading…</div>
    <div v-else-if="status" class="qv-status">
      <div class="qv-row">
        <span>Tenant</span>
        <strong>{{ status.agencyName || '—' }}</strong>
      </div>
      <div class="qv-row" v-if="!passcodeOnly && (status.homeUrl || shownHomeUrl)">
        <span>Home Screen URL</span>
        <strong class="break">{{ status.homeUrl || shownHomeUrl }}</strong>
      </div>
      <div v-if="!passcodeOnly" class="qv-row">
        <span>Setup link</span>
        <strong>{{ status.hasToken ? `Active (v${status.tokenVersion})` : 'Not created yet' }}</strong>
      </div>
      <div class="qv-row">
        <span>6-digit passcode</span>
        <strong>{{ status.hasPasscode ? `Set (v${status.passcodeVersion})` : 'Not set yet' }}</strong>
      </div>
      <div v-if="status.isLocked" class="err">
        Quick View is locked after 3 failed attempts. Reset your passcode below to unlock.
      </div>
    </div>

    <div v-if="!passcodeOnly && (status?.homeUrl || shownHomeUrl)" class="qv-once" style="background:#eff6ff;border-color:#bfdbfe;">
      <strong>Add this to Home Screen (no token in the URL)</strong>
      <code>{{ status.homeUrl || shownHomeUrl }}</code>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        @click="copyText(status.homeUrl || shownHomeUrl, 'home')"
      >
        {{ copied === 'home' ? 'Copied' : 'Copy home URL' }}
      </button>
    </div>

    <div class="qv-actions">
      <button
        v-if="!passcodeOnly && status?.hasToken && status?.canRevealToken"
        type="button"
        class="btn btn-primary"
        :disabled="busy"
        @click="openConfirm('reveal')"
      >
        Show setup link
      </button>
      <button v-if="!passcodeOnly" type="button" class="btn btn-secondary" :disabled="busy || loading || !status" @click="openConfirm('token')">
        {{ status?.hasToken ? 'Regenerate setup link' : 'Create Quick View link' }}
      </button>
      <button type="button" class="btn btn-secondary" :disabled="busy || loading || !status" @click="openConfirm('passcode')">
        {{ status?.hasPasscode ? 'Reset 6-digit passcode' : 'Create 6-digit passcode' }}
      </button>
    </div>

    <div v-if="confirmAction" class="qv-confirm">
      <p v-if="!requiresPassword" class="hint">You are already signed in. Type CONFIRM below to authorize this change; your Google password is not needed.</p>
      <p class="hint">
        <template v-if="confirmAction === 'reveal'">
          Confirm to show your current Quick View setup URL (tenant-scoped).
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
      <strong>Setup link (open once on your phone to bind)</strong>
      <code>{{ shownTokenUrl }}</code>
      <button type="button" class="btn btn-secondary btn-sm" @click="copyText(shownTokenUrl, 'token')">
        {{ copied === 'token' ? 'Copied' : 'Copy setup link' }}
      </button>
      <p class="hint" style="margin: 8px 0 0;">
        After opening this once, Add to Home Screen from your tenant Quick View page.
        Day-to-day unlock is the 6-digit passcode only.
      </p>
    </div>
    <div v-if="shownPasscode" class="qv-once">
      <strong>Save this passcode now — it is only shown here once:</strong>
      <code class="pin">{{ shownPasscode }}</code>
    </div>
    <p v-if="error" class="err" role="alert">{{ error }} <button v-if="!status" type="button" class="btn btn-secondary btn-sm" @click="loadStatus">Try again</button></p>
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
.qv-row .break { word-break: break-all; text-align: right; max-width: 70%; }
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
