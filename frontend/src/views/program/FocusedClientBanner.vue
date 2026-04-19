<template>
  <section v-if="visible" class="focused-banner" :aria-busy="loading ? 'true' : 'false'">
    <div class="fb-head">
      <div class="fb-titles">
        <p class="fb-eyebrow">Focused on client</p>
        <h2 class="fb-title">{{ clientLabel || `Client #${props.clientId}` }}</h2>
        <p v-if="clientSubtitle" class="fb-subtitle">{{ clientSubtitle }}</p>
      </div>
      <div class="fb-actions">
        <button type="button" class="fb-btn ghost" @click="$emit('clear')">Clear focus</button>
      </div>
    </div>

    <div v-if="loading" class="fb-state">Loading client registrations…</div>
    <div v-else-if="loadError" class="fb-state error">{{ loadError }}</div>
    <div v-else-if="!matchingEvents.length" class="fb-state muted">
      This client is not currently enrolled in any event under this program.
    </div>
    <ul v-else class="fb-event-list" role="list">
      <li v-for="ev in matchingEvents" :key="ev.companyEventId" class="fb-event">
        <div class="fb-event-meta">
          <span class="fb-status" :class="`status-${ev.statusKey || ''}`">{{ statusLabel(ev.statusKey) }}</span>
          <span class="fb-date">{{ formatDateRange(ev.startsAt, ev.endsAt) }}</span>
        </div>
        <div class="fb-event-title">{{ ev.title }}</div>
        <div class="fb-event-actions">
          <button type="button" class="fb-btn primary" @click="$emit('open-event', ev.companyEventId)">
            Open event portal →
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clientId: { type: Number, default: 0 },
  agencyId: { type: Number, default: null },
  programOrgId: { type: Number, default: null },
  programSlug: { type: String, default: '' },
  programEvents: { type: Array, default: () => [] }
});

defineEmits(['open-event', 'clear']);

const visible = computed(() => !!(props.clientId && props.programOrgId));

const loading = ref(false);
const loadError = ref('');
const clientLabel = ref('');
const clientSubtitle = ref('');
const clientEventIds = ref([]);

const matchingEvents = computed(() => {
  const set = new Set(clientEventIds.value);
  if (!set.size) return [];
  return (props.programEvents || []).filter((e) => set.has(Number(e.companyEventId)));
});

const formatDateRange = (start, end) => {
  if (!start && !end) return '';
  const fmt = (val) => {
    if (!val) return '';
    try {
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  };
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || '';
};

const statusLabel = (key) => {
  if (key === 'live') return 'Live now';
  if (key === 'upcoming') return 'Upcoming';
  if (key === 'past') return 'Past';
  return '';
};

const fetchClientDetail = async () => {
  if (!visible.value || !props.agencyId) return;
  loading.value = true;
  loadError.value = '';
  try {
    let detail = null;
    try {
      const r = await api.get(`/skill-builders/clients/${props.clientId}/builder-detail`, {
        params: { agencyId: props.agencyId },
        skipGlobalLoading: true
      });
      detail = r?.data || null;
    } catch {
      detail = null;
    }
    if (detail) {
      const c = detail.client || detail.profile || detail || {};
      clientLabel.value =
        String(c.full_name || c.fullName || '').trim()
        || String(c.initials || '').trim()
        || String(c.identifier_code || c.identifierCode || '').trim()
        || `Client #${props.clientId}`;
      clientSubtitle.value = String(c.school_name || c.schoolName || c.organization_name || c.organizationName || '').trim();
      const evs = Array.isArray(detail.events) ? detail.events
        : Array.isArray(detail.companyEvents) ? detail.companyEvents
        : Array.isArray(detail.builderEvents) ? detail.builderEvents
        : [];
      clientEventIds.value = evs
        .map((e) => Number(e.companyEventId || e.company_event_id || e.id || 0))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
    if (!clientEventIds.value.length) {
      try {
        const r = await api.get(`/clients/${props.clientId}`, { skipGlobalLoading: true });
        const c = r?.data || {};
        if (!clientLabel.value) {
          clientLabel.value =
            String(c.full_name || '').trim()
            || String(c.initials || '').trim()
            || `Client #${props.clientId}`;
        }
        if (!clientSubtitle.value) {
          clientSubtitle.value = String(c.organization_name || '').trim();
        }
      } catch {
        // best-effort label only
      }
    }
  } catch (err) {
    loadError.value = err?.response?.data?.error?.message || 'Failed to load client registrations.';
  } finally {
    loading.value = false;
  }
};

watch(
  () => [props.clientId, props.agencyId, props.programOrgId],
  () => {
    if (!visible.value) {
      clientEventIds.value = [];
      clientLabel.value = '';
      clientSubtitle.value = '';
      return;
    }
    void fetchClientDetail();
  },
  { immediate: true }
);
</script>

<style scoped>
.focused-banner {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border: 1px solid #f59e0b;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 20px;
  color: #1f2937;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 4px 12px rgba(15, 23, 42, 0.04);
}
.fb-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; justify-content: space-between; }
.fb-titles { display: flex; flex-direction: column; gap: 2px; }
.fb-eyebrow {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #92400e;
  font-weight: 600;
}
.fb-title { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.1; }
.fb-subtitle { margin: 0; color: #78350f; font-size: 13px; }
.fb-actions { display: flex; gap: 8px; }
.fb-btn {
  font: inherit;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid #b45309;
  background: #fff;
  color: #92400e;
}
.fb-btn.primary { background: #b45309; color: #fff; }
.fb-btn.primary:hover { filter: brightness(0.95); }
.fb-btn.ghost { background: transparent; }
.fb-btn.ghost:hover { background: rgba(255,255,255,0.6); }

.fb-state { margin-top: 12px; font-size: 14px; color: #78350f; }
.fb-state.error { color: #b91c1c; }
.fb-state.muted { color: #78350f; opacity: 0.85; }

.fb-event-list { margin: 12px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px; }
.fb-event {
  background: #ffffff;
  border: 1px solid #fcd34d;
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fb-event-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.fb-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: #fef3c7;
  color: #92400e;
}
.fb-status.status-live { background: #dcfce7; color: #047857; }
.fb-status.status-past { background: #f3f4f6; color: #6b7280; }
.fb-date { color: #6b7280; }
.fb-event-title { font-weight: 700; color: #1f2937; }
.fb-event-actions { display: flex; justify-content: flex-end; }
</style>
