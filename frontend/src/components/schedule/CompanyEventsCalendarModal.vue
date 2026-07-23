<template>
  <Teleport to="body">
    <div class="cec-overlay" role="dialog" aria-modal="true" aria-labelledby="cec-title" @click.self="$emit('close')">
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
          <div v-else-if="!sortedEvents.length" class="muted">No upcoming company events.</div>
          <div v-else class="cards">
            <article
              v-for="event in sortedEvents"
              :key="`ev-${event.id}`"
              class="card"
              :class="{ 'card-muted': !isRequestableCompanyEvent(event) }"
            >
              <div class="card-title">{{ event.title }}</div>
              <div v-if="event.schoolName" class="card-meta">{{ event.schoolName }}</div>
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
                  v-if="canRequestCompanyEventShift(event)"
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="requestingKey === requestKey(event)"
                  @click="requestShift(event)"
                >
                  {{ requestingKey === requestKey(event) ? 'Requesting…' : 'Request shift' }}
                </button>
                <span v-else-if="statusLabel(event)" class="status-pill" :class="statusPillClass(event)">
                  {{ statusLabel(event) }}
                </span>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import {
  canRequestCompanyEventShift,
  companyEventRequestKey,
  companyEventRequestStatusLabel,
  isRequestableCompanyEvent,
  primaryCompanyEventSession
} from '../../utils/companyEventStaffing';

const emit = defineEmits(['close', 'changed']);

const loading = ref(false);
const error = ref('');
const events = ref([]);
const requestingKey = ref('');

const sortedEvents = computed(() =>
  [...(events.value || [])].sort((a, b) => {
    const at = new Date(a?.startsAt || 0).getTime();
    const bt = new Date(b?.startsAt || 0).getTime();
    return (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
  })
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

const requestKey = (event) => companyEventRequestKey(event);

const statusLabel = (event) => companyEventRequestStatusLabel(event);

const statusPillClass = (event) => {
  const label = statusLabel(event);
  if (label === 'Staffing full') return 'is-full';
  const sess = primaryCompanyEventSession(event);
  const st = String(sess?.myRequest?.status || '').toLowerCase();
  if (st === 'pending') return 'is-pending';
  if (st === 'approved' || sess?.myAssignment) return 'is-confirmed';
  return '';
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
  const sess = primaryCompanyEventSession(event);
  if (!sess || !event.agencyId) return;
  const key = requestKey(event);
  try {
    requestingKey.value = key;
    error.value = '';
    await api.post(`/company-events/${event.id}/session-requests`, {
      agencyId: event.agencyId,
      sessionDateId: sess.sessionDateId,
      requestType: 'regular'
    });
    await load();
    emit('changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to request shift';
  } finally {
    requestingKey.value = '';
  }
};

onMounted(load);
</script>

<style scoped>
.cec-overlay {
  position: fixed;
  inset: 0;
  z-index: 10050;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.company-events-calendar-modal {
  width: min(760px, 96vw);
  max-height: 90vh;
  overflow: auto;
  background: var(--surface-elevated, #fff);
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
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
  line-height: 1;
}
.body {
  padding: 16px 18px 20px;
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
  opacity: 0.98;
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
.status-pill.is-full {
  background: #f3f4f6;
  color: #4b5563;
}
.status-pill.is-pending {
  background: #fef3c7;
  color: #92400e;
}
.status-pill.is-confirmed {
  background: #dcfce7;
  color: #166534;
}
.error {
  color: #b91c1c;
}
</style>
