<template>
  <div class="sched-wrap" :style="scheduleColorVars">
    <div class="sched-toolbar">
      <div class="sched-toolbar-top">
        <h2 class="sched-week-title">Week of {{ weekStart }}</h2>
        <div class="sched-week-meta">
          <div class="sched-today-label">Today {{ todayMmdd }}</div>
          <button class="btn btn-secondary btn-sm sched-btn" type="button" @click="goToTodayWeek" :disabled="loading">Today</button>
        </div>
      </div>
      <div class="sched-toolbar-main">
        <div class="sched-toolbar-left">
          <div class="sched-view-switch" role="tablist" aria-label="Schedule view">
            <button
              v-for="opt in viewModeOptions"
              :key="`view-${opt.id}`"
              type="button"
              class="sched-seg"
              role="tab"
              :aria-selected="String(viewMode === opt.id)"
              :class="{ on: viewMode === opt.id }"
              :disabled="loading"
              @click="viewMode = opt.id"
            >
              {{ opt.label }}
            </button>
          </div>
          <button class="btn btn-secondary btn-sm sched-btn" type="button" @click="prevWeek" :disabled="loading">← Prev</button>
          <button class="btn btn-secondary btn-sm sched-btn" type="button" @click="nextWeek" :disabled="loading">Next →</button>
        </div>

        <div class="sched-toolbar-right">
          <label class="sched-inline">
            <span>Office</span>
            <select v-model.number="selectedOfficeLocationId" class="sched-select" :disabled="loading || officeGridLoading">
              <option :value="0">None</option>
              <option v-for="o in officeLocations" :key="`sched-office-${o.id}`" :value="Number(o.id)">{{ o.name }}</option>
            </select>
          </label>

          <button
            v-if="selectedOfficeLocationId"
            class="sched-icon-btn"
            type="button"
            title="Clear office selection"
            :disabled="loading || officeGridLoading"
            @click="selectedOfficeLocationId = 0"
          >
            ✕
          </button>

          <button
            type="button"
            class="sched-pill"
            :class="{ on: showGoogleBusy }"
            role="switch"
            :aria-checked="String(!!showGoogleBusy)"
            :disabled="loading"
            @click="showGoogleBusy = !showGoogleBusy"
          >
            Google busy
          </button>

          <button
            type="button"
            class="sched-pill"
            :class="{ on: showGoogleEvents }"
            role="switch"
            :aria-checked="String(!!showGoogleEvents)"
            :disabled="loading"
            @click="showGoogleEvents = !showGoogleEvents"
            title="Shows event titles (sensitive)"
          >
            Google titles
          </button>

          <button
            type="button"
            class="sched-pill"
            :class="{ on: hideWeekend }"
            role="switch"
            :aria-checked="String(!!hideWeekend)"
            :disabled="loading"
            @click="hideWeekend = !hideWeekend"
          >
            Hide weekends
          </button>

          <button
            v-if="!calendarsHidden"
            class="sched-pill"
            type="button"
            :disabled="loading"
            @click="hideAllCalendars"
            title="Hide all calendar overlays (keeps office overlay)"
          >
            Hide calendars
          </button>
          <button
            v-else
            class="sched-pill on"
            type="button"
            :disabled="loading"
            @click="showAllCalendars"
            title="Restore calendar overlays"
          >
            Show calendars
          </button>

          <button class="btn btn-secondary btn-sm sched-btn" type="button" @click="load" :disabled="loading">Refresh</button>
        </div>
      </div>

      <div v-if="selectedOfficeLocationId && officeGridError" class="error" style="margin-top: 10px;">
        {{ officeGridError }}
      </div>
      <div v-else-if="selectedOfficeLocationId && officeGridLoading" class="loading" style="margin-top: 10px;">
        Loading office availability…
      </div>

      <div v-if="externalCalendarsAvailable.length" class="sched-toolbar-secondary">
        <div class="sched-calendars">
          <div class="sched-calendars-label">EHR calendars</div>
          <div class="sched-calendars-actions">
            <button type="button" class="sched-chip" :disabled="loading" @click="selectAllExternalCalendars">All</button>
            <button type="button" class="sched-chip" :disabled="loading" @click="clearExternalCalendars">None</button>
          </div>
          <button
            v-for="c in externalCalendarsAvailable"
            :key="`cal-${c.id}`"
            type="button"
            class="sched-chip"
            :class="{ on: selectedExternalCalendarIds.includes(Number(c.id)) }"
            :disabled="loading"
            @click="toggleExternalCalendar(Number(c.id))"
          >
            {{ c.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Office layout view (room-by-room weekly board) -->
    <div v-if="viewMode === 'office_layout'" class="sched-grid-wrap">
      <div v-if="!selectedOfficeLocationId" class="hint" style="margin-top: 10px;">
        Select an office above to view the room-by-room weekly layout.
      </div>
      <div v-else-if="officeGridError" class="error" style="margin-top: 10px;">{{ officeGridError }}</div>
      <div v-else-if="officeGridLoading" class="loading" style="margin-top: 10px;">Loading office availability…</div>
      <OfficeWeeklyRoomGrid
        v-else
        :office-grid="officeGrid"
        :today-ymd="todayLocalYmd"
        :can-book="canCreateRequests"
        @cell-click="onOfficeLayoutCellClick"
      />
    </div>

    <!-- Open finder view (existing personal grid) -->
    <template v-else>
      <div v-if="error" class="error" style="margin-top: 10px;">{{ error }}</div>
      <div v-if="loading" class="loading" style="margin-top: 10px;">Loading schedule…</div>
      <div v-if="googleBusyDisabledHint" class="hint" style="margin-top: 10px;">
        {{ googleBusyDisabledHint }}
      </div>
      <div v-if="overlayErrorText" class="error" style="margin-top: 10px;">
        {{ overlayErrorText }}
      </div>

      <div v-else-if="summary" class="sched-grid-wrap">
      <div class="legend">
        <div class="legend-item"><span class="swatch swatch-request"></span> Pending request</div>
        <div class="legend-item"><span class="swatch swatch-school"></span> School assigned</div>
        <div class="legend-item"><span class="swatch swatch-supv"></span> Supervision</div>
        <div class="legend-item"><span class="swatch swatch-oa"></span> Office assigned</div>
        <div class="legend-item"><span class="swatch swatch-ot"></span> Office temporary</div>
        <div class="legend-item"><span class="swatch swatch-ob"></span> Office booked</div>
        <div class="legend-item" v-if="showGoogleBusy"><span class="swatch swatch-gbusy"></span> Google busy</div>
        <div class="legend-item" v-if="showGoogleEvents"><span class="swatch swatch-gevt"></span> Google event</div>
        <div class="legend-item" v-if="selectedExternalCalendarIds.length"><span class="swatch swatch-ebusy"></span> EHR busy</div>
      </div>

      <div class="sched-grid" :style="gridStyle">
        <div class="sched-head-cell"></div>
        <div v-for="d in visibleDays" :key="d" class="sched-head-cell" :class="{ 'sched-head-today': isTodayDay(d) }">
          <div class="sched-head-day">
            <div class="sched-head-dow">{{ d }}</div>
            <div class="sched-head-date">{{ dayDateLabel(d) }}</div>
          </div>
        </div>

        <template v-for="h in hours" :key="`h-${h}`">
          <div class="sched-hour">{{ hourLabel(h) }}</div>

          <div
            v-for="d in visibleDays"
            :key="`c-${d}-${h}`"
            class="sched-cell"
            :class="{ clickable: canCreateRequests, 'sched-cell-today': isTodayDay(d) }"
            @click="onCellClick(d, h)"
            role="button"
            :tabindex="0"
            @keydown.enter.prevent="onCellClick(d, h)"
            @keydown.space.prevent="onCellClick(d, h)"
          >
            <div v-if="availabilityClass(d, h)" class="cell-avail" :class="availabilityClass(d, h)"></div>
            <div
              v-if="selectedOfficeLocationId && officeOverlay(d, h)"
              class="cell-office-overlay"
              :style="officeOverlayStyle"
              :title="officeOverlayTitle(d, h)"
            >
              {{ officeOverlay(d, h) }}
            </div>
            <div class="cell-blocks">
              <div
                v-for="b in cellBlocks(d, h)"
                :key="b.key"
                class="cell-block"
                :class="`cell-block-${b.kind}`"
                :title="b.title"
                :style="cellBlockStyle(b)"
                @click="onCellBlockClick($event, b, d, h)"
              >
                <span class="cell-block-text">{{ b.shortLabel }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
      </div>
    </template>

    <div v-if="showRequestModal" class="modal-backdrop" @click.self="closeModal">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">Request / book time</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeModal">Close</button>
        </div>

        <div class="muted" style="margin-top: 6px;">
          {{ modalDay }} • {{ hourLabel(modalHour) }}–{{ hourLabel(modalEndHour) }}
        </div>

        <div class="modal-body">
          <label class="lbl">Request type</label>
          <select v-model="requestType" class="input">
            <option value="office">Office booking</option>
            <option value="school" :disabled="!canUseSchool(modalDay, modalHour, modalEndHour)">School daytime availability</option>
            <option value="supervision" :disabled="supervisorsLoading || supervisors.length === 0">Supervision (adds to Google Calendar)</option>
          </select>
          <div v-if="requestType === 'school' && !canUseSchool(modalDay, modalHour, modalEndHour)" class="muted" style="margin-top: 6px;">
            School daytime availability must be on weekdays and between 06:00 and 18:00.
          </div>
          <div v-if="requestType === 'supervision' && supervisorsLoading" class="muted" style="margin-top: 6px;">
            Loading supervisors…
          </div>
          <div v-if="requestType === 'supervision' && !supervisorsLoading && supervisors.length === 0" class="muted" style="margin-top: 6px;">
            No supervisor is assigned. Ask an admin to add a supervisor assignment first.
          </div>

          <div v-if="requestType === 'supervision' && supervisors.length" style="margin-top: 10px;">
            <label class="lbl">Supervisor</label>
            <select v-model.number="selectedSupervisorId" class="input">
              <option :value="0">Select…</option>
              <option v-for="s in supervisors" :key="`sup-${s.supervisor_id}`" :value="Number(s.supervisor_id)">
                {{ (s.supervisor_first_name || '') + ' ' + (s.supervisor_last_name || '') }}
              </option>
            </select>

            <label class="sched-toggle" style="margin-top: 8px;">
              <input type="checkbox" v-model="createMeetLink" />
              <span>Create Google Meet link</span>
            </label>
          </div>

          <div v-if="requestType === 'office'" style="margin-top: 10px;">
            <div v-if="!selectedOfficeLocationId" class="muted">
              Select an office from the toolbar above to view open/assigned/booked time and place a booking request.
            </div>
            <template v-else>
              <label class="lbl">Frequency</label>
              <select v-model="officeBookingRecurrence" class="input">
                <option value="ONCE">Once</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>

              <label class="lbl" style="margin-top: 10px;">Room</label>
              <div v-if="officeGridLoading" class="muted">Loading rooms…</div>
              <div v-else-if="officeGridError" class="error">{{ officeGridError }}</div>
              <div v-else class="office-room-picker">
                <label class="office-room-option">
                  <input type="radio" name="office-room" :value="0" v-model.number="selectedOfficeRoomId" />
                  <span class="office-room-label">Any open room</span>
                </label>
                <label
                  v-for="opt in modalOfficeRoomOptions"
                  :key="`room-opt-${opt.roomId}`"
                  class="office-room-option"
                  :class="{ disabled: !opt.requestable }"
                >
                  <input type="radio" name="office-room" :value="opt.roomId" v-model.number="selectedOfficeRoomId" :disabled="!opt.requestable" />
                  <span class="office-room-label">{{ opt.label }}</span>
                  <span class="office-room-meta">{{ opt.stateLabel }}</span>
                </label>
              </div>
              <div v-if="officeBookingHint" class="muted" style="margin-top: 6px;">{{ officeBookingHint }}</div>
            </template>
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
            :disabled="
              submitting ||
              (requestType === 'office' && !officeBookingValid) ||
              (requestType === 'school' && !canUseSchool(modalDay, modalHour, modalEndHour)) ||
              (requestType === 'supervision' && (supervisorsLoading || supervisors.length === 0 || !selectedSupervisorId))
            "
          >
            {{ submitting ? 'Submitting…' : 'Submit request' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showSupvModal" class="modal-backdrop" @click.self="closeSupvModal">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">Supervision session</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeSupvModal">Close</button>
        </div>

        <div v-if="supvModalError" class="error" style="margin-top: 10px;">{{ supvModalError }}</div>

        <div class="muted" style="margin-top: 6px;">
          {{ supvDayLabel }} • {{ hourLabel(supvStartHour) }}–{{ hourLabel(supvEndHour) }}
        </div>

        <div class="modal-body">
          <div v-if="supvOptions.length > 1" style="margin-bottom: 10px;">
            <label class="lbl">Session</label>
            <select v-model.number="selectedSupvSessionId" class="input">
              <option v-for="o in supvOptions" :key="`supv-opt-${o.id}`" :value="o.id">
                {{ o.label }}
              </option>
            </select>
          </div>

          <div class="field-grid">
            <div>
              <label class="lbl">Start</label>
              <input v-model="supvStartIsoLocal" class="input" type="datetime-local" />
            </div>
            <div>
              <label class="lbl">End</label>
              <input v-model="supvEndIsoLocal" class="input" type="datetime-local" />
            </div>
          </div>

          <div style="margin-top: 10px;">
            <label class="lbl">Notes</label>
            <textarea v-model="supvNotes" class="input" rows="4" placeholder="Optional notes for the Google Calendar description…" />
          </div>

          <div v-if="selectedSupvSession?.googleMeetLink" class="muted" style="margin-top: 8px;">
            Meet:
            <a :href="selectedSupvSession.googleMeetLink" target="_blank" rel="noreferrer">
              {{ selectedSupvSession.googleMeetLink }}
            </a>
          </div>

          <label class="sched-toggle" style="margin-top: 10px;">
            <input type="checkbox" v-model="supvCreateMeetLink" />
            <span>Create Google Meet link (only if missing)</span>
          </label>

          <div class="modal-actions" style="justify-content: space-between;">
            <button class="btn btn-danger" type="button" @click="cancelSupvSession" :disabled="supvSaving || !selectedSupvSessionId">
              Cancel session
            </button>
            <button class="btn btn-primary" type="button" @click="saveSupvSession" :disabled="supvSaving || !selectedSupvSessionId">
              {{ supvSaving ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showOfficeAssignModal" class="modal-backdrop" @click.self="closeOfficeAssignModal">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">Assign office slot</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeOfficeAssignModal">Close</button>
        </div>

        <div v-if="officeAssignError" class="error" style="margin-top: 10px;">{{ officeAssignError }}</div>

        <div class="muted" style="margin-top: 6px;">
          {{ officeAssignDay }} • {{ hourLabel(officeAssignStartHour) }}–{{ hourLabel(officeAssignEndHour) }}
        </div>

        <div class="modal-body">
          <div class="field-grid">
            <div>
              <label class="lbl">Office location</label>
              <select v-model.number="officeAssignBuildingId" class="input" :disabled="officeAssignLoading">
                <option :value="0">Select…</option>
                <option v-for="o in officeLocations" :key="`bld-${o.id}`" :value="Number(o.id)">{{ o.name }}</option>
              </select>
            </div>
            <div>
              <label class="lbl">Office</label>
              <select v-model.number="officeAssignRoomId" class="input" :disabled="officeAssignLoading || !officeAssignBuildingId">
                <option :value="0">Select…</option>
                <option v-for="r in officeRooms" :key="`room-${r.id}`" :value="Number(r.id)">
                  {{ r.roomNumber ? `#${r.roomNumber}` : '' }} {{ r.label || r.name }}
                </option>
              </select>
            </div>
          </div>

          <div style="margin-top: 10px;">
            <label class="lbl">End time</label>
            <select v-model.number="officeAssignEndHour" class="input" :disabled="officeAssignLoading">
              <option v-for="h in officeAssignEndHourOptions" :key="`oa-end-${h}`" :value="h">
                {{ hourLabel(h) }}
              </option>
            </select>
          </div>

          <div class="modal-actions" style="justify-content: space-between;">
            <div class="muted" style="font-size: 12px;">
              Assigns {{ isAdminMode ? 'this user' : '' }} without a request.
            </div>
            <button class="btn btn-primary" type="button" @click="submitOfficeAssign" :disabled="officeAssignLoading || !officeAssignBuildingId || !officeAssignRoomId">
              {{ officeAssignLoading ? 'Assigning…' : 'Assign' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import OfficeWeeklyRoomGrid from './OfficeWeeklyRoomGrid.vue';

const props = defineProps({
  userId: { type: Number, required: true },
  agencyId: { type: [Number, String], default: null },
  // Optional: multi-agency mode (admin viewing a user's schedule across multiple agencies).
  // When provided (non-empty), the grid loads and merges schedule summaries for each agency.
  agencyIds: { type: Array, default: null },
  // Optional: map of agencyId -> label for tooltips (helps explain overlaps).
  agencyLabelById: { type: Object, default: null },
  mode: { type: String, default: 'self' }, // 'self' | 'admin'
  // Optional: parent-controlled weekStart (any date; normalized to Monday).
  weekStartYmd: { type: String, default: null },
  // Optional: availability overlay (computed server-side), to highlight open slots.
  availabilityOverlay: { type: Object, default: null }
});
const emit = defineEmits(['update:weekStartYmd']);

const authStore = useAuthStore();

const defaultScheduleColors = () => ({
  request: '#F2C94C',
  school: '#2D9CDB',
  supervision: '#9B51E0',
  office_assigned: '#27AE60',
  office_temporary: '#9B51E0',
  office_booked: '#EB5757',
  google_busy: '#111827',
  ehr_busy: '#F2994A'
});

const scheduleColors = ref(defaultScheduleColors());

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

const loadMyScheduleColors = async () => {
  try {
    const myId = Number(authStore.user?.id || 0);
    if (!myId) return;
    const resp = await api.get(`/users/${myId}/preferences`);
    const colors = parseJsonMaybe(resp.data?.schedule_color_overrides);
    scheduleColors.value = { ...defaultScheduleColors(), ...(colors || {}) };
  } catch {
    // best effort; fall back to defaults
    scheduleColors.value = defaultScheduleColors();
  }
};

const clampHex = (hex) => {
  const s = String(hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1], g = s[2], b = s[3];
    return (`#${r}${r}${g}${g}${b}${b}`).toUpperCase();
  }
  return null;
};

const hexToRgb = (hex) => {
  const h = clampHex(hex);
  if (!h) return null;
  const x = h.slice(1);
  const r = parseInt(x.slice(0, 2), 16);
  const g = parseInt(x.slice(2, 4), 16);
  const b = parseInt(x.slice(4, 6), 16);
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;
  return { r, g, b };
};

const rgba = (hex, a) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const alpha = Math.max(0, Math.min(1, Number(a)));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const scheduleColorVars = computed(() => {
  const c = scheduleColors.value || {};
  const req = c.request;
  const school = c.school;
  const supv = c.supervision;
  const oa = c.office_assigned;
  const ot = c.office_temporary;
  const ob = c.office_booked;
  const gb = c.google_busy;
  const eb = c.ehr_busy;

  const v = {};
  const set = (k, bgA, borderA) => {
    const bg = rgba(k, bgA);
    const br = rgba(k, borderA);
    return { bg, br };
  };

  const reqv = set(req, 0.35, 0.65);
  const schv = set(school, 0.28, 0.60);
  const supvv = set(supv, 0.20, 0.55);
  const oav = set(oa, 0.22, 0.55);
  const otv = set(ot, 0.24, 0.58);
  const obv = set(ob, 0.22, 0.58);
  const gbv = set(gb, 0.14, 0.42);
  const ebv = set(eb, 0.16, 0.45);

  if (reqv.bg) v['--sched-request-bg'] = reqv.bg;
  if (reqv.br) v['--sched-request-border'] = reqv.br;
  if (schv.bg) v['--sched-school-bg'] = schv.bg;
  if (schv.br) v['--sched-school-border'] = schv.br;
  if (supvv.bg) v['--sched-supv-bg'] = supvv.bg;
  if (supvv.br) v['--sched-supv-border'] = supvv.br;
  if (oav.bg) v['--sched-oa-bg'] = oav.bg;
  if (oav.br) v['--sched-oa-border'] = oav.br;
  if (otv.bg) v['--sched-ot-bg'] = otv.bg;
  if (otv.br) v['--sched-ot-border'] = otv.br;
  if (obv.bg) v['--sched-ob-bg'] = obv.bg;
  if (obv.br) v['--sched-ob-border'] = obv.br;
  if (gbv.bg) v['--sched-gbusy-bg'] = gbv.bg;
  if (gbv.br) v['--sched-gbusy-border'] = gbv.br;
  if (ebv.bg) v['--sched-ebusy-bg'] = ebv.bg;
  if (ebv.br) v['--sched-ebusy-border'] = ebv.br;
  return v;
});

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hours = Array.from({ length: 15 }, (_, i) => 7 + i); // 7..21

const loading = ref(false);
const error = ref('');
const summary = ref(null);

// ---- Overlay visibility (persisted locally for providers) ----
// Defaults for provider UX:
// - Google busy: ON
// - Google titles: OFF (sensitive)
// - External/EHR calendars: ALL ON (once available list is loaded)
const showGoogleBusy = ref(true);
const showGoogleEvents = ref(false);
const selectedExternalCalendarIds = ref([]); // populated from available list once loaded
const hideWeekend = ref(props.mode === 'self');
const initializedOverlayDefaults = ref(false);

const viewMode = ref('open_finder'); // 'open_finder' | 'office_layout' (office_layout implemented later)

const overlayPrefsKey = computed(() => {
  if (props.mode !== 'self') return '';
  const uid = Number(authStore.user?.id || props.userId || 0);
  const agencyId = Number(props.agencyId || 0);
  if (!uid || !agencyId) return '';
  return `schedule.overlayPrefs.v1:${uid}:${agencyId}`;
});

const lastCalendarPrefs = ref(null); // { showGoogleBusy, showGoogleEvents, selectedExternalCalendarIds }
const overlayPrefsLoaded = ref(false);
const shouldDefaultSelectAllExternal = ref(false);

const coerceIdArray = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);

const loadOverlayPrefs = () => {
  if (!overlayPrefsKey.value) return null;
  try {
    const raw = window?.localStorage?.getItem?.(overlayPrefsKey.value);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const saveOverlayPrefs = () => {
  if (!overlayPrefsKey.value) return;
  try {
    const payload = {
      showGoogleBusy: !!showGoogleBusy.value,
      showGoogleEvents: !!showGoogleEvents.value,
      selectedExternalCalendarIds: coerceIdArray(selectedExternalCalendarIds.value),
      hideWeekend: !!hideWeekend.value,
      viewMode: String(viewMode.value || 'open_finder'),
      lastCalendarPrefs: lastCalendarPrefs.value
        ? {
            showGoogleBusy: !!lastCalendarPrefs.value.showGoogleBusy,
            showGoogleEvents: !!lastCalendarPrefs.value.showGoogleEvents,
            selectedExternalCalendarIds: coerceIdArray(lastCalendarPrefs.value.selectedExternalCalendarIds)
          }
        : null
    };
    window?.localStorage?.setItem?.(overlayPrefsKey.value, JSON.stringify(payload));
  } catch {
    // ignore best-effort persistence
  }
};

const calendarsHidden = computed(
  () =>
    !showGoogleBusy.value &&
    !showGoogleEvents.value &&
    (Array.isArray(selectedExternalCalendarIds.value) ? selectedExternalCalendarIds.value : []).length === 0
);

const selectAllExternalCalendars = () => {
  selectedExternalCalendarIds.value = (externalCalendarsAvailable.value || []).map((c) => Number(c.id)).filter((n) => Number.isFinite(n) && n > 0);
};

const clearExternalCalendars = () => {
  selectedExternalCalendarIds.value = [];
};

const toggleExternalCalendar = (id) => {
  const n = Number(id || 0);
  if (!Number.isFinite(n) || n <= 0) return;
  const cur = new Set((selectedExternalCalendarIds.value || []).map((x) => Number(x)));
  if (cur.has(n)) cur.delete(n);
  else cur.add(n);
  selectedExternalCalendarIds.value = Array.from(cur.values());
};

const hideAllCalendars = () => {
  // Preserve the last visible configuration so "Show calendars" can restore it.
  lastCalendarPrefs.value = {
    showGoogleBusy: !!showGoogleBusy.value,
    showGoogleEvents: !!showGoogleEvents.value,
    selectedExternalCalendarIds: (selectedExternalCalendarIds.value || []).slice()
  };
  showGoogleBusy.value = false;
  showGoogleEvents.value = false;
  selectedExternalCalendarIds.value = [];
};

const showAllCalendars = () => {
  const p = lastCalendarPrefs.value;
  if (p) {
    showGoogleBusy.value = p.showGoogleBusy !== undefined ? !!p.showGoogleBusy : true;
    showGoogleEvents.value = p.showGoogleEvents !== undefined ? !!p.showGoogleEvents : false;
    selectedExternalCalendarIds.value = coerceIdArray(p.selectedExternalCalendarIds);
    // If the restored selection is empty, default to ALL externals so "show" actually shows something.
    if (!selectedExternalCalendarIds.value.length && externalCalendarsAvailable.value.length) {
      selectAllExternalCalendars();
    }
    return;
  }
  // Fallback defaults.
  showGoogleBusy.value = true;
  showGoogleEvents.value = false;
  if (externalCalendarsAvailable.value.length) selectAllExternalCalendars();
};

const viewModeOptions = [
  { id: 'open_finder', label: 'Open finder' },
  { id: 'office_layout', label: 'Office layout' }
];

// Load persisted overlay prefs once (provider view only).
try {
  if (props.mode === 'self') {
    const saved = loadOverlayPrefs();
    if (saved) {
      showGoogleBusy.value = saved.showGoogleBusy !== undefined ? !!saved.showGoogleBusy : true;
      showGoogleEvents.value = saved.showGoogleEvents !== undefined ? !!saved.showGoogleEvents : false;
      selectedExternalCalendarIds.value = coerceIdArray(saved.selectedExternalCalendarIds);
      hideWeekend.value = saved.hideWeekend !== undefined ? !!saved.hideWeekend : true;
      viewMode.value = saved.viewMode === 'office_layout' ? 'office_layout' : 'open_finder';
      lastCalendarPrefs.value = saved.lastCalendarPrefs ? { ...saved.lastCalendarPrefs } : null;
      // If saved selection is empty, we do NOT auto-select all — user explicitly hid calendars.
      shouldDefaultSelectAllExternal.value = false;
    } else {
      // First-load defaults (select-all external happens once calendars list is known).
      showGoogleBusy.value = true;
      showGoogleEvents.value = false;
      shouldDefaultSelectAllExternal.value = true;
    }
  }
} finally {
  overlayPrefsLoaded.value = true;
}

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

const todayLocalYmd = computed(() => localYmd(new Date()));
const todayMmdd = computed(() => {
  const d = new Date();
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
});

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

const isTodayDay = (dayName) => {
  const idx = ALL_DAYS.indexOf(String(dayName || ''));
  if (idx < 0) return false;
  const ymd = addDaysYmd(weekStart.value, idx);
  return ymd === todayLocalYmd.value;
};

const dayNameForDateYmd = (dateYmd) => {
  const g = officeGrid.value;
  const d = String(dateYmd || '').slice(0, 10);
  if (g && Array.isArray(g.days)) {
    const idx = g.days.findIndex((x) => String(x || '').slice(0, 10) === d);
    if (idx >= 0) return ALL_DAYS[idx] || null;
  }
  // Fallback: compute from weekStart (assumes same week)
  const ws = String(weekStart.value || '').slice(0, 10);
  const a = new Date(`${ws}T00:00:00`);
  const b = new Date(`${d}T00:00:00`);
  const diff = Math.floor((b - a) / (1000 * 60 * 60 * 24));
  return ALL_DAYS[diff] || null;
};

const onOfficeLayoutCellClick = ({ dateYmd, hour, roomId }) => {
  if (!canCreateRequests.value) return;
  const dn = dayNameForDateYmd(dateYmd);
  if (!dn) return;
  // Reuse existing booking modal behavior (supports multi-hour + recurrence).
  onCellClick(dn, Number(hour));
  // Preselect the clicked room (if it's requestable for the default 1-hour range, it will remain valid).
  selectedOfficeRoomId.value = Number(roomId || 0) || 0;
};

const effectiveAgencyId = computed(() => {
  const n = Number(props.agencyId || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const effectiveAgencyIds = computed(() => {
  const fromList = Array.isArray(props.agencyIds) ? props.agencyIds : null;
  const ids = (fromList && fromList.length ? fromList : (effectiveAgencyId.value ? [effectiveAgencyId.value] : []))
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  // De-dupe while preserving order
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
});

const agencyLabel = (agencyId) => {
  const id = Number(agencyId || 0);
  if (!id) return '';
  const map = props.agencyLabelById && typeof props.agencyLabelById === 'object' ? props.agencyLabelById : null;
  const label = map ? map[String(id)] || map[id] : '';
  return String(label || '').trim();
};

const canCreateRequests = computed(() => props.mode === 'self');
const isAdminMode = computed(() => props.mode === 'admin');
const canManageOffices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['clinical_practice_assistant', 'admin', 'super_admin', 'support', 'staff'].includes(role);
});

const availabilityClass = (dayName, hour) => {
  const a = props.availabilityOverlay && typeof props.availabilityOverlay === 'object' ? props.availabilityOverlay : null;
  if (!a) return '';
  const virtual = Array.isArray(a.virtualSlots) ? a.virtualSlots : [];
  const office = Array.isArray(a.inPersonSlots) ? a.inPersonSlots : [];

  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return '';
  const cellDate = addDaysYmd(weekStart.value, dayIdx);
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
  const cellEnd = new Date(`${cellDate}T${pad2(Number(hour) + 1)}:00:00`);
  if (Number.isNaN(cellStart.getTime()) || Number.isNaN(cellEnd.getTime())) return '';

  const overlaps = (slot) => {
    const st = new Date(slot.startAt);
    const en = new Date(slot.endAt);
    if (Number.isNaN(st.getTime()) || Number.isNaN(en.getTime())) return false;
    return en > cellStart && st < cellEnd;
  };

  const hasV = virtual.some(overlaps);
  const hasO = office.some(overlaps);
  if (hasV && hasO) return 'cell-avail-both';
  if (hasV) return 'cell-avail-virtual';
  if (hasO) return 'cell-avail-office';
  return '';
};

// If Google busy is enabled but the backend reports an auth/impersonation failure (invalid_grant),
// auto-disable it so the schedule does not feel “broken” on load.
const googleBusyDisabledHint = ref('');
const autoDisabledGoogleBusy = ref(false);
const isGoogleInvalidGrant = (msg) => String(msg || '').toLowerCase().includes('invalid_grant');

const load = async () => {
  if (!props.userId) return;
  if (!effectiveAgencyIds.value.length) {
    summary.value = null;
    error.value = 'Select an organization first.';
    return;
  }

  try {
    loading.value = true;
    error.value = '';

    const ids = effectiveAgencyIds.value;
    if (ids.length === 1) {
      const resp = await api.get(`/users/${props.userId}/schedule-summary`, {
        params: {
          weekStart: weekStart.value,
          agencyId: ids[0],
          includeGoogleBusy: showGoogleBusy.value ? 'true' : 'false',
          includeGoogleEvents: showGoogleEvents.value ? 'true' : 'false',
          ...(selectedExternalCalendarIds.value.length
            ? { externalCalendarIds: selectedExternalCalendarIds.value.join(',') }
            : {})
        }
      });
      summary.value = resp.data || null;
    } else {
      const results = await Promise.all(
        ids.map((agencyId) =>
          api
            .get(`/users/${props.userId}/schedule-summary`, {
              params: {
                weekStart: weekStart.value,
                agencyId,
                includeGoogleBusy: showGoogleBusy.value ? 'true' : 'false',
                includeGoogleEvents: showGoogleEvents.value ? 'true' : 'false',
                ...(selectedExternalCalendarIds.value.length
                  ? { externalCalendarIds: selectedExternalCalendarIds.value.join(',') }
                  : {})
              }
            })
            .then((r) => ({ ok: true, agencyId, data: r.data }))
            .catch((e) => ({
              ok: false,
              agencyId,
              error: e?.response?.data?.error?.message || e?.message || 'Failed to load schedule'
            }))
        )
      );

      const okOnes = results.filter((r) => r.ok && r.data);
      const first = okOnes[0]?.data || null;
      if (!first) {
        summary.value = null;
        const msgs = results
          .filter((r) => !r.ok)
          .map((r) => `${agencyLabel(r.agencyId) || `Agency ${r.agencyId}`}: ${r.error}`);
        error.value = msgs.length ? msgs.join(' • ') : 'Failed to load schedule';
        return;
      }

      const tag = (row, agencyId) => ({ ...row, _agencyId: agencyId });
      const merged = {
        ...first,
        // Preserve one “current” agencyId for legacy consumers, but include the full list too.
        agencyId: first.agencyId || ids[0],
        agencyIds: [...ids],
        officeRequests: [],
        schoolRequests: [],
        schoolAssignments: [],
        officeEvents: [],
        supervisionSessions: []
      };

      // Union calendars available (per-user, but keep stable)
      const calMap = new Map();
      for (const r of okOnes) {
        for (const c of r.data?.externalCalendarsAvailable || []) {
          const id = Number(c?.id || 0);
          if (!id) continue;
          if (!calMap.has(id)) calMap.set(id, { id, label: c?.label || '' });
        }
      }
      merged.externalCalendarsAvailable = Array.from(calMap.values());

      for (const r of okOnes) {
        const aId = r.agencyId;
        merged.officeRequests.push(...(r.data?.officeRequests || []).map((x) => tag(x, aId)));
        merged.schoolRequests.push(...(r.data?.schoolRequests || []).map((x) => tag(x, aId)));
        merged.schoolAssignments.push(...(r.data?.schoolAssignments || []).map((x) => tag(x, aId)));
        merged.officeEvents.push(...(r.data?.officeEvents || []).map((x) => tag(x, aId)));
        merged.supervisionSessions.push(...(r.data?.supervisionSessions || []).map((x) => tag(x, aId)));
      }

      // Prefer overlay info from the first successful result (per-user; not agency-scoped).
      merged.googleBusy = first.googleBusy || [];
      merged.googleBusyError = first.googleBusyError || null;
      merged.externalCalendars = first.externalCalendars || [];

      summary.value = merged;
    }

    // Fail-soft Google busy: if the user’s email cannot be impersonated (invalid_grant),
    // turn off Google busy and persist the preference.
    if (props.mode === 'self' && showGoogleBusy.value && !autoDisabledGoogleBusy.value) {
      const errMsg = String(summary.value?.googleBusyError || '').trim();
      if (errMsg && isGoogleInvalidGrant(errMsg)) {
        autoDisabledGoogleBusy.value = true;
        googleBusyDisabledHint.value =
          'Google busy is unavailable for your account (Google Workspace could not validate your email). We turned it off for now.';
        // Hide immediately, then the watcher will reload without Google busy.
        showGoogleBusy.value = false;
        try {
          if (summary.value && typeof summary.value === 'object') summary.value.googleBusyError = null;
        } catch {
          // ignore
        }
      }
    }
  } catch (e) {
    summary.value = null;
    error.value = e.response?.data?.error?.message || 'Failed to load schedule';
  } finally {
    loading.value = false;
  }
};

watch([() => props.userId, effectiveAgencyIds], () => load(), { immediate: true });
watch([showGoogleBusy, showGoogleEvents, selectedExternalCalendarIds], () => load(), { deep: true });

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

  // Provider defaults: if no saved prefs exist, default ALL external calendars on once we know what's available.
  if (
    props.mode === 'self' &&
    overlayPrefsLoaded.value &&
    shouldDefaultSelectAllExternal.value &&
    (selectedExternalCalendarIds.value || []).length === 0 &&
    allowed.size > 0
  ) {
    selectedExternalCalendarIds.value = Array.from(allowed.values());
    shouldDefaultSelectAllExternal.value = false;
  }

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

  // Persist (best-effort) once the available list stabilizes and any defaulting/cleanup is applied.
  if (props.mode === 'self' && overlayPrefsLoaded.value) saveOverlayPrefs();
});

// Persist overlay/view settings (provider UX only).
watch([showGoogleBusy, showGoogleEvents, selectedExternalCalendarIds, hideWeekend, viewMode], () => {
  if (props.mode !== 'self' || !overlayPrefsLoaded.value) return;
  saveOverlayPrefs();
}, { deep: true });

const prevWeek = () => {
  weekStart.value = addDaysYmd(weekStart.value, -7);
  emit('update:weekStartYmd', weekStart.value);
  load();
};
const nextWeek = () => {
  weekStart.value = addDaysYmd(weekStart.value, 7);
  emit('update:weekStartYmd', weekStart.value);
  load();
};
const goToTodayWeek = () => {
  const monday = startOfWeekMondayYmd(new Date());
  if (!monday) return;
  weekStart.value = monday;
  emit('update:weekStartYmd', weekStart.value);
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

const hasSupervision = (dayName, hour) => {
  const s = summary.value;
  if (!s) return false;
  const list = s.supervisionSessions || [];
  for (const ev of list) {
    const startRaw = String(ev.startAt || '').trim();
    const endRaw = String(ev.endAt || '').trim();
    if (!startRaw || !endRaw) continue;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    const endLocal = new Date(endRaw.includes('T') ? endRaw : endRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) continue;
    const idx = dayIndexForDateLocal(localYmd(startLocal), s.weekStart || weekStart.value);
    const dn = ALL_DAYS[idx] || null;
    if (dn !== dayName) continue;
    const cellDate = addDaysYmd(s.weekStart || weekStart.value, ALL_DAYS.indexOf(dayName));
    const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
    const cellEnd = new Date(`${cellDate}T${pad2(hour + 1)}:00:00`);
    if (endLocal > cellStart && startLocal < cellEnd) return true;
  }
  return false;
};

const supervisionLabel = (dayName, hour) => {
  const s = summary.value;
  const list = s?.supervisionSessions || [];
  const names = [];
  for (const ev of list) {
    const startRaw = String(ev.startAt || '').trim();
    const endRaw = String(ev.endAt || '').trim();
    if (!startRaw || !endRaw) continue;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    const endLocal = new Date(endRaw.includes('T') ? endRaw : endRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) continue;
    const idx = dayIndexForDateLocal(localYmd(startLocal), s.weekStart || weekStart.value);
    const dn = ALL_DAYS[idx] || null;
    if (dn !== dayName) continue;
    const cellDate = addDaysYmd(s.weekStart || weekStart.value, ALL_DAYS.indexOf(dayName));
    const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
    const cellEnd = new Date(`${cellDate}T${pad2(hour + 1)}:00:00`);
    if (!(endLocal > cellStart && startLocal < cellEnd)) continue;
    const nm = String(ev.counterpartyName || '').trim();
    if (nm) names.push(nm);
  }
  if (!names.length) return 'Supv';
  if (names.length === 1) return names[0];
  return `${names[0]}+${names.length - 1}`;
};

const supervisionTitle = (dayName, hour) => {
  const s = summary.value;
  const list = s?.supervisionSessions || [];
  const hits = [];
  for (const ev of list) {
    const startRaw = String(ev.startAt || '').trim();
    const endRaw = String(ev.endAt || '').trim();
    if (!startRaw || !endRaw) continue;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    const endLocal = new Date(endRaw.includes('T') ? endRaw : endRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) continue;
    const idx = dayIndexForDateLocal(localYmd(startLocal), s.weekStart || weekStart.value);
    const dn = ALL_DAYS[idx] || null;
    if (dn !== dayName) continue;
    const cellDate = addDaysYmd(s.weekStart || weekStart.value, ALL_DAYS.indexOf(dayName));
    const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
    const cellEnd = new Date(`${cellDate}T${pad2(hour + 1)}:00:00`);
    if (endLocal > cellStart && startLocal < cellEnd) hits.push(ev);
  }
  const withNames = hits.map((ev) => String(ev.counterpartyName || '').trim()).filter(Boolean);
  const who = withNames.length ? withNames.join(', ') : '—';
  return `Supervision — ${who} — ${dayName} ${hourLabel(hour)}`;
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

const schoolNamesInCell = (dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  const names = new Set();
  for (const a of s.schoolAssignments || []) {
    if (String(a.dayOfWeek) !== dayName) continue;
    if (!overlapsHour(a.startTime, a.endTime, hour)) continue;
    const nm = String(a.schoolName || '').trim();
    if (nm) names.add(nm);
  }
  return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
};

const schoolShortLabel = (dayName, hour) => {
  const names = schoolNamesInCell(dayName, hour);
  if (!names.length) return 'School';
  if (names.length === 1) return names[0];
  return `${names[0]}+${names.length - 1}`;
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

const googleEventsInCell = (dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  const ws = s.weekStart || weekStart.value;
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return [];
  const cellDate = addDaysYmd(ws, dayIdx);
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
  const cellEnd = new Date(`${cellDate}T${pad2(Number(hour) + 1)}:00:00`);
  const list = Array.isArray(s.googleEvents) ? s.googleEvents : [];
  const hits = [];
  for (const ev of list) {
    const st = new Date(ev.startAt);
    const en = new Date(ev.endAt);
    if (Number.isNaN(st.getTime()) || Number.isNaN(en.getTime())) continue;
    if (en > cellStart && st < cellEnd) hits.push(ev);
  }
  return hits;
};

const googleEventShortLabel = (ev) => {
  const s = String(ev?.summary || '').trim();
  if (!s) return 'Event';
  return s.length > 18 ? `${s.slice(0, 18)}…` : s;
};
const googleEventTitle = (ev, dayName, hour) => {
  const s = String(ev?.summary || '').trim() || 'Google event';
  return `${s} — ${dayName} ${hourLabel(hour)}`;
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

const agenciesInCell = (kind, dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  const ws = s.weekStart || weekStart.value;
  const ids = new Set();

  if (kind === 'request') {
    for (const r of s.officeRequests || []) {
      for (const slot of r.slots || []) {
        const dn = ALL_DAYS[((Number(slot.weekday) + 6) % 7)] || null;
        if (dn !== dayName) continue;
        if (Number(hour) >= Number(slot.startHour) && Number(hour) < Number(slot.endHour)) {
          if (r?._agencyId) ids.add(Number(r._agencyId));
        }
      }
    }
    for (const r of s.schoolRequests || []) {
      for (const b of r.blocks || []) {
        if (String(b.dayOfWeek) !== dayName) continue;
        if (overlapsHour(b.startTime, b.endTime, hour)) {
          if (r?._agencyId) ids.add(Number(r._agencyId));
        }
      }
    }
  }

  if (kind === 'school') {
    for (const a of s.schoolAssignments || []) {
      if (String(a.dayOfWeek) !== dayName) continue;
      if (overlapsHour(a.startTime, a.endTime, hour)) {
        if (a?._agencyId) ids.add(Number(a._agencyId));
      }
    }
  }

  if (kind === 'office') {
    for (const e of s.officeEvents || []) {
      const startRaw = String(e.startAt || '').trim();
      if (!startRaw) continue;
      const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
      if (Number.isNaN(startLocal.getTime())) continue;
      const idx = dayIndexForDateLocal(localYmd(startLocal), ws);
      const dn = ALL_DAYS[idx] || null;
      if (dn !== dayName) continue;
      if (startLocal.getHours() !== Number(hour)) continue;
      if (e?._agencyId) ids.add(Number(e._agencyId));
    }
  }

  const out = Array.from(ids.values()).filter((n) => Number.isFinite(n) && n > 0);
  out.sort((a, b) => a - b);
  return out;
};

const agencySuffix = (ids) => {
  const list = (ids || [])
    .map((id) => agencyLabel(id) || `Agency ${id}`)
    .filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return ` (${list[0]})`;
  return ` (${list.slice(0, 2).join(', ')}${list.length > 2 ? ` +${list.length - 2}` : ''})`;
};

const requestTitle = (dayName, hour) => {
  const ids = agenciesInCell('request', dayName, hour);
  return `Pending request${agencySuffix(ids)} — ${dayName} ${hourLabel(hour)}`;
};
const schoolTitle = (dayName, hour) => {
  const ids = agenciesInCell('school', dayName, hour);
  const names = schoolNamesInCell(dayName, hour);
  const nameSuffix = names.length ? ` (${names.join(', ')})` : '';
  return `School assigned${agencySuffix(ids)}${nameSuffix} — ${dayName} ${hourLabel(hour)}`;
};
const officeTopEvent = (dayName, hour) => {
  const s = summary.value;
  if (!s) return null;
  const hits = (s?.officeEvents || []).filter((e) => {
    const startRaw = String(e.startAt || '').trim();
    if (!startRaw) return false;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime())) return false;
    const idx = dayIndexForDateLocal(localYmd(startLocal), s.weekStart || weekStart.value);
    const dn = ALL_DAYS[idx] || null;
    return dn === dayName && startLocal.getHours() === Number(hour);
  });
  const top = hits.sort((a, b) => stateRank(b.slotState) - stateRank(a.slotState))[0] || null;
  return top;
};
const officeTitle = (dayName, hour) => {
  const top = officeTopEvent(dayName, hour);
  if (!top) return `Office — ${dayName} ${hourLabel(hour)}`;
  const room = top.roomLabel || 'Office';
  const bld = top.buildingName || 'Office location';
  const st = String(top.slotState || '').toUpperCase();
  const label = st === 'ASSIGNED_BOOKED' ? 'Booked' : st === 'ASSIGNED_TEMPORARY' ? 'Temporary' : 'Assigned';
  const ids = agenciesInCell('office', dayName, hour);
  return `${label}${agencySuffix(ids)} — ${bld} • ${room} — ${dayName} ${hourLabel(hour)}`;
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
  const top = ['ASSIGNED_BOOKED', 'ASSIGNED_TEMPORARY', 'ASSIGNED_AVAILABLE'].includes(st) ? officeTopEvent(dayName, hour) : null;
  const buildingId = top?.buildingId ? Number(top.buildingId) : null;
  if (st === 'ASSIGNED_BOOKED') {
    blocks.push({ key: 'office-booked', kind: 'ob', shortLabel: 'Booked', title: officeTitle(dayName, hour), buildingId });
  } else if (st === 'ASSIGNED_TEMPORARY') {
    blocks.push({ key: 'office-temp', kind: 'ot', shortLabel: 'Temp', title: officeTitle(dayName, hour), buildingId });
  } else if (st === 'ASSIGNED_AVAILABLE') {
    blocks.push({ key: 'office-assigned', kind: 'oa', shortLabel: 'Office', title: officeTitle(dayName, hour), buildingId });
  }

  // Assigned school
  if (hasSchool(dayName, hour)) {
    blocks.push({ key: 'school-assigned', kind: 'school', shortLabel: schoolShortLabel(dayName, hour), title: schoolTitle(dayName, hour) });
  }

  // Supervision sessions
  if (hasSupervision(dayName, hour)) {
    blocks.push({ key: 'supv', kind: 'supv', shortLabel: supervisionLabel(dayName, hour), title: supervisionTitle(dayName, hour) });
  }

  // Pending request
  if (hasRequest(dayName, hour)) {
    blocks.push({ key: 'request', kind: 'request', shortLabel: 'Req', title: requestTitle(dayName, hour) });
  }

  // Busy overlays
  if (showGoogleBusy.value && hasGoogleBusy(dayName, hour)) {
    blocks.push({ key: 'gbusy', kind: 'gbusy', shortLabel: 'G', title: googleBusyTitle(dayName, hour) });
  }
  if (showGoogleEvents.value) {
    const events = googleEventsInCell(dayName, hour).slice(0, 2);
    for (const ev of events) {
      blocks.push({
        key: `gevt-${String(ev?.id || ev?.summary || 'event')}`,
        kind: 'gevt',
        shortLabel: googleEventShortLabel(ev),
        title: googleEventTitle(ev, dayName, hour),
        link: String(ev?.htmlLink || '').trim() || null
      });
    }
    const extra = Math.max(0, googleEventsInCell(dayName, hour).length - events.length);
    if (extra) {
      blocks.push({ key: 'gevt-more', kind: 'more', shortLabel: `+${extra}`, title: `${extra} more Google events in this hour` });
    }
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
  const googleEventsErr = showGoogleEvents.value ? String(s?.googleEventsError || '').trim() : '';
  const cals = Array.isArray(s.externalCalendars) ? s.externalCalendars : [];
  const errors = (cals || [])
    .map((c) => ({ label: String(c?.label || '').trim(), err: String(c?.error || '').trim() }))
    .filter((x) => x.err)
    .slice(0, 2);
  const parts = [];
  if (googleErr) parts.push(`Google busy: ${googleErr}`);
  if (googleEventsErr) parts.push(`Google events: ${googleEventsErr}`);
  if (errors.length) parts.push(`EHR: ${errors.map((e) => (e.label ? `${e.label}: ${e.err}` : e.err)).join(' • ')}`);
  return parts.length ? `Calendar overlay error: ${parts.join(' • ')}` : '';
});

// ---- In-grid request creation (self mode) ----
const showRequestModal = ref(false);
const modalDay = ref('Monday');
const modalHour = ref(7);
const modalEndHour = ref(8);
const requestType = ref('office'); // office | school | supervision
const requestNotes = ref('');
const submitting = ref(false);
const modalError = ref('');

// Office booking request (office-schedule/booking-requests)
const officeBookingRecurrence = ref('ONCE'); // ONCE | WEEKLY | BIWEEKLY | MONTHLY
const selectedOfficeRoomId = ref(0); // 0 = any open room

const modalOfficeRoomOptions = computed(() => {
  const g = officeGrid.value;
  const officeId = Number(selectedOfficeLocationId.value || 0);
  if (!officeId || !g || !Array.isArray(g.rooms) || !Array.isArray(g.slots)) return [];

  const dayIdx = ALL_DAYS.indexOf(String(modalDay.value));
  if (dayIdx < 0) return [];
  const date = addDaysYmd(weekStart.value, dayIdx);
  const startH = Number(modalHour.value);
  const endH = Number(modalEndHour.value);
  if (!(endH > startH)) return [];

  const byKey = new Map();
  for (const s of g.slots || []) {
    byKey.set(`${s.roomId}|${s.date}|${s.hour}`, s);
  }

  const stateLabel = (state, slot) => {
    const st = String(state || '');
    if (st === 'open') return 'Open';
    if (st === 'assigned_available') {
      const who = slot?.assignedProviderName || slot?.providerInitials || '';
      return who ? `Assigned available • ${who}` : 'Assigned available';
    }
    if (st === 'assigned_temporary') {
      const who = slot?.assignedProviderName || slot?.providerInitials || '';
      return who ? `Temporary • ${who}` : 'Temporary';
    }
    if (st === 'assigned_booked') {
      const who = slot?.bookedProviderName || slot?.providerInitials || '';
      return who ? `Booked • ${who}` : 'Booked';
    }
    return st || '—';
  };

  const isRequestableState = (st) => st === 'open' || st === 'assigned_available';

  const out = (g.rooms || []).map((r) => {
    const roomId = Number(r.id);
    const label = `${r.roomNumber ? `#${r.roomNumber} ` : ''}${r.label || r.name || `Room ${roomId}`}`.trim();
    let firstState = null;
    let requestable = true;
    let representativeSlot = null;

    for (let h = startH; h < endH; h++) {
      const s = byKey.get(`${roomId}|${date}|${h}`) || null;
      const st = String(s?.state || '');
      if (!st) {
        requestable = false;
        firstState = firstState || 'unknown';
        continue;
      }
      if (!firstState) {
        firstState = st;
        representativeSlot = s;
      } else if (firstState !== st) {
        // Mixed states across the range – treat as not requestable to avoid partial bookings.
        requestable = false;
      }
      if (!isRequestableState(st)) requestable = false;
      if (!requestable) {
        // still finish loop to determine a meaningful representative slot
      }
    }

    const st = firstState || 'unknown';
    return {
      roomId,
      label,
      state: st,
      stateLabel: stateLabel(st, representativeSlot),
      requestable
    };
  });

  return out.sort((a, b) => String(a.label).localeCompare(String(b.label)));
});

const officeBookingValid = computed(() => {
  if (requestType.value !== 'office') return true;
  const officeId = Number(selectedOfficeLocationId.value || 0);
  if (!officeId) return false;
  const endH = Number(modalEndHour.value);
  const startH = Number(modalHour.value);
  if (!(endH > startH)) return false;
  // If a specific room is picked, it must be requestable in the options list.
  const rid = Number(selectedOfficeRoomId.value || 0);
  if (!rid) return true; // any open room
  const opt = (modalOfficeRoomOptions.value || []).find((x) => Number(x.roomId) === rid);
  return !!opt?.requestable;
});

const officeBookingHint = computed(() => {
  if (requestType.value !== 'office') return '';
  const officeId = Number(selectedOfficeLocationId.value || 0);
  if (!officeId) return '';
  if (officeBookingRecurrence.value === 'ONCE') {
    return 'Same-day “Once” requests auto-book if an open room exists; otherwise they go to approvals.';
  }
  return 'Weekly/Biweekly/Monthly requests go to approvals and will create a booking plan on approval.';
});

const supervisorsLoading = ref(false);
const supervisors = ref([]);
const selectedSupervisorId = ref(0);
const createMeetLink = ref(true);

const loadSupervisors = async () => {
  if (!props.userId) return;
  if (!effectiveAgencyId.value) return;
  try {
    supervisorsLoading.value = true;
    const r = await api.get(`/supervisor-assignments/supervisee/${props.userId}`, {
      params: { agencyId: effectiveAgencyId.value }
    });
    supervisors.value = Array.isArray(r.data) ? r.data : [];
    if (!selectedSupervisorId.value && supervisors.value.length === 1) {
      selectedSupervisorId.value = Number(supervisors.value[0].supervisor_id || 0);
    }
  } catch {
    supervisors.value = [];
  } finally {
    supervisorsLoading.value = false;
  }
};

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
  if (!canCreateRequests.value) {
    // Admin scheduling: assign office slots directly from a provider schedule (no request).
    if (isAdminMode.value && canManageOffices.value) {
      openOfficeAssignModal(dayName, hour);
    }
    return;
  }
  modalDay.value = dayName;
  modalHour.value = Number(hour);
  // Default to a 1-hour range; clamp to end-of-grid.
  const nextEnd = Math.min(Number(hour) + 1, 22);
  modalEndHour.value = nextEnd > Number(hour) ? nextEnd : Number(hour) + 1;
  requestType.value = 'office';
  requestNotes.value = '';
  modalError.value = '';
  officeBookingRecurrence.value = 'ONCE';
  selectedOfficeRoomId.value = 0;
  selectedSupervisorId.value = 0;
  createMeetLink.value = true;
  showRequestModal.value = true;
};

// ---- Office assignment modal (admin) ----
const showOfficeAssignModal = ref(false);
const officeAssignLoading = ref(false);
const officeAssignError = ref('');
const officeAssignDay = ref('Monday');
const officeAssignStartHour = ref(7);
const officeAssignEndHour = ref(8);
const officeAssignBuildingId = ref(0);
const officeAssignRoomId = ref(0);
const officeLocations = ref([]);
const officeRooms = ref([]);

// ---- Provider office overlay (selected office location weekly grid) ----
const selectedOfficeLocationId = ref(0);
const officeGridLoading = ref(false);
const officeGridError = ref('');
const officeGrid = ref(null); // { location, weekStart, days, hours, rooms, slots }

const officePalette = [
  '#2563eb', // blue
  '#16a34a', // green
  '#dc2626', // red
  '#9333ea', // purple
  '#ea580c', // orange
  '#0f766e', // teal
  '#4f46e5', // indigo
  '#b45309' // amber
];

const officeColorById = (id) => {
  const n = Number(id || 0);
  if (!Number.isFinite(n) || n <= 0) return '#64748b';
  return officePalette[n % officePalette.length];
};

const officeOverlayStyle = computed(() => {
  const id = Number(selectedOfficeLocationId.value || 0);
  return { '--officeOverlayColor': officeColorById(id) };
});

const loadSelectedOfficeGrid = async () => {
  const id = Number(selectedOfficeLocationId.value || 0);
  if (!id) {
    officeGrid.value = null;
    officeGridError.value = '';
    return;
  }
  try {
    officeGridLoading.value = true;
    officeGridError.value = '';
    const r = await api.get(`/office-schedule/locations/${id}/weekly-grid`, {
      params: { weekStart: weekStart.value },
      skipGlobalLoading: true
    });
    officeGrid.value = r.data || null;
  } catch (e) {
    officeGrid.value = null;
    officeGridError.value = e.response?.data?.error?.message || 'Failed to load office availability';
  } finally {
    officeGridLoading.value = false;
  }
};

watch([selectedOfficeLocationId, weekStart], () => {
  void loadSelectedOfficeGrid();
});

const officeOverlayKey = (dateYmd, hour) => `${String(dateYmd).slice(0, 10)}|${Number(hour)}`;

const officeOverlayStats = computed(() => {
  const g = officeGrid.value;
  if (!g || !Array.isArray(g.slots) || !Array.isArray(g.rooms)) return new Map();
  const roomCount = (g.rooms || []).length;
  const m = new Map();
  for (const s of g.slots || []) {
    const k = officeOverlayKey(s.date, s.hour);
    if (!m.has(k)) {
      m.set(k, { open: 0, assigned_available: 0, assigned_temporary: 0, assigned_booked: 0, totalRooms: roomCount });
    }
    const rec = m.get(k);
    const st = String(s.state || '');
    if (st === 'open') rec.open += 1;
    else if (st === 'assigned_available') rec.assigned_available += 1;
    else if (st === 'assigned_temporary') rec.assigned_temporary += 1;
    else if (st === 'assigned_booked') rec.assigned_booked += 1;
  }
  return m;
});

const officeOverlay = (dayName, hour) => {
  const id = Number(selectedOfficeLocationId.value || 0);
  if (!id) return '';
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return '';
  const date = addDaysYmd(weekStart.value, dayIdx);
  const rec = officeOverlayStats.value.get(officeOverlayKey(date, hour));
  if (!rec) return '';
  if (rec.open > 0) return `Open ${rec.open}`;
  if (rec.assigned_available > 0) return `Avail ${rec.assigned_available}`;
  if (rec.assigned_temporary > 0) return `Temp ${rec.assigned_temporary}`;
  if (rec.assigned_booked > 0) return 'Booked';
  return '';
};

const officeOverlayTitle = (dayName, hour) => {
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return '';
  const date = addDaysYmd(weekStart.value, dayIdx);
  const rec = officeOverlayStats.value.get(officeOverlayKey(date, hour));
  if (!rec) return '';
  return [
    `Office availability — ${dayName} ${hourLabel(hour)}`,
    `Open: ${rec.open}`,
    `Assigned available: ${rec.assigned_available}`,
    `Assigned temporary: ${rec.assigned_temporary}`,
    `Assigned booked: ${rec.assigned_booked}`
  ].join('\n');
};

const cellBlockStyle = (b) => {
  const kind = String(b?.kind || '');
  if (!['oa', 'ot', 'ob'].includes(kind)) return {};
  const id = Number(b?.buildingId || 0);
  if (!id) return {};
  return { '--officeAccent': officeColorById(id) };
};

const officeAssignEndHourOptions = computed(() => {
  const start = Number(officeAssignStartHour.value || 0);
  const maxEnd = 22;
  const out = [];
  for (let h = start + 1; h <= maxEnd; h++) out.push(h);
  return out;
});

const loadOfficeLocations = async () => {
  try {
    const r = await api.get('/offices');
    const rows = Array.isArray(r.data) ? r.data : [];
    officeLocations.value = rows;
  } catch {
    officeLocations.value = [];
  }
};

// Must run after `loadOfficeLocations` + `officeLocations` are declared (avoids TDZ ReferenceError).
watch(
  () => authStore.user?.id,
  () => {
    void loadMyScheduleColors();
    if (!officeLocations.value.length) void loadOfficeLocations();
  },
  { immediate: true }
);

const loadOfficeRooms = async (buildingId) => {
  const id = Number(buildingId || 0);
  if (!id) {
    officeRooms.value = [];
    return;
  }
  try {
    const r = await api.get(`/office-schedule/locations/${id}/rooms`);
    const rows = Array.isArray(r.data) ? r.data : [];
    // sort by room number if present
    const numVal = (x) => {
      const n = x?.roomNumber ?? x?.room_number ?? null;
      const parsed = parseInt(n, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };
    rows.sort((a, b) => {
      const an = numVal(a);
      const bn = numVal(b);
      if (an !== null && bn !== null && an !== bn) return an - bn;
      if (an !== null && bn === null) return -1;
      if (an === null && bn !== null) return 1;
      return String(a?.label || a?.name || '').localeCompare(String(b?.label || b?.name || ''));
    });
    officeRooms.value = rows;
  } catch {
    officeRooms.value = [];
  }
};

watch(officeAssignBuildingId, async (id) => {
  officeAssignRoomId.value = 0;
  await loadOfficeRooms(id);
});

const openOfficeAssignModal = async (dayName, hour) => {
  officeAssignError.value = '';
  officeAssignDay.value = String(dayName);
  officeAssignStartHour.value = Number(hour);
  officeAssignEndHour.value = Math.min(Number(hour) + 1, 22);
  showOfficeAssignModal.value = true;
  if (!officeLocations.value.length) await loadOfficeLocations();
};

const closeOfficeAssignModal = () => {
  showOfficeAssignModal.value = false;
  officeAssignError.value = '';
  officeAssignBuildingId.value = 0;
  officeAssignRoomId.value = 0;
  officeRooms.value = [];
};

const submitOfficeAssign = async () => {
  try {
    officeAssignLoading.value = true;
    officeAssignError.value = '';
    const dayIdx = ALL_DAYS.indexOf(String(officeAssignDay.value));
    if (dayIdx < 0) throw new Error('Invalid day');
    const dateYmd = addDaysYmd(weekStart.value, dayIdx);
    await api.post(`/office-slots/${officeAssignBuildingId.value}/open-slots/assign`, {
      roomId: officeAssignRoomId.value,
      assignedUserId: Number(props.userId),
      date: dateYmd,
      hour: officeAssignStartHour.value,
      endHour: officeAssignEndHour.value
    });
    closeOfficeAssignModal();
    await load();
  } catch (e) {
    officeAssignError.value = e.response?.data?.error?.message || e.message || 'Failed to assign slot';
  } finally {
    officeAssignLoading.value = false;
  }
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
      const officeId = Number(selectedOfficeLocationId.value || 0);
      if (!officeId) throw new Error('Select an office first.');
      if (!officeBookingValid.value) throw new Error('Select an available room (or choose “Any open room”).');

      const dayIdx = ALL_DAYS.indexOf(String(dn));
      if (dayIdx < 0) throw new Error('Invalid day');
      const dateYmd = addDaysYmd(weekStart.value, dayIdx);
      const startAt = `${dateYmd}T${pad2(h)}:00:00`;
      const endAt = `${dateYmd}T${pad2(endH)}:00:00`;
      const roomId = Number(selectedOfficeRoomId.value || 0) || null;

      const r = await api.post('/office-schedule/booking-requests', {
        officeLocationId: officeId,
        roomId,
        startAt,
        endAt,
        recurrence: String(officeBookingRecurrence.value || 'ONCE'),
        openToAlternativeRoom: !roomId,
        notes: requestNotes.value || ''
      });

      // If it auto-booked, refresh the office grid immediately so the overlay updates.
      if (r?.data?.kind === 'auto_booked') {
        await loadSelectedOfficeGrid();
      }
    } else if (requestType.value === 'school') {
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
    } else if (requestType.value === 'supervision') {
      if (supervisorsLoading.value) throw new Error('Supervisors are still loading.');
      const supId = Number(selectedSupervisorId.value || 0);
      if (!supId) throw new Error('Please select a supervisor.');
      const dayIdx = ALL_DAYS.indexOf(String(dn));
      if (dayIdx < 0) throw new Error('Invalid day');
      const dateYmd = addDaysYmd(weekStart.value, dayIdx);
      const startAt = `${dateYmd}T${pad2(h)}:00:00`;
      const endAt = `${dateYmd}T${pad2(endH)}:00:00`;
      await api.post('/supervision/sessions', {
        agencyId: effectiveAgencyId.value,
        supervisorUserId: supId,
        superviseeUserId: Number(props.userId),
        startAt,
        endAt,
        notes: requestNotes.value || '',
        createMeetLink: !!createMeetLink.value,
        modality: 'virtual'
      });
    } else {
      throw new Error('Invalid request type.');
    }

    closeModal();
    await load();
  } catch (e) {
    modalError.value = e.response?.data?.error?.message || e.message || 'Failed to submit request';
  } finally {
    submitting.value = false;
  }
};

watch(requestType, (t) => {
  if (t === 'supervision') {
    void loadSupervisors();
  }
});

// ---- Supervision edit modal ----
const showSupvModal = ref(false);
const supvModalError = ref('');
const supvSaving = ref(false);
const selectedSupvSessionId = ref(0);
const supvStartIsoLocal = ref('');
const supvEndIsoLocal = ref('');
const supvNotes = ref('');
const supvCreateMeetLink = ref(false);

const supvDayLabel = ref('');
const supvStartHour = ref(7);
const supvEndHour = ref(8);

const parseMaybeDate = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};
const toDatetimeLocalValue = (d) => {
  if (!d) return '';
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

const supervisionSessionsInCell = (dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  const list = Array.isArray(s.supervisionSessions) ? s.supervisionSessions : [];
  const out = [];
  const week = s.weekStart || weekStart.value;
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return [];
  const cellDate = addDaysYmd(week, dayIdx);
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
  const cellEnd = new Date(`${cellDate}T${pad2(hour + 1)}:00:00`);
  for (const ev of list) {
    const startLocal = parseMaybeDate(ev.startAt);
    const endLocal = parseMaybeDate(ev.endAt);
    if (!startLocal || !endLocal) continue;
    const idx = dayIndexForDateLocal(localYmd(startLocal), week);
    const dn = ALL_DAYS[idx] || null;
    if (dn !== dayName) continue;
    if (endLocal > cellStart && startLocal < cellEnd) out.push(ev);
  }
  return out;
};

const supvOptions = computed(() => {
  const list = supervisionSessionsInCell(supvDayLabel.value, supvStartHour.value);
  return list.map((ev) => {
    const who = String(ev.counterpartyName || '').trim() || '—';
    const st = parseMaybeDate(ev.startAt);
    const en = parseMaybeDate(ev.endAt);
    const label = `${who} • ${st ? toDatetimeLocalValue(st).slice(11) : ''}-${en ? toDatetimeLocalValue(en).slice(11) : ''}`;
    return { id: Number(ev.id), label };
  });
});

const selectedSupvSession = computed(() => {
  const list = supervisionSessionsInCell(supvDayLabel.value, supvStartHour.value);
  return list.find((x) => Number(x?.id) === Number(selectedSupvSessionId.value)) || null;
});

const openSupvModal = (dayName, hour) => {
  const hits = supervisionSessionsInCell(dayName, hour);
  if (!hits.length) return;
  showSupvModal.value = true;
  supvModalError.value = '';
  supvSaving.value = false;
  supvDayLabel.value = String(dayName);
  supvStartHour.value = Number(hour);
  supvEndHour.value = Number(hour) + 1;

  const first = hits[0];
  selectedSupvSessionId.value = Number(first.id || 0);
  supvStartIsoLocal.value = toDatetimeLocalValue(parseMaybeDate(first.startAt));
  supvEndIsoLocal.value = toDatetimeLocalValue(parseMaybeDate(first.endAt));
  supvNotes.value = String(first.notes || '');
  supvCreateMeetLink.value = false;
};

const closeSupvModal = () => {
  showSupvModal.value = false;
  supvModalError.value = '';
  selectedSupvSessionId.value = 0;
  supvStartIsoLocal.value = '';
  supvEndIsoLocal.value = '';
  supvNotes.value = '';
  supvCreateMeetLink.value = false;
};

watch(selectedSupvSessionId, (id) => {
  if (!id) return;
  const ev = selectedSupvSession.value;
  if (!ev) return;
  supvNotes.value = String(ev.notes || '');
  supvStartIsoLocal.value = toDatetimeLocalValue(parseMaybeDate(ev.startAt));
  supvEndIsoLocal.value = toDatetimeLocalValue(parseMaybeDate(ev.endAt));
});

const saveSupvSession = async () => {
  const id = Number(selectedSupvSessionId.value || 0);
  if (!id) return;
  try {
    supvSaving.value = true;
    supvModalError.value = '';
    const startAt = supvStartIsoLocal.value ? `${supvStartIsoLocal.value}:00` : '';
    const endAt = supvEndIsoLocal.value ? `${supvEndIsoLocal.value}:00` : '';
    if (!startAt || !endAt) throw new Error('Start and end are required.');
    await api.patch(`/supervision/sessions/${id}`, {
      startAt,
      endAt,
      notes: supvNotes.value || '',
      createMeetLink: !!supvCreateMeetLink.value
    });
    await load();
    closeSupvModal();
  } catch (e) {
    supvModalError.value = e.response?.data?.error?.message || e.message || 'Failed to save session';
  } finally {
    supvSaving.value = false;
  }
};

const cancelSupvSession = async () => {
  const id = Number(selectedSupvSessionId.value || 0);
  if (!id) return;
  try {
    supvSaving.value = true;
    supvModalError.value = '';
    await api.post(`/supervision/sessions/${id}/cancel`);
    await load();
    closeSupvModal();
  } catch (e) {
    supvModalError.value = e.response?.data?.error?.message || e.message || 'Failed to cancel session';
  } finally {
    supvSaving.value = false;
  }
};

const onCellBlockClick = (e, block, dayName, hour) => {
  const kind = String(block?.kind || '');
  if (kind === 'gevt') {
    const link = String(block?.link || '').trim();
    if (!link) return;
    e?.preventDefault?.();
    e?.stopPropagation?.();
    window.open(link, '_blank', 'noreferrer');
    return;
  }
  if (kind !== 'supv') return;
  e?.preventDefault?.();
  e?.stopPropagation?.();
  openSupvModal(dayName, hour);
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
  justify-content: space-between;
  align-items: center;
  gap: 10px;
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
.sched-week-meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}
.sched-today-label {
  font-size: 12px;
  font-weight: 900;
  color: var(--text-secondary);
  white-space: nowrap;
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
.sched-pill {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  font-weight: 800;
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 999px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.06s ease;
}
.sched-pill:hover { transform: translateY(-0.5px); }
.sched-pill:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
.sched-pill.on {
  background: rgba(59, 130, 246, 0.10);
  border-color: rgba(59, 130, 246, 0.35);
  color: rgba(37, 99, 235, 0.95);
}
.sched-chip {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  font-weight: 800;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.sched-chip:hover { border-color: rgba(59, 130, 246, 0.35); }
.sched-chip:disabled { opacity: 0.55; cursor: not-allowed; }
.sched-chip.on {
  background: rgba(242, 153, 74, 0.14);
  border-color: rgba(242, 153, 74, 0.42);
  color: rgba(146, 64, 14, 0.95);
}
.sched-calendars-actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  margin-right: 6px;
}
.sched-icon-btn {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  font-weight: 900;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.sched-icon-btn:hover { border-color: rgba(59, 130, 246, 0.35); }
.sched-icon-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.sched-view-switch {
  display: inline-flex;
  align-items: center;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px;
  gap: 2px;
}
.sched-seg {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-weight: 900;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
}
.sched-seg.on {
  background: #fff;
  color: var(--text-primary);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.06);
}
.sched-seg:disabled { opacity: 0.55; cursor: not-allowed; }
.sched-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 800;
}
.sched-select {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  padding: 6px 10px;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 220px;
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
.swatch-request { background: var(--sched-request-bg, rgba(242, 201, 76, 0.35)); border-color: var(--sched-request-border, rgba(242, 201, 76, 0.65)); }
.swatch-school { background: var(--sched-school-bg, rgba(45, 156, 219, 0.28)); border-color: var(--sched-school-border, rgba(45, 156, 219, 0.60)); }
.swatch-supv { background: var(--sched-supv-bg, rgba(155, 81, 224, 0.20)); border-color: var(--sched-supv-border, rgba(155, 81, 224, 0.55)); }
.swatch-oa { background: var(--sched-oa-bg, rgba(39, 174, 96, 0.22)); border-color: var(--sched-oa-border, rgba(39, 174, 96, 0.55)); }
.swatch-ot { background: var(--sched-ot-bg, rgba(242, 153, 74, 0.24)); border-color: var(--sched-ot-border, rgba(242, 153, 74, 0.58)); }
.swatch-ob { background: var(--sched-ob-bg, rgba(235, 87, 87, 0.22)); border-color: var(--sched-ob-border, rgba(235, 87, 87, 0.58)); }
.swatch-gbusy { background: var(--sched-gbusy-bg, rgba(17, 24, 39, 0.18)); border-color: var(--sched-gbusy-border, rgba(17, 24, 39, 0.45)); }
.swatch-gevt { background: rgba(59, 130, 246, 0.14); border-color: rgba(59, 130, 246, 0.35); }
.swatch-ebusy { background: var(--sched-ebusy-bg, rgba(107, 114, 128, 0.18)); border-color: var(--sched-ebusy-border, rgba(107, 114, 128, 0.45)); }
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
.sched-head-today {
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.16), rgba(59, 130, 246, 0.06));
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
  position: relative;
  overflow: hidden;
}
.sched-cell-today {
  background: rgba(59, 130, 246, 0.05);
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
  position: relative;
  z-index: 1;
}

.cell-avail {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.85;
}
.cell-avail-virtual {
  background: rgba(16, 185, 129, 0.22);
}
.cell-avail-office {
  background: rgba(59, 130, 246, 0.18);
}
.cell-avail-both {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(59, 130, 246, 0.18));
}
.cell-office-overlay {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  pointer-events: none;
  font-size: 10px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.92);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-radius: 999px;
  padding: 1px 6px;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--officeOverlayColor, #64748b) 24%, transparent);
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
.cell-block-request { background: var(--sched-request-bg, rgba(242, 201, 76, 0.35)); border-color: var(--sched-request-border, rgba(242, 201, 76, 0.65)); }
.cell-block-school { background: var(--sched-school-bg, rgba(45, 156, 219, 0.28)); border-color: var(--sched-school-border, rgba(45, 156, 219, 0.60)); }
.cell-block-supv { background: var(--sched-supv-bg, rgba(155, 81, 224, 0.20)); border-color: var(--sched-supv-border, rgba(155, 81, 224, 0.55)); }
.cell-block-oa { background: var(--sched-oa-bg, rgba(39, 174, 96, 0.22)); border-color: var(--sched-oa-border, rgba(39, 174, 96, 0.55)); }
.cell-block-ot { background: var(--sched-ot-bg, rgba(242, 153, 74, 0.24)); border-color: var(--sched-ot-border, rgba(242, 153, 74, 0.58)); }
.cell-block-ob { background: var(--sched-ob-bg, rgba(235, 87, 87, 0.22)); border-color: var(--sched-ob-border, rgba(235, 87, 87, 0.58)); }
.cell-block-oa,
.cell-block-ot,
.cell-block-ob {
  box-shadow: inset 3px 0 0 var(--officeAccent, transparent);
}

.office-room-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.8);
}
.office-room-option {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-primary);
}
.office-room-option.disabled {
  opacity: 0.55;
}
.office-room-label {
  font-weight: 800;
}
.office-room-meta {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  white-space: nowrap;
}
.cell-block-gbusy { background: var(--sched-gbusy-bg, rgba(17, 24, 39, 0.14)); border-color: var(--sched-gbusy-border, rgba(17, 24, 39, 0.42)); color: rgba(17, 24, 39, 0.9); }
.cell-block-gevt { background: rgba(59, 130, 246, 0.14); border-color: rgba(59, 130, 246, 0.35); cursor: pointer; }
.cell-block-ebusy { background: var(--sched-ebusy-bg, rgba(107, 114, 128, 0.16)); border-color: var(--sched-ebusy-border, rgba(107, 114, 128, 0.45)); color: rgba(17, 24, 39, 0.9); }
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

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 640px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
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

