<template>
  <div class="client-list-grid">
    <div v-if="loading" class="loading-state">
      <p>Loading clients...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="clients.length === 0" class="empty-state">
      <p>No clients found.</p>
    </div>

    <div v-else class="clients-table-wrapper">
      <div v-if="showSearch" class="table-toolbar">
        <div v-if="showAttentionFilters" class="attention-filter-row">
          <button
            type="button"
            class="filter-pill"
            :class="{ active: !attentionFilterActive }"
            @click="setAttentionFilter(null)"
          >
            All
          </button>
          <button
            type="button"
            class="filter-pill filter-pill-attention"
            :class="{ active: attentionFilterActive }"
            @click="setAttentionFilter('needs_attention')"
          >
            Needs attention
            <span v-if="attentionSummary.total > 0" class="filter-pill-count">{{ attentionSummary.total }}</span>
          </button>
          <button
            type="button"
            class="filter-pill"
            :class="{ active: activeStatusFilterKey === 'pending' }"
            @click="setStatusFilter('pending')"
          >
            Pending
          </button>
          <button
            type="button"
            class="filter-pill"
            :class="{ active: activeStatusFilterKey === 'waitlist' }"
            @click="setStatusFilter('waitlist')"
          >
            Waitlist
          </button>
        </div>
        <div v-if="showSummaryBanner && attentionSummary.any" class="summary-banner">
          <template v-if="attentionSummary.new > 0">{{ attentionSummary.new }} new</template>
          <template v-if="attentionSummary.new > 0 && (attentionSummary.pendingCompliance > 0 || attentionSummary.openTickets > 0)"> • </template>
          <template v-if="attentionSummary.pendingCompliance > 0">{{ attentionSummary.pendingCompliance }} pending compliance</template>
          <template v-if="attentionSummary.pendingCompliance > 0 && attentionSummary.openTickets > 0"> • </template>
          <template v-if="attentionSummary.openTickets > 0">{{ attentionSummary.openTickets }} ticket open</template>
        </div>
        <div v-if="activeStatusFilterLabel && !showAttentionFilters" class="active-filter-row">
          <span class="active-filter-pill">Status: {{ activeStatusFilterLabel }}</span>
          <button class="btn-link" type="button" @click="clearStatusFilter">Clear</button>
        </div>
        <div class="unread-legend" aria-label="Unread bubble legend">
          <div class="unread-legend-item">
            <span class="unread-badge unread-badge-comments unread-badge-legend" aria-hidden="true">1</span>
            <span class="unread-legend-text">New comment(s)</span>
          </div>
          <div class="unread-legend-item">
            <span class="unread-badge unread-badge-messages unread-badge-legend" aria-hidden="true">1</span>
            <span class="unread-legend-text">New message(s)</span>
          </div>
          <div class="unread-legend-item">
            <span class="unread-badge unread-badge-updates unread-badge-legend" aria-hidden="true">1</span>
            <span class="unread-legend-text">New updates</span>
          </div>
          <div class="unread-legend-item">
            <span class="ticket-status-badge ticket-status-open ticket-status-legend" aria-hidden="true">Ticket Open</span>
            <span class="unread-legend-text">Ticket open</span>
          </div>
          <div class="unread-legend-item">
            <span class="ticket-status-badge ticket-status-answered ticket-status-legend" aria-hidden="true">Ticket Answered</span>
            <span class="unread-legend-text">Ticket answered</span>
          </div>
          <div v-if="showAssignedColumn" class="unread-legend-item">
            <span class="newly-assigned-badge newly-assigned-badge-legend" aria-hidden="true">New</span>
            <span class="unread-legend-text">Assigned in last 7 days</span>
          </div>
          <div class="unread-legend-hint">Click a bubble to open it.</div>
        </div>
        <input
          v-model="searchQuery"
          class="table-search"
          type="search"
          :placeholder="searchPlaceholder"
        />
      </div>
      <div class="clients-table-scroll">
        <table class="clients-table">
        <thead>
          <tr>
            <th class="sortable" @click="toggleSort('initials')" role="button" tabindex="0">
              Client
              <span class="sort-indicator" v-if="sortKey === 'initials'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('status')" role="button" tabindex="0">
              Client Status
              <span class="sort-indicator" v-if="sortKey === 'status'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('document_status')" role="button" tabindex="0">
              Doc Status
              <span class="sort-indicator" v-if="sortKey === 'document_status'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('organization_name')" role="button" tabindex="0">
              School / Program
              <span class="sort-indicator" v-if="sortKey === 'organization_name'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('skills')" role="button" tabindex="0">
              Skills
              <span class="sort-indicator" v-if="sortKey === 'skills'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('service_day')" role="button" tabindex="0">
              Assigned Day
              <span class="sort-indicator" v-if="sortKey === 'service_day'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th
              v-if="showPsychotherapyColumn"
              class="sortable"
              @click="toggleSort('psychotherapy_total')"
              role="button"
              tabindex="0"
            >
              Psychotherapy FY
              <span class="sort-indicator" v-if="sortKey === 'psychotherapy_total'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th></th>
            <th v-if="showChecklistButton"></th>
            <th v-if="canEditClients" class="edit-col">Edit</th>
            <th
              v-if="showAssignedColumn"
              class="sortable"
              @click="toggleSort('provider_assigned_at')"
              role="button"
              tabindex="0"
            >
              Assigned
              <span class="sort-indicator" v-if="sortKey === 'provider_assigned_at'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('submission_date')" role="button" tabindex="0">
              Submission Date
              <span class="sort-indicator" v-if="sortKey === 'submission_date'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="client in sortedClients"
            :key="client.id"
            class="client-row"
            :class="{
              'client-row-clickable': isSchoolStaff,
              'client-row-newly-assigned': isNewlyAssigned(client)
            }"
            :role="isSchoolStaff ? 'button' : undefined"
            :tabindex="isSchoolStaff ? 0 : undefined"
            @click="handleRowActivate(client)"
            @keydown.enter.prevent="handleRowActivate(client)"
            @keydown.space.prevent="handleRowActivate(client)"
          >
            <td class="initials-cell">
              <div class="client-label">
                <span class="initials" :title="rosterLabelTitle(client)">{{ formatRosterLabel(client) }}</span>
                <span
                  v-if="isNewlyAssigned(client)"
                  class="newly-assigned-badge"
                  :title="`Assigned ${formatDate(client.provider_assigned_at)}`"
                >
                  New
                </span>
                <span
                  v-if="client.compliance_pending"
                  class="pending-compliance-badge"
                  :title="pendingComplianceTitle(client)"
                >
                  Pending {{ Number(client.compliance_days_since_assigned || 0) }}d
                </span>
                <span
                  v-if="Number(client.open_ticket_count || 0) > 0"
                  class="ticket-status-badge ticket-status-open"
                  :title="`Ticket open (${Number(client.open_ticket_count || 0)})`"
                >
                  Ticket Open {{ Number(client.open_ticket_count || 0) }}
                </span>
                <span
                  v-if="Number(client.answered_ticket_count || 0) > 0"
                  class="ticket-status-badge ticket-status-answered"
                  :title="`Ticket answered (${Number(client.answered_ticket_count || 0)})`"
                >
                  Ticket Answered {{ Number(client.answered_ticket_count || 0) }}
                </span>
                <button
                  v-if="Number(client.unread_notes_count || 0) > 0"
                  class="unread-badge unread-badge-comments"
                  type="button"
                  :title="commentBadgeTitle(client)"
                  @click.stop="openClient(client, 'comments')"
                >
                  {{ commentBadgeCount(client) }}
                </button>
                <button
                  v-if="Number(client.unread_ticket_messages_count || 0) > 0"
                  class="unread-badge unread-badge-messages"
                  type="button"
                  :title="messageBadgeTitle(client)"
                  @click.stop="openClient(client, 'messages')"
                >
                  {{ messageBadgeCount(client) }}
                </button>
                <button
                  v-if="Number(client.unread_updates_count || 0) > 0"
                  class="unread-badge unread-badge-updates"
                  type="button"
                  :title="`${Number(client.unread_updates_count || 0)} new update(s) — click to open`"
                  @click.stop="openClientUpdates(client)"
                >
                  {{ Number(client.unread_updates_count || 0) }}
                </button>
              </div>
            </td>
            <td>
              <div class="status-cell">
                <span
                  :class="[
                    'status-badge',
                    `status-${String(client.client_status_key || 'unknown').toLowerCase().replace('_', '-')}`,
                    String(client.client_status_key || '').toLowerCase() === 'waitlist' ? 'status-waitlist' : ''
                  ]"
                  :role="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? 'button' : undefined"
                  :tabindex="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? 0 : undefined"
                  :title="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? getWaitlistTitle(client) : ''"
                  @mouseenter="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? onWaitlistHover(client) : null"
                  @mouseleave="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? (hoveredWaitlistClientId = '') : null"
                  @focus="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? onWaitlistHover(client) : null"
                  @click.stop="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? openWaitlistNote(client) : null"
                  @keydown.enter.stop.prevent="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? openWaitlistNote(client) : null"
                  @keydown.space.stop.prevent="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? openWaitlistNote(client) : null"
                >
                  {{ formatClientStatusLabel(client) }}
                  <div
                    v-if="String(client.client_status_key || '').toLowerCase() === 'waitlist' && String(hoveredWaitlistClientId) === String(client.id)"
                    class="waitlist-tooltip"
                    role="tooltip"
                  >
                    <div class="waitlist-tooltip-title">Waitlist reason</div>
                    <div class="waitlist-tooltip-body">{{ waitlistTooltipText(client) }}</div>
                  </div>
                </span>
                <span
                  v-if="String(client.client_status_key || '').toLowerCase() === 'waitlist' && client.waitlist_days !== null && client.waitlist_rank !== null"
                  class="waitlist-bubble"
                  :title="`Waitlisted ${client.waitlist_days} day(s) • Rank #${client.waitlist_rank}`"
                >
                  <span class="wl-left">{{ client.waitlist_days }}d</span>
                  <span class="wl-right">#{{ client.waitlist_rank }}</span>
                </span>
              </div>
            </td>
            <td>{{ formatDocSummary(client) }}</td>
            <td>{{ organizationName || client.organization_name || '—' }}</td>
            <td>{{ client.skills ? 'Yes' : 'No' }}</td>
            <td>{{ client.service_day || '—' }}</td>
            <td v-if="showPsychotherapyColumn" class="psy-cell">
              <span
                class="psy-pill"
                :class="{ 'psy-pill-alert': (psychotherapyCell(client).total || 0) >= 25 }"
                :title="psychotherapyCell(client).title"
              >
                {{ psychotherapyCell(client).total ?? '—' }}
              </span>
            </td>
            <td>
              <button class="btn btn-secondary btn-sm comment-btn" @click.stop="openClient(client)">
                View & Comment
              </button>
            </td>
            <td v-if="showChecklistButton">
              <button
                v-if="client.user_is_assigned_provider"
                class="btn btn-primary btn-sm checklist-btn"
                type="button"
                :title="'Quick edit compliance checklist'"
                @click.stop="openQuickChecklist(client)"
              >
                Checklist
              </button>
            </td>
            <td v-if="canEditClients" class="edit-col">
              <button class="btn btn-primary btn-sm" type="button" @click.stop="goEdit(client)">Edit</button>
            </td>
            <td v-if="showAssignedColumn">{{ formatDate(client.provider_assigned_at) }}</td>
            <td>{{ formatDate(client.submission_date) }}</td>
          </tr>
        </tbody>
        </table>
      </div>
    </div>

    <SchoolClientChatModal
      v-if="selectedClient"
      :client="selectedClient"
      :schoolOrganizationId="selectedClient?.organization_id || organizationId"
      :initial-pane="selectedClientInitialPane"
      @close="selectedClient = null; selectedClientInitialPane = null"
    />

    <WaitlistNoteModal
      v-if="waitlistClient"
      :org-key="waitlistOrgKey(waitlistClient)"
      :client="waitlistClient"
      :client-label-mode="clientLabelMode"
      @saved="onWaitlistSaved"
      @close="waitlistClient = null"
    />

    <QuickChecklistModal
      v-if="quickChecklistClient"
      :client="quickChecklistClient"
      @close="quickChecklistClient = null"
      @saved="onQuickChecklistSaved"
    />
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import SchoolClientChatModal from './SchoolClientChatModal.vue';
import WaitlistNoteModal from './WaitlistNoteModal.vue';
import QuickChecklistModal from './QuickChecklistModal.vue';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  organizationSlug: {
    type: String,
    required: true
  },
  organizationId: {
    type: Number,
    default: null
  },
  rosterScope: {
    type: String,
    default: 'school' // 'school' | 'provider'
  },
  clientLabelMode: {
    type: String,
    default: 'codes' // 'codes' | 'initials'
  },
  editMode: {
    type: String,
    default: 'navigate' // 'navigate' | 'inline'
  },
  showSearch: {
    type: Boolean,
    default: true
  },
  searchPlaceholder: {
    type: String,
    default: 'Search roster…'
  },
  psychotherapyTotalsByClientId: {
    // { [clientId]: { total: number, per_code: { [code]: number }, client_abbrev?: string, surpassed_24?: boolean } }
    type: Object,
    default: null
  },
  /** Display name for the current school/program (shown instead of Assigned Provider). */
  organizationName: {
    type: String,
    default: ''
  },
  /**
   * Optional roster status filter (client_status_key), e.g. 'pending' or 'waitlist'.
   * When set, the grid will only show clients matching the filter.
   */
  statusFilterKey: {
    type: String,
    default: ''
  },
  /**
   * When provided (array), use this list instead of fetching. Used for "All schools" merged roster.
   */
  clientsOverride: {
    type: Array,
    default: null
  }
});

const emit = defineEmits(['edit-client', 'update:statusFilterKey', 'update:needsAttentionCount']);

const clients = ref([]);
const loading = ref(false);
const error = ref('');
const selectedClient = ref(null);
const selectedClientInitialPane = ref(null); // null | 'comments' | 'messages'
const waitlistClient = ref(null);
const searchQuery = ref('');
const router = useRouter();
const authStore = useAuthStore();

const canEditClients = ref(false);
const quickChecklistClient = ref(null);
const isSchoolStaff = computed(() => String(authStore.user?.role || '').toLowerCase() === 'school_staff');
const showChecklistButton = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return r === 'provider';
});
const showAssignedColumn = computed(() => props.rosterScope === 'provider');

const orgKey = computed(() => {
  // school roster expects numeric org id; provider roster may only have slug.
  const v = props.organizationId ? String(props.organizationId) : String(props.organizationSlug || '').trim();
  return v || '';
});

const waitlistOrgKey = (client) => orgKey.value || String(client?.organization_id || '').trim();

// Waitlist note hover caching: clientId -> message
const waitlistNoteByClientId = ref({});
const waitlistNoteLoadingByClientId = ref({});
const hoveredWaitlistClientId = ref('');
const getWaitlistTitle = (client) => {
  if (String(client?.client_status_key || '').toLowerCase() !== 'waitlist') return '';
  const cached = waitlistNoteByClientId.value?.[String(client?.id || '')] || '';
  if (cached) return `Waitlist reason: ${cached}`;
  return 'Waitlist reason: (hover to load)';
};

const ensureWaitlistNoteLoaded = async (client) => {
  try {
    const org = orgKey.value || String(client?.organization_id || '').trim();
    if (!org) return;
    const cid = Number(client?.id || 0);
    if (!cid) return;
    const key = String(cid);
    if (waitlistNoteByClientId.value?.[key]) return;
    if (waitlistNoteLoadingByClientId.value?.[key]) return;
    waitlistNoteLoadingByClientId.value = { ...(waitlistNoteLoadingByClientId.value || {}), [key]: true };
    const r = await api.get(
      `/school-portal/${encodeURIComponent(org)}/clients/${cid}/waitlist-note`,
      { skipGlobalLoading: true, timeout: 8000 }
    );
    const msg = String(r.data?.note?.message || '').trim();
    waitlistNoteByClientId.value = { ...(waitlistNoteByClientId.value || {}), [key]: msg || '(no note yet)' };
  } catch {
    // ignore hover load failures (non-blocking)
  } finally {
    try {
      const cid = Number(client?.id || 0);
      if (!cid) return;
      const key = String(cid);
      const next = { ...(waitlistNoteLoadingByClientId.value || {}) };
      delete next[key];
      waitlistNoteLoadingByClientId.value = next;
    } catch {
      // ignore
    }
  }
};

const onWaitlistHover = (client) => {
  const cid = String(client?.id || '');
  if (!cid) return;
  hoveredWaitlistClientId.value = cid;
  ensureWaitlistNoteLoaded(client);
};

const waitlistTooltipText = (client) => {
  const key = String(client?.id || '');
  if (!key) return '';
  if (waitlistNoteLoadingByClientId.value?.[key]) return 'Loading…';
  return waitlistNoteByClientId.value?.[key] || '(no note yet)';
};

const PROVIDER_SORT_STORAGE_KEY = 'providerClientListSort.v1';
const loadStoredSort = () => {
  try {
    const raw = window?.localStorage?.getItem?.(PROVIDER_SORT_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.key && typeof parsed.key === 'string') sortKey.value = parsed.key;
    if (parsed?.dir === 'asc' || parsed?.dir === 'desc') sortDir.value = parsed.dir;
  } catch {
    // ignore
  }
};
const saveSort = () => {
  try {
    if (props.rosterScope !== 'provider') return;
    window?.localStorage?.setItem?.(
      PROVIDER_SORT_STORAGE_KEY,
      JSON.stringify({ key: sortKey.value, dir: sortDir.value })
    );
  } catch {
    // ignore
  }
};

const sortKey = ref('submission_date');
const sortDir = ref('desc');

const showPsychotherapyColumn = computed(() => !!props.psychotherapyTotalsByClientId);

const useClientsOverride = () => Array.isArray(props.clientsOverride);

const fetchClients = async () => {
  if (useClientsOverride()) return;
  // School roster requires a numeric org id.
  // Provider "My roster" can fall back to using the org slug (more robust across contexts).
  if (!props.organizationId && props.rosterScope !== 'provider') {
    loading.value = false;
    error.value = 'Organization ID is required';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const orgKey =
      props.rosterScope === 'provider'
        ? (props.organizationId ? String(props.organizationId) : String(props.organizationSlug || '').trim())
        : String(props.organizationId);

    if (!orgKey) {
      clients.value = [];
      error.value = 'Organization not loaded.';
      return;
    }

    const endpoint =
      props.rosterScope === 'provider'
        ? `/school-portal/${encodeURIComponent(orgKey)}/my-roster`
        : `/school-portal/${encodeURIComponent(orgKey)}/clients`;
    const response = await api.get(endpoint);
    clients.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch clients:', err);
    if (err.response?.status === 404) {
      error.value = 'Organization not found.';
    } else if (err.response?.status === 403) {
      const r = String(authStore.user?.role || '').toLowerCase();
      error.value =
        props.rosterScope === 'provider' || r === 'provider'
          ? 'Your roster is not available for this organization.'
          : 'You do not have access to this school\'s client list.';
    } else {
      error.value = 'Failed to load students. Please try again later.';
    }
    clients.value = [];
  } finally {
    loading.value = false;
  }
};

const fetchEditPermissions = async () => {
  if (!props.organizationId) {
    canEditClients.value = false;
    return;
  }
  try {
    const r = await api.get(`/school-portal/${props.organizationId}/affiliation`);
    canEditClients.value = !!r.data?.can_edit_clients;
  } catch {
    canEditClients.value = false;
  }
};

const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = key === 'submission_date' || key === 'provider_assigned_at' ? 'desc' : 'asc';
  }
  saveSort();
};

const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const NEWLY_ASSIGNED_DAYS = 7;
const isNewlyAssigned = (client) => {
  const at = client?.provider_assigned_at;
  if (!at) return false;
  const assigned = new Date(at).getTime();
  const now = Date.now();
  const days = (now - assigned) / (24 * 60 * 60 * 1000);
  return days <= NEWLY_ASSIGNED_DAYS;
};

const openQuickChecklist = (client) => {
  quickChecklistClient.value = client;
};

const onQuickChecklistSaved = () => {
  fetchClients();
};

const sortValue = (client, key) => {
  if (!client) return '';
  if (key === 'provider_assigned_at') {
    const t = client.provider_assigned_at ? new Date(client.provider_assigned_at).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }
  if (key === 'status') return String(client.client_status_label || client.status || '').toLowerCase();
  if (key === 'document_status') return String(formatDocSummary(client) || '').toLowerCase();
  if (key === 'organization_name') return String(props.organizationName || client.organization_name || '').toLowerCase();
  if (key === 'skills') return client.skills ? 1 : 0;
  if (key === 'psychotherapy_total') {
    const m = props.psychotherapyTotalsByClientId || {};
    const rec = m?.[String(client?.id ?? '')] || m?.[Number(client?.id ?? 0)] || null;
    const t = Number(rec?.total ?? 0);
    return Number.isFinite(t) ? t : 0;
  }
  if (key === 'service_day') {
    // Multi-provider may return "Mon, Wed"; sort by first day token.
    const raw = String(client.service_day || '');
    const first = raw.split(',')[0]?.trim() || raw;
    const d = first;
    const idx = dayOrder.indexOf(d);
    return idx < 0 ? 999 : idx;
  }
  if (key === 'submission_date') {
    const t = client.submission_date ? new Date(client.submission_date).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }
  if (key === 'initials') return String(formatRosterLabel(client) || '').toLowerCase();
  return String(client[key] || '').toLowerCase();
};

const normalize = (v) => String(v || '').trim().toLowerCase();

const attentionFilterActive = ref(false);
const localStatusFilterKey = ref(''); // used when provider has filter pills (parent may not pass statusFilterKey)
const showAttentionFilters = computed(() => props.rosterScope === 'provider');
const showSummaryBanner = computed(() => props.rosterScope === 'provider');

const attentionSummary = computed(() => {
  const list = Array.isArray(clients.value) ? clients.value : [];
  let newCount = 0;
  let pendingCompliance = 0;
  let openTickets = 0;
  for (const c of list) {
    if (isNewlyAssigned(c)) newCount++;
    if (c?.compliance_pending) pendingCompliance++;
    if (Number(c?.open_ticket_count || 0) > 0) openTickets++;
  }
  return {
    new: newCount,
    pendingCompliance,
    openTickets,
    total: new Set(
      list
        .filter((c) => isNewlyAssigned(c) || c?.compliance_pending || Number(c?.open_ticket_count || 0) > 0)
        .map((c) => c.id)
    ).size,
    any: newCount > 0 || pendingCompliance > 0 || openTickets > 0
  };
});

const setAttentionFilter = (mode) => {
  attentionFilterActive.value = mode === 'needs_attention';
  if (mode !== 'needs_attention') emit('update:statusFilterKey', '');
};

const setStatusFilter = (key) => {
  attentionFilterActive.value = false;
  localStatusFilterKey.value = key || '';
  emit('update:statusFilterKey', key || '');
};

const effectiveStatusFilterKey = computed(() =>
  showAttentionFilters.value ? localStatusFilterKey.value : props.statusFilterKey
);
const activeStatusFilterKey = computed(() => normalize(effectiveStatusFilterKey.value));
const activeStatusFilterLabel = computed(() => {
  const k = activeStatusFilterKey.value;
  if (!k) return '';
  if (k === 'pending') return 'Pending';
  if (k === 'waitlist') return 'Waitlist';
  return k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
});

const statusFilteredClients = computed(() => {
  const list = Array.isArray(clients.value) ? clients.value : [];
  if (attentionFilterActive.value) {
    return list.filter((c) => isNewlyAssigned(c) || c?.compliance_pending || Number(c?.open_ticket_count || 0) > 0);
  }
  const k = activeStatusFilterKey.value;
  if (!k) return list;
  return list.filter((c) => normalize(c?.client_status_key) === k);
});

const filteredClients = computed(() => {
  const q = normalize(searchQuery.value);
  const list = Array.isArray(statusFilteredClients.value) ? statusFilteredClients.value : [];
  if (!q) return list;
  return list.filter((client) => {
    const hay = [
      formatRosterLabel(client),
      client?.client_status_label,
      props.organizationName || client?.organization_name,
      client?.provider_name,
      client?.service_day,
      formatDocSummary(client)
    ]
      .filter(Boolean)
      .join(' ');
    return normalize(hay).includes(q);
  });
});

const clearStatusFilter = () => {
  attentionFilterActive.value = false;
  localStatusFilterKey.value = '';
  emit('update:statusFilterKey', '');
};

const sortedClients = computed(() => {
  const list = Array.isArray(filteredClients.value) ? filteredClients.value.slice() : [];
  const key = sortKey.value;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return list.sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    const cmp = String(av).localeCompare(String(bv));
    if (cmp !== 0) return cmp * dir;
    // Stable fallback
    return Number(a?.id || 0) - Number(b?.id || 0);
  });
});

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString();
};

const formatRosterLabel = (client) => {
  const initials = String(client?.initials || '').replace(/\s+/g, '').toUpperCase();
  const code = String(client?.identifier_code || '').replace(/\s+/g, '').toUpperCase();
  if (props.clientLabelMode === 'initials') return initials || code || '—';
  return code || initials || '—';
};

const formatClientStatusLabel = (client) => {
  const label = String(client?.client_status_label || '').trim();
  if (label) return label;
  const status = String(client?.status || '').toUpperCase();
  const map = {
    'PACKET': 'Packet',
    'SCREENER': 'Screener',
    'RETURNING': 'Returning',
    'PENDING_REVIEW': 'Pending',
    'ACTIVE': 'Current',
    'ON_HOLD': 'Waitlist',
    'DECLINED': 'Declined',
    'ARCHIVED': 'Archived'
  };
  return map[status] || '—';
};

const rosterLabelTitle = (client) => {
  if (props.clientLabelMode !== 'codes') return '';
  const initials = String(client?.initials || '').replace(/\s+/g, '').toUpperCase();
  return initials || '';
};

const pendingComplianceTitle = (client) => {
  const days = Number(client?.compliance_days_since_assigned || 0);
  const missing = Array.isArray(client?.compliance_missing) ? client.compliance_missing : [];
  const lines = [
    `Pending ${days} day(s) since assigned`,
    missing.length ? `Missing: ${missing.join(', ')}` : ''
  ].filter(Boolean);
  return lines.join('\n');
};

const commentBadgeCount = (client) => {
  const unread = Number(client?.unread_notes_count || 0);
  if (unread > 0) return unread;
  return Number(client?.notes_count || 0);
};

const messageBadgeCount = (client) => {
  const unread = Number(client?.unread_ticket_messages_count || 0);
  if (unread > 0) return unread;
  return Number(client?.ticket_messages_count || 0);
};

const commentBadgeTitle = (client) => {
  const unread = Number(client?.unread_notes_count || 0);
  const total = Number(client?.notes_count || 0);
  if (unread > 0) return `${unread} new comment(s) — click to open`;
  return `${total} comment(s) — click to open`;
};

const messageBadgeTitle = (client) => {
  const unread = Number(client?.unread_ticket_messages_count || 0);
  const total = Number(client?.ticket_messages_count || 0);
  if (unread > 0) return `${unread} new message(s) — click to open`;
  return `${total} message(s) — click to open`;
};

const formatDocSummary = (client) => {
  // Prefer paperwork status (new model) so the portal reflects bulk upload fields:
  // paperwork_status / paperwork_delivery / doc_date.
  const status = String(client?.paperwork_status_label || '').trim();
  const delivery = String(client?.paperwork_delivery_method_label || '').trim();
  const date = client?.doc_date ? new Date(client.doc_date).toLocaleDateString() : '';
  const statusKey = String(client?.paperwork_status_key || '').toLowerCase();
  const roiExpiresAt = client?.roi_expires_at ? new Date(String(client.roi_expires_at)) : null;
  const roiExpired =
    statusKey === 'roi' && roiExpiresAt ? (roiExpiresAt.getTime() < new Date().setHours(0, 0, 0, 0)) : false;

  const parts = [];
  const normalizedStatus =
    statusKey === 'new_docs' ? 'Docs Needed' :
    statusKey === 'all_needed' ? 'All Needed' :
    statusKey === 'completed' ? 'Received' :
    (roiExpired ? 'ROI Expired' : status);
  if (normalizedStatus) parts.push(normalizedStatus);
  if (delivery) parts.push(delivery);
  if (date) parts.push(date);
  if (parts.length) return parts.join(' · ');

  // Fallback: legacy document_status
  const v = String(client?.document_status || '').trim();
  if (!v) return '—';
  if (v.toUpperCase() === 'NONE') return 'None';
  return v.replace(/_/g, ' ');
};

const psychotherapyCell = (client) => {
  const m = props.psychotherapyTotalsByClientId || null;
  if (!m || !client?.id) return { total: null, title: '' };
  const rec = m?.[String(client.id)] || m?.[Number(client.id)] || null;
  if (!rec) return { total: 0, title: '' };
  const per = rec?.per_code && typeof rec.per_code === 'object' ? rec.per_code : {};
  const parts = Object.entries(per)
    .filter(([, v]) => Number(v) > 0)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([code, count]) => `${String(code).toUpperCase()} (${Number(count)})`);
  const total = Number(rec?.total ?? 0);
  const title = parts.length ? `${parts.join('\n')}\nTotal (${total})` : '';
  return { total: Number.isFinite(total) ? total : 0, title };
};

const updateClientCounts = (clientId, nextCounts) => {
  if (!clientId) return;
  clients.value = (clients.value || []).map((c) => {
    if (Number(c?.id) !== Number(clientId)) return c;
    return { ...c, ...(nextCounts || {}) };
  });
};

const markClientUpdatesRead = async (client) => {
  try {
    const orgId = props.organizationId;
    if (!orgId || !client?.id) return;
    const kinds = ['checklist', 'status', 'assignment'];
    await Promise.all(
      kinds.map((kind) => api.post(`/school-portal/${orgId}/notifications/read`, { kind, clientId: client.id }))
    );
  } catch {
    // ignore
  }
};

const openClient = (client, initialPane = null) => {
  selectedClient.value = client;
  selectedClientInitialPane.value = initialPane;
  if (initialPane === 'comments') {
    updateClientCounts(client?.id, { unread_notes_count: 0 });
  }
  if (initialPane === 'messages') {
    updateClientCounts(client?.id, { unread_ticket_messages_count: 0 });
  }
};

const openClientUpdates = async (client) => {
  openClient(client);
  await markClientUpdatesRead(client);
  updateClientCounts(client?.id, { unread_updates_count: 0 });
};

const openWaitlistNote = (client) => {
  if (!orgKey.value) return;
  waitlistClient.value = client;
};

const onWaitlistSaved = (note) => {
  // Refresh hover tooltip cache immediately after save
  try {
    const cid = Number(waitlistClient.value?.id || 0);
    if (!cid) return;
    const msg = String(note?.message || '').trim() || '(no note yet)';
    waitlistNoteByClientId.value = { ...(waitlistNoteByClientId.value || {}), [String(cid)]: msg };
  } catch {
    // ignore
  }
};

const handleRowActivate = (client) => {
  // School staff only have one action on roster rows: view/comment thread.
  // Make the entire row clickable for them to reduce friction.
  if (!isSchoolStaff.value) return;
  openClient(client, 'comments');
};

const goEdit = (client) => {
  if (!client?.id) return;
  if (props.editMode === 'inline') {
    emit('edit-client', client);
    return;
  }
  const query = { clientId: String(client.id) };
  if (props.rosterScope === 'provider') query.tab = 'checklist';
  router.push({ path: '/admin/clients', query });
};


watch(
  () => props.clientsOverride,
  (val) => {
    if (Array.isArray(val)) {
      clients.value = val;
      loading.value = false;
      error.value = '';
    }
  },
  { immediate: true }
);

watch(() => props.organizationId, () => {
  if (useClientsOverride()) return;
  if (props.organizationId) {
    fetchClients();
    fetchEditPermissions();
  }
});

watch(
  () => (showAttentionFilters.value ? attentionSummary.value.total : 0),
  (count) => emit('update:needsAttentionCount', count),
  { immediate: true }
);

// Default to "Needs attention" filter when provider has clients needing attention
watch(
  () => loading.value,
  (isLoading, wasLoading) => {
    if (wasLoading && !isLoading && props.rosterScope === 'provider' && attentionSummary.value.total > 0) {
      attentionFilterActive.value = true;
    }
  }
);

onMounted(() => {
  if (props.rosterScope === 'provider') {
    const hadStored = !!window?.localStorage?.getItem?.(PROVIDER_SORT_STORAGE_KEY);
    loadStoredSort();
    if (!hadStored) {
      sortKey.value = 'provider_assigned_at';
      sortDir.value = 'desc';
      saveSort();
    }
  }
  if (!useClientsOverride() && props.organizationId) {
    fetchClients();
    fetchEditPermissions();
  }
});
</script>

<style scoped>
.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.client-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.unread-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 10px 0 8px 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
}
.unread-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.unread-legend-text {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.unread-legend-hint {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 12px;
}

@media (max-width: 640px) {
  .table-toolbar {
    gap: 8px;
  }
  .unread-legend {
    flex-wrap: wrap;
    gap: 8px;
  }
  .unread-legend-hint {
    width: 100%;
    margin-left: 0;
    margin-top: 4px;
  }
  .clients-table th,
  .clients-table td {
    padding: 10px 8px;
    font-size: 0.75rem;
  }
  .filter-pill {
    padding: 10px 12px;
  }
}

.unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 12px;
  line-height: 1;
  font-weight: 800;
  cursor: pointer;
  user-select: none;
}
.unread-badge-legend {
  cursor: default;
}
.unread-badge-muted {
  opacity: 0.55;
}
.ticket-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.ticket-status-open {
  border: 1px solid rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.16);
  color: #b91c1c;
}
.ticket-status-answered {
  border: 1px solid rgba(37, 99, 235, 0.4);
  background: rgba(37, 99, 235, 0.12);
  color: #1e3a8a;
}
.ticket-status-legend {
  cursor: default;
}
.pending-compliance-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
  font-size: 11px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.unread-badge-comments {
  background: rgba(45, 156, 219, 0.12);
  border-color: rgba(45, 156, 219, 0.35);
  color: #1b6fa0;
}
.unread-badge-messages {
  background: rgba(155, 81, 224, 0.12);
  border-color: rgba(155, 81, 224, 0.35);
  color: #6a2aa3;
}
.unread-badge-updates {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
  color: #065f46;
}
.unread-badge:focus {
  outline: 2px solid rgba(59, 130, 246, 0.45);
  outline-offset: 2px;
}

.status-waitlist {
  cursor: pointer;
}

.status-badge {
  position: relative;
}

.waitlist-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 280px;
  max-width: 60vw;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-primary);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  z-index: 50;
}

.waitlist-tooltip-title {
  font-weight: 900;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.waitlist-tooltip-body {
  font-size: 13px;
  line-height: 1.25;
  white-space: pre-wrap;
}
.waitlist-bubble {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border-radius: 999px;
  border: 1px solid rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
  font-weight: 800;
  font-size: 0.6875rem;
  line-height: 1;
}
.waitlist-bubble .wl-left {
  padding: 2px 6px;
  border-right: 1px solid rgba(245, 158, 11, 0.25);
}
.waitlist-bubble .wl-right {
  padding: 2px 6px;
}
.client-list-grid {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.error-state {
  color: #c33;
}

.clients-table-wrapper {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.clients-table-scroll {
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}

.clients-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem; /* ~13px – compact row height */
}

.table-toolbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  margin-bottom: 8px;
}

.attention-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 0;
}
.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
.filter-pill:hover {
  border-color: var(--primary);
  color: var(--text-primary);
}
.filter-pill.active {
  border-color: var(--primary);
  background: rgba(79, 70, 229, 0.08);
  color: var(--primary);
}
.filter-pill-attention.active {
  border-color: rgba(16, 185, 129, 0.6);
  background: rgba(16, 185, 129, 0.1);
  color: #065f46;
}
.filter-pill-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.2);
  color: #065f46;
  font-size: 11px;
}
.summary-banner {
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.2);
  font-size: 13px;
  color: var(--text-primary);
}
.active-filter-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-right: 10px;
}

.active-filter-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  font-size: 0.75rem;
  line-height: 1;
  color: var(--text-primary);
}

.btn-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--primary);
  cursor: pointer;
  font-size: 0.75rem;
}
.table-search {
  width: 100%;
  max-width: 320px;
  padding: 10px 12px;
  min-height: 44px;
  font-size: 0.8125rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}

.clients-table thead {
  background: var(--bg-alt);
}

.clients-table th {
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem; /* slightly smaller headers */
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}
.clients-table .sortable {
  cursor: pointer;
  user-select: none;
}
.clients-table .sortable:hover {
  background: rgba(0, 0, 0, 0.03);
}
.sort-indicator {
  margin-left: 4px;
  font-size: 10px;
  color: var(--text-secondary);
}

.initials-cell {
  font-weight: 900;
  letter-spacing: 0.06em;
}
.initials {
  display: inline-block;
  padding: 4px 8px;
  font-size: 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
}

.clients-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 0.8125rem;
  vertical-align: middle;
  line-height: 1.3;
}

.clients-table td:nth-child(3) {
  max-width: 180px;
  word-break: break-word;
}

.client-row {
  cursor: default;
  transition: background 0.2s;
}

.client-row-newly-assigned {
  background: rgba(16, 185, 129, 0.06);
  animation: newlyAssignedPulse 2.5s ease-in-out 4;
}

@keyframes newlyAssignedPulse {
  0%, 100% { background-color: rgba(16, 185, 129, 0.06); box-shadow: none; }
  50% { background-color: rgba(16, 185, 129, 0.14); box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.25); }
}

.newly-assigned-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.45);
  color: #065f46;
  animation: badgePulse 1.5s ease-in-out infinite;
}

@keyframes badgePulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.9; transform: scale(1.05); }
}
.newly-assigned-badge-legend {
  animation: none;
  cursor: default;
}

.client-row-clickable {
  cursor: pointer;
}

.client-row-clickable:hover {
  background: var(--bg-alt);
}

.comment-btn {
  position: relative;
}
.edit-col {
  white-space: nowrap;
}

.unread-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--danger, #d92d20);
  margin-right: 8px;
  vertical-align: middle;
}

.psy-cell {
  white-space: nowrap;
}
.psy-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  padding: 0 6px;
  font-size: 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
  font-weight: 900;
}
.psy-pill-alert {
  border-color: rgba(239, 68, 68, 0.55);
  background: rgba(239, 68, 68, 0.10);
  color: #991b1b;
}
</style>
