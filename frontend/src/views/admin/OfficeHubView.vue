<template>
  <div class="oh-root">
    <header class="oh-header">
      <div>
        <p class="oh-eyebrow">Office Client Management</p>
        <h1 class="oh-title">Office Hub</h1>
        <p class="oh-subtitle">What is happening in the office right now, and what needs attention.</p>
      </div>
      <div class="ocm-hub-header-actions">
        <nav class="ocm-hub-switcher" aria-label="Office tools">
          <template v-for="item in officeNavLinks" :key="item.key">
            <span v-if="item.isActive" class="ocm-hub-switcher-btn is-active" aria-current="page">{{ item.label }}</span>
            <router-link v-else class="ocm-hub-switcher-btn" :to="item.to">{{ item.label }}</router-link>
          </template>
        </nav>
        <select v-if="multiTenant" v-model="tenantFilter" class="oh-select">
          <option value="all">All my offices</option>
          <option v-for="a in accessibleAgencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
        <button class="ocm-hub-action-btn" type="button" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : '↺ Refresh' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="oh-banner">{{ error }}</div>

    <div class="oh-kpis">
      <div class="oh-kpi">
        <div class="oh-kpi-icon oh-kpi-icon--green">◷</div>
        <div>
          <div class="oh-kpi-value">{{ summary.todaysAppointments || 0 }}</div>
          <div class="oh-kpi-label">Today's appointments</div>
        </div>
      </div>
      <div class="oh-kpi">
        <div class="oh-kpi-icon oh-kpi-icon--blue">↓</div>
        <div>
          <div class="oh-kpi-value">{{ summary.newOfficeIntakes || 0 }}</div>
          <div class="oh-kpi-label">New office intakes</div>
        </div>
      </div>
      <div class="oh-kpi">
        <div class="oh-kpi-icon oh-kpi-icon--purple">◎</div>
        <div>
          <div class="oh-kpi-value">{{ summary.pendingReview || 0 }}</div>
          <div class="oh-kpi-label">Pending review</div>
        </div>
      </div>
      <div class="oh-kpi">
        <div class="oh-kpi-icon oh-kpi-icon--teal">☺</div>
        <div>
          <div class="oh-kpi-value">{{ summary.activeProviders || 0 }}</div>
          <div class="oh-kpi-label">Active providers</div>
        </div>
      </div>
      <div class="oh-kpi">
        <div class="oh-kpi-icon oh-kpi-icon--orange">☰</div>
        <div>
          <div class="oh-kpi-value">{{ summary.waitlisted || 0 }}</div>
          <div class="oh-kpi-label">On waitlist</div>
        </div>
      </div>
    </div>

    <div class="oh-grid">
      <section class="oh-card oh-card--wide">
        <div class="oh-card-head">
          <h2>Office calendar</h2>
          <div class="oh-card-actions">
            <router-link class="oh-link" :to="orgPath('/my-schedule')">My Schedule</router-link>
            <router-link class="oh-link" :to="orgPath('/buildings')">Buildings</router-link>
          </div>
        </div>
        <p class="oh-lead">
          {{ summary.todaysAppointments || 0 }} appointment{{ summary.todaysAppointments === 1 ? '' : 's' }} today.
          Open the schedule tools for the full week grid, rooms, and bookings.
        </p>
        <div v-if="todayAppointments.length" class="oh-appt-list">
          <div v-for="a in todayAppointments.slice(0, 8)" :key="a.id" class="oh-appt-row">
            <strong>{{ formatTime(a.startAt || a.start_at) }}</strong>
            <span>{{ a.title || a.clientName || 'Appointment' }}</span>
            <span class="oh-muted">{{ a.providerName || '' }}</span>
          </div>
        </div>
        <p v-else class="oh-muted">No appointments loaded for today — use My Schedule for the live calendar.</p>
      </section>

      <section class="oh-card">
        <div class="oh-card-head">
          <h2>Providers</h2>
          <span class="oh-pill">{{ (summary.providers || []).length }} shown</span>
        </div>
        <div class="oh-provider-list">
          <div v-for="p in (summary.providers || []).slice(0, 7)" :key="p.id" class="oh-provider-row">
            <div class="oh-avatar">{{ initials(p.name) }}</div>
            <div class="oh-provider-meta">
              <strong>{{ p.name }}</strong>
              <div class="oh-muted">{{ p.credentials || p.title || 'Provider' }} · caseload {{ p.caseload || 0 }}</div>
            </div>
            <span class="oh-pill" :class="p.acceptingNewClients ? 'oh-pill--ok' : 'oh-pill--muted'">
              {{ p.acceptingNewClients ? 'Accepting' : 'Not accepting' }}
            </span>
          </div>
          <p v-if="!(summary.providers || []).length" class="oh-muted">No office providers found for this agency.</p>
        </div>
      </section>
    </div>

    <div class="oh-grid oh-grid--bottom">
      <section class="oh-card">
        <div class="oh-card-head">
          <h2>New office clients</h2>
          <router-link class="oh-link" :to="orgPath('/admin/office-clients?bucket=prospective')">View all</router-link>
        </div>
        <div v-for="c in (summary.clientsSample || []).filter((x) => !(x.providers?.length || x.providerId) || x.bucket === 'prospective').slice(0, 6)" :key="c.id" class="oh-queue-row">
          <div>
            <strong>{{ c.fullName }}</strong>
            <div class="oh-muted">
              <span v-if="c.agencies?.length" class="oh-agency-inline">
                <img
                  v-for="a in c.agencies.filter((x) => x.logoUrl).slice(0, 3)"
                  :key="'ha-' + c.id + '-' + a.agencyId"
                  class="oh-mini-logo"
                  :src="a.logoUrl"
                  :alt="a.name || ''"
                />
              </span>
              {{ c.intakeType || 'Intake' }}
              <span v-if="c.needsClinicalReview"> · Clinical review</span>
              · {{ formatRelativeTime(c.createdAt) }}
            </div>
          </div>
          <router-link class="oh-btn oh-btn--tiny" :to="orgPath(`/admin/office-clients`)">Review</router-link>
        </div>
        <p v-if="!(summary.newOfficeIntakes || summary.clientsSample?.length)" class="oh-muted">No pending office intakes right now.</p>
      </section>

      <section class="oh-card">
        <div class="oh-card-head"><h2>Pending actions</h2></div>
        <button type="button" class="oh-action-row" @click="goClients({ clinicalReview: '1' })">
          <span>Clinical review required</span><strong>{{ summary.clinicalReview || 0 }}</strong>
        </button>
        <button type="button" class="oh-action-row" @click="goClients({ bucket: 'prospective' })">
          <span>Provider unassigned</span><strong>{{ summary.unassigned || 0 }}</strong>
        </button>
        <button type="button" class="oh-action-row" @click="goClients({ bucket: 'waitlisted' })">
          <span>Waitlist review</span><strong>{{ summary.waitlisted || 0 }}</strong>
        </button>
        <button type="button" class="oh-action-row" @click="goPath('/admin/client-onboarding?scope=office')">
          <span>Client action needed (office)</span><strong>Open</strong>
        </button>
        <button type="button" class="oh-action-row" @click="goPath('/admin/office-intake-queue')">
          <span>Acceptance pending</span><strong>{{ summary.acceptancePending || 0 }}</strong>
        </button>
      </section>

      <section class="oh-card">
        <div class="oh-card-head"><h2>Quick actions</h2></div>
        <div class="oh-quick">
          <router-link class="oh-quick-btn oh-quick-btn--green" :to="orgPath('/admin/office-clients')">Assign provider</router-link>
          <router-link class="oh-quick-btn oh-quick-btn--blue" :to="orgPath('/admin/office-intake-queue')">Review intake</router-link>
          <router-link class="oh-quick-btn oh-quick-btn--purple" :to="orgPath('/admin/clients')">Add client</router-link>
          <router-link class="oh-quick-btn oh-quick-btn--orange" :to="orgPath('/admin/office-clients?bucket=waitlisted')">View waitlist</router-link>
        </div>
        <div class="oh-card-head" style="margin-top:1rem;"><h2>Alerts</h2></div>
        <ul class="oh-alerts">
          <li v-if="summary.clinicalReview">{{ summary.clinicalReview }} client(s) flagged for clinical review before routine matching.</li>
          <li v-if="summary.unassigned">{{ summary.unassigned }} office client(s) still need a provider assignment.</li>
          <li v-if="summary.acceptancePending">{{ summary.acceptancePending }} referral(s) awaiting provider acceptance.</li>
          <li v-if="!summary.clinicalReview && !summary.unassigned && !summary.acceptancePending" class="oh-muted">No operational alerts from live office signals.</li>
        </ul>
      </section>

      <section class="oh-card">
        <div class="oh-card-head">
          <h2>Follow-ups</h2>
          <router-link class="oh-link" :to="orgPath('/tasks')">Tasks Hub</router-link>
        </div>
        <p class="oh-lead">Use Tasks Hub and client contact notes for follow-ups. Office Clients shows next-step labels for each enrollment.</p>
        <router-link class="oh-btn oh-btn--ghost" :to="orgPath('/admin/office-clients?needsAction=1')">Open needs-action list</router-link>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useOfficeClientAgency, formatRelativeTime } from '../../composables/useOfficeClientAgency.js';
import { buildOfficeQuickNavLinks } from '../../utils/officeQuickNav.js';
import '../../styles/officeQuickNav.css';

const router = useRouter();
const {
  agencyId,
  multiTenant,
  tenantFilter,
  scopeAgencyIds,
  agencyIdsParam,
  accessibleAgencies,
  orgPath,
  orgSlug
} = useOfficeClientAgency();

const officeNavLinks = computed(() => buildOfficeQuickNavLinks({ orgPath, current: 'hub' }));

const loading = ref(false);
const error = ref('');
const summary = ref({});
const todayAppointments = ref([]);

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2) || '?';
}

function formatTime(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(v);
  }
}

function todayWindow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  const ymd2 = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  return { windowStart: ymd, windowEnd: ymd2 };
}

async function load() {
  if (!scopeAgencyIds.value.length) {
    error.value = 'No office agencies available for your account.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { windowStart, windowEnd } = todayWindow();
    const primaryAgency = scopeAgencyIds.value[0] || agencyId.value;
    const [sumRes, apptRes] = await Promise.all([
      api.get('/office-clients/hub-summary', { params: { agencyIds: agencyIdsParam() } }),
      primaryAgency
        ? api.get('/appointments', {
          params: { agencyId: primaryAgency, windowStart, windowEnd },
          skipGlobalLoading: true
        }).catch(() => ({ data: { appointments: [] } }))
        : Promise.resolve({ data: { appointments: [] } })
    ]);
    summary.value = sumRes.data?.summary || {};
    const rows = apptRes.data?.appointments || apptRes.data?.rows || apptRes.data || [];
    todayAppointments.value = Array.isArray(rows) ? rows : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load Office Hub.';
  } finally {
    loading.value = false;
  }
}

function goClients(query = {}) {
  const name = orgSlug.value ? 'OrganizationOfficeClients' : 'OfficeClients';
  router.push({ name, query });
}

function goPath(path) {
  router.push(orgPath(path));
}

watch(scopeAgencyIds, () => load(), { deep: true });
watch(tenantFilter, () => load());
onMounted(load);
</script>

<style scoped>
.oh-root { padding: 1.25rem 1.5rem 2rem; max-width: 1400px; margin: 0 auto; }
.oh-header { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
.oh-eyebrow { margin: 0; font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: #5b6b63; }
.oh-title { margin: 0.15rem 0; font-size: 1.75rem; color: #14352a; }
.oh-subtitle { margin: 0; color: #5b6b63; }
.oh-header-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
.oh-select { border: 1px solid #d7e3dc; border-radius: 10px; padding: 0.45rem 0.65rem; background: #fff; }
.oh-banner { background: #fef3c7; color: #92400e; border-radius: 10px; padding: 0.75rem 1rem; margin-bottom: 1rem; }
.oh-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.oh-kpi { background: #fff; border: 1px solid #d7e3dc; border-radius: 12px; padding: 0.9rem 1rem; display: flex; gap: 0.75rem; align-items: center; }
.oh-kpi-value { font-size: 1.55rem; font-weight: 700; color: #14352a; }
.oh-kpi-label { font-size: 0.8rem; color: #5b6b63; }
.oh-kpi-icon { width: 2.2rem; height: 2.2rem; border-radius: 10px; display: grid; place-items: center; font-weight: 700; }
.oh-kpi-icon--green { background: #dcfce7; color: #166534; }
.oh-kpi-icon--blue { background: #dbeafe; color: #1d4ed8; }
.oh-kpi-icon--purple { background: #f3e8ff; color: #6b21a8; }
.oh-kpi-icon--teal { background: #ccfbf1; color: #0f766e; }
.oh-kpi-icon--orange { background: #ffedd5; color: #c2410c; }
.oh-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; margin-bottom: 1rem; }
.oh-grid--bottom { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.oh-card { background: #fff; border: 1px solid #d7e3dc; border-radius: 14px; padding: 1rem; }
.oh-card--wide { min-height: 220px; }
.oh-card-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.oh-card-head h2 { margin: 0; font-size: 1.05rem; color: #14352a; }
.oh-card-actions { display: flex; gap: 0.75rem; }
.oh-lead { margin: 0 0 0.75rem; color: #4b5563; }
.oh-muted { color: #6b7280; font-size: 0.85rem; }
.oh-agency-inline { display: inline-flex; gap: 0.15rem; vertical-align: middle; margin-right: 0.25rem; }
.oh-mini-logo { width: 0.95rem; height: 0.95rem; border-radius: 3px; object-fit: contain; border: 1px solid #e5e7eb; background: #fff; }
.oh-link { color: #0f766e; font-weight: 600; text-decoration: none; }
.oh-pill { display: inline-flex; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.72rem; font-weight: 600; background: #eff6ff; color: #1d4ed8; }
.oh-pill--ok { background: #ecfdf5; color: #047857; }
.oh-pill--muted { background: #f3f4f6; color: #6b7280; }
.oh-appt-list, .oh-provider-list { display: grid; gap: 0.55rem; }
.oh-appt-row, .oh-provider-row, .oh-queue-row { display: flex; gap: 0.65rem; align-items: center; padding: 0.45rem 0; border-top: 1px solid #eef2f0; }
.oh-avatar { width: 2rem; height: 2rem; border-radius: 999px; background: #1e4d3b; color: #fff; display: grid; place-items: center; font-size: 0.75rem; font-weight: 700; flex-shrink: 0; }
.oh-provider-meta { flex: 1; min-width: 0; }
.oh-action-row { width: 100%; display: flex; justify-content: space-between; gap: 0.75rem; border: 0; border-top: 1px solid #eef2f0; background: transparent; padding: 0.7rem 0; cursor: pointer; text-align: left; font: inherit; }
.oh-action-row:hover { color: #0f766e; }
.oh-quick { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.oh-quick-btn { border-radius: 10px; padding: 0.75rem 0.5rem; text-align: center; font-weight: 700; font-size: 0.82rem; text-decoration: none; color: #fff; }
.oh-quick-btn--green { background: #15803d; }
.oh-quick-btn--blue { background: #1d4ed8; }
.oh-quick-btn--purple { background: #7c3aed; }
.oh-quick-btn--orange { background: #c2410c; }
.oh-alerts { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.35rem; color: #374151; font-size: 0.9rem; }
.oh-btn { border-radius: 10px; border: 1px solid #d7e3dc; background: #fff; padding: 0.45rem 0.8rem; cursor: pointer; font-weight: 600; color: #14352a; text-decoration: none; display: inline-flex; align-items: center; }
.oh-btn--primary { background: #1e4d3b; color: #fff; border-color: #1e4d3b; }
.oh-btn--ghost { background: #f8faf9; }
.oh-btn--tiny { padding: 0.25rem 0.55rem; font-size: 0.75rem; }
@media (max-width: 1100px) {
  .oh-kpis, .oh-grid, .oh-grid--bottom { grid-template-columns: 1fr; }
}
</style>
