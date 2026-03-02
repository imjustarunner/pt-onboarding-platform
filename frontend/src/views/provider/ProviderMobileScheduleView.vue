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
      <article v-for="item in events" :key="item.key" class="item">
        <div class="line1">
          <strong>{{ item.title }}</strong>
          <span class="pill">{{ item.kind }}</span>
        </div>
        <div class="line2">{{ item.timeLabel }}</div>
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

const normalizeEvent = (row, source) => {
  const start = toDate(row?.startAt || row?.start || row?.startDate);
  const end = toDate(row?.endAt || row?.end || row?.endDate);
  const titleFromRow = row?.summary || row?.title || row?.serviceCode || '';
  const title = String(titleFromRow || '').trim() || (source === 'office' ? 'Office event' : 'Schedule event');
  const startLabel = start ? start.toLocaleString() : 'Unknown start';
  const endLabel = end ? end.toLocaleString() : '';
  return {
    key: `${source}-${row?.id || `${startLabel}-${title}`}`,
    title,
    kind: source === 'office' ? 'Office' : 'Schedule',
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
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
  padding: 10px;
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

.pill {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.muted {
  color: var(--text-secondary);
}

.error-box {
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
</style>
