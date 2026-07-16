<template>
  <PractitionerShell
    org-type="life_coach"
    :is-client="false"
    :organization-slug="slug"
    brand-title="Life Coach"
    brand-subtitle="Guide • Inspire • Transform"
    :greeting="greeting"
    tagline="You're here to uplift, empower, and create lasting change."
    :profile-name="profileName"
    profile-title="Life Coach"
    footer-quote="The impact you have on others is the most valuable currency there is."
    active-nav-id="dashboard"
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
        Prospects request a no-cost virtual discovery call from your public page.
        Slots come from your calendar. After discovery they can enroll in paid coaching.
      </p>
      <div class="booking-actions">
        <router-link class="ps-btn primary" :to="`/${slug}/admin/public-services`">Manage public booking</router-link>
        <a class="ps-btn ghost" :href="publicHubUrl" target="_blank" rel="noopener noreferrer">Open public page ↗</a>
        <router-link class="ps-btn ghost" :to="`/${slug}/admin/provider-availability`">Edit availability</router-link>
        <button type="button" class="ps-btn ghost" @click="copyPublicLink">{{ copied ? 'Copied!' : 'Copy link' }}</button>
      </div>
      <code class="booking-url">{{ publicHubUrl }}</code>
    </section>

    <section class="kpi-row">
      <article v-for="kpi in kpis" :key="kpi.label" class="kpi-card">
        <div class="kpi-label">{{ kpi.label }}</div>
        <div class="kpi-value">{{ dashLoading ? '…' : kpi.value }}</div>
        <div class="kpi-trend" :class="kpi.tone">{{ kpi.trend }}</div>
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
            <button type="button" class="ps-btn primary" @click="openPropose(c)">Propose times</button>
            <button type="button" class="ps-btn ghost" @click="openPacket(c)">Send packet</button>
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
      <p class="muted" style="margin-top:0">Send a package packet, or mark a completed session (−1 credit).</p>
      <p v-if="pipelineError" class="muted">{{ pipelineError }}</p>
      <p v-else-if="pipelineLoading" class="muted">Loading…</p>
      <p v-else-if="!pipelineClients.length" class="muted">No screener / packet / current clients yet.</p>
      <ul v-else class="prospective-list">
        <li v-for="c in pipelineClients.slice(0, 8)" :key="`p-${c.id}`">
          <div>
            <div class="title">{{ c.full_name || c.initials || `Client #${c.id}` }}</div>
            <div class="meta">
              {{ c.client_status_key || c.status_key || '—' }}
              <template v-if="balances[c.id] != null"> · {{ balances[c.id] }} sessions left</template>
            </div>
          </div>
          <div class="row-actions">
            <button type="button" class="ps-btn primary" @click="openPacket(c)">Send packet</button>
            <button
              v-if="(balances[c.id] || 0) > 0"
              type="button"
              class="ps-btn ghost"
              :disabled="debitingId === c.id"
              @click="debitSession(c)"
            >{{ debitingId === c.id ? '…' : '−1 session' }}</button>
            <router-link class="ps-btn ghost" :to="`/${slug}/admin/clients?clientId=${c.id}`">Open</router-link>
          </div>
        </li>
      </ul>
    </section>

    <div v-if="proposeOpen" class="modal-backdrop" @click.self="closePropose">
      <div class="modal-card">
        <h3>Propose discovery times</h3>
        <p class="muted">{{ proposeClient?.full_name || proposeClient?.initials || 'Client' }} — options are selectable on their private link. Selecting one books your calendar.</p>
        <p v-if="scheduleTimezoneLabel" class="muted tz-label">Times are in {{ scheduleTimezoneLabel }}</p>
        <label>Client email (required)
          <input v-model="proposeForm.clientEmail" type="email" placeholder="client@email.com" />
        </label>
        <label>Countdown minutes
          <input v-model.number="proposeForm.countdownMinutes" type="number" min="5" max="120" step="5" />
        </label>
        <div class="opt-editor">
          <div v-for="(opt, idx) in proposeForm.options" :key="idx" class="opt-row">
            <input v-model="opt.startLocal" type="datetime-local" />
            <button type="button" class="ps-btn ghost" @click="proposeForm.options.splice(idx, 1)">Remove</button>
          </div>
          <button type="button" class="ps-btn ghost" @click="addProposeOption">+ Add time option</button>
        </div>
        <p v-if="proposeError" class="err">{{ proposeError }}</p>
        <p v-if="proposeSuccess" class="ok">{{ proposeSuccess }}</p>
        <div class="modal-actions">
          <button type="button" class="ps-btn ghost" @click="closePropose">Cancel</button>
          <button type="button" class="ps-btn primary" :disabled="proposeSaving" @click="sendPropose">
            {{ proposeSaving ? 'Sending…' : 'Send options →' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="packetOpen" class="modal-backdrop" @click.self="closePacket">
      <div class="modal-card packet-modal">
        <h3>Send package packet</h3>
        <p class="muted">{{ packetClient?.full_name || packetClient?.initials || 'Client' }} — pick which catalog packages to offer (subset only).</p>
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
            <router-link class="muted link" :to="`/${slug}/admin/intake-links`">Manage intake links →</router-link>
          </div>
          <p class="muted tiny">Same onboarding document steps clients complete in order (sign, upload, forms).</p>
          <div v-if="intakeLinksLoading" class="muted">Loading forms…</div>
          <div v-else-if="!intakeLinks.length" class="muted tiny">No active intake links yet — optional for now.</div>
          <div v-else class="pkg-checks">
            <label v-for="link in intakeLinks" :key="link.id" class="pkg-check">
              <input v-model="packetForm.intakeLinkIds" type="checkbox" :value="link.id" />
              <span>
                <strong>{{ link.title || `Form #${link.id}` }}</strong>
                <em>{{ link.form_type || 'intake' }} · {{ link.public_key }}</em>
              </span>
            </label>
          </div>
        </div>
        <label>Note (optional)
          <textarea v-model="packetForm.notes" rows="2" placeholder="Anything you want them to know…" />
        </label>
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

    <section class="grid-3">
      <article class="card span-2">
        <div class="card-head">
          <h2>This week</h2>
          <span class="muted">Live from your calendar</span>
        </div>
        <div class="chart-stats week-stats">
          <div><strong>{{ dashLoading ? '…' : overview.sessionsThisWeek }}</strong><span>Sessions this week</span></div>
          <div><strong>{{ dashLoading ? '…' : overview.sessionsToday }}</strong><span>Today</span></div>
          <div><strong>{{ dashLoading ? '…' : formatMoney(overview.revenueMtdCents) }}</strong><span>Revenue MTD</span></div>
        </div>
        <p v-if="dashError" class="muted">{{ dashError }}</p>
      </article>

      <article class="card">
        <div class="card-head">
          <h2>Upcoming</h2>
          <router-link class="muted link" :to="`/${slug}/admin/provider-availability`">Calendar →</router-link>
        </div>
        <p v-if="dashLoading" class="muted">Loading…</p>
        <p v-else-if="!upcoming.length" class="muted">No upcoming coaching/discovery sessions.</p>
        <ul v-else class="timeline">
          <li v-for="item in upcoming" :key="item.id">
            <div class="time">{{ item.time }}</div>
            <div class="body">
              <div class="title">{{ item.title }}</div>
              <div class="meta">{{ item.meta }}</div>
            </div>
            <span class="badge" :class="item.badgeTone">{{ item.badge }}</span>
          </li>
        </ul>
      </article>
    </section>

    <section class="grid-3">
      <article class="card">
        <div class="card-head">
          <h2>Tasks</h2>
          <span class="muted">{{ openTasks.filter((t) => !t.done).length }} open</span>
        </div>
        <p v-if="!openTasks.length" class="muted">No open tasks.</p>
        <ul v-else class="checklist">
          <li v-for="t in openTasks" :key="t.id" :class="{ done: t.done }">
            <span class="check">{{ t.done ? '✓' : '' }}</span>
            {{ t.label }}
          </li>
        </ul>
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
        <div class="card-head"><h2>Recent activity</h2></div>
        <p v-if="!activity.length" class="muted">Payments and completed sessions will show here.</p>
        <ul v-else class="wins activity-list">
          <li v-for="a in activity" :key="a.id">
            <strong>{{ a.title }}</strong>
            <span class="meta">{{ a.meta }}</span>
          </li>
        </ul>
      </article>
    </section>
  </PractitionerShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import PractitionerShell from '../../layouts/PractitionerShell.vue';
import api from '../../services/api';
import { timezoneLabelFor } from '../../utils/timezones.js';
import { usePractitionerDashboardData } from '../../composables/usePractitionerDashboardData';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const slug = computed(() => String(route.params.organizationSlug || ''));
const startingLbw = ref(false);

const profileName = computed(() => {
  const u = authStore.user || {};
  const first = u.first_name || u.firstName || '';
  const last = u.last_name || u.lastName || '';
  return `${first} ${last}`.trim() || 'Coach';
});

const greeting = computed(() => {
  const name = authStore.user?.first_name || authStore.user?.firstName || 'there';
  return `Good morning, ${name}!`;
});

const publicHubUrl = computed(() => {
  if (typeof window === 'undefined') return `/${slug.value}/services`;
  return `${window.location.origin}/${slug.value}/services`;
});
const publicFinderUrl = computed(() => {
  if (typeof window === 'undefined') return `/${slug.value}/find-coach`;
  return `${window.location.origin}/${slug.value}/find-coach`;
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

const prospectiveClients = ref([]);
const prospectiveLoading = ref(false);
const prospectiveError = ref('');

const pipelineClients = ref([]);
const pipelineLoading = ref(false);
const pipelineError = ref('');
const balances = ref({});
const debitingId = ref(null);

const resolveAgencyId = () => {
  const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
  const id = Number(current?.id || 0);
  if (id > 0) return id;
  return null;
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
    pipelineError.value = e?.response?.data?.error?.message || 'Could not load pipeline clients';
    pipelineClients.value = [];
  } finally {
    pipelineLoading.value = false;
  }
};

const proposeOpen = ref(false);
const proposeClient = ref(null);
const proposeSaving = ref(false);
const proposeError = ref('');
const proposeSuccess = ref('');
const proposeForm = ref({
  clientEmail: '',
  countdownMinutes: 15,
  options: [{ startLocal: '' }, { startLocal: '' }]
});
const scheduleTimezoneIana = ref('America/Denver');
const scheduleTimezoneLabel = computed(() => timezoneLabelFor(scheduleTimezoneIana.value));

async function loadScheduleTimezone() {
  const agencyId = resolveAgencyId();
  const agencyTz = String(
    (agencyStore.currentAgency?.value ?? agencyStore.currentAgency)?.timezone || ''
  ).trim();
  if (agencyTz) {
    scheduleTimezoneIana.value = agencyTz;
    return;
  }
  try {
    const r = await api.get('/offices');
    const rows = Array.isArray(r.data) ? r.data : [];
    const forAgency = agencyId
      ? rows.filter((o) => {
          const ids = Array.isArray(o?.agencyIds) ? o.agencyIds.map(Number) : [];
          return ids.includes(agencyId) || Number(o?.agency_id || o?.agencyId || 0) === agencyId;
        })
      : rows;
    const tz = String((forAgency[0] || rows[0])?.timezone || '').trim();
    scheduleTimezoneIana.value = tz || 'America/Denver';
  } catch {
    scheduleTimezoneIana.value = 'America/Denver';
  }
}

onMounted(() => {
  loadProspectives();
  loadPipeline();
  refreshDashboard();
  void loadScheduleTimezone();
});

function defaultLocalSlots() {
  const base = new Date();
  base.setMinutes(0, 0, 0);
  base.setHours(base.getHours() + 24);
  const fmt = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const a = new Date(base);
  const b = new Date(base.getTime() + 24 * 60 * 60 * 1000);
  return [{ startLocal: fmt(a) }, { startLocal: fmt(b) }];
}

function openPropose(c) {
  proposeClient.value = c;
  proposeError.value = '';
  proposeSuccess.value = '';
  proposeForm.value = {
    clientEmail: '',
    countdownMinutes: 15,
    options: defaultLocalSlots()
  };
  proposeOpen.value = true;
  void loadScheduleTimezone();
}

function closePropose() {
  proposeOpen.value = false;
  proposeClient.value = null;
}

function addProposeOption() {
  proposeForm.value.options.push({ startLocal: '' });
}

async function sendPropose() {
  const agencyId = resolveAgencyId();
  const providerId = Number(authStore.user?.id || 0);
  const clientId = Number(proposeClient.value?.id || 0);
  if (!agencyId || !providerId || !clientId) {
    proposeError.value = 'Missing agency, provider, or client.';
    return;
  }
  if (!proposeForm.value.clientEmail.trim()) {
    proposeError.value = 'Client email is required.';
    return;
  }
  const durationMin = Number(proposeForm.value.countdownMinutes || 15);
  const options = proposeForm.value.options
    .map((o) => {
      if (!o.startLocal) return null;
      const start = new Date(o.startLocal);
      if (Number.isNaN(start.getTime())) return null;
      const end = new Date(start.getTime() + durationMin * 60 * 1000);
      return { startAt: start.toISOString(), endAt: end.toISOString() };
    })
    .filter(Boolean);
  if (options.length < 1) {
    proposeError.value = 'Add at least one valid time option.';
    return;
  }

  proposeSaving.value = true;
  proposeError.value = '';
  proposeSuccess.value = '';
  try {
    const res = await api.post('/discovery-sessions', {
      agencyId,
      providerId,
      clientId,
      clientEmail: proposeForm.value.clientEmail.trim(),
      clientName: proposeClient.value?.full_name || proposeClient.value?.initials || null,
      countdownMinutes: durationMin,
      options
    });
    proposeSuccess.value = res.data?.joinUrl
      ? `Sent. Private link: ${res.data.joinUrl}`
      : 'Discovery options sent.';
    loadPipeline();
  } catch (e) {
    proposeError.value = e?.response?.data?.error?.message || e.message || 'Failed to send options.';
  } finally {
    proposeSaving.value = false;
  }
}

const packetOpen = ref(false);
const packetClient = ref(null);
const packetSaving = ref(false);
const packetError = ref('');
const packetSuccess = ref('');
const catalogPackages = ref([]);
const catalogLoading = ref(false);
const intakeLinks = ref([]);
const intakeLinksLoading = ref(false);
const packetForm = ref({
  clientEmail: '',
  offeredIds: [],
  intakeLinkIds: [],
  notes: ''
});

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
    intakeLinks.value = [];
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
    packetError.value = 'Select at least one package to offer.';
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
  } catch (e) {
    packetError.value = e?.response?.data?.error?.message || e.message || 'Failed to send packet.';
  } finally {
    packetSaving.value = false;
  }
}

async function debitSession(c) {
  const agencyId = resolveAgencyId();
  const clientId = Number(c?.id || 0);
  if (!agencyId || !clientId) return;
  debitingId.value = clientId;
  try {
    const res = await api.post('/practitioner-packages/sessions/complete-debit', {
      agencyId,
      clientId
    });
    balances.value = {
      ...balances.value,
      [clientId]: Number(res.data?.remaining ?? Math.max(0, (balances.value[clientId] || 1) - 1))
    };
    if (res.data?.sessionIndex && res.data?.sessionsPurchased) {
      pipelineError.value = '';
      alert(
        `Recorded Session ${res.data.sessionIndex} of ${res.data.sessionsPurchased}.` +
          (res.data.exhausted
            ? ' Package exhausted — re-up, send a new package, or switch to pay-per-session.'
            : '')
      );
    } else if (res.data?.exhausted) {
      alert('Package exhausted — re-up, send a new package, or switch to pay-per-session.');
    }
  } catch (e) {
    pipelineError.value = e?.response?.data?.error?.message || e.message || 'Could not debit session.';
  } finally {
    debitingId.value = null;
  }
}

</script>

<style src="./practitionerShared.css"></style>
<style scoped>
.kpi-row {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.week-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  padding: 0.5rem 0;
}
.week-stats div { display: grid; gap: 0.15rem; }
.week-stats strong { font-size: 1.35rem; color: #1b4332; }
.week-stats span { font-size: 0.78rem; color: #64748b; }
.legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
.legend .dot {
  display: inline-block; width: 0.55rem; height: 0.55rem; border-radius: 999px; margin-right: 0.35rem;
}
.activity-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.55rem; }
.activity-list .meta { display: block; font-size: 0.78rem; color: #64748b; font-weight: 500; }
.booking-card {
  margin-bottom: 1rem;
  border: 1px solid rgba(45, 106, 79, 0.28);
  background: linear-gradient(180deg, rgba(45, 106, 79, 0.07), transparent);
}
.booking-copy {
  margin: 0 0 0.85rem;
  color: #475569;
  font-size: 0.9rem;
  line-height: 1.45;
  max-width: 48rem;
}
.booking-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}
.booking-url {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
  word-break: break-all;
}
.free-pill {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #059669;
  background: rgba(5, 150, 105, 0.12);
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
}
.prospective-card { margin-bottom: 1rem; }
.prospective-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.prospective-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}
.prospective-list .title { font-weight: 700; }
.prospective-list .meta { font-size: 0.78rem; color: #64748b; }
.row-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end; }
.link { text-decoration: none; }
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  display: grid; place-items: center; z-index: 80; padding: 1rem;
}
.modal-card {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 16px;
  padding: 1.15rem;
  display: grid;
  gap: 0.65rem;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}
.modal-card h3 { margin: 0; }
.modal-card label { display: grid; gap: 0.25rem; font-size: 0.82rem; font-weight: 700; color: #475569; }
.modal-card input {
  border: 1px solid #d1d5db; border-radius: 8px; padding: 0.45rem 0.55rem; font: inherit; font-weight: 500;
}
.tz-label { font-size: 0.8rem; font-weight: 700; color: #475569; margin: 0; }
.opt-editor { display: grid; gap: 0.45rem; }
.opt-row { display: flex; gap: 0.4rem; align-items: center; }
.opt-row input { flex: 1; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.35rem; }
.err { color: #b91c1c; font-size: 0.85rem; margin: 0; }
.ok { color: #047857; font-size: 0.82rem; margin: 0; word-break: break-all; }
.packet-modal { width: min(560px, 100%); }
.pkg-checks { display: grid; gap: 0.45rem; max-height: 220px; overflow: auto; }
.pkg-check {
  display: flex; gap: 0.55rem; align-items: flex-start;
  font-size: 0.85rem; font-weight: 500; color: #334155;
}
.pkg-check em { display: block; font-style: normal; color: #64748b; font-size: 0.78rem; }
.docs-block {
  border-top: 1px solid rgba(148, 163, 184, 0.25);
  padding-top: 0.65rem;
  display: grid;
  gap: 0.4rem;
}
.docs-head { display: flex; justify-content: space-between; gap: 0.5rem; align-items: baseline; }
.tiny { font-size: 0.78rem; margin: 0; }
.modal-card textarea {
  border: 1px solid #d1d5db; border-radius: 8px; padding: 0.45rem 0.55rem; font: inherit; font-weight: 500;
  resize: vertical;
}
@media (max-width: 1100px) {
  .kpi-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
