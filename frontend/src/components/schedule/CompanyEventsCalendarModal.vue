<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal company-events-calendar-modal" @click.stop>
      <div class="modal-header">
        <div>
          <h2 id="cec-title">Company events</h2>
          <p class="muted sub">Agency-wide events and school outreach opportunities.</p>
        </div>
        <button class="close" type="button" aria-label="Close" @click="$emit('close')">×</button>
      </div>

      <div class="body">
        <div v-if="loading" class="muted">Loading events…</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <div v-else-if="!events.length" class="muted">No upcoming company events.</div>
        <div v-else class="sections">
          <section v-if="schoolOutreachEvents.length" class="section">
            <h3>School outreach events</h3>
            <div class="cards">
              <article v-for="event in schoolOutreachEvents" :key="`out-${event.id}`" class="card">
                <div class="card-title">{{ event.title }}</div>
                <div class="card-meta">{{ event.schoolName || 'School event' }}</div>
                <div class="card-meta">{{ formatRange(event.startsAt, event.endsAt) }}</div>
                <div v-if="event.description" class="card-desc">{{ event.description }}</div>
                <div class="card-actions">
                  <a
                    v-if="flierHref(event)"
                    :href="flierHref(event)"
                    target="_blank"
                    rel="noopener"
                    class="btn btn-secondary btn-sm"
                  >
                    View flier
                  </a>
                  <button
                    v-if="canRequestForEvent(event)"
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="requestingKey === requestKey(event)"
                    @click="requestShift(event)"
                  >
                    {{ requestingKey === requestKey(event) ? 'Requesting…' : 'Request shift' }}
                  </button>
                  <span v-else-if="statusLabel(event)" class="status-pill">{{ statusLabel(event) }}</span>
                </div>
              </article>
            </div>
          </section>

          <section v-if="otherEvents.length" class="section">
            <h3>Other company events</h3>
            <div class="cards">
              <article v-for="event in otherEvents" :key="`co-${event.id}`" class="card card-muted">
                <div class="card-title">{{ event.title }}</div>
                <div class="card-meta">{{ formatRange(event.startsAt, event.endsAt) }}</div>
                <div v-if="event.description" class="card-desc">{{ event.description }}</div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

defineEmits(['close']);

const loading = ref(false);
const error = ref('');
const events = ref([]);
const requestingKey = ref('');

const schoolOutreachEvents = computed(() =>
  (events.value || []).filter((e) => e.canRequestOutreachShift || (e.isSchoolPortalEvent && e.outreachTableInvited))
);

const otherEvents = computed(() =>
  (events.value || []).filter((e) => !schoolOutreachEvents.value.some((o) => o.id === e.id))
);

const flierHref = (event) => {
  const raw = event.flierFileUrl || event.eventImageUrl;
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return toUploadsUrl(raw);
};

const formatRange = (startsAt, endsAt) => {
  const s = startsAt ? new Date(startsAt) : null;
  const e = endsAt ? new Date(endsAt) : null;
  if (!s || !Number.isFinite(s.getTime())) return '';
  const datePart = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const startTime = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const endTime = e && Number.isFinite(e.getTime()) ? e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  return endTime ? `${datePart} · ${startTime}–${endTime}` : `${datePart} · ${startTime}`;
};

const primarySession = (event) => (Array.isArray(event.sessions) && event.sessions[0]) || null;

const requestKey = (event) => {
  const sess = primarySession(event);
  return sess ? `${event.id}:${sess.sessionDateId}` : String(event.id);
};

const statusLabel = (event) => {
  const sess = primarySession(event);
  if (!sess) return '';
  if (sess.myAssignment) {
    const s = String(sess.myAssignment.assignmentStatus || 'draft');
    return s === 'finalized' ? 'Confirmed assignment' : `Assigned (${s})`;
  }
  if (sess.myRequest) {
    return `Request ${sess.myRequest.status}`;
  }
  return '';
};

const canRequestForEvent = (event) => {
  if (!event.canRequestOutreachShift) return false;
  const sess = primarySession(event);
  if (!sess) return false;
  if (sess.myAssignment) return false;
  const st = String(sess.myRequest?.status || '').toLowerCase();
  return !st || st === 'denied' || st === 'withdrawn';
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/me/company-events/calendar');
    events.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load events';
    events.value = [];
  } finally {
    loading.value = false;
  }
};

const requestShift = async (event) => {
  const sess = primarySession(event);
  if (!sess || !event.agencyId) return;
  const key = requestKey(event);
  try {
    requestingKey.value = key;
    await api.post(`/company-events/${event.id}/session-requests`, {
      agencyId: event.agencyId,
      sessionDateId: sess.sessionDateId,
      requestType: 'regular'
    });
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to request shift';
  } finally {
    requestingKey.value = '';
  }
};

onMounted(load);
</script>

<style scoped>
.company-events-calendar-modal {
  width: min(760px, 96vw);
  max-height: 90vh;
  overflow: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.modal-header h2 {
  margin: 0;
  font-size: 1.15rem;
}
.sub {
  margin: 4px 0 0;
  font-size: 0.88rem;
}
.close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  cursor: pointer;
}
.body {
  padding: 16px 18px 20px;
}
.section + .section {
  margin-top: 20px;
}
.section h3 {
  margin: 0 0 10px;
  font-size: 0.95rem;
}
.cards {
  display: grid;
  gap: 10px;
}
.card {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--surface-elevated, #fff);
}
.card-muted {
  opacity: 0.95;
}
.card-title {
  font-weight: 600;
}
.card-meta {
  font-size: 0.85rem;
  color: var(--text-muted, #6b7280);
  margin-top: 2px;
}
.card-desc {
  margin-top: 8px;
  font-size: 0.9rem;
  white-space: pre-wrap;
}
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}
.status-pill {
  font-size: 0.82rem;
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
}
.error {
  color: #b91c1c;
}
</style>
