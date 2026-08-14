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
        v-for="(group, gi) in displayRows"
        :key="`row-${gi}-${group.map((i) => i.id).join('-')}`"
        class="timeline-row"
        :class="{ 'is-multi': group.length > 1 }"
      >
        <div
          v-for="item in group"
          :key="item.id"
          class="timeline-card"
          :class="[
            `is-${item.status}`,
            { 'is-now': item.status === 'in_progress' },
            { 'is-clickable': item.clickable }
          ]"
          role="button"
          :tabindex="item.clickable ? 0 : -1"
          @click="openItem(item)"
          @keydown.enter.prevent="openItem(item)"
          @keydown.space.prevent="openItem(item)"
        >
          <div class="timeline-card-inner">
            <span class="time">{{ item.timeLabel }}</span>
            <div class="copy">
              <strong>{{ item.title }}</strong>
              <small v-if="item.subtitle">{{ item.subtitle }}</small>
            </div>
            <div class="timeline-actions">
              <button
                v-if="canJoinItem(item)"
                type="button"
                class="join-btn"
                @click.stop="joinItem(item)"
              >
                Join
              </button>
              <span
                v-else-if="item.status !== 'completed'"
                class="status-pill"
                :class="`status-pill--${item.status}`"
              >
                {{ statusLabel(item.status) }}
              </span>
            </div>
          </div>
        </div>
      </li>
    </ul>
    <footer v-if="items.length" class="foot">
      {{ items.length }} item{{ items.length === 1 ? '' : 's' }} today
    </footer>

    <div v-if="detailItem" class="modal-overlay" @click.self="closeDetail">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ops-sched-detail-title">
        <header class="modal-header">
          <h3 id="ops-sched-detail-title">{{ detailItem.title }}</h3>
          <button type="button" class="modal-close" aria-label="Close" @click="closeDetail">×</button>
        </header>
        <div class="modal-body">
          <p class="modal-time">{{ detailItem.timeLabel }}</p>
          <p v-if="detailItem.subtitle" class="modal-sub">{{ detailItem.subtitle }}</p>
          <p class="modal-status">
            <span class="status-pill" :class="`status-pill--${detailItem.status}`">
              {{ statusLabel(detailItem.status) }}
            </span>
          </p>
        </div>
        <footer class="modal-footer">
          <button type="button" class="btn-secondary" @click="closeDetail">Close</button>
          <button
            v-if="canJoinItem(detailItem)"
            type="button"
            class="btn-primary"
            @click="joinItem(detailItem)"
          >
            Join session
          </button>
          <button type="button" class="btn-linkish" @click="goSchedule">
            Open in schedule
          </button>
        </footer>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import { formatViewerTimeRangeMs } from '../../../utils/timezones.js';
import { parseScheduleUtcInstant } from '../../../utils/scheduleEventInstants.js';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  userId: { type: [Number, String], default: null },
  schedulePath: { type: String, default: '/my-schedule' }
});

const emit = defineEmits(['navigate']);

const loading = ref(true);
const error = ref('');
const items = ref([]);
const detailItem = ref(null);

function eventsOverlap(a, b) {
  const a0 = a.startMs ?? 0;
  const a1 = a.endMs ?? a0 + 1;
  const b0 = b.startMs ?? 0;
  const b1 = b.endMs ?? b0 + 1;
  return a0 < b1 && b0 < a1;
}

function buildOverlapGroups(sortedItems) {
  const groups = [];
  const assigned = new Set();
  for (const item of sortedItems) {
    if (assigned.has(item.id)) continue;
    const group = [item];
    assigned.add(item.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const other of sortedItems) {
        if (assigned.has(other.id)) continue;
        if (group.some((g) => eventsOverlap(g, other))) {
          group.push(other);
          assigned.add(other.id);
          changed = true;
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

const displayRows = computed(() => buildOverlapGroups(items.value));

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
  const d = parseScheduleUtcInstant(v);
  return d ? d.getTime() : null;
}

function isSameLocalDay(ms, ymd) {
  if (ms == null) return false;
  return localYmd(new Date(ms)) === ymd;
}

/** All-day spans use exclusive end_date YMD — compare as dates, not Date.parse (UTC skew). */
function allDayCoversLocalDay(startDate, endDate, ymd) {
  const start = String(startDate || '').slice(0, 10);
  const end = String(endDate || '').slice(0, 10);
  if (!start || !end || !ymd) return false;
  return start <= ymd && ymd < end;
}

function formatTimeRange(startMs, endMs) {
  const range = formatViewerTimeRangeMs(startMs, endMs);
  return range || 'TBD';
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

function statusLabel(status) {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Upcoming';
}

function resolveJoinUrl(item) {
  if (!item) return '';
  const raw = String(
    item.joinUrl ||
    item.hostJoinUrl ||
    item.participantJoinUrl ||
    item.appJoinUrl ||
    item.meetLink ||
  '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${raw}`;
  }
  return raw;
}

function canJoinItem(item) {
  return !!resolveJoinUrl(item);
}

function joinItem(item) {
  const url = resolveJoinUrl(item);
  if (!url) return;
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    window.location.href = url;
  }
}

function openItem(item) {
  if (!item?.clickable) return;
  detailItem.value = item;
}

function closeDetail() {
  detailItem.value = null;
}

function goSchedule() {
  closeDetail();
  emit('navigate', props.schedulePath);
}

function scheduleJoinFields(e, kind) {
  const k = String(kind || '').toUpperCase();
  if (k === 'SUPERVISION' || kind === 'supervision') {
    return {
      joinUrl: e.joinUrl || e.participantJoinUrl || e.meetingUrl || null,
      hostJoinUrl: e.hostJoinUrl || null,
      meetLink: e.googleMeetLink || e.meetLink || null,
      modality: e.modality || null
    };
  }
  if (k === 'TEAM_MEETING' || k === 'HUDDLE') {
    return {
      joinUrl: e.appJoinUrl || e.participantJoinUrl || null,
      hostJoinUrl: e.hostJoinUrl || null,
      meetLink: e.meetLink || null,
      modality: 'virtual'
    };
  }
  return {
    joinUrl: e.appJoinUrl || e.participantJoinUrl || e.joinUrl || null,
    hostJoinUrl: e.hostJoinUrl || null,
    meetLink: e.meetLink || null,
    modality: e.modality || null
  };
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
    const joins = scheduleJoinFields(e, 'office');
    rows.push({
      id: `office-${e.id || startMs}`,
      kind: 'office',
      title: room || 'Office appointment',
      subtitle: e.displayStatus || 'Office',
      startMs,
      endMs,
      timeLabel: formatTimeRange(startMs, endMs),
      status: statusForWindow(startMs, endMs, now),
      ...joins,
      clickable: true
    });
  }

  for (const e of s.scheduleEvents || []) {
    const eventKind = String(e.kind || '').trim().toUpperCase();
    const reasonCode = String(e.reasonCode || e.reason_code || '').trim().toUpperCase();
    const isCancelled = !!(e.isCancelled || String(e.status || '').toUpperCase() === 'CANCELLED');
    // Deleted planned outs leave CANCELLED holds — hide them from Today's Schedule.
    if (isCancelled && reasonCode === 'PLANNED_OUT') continue;

    const allDay = !!(e.allDay || e.all_day);
    let startMs = parseAt(e.startAt || e.startsAt);
    let endMs = parseAt(e.endAt || e.endsAt);
    if (allDay) {
      if (!allDayCoversLocalDay(e.startDate || e.start_date, e.endDate || e.end_date, ymd)) continue;
      // Wall-clock markers for sorting / status (local midnight → next midnight).
      startMs = new Date(`${ymd}T00:00:00`).getTime();
      endMs = new Date(`${ymd}T23:59:59`).getTime();
    } else if (!isSameLocalDay(startMs, ymd) && !isSameLocalDay(endMs, ymd)) {
      continue;
    }

    const joins = scheduleJoinFields(e, eventKind);
    const isPlannedOut = reasonCode === 'PLANNED_OUT';
    const title = isPlannedOut
      ? (e.title || 'Planned out')
      : (e.title || e.kind || 'Scheduled event');
    const subtitle = isPlannedOut
      ? (e.description || 'Planned out · schedule block')
      : (e.location || e.subtitle || e.description || '');
    rows.push({
      id: `sched-${e.kind || 'evt'}-${e.id || startMs}`,
      kind: isPlannedOut ? 'planned_out' : String(e.kind || 'event').toLowerCase(),
      eventKind,
      eventId: Number(e.id || 0) || null,
      title,
      subtitle,
      startMs,
      endMs,
      timeLabel: allDay ? 'All day' : formatTimeRange(startMs, endMs),
      status: statusForWindow(startMs, endMs, now),
      ...joins,
      clickable: true
    });
  }

  for (const e of s.supervisionSessions || []) {
    const startMs = parseAt(e.startAt || e.startsAt);
    const endMs = parseAt(e.endAt || e.endsAt);
    if (!isSameLocalDay(startMs, ymd) && !isSameLocalDay(endMs, ymd)) continue;
    const who = String(e.counterpartyName || e.superviseeName || e.supervisorName || '').trim();
    const sessionType = String(e.sessionType || e.session_type || '').trim();
    const joins = scheduleJoinFields(e, 'supervision');
    rows.push({
      id: `supv-${e.id || startMs}`,
      kind: 'supervision',
      eventId: Number(e.id || 0) || null,
      title: who ? `Supervision · ${who}` : (e.title || 'Supervision'),
      subtitle: sessionType || 'Supervision',
      startMs,
      endMs,
      timeLabel: formatTimeRange(startMs, endMs),
      status: statusForWindow(startMs, endMs, now),
      ...joins,
      clickable: true
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
  min-height: 240px;
  max-height: 360px;
  height: 100%;
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
  gap: 6px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.timeline-row {
  display: flex;
  gap: 6px;
  min-height: 44px;
}
.timeline-row.is-multi .timeline-card {
  flex: 1 1 0;
  min-width: 0;
}
.timeline-card {
  flex: 1;
  min-width: 0;
  height: 44px;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 18%, #e2e8f0);
  border-radius: 8px;
  padding: 0;
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 7%, #fff);
  transition: box-shadow 0.15s ease;
}
.timeline-card.is-completed {
  background: #f8fafc;
  border-color: #e2e8f0;
}
.timeline-card.is-clickable {
  cursor: pointer;
}
.timeline-card.is-clickable:hover {
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}
.timeline-card.is-now {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ops-primary, #1f6b4a) 35%, transparent);
}
.timeline-card-inner {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  height: 100%;
}
.time {
  font-size: 9px;
  font-weight: 700;
  color: #475569;
  line-height: 1.25;
}
.copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.copy strong {
  font-size: 11px;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy small {
  font-size: 9px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.timeline-card.is-completed .copy strong {
  color: #64748b;
}
.timeline-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}
.join-btn {
  border: none;
  border-radius: 999px;
  background: #15803d;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  padding: 4px 8px;
  cursor: pointer;
  white-space: nowrap;
}
.join-btn:hover { background: #166534; }
.status-pill {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  white-space: nowrap;
}
.status-pill--completed { background: #dcfce7; color: #166534; }
.status-pill--in_progress { background: #ede9fe; color: #6b21a8; }
.status-pill--upcoming { background: #f1f5f9; color: #475569; }
.foot {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #f1f5f9;
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 16px;
}
.modal {
  width: min(420px, 100%);
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
  overflow: hidden;
}
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px 8px;
}
.modal-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
}
.modal-close {
  border: none;
  background: none;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}
.modal-body {
  padding: 0 16px 12px;
}
.modal-time {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
}
.modal-sub {
  margin: 0 0 10px;
  font-size: 13px;
  color: #64748b;
}
.modal-status { margin: 0; }
.modal-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px 14px;
  border-top: 1px solid #f1f5f9;
}
.btn-primary,
.btn-secondary,
.btn-linkish {
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 12px;
  cursor: pointer;
}
.btn-primary {
  border: none;
  background: #15803d;
  color: #fff;
}
.btn-primary:hover { background: #166534; }
.btn-secondary {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
}
.btn-linkish {
  border: none;
  background: none;
  color: var(--ops-primary, #1f6b4a);
  padding: 8px 4px;
}
.btn-linkish:hover { text-decoration: underline; }
@media (max-width: 640px) {
  .timeline-card-inner {
    grid-template-columns: 1fr auto;
  }
  .time {
    grid-column: 1;
  }
  .copy {
    grid-column: 1;
  }
  .timeline-actions {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}
</style>
