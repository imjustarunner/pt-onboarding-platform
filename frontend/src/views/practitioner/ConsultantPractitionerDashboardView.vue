<template>
  <PractitionerShell
    org-type="consultant"
    :is-client="false"
    :organization-slug="slug"
    brand-title="Elevate Consulting"
    :greeting="greeting"
    tagline="Your consulting command center."
    :profile-name="profileName"
    profile-title="Consultant"
    footer-quote="Build. Scale. Transform."
    active-nav-id="home"
    :unread-messages="unreadMessages"
  >
    <template #top-actions>
      <button type="button" class="ps-btn ghost" :disabled="startingLbw" @click="startSelfLifeBalance">
        {{ startingLbw ? 'Starting…' : 'My Life Balance' }}
      </button>
      <router-link class="ps-btn ghost" :to="`/${slug}/admin/provider-availability`">Calendar</router-link>
      <router-link class="ps-btn primary" :to="`/${slug}/admin/public-services`">Public Booking</router-link>
    </template>

    <section class="card booking-card">
      <div class="card-head">
        <h2>Public discovery booking</h2>
        <span class="free-pill">Free discovery</span>
      </div>
      <p class="booking-copy">
        Prospects request a no-cost virtual discovery meeting from your public page.
        Availability comes from your calendar. After discovery they can enroll in paid services.
      </p>
      <div class="booking-actions">
        <router-link class="ps-btn primary" :to="`/${slug}/admin/public-services`">Manage public booking</router-link>
        <a class="ps-btn ghost" :href="publicHubUrl" target="_blank" rel="noopener noreferrer">Open public page ↗</a>
        <router-link class="ps-btn ghost" :to="`/${slug}/admin/provider-availability`">Edit availability</router-link>
        <button type="button" class="ps-btn ghost" @click="copyPublicLink">{{ copied ? 'Copied!' : 'Copy link' }}</button>
      </div>
      <code class="booking-url">{{ publicHubUrl }}</code>
    </section>

    <section class="kpi-row five">
      <article v-for="kpi in kpis" :key="kpi.label" class="kpi-card">
        <div class="kpi-label">{{ kpi.label }}</div>
        <div class="kpi-value">{{ dashLoading ? '…' : kpi.value }}</div>
        <div class="kpi-trend up">{{ kpi.trend }}</div>
      </article>
    </section>

    <section class="card prospective-card">
      <div class="card-head">
        <h2>Prospective clients</h2>
        <router-link class="muted link" :to="`/${slug}/admin/clients?client_status_key=prospective`">View all →</router-link>
      </div>
      <p v-if="prospectiveError" class="muted">{{ prospectiveError }}</p>
      <p v-else-if="prospectiveLoading" class="muted">Loading…</p>
      <p v-else-if="!prospectiveClients.length" class="muted">No prospectives yet. Public booking inquiries will appear here.</p>
      <ul v-else class="prospective-list">
        <li v-for="c in prospectiveClients.slice(0, 6)" :key="c.id">
          <div>
            <div class="title">{{ c.full_name || c.initials || `Client #${c.id}` }}</div>
            <div class="meta">{{ c.contact_phone || c.source || 'Inquiry' }}</div>
          </div>
          <div class="row-actions">
            <button type="button" class="ps-btn primary" @click="openPacket(c)">Send packet</button>
            <router-link class="ps-btn ghost" :to="`/${slug}/admin/clients?clientId=${c.id}`">Open</router-link>
          </div>
        </li>
      </ul>
    </section>

    <section class="card prospective-card">
      <div class="card-head">
        <h2>After discovery</h2>
        <router-link class="muted link" :to="`/${slug}/admin/clients?client_status_key=screener`">Screeners →</router-link>
      </div>
      <p class="muted" style="margin-top:0">Send a package packet or open the client profile (Packages tab).</p>
      <p v-if="pipelineError" class="muted">{{ pipelineError }}</p>
      <p v-else-if="pipelineLoading" class="muted">Loading…</p>
      <p v-else-if="!pipelineClients.length" class="muted">No screener / packet / current clients yet.</p>
      <ul v-else class="prospective-list">
        <li v-for="c in pipelineClients.slice(0, 8)" :key="`p-${c.id}`">
          <div>
            <div class="title">{{ c.full_name || c.initials || `Client #${c.id}` }}</div>
            <div class="meta">
              {{ c.client_status_key || '—' }}
              <template v-if="balances[c.id] != null"> · {{ balances[c.id] }} sessions left</template>
            </div>
          </div>
          <div class="row-actions">
            <button type="button" class="ps-btn primary" @click="openPacket(c)">Send packet</button>
            <router-link class="ps-btn ghost" :to="`/${slug}/admin/clients?clientId=${c.id}`">Open</router-link>
          </div>
        </li>
      </ul>
    </section>

    <section class="grid-3">
      <article class="card">
        <div class="card-head">
          <h2>Revenue this month</h2>
          <span class="muted">Live payments</span>
        </div>
        <div class="chart-stats">
          <div><strong>{{ dashLoading ? '…' : formatMoney(overview.revenueMtdCents) }}</strong><span>MTD</span></div>
          <div><strong>{{ overview.recentPayments?.length || 0 }}</strong><span>Recent payments</span></div>
        </div>
      </article>

      <article class="card">
        <div class="card-head"><h2>Pipeline snapshot</h2></div>
        <ul class="legend">
          <li v-for="s in snapshot" :key="s.label">
            <span class="dot" :style="{ background: s.color }" />
            {{ s.label }} <strong>{{ s.count }}</strong>
            <span class="muted"> ({{ s.pct }}%)</span>
          </li>
        </ul>
      </article>

      <article class="card">
        <div class="card-head">
          <h2>Upcoming sessions</h2>
          <router-link class="muted link" :to="`/${slug}/admin/provider-availability`">Calendar →</router-link>
        </div>
        <p v-if="dashLoading" class="muted">Loading…</p>
        <p v-else-if="!upcoming.length" class="muted">No upcoming sessions.</p>
        <ul v-else class="session-list">
          <li v-for="s in upcoming" :key="s.id">
            <div class="title">{{ s.title }}</div>
            <div class="meta">{{ s.time }} · {{ s.meta }}</div>
          </li>
        </ul>
      </article>
    </section>

    <section class="grid-3">
      <article class="card">
        <div class="card-head"><h2>Recent activity</h2></div>
        <p v-if="!activity.length" class="muted">Payments and sessions will show here.</p>
        <ul v-else class="feed">
          <li v-for="a in activity" :key="a.id">
            <div class="title">{{ a.title }}</div>
            <div class="meta">{{ a.meta }}</div>
            <span class="badge ok">{{ a.badge }}</span>
          </li>
        </ul>
      </article>

      <article class="card">
        <div class="card-head">
          <h2>Priority tasks</h2>
          <span class="muted">{{ openTasks.filter((t) => !t.done).length }} open</span>
        </div>
        <p v-if="!openTasks.length" class="muted">No open tasks.</p>
        <ul v-else class="checklist">
          <li v-for="t in openTasks" :key="t.id" :class="{ done: t.done }">
            <span class="check">{{ t.done ? '✓' : '' }}</span>
            <span>{{ t.label }}</span>
          </li>
        </ul>
      </article>

      <article class="card">
        <div class="card-head"><h2>This week</h2></div>
        <div class="chart-stats">
          <div><strong>{{ overview.sessionsThisWeek || 0 }}</strong><span>Sessions</span></div>
          <div><strong>{{ overview.sessionsToday || 0 }}</strong><span>Today</span></div>
        </div>
        <p v-if="dashError" class="muted">{{ dashError }}</p>
      </article>
    </section>

    <div v-if="packetOpen" class="modal-backdrop" @click.self="closePacket">
      <div class="modal-card packet-modal">
        <h3>Send package packet</h3>
        <p class="muted">{{ packetClient?.full_name || packetClient?.initials || 'Client' }} — pick packages to offer.</p>
        <label>Client email (required)
          <input v-model="packetForm.clientEmail" type="email" placeholder="client@email.com" />
        </label>
        <div v-if="catalogLoading" class="muted">Loading packages…</div>
        <div v-else-if="!catalogPackages.length" class="muted">
          No packages yet.
          <router-link :to="`/${slug}/admin/session-packages`">Create packages →</router-link>
        </div>
        <div v-else class="pkg-checks">
          <label v-for="pkg in catalogPackages" :key="pkg.id" class="pkg-check">
            <input v-model="packetForm.offeredIds" type="checkbox" :value="pkg.id" />
            <span>
              <strong>{{ pkg.name }}</strong>
              <em>{{ pkg.session_count }} sessions · {{ formatMoney(pkg.price_cents) }}</em>
            </span>
          </label>
        </div>
        <div class="docs-block">
          <div class="docs-head">
            <strong>Documents / forms</strong>
            <router-link class="muted link" :to="`/${slug}/admin/intake-links`">Manage →</router-link>
          </div>
          <div v-if="intakeLinksLoading" class="muted">Loading…</div>
          <div v-else class="pkg-checks">
            <label v-for="link in intakeLinks" :key="link.id" class="pkg-check">
              <input v-model="packetForm.intakeLinkIds" type="checkbox" :value="link.id" />
              <span><strong>{{ link.title || `Form #${link.id}` }}</strong></span>
            </label>
          </div>
        </div>
        <p v-if="packetError" class="err">{{ packetError }}</p>
        <p v-if="packetSuccess" class="ok">{{ packetSuccess }}</p>
        <div class="modal-actions">
          <button type="button" class="ps-btn ghost" @click="closePacket">Cancel</button>
          <button type="button" class="ps-btn primary" :disabled="packetSaving" @click="sendPacket">
            {{ packetSaving ? 'Sending…' : 'Email packet link →' }}
          </button>
        </div>
      </div>
    </div>
  </PractitionerShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import PractitionerShell from '../../layouts/PractitionerShell.vue';
import api from '../../services/api';
import { usePractitionerDashboardData } from '../../composables/usePractitionerDashboardData';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const slug = computed(() => String(route.params.organizationSlug || ''));
const startingLbw = ref(false);

const profileName = computed(() => {
  const u = authStore.user || {};
  return `${u.first_name || u.firstName || ''} ${u.last_name || u.lastName || ''}`.trim() || 'Consultant';
});
const greeting = computed(() => {
  const name = authStore.user?.first_name || authStore.user?.firstName || 'there';
  return `Good evening, ${name}`;
});

const publicHubUrl = computed(() => {
  if (typeof window === 'undefined') return `/${slug.value}/services`;
  return `${window.location.origin}/${slug.value}/services`;
});
const publicFinderUrl = computed(() => {
  if (typeof window === 'undefined') return `/${slug.value}/find-consultant`;
  return `${window.location.origin}/${slug.value}/find-consultant`;
});
const copied = ref(false);
const copyPublicLink = async () => {
  try {
    await navigator.clipboard.writeText(publicFinderUrl.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    copied.value = false;
  }
};

const resolveAgencyId = () => {
  const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
  const id = Number(current?.id || 0);
  return id > 0 ? id : null;
};
const resolveProviderId = () => Number(authStore.user?.id || 0) || null;

async function startSelfLifeBalance() {
  const agencyId = resolveAgencyId();
  if (!agencyId) return;
  startingLbw.value = true;
  try {
    const res = await api.post('/life-balance/assessments', {
      agencyId,
      self: true
    });
    const id = res.data?.assessment?.id;
    if (id) router.push(`/${slug.value}/life-balance/assessment/${id}`);
  } catch (e) {
    console.warn('[lbw] self start failed', e?.response?.data || e);
  } finally {
    startingLbw.value = false;
  }
}

const {
  loading: dashLoading,
  error: dashError,
  overview,
  kpis,
  upcoming,
  openTasks,
  snapshot,
  activity,
  unreadMessages,
  refresh: refreshDashboard,
  formatMoney
} = usePractitionerDashboardData({ resolveAgencyId, resolveProviderId });

const prospectiveClients = ref([]);
const prospectiveLoading = ref(false);
const prospectiveError = ref('');
const pipelineClients = ref([]);
const pipelineLoading = ref(false);
const pipelineError = ref('');
const balances = ref({});

const loadProspectives = async () => {
  const agencyId = resolveAgencyId();
  if (!agencyId) return;
  prospectiveLoading.value = true;
  prospectiveError.value = '';
  try {
    const res = await api.get('/clients', {
      params: { agency_id: agencyId, client_status_key: 'prospective', includeArchived: false }
    });
    prospectiveClients.value = Array.isArray(res.data) ? res.data : (res.data?.clients || []);
  } catch (e) {
    prospectiveError.value = e?.response?.data?.error?.message || 'Could not load prospectives';
    prospectiveClients.value = [];
  } finally {
    prospectiveLoading.value = false;
  }
};

const loadPipeline = async () => {
  const agencyId = resolveAgencyId();
  if (!agencyId) return;
  pipelineLoading.value = true;
  pipelineError.value = '';
  try {
    const keys = ['screener', 'packet', 'current'];
    const results = await Promise.all(
      keys.map((key) =>
        api.get('/clients', {
          params: { agency_id: agencyId, client_status_key: key, includeArchived: false }
        }).catch(() => ({ data: [] }))
      )
    );
    const map = new Map();
    for (let i = 0; i < results.length; i += 1) {
      const rows = Array.isArray(results[i].data) ? results[i].data : (results[i].data?.clients || []);
      for (const c of rows) {
        map.set(c.id, { ...c, client_status_key: c.client_status_key || keys[i] });
      }
    }
    pipelineClients.value = [...map.values()];
    const bal = {};
    await Promise.all(
      pipelineClients.value.slice(0, 12).map(async (c) => {
        try {
          const r = await api.get(`/practitioner-packages/clients/${c.id}/balance`, {
            params: { agencyId }
          });
          bal[c.id] = Number(r.data?.balance?.remaining || 0);
        } catch {
          bal[c.id] = 0;
        }
      })
    );
    balances.value = bal;
  } catch (e) {
    pipelineError.value = e?.response?.data?.error?.message || 'Could not load pipeline';
    pipelineClients.value = [];
  } finally {
    pipelineLoading.value = false;
  }
};

const packetOpen = ref(false);
const packetClient = ref(null);
const packetSaving = ref(false);
const packetError = ref('');
const packetSuccess = ref('');
const catalogPackages = ref([]);
const catalogLoading = ref(false);
const intakeLinks = ref([]);
const intakeLinksLoading = ref(false);
const packetForm = ref({ clientEmail: '', offeredIds: [], intakeLinkIds: [], notes: '' });

async function openPacket(c) {
  packetClient.value = c;
  packetError.value = '';
  packetSuccess.value = '';
  packetForm.value = { clientEmail: '', offeredIds: [], intakeLinkIds: [], notes: '' };
  packetOpen.value = true;
  catalogLoading.value = true;
  intakeLinksLoading.value = true;
  try {
    const agencyId = resolveAgencyId();
    const [pkgRes, linkRes] = await Promise.all([
      api.get('/practitioner-packages/packages', { params: { agencyId } }),
      api.get('/intake-links', { params: { scopeType: 'agency', organizationId: agencyId } }).catch(() => ({ data: [] }))
    ]);
    catalogPackages.value = (pkgRes.data?.packages || []).filter((p) => p.is_active);
    packetForm.value.offeredIds = catalogPackages.value.slice(0, 3).map((p) => p.id);
    const links = Array.isArray(linkRes.data) ? linkRes.data : (linkRes.data?.links || []);
    intakeLinks.value = links.filter((l) => l.is_active !== false);
  } catch (e) {
    catalogPackages.value = [];
    packetError.value = e?.response?.data?.error?.message || 'Could not load packages.';
  } finally {
    catalogLoading.value = false;
    intakeLinksLoading.value = false;
  }
}
function closePacket() {
  packetOpen.value = false;
  packetClient.value = null;
}
async function sendPacket() {
  const agencyId = resolveAgencyId();
  const providerId = Number(authStore.user?.id || 0);
  const clientId = Number(packetClient.value?.id || 0);
  if (!agencyId || !providerId || !clientId) {
    packetError.value = 'Missing agency, provider, or client.';
    return;
  }
  if (!packetForm.value.clientEmail.trim()) {
    packetError.value = 'Client email is required.';
    return;
  }
  if (!packetForm.value.offeredIds.length) {
    packetError.value = 'Select at least one package.';
    return;
  }
  packetSaving.value = true;
  packetError.value = '';
  packetSuccess.value = '';
  try {
    const res = await api.post('/practitioner-packages/packets', {
      agencyId,
      providerId,
      clientId,
      clientEmail: packetForm.value.clientEmail.trim(),
      clientName: packetClient.value?.full_name || packetClient.value?.initials || null,
      offeredPackageIds: packetForm.value.offeredIds,
      intakeLinkIds: packetForm.value.intakeLinkIds,
      notes: packetForm.value.notes || null
    });
    packetSuccess.value = res.data?.joinUrl
      ? `Sent. Private link: ${res.data.joinUrl}`
      : 'Packet sent.';
    loadPipeline();
    refreshDashboard();
  } catch (e) {
    packetError.value = e?.response?.data?.error?.message || e.message || 'Failed to send packet.';
  } finally {
    packetSaving.value = false;
  }
}

onMounted(() => {
  loadProspectives();
  loadPipeline();
  refreshDashboard();
});
</script>

<style src="./practitionerShared.css"></style>
<style scoped>
.kpi-row.five { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.prospective-card { margin-bottom: 1rem; }
.booking-card {
  margin-bottom: 1rem;
  border: 1px solid rgba(124, 58, 237, 0.25);
  background: linear-gradient(180deg, rgba(124, 58, 237, 0.06), transparent);
}
.booking-copy { margin: 0 0 0.85rem; color: #475569; font-size: 0.9rem; line-height: 1.45; max-width: 48rem; }
.booking-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.65rem; }
.booking-url { display: block; font-size: 0.75rem; color: #64748b; word-break: break-all; }
.free-pill {
  font-size: 0.68rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
  color: #059669; background: rgba(5, 150, 105, 0.12); border-radius: 999px; padding: 0.2rem 0.55rem;
}
.prospective-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.65rem; }
.prospective-list li {
  display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;
  padding: 0.55rem 0; border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}
.prospective-list .title { font-weight: 700; }
.prospective-list .meta { font-size: 0.78rem; color: #64748b; }
.row-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end; }
.link { text-decoration: none; }
.legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
.legend .dot { display: inline-block; width: 0.55rem; height: 0.55rem; border-radius: 999px; margin-right: 0.35rem; }
.chart-stats { display: flex; flex-wrap: wrap; gap: 1.25rem; padding: 0.35rem 0; }
.chart-stats div { display: grid; gap: 0.15rem; }
.chart-stats strong { font-size: 1.25rem; color: #4c1d95; }
.chart-stats span { font-size: 0.78rem; color: #64748b; }
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  display: grid; place-items: center; z-index: 80; padding: 1rem;
}
.modal-card {
  width: min(560px, 100%); background: #fff; border-radius: 16px; padding: 1.15rem;
  display: grid; gap: 0.65rem; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}
.modal-card label { display: grid; gap: 0.25rem; font-size: 0.82rem; font-weight: 700; color: #475569; }
.modal-card input {
  border: 1px solid #d1d5db; border-radius: 8px; padding: 0.45rem 0.55rem; font: inherit; font-weight: 500;
}
.pkg-checks { display: grid; gap: 0.45rem; max-height: 180px; overflow: auto; }
.pkg-check { display: flex; gap: 0.55rem; align-items: flex-start; font-size: 0.85rem; }
.pkg-check em { display: block; font-style: normal; color: #64748b; font-size: 0.78rem; }
.docs-block { border-top: 1px solid rgba(148, 163, 184, 0.25); padding-top: 0.55rem; display: grid; gap: 0.35rem; }
.docs-head { display: flex; justify-content: space-between; gap: 0.5rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
.err { color: #b91c1c; font-size: 0.85rem; margin: 0; }
.ok { color: #047857; font-size: 0.82rem; margin: 0; word-break: break-all; }
@media (max-width: 1100px) {
  .kpi-row.five { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
