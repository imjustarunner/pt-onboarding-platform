<template>
  <div class="cc-shell">
    <div class="cc-bg" aria-hidden="true" />

    <header class="cc-top">
      <div class="cc-brand">
        <p class="cc-eyebrow">{{ agencyLabel }} · Support</p>
        <h1>Communications Center</h1>
        <p class="cc-tag">Unified Inbox, Messages, Support Hub, Automation, Admin Update, and School alerts</p>
      </div>
      <nav class="cc-switch" role="tablist" aria-label="Communications Center sections">
        <button
          type="button"
          role="tab"
          :aria-selected="activeMode === 'home'"
          class="cc-switch-btn"
          :class="{ on: activeMode === 'home' }"
          @click.prevent.stop="setMode('home')"
        >
          Home
          <span class="cc-visually-hidden"> (Unified Inbox)</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeMode === 'messages'"
          class="cc-switch-btn"
          :class="{ on: activeMode === 'messages' }"
          @click.prevent.stop="setMode('messages')"
        >
          Messages
          <em v-if="personalUnread > 0">{{ personalUnread > 99 ? '99+' : personalUnread }}</em>
        </button>
        <button
          v-if="canUseSupportHub"
          type="button"
          role="tab"
          :aria-selected="activeMode === 'support'"
          class="cc-switch-btn"
          :class="{ on: activeMode === 'support' }"
          @click.prevent.stop="setMode('support')"
        >
          Support Hub
          <em v-if="supportAttention > 0">{{ supportAttention > 99 ? '99+' : supportAttention }}</em>
        </button>
        <button
          v-if="canUseSupportHub"
          type="button"
          role="tab"
          :aria-selected="activeMode === 'automation'"
          class="cc-switch-btn"
          :class="{ on: activeMode === 'automation' }"
          @click.prevent.stop="openAutomationTab"
        >
          Automation
          <em
            v-if="automationAttentionCount > 0"
            :class="{ 'cc-badge-quality': automationQualityCount > 0 }"
          >{{ automationAttentionCount > 99 ? '99+' : automationAttentionCount }}</em>
        </button>
        <button
          v-if="canUseSupportHub"
          type="button"
          role="tab"
          :aria-selected="activeMode === 'admin-update'"
          class="cc-switch-btn"
          :class="{ on: activeMode === 'admin-update' }"
          @click.prevent.stop="setMode('admin-update')"
        >
          Admin Update
        </button>
        <button
          v-if="canUseSchoolAlerts"
          type="button"
          role="tab"
          :aria-selected="activeMode === 'school'"
          class="cc-switch-btn"
          :class="{ on: activeMode === 'school' }"
          @click.prevent.stop="setMode('school')"
        >
          School alerts
        </button>
      </nav>
    </header>

    <div v-if="error" class="cc-banner-err">{{ error }}</div>
    <div v-if="loading && !hasLoadedOnce" class="cc-loading">Loading Communications Center…</div>

    <template v-if="!loading || hasLoadedOnce">
      <!-- ========== HOME (unified inbox) ========== -->
      <section v-show="activeMode === 'home'" class="cc-mode cc-mode--inbox">
        <UnifiedInboxShell :agency-id="agencyStore.currentAgency?.id" />
      </section>
      <!-- ========== MESSAGES (same as My Dashboard) ========== -->
      <section v-show="activeMode === 'messages'" class="cc-mode cc-messages-host">
        <div class="cc-mode-intro split compact">
          <div>
            <h2>Messages</h2>
            <p>Same Messages experience as My Dashboard — your personal inbox overview.</p>
          </div>
          <div class="cc-intro-actions">
            <button type="button" class="cc-btn outline" @click.prevent.stop="setMode('home')">← Center Home</button>
            <router-link class="cc-btn solid" :to="messagesWorkspacePath">Open inbox</router-link>
          </div>
        </div>
        <MessagesDashboard />
      </section>

      <!-- ========== SUPPORT HUB ========== -->
      <section v-show="activeMode === 'support'" class="cc-mode">
        <div class="cc-mode-intro split">
          <div>
            <h2>Support Hub</h2>
            <p>Support tickets, escalations, SMS care inbox, and org communication tools.</p>
          </div>
          <div class="cc-intro-actions">
            <button type="button" class="cc-btn outline" @click.prevent.stop="setMode('home')">← Center Home</button>
            <router-link class="cc-btn outline" :to="escalationsPath">Escalations</router-link>
            <router-link class="cc-btn solid" :to="ticketsPath">Ticket desk</router-link>
          </div>
        </div>

        <div class="cc-kpi-row">
          <article v-for="c in hubKpis" :key="c.key" class="cc-kpi" :class="c.tone || ''">
            <span class="cc-kpi-label">{{ c.label }}</span>
            <strong class="cc-kpi-value">{{ c.value }}</strong>
            <span class="cc-kpi-hint">{{ c.hint }}</span>
          </article>
        </div>

        <div class="cc-grid-main">
          <section class="cc-panel">
            <header class="cc-panel-h">
              <div>
                <h3>Escalations</h3>
                <p class="cc-panel-sub">Issue · root cause · recommended resolution — assignable ownership</p>
              </div>
              <router-link class="cc-btn solid sm" :to="escalationsPath">Escalations desk</router-link>
            </header>
            <div v-if="escalationSummary.recent?.length" class="cc-table">
              <div class="cc-tr head">
                <span>ID</span><span>Subject</span><span>Status</span><span>Owner</span><span>Updated</span>
              </div>
              <div v-for="e in escalationSummary.recent" :key="e.id" class="cc-tr">
                <span class="mono">#{{ e.id }}</span>
                <span class="grow">
                  {{ e.subject }}
                  <i v-if="e.immediate_action_required" class="prio high">immediate</i>
                </span>
                <span class="status">{{ e.escalation_status_label || e.escalation_status }}</span>
                <span>{{ e.claimed_by_name || 'Unassigned' }}</span>
                <span class="muted">{{ formatTime(e.updated_at || e.created_at) }}</span>
              </div>
            </div>
            <p v-else class="cc-empty pad">No open escalations. Submit from the admin dashboard card or Escalations desk.</p>
          </section>

          <section class="cc-panel">
            <header class="cc-panel-h">
              <div>
                <h3>Support tickets</h3>
                <div class="cc-mini-tabs">
                  <span class="on">Open ({{ summary.tickets?.open || 0 }})</span>
                  <span>In progress ({{ summary.tickets?.in_progress || 0 }})</span>
                  <span>Pending ({{ summary.tickets?.waiting || 0 }})</span>
                  <span>Resolved today ({{ summary.tickets?.closed_today || 0 }})</span>
                </div>
              </div>
              <router-link class="cc-btn solid sm" :to="ticketsPath">Ticket desk</router-link>
            </header>
            <div v-if="summary.tickets?.recent?.length" class="cc-table">
              <div class="cc-tr head">
                <span>ID</span><span>Subject</span><span>Priority</span><span>Status</span><span>Updated</span>
              </div>
              <div v-for="t in summary.tickets.recent" :key="t.id" class="cc-tr cc-click-row" @click="openTicket(t)">
                <span class="mono">#{{ t.id }}</span>
                <span class="grow">{{ t.subject }}</span>
                <span><i class="prio" :class="prioClass(t.priority)">{{ t.priority }}</i></span>
                <span class="status">{{ t.status }}</span>
                <span class="muted">{{ formatTime(t.updatedAt) }}</span>
              </div>
            </div>
            <p v-else class="cc-empty pad">No open tickets right now.</p>
          </section>

          <section class="cc-panel">
            <header class="cc-panel-h"><h3>Recent activity</h3></header>
            <ul v-if="summary.recentActivity?.length" class="cc-activity">
              <li v-for="a in summary.recentActivity" :key="a.id">
                <span class="cc-act-kind">{{ a.kind || 'event' }}</span>
                <div>
                  <strong>{{ a.text }}</strong>
                  <small>{{ formatTime(a.occurredAt) }}</small>
                </div>
              </li>
            </ul>
            <p v-else class="cc-empty">No recent activity.</p>
          </section>
        </div>

        <section class="cc-panel">
          <header class="cc-panel-h"><h3>Communication management</h3></header>
          <div class="cc-tiles">
            <router-link v-for="t in managementTools" :key="t.to" :to="t.to" class="cc-tile">
              <strong>{{ t.label }}</strong>
              <span>{{ t.desc }}</span>
            </router-link>
          </div>
        </section>
      </section>

      <!-- ========== AUTOMATION ========== -->
      <CommunicationsCenterAutomation
        v-if="activeMode === 'automation'"
        :prefix="prefix"
        :initial-channel="automationChannel"
        :initial-status="automationStatus"
        :initial-category="automationCategory"
        :initial-comm-id="automationCommId"
        :pending-count="automationPendingCount"
        :failed-count="automationFailedCount"
        :quality-issues-count="automationQualityCount"
        :sent-count="automationSentCount"
        :delivery-rate="summary.kpis?.deliveryRate ?? '—'"
        @go-home="setMode('home')"
        @counts-changed="load"
      />

      <CommunicationsCenterAdminUpdate
        v-if="activeMode === 'admin-update'"
        :prefix="prefix"
        @go-home="setMode('home')"
      />

      <!-- ========== SCHOOL ALERTS ========== -->
      <CommunicationsCenterSchoolAlerts
        v-if="activeMode === 'school'"
        :prefix="prefix"
        @go-home="setMode('home')"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import MessagesDashboard from '../../components/messages/MessagesDashboard.vue';
import CommunicationsCenterAutomation from '../../components/communications/CommunicationsCenterAutomation.vue';
import CommunicationsCenterSchoolAlerts from '../../components/communications/CommunicationsCenterSchoolAlerts.vue';
import CommunicationsCenterAdminUpdate from '../../components/communications/CommunicationsCenterAdminUpdate.vue';
import UnifiedInboxShell from '../../components/unifiedInbox/UnifiedInboxShell.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const loading = ref(false);
const hasLoadedOnce = ref(false);
const error = ref('');

const summary = ref({
  kpis: {},
  tickets: { recent: [] },
  queues: {},
  messagesMode: {},
  engagement: { pending: [], recentlySent: [] },
  recentActivity: []
});
const personal = ref({ cards: {}, priority: [] });
const escalationSummary = ref({ counts: { open: 0 }, recent: [] });

function modeFromQuery(raw) {
  const m = String(raw || 'home').toLowerCase();
  if (['home', 'messages', 'support', 'automation', 'admin-update', 'school'].includes(m)) return m;
  // legacy feed deep-links
  if (m === 'dashboard') return 'home';
  return 'home';
}

const activeMode = ref(modeFromQuery(route.query?.mode));

const slug = computed(() => String(route.params?.organizationSlug || '').trim());
const prefix = computed(() => (slug.value ? `/${slug.value}` : ''));
const smsPath = computed(() => `${prefix.value}/admin/communications/sms`);
const ticketsPath = computed(() => `${prefix.value}/tickets`);
const escalationsPath = computed(() => `${prefix.value}/admin/escalations`);
const campaignsPath = computed(() => `${prefix.value}/admin/communications/campaigns`);
const contactsPath = computed(() => `${prefix.value}/admin/contacts`);
const textingSettingsPath = computed(() => `${prefix.value}/admin/settings?category=system&item=sms-numbers`);
const feedPath = computed(() => `${prefix.value}/admin/communications/feed`);
const messagesWorkspacePath = computed(() => `${prefix.value}/messages?view=workspace`);
const myDashboardPath = computed(() => (slug.value ? `/${slug.value}/dashboard` : '/dashboard'));
const myMessagesPath = computed(() => (slug.value ? `/${slug.value}/messages` : '/messages'));

const agencyLabel = computed(
  () => agencyStore.currentAgency?.name || agencyStore.currentAgency?.short_name || 'Admin'
);

const roleLower = computed(() => String(authStore.user?.role || '').toLowerCase());
const canUseSupportHub = computed(() =>
  ['admin', 'support', 'super_admin'].includes(roleLower.value)
);
const canUseSmsInbox = computed(() =>
  ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'staff', 'provider', 'schedule_manager']
    .includes(roleLower.value)
);
const canUseEngagementFeed = computed(() =>
  ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff']
    .includes(roleLower.value)
);
const canUseSchoolAlerts = computed(() => canUseSupportHub.value && canUseEngagementFeed.value);

const automationPendingCount = computed(() => Number(summary.value.engagement?.pendingCount || 0));
const automationFailedCount = computed(() => Number(summary.value.engagement?.failedCount || 0));
const automationQualityCount = computed(() => Number(summary.value.engagement?.qualityIssuesCount || 0));
/** Prefer quality flags (orange); fall back to pending approvals. */
const automationAttentionCount = computed(() =>
  automationQualityCount.value > 0
    ? automationQualityCount.value
    : automationPendingCount.value + automationFailedCount.value
);
const automationSentCount = computed(() => Number(summary.value.engagement?.sentTotalCount || 0));
const automationChannel = computed(() => {
  const ch = String(route.query?.channel || 'email').toLowerCase();
  return ch === 'sms' ? 'sms' : 'email';
});
const automationStatus = computed(() => {
  const st = String(route.query?.status || '').toLowerCase();
  if (['pending', 'failed', 'sent'].includes(st)) return st;
  if (String(route.query?.category || '').toLowerCase() === 'quality') return 'sent';
  return automationPendingCount.value > 0 ? 'pending' : 'sent';
});
const automationCategory = computed(() => {
  const cat = String(route.query?.category || '').toLowerCase();
  if (cat === 'quality') return 'quality';
  return '';
});
const automationCommId = computed(() => String(route.query?.commId || '').trim());

function openAutomationTab() {
  if (automationQualityCount.value > 0) {
    setMode('automation', { category: 'quality', status: 'sent' });
    return;
  }
  setMode('automation');
}

const hubGreeting = computed(() => {
  const name = authStore.user?.first_name || 'there';
  const h = new Date().getHours();
  const hi = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${hi}, ${name}`;
});

const personalUnread = computed(() => Number(personal.value.cards?.unread || 0));
const openTicketTotal = computed(
  () => Number(summary.value.tickets?.open || 0) + Number(summary.value.tickets?.in_progress || 0)
);
const supportAttention = computed(
  () =>
    openTicketTotal.value +
    Number(escalationSummary.value.counts?.open || 0)
);

const hubKpis = computed(() => [
  { key: 'tickets', label: 'Open tickets', value: summary.value.kpis?.openTickets || 0, hint: 'Unclaimed queue', tone: 'accent' },
  { key: 'ip', label: 'In progress', value: summary.value.tickets?.in_progress || 0, hint: 'Claimed open', tone: 'secondary' },
  { key: 'waiting', label: 'Pending reply', value: summary.value.tickets?.waiting || 0, hint: 'Waiting on customer', tone: 'secondary' },
  { key: 'escalations', label: 'Open escalations', value: escalationSummary.value.counts?.open || 0, hint: 'Leadership workflow', tone: escalationSummary.value.counts?.open ? 'warn' : 'secondary' },
  { key: 'unassigned', label: 'Unassigned SMS', value: summary.value.messagesMode?.unassigned || 0, hint: 'Care inbox', tone: 'accent' }
]);

const homeSupportRows = computed(() => {
  const rows = [];
  for (const t of summary.value.tickets?.recent || []) {
    rows.push({
      id: `t-${t.id}`,
      kind: 'ticket',
      ticketId: t.id,
      badge: t.priority || 'ticket',
      priority: t.priority,
      title: `#${t.id} ${t.subject}`,
      meta: `${t.status} · ${formatTime(t.updatedAt)}`
    });
  }
  return rows.slice(0, 8);
});

const homeAutomationRows = computed(() =>
  (summary.value.engagement?.recentlySent || []).slice(0, 8)
);

const managementTools = computed(() => {
  const all = [
    { id: 'campaigns', label: 'Broadcasts', desc: 'Campaigns and one-time sends', to: campaignsPath.value, roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider', 'schedule_manager', 'supervisor'] },
    { id: 'contacts', label: 'Contacts', desc: 'Agency contact directory', to: contactsPath.value, roles: ['admin', 'support', 'super_admin'] },
    { id: 'routing', label: 'Message routing', desc: 'SMS numbers and assignments', to: textingSettingsPath.value, roles: ['admin', 'support', 'super_admin'] },
    { id: 'admin-update', label: 'Admin Update', desc: 'Monthly branded staff newsletter', to: `${prefix.value}/admin/communications?mode=admin-update`, roles: ['admin', 'support', 'super_admin', 'staff'] },
    { id: 'school', label: 'School alerts', desc: 'School portal notifications', to: `${prefix.value}/admin/communications?mode=school`, roles: null, needsFeed: true },
    { id: 'compliance', label: 'Compliance', desc: 'Proof and opt-in surfaces', to: `${feedPath.value}?tab=proof`, roles: null, needsFeed: true },
    { id: 'sms', label: 'SMS inbox', desc: 'Clinical care threads', to: smsPath.value, roles: null, needsSms: true },
    { id: 'tickets', label: 'Ticket desk', desc: 'Full support queue', to: ticketsPath.value, roles: null, needsSupport: true },
    { id: 'escalations', label: 'Escalations', desc: 'Leadership issue workflow', to: escalationsPath.value, roles: null, needsSupport: true },
    { id: 'feed', label: 'Feed archive', desc: 'Deep filters & history', to: feedPath.value, roles: null, needsFeed: true }
  ];
  return all.filter((t) => {
    if (t.needsSupport && !canUseSupportHub.value) return false;
    if (t.needsFeed && !canUseEngagementFeed.value) return false;
    if (t.needsSms && !canUseSmsInbox.value) return false;
    if (Array.isArray(t.roles) && !t.roles.includes(roleLower.value) && roleLower.value !== 'super_admin') {
      return false;
    }
    return true;
  });
});

function setMode(next, extraQuery = {}) {
  let mode = modeFromQuery(next);
  if ((mode === 'support' || mode === 'automation' || mode === 'admin-update') && !canUseSupportHub.value) mode = 'messages';
  if (mode === 'school' && !canUseSchoolAlerts.value) mode = 'home';
  activeMode.value = mode;
  const query = { ...route.query, mode, ...extraQuery };
  if (mode !== 'automation') {
    delete query.channel;
    delete query.status;
    delete query.commId;
    delete query.category;
  } else if (!Object.prototype.hasOwnProperty.call(extraQuery, 'category')) {
    delete query.category;
  }
  router.replace({ path: route.path, query }).catch(() => {});
}

function goSmsInbox() {
  router.push(smsPath.value).catch(() => {});
}

function prioClass(p) {
  const s = String(p || 'medium').toLowerCase();
  if (s === 'high' || s === 'failed' || s === 'bounced') return 'prio-high';
  if (s === 'low') return 'prio-low';
  return 'prio-medium';
}

function kindLabel(kind) {
  if (kind === 'sms') return 'SMS';
  if (kind === 'team') return 'Team';
  return 'Secure';
}

function formatTime(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function openPriorityItem(item) {
  let tab = 'dms';
  if (item.kind === 'sms') tab = 'sms';
  else if (item.kind === 'team') tab = 'dms';

  const threadId = item.threadId || String(item.id || '').replace(/^chat-/, '');
  router.push({
    path: myMessagesPath.value,
    query: {
      ...route.query,
      view: 'workspace',
      tab,
      ...(threadId ? { threadId: String(threadId) } : {}),
      ...(item.agencyId ? { agencyId: String(item.agencyId) } : {})
    }
  }).catch(() => {});
}

function openTicket(ticket) {
  const id = ticket?.id || ticket?.ticketId;
  if (!id) return;
  router.push({
    path: ticketsPath.value,
    query: { status: 'open', ticketId: String(id) }
  }).catch(() => {});
}

function openHomeSupportRow(row) {
  if (row.kind === 'ticket') {
    openTicket({ id: row.ticketId });
    return;
  }
  if (row.kind === 'engagement' && row.engagement) {
    openEngagementRow(row.engagement);
    return;
  }
  setMode('support');
}

function engagementFeedStatus(rowOrStatus) {
  if (typeof rowOrStatus === 'string') return rowOrStatus;
  const status = String(rowOrStatus?.status || '').toLowerCase();
  if (['pending', 'failed', 'bounced', 'undelivered'].includes(status)) {
    return status === 'pending' ? 'pending' : 'failed';
  }
  return 'sent';
}

function openAutomationFeed(statusOrRow = 'sent') {
  const status = engagementFeedStatus(statusOrRow);
  const channel = typeof statusOrRow === 'object'
    ? String(statusOrRow?.channel || 'email').toLowerCase()
    : 'email';
  setMode('automation', { channel, status });
}

function openEngagementRow(row) {
  if (!row) return;
  const status = engagementFeedStatus(row);
  const channel = String(row?.channel || 'email').toLowerCase();
  setMode('automation', { channel, status, commId: String(row.id || '') });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const agencyId = agencyStore.currentAgency?.id;
    const params = agencyId ? { agencyId } : {};
    const role = String(authStore.user?.role || '').toLowerCase();
    const membershipCount = (agencyStore.userAgencies || []).length;
    const combineAll = role === 'super_admin' || membershipCount > 1;
    const messageParams = {};
    if (combineAll) messageParams.allAgencies = 'true';
    else if (agencyId) messageParams.agencyId = agencyId;
    const [centerRes, personalRes, escRes] = await Promise.all([
      api.get('/communications/center-summary', { params, skipGlobalLoading: true }),
      api.get('/messages/dashboard-summary', { params: messageParams, skipGlobalLoading: true }).catch(() => ({ data: {} })),
      agencyId
        ? api.get('/escalations/summary', { params: { agencyId }, skipGlobalLoading: true }).catch(() => ({ data: {} }))
        : Promise.resolve({ data: {} })
    ]);
    summary.value = {
      kpis: centerRes.data?.kpis || {},
      tickets: centerRes.data?.tickets || { recent: [] },
      queues: centerRes.data?.queues || {},
      messagesMode: centerRes.data?.messagesMode || {},
      engagement: centerRes.data?.engagement || { pending: [], recentlySent: [] },
      recentActivity: centerRes.data?.recentActivity || []
    };
    personal.value = {
      cards: personalRes.data?.cards || {},
      priority: Array.isArray(personalRes.data?.priority) ? personalRes.data.priority : []
    };
    escalationSummary.value = {
      counts: escRes.data?.counts || { open: 0 },
      recent: Array.isArray(escRes.data?.recent) ? escRes.data.recent : []
    };
    hasLoadedOnce.value = true;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load Communications Center';
    hasLoadedOnce.value = true;
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.query?.mode,
  (m) => {
    const next = modeFromQuery(m);
    if (activeMode.value !== next) activeMode.value = next;
  }
);

watch(() => agencyStore.currentAgency?.id, () => load());

onMounted(() => {
  activeMode.value = modeFromQuery(route.query?.mode);
  load();
});
</script>

<style>
/* Tenant brand tokens: --primary / --secondary / --accent from branding store */
.cc-shell {
  --cc-primary: var(--primary, var(--agency-primary-color, #1f6b4a));
  --cc-secondary: var(--secondary, var(--agency-secondary-color, var(--cc-primary)));
  --cc-accent: var(--accent, var(--agency-accent-color, var(--cc-secondary)));
  --cc-ink: color-mix(in srgb, var(--cc-primary) 18%, #0f172a);
  --cc-muted: color-mix(in srgb, var(--cc-primary) 12%, #64748b);
  --cc-surface: #fff;
  --cc-wash: color-mix(in srgb, var(--cc-primary) 6%, #f4f7f5);
  --cc-line: color-mix(in srgb, var(--cc-primary) 14%, #e2e8f0);
  --cc-header-deep: color-mix(in srgb, var(--cc-primary) 78%, #04140c);
  --cc-header-mid: color-mix(in srgb, var(--cc-primary) 88%, #0a1f14);
  --cc-header-end: color-mix(in srgb, var(--cc-secondary) 72%, #062016);
  position: relative;
  min-height: calc(100vh - 64px);
  width: 100%;
  margin: 0;
  padding: 0 0 48px;
  color: var(--cc-ink);
  background: var(--cc-wash);
}
.cc-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(1100px 420px at 8% -8%, color-mix(in srgb, var(--cc-primary) 28%, transparent), transparent 58%),
    radial-gradient(900px 380px at 92% 4%, color-mix(in srgb, var(--cc-accent) 22%, transparent), transparent 52%),
    radial-gradient(700px 320px at 55% 18%, color-mix(in srgb, var(--cc-secondary) 14%, transparent), transparent 55%),
    linear-gradient(
      180deg,
      var(--cc-wash) 0%,
      color-mix(in srgb, var(--cc-secondary) 4%, #f7faf8) 100%
    );
}
.cc-top {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-end;
  padding: 22px 32px;
  color: #f8fafc;
  background:
    linear-gradient(
      125deg,
      var(--cc-header-deep) 0%,
      var(--cc-primary) 42%,
      var(--cc-header-end) 100%
    );
  border-bottom: 1px solid color-mix(in srgb, #fff 22%, transparent);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--cc-primary) 28%, transparent);
}
.cc-eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in srgb, #fff 72%, var(--cc-accent));
}
.cc-brand h1 {
  margin: 0;
  font-size: clamp(1.6rem, 2.2vw, 2.1rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  text-shadow: 0 1px 0 color-mix(in srgb, #000 18%, transparent);
}
.cc-tag {
  margin: 6px 0 0;
  max-width: 560px;
  color: color-mix(in srgb, #fff 82%, var(--cc-secondary));
  font-size: 13px;
  line-height: 1.4;
}
.cc-switch {
  display: inline-flex;
  padding: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, #000 28%, transparent);
  border: 1px solid color-mix(in srgb, #fff 28%, transparent);
  gap: 4px;
  backdrop-filter: blur(6px);
}
.cc-switch-btn {
  border: none;
  background: color-mix(in srgb, #fff 10%, transparent);
  color: #f8fafc !important;
  font-size: 13px;
  font-weight: 800;
  padding: 10px 14px;
  border-radius: 999px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
}
.cc-switch-btn:hover {
  background: color-mix(in srgb, #fff 18%, transparent);
}
.cc-switch-btn em {
  font-style: normal;
  background: var(--cc-accent);
  color: color-mix(in srgb, var(--cc-accent) 12%, #1a1200);
  border-radius: 999px;
  padding: 0 6px;
  font-size: 10px;
  font-weight: 900;
}
.cc-switch-btn em.cc-badge-quality {
  background: #ea580c;
  color: #fff;
}
.cc-switch-btn.on {
  background: color-mix(in srgb, #fff 92%, var(--cc-accent)) !important;
  color: var(--cc-header-deep) !important;
  box-shadow: 0 8px 22px color-mix(in srgb, #000 22%, transparent);
}
.cc-loading, .cc-banner-err {
  position: relative;
  z-index: 2;
  margin: 12px 32px 0;
}
.cc-banner-err {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 600;
}
.cc-loading { color: var(--cc-muted); }
.cc-mode {
  position: relative;
  z-index: 2;
  padding: 18px 32px 0;
}
.cc-mode--inbox {
  padding-bottom: 24px;
}
.cc-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.cc-messages-host { padding-bottom: 24px; }
.cc-mode-intro { margin-bottom: 16px; }
.cc-mode-intro.split {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-end;
}
.cc-mode-intro.compact { margin-bottom: 8px; }
.cc-mode-intro h2 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: color-mix(in srgb, var(--cc-primary) 55%, var(--cc-ink));
}
.cc-mode-intro p {
  margin: 6px 0 0;
  color: var(--cc-muted);
  font-size: 14px;
}
.cc-intro-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cc-personal-nav {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.01em;
}
.cc-personal-nav a {
  color: var(--cc-primary);
  text-decoration: none;
}
.cc-personal-nav a:hover { text-decoration: underline; }
.cc-personal-sep { color: var(--cc-muted); font-weight: 600; }
.cc-kpi-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.cc-kpi-row.home { grid-template-columns: repeat(6, minmax(0, 1fr)); }
@media (max-width: 1100px) {
  .cc-kpi-row, .cc-kpi-row.home { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .cc-top, .cc-mode { padding-left: 16px; padding-right: 16px; }
  .cc-kpi-row, .cc-kpi-row.home { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.cc-kpi {
  background: var(--cc-surface);
  border: 1px solid var(--cc-line);
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: 0 10px 30px color-mix(in srgb, var(--cc-primary) 6%, transparent);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 104px;
  text-align: left;
  cursor: default;
  font: inherit;
  color: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
}
button.cc-kpi { cursor: pointer; }
button.cc-kpi:hover {
  border-color: color-mix(in srgb, var(--cc-primary) 45%, var(--cc-line));
  box-shadow: 0 12px 28px color-mix(in srgb, var(--cc-primary) 16%, transparent);
  transform: translateY(-1px);
}
.cc-kpi.accent {
  background: linear-gradient(160deg, color-mix(in srgb, var(--cc-primary) 14%, #fff), #fff);
  border-color: color-mix(in srgb, var(--cc-primary) 35%, #fff);
}
.cc-kpi.secondary {
  background: linear-gradient(160deg, color-mix(in srgb, var(--cc-secondary) 16%, #fff), #fff);
  border-color: color-mix(in srgb, var(--cc-secondary) 38%, #fff);
}
.cc-kpi.pop {
  background: linear-gradient(160deg, color-mix(in srgb, var(--cc-accent) 18%, #fff), #fff);
  border-color: color-mix(in srgb, var(--cc-accent) 42%, #fff);
}
.cc-kpi.warn {
  background: linear-gradient(160deg, #fffbeb, #fff);
  border-color: #fde68a;
}
.cc-kpi.kpi-pending {
  background: linear-gradient(160deg, #fffbeb, #fff);
  border-color: #fcd34d;
}
.cc-kpi.kpi-pending .cc-kpi-value { color: #b45309; }
.cc-kpi.kpi-failed {
  background: linear-gradient(160deg, #fef2f2, #fff);
  border-color: #fca5a5;
}
.cc-kpi.kpi-failed .cc-kpi-value { color: #dc2626; }
.cc-kpi.kpi-quality {
  background: linear-gradient(160deg, #fff7ed, #fff);
  border-color: #fdba74;
}
.cc-kpi.kpi-quality .cc-kpi-value { color: #ea580c; }
.cc-kpi.kpi-sent.accent {
  background: linear-gradient(160deg, color-mix(in srgb, var(--cc-primary) 14%, #fff), #fff);
  border-color: color-mix(in srgb, var(--cc-primary) 35%, #fff);
}
.cc-kpi.kpi-sent.accent .cc-kpi-value { color: var(--cc-primary); }
.cc-kpi.kpi-rate.pop {
  background: linear-gradient(160deg, color-mix(in srgb, var(--cc-accent) 18%, #fff), #fff);
  border-color: color-mix(in srgb, var(--cc-accent) 42%, #fff);
}
.cc-kpi.kpi-rate.pop .cc-kpi-value { color: color-mix(in srgb, var(--cc-accent) 75%, #0f172a); }
.automation-kpis {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
@media (max-width: 1100px) {
  .automation-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .automation-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.cc-type-filter { min-width: 220px; }
.cc-kpi-label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--cc-muted);
}
.cc-kpi-value {
  font-size: 1.7rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: color-mix(in srgb, var(--cc-primary) 35%, var(--cc-ink));
}
.cc-kpi.accent .cc-kpi-value { color: var(--cc-primary); }
.cc-kpi.secondary .cc-kpi-value { color: color-mix(in srgb, var(--cc-secondary) 80%, #0f172a); }
.cc-kpi.pop .cc-kpi-value { color: color-mix(in srgb, var(--cc-accent) 75%, #0f172a); }
.cc-kpi-hint { font-size: 12px; color: color-mix(in srgb, var(--cc-muted) 80%, #94a3b8); }
.cc-alert-row { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.cc-alert {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
}
.cc-alert.danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.cc-alert.warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.cc-alert.info {
  background: color-mix(in srgb, var(--cc-primary) 10%, #fff);
  color: color-mix(in srgb, var(--cc-primary) 55%, #0f172a);
  border: 1px solid color-mix(in srgb, var(--cc-primary) 28%, #fff);
}
.cc-alert-btn {
  border: none;
  background: var(--cc-primary);
  color: #fff !important;
  text-decoration: none;
  font-size: 12px;
  font-weight: 800;
  padding: 8px 12px;
  border-radius: 999px;
  cursor: pointer;
}
.cc-alert.danger .cc-alert-btn { background: #b91c1c; }
.cc-alert.warn .cc-alert-btn { background: color-mix(in srgb, var(--cc-accent) 55%, #92400e); }
.cc-grid-main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}
.cc-grid-main.home-panels {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
@media (max-width: 1200px) {
  .cc-grid-main.home-panels { grid-template-columns: 1fr; }
}
.cc-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}
@media (max-width: 980px) {
  .cc-grid-main, .cc-grid-3 { grid-template-columns: 1fr; }
}
.cc-panel {
  background: var(--cc-surface);
  border: 1px solid var(--cc-line);
  border-radius: 18px;
  padding: 16px 18px;
  box-shadow: 0 12px 36px color-mix(in srgb, var(--cc-primary) 7%, transparent);
}
.cc-panel-h {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.cc-panel-h h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: color-mix(in srgb, var(--cc-primary) 45%, var(--cc-ink));
}
.cc-panel-sub { margin: 4px 0 0; font-size: 12px; color: var(--cc-muted); }
.cc-linkish, .cc-text-btn {
  border: none;
  background: none;
  color: var(--cc-primary);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  padding: 0;
  text-align: left;
}
.cc-mini-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--cc-muted);
}
.cc-mini-tabs .on { color: var(--cc-primary); }
.cc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  font-size: 13px;
  font-weight: 800;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid transparent;
  cursor: pointer;
  background: #fff;
  color: var(--cc-ink);
}
.cc-btn.solid {
  background: linear-gradient(135deg, var(--cc-primary), color-mix(in srgb, var(--cc-secondary) 70%, var(--cc-primary)));
  color: #fff !important;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--cc-primary) 28%, transparent);
}
.cc-btn.outline {
  border-color: color-mix(in srgb, var(--cc-primary) 35%, var(--cc-line));
  color: var(--cc-primary);
  background: color-mix(in srgb, var(--cc-primary) 4%, #fff);
}
.cc-btn.sm { padding: 8px 12px; font-size: 12px; }
.cc-btn.block { width: 100%; margin-top: 10px; }
.cc-tickets, .cc-eng-list, .cc-activity, .cc-quick, .cc-stat-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cc-tickets li, .cc-eng-list li, .cc-activity li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--cc-primary) 6%, #f1f5f9);
}
.cc-msg-row {
  cursor: pointer;
  transition: background 0.15s ease;
  border-radius: 6px;
  padding-left: 8px !important;
  padding-right: 8px !important;
  margin-left: -8px;
  margin-right: -8px;
}
.cc-msg-row:hover {
  background: color-mix(in srgb, var(--cc-primary) 6%, #f8fafc);
}
.cc-tickets strong, .cc-eng-body strong, .cc-activity strong {
  display: block;
  font-size: 13px;
}
.cc-tickets small, .cc-eng-body small, .cc-activity small {
  color: var(--cc-muted);
  font-size: 11px;
}
.cc-unread {
  background: var(--cc-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  border-radius: 999px;
  padding: 2px 7px;
  margin-left: auto;
}
.cc-eng-ch {
  font-size: 10px;
  font-weight: 800;
  padding: 4px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--cc-accent) 28%, #fff);
  color: color-mix(in srgb, var(--cc-accent) 55%, #3f2a00);
}
.cc-eng-body { flex: 1; min-width: 0; }
.cc-eng-list time { font-size: 11px; color: var(--cc-muted); white-space: nowrap; }
.cc-act-kind {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--cc-muted);
  min-width: 72px;
}
.cc-table { display: flex; flex-direction: column; gap: 2px; }
.cc-tr {
  display: grid;
  grid-template-columns: 64px minmax(0, 1.6fr) 90px 100px 110px;
  gap: 8px;
  align-items: center;
  padding: 10px 8px;
  border-radius: 10px;
  font-size: 13px;
}
.cc-tr:not(.head):hover {
  background: color-mix(in srgb, var(--cc-primary) 6%, #fff);
}
.cc-click-row { cursor: pointer; }
.cc-linkish.block {
  display: inline-block;
  margin-top: 8px;
}
.cc-tr.head {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--cc-muted);
}
.cc-tr .grow { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-tr .mono { font-weight: 700; }
.cc-tr .muted { color: var(--cc-muted); font-size: 12px; }
.cc-tr .status { text-transform: capitalize; font-size: 12px; font-weight: 700; color: color-mix(in srgb, var(--cc-primary) 20%, #475569); }
.prio {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cc-primary) 10%, #e2e8f0);
  font-style: normal;
}
.prio-high { background: #fecaca; color: #991b1b; }
.prio-medium { background: color-mix(in srgb, var(--cc-accent) 45%, #fed7aa); color: #9a3412; }
.prio-low { background: color-mix(in srgb, var(--cc-primary) 35%, #bbf7d0); color: #14532d; }
.cc-analytics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.cc-metric {
  border: 1px solid var(--cc-line);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--cc-muted);
  background: color-mix(in srgb, var(--cc-primary) 3%, #fff);
}
.cc-metric strong { font-size: 1.25rem; color: var(--cc-primary); }
.cc-seg {
  display: inline-flex;
  border: 1px solid var(--cc-line);
  border-radius: 999px;
  padding: 3px;
  gap: 2px;
  background: color-mix(in srgb, var(--cc-primary) 4%, #f8fafc);
}
.cc-seg button {
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 800;
  padding: 7px 12px;
  border-radius: 999px;
  cursor: pointer;
  color: var(--cc-muted);
}
.cc-seg button.on {
  background: var(--cc-primary);
  color: #fff;
}
.cc-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}
.cc-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border-radius: 14px;
  text-decoration: none;
  color: inherit;
  background: linear-gradient(160deg, color-mix(in srgb, var(--cc-primary) 5%, #f8fafc), #fff);
  border: 1px solid var(--cc-line);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
}
.cc-tile:hover {
  border-color: color-mix(in srgb, var(--cc-primary) 45%, var(--cc-line));
  box-shadow: 0 10px 22px color-mix(in srgb, var(--cc-primary) 12%, transparent);
  transform: translateY(-1px);
}
.cc-tile strong { font-size: 13px; color: color-mix(in srgb, var(--cc-primary) 40%, var(--cc-ink)); }
.cc-tile span { font-size: 12px; color: var(--cc-muted); }
.cc-quick li { margin: 8px 0; font-size: 13px; font-weight: 700; }
.cc-quick a, .cc-quick .cc-text-btn {
  color: var(--cc-primary);
  text-decoration: none;
  font-size: 13px;
  font-weight: 700;
}
.cc-stat-list li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--cc-primary) 6%, #f1f5f9);
  font-size: 13px;
}
.hot { color: #dc2626; }
.cc-empty { color: var(--cc-muted); font-size: 13px; }
.cc-empty.pad { padding: 18px 0; }
</style>
