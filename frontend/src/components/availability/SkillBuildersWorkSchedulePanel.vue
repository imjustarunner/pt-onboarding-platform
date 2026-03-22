<template>
  <div class="sbws-wrap">
    <div v-if="loading" class="muted">Loading work schedule…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <section class="sbws-section">
        <h3 class="sbws-h">Skill Builder availability blocks</h3>
        <ul v-if="data.skillBuilderBlocks?.length" class="sbws-list">
          <li v-for="(b, i) in data.skillBuilderBlocks" :key="`b-${i}`">
            <strong>{{ b.dayOfWeek }}</strong>
            · {{ b.blockType }}
            <span v-if="b.blockType === 'CUSTOM'"> {{ b.startTime }}–{{ b.endTime }}</span>
            <span v-if="b.departFrom" class="muted"> · from {{ b.departFrom }}</span>
            <span v-if="b.isBooked" class="pill">Booked</span>
          </li>
        </ul>
        <p v-else class="muted">No recurring Skill Builder blocks on file.</p>
      </section>

      <section class="sbws-section">
        <h3 class="sbws-h">Group meetings (assigned)</h3>
        <ul v-if="data.meetings?.length" class="sbws-list">
          <li v-for="(m, i) in data.meetings" :key="`m-${i}`">
            {{ m.schoolName || 'School' }} — {{ m.skillsGroupName }}
            <span class="muted"> · {{ m.weekday }} {{ formatHm(m.startTime) }}–{{ formatHm(m.endTime) }}</span>
          </li>
        </ul>
        <p v-else class="muted">No meetings for your assigned groups.</p>
      </section>

      <section v-if="programSessionSummaries?.length" class="sbws-section">
        <h3 class="sbws-h">Upcoming scheduled sessions (this program)</h3>
        <p class="muted small sbws-lead">
          Materialized from the program week pattern and date range (same rows as the event portal “Scheduled sessions”
          card).
        </p>
        <ul class="sbws-list">
          <li v-for="(row, i) in programSessionSummaries" :key="`sess-${i}-${row.sessionDate}`">
            <strong>{{ row.sessionDate }}</strong>
            <span class="muted"> · {{ row.weekday }} {{ formatHm(row.startTime) }}–{{ formatHm(row.endTime) }}</span>
            <span v-if="row.assignedSummary && row.assignedSummary !== '—'" class="muted"> · {{ row.assignedSummary }}</span>
          </li>
        </ul>
      </section>

      <section class="sbws-section">
        <h3 class="sbws-h">Integrated events (assigned)</h3>
        <ul v-if="data.assignedEvents?.length" class="sbws-list">
          <li
            v-for="ev in data.assignedEvents"
            :key="`ae-${ev.id}`"
            :class="{ 'sbws-highlight': highlightEventIdNum > 0 && Number(ev.id) === highlightEventIdNum }"
          >
            <strong>{{ ev.title }}</strong>
            <div class="muted">{{ formatWhen(ev.startsAt, ev.endsAt) }} · {{ ev.schoolName }}</div>
          </li>
        </ul>
        <p v-else class="muted">No program events linked to your groups.</p>
      </section>

      <section v-if="!hideUpcomingOpen" class="sbws-section">
        <h3 class="sbws-h">Upcoming events (open / apply)</h3>
        <ul v-if="data.upcomingOpenEvents?.length" class="sbws-list">
          <li v-for="ev in data.upcomingOpenEvents" :key="`up-${ev.id}`">
            <strong>{{ ev.title }}</strong>
            <div class="muted">{{ formatWhen(ev.startsAt, ev.endsAt) }} · {{ ev.schoolName }}</div>
          </li>
        </ul>
        <p v-else class="muted">No other upcoming Skill Builders events right now.</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String, null], default: null },
  weekStart: { type: String, default: '' },
  /** When set, skip API and render this bundle (e.g. coordinator preview). */
  inlineData: { type: Object, default: null },
  hideUpcomingOpen: { type: Boolean, default: false },
  highlightEventId: { type: [Number, String, null], default: null },
  /** Optional rows from GET …/sessions (portal passes upcoming slice for this event). */
  programSessionSummaries: { type: Array, default: null }
});

const highlightEventIdNum = computed(() => {
  const n = Number(props.highlightEventId);
  return Number.isFinite(n) && n > 0 ? n : 0;
});

const loading = ref(false);
const error = ref('');
const data = ref({
  skillBuilderBlocks: [],
  meetings: [],
  assignedEvents: [],
  upcomingOpenEvents: []
});

function formatHm(t) {
  const s = String(t || '').slice(0, 5);
  return s || '—';
}

function formatWhen(startsAt, endsAt) {
  const a = new Date(startsAt || 0);
  const b = new Date(endsAt || 0);
  if (!Number.isFinite(a.getTime())) return '';
  const opt = { dateStyle: 'medium', timeStyle: 'short' };
  try {
    return `${a.toLocaleString(undefined, opt)} – ${Number.isFinite(b.getTime()) ? b.toLocaleString(undefined, opt) : ''}`;
  } catch {
    return String(startsAt || '');
  }
}

function applyInlineData() {
  const v = props.inlineData;
  if (!v || typeof v !== 'object') return false;
  data.value = {
    skillBuilderBlocks: v.skillBuilderBlocks || [],
    meetings: v.meetings || [],
    assignedEvents: v.assignedEvents || [],
    upcomingOpenEvents: props.hideUpcomingOpen ? [] : v.upcomingOpenEvents || []
  };
  loading.value = false;
  error.value = '';
  return true;
}

async function load() {
  if (applyInlineData()) return;
  const aid = Number(props.agencyId);
  if (!Number.isFinite(aid) || aid <= 0) return;
  loading.value = true;
  error.value = '';
  try {
    const params = { agencyId: aid, skipGlobalLoading: true };
    if (props.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(props.weekStart)) {
      params.weekStart = props.weekStart;
    }
    const res = await api.get('/skill-builders/me/work-schedule', { params });
    data.value = {
      skillBuilderBlocks: res.data?.skillBuilderBlocks || [],
      meetings: res.data?.meetings || [],
      assignedEvents: res.data?.assignedEvents || [],
      upcomingOpenEvents: res.data?.upcomingOpenEvents || []
    };
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    data.value = {
      skillBuilderBlocks: [],
      meetings: [],
      assignedEvents: [],
      upcomingOpenEvents: []
    };
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.agencyId, props.weekStart, props.inlineData, props.hideUpcomingOpen],
  () => {
    if (props.inlineData) {
      applyInlineData();
      return;
    }
    load();
  },
  { immediate: true, deep: true }
);
</script>

<style scoped>
.sbws-wrap {
  font-size: 0.9rem;
}
.sbws-section {
  margin-bottom: 20px;
}
.sbws-h {
  margin: 0 0 8px;
  font-size: 1rem;
}
.sbws-list {
  margin: 0;
  padding-left: 1.1rem;
  line-height: 1.45;
}
.sbws-list li {
  margin-bottom: 6px;
}
.sbws-highlight {
  margin-left: -4px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 2px solid var(--primary, #0f766e);
  background: rgba(15, 118, 110, 0.06);
  list-style-position: outside;
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
