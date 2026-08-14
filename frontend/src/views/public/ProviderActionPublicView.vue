<template>
  <div class="pa-public">
    <div v-if="loading" class="pa-msg muted">Opening your client list…</div>
    <div v-else-if="error" class="pa-msg">
      <p class="error">{{ error }}</p>
    </div>
    <template v-else>
      <section class="pa-card">
        <p class="pa-kicker">Action required</p>
        <h1>
          {{ providerName }}, you have
          <span class="num">{{ clients.length }}</span>
          client{{ clients.length === 1 ? '' : 's' }} who need your action.
        </h1>
        <p class="lede">
          Review each client and complete the required action. It only takes about
          <strong>15 seconds</strong> per client
          <template v-if="estimatedLabel"> — {{ estimatedLabel }} total</template>.
        </p>
        <div class="pa-metrics">
          <div><strong>{{ clients.length }}</strong><span>Clients</span></div>
          <div><strong>15s</strong><span>Per client</span></div>
          <div><strong>{{ estimatedLabel }}</strong><span>Estimated time</span></div>
        </div>
        <p class="expires muted">This secure link expires {{ expiresLabel }}. No Google sign-in needed.</p>
      </section>

      <section class="pa-list">
        <h2>Your clients</h2>
        <p v-if="!clients.length" class="muted">You’re all caught up. Thank you.</p>
        <article v-for="row in clients" :key="row.id" class="pa-row">
          <div>
            <div class="name">{{ rowLabel(row) }}</div>
            <div class="meta muted">
              {{ row.organization_name || 'School' }}
              <template v-if="row.service_day"> · {{ row.service_day }}</template>
            </div>
            <div class="action-label">{{ row.provider_lifecycle_action?.label || row.action_stage || 'Action needed' }}</div>
          </div>
          <button type="button" class="btn primary" @click="openAction(row)">Complete</button>
        </article>
      </section>
    </template>

    <LifecycleActionModal
      v-if="lifecycleClient && lifecycleActionKey"
      :client="lifecycleClient"
      :action-key="lifecycleActionKey"
      :action-label="lifecycleActionLabel"
      :api-base="apiBase"
      :actor-user-id="providerUserId"
      @close="closeAction"
      @saved="onSaved"
    />
    <QuickChecklistModal
      v-if="checklistClient"
      :client="checklistClient"
      :api-base="apiBase"
      @close="checklistClient = null"
      @saved="onSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import LifecycleActionModal from '../../components/school/LifecycleActionModal.vue';
import QuickChecklistModal from '../../components/school/QuickChecklistModal.vue';

const route = useRoute();
const token = computed(() => String(route.params.token || '').replace(/[^a-fA-F0-9]/g, ''));
const apiBase = computed(() => `/public/provider-action/${encodeURIComponent(token.value)}`);

const loading = ref(true);
const error = ref('');
const clients = ref([]);
const providerName = ref('there');
const providerUserId = ref(0);
const estimatedLabel = ref('~ 0s');
const expiresAt = ref(null);
const lifecycleClient = ref(null);
const lifecycleActionKey = ref('');
const lifecycleActionLabel = ref('');
const checklistClient = ref(null);
let heartbeatTimer = null;
let opened = false;

const expiresLabel = computed(() => {
  if (!expiresAt.value) return 'in 24 hours';
  const d = new Date(expiresAt.value);
  if (!Number.isFinite(d.getTime())) return 'in 24 hours';
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
});

function rowLabel(row) {
  return row?.full_name || row?.initials || row?.identifier_code || `Client ${row?.id}`;
}

function reqOpts() {
  return { skipAuthRedirect: true, skipGlobalLoading: true };
}

async function load(open = false) {
  loading.value = true;
  error.value = '';
  try {
    const path = open ? `${apiBase.value}/open` : apiBase.value;
    const res = open
      ? await api.post(path, {}, reqOpts())
      : await api.get(path, reqOpts());
    const data = res.data || {};
    clients.value = Array.isArray(data.clients) ? data.clients : [];
    providerName.value = data.provider?.firstName || data.provider?.displayName || 'there';
    providerUserId.value = Number(data.provider?.id || 0);
    estimatedLabel.value = data.estimatedLabel || '~ 0s';
    expiresAt.value = data.link?.expiresAt || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'This link is invalid or expired.';
    clients.value = [];
  } finally {
    loading.value = false;
  }
}

async function heartbeat() {
  if (document.visibilityState !== 'visible') return;
  try {
    await api.post(`${apiBase.value}/session-heartbeat`, { visible: true }, reqOpts());
  } catch {
    /* ignore */
  }
}

function openAction(row) {
  const key = row?.provider_lifecycle_action?.actionKey || '';
  if (key === 'provider_intake') {
    checklistClient.value = row;
    return;
  }
  if (!key) return;
  lifecycleClient.value = row;
  lifecycleActionKey.value = key;
  lifecycleActionLabel.value = row.provider_lifecycle_action?.label || 'Next step';
}

function closeAction() {
  lifecycleClient.value = null;
  lifecycleActionKey.value = '';
  lifecycleActionLabel.value = '';
}

async function onSaved() {
  closeAction();
  checklistClient.value = null;
  await load(false);
}

onMounted(async () => {
  if (!opened) {
    opened = true;
    await load(true);
  }
  heartbeat();
  heartbeatTimer = setInterval(heartbeat, 60000);
  document.addEventListener('visibilitychange', heartbeat);
});

onUnmounted(() => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  document.removeEventListener('visibilitychange', heartbeat);
  heartbeat();
});
</script>

<style scoped>
.pa-public {
  min-height: 100vh;
  background: #f4f1ea;
  padding: 28px 16px 48px;
  color: #145A3D;
}
.pa-card, .pa-list {
  max-width: 720px;
  margin: 0 auto 18px;
  background: #fff;
  border-radius: 24px;
  padding: 28px 26px;
  box-shadow: 0 8px 30px rgba(20, 90, 61, 0.06);
}
.pa-kicker {
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 800;
  color: #5A9B58;
  margin: 0 0 8px;
}
h1 {
  font-family: Georgia, serif;
  font-size: 1.8rem;
  line-height: 1.2;
  margin: 0 0 10px;
}
h1 .num { color: #5A9B58; }
.lede { margin: 0 0 18px; color: #3f5f4c; }
.pa-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  background: #f6f1e6;
  border-radius: 16px;
  padding: 14px 8px;
  text-align: center;
}
.pa-metrics strong { display: block; font-size: 1.35rem; }
.pa-metrics span { font-size: 12px; color: #5b7164; }
.expires { margin: 14px 0 0; font-size: 13px; }
.pa-list h2 { margin: 0 0 12px; font-size: 1.1rem; }
.pa-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid #eef2ee;
}
.name { font-weight: 800; }
.action-label { font-size: 13px; color: #b45309; font-weight: 650; margin-top: 2px; }
.btn.primary {
  border: none;
  background: #145A3D;
  color: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}
.pa-msg { max-width: 640px; margin: 48px auto; text-align: center; }
.error { color: #b91c1c; }
.muted { color: #64748b; }
</style>
