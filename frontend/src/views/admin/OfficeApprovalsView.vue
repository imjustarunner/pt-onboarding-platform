<template>
  <div class="oa-page">
    <header class="oa-header">
      <div>
        <h1 class="oa-title">Office Approvals</h1>
        <p class="oa-subtitle">Review and approve office requests.</p>
      </div>
      <div class="oa-header-actions">
        <router-link class="btn btn-secondary btn-sm" :to="scheduleHubTo">Schedule hub</router-link>
        <router-link class="btn btn-secondary btn-sm" :to="myScheduleTo">My Schedule</router-link>
        <button type="button" class="btn btn-primary btn-sm" :disabled="loading" @click="refresh">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div class="oa-tabs" role="tablist">
      <button
        type="button"
        class="oa-tab"
        :class="{ active: tab === 'requests' }"
        role="tab"
        :aria-selected="tab === 'requests'"
        @click="tab = 'requests'"
      >
        Office Requests
        <span v-if="officeRequests.length" class="oa-badge">{{ officeRequests.length }}</span>
      </button>
      <button
        type="button"
        class="oa-tab"
        :class="{ active: tab === 'conflicts' }"
        role="tab"
        :aria-selected="tab === 'conflicts'"
        @click="tab = 'conflicts'"
      >
        Reported Conflicts
        <span v-if="conflictCount > 0" class="oa-badge danger">{{ conflictCount }}</span>
      </button>
    </div>

    <template v-if="tab === 'requests'">
      <div v-if="error" class="oa-error">{{ error }}</div>
      <div v-else-if="loading && !officeRequests.length" class="oa-empty">Loading office requests…</div>
      <div v-else-if="!officeRequests.length" class="oa-empty">
        <div class="oa-empty-title">No pending office requests</div>
        <p class="muted">New room / availability requests from providers will show up here.</p>
      </div>

      <div v-else class="oa-workspace">
        <!-- Left: pending queue -->
        <aside class="oa-col oa-queue">
          <div class="oa-panel-head">
            <div class="oa-panel-title-row">
              <h2>Pending Office Requests</h2>
              <span class="oa-badge danger">{{ filteredRequests.length }}</span>
            </div>
            <p class="oa-scope-note">
              Showing requests across all tenants you can access
              <template v-if="agencyCountLabel"> ({{ agencyCountLabel }})</template>.
            </p>
            <div class="oa-queue-tools">
              <select v-model="filterOfficeId" class="oa-filter" aria-label="Filter by office">
                <option value="">All offices</option>
                <option
                  v-for="o in officeFilterOptions"
                  :key="o.id"
                  :value="String(o.id)"
                >
                  {{ o.name }} ({{ o.count }})
                </option>
              </select>
              <input
                v-model="searchQuery"
                type="search"
                class="oa-search"
                placeholder="Search by name or tenant…"
                aria-label="Search pending requests"
              />
              <select v-model="filterRecurrence" class="oa-filter" aria-label="Filter by recurrence">
                <option value="">All recurrence</option>
                <option value="ONCE">One-time</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
          </div>

          <div class="oa-queue-list">
            <template v-for="group in pagedGroupedRequests" :key="group.key">
              <div class="oa-office-group-label">
                <span>{{ group.label }}</span>
                <span class="oa-badge">{{ group.requests.length }}</span>
              </div>
              <button
                v-for="r in group.requests"
                :key="r.id"
                type="button"
                class="oa-request-card"
                :class="{ selected: selectedId === r.id }"
                @click="selectRequest(r.id)"
              >
                <div class="oa-avatar" :style="{ background: avatarColor(r.providerName) }">
                  {{ initials(r.providerName) }}
                </div>
                <div class="oa-request-main">
                  <div class="oa-request-name">{{ r.providerName || 'Provider' }}</div>
                  <div class="oa-request-meta">
                    REQ-{{ r.id }}
                    <template v-if="r.agencyName"> · {{ r.agencyName }}</template>
                  </div>
                  <div class="oa-request-meta">
                    {{ requestDateLabel(r) }} · {{ slotTimeOnly(r) }}
                  </div>
                  <div class="oa-request-meta">
                    {{ requestedRecurrenceLabel(r)
                    }}<template v-if="requestRoomLabel(r)"> · {{ requestRoomLabel(r) }}</template>
                  </div>
                </div>
                <span class="oa-status-pill">Pending</span>
              </button>
            </template>
          </div>

          <div class="oa-queue-footer">
            <span class="muted">
              Showing {{ pageRange.start }}–{{ pageRange.end }} of {{ filteredRequests.length }}
            </span>
            <div class="oa-pager">
              <button type="button" class="oa-page-btn" :disabled="page <= 1" @click="page -= 1">‹</button>
              <button
                v-for="p in pageNumbers"
                :key="p"
                type="button"
                class="oa-page-btn"
                :class="{ active: p === page }"
                @click="page = p"
              >
                {{ p }}
              </button>
              <button
                type="button"
                class="oa-page-btn"
                :disabled="page >= totalPages"
                @click="page += 1"
              >
                ›
              </button>
            </div>
          </div>
          <p class="oa-tz-note">All times are shown in your local timezone ({{ localTz }}).</p>
        </aside>

        <!-- Center: summary + day schedule -->
        <section v-if="selected" class="oa-col oa-center">
          <div class="oa-summary-card">
            <div class="oa-summary-top">
              <div>
                <h2>{{ selected.providerName }}</h2>
                <span class="oa-status-pill pending">Pending approval</span>
              </div>
              <div class="oa-detail-actions">
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="saving || assignIncomplete"
                  @click="approveSelected"
                >
                  {{ saving ? 'Saving…' : 'Approve' }}
                </button>
                <button type="button" class="btn btn-secondary" :disabled="saving" @click="denySelected">
                  Deny
                </button>
              </div>
            </div>

            <dl class="oa-dl">
              <div><dt>Request ID</dt><dd>REQ-{{ selected.id }}</dd></div>
              <div><dt>Recurrence</dt><dd>{{ requestedRecurrenceLabel(selected) }}</dd></div>
              <div><dt>Requested on</dt><dd>{{ fmtDateTime(selected.createdAt) || '—' }}</dd></div>
              <div><dt>Date</dt><dd>{{ requestDateLabel(selected) }}</dd></div>
              <div><dt>Time slot</dt><dd>{{ slotTimeOnly(selected) }}</dd></div>
              <div>
                <dt>Requested office</dt>
                <dd>
                  <strong>{{ requestOfficeLabel(selected) }}</strong>
                  <template v-if="requestRoomLabel(selected)"> · {{ requestRoomLabel(selected) }}</template>
                </dd>
              </div>
              <div v-if="selected.agencyName"><dt>Tenant</dt><dd>{{ selected.agencyName }}</dd></div>
              <div><dt>Approve as</dt><dd>{{ assignDisplay.office }} · {{ assignDisplay.room }}</dd></div>
              <div v-if="selected.notes"><dt>Notes</dt><dd>{{ selected.notes }}</dd></div>
            </dl>
            <p v-if="assignIncomplete" class="oa-hint warn">
              Pick an available office/room on the right to complete approval.
            </p>
            <p v-if="actionError" class="oa-error">{{ actionError }}</p>
          </div>

          <div class="oa-schedule-card">
            <div class="oa-schedule-head">
              <div>
                <h3>{{ scheduleOfficeTitle }}</h3>
                <p class="muted">
                  Showing
                  <strong>{{ scheduleRoomFilterLabel }}</strong>
                  — employee, time, and recurrence only.
                </p>
              </div>
              <div class="oa-date-nav">
                <select
                  v-if="scheduleRooms.length"
                  v-model="scheduleRoomFilter"
                  class="oa-filter"
                  aria-label="Filter schedule by room"
                >
                  <option value="">All rooms (stacked lanes)</option>
                  <option
                    v-for="room in scheduleRooms"
                    :key="room.id"
                    :value="String(room.id)"
                  >
                    {{ roomDisplay(room) }}
                  </option>
                </select>
                <button type="button" class="oa-page-btn" @click="shiftScheduleDate(-1)" aria-label="Previous day">‹</button>
                <input v-model="scheduleDate" type="date" class="oa-date-input" @change="onScheduleDateChange" />
                <button type="button" class="oa-page-btn" @click="shiftScheduleDate(1)" aria-label="Next day">›</button>
                <button
                  v-if="scheduleDate !== requestTargetDate"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="resetScheduleDate"
                >
                  Request day
                </button>
              </div>
            </div>

            <div v-if="!scheduleOfficeId" class="oa-empty-inline">
              Select or assign an office to load the daily schedule.
            </div>
            <div v-else-if="scheduleLoading" class="oa-empty-inline">Loading schedule…</div>
            <div v-else-if="scheduleError" class="oa-hint warn">{{ scheduleError }}</div>
            <div v-else class="oa-day-timeline">
              <div class="oa-day-rail" aria-hidden="true">
                <div v-for="hour in timelineHours" :key="`label-${hour}`" class="oa-hour-label">
                  {{ hourLabel(hour) }}
                </div>
              </div>
              <div
                class="oa-day-canvas"
                :style="{ height: `${timelineHours.length * HOUR_PX}px` }"
              >
                <div
                  v-for="hour in timelineHours"
                  :key="`grid-${hour}`"
                  class="oa-hour-gridline"
                />
                <div
                  v-for="(block, idx) in dayBlocks"
                  :key="block.key"
                  class="oa-block"
                  :class="[block.tone, { pending: block.pending }]"
                  :style="blockStyle(block, idx)"
                  :title="block.title"
                >
                  <div class="oa-block-name">{{ block.name }}</div>
                  <div class="oa-block-meta">
                    {{ hourLabel(block.startHour) }}–{{ hourLabel(block.endHour) }}
                    <span v-if="block.recurrence"> · {{ block.recurrence }}</span>
                  </div>
                  <span v-if="block.pending" class="oa-block-pending">Pending</span>
                </div>
                <div v-if="!dayBlocks.length" class="oa-day-empty">
                  No existing bookings on this day.
                </div>
              </div>
            </div>
          </div>
        </section>

        <div v-else class="oa-col oa-center oa-empty">Select a request to review.</div>

        <!-- Right: requested + alternatives -->
        <aside class="oa-col oa-alts">
          <div class="oa-avail-banner" :class="{ empty: availableOfficeCount === 0 }">
            <strong>
              {{ availableOfficeCount }} of {{ totalOfficeCount }}
              {{ totalOfficeCount === 1 ? 'office' : 'offices' }} with open rooms
            </strong>
            <span v-if="totalOfficeCount > 0">
              ({{ availabilityPct }}% · {{ availableRoomCount }} open room{{ availableRoomCount === 1 ? '' : 's' }})
            </span>
          </div>

          <div v-if="requestedAssignment" class="oa-requested-card">
            <div class="oa-alt-top">
              <div class="oa-alt-name">{{ requestedAssignment.officeName || 'Requested office' }}</div>
              <span class="oa-alt-tag" :class="requestedAssignment.isAvailableNow ? 'available' : 'selected'">
                {{ requestedAssignment.isAvailableNow ? 'Open' : 'Requested' }}
              </span>
            </div>
            <div class="oa-alt-room">{{ requestedAssignment.roomLabel || 'Room' }}</div>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :class="{ active: isRequestedSelected }"
              @click="pickRequested"
            >
              {{ isRequestedSelected ? 'Selected for approval' : 'Use requested room' }}
            </button>
          </div>

          <p v-if="assignOptionsLoading" class="muted">Checking availability…</p>
          <p v-else-if="assignOptionsError" class="oa-hint warn">{{ assignOptionsError }}</p>
          <p v-else-if="!assignOptions.length && !unavailableOffices.length" class="muted">
            {{ assignOptionsEmptyMessage }}
          </p>
          <p v-else class="oa-alts-heading">Other available rooms</p>

          <div class="oa-alt-list">
            <button
              v-for="opt in visibleAvailableRooms"
              :key="`avail-${opt.officeId}-${opt.roomId}`"
              type="button"
              class="oa-alt-card available"
              :class="{ selected: isSelectedOption(opt) }"
              @click="pickOption(opt)"
            >
              <div class="oa-alt-top">
                <div class="oa-alt-name">{{ opt.officeName }}</div>
                <span class="oa-alt-tag available">Available</span>
              </div>
              <div class="oa-alt-room">{{ opt.roomLabel }}</div>
            </button>

            <div
              v-for="office in visibleUnavailableOffices"
              :key="`unavail-${office.officeId}`"
              class="oa-alt-card unavailable"
            >
              <div class="oa-alt-top">
                <div class="oa-alt-name">{{ office.officeName }}</div>
                <span class="oa-alt-tag unavailable">Unavailable</span>
              </div>
              <div class="oa-alt-room">No open room for this slot</div>
            </div>
          </div>

          <button
            v-if="altsExpanded || hiddenAltCount > 0"
            type="button"
            class="btn btn-secondary btn-sm oa-view-all"
            @click="altsExpanded = !altsExpanded"
          >
            {{ altsExpanded ? 'Show fewer' : `View all alternatives (${altTotalCount})` }}
          </button>
        </aside>
      </div>
    </template>

    <div v-if="tab === 'conflicts'" class="oa-conflicts-wrap">
      <OfficeCoverageFlagsView ref="conflictsViewRef" embedded @count-change="onConflictCount" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import OfficeCoverageFlagsView from './OfficeCoverageFlagsView.vue';

const PAGE_SIZE = 6;
const ALT_PREVIEW = 7;
const HOUR_PX = 52;

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const tab = ref(String(route.query.tab || 'requests').toLowerCase() === 'conflicts' ? 'conflicts' : 'requests');
const selectedAgencyId = ref(null);
const officeRequests = ref([]);
const offices = ref([]);
const selectedId = ref(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const actionError = ref('');
const conflictCount = ref(0);
const conflictsViewRef = ref(null);

const searchQuery = ref('');
const filterRecurrence = ref('');
const filterOfficeId = ref('');
const page = ref(1);
const altsExpanded = ref(false);

const assignForm = ref({ officeId: '', roomId: '', slotKey: '', roomLabel: '' });
const assignOptions = ref([]);
const assignSummary = ref(null);
const assignOptionsLoading = ref(false);
const assignOptionsError = ref('');
const providerSpecifiedRoom = ref(false);
const requestedAssignment = ref(null);
const unavailableFromApi = ref([]);

const scheduleDate = ref('');
const scheduleLoading = ref(false);
const scheduleError = ref('');
const scheduleGrid = ref(null);
const scheduleRooms = ref([]);
const scheduleRoomFilter = ref('');

const orgSlug = computed(() =>
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : ''
);
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);
const scheduleHubTo = computed(() => orgTo('/schedule'));
const myScheduleTo = computed(() => orgTo('/my-schedule'));
const localTz = computed(() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    return 'local';
  }
});

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');
const agencies = computed(() => {
  const list = isSuperAdmin.value ? agencyStore.agencies || [] : agencyStore.userAgencies || [];
  return (list || []).filter((a) =>
    ['agency', 'life_coach', 'consultant'].includes(String(a?.organization_type || 'agency').toLowerCase())
  );
});
const shouldShowAgencySelector = computed(
  () => agencies.value.length > 1 && !agencyStore.hasSingleTenantAssociation?.value
);
const agencyId = computed(() => Number(selectedAgencyId.value || agencyStore.currentAgency?.id || 0) || null);

const selected = computed(() => officeRequests.value.find((r) => r.id === selectedId.value) || null);

const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
];
const weekdayLabel = (n) => weekdays.find((d) => d.value === Number(n))?.label || String(n);
const hourLabel = (h) => {
  const d = new Date();
  d.setHours(Number(h), 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
};
const fmtDate = (ymd) => {
  if (!ymd) return '';
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(ymd);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtDateTime = (raw) => {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};
const todayYmd = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const firstOnOrAfterWeekday = (startYmd, weekday) => {
  const d = new Date(`${String(startYmd).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return todayYmd();
  const delta = (Number(weekday) - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const mondayWeekStart = (ymd) => {
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const addDaysYmd = (ymd, delta) => {
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const officeName = (id) => {
  const o = (offices.value || []).find((x) => Number(x.id) === Number(id));
  return o?.name || (id ? `Office #${id}` : 'Any');
};

const firstSlot = (r) => (Array.isArray(r?.slots) && r.slots.length ? r.slots[0] : null);

const requestOfficeId = (r) => {
  if (r?.officeLocationId) return Number(r.officeLocationId) || null;
  const slot = firstSlot(r);
  if (slot?.officeLocationId) return Number(slot.officeLocationId) || null;
  const ids = Array.isArray(r?.preferredOfficeIds) ? r.preferredOfficeIds : [];
  if (ids.length) return Number(ids[0]) || null;
  return null;
};
const requestOfficeLabel = (r) => {
  if (r?.officeName) return r.officeName;
  const slot = firstSlot(r);
  if (slot?.officeName) return slot.officeName;
  const id = requestOfficeId(r);
  if (id) return officeName(id);
  return 'Unspecified office';
};
const requestAgencyId = (r) => Number(r?.agencyId || agencyId.value || 0) || null;
const requestRoomLabel = (r) => {
  const slot = firstSlot(r);
  if (slot?.roomLabel) return slot.roomLabel;
  if (slot?.roomId) return `Room ${slot.roomId}`;
  return '';
};
const roomDisplay = (room) =>
  room?.label || room?.name || (room?.roomNumber ? `#${room.roomNumber}` : `Room ${room?.id}`);

const requestedRecurrenceLabel = (r) => {
  const f = String(r?.requestedFrequency || 'ONCE').toUpperCase();
  if (f === 'WEEKLY') return 'Weekly';
  if (f === 'BIWEEKLY') return 'Biweekly';
  if (f === 'MONTHLY') return 'Monthly';
  return 'One-time';
};

const requestTargetDate = computed(() => {
  const r = selected.value;
  if (!r) return todayYmd();
  const slot = firstSlot(r);
  const start = String(r.requestedStartDate || todayYmd()).slice(0, 10);
  if (!slot || !Number.isFinite(Number(slot.weekday))) return start;
  return firstOnOrAfterWeekday(start, Number(slot.weekday));
});

const requestDateLabel = (r) => {
  const slot = firstSlot(r);
  const start = String(r?.requestedStartDate || todayYmd()).slice(0, 10);
  if (!slot || !Number.isFinite(Number(slot.weekday))) return fmtDate(start) || 'Not specified';
  return fmtDate(firstOnOrAfterWeekday(start, Number(slot.weekday)));
};

const slotTimeOnly = (r) => {
  const slot = firstSlot(r);
  if (!slot) return 'No time window';
  return `${hourLabel(slot.startHour)}–${hourLabel(slot.endHour)}`;
};

const initials = (name) => {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
};

const avatarColor = (name) => {
  const colors = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#047857'];
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
};

const officeFilterOptions = computed(() => {
  const counts = new Map();
  for (const r of officeRequests.value || []) {
    const id = requestOfficeId(r);
    const key = id ? String(id) : 'none';
    const name = requestOfficeLabel(r);
    const prev = counts.get(key) || { id: key, name, count: 0 };
    prev.count += 1;
    counts.set(key, prev);
  }
  return [...counts.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
});

const agencyCountLabel = computed(() => {
  const names = new Set(
    (officeRequests.value || []).map((r) => r.agencyName || `Agency ${r.agencyId}`).filter(Boolean)
  );
  if (names.size <= 1) return names.size === 1 ? [...names][0] : '';
  return `${names.size} tenants`;
});

const filteredRequests = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const freq = String(filterRecurrence.value || '').toUpperCase();
  const officeKey = String(filterOfficeId.value || '');
  return (officeRequests.value || []).filter((r) => {
    if (freq && String(r.requestedFrequency || 'ONCE').toUpperCase() !== freq) return false;
    if (officeKey) {
      const id = requestOfficeId(r);
      const key = id ? String(id) : 'none';
      if (key !== officeKey) return false;
    }
    if (!q) return true;
    const hay = [
      r.providerName,
      r.agencyName,
      requestOfficeLabel(r),
      requestRoomLabel(r),
      String(r.id)
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRequests.value.length / PAGE_SIZE)));
const pageRange = computed(() => {
  if (!filteredRequests.value.length) return { start: 0, end: 0 };
  const start = (page.value - 1) * PAGE_SIZE + 1;
  const end = Math.min(page.value * PAGE_SIZE, filteredRequests.value.length);
  return { start, end };
});
const pageNumbers = computed(() => {
  const total = totalPages.value;
  const cur = page.value;
  const nums = [];
  for (let p = Math.max(1, cur - 2); p <= Math.min(total, cur + 2); p += 1) nums.push(p);
  return nums;
});

/** Flatten grouped list into page-sized slices while keeping group headers. */
const pagedGroupedRequests = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  const slice = filteredRequests.value.slice(start, start + PAGE_SIZE);
  const groups = new Map();
  for (const r of slice) {
    const id = requestOfficeId(r);
    const key = id ? String(id) : 'none';
    if (!groups.has(key)) {
      groups.set(key, { key, label: requestOfficeLabel(r), requests: [] });
    }
    groups.get(key).requests.push(r);
  }
  return [...groups.values()];
});

watch([searchQuery, filterRecurrence, filterOfficeId], () => {
  page.value = 1;
});
watch(filteredRequests, () => {
  if (page.value > totalPages.value) page.value = totalPages.value;
});

const assignIncomplete = computed(() => {
  const f = assignForm.value;
  return !f.officeId || !f.roomId || !f.slotKey;
});

const roomLabelFor = (roomId) => {
  if (assignForm.value.roomLabel && String(assignForm.value.roomId) === String(roomId)) {
    return assignForm.value.roomLabel;
  }
  const fromOpt = assignOptions.value.find((o) => String(o.roomId) === String(roomId));
  if (fromOpt?.roomLabel) return fromOpt.roomLabel;
  const fromGrid = scheduleRooms.value.find((r) => Number(r.id) === Number(roomId));
  if (fromGrid) return fromGrid.label || fromGrid.name || fromGrid.roomNumber || `Room ${roomId}`;
  return roomId ? `Room ${roomId}` : '—';
};

const assignDisplay = computed(() => {
  const f = assignForm.value;
  const parts = String(f.slotKey || '').split(':').map(Number);
  const time =
    Number.isFinite(parts[0]) && Number.isFinite(parts[1])
      ? `${weekdayLabel(parts[0])} ${hourLabel(parts[1])}–${hourLabel(parts[2] > parts[1] ? parts[2] : parts[1] + 1)}`
      : '—';
  const fromOpt = assignOptions.value.find(
    (o) => String(o.officeId) === String(f.officeId) && String(o.roomId) === String(f.roomId)
  );
  const office =
    (requestedAssignment.value &&
      String(requestedAssignment.value.officeId) === String(f.officeId) &&
      requestedAssignment.value.officeName) ||
    fromOpt?.officeName ||
    (f.officeId ? officeName(f.officeId) : '—');
  return {
    office,
    room: f.roomId ? roomLabelFor(f.roomId) : '—',
    time
  };
});

const assignOptionsEmptyMessage = computed(() => {
  const summary = assignSummary.value || {};
  const earliest = Number(summary.earliestAvailableInWeeks || 0);
  if (summary.providerSpecifiedRoom && requestedAssignment.value) {
    return 'No other open rooms in this office for the requested slot.';
  }
  if (!summary.hasAnyFuture) return 'No offices are available for this slot/frequency.';
  if (earliest >= 6) return 'No offices are available until 6 or more weeks away for this slot/frequency.';
  if (earliest > 0) {
    return `No offices are available now. Earliest availability is in ${earliest} week${earliest === 1 ? '' : 's'}.`;
  }
  return 'No other rooms are available for this slot/frequency.';
});

const unavailableOffices = computed(() =>
  (unavailableFromApi.value || []).filter(
    (o) => String(o.officeId) !== String(requestedAssignment.value?.officeId || '')
  )
);

const availableOfficeCount = computed(() => {
  const n = Number(assignSummary.value?.availableOfficeCount);
  if (Number.isFinite(n)) return n;
  return new Set(assignOptions.value.map((o) => String(o.officeId))).size;
});
const availableRoomCount = computed(() => {
  const n = Number(assignSummary.value?.availableNowCount);
  if (Number.isFinite(n)) return n;
  return assignOptions.value.length;
});
const totalOfficeCount = computed(() => {
  const n = Number(assignSummary.value?.totalOffices);
  if (Number.isFinite(n) && n > 0) return n;
  const ids = new Set([
    ...assignOptions.value.map((o) => String(o.officeId)),
    ...unavailableOffices.value.map((o) => String(o.officeId)),
    ...(requestedAssignment.value?.officeId ? [String(requestedAssignment.value.officeId)] : [])
  ]);
  return ids.size || 1;
});
const availabilityPct = computed(() => {
  if (!totalOfficeCount.value) return 0;
  return Math.round((availableOfficeCount.value / totalOfficeCount.value) * 100);
});

const visibleAvailableRooms = computed(() =>
  altsExpanded.value ? assignOptions.value : assignOptions.value.slice(0, ALT_PREVIEW)
);
const visibleUnavailableOffices = computed(() => {
  if (!altsExpanded.value) {
    const remaining = Math.max(0, ALT_PREVIEW - visibleAvailableRooms.value.length);
    return unavailableOffices.value.slice(0, remaining);
  }
  return unavailableOffices.value;
});
const altTotalCount = computed(() => assignOptions.value.length + unavailableOffices.value.length);
const hiddenAltCount = computed(() => Math.max(0, altTotalCount.value - ALT_PREVIEW));

const isRequestedSelected = computed(() => {
  const req = requestedAssignment.value;
  if (!req) return false;
  return (
    String(assignForm.value.officeId) === String(req.officeId) &&
    String(assignForm.value.roomId) === String(req.roomId)
  );
});

const scheduleOfficeId = computed(() => Number(assignForm.value.officeId || 0) || null);
const scheduleOfficeTitle = computed(() => {
  if (!scheduleOfficeId.value) return 'Daily Schedule';
  const office = assignForm.value.officeId
    ? (requestedAssignment.value?.officeName || officeName(assignForm.value.officeId))
    : requestOfficeLabel(selected.value);
  return `${office} — Daily Schedule`;
});
const scheduleRoomFilterLabel = computed(() => {
  if (!scheduleRoomFilter.value) return 'all rooms (use room filter to avoid overlays)';
  const room = scheduleRooms.value.find((r) => String(r.id) === String(scheduleRoomFilter.value));
  return room ? roomDisplay(room) : roomLabelFor(scheduleRoomFilter.value);
});

const pendingHours = computed(() => {
  const r = selected.value;
  const slot = firstSlot(r);
  if (!slot) return null;
  return {
    startHour: Number(slot.startHour),
    endHour: Number(slot.endHour),
    name: r?.providerName || 'Pending request',
    recurrence: requestedRecurrenceLabel(r)
  };
});

const dayBlocks = computed(() => {
  const date = String(scheduleDate.value || '').slice(0, 10);
  const slots = Array.isArray(scheduleGrid.value?.slots) ? scheduleGrid.value.slots : [];
  const roomFilter = scheduleRoomFilter.value ? String(scheduleRoomFilter.value) : '';
  const daySlots = slots.filter((s) => {
    if (String(s.date || '').slice(0, 10) !== date) return false;
    if (s.state === 'open') return false;
    if (roomFilter && String(s.roomId) !== roomFilter) return false;
    return true;
  });

  // Merge contiguous hours per room + provider (privacy: name + recurrence only)
  const sorted = [...daySlots].sort(
    (a, b) => Number(a.roomId) - Number(b.roomId) || Number(a.hour) - Number(b.hour)
  );
  const blocks = [];
  const showRoomInLabel = !roomFilter;
  for (const s of sorted) {
    const providerName =
      s.bookedProviderFullName ||
      s.assignedProviderFullName ||
      s.bookedProviderName ||
      s.assignedProviderName ||
      'Booked';
    const roomName = roomLabelFor(s.roomId);
    const name = showRoomInLabel ? `${providerName} · ${roomName}` : providerName;
    const recurrence = s.frequencyLabel || s.frequencyBadge || null;
    const hour = Number(s.hour);
    const last = blocks[blocks.length - 1];
    const same =
      last &&
      !last.pending &&
      Number(last.roomId) === Number(s.roomId) &&
      last.providerName === providerName &&
      last.recurrence === recurrence &&
      last.endHour === hour;
    if (same) {
      last.endHour = hour + 1;
      last.span += 1;
    } else {
      blocks.push({
        key: `b-${s.roomId}-${hour}-${providerName}`,
        roomId: s.roomId,
        providerName,
        name,
        recurrence,
        startHour: hour,
        endHour: hour + 1,
        span: 1,
        pending: false,
        tone: toneForName(providerName),
        title: `${name}${recurrence ? ` (${recurrence})` : ''}`
      });
    }
  }

  // Pending request only on the filtered/selected room
  const pendingRoomId = String(assignForm.value.roomId || '');
  const pendingVisible =
    !!pendingHours.value &&
    date === requestTargetDate.value &&
    (!roomFilter || roomFilter === pendingRoomId);
  if (
    pendingVisible &&
    Number.isFinite(pendingHours.value.startHour) &&
    Number.isFinite(pendingHours.value.endHour) &&
    pendingHours.value.endHour > pendingHours.value.startHour
  ) {
    const start = pendingHours.value.startHour;
    const end = pendingHours.value.endHour;
    const pendingName = showRoomInLabel
      ? `${pendingHours.value.name} · ${roomLabelFor(pendingRoomId)}`
      : pendingHours.value.name;
    blocks.push({
      key: `pending-${selectedId.value}-${start}`,
      roomId: assignForm.value.roomId || null,
      providerName: pendingHours.value.name,
      name: pendingName,
      recurrence: pendingHours.value.recurrence,
      startHour: start,
      endHour: end,
      span: Math.max(1, end - start),
      pending: true,
      tone: 'pending',
      title: `${pendingName} (pending)`
    });
  }

  return blocks.sort((a, b) => a.startHour - b.startHour || Number(a.pending) - Number(b.pending));
});

const timelineHours = computed(() => {
  const fromGrid = Array.isArray(scheduleGrid.value?.hours) ? scheduleGrid.value.hours.map(Number) : [];
  const base = fromGrid.length ? fromGrid : [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const blockStarts = dayBlocks.value.map((b) => b.startHour);
  const blockEnds = dayBlocks.value.map((b) => b.endHour - 1);
  const minH = Math.min(8, ...base, ...(blockStarts.length ? blockStarts : [8]));
  const maxH = Math.max(18, ...base, ...(blockEnds.length ? blockEnds : [18]));
  const hours = [];
  for (let h = minH; h <= maxH; h += 1) hours.push(h);
  return hours;
});

const blockStyle = (block) => {
  const hours = timelineHours.value;
  const startIdx = Math.max(0, hours.indexOf(block.startHour));
  const top = startIdx * HOUR_PX + 4;
  const height = Math.max(36, block.span * HOUR_PX - 8);
  // When viewing all rooms, lane by room so concurrent rooms don't fully cover each other
  const roomIds = [...new Set(dayBlocks.value.map((b) => String(b.roomId || 'x')))];
  const lane = Math.max(0, roomIds.indexOf(String(block.roomId || 'x')));
  const laneCount = Math.max(1, roomIds.length);
  const widthPct = Math.max(30, 100 / laneCount);
  const leftPct = (lane * widthPct * 0.85);
  return {
    top: `${top}px`,
    height: `${height}px`,
    left: `calc(8px + ${leftPct}%)`,
    width: `calc(${widthPct}% - 12px)`,
    right: 'auto',
    zIndex: block.pending ? 5 : 2 + lane
  };
};

const toneForName = (name) => {
  const tones = ['tone-a', 'tone-b', 'tone-c', 'tone-d'];
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return tones[h % tones.length];
};

const isSelectedOption = (opt) =>
  String(assignForm.value.officeId) === String(opt.officeId) &&
  String(assignForm.value.roomId) === String(opt.roomId);

const pickOption = (opt) => {
  assignForm.value = {
    ...assignForm.value,
    officeId: String(opt.officeId),
    roomId: String(opt.roomId),
    roomLabel: String(opt.roomLabel || '')
  };
  if (opt.roomId) scheduleRoomFilter.value = String(opt.roomId);
};

const pickRequested = () => {
  const req = requestedAssignment.value;
  if (!req) return;
  pickOption({
    officeId: req.officeId,
    roomId: req.roomId,
    roomLabel: req.roomLabel,
    officeName: req.officeName
  });
  if (req.roomId) scheduleRoomFilter.value = String(req.roomId);
};

const onConflictCount = (n) => {
  conflictCount.value = Number(n) || 0;
};

const loadConflictCount = async () => {
  try {
    const resp = await api.get('/office-schedule/admin/coverage-flags', {
      params: { countOnly: 1 }
    });
    conflictCount.value = Number(resp.data?.count || 0);
  } catch {
    // Badge stays at current value; conflicts tab will refresh on open.
  }
};

const syncTabQuery = () => {
  const next = tab.value === 'conflicts' ? 'conflicts' : 'requests';
  if (String(route.query.tab || '') === next) return;
  router.replace({ query: { ...route.query, tab: next } }).catch(() => {});
};

watch(tab, syncTabQuery);

const onAgencyChange = () => {
  const id = selectedAgencyId.value ? Number(selectedAgencyId.value) : null;
  const agency = agencies.value.find((a) => a.id === id);
  agencyStore.setCurrentAgency(agency || null);
  loadRequests();
};

const hydrateFormFromRequest = (r) => {
  const slots = Array.isArray(r?.slots) ? r.slots : [];
  const first = slots[0];
  const pref = Array.isArray(r?.preferredOfficeIds) ? r.preferredOfficeIds : [];
  let officeId = first?.officeLocationId
    ? String(first.officeLocationId)
    : pref.length
      ? String(pref[0])
      : '';
  const roomId = first?.roomId ? String(first.roomId) : '';
  const slotKey =
    first != null &&
    Number.isFinite(first.weekday) &&
    Number.isFinite(first.startHour) &&
    Number.isFinite(first.endHour) &&
    first.endHour > first.startHour
      ? `${first.weekday}:${first.startHour}:${first.endHour}`
      : '';
  assignForm.value = {
    officeId,
    roomId,
    slotKey,
    roomLabel: first?.roomLabel || ''
  };
  scheduleRoomFilter.value = roomId || '';
};

const loadAssignOptions = async (r) => {
  assignOptions.value = [];
  assignSummary.value = null;
  assignOptionsError.value = '';
  providerSpecifiedRoom.value = false;
  requestedAssignment.value = null;
  unavailableFromApi.value = [];
  const aid = requestAgencyId(r);
  if (!r?.id || !aid) return;
  assignOptionsLoading.value = true;
  try {
    const resp = await api.get(`/availability/admin/office-requests/${r.id}/assign-options`, {
      params: { agencyId: aid }
    });
    assignOptions.value = (Array.isArray(resp.data?.options) ? resp.data.options : []).map((o) => ({
      officeId: String(o.officeId),
      officeName: String(o.officeName || officeName(o.officeId)),
      roomId: String(o.roomId),
      roomLabel: String(o.roomLabel || `#${o.roomId}`)
    }));
    assignSummary.value = resp.data?.summary || null;
    providerSpecifiedRoom.value = !!resp.data?.summary?.providerSpecifiedRoom;
    unavailableFromApi.value = (Array.isArray(resp.data?.unavailableOffices)
      ? resp.data.unavailableOffices
      : []
    ).map((o) => ({
      officeId: String(o.officeId),
      officeName: String(o.officeName || officeName(o.officeId))
    }));

    const requested = resp.data?.requested || null;
    const slot = firstSlot(r);
    if (requested?.roomId || slot?.roomId) {
      requestedAssignment.value = {
        officeId: String(requested?.officeId || slot?.officeLocationId || ''),
        officeName: String(
          requested?.officeName || slot?.officeName || officeName(requested?.officeId || slot?.officeLocationId) || requestOfficeLabel(r)
        ),
        roomId: String(requested?.roomId || slot?.roomId),
        roomLabel: String(requested?.roomLabel || slot?.roomLabel || requestRoomLabel(r) || `Room ${requested?.roomId || slot?.roomId}`),
        isAvailableNow: !!requested?.isAvailableNow
      };
      // Keep approval target on the provider-requested room by default.
      pickOption(requestedAssignment.value);
      scheduleRoomFilter.value = String(requestedAssignment.value.roomId);
    } else if (assignOptions.value.length && (!assignForm.value.officeId || !assignForm.value.roomId)) {
      pickOption(assignOptions.value[0]);
      scheduleRoomFilter.value = String(assignOptions.value[0].roomId || '');
    } else if (assignForm.value.roomId) {
      const match = assignOptions.value.find(
        (o) =>
          String(o.officeId) === String(assignForm.value.officeId) &&
          String(o.roomId) === String(assignForm.value.roomId)
      );
      if (match) assignForm.value.roomLabel = match.roomLabel;
      scheduleRoomFilter.value = String(assignForm.value.roomId);
    }
  } catch (e) {
    assignOptionsError.value =
      e?.response?.data?.error?.message || 'Failed to load available offices for this request.';
  } finally {
    assignOptionsLoading.value = false;
  }
};

const loadDaySchedule = async () => {
  const locationId = scheduleOfficeId.value;
  if (!locationId || !scheduleDate.value) {
    scheduleGrid.value = null;
    scheduleRooms.value = [];
    return;
  }
  scheduleLoading.value = true;
  scheduleError.value = '';
  try {
    const weekStart = mondayWeekStart(scheduleDate.value);
    const resp = await api.get(`/office-schedule/locations/${locationId}/weekly-grid`, {
      params: { weekStart }
    });
    scheduleGrid.value = resp.data || null;
    scheduleRooms.value = Array.isArray(resp.data?.rooms) ? resp.data.rooms : [];
  } catch (e) {
    scheduleGrid.value = null;
    scheduleRooms.value = [];
    scheduleError.value = e?.response?.data?.error?.message || 'Failed to load office schedule.';
  } finally {
    scheduleLoading.value = false;
  }
};

const resetScheduleDate = () => {
  scheduleDate.value = requestTargetDate.value;
};

const shiftScheduleDate = (delta) => {
  if (!scheduleDate.value) return;
  scheduleDate.value = addDaysYmd(scheduleDate.value, delta);
};

const onScheduleDateChange = () => {
  // v-model already updated
};

const selectRequest = async (id) => {
  selectedId.value = id;
  actionError.value = '';
  altsExpanded.value = false;
  const r = officeRequests.value.find((x) => x.id === id);
  if (!r) return;
  hydrateFormFromRequest(r);
  scheduleDate.value = (() => {
    const slot = firstSlot(r);
    const start = String(r.requestedStartDate || todayYmd()).slice(0, 10);
    if (!slot || !Number.isFinite(Number(slot.weekday))) return start;
    return firstOnOrAfterWeekday(start, Number(slot.weekday));
  })();
  await loadAssignOptions(r);
  await loadDaySchedule();
};

const loadRequests = async () => {
  loading.value = true;
  error.value = '';
  actionError.value = '';
  try {
    const [officesResp, reqResp] = await Promise.all([
      api.get('/offices'),
      api.get('/availability/admin/office-requests', {
        params: { allAgencies: 1, status: 'PENDING' }
      })
    ]);
    offices.value = officesResp.data || [];
    officeRequests.value = reqResp.data || [];
    // Prefer keeping current selection; otherwise first request in filtered/grouped order.
    if (!officeRequests.value.some((r) => r.id === selectedId.value)) {
      selectedId.value = filteredRequests.value[0]?.id || officeRequests.value[0]?.id || null;
    }
    if (selectedId.value) await selectRequest(selectedId.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load office requests.';
    officeRequests.value = [];
  } finally {
    loading.value = false;
  }
};

const refresh = async () => {
  if (tab.value === 'conflicts') {
    if (typeof conflictsViewRef.value?.load === 'function') {
      await conflictsViewRef.value.load();
    }
    return;
  }
  await loadRequests();
};

const approveSelected = async () => {
  const r = selected.value;
  const aid = requestAgencyId(r);
  if (!r || !aid || assignIncomplete.value) return;
  const requestedFrequency = String(r.requestedFrequency || 'ONCE').toUpperCase();
  const requestedOccurrenceCount = Math.max(1, Number(r.requestedOccurrenceCount || 1));
  let assignedFrequency = 'WEEKLY';
  let weeks = null;
  if (requestedFrequency === 'ONCE') {
    assignedFrequency = 'WEEKLY';
    weeks = 1;
  } else if (requestedFrequency === 'WEEKLY') {
    assignedFrequency = 'WEEKLY';
    weeks = null;
  } else if (requestedFrequency === 'BIWEEKLY') {
    assignedFrequency = 'BIWEEKLY';
    weeks = Math.max(1, requestedOccurrenceCount) * 2;
  } else if (requestedFrequency === 'MONTHLY') {
    assignedFrequency = 'WEEKLY';
    weeks = Math.max(1, requestedOccurrenceCount) * 4;
  }
  const parts = String(assignForm.value.slotKey).split(':').map((x) => Number(x));
  const weekday = parts[0];
  const hour = parts[1];
  const endHour = parts.length >= 3 && Number.isFinite(parts[2]) && parts[2] > hour ? parts[2] : hour + 1;
  saving.value = true;
  actionError.value = '';
  try {
    await api.post(`/availability/admin/office-requests/${r.id}/assign-temporary`, {
      agencyId: aid,
      officeId: Number(assignForm.value.officeId),
      roomId: Number(assignForm.value.roomId),
      weekday,
      hour,
      endHour,
      weeks,
      assignedFrequency,
      requestedFrequency,
      requestedOccurrenceCount
    });
    await loadRequests();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Failed to approve request.';
  } finally {
    saving.value = false;
  }
};

const denySelected = async () => {
  const r = selected.value;
  const aid = requestAgencyId(r);
  if (!r || !aid) return;
  if (!window.confirm(`Deny office request from ${r.providerName || 'this provider'}?`)) return;
  saving.value = true;
  actionError.value = '';
  try {
    await api.post(`/availability/admin/office-requests/${r.id}/deny`, { agencyId: aid });
    await loadRequests();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Failed to deny request.';
  } finally {
    saving.value = false;
  }
};

const ensureAgency = async () => {
  if (!agencies.value.length) {
    if (isSuperAdmin.value) await agencyStore.fetchAgencies();
    else await agencyStore.fetchUserAgencies();
  }
  const qAgencyId = route.query.agencyId ? Number(route.query.agencyId) : null;
  if (qAgencyId && agencies.value.some((a) => a.id === qAgencyId)) {
    selectedAgencyId.value = qAgencyId;
    agencyStore.setCurrentAgency(agencies.value.find((a) => a.id === qAgencyId) || null);
  } else if (agencyStore.currentAgency?.id) {
    selectedAgencyId.value = agencyStore.currentAgency.id;
  } else if (agencies.value.length === 1) {
    selectedAgencyId.value = agencies.value[0].id;
    agencyStore.setCurrentAgency(agencies.value[0]);
  }
};

watch(
  () => [assignForm.value.officeId, scheduleDate.value],
  () => {
    loadDaySchedule();
  }
);

onMounted(async () => {
  await ensureAgency();
  await Promise.all([loadRequests(), loadConflictCount()]);
});

watch(
  () => agencyStore.currentAgency?.id,
  (id) => {
    if (id && selectedAgencyId.value !== id) {
      selectedAgencyId.value = id;
      loadRequests();
    }
  }
);

watch(
  () => route.query.tab,
  (t) => {
    const next = String(t || '').toLowerCase() === 'conflicts' ? 'conflicts' : 'requests';
    if (tab.value !== next) tab.value = next;
  }
);
</script>

<style scoped>
.oa-page {
  --oa-ink: #0f172a;
  --oa-muted: #64748b;
  --oa-line: #dbe3f0;
  --oa-soft: #f4f7fb;
  --oa-panel: #ffffff;
  --oa-accent: #1d4ed8;
  --oa-accent-soft: #dbeafe;
  --oa-warn: #b45309;
  --oa-danger: #dc2626;
  --oa-ok: #15803d;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 16px 20px 24px;
  box-sizing: border-box;
  color: var(--oa-ink);
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
  min-height: calc(100vh - 72px);
  min-height: calc(100dvh - 72px);
  display: flex;
  flex-direction: column;
}
.oa-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.oa-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--oa-ink);
  letter-spacing: -0.02em;
}
.oa-subtitle {
  margin: 6px 0 0;
  color: var(--oa-muted);
}
.oa-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.oa-agency {
  margin-bottom: 14px;
}
.oa-agency label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}
.oa-agency select,
.oa-search,
.oa-filter,
.oa-date-input {
  padding: 8px 12px;
  border: 1px solid var(--oa-line);
  border-radius: 8px;
  background: #fff;
  font: inherit;
}
.oa-agency select {
  min-width: 260px;
}
.oa-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.oa-tab {
  border: 1px solid var(--oa-line);
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.oa-tab.active {
  border-color: var(--oa-ink);
  background: var(--oa-soft);
}
.oa-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--oa-accent-soft);
  color: var(--oa-accent);
  font-size: 12px;
  font-weight: 800;
}
.oa-badge.danger {
  background: #fee2e2;
  color: var(--oa-danger);
}
.oa-empty,
.oa-empty-inline {
  padding: 28px;
  text-align: center;
  color: var(--oa-muted);
  background: var(--oa-panel);
  border: 1px solid var(--oa-line);
  border-radius: 12px;
}
.oa-page > .oa-empty {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 360px;
}
.oa-empty-title {
  font-weight: 800;
  color: var(--oa-ink);
  margin-bottom: 6px;
}
.oa-error {
  color: var(--oa-danger);
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 8px 0;
}
.oa-hint.warn {
  color: var(--oa-warn);
  margin: 8px 0 0;
}
.muted {
  color: var(--oa-muted);
}

.oa-workspace {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr) minmax(260px, 340px);
  gap: 14px;
  align-items: stretch;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}
.oa-col {
  background: var(--oa-panel);
  border: 1px solid var(--oa-line);
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  min-height: min(70vh, 720px);
}
.oa-queue {
  display: flex;
  flex-direction: column;
  padding: 14px;
}
.oa-panel-head {
  margin-bottom: 12px;
}
.oa-panel-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.oa-panel-title-row h2,
.oa-summary-card h2,
.oa-schedule-card h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
}
.oa-scope-note {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--oa-muted);
  line-height: 1.35;
}
.oa-queue-tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.oa-office-group-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 0 2px;
  padding: 6px 4px;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--oa-muted);
  border-bottom: 1px solid var(--oa-line);
}
.oa-search,
.oa-filter {
  width: 100%;
}
.oa-queue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow: auto;
  max-height: 62vh;
}
.oa-request-card {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 10px;
  align-items: start;
  text-align: left;
  border: 1px solid var(--oa-line);
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
  width: 100%;
}
.oa-request-card.selected {
  border-color: var(--oa-accent);
  background: #eff6ff;
  box-shadow: inset 0 0 0 1px var(--oa-accent);
}
.oa-avatar {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 12px;
}
.oa-request-name {
  font-weight: 750;
}
.oa-request-meta {
  color: var(--oa-muted);
  font-size: 12px;
  line-height: 1.35;
}
.oa-status-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: #e2e8f0;
  color: #334155;
  white-space: nowrap;
}
.oa-status-pill.pending {
  background: #ffedd5;
  color: #c2410c;
}
.oa-queue-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--oa-line);
}
.oa-pager {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.oa-page-btn {
  min-width: 32px;
  height: 32px;
  border: 1px solid var(--oa-line);
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
}
.oa-page-btn.active {
  background: var(--oa-accent);
  border-color: var(--oa-accent);
  color: #fff;
}
.oa-page-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.oa-tz-note {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--oa-muted);
}

.oa-center {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  min-height: 0;
}
.oa-summary-card,
.oa-schedule-card {
  background: var(--oa-panel);
  border: 1px solid var(--oa-line);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.oa-summary-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.oa-summary-top h2 {
  margin-bottom: 8px;
  font-size: 1.25rem;
}
.oa-detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.oa-dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
  margin: 0;
}
.oa-dl dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--oa-muted);
  font-weight: 700;
}
.oa-dl dd {
  margin: 2px 0 0;
  font-weight: 650;
}

.oa-schedule-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.oa-date-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.oa-day-timeline {
  display: grid;
  grid-template-columns: 72px 1fr;
  border: 1px solid var(--oa-line);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.oa-day-rail {
  border-right: 1px solid var(--oa-line);
  background: var(--oa-soft);
}
.oa-hour-label {
  height: 52px;
  padding: 10px 8px;
  font-size: 12px;
  color: var(--oa-muted);
  font-weight: 650;
  box-sizing: border-box;
}
.oa-day-canvas {
  position: relative;
}
.oa-hour-gridline {
  height: 52px;
  border-bottom: 1px solid var(--oa-line);
  box-sizing: border-box;
}
.oa-day-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--oa-muted);
  pointer-events: none;
}
.oa-block {
  position: absolute;
  border-radius: 8px;
  padding: 6px 8px;
  z-index: 2;
  box-sizing: border-box;
  overflow: hidden;
}
.oa-block.tone-a { background: #dbeafe; color: #1e3a8a; }
.oa-block.tone-b { background: #dcfce7; color: #14532d; }
.oa-block.tone-c { background: #ede9fe; color: #4c1d95; }
.oa-block.tone-d { background: #fce7f3; color: #9d174d; }
.oa-block.pending {
  background: #ffedd5;
  color: #9a3412;
  border: 1px dashed #f97316;
}
.oa-block-name {
  font-weight: 750;
  font-size: 13px;
}
.oa-block-meta {
  font-size: 11px;
  opacity: 0.9;
}
.oa-block-pending {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.oa-alts {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.oa-requested-card {
  border: 1px solid var(--oa-accent);
  background: #eff6ff;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.oa-alts-heading {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--oa-muted);
}
.oa-alt-tag.selected {
  background: var(--oa-accent-soft);
  color: var(--oa-accent);
}
.oa-requested-card .btn.active {
  border-color: var(--oa-accent);
  background: var(--oa-accent);
  color: #fff;
}
.oa-avail-banner {
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
  color: #166534;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.oa-avail-banner.empty {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #9a3412;
}
.oa-alt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 58vh;
  overflow: auto;
}
.oa-alt-card {
  border: 1px solid var(--oa-line);
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
  text-align: left;
  width: 100%;
}
button.oa-alt-card {
  cursor: pointer;
}
button.oa-alt-card.selected {
  border-color: var(--oa-accent);
  background: #eff6ff;
  box-shadow: inset 0 0 0 1px var(--oa-accent);
}
.oa-alt-card.unavailable {
  opacity: 0.72;
  background: #f8fafc;
}
.oa-alt-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.oa-alt-name {
  font-weight: 750;
}
.oa-alt-room {
  margin-top: 4px;
  font-size: 12px;
  color: var(--oa-muted);
}
.oa-alt-tag {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-radius: 999px;
  padding: 3px 7px;
}
.oa-alt-tag.available {
  background: #dcfce7;
  color: var(--oa-ok);
}
.oa-alt-tag.unavailable {
  background: #e2e8f0;
  color: #475569;
}
.oa-view-all {
  align-self: stretch;
}
.oa-conflicts-wrap {
  background: var(--oa-panel);
  border: 1px solid var(--oa-line);
  border-radius: 14px;
  padding: 16px;
  flex: 1 1 auto;
  width: 100%;
  box-sizing: border-box;
}

@media (max-width: 1100px) {
  .oa-workspace {
    grid-template-columns: 1fr;
  }
  .oa-queue-list,
  .oa-alt-list {
    max-height: none;
  }
  .oa-dl {
    grid-template-columns: 1fr;
  }
}
</style>
