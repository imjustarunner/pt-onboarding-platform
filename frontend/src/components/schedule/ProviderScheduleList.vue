<template>
  <div class="psl">
    <div class="psl__toolbar">
      <div class="psl__meta" v-if="userName">
        <span class="psl__meta-name">{{ userName }}</span>
        <span class="psl__meta-count" v-if="sorted.length">{{ sorted.length }} booking{{ sorted.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="psl__sort-group">
        <span class="psl__sort-label">Sort by</span>
        <button
          v-for="col in SORT_COLS"
          :key="col.key"
          type="button"
          class="psl__sort-btn"
          :class="{ 'psl__sort-btn--active': sortKey === col.key }"
          @click="setSort(col.key)"
        >
          {{ col.label }}
          <span v-if="sortKey === col.key" class="psl__sort-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
        </button>
      </div>
    </div>

    <div v-if="loading" class="psl__state">Loading bookings…</div>
    <div v-else-if="error" class="psl__state psl__state--error">{{ error }}</div>
    <div v-else-if="!sorted.length" class="psl__state">No active office bookings found.</div>

    <div v-else class="psl__table-wrap">
      <table class="psl__table">
        <thead>
          <tr>
            <th
              v-for="col in COLUMNS"
              :key="col.key"
              class="psl__th"
              :class="{ 'psl__th--sortable': col.sortable, 'psl__th--active': sortKey === col.key }"
              @click="col.sortable && setSort(col.key)"
            >
              {{ col.label }}
              <span v-if="sortKey === col.key" class="psl__sort-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sorted" :key="row.id" class="psl__row">
            <td class="psl__td psl__td--office">
              <span class="psl__office-name">{{ row.officeName }}</span>
            </td>
            <td class="psl__td psl__td--room">
              <span class="psl__room-badge">{{ row.roomLabel || row.roomName }}</span>
            </td>
            <td class="psl__td psl__td--day">{{ row.weekdayName }}</td>
            <td class="psl__td psl__td--time">{{ row.hourLabel }}</td>
            <td class="psl__td psl__td--freq">
              <span class="psl__freq-pill" :class="`psl__freq-pill--${row.assignedFrequency.toLowerCase()}`">
                {{ row.frequencyLabel }}
              </span>
            </td>
            <td class="psl__td psl__td--mode">
              <span class="psl__mode-pill" :class="modePillClass(row.availabilityMode)">
                {{ modeLabel(row.availabilityMode) }}
              </span>
            </td>
            <td class="psl__td psl__td--since">
              <span v-if="row.availableSinceDate" class="psl__date">{{ row.availableSinceDate }}</span>
              <span v-if="row.temporaryUntilDate" class="psl__date-until"> – {{ row.temporaryUntilDate }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  userId: { type: [Number, String], default: null },
});

const loading = ref(false);
const error = ref('');
const userName = ref('');
const assignments = ref([]);

const sortKey = ref('day');
const sortDir = ref('asc');

const SORT_COLS = [
  { key: 'office', label: 'Office' },
  { key: 'day', label: 'Day' },
  { key: 'time', label: 'Time' },
];

const COLUMNS = [
  { key: 'office', label: 'Office', sortable: true },
  { key: 'room', label: 'Room', sortable: false },
  { key: 'day', label: 'Day', sortable: true },
  { key: 'time', label: 'Time', sortable: true },
  { key: 'frequency', label: 'Frequency', sortable: false },
  { key: 'mode', label: 'Mode', sortable: false },
  { key: 'dates', label: 'Active dates', sortable: false },
];

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun ordering

const sorted = computed(() => {
  const rows = [...assignments.value];
  rows.sort((a, b) => {
    let cmp = 0;
    if (sortKey.value === 'office') {
      cmp = String(a.officeName || '').localeCompare(String(b.officeName || ''));
      if (cmp === 0) cmp = DAY_ORDER.indexOf(a.weekday) - DAY_ORDER.indexOf(b.weekday);
      if (cmp === 0) cmp = a.hour - b.hour;
    } else if (sortKey.value === 'day') {
      cmp = DAY_ORDER.indexOf(a.weekday) - DAY_ORDER.indexOf(b.weekday);
      if (cmp === 0) cmp = a.hour - b.hour;
      if (cmp === 0) cmp = String(a.officeName || '').localeCompare(String(b.officeName || ''));
    } else if (sortKey.value === 'time') {
      cmp = a.hour - b.hour;
      if (cmp === 0) cmp = DAY_ORDER.indexOf(a.weekday) - DAY_ORDER.indexOf(b.weekday);
      if (cmp === 0) cmp = String(a.officeName || '').localeCompare(String(b.officeName || ''));
    }
    return sortDir.value === 'asc' ? cmp : -cmp;
  });
  return rows;
});

const setSort = (key) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = 'asc';
  }
};

const load = async () => {
  const uid = Number(props.userId || 0);
  if (!uid) {
    assignments.value = [];
    userName.value = '';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get('/office-schedule/provider-schedule-list', {
      params: { userId: uid },
      skipGlobalLoading: true,
    });
    userName.value = String(r.data?.userName || '');
    assignments.value = Array.isArray(r.data?.assignments) ? r.data.assignments : [];
  } catch (e) {
    error.value = e?.response?.data?.error || 'Failed to load schedule list.';
  } finally {
    loading.value = false;
  }
};

const modeLabel = (mode) => {
  switch (String(mode || '').toUpperCase()) {
    case 'AVAILABLE':    return 'Standing';
    case 'TEMPORARY':   return 'Temporary';
    case 'PERMANENT':   return 'Permanent';
    case 'COMPANY_HOLD':return 'Company hold';
    default:            return mode || '—';
  }
};

const modePillClass = (mode) => {
  switch (String(mode || '').toUpperCase()) {
    case 'AVAILABLE':    return 'psl__mode-pill--active';
    case 'TEMPORARY':   return 'psl__mode-pill--temp';
    case 'PERMANENT':   return 'psl__mode-pill--perm';
    case 'COMPANY_HOLD':return 'psl__mode-pill--hold';
    default:            return 'psl__mode-pill--temp';
  }
};

watch(() => props.userId, load, { immediate: true });
</script>

<style scoped>
.psl {
  font-family: var(--font-body, 'Inter', system-ui, sans-serif);
  font-size: 14px;
  color: #111827;
}

.psl__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.psl__meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.psl__meta-name {
  font-weight: 700;
  font-size: 16px;
  color: #111827;
}

.psl__meta-count {
  font-size: 12px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 999px;
}

.psl__sort-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.psl__sort-label {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.psl__sort-btn {
  padding: 4px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: #374151;
  transition: border-color 0.12s, background 0.12s;
}

.psl__sort-btn:hover {
  border-color: #0284c7;
  color: #0284c7;
}

.psl__sort-btn--active {
  border-color: #0284c7;
  background: #e0f2fe;
  color: #0369a1;
}

.psl__sort-arrow {
  margin-left: 2px;
  font-size: 11px;
}

.psl__state {
  padding: 24px 0;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
}

.psl__state--error {
  color: #dc2626;
}

.psl__table-wrap {
  overflow-x: auto;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

.psl__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.psl__th {
  padding: 10px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
  user-select: none;
}

.psl__th--sortable {
  cursor: pointer;
}

.psl__th--sortable:hover {
  color: #0369a1;
  background: #e0f2fe;
}

.psl__th--active {
  color: #0369a1;
}

.psl__row {
  border-bottom: 1px solid #f3f4f6;
  transition: background 0.1s;
}

.psl__row:last-child {
  border-bottom: none;
}

.psl__row:hover {
  background: #f8fafc;
}

.psl__td {
  padding: 10px 14px;
  vertical-align: middle;
}

.psl__office-name {
  font-weight: 600;
  color: #0369a1;
}

.psl__room-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #f3f4f6;
  border-radius: 6px;
  font-size: 12px;
  color: #374151;
}

.psl__freq-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.psl__freq-pill--weekly {
  background: #dcfce7;
  color: #166534;
}

.psl__freq-pill--biweekly {
  background: #dbeafe;
  color: #1d4ed8;
}

.psl__mode-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.psl__mode-pill--perm {
  background: #ecfdf5;
  color: #065f46;
}

.psl__mode-pill--temp {
  background: #fef3c7;
  color: #92400e;
}

.psl__mode-pill--active {
  background: #dbeafe;
  color: #1e40af;
}

.psl__mode-pill--hold {
  background: #f3e8ff;
  color: #6b21a8;
}

.psl__date {
  font-size: 12px;
  color: #374151;
}

.psl__date-until {
  font-size: 12px;
  color: #6b7280;
}
</style>
