<template>
  <div class="cct">
    <div class="cct-head" v-if="title || hint">
      <h3 class="cct-title">{{ title }}</h3>
      <p v-if="hint" class="hint cct-hint">{{ hint }}</p>
    </div>
    <div v-if="loading" class="muted">Loading care timeline…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!flatEvents.length" class="muted">No care events on file yet.</div>
    <div v-else class="cct-years">
      <section
        v-for="(group, idx) in displayGroups"
        :key="group.key"
        class="cct-year"
        :class="{ 'cct-year--collapsed': group.collapsed }"
      >
        <button
          v-if="group.collapsible"
          type="button"
          class="cct-year-toggle"
          @click="toggleGroup(group.key)"
        >
          <span>{{ group.label }}</span>
          <span class="muted tiny">{{ group.events.length }} event{{ group.events.length === 1 ? '' : 's' }}</span>
          <span class="cct-chevron">{{ group.collapsed ? '▸' : '▾' }}</span>
        </button>
        <header v-else class="cct-year-head">
          <h4>{{ group.label }}</h4>
        </header>
        <ol v-if="!group.collapsed" class="cct-events">
          <li
            v-for="ev in group.events"
            :key="ev.id"
            class="cct-event"
            :class="{ 'cct-event--pending': ev.kind === 'action_needed' }"
          >
            <div class="cct-dot" aria-hidden="true" />
            <div class="cct-event-body">
              <div class="cct-event-title">{{ ev.title }}</div>
              <div class="cct-event-meta">
                <span v-if="ev.statusLabel" class="cct-status">{{ ev.statusLabel }}</span>
                <span v-if="ev.whenLabel" class="muted">{{ ev.whenLabel }}</span>
                <span v-if="ev.actor" class="muted">{{ ev.actor }}</span>
              </div>
            </div>
            <button
              v-if="ev.canView && ev.actionKey"
              type="button"
              class="btn btn-secondary btn-sm"
              @click="$emit('view-event', ev)"
            >
              View
            </button>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  client: { type: Object, default: null },
  title: { type: String, default: 'Care timeline' },
  hint: { type: String, default: 'Real intake, assignment, session, and lifecycle events — not packet checklist stages.' },
  compact: { type: Boolean, default: false }
});
defineEmits(['view-event']);

const loading = ref(false);
const error = ref('');
const years = ref([]);
const joinSchoolYear = ref('');
const collapsedKeys = ref(new Set());
const officeEvents = ref([]);

const isSchool = computed(() => String(props.client?.client_type || props.client?.type || '').toLowerCase() === 'school'
  || Boolean(props.client?.school_year));

async function load() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`/clients/${id}/lifecycle-history`, { skipGlobalLoading: true });
    years.value = Array.isArray(r.data?.years) ? r.data.years : [];
    joinSchoolYear.value = String(r.data?.joinSchoolYear || '');
    // Seed collapsed keys: keep current/most-recent year open; older years collapsed
    const keys = years.value.map((y) => String(y.schoolYear || 'unknown'));
    const keepOpen = keys[0] || '';
    collapsedKeys.value = new Set(keys.filter((k) => k && k !== keepOpen));
    buildOfficeFallback();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load care timeline';
    years.value = [];
    buildOfficeFallback();
  } finally {
    loading.value = false;
  }
}

function buildOfficeFallback() {
  const c = props.client || {};
  const items = [];
  const push = (id, title, when, statusLabel = '') => {
    if (!when && !title) return;
    items.push({
      id,
      title,
      kind: 'milestone',
      statusLabel,
      whenLabel: formatWhen(when),
      completedAt: when || null,
      canView: false
    });
  };
  push('created', 'Client record created', c.created_at || c.createdAt);
  push('intake', 'Intake submitted', c.intake_submitted_at || c.intake_completed_at || c.public_intake_submitted_at);
  push('assigned', 'Clinician assigned', c.provider_assigned_at || c.assigned_at);
  push('first-session', 'First session', c.first_service_at || c.first_session_at);
  push('terminated', 'Services terminated', c.terminated_at || c.termination_date, c.termination_reason || '');
  officeEvents.value = items.filter((x) => x.whenLabel || x.title);
}

function formatWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleString();
}

const flatEvents = computed(() => {
  if (years.value.length) {
    return years.value.flatMap((y) => (y.events || []).map((ev, i) => ({
      ...ev,
      id: ev.id || `${y.schoolYear}-${i}`,
      whenLabel: ev.completedAt ? formatWhen(ev.completedAt) : '',
      schoolYear: y.schoolYear
    })));
  }
  return officeEvents.value;
});

const displayGroups = computed(() => {
  if (years.value.length) {
    return years.value.map((y, idx) => {
      const key = String(y.schoolYear || `y-${idx}`);
      const events = (y.events || []).map((ev, i) => ({
        ...ev,
        id: ev.id || `${key}-${i}`,
        whenLabel: ev.completedAt ? formatWhen(ev.completedAt) : '',
        actor: ev.actorName || ev.completedByName || ''
      }));
      return {
        key,
        label: y.schoolYear || 'School year',
        events,
        collapsible: idx > 0 || years.value.length > 1,
        collapsed: collapsedKeys.value.has(key) && idx > 0
      };
    });
  }
  return [{
    key: 'office',
    label: isSchool.value ? 'Lifecycle' : 'Office care path',
    events: officeEvents.value,
    collapsible: false,
    collapsed: false
  }];
});

function toggleGroup(key) {
  const next = new Set(collapsedKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedKeys.value = next;
}

onMounted(load);
watch(() => props.clientId, load);
</script>

<style scoped>
.cct-head { margin-bottom: 10px; }
.cct-title { margin: 0 0 4px; font-size: 15px; font-weight: 750; color: var(--text-primary, #0f172a); }
.cct-hint { margin: 0; }
.cct-years { display: flex; flex-direction: column; gap: 14px; }
.cct-year-head h4 { margin: 0 0 8px; font-size: 13px; font-weight: 750; color: var(--text-secondary, #64748b); text-transform: uppercase; letter-spacing: 0.04em; }
.cct-year-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: var(--bg-alt, #f8fafc);
  color: var(--text-primary, #0f172a);
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  margin-bottom: 8px;
}
.cct-year-toggle .cct-chevron { margin-left: auto; }
.cct-events { list-style: none; margin: 0; padding: 0 0 0 8px; border-left: 2px solid var(--border, #e2e8f0); }
.cct-event {
  position: relative;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 0 8px 14px;
}
.cct-dot {
  position: absolute;
  left: -5px;
  top: 14px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary, #166534);
}
.cct-event--pending .cct-dot { background: var(--warning, #d97706); }
.cct-event-title { font-weight: 650; color: var(--text-primary, #0f172a); }
.cct-event-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; font-size: 12px; }
.cct-status {
  font-weight: 700;
  color: var(--primary, #166534);
}
</style>
