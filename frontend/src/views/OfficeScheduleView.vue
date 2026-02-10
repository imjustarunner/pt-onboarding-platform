<template>
  <div class="office-schedule">
    <div class="header" data-tour="buildings-schedule-header">
      <div>
        <h3 style="margin: 0;" data-tour="buildings-schedule-title">Building Schedule</h3>
        <div class="subtitle" data-tour="buildings-schedule-subtitle">Weekly office grid (Mon–Sun, 7am–9pm).</div>
      </div>
      <div class="controls" data-tour="buildings-schedule-controls">
        <div class="field" data-tour="buildings-schedule-week">
          <label>Week of</label>
          <input v-model="weekStart" type="date" @change="loadGrid" :disabled="!officeId" />
        </div>
        <button class="btn btn-secondary" @click="loadGrid" :disabled="loading || !officeId">Refresh</button>
      </div>
    </div>

    <div v-if="!officeId" class="muted">Select a building above to view the schedule.</div>
    <div v-else-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else-if="grid" class="grid-wrap" data-tour="buildings-schedule-gridwrap">
      <div class="legend" data-tour="buildings-schedule-legend">
        <div class="legend-item"><span class="dot open"></span> Open</div>
        <div class="legend-item"><span class="dot assigned_available"></span> Assigned available</div>
        <div class="legend-item"><span class="dot assigned_temporary"></span> Assigned temporary</div>
        <div class="legend-item"><span class="dot assigned_booked"></span> Assigned booked</div>
      </div>

      <div v-if="canManageSchedule" class="card avail-search" data-tour="buildings-schedule-avail-search">
        <div class="avail-search-head">
          <div>
            <div class="avail-search-title">Find availability</div>
            <div class="muted">
              Search for open or assigned-available offices at a given day/time. Shows up to 2 hours before/after if contiguous slots are also available.
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" @click="runAvailabilitySearch" :disabled="searching">
            Search
          </button>
        </div>

        <div class="avail-search-form">
          <div class="field">
            <label>Date</label>
            <input v-model="searchDate" type="date" :disabled="!officeId || searching" />
          </div>
          <div class="field">
            <label>Start time</label>
            <select v-model.number="searchHour" class="select" :disabled="!grid || searching">
              <option v-for="h in grid.hours" :key="`sh-${h}`" :value="h">{{ formatHour(h) }}</option>
            </select>
          </div>
          <div class="field">
            <label>Include</label>
            <select v-model="searchFilter" class="select" :disabled="!grid || searching">
              <option value="all">Open + assigned available</option>
              <option value="open">Open only</option>
              <option value="assigned">Assigned available only</option>
            </select>
          </div>
          <div class="field">
            <label>Results</label>
            <div class="muted" style="padding-top: 10px;">
              {{ availabilityResults.length }} found
            </div>
          </div>
        </div>

        <div v-if="searchError" class="error-box" style="margin-top: 10px;">{{ searchError }}</div>

        <div v-if="availabilityResults.length" class="avail-results">
          <div v-for="r in availabilityResults" :key="`ar-${r.roomId}`" class="avail-row">
            <div class="avail-room">
              <div class="avail-room-title">
                <strong>{{ r.roomLabel }}</strong>
              </div>
              <div class="muted" style="font-size: 12px;">
                {{ r.date }} • {{ formatHour(r.hour) }}
              </div>
            </div>
            <div class="avail-meta">
              <span class="pill" :class="`pill-${r.state}`">
                {{ r.stateLabel }}{{ r.providerInitials ? ` (${r.providerInitials})` : '' }}
              </span>
              <div class="muted" style="font-size: 12px; margin-top: 4px;">
                Window: {{ formatHour(r.windowStartHour) }}–{{ formatHour(r.windowEndHour) }}
                <span v-if="r.prevHours || r.nextHours">
                  • prev {{ r.prevHours }}h / next {{ r.nextHours }}h
                </span>
              </div>
            </div>
            <div class="avail-actions">
              <button class="btn btn-secondary btn-sm" type="button" @click="jumpToSlot(r.roomId, r.date, r.hour)">
                Jump
              </button>
            </div>
          </div>
        </div>
        <div v-else class="muted" style="margin-top: 10px;">
          No matching availability for this time.
        </div>
      </div>

      <div class="room-nav" data-tour="buildings-schedule-room-nav">
        <label style="font-weight: 800;">Office</label>
        <select v-model.number="selectedRoomId" class="select" :disabled="!grid">
          <option v-for="r in sortedRooms" :key="`room-opt-${r.id}`" :value="Number(r.id)">
            {{ r.roomNumber ? `#${r.roomNumber}` : '' }} {{ r.label || r.name }}
          </option>
        </select>
        <button class="btn btn-secondary btn-sm" type="button" @click="prevRoom" :disabled="sortedRooms.length <= 1">Prev office</button>
        <button class="btn btn-secondary btn-sm" type="button" @click="nextRoom" :disabled="sortedRooms.length <= 1">Next office</button>
        <label class="check" style="margin-left: 10px;">
          <input type="checkbox" v-model="singleRoomMode" />
          <span>Show one office</span>
        </label>
      </div>

      <div v-for="room in displayedRooms" :key="room.id" class="room-card" data-tour="buildings-schedule-room-card">
        <div class="room-head">
          <div class="room-title">
            <strong>{{ room.roomNumber ? `#${room.roomNumber}` : '' }} {{ room.label || room.name }}</strong>
          </div>
        </div>

        <div class="week-table" data-tour="buildings-schedule-week-table">
          <div class="cell corner"></div>
          <div v-for="d in grid.days" :key="d" class="cell day-head">
            {{ formatDay(d) }}
          </div>

          <template v-for="h in grid.hours" :key="h">
            <div class="cell hour-head">{{ formatHour(h) }}</div>
            <div
              v-for="d in grid.days"
              :key="`${room.id}-${d}-${h}`"
              class="cell slot"
              :class="slotClass(room.id, d, h)"
              :style="slotStyle(room.id, d, h)"
              :title="slotTitle(room.id, d, h)"
              @click="onSlotClick(room.id, d, h)"
            >
              <span class="initials">{{ slotInitials(room.id, d, h) }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Slot actions modal -->
    <div v-if="showModal" class="modal-overlay" @click="closeModal">
      <div class="modal" @click.stop>
        <h3 style="margin-top: 0;">Slot</h3>
        <div class="muted" style="margin-bottom: 10px;">
          {{ modalSlot ? `${modalSlot.date} ${formatHour(modalSlot.hour)} — ${modalSlot.state}` : '' }}
        </div>

        <div v-if="modalSlot?.state === 'open'">
          <div v-if="canManageSchedule" class="section">
            <div class="section-title">Staff/admin action</div>
            <div class="muted" style="margin-bottom: 8px;">
              Assigning creates a one-time office assignment for the selected time range.
            </div>

            <div class="row">
              <label style="font-weight: 700;">Provider</label>
              <input v-model="providerSearch" class="input" placeholder="Search provider…" style="max-width: 260px;" />
              <select v-model.number="selectedProviderId" class="select">
                <option :value="0">Select…</option>
                <option v-for="p in filteredProviders" :key="`p-${p.id}`" :value="Number(p.id)">
                  {{ p.last_name }}, {{ p.first_name }}
                </option>
              </select>
              <label style="font-weight: 700;">End</label>
              <select v-model.number="assignEndHour" class="select" :disabled="!modalSlot">
                <option v-for="h in assignEndHourOptions" :key="`end-${h}`" :value="h">
                  {{ formatHour(h) }}
                </option>
              </select>
              <button class="btn btn-primary" @click="assignOpenSlot" :disabled="saving || !selectedProviderId || !modalSlot?.roomId">
                Assign
              </button>
            </div>
          </div>

          <div v-else class="muted">
            Open slots are not assignable for your role.
          </div>
        </div>

        <template v-else>
          <div class="section">
            <div class="section-title">Provider actions</div>

            <div class="row">
              <label style="font-weight: 700;">Book frequency</label>
              <select v-model="bookFreq">
                <option value="">Select…</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
              <button class="btn btn-primary" @click="bookSlot" :disabled="saving || !bookFreq || (!modalSlot?.standingAssignmentId && !modalSlot?.eventId)">
                Book
              </button>
            </div>

            <div class="row" style="margin-top: 10px;">
              <label class="check">
                <input type="checkbox" v-model="ackAvailable" />
                <span>I understand this reservation will be available for temporary booking that I can approve or deny by my peers.</span>
              </label>
              <button class="btn btn-secondary" @click="keepAvailable" :disabled="saving || !ackAvailable || !modalSlot?.standingAssignmentId">
                Keep available
              </button>
            </div>

            <div class="row" style="margin-top: 10px;">
              <button class="btn btn-secondary" @click="setTemporary" :disabled="saving || !modalSlot?.standingAssignmentId">
                Set temporary (4 weeks)
              </button>
            </div>

            <div class="row" style="margin-top: 10px;">
              <label class="check">
                <input type="checkbox" v-model="ackForfeit" />
                <span>I understand this slot's day/time/frequency is forfeit at this time and available to others.</span>
              </label>
              <button class="btn btn-danger" @click="forfeit" :disabled="saving || !ackForfeit || !modalSlot?.standingAssignmentId">
                Forfeit
              </button>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Staff/admin action</div>
            <div class="muted" style="margin-bottom: 8px;">
              Booking converts this occurrence to assigned_booked immediately (no approval gate).
            </div>
            <button class="btn btn-primary" @click="staffBook" :disabled="saving || !modalSlot?.eventId">
              Mark booked for this occurrence
            </button>
            <div class="muted" style="margin: 10px 0 6px;">
              Virtual intake toggle (this hour only).
            </div>
            <div class="row">
              <button class="btn btn-secondary" @click="enableVirtualIntake" :disabled="saving || !modalSlot?.eventId">
                Enable virtual intake
              </button>
              <button class="btn btn-secondary" @click="disableVirtualIntake" :disabled="saving || !modalSlot?.eventId">
                Disable virtual intake
              </button>
            </div>
          </div>
        </template>

        <div class="actions">
          <button class="btn btn-secondary" @click="closeModal" :disabled="saving">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
const route = useRoute();
const authStore = useAuthStore();

const officeId = computed(() => (typeof route.query.officeId === 'string' ? route.query.officeId : ''));

const loading = ref(false);
const error = ref('');
const grid = ref(null);
const weekStart = ref(new Date().toISOString().slice(0, 10));

const searching = ref(false);
const searchError = ref('');
const searchDate = ref(new Date().toISOString().slice(0, 10));
const searchHour = ref(9);
const searchFilter = ref('all'); // all | open | assigned
const availabilityResults = ref([]);

const formatDay = (d) => {
  try {
    const dt = new Date(`${d}T00:00:00`);
    return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
};

const formatHour = (h) => {
  const hour = Number(h);
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};

const slotMap = computed(() => {
  const m = new Map();
  const slots = grid.value?.slots || [];
  for (const s of slots) {
    m.set(`${s.roomId}:${s.date}:${s.hour}`, s);
  }
  return m;
});

const getSlot = (roomId, date, hour) => slotMap.value.get(`${roomId}:${date}:${hour}`) || null;

const isAvailableState = (state) => {
  const s = String(state || '');
  return s === 'open' || s === 'assigned_available' || s === 'assigned_temporary';
};
const isOpenState = (state) => String(state || '') === 'open';
const isAssignedAvailableState = (state) => {
  const s = String(state || '');
  return s === 'assigned_available' || s === 'assigned_temporary';
};

const roomLabel = (roomId) => {
  const r = (grid.value?.rooms || []).find((x) => Number(x.id) === Number(roomId));
  if (!r) return `Room ${roomId}`;
  const num = r.roomNumber ? `#${r.roomNumber} ` : '';
  return `${num}${r.label || r.name || ''}`.trim();
};

const stateLabel = (state) => {
  const s = String(state || '');
  if (s === 'open') return 'Open';
  if (s === 'assigned_available') return 'Assigned available';
  if (s === 'assigned_temporary') return 'Assigned temporary';
  if (s === 'assigned_booked') return 'Booked';
  return s || 'Unknown';
};

const slotClass = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  return s?.state || 'open';
};

const slotInitials = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  return s?.providerInitials || '';
};

const slotTitle = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  if (!s) return '';
  return `${date} ${formatHour(hour)} — ${s.state}${s.providerInitials ? ` (${s.providerInitials})` : ''}`;
};

const stableColorForId = (id) => {
  const n = Number(id || 0);
  if (!n) return null;
  // Deterministic HSL palette based on id
  const hue = (n * 47) % 360;
  return `hsl(${hue} 70% 45%)`;
};

const slotStyle = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  const pid = Number(s?.providerId || 0);
  if (!pid) return {};
  const c = stableColorForId(pid);
  if (!c) return {};
  return {
    borderLeft: `5px solid ${c}`
  };
};

const loadGrid = async () => {
  if (!officeId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/office-schedule/locations/${officeId.value}/weekly-grid`, { params: { weekStart: weekStart.value } });
    grid.value = resp.data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load weekly grid';
  } finally {
    loading.value = false;
  }
};

const runAvailabilitySearch = async () => {
  if (!officeId.value) return;
  if (!grid.value) return;
  const date = String(searchDate.value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    searchError.value = 'Date must be YYYY-MM-DD';
    return;
  }
  const hour = Number(searchHour.value);
  const hours = (grid.value?.hours || []).map((h) => Number(h));
  if (!hours.includes(hour)) {
    searchError.value = 'Invalid hour';
    return;
  }

  try {
    searching.value = true;
    searchError.value = '';

    // Ensure the currently loaded grid contains the target date; if not, reload the week for that date.
    if (!Array.isArray(grid.value?.days) || !grid.value.days.includes(date)) {
      weekStart.value = date; // backend normalizes to Monday
      await loadGrid();
    }

    const rooms = sortedRooms.value || [];
    const maxSpan = 2;
    const results = [];

    for (const room of rooms) {
      const s0 = getSlot(room.id, date, hour);
      const st = String(s0?.state || '');
      if (!isAvailableState(st)) continue;

      if (searchFilter.value === 'open' && !isOpenState(st)) continue;
      if (searchFilter.value === 'assigned' && !isAssignedAvailableState(st)) continue;

      let prev = 0;
      for (let i = 1; i <= maxSpan; i++) {
        const h = hour - i;
        if (!hours.includes(h)) break;
        const s = getSlot(room.id, date, h);
        if (!isAvailableState(s?.state)) break;
        prev++;
      }
      let next = 0;
      for (let i = 1; i <= maxSpan; i++) {
        const h = hour + i;
        if (!hours.includes(h)) break;
        const s = getSlot(room.id, date, h);
        if (!isAvailableState(s?.state)) break;
        next++;
      }

      results.push({
        roomId: room.id,
        roomLabel: roomLabel(room.id),
        date,
        hour,
        state: st,
        stateLabel: stateLabel(st),
        providerInitials: s0?.providerInitials || null,
        prevHours: prev,
        nextHours: next,
        windowStartHour: hour - prev,
        windowEndHour: hour + next + 1
      });
    }

    const stateRank = (s) => (s === 'open' ? 0 : 1);
    results.sort((a, b) => {
      const ra = stateRank(a.state);
      const rb = stateRank(b.state);
      if (ra !== rb) return ra - rb;
      const wa = (a.prevHours || 0) + (a.nextHours || 0);
      const wb = (b.prevHours || 0) + (b.nextHours || 0);
      if (wa !== wb) return wb - wa;
      return String(a.roomLabel || '').localeCompare(String(b.roomLabel || ''));
    });

    availabilityResults.value = results;
  } catch (e) {
    availabilityResults.value = [];
    searchError.value = e?.response?.data?.error?.message || 'Failed to search availability';
  } finally {
    searching.value = false;
  }
};

const jumpToSlot = (roomId, date, hour) => {
  singleRoomMode.value = true;
  selectedRoomId.value = Number(roomId);
  if (String(weekStart.value || '').slice(0, 10) !== String(date || '').slice(0, 10)) {
    weekStart.value = String(date || '').slice(0, 10);
    void loadGrid();
  }
  const s = getSlot(roomId, date, hour);
  modalSlot.value = s ? { ...s, roomId, date, hour } : { roomId, date, hour, state: 'open' };
  showModal.value = true;
};

const canManageSchedule = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['clinical_practice_assistant', 'admin', 'super_admin', 'support', 'staff'].includes(role);
});

const sortedRooms = computed(() => {
  const rooms = (grid.value?.rooms || []).slice();
  const numVal = (r) => {
    const n = r?.roomNumber ?? r?.room_number ?? null;
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };
  rooms.sort((a, b) => {
    const an = numVal(a);
    const bn = numVal(b);
    if (an !== null && bn !== null && an !== bn) return an - bn;
    if (an !== null && bn === null) return -1;
    if (an === null && bn !== null) return 1;
    const al = String(a?.label || a?.name || '').toLowerCase();
    const bl = String(b?.label || b?.name || '').toLowerCase();
    return al.localeCompare(bl);
  });
  return rooms;
});

const singleRoomMode = ref(false);
const selectedRoomId = ref(0);
const displayedRooms = computed(() => {
  const rooms = sortedRooms.value || [];
  if (!rooms.length) return [];
  if (!singleRoomMode.value) return rooms;
  const id = Number(selectedRoomId.value || 0) || Number(rooms[0].id);
  const found = rooms.find((r) => Number(r.id) === id) || rooms[0];
  return found ? [found] : [];
});

watch(sortedRooms, (rooms) => {
  if (!Array.isArray(rooms) || !rooms.length) return;
  const current = Number(selectedRoomId.value || 0);
  const exists = rooms.some((r) => Number(r.id) === current);
  if (!current || !exists) selectedRoomId.value = Number(rooms[0].id);
}, { immediate: true });

const prevRoom = () => {
  const rooms = sortedRooms.value || [];
  if (rooms.length <= 1) return;
  const cur = Number(selectedRoomId.value || rooms[0].id);
  const idx = rooms.findIndex((r) => Number(r.id) === cur);
  const nextIdx = idx <= 0 ? rooms.length - 1 : idx - 1;
  selectedRoomId.value = Number(rooms[nextIdx].id);
};
const nextRoom = () => {
  const rooms = sortedRooms.value || [];
  if (rooms.length <= 1) return;
  const cur = Number(selectedRoomId.value || rooms[0].id);
  const idx = rooms.findIndex((r) => Number(r.id) === cur);
  const nextIdx = idx < 0 || idx >= rooms.length - 1 ? 0 : idx + 1;
  selectedRoomId.value = Number(rooms[nextIdx].id);
};

const showModal = ref(false);
const modalSlot = ref(null);
const saving = ref(false);
const bookFreq = ref('');
const ackAvailable = ref(false);
const ackForfeit = ref(false);

const providers = ref([]);
const providerSearch = ref('');
const selectedProviderId = ref(0);
const assignEndHour = ref(8);
const assignEndHourOptions = computed(() => {
  const start = Number(modalSlot.value?.hour ?? 0);
  const out = [];
  // Grid is 7..21 so end is max 22
  for (let h = start + 1; h <= 22; h++) out.push(h);
  return out;
});
const filteredProviders = computed(() => {
  const q = String(providerSearch.value || '').trim().toLowerCase();
  const base = (providers.value || []).slice();
  base.sort((a, b) => String(a?.last_name || '').localeCompare(String(b?.last_name || '')) || String(a?.first_name || '').localeCompare(String(b?.first_name || '')));
  if (!q) return base.slice(0, 50);
  return base.filter((u) => `${u.first_name || ''} ${u.last_name || ''} ${u.email || ''}`.toLowerCase().includes(q)).slice(0, 50);
});

const loadProviders = async () => {
  if (!canManageSchedule.value) return;
  try {
    const r = await api.get('/users');
    const rows = Array.isArray(r.data) ? r.data : [];
    providers.value = rows.filter((u) => String(u?.role || '').toLowerCase() === 'provider' || u?.has_provider_access === true);
  } catch {
    providers.value = [];
  }
};

const closeModal = () => {
  showModal.value = false;
  modalSlot.value = null;
  bookFreq.value = '';
  ackAvailable.value = false;
  ackForfeit.value = false;
  providerSearch.value = '';
  selectedProviderId.value = 0;
  assignEndHour.value = 8;
};

const onSlotClick = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  if (!s) return;
  modalSlot.value = s;
  showModal.value = true;
  assignEndHour.value = Number(hour) + 1;
  void loadProviders();
};

const assignOpenSlot = async () => {
  if (!officeId.value || !modalSlot.value?.roomId || !selectedProviderId.value) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/open-slots/assign`, {
      roomId: modalSlot.value.roomId,
      date: modalSlot.value.date,
      hour: modalSlot.value.hour,
      endHour: assignEndHour.value,
      assignedUserId: selectedProviderId.value
    });
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to assign slot';
  } finally {
    saving.value = false;
  }
};

const bookSlot = async () => {
  if (!officeId.value) return;
  try {
    saving.value = true;
    if (modalSlot.value?.standingAssignmentId) {
      await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/booking-plan`, {
        bookedFrequency: bookFreq.value,
        bookingStartDate: modalSlot.value.date
      });
    } else if (modalSlot.value?.eventId) {
      await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/booking-plan`, {
        bookedFrequency: bookFreq.value,
        bookingStartDate: modalSlot.value.date
      });
    } else {
      return;
    }
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to set booking plan';
  } finally {
    saving.value = false;
  }
};

const keepAvailable = async () => {
  if (!officeId.value || !modalSlot.value?.standingAssignmentId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/keep-available`, {
      acknowledged: true
    });
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to keep available';
  } finally {
    saving.value = false;
  }
};

const setTemporary = async () => {
  if (!officeId.value || !modalSlot.value?.standingAssignmentId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/temporary`, { weeks: 4 });
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to set temporary';
  } finally {
    saving.value = false;
  }
};

const forfeit = async () => {
  if (!officeId.value || !modalSlot.value?.standingAssignmentId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/forfeit`, {
      acknowledged: true
    });
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to forfeit';
  } finally {
    saving.value = false;
  }
};

const staffBook = async () => {
  if (!officeId.value || !modalSlot.value?.eventId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/book`, {});
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to mark booked';
  } finally {
    saving.value = false;
  }
};

const enableVirtualIntake = async () => {
  if (!officeId.value || !modalSlot.value?.eventId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/virtual-intake`, {
      enabled: true
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to enable virtual intake';
  } finally {
    saving.value = false;
  }
};

const disableVirtualIntake = async () => {
  if (!officeId.value || !modalSlot.value?.eventId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/virtual-intake`, {
      enabled: false
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to disable virtual intake';
  } finally {
    saving.value = false;
  }
};

watch(() => officeId.value, async () => {
  grid.value = null;
  await loadGrid();
}, { immediate: true });

onMounted(loadGrid);
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 12px;
}
.subtitle { color: var(--text-secondary); margin-top: 4px; font-size: 13px; }
.controls { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 6px; }
input[type='date'] {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.muted { color: var(--text-secondary); }
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.loading { color: var(--text-secondary); }
.legend { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 10px 0 12px; color: var(--text-secondary); font-size: 13px; }
.legend-item { display: inline-flex; gap: 8px; align-items: center; }
.dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.dot.open { background: #94a3b8; }
.dot.assigned_available { background: #fbbf24; }
.dot.assigned_temporary { background: #3b82f6; }
.dot.assigned_booked { background: #ef4444; }

.room-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}
.room-nav {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin: 10px 0 12px;
}
.room-nav .select {
  min-width: 220px;
}

.avail-search {
  margin-top: 10px;
  padding: 12px;
}
.avail-search-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.avail-search-title {
  font-weight: 900;
  font-size: 14px;
}
.avail-search-form {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-items: end;
  margin-top: 10px;
}
@media (max-width: 900px) {
  .avail-search-form { grid-template-columns: 1fr; }
}
.avail-results {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.avail-row {
  display: grid;
  grid-template-columns: 1fr 1.4fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
}
@media (max-width: 900px) {
  .avail-row { grid-template-columns: 1fr; }
}
.avail-room-title { line-height: 1.15; }
.pill {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  border: 1px solid rgba(0,0,0,0.10);
}
.pill-open { background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.25); }
.pill-assigned_available { background: rgba(59, 130, 246, 0.10); border-color: rgba(59, 130, 246, 0.22); }
.pill-assigned_temporary { background: rgba(245, 158, 11, 0.14); border-color: rgba(245, 158, 11, 0.28); }
.pill-assigned_booked { background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.22); }
.room-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }

.week-table {
  display: grid;
  grid-template-columns: 90px repeat(7, minmax(0, 1fr));
  gap: 6px;
}
.cell {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: var(--bg-alt);
  font-size: 12px;
  color: var(--text-secondary);
}
.corner { background: transparent; border: none; }
.day-head { background: white; font-weight: 800; color: var(--text-primary); text-align: center; }
.hour-head { background: white; font-weight: 700; color: var(--text-primary); }
.slot {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
}
.slot.open { background: #f8fafc; }
.slot.assigned_available { background: rgba(251,191,36,0.22); border-color: rgba(251,191,36,0.45); }
.slot.assigned_temporary { background: rgba(59,130,246,0.18); border-color: rgba(59,130,246,0.35); }
.slot.assigned_booked { background: rgba(239,68,68,0.18); border-color: rgba(239,68,68,0.35); }
.initials { font-weight: 800; color: var(--text-primary); }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 50;
}
.modal {
  width: 760px;
  max-width: 100%;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.section {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 12px;
}
.section-title { font-weight: 800; margin-bottom: 8px; }
.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.check { display: inline-flex; gap: 10px; align-items: flex-start; }
.check span { color: var(--text-secondary); font-size: 13px; line-height: 1.35; }
</style>

