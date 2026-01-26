<template>
  <div class="sched-wrap">
    <div class="sched-toolbar">
      <div class="sched-toolbar-top">
        <h2 class="sched-week-title">Week of {{ weekStart }}</h2>
      </div>
      <div class="sched-toolbar-main">
        <div class="sched-toolbar-left">
          <button class="btn btn-secondary btn-sm sched-btn" type="button" @click="prevWeek" :disabled="loading">← Prev</button>
          <button class="btn btn-secondary btn-sm sched-btn" type="button" @click="nextWeek" :disabled="loading">Next →</button>
        </div>

        <div class="sched-toolbar-right">
          <label class="sched-toggle">
            <input type="checkbox" v-model="showGoogleBusy" :disabled="loading" />
            <span>Google busy</span>
          </label>

          <label class="sched-toggle">
            <input type="checkbox" v-model="hideWeekend" :disabled="loading" />
            <span>Hide weekends</span>
          </label>

          <button class="btn btn-secondary btn-sm sched-btn" type="button" @click="load" :disabled="loading">Refresh</button>
        </div>
      </div>

      <div v-if="externalCalendarsAvailable.length" class="sched-toolbar-secondary">
        <div class="sched-calendars">
          <div class="sched-calendars-label">EHR calendars</div>
          <label v-for="c in externalCalendarsAvailable" :key="`cal-${c.id}`" class="sched-toggle">
            <input
              type="checkbox"
              v-model="selectedExternalCalendarIds"
              :value="Number(c.id)"
              :disabled="loading"
            />
            <span>{{ c.label }}</span>
          </label>
        </div>
      </div>
    </div>

    <div v-if="error" class="error" style="margin-top: 10px;">{{ error }}</div>
    <div v-if="loading" class="loading" style="margin-top: 10px;">Loading schedule…</div>
    <div v-if="overlayErrorText" class="error" style="margin-top: 10px;">
      {{ overlayErrorText }}
    </div>

    <div v-else-if="summary" class="sched-grid-wrap">
      <div class="legend">
        <div class="legend-item"><span class="swatch swatch-request"></span> Pending request</div>
        <div class="legend-item"><span class="swatch swatch-school"></span> School assigned</div>
        <div class="legend-item"><span class="swatch swatch-oa"></span> Office assigned</div>
        <div class="legend-item"><span class="swatch swatch-ot"></span> Office temporary</div>
        <div class="legend-item"><span class="swatch swatch-ob"></span> Office booked</div>
        <div class="legend-item" v-if="showGoogleBusy"><span class="swatch swatch-gbusy"></span> Google busy</div>
        <div class="legend-item" v-if="selectedExternalCalendarIds.length"><span class="swatch swatch-ebusy"></span> EHR busy</div>
      </div>

      <div class="sched-grid" :style="gridStyle">
        <div class="sched-head-cell"></div>
        <div v-for="d in visibleDays" :key="d" class="sched-head-cell">
          <div class="sched-head-day">
            <div class="sched-head-dow">{{ d }}</div>
            <div class="sched-head-date">{{ dayDateLabel(d) }}</div>
          </div>
        </div>

        <template v-for="h in hours" :key="`h-${h}`">
          <div class="sched-hour">{{ hourLabel(h) }}</div>

          <button
            v-for="d in visibleDays"
            :key="`c-${d}-${h}`"
            type="button"
            class="sched-cell"
            :class="{ clickable: canCreateRequests }"
            @click="onCellClick(d, h)"
          >
            <div class="cell-blocks">
              <div
                v-for="b in cellBlocks(d, h)"
                :key="b.key"
                class="cell-block"
                :class="`cell-block-${b.kind}`"
                :title="b.title"
              >
                <span class="cell-block-text">{{ b.shortLabel }}</span>
              </div>
            </div>
          </button>
        </template>
      </div>
    </div>

    <div v-if="showRequestModal" class="modal-backdrop" @click.self="closeModal">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">Request additional availability</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeModal">Close</button>
        </div>

        <div class="muted" style="margin-top: 6px;">
          {{ modalDay }} • {{ hourLabel(modalHour) }}–{{ hourLabel(modalEndHour) }}
        </div>

        <div class="modal-body">
          <label class="lbl">Request type</label>
          <select v-model="requestType" class="input">
            <option value="office">Additional office availability request</option>
            <option value="school" :disabled="!canUseSchool(modalDay, modalHour, modalEndHour)">School daytime availability</option>
          </select>
          <div v-if="requestType === 'school' && !canUseSchool(modalDay, modalHour, modalEndHour)" class="muted" style="margin-top: 6px;">
            School daytime availability must be on weekdays and between 06:00 and 18:00.
          </div>

          <label class="lbl" style="margin-top: 10px;">End time</label>
          <select v-model.number="modalEndHour" class="input">
            <option v-for="h in endHourOptions" :key="`end-${h}`" :value="h">
              {{ hourLabel(h) }}
            </option>
          </select>

          <label class="lbl" style="margin-top: 10px;">Notes (optional)</label>
          <textarea v-model="requestNotes" class="input" rows="3" placeholder="Any context for staff reviewing this request…" />

          <div v-if="modalError" class="error" style="margin-top: 10px;">{{ modalError }}</div>
        </div>

        <div class="modal-actions">
          <button
            class="btn btn-primary"
            type="button"
            @click="submitRequest"
            :disabled="submitting || (requestType === 'school' && !canUseSchool(modalDay, modalHour, modalEndHour))"
          >
            {{ submitting ? 'Submitting…' : 'Submit request' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  userId: { type: Number, required: true },
  agencyId: { type: [Number, String], default: null },
  mode: { type: String, default: 'self' }, // 'self' | 'admin'
  // Optional: parent-controlled weekStart (any date; normalized to Monday).
  weekStartYmd: { type: String, default: null }
});

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hours = Array.from({ length: 15 }, (_, i) => 7 + i); // 7..21

const loading = ref(false);
const error = ref('');
const summary = ref(null);

const showGoogleBusy = ref(false);
const selectedExternalCalendarIds = ref([]);
const hideWeekend = ref(props.mode === 'self');
const initializedOverlayDefaults = ref(false);

const visibleDays = computed(() => (hideWeekend.value ? ALL_DAYS.slice(0, 5) : ALL_DAYS.slice()));

const gridStyle = computed(() => {
  const cols = visibleDays.value.length;
  const dayMin = 120;
  const timeCol = 90;
  return {
    gridTemplateColumns: `${timeCol}px repeat(${cols}, minmax(${dayMin}px, 1fr))`,
    minWidth: `${timeCol + cols * dayMin}px`
  };
});

const externalCalendarsAvailable = computed(() => {
  const s = summary.value;
  const arr = Array.isArray(s?.externalCalendarsAvailable) ? s.externalCalendarsAvailable : [];
  return arr
    .map((c) => ({ id: Number(c?.id || 0), label: String(c?.label || '').trim() }))
    .filter((c) => Number.isFinite(c.id) && c.id > 0 && c.label);
});

const pad2 = (n) => String(n).padStart(2, '0');

const localYmd = (d) => {
  const yy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yy}-${mm}-${dd}`;
};

const toLocalDateNoon = (dateLike) => {
  // IMPORTANT: `new Date('YYYY-MM-DD')` parses as UTC and can shift the local day.
  // Use local noon for YMD strings to avoid off-by-one-day/week bugs.
  const s = typeof dateLike === 'string' ? dateLike.trim() : '';
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00`);
  return new Date(dateLike || Date.now());
};

const hourLabel = (h) => {
  const d = new Date();
  d.setHours(Number(h), 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};

const startOfWeekMondayYmd = (dateLike) => {
  const d = toLocalDateNoon(dateLike);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return localYmd(d);
};

const addDaysYmd = (ymd, daysToAdd) => {
  const d = toLocalDateNoon(String(ymd).slice(0, 10));
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Number(daysToAdd || 0));
  return localYmd(d);
};

const dayDateLabel = (dayName) => {
  const idx = ALL_DAYS.indexOf(String(dayName || ''));
  if (idx < 0) return '';
  const ymd = addDaysYmd(weekStart.value, idx);
  // Use noon to avoid DST edge-cases around midnight.
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const weekStart = ref(startOfWeekMondayYmd(props.weekStartYmd || new Date()));

const effectiveAgencyId = computed(() => {
  const n = Number(props.agencyId || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const canCreateRequests = computed(() => props.mode === 'self');

const load = async () => {
  if (!props.userId) return;
  if (!effectiveAgencyId.value) {
    summary.value = null;
    error.value = 'Select an organization first.';
    return;
  }

  try {
    loading.value = true;
    error.value = '';

    const resp = await api.get(`/users/${props.userId}/schedule-summary`, {
      params: {
        weekStart: weekStart.value,
        agencyId: effectiveAgencyId.value,
        includeGoogleBusy: showGoogleBusy.value ? 'true' : 'false',
        ...(selectedExternalCalendarIds.value.length
          ? { externalCalendarIds: selectedExternalCalendarIds.value.join(',') }
          : {})
      }
    });
    summary.value = resp.data || null;
  } catch (e) {
    summary.value = null;
    error.value = e.response?.data?.error?.message || 'Failed to load schedule';
  } finally {
    loading.value = false;
  }
};

watch([() => props.userId, effectiveAgencyId], () => load(), { immediate: true });
watch([showGoogleBusy, selectedExternalCalendarIds], () => load(), { deep: true });

watch(
  () => props.weekStartYmd,
  (next) => {
    if (!next) return;
    const monday = startOfWeekMondayYmd(next);
    if (monday && monday !== weekStart.value) {
      weekStart.value = monday;
      load();
    }
  }
);

watch(externalCalendarsAvailable, (next) => {
  // Drop selections that no longer exist in the available list.
  const allowed = new Set((next || []).map((c) => Number(c.id)));
  const current = (selectedExternalCalendarIds.value || []).map((n) => Number(n)).filter((n) => allowed.has(n));
  if (current.length !== (selectedExternalCalendarIds.value || []).length) {
    selectedExternalCalendarIds.value = current;
  }

  // Admin/audit view should show overlays by default (first load only).
  if (!initializedOverlayDefaults.value && props.mode === 'admin') {
    if (selectedExternalCalendarIds.value.length === 0 && allowed.size > 0) {
      selectedExternalCalendarIds.value = Array.from(allowed.values());
    }
    // Default Google busy on for admin auditing.
    showGoogleBusy.value = true;
    initializedOverlayDefaults.value = true;
  }
});

const prevWeek = () => {
  weekStart.value = addDaysYmd(weekStart.value, -7);
  load();
};
const nextWeek = () => {
  weekStart.value = addDaysYmd(weekStart.value, 7);
  load();
};

const weekdayToIndex = (dayName) => {
  // Backend expects 0=Sunday..6=Saturday
  const map = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 0 };
  return map[String(dayName)] ?? null;
};

const overlapsHour = (startHHMM, endHHMM, hour) => {
  const start = String(startHHMM || '').slice(0, 5);
  const end = String(endHHMM || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return false;
  const slotStart = `${pad2(hour)}:00`;
  const slotEnd = `${pad2(hour + 1)}:00`;
  return start < slotEnd && end > slotStart;
};

const hasRequest = (dayName, hour) => {
  const s = summary.value;
  if (!s) return false;
  for (const r of s.officeRequests || []) {
    for (const slot of r.slots || []) {
      const dn = ALL_DAYS[((Number(slot.weekday) + 6) % 7)] || null; // 0=Sun -> Sunday(end), 1=Mon -> Monday
      if (dn !== dayName) continue;
      if (Number(hour) >= Number(slot.startHour) && Number(hour) < Number(slot.endHour)) return true;
    }
  }
  for (const r of s.schoolRequests || []) {
    for (const b of r.blocks || []) {
      if (String(b.dayOfWeek) !== dayName) continue;
      if (overlapsHour(b.startTime, b.endTime, hour)) return true;
    }
  }
  return false;
};

const hasSchool = (dayName, hour) => {
  const s = summary.value;
  if (!s) return false;
  for (const a of s.schoolAssignments || []) {
    if (String(a.dayOfWeek) !== dayName) continue;
    if (overlapsHour(a.startTime, a.endTime, hour)) return true;
  }
  return false;
};

const stateRank = (st) => {
  const v = String(st || '').toUpperCase();
  if (v === 'ASSIGNED_BOOKED') return 3;
  if (v === 'ASSIGNED_TEMPORARY') return 2;
  if (v === 'ASSIGNED_AVAILABLE') return 1;
  return 0;
};

const dayIndexForDateLocal = (dateYmd, ws) => {
  const a = new Date(`${String(ws).slice(0, 10)}T00:00:00`);
  const b = new Date(`${String(dateYmd).slice(0, 10)}T00:00:00`);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
};

const officeState = (dayName, hour) => {
  const s = summary.value;
  if (!s) return '';
  let best = '';
  let bestRank = 0;
  for (const e of s.officeEvents || []) {
    const startRaw = String(e.startAt || '').trim();
    if (!startRaw) continue;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime())) continue;
    const idx = dayIndexForDateLocal(localYmd(startLocal), s.weekStart || weekStart.value);
    const dn = ALL_DAYS[idx] || null;
    if (dn !== dayName) continue;
    if (startLocal.getHours() !== Number(hour)) continue;
    const r = stateRank(e.slotState);
    if (r > bestRank) {
      bestRank = r;
      best = String(e.slotState || '');
    }
  }
  return best;
};

const hasBusyIntervals = (busyList, dayName, hour, ws) => {
  for (const b of busyList || []) {
    const start = new Date(b.startAt);
    const end = new Date(b.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const idx = dayIndexForDateLocal(localYmd(start), ws);
    const dn = ALL_DAYS[idx] || null;
    // Also handle intervals that span days by checking the localYmd for the hour cell’s day.
    if (dn !== dayName && localYmd(end) !== localYmd(start)) {
      // fallthrough: we’ll rely on overlap check below using day boundary
    }

    // Check overlap against the cell’s local hour window.
    const cellDate = addDaysYmd(ws, ALL_DAYS.indexOf(dayName));
    const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
    const cellEnd = new Date(`${cellDate}T${pad2(hour + 1)}:00:00`);
    if (end > cellStart && start < cellEnd) return true;
  }
  return false;
};

const hasGoogleBusy = (dayName, hour) => {
  const s = summary.value;
  if (!s) return false;
  return hasBusyIntervals(s.googleBusy || [], dayName, hour, s.weekStart || weekStart.value);
};
const hasExternalBusy = (dayName, hour) => {
  const s = summary.value;
  if (!s) return false;
  const cals = Array.isArray(s.externalCalendars) ? s.externalCalendars : [];
  for (const c of cals) {
    if (hasBusyIntervals(c?.busy || [], dayName, hour, s.weekStart || weekStart.value)) return true;
  }
  return false;
};

const requestTitle = (dayName, hour) => `Pending request — ${dayName} ${hourLabel(hour)}`;
const schoolTitle = (dayName, hour) => `School assigned — ${dayName} ${hourLabel(hour)}`;
const officeTitle = (dayName, hour) => {
  const s = summary.value;
  const hits = (s?.officeEvents || []).filter((e) => {
    const startRaw = String(e.startAt || '').trim();
    if (!startRaw) return false;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime())) return false;
    const idx = dayIndexForDateLocal(localYmd(startLocal), s.weekStart || weekStart.value);
    const dn = ALL_DAYS[idx] || null;
    return dn === dayName && startLocal.getHours() === Number(hour);
  });
  const top = hits.sort((a, b) => stateRank(b.slotState) - stateRank(a.slotState))[0];
  if (!top) return `Office — ${dayName} ${hourLabel(hour)}`;
  const room = top.roomLabel || 'Office';
  const bld = top.buildingName || 'Building';
  const st = String(top.slotState || '').toUpperCase();
  const label = st === 'ASSIGNED_BOOKED' ? 'Booked' : st === 'ASSIGNED_TEMPORARY' ? 'Temporary' : 'Assigned';
  return `${label} — ${bld} • ${room} — ${dayName} ${hourLabel(hour)}`;
};
const googleBusyTitle = (dayName, hour) => `Google busy — ${dayName} ${hourLabel(hour)}`;
const externalBusyLabels = (dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  const cals = Array.isArray(s.externalCalendars) ? s.externalCalendars : [];
  const labels = [];
  for (const c of cals) {
    const label = String(c?.label || '').trim();
    if (!label) continue;
    if (hasBusyIntervals(c?.busy || [], dayName, hour, s.weekStart || weekStart.value)) labels.push(label);
  }
  return labels;
};
const externalBusyTitle = (dayName, hour) => {
  const labels = externalBusyLabels(dayName, hour);
  const suffix = labels.length ? ` (${labels.join(', ')})` : '';
  return `EHR busy${suffix} — ${dayName} ${hourLabel(hour)}`;
};

const externalBusyShortLabel = (dayName, hour) => {
  const labels = externalBusyLabels(dayName, hour);
  if (!labels.length) return 'Busy';
  if (labels.length === 1) return labels[0];
  return `${labels[0]}+${labels.length - 1}`;
};

const cellBlocks = (dayName, hour) => {
  const blocks = [];

  // Office assignment state
  const st = String(officeState(dayName, hour) || '').toUpperCase();
  if (st === 'ASSIGNED_BOOKED') {
    blocks.push({ key: 'office-booked', kind: 'ob', shortLabel: 'Booked', title: officeTitle(dayName, hour) });
  } else if (st === 'ASSIGNED_TEMPORARY') {
    blocks.push({ key: 'office-temp', kind: 'ot', shortLabel: 'Temp', title: officeTitle(dayName, hour) });
  } else if (st === 'ASSIGNED_AVAILABLE') {
    blocks.push({ key: 'office-assigned', kind: 'oa', shortLabel: 'Office', title: officeTitle(dayName, hour) });
  }

  // Assigned school
  if (hasSchool(dayName, hour)) {
    blocks.push({ key: 'school-assigned', kind: 'school', shortLabel: 'School', title: schoolTitle(dayName, hour) });
  }

  // Pending request
  if (hasRequest(dayName, hour)) {
    blocks.push({ key: 'request', kind: 'request', shortLabel: 'Req', title: requestTitle(dayName, hour) });
  }

  // Busy overlays
  if (showGoogleBusy.value && hasGoogleBusy(dayName, hour)) {
    blocks.push({ key: 'gbusy', kind: 'gbusy', shortLabel: 'G', title: googleBusyTitle(dayName, hour) });
  }
  if (selectedExternalCalendarIds.value.length && hasExternalBusy(dayName, hour)) {
    blocks.push({ key: 'ebusy', kind: 'ebusy', shortLabel: externalBusyShortLabel(dayName, hour), title: externalBusyTitle(dayName, hour) });
  }

  // Side-by-side if multiple; keep it readable: show at most 3 blocks, then "+N".
  if (blocks.length > 3) {
    const extra = blocks.length - 2;
    return [
      blocks[0],
      blocks[1],
      { key: 'more', kind: 'more', shortLabel: `+${extra}`, title: `${extra} more items in this hour` }
    ];
  }
  return blocks;
};

const overlayErrorText = computed(() => {
  const s = summary.value;
  if (!s) return '';
  const googleErr = showGoogleBusy.value ? String(s?.googleBusyError || '').trim() : '';
  const cals = Array.isArray(s.externalCalendars) ? s.externalCalendars : [];
  const errors = (cals || [])
    .map((c) => ({ label: String(c?.label || '').trim(), err: String(c?.error || '').trim() }))
    .filter((x) => x.err)
    .slice(0, 2);
  const parts = [];
  if (googleErr) parts.push(`Google busy: ${googleErr}`);
  if (errors.length) parts.push(`EHR: ${errors.map((e) => (e.label ? `${e.label}: ${e.err}` : e.err)).join(' • ')}`);
  return parts.length ? `Calendar overlay error: ${parts.join(' • ')}` : '';
});

// ---- In-grid request creation (self mode) ----
const showRequestModal = ref(false);
const modalDay = ref('Monday');
const modalHour = ref(7);
const modalEndHour = ref(8);
const requestType = ref('office'); // office | school
const requestNotes = ref('');
const submitting = ref(false);
const modalError = ref('');

const endHourOptions = computed(() => {
  const start = Number(modalHour.value || 0);
  // Grid hours are 7..21 (end 22). Allow multi-hour ranges up to end-of-grid.
  const maxEnd = 22;
  const out = [];
  for (let h = start + 1; h <= maxEnd; h++) out.push(h);
  return out;
});

const isWeekdayName = (dayName) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(String(dayName || ''));
const canUseSchool = (dayName, startHour, endHour) => {
  const sh = Number(startHour);
  const eh = Number(endHour);
  if (!isWeekdayName(dayName)) return false;
  if (!(eh > sh)) return false;
  // School daytime availability must be between 06:00 and 18:00.
  return sh >= 6 && eh <= 18;
};

const onCellClick = (dayName, hour) => {
  if (!canCreateRequests.value) return;
  modalDay.value = dayName;
  modalHour.value = Number(hour);
  // Default to a 1-hour range; clamp to end-of-grid.
  const nextEnd = Math.min(Number(hour) + 1, 22);
  modalEndHour.value = nextEnd > Number(hour) ? nextEnd : Number(hour) + 1;
  requestType.value = 'office';
  requestNotes.value = '';
  modalError.value = '';
  showRequestModal.value = true;
};

const closeModal = () => {
  showRequestModal.value = false;
};

const submitRequest = async () => {
  if (!effectiveAgencyId.value) return;
  try {
    submitting.value = true;
    modalError.value = '';

    const dn = modalDay.value;
    const h = Number(modalHour.value);
    const endH = Number(modalEndHour.value);
    if (!(endH > h)) throw new Error('End time must be after start time.');

    if (requestType.value === 'office') {
      const weekday = weekdayToIndex(dn);
      if (weekday === null) throw new Error('Invalid weekday');
      await api.post('/availability/office-requests', {
        agencyId: effectiveAgencyId.value,
        preferredOfficeIds: [],
        notes: requestNotes.value || '',
        slots: [{ weekday, startHour: h, endHour: endH }]
      });
    } else {
      if (!canUseSchool(dn, h, endH)) throw new Error('School daytime availability must be on weekdays and between 06:00 and 18:00.');
      await api.post('/availability/school-requests', {
        agencyId: effectiveAgencyId.value,
        notes: requestNotes.value || '',
        blocks: [{
          dayOfWeek: dn,
          startTime: `${pad2(h)}:00`,
          endTime: `${pad2(endH)}:00`
        }]
      });
    }

    closeModal();
    await load();
  } catch (e) {
    modalError.value = e.response?.data?.error?.message || e.message || 'Failed to submit request';
  } finally {
    submitting.value = false;
  }
};

watch(modalHour, () => {
  const start = Number(modalHour.value || 0);
  const minEnd = start + 1;
  const maxEnd = 22;
  const current = Number(modalEndHour.value || 0);
  if (!(current > start)) modalEndHour.value = Math.min(minEnd, maxEnd);
  if (current > maxEnd) modalEndHour.value = maxEnd;
  if (modalEndHour.value <= start) modalEndHour.value = Math.min(start + 1, maxEnd);
});
</script>

<style scoped>
.sched-toolbar { margin-top: 10px; }
.sched-toolbar-top {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}
.sched-week-title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.sched-toolbar-main {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: nowrap;
  justify-content: space-between;
}
.sched-toolbar-left,
.sched-toolbar-right {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}
.sched-btn {
  width: auto;
  min-width: auto;
  white-space: nowrap;
  padding-left: 10px;
  padding-right: 10px;
}
.sched-toolbar-secondary {
  margin-top: 8px;
}
.sched-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}
.sched-calendars {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-left: 6px;
  border-left: 1px solid var(--border);
}
.sched-calendars-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  white-space: nowrap;
}
.sched-grid-wrap {
  margin-top: 12px;
  overflow-x: auto;
}
.legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.swatch {
  width: 14px;
  height: 10px;
  border-radius: 6px;
  border: 1px solid rgba(0,0,0,0.12);
  display: inline-block;
}
.swatch-request { background: rgba(242, 201, 76, 0.35); border-color: rgba(242, 201, 76, 0.65); }
.swatch-school { background: rgba(45, 156, 219, 0.28); border-color: rgba(45, 156, 219, 0.60); }
.swatch-oa { background: rgba(39, 174, 96, 0.22); border-color: rgba(39, 174, 96, 0.55); }
.swatch-ot { background: rgba(242, 153, 74, 0.24); border-color: rgba(242, 153, 74, 0.58); }
.swatch-ob { background: rgba(235, 87, 87, 0.22); border-color: rgba(235, 87, 87, 0.58); }
.swatch-gbusy { background: rgba(17, 24, 39, 0.18); border-color: rgba(17, 24, 39, 0.45); }
.swatch-ebusy { background: rgba(107, 114, 128, 0.18); border-color: rgba(107, 114, 128, 0.45); }
.sched-grid {
  display: grid;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.sched-head-cell {
  padding: 8px 10px;
  font-weight: 900;
  background: var(--bg-alt);
  border-bottom: 1px solid var(--border);
  border-left: 1px solid var(--border);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sched-grid > .sched-head-cell:first-child {
  border-left: none;
}
.sched-head-day {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  justify-content: center;
  line-height: 1.05;
}
.sched-head-dow {
  font-weight: 900;
}
.sched-head-date {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}
.sched-hour {
  padding: 8px 10px;
  font-weight: 800;
  border-top: 1px solid var(--border);
  background: var(--bg-alt);
}
.sched-cell {
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  border-left: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.65);
  min-height: 32px;
  padding: 4px 6px;
  text-align: left;
}
.sched-cell.clickable {
  cursor: pointer;
}
.sched-cell.clickable:hover {
  background: rgba(2, 132, 199, 0.06);
}
.cell-blocks {
  display: flex;
  gap: 4px;
  align-items: stretch;
  justify-content: flex-start;
  height: 100%;
}
.cell-block {
  flex: 1 1 0;
  min-width: 0;
  border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.12);
  padding: 2px 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(1px);
}
.cell-block-text {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-block-request { background: rgba(242, 201, 76, 0.35); border-color: rgba(242, 201, 76, 0.65); }
.cell-block-school { background: rgba(45, 156, 219, 0.28); border-color: rgba(45, 156, 219, 0.60); }
.cell-block-oa { background: rgba(39, 174, 96, 0.22); border-color: rgba(39, 174, 96, 0.55); }
.cell-block-ot { background: rgba(242, 153, 74, 0.24); border-color: rgba(242, 153, 74, 0.58); }
.cell-block-ob { background: rgba(235, 87, 87, 0.22); border-color: rgba(235, 87, 87, 0.58); }
.cell-block-gbusy { background: rgba(17, 24, 39, 0.14); border-color: rgba(17, 24, 39, 0.42); color: rgba(17, 24, 39, 0.9); }
.cell-block-ebusy { background: rgba(107, 114, 128, 0.16); border-color: rgba(107, 114, 128, 0.45); color: rgba(17, 24, 39, 0.9); }
.cell-block-more { background: rgba(148, 163, 184, 0.18); border-color: rgba(148, 163, 184, 0.45); color: rgba(51, 65, 85, 0.92); }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 5000;
}
.modal {
  width: 100%;
  max-width: 520px;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  box-shadow: 0 18px 44px rgba(0,0,0,0.18);
  padding: 14px;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.modal-title {
  font-weight: 900;
}
.modal-body {
  margin-top: 10px;
}
.lbl {
  display: block;
  font-weight: 800;
  margin-bottom: 6px;
}
.input {
  width: 100%;
}
.modal-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 860px) {
  .sched-toolbar-main {
    flex-wrap: wrap;
  }
  .sched-toolbar-left,
  .sched-toolbar-right {
    flex-wrap: wrap;
  }
}
</style>

