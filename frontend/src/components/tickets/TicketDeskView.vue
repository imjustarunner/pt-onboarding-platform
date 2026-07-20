<template>
  <div class="ticket-desk" :class="{ compact, 'ticket-desk--platform': isPlatformTheme }">
    <header v-if="!compact" class="desk-header">
      <div>
        <h2 class="desk-title">Tickets</h2>
        <p class="desk-sub">Manage and respond to support requests.</p>
      </div>
      <div class="desk-header-actions">
        <button
          v-if="!useMineForced"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="toggleViewMode"
        >
          {{ viewMode === 'mine' ? 'Show all tickets' : 'Show my tickets' }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" @click="loadAll" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div v-if="showTenantSwitcher || showPlatformChip" class="tenant-rail-wrap">
      <button
        v-if="showPlatformChip"
        type="button"
        class="platform-chip"
        :class="{ active: agencyIdInput === 'platform' }"
        title="Plot Twist HQ platform support queue"
        @click="selectPlatformQueue"
      >
        <div class="platform-chip-mark" aria-hidden="true">PT</div>
        <span class="platform-chip-name">Platform</span>
        <div class="platform-chip-counts">
          <span class="tcs-count open">{{ platformCounts.open > 99 ? '99+' : platformCounts.open }}</span>
          <span class="tcs-count mine">{{ platformCounts.mine > 99 ? '99+' : platformCounts.mine }}</span>
        </div>
      </button>
      <TenantContextSwitcher
        v-if="showTenantSwitcher"
        v-model="tenantAgencyId"
        :tenants="agencyOptions"
        :counts="agencyCounts"
        :allow-all="agencyOptions.length > 1"
        :compact="compact"
        :platform-theme="isPlatformTheme"
        aria-label="Switch tenant for tickets"
        @select="onTenantSelect"
      />
    </div>

    <div v-if="!compact" class="metrics">
      <button
        v-for="m in metricCards"
        :key="m.key"
        type="button"
        class="metric-card"
        :class="{ active: displayStatus === m.key }"
        @click="toggleMetric(m.key)"
      >
        <span class="metric-label">{{ m.label }}</span>
        <span class="metric-value">{{ m.value }}</span>
      </button>
    </div>

    <div class="desk-body">
      <aside class="list-pane" :class="{ 'hide-mobile': selectedId && isNarrow }">
        <div class="list-toolbar">
          <input
            v-model="searchInput"
            class="search"
            type="search"
            placeholder="Search tickets or schools…"
            @keydown.enter="loadTickets"
          />
          <div class="filters">
            <select v-model="priorityFilter" @change="loadTickets">
              <option value="">Priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select v-model="sourceChannel" @change="loadTickets">
              <option value="">Source</option>
              <option value="portal">Portal</option>
              <option value="email">Email</option>
            </select>
            <select v-if="!isSchoolStaff" v-model="creatorRoleFilter" @change="loadTickets">
              <option value="">Creator</option>
              <option value="school_staff">School staff</option>
              <option value="client_guardian">Guardian</option>
            </select>
            <select v-model="topicFilter" @change="loadTickets">
              <option value="">Audience</option>
              <option v-for="t in ticketTopics" :key="t.id" :value="t.id">{{ t.short }}</option>
            </select>
          </div>
        </div>

        <div v-if="error" class="error pad">{{ error }}</div>
        <div v-else-if="loading && !tickets.length" class="muted pad">Loading tickets…</div>
        <div v-else-if="!tickets.length" class="muted pad">No tickets match.</div>
        <ul v-else class="ticket-list">
          <li
            v-for="t in tickets"
            :key="t.id"
            class="ticket-row"
            :class="{ active: selectedId === t.id }"
            @click="selectTicket(t)"
          >
            <div class="row-top">
              <span class="ticket-id">#{{ t.id }}</span>
              <span class="prio" :class="`prio-${(t.priority || 'medium')}`">{{ t.priority || 'medium' }}</span>
              <span class="status-pill" :class="`st-${t.display_status || t.status}`">
                {{ statusLabel(t) }}
              </span>
            </div>
            <div class="subject">{{ t.subject || 'Support ticket' }}</div>
            <div class="preview">{{ previewText(t) }}</div>
            <div class="row-meta">
              <span v-if="isGuardianTicket(t)" class="creator-chip">Guardian</span>
              <span
                v-if="isProductHelpRequest(t)"
                class="topic-chip topic-product-help"
                title="Submitter asked for product/platform help — escalate when ready"
              >Product help</span>
              <span
                v-if="t.topic && t.topic !== 'general'"
                class="topic-chip"
                :class="`topic-${t.topic}`"
              >{{ ticketTopicLabel(t.topic) }}</span>
              <span>{{ t.school_name || '—' }}</span>
              <span v-if="t.client_identifier_code || t.client_initials">
                · {{ t.client_identifier_code || t.client_initials }}
              </span>
              <span class="updated">{{ formatRelative(t.updated_at || t.created_at) }}</span>
            </div>
            <div v-if="assigneeName(t)" class="assignee">{{ assigneeName(t) }}</div>
          </li>
        </ul>
      </aside>

      <section class="detail-pane" :class="{ 'hide-mobile': !selectedId && isNarrow }">
        <div v-if="!selected" class="empty-detail">
          <p>Select a ticket to view the conversation.</p>
        </div>
        <template v-else>
          <div class="detail-header">
            <button v-if="isNarrow || compact" type="button" class="btn btn-secondary btn-xs" @click="clearSelection">
              ← Back
            </button>
            <div class="detail-title-block">
              <div class="detail-id">Ticket #{{ selected.id }}</div>
              <h3 class="detail-subject">{{ selected.subject || 'Client message' }}</h3>
              <div class="breadcrumb">
                <span v-if="selected.agency_name">{{ selected.agency_name }}</span>
                <span v-if="selected.school_name"> → {{ selected.school_name }}</span>
                <span v-if="createdByName"> · Submitted by {{ createdByName }}</span>
              </div>
              <div class="badge-row">
                <span class="prio" :class="`prio-${selected.priority || 'medium'}`">
                  {{ (selected.priority || 'medium') }} priority
                </span>
                <span
                  v-if="isProductHelpRequest(selected)"
                  class="topic-chip topic-product-help"
                  title="Submitter asked for product/platform help"
                >Product help</span>
                <span
                  v-if="selected.topic"
                  class="topic-chip"
                  :class="`topic-${selected.topic || 'general'}`"
                  :title="`Routed to ${ticketTopicLabel(selected.topic)} audience`"
                >{{ ticketTopicLabel(selected.topic) }}</span>
                <span class="status-pill" :class="`st-${selected.display_status || selected.status}`">
                  {{ statusLabel(selected) }}
                </span>
                <span v-if="assigneeName(selected)" class="claimed-chip">
                  Claimed: {{ assigneeName(selected) }}
                </span>
              </div>
            </div>
            <div class="detail-actions">
              <button
                v-if="canClaim && !selected.claimed_by_user_id"
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="busy"
                @click="claim"
              >
                Claim
              </button>
              <button
                v-if="canClaim && selected.claimed_by_user_id === myUserId"
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="busy"
                @click="unclaim"
              >
                Unclaim
              </button>
              <button
                v-if="canEscalateToPlatform"
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="busy || escalating"
                :title="'Send this ticket to Plot Twist HQ platform support'"
                @click="escalateToPlatform"
              >
                {{ escalating ? 'Escalating…' : 'Escalate to Platform' }}
              </button>
              <button
                v-if="canClose"
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="busy || selected.status === 'closed'"
                @click="closeTicket"
              >
                Close
              </button>
            </div>
          </div>

          <div class="detail-main">
            <div class="conversation-col">
              <div class="tab-row">
                <button type="button" class="tab active">Conversation</button>
                <button type="button" class="tab" disabled title="Coming soon">Details</button>
                <button type="button" class="tab" disabled title="Coming soon">Client</button>
              </div>

              <div v-if="messagesLoading" class="muted pad">Loading conversation…</div>
              <div v-else-if="messagesError" class="error pad">{{ messagesError }}</div>
              <div v-else class="thread" ref="threadEl">
                <div
                  v-for="m in messages"
                  :key="m.id"
                  class="bubble"
                  :class="{
                    mine: m.author_user_id === myUserId,
                    internal: !!m.is_internal
                  }"
                >
                  <div v-if="m.is_internal" class="internal-label">Internal note</div>
                  <div class="bubble-meta">
                    <strong>{{ messageAuthor(m) }}</strong>
                    <span>{{ formatDateTime(m.created_at) }}</span>
                  </div>
                  <div class="bubble-body">{{ m.body || '(deleted)' }}</div>
                </div>
                <div v-if="!messages.length" class="muted pad">No messages yet.</div>
              </div>

              <div v-if="selected.ai_draft_response && canAnswer" class="ai-draft-banner">
                <div class="ai-draft-head">
                  <strong>AI draft</strong>
                  <span v-if="selected.ai_draft_review_state" class="muted">
                    · {{ selected.ai_draft_review_state }}
                  </span>
                  <span v-if="selected.sent_at" class="muted"> · sent {{ formatDateTime(selected.sent_at) }}</span>
                </div>
                <div class="ai-draft-body">{{ selected.ai_draft_response }}</div>
                <div class="ai-draft-actions">
                  <button type="button" class="btn btn-secondary btn-xs" @click="useAiDraft">Use draft</button>
                  <button type="button" class="btn btn-secondary btn-xs" @click="copyAiDraft">Copy</button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    :disabled="reviewingDraft"
                    @click="markDraftReview('accepted')"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    :disabled="reviewingDraft"
                    @click="markDraftReview('needs_review')"
                  >
                    Needs review
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    :disabled="markingSent"
                    @click="markDraftSent"
                  >
                    Mark sent
                  </button>
                </div>
              </div>

              <div class="composer">
                <div v-if="canInternal || canAnswer" class="composer-tabs">
                  <button
                    type="button"
                    class="composer-tab"
                    :class="{ active: composerMode === 'reply' }"
                    @click="composerMode = 'reply'"
                  >
                    Reply
                  </button>
                  <button
                    v-if="canInternal"
                    type="button"
                    class="composer-tab"
                    :class="{ active: composerMode === 'internal' }"
                    @click="composerMode = 'internal'"
                  >
                    Internal note
                  </button>
                  <button
                    v-if="canAnswer"
                    type="button"
                    class="composer-tab"
                    :class="{ active: composerMode === 'answer' }"
                    @click="composerMode = 'answer'"
                  >
                    Official answer
                  </button>
                </div>
                <textarea
                  v-model="draft"
                  rows="3"
                  :placeholder="composerPlaceholder"
                />
                <div v-if="actionError" class="error">{{ actionError }}</div>
                <div class="composer-actions">
                  <button
                    v-if="canAnswer && composerMode !== 'internal'"
                    type="button"
                    class="btn btn-secondary"
                    :disabled="generatingDraft || busy || !selected?.id"
                    @click="generateDraft"
                  >
                    {{ generatingDraft ? 'Generating…' : 'AI draft' }}
                  </button>
                  <button
                    v-if="composerMode === 'answer'"
                    type="button"
                    class="btn btn-primary"
                    :disabled="sending || !draft.trim() || !canActOnSelected"
                    @click="submitOfficialAnswer"
                  >
                    {{ sending ? 'Sending…' : 'Send answer' }}
                  </button>
                  <button
                    v-else
                    type="button"
                    class="btn btn-primary"
                    :disabled="sending || !draft.trim()"
                    @click="sendMessage"
                  >
                    {{ sending ? 'Sending…' : composerMode === 'internal' ? 'Add note' : 'Send reply' }}
                  </button>
                </div>
              </div>
            </div>

            <aside v-if="!compact" class="meta-sidebar">
              <div class="meta-block">
                <label>Status</label>
                <div class="status-pill" :class="`st-${selected.display_status || selected.status}`">
                  {{ statusLabel(selected) }}
                </div>
              </div>
              <div class="meta-block">
                <label>Priority</label>
                <select
                  v-if="canSetPriority"
                  :value="selected.priority || 'medium'"
                  :disabled="busy"
                  @change="onPriorityChange"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <span v-else class="prio" :class="`prio-${selected.priority || 'medium'}`">
                  {{ selected.priority || 'medium' }}
                </span>
              </div>
              <div class="meta-block">
                <label>Source</label>
                <div>{{ sourceLabel(selected) }}</div>
              </div>
              <div class="meta-block">
                <label>Assigned to</label>
                <div>{{ assigneeName(selected) || 'Unassigned' }}</div>
                <div v-if="canAssignOthers" class="assign-row">
                  <select v-model="assignToId" :disabled="busy || assigning">
                    <option value="">Reassign…</option>
                    <option
                      v-for="u in assigneesForSelectedTopic"
                      :key="u.id"
                      :value="String(u.id)"
                      :title="assigneeOptionTitle(u)"
                    >
                      {{ formatAssignee(u) }}{{ responsibilitySuffix(u) }}
                    </option>
                  </select>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    :disabled="busy || assigning || !assignToId"
                    @click="assignTicket"
                  >
                    {{ assigning ? '…' : 'Assign' }}
                  </button>
                </div>
              </div>
              <div class="meta-block">
                <label>School</label>
                <div>{{ selected.school_name || '—' }}</div>
              </div>
              <div class="meta-block">
                <label>Client</label>
                <div>{{ selected.client_identifier_code || selected.client_initials || '—' }}</div>
              </div>
              <div class="meta-block">
                <label>Created</label>
                <div>{{ formatDateTime(selected.created_at) }}</div>
              </div>
              <div class="meta-block">
                <label>Updated</label>
                <div>{{ formatDateTime(selected.updated_at) }}</div>
              </div>

              <div v-if="canForward && selected.client_id" class="meta-block forward-block">
                <label>Forward to providers</label>
                <button
                  type="button"
                  class="btn btn-secondary btn-xs"
                  :disabled="forwardProvidersLoading"
                  @click="loadForwardProviders"
                >
                  {{ forwardProvidersLoading ? 'Loading…' : showForward ? 'Hide providers' : 'Load providers' }}
                </button>
                <div v-if="showForward" class="forward-list">
                  <div v-if="!forwardProviders.length" class="muted">No assigned providers found.</div>
                  <label v-for="p in forwardProviders" :key="p.id" class="forward-pill">
                    <input v-model="forwardSelectedIds" type="checkbox" :value="Number(p.id)" />
                    <span>{{ formatAssignee(p) }}</span>
                  </label>
                  <textarea
                    v-if="forwardProviders.length"
                    v-model="forwardNote"
                    rows="2"
                    class="forward-note"
                    placeholder="Optional note for provider…"
                  />
                  <button
                    v-if="forwardProviders.length"
                    type="button"
                    class="btn btn-secondary btn-xs"
                    :disabled="forwarding || !forwardSelectedIds.length || !canActOnSelected"
                    @click="submitForward"
                  >
                    {{ forwarding ? 'Forwarding…' : 'Forward & close' }}
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import TenantContextSwitcher from '../TenantContextSwitcher.vue';
import {
  TICKET_TOPICS,
  ticketTopicLabel,
  responsibilityFlagsLabel
} from '../../utils/ticketTopics';

const props = defineProps({
  compact: { type: Boolean, default: false },
  /** When true, school_staff uses /mine; agency uses queue */
  mode: { type: String, default: 'auto' }, // auto | mine | queue
  /** Plot Twist HQ dark chrome (platform command center) */
  theme: { type: String, default: 'default' } // default | platform
});

const emit = defineEmits(['selection-change']);

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();

const myUserId = computed(() => authStore.user?.id || null);
const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const isSchoolStaff = computed(() => role.value === 'school_staff');
const isSuperAdmin = computed(() => role.value === 'super_admin');
const canClaim = computed(() =>
  ['school_staff', 'staff', 'admin', 'support', 'super_admin', 'clinical_practice_assistant'].includes(role.value)
);
const canClose = computed(() =>
  ['staff', 'admin', 'support', 'super_admin', 'clinical_practice_assistant'].includes(role.value)
);
const canInternal = computed(() =>
  ['staff', 'admin', 'support', 'super_admin', 'clinical_practice_assistant'].includes(role.value)
);
const canSetPriority = computed(() =>
  ['admin', 'support', 'super_admin', 'clinical_practice_assistant'].includes(role.value)
);
const canAnswer = computed(() =>
  ['admin', 'support', 'super_admin'].includes(role.value)
);
const canAssignOthers = computed(() =>
  ['school_staff', 'staff', 'admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus'].includes(role.value)
);
const canForward = computed(() =>
  ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'staff'].includes(role.value)
);

const tickets = ref([]);
const metrics = ref({ open: 0, in_progress: 0, waiting: 0, closed_today: 0 });
const loading = ref(false);
const error = ref('');
const actionError = ref('');
const selectedId = ref(null);
const selected = ref(null);
const messages = ref([]);
const messagesLoading = ref(false);
const messagesError = ref('');
const draft = ref('');
const composerMode = ref('reply');
const sending = ref(false);
const busy = ref(false);
const searchInput = ref('');
const priorityFilter = ref('');
const sourceChannel = ref('');
const creatorRoleFilter = ref('');
const topicFilter = ref('');
const ticketTopics = TICKET_TOPICS;
/** Selected tenant id (number|null) or 'platform'. null = all tenants. */
const agencyIdInput = ref(null);
const agencyCounts = ref([]);
const platformCounts = ref({ open: 0, mine: 0 });
const escalating = ref(false);
const displayStatus = ref('');

/** v-model bridge: tenant chips never bind the 'platform' sentinel */
const tenantAgencyId = computed({
  get: () => (agencyIdInput.value === 'platform' ? null : agencyIdInput.value),
  set: (v) => {
    agencyIdInput.value = v == null || v === '' ? null : Number(v) || v;
  }
});
const viewMode = ref('all'); // all | mine (agency queue)
const isNarrow = ref(false);
const threadEl = ref(null);
const assignees = ref([]);
const assignToId = ref('');
const assigning = ref(false);
/** Prefer responsibility-flagged people for specialized ticket topics (admins always listed). */
const assigneesForSelectedTopic = computed(() => {
  const list = assignees.value || [];
  const topic = String(selected.value?.topic || 'general').toLowerCase();
  if (!topic || topic === 'general') return list;
  return list.filter((u) => {
    const role = String(u?.role || '').toLowerCase();
    if (role === 'admin' || role === 'super_admin') return true;
    if (topic === 'billing') return !!(u.has_billing_access || u.hasBillingAccess);
    if (topic === 'payroll') return !!(u.has_payroll_access || u.hasPayrollAccess);
    if (topic === 'credentialing') {
      return !!(u.can_manage_credentialing || u.has_credentialing_access || u.hasCredentialingAccess);
    }
    return true;
  });
});
const generatingDraft = ref(false);
const reviewingDraft = ref(false);
const markingSent = ref(false);
const showForward = ref(false);
const forwardProviders = ref([]);
const forwardProvidersLoading = ref(false);
const forwardSelectedIds = ref([]);
const forwardNote = ref('');
const forwarding = ref(false);

const isPlatformTheme = computed(
  () =>
    props.theme === 'platform' ||
    (isSuperAdmin.value &&
      !!agencyStore.platformMode &&
      !String(route.params?.organizationSlug || '').trim())
);

const isMainTenantOrg = (a) => {
  const t = String(a?.organization_type || a?.organizationType || 'agency').toLowerCase();
  return t === 'agency' || t === 'life_coach' || t === 'consultant';
};
const isSandboxishTenant = (a) => {
  const hay = `${a?.name || ''} ${a?.slug || ''} ${a?.portal_url || ''}`.toLowerCase();
  return ['demo', 'fake', 'sandbox', 'training', 'sample', 'test'].some((k) => hay.includes(k));
};
const agencyOptions = computed(() => {
  // Superadmin: all main (non-sandbox) tenants from the catalog.
  // Others: memberships only.
  const memberships = agencyStore.userAgencies || [];
  const catalog = agencyStore.agencies || [];
  let list = isSuperAdmin.value
    ? (catalog.length ? catalog : memberships)
    : (memberships.length ? memberships : catalog);
  list = (list || []).filter(isMainTenantOrg);
  if (isSuperAdmin.value) {
    list = list.filter((a) => !isSandboxishTenant(a));
  }
  const counts = new Map(
    (agencyCounts.value || []).map((c) => [
      Number(c.agencyId),
      { open: Number(c.open || 0), mine: Number(c.mine || 0) }
    ])
  );
  // Mine first, then open volume, then name — scales when many tenants are live.
  return [...list].sort((a, b) => {
    const ca = counts.get(Number(a.id)) || { open: 0, mine: 0 };
    const cb = counts.get(Number(b.id)) || { open: 0, mine: 0 };
    if (cb.mine !== ca.mine) return cb.mine - ca.mine;
    if (cb.open !== ca.open) return cb.open - ca.open;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
});
const showTenantSwitcher = computed(() => !isSchoolStaff.value && agencyOptions.value.length >= 1);
const hasPlatformSupportCap = computed(
  () =>
    isSuperAdmin.value ||
    authStore.user?.has_platform_support === true ||
    authStore.user?.has_platform_support === 1 ||
    authStore.user?.hasPlatformSupport === true
);
const showPlatformChip = computed(
  () =>
    !isSchoolStaff.value &&
    (hasPlatformSupportCap.value || ['admin', 'support'].includes(role.value))
);
const canEscalateToPlatform = computed(() => {
  if (!selected.value) return false;
  if (!['admin', 'support', 'super_admin'].includes(role.value)) return false;
  const scope = String(selected.value.target_scope || 'tenant').toLowerCase();
  return scope !== 'platform';
});

const metricCards = computed(() => [
  { key: 'open', label: 'Open', value: metrics.value.open },
  { key: 'in_progress', label: 'In Progress', value: metrics.value.in_progress },
  { key: 'waiting', label: 'Waiting', value: metrics.value.waiting },
  { key: 'closed', label: 'Closed (Today)', value: metrics.value.closed_today }
]);

const createdByName = computed(() => {
  const t = selected.value;
  if (!t) return '';
  return [t.created_by_first_name, t.created_by_last_name].filter(Boolean).join(' ') || t.created_by_email || '';
});

const useMineForced = computed(() => props.mode === 'mine' || isSchoolStaff.value);
const useMine = computed(() => {
  if (props.mode === 'mine') return true;
  if (props.mode === 'queue') return false;
  if (isSchoolStaff.value) return true;
  return viewMode.value === 'mine';
});

const canActOnSelected = computed(() => {
  const claimed = Number(selected.value?.claimed_by_user_id || 0);
  if (!claimed) return true;
  return claimed === Number(myUserId.value || 0);
});

const composerPlaceholder = computed(() => {
  if (composerMode.value === 'internal') return 'Internal note (agency only)…';
  if (composerMode.value === 'answer') return 'Official answer (marks ticket answered)…';
  return 'Write a reply…';
});

function statusLabel(t) {
  const d = t?.display_status || t?.status || '';
  const map = { open: 'Open', in_progress: 'In Progress', waiting: 'Waiting', answered: 'Waiting', closed: 'Closed' };
  return map[d] || d;
}

function isGuardianTicket(t) {
  return String(t?.created_by_role || '').toLowerCase() === 'client_guardian';
}

function isProductHelpRequest(t) {
  return !!(
    t?.requests_platform_help === 1 ||
    t?.requests_platform_help === true ||
    t?.requestsPlatformHelp === true
  );
}

function previewText(t) {
  const q = String(t?.question || '').trim();
  if (q) return q.length > 90 ? `${q.slice(0, 90)}…` : q;
  return 'No preview';
}

function assigneeName(t) {
  return [t?.claimed_by_first_name, t?.claimed_by_last_name].filter(Boolean).join(' ') || '';
}

function formatAssignee(u) {
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return name || u?.email || `User #${u?.id}`;
}

function responsibilitySuffix(u) {
  const flags = responsibilityFlagsLabel(u);
  return flags ? ` · ${flags}` : '';
}

function assigneeOptionTitle(u) {
  const flags = responsibilityFlagsLabel(u);
  const name = formatAssignee(u);
  if (!flags) return name;
  return `${name} — responsibility: ${flags}`;
}

function messageAuthor(m) {
  return [m.author_first_name, m.author_last_name].filter(Boolean).join(' ') || m.author_role || 'User';
}

function sourceLabel(t) {
  if (t?.source_channel) return String(t.source_channel);
  if (t?.created_by_source_key) return 'External';
  return 'Portal';
}

function formatDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatRelative(v) {
  if (!v) return '';
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

function toggleMetric(key) {
  displayStatus.value = displayStatus.value === key ? '' : key === 'closed' ? 'closed' : key;
  loadTickets();
}

function toggleViewMode() {
  viewMode.value = viewMode.value === 'mine' ? 'all' : 'mine';
  loadTickets();
}

function onTenantSelect(agency) {
  if (agency?.id) {
    agencyIdInput.value = Number(agency.id);
    // Platform HQ ticket filter must not leave Plot Twist HQ branding/context.
    if (!isPlatformTheme.value && !agencyStore.platformMode) {
      agencyStore.setCurrentAgency(agency);
    }
  } else {
    agencyIdInput.value = null;
  }
  loadTickets();
  loadMetrics();
  loadAgencyCounts();
}

function selectPlatformQueue() {
  agencyIdInput.value = 'platform';
  loadTickets();
  loadMetrics();
  loadAgencyCounts();
}

async function escalateToPlatform() {
  if (!selected.value?.id || !canEscalateToPlatform.value) return;
  const note = window.prompt('Optional note for Plot Twist HQ (or leave blank):', '') ?? null;
  if (note === null) return;
  escalating.value = true;
  actionError.value = '';
  try {
    const r = await api.post(`/support-tickets/${selected.value.id}/escalate-to-platform`, {
      note: String(note || '').trim() || undefined
    });
    selected.value = r.data || selected.value;
    agencyIdInput.value = 'platform';
    await loadAll();
    if (selected.value?.id) await loadMessages(selected.value.id);
  } catch (e) {
    actionError.value =
      e?.response?.data?.error?.message || e?.message || 'Could not escalate to platform';
  } finally {
    escalating.value = false;
  }
}

function onResize() {
  isNarrow.value = typeof window !== 'undefined' && window.innerWidth < 900;
}

async function loadAgencyCounts() {
  if (!showTenantSwitcher.value && !showPlatformChip.value) return;
  try {
    const r = await api.get('/support-tickets/counts-by-agency', { skipGlobalLoading: true });
    agencyCounts.value = Array.isArray(r.data?.agencies) ? r.data.agencies : [];
    platformCounts.value = {
      open: Number(r.data?.platform?.open || 0),
      mine: Number(r.data?.platform?.mine || 0)
    };
  } catch {
    agencyCounts.value = [];
    platformCounts.value = { open: 0, mine: 0 };
  }
}

async function loadMetrics() {
  if (useMine.value) return;
  try {
    const params = {};
    if (agencyIdInput.value === 'platform') {
      params.targetScope = 'platform';
    } else {
      const aid = Number(agencyIdInput.value);
      if (Number.isFinite(aid) && aid > 0) params.agencyId = aid;
    }
    const r = await api.get('/support-tickets/metrics', { params, skipGlobalLoading: true });
    metrics.value = {
      open: Number(r.data?.open || 0),
      in_progress: Number(r.data?.in_progress || 0),
      waiting: Number(r.data?.waiting || 0),
      closed_today: Number(r.data?.closed_today || 0)
    };
  } catch {
    // ignore
  }
}

async function loadTickets() {
  loading.value = true;
  error.value = '';
  try {
    const isPlatform = agencyIdInput.value === 'platform';
    const selectedAgencyId = Number(agencyIdInput.value);
    const hasAgency = !isPlatform && Number.isFinite(selectedAgencyId) && selectedAgencyId > 0;
    if (useMine.value) {
      const r = await api.get('/support-tickets/mine', { skipGlobalLoading: true });
      let list = Array.isArray(r.data) ? r.data : [];
      if (isPlatform) {
        list = list.filter((t) => String(t.target_scope || 'tenant').toLowerCase() === 'platform');
      } else if (hasAgency) {
        list = list.filter((t) => Number(t.agency_id || t.agencyId) === selectedAgencyId);
      }
      if (displayStatus.value) {
        list = list.filter((t) => (t.display_status || t.status) === displayStatus.value
          || (displayStatus.value === 'waiting' && t.status === 'answered'));
      }
      if (searchInput.value.trim()) {
        const q = searchInput.value.trim().toLowerCase();
        list = list.filter((t) =>
          String(t.subject || '').toLowerCase().includes(q)
          || String(t.school_name || '').toLowerCase().includes(q)
        );
      }
      if (topicFilter.value) {
        list = list.filter(
          (t) => String(t.topic || 'general').toLowerCase() === topicFilter.value
        );
      }
      tickets.value = list;
    } else {
      const params = { limit: 80 };
      if (searchInput.value.trim()) params.q = searchInput.value.trim();
      if (priorityFilter.value) params.priority = priorityFilter.value;
      if (sourceChannel.value) params.sourceChannel = sourceChannel.value;
      if (creatorRoleFilter.value) params.creatorRole = creatorRoleFilter.value;
      if (topicFilter.value) params.topic = topicFilter.value;
      if (isPlatform) params.targetScope = 'platform';
      else if (hasAgency) params.agencyId = selectedAgencyId;
      if (displayStatus.value) params.displayStatus = displayStatus.value;
      if (viewMode.value === 'mine') params.mine = true;
      const r = await api.get('/support-tickets', { params, skipGlobalLoading: true });
      tickets.value = Array.isArray(r.data) ? r.data : [];
    }
    if (selectedId.value) {
      const found = tickets.value.find((t) => t.id === selectedId.value);
      if (found) selected.value = found;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load tickets';
    tickets.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadMessages(ticketId) {
  messagesLoading.value = true;
  messagesError.value = '';
  try {
    const r = await api.get(`/support-tickets/${ticketId}/messages`, { skipGlobalLoading: true });
    messages.value = Array.isArray(r.data?.messages) ? r.data.messages : [];
    if (r.data?.ticket) selected.value = { ...selected.value, ...r.data.ticket };
    await nextTick();
    if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight;
  } catch (e) {
    messagesError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load messages';
    messages.value = [];
  } finally {
    messagesLoading.value = false;
  }
}

function selectTicket(t) {
  selectedId.value = t.id;
  selected.value = t;
  composerMode.value = 'reply';
  draft.value = '';
  actionError.value = '';
  assignToId.value = '';
  showForward.value = false;
  forwardProviders.value = [];
  forwardSelectedIds.value = [];
  forwardNote.value = '';
  emit('selection-change', t);
  const q = { ...route.query, ticketId: String(t.id) };
  router.replace({ query: q }).catch(() => {});
  loadMessages(t.id);
  if (canAssignOthers.value) loadAssignees(t);
}

function clearSelection() {
  selectedId.value = null;
  selected.value = null;
  messages.value = [];
  emit('selection-change', null);
  const q = { ...route.query };
  delete q.ticketId;
  router.replace({ query: q }).catch(() => {});
}

async function sendMessage() {
  if (!selected.value?.id || !draft.value.trim()) return;
  sending.value = true;
  try {
    await api.post(`/support-tickets/${selected.value.id}/messages`, {
      body: draft.value.trim(),
      isInternal: composerMode.value === 'internal'
    });
    draft.value = '';
    await loadMessages(selected.value.id);
    await loadTickets();
    await loadMetrics();
  } catch (e) {
    messagesError.value = e?.response?.data?.error?.message || e?.message || 'Send failed';
  } finally {
    sending.value = false;
  }
}

async function claim() {
  if (!selected.value?.id) return;
  busy.value = true;
  try {
    await api.post(`/support-tickets/${selected.value.id}/claim`);
    await loadAll();
    await loadMessages(selected.value.id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Claim failed';
  } finally {
    busy.value = false;
  }
}

async function unclaim() {
  if (!selected.value?.id) return;
  busy.value = true;
  try {
    await api.post(`/support-tickets/${selected.value.id}/unclaim`);
    await loadAll();
    await loadMessages(selected.value.id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Unclaim failed';
  } finally {
    busy.value = false;
  }
}

async function closeTicket() {
  if (!selected.value?.id) return;
  if (!window.confirm('Close this ticket?')) return;
  busy.value = true;
  try {
    await api.post(`/support-tickets/${selected.value.id}/close`);
    await loadAll();
    await loadMessages(selected.value.id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Close failed';
  } finally {
    busy.value = false;
  }
}

async function onPriorityChange(ev) {
  const priority = ev?.target?.value;
  if (!selected.value?.id || !priority) return;
  busy.value = true;
  try {
    const r = await api.post(`/support-tickets/${selected.value.id}/priority`, { priority });
    selected.value = { ...selected.value, ...r.data };
    await loadTickets();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Priority update failed';
  } finally {
    busy.value = false;
  }
}

async function loadAssignees(t) {
  try {
    const agencyId = t?.agency_id || agencyIdInput.value || agencyStore.currentAgency?.id;
    if (!agencyId) {
      assignees.value = [];
      return;
    }
    const resp = await api.get('/support-tickets/assignees', {
      params: { agencyId },
      skipGlobalLoading: true
    });
    assignees.value = Array.isArray(resp.data?.users) ? resp.data.users : [];
  } catch {
    assignees.value = [];
  }
}

async function assignTicket() {
  if (!selected.value?.id || !assignToId.value) return;
  assigning.value = true;
  actionError.value = '';
  try {
    await api.post(`/support-tickets/${selected.value.id}/assign`, {
      assigneeUserId: parseInt(assignToId.value, 10)
    });
    assignToId.value = '';
    await loadAll();
    await loadMessages(selected.value.id);
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Assign failed';
  } finally {
    assigning.value = false;
  }
}

async function generateDraft() {
  if (!selected.value?.id) return;
  if (!canActOnSelected.value) {
    actionError.value = `Ticket is claimed by ${assigneeName(selected.value) || 'someone else'}.`;
    return;
  }
  generatingDraft.value = true;
  actionError.value = '';
  try {
    if (!selected.value.claimed_by_user_id) {
      await api.post(`/support-tickets/${selected.value.id}/claim`);
    }
    const r = await api.post(`/support-tickets/${selected.value.id}/generate-response`);
    const text = String(r.data?.suggestedAnswer || '').trim();
    if (!text) {
      actionError.value = 'No draft was generated.';
      return;
    }
    const existing = draft.value.trim();
    draft.value = existing ? `${existing}\n\n---\n\n${text}` : text;
    composerMode.value = 'answer';
    await loadTickets();
    const found = tickets.value.find((x) => x.id === selected.value.id);
    if (found) selected.value = { ...selected.value, ...found };
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Failed to generate draft';
  } finally {
    generatingDraft.value = false;
  }
}

function useAiDraft() {
  const text = String(selected.value?.ai_draft_response || '').trim();
  if (!text) return;
  draft.value = text;
  composerMode.value = 'answer';
}

async function copyAiDraft() {
  const text = String(selected.value?.ai_draft_response || '').trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

async function markDraftReview(state) {
  if (!selected.value?.id) return;
  reviewingDraft.value = true;
  actionError.value = '';
  try {
    await api.post(`/support-tickets/${selected.value.id}/review-draft`, { state });
    await loadTickets();
    const found = tickets.value.find((x) => x.id === selected.value.id);
    if (found) selected.value = { ...selected.value, ...found };
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Failed to update draft review';
  } finally {
    reviewingDraft.value = false;
  }
}

async function markDraftSent() {
  if (!selected.value?.id) return;
  markingSent.value = true;
  actionError.value = '';
  try {
    await api.post(`/support-tickets/${selected.value.id}/mark-sent`);
    await loadTickets();
    const found = tickets.value.find((x) => x.id === selected.value.id);
    if (found) selected.value = { ...selected.value, ...found };
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Failed to mark sent';
  } finally {
    markingSent.value = false;
  }
}

async function submitOfficialAnswer() {
  if (!selected.value?.id || !draft.value.trim()) return;
  if (!canActOnSelected.value) {
    actionError.value = `Ticket is claimed by ${assigneeName(selected.value) || 'someone else'}.`;
    return;
  }
  sending.value = true;
  actionError.value = '';
  try {
    const draftText = String(selected.value?.ai_draft_response || '').trim();
    const answerFinal = draft.value.trim();
    let aiDraftDecision = null;
    if (draftText) aiDraftDecision = draftText === answerFinal ? 'accepted' : 'edited';
    await api.post(`/support-tickets/${selected.value.id}/answer`, {
      answer: answerFinal,
      status: 'answered',
      aiDraftDecision
    });
    draft.value = '';
    composerMode.value = 'reply';
    await loadAll();
    await loadMessages(selected.value.id);
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Failed to submit answer';
  } finally {
    sending.value = false;
  }
}

async function loadForwardProviders() {
  if (!selected.value?.id) return;
  if (showForward.value) {
    showForward.value = false;
    return;
  }
  forwardProvidersLoading.value = true;
  actionError.value = '';
  try {
    const r = await api.get(`/support-tickets/${selected.value.id}/client-assigned-providers`, {
      skipGlobalLoading: true
    });
    forwardProviders.value = Array.isArray(r.data?.providers) ? r.data.providers : [];
    showForward.value = true;
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load providers';
    forwardProviders.value = [];
  } finally {
    forwardProvidersLoading.value = false;
  }
}

async function submitForward() {
  if (!selected.value?.id || !forwardSelectedIds.value.length) return;
  if (!canActOnSelected.value) {
    actionError.value = `Ticket is claimed by ${assigneeName(selected.value) || 'someone else'}.`;
    return;
  }
  forwarding.value = true;
  actionError.value = '';
  try {
    await api.post(`/support-tickets/${selected.value.id}/forward-to-providers`, {
      providerUserIds: forwardSelectedIds.value.map((id) => Number(id)),
      message: forwardNote.value.trim() || undefined
    });
    showForward.value = false;
    forwardSelectedIds.value = [];
    forwardNote.value = '';
    await loadAll();
    if (selected.value?.id) await loadMessages(selected.value.id);
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Failed to forward ticket';
  } finally {
    forwarding.value = false;
  }
}

async function loadAll() {
  await Promise.all([loadMetrics(), loadTickets(), loadAgencyCounts()]);
}

watch(
  () => route.query?.ticketId,
  (id) => {
    const n = parseInt(String(id || ''), 10);
    if (!Number.isFinite(n) || n <= 0) return;
    if (selectedId.value === n) return;
    const found = tickets.value.find((t) => t.id === n);
    if (found) selectTicket(found);
    else {
      selectedId.value = n;
      loadMessages(n);
    }
  }
);

onMounted(async () => {
  onResize();
  window.addEventListener('resize', onResize);
  if (!isSchoolStaff.value) {
    try {
      if (!(agencyStore.userAgencies || []).length) {
        await agencyStore.fetchUserAgencies();
      }
    } catch { /* ignore */ }
    // Superadmin needs the full main-tenant catalog for the chip rail.
    if (isSuperAdmin.value && !(agencyStore.agencies || []).length) {
      try { await agencyStore.fetchAgencies(); } catch { /* ignore */ }
    }
  }
  // Prefer current tenant context so tickets match what you're engaging with.
  const currentId = Number(agencyStore.currentAgency?.id || 0);
  if (currentId > 0 && agencyOptions.value.some((a) => Number(a.id) === currentId)) {
    agencyIdInput.value = currentId;
  } else if (agencyOptions.value.length === 1) {
    agencyIdInput.value = Number(agencyOptions.value[0].id);
  }
  if (String(route.query?.targetScope || '').toLowerCase() === 'platform') {
    agencyIdInput.value = 'platform';
  }
  await loadAll();
  const qid = parseInt(String(route.query?.ticketId || ''), 10);
  if (Number.isFinite(qid) && qid > 0) {
    const found = tickets.value.find((t) => t.id === qid);
    if (found) selectTicket(found);
    else {
      selectedId.value = qid;
      await loadMessages(qid);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
});

defineExpose({ loadAll, clearSelection });
</script>

<style scoped>
.ticket-desk {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: calc(100vh - 120px);
  color: var(--text-primary, #1a3d2b);
}
.ticket-desk.compact {
  height: 100%;
  min-height: 420px;
}
.desk-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.desk-title { margin: 0; font-size: 1.5rem; font-weight: 800; }
.desk-sub { margin: 4px 0 0; color: var(--text-secondary, #64748b); font-size: 14px; }
.tenant-rail-wrap {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  align-items: flex-start;
  min-width: 0;
  overflow-x: auto;
}
.tenant-rail-wrap :deep(.tcs) {
  flex: 1;
  min-width: 0;
}
.platform-chip {
  flex: 0 0 auto;
  width: 104px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 6px 7px;
  border: 2px solid #7c3aed;
  border-radius: 14px;
  background: linear-gradient(160deg, rgba(124, 58, 237, 0.08), #fff);
  cursor: pointer;
  font: inherit;
}
.platform-chip.active {
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.28);
  background: linear-gradient(160deg, rgba(124, 58, 237, 0.16), #fff);
}
.platform-chip-mark {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #7c3aed, #2563eb);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.platform-chip-name {
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  min-height: 2.4em;
  color: #0f172a;
}
.platform-chip-counts {
  display: flex;
  gap: 4px;
}
.platform-chip-counts .tcs-count,
.platform-compose .tcs-count {
  min-width: 1.5rem;
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  text-align: center;
}
.platform-chip-counts .open { background: rgba(37, 99, 235, 0.12); color: #1d4ed8; }
.platform-chip-counts .mine { background: rgba(16, 185, 129, 0.14); color: #047857; }
.platform-ask-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.platform-ask-hint { margin: 0; font-size: 12px; }
.platform-compose {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: #fff;
}
.platform-compose textarea {
  width: 100%;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  resize: vertical;
  box-sizing: border-box;
}
.platform-compose-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.metric-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: #fff;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.metric-card.active {
  border-color: var(--primary, #2d6a4f);
  background: rgba(45, 106, 79, 0.06);
}
.metric-label { font-size: 12px; font-weight: 700; color: var(--text-secondary, #64748b); }
.metric-value { font-size: 1.4rem; font-weight: 800; }
.desk-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(280px, 38%) 1fr;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.ticket-desk.compact .desk-body {
  grid-template-columns: minmax(220px, 42%) 1fr;
}
.list-pane {
  border-right: 1px solid var(--border, #e2e8f0);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fafbfa;
}
.list-toolbar { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.search {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
}
.filters { display: flex; flex-wrap: wrap; gap: 6px; }
.filters select {
  flex: 1;
  min-width: 90px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  font-size: 12px;
}
.ticket-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  flex: 1;
}
.ticket-row {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  cursor: pointer;
  background: #fff;
}
.ticket-row:hover { background: #f8faf8; }
.ticket-row.active {
  background: rgba(45, 106, 79, 0.08);
  border-left: 3px solid var(--primary, #2d6a4f);
}
.row-top { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; }
.ticket-id { font-size: 11px; font-weight: 800; color: var(--text-secondary, #64748b); }
.subject { font-weight: 700; font-size: 14px; }
.preview { font-size: 12px; color: var(--text-secondary, #64748b); margin-top: 2px; }
.row-meta { font-size: 11px; color: var(--text-secondary, #64748b); margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.creator-chip {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #3730a3;
  background: #e0e7ff;
  border-radius: 999px;
  padding: 1px 7px;
}
.topic-chip {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-radius: 999px;
  padding: 1px 7px;
  background: #e2e8f0;
  color: #334155;
}
.topic-billing { background: #ecfccb; color: #3f6212; }
.topic-credentialing { background: #e0f2fe; color: #075985; }
.topic-payroll { background: #ffedd5; color: #9a3412; }
.topic-general { background: #f1f5f9; color: #475569; }
.topic-product-help { background: #dcfce7; color: #166534; }
.updated { margin-left: auto; }
.assignee { font-size: 11px; margin-top: 4px; font-weight: 600; }
.prio {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 999px;
}
.prio-high { background: #fee2e2; color: #b91c1c; }
.prio-medium { background: #fef3c7; color: #b45309; }
.prio-low { background: #dcfce7; color: #166534; }
.status-pill {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e2e8f0;
  text-transform: capitalize;
}
.st-open { background: #dbeafe; color: #1d4ed8; }
.st-in_progress { background: #e0e7ff; color: #3730a3; }
.st-waiting, .st-answered { background: #ffedd5; color: #c2410c; }
.st-closed { background: #e2e8f0; color: #475569; }
.detail-pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.empty-detail {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #64748b);
  padding: 24px;
}
.detail-header {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  align-items: flex-start;
  flex-wrap: wrap;
}
.detail-title-block { flex: 1; min-width: 180px; }
.detail-id { font-size: 12px; font-weight: 700; color: var(--text-secondary, #64748b); }
.detail-subject { margin: 2px 0 4px; font-size: 1.15rem; }
.breadcrumb { font-size: 12px; color: var(--text-secondary, #64748b); }
.badge-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.claimed-chip {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(45, 106, 79, 0.12);
}
.detail-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.detail-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 220px;
}
.ticket-desk.compact .detail-main { grid-template-columns: 1fr; }
.conversation-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border, #e2e8f0);
}
.ticket-desk.compact .conversation-col { border-right: none; }
.tab-row {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.tab {
  border: none;
  background: transparent;
  padding: 6px 10px;
  font-weight: 700;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  border-radius: 8px;
  cursor: pointer;
}
.tab.active { background: rgba(45, 106, 79, 0.1); color: var(--primary, #2d6a4f); }
.tab:disabled { opacity: 0.45; cursor: not-allowed; }
.thread {
  flex: 1;
  overflow: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bubble {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 12px;
  background: #e8f1ff;
  align-self: flex-start;
}
.bubble.mine { background: #eef2f7; align-self: flex-end; }
.bubble.internal {
  background: #e8f5e9;
  border: 1px dashed #81c784;
  align-self: stretch;
  max-width: 100%;
}
.internal-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  color: #2e7d32;
  margin-bottom: 4px;
}
.bubble-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  margin-bottom: 4px;
  color: var(--text-secondary, #64748b);
}
.bubble-body { white-space: pre-wrap; font-size: 14px; line-height: 1.4; }
.composer {
  border-top: 1px solid var(--border, #e2e8f0);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.composer-tabs { display: flex; gap: 6px; }
.composer-tab {
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.composer-tab.active {
  border-color: var(--primary, #2d6a4f);
  background: rgba(45, 106, 79, 0.08);
}
.composer textarea {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  padding: 8px 10px;
  resize: vertical;
  font: inherit;
}
.composer-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.ai-draft-banner {
  margin: 0 12px;
  padding: 10px 12px;
  border: 1px dashed #81c784;
  border-radius: 10px;
  background: #e8f5e9;
}
.ai-draft-head { font-size: 12px; margin-bottom: 6px; }
.ai-draft-body {
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.4;
  max-height: 140px;
  overflow: auto;
  margin-bottom: 8px;
}
.ai-draft-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.assign-row {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  align-items: center;
}
.assign-row select { flex: 1; }
.forward-block { border-top: 1px solid var(--border, #e2e8f0); padding-top: 10px; }
.forward-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.forward-pill {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
}
.forward-note {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  padding: 6px 8px;
  font: inherit;
  resize: vertical;
}
.meta-sidebar {
  padding: 12px;
  overflow: auto;
  background: #fafbfa;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.meta-block label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--text-secondary, #64748b);
  margin-bottom: 4px;
}
.meta-block select {
  width: 100%;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
}
.pad { padding: 14px; }
.error { color: #b91c1c; }
.muted { color: var(--text-secondary, #64748b); }

@media (max-width: 899px) {
  .metrics { grid-template-columns: repeat(2, 1fr); }
  .desk-body { grid-template-columns: 1fr; }
  .list-pane.hide-mobile,
  .detail-pane.hide-mobile { display: none; }
  .detail-main { grid-template-columns: 1fr; }
  .meta-sidebar { display: none; }
  .conversation-col { border-right: none; }
}

/* Plot Twist HQ dark desk */
.ticket-desk--platform {
  --text-primary: #e5e7eb;
  --text-secondary: #94a3b8;
  --border: rgba(148, 163, 184, 0.18);
  --primary: #8b5cf6;
  color: #e5e7eb;
}
.ticket-desk--platform .desk-title,
.ticket-desk--platform .detail-subject,
.ticket-desk--platform .subject {
  color: #e5e7eb;
}
.ticket-desk--platform .desk-sub,
.ticket-desk--platform .muted,
.ticket-desk--platform .preview,
.ticket-desk--platform .row-meta,
.ticket-desk--platform .breadcrumb {
  color: #94a3b8;
}
.ticket-desk--platform .metric-card,
.ticket-desk--platform .search,
.ticket-desk--platform .filters select,
.ticket-desk--platform .list-pane,
.ticket-desk--platform .detail-pane,
.ticket-desk--platform .meta-sidebar,
.ticket-desk--platform .composer textarea,
.ticket-desk--platform .assign-row select {
  background: #111827;
  border-color: rgba(148, 163, 184, 0.22);
  color: #e5e7eb;
}
.ticket-desk--platform .metric-card.active {
  border-color: #8b5cf6;
  box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.35);
}
.ticket-desk--platform .ticket-row {
  background: #111827;
  border-color: rgba(148, 163, 184, 0.14);
  color: #e5e7eb;
}
.ticket-desk--platform .ticket-row:hover {
  background: #1e293b;
}
.ticket-desk--platform .ticket-row.active {
  background: rgba(139, 92, 246, 0.18);
  border-left-color: #8b5cf6;
}
.ticket-desk--platform .ticket-id {
  color: #94a3b8;
}
.ticket-desk--platform .desk-body {
  border-color: rgba(148, 163, 184, 0.18);
  background: #0f172a;
}
.ticket-desk--platform .list-toolbar,
.ticket-desk--platform .detail-header,
.ticket-desk--platform .composer {
  border-color: rgba(148, 163, 184, 0.18);
  background: #0b1220;
}
.ticket-desk--platform .platform-chip {
  background: #111827;
  border-color: rgba(139, 92, 246, 0.45);
  color: #e5e7eb;
}
.ticket-desk--platform .platform-chip.active {
  background: rgba(139, 92, 246, 0.18);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.35);
}
.ticket-desk--platform .platform-chip-mark {
  background: linear-gradient(135deg, #7c3aed, #2563eb);
  color: #fff;
}
.ticket-desk--platform .platform-chip-name {
  color: #e5e7eb;
}
.ticket-desk--platform .platform-chip-counts .open {
  background: rgba(56, 189, 248, 0.16);
  color: #7dd3fc;
}
.ticket-desk--platform .platform-chip-counts .mine {
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
}
.ticket-desk--platform .btn-secondary {
  background: #1e293b;
  border-color: rgba(148, 163, 184, 0.28);
  color: #e5e7eb;
}
.ticket-desk--platform .btn-primary {
  background: #7c3aed;
  border-color: #7c3aed;
}
.ticket-desk--platform .error {
  color: #fca5a5;
}
.ticket-desk--platform .msg-bubble,
.ticket-desk--platform .thread .bubble {
  background: #1e293b;
  color: #e5e7eb;
}
</style>
