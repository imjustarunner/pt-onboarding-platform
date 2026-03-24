<template>
  <div class="sbcnh">
    <div class="sbcnh-mode-bar" role="tablist" aria-label="Clinical notes view">
      <button
        type="button"
        role="tab"
        class="sbcnh-mode-btn"
        :class="{ 'sbcnh-mode-btn--active': hubMode === 'list' }"
        :aria-selected="hubMode === 'list'"
        @click="hubMode = 'list'"
      >
        Notes list
      </button>
      <button
        type="button"
        role="tab"
        class="sbcnh-mode-btn"
        :class="{ 'sbcnh-mode-btn--active': hubMode === 'bySession' }"
        :aria-selected="hubMode === 'bySession'"
        @click="hubMode = 'bySession'"
      >
        By session
      </button>
      <button
        type="button"
        role="tab"
        class="sbcnh-mode-btn"
        :class="{ 'sbcnh-mode-btn--active': hubMode === 'aid' }"
        :aria-selected="hubMode === 'aid'"
        @click="hubMode = 'aid'"
      >
        Clinical note aid (H2014)
      </button>
    </div>

    <p v-if="hubMode === 'list'" class="pch-muted sbcnh-intro">
      <strong>My queue</strong> (default filters below): past and today, items that still need a note or follow-up. Use
      <strong>Queue → All session dates</strong> when you need future sessions in this list. For every scheduled date and the
      full roster, use <strong>By session</strong>. Copy-aid notes expire after <strong>14 days</strong> (warning in the last 2
      days).
    </p>
    <p v-else-if="hubMode === 'bySession'" class="pch-muted sbcnh-intro">
      Pick a program, then a <strong>session date</strong>. You will see every enrolled client and note status (including no
      note yet). Open the note aid for any client without leaving the roster.
    </p>
    <p v-else class="pch-muted sbcnh-intro">
      Full H2014 workspace for this program: pick session and client, activities, summary, generate, and edit sections.
    </p>

    <!-- ——— List mode ——— -->
    <template v-if="hubMode === 'list'">
      <div class="sbcnh-toolbar">
        <label class="sbcnh-field sbcnh-field-grow">
          <span class="sbcnh-field-label">Search</span>
          <input
            v-model="searchQuery"
            type="search"
            class="input input-sm sbcnh-search"
            placeholder="Event, client, session, status…"
            autocomplete="off"
          />
        </label>
        <label class="sbcnh-field">
          <span class="sbcnh-field-label">Session</span>
          <select v-model="sessionFilterId" class="input input-sm">
            <option :value="null">All sessions</option>
            <option v-for="opt in sessionFilterOptions" :key="opt.sessionId" :value="opt.sessionId">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label class="sbcnh-field">
          <span class="sbcnh-field-label">Queue</span>
          <select v-model="filters.queueScope" class="input input-sm" @change="load">
            <option value="due">Due (today or past)</option>
            <option value="all">All session dates</option>
          </select>
        </label>
        <label class="sbcnh-field">
          <span class="sbcnh-field-label">Status</span>
          <select v-model="filters.statusFilter" class="input input-sm" @change="load">
            <option value="pending">Pending (needed + missed)</option>
            <option value="note_needed">Note needed only</option>
            <option value="missed">Missed</option>
            <option value="completed">Completed</option>
            <option value="all">All statuses</option>
          </select>
        </label>
        <label class="sbcnh-field">
          <span class="sbcnh-field-label">Sort</span>
          <select v-model="filters.sortBy" class="input input-sm" @change="load">
            <option value="sessionDate">Session date</option>
            <option value="updatedAt">Updated</option>
            <option value="eventTitle">Event</option>
            <option value="status">Status</option>
            <option value="client">Client</option>
          </select>
        </label>
        <label class="sbcnh-field sbcnh-field-inline">
          <input v-model="filters.sortDirDesc" type="checkbox" @change="load" />
          <span>Desc</span>
        </label>
        <label class="sbcnh-field sbcnh-field-inline">
          <input v-model="filters.includeAttendanceGaps" type="checkbox" @change="load" />
          <span>Attendance gaps</span>
        </label>
      </div>

      <div v-if="loading" class="muted">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="!filteredRows.length" class="muted">No rows match your search and filters.</div>
      <div v-else class="sbcnh-table-wrap">
        <table class="sbcnh-table">
          <thead>
            <tr>
              <th>
                <button type="button" class="sbcnh-th" @click="toggleSort('eventTitle')">
                  Event {{ sortHint('eventTitle') }}
                </button>
              </th>
              <th>
                <button type="button" class="sbcnh-th" @click="toggleSort('sessionDate')">
                  Session {{ sortHint('sessionDate') }}
                </button>
              </th>
              <th>
                <button type="button" class="sbcnh-th" @click="toggleSort('updatedAt')">
                  Updated {{ sortHint('updatedAt') }}
                </button>
              </th>
              <th>
                <button type="button" class="sbcnh-th" @click="toggleSort('client')">
                  Client {{ sortHint('client') }}
                </button>
              </th>
              <th class="sbcnh-col-action">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredRows"
              :key="rowKey(row)"
              :class="{ 'sbcnh-tr--complete': isRowComplete(row) }"
            >
              <td>{{ row.eventTitle || 'Event' }}</td>
              <td>{{ formatSessionDate(row.sessionDate) }}</td>
              <td>{{ formatDt(row.updatedAt) }}</td>
              <td>{{ clientDisplay(row) }}</td>
              <td class="sbcnh-col-action">
                <button
                  v-if="!isRowComplete(row)"
                  type="button"
                  class="btn btn-sm sbcnh-btn-complete"
                  @click="openNoteModal(row)"
                >
                  Complete note
                </button>
                <div v-else class="sbcnh-action-wrap">
                  <span class="sbcnh-pill sbcnh-pill--done">Complete</span>
                  <button type="button" class="btn btn-sm sbcnh-btn-view" @click="openNoteModal(row)">View note</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ——— By session ——— -->
    <div v-else-if="hubMode === 'bySession'" class="sbcnh-board-panel">
      <div v-if="!parentEventId" class="sbcnh-aid-event-row">
        <label class="sbcnh-field sbcnh-field-grow">
          <span class="sbcnh-field-label">Event</span>
          <select
            v-model.number="boardPickedEventId"
            class="input input-sm"
            :disabled="aidEventsLoading"
            aria-label="Select Skill Builders event for session board"
          >
            <option :value="0">{{ aidEventsLoading ? 'Loading events…' : 'Select an event…' }}</option>
            <option v-for="opt in aidEventOptions" :key="`board-ev-${opt.companyEventId}`" :value="opt.companyEventId">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <p v-if="aidEventsError" class="error sbcnh-aid-events-err">{{ aidEventsError }}</p>
      </div>

      <div v-if="!boardEffectiveEventId" class="muted sbcnh-aid-placeholder">
        <template v-if="parentEventId">Loading event…</template>
        <template v-else>Select an <strong>event</strong> above to load all sessions for that program.</template>
      </div>
      <div v-else-if="boardSessionsLoading" class="muted sbcnh-aid-placeholder">Loading sessions…</div>
      <p v-else-if="boardSessionsError" class="error sbcnh-aid-events-err">{{ boardSessionsError }}</p>
      <div v-else class="sbcnh-board-layout">
        <div class="sbcnh-board-sessions">
          <p class="sbcnh-board-side-title">{{ boardEventTitleDisplay || 'Program' }}</p>
          <p class="sbcnh-board-side-hint muted small">
            <template v-if="boardSessionSortMode === 'focus'">
              This week &amp; last week first, then older sessions (highlighted), then upcoming.
            </template>
            <template v-else-if="boardSessionSortMode === 'desc'">Newest session dates first (full list).</template>
            <template v-else>Oldest session dates first (full list).</template>
          </p>
          <div class="sbcnh-board-session-controls">
            <label class="sbcnh-board-search">
              <span class="sbcnh-board-search-label">Find date</span>
              <input
                v-model="boardSessionSearchQuery"
                type="search"
                class="input input-sm"
                placeholder="Mar 10, 2026 or 2026-03…"
                autocomplete="off"
                aria-label="Search sessions by date"
              />
            </label>
            <label class="sbcnh-board-sort">
              <span class="sbcnh-board-sort-label">Sort</span>
              <select v-model="boardSessionSortMode" class="input input-sm" aria-label="Session list sort">
                <option value="focus">Recent focus</option>
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </label>
          </div>
          <ul class="sbcnh-board-session-list" role="list">
            <li v-for="s in boardSessionsForList" :key="`bs-${s.id}`">
              <button
                type="button"
                class="sbcnh-board-session-btn"
                :class="{
                  'sbcnh-board-session-btn--active': Number(boardSelectedSessionId) === Number(s.id),
                  'sbcnh-board-session-btn--past': boardSessionIsPast(s)
                }"
                @click="selectBoardSession(Number(s.id))"
              >
                {{ resolvedFormatSessionLabel(s) }}
              </button>
            </li>
          </ul>
          <p v-if="boardSessionsForList.length === 0 && boardSessionSearchQuery.trim()" class="muted small sbcnh-board-no-match">
            No sessions match that search.
          </p>
        </div>
        <div class="sbcnh-board-main">
          <template v-if="!boardSelectedSessionId">
            <p class="muted sbcnh-board-placeholder">Select a session to see the roster and note status for every client.</p>
          </template>
          <template v-else>
            <p v-if="boardLoading" class="muted">Loading roster…</p>
            <p v-else-if="boardError" class="error">{{ boardError }}</p>
            <div v-else-if="!boardClients.length" class="muted">No enrolled clients match the roster rules for this program.</div>
            <div v-else class="sbcnh-table-wrap">
              <table class="sbcnh-table sbcnh-board-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Note status</th>
                    <th>Attendance</th>
                    <th class="sbcnh-col-action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="c in boardClients"
                    :key="`bc-${boardSelectedSessionId}-${c.clientId}`"
                    :class="{ 'sbcnh-tr--complete': boardClientComplete(c) }"
                  >
                    <td>{{ boardClientDisplay(c) }}</td>
                    <td>{{ boardStatusLabel(c) }}</td>
                    <td class="muted small">{{ boardAttendanceLabel(c) }}</td>
                    <td class="sbcnh-col-action">
                      <button
                        v-if="!boardClientComplete(c)"
                        type="button"
                        class="btn btn-sm sbcnh-btn-complete"
                        @click="openBoardNoteModal(c)"
                      >
                        Complete note
                      </button>
                      <div v-else class="sbcnh-action-wrap">
                        <span class="sbcnh-pill sbcnh-pill--done">Complete</span>
                        <button type="button" class="btn btn-sm sbcnh-btn-view" @click="openBoardNoteModal(c)">
                          View note
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ——— Aid mode ——— -->
    <div v-else-if="hubMode === 'aid'" class="sbcnh-aid-panel">
      <div v-if="!parentEventId" class="sbcnh-aid-event-row">
        <label class="sbcnh-field sbcnh-field-grow">
          <span class="sbcnh-field-label">Event</span>
          <select
            v-model.number="aidPickedEventId"
            class="input input-sm"
            :disabled="aidEventsLoading"
            aria-label="Select Skill Builders event"
          >
            <option :value="0">{{ aidEventsLoading ? 'Loading events…' : 'Select an event…' }}</option>
            <option v-for="opt in aidEventOptions" :key="`aid-ev-${opt.companyEventId}`" :value="opt.companyEventId">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <p v-if="aidEventsError" class="error sbcnh-aid-events-err">{{ aidEventsError }}</p>
      </div>
      <p v-if="aidContextError && !parentEventId" class="error sbcnh-aid-events-err">{{ aidContextError }}</p>

      <div v-if="!effectiveEventId" class="muted sbcnh-aid-placeholder">
        <template v-if="parentEventId">Loading event…</template>
        <template v-else>Select an <strong>event</strong> above to load the H2014 workspace (session roster and materials).</template>
      </div>
      <div v-else-if="contextLoading" class="muted sbcnh-aid-placeholder">Loading roster and sessions…</div>
      <div
        v-else-if="!effectiveSessions.length || !effectiveClients.length"
        class="muted sbcnh-aid-placeholder"
      >
        No sessions or enrolled clients found for this event yet.
      </div>
      <SkillBuildersClientManagementClinicalPanel
        v-else
        :agency-id="agencyId"
        :event-id="effectiveEventId"
        :company-event-title="effectiveEventTitleForAid"
        :sessions="effectiveSessions"
        :session-id="aidSessionId"
        :preferred-client-id="aidPreferredClientId"
        :clients="effectiveClients"
        :viewer-caps="viewerCaps"
        :format-session-label="resolvedFormatSessionLabel"
        :client-label-for-row="resolvedClientLabel"
        @update:session-id="aidSessionId = $event"
        @refresh-sessions="onAidRefreshSessions"
      />
    </div>

    <Teleport to="body">
      <div
        v-if="modalOpen && modalRow"
        class="sbcnh-modal-backdrop"
        role="presentation"
        @click.self="closeModal"
      >
        <div class="sbcnh-modal" role="dialog" :aria-labelledby="modalTitleId" @click.stop>
          <header class="sbcnh-modal-head">
            <h2 :id="modalTitleId" class="sbcnh-modal-title">{{ modalTitle }}</h2>
            <button type="button" class="btn btn-link btn-sm sbcnh-modal-close" aria-label="Close" @click="closeModal">
              Close
            </button>
          </header>
          <div class="sbcnh-modal-body">
            <p v-if="modalPortalLoading" class="muted">Loading session roster…</p>
            <SkillBuildersClientManagementClinicalPanel
              v-else-if="modalSessions.length && modalClients.length"
              :key="`m-${modalRow.sessionId}-${modalRow.clientId}`"
              modal-mode
              session-select-at-parent
              :agency-id="agencyId"
              :event-id="Number(modalRow.companyEventId)"
              :company-event-title="resolvedCompanyEventTitle"
              :sessions="modalSessions"
              :session-id="Number(modalRow.sessionId)"
              :preferred-client-id="Number(modalRow.clientId)"
              :clients="modalClients"
              :viewer-caps="viewerCaps"
              :format-session-label="resolvedFormatSessionLabel"
              :client-label-for-row="resolvedClientLabel"
              @refresh-sessions="onModalRefresh"
              @clinical-note-completed="onModalNoteCompleted"
            />
            <p v-else class="error">Could not load roster for this event. Try again or open the event portal.</p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import SkillBuildersClientManagementClinicalPanel from './SkillBuildersClientManagementClinicalPanel.vue';

const props = defineProps({
  agencyId: { type: Number, required: true },
  /** When set, only notes for this Skill Builders company event. */
  eventId: { type: Number, default: null },
  /** Program / company event title (e.g. from event portal detail). Shown in H2014 curriculum context. */
  eventTitle: { type: String, default: '' },
  sessions: { type: Array, default: () => [] },
  clients: { type: Array, default: () => [] },
  viewerCaps: { type: Object, default: () => ({}) },
  formatSessionLabel: { type: Function, default: null },
  clientLabelForRow: { type: Function, default: null }
});

const emit = defineEmits(['refresh-sessions']);

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const loading = ref(false);
const error = ref('');
const rows = ref([]);

const hubMode = ref('list');
const searchQuery = ref('');
const sessionFilterId = ref(null);

const modalOpen = ref(false);
const modalRow = ref(null);
const modalTitleId = `sbcnh-modal-${Math.random().toString(36).slice(2, 9)}`;

const aidSessionId = ref(0);
const aidPreferredClientId = ref(0);

/** When hub is opened without an event (e.g. dashboard program modal), user picks an event locally. */
const aidPickedEventId = ref(0);
const aidSessions = ref([]);
const aidClients = ref([]);
const aidEventTitle = ref('');
const aidContextLoading = ref(false);
const aidContextError = ref('');
const aidEventsLoading = ref(false);
const aidEventsError = ref('');
const aidEventOptions = ref([]);

/** By session tab: event pick when hub has no parent eventId */
const boardPickedEventId = ref(0);
const boardSessions = ref([]);
const boardSessionsLoading = ref(false);
const boardSessionsError = ref('');
const boardEventTitle = ref('');
const boardSelectedSessionId = ref(0);
const boardClients = ref([]);
const boardLoading = ref(false);
const boardError = ref('');
/** Filter session list in By session sidebar */
const boardSessionSearchQuery = ref('');
/** focus = this week + last week first, then past (new→old), then future (near→far); desc / asc = full list */
const boardSessionSortMode = ref('focus');

const modalPortalSessions = ref([]);
const modalPortalClients = ref([]);
const modalPortalEventTitle = ref('');
const modalPortalLoading = ref(false);

const parentEventId = computed(() => {
  const n = Number(props.eventId || 0);
  return n > 0 ? n : null;
});

const effectiveEventId = computed(() => {
  if (parentEventId.value) return parentEventId.value;
  const a = Number(aidPickedEventId.value || 0);
  return a > 0 ? a : null;
});

const effectiveSessions = computed(() => {
  if (parentEventId.value) return Array.isArray(props.sessions) ? props.sessions : [];
  return aidSessions.value;
});

const effectiveClients = computed(() => {
  if (parentEventId.value) return Array.isArray(props.clients) ? props.clients : [];
  return aidClients.value;
});

const effectiveEventTitleForAid = computed(() => {
  const t = String(props.eventTitle || '').trim();
  if (t) return t;
  return String(aidEventTitle.value || '').trim();
});

const boardEffectiveEventId = computed(() => {
  if (parentEventId.value) return parentEventId.value;
  const b = Number(boardPickedEventId.value || 0);
  return b > 0 ? b : null;
});

const boardEventTitleDisplay = computed(() => {
  const t = String(props.eventTitle || '').trim();
  if (t) return t;
  return String(boardEventTitle.value || '').trim();
});

function boardSessionYmd(s) {
  return String(s?.sessionDate || s?.session_date || '').slice(0, 10);
}

/** Monday-start week in local time */
function boardStartOfWeekMonday(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = dt.getDay();
  const mondayOffset = wd === 0 ? -6 : 1 - wd;
  dt.setDate(dt.getDate() + mondayOffset);
  return dt;
}

function boardYmdFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Inclusive YMD range: previous calendar week + current calendar week (Mon–Sun). */
function boardLastTwoWeeksWindow() {
  const today = new Date();
  const startThisWeek = boardStartOfWeekMonday(today);
  const startLastWeek = new Date(startThisWeek);
  startLastWeek.setDate(startLastWeek.getDate() - 7);
  const endThisWeek = new Date(startThisWeek);
  endThisWeek.setDate(endThisWeek.getDate() + 6);
  return { from: boardYmdFromDate(startLastWeek), to: boardYmdFromDate(endThisWeek) };
}

function boardSessionIsPast(s) {
  const y = boardSessionYmd(s);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(y)) return false;
  return y < ymdToday();
}

const boardSessionsForList = computed(() => {
  const raw = Array.isArray(boardSessions.value) ? [...boardSessions.value] : [];
  const q = boardSessionSearchQuery.value.trim().toLowerCase();
  const list = raw.filter((s) => {
    if (!q) return true;
    const y = boardSessionYmd(s);
    const label = defaultFormatSessionLabel(s).toLowerCase();
    return label.includes(q) || y.toLowerCase().includes(q) || String(s.id).includes(q);
  });

  const cmpYmd = (a, b) => boardSessionYmd(a).localeCompare(boardSessionYmd(b)) || Number(a.id) - Number(b.id);
  const cmpYmdDesc = (a, b) => -cmpYmd(a, b);

  const mode = boardSessionSortMode.value;
  if (mode === 'asc') {
    return list.sort(cmpYmd);
  }
  if (mode === 'desc') {
    return list.sort(cmpYmdDesc);
  }

  const { from: wFrom, to: wTo } = boardLastTwoWeeksWindow();
  const inTwoWeeks = (s) => {
    const y = boardSessionYmd(s);
    return /^\d{4}-\d{2}-\d{2}$/.test(y) && y >= wFrom && y <= wTo;
  };

  const priority = list.filter(inTwoWeeks).sort(cmpYmdDesc);
  const rest = list.filter((s) => !inTwoWeeks(s));
  const today = ymdToday();
  const pastRest = rest
    .filter((s) => {
      const y = boardSessionYmd(s);
      return /^\d{4}-\d{2}-\d{2}$/.test(y) && y < today;
    })
    .sort(cmpYmdDesc);
  const futureRest = rest
    .filter((s) => {
      const y = boardSessionYmd(s);
      return /^\d{4}-\d{2}-\d{2}$/.test(y) && y >= today;
    })
    .sort(cmpYmd);
  const undated = rest.filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(boardSessionYmd(s)));
  return [...priority, ...pastRest, ...futureRest, ...undated];
});

const contextLoading = computed(() => {
  if (!effectiveEventId.value) return false;
  if (parentEventId.value) {
    return !props.sessions?.length || !props.clients?.length;
  }
  return aidContextLoading.value;
});

const filters = ref({
  queueScope: 'due',
  statusFilter: 'pending',
  sortBy: 'sessionDate',
  sortDirDesc: false,
  includeAttendanceGaps: true
});

function orgSlug() {
  return (
    String(route.params?.organizationSlug || '').trim() ||
    String(agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || '').trim()
  );
}

function defaultFormatSessionLabel(s) {
  if (!s) return '';
  const raw = s.sessionDate || s.session_date;
  if (raw) return formatSessionDate(raw);
  return `Session #${s.id}`;
}

function defaultClientLabel(c) {
  return c?.initials || c?.identifier_code || String(c?.id || '');
}

const resolvedFormatSessionLabel = computed(() => props.formatSessionLabel || defaultFormatSessionLabel);
const resolvedClientLabel = computed(() => props.clientLabelForRow || defaultClientLabel);

/** Prefer portal-provided title; then fetched context; then queue / board row. */
const resolvedCompanyEventTitle = computed(() => {
  const fromPortal = String(props.eventTitle || '').trim();
  if (fromPortal) return fromPortal;
  const fromFetched = String(modalPortalEventTitle.value || '').trim();
  if (fromFetched) return fromFetched;
  return String(modalRow.value?.eventTitle || '').trim();
});

function formatSessionDate(raw) {
  if (!raw) return '—';
  try {
    const s = String(raw).slice(0, 10);
    const d = new Date(`${s}T12:00:00`);
    if (!Number.isFinite(d.getTime())) return String(raw);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(raw);
  }
}

function formatDt(raw) {
  try {
    if (!raw) return '—';
    return new Date(raw).toLocaleString();
  } catch {
    return '—';
  }
}

function statusLabel(row) {
  const s = String(row?.clientNoteStatus || '').toLowerCase();
  if (row?.rowKind === 'attendance_gap') return 'Note needed (no file yet)';
  if (s === 'completed') return 'Completed';
  if (s === 'missed') return 'Missed';
  return 'Note needed';
}

function clientDisplay(row) {
  const i = String(row?.clientInitials || '').trim();
  if (i) return i;
  const code = String(row?.clientIdentifierCode || '').trim();
  if (code) return code;
  return '—';
}

function isRowComplete(row) {
  const s = String(row?.clientNoteStatus || '').toLowerCase();
  return s === 'completed';
}

function rowKey(row) {
  if (row?.id != null) return `n-${row.id}`;
  return `g-${row.sessionId}-${row.clientId}`;
}

function sortHint(field) {
  if (filters.value.sortBy !== field) return '';
  return filters.value.sortDirDesc ? '▼' : '▲';
}

function toggleSort(field) {
  if (filters.value.sortBy === field) {
    filters.value.sortDirDesc = !filters.value.sortDirDesc;
  } else {
    filters.value.sortBy = field;
    filters.value.sortDirDesc = false;
  }
  void load();
}

const sessionFilterOptions = computed(() => {
  const m = new Map();
  for (const r of rows.value) {
    const sid = Number(r.sessionId);
    if (!sid) continue;
    const label = `${formatSessionDate(r.sessionDate)} · #${sid}`;
    if (!m.has(sid)) m.set(sid, { sessionId: sid, label });
  }
  return [...m.values()].sort((a, b) => a.sessionId - b.sessionId);
});

const filteredRows = computed(() => {
  let list = rows.value;
  const sf = sessionFilterId.value;
  if (sf != null && sf !== '') {
    list = list.filter((r) => Number(r.sessionId) === Number(sf));
  }
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((r) => {
    const blob = [
      r.eventTitle,
      clientDisplay(r),
      statusLabel(r),
      formatSessionDate(r.sessionDate),
      String(r.sessionId)
    ]
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  });
});

const modalSessions = computed(() => {
  const r = modalRow.value;
  if (!r) return [];
  const sid = Number(r.sessionId);
  const pool = modalPortalSessions.value.length ? modalPortalSessions.value : props.sessions || [];
  const fromPool = pool.filter((s) => Number(s.id) === sid);
  if (fromPool.length) return fromPool;
  const fromProps = (props.sessions || []).filter((s) => Number(s.id) === sid);
  if (fromProps.length) return fromProps;
  return [
    {
      id: sid,
      session_date: r.sessionDate,
      sessionDate: r.sessionDate
    }
  ];
});

const modalClients = computed(() => {
  const r = modalRow.value;
  if (!r) return [];
  if (modalPortalClients.value.length) return modalPortalClients.value;
  const cid = Number(r.clientId);
  const fromProps = (props.clients || []).filter((c) => Number(c.id) === cid);
  if (fromProps.length) return fromProps;
  return [
    {
      id: cid,
      initials: r.clientInitials || '',
      identifier_code: r.clientIdentifierCode || ''
    }
  ];
});

const modalHeaderClientLabel = computed(() => {
  const r = modalRow.value;
  if (!r) return '';
  const cid = Number(r.clientId);
  const fromProps = (props.clients || []).find((c) => Number(c.id) === cid);
  if (fromProps) return resolvedClientLabel.value(fromProps);
  const fromModal = modalClients.value.find((c) => Number(c.id) === cid);
  if (fromModal) return resolvedClientLabel.value(fromModal);
  return clientDisplay(r);
});

const modalTitle = computed(() => {
  const r = modalRow.value;
  if (!r) return 'Note';
  const action = isRowComplete(r) ? 'View note' : 'Complete note';
  const name = String(modalHeaderClientLabel.value || '').trim();
  if (name && name !== '—') return `${action} · ${name}`;
  return action;
});

function boardClientDisplay(c) {
  const i = String(c?.initials || '').trim();
  if (i) return i;
  const code = String(c?.identifierCode || c?.identifier_code || '').trim();
  if (code) return code;
  return '—';
}

function boardStatusLabel(c) {
  const s = String(c?.clientNoteStatus || '').toLowerCase();
  if (s === 'none' || !s) return 'No note filed';
  if (s === 'completed') return 'Completed';
  if (s === 'missed') return 'Missed';
  return 'Note needed';
}

function boardAttendanceLabel(c) {
  const a = c?.attendance;
  if (!a?.hasAttendance) return '—';
  if (a.checkInAt) return 'Checked in';
  return 'On file';
}

function boardClientComplete(c) {
  return String(c?.clientNoteStatus || '').toLowerCase() === 'completed';
}

function selectBoardSession(sessionId) {
  boardSelectedSessionId.value = Number(sessionId) || 0;
}

async function loadBoardEventSessions() {
  boardSessionsError.value = '';
  const eid = boardEffectiveEventId.value;
  if (!eid || !props.agencyId) {
    boardSessions.value = [];
    return;
  }
  if (parentEventId.value && Array.isArray(props.sessions) && props.sessions.length) {
    boardSessions.value = [...props.sessions];
    boardEventTitle.value = String(props.eventTitle || '').trim();
    return;
  }
  boardSessionsLoading.value = true;
  try {
    const detailRes = await api.get(`/skill-builders/events/${eid}/detail`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    const d = detailRes.data;
    boardEventTitle.value = d?.event?.title || '';

    const sg = d?.skillsGroup;
    /* ~8 weeks each way; list order uses “Recent focus” so far-future dates are not shown first */
    let from = ymdAddDays(ymdToday(), -56);
    let to = ymdAddDays(ymdToday(), 56);
    const sd = sg?.startDate != null ? String(sg.startDate).slice(0, 10) : '';
    const ed = sg?.endDate != null ? String(sg.endDate).slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(sd) && sd < from) from = sd;
    if (/^\d{4}-\d{2}-\d{2}$/.test(ed) && ed > to) to = ed;

    const sessRes = await api.get(`/skill-builders/events/${eid}/sessions`, {
      params: { agencyId: props.agencyId, from, to },
      skipGlobalLoading: true
    });
    boardSessions.value = Array.isArray(sessRes.data?.sessions) ? sessRes.data.sessions : [];
  } catch (e) {
    boardSessions.value = [];
    boardSessionsError.value = e.response?.data?.error?.message || e.message || 'Failed to load sessions';
  } finally {
    boardSessionsLoading.value = false;
  }
}

async function loadBoardForSession() {
  boardError.value = '';
  const eid = boardEffectiveEventId.value;
  const sid = Number(boardSelectedSessionId.value || 0);
  if (!eid || !sid || !props.agencyId) {
    boardClients.value = [];
    return;
  }
  boardLoading.value = true;
  try {
    const res = await api.get(`/skill-builders/events/${eid}/sessions/${sid}/clinical-notes-board`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    const title = String(res.data?.eventTitle || '').trim();
    if (title) boardEventTitle.value = title;
    boardClients.value = Array.isArray(res.data?.clients) ? res.data.clients : [];
  } catch (e) {
    boardClients.value = [];
    boardError.value = e.response?.data?.error?.message || e.message || 'Failed to load roster';
  } finally {
    boardLoading.value = false;
  }
}

function openBoardNoteModal(c) {
  const eid = boardEffectiveEventId.value;
  const sid = Number(boardSelectedSessionId.value || 0);
  if (!eid || !sid) return;
  const sess = boardSessions.value.find((s) => Number(s.id) === sid);
  const sd = sess?.sessionDate || sess?.session_date || null;
  const row = {
    id: c.noteId != null ? Number(c.noteId) : null,
    companyEventId: eid,
    sessionId: sid,
    clientId: Number(c.clientId),
    eventTitle: boardEventTitleDisplay.value,
    sessionDate: sd,
    updatedAt: c.noteUpdatedAt || null,
    clientInitials: c.initials || '',
    clientIdentifierCode: c.identifierCode || c.identifier_code || '',
    clientNoteStatus: String(c.clientNoteStatus || '').toLowerCase() === 'none' ? 'note_needed' : c.clientNoteStatus,
    rowKind: 'note'
  };
  void openNoteModal(row);
}

async function loadModalPortalContext(eventId) {
  const eid = Number(eventId || 0);
  if (!eid || !props.agencyId) return;
  const detailRes = await api.get(`/skill-builders/events/${eid}/detail`, {
    params: { agencyId: props.agencyId },
    skipGlobalLoading: true
  });
  const d = detailRes.data;
  modalPortalEventTitle.value = d?.event?.title || '';
  const clientsRaw = Array.isArray(d?.clients) ? d.clients : [];
  modalPortalClients.value = clientsRaw.map((c) => ({
    id: Number(c.id),
    initials: c.initials || '',
    identifier_code: c.identifierCode || c.identifier_code || ''
  }));

  const sg = d?.skillsGroup;
  let from = ymdAddDays(ymdToday(), -7);
  let to = ymdAddDays(ymdToday(), 365);
  const sd = sg?.startDate != null ? String(sg.startDate).slice(0, 10) : '';
  const ed = sg?.endDate != null ? String(sg.endDate).slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(sd) && sd < from) from = sd;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ed) && ed > to) to = ed;

  const sessRes = await api.get(`/skill-builders/events/${eid}/sessions`, {
    params: { agencyId: props.agencyId, from, to },
    skipGlobalLoading: true
  });
  modalPortalSessions.value = Array.isArray(sessRes.data?.sessions) ? sessRes.data.sessions : [];
}

watch(
  () => effectiveSessions.value,
  (list) => {
    if (!Array.isArray(list) || !list.length) {
      aidSessionId.value = 0;
      return;
    }
    const first = Number(list[0].id);
    if (!aidSessionId.value || !list.some((s) => Number(s.id) === Number(aidSessionId.value))) {
      aidSessionId.value = first;
    }
  },
  { immediate: true }
);

watch(
  () => effectiveClients.value,
  (list) => {
    if (!Array.isArray(list) || !list.length) {
      aidPreferredClientId.value = 0;
      return;
    }
    if (!aidPreferredClientId.value || !list.some((c) => Number(c.id) === Number(aidPreferredClientId.value))) {
      aidPreferredClientId.value = Number(list[0].id);
    }
  },
  { immediate: true }
);

watch(
  () => parentEventId.value,
  (p) => {
    if (p) {
      aidPickedEventId.value = 0;
      aidSessions.value = [];
      aidClients.value = [];
      aidEventTitle.value = '';
      boardPickedEventId.value = 0;
      boardSessions.value = [];
      boardSelectedSessionId.value = 0;
      boardClients.value = [];
      boardEventTitle.value = '';
      boardSessionsError.value = '';
    }
  }
);

watch(
  () => [hubMode.value, parentEventId.value],
  () => {
    if (!parentEventId.value && (hubMode.value === 'aid' || hubMode.value === 'bySession')) void loadAidEventOptions();
  },
  { immediate: true }
);

watch(
  () => [hubMode.value, boardEffectiveEventId.value],
  () => {
    if (hubMode.value !== 'bySession') return;
    const eid = boardEffectiveEventId.value;
    if (!eid || !props.agencyId) {
      boardSessions.value = [];
      boardSelectedSessionId.value = 0;
      boardClients.value = [];
      return;
    }
    void loadBoardEventSessions();
  },
  { immediate: true }
);

watch(
  () => [hubMode.value, boardSelectedSessionId.value, boardEffectiveEventId.value],
  () => {
    if (hubMode.value !== 'bySession') return;
    const sid = Number(boardSelectedSessionId.value || 0);
    if (!sid || !boardEffectiveEventId.value) {
      boardClients.value = [];
      return;
    }
    void loadBoardForSession();
  }
);

watch(
  () => boardEffectiveEventId.value,
  (eid, prev) => {
    boardSessionSearchQuery.value = '';
    if (prev != null && Number(eid || 0) !== Number(prev)) boardSelectedSessionId.value = 0;
  }
);

watch(
  () => [parentEventId.value, aidPickedEventId.value],
  () => {
    if (parentEventId.value) return;
    const id = Number(aidPickedEventId.value || 0);
    aidContextError.value = '';
    if (id > 0) void loadAidEventContext();
    else {
      aidSessions.value = [];
      aidClients.value = [];
      aidEventTitle.value = '';
    }
  }
);

function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ymdAddDays(ymd, delta) {
  const [y, mo, da] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (!Number.isFinite(dt.getTime())) return ymdToday();
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

async function loadProviderEventFallback() {
  aidEventsError.value = '';
  const [a, u] = await Promise.all([
    api.get('/skill-builders/me/assigned-events', { params: { agencyId: props.agencyId }, skipGlobalLoading: true }),
    api.get('/skill-builders/me/upcoming-events', { params: { agencyId: props.agencyId }, skipGlobalLoading: true })
  ]);
  const m = new Map();
  for (const ev of [...(a.data?.events || []), ...(u.data?.events || [])]) {
    const id = Number(ev.id);
    if (id && !m.has(id)) {
      m.set(id, {
        companyEventId: id,
        label: `${ev.title || 'Event'}${ev.schoolName ? ` · ${ev.schoolName}` : ''}`
      });
    }
  }
  aidEventOptions.value = [...m.values()];
}

async function loadAidEventOptions() {
  if (!props.agencyId || parentEventId.value) return;
  aidEventsLoading.value = true;
  aidEventsError.value = '';
  try {
    const res = await api.get('/skill-builders/coordinator/company-events-search', {
      params: { agencyId: props.agencyId, q: '' },
      skipGlobalLoading: true
    });
    const events = Array.isArray(res.data?.events) ? res.data.events : [];
    aidEventOptions.value = events.map((e) => ({
      companyEventId: Number(e.companyEventId),
      label: `${e.title || 'Event'}${e.schoolName ? ` · ${e.schoolName}` : ''}`
    }));
    if (!aidEventOptions.value.length) await loadProviderEventFallback();
  } catch {
    try {
      await loadProviderEventFallback();
    } catch (e2) {
      aidEventsError.value = e2.response?.data?.error?.message || e2.message || 'Could not load events';
      aidEventOptions.value = [];
    }
  } finally {
    aidEventsLoading.value = false;
  }
}

async function loadAidEventContext() {
  aidContextError.value = '';
  if (parentEventId.value) return;
  const eid = Number(aidPickedEventId.value || 0);
  if (!eid || !props.agencyId) {
    aidSessions.value = [];
    aidClients.value = [];
    return;
  }
  aidContextLoading.value = true;
  try {
    const detailRes = await api.get(`/skill-builders/events/${eid}/detail`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    const d = detailRes.data;
    aidEventTitle.value = d?.event?.title || '';
    const clientsRaw = Array.isArray(d?.clients) ? d.clients : [];
    aidClients.value = clientsRaw.map((c) => ({
      id: Number(c.id),
      initials: c.initials || '',
      identifier_code: c.identifierCode || c.identifier_code || ''
    }));

    const sg = d?.skillsGroup;
    let from = ymdAddDays(ymdToday(), -7);
    let to = ymdAddDays(ymdToday(), 365);
    const sd = sg?.startDate != null ? String(sg.startDate).slice(0, 10) : '';
    const ed = sg?.endDate != null ? String(sg.endDate).slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(sd) && sd < from) from = sd;
    if (/^\d{4}-\d{2}-\d{2}$/.test(ed) && ed > to) to = ed;

    const sessRes = await api.get(`/skill-builders/events/${eid}/sessions`, {
      params: { agencyId: props.agencyId, from, to },
      skipGlobalLoading: true
    });
    aidSessions.value = Array.isArray(sessRes.data?.sessions) ? sessRes.data.sessions : [];
  } catch (e) {
    aidSessions.value = [];
    aidClients.value = [];
    aidContextError.value = e.response?.data?.error?.message || e.message || 'Failed to load event';
  } finally {
    aidContextLoading.value = false;
  }
}

function onAidRefreshSessions() {
  if (parentEventId.value) emit('refresh-sessions');
  else void loadAidEventContext();
}

async function load() {
  if (!props.agencyId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/skill-builders/me/clinical-notes', {
      params: {
        agencyId: props.agencyId,
        limit: 500,
        queueScope: filters.value.queueScope,
        statusFilter: filters.value.statusFilter,
        sortBy: filters.value.sortBy,
        sortDir: filters.value.sortDirDesc ? 'desc' : 'asc',
        includeAttendanceGaps: filters.value.includeAttendanceGaps ? '1' : '0',
        ...(props.eventId ? { eventId: props.eventId } : {})
      },
      skipGlobalLoading: true
    });
    rows.value = Array.isArray(res.data?.notes) ? res.data.notes : [];
  } catch (e) {
    rows.value = [];
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
}

async function openNoteModal(row) {
  modalRow.value = row;
  modalOpen.value = true;
  modalPortalLoading.value = true;
  modalPortalSessions.value = [];
  modalPortalClients.value = [];
  modalPortalEventTitle.value = '';
  try {
    const eid = Number(row?.companyEventId || 0);
    const samePortal =
      parentEventId.value &&
      Number(parentEventId.value) === eid &&
      Array.isArray(props.sessions) &&
      props.sessions.length &&
      Array.isArray(props.clients) &&
      props.clients.length;
    if (samePortal) {
      modalPortalSessions.value = [...props.sessions];
      modalPortalClients.value = (props.clients || []).map((c) => ({
        id: Number(c.id),
        initials: c.initials || '',
        identifier_code: c.identifier_code || c.identifierCode || ''
      }));
      modalPortalEventTitle.value = String(props.eventTitle || '').trim();
    } else if (eid && props.agencyId) {
      await loadModalPortalContext(eid);
    }
  } catch {
    const r = row;
    modalPortalSessions.value = [
      {
        id: Number(r.sessionId),
        session_date: r.sessionDate,
        sessionDate: r.sessionDate
      }
    ];
    modalPortalClients.value = [
      {
        id: Number(r.clientId),
        initials: r.clientInitials || '',
        identifier_code: r.clientIdentifierCode || ''
      }
    ];
    modalPortalEventTitle.value = String(r.eventTitle || '').trim();
  } finally {
    modalPortalLoading.value = false;
  }

  const fromRow = String(row?.programPortalSlug || '').trim().toLowerCase();
  const slug = fromRow || orgSlug();
  const eid = Number(row?.companyEventId || 0);
  const sid = Number(row?.sessionId || 0);
  const cid = Number(row?.clientId || 0);
  if (!slug || !eid || !sid || !cid) return;
  const path = `/${slug}/skill-builders/event/${eid}`;
  const q = {
    ...route.query,
    section: 'clinical_notes',
    sessionId: String(sid),
    clinicalClientId: String(cid)
  };
  const cur = route.path.replace(/\/$/, '');
  const target = path.replace(/\/$/, '');
  if (cur === target) {
    router.replace({ path, query: q });
  }
  nextTick(() => {
    document.querySelector('.sbcnh-modal-body')?.scrollTo?.(0, 0);
  });
}

function closeModal() {
  modalOpen.value = false;
  modalRow.value = null;
  modalPortalSessions.value = [];
  modalPortalClients.value = [];
  modalPortalEventTitle.value = '';
  modalPortalLoading.value = false;
  const next = { ...route.query };
  delete next.sessionId;
  delete next.clinicalClientId;
  router.replace({ path: route.path, query: next });
}

function onModalRefresh() {
  void load();
  if (hubMode.value === 'bySession') void loadBoardForSession();
  emit('refresh-sessions');
}

async function onModalNoteCompleted() {
  await load();
  if (hubMode.value === 'bySession') void loadBoardForSession();
  emit('refresh-sessions');
  const r = modalRow.value;
  if (!r) return;
  const updated = rows.value.find(
    (x) => Number(x.sessionId) === Number(r.sessionId) && Number(x.clientId) === Number(r.clientId)
  );
  if (updated) modalRow.value = updated;
}

function queryOne(key) {
  const raw = route.query[key];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(String(v || ''), 10);
}

function syncModalFromRoute() {
  if (!props.eventId) return;
  const pathEventId = parseInt(String(route.params.eventId || ''), 10);
  if (Number.isFinite(pathEventId) && pathEventId > 0 && pathEventId !== Number(props.eventId)) return;
  const sid = queryOne('sessionId');
  const cid = queryOne('clinicalClientId');
  if (sid <= 0 || cid <= 0) return;
  const r = rows.value.find((x) => Number(x.sessionId) === sid && Number(x.clientId) === cid);
  modalRow.value =
    r ||
    ({
      companyEventId: props.eventId,
      sessionId: sid,
      clientId: cid,
      eventTitle: '',
      sessionDate: null,
      clientNoteStatus: 'note_needed',
      rowKind: 'note',
      clientInitials: '',
      clientIdentifierCode: ''
    });
  modalOpen.value = true;
}

watch(
  () => [props.agencyId, props.eventId],
  () => {
    void load();
  },
  { immediate: true }
);

watch(
  () => [route.query.sessionId, route.query.clinicalClientId, props.eventId, rows.value.length],
  () => {
    if (!props.eventId) return;
    const sid = queryOne('sessionId');
    const cid = queryOne('clinicalClientId');
    if (sid > 0 && cid > 0) {
      syncModalFromRoute();
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.sbcnh {
  text-align: left;
}
.sbcnh-intro {
  margin: 10px 0 12px;
  line-height: 1.45;
}
.sbcnh-mode-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  padding: 4px;
  border-radius: 12px;
  background: var(--surface-muted, #f1f5f9);
  border: 1px solid var(--border, #e2e8f0);
}
.sbcnh-mode-btn {
  flex: 1 1 140px;
  min-height: 40px;
  padding: 8px 14px;
  border: none;
  border-radius: 10px;
  background: transparent;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.sbcnh-mode-btn:hover {
  color: var(--text-primary, #0f172a);
  background: rgba(255, 255, 255, 0.7);
}
.sbcnh-mode-btn--active {
  background: #fff;
  color: var(--primary, #0f766e);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
.sbcnh-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: flex-end;
  margin: 12px 0 8px;
}
.sbcnh-field-grow {
  flex: 1 1 200px;
  min-width: 180px;
}
.sbcnh-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.sbcnh-field-label {
  color: var(--muted, #6b7280);
  font-weight: 500;
}
.sbcnh-field-inline {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.sbcnh-search {
  width: 100%;
}
.sbcnh-th {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  color: inherit;
  text-align: left;
}
.sbcnh-th:hover {
  text-decoration: underline;
}
.sbcnh-table-wrap {
  overflow: auto;
  margin-top: 8px;
  border-radius: 12px;
  border: 1px solid var(--border, #e5e7eb);
  background: #fff;
}
.sbcnh-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.sbcnh-table th,
.sbcnh-table td {
  border-bottom: 1px solid var(--border, #e5e7eb);
  padding: 10px 12px;
  text-align: left;
  vertical-align: middle;
}
.sbcnh-col-action {
  min-width: 160px;
  white-space: nowrap;
}
.sbcnh-tr--complete {
  background: linear-gradient(90deg, rgba(15, 118, 110, 0.06) 0%, transparent 100%);
}
.sbcnh-action-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.sbcnh-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sbcnh-pill--done {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #6ee7b7;
}
.sbcnh-btn-complete {
  background: var(--primary, #0f766e) !important;
  border-color: var(--primary, #0f766e) !important;
  color: #fff !important;
  font-weight: 600;
}
.sbcnh-btn-complete:hover {
  filter: brightness(1.05);
}
.sbcnh-btn-view {
  background: #fff !important;
  border: 1px solid var(--primary, #0f766e) !important;
  color: var(--primary, #0f766e) !important;
  font-weight: 600;
}
.sbcnh-btn-view:hover {
  background: rgba(15, 118, 110, 0.08) !important;
}
.sbcnh-board-panel {
  margin-top: 8px;
}
.sbcnh-board-layout {
  display: grid;
  grid-template-columns: minmax(200px, 260px) 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 720px) {
  .sbcnh-board-layout {
    grid-template-columns: 1fr;
  }
}
.sbcnh-board-sessions {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  background: #f8fafc;
  padding: 10px 10px 12px;
  max-height: min(420px, 55vh);
  overflow: auto;
}
.sbcnh-board-side-title {
  margin: 0 0 4px;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  line-height: 1.3;
}
.sbcnh-board-side-hint {
  margin: 0 0 8px;
}
.sbcnh-board-session-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}
.sbcnh-board-search,
.sbcnh-board-sort {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
}
.sbcnh-board-search-label,
.sbcnh-board-sort-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary, #64748b);
}
.sbcnh-board-no-match {
  margin: 8px 0 0;
}
.sbcnh-board-session-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sbcnh-board-session-btn {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--text-primary, #0f172a);
}
.sbcnh-board-session-btn:hover {
  border-color: var(--primary, #0f766e);
  background: rgba(15, 118, 110, 0.04);
}
.sbcnh-board-session-btn--active {
  border-color: var(--primary, #0f766e);
  background: rgba(15, 118, 110, 0.1);
  font-weight: 600;
}
.sbcnh-board-session-btn--past:not(.sbcnh-board-session-btn--active) {
  background: #e2e8f0;
  border-color: #94a3b8;
  color: #334155;
}
.sbcnh-board-session-btn--past:not(.sbcnh-board-session-btn--active):hover {
  background: #cbd5e1;
  border-color: #64748b;
}
.sbcnh-board-main {
  min-width: 0;
}
.sbcnh-board-placeholder {
  padding: 16px;
  border-radius: 12px;
  border: 1px dashed var(--border, #cbd5e1);
  background: #f8fafc;
}
.sbcnh-board-table {
  margin-top: 0;
}
.sbcnh-aid-panel {
  margin-top: 8px;
}
.sbcnh-aid-event-row {
  margin-bottom: 12px;
}
.sbcnh-aid-event-row .sbcnh-field {
  margin-bottom: 0;
}
.sbcnh-aid-events-err {
  margin: 6px 0 0;
  font-size: 0.9rem;
}
.sbcnh-aid-placeholder {
  padding: 16px;
  border-radius: 12px;
  border: 1px dashed var(--border, #cbd5e1);
  background: #f8fafc;
}
/* Above ProgramHubModal overlay (1500) and typical dashboard modals; below copy-toast (10050). */
.sbcnh-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 16px;
  overflow: auto;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
}
.sbcnh-modal {
  width: min(720px, 100%);
  margin-bottom: 48px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.2);
  border: 1px solid var(--border, #e2e8f0);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
}
.sbcnh-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  flex-shrink: 0;
}
.sbcnh-modal-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-primary, #0f172a);
}
.sbcnh-modal-close {
  flex-shrink: 0;
}
.sbcnh-modal-body {
  padding: 10px 14px 14px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
</style>
