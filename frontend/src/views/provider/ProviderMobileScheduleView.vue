<template>
  <section class="card">
    <div class="section-head">
      <div>
        <h2>This Week</h2>
        <p>{{ weekLabel }}</p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="load">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="muted">Loading schedule…</div>
    <div v-else-if="events.length === 0" class="muted">No schedule items for this week.</div>

    <div v-else class="list">
      <article
        v-for="item in events"
        :key="item.key"
        class="item"
        :class="[
          item.isOffice ? `item-office item-office--${item.officeStatus}` : 'item-schedule'
        ]"
      >
        <div class="line1">
          <strong>{{ item.title }}</strong>
          <span class="pill" :class="{ 'pill-office': item.isOffice }">{{ item.kind }}</span>
        </div>
        <div class="line2">{{ item.timeLabel }}</div>
        <div v-if="item.isOffice" class="office-status">
          <svg class="door-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 21h18" /><path d="M5 21V7l7-4v18" /><path d="M19 21V11l-7-4" />
          </svg>
          <span>{{ item.officeStatusLabel }}</span>
          <span v-if="item.officeEmpty" class="office-empty"> · No bookings</span>
        </div>
        <div v-else class="office-status muted">No office / any location</div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref('');
const events = ref([]);

const mondayIso = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
};

const weekStart = ref(mondayIso());

const weekLabel = computed(() => `Week of ${weekStart.value}`);

const resolveAgencyId = async () => {
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  if (current?.id) return Number(current.id);
  const rows = await agencyStore.fetchUserAgencies();
  if (Array.isArray(rows) && rows[0]?.id) return Number(rows[0].id);
  return null;
};

const toDate = (raw) => {
  const d = new Date(raw || '');
  return Number.isNaN(d.getTime()) ? null : d;
};

const officeMetaFromRow = (row) => {
  const st = String(row?.slotState || row?.slot_state || '').toUpperCase();
  const building = String(row?.buildingName || '').trim();
  const roomNumber = String(row?.roomNumber || '').trim();
  const roomLabel = String(row?.roomLabel || '').trim();
  const roomShort = roomNumber ? `#${roomNumber}` : roomLabel;
  const title = [building, roomShort].filter(Boolean).join(' ') || 'Office';
  if (st === 'ASSIGNED_BOOKED') {
    return { title, officeStatus: 'booked', officeStatusLabel: 'Office reserved', officeEmpty: false, kind: 'Office booked' };
  }
  if (st === 'ASSIGNED_TEMPORARY') {
    return { title, officeStatus: 'temp', officeStatusLabel: 'Temp hold', officeEmpty: false, kind: 'Temp hold' };
  }
  return { title, officeStatus: 'reserved', officeStatusLabel: 'Office reserved', officeEmpty: true, kind: 'Office reserved' };
};

const normalizeEvent = (row, source) => {
  const start = toDate(row?.startAt || row?.start || row?.startDate);
  const end = toDate(row?.endAt || row?.end || row?.endDate);
  const startLabel = start ? start.toLocaleString() : 'Unknown start';
  const endLabel = end ? end.toLocaleString() : '';
  if (source === 'office') {
    const meta = officeMetaFromRow(row);
    return {
      key: `office-${row?.id || `${startLabel}-${meta.title}`}`,
      title: meta.title,
      kind: meta.kind,
      isOffice: true,
      officeStatus: meta.officeStatus,
      officeStatusLabel: meta.officeStatusLabel,
      officeEmpty: meta.officeEmpty,
      startMs: start ? start.getTime() : Number.MAX_SAFE_INTEGER,
      timeLabel: endLabel ? `${startLabel} - ${endLabel}` : startLabel
    };
  }
  const titleFromRow = row?.summary || row?.title || row?.serviceCode || '';
  const title = String(titleFromRow || '').trim() || 'Schedule event';
  return {
    key: `schedule-${row?.id || `${startLabel}-${title}`}`,
    title,
    kind: 'Schedule',
    isOffice: false,
    startMs: start ? start.getTime() : Number.MAX_SAFE_INTEGER,
    timeLabel: endLabel ? `${startLabel} - ${endLabel}` : startLabel
  };
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const agencyId = await resolveAgencyId();
    const userId = Number(authStore.user?.id || 0);
    if (!agencyId || !userId) {
      throw new Error('Missing provider or organization context.');
    }

    const resp = await api.get(`/users/${userId}/schedule-summary`, {
      params: {
        weekStart: weekStart.value,
        agencyId
      }
    });

    const summary = resp.data || {};
    const office = Array.isArray(summary.officeEvents) ? summary.officeEvents.map((r) => normalizeEvent(r, 'office')) : [];
    const sched = Array.isArray(summary.scheduleEvents) ? summary.scheduleEvents.map((r) => normalizeEvent(r, 'schedule')) : [];
    events.value = [...office, ...sched].sort((a, b) => a.startMs - b.startMs);
  } catch (e) {
    events.value = [];
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load schedule.';
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.section-head h2 {
  margin: 0;
  font-size: 18px;
}

.section-head p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.list {
  display: grid;
  gap: 10px;
}

.item {
  border: 1.5px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  padding: 12px;
}

.item-office--reserved {
  background: rgba(191, 219, 254, 0.35);
  border-style: dashed;
  border-color: rgba(37, 99, 235, 0.55);
}

.item-office--temp {
  background: rgba(254, 215, 170, 0.4);
  border-style: dashed;
  border-color: rgba(194, 65, 12, 0.55);
}

.item-office--booked {
  background: rgba(187, 247, 208, 0.45);
  border-style: solid;
  border-color: rgba(21, 128, 61, 0.55);
}

.line1 {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.line2 {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.office-status {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
  color: rgba(30, 64, 175, 0.95);
}

.item-office--booked .office-status { color: rgba(22, 101, 52, 0.95); }
.item-office--temp .office-status { color: rgba(154, 52, 18, 0.95); }

.office-empty {
  font-style: italic;
  font-weight: 600;
  color: rgba(71, 85, 105, 0.95);
}

.door-icon { flex: 0 0 auto; }

.pill {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.pill-office {
  font-weight: 700;
}

.muted {
  color: var(--text-secondary);
}

.error-box {
  color: #b00020;
  margin-bottom: 8px;
}
</style>
