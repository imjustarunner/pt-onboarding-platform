<template>
  <div class="panel">
    <div class="panel-header">
      <div>
        <h2 style="margin:0;">Notifications</h2>
        <div class="muted">Client activity + school-wide announcements (no PHI).</div>
      </div>
      <div style="display:flex; gap: 10px; align-items: center;">
        <button class="btn btn-secondary btn-sm" type="button" @click="openSettings" :disabled="prefsLoading || savingSettings">
          Settings
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">Close</button>
      </div>
    </div>

    <div v-if="createOpen" class="create-card">
      <div class="create-title">Create announcement (banner)</div>
      <div class="create-grid">
        <label class="field">
          <div class="k">Title (optional)</div>
          <input v-model="draftTitle" type="text" maxlength="255" placeholder="e.g., School closed Monday" />
        </label>
        <label class="field">
          <div class="k">Starts</div>
          <input v-model="draftStartsAt" type="datetime-local" />
        </label>
        <label class="field">
          <div class="k">Ends (max 2 weeks)</div>
          <input v-model="draftEndsAt" type="datetime-local" />
        </label>
        <label class="field field-wide">
          <div class="k">Message</div>
          <textarea v-model="draftMessage" rows="3" maxlength="1200" placeholder="Type announcement…" />
        </label>
      </div>
      <div class="create-actions">
        <button class="btn btn-primary" type="button" @click="create" :disabled="creating || !canSubmitCreate">
          {{ creating ? 'Posting…' : 'Post announcement' }}
        </button>
        <button class="btn btn-secondary" type="button" @click="createOpen = false" :disabled="creating">
          Cancel
        </button>
        <div v-if="createError" class="error">{{ createError }}</div>
      </div>
    </div>

    <div class="toolbar">
      <button
        v-if="canCreateAnnouncements"
        class="btn btn-secondary btn-sm"
        type="button"
        @click="toggleCreate"
      >
        {{ createOpen ? 'Hide create' : 'Create announcement' }}
      </button>
      <button class="btn btn-secondary btn-sm" type="button" @click="refresh" :disabled="loading">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
      <button class="btn btn-secondary btn-sm" type="button" @click="markAllRead" :disabled="loading || prefsLoading">
        Mark all read
      </button>
      <button
        class="btn btn-secondary btn-sm"
        type="button"
        @click="markVisibleRead"
        :disabled="loading || prefsLoading || visibleUnreadCount === 0"
      >
        Mark visible read
      </button>
      <button
        class="btn btn-secondary btn-sm"
        type="button"
        @click="markSelectedRead"
        :disabled="loading || prefsLoading || selectedCount === 0"
      >
        Mark selected read
      </button>
      <button
        class="btn btn-secondary btn-sm"
        type="button"
        @click="dismissSelected"
        :disabled="loading || prefsLoading || selectedCount === 0"
      >
        Dismiss selected
      </button>
      <button
        class="btn btn-secondary btn-sm"
        type="button"
        @click="dismissAll"
        :disabled="loading || prefsLoading || visibleFilteredCount === 0"
      >
        Dismiss all
      </button>
      <div class="toolbar-divider" />
      <button
        class="btn btn-secondary btn-sm"
        type="button"
        @click="selectAllOnPage"
        :disabled="loading || filteredItems.length === 0"
      >
        Select all on page
      </button>
      <button
        class="btn btn-secondary btn-sm"
        type="button"
        @click="selectAllTotal"
        :disabled="loading || items.length === 0"
      >
        Select all total
      </button>
      <button
        v-if="selectedCount > 0"
        class="btn btn-secondary btn-sm"
        type="button"
        @click="clearSelection"
      >
        Clear selection
      </button>
      <div class="toolbar-divider" />
      <div class="filter-group" role="group" aria-label="Notification filters">
        <button class="filter-btn" type="button" :class="{ active: activeFilter === 'all' }" @click="setFilter('all')">
          Show all
        </button>
        <button class="filter-btn" type="button" :class="{ active: activeFilter === 'message' }" @click="setFilter('message')">
          Messages
        </button>
        <button class="filter-btn" type="button" :class="{ active: activeFilter === 'comment' }" @click="setFilter('comment')">
          Comments
        </button>
        <button class="filter-btn" type="button" :class="{ active: activeFilter === 'announcement' }" @click="setFilter('announcement')">
          Announcements
        </button>
        <button class="filter-btn" type="button" :class="{ active: activeFilter === 'ticket' }" @click="setFilter('ticket')">
          Tickets
        </button>
        <button class="filter-btn" type="button" :class="{ active: activeFilter === 'checklist' }" @click="setFilter('checklist')">
          Checklist
        </button>
        <button class="filter-btn" type="button" :class="{ active: activeFilter === 'doc' }" @click="setFilter('doc')">
          Docs
        </button>
      </div>
      <div class="toolbar-divider" />
      <label class="selector">
        <span class="selector-label">Sort</span>
        <select v-model="sortOrder" class="selector-select">
          <option value="unread_first">Unread first</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </label>
      <div v-if="activeFilter === 'all'" class="selector-box" role="group" aria-label="Show notification types">
        <div class="selector-title">Show</div>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.client_event" />
          Updates
        </label>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.message" />
          Messages
        </label>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.comment" />
          Comments
        </label>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.announcement" />
          Announcements
        </label>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.ticket" />
          Tickets
        </label>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.checklist" />
          Checklist
        </label>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.status" />
          Status
        </label>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.assignment" />
          Assignments
        </label>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.client_created" />
          New clients
        </label>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.provider_slots" />
          Provider slots
        </label>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.provider_day" />
          Provider day added
        </label>
        <label class="selector-option">
          <input type="checkbox" v-model="visibleKinds.doc" />
          Docs/links
        </label>
      </div>
      <div class="spacer" />
      <div class="muted-small" v-if="selectedCount > 0">
        {{ selectedCount }} selected
      </div>
      <div class="muted-small" v-if="unreadCount > 0">
        {{ unreadCount }} unread
      </div>
    </div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="feed">
      <div v-if="filteredItems.length === 0" class="empty">{{ emptyText }}</div>
      <div
        v-for="it in filteredItems"
        :key="it.id"
        class="item"
        role="button"
        tabindex="0"
        :class="[itemCategoryClass(it), { unread: isUnread(it), clickable: isClickable(it) }]"
        :title="isClickable(it) ? 'Click to display details' : ''"
        @click="handleItemClick(it)"
        @keydown.enter.prevent="handleItemClick(it)"
        @keydown.space.prevent="handleItemClick(it)"
      >
        <label class="item-select" @click.stop>
          <input
            type="checkbox"
            :checked="isSelected(it)"
            @change.stop="toggleSelected(it, $event.target.checked)"
            :aria-label="`Select notification ${it.id}`"
          />
        </label>
        <div class="item-body">
          <div class="item-top">
            <div v-if="isTicket(it)" class="item-title-line">
              <span v-if="ticketNumber(it)" class="item-ticket-number">Ticket {{ ticketNumber(it) }}</span>
              <span class="item-title-strong">{{ formatTicketTitle(it) }}</span>
              <span class="item-title-sep">:</span>
              <span class="item-title-detail">{{ formatTicketDetail(it) }}</span>
            </div>
            <div v-else class="item-title">{{ it.title || (it.kind === 'client_event' ? 'Client update' : 'Announcement') }}</div>
            <div class="item-meta">
              <span class="mono">{{ formatWhen(it.created_at) }}</span>
              <span v-if="it.actor_name">• {{ it.actor_name }}</span>
            </div>
          </div>
          <div class="item-info">
            <span v-if="formatClientLabel(it)" class="item-chip">Client {{ formatClientLabel(it) }}</span>
            <span class="item-chip">{{ formatKindLabel(it) }}</span>
            <span class="item-chip" :class="{ 'chip-unread': isUnread(it) }">{{ isUnread(it) ? 'Unread' : 'Read' }}</span>
          </div>
          <div v-if="!isTicket(it)" class="item-msg">{{ formatMessage(it) }}</div>
        </div>
        <div class="item-actions">
          <button
            v-if="isUnread(it)"
            class="btn btn-secondary btn-sm item-action-btn"
            type="button"
            @click.stop="markItemRead(it)"
          >
            Mark read
          </button>
          <button
            class="btn btn-secondary btn-sm item-action-btn"
            type="button"
            @click.stop="dismiss([String(it?.id ?? '')])"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-if="detailOpen" class="modal-overlay" @click.self="closeDetail">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3 style="margin:0;">{{ detailTitle }}</h3>
        <button class="btn-close" type="button" title="Close" @click="closeDetail">×</button>
      </div>
      <div class="modal-body">
        <div v-if="detailLoading" class="muted">Loading…</div>
        <div v-else-if="detailError" class="error">{{ detailError }}</div>
        <div v-else class="detail-body">
          <div class="muted-small">{{ detailMeta }}</div>
          <div class="detail-text">{{ detailText }}</div>
        </div>
      </div>
    </div>
  </div>

  <div v-if="showSettings" class="modal-overlay" @click.self="closeSettings">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3 style="margin:0;">Notification settings</h3>
        <button class="btn-close" type="button" title="Close" @click="closeSettings">×</button>
      </div>
      <div class="modal-body">
        <div class="muted" style="margin-bottom: 12px;">
          These control which notifications show in the School Portal feed. In-app only by default; SMS/email are opt-in.
        </div>

        <div class="settings-section">
          <div class="settings-title">Announcements</div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.announcements" :disabled="savingSettings" />
            <span class="toggle-label">School announcements</span>
          </label>
          <div class="settings-help">School-wide announcements posted by admins.</div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Tickets</div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.tickets" :disabled="savingSettings" />
            <span class="toggle-label">Ticket activity</span>
          </label>
          <div class="settings-help">Updates to support tickets and replies.</div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Client intake</div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.clientCreated" :disabled="savingSettings" />
            <span class="toggle-label">New client added</span>
          </label>
          <div class="settings-help">A client was added to your school roster.</div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Providers</div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.providerSlots" :disabled="savingSettings" />
            <span class="toggle-label">Provider slots added/closed</span>
          </label>
          <div class="settings-help">Capacity changes for provider schedules.</div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.providerDayAdded" :disabled="savingSettings" />
            <span class="toggle-label">Provider added to day</span>
          </label>
          <div class="settings-help">A provider is newly available on a day.</div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Documents</div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.docsLinks" :disabled="savingSettings" />
            <span class="toggle-label">New document/link added</span>
          </label>
          <div class="settings-help">Documents or links shared with your school.</div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Client updates</div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.clientUpdates" :disabled="savingSettings" />
            <span class="toggle-label">All client updates</span>
          </label>
          <div class="settings-help">Changes to client details and assignments.</div>
          <label class="toggle settings-subtoggle">
            <input type="checkbox" v-model="settings.statusUpdates" :disabled="savingSettings || !settings.clientUpdates" />
            <span class="toggle-label">Status changes</span>
          </label>
          <div class="settings-help settings-subhelp">Client status moved (pending/current/on hold/archived).</div>
          <label class="toggle settings-subtoggle">
            <input type="checkbox" v-model="settings.providerUpdates" :disabled="savingSettings || !settings.clientUpdates" />
            <span class="toggle-label">Provider assignment changes</span>
          </label>
          <div class="settings-help settings-subhelp">Provider added/removed for the client.</div>
          <label class="toggle settings-subtoggle">
            <input type="checkbox" v-model="settings.serviceDayUpdates" :disabled="savingSettings || !settings.clientUpdates" />
            <span class="toggle-label">Service day changes</span>
          </label>
          <div class="settings-help settings-subhelp">Service day changes (e.g., Monday to Tuesday).</div>
          <label class="toggle settings-subtoggle">
            <input type="checkbox" v-model="settings.submissionDateUpdates" :disabled="savingSettings || !settings.clientUpdates" />
            <span class="toggle-label">Submission date changes</span>
          </label>
          <div class="settings-help settings-subhelp">Referral/submission date updated.</div>
          <label class="toggle settings-subtoggle">
            <input type="checkbox" v-model="settings.documentDateUpdates" :disabled="savingSettings || !settings.clientUpdates" />
            <span class="toggle-label">Document date changes</span>
          </label>
          <div class="settings-help settings-subhelp">Document status date updated.</div>
          <label class="toggle settings-subtoggle">
            <input type="checkbox" v-model="settings.orgSwaps" :disabled="savingSettings || !settings.clientUpdates" />
            <span class="toggle-label">Organization changes</span>
          </label>
          <div class="settings-help settings-subhelp">Client moved to a different organization.</div>
          <label class="toggle settings-subtoggle">
            <input type="checkbox" v-model="settings.otherUpdates" :disabled="savingSettings || !settings.clientUpdates" />
            <span class="toggle-label">Other client updates</span>
          </label>
          <div class="settings-help settings-subhelp">Other changes not covered above.</div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Checklist</div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.checklistUpdates" :disabled="savingSettings" />
            <span class="toggle-label">Checklist updates</span>
          </label>
          <div class="settings-help">Intake/first service/parents contacted updates.</div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Assignments</div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.assignments" :disabled="savingSettings" />
            <span class="toggle-label">Client assigned to provider</span>
          </label>
          <div class="settings-help">Client assigned to a provider or provider removed.</div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Client activity</div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.clientComments" :disabled="savingSettings" />
            <span class="toggle-label">Client comments</span>
          </label>
          <div class="settings-help">Notes added in the client comments panel.</div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.clientMessages" :disabled="savingSettings" />
            <span class="toggle-label">Client messages</span>
          </label>
          <div class="settings-help">Ticketed messages about the client.</div>
        </div>

        <div style="display:flex; gap: 10px; margin-top: 14px; align-items:center;">
          <button class="btn btn-primary" type="button" @click="saveSettings" :disabled="savingSettings">
            {{ savingSettings ? 'Saving…' : 'Save' }}
          </button>
          <div v-if="settingsSaved" class="muted-small">Saved</div>
          <div v-if="settingsError" class="error">{{ settingsError }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  clientLabelMode: { type: String, default: 'codes' }, // 'codes' | 'initials'
  initialFilter: { type: String, default: '' }
});

const emit = defineEmits(['close', 'updated', 'open-ticket', 'open-client']);

const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
// Anyone with access to the school portal may post a school-wide banner announcement.
const canCreateAnnouncements = computed(() => !!authStore.user?.id);

const loading = ref(false);
const error = ref('');
const items = ref([]);
const activeFilter = ref('all');
const sortOrder = ref('unread_first');
const visibleKinds = ref({
  client_event: true,
  message: true,
  comment: true,
  announcement: true,
  ticket: true,
  checklist: true,
  status: true,
  assignment: true,
  client_created: true,
  provider_slots: true,
  provider_day: true,
  doc: true
});

const normalizeFilter = (raw) => {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'comments' || v === 'comment') return 'comment';
  if (v === 'messages' || v === 'message') return 'message';
  if (v === 'announcements' || v === 'announcement') return 'announcement';
  if (v === 'tickets' || v === 'ticket') return 'ticket';
  if (v === 'checklist' || v === 'checklists') return 'checklist';
  if (v === 'docs' || v === 'doc') return 'doc';
  return 'all';
};

const setFilter = (next) => {
  activeFilter.value = normalizeFilter(next);
};

const sortedItems = computed(() => {
  const list = items.value || [];
  const order = sortOrder.value || 'newest';
  const dir = order === 'oldest' ? 1 : -1;
  const lastSeen = lastSeenOrg.value;
  const byKind = lastSeenByKind.value;
  const byClientKind = lastSeenByClientKind.value;
  const lastSeenForItem = (it) => {
    const kind = String(it?.kind || '').toLowerCase();
    const clientId = it?.client_id ? String(it.client_id) : '';
    if (clientId && byClientKind[clientId]?.[kind]) {
      const t = new Date(byClientKind[clientId][kind]).getTime();
      return Number.isFinite(t) ? t : 0;
    }
    if (byKind[kind]) {
      const t = new Date(byKind[kind]).getTime();
      return Number.isFinite(t) ? t : 0;
    }
    return lastSeen ? new Date(lastSeen).getTime() : 0;
  };
  const isUnreadItem = (it) => {
    const t = it?.created_at ? new Date(it.created_at).getTime() : 0;
    return Number.isFinite(t) && t > lastSeenForItem(it);
  };
  return list.slice().sort((a, b) => {
    if (order === 'unread_first') {
      const aUnread = isUnreadItem(a);
      const bUnread = isUnreadItem(b);
      if (aUnread && !bUnread) return -1;
      if (!aUnread && bUnread) return 1;
    }
    const at = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b?.created_at ? new Date(b.created_at).getTime() : 0;
    if (at !== bt) return (at - bt) * dir;
    return String(a?.id || '').localeCompare(String(b?.id || '')) * dir;
  });
});

const dismissedIds = ref(new Set());

const visibleFilteredCount = computed(() => {
  const list = sortedItems.value || [];
  const dismissed = dismissedIds.value;
  const filtered = filterByKindAndVisibility(list);
  return filtered.filter((it) => !dismissed.has(String(it?.id ?? ''))).length;
});

function filterByKindAndVisibility(list) {
  if (activeFilter.value !== 'all') {
    if (activeFilter.value === 'ticket') {
      return list.filter((it) => String(it?.kind || '').toLowerCase() === 'ticket');
    }
    if (activeFilter.value === 'doc') {
      return list.filter((it) => String(it?.kind || '').toLowerCase() === 'doc');
    }
    return list.filter((it) => String(it?.kind || '').toLowerCase() === activeFilter.value);
  }
  return list.filter((it) => {
    const k = String(it?.kind || '').toLowerCase();
    const category = String(it?.category || '').toLowerCase();
    if (category === 'ticket') return !!visibleKinds.value.ticket;
    if (k === 'client_event') return !!visibleKinds.value.client_event;
    if (k === 'message') return !!visibleKinds.value.message;
    if (k === 'comment') return !!visibleKinds.value.comment;
    if (k === 'announcement') return !!visibleKinds.value.announcement;
    if (k === 'ticket') return !!visibleKinds.value.ticket;
    if (k === 'checklist') return !!visibleKinds.value.checklist;
    if (k === 'status') return !!visibleKinds.value.status;
    if (k === 'assignment') return !!visibleKinds.value.assignment;
    if (k === 'client_created') return !!visibleKinds.value.client_created;
    if (k === 'provider_slots') return !!visibleKinds.value.provider_slots;
    if (k === 'provider_day') return !!visibleKinds.value.provider_day;
    if (k === 'doc') return !!visibleKinds.value.doc;
    return true;
  });
}

const filteredItems = computed(() => {
  const list = filterByKindAndVisibility(sortedItems.value || []);
  const dismissed = dismissedIds.value;
  return list.filter((it) => !dismissed.has(String(it?.id ?? '')));
});

const emptyText = computed(() => {
  if (activeFilter.value === 'comment') return 'No new comments yet.';
  if (activeFilter.value === 'message') return 'No new messages yet.';
  if (activeFilter.value === 'announcement') return 'No announcements yet.';
  if (activeFilter.value === 'ticket') return 'No ticket activity yet.';
  if (activeFilter.value === 'checklist') return 'No checklist updates yet.';
  if (activeFilter.value === 'doc') return 'No new docs or links yet.';
  return 'No notifications yet.';
});

const prefsLoading = ref(false);
const lastSeenOrg = ref(''); // for this org
const lastSeenByKind = ref({});
const lastSeenByClientKind = ref({});

const parseJsonMaybe = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const showSettings = ref(false);
const savingSettings = ref(false);
const settingsSaved = ref(false);
const settingsError = ref('');
const settings = ref({
  announcements: true,
  tickets: true,
  clientCreated: true,
  providerSlots: true,
  providerDayAdded: true,
  docsLinks: true,
  checklistUpdates: true,
  clientUpdates: true,
  statusUpdates: true,
  providerUpdates: true,
  serviceDayUpdates: true,
  submissionDateUpdates: true,
  documentDateUpdates: true,
  orgSwaps: true,
  otherUpdates: true,
  assignments: true,
  clientComments: true,
  clientMessages: true
});

const normalizeProgress = (raw) => {
  if (raw && typeof raw === 'object' && raw.by_org) {
    return {
      ...raw,
      dismissed_by_org: raw.dismissed_by_org && typeof raw.dismissed_by_org === 'object' ? raw.dismissed_by_org : {}
    };
  }
  const legacy = raw && typeof raw === 'object' ? raw : {};
  return { by_org: legacy, by_org_kind: {}, by_org_client_kind: {}, dismissed_by_org: {} };
};

const loadLastSeen = async () => {
  try {
    const uid = authStore.user?.id;
    if (!uid) return;
    prefsLoading.value = true;
    const pref = (await api.get(`/users/${uid}/preferences`)).data || {};
    const raw = pref.school_portal_notifications_progress;
    const m = normalizeProgress(parseJsonMaybe(raw) || raw);
    const key = String(props.schoolOrganizationId);
    lastSeenOrg.value = String(m?.by_org?.[key] || '');
    lastSeenByKind.value = m?.by_org_kind?.[key] || {};
    lastSeenByClientKind.value = m?.by_org_client_kind?.[key] || {};
    const dismissedList = m?.dismissed_by_org?.[key] || [];
    dismissedIds.value = new Set(Array.isArray(dismissedList) ? dismissedList.map(String) : []);
  } catch {
    lastSeenOrg.value = '';
    lastSeenByKind.value = {};
    lastSeenByClientKind.value = {};
    dismissedIds.value = new Set();
  } finally {
    prefsLoading.value = false;
  }
};

const loadCategories = async () => {
  try {
    const uid = authStore.user?.id;
    if (!uid) return {};
    const pref = (await api.get(`/users/${uid}/preferences`)).data || {};
    const raw = pref.notification_categories;
    const m = parseJsonMaybe(raw) || raw;
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
};

const openSettings = async () => {
  settingsError.value = '';
  settingsSaved.value = false;
  showSettings.value = true;
  const cats = await loadCategories();
  settings.value = {
    announcements: cats.school_portal_announcements !== false,
    tickets: cats.school_portal_ticket_activity !== false,
    clientCreated: cats.school_portal_client_created !== false,
    providerSlots: cats.school_portal_provider_slots !== false,
    providerDayAdded: cats.school_portal_provider_day_added !== false,
    docsLinks: cats.school_portal_docs_links !== false,
    checklistUpdates: cats.school_portal_checklist_updates !== false,
    clientUpdates: cats.school_portal_client_updates !== false,
    statusUpdates: cats.school_portal_client_update_status !== false,
    providerUpdates: cats.school_portal_client_update_provider !== false,
    serviceDayUpdates: cats.school_portal_client_update_service_day !== false,
    submissionDateUpdates: cats.school_portal_client_update_submission_date !== false,
    documentDateUpdates: cats.school_portal_client_update_document_date !== false,
    orgSwaps: cats.school_portal_client_update_org_swaps !== false,
    otherUpdates: cats.school_portal_client_update_other !== false,
    assignments: cats.school_portal_client_assignments !== false,
    clientComments: cats.school_portal_client_comments !== false,
    clientMessages: cats.school_portal_client_messages !== false
  };
};

const closeSettings = () => {
  showSettings.value = false;
  settingsError.value = '';
  settingsSaved.value = false;
};

const saveSettings = async () => {
  try {
    const uid = authStore.user?.id;
    if (!uid) return;
    savingSettings.value = true;
    settingsError.value = '';
    settingsSaved.value = false;

    const existing = await loadCategories();
    const next = { ...(existing || {}) };
    next.school_portal_announcements = !!settings.value.announcements;
    next.school_portal_ticket_activity = !!settings.value.tickets;
    next.school_portal_client_created = !!settings.value.clientCreated;
    next.school_portal_provider_slots = !!settings.value.providerSlots;
    next.school_portal_provider_day_added = !!settings.value.providerDayAdded;
    next.school_portal_docs_links = !!settings.value.docsLinks;
    next.school_portal_checklist_updates = !!settings.value.checklistUpdates;
    next.school_portal_client_updates = !!settings.value.clientUpdates;
    next.school_portal_client_update_status = !!settings.value.statusUpdates;
    next.school_portal_client_update_provider = !!settings.value.providerUpdates;
    next.school_portal_client_update_service_day = !!settings.value.serviceDayUpdates;
    next.school_portal_client_update_submission_date = !!settings.value.submissionDateUpdates;
    next.school_portal_client_update_document_date = !!settings.value.documentDateUpdates;
    next.school_portal_client_update_org_swaps = !!settings.value.orgSwaps;
    next.school_portal_client_update_other = !!settings.value.otherUpdates;
    next.school_portal_client_assignments = !!settings.value.assignments;
    next.school_portal_client_comments = !!settings.value.clientComments;
    next.school_portal_client_messages = !!settings.value.clientMessages;

    await api.put(`/users/${uid}/preferences`, {
      notification_categories: next
    });

    settingsSaved.value = true;
    setTimeout(() => { settingsSaved.value = false; }, 1500);
    await refresh();
  } catch (e) {
    settingsError.value = e.response?.data?.error?.message || 'Failed to save settings';
  } finally {
    savingSettings.value = false;
  }
};

const applyProgressFromResponse = (progress) => {
  if (!progress || typeof progress !== 'object') return;
  const m = normalizeProgress(parseJsonMaybe(progress) || progress);
  const key = String(props.schoolOrganizationId);
  lastSeenOrg.value = String(m?.by_org?.[key] || '');
  lastSeenByKind.value = m?.by_org_kind?.[key] || {};
  lastSeenByClientKind.value = m?.by_org_client_kind?.[key] || {};
  const dismissedList = m?.dismissed_by_org?.[key] || [];
  dismissedIds.value = new Set(Array.isArray(dismissedList) ? dismissedList.map(String) : []);
};

const markRead = async ({ kind, clientId } = {}) => {
  try {
    if (!props.schoolOrganizationId) return;
    const r = await api.post(`/school-portal/${props.schoolOrganizationId}/notifications/read`, {
      kind: kind || undefined,
      clientId: clientId || undefined
    });
    if (r?.data?.progress) applyProgressFromResponse(r.data.progress);
    else await loadLastSeen();
  } catch {
    // ignore (should never block viewing)
  }
};

const markAllRead = async () => {
  await markRead({ kind: 'all' });
  emit('updated');
};

const markItemRead = async (it) => {
  const kind = String(it?.kind || '').toLowerCase();
  const clientId = Number(it?.client_id || 0) || null;
  await markRead({ kind, clientId });
  emit('updated');
  const id = String(it?.id ?? '');
  if (id) selectedIds.value = selectedIds.value.filter((x) => x !== id);
};

const markSelectedRead = async () => {
  if (selectedItems.value.length === 0) return;
  await Promise.all(
    selectedItems.value.map((it) => {
      const kind = String(it?.kind || '').toLowerCase();
      const clientId = Number(it?.client_id || 0) || null;
      return markRead({ kind, clientId });
    })
  );
  emit('updated');
  selectedIds.value = [];
};

const markVisibleRead = async () => {
  const unreadVisible = (filteredItems.value || []).filter(isUnread);
  if (unreadVisible.length === 0) return;
  await Promise.all(
    unreadVisible.map((it) => {
      const kind = String(it?.kind || '').toLowerCase();
      const clientId = Number(it?.client_id || 0) || null;
      return markRead({ kind, clientId });
    })
  );
  emit('updated');
  selectedIds.value = [];
};

const dismiss = async (idsToDismiss) => {
  try {
    if (!props.schoolOrganizationId) return;
    const ids = Array.isArray(idsToDismiss) ? idsToDismiss : [idsToDismiss].filter(Boolean);
    const r = await api.post(`/school-portal/${props.schoolOrganizationId}/notifications/dismiss`, { ids });
    if (r?.data?.progress) applyProgressFromResponse(r.data.progress);
    else {
      const next = new Set(dismissedIds.value);
      ids.forEach((id) => next.add(String(id)));
      dismissedIds.value = next;
    }
    emit('updated');
    selectedIds.value = selectedIds.value.filter((id) => !ids.includes(id));
  } catch {
    // ignore
  }
};

const dismissSelected = async () => {
  const ids = selectedItems.value.map((it) => String(it?.id ?? '')).filter(Boolean);
  if (ids.length === 0) return;
  await dismiss(ids);
  selectedIds.value = [];
};

const dismissAll = async () => {
  const ids = (filteredItems.value || []).map((it) => String(it?.id ?? '')).filter(Boolean);
  if (ids.length === 0) return;
  await dismiss(ids);
  selectedIds.value = [];
};

const selectAllOnPage = () => {
  const ids = (filteredItems.value || []).map((it) => String(it?.id ?? '')).filter(Boolean);
  selectedIds.value = [...new Set([...selectedIds.value, ...ids])];
};

const selectAllTotal = () => {
  const ids = (items.value || []).map((it) => String(it?.id ?? '')).filter(Boolean);
  selectedIds.value = [...new Set([...selectedIds.value, ...ids])];
};

const clearSelection = () => {
  selectedIds.value = [];
};

const fetchFeed = async () => {
  if (!props.schoolOrganizationId) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`/school-portal/${props.schoolOrganizationId}/notifications/feed`);
    items.value = Array.isArray(r.data) ? r.data : [];
    const ids = new Set(items.value.map((it) => String(it?.id ?? '')));
    selectedIds.value = selectedIds.value.filter((id) => ids.has(id));
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load notifications';
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const refresh = async () => {
  await Promise.all([loadLastSeen(), fetchFeed()]);
  // Let parent update card badge/snippet.
  emit('updated');
};

const toMs = (v) => {
  try {
    const t = v ? new Date(v).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
};

const lastSeenMs = computed(() => toMs(lastSeenOrg.value));

const lastSeenForItem = (it) => {
  const kind = String(it?.kind || '').toLowerCase();
  const clientId = it?.client_id ? String(it.client_id) : '';
  if (clientId) {
    const byClient = lastSeenByClientKind.value?.[clientId] || {};
    if (byClient?.[kind]) return toMs(byClient[kind]);
  }
  if (lastSeenByKind.value?.[kind]) return toMs(lastSeenByKind.value[kind]);
  return lastSeenMs.value;
};

const isUnread = (it) => {
  const t = it?.created_at ? new Date(it.created_at).getTime() : 0;
  const lastSeen = lastSeenForItem(it);
  return Number.isFinite(t) && t > lastSeen;
};

const unreadCount = computed(() => (filteredItems.value || []).filter(isUnread).length);
const visibleUnreadCount = computed(() => (filteredItems.value || []).filter(isUnread).length);

const selectedIds = ref([]);
const selectedCount = computed(() => selectedIds.value.length);
const selectedItems = computed(() => {
  const byId = new Map((filteredItems.value || []).map((it) => [String(it?.id ?? ''), it]));
  return selectedIds.value.map((id) => byId.get(id)).filter(Boolean);
});

const isSelected = (it) => {
  const id = String(it?.id ?? '');
  return !!id && selectedIds.value.includes(id);
};

const toggleSelected = (it, checked) => {
  const id = String(it?.id ?? '');
  if (!id) return;
  const next = new Set(selectedIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedIds.value = Array.from(next);
};

const isClickable = (it) => {
  const kind = String(it?.kind || '').toLowerCase();
  const clientId = Number(it?.client_id || 0);
  if (kind === 'comment' || kind === 'message' || kind === 'ticket') return true;
  if ((kind === 'doc' || kind === 'client_created') && clientId) return true;
  return false;
};

const isTicket = (it) => String(it?.kind || '').toLowerCase() === 'ticket';

const itemCategoryClass = (it) => {
  const kind = String(it?.kind || '').toLowerCase();
  const category = String(it?.category || '').toLowerCase();
  const key = category === 'ticket' ? 'ticket' : kind || 'announcement';
  return `category-${key}`;
};

const formatClientLabel = (it) => {
  const code = String(it?.client_identifier_code || '').trim();
  const initials = String(it?.client_initials || '').trim();
  if (props.clientLabelMode === 'initials') return initials || code || '';
  return code || initials || '';
};

const formatMessage = (it) => {
  const raw = String(it?.message || '').trim();
  const kind = String(it?.kind || '').toLowerCase();
  if (kind === 'announcement') return raw;
  const label = formatClientLabel(it);
  if (!label) return raw;
  const idx = raw.indexOf(':');
  const suffix = idx >= 0 ? raw.slice(idx + 1).trim() : raw;
  return suffix ? `${label}: ${suffix}` : label;
};

const formatKindLabel = (it) => {
  const kind = String(it?.kind || '').toLowerCase();
  const category = String(it?.category || '').toLowerCase();
  if (kind === 'ticket') return 'Ticket';
  if (kind === 'comment') return 'Comment';
  if (kind === 'message') return 'Message';
  if (kind === 'announcement') return 'Announcement';
  if (kind === 'checklist') return 'Checklist';
  if (kind === 'status') return 'Status update';
  if (kind === 'assignment') return 'Assignment';
  if (kind === 'client_created') return 'New client';
  if (kind === 'provider_slots') return 'Provider slots';
  if (kind === 'provider_day') return 'Provider day added';
  if (kind === 'doc') return 'Docs/links';
  if (kind === 'client_event' && category === 'ticket') return 'Ticket update';
  if (kind === 'client_event') return 'Client update';
  return kind ? kind.replace(/_/g, ' ') : 'Notification';
};

const ticketNumber = (it) => parseNumericId(it?.id);

const formatTicketTitle = (it) => {
  const base = String(it?.title || 'Ticket').trim();
  return base ? base.toUpperCase() : 'TICKET';
};

const formatTicketDetail = (it) => {
  const raw = String(it?.message || '').trim();
  const label = formatClientLabel(it);
  if (!label) return raw || 'Update';
  const idx = raw.indexOf(':');
  const suffix = idx >= 0 ? raw.slice(idx + 1).trim() : raw;
  return suffix ? `${label}: ${suffix}` : label;
};

const formatWhen = (ts) => {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || '');
  }
};

const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const detailTitle = ref('Details');
const detailMeta = ref('');
const detailText = ref('');

const closeDetail = () => {
  detailOpen.value = false;
  detailLoading.value = false;
  detailError.value = '';
  detailTitle.value = 'Details';
  detailMeta.value = '';
  detailText.value = '';
};

const parseNumericId = (id) => {
  const s = String(id || '');
  const idx = s.indexOf(':');
  const raw = idx >= 0 ? s.slice(idx + 1) : s;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
};

const showDetail = ({ title, meta, text }) => {
  detailTitle.value = title || 'Details';
  detailMeta.value = meta || '';
  detailText.value = text || '';
  detailError.value = '';
  detailOpen.value = true;
};

const openTicketFromMessage = (it) => {
  const ticketId = Number(it?.ticket_id || 0) || null;
  const clientId = Number(it?.client_id || 0) || null;
  const messageId = parseNumericId(it?.id);
  if (!ticketId || !clientId) return false;
  emit('open-ticket', { ticketId, clientId, messageId });
  return true;
};

const openTicketFromItem = (it) => {
  const ticketId = Number(it?.ticket_id || 0) || parseNumericId(it?.id);
  const clientId = Number(it?.client_id || 0) || null;
  if (!ticketId || !clientId) return false;
  emit('open-ticket', { ticketId, clientId });
  return true;
};

const handleItemClick = async (it) => {
  const kind = String(it?.kind || '').toLowerCase();
  const clientId = Number(it?.client_id || 0);
  await markRead({ kind, clientId: clientId || null });
  emit('updated');

  if (!isClickable(it)) return;

  if (kind === 'doc' || kind === 'client_created') {
    if (clientId) emit('open-client', { clientId });
    return;
  }

  try {
    if (kind === 'ticket') {
      if (openTicketFromItem(it)) return;
      const label = formatClientLabel(it);
      showDetail({
        title: label ? `${label}: Ticket` : 'Ticket',
        meta: formatWhen(it?.created_at),
        text: String(it?.message || '').trim() || 'Ticket update'
      });
      return;
    }
    const orgId = Number(props.schoolOrganizationId || 0);
    if (!orgId || !clientId) return;
    if (kind === 'comment') {
      detailOpen.value = true;
      detailLoading.value = true;
      detailError.value = '';
      detailText.value = '';
      const commentId = parseNumericId(it?.id);
      const r = await api.get(`/school-portal/${orgId}/clients/${clientId}/comments`, { timeout: 12000 });
      const list = Array.isArray(r.data) ? r.data : [];
      const found = commentId ? list.find((c) => Number(c?.id) === Number(commentId)) : null;
      const msg = String(found?.message || it?.message || 'Comment unavailable.').trim();
      const who = String(found?.author_name || it?.actor_name || '').trim();
      const when = formatWhen(found?.created_at || it?.created_at);
      const label = formatClientLabel(it);
      showDetail({
        title: label ? `${label}: Comment` : 'Comment',
        meta: [when, who].filter(Boolean).join(' • '),
        text: msg
      });
      return;
    }

    if (kind === 'message') {
      if (openTicketFromMessage(it)) return;
      detailOpen.value = true;
      detailLoading.value = true;
      detailError.value = '';
      detailText.value = '';
      const messageId = parseNumericId(it?.id);
      const r = await api.get('/support-tickets/client-thread', {
        params: { schoolOrganizationId: orgId, clientId },
        timeout: 12000
      });
      const msgs = Array.isArray(r.data?.messages) ? r.data.messages : [];
      const found = messageId ? msgs.find((m) => Number(m?.id) === Number(messageId)) : null;
      const body = String(found?.body || it?.message || '').trim();
      const fn = String(found?.author_first_name || '').trim();
      const ln = String(found?.author_last_name || '').trim();
      const who = [fn, ln].filter(Boolean).join(' ').trim() || String(it?.actor_name || '').trim();
      const when = formatWhen(found?.created_at || it?.created_at);
      const label = formatClientLabel(it);
      showDetail({
        title: label ? `${label}: Message` : 'Message',
        meta: [when, who].filter(Boolean).join(' • '),
        text: body
      });
    }
  } catch (e) {
    detailError.value = e.response?.data?.error?.message || 'Failed to load details';
  } finally {
    detailLoading.value = false;
  }
};

// Create announcement UI
const createOpen = ref(false);
const draftTitle = ref('');
const draftMessage = ref('');
const draftStartsAt = ref('');
const draftEndsAt = ref('');
const creating = ref(false);
const createError = ref('');

const initCreateDefaults = () => {
  const now = new Date();
  const ends = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const toLocalInput = (d) => {
    // yyyy-MM-ddTHH:mm
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };
  draftStartsAt.value = toLocalInput(now);
  draftEndsAt.value = toLocalInput(ends);
};

const toggleCreate = () => {
  createOpen.value = !createOpen.value;
  createError.value = '';
  if (createOpen.value) initCreateDefaults();
};

const canSubmitCreate = computed(() => {
  if (!canCreateAnnouncements.value) return false;
  if (!draftMessage.value.trim()) return false;
  if (!draftStartsAt.value || !draftEndsAt.value) return false;
  return true;
});

const create = async () => {
  if (!canSubmitCreate.value) return;
  creating.value = true;
  createError.value = '';
  try {
    await api.post(`/school-portal/${props.schoolOrganizationId}/announcements`, {
      title: draftTitle.value.trim() || null,
      message: draftMessage.value.trim(),
      starts_at: new Date(draftStartsAt.value),
      ends_at: new Date(draftEndsAt.value)
    });
    draftTitle.value = '';
    draftMessage.value = '';
    createOpen.value = false;
    await refresh();
  } catch (e) {
    createError.value = e.response?.data?.error?.message || 'Failed to post announcement';
  } finally {
    creating.value = false;
  }
};

watch(
  () => props.schoolOrganizationId,
  async () => {
    items.value = [];
    error.value = '';
    lastSeenOrg.value = '';
    lastSeenByKind.value = {};
    lastSeenByClientKind.value = {};
    await refresh();
  },
  { immediate: true }
);

watch(
  () => props.initialFilter,
  (next) => {
    activeFilter.value = normalizeFilter(next);
  },
  { immediate: true }
);
</script>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 14px;
}
.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.muted {
  color: var(--text-secondary);
}
.muted-small {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

/* Keep school portal action buttons compact and stable. */
.panel .btn {
  width: auto;
  min-width: 0;
  padding: 7px 12px;
  font-size: 12px;
  line-height: 1.2;
}

.panel .btn.btn-sm {
  padding: 6px 10px;
  font-size: 12px;
}
.spacer {
  flex: 1;
}
.toolbar-divider {
  width: 1px;
  height: 24px;
  background: var(--border);
}
.filter-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.filter-btn {
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.filter-btn.active {
  background: rgba(14, 165, 233, 0.12);
  border-color: rgba(14, 165, 233, 0.5);
  color: #0369a1;
}
.selector {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.selector-select {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px 10px;
  background: white;
  font-size: 12px;
  font-weight: 700;
}
.selector-box {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  flex-wrap: wrap;
}
.selector-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.selector-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}
.settings-section {
  padding: 8px 0 4px;
  border-top: 1px solid var(--border);
  margin-top: 8px;
}
.settings-section:first-of-type {
  border-top: none;
  margin-top: 0;
}
.settings-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.settings-subtoggle {
  padding-left: 18px;
}
.settings-help {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0 6px;
}
.settings-subhelp {
  margin-left: 18px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  border-radius: 12px;
  padding: 18px;
  max-width: 520px;
  width: 92vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
  flex-shrink: 0;
}
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.btn-close {
  background: none;
  border: none;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
}
.btn-close:hover {
  color: var(--text-primary);
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  user-select: none;
}
.toggle-label {
  font-weight: 800;
  color: var(--text-primary);
}

.feed {
  display: grid;
  gap: 10px;
}
.item {
  border: 1px solid var(--border);
  border-radius: 12px;
  --item-tint: 148, 163, 184;
  background: rgba(var(--item-tint), 0.08);
  padding: 10px 12px;
  text-align: left;
  width: 100%;
  cursor: default;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.item.unread {
  border-color: rgba(var(--item-tint), 0.55);
  background: rgba(var(--item-tint), 0.18);
  box-shadow: inset 3px 0 0 rgba(var(--item-tint), 0.7);
}
.item.clickable {
  cursor: pointer;
}
.item.clickable:hover {
  border-color: rgba(var(--item-tint), 0.45);
}
.item.category-message {
  --item-tint: 59, 130, 246;
}
.item.category-comment {
  --item-tint: 14, 165, 233;
}
.item.category-ticket {
  --item-tint: 245, 158, 11;
}
.item.category-announcement {
  --item-tint: 16, 185, 129;
}
.item.category-checklist {
  --item-tint: 99, 102, 241;
}
.item.category-status {
  --item-tint: 168, 85, 247;
}
.item.category-assignment {
  --item-tint: 217, 119, 6;
}
.item.category-client_event {
  --item-tint: 34, 197, 94;
}
.item.category-client_created {
  --item-tint: 132, 204, 22;
}
.item.category-provider_slots {
  --item-tint: 236, 72, 153;
}
.item.category-provider_day {
  --item-tint: 244, 63, 94;
}
.item.category-doc {
  --item-tint: 45, 212, 191;
}
.detail-body {
  display: grid;
  gap: 10px;
}
.detail-text {
  white-space: pre-wrap;
  color: var(--text-primary);
  line-height: 1.35;
}
.item-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.item-body {
  flex: 1;
  min-width: 0;
}
.item-select {
  display: inline-flex;
  align-items: center;
  margin-top: 2px;
}
.item-select input {
  width: 16px;
  height: 16px;
}
.item-actions {
  display: inline-flex;
  align-items: flex-start;
}
.item-action-btn {
  white-space: nowrap;
}
.item-title {
  font-weight: 900;
}
.item-title-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.item-ticket-number {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.item-title-strong {
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.item-title-sep {
  color: var(--text-secondary);
  font-weight: 800;
}
.item-title-detail {
  color: var(--text-primary);
  font-weight: 700;
}
.item-meta {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.item-info {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.item-chip {
  font-size: 11px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(var(--item-tint), 0.14);
  color: var(--text-secondary);
}
.item-chip.chip-unread {
  background: rgba(var(--item-tint), 0.28);
  color: var(--text-primary);
}
.item-msg {
  margin-top: 6px;
  white-space: pre-wrap;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 800;
}
.empty {
  color: var(--text-secondary);
  padding: 8px 2px;
}
.error {
  color: #c33;
  font-weight: 700;
}
.create-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
  padding: 12px;
  margin-bottom: 12px;
}
.create-title {
  font-weight: 900;
  margin-bottom: 10px;
}
.create-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.field {
  display: grid;
  gap: 6px;
}
.field-wide {
  grid-column: 1 / -1;
}
.k {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 900;
}
input, textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.create-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
@media (max-width: 900px) {
  .create-grid {
    grid-template-columns: 1fr;
  }
}
</style>

