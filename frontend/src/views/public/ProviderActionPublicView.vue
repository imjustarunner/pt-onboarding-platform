<template>
  <div class="pa-public" :style="themeVars">
    <div v-if="loading" class="pa-msg muted">Opening your client list…</div>
    <div v-else-if="error" class="pa-msg">
      <p class="error">{{ error }}</p>
    </div>
    <template v-else>
      <section class="pa-card pa-hero-card">
        <div class="pa-accent" aria-hidden="true" />
        <header class="pa-brand">
          <img v-if="logoUrl" class="pa-brand-logo" :src="logoUrl" :alt="agencyName" />
          <div v-else class="pa-brand-wordmark">{{ agencyName }}</div>
        </header>

        <div class="pa-hero-grid">
          <div class="pa-hero-copy">
            <p class="pa-kicker">
              <img class="pa-kicker-icon" :src="assets.iconAlert" alt="" />
              Action required
            </p>
            <h1>
              {{ providerName }}, you have
              <span class="num">{{ clients.length }}</span>
              client{{ clients.length === 1 ? '' : 's' }} who need{{ clients.length === 1 ? 's' : '' }} your action.
            </h1>
            <p class="lede">
              Review each client and complete the required action. It only takes about
              <strong>{{ secondsPerClient }} seconds</strong> per client
              <template v-if="estimatedLabel"> — <strong>{{ estimatedLabel }}</strong> total</template>.
            </p>
          </div>
          <div class="pa-hero-frame">
            <img class="pa-hero-photo" :src="heroUrl" alt="" />
          </div>
        </div>

        <div class="pa-metrics">
          <div class="pa-metric">
            <div class="pa-metric-icon-wrap">
              <img :src="assets.iconTeam" alt="" />
            </div>
            <strong>{{ clients.length }}</strong>
            <span>Clients need your action</span>
          </div>
          <div class="pa-metric">
            <div class="pa-metric-icon-wrap">
              <img :src="assets.iconClock" alt="" />
            </div>
            <strong>{{ secondsPerClient }}s</strong>
            <span>Per client average</span>
          </div>
          <div class="pa-metric">
            <div class="pa-metric-icon-wrap">
              <img :src="assets.iconBadge" alt="" />
            </div>
            <strong>{{ estimatedLabel }}</strong>
            <span>Estimated time</span>
          </div>
        </div>

        <div class="pa-impact">
          <div class="pa-impact-copy">
            <div class="pa-impact-title">
              <img class="pa-impact-icon" :src="assets.iconCare" alt="" />
              <strong>Your work makes a difference</strong>
            </div>
            <p>
              Each quick update keeps schools informed and helps students get the support they need this year.
            </p>
          </div>
          <div class="pa-impact-art">
            <img class="pa-school-art" :src="assets.schoolGreen" alt="" />
            <img class="pa-checklist-icon" :src="assets.iconList" alt="" />
          </div>
        </div>

        <p class="expires muted">
          This secure link expires <strong>{{ expiresLabel }}</strong>. No Google sign-in needed.
        </p>
      </section>

      <section class="pa-list">
        <h2>
          <img class="pa-list-icon" :src="assets.iconTeam" alt="" />
          Your clients
        </h2>
        <p v-if="!clients.length" class="muted">You’re all caught up. Thank you.</p>
        <article v-for="row in clients" :key="row.id" class="pa-row">
          <div class="pa-row-icon-wrap" aria-hidden="true">
            <img :src="assets.iconList" alt="" />
          </div>
          <div class="pa-row-body">
            <div class="name">{{ rowLabel(row) }}</div>
            <div class="meta muted">
              {{ row.organization_name || 'School' }}
              <template v-if="row.service_day"> · {{ row.service_day }}</template>
            </div>
            <div class="action-label">
              <img class="action-icon" :src="assets.iconAlert" alt="" />
              {{ row.provider_lifecycle_action?.label || row.action_stage || 'Action needed' }}
            </div>
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
  background: #f4f1ea;
  padding: 28px 16px 48px;
  color: var(--pa-primary, #145A3D);
}
.pa-card,
.pa-list {
  max-width: 760px;
  margin: 0 auto 18px;
  background: #fff;
  border-radius: 24px;
  padding: 28px 26px;
  box-shadow: 0 10px 34px rgba(20, 90, 61, 0.08);
  position: relative;
}
.pa-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  border-radius: 24px 0 0 24px;
  background: linear-gradient(180deg, var(--pa-accent) 0%, var(--pa-primary) 100%);
}
.pa-hero-card {
  padding-left: 32px;
}
.pa-brand {
  text-align: center;
  margin-bottom: 14px;
}
.pa-brand-logo {
  max-height: 48px;
  max-width: 200px;
  object-fit: contain;
}
.pa-brand-wordmark {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--pa-primary);
}
.pa-hero-grid {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 16px;
  align-items: stretch;
  margin-bottom: 16px;
}
.pa-kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 800;
  color: var(--pa-accent);
  margin: 0 0 8px;
}
.pa-kicker-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.pa-hero-frame {
  border-radius: 18px;
  overflow: hidden;
  border: 3px solid rgba(90, 155, 88, 0.28);
  box-shadow: 0 10px 28px rgba(20, 90, 61, 0.14);
  min-height: 160px;
  background: linear-gradient(145deg, var(--pa-light), var(--pa-tan));
}
.pa-hero-photo {
  width: 100%;
  height: 100%;
  min-height: 160px;
  object-fit: cover;
  display: block;
}
h1 {
  font-family: Georgia, serif;
  font-size: 1.75rem;
  line-height: 1.2;
  margin: 0 0 10px;
  color: var(--pa-primary);
}
h1 .num {
  color: var(--pa-accent);
}
.lede {
  margin: 0;
  color: var(--pa-muted);
  line-height: 1.55;
  font-size: 0.95rem;
}
.pa-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  background: var(--pa-tan);
  border-radius: 16px;
  padding: 14px 8px 12px;
  text-align: center;
  margin-bottom: 14px;
}
.pa-metric-icon-wrap {
  width: 46px;
  height: 46px;
  margin: 0 auto 6px;
  background: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(20, 90, 61, 0.08);
}
.pa-metric-icon-wrap img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}
.pa-metrics strong {
  display: block;
  font-size: 1.35rem;
  color: var(--pa-primary);
}
.pa-metrics span {
  display: block;
  font-size: 12px;
  color: var(--pa-muted);
  line-height: 1.3;
  margin-top: 2px;
}
.pa-impact {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 10px;
  align-items: center;
  background: linear-gradient(135deg, var(--pa-light) 0%, #f0faf0 100%);
  border-radius: 16px;
  padding: 14px 16px;
  margin-bottom: 12px;
  border: 1px solid rgba(90, 155, 88, 0.18);
}
.pa-impact-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.pa-impact-icon {
  width: 26px;
  height: 26px;
  object-fit: contain;
}
.pa-impact-copy p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--pa-muted);
}
.pa-impact-art {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 72px;
}
.pa-school-art {
  max-width: 88%;
  max-height: 78px;
  object-fit: contain;
}
.pa-checklist-icon {
  position: absolute;
  right: 0;
  bottom: -4px;
  width: 36px;
  height: 36px;
  object-fit: contain;
  background: #fff;
  border-radius: 50%;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(20, 90, 61, 0.12);
}
.expires {
  margin: 0;
  font-size: 13px;
}
.pa-list h2 {
  margin: 0 0 12px;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--pa-primary);
}
.pa-list-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.pa-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid #eef2ee;
}
.pa-row-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--pa-light);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pa-row-icon-wrap img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}
.pa-row-body {
  flex: 1;
  min-width: 0;
}
.name {
  font-weight: 800;
}
.action-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #b45309;
  font-weight: 650;
  margin-top: 2px;
}
.action-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.btn.primary {
  border: none;
  background: linear-gradient(135deg, var(--pa-primary) 0%, #0d4a31 100%);
  color: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(20, 90, 61, 0.2);
}
.pa-msg {
  max-width: 640px;
  margin: 48px auto;
  text-align: center;
}
.error {
  color: #b91c1c;
}
.muted {
  color: #64748b;
}
@media (max-width: 640px) {
  .pa-hero-grid,
  .pa-impact {
    grid-template-columns: 1fr;
  }
  .pa-hero-frame {
    min-height: 140px;
  }
  .pa-row {
    flex-wrap: wrap;
  }
  .btn.primary {
    width: 100%;
    margin-top: 4px;
  }
}
</style>
