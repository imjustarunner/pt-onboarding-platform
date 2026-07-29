<template>
  <article class="ops-day-schedule panel" aria-label="Today's schedule">
    <div class="panel-header">
      <h2>Today's Schedule</h2>
      <button type="button" class="link-btn" @click="$emit('navigate', schedulePath)">Day view</button>
    </div>
    <p class="panel-date">{{ dateLabel }}</p>

    <div v-if="loading" class="empty">Loading…</div>
    <div v-else-if="error" class="empty error">{{ error }}</div>
    <div v-else-if="!items.length" class="empty-state">
      <p class="empty">Nothing on the calendar today.</p>
      <button type="button" class="mini-btn" @click="$emit('navigate', schedulePath)">Open schedule</button>
    </div>
    <ul v-else class="timeline">
      <li
        v-for="item in items"
        :key="item.id"
        class="timeline-row"
        :class="[`is-${item.status}`, { 'is-now': item.status === 'in_progress' }]"
      >
        <span class="time">{{ item.timeLabel }}</span>
        <div class="copy">
          <strong>{{ item.title }}</strong>
          <small v-if="item.subtitle">{{ item.subtitle }}</small>
        </div>
      </li>
    </ul>
    <footer v-if="items.length" class="foot">
      {{ items.length }} item{{ items.length === 1 ? '' : 's' }} today
    </footer>
  </article>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  userId: { type: [Number, String], default: null },
  schedulePath: { type: String, default: '/my-schedule' }
});

defineEmits(['navigate']);

const loading = ref(true);
const error = ref('');
const items = ref([]);

const dateLabel = computed(() => {
  try {
    return new Date().toLocaleDateString([], {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return 'Today';
  }
});

function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeekMondayYmd(dateLike = new Date()) {
  const d = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return localYmd();
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return localYmd(d);
}

function parseAt(v) {
  const t = new Date(v || 0).getTime();
  return Number.isFinite(t) ? t : null;
}

function isSameLocalDay(ms, ymd) {
  if (ms == null) return false;
  return localYmd(new Date(ms)) === ymd;
}

function formatTimeRange(startMs, endMs) {
  const opts = { hour: 'numeric', minute: '2-digit' };
  const start = startMs != null ? new Date(startMs).toLocaleTimeString([], opts) : '';
  const end = endMs != null ? new Date(endMs).toLocaleTimeString([], opts) : '';
  if (start && end) return `${start} – ${end}`;
  return start || end || 'TBD';
}

function statusForWindow(startMs, endMs, now = Date.now()) {
  if (startMs != null && endMs != null) {
    if (now >= startMs && now <= endMs) return 'in_progress';
    if (now > endMs) return 'completed';
    return 'upcoming';
  }
  if (startMs != null) return now >= startMs ? 'in_progress' : 'upcoming';
  return 'upcoming';
}

function buildTodayItems(summary) {
  const s = summary || {};
  const ymd = localYmd();
  const now = Date.now();
  const rows = [];

  for (const e of s.officeEvents || []) {
    const startMs = parseAt(e.startAt || e.startsAt);
    const endMs = parseAt(e.endAt || e.endsAt);
    if (!isSameLocalDay(startMs, ymd) && !isSameLocalDay(endMs, ymd)) continue;
    const room = [e.buildingName, e.roomLabel].filter(Boolean).join(' · ');
    rows.push({
      id: `office-${e.id || startMs}`,
      title: room || 'Office appointment',
      subtitle: e.displayStatus || 'Office',
      startMs,
      timeLabel: formatTimeRange(startMs, endMs),
      status: statusForWindow(startMs, endMs, now)
    });
  }

  for (const e of s.scheduleEvents || []) {
    const startMs = parseAt(e.startAt || e.startsAt || e.startDate);
    const endMs = parseAt(e.endAt || e.endsAt || e.endDate);
    if (!isSameLocalDay(startMs, ymd) && !isSameLocalDay(endMs, ymd)) continue;
    rows.push({
      id: `sched-${e.kind || 'evt'}-${e.id || startMs}`,
      title: e.title || e.kind || 'Scheduled event',
      subtitle: e.location || e.subtitle || '',
      startMs,
      timeLabel: formatTimeRange(startMs, endMs),
      status: statusForWindow(startMs, endMs, now)
    });
  }

  for (const e of s.supervisionSessions || []) {
    const startMs = parseAt(e.startAt || e.startsAt);
    const endMs = parseAt(e.endAt || e.endsAt);
    if (!isSameLocalDay(startMs, ymd) && !isSameLocalDay(endMs, ymd)) continue;
    const who = String(e.counterpartyName || e.superviseeName || e.supervisorName || '').trim();
    rows.push({
      id: `supv-${e.id || startMs}`,
      title: who ? `Supervision · ${who}` : (e.title || 'Supervision'),
      subtitle: String(e.sessionType || e.session_type || 'Supervision'),
      startMs,
      timeLabel: formatTimeRange(startMs, endMs),
      status: statusForWindow(startMs, endMs, now)
    });
  }

  rows.sort((a, b) => (a.startMs || 0) - (b.startMs || 0));
  return rows;
}

async function load() {
  const uid = Number(props.userId);
  const aid = Number(props.agencyId);
  if (!uid || !aid) {
    items.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/users/${uid}/schedule-summary`, {
      params: { agencyId: aid, weekStart: startOfWeekMondayYmd(), includeAllAgencies: 1 },
      skipGlobalLoading: true
    });
    items.value = buildTodayItems(res.data);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load schedule';
    items.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.userId, props.agencyId],
  () => load()
);
onMounted(load);
</script>

<style scoped>
.ops-day-schedule {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: 0 6px 18px color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, transparent);
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 420px;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.panel-header h2 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 800;
  color: var(--ops-primary, #1f6b4a);
}
.link-btn {
  border: none;
  background: none;
  color: var(--ops-primary, #1f6b4a);
  font-weight: 700;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.link-btn:hover { text-decoration: underline; }
.panel-date {
  margin: 2px 0 8px;
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
}
.empty {
  font-size: 12px;
  color: #94a3b8;
  padding: 8px 0;
  margin: 0;
}
.empty.error { color: #b91c1c; }
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0 8px;
}
.mini-btn {
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 30%, #e2e8f0);
  background: #fff;
  color: var(--ops-primary, #1f6b4a);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.timeline-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid #f1f5f9;
}
.timeline-row:last-child { border-bottom: none; }
.timeline-row.is-now {
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 8%, #fff);
  margin: 0 -6px;
  padding-left: 6px;
  padding-right: 6px;
  border-radius: 8px;
  border-bottom-color: transparent;
}
.time {
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  line-height: 1.3;
}
.copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.copy strong {
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy small {
  font-size: 10px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.timeline-row.is-completed .copy strong {
  color: #64748b;
}
.foot {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #f1f5f9;
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
}
</style>
