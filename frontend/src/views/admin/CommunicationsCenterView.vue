<template>
  <div class="cc-shell conversa-surface">

    <div class="cc-bg" aria-hidden="true" />

    <header class="cc-top">
      <div class="cc-brand">
        <p class="cc-eyebrow">{{ agencyLabel }} · Communications management</p>
        <ConversaBrand heading="h1" compact />

      </div>
      <nav class="cc-switch" role="tablist" aria-label="Communications management sections">
        <button
          type="button"
          role="tab"
          :aria-selected="activeMode === 'home'"
          class="cc-switch-btn"
          :class="{ on: activeMode === 'home' }"
          @click.prevent.stop="setMode('home')"
        >
          Shared inbox
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
          My messages
          <em v-if="personalUnread > 0">{{ personalUnread > 99 ? '99+' : personalUnread }}</em>
        </button>
        <button v-if="canManageTeam" type="button" role="tab" :aria-selected="activeMode === 'team'" class="cc-switch-btn" :class="{ on: activeMode === 'team' }" @click.prevent.stop="setMode('team')">Team texts &amp; polls</button>
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

    <div v-if="error" class="cc-banner-err" role="alert">{{ error }} <button type="button" class="btn btn-secondary btn-sm" @click="load">Retry</button></div>
    <div v-if="loading && !hasLoadedOnce" class="cc-loading" role="status">Updating message counts…</div>

      <!-- The inbox can load while independent summary counts are pending. -->
      <section v-show="activeMode === 'home'" class="cc-mode cc-mode--inbox">
        <UnifiedInboxShell v-if="visitedModes.has('home')" :active="activeMode === 'home'" :agency-id="agencyStore.currentAgency?.id" />
      </section>
      <!-- ========== MESSAGES (same as My Dashboard) ========== -->
      <section v-show="activeMode === 'messages'" class="cc-mode cc-messages-host">
        <MessagesHubShell v-if="visitedModes.has('messages')" />
      </section>

      <section v-if="visitedModes.has('team') && canManageTeam" v-show="activeMode === 'team'" class="cc-mode">
        <ConversaTeamCommunications :agency-id="agencyStore.currentAgency?.id" />
      </section>
      <!-- ========== SUPPORT HUB ========== -->
      <section v-show="activeMode === 'support'" class="cc-mode">

        <div class="cc-mode-intro split">
          <div>
            <h2>Support Hub</h2>
            <p>Support tickets, escalations, SMS care inbox, and org communication tools.</p>
          </div>
          <div class="cc-intro-actions">
            <button type="button" class="cc-btn outline" @click.prevent.stop="setMode('home')">← Inbox</button>
            <router-link class="cc-btn outline" :to="escalationsPath">Escalations</router-link>
            <button type="button" class="cc-btn solid" @click="openHubQueue('')">Support tickets</button>
          </div>
        </div>

        <div class="cc-kpi-row">
          <button type="button" v-for="c in hubKpis" :key="c.key" class="cc-kpi" :class="c.tone || ''" @click="openHubKpi(c.key)">
            <span class="cc-kpi-label">{{ c.label }}</span>
            <strong class="cc-kpi-value">{{ c.value }}</strong>
            <span class="cc-kpi-hint">{{ c.hint }}</span>
          </button>
        </div>

        <section v-if="hubQueueOpen" class="cc-panel cc-inline-desk">
          <header class="cc-panel-h"><h3>Support tickets · {{ agencyLabel }}</h3><button type="button" class="cc-btn outline sm" @click="hubQueueOpen = false">Close queue</button></header>
          <TicketDeskView :key="`${agencyStore.currentAgency?.id}:${hubQueueStatus}`" :agency-id="agencyStore.currentAgency?.id" :initial-status="hubQueueStatus" :active="activeMode === 'support'" :sync-route="false" />
        </section>
        <div class="cc-grid-main">
          <section v-for="(panel, index) in hubPanels" :key="panel" class="cc-panel" :class="{ 'cc-panel--tickets': panel === 'tickets' }">
            <header class="cc-panel-h">
              <h3>{{ { tickets: 'Support tickets', escalations: 'Escalations', activity: 'Recent activity' }[panel] }}</h3>
              <div class="cc-panel-tools">
                <select v-if="panel !== 'activity'" v-model="hubSort[panel]" :aria-label="`Sort ${panel}`"><option value="updated">Recently updated</option><option value="oldest">Oldest first</option><option value="priority">Priority</option></select>
                <button type="button" class="cc-btn outline sm" :disabled="index === 0" :aria-label="`Move ${panel} earlier`" @click="moveHubPanel(index, -1)">↑</button>
                <button type="button" class="cc-btn outline sm" :disabled="index === hubPanels.length - 1" :aria-label="`Move ${panel} later`" @click="moveHubPanel(index, 1)">↓</button>
              </div>
            </header>
            <template v-if="panel === 'tickets'">
              <div class="cc-mini-tabs"><button v-for="status in ['open','in_progress','waiting','closed']" :key="status" type="button" @click="openHubQueue(status)">{{ {open:'Open',in_progress:'In progress',waiting:'Waiting',closed:'Closed'}[status] }}</button></div>
              <button v-for="t in sortedHubRows('tickets')" :key="t.id" type="button" class="cc-ticket-summary" @click="openTicket(t)">
                <span class="cc-summary-id">#{{ t.id }} <i class="prio" :class="prioClass(t.priority)">{{ t.priority }}</i></span>
                <strong>{{ t.subject || 'Support request' }}</strong><span>{{ t.schoolName || t.school_name || agencyLabel }} · {{ t.status }} · {{ formatTime(t.updatedAt || t.updated_at) }}</span>
              </button>
              <p v-if="!summary.tickets?.recent?.length" class="cc-empty">No open tickets right now.</p>
              <button type="button" class="cc-btn solid sm" @click="openHubQueue('')">View all support tickets</button>
            </template>
            <template v-else-if="panel === 'escalations'">
              <router-link v-for="e in sortedHubRows('escalations')" :key="e.id" class="cc-ticket-summary" :to="{ path: escalationsPath, query: { escalationId: String(e.id) } }"><strong>#{{ e.id }} {{ e.subject }}</strong><span>{{ e.escalation_status_label || e.escalation_status }} · {{ e.claimed_by_name || 'Unassigned' }} · {{ formatTime(e.updated_at || e.created_at) }}</span></router-link>
              <p v-if="!escalationSummary.recent?.length" class="cc-empty">No open escalations.</p>
            </template>
            <ul v-else class="cc-activity"><li v-for="a in summary.recentActivity || []" :key="a.id"><span class="cc-act-kind">{{ a.kind || 'event' }}</span><div><strong>{{ a.text }}</strong><small>{{ formatTime(a.occurredAt) }}</small></div></li><li v-if="!summary.recentActivity?.length">No recent activity.</li></ul>
          </section>
        </div>
        <details class="cc-support-review" @toggle="reviewOpened = $event.target.open || reviewOpened">
          <summary>Text review &amp; spam</summary>
          <CommunicationReviewQueue @open-team="setMode('team')" v-if="reviewOpened && canUseSupportHub" :agency-id="agencyStore.currentAgency?.id" />
        </details>
        <details v-if="canUseSmsInbox" ref="agencyTextsEl" class="cc-support-review" @toggle="clinicalTextsOpened = $event.target.open || clinicalTextsOpened"><summary>Agency texts and faxes</summary><ClinicalClientTexts v-if="clinicalTextsOpened" /></details>

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
    <TicketDetailModal v-if="hubTicket" :ticket-id="hubTicket.id" :agency-id="hubTicket.agencyId" @close="hubTicket = null" @updated="load" />
  </div>
</template>

<script setup>
import ClinicalClientTexts from '../../components/communications/ClinicalClientTexts.vue';
import ConversaBrand from '../../components/conversa/ConversaBrand.vue';
import ConversaTeamCommunications from '../../components/conversa/ConversaTeamCommunications.vue';
import { canManageConversaTeam } from '../../constants/conversa';
import CommunicationReviewQueue from '../../components/communications/CommunicationReviewQueue.vue';
import TicketDeskView from '../../components/tickets/TicketDeskView.vue';
import TicketDetailModal from '../../components/tickets/TicketDetailModal.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { getStartupData } from '../../services/startupRequests';
import { useAuthStore } from '../../store/auth';
import { useSessionLockStore } from '../../store/sessionLock';
import { useAgencyStore } from '../../store/agency';
import MessagesHubShell from '../../components/messages/MessagesHubShell.vue';
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
  if (m === 'team' && !canManageConversaTeam(authStore.user)) return 'messages';
  if (['home', 'messages', 'support', 'automation', 'admin-update', 'school', 'team'].includes(m)) return m;
  // legacy feed deep-links
  if (m === 'dashboard') return 'home';
  return 'home';
}

const activeMode = ref(modeFromQuery(route.query?.mode));
// Load each inbox on first visit, then retain it while switching tabs.
const visitedModes = ref(new Set([activeMode.value]));
watch(activeMode, mode => { visitedModes.value = new Set([...visitedModes.value, mode]); });

const slug = computed(() => String(route.params?.organizationSlug || '').trim());
const prefix = computed(() => (slug.value ? `/${slug.value}` : ''));
const smsPath = computed(() => `${prefix.value}/admin/communications?mode=home&channel=sms`);
const ticketsPath = computed(() => `${prefix.value}/tickets`);
const escalationsPath = computed(() => `${prefix.value}/admin/escalations`);
const campaignsPath = computed(() => `${prefix.value}/admin/communications/campaigns`);
const contactsPath = computed(() => `${prefix.value}/admin/contacts`);
const textingSettingsPath = computed(() => `${prefix.value}/admin/settings?category=system&item=sms-numbers`);
const feedPath = computed(() => `${prefix.value}/admin/communications/feed`);
const myDashboardPath = computed(() => (slug.value ? `/${slug.value}/dashboard` : '/dashboard'));

const agencyLabel = computed(
  () => agencyStore.currentAgency?.name || agencyStore.currentAgency?.short_name || 'Admin'
);

const roleLower = computed(() => String(authStore.user?.role || '').toLowerCase());
const canManageTeam = computed(() => canManageConversaTeam(authStore.user));
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
    { id: 'team', label: 'Team texts & polls', desc: 'Conversa team broadcasts, voting, and delivery history', to: `${prefix.value}/admin/communications?mode=team`, roles: ['admin', 'support', 'super_admin'] },
    { id: 'campaigns', label: 'Broadcasts', desc: 'Campaigns and one-time sends', to: campaignsPath.value, roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider', 'schedule_manager', 'supervisor'] },
    { id: 'contacts', label: 'Contacts', desc: 'Agency contact directory', to: contactsPath.value, roles: ['admin', 'support', 'super_admin'] },
    { id: 'routing', label: 'Message routing', desc: 'SMS numbers and assignments', to: textingSettingsPath.value, roles: ['admin', 'support', 'super_admin'] },
    { id: 'admin-update', label: 'Admin Update', desc: 'Monthly branded staff newsletter', to: `${prefix.value}/admin/communications?mode=admin-update`, roles: ['admin', 'support', 'super_admin', 'staff'] },
    { id: 'school', label: 'School alerts', desc: 'School portal notifications', to: `${prefix.value}/admin/communications?mode=school`, roles: null, needsFeed: true },
    { id: 'compliance', label: 'Compliance', desc: 'Proof and opt-in surfaces', to: `${feedPath.value}?tab=proof`, roles: null, needsFeed: true },
    { id: 'sms', label: 'SMS inbox', desc: 'Clinical SMS in unified Home', to: smsPath.value, roles: null, needsSms: true },
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

function prioClass(p) {
  const s = String(p || 'medium').toLowerCase();
  if (s === 'high' || s === 'failed' || s === 'bounced') return 'prio-high';
  if (s === 'low') return 'prio-low';
  return 'prio-medium';
}

function formatTime(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const hubTicket = ref(null), hubQueueOpen = ref(false), hubQueueStatus = ref('');
const reviewOpened = ref(false), clinicalTextsOpened = ref(false), agencyTextsEl = ref(null);
const hubPanels = ref(['tickets', 'escalations', 'activity']);
const hubSort = ref({ tickets: 'updated', escalations: 'updated' });
try { const saved = JSON.parse(localStorage.getItem('conversa-support-panels') || 'null'); if (Array.isArray(saved) && saved.length === 3 && new Set(saved).size === 3 && saved.every(key => hubPanels.value.includes(key))) hubPanels.value = saved; } catch {}
function moveHubPanel(index, offset) {
  const next = [...hubPanels.value], target = index + offset;
  if (target < 0 || target >= next.length) return;
  [next[index], next[target]] = [next[target], next[index]]; hubPanels.value = next;
  try { localStorage.setItem('conversa-support-panels', JSON.stringify(next)); } catch {}
}
function sortedHubRows(panel) {
  const rows = [...(panel === 'tickets' ? summary.value.tickets?.recent || [] : escalationSummary.value.recent || [])];
  const time = row => new Date(row.updatedAt || row.updated_at || row.created_at || 0).getTime();
  const priority = row => row.immediate_action_required ? 0 : ({ high: 1, medium: 2, low: 3 }[row.priority] || 4);
  return rows.sort((a,b) => hubSort.value[panel] === 'priority' ? priority(a) - priority(b) || time(a) - time(b) : hubSort.value[panel] === 'oldest' ? time(a) - time(b) : time(b) - time(a));
}
function openHubQueue(status = '') { hubQueueStatus.value = status; hubQueueOpen.value = true; }
function openHubKpi(key) {
  if (key === 'escalations') router.push(escalationsPath.value);
  else if (key === 'unassigned') { clinicalTextsOpened.value = true; if (agencyTextsEl.value) { agencyTextsEl.value.open = true; agencyTextsEl.value.scrollIntoView({block:'nearest'}); } }
  else openHubQueue({ tickets: 'open', ip: 'in_progress', waiting: 'waiting' }[key] || '');
}
function openTicket(ticket) {
  const id = ticket?.id || ticket?.ticketId;
  if (id) hubTicket.value = { id, agencyId: ticket.agencyId || ticket.agency_id || agencyStore.currentAgency?.id };
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
      getStartupData('/communications/center-summary', { params, skipGlobalLoading: true }),
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
    error.value = e?.response?.data?.error?.message || 'Failed to load communications';
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
const sessionLock = useSessionLockStore();
watch(() => sessionLock.isLocked || sessionLock.warningActive, (locked, wasLocked) => {
  if (wasLocked && !locked) load();
});

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
.cc-messages-host {
  padding-bottom: 0;
  /* Match the standalone inbox's usable minimum, including wrapped toolbars. */
  min-height: max(48rem, calc(100dvh - 220px));
  height: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
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

.cc-top{padding:10px 18px;gap:10px;align-items:center}.cc-eyebrow{margin-bottom:4px;font-size:10px}.cc-mode{padding:14px 18px}.cc-mode-intro{margin-bottom:10px}.cc-mode-intro h2{font-size:21px;margin:0}.cc-mode-intro p{margin:4px 0;font-size:13px}
.cc-kpi-row{gap:8px;margin-bottom:12px}.cc-kpi{padding:10px 12px;text-align:left;font:inherit}.cc-kpi-value{font-size:25px}.cc-grid-main{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cc-panel--tickets{grid-column:1/-1}.cc-panel-h{padding:10px 12px}.cc-panel-tools{display:flex;gap:5px;align-items:center}.cc-panel-tools select{font:inherit;font-size:12px;padding:5px;border:1px solid #cbd5e1;border-radius:6px}
.cc-ticket-summary{display:flex;flex-direction:column;gap:3px;width:100%;box-sizing:border-box;text-align:left;border:0;border-top:1px solid #e2e8f0;background:transparent;color:inherit;padding:9px 12px;cursor:pointer;text-decoration:none}.cc-ticket-summary:hover{background:var(--bg-secondary,#eef4ff)}.cc-ticket-summary>span{font-size:12px;color:var(--text-secondary,#64748b)}.cc-ticket-summary strong{font-size:14px}.cc-mini-tabs{padding:6px 12px;display:flex;gap:6px}.cc-mini-tabs button{padding:5px 8px;font:inherit;font-size:12px;border:1px solid #dce5f0;border-radius:6px;background:transparent;color:inherit;cursor:pointer}
.cc-support-review{margin:12px 0;border:1px solid #dce5f0;border-radius:8px;padding:10px 12px;background:var(--bg-card,#fff)}.cc-support-review>summary{cursor:pointer;font-weight:600;font-size:13px}.cc-inline-desk{margin-bottom:12px}.cc-inline-desk :deep(.ticket-desk){padding:10px;height:75dvh}.cc-switch-btn{padding:8px 10px}
@media(max-width:700px){.cc-grid-main{grid-template-columns:1fr}.cc-panel-h{flex-wrap:wrap}.cc-top{position:static}.cc-mode{padding:10px}.cc-kpi-hint{display:none}}

.cc-panel{padding:10px 12px;border-radius:10px}.cc-panel-h{padding:0 0 8px;min-height:0;margin-bottom:4px}.cc-panel-h h3{margin:0;font-size:15px}.cc-panel .cc-empty{margin:8px 0;padding:0}.cc-kpi{min-height:0;box-shadow:none;border-radius:10px}.cc-grid-main .cc-panel{margin:0}.cc-tiles{gap:8px}.cc-tile{padding:9px 10px;border-radius:8px}
</style>
