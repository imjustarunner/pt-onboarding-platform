<template>
  <div class="stripe-connect-section">
    <div class="stripe-connect-header">
      <div class="stripe-connect-title-row">
        <svg class="stripe-logo" viewBox="0 0 60 25" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V6.27h3.64l.24 1.04a4.16 4.16 0 0 1 3.26-1.3c3.24 0 5.55 2.89 5.55 7.27 0 4.6-2.35 7.02-5.65 7.02zM40 9.54c-.94 0-1.67.34-2.04.68v5.74c.35.31 1.06.67 2.04.67 1.54 0 2.59-1.19 2.59-3.54 0-2.27-1.05-3.55-2.59-3.55zM28.24 5.7h4.13V20h-4.13V5.7zm0-4.7h4.13v3.35h-4.13V1zM18.65 20.3c-2.53 0-4.77-.58-6.34-1.35l.97-3.54c1.35.69 3.09 1.18 4.8 1.18 1.74 0 2.49-.5 2.49-1.38 0-2.56-8.19-.87-8.19-7.14C12.38 4.85 14.92 3 18.85 3c2.08 0 4.08.47 5.59 1.14l-.96 3.42c-1.29-.58-2.9-1.01-4.44-1.01-1.41 0-2.16.44-2.16 1.28 0 2.42 8.23.9 8.23 7.13 0 3.33-2.5 5.34-6.46 5.34zM7.41 20H3.28V9.54H0V6.27h3.28V4.9C3.28 1.85 5.13 0 8.44 0a10 10 0 0 1 3.22.5l-.89 3.27c-.5-.13-.98-.19-1.51-.19-1.2 0-1.85.58-1.85 1.72v1.17H11v3.27H7.41V20z"/>
        </svg>
        <h4>Stripe Connect — Client Payments</h4>
      </div>
      <p class="stripe-connect-desc">
        Connect your agency's Stripe account so parents and guardians can pay for classes, tutoring,
        and sessions directly into your bank account. Stripe handles all card processing and
        compliance — no card numbers ever touch our servers.
      </p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="stripe-status-row">
      <span class="spinner" /> Checking Stripe connection…
    </div>

    <!-- Error -->
    <div v-else-if="error" class="stripe-error">{{ error }}</div>

    <!-- Not connected -->
    <template v-else-if="status === 'not_connected'">
      <div class="stripe-status-row">
        <span class="pill pill-off">Not connected</span>
        <span class="stripe-status-hint">
          Parents cannot pay online until you connect a Stripe account.
        </span>
      </div>
      <div class="stripe-actions">
        <button class="btn btn-primary" :disabled="connecting" @click="connectStripe">
          <span v-if="connecting" class="spinner spinner--btn" />
          {{ connecting ? 'Redirecting to Stripe…' : 'Connect Stripe Account' }}
        </button>
      </div>
    </template>

    <!-- Pending (account created but onboarding not complete) -->
    <template v-else-if="status === 'pending'">
      <div class="stripe-status-row">
        <span class="pill pill-warn">Setup in progress</span>
        <span class="stripe-status-hint">
          Stripe onboarding started but not yet complete. Click below to continue.
        </span>
      </div>
      <div class="stripe-actions">
        <button class="btn btn-primary" :disabled="connecting" @click="connectStripe">
          <span v-if="connecting" class="spinner spinner--btn" />
          {{ connecting ? 'Redirecting to Stripe…' : 'Continue Stripe Setup' }}
        </button>
        <button class="btn btn-outline" :disabled="refreshing" @click="refreshStatus">
          {{ refreshing ? 'Checking…' : 'Check Status' }}
        </button>
      </div>
    </template>

    <!-- Active -->
    <template v-else-if="status === 'active'">
      <div class="stripe-status-row">
        <span class="pill pill-on">Connected</span>
        <span v-if="accountDisplayName" class="stripe-account-name">{{ accountDisplayName }}</span>
      </div>
      <div class="stripe-details" v-if="chargesEnabled !== null">
        <div class="stripe-detail-item">
          <span class="label">Charges</span>
          <span :class="['pill', chargesEnabled ? 'pill-on' : 'pill-warn']">
            {{ chargesEnabled ? 'Enabled' : 'Not yet enabled' }}
          </span>
        </div>
        <div class="stripe-detail-item">
          <span class="label">Payouts</span>
          <span :class="['pill', payoutsEnabled ? 'pill-on' : 'pill-warn']">
            {{ payoutsEnabled ? 'Enabled' : 'Not yet enabled' }}
          </span>
        </div>
      </div>
      <div class="stripe-actions">
        <button class="btn" :disabled="openingDashboard" @click="openDashboard">
          <span v-if="openingDashboard" class="spinner spinner--btn" />
          {{ openingDashboard ? 'Opening…' : 'Open Stripe Dashboard' }}
        </button>
        <button class="btn btn-outline btn-danger-outline" :disabled="disconnecting" @click="confirmDisconnect">
          {{ disconnecting ? 'Disconnecting…' : 'Disconnect' }}
        </button>
      </div>
    </template>

    <!-- Disconnect confirm -->
    <div v-if="showDisconnectConfirm" class="stripe-disconnect-confirm">
      <p>
        <strong>Disconnect Stripe?</strong> Parents will no longer be able to pay online through
        intake forms for this agency. This does not delete your Stripe account.
      </p>
      <div class="stripe-actions">
        <button class="btn btn-danger" :disabled="disconnecting" @click="doDisconnect">
          {{ disconnecting ? 'Disconnecting…' : 'Yes, disconnect' }}
        </button>
        <button class="btn btn-outline" @click="showDisconnectConfirm = false">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true }
});

const emit = defineEmits(['status-changed']);

const loading = ref(true);
const error = ref('');
const status = ref('not_connected');
const chargesEnabled = ref(null);
const payoutsEnabled = ref(null);
const accountDisplayName = ref('');
const connecting = ref(false);
const disconnecting = ref(false);
const openingDashboard = ref(false);
const refreshing = ref(false);
const showDisconnectConfirm = ref(false);

async function loadStatus() {
  error.value = '';
  if (!props.agencyId) return;
  try {
    const res = await api.get(`/billing/${props.agencyId}/stripe/status`);
    status.value = res.data?.status || 'not_connected';
    chargesEnabled.value = res.data?.chargesEnabled ?? null;
    payoutsEnabled.value = res.data?.payoutsEnabled ?? null;
    accountDisplayName.value = res.data?.displayName || '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load Stripe status.';
  }
}

async function connectStripe() {
  error.value = '';
  connecting.value = true;
  try {
    const res = await api.post(`/billing/${props.agencyId}/stripe/connect`);
    const url = res.data?.onboardingUrl;
    if (!url) throw new Error('No onboarding URL returned from server.');
    window.location.href = url;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to start Stripe onboarding.';
    connecting.value = false;
  }
}

async function refreshStatus() {
  refreshing.value = true;
  try {
    await loadStatus();
    emit('status-changed', status.value);
  } finally {
    refreshing.value = false;
  }
}

async function openDashboard() {
  error.value = '';
  openingDashboard.value = true;
  try {
    const res = await api.get(`/billing/${props.agencyId}/stripe/dashboard-link`);
    const url = res.data?.url;
    if (!url) throw new Error('No dashboard URL returned.');
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to open Stripe dashboard.';
  } finally {
    openingDashboard.value = false;
  }
}

function confirmDisconnect() {
  showDisconnectConfirm.value = true;
}

async function doDisconnect() {
  error.value = '';
  disconnecting.value = true;
  try {
    await api.delete(`/billing/${props.agencyId}/stripe/disconnect`);
    status.value = 'not_connected';
    chargesEnabled.value = null;
    payoutsEnabled.value = null;
    accountDisplayName.value = '';
    showDisconnectConfirm.value = false;
    emit('status-changed', 'not_connected');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to disconnect Stripe.';
  } finally {
    disconnecting.value = false;
  }
}

onMounted(async () => {
  await loadStatus();
  loading.value = false;
});
</script>

<style scoped>
.stripe-connect-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stripe-connect-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stripe-connect-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stripe-connect-title-row h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.stripe-logo {
  width: 48px;
  height: 20px;
  fill: var(--text-primary, #1e293b);
  flex-shrink: 0;
}

.stripe-connect-desc {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  margin: 0;
  line-height: 1.5;
}

.stripe-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.stripe-status-hint {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
}

.stripe-account-name {
  font-size: 14px;
  font-weight: 500;
}

.stripe-details {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.stripe-detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.stripe-detail-item .label {
  color: var(--text-secondary, #64748b);
  font-weight: 500;
}

.stripe-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.stripe-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  color: #dc2626;
}

.stripe-disconnect-confirm {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stripe-disconnect-confirm p {
  margin: 0;
  font-size: 14px;
  color: #92400e;
}

/* Pills */
.pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}
.pill-on  { background: #dcfce7; color: #166534; }
.pill-off { background: #f1f5f9; color: #64748b; }
.pill-warn { background: #fef3c7; color: #92400e; }

/* Spinner */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border, #e2e8f0);
  border-top-color: var(--primary, #0f766e);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
.spinner--btn {
  border-color: rgba(255,255,255,0.3);
  border-top-color: #fff;
  margin-right: 6px;
  vertical-align: middle;
  width: 12px;
  height: 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Danger outline button */
.btn-danger-outline {
  color: var(--danger, #dc2626);
  border-color: var(--danger, #dc2626);
}
.btn-danger-outline:hover:not(:disabled) {
  background: #fef2f2;
}
</style>
