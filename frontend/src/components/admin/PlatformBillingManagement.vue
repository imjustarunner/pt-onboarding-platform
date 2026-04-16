<template>
  <div class="platform-billing">
    <div class="section-header">
      <h2>Platform Billing</h2>
      <p class="section-description">
        Set up how tenants pay the platform for subscriptions and features. This is separate from each tenant's own client or guardian payment setup.
      </p>
    </div>

    <div class="card hero-card">
      <div>
        <h3>How this works</h3>
        <p class="muted">
          When a tenant chooses <strong>Use platform billing</strong>, their platform subscription, feature charges,
          invoices, receipts, and saved billing cards can run through your platform merchant instead of the tenant's own account.
        </p>
      </div>
      <div class="choice-grid">
        <div class="choice-card">
          <div class="choice-label">Use platform billing</div>
          <div class="choice-copy">Tenant pays you through your platform Stripe or platform QuickBooks connection.</div>
        </div>
        <div class="choice-card">
          <div class="choice-label">Use tenant billing account</div>
          <div class="choice-copy">Tenant uses their own merchant account to pay for platform billing.</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Platform Stripe</h3>
      <p class="muted">
        Recommended for platform subscription billing. This is your platform Stripe setup, not the tenant's Stripe Connect account for taking payments from their own customers.
      </p>
      <div class="status-grid">
        <div>
          <div class="label">Status</div>
          <div class="value">
            <span :class="['pill', stripeStatus.configured ? 'pill-on' : 'pill-off']">
              {{ stripeStatus.configured ? 'Ready' : 'Not configured' }}
            </span>
          </div>
        </div>
        <div>
          <div class="label">Publishable key</div>
          <div class="value mono">{{ stripeStatus.publishableKeyPreview || 'Missing' }}</div>
        </div>
        <div>
          <div class="label">Use case</div>
          <div class="value">Tenant subscription billing and feature billing paid to the platform</div>
        </div>
      </div>
      <div v-if="stripeError" class="error">{{ stripeError }}</div>
      <p class="hint">{{ stripeStatus.message }}</p>
    </div>

    <div class="card">
      <h3>Platform QuickBooks</h3>
      <p class="muted">
        Optional alternative platform merchant if you want tenants to pay platform billing through your platform QuickBooks connection instead of Stripe.
      </p>
      <div class="status-grid">
        <div>
          <div class="label">Connection</div>
          <div class="value">
            <span :class="['pill', platformQboStatus?.isConnected ? 'pill-on' : 'pill-off']">
              {{ platformQboStatus?.isConnected ? 'Connected' : 'Not connected' }}
            </span>
          </div>
        </div>
        <div>
          <div class="label">Payments</div>
          <div class="value">
            <span :class="['pill', platformQboStatus?.paymentsEnabled ? 'pill-on' : 'pill-off']">
              {{ platformQboStatus?.paymentsEnabled ? 'Payments ready' : 'Reconnect required' }}
            </span>
          </div>
        </div>
        <div>
          <div class="label">Merchant Controls</div>
          <div class="inline">
            <button
              v-if="!platformQboStatus?.isConnected || platformQboStatus?.needsReconnectForPayments"
              class="btn"
              :disabled="connectingPlatformQbo"
              @click="connectPlatformQuickBooks"
            >
              {{ connectingPlatformQbo ? 'Redirecting…' : (platformQboStatus?.needsReconnectForPayments ? 'Reconnect For Payments' : 'Connect QuickBooks') }}
            </button>
            <button
              v-else
              class="btn btn-danger"
              :disabled="disconnectingPlatformQbo"
              @click="disconnectPlatformQuickBooks"
            >
              {{ disconnectingPlatformQbo ? 'Disconnecting…' : 'Disconnect' }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="quickbooksError" class="error">{{ quickbooksError }}</div>
    </div>

    <div class="card">
      <h3>What tenants see</h3>
      <p class="muted">
        In each tenant's Billing screen, you can now choose whether they use your platform billing or their own billing account.
      </p>
      <div class="tenant-flow-grid">
        <div class="tenant-flow-card">
          <div class="tenant-flow-title">Use platform billing</div>
          <div class="tenant-flow-copy">Tenant pays the platform through your Stripe or QuickBooks merchant.</div>
        </div>
        <div class="tenant-flow-card">
          <div class="tenant-flow-title">Provider</div>
          <div class="tenant-flow-copy">Choose Stripe or QuickBooks for the platform billing path.</div>
        </div>
        <div class="tenant-flow-card">
          <div class="tenant-flow-title">Client payments stay separate</div>
          <div class="tenant-flow-copy">Their own Stripe Connect setup for parents or customers is still separate from paying you.</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const stripeStatus = ref({
  configured: false,
  publishableKeyPreview: null,
  message: 'Loading platform Stripe status…'
});
const platformQboStatus = ref(null);
const stripeError = ref('');
const quickbooksError = ref('');
const connectingPlatformQbo = ref(false);
const disconnectingPlatformQbo = ref(false);

const loadPlatformStripeStatus = async () => {
  stripeError.value = '';
  try {
    const res = await api.get('/billing/platform/stripe/status');
    stripeStatus.value = {
      configured: res.data?.configured === true,
      publishableKeyPreview: res.data?.publishableKeyPreview || null,
      message: res.data?.message || 'Platform Stripe status loaded.'
    };
  } catch (e) {
    stripeError.value = e?.response?.data?.error?.message || 'Failed to load platform Stripe status';
  }
};

const loadPlatformQboStatus = async () => {
  quickbooksError.value = '';
  try {
    const res = await api.get('/billing/platform/quickbooks/status');
    platformQboStatus.value = res.data || null;
  } catch (e) {
    quickbooksError.value = e?.response?.data?.error?.message || 'Failed to load platform QuickBooks status';
  }
};

const connectPlatformQuickBooks = async () => {
  quickbooksError.value = '';
  connectingPlatformQbo.value = true;
  try {
    const res = await api.get('/billing/platform/quickbooks/connect');
    const authUrl = res.data?.authUrl;
    if (!authUrl) throw new Error('Missing QuickBooks authUrl');
    window.location.href = authUrl;
  } catch (e) {
    quickbooksError.value = e?.response?.data?.error?.message || e?.message || 'Failed to start platform QuickBooks connection';
    connectingPlatformQbo.value = false;
  }
};

const disconnectPlatformQuickBooks = async () => {
  quickbooksError.value = '';
  disconnectingPlatformQbo.value = true;
  try {
    await api.post('/billing/platform/quickbooks/disconnect');
    await loadPlatformQboStatus();
  } catch (e) {
    quickbooksError.value = e?.response?.data?.error?.message || 'Failed to disconnect platform QuickBooks';
  } finally {
    disconnectingPlatformQbo.value = false;
  }
};

onMounted(async () => {
  await Promise.all([loadPlatformStripeStatus(), loadPlatformQboStatus()]);
});
</script>

<style scoped>
.platform-billing {
  width: 100%;
}

.section-header {
  margin-bottom: 24px;
}

.section-header h2 {
  margin: 0 0 8px 0;
}

.section-description {
  margin: 0;
  color: var(--text-secondary);
}

.card {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px;
  margin-bottom: 16px;
}

.hero-card {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(16, 185, 129, 0.06));
}

.card h3 {
  margin: 0 0 8px 0;
}

.muted {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
}

.hint {
  margin: 12px 0 0 0;
  color: var(--text-secondary);
}

.status-grid,
.choice-grid,
.tenant-flow-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.choice-grid {
  margin-top: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.choice-card,
.tenant-flow-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  padding: 14px;
}

.choice-label,
.tenant-flow-title {
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.choice-copy,
.tenant-flow-copy,
.value {
  color: var(--text-primary);
}

.label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.inline {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--primary);
  color: white;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.btn-danger {
  background: transparent;
  color: var(--danger, #dc2626);
  border-color: var(--danger, #dc2626);
}

.pill {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--border);
}

.pill-on {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
}

.pill-off {
  background: rgba(107, 114, 128, 0.12);
  border-color: rgba(107, 114, 128, 0.35);
}

.error {
  margin-top: 10px;
  color: var(--danger, #dc2626);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

@media (max-width: 900px) {
  .status-grid,
  .tenant-flow-grid,
  .choice-grid {
    grid-template-columns: 1fr;
  }

  .inline {
    flex-wrap: wrap;
  }
}
</style>
