<template>
  <details
    class="work-hours"
    data-testid="my-schedule-work-hours"
    :open="openByDefault || forceOpen"
  >
    <summary class="work-hours__summary">
      <span class="work-hours__title">Availability hours</span>
      <span class="muted">{{ summaryLabel }}</span>
    </summary>

    <div class="work-hours__body">
      <div v-if="loading" class="muted">Loading…</div>
      <div v-else>
        <div v-if="error" class="error">{{ error }}</div>

        <div class="work-hours__meta">
          <label class="field field--tz">
            <span>Timezone</span>
            <select v-model="timezone" class="select timezone-select">
              <optgroup v-for="g in TIMEZONE_GROUPS" :key="g.label" :label="g.label">
                <option v-for="z in g.zones" :key="z.value" :value="z.value">{{ z.label }}</option>
              </optgroup>
              <option v-if="timezone && !knownTimezone" :value="timezone">{{ timezone }}</option>
            </select>
            <span v-if="timezoneHint" class="field-hint muted">{{ timezoneHint }}</span>
          </label>
          <div class="work-hours__active">
            <label class="check">
              <input v-model="isActive" type="checkbox" />
              Active for this user
            </label>
            <p class="work-hours__help">
              Reachability windows for email/SMS digests and holds — not client booking slots.
              Add <strong>multiple ranges on the same day</strong> (e.g. Mon 6–10 AM and 3–8 PM).
              Use the shortcuts below for Mon–Fri or every day. Default when empty: Mon–Fri 6:00 AM–7:00 PM.
            </p>
          </div>
        </div>

        <div class="work-hours__shortcuts">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="seedWeekdaysDefault">
            Mon–Fri 6 AM–7 PM
          </button>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="saving || !rows.length" @click="applyFirstToWeekdays">
            Apply first range to Mon–Fri
          </button>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="saving || !rows.length" @click="applyFirstToEveryDay">
            Same hours every day
          </button>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="addSplitDayExample">
            + Split day (AM + PM)
          </button>
        </div>

        <div class="work-hours__table">
          <div class="work-hours__row work-hours__row--head" aria-hidden="true">
            <span>Day</span>
            <span>Start</span>
            <span>End</span>
            <span></span>
          </div>
          <div v-for="(r, idx) in rows" :key="idx" class="work-hours__row">
            <select v-model.number="r.dayOfWeek" class="select">
              <option v-for="d in dayOptions" :key="d.value" :value="d.value">{{ d.label }}</option>
            </select>
            <input v-model="r.startTime" class="input" type="time" />
            <input v-model="r.endTime" class="input" type="time" />
            <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="removeRow(idx)">Remove</button>
          </div>
          <div v-if="!rows.length" class="muted">No ranges yet — add when you’re typically reachable (multiple per day OK).</div>
        </div>

        <div class="work-hours__actions">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="addRow">Add range</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
        </div>

        <section class="work-hours__vacation">
          <div class="work-hours__vacation-head">
            <h4>Vacation / planned out</h4>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="!agencyId"
              @click="showVacation = true"
            >
              Set vacation
            </button>
          </div>
          <p class="work-hours__help">
            Multi-day or all-day time off uses Planned Out (shows on Team Board and schedule). Same-day “Out for the Day”
            / “Available · Logged out” from Logout status clear automatically after midnight.
          </p>
          <ul v-if="upcomingOuts.length" class="work-hours__outs">
            <li v-for="o in upcomingOuts" :key="o.id">
              {{ formatOut(o) }}
              <em>{{ o.status || 'pending' }}</em>
            </li>
          </ul>
          <p v-else class="muted">No upcoming vacation / planned outs.</p>
        </section>
      </div>
    </div>

    <PlannedOutModal
      v-if="showVacation && agencyId"
      :agency-id="agencyId"
      @close="showVacation = false"
      @created="onVacationCreated"
    />
  </details>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { TIMEZONE_GROUPS, ALL_TIMEZONES, detectLocalTimezone, timezoneLabelFor } from '../../utils/timezones.js';
import PlannedOutModal from '../admin/opsDashboard/PlannedOutModal.vue';

const props = defineProps({
  userId: { type: Number, required: true },
  openByDefault: { type: Boolean, default: false },
  forceOpen: { type: Boolean, default: false }
});

const agencyStore = useAgencyStore();
const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const timezone = ref(detectLocalTimezone());
const isActive = ref(true);
const rows = ref([]);
const timezoneSource = ref('');
const homeState = ref('');
const showVacation = ref(false);
const upcomingOuts = ref([]);

const dayOptions = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

const knownTimezone = computed(() => ALL_TIMEZONES.some((z) => z.value === timezone.value));

const timezoneHint = computed(() => {
  if (timezoneSource.value === 'home_address' && homeState.value) {
    return `Defaulted from home address (${homeState.value}). Change if needed.`;
  }
  if (timezoneSource.value === 'profile') {
    return 'Defaulted from your profile timezone. Change if needed.';
  }
  if (timezoneSource.value === 'browser') {
    return 'Defaulted from your device timezone. Change if needed.';
  }
  return '';
});

const summaryLabel = computed(() => {
  if (loading.value) return 'Loading…';
  if (!isActive.value) return 'Inactive · expand to edit';
  if (!rows.value.length) return 'Default Mon–Fri 6–7 · expand to customize';
  const n = rows.value.length;
  const tzLabel = timezoneLabelFor(timezone.value);
  return `${n} range${n === 1 ? '' : 's'} · ${tzLabel} · expand to edit`;
});

const toInputTime = (raw) => {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '06:00';
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
};

const addRow = () => {
  rows.value.push({ dayOfWeek: 1, startTime: '06:00', endTime: '19:00' });
};
const removeRow = (idx) => {
  rows.value.splice(idx, 1);
};

const seedWeekdaysDefault = () => {
  rows.value = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    startTime: '06:00',
    endTime: '19:00'
  }));
};

const applyFirstToWeekdays = () => {
  const first = rows.value[0];
  if (!first) return;
  rows.value = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    startTime: first.startTime,
    endTime: first.endTime
  }));
};

const applyFirstToEveryDay = () => {
  const first = rows.value[0];
  if (!first) return;
  rows.value = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    startTime: first.startTime,
    endTime: first.endTime
  }));
};

/** Example: Monday morning + afternoon (user can change day). */
const addSplitDayExample = () => {
  const day = Number(rows.value[0]?.dayOfWeek ?? 1);
  rows.value.push(
    { dayOfWeek: day, startTime: '06:00', endTime: '10:00' },
    { dayOfWeek: day, startTime: '15:00', endTime: '20:00' }
  );
};

function formatOut(o) {
  const start = o.start_at || o.start_date || o.starts_at || '';
  const end = o.end_at || o.end_date || o.ends_at || '';
  try {
    const a = start ? new Date(start).toLocaleDateString() : '';
    const b = end ? new Date(end).toLocaleDateString() : '';
    return b && b !== a ? `${a} → ${b}` : a || 'Upcoming';
  } catch {
    return String(start || 'Upcoming');
  }
}

async function loadOuts() {
  if (!agencyId.value || !props.userId) {
    upcomingOuts.value = [];
    return;
  }
  try {
    const { data } = await api.get('/planned-outs', {
      params: { agencyId: agencyId.value, upcomingOnly: 1, limit: 50 },
      skipGlobalLoading: true
    });
    const list = Array.isArray(data?.plannedOuts) ? data.plannedOuts : [];
    const uid = Number(props.userId);
    upcomingOuts.value = list
      .filter((o) => Number(o.user_id || o.userId) === uid)
      .slice(0, 5);
  } catch {
    upcomingOuts.value = [];
  }
}

function onVacationCreated() {
  showVacation.value = false;
  loadOuts();
}

const load = async () => {
  const uid = Number(props.userId || 0);
  if (!uid) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/users/${uid}/work-schedule`);
    const data = resp.data || {};
    const suggested = String(data.suggestedTimezone || data.timezone || '').trim();
    const browserTz = detectLocalTimezone();
    timezone.value = suggested || browserTz || 'America/New_York';
    homeState.value = String(data.homeState || '').trim();
    if (data.hasSavedSchedule) {
      timezoneSource.value = 'work_schedule';
    } else if (data.timezoneSource === 'home_address' || data.timezoneSource === 'profile') {
      timezoneSource.value = data.timezoneSource;
    } else if (!suggested) {
      timezoneSource.value = 'browser';
    } else {
      timezoneSource.value = data.timezoneSource || 'default';
    }
    isActive.value = data.isActive !== false;
    rows.value = (data.blocks || []).map((b) => ({
      dayOfWeek: Number(b.dayOfWeek),
      startTime: toInputTime(b.startTime),
      endTime: toInputTime(b.endTime)
    }));
    await loadOuts();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load availability hours';
    timezone.value = detectLocalTimezone() || 'America/New_York';
    timezoneSource.value = 'browser';
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  const uid = Number(props.userId || 0);
  if (!uid) return;
  try {
    saving.value = true;
    error.value = '';
    await api.put(`/users/${uid}/work-schedule`, {
      timezone: timezone.value,
      isActive: !!isActive.value,
      blocks: rows.value.map((r) => ({
        dayOfWeek: Number(r.dayOfWeek),
        startTime: r.startTime,
        endTime: r.endTime
      }))
    });
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save availability hours';
  } finally {
    saving.value = false;
  }
};

onMounted(load);
watch(() => props.userId, load);
watch(agencyId, loadOuts);
</script>

<style scoped>
.work-hours {
  margin: 0 0 8px;
  border: none;
  background: transparent;
  padding: 0;
}
.work-hours__summary {
  cursor: pointer;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  list-style: none;
  font-size: 12px;
  line-height: 1.3;
}
.work-hours__summary::-webkit-details-marker { display: none; }
.work-hours__title {
  font-weight: 800;
  color: var(--text-secondary, #64748b);
  text-decoration: underline;
  text-decoration-color: rgba(100, 116, 139, 0.35);
  text-underline-offset: 2px;
}
.work-hours[open] {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: var(--bg-alt, #f8fafc);
  padding: 8px 10px;
}
.work-hours[open] .work-hours__title {
  text-decoration: none;
  color: var(--text, #0f172a);
}
.work-hours__body { margin-top: 8px; }
.work-hours__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin-bottom: 10px;
}
.work-hours__help {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
  max-width: 42rem;
  line-height: 1.35;
}
.work-hours__shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.work-hours__table { display: grid; gap: 6px; }
.work-hours__row {
  display: grid;
  grid-template-columns: minmax(72px, 90px) 1fr 1fr auto;
  gap: 6px;
  align-items: center;
}
.work-hours__row--head {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
}
.work-hours__actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.work-hours__vacation {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}
.work-hours__vacation-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.work-hours__vacation-head h4 {
  margin: 0;
  font-size: 0.95rem;
}
.work-hours__outs {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 13px;
}
.work-hours__outs em {
  color: #64748b;
  font-style: normal;
  margin-left: 6px;
}
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.field--tz { min-width: 220px; }
.select, .input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 13px;
}
.check { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.muted { color: #64748b; font-size: 12px; }
.error { color: #b91c1c; font-size: 13px; margin-bottom: 8px; }
</style>
