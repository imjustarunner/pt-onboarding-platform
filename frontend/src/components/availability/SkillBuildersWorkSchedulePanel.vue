<template>
  <div class="sbws-wrap">
    <div v-if="loading" class="muted">Loading work schedule…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <section v-if="Number(data.programCreditHoursPerWeek) > 0" class="sbws-section">
        <h3 class="sbws-h">Program time (counts toward 6 hr/week)</h3>
        <p class="muted small">
          About <strong>{{ Number(data.programCreditHoursPerWeek).toFixed(2) }}</strong> hrs/week from your Skill Builders
          program meetings (session start→end; if times are missing, 1.5× the event’s direct hours).
        </p>
        <ul v-if="data.programCreditItems?.length" class="sbws-list">
          <li v-for="(it, i) in data.programCreditItems" :key="`pc-${i}`">
            {{ it.eventTitle || it.skillsGroupName || 'Program' }}
            <span class="muted"> · {{ it.weekday }} {{ formatHm(it.startTime) }}–{{ formatHm(it.endTime) }}</span>
            <span class="muted"> · ~{{ (it.minutes / 60).toFixed(2) }} hr</span>
          </li>
        </ul>
      </section>

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
        <ul v-if="data.assignedEvents?.length" class="sbws-list sbws-list-events">
          <li
            v-for="ev in data.assignedEvents"
            :key="`ae-${ev.id}`"
            :class="{ 'sbws-highlight': highlightEventIdNum > 0 && Number(ev.id) === highlightEventIdNum }"
          >
            <button type="button" class="sbws-event-link" @click="goEventPortal(ev)">
              <strong>{{ ev.title }}</strong>
              <div class="muted">{{ formatWhen(ev.startsAt, ev.endsAt) }} · {{ ev.schoolName }}</div>
              <span class="sbws-cta">Open event portal →</span>
            </button>
          </li>
        </ul>
        <p v-else class="muted">No program events linked to your groups.</p>
      </section>

      <section v-if="!hideUpcomingOpen" class="sbws-section">
        <h3 class="sbws-h">Upcoming events (open / apply)</h3>
        <p class="muted small sbws-lead">
          Same events as Skill Builders → Events → “Upcoming (apply).” Open goes to the event portal; Apply submits your
          interest when you are not on that group’s roster yet.
        </p>
        <ul v-if="data.upcomingOpenEvents?.length" class="sbws-list sbws-list-events">
          <li v-for="ev in data.upcomingOpenEvents" :key="`up-${ev.id}`" class="sbws-up-row">
            <button type="button" class="sbws-event-link" @click="goEventPortal(ev)">
              <strong>{{ ev.title }}</strong>
              <div class="muted">{{ formatWhen(ev.startsAt, ev.endsAt) }} · {{ ev.schoolName }}</div>
              <span class="sbws-cta">Open event portal →</span>
            </button>
            <div v-if="mode === 'provider'" class="sbws-up-actions">
              <button
                v-if="!ev.applicationStatus || ev.applicationStatus === 'withdrawn'"
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="applyBusyId === ev.id"
                @click.stop="applyToEvent(ev)"
              >
                {{ applyBusyId === ev.id ? 'Applying…' : 'Apply' }}
              </button>
              <span v-else-if="ev.applicationStatus === 'pending'" class="muted small">Application pending</span>
              <span v-else-if="ev.applicationStatus === 'approved'" class="muted small">Approved</span>
            </div>
          </li>
        </ul>
        <p v-else class="muted">No other upcoming Skill Builders events right now.</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String, null], default: null },
  weekStart: { type: String, default: '' },
  /** When set, skip API and render this bundle (e.g. coordinator preview). */
  inlineData: { type: Object, default: null },
  hideUpcomingOpen: { type: Boolean, default: false },
  highlightEventId: { type: [Number, String, null], default: null },
  /** Optional rows from GET …/sessions (portal passes upcoming slice for this event). */
  programSessionSummaries: { type: Array, default: null },
  /** Provider: show Apply on open events. Coordinator: open portal only (no staff apply). */
  mode: { type: String, default: 'provider' }
});

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const applyBusyId = ref(null);

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
  upcomingOpenEvents: [],
  programCreditHoursPerWeek: 0,
  programCreditItems: []
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
    upcomingOpenEvents: props.hideUpcomingOpen ? [] : v.upcomingOpenEvents || [],
    programCreditHoursPerWeek: Number(v.programCreditHoursPerWeek || 0),
    programCreditItems: Array.isArray(v.programCreditItems) ? v.programCreditItems : []
  };
  loading.value = false;
  error.value = '';
  return true;
}

function orgSlug() {
  return (
    String(route.params?.organizationSlug || '').trim() ||
    String(agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || '').trim()
  );
}

function goEventPortal(ev) {
  const id = Number(ev?.id ?? ev);
  if (!Number.isFinite(id) || id <= 0) return;
  const fromEv =
    ev && typeof ev === 'object' && ev.programPortalSlug
      ? String(ev.programPortalSlug).trim().toLowerCase()
      : '';
  const slug = fromEv || orgSlug();
  if (slug) router.push(`/${slug}/skill-builders/event/${id}`);
}

async function applyToEvent(ev) {
  const aid = Number(props.agencyId);
  if (!Number.isFinite(aid) || aid <= 0 || !ev?.id) return;
  applyBusyId.value = ev.id;
  try {
    await api.post('/skill-builders/me/applications', { agencyId: aid, companyEventId: ev.id }, { skipGlobalLoading: true });
    await load();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Apply failed');
  } finally {
    applyBusyId.value = null;
  }
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
      upcomingOpenEvents: res.data?.upcomingOpenEvents || [],
      programCreditHoursPerWeek: Number(res.data?.programCreditHoursPerWeek || 0),
      programCreditItems: Array.isArray(res.data?.programCreditItems) ? res.data.programCreditItems : []
    };
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    data.value = {
      skillBuilderBlocks: [],
      meetings: [],
      assignedEvents: [],
      upcomingOpenEvents: [],
      programCreditHoursPerWeek: 0,
      programCreditItems: []
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
.sbws-list-events {
  list-style: none;
  padding-left: 0;
}
.sbws-list-events .sbws-up-row {
  list-style: none;
}
.sbws-event-link {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 10px;
  margin: 0;
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  box-sizing: border-box;
}
.sbws-event-link:hover {
  background: rgba(15, 118, 110, 0.07);
}
.sbws-event-link strong {
  color: var(--primary, #0f766e);
}
.sbws-cta {
  display: block;
  margin-top: 4px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--primary, #0f766e);
}
.sbws-up-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px 14px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.sbws-up-row:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.sbws-up-row .sbws-event-link {
  flex: 1;
  min-width: min(100%, 200px);
}
.sbws-up-actions {
  flex-shrink: 0;
  padding-top: 2px;
}
.sbws-lead {
  margin: 0 0 10px;
  line-height: 1.45;
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
