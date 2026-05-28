<template>
  <div class="epws-wrap">
    <div v-if="loading" class="muted">Loading your schedule for this event…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="data">
      <section v-if="data.availability?.length || data.mode === 'program_event'" class="epws-section">
        <h3 class="epws-h">Your availability for this event</h3>
        <p class="muted small epws-lead">
          Dates you marked as available, on waitlist, or on-call when staffing this event.
        </p>
        <ul v-if="data.availability?.length" class="epws-list">
          <li v-for="(row, i) in data.availability" :key="`av-${i}-${row.sessionDate}`">
            <strong>{{ formatDate(row.sessionDate) }}</strong>
            <span class="muted"> · {{ row.availabilityLabel }}</span>
            <span v-if="row.startsAt" class="muted">
              · {{ formatSessionWindow(row.startsAt, row.endsAt, row.timezone) }}
            </span>
            <span v-if="row.comment" class="muted"> · {{ row.comment }}</span>
          </li>
        </ul>
        <p v-else class="muted">You have not submitted availability for this event yet.</p>
      </section>

      <section class="epws-section">
        <h3 class="epws-h">Your assignments</h3>
        <p class="muted small epws-lead">
          Dates and sessions you are booked for on this event.
        </p>
        <ul v-if="data.bookings?.length" class="epws-list">
          <li v-for="(row, i) in data.bookings" :key="`bk-${i}-${row.sessionDate || row.kind}`">
            <template v-if="row.kind === 'event'">
              <strong>Assigned to event</strong>
              <span class="muted"> · {{ row.assignmentStatusLabel }}</span>
              <span v-if="row.assignedAt" class="muted"> · since {{ formatDateTime(row.assignedAt) }}</span>
            </template>
            <template v-else>
              <strong>{{ formatDate(row.sessionDate) }}</strong>
              <span v-if="row.weekday" class="muted"> · {{ row.weekday }}</span>
              <span v-if="row.startTime" class="muted">
                · {{ formatHm(row.startTime) }}–{{ formatHm(row.endTime) }}
              </span>
              <span v-else-if="row.startsAt" class="muted">
                · {{ formatSessionWindow(row.startsAt, row.endsAt, row.timezone) }}
              </span>
              <span v-if="row.skillsGroupName" class="muted"> · {{ row.skillsGroupName }}</span>
              <span v-if="row.locationLabel" class="muted"> · {{ row.locationLabel }}</span>
              <span class="pill">{{ row.assignmentStatusLabel || 'Assigned' }}</span>
            </template>
          </li>
        </ul>
        <p v-else class="muted">You are not booked on any dates for this event yet.</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String, null], default: null },
  eventId: { type: [Number, String, null], default: null }
});

const loading = ref(false);
const error = ref('');
const data = ref(null);

function formatHm(t) {
  const s = String(t || '').slice(0, 5);
  return s || '—';
}

function formatDate(ymd) {
  const s = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const d = new Date(`${s}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return s;
  try {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return s;
  }
}

function formatDateTime(raw) {
  const d = new Date(raw || 0);
  if (!Number.isFinite(d.getTime())) return String(raw || '');
  try {
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(raw || '');
  }
}

function formatSessionWindow(startsAt, endsAt, timezone) {
  const a = new Date(startsAt || 0);
  const b = new Date(endsAt || 0);
  if (!Number.isFinite(a.getTime())) return '';
  const opt = { timeStyle: 'short' };
  const tz = String(timezone || '').trim();
  if (tz) {
    try {
      opt.timeZone = tz;
    } catch {
      // ignore invalid tz
    }
  }
  try {
    const start = a.toLocaleTimeString(undefined, opt);
    const end = Number.isFinite(b.getTime()) ? b.toLocaleTimeString(undefined, opt) : '';
    return end ? `${start}–${end}` : start;
  } catch {
    return formatHm(startsAt);
  }
}

async function load() {
  const agencyId = Number(props.agencyId);
  const eventId = Number(props.eventId);
  if (!Number.isFinite(agencyId) || agencyId <= 0 || !Number.isFinite(eventId) || eventId <= 0) {
    data.value = null;
    error.value = '';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data: payload } = await api.get(`/skill-builders/events/${eventId}/me/work-schedule`, {
      params: { agencyId }
    });
    data.value = payload || null;
  } catch (e) {
    data.value = null;
    error.value = e?.response?.data?.error?.message || e?.message || 'Could not load your work schedule.';
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.agencyId, props.eventId],
  () => {
    load();
  },
  { immediate: true }
);
</script>

<style scoped>
.epws-wrap {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.epws-section {
  margin: 0;
}
.epws-h {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
  font-weight: 600;
}
.epws-lead {
  margin: 0 0 0.65rem;
}
.epws-list {
  margin: 0;
  padding-left: 1.15rem;
}
.epws-list li + li {
  margin-top: 0.35rem;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.error {
  color: #b91c1c;
}
.pill {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  background: #e2e8f0;
  font-size: 0.75rem;
}
</style>
