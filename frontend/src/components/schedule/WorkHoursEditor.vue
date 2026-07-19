<template>
  <details class="work-hours" data-testid="my-schedule-work-hours" :open="openByDefault">
    <summary class="work-hours__summary">
      <span class="work-hours__title">Work hours</span>
      <span class="muted">{{ summaryLabel }}</span>
    </summary>

    <div class="work-hours__body">
      <p class="work-hours__help">
        Reachability for email/SMS — not client booking hours. Toggle “Allow outside work hours” in Preferences if needed.
      </p>

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
          <label class="check">
            <input v-model="isActive" type="checkbox" />
            Active
          </label>
        </div>

        <div class="work-hours__table">
          <div v-for="(r, idx) in rows" :key="idx" class="work-hours__row">
            <select v-model.number="r.dayOfWeek" class="select">
              <option v-for="d in dayOptions" :key="d.value" :value="d.value">{{ d.label }}</option>
            </select>
            <input v-model="r.startTime" class="input" type="time" />
            <input v-model="r.endTime" class="input" type="time" />
            <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="removeRow(idx)">Remove</button>
          </div>
          <div v-if="!rows.length" class="muted">No ranges yet — add when you’re typically reachable.</div>
        </div>

        <div class="work-hours__actions">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="addRow">Add range</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
        </div>
      </div>
    </div>
  </details>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { TIMEZONE_GROUPS, ALL_TIMEZONES, detectLocalTimezone, timezoneLabelFor } from '../../utils/timezones.js';

const props = defineProps({
  userId: { type: Number, required: true },
  openByDefault: { type: Boolean, default: false }
});

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const timezone = ref(detectLocalTimezone());
const isActive = ref(true);
const rows = ref([]);
const timezoneSource = ref('');
const homeState = ref('');

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
  if (!rows.value.length) return 'Not set · expand to edit reachability';
  const n = rows.value.length;
  const tzLabel = timezoneLabelFor(timezone.value);
  return `${n} range${n === 1 ? '' : 's'} · ${tzLabel} · expand to edit`;
});

const toInputTime = (raw) => {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '09:00';
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
};

const addRow = () => {
  rows.value.push({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' });
};
const removeRow = (idx) => {
  rows.value.splice(idx, 1);
};

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
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load work hours';
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
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save work hours';
  } finally {
    saving.value = false;
  }
};

onMounted(load);
watch(() => props.userId, load);
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
.work-hours__help {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
}
.work-hours__meta {
  display: flex;
  gap: 12px;
  align-items: end;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.work-hours__meta .field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  font-weight: 700;
}
.work-hours__meta .field--tz { min-width: min(100%, 280px); flex: 1 1 240px; }
.work-hours__meta .timezone-select {
  min-height: 34px;
  width: 100%;
}
.work-hours__meta .field-hint {
  font-size: 10px;
  font-weight: 600;
  margin-top: 2px;
}
.work-hours__meta .check {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
}
.work-hours__table { display: flex; flex-direction: column; gap: 4px; }
.work-hours__row {
  display: grid;
  grid-template-columns: 72px 110px 110px auto;
  gap: 6px;
  align-items: center;
}
.work-hours__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.muted { color: var(--text-secondary); font-size: 12px; font-weight: 600; }
.error { color: #b00020; margin-bottom: 6px; font-size: 12px; }
@media (max-width: 700px) {
  .work-hours__row { grid-template-columns: 1fr 1fr; }
}
[data-theme="dark"] .work-hours__title,
[data-theme="dark"] .work-hours__summary .muted {
  color: #cbd5e1;
}
[data-theme="dark"] .work-hours[open] {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.72);
}
[data-theme="dark"] .work-hours[open] .work-hours__title {
  color: #f8fafc;
}
[data-theme="dark"] .work-hours__help,
[data-theme="dark"] .work-hours .muted {
  color: #cbd5e1;
}
</style>
