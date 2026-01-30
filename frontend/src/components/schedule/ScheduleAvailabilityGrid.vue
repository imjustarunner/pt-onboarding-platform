<template>
  <div class="sched-wrap" :style="scheduleColorVars">
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
        <div class="legend-item"><span class="swatch swatch-supv"></span> Supervision</div>
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
                @click="onCellBlockClick($event, b, d, h)"
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
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

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
  weekStartYmd: { type: String, default: null }
});

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
  } catch (e) {
    summary.value = null;
    error.value = e.response?.data?.error?.message || 'Failed to load schedule';
  } finally {
    loading.value = false;
  }
};

watch([() => props.userId, effectiveAgencyIds], () => load(), { immediate: true });
watch([showGoogleBusy, selectedExternalCalendarIds], () => load(), { deep: true });

watch(
  () => authStore.user?.id,
  () => {
    void loadMyScheduleColors();
  },
  { immediate: true }
);

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
  if (st === 'ASSIGNED_BOOKED') {
    blocks.push({ key: 'office-booked', kind: 'ob', shortLabel: 'Booked', title: officeTitle(dayName, hour) });
  } else if (st === 'ASSIGNED_TEMPORARY') {
    blocks.push({ key: 'office-temp', kind: 'ot', shortLabel: 'Temp', title: officeTitle(dayName, hour) });
  } else if (st === 'ASSIGNED_AVAILABLE') {
    blocks.push({ key: 'office-assigned', kind: 'oa', shortLabel: 'Office', title: officeTitle(dayName, hour) });
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
const requestType = ref('office'); // office | school | supervision
const requestNotes = ref('');
const submitting = ref(false);
const modalError = ref('');

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
  if (!canCreateRequests.value) return;
  modalDay.value = dayName;
  modalHour.value = Number(hour);
  // Default to a 1-hour range; clamp to end-of-grid.
  const nextEnd = Math.min(Number(hour) + 1, 22);
  modalEndHour.value = nextEnd > Number(hour) ? nextEnd : Number(hour) + 1;
  requestType.value = 'office';
  requestNotes.value = '';
  modalError.value = '';
  selectedSupervisorId.value = 0;
  createMeetLink.value = true;
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
.swatch-request { background: var(--sched-request-bg, rgba(242, 201, 76, 0.35)); border-color: var(--sched-request-border, rgba(242, 201, 76, 0.65)); }
.swatch-school { background: var(--sched-school-bg, rgba(45, 156, 219, 0.28)); border-color: var(--sched-school-border, rgba(45, 156, 219, 0.60)); }
.swatch-supv { background: var(--sched-supv-bg, rgba(155, 81, 224, 0.20)); border-color: var(--sched-supv-border, rgba(155, 81, 224, 0.55)); }
.swatch-oa { background: var(--sched-oa-bg, rgba(39, 174, 96, 0.22)); border-color: var(--sched-oa-border, rgba(39, 174, 96, 0.55)); }
.swatch-ot { background: var(--sched-ot-bg, rgba(242, 153, 74, 0.24)); border-color: var(--sched-ot-border, rgba(242, 153, 74, 0.58)); }
.swatch-ob { background: var(--sched-ob-bg, rgba(235, 87, 87, 0.22)); border-color: var(--sched-ob-border, rgba(235, 87, 87, 0.58)); }
.swatch-gbusy { background: var(--sched-gbusy-bg, rgba(17, 24, 39, 0.18)); border-color: var(--sched-gbusy-border, rgba(17, 24, 39, 0.45)); }
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
.cell-block-request { background: var(--sched-request-bg, rgba(242, 201, 76, 0.35)); border-color: var(--sched-request-border, rgba(242, 201, 76, 0.65)); }
.cell-block-school { background: var(--sched-school-bg, rgba(45, 156, 219, 0.28)); border-color: var(--sched-school-border, rgba(45, 156, 219, 0.60)); }
.cell-block-supv { background: var(--sched-supv-bg, rgba(155, 81, 224, 0.20)); border-color: var(--sched-supv-border, rgba(155, 81, 224, 0.55)); }
.cell-block-oa { background: var(--sched-oa-bg, rgba(39, 174, 96, 0.22)); border-color: var(--sched-oa-border, rgba(39, 174, 96, 0.55)); }
.cell-block-ot { background: var(--sched-ot-bg, rgba(242, 153, 74, 0.24)); border-color: var(--sched-ot-border, rgba(242, 153, 74, 0.58)); }
.cell-block-ob { background: var(--sched-ob-bg, rgba(235, 87, 87, 0.22)); border-color: var(--sched-ob-border, rgba(235, 87, 87, 0.58)); }
.cell-block-gbusy { background: var(--sched-gbusy-bg, rgba(17, 24, 39, 0.14)); border-color: var(--sched-gbusy-border, rgba(17, 24, 39, 0.42)); color: rgba(17, 24, 39, 0.9); }
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

