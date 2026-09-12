<template>
  <PractitionerShell
    org-type="life_coach"
    :is-client="true"
    :organization-slug="slug"
    :brand-title="brandTitle"
    :greeting="greeting"
    tagline="Here's what's happening with your journey."
    footer-quote="The future is created by what you do today. — Not tomorrow."
    active-nav-id="dashboard"
    :unread-messages="unreadMessages"
  >
    <p v-if="loadError" class="error-banner">{{ loadError }}</p>

    <section class="journey-summary">
      <div class="journey-person"><span>{{ clientInitials }}</span><div><h2>{{ selectedClientName || clientUserName }}</h2><p>Life coaching</p><label v-if="linkedClients.length > 1">Viewing client<select v-model="selectedClientId" @change="load"><option v-for="client in linkedClients" :value="Number(client.client_id || client.id)" :key="client.client_id || client.id">{{ client.full_name || client.initials }}</option></select></label></div></div>
      <div><PortalIcon class="journey-icon" name="sessions" /><h3>Next session</h3><p>{{ upcoming[0] ? formatWhen(upcoming[0].startAt) : 'No upcoming session' }}</p><button @click="openSection('sessions')">View sessions →</button></div>
      <div><PortalIcon class="journey-icon" name="plan" /><h3>Your program</h3><p>{{ activePackage?.packageName || 'No active package' }}</p><button @click="openSection('packages')">View packages →</button></div>
      <div><PortalIcon class="journey-icon" name="tasks" /><h3>Sessions remaining</h3><p>{{ loading ? 'Loading…' : overview.balance?.remaining ?? 'Not available' }}</p><button @click="openSection('payments')">Invoices &amp; receipts →</button></div>
    </section>
    <div class="journey-content" :class="{'journey-content--dashboard':currentSection==='dashboard'}">
    <section v-if="overview.continuation?.exhausted" class="card warn-card">
      <h2>Continue coaching</h2>
      <p class="muted">Your package sessions are used up. You can re-up, get a new package offer, or switch to pay-per-session.</p>
      <div class="cta-row">
        <button type="button" class="ps-btn primary" @click="scrollTo('packages')">View packages</button>
        <p class="muted tiny">Ask your coach to send a re-up or new package packet, or a pay-per-session option.</p>
      </div>
    </section>

    <section v-if="['dashboard','sessions','packages'].includes(currentSection)" class="grid-2">
      <article v-if="currentSection !== 'packages'" id="sessions" class="card">
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

      <article v-if="currentSection !== 'sessions'" id="packages" class="card">
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

    <section v-if="currentSection === 'payments'" id="payments" class="card"><FamilyLedgerPanel :agency-id="resolveAgencyId()" :client-id="selectedClientId" /></section>
    <section v-if="['dashboard','goals'].includes(currentSection)" id="goals" class="card" style="margin-top: 1rem;">
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
      <p v-else class="muted">No Life Balance Wheel yet. Ask your coach to assign one, or open a shared link.</p>
    </section>

    <section v-if="['dashboard','assessment-docs'].includes(currentSection)" id="assessment-docs" class="card" style="margin-top: 1rem;">
      <div class="card-head"><h2>Assessment documents</h2></div>
      <p v-if="docsLoading" class="muted">Loading…</p>
      <p v-else-if="!sharedDocs.length" class="muted">
        No shared assessment documents yet. Your coach can share results and action plans when ready.
      </p>
      <ul v-else class="session-list">
        <li v-for="d in sharedDocs" :key="d.id">
          <div class="title">{{ d.title }}</div>
          <div class="meta">
            {{ d.kind === 'plan' ? 'Action plan' : 'Results' }}
            · Shared {{ formatWhen(d.sharedAt || d.updatedAt) }}
          </div>
          <div class="cta-row" style="margin-top: 0.4rem;">
            <button type="button" class="ps-btn primary" @click="openSharedDoc(d)">View</button>
            <button type="button" class="ps-btn" @click="downloadSharedPdf(d)">Download PDF</button>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="currentSection === 'messages'" id="messages" class="card" style="margin-top: 1rem;">
      <GuardianMessagesPanel />
    </section>

    <section v-if="['account','settings'].includes(currentSection)" class="card"><h2>My account</h2><p>{{ clientUserName }}</p><p>{{ authStore.user?.email }}</p><router-link class="ps-btn" :to="`/${slug}/change-password`">Change password</router-link><button class="ps-btn" @click="authStore.logout()">Sign out</button></section>
    <PortalPaymentTasks v-if="currentSection==='dashboard'" class="card" :agency-id="resolveAgencyId()" :client-id="selectedClientId" />
    <section v-if="currentSection==='dashboard'" class="card"><h2 class="journey-message-title">Secure messages</h2><p class="muted">Stay in touch with your coach and review the guidance shared with you.</p><button class="ps-btn" @click="openSection('messages')">Open conversations →</button></section>
    </div>
  </PractitionerShell>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FamilyLedgerPanel from '../../components/billing/FamilyLedgerPanel.vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import PractitionerShell from '../../layouts/PractitionerShell.vue';
import GuardianMessagesPanel from '../../components/guardian/GuardianMessagesPanel.vue';
import api from '../../services/api';
import DOMPurify from 'dompurify';
import PortalPaymentTasks from '../../components/portal/PortalPaymentTasks.vue';
import PortalIcon from '../../components/portal/PortalIcon.vue';

const route = useRoute();
const router = useRouter();
const currentSection=computed(()=>String(route.hash||'').slice(1)||'dashboard');
const linkedClients=ref([]),selectedClientId=ref(null);
const clientUserName=computed(()=>[authStore.user?.first_name,authStore.user?.last_name].filter(Boolean).join(' '));
const selectedClientName=computed(()=>linkedClients.value.find(c=>Number(c.client_id||c.id)===selectedClientId.value)?.full_name || '');
const clientInitials=computed(()=>(selectedClientName.value||clientUserName.value).split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase());
const openSection=id=>router.push({hash:`#${id}`});
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const slug = computed(() => String(route.params.organizationSlug || ''));

const brandTitle = computed(
  () => agencyStore.currentAgency?.name || agencyStore.currentAgency?.value?.name || 'Life Coaching Journey'
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
const docsLoading = ref(false);
const sharedDocs = ref([]);
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
function scrollTo(id) { openSection(id); }

function openSharedDoc(d) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.opener = null;
  w.document.write(DOMPurify.sanitize(d.htmlBody || '<p>No content</p>'));
  w.document.close();
}

async function downloadSharedPdf(d) {
  try {
    const res = await api.post(
      `/assessment-deliverables/${d.id}/export`,
      { format: 'pdf' },
      { responseType: 'blob' }
    );
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(d.title || 'assessment').replace(/\s+/g, '_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    loadError.value = e?.response?.data?.error || e.message || 'PDF download failed';
  }
}

async function scrollToHash() {
  const hash = String(route.hash || '').replace(/^#/, '');
  if (!hash) return;
  await nextTick();
  document.getElementById(hash)?.scrollIntoView({block:'start'});
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

let loadSequence=0;
async function load() {
  const request=++loadSequence;
  loading.value = true;
  loadError.value = '';
  overview.value={balance:{},entitlements:[],payments:[],sessions:[],continuation:{}};latestLbw.value=null;sharedDocs.value=[];
  try {
    const agencyId = resolveAgencyId();
    const [clientsRes] = await Promise.all([
      api.get('/guardian-portal/clients', {params:{agencyId}}),
      loadUnread(agencyId)
    ]);
    if(request!==loadSequence)return;
    const clients = Array.isArray(clientsRes.data) ? clientsRes.data : (clientsRes.data?.clients || []);
    linkedClients.value=clients.filter(c=>Number(c.agency_id||c.organization_id)===agencyId);
    if(!linkedClients.value.some(c=>Number(c.client_id||c.id)===selectedClientId.value))selectedClientId.value=Number(linkedClients.value[0]?.client_id||linkedClients.value[0]?.id||0)||null;
    const clientId=selectedClientId.value;
    if (!agencyId || !clientId) {
      overview.value = { balance: {}, entitlements: [], payments: [], sessions: [], continuation: {} };
      return;
    }
    const res = await api.get(`/practitioner-packages/clients/${clientId}/package-overview`, {
      params: { agencyId }
    });
    if(request!==loadSequence)return;
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
      if(request!==loadSequence)return;
      latestLbw.value = (lbwRes.data?.assessments || [])[0] || null;
    } catch {
      latestLbw.value = null;
    } finally {
      lbwLoading.value = false;
    }
    docsLoading.value = true;
    try {
      const docsRes = await api.get(`/assessment-deliverables/clients/${clientId}/shared`);
      if(request!==loadSequence)return;
      sharedDocs.value = docsRes.data?.deliverables || [];
    } catch {
      sharedDocs.value = [];
    } finally {
      docsLoading.value = false;
    }
  } catch (e) {
    if(request!==loadSequence)return;
    loadError.value = e?.response?.data?.error?.message || e.message || 'Could not load dashboard';
    overview.value = { balance: {}, entitlements: [], payments: [], sessions: [], continuation: {} };
  } finally {
    if(request===loadSequence){loading.value = false;await scrollToHash();}
  }
}

onMounted(load);
watch(() => route.hash, scrollToHash);
</script>

<style src="./practitionerShared.css"></style>
<style scoped>
.journey-content--dashboard{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);gap:20px;align-items:start}.journey-content--dashboard>.grid-2{display:contents}.journey-content--dashboard :deep(.card){margin:0!important;min-width:0}.journey-content--dashboard>#goals{grid-column:1;grid-row:1}.journey-content--dashboard>#assessment-docs{grid-column:1;grid-row:2}.journey-content--dashboard #sessions{grid-column:2;grid-row:1}.journey-content--dashboard #packages{grid-column:2;grid-row:2}.journey-message-title{font-size:18px;margin:0 0 16px}
@media(max-width:1050px){.journey-content--dashboard{display:flex;flex-direction:column}.journey-content--dashboard>.grid-2{display:contents}.journey-content--dashboard :deep(.card){width:100%}}

.journey-summary{display:grid;grid-template-columns:1.4fr repeat(3,minmax(0,1fr));gap:22px;background:white;border:1px solid #e2eaf4;border-radius:12px;padding:25px;margin-bottom:22px;box-shadow:0 3px 14px #193e7310}.journey-summary>div:not(:first-child){border-left:1px solid #e4ebf4;padding-left:20px}.journey-person{display:flex;align-items:center;gap:16px}.journey-person>span{display:grid;place-items:center;border-radius:50%;width:76px;height:76px;flex-shrink:0;background:var(--portal-tint);color:var(--portal-accent);font-weight:700;font-size:26px}.journey-person h2{font-size:23px;margin:0;line-height:1.25;letter-spacing:-.5px}.journey-summary h3{font-size:12px;margin:5px 0 9px}.journey-summary p{font-size:13px;color:#526984;margin:6px 0}.journey-summary button{background:transparent;color:var(--portal-accent);border:0;padding:8px 0;font:inherit;font-size:12px;cursor:pointer}.journey-icon{width:26px;height:26px;color:var(--portal-accent)}.journey-summary select{display:block;width:100%;padding:7px;border:1px solid #dce5f0;border-radius:6px}.journey-summary label{font-size:12px}
@media(max-width:1200px){.journey-summary{grid-template-columns:1fr 1fr}.journey-summary>div:nth-child(3){border-left:0;padding-left:0}}@media(max-width:500px){.journey-summary{padding:18px;gap:18px}.journey-person{grid-column:1/-1}.journey-summary>div:nth-child(2){border-left:0;padding-left:0}.journey-summary>div:nth-child(3){border-left:1px solid #e4ebf4;padding-left:14px}.journey-summary>div:last-child{grid-column:1/-1;border-left:0;padding-left:0;border-top:1px solid #e4ebf4;padding-top:10px}}

.warn-card { border-color: rgba(180, 83, 9, 0.35); background: rgba(251, 191, 36, 0.08); margin-bottom: 1rem; }
.cta-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.tiny { font-size: 0.8rem; margin: 0; }
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
</style>
