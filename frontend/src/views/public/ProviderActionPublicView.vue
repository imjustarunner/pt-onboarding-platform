<template>
  <div class="pa-public" :style="themeVars">
    <div v-if="loading" class="pa-msg muted">Opening your client list…</div>
    <div v-else-if="error" class="pa-msg">
      <p class="error">{{ error }}</p>
    </div>
    <template v-else>
      <header class="pa-brand">
        <img v-if="logoUrl" class="pa-brand-logo" :src="logoUrl" :alt="agencyName" />
        <div v-else class="pa-brand-wordmark">{{ agencyName }}</div>
      </header>

      <div class="pa-hero">
        <img :src="heroUrl" alt="" />
      </div>

      <section class="pa-body">
        <p class="pa-kicker">Action required</p>
        <h1>
          {{ providerName }}, you have
          <span class="num">{{ clients.length }}</span>
          client{{ clients.length === 1 ? '' : 's' }} who need{{ clients.length === 1 ? 's' : '' }} your action.
        </h1>
        <p class="lede">
          About <strong>{{ secondsPerClient }} seconds</strong> per client
          <template v-if="estimatedLabel"> — {{ estimatedLabel }} total</template>.
          No Google sign-in.
        </p>

        <div class="pa-stats">
          <div class="pa-stat">
            <img :src="assets.iconTeam" alt="" />
            <strong>{{ clients.length }}</strong>
            <span>Clients</span>
          </div>
          <div class="pa-stat">
            <img :src="assets.iconClock" alt="" />
            <strong>{{ secondsPerClient }}s</strong>
            <span>Each</span>
          </div>
          <div class="pa-stat">
            <img :src="assets.iconBadge" alt="" />
            <strong>{{ estimatedLabel }}</strong>
            <span>Total time</span>
          </div>
        </div>
      </section>

      <section class="pa-list">
        <h2>Your clients</h2>
        <p v-if="!clients.length" class="muted">You’re all caught up. Thank you.</p>
        <article v-for="row in clients" :key="row.id" class="pa-row">
          <div class="pa-row-body">
            <div class="name">{{ rowLabel(row) }}</div>
            <div class="meta muted">
              {{ row.organization_name || 'School' }}
              <template v-if="row.service_day"> · {{ row.service_day }}</template>
            </div>
            <div class="action-label">
              {{ row.provider_lifecycle_action?.label || row.action_stage || 'Action needed' }}
            </div>
          </div>
          <button type="button" class="btn primary" @click="openAction(row)">Complete</button>
        </article>
        <p class="expires muted">This link expires {{ expiresLabel }}.</p>
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

const DEFAULT_ASSETS = {
  heroItsco: '/assets/careers/heroes/itsco-framed.png',
  heroNlu: '/assets/careers/heroes/nlu-framed.png',
  schoolGreen: '/assets/provider-action/school-green.png',
  fallbackLogo: '/assets/provider-action/itsco-logo.png',
  iconTeam: '/assets/careers/icons/page1/team.png',
  iconClock: '/assets/careers/icons/page1/clock.png',
  iconCare: '/assets/careers/icons/page1/care.png',
  iconBadge: '/assets/careers/icons/page2/badge.png',
  iconAlert: '/assets/careers/icons/page2/alert.png',
  iconList: '/assets/careers/icons/page1/list.png'
};

const route = useRoute();
const token = computed(() => String(route.params.token || '').replace(/[^a-fA-F0-9]/g, ''));
const apiBase = computed(() => `/public/provider-action/${encodeURIComponent(token.value)}`);

const loading = ref(true);
const error = ref('');
const clients = ref([]);
const providerName = ref('there');
const providerUserId = ref(0);
const estimatedLabel = ref('~ 0s');
const secondsPerClient = ref(15);
const expiresAt = ref(null);
const branding = ref(null);
const lifecycleClient = ref(null);
const lifecycleActionKey = ref('');
const lifecycleActionLabel = ref('');
const checklistClient = ref(null);
let heartbeatTimer = null;
let opened = false;

const assets = computed(() => ({
  ...DEFAULT_ASSETS,
  ...(branding.value?.assets || {})
}));

const palette = computed(() => branding.value?.palette || {
  primary: '#145A3D',
  accent: '#5A9B58',
  light: '#E8F5E9',
  tan: '#F6F1E6',
  muted: '#5B7164'
});

const agencyName = computed(() => branding.value?.agencyName || 'ITSCO');
const logoUrl = computed(() => branding.value?.logoUrl || assets.value.fallbackLogo);
const heroUrl = computed(() => branding.value?.assets?.heroUrl || assets.value.heroItsco);

const themeVars = computed(() => ({
  '--pa-primary': palette.value.primary,
  '--pa-accent': palette.value.accent,
  '--pa-light': palette.value.light,
  '--pa-tan': palette.value.tan,
  '--pa-muted': palette.value.muted
}));

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
    secondsPerClient.value = Number(data.secondsPerClient) || 15;
    expiresAt.value = data.link?.expiresAt || null;
    branding.value = data.branding || null;
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
  max-width: 480px;
  margin: 0 auto;
  background: #fff;
  color: var(--pa-primary, #145A3D);
  border-top: 8px solid var(--pa-primary, #145A3D);
}
.pa-brand {
  text-align: center;
  padding: 16px 20px 12px;
}
.pa-brand-logo {
  max-height: 48px;
  max-width: 200px;
  object-fit: contain;
}
.pa-brand-wordmark {
  font-size: 1.35rem;
  font-weight: 800;
}
.pa-hero {
  height: 180px;
  overflow: hidden;
  background: var(--pa-light);
}
.pa-hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pa-body,
.pa-list {
  padding: 18px 20px 8px;
}
.pa-kicker {
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 800;
  color: var(--pa-accent);
  margin: 0 0 8px;
}
h1 {
  font-family: Georgia, serif;
  font-size: 1.55rem;
  line-height: 1.2;
  margin: 0 0 10px;
}
h1 .num {
  color: var(--pa-accent);
}
.lede {
  margin: 0 0 16px;
  color: var(--pa-muted);
  line-height: 1.5;
}
.pa-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  text-align: center;
  padding-bottom: 8px;
}
.pa-stat img {
  width: 24px;
  height: 24px;
  object-fit: contain;
  display: block;
  margin: 0 auto 4px;
}
.pa-stat strong {
  display: block;
  font-size: 1.2rem;
}
.pa-stat span {
  display: block;
  font-size: 11px;
  color: var(--pa-muted);
}
.pa-list h2 {
  margin: 8px 0 4px;
  font-size: 1.05rem;
}
.pa-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px 0;
  border-top: 1px solid #eef2ee;
}
.pa-row-body {
  flex: 1;
  min-width: 0;
}
.name {
  font-weight: 800;
}
.action-label {
  font-size: 13px;
  color: #b45309;
  font-weight: 650;
  margin-top: 2px;
}
.btn.primary {
  border: none;
  background: var(--pa-primary);
  color: #fff;
  border-radius: 12px;
  padding: 12px 16px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  min-height: 44px;
}
.expires {
  margin: 16px 0 24px;
  font-size: 13px;
}
.pa-msg {
  padding: 48px 20px;
  text-align: center;
}
.error {
  color: #b91c1c;
}
.muted {
  color: #64748b;
}
@media (min-width: 640px) {
  .pa-public {
    margin: 24px auto 48px;
    box-shadow: 0 12px 40px rgba(20, 90, 61, 0.1);
    border-radius: 0 0 16px 16px;
  }
}
</style>
