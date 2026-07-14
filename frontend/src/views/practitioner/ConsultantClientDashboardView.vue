<template>
  <PractitionerShell
    org-type="consultant"
    :is-client="true"
    :organization-slug="slug"
    :brand-title="brandTitle"
    :greeting="greeting"
    tagline="Here's what's happening with your engagement."
    footer-quote="Clarity compounds. Show up for the work."
    active-nav-id="dashboard"
    :unread-messages="unreadMessages"
  >
    <p v-if="loadError" class="error-banner">{{ loadError }}</p>

    <section class="kpi-row four">
      <article class="kpi-card">
        <div class="kpi-label">Sessions left</div>
        <div class="kpi-value">{{ loading ? '…' : (overview.balance?.remaining ?? 0) }}</div>
        <div class="kpi-trend">{{ activePackage?.packageName || 'No active package' }}</div>
      </article>
      <article class="kpi-card">
        <div class="kpi-label">Package progress</div>
        <div class="kpi-value">{{ loading ? '…' : (activePackage?.sessionLabel || '—') }}</div>
        <div class="kpi-trend">{{ activePackage?.paymentMode || '' }}</div>
      </article>
      <article class="kpi-card">
        <div class="kpi-label">Upcoming</div>
        <div class="kpi-value">{{ upcoming.length }}</div>
        <div class="kpi-trend">On your calendar</div>
      </article>
      <article class="kpi-card">
        <div class="kpi-label">Payments</div>
        <div class="kpi-value">{{ overview.payments?.length || 0 }}</div>
        <div class="kpi-trend">On file</div>
      </article>
    </section>

    <section v-if="overview.continuation?.exhausted" class="card warn-card">
      <h2>Continue consulting</h2>
      <p class="muted">Your package sessions are used up. Ask your consultant to send a re-up, new package, or pay-per-session option.</p>
      <div class="cta-row">
        <button type="button" class="ps-btn primary" @click="scrollTo('packages')">View packages</button>
      </div>
    </section>

    <section class="grid-2">
      <article id="sessions" class="card">
        <div class="card-head"><h2>Upcoming sessions</h2></div>
        <p v-if="loading" class="muted">Loading…</p>
        <p v-else-if="!upcoming.length" class="muted">No upcoming sessions scheduled.</p>
        <ul v-else class="session-list">
          <li v-for="s in upcoming" :key="s.id">
            <div class="title">{{ s.sessionOfLabel || s.title }}</div>
            <div class="meta">{{ formatWhen(s.startAt) }}</div>
            <div v-if="s.packageName" class="meta">
              Package:
              <a href="#packages" @click.prevent="scrollTo('packages')">{{ s.packageName }}</a>
            </div>
            <div v-if="s.payment" class="meta">
              Payment:
              <a href="#payments" @click.prevent="scrollTo('payments')">
                {{ formatMoney(s.payment.amountCents) }} · {{ s.payment.paymentMode }}
              </a>
            </div>
          </li>
        </ul>
      </article>

      <article id="packages" class="card">
        <div class="card-head"><h2>Your packages</h2></div>
        <p v-if="loading" class="muted">Loading…</p>
        <p v-else-if="!overview.entitlements?.length" class="muted">No packages yet.</p>
        <ul v-else class="session-list">
          <li v-for="e in overview.entitlements" :key="e.id">
            <div class="title">{{ e.packageName }}</div>
            <div class="meta">{{ e.sessionLabel }} · {{ e.status }}</div>
            <div class="meta">Chosen/activated {{ formatWhen(e.activatedAt) }}</div>
          </li>
        </ul>
      </article>
    </section>

    <section id="payments" class="card" style="margin-top: 1rem;">
      <div class="card-head"><h2>Payments</h2></div>
      <p v-if="loading" class="muted">Loading…</p>
      <p v-else-if="!overview.payments?.length" class="muted">No payments yet.</p>
      <ul v-else class="session-list">
        <li v-for="p in overview.payments" :key="p.id">
          <div class="title">{{ formatMoney(p.amountCents) }} · {{ p.paymentStatus }}</div>
          <div class="meta">
            {{ p.packageName || 'Package' }} · {{ p.paymentMode }}
            <template v-if="p.sessionsCovered"> · {{ p.sessionsCovered }} session(s)</template>
          </div>
          <div class="meta">
            Chosen {{ formatWhen(p.chosenAt) }} · Signed {{ formatWhen(p.signedAt) }} · Paid {{ formatWhen(p.paidAt) }}
          </div>
          <div v-if="p.entitlementId" class="meta">
            <a href="#packages" @click.prevent="scrollTo('packages')">View package →</a>
          </div>
        </li>
      </ul>
    </section>

    <section id="goals" class="card" style="margin-top: 1rem;">
      <div class="card-head"><h2>Life Balance & Goals</h2></div>
      <p v-if="lbwLoading" class="muted">Loading…</p>
      <template v-else-if="latestLbw">
        <p class="muted">
          Latest assessment:
          <strong>{{ latestLbw.status }}</strong>
          <template v-if="latestLbw.summary?.average != null"> · avg {{ latestLbw.summary.average }}</template>
        </p>
        <div class="cta-row">
          <router-link
            v-if="latestLbw.accessToken"
            class="ps-btn primary"
            :to="`/${slug}/life-balance/${latestLbw.accessToken}`"
          >
            View wheel
          </router-link>
        </div>
      </template>
      <p v-else class="muted">No Life Balance Wheel yet. Ask your consultant to assign one, or open a shared link.</p>
    </section>

    <section id="messages" class="card coming-soon" style="margin-top: 1rem;">
      <div class="card-head"><h2>Messages</h2></div>
      <p class="muted">Coming soon — messaging with your consultant will live here.</p>
    </section>

    <section id="settings" class="card coming-soon" style="margin-top: 1rem;">
      <div class="card-head"><h2>Settings</h2></div>
      <p class="muted">Coming soon — account preferences will live here.</p>
    </section>
  </PractitionerShell>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import PractitionerShell from '../../layouts/PractitionerShell.vue';
import api from '../../services/api';

const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const slug = computed(() => String(route.params.organizationSlug || ''));

const brandTitle = computed(
  () => agencyStore.currentAgency?.name || agencyStore.currentAgency?.value?.name || 'Consulting'
);

const greeting = computed(() => {
  const name = authStore.user?.first_name || authStore.user?.firstName || 'there';
  return `Welcome back, ${name}`;
});

const loading = ref(true);
const loadError = ref('');
const unreadMessages = ref(0);
const lbwLoading = ref(false);
const latestLbw = ref(null);
const overview = ref({
  balance: {},
  entitlements: [],
  payments: [],
  sessions: [],
  continuation: {}
});

const activePackage = computed(
  () => (overview.value.entitlements || []).find((e) => e.status === 'ACTIVE') || overview.value.entitlements?.[0] || null
);

const upcoming = computed(() => {
  const now = Date.now();
  return (overview.value.sessions || [])
    .filter((s) => {
      const t = new Date(s.startAt).getTime();
      return Number.isFinite(t) && t >= now - 60 * 60 * 1000;
    })
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    .slice(0, 8);
});

function formatMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(Number(cents || 0) % 100 === 0 ? 0 : 2)}`;
}
function formatWhen(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleString();
}
function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function scrollToHash() {
  const hash = String(route.hash || '').replace(/^#/, '');
  if (!hash) return;
  await nextTick();
  scrollTo(hash);
}

function resolveAgencyId() {
  return Number(
    agencyStore.currentAgency?.id
    || agencyStore.currentAgency?.value?.id
    || authStore.user?.agencyId
    || authStore.user?.agencies?.[0]?.id
    || 0
  );
}

async function loadUnread(agencyId) {
  try {
    const res = await api.get('/chat/threads', {
      params: agencyId ? { agencyId } : undefined
    });
    const threads = Array.isArray(res.data) ? res.data : (res.data?.threads || []);
    unreadMessages.value = (threads || []).reduce(
      (sum, t) => sum + Number(t.unread_count || t.unreadCount || 0),
      0
    );
  } catch {
    unreadMessages.value = 0;
  }
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const agencyId = resolveAgencyId();
    const [clientsRes] = await Promise.all([
      api.get('/guardian-portal/clients').catch(() => ({ data: [] })),
      loadUnread(agencyId)
    ]);
    const clients = Array.isArray(clientsRes.data) ? clientsRes.data : (clientsRes.data?.clients || []);
    const clientId = Number(clients[0]?.id || clients[0]?.client_id || 0);
    if (!agencyId || !clientId) {
      overview.value = { balance: {}, entitlements: [], payments: [], sessions: [], continuation: {} };
      return;
    }
    const res = await api.get(`/practitioner-packages/clients/${clientId}/package-overview`, {
      params: { agencyId }
    });
    overview.value = {
      balance: res.data?.balance || {},
      entitlements: res.data?.entitlements || [],
      payments: res.data?.payments || [],
      sessions: res.data?.sessions || [],
      continuation: res.data?.continuation || {}
    };
    lbwLoading.value = true;
    try {
      const lbwRes = await api.get(`/life-balance/subjects/clients/${clientId}/assessments`, {
        params: { agencyId }
      });
      latestLbw.value = (lbwRes.data?.assessments || [])[0] || null;
    } catch {
      latestLbw.value = null;
    } finally {
      lbwLoading.value = false;
    }
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || e.message || 'Could not load dashboard';
    overview.value = { balance: {}, entitlements: [], payments: [], sessions: [], continuation: {} };
  } finally {
    loading.value = false;
    await scrollToHash();
  }
}

onMounted(load);
watch(() => route.hash, scrollToHash);
</script>

<style src="./practitionerShared.css"></style>
<style scoped>
.warn-card { border-color: rgba(180, 83, 9, 0.35); background: rgba(251, 191, 36, 0.08); margin-bottom: 1rem; }
.cta-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.session-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.session-list .title { font-weight: 700; }
.session-list .meta { font-size: 0.82rem; color: #64748b; margin-top: 0.15rem; }
.session-list a { color: #1b4332; font-weight: 700; }
.coming-soon { opacity: 0.92; }
.error-banner {
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: rgba(185, 28, 28, 0.08);
  color: #991b1b;
  font-size: 0.9rem;
}
.kpi-row.four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
@media (max-width: 1100px) {
  .kpi-row.four {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
