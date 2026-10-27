<template>
  <Teleport to="body">
    <div class="cec-overlay" role="dialog" aria-modal="true" aria-labelledby="cec-title" @click.self="$emit('close')">
      <div class="modal company-events-calendar-modal" @click.stop>
        <div class="modal-header">
          <div>
            <h2 id="cec-title">Events &amp; outreach</h2>
            <p class="muted sub">Your invitations, assigned shifts, and opportunities to work upcoming events.</p>
          </div>
          <button class="close" type="button" aria-label="Close" @click="$emit('close')">×</button>
        </div>

        <div class="body">
          <div class="calendar-filters">
            <label>Show
              <select v-model="viewFilter">
                <option value="relevant">For you</option>
                <option value="workable">Open shifts</option>
                <option value="all">All upcoming</option>
              </select>
            </label>
            <label>Month <input v-model="selectedMonth" type="month" /></label>
            <button v-if="selectedMonth" type="button" class="btn btn-secondary btn-sm" @click="selectedMonth = ''">All dates</button>
          </div>
          <p class="muted sub calendar-help">All upcoming also includes calendar dates at your schools. Days off and other calendar-only dates cannot be requested as shifts.</p>
          <div v-if="loading" class="muted">Loading events…</div>
          <div v-else-if="error" class="error">{{ error }}</div>
          <div v-else-if="!sortedEvents.length" class="muted">No upcoming events match these filters.</div>
          <div v-else class="cards">
            <article
              v-for="event in sortedEvents"
              :key="`ev-${event.id}`"
              class="card"
              :class="{ 'card-muted': !isRequestableCompanyEvent(event) }"
            >
              <div class="card-title">{{ event.title }}</div>
              <div class="card-meta">{{ providerEventCategoryLabel(event) }}</div>
              <div v-if="event.schoolName" class="card-meta">{{ event.schoolName }}</div>
              <div v-else-if="event.isGeneralOutreach" class="card-meta">General outreach · agency-wide</div>
              <div v-else-if="event.districtName" class="card-meta">
                District: {{ event.districtName }}
                <span v-if="event.isDistrictOutreach || event.eventType === 'school_outreach'"> · Outreach</span>
              </div>
              <div v-else-if="event.eventType === 'school_outreach'" class="card-meta">Outreach</div>
              <div class="card-meta">{{ formatRange(companyEventDisplayWindow(event).startsAt, companyEventDisplayWindow(event).endsAt) }}</div>
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
              </div>
              <div v-for="session in visibleSessions(event)" :key="session.sessionDateId" class="session-row">
                <div class="card-meta">{{ formatRange(session.startsAt, session.endsAt) }}</div>
                <button
                  v-if="canRequestCompanyEventShift(event, session)"
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="requestingKey === companyEventRequestKey(event, session)"
                  @click="requestShift(event, session)"
                >
                  {{ requestingKey === companyEventRequestKey(event, session) ? 'Requesting…' : 'Request shift' }}
                </button>
                <span v-else-if="companyEventRequestStatusLabel(event, session)" class="status-pill" :class="statusPillClass(event, session)">
                  {{ companyEventRequestStatusLabel(event, session) }}
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
  companyEventDisplayWindow,
  providerEventCategoryLabel,
  isUpcomingCompanyEvent,
  shouldShowOnProviderDashboardEvents
} from '../../utils/companyEventStaffing';

const emit = defineEmits(['close', 'changed']);

const loading = ref(false);
const error = ref('');
const events = ref([]);
const requestingKey = ref('');
const viewFilter = ref('relevant');
const selectedMonth = ref('');

const matchesMonth = (start, end) => {
  if (!selectedMonth.value) return true;
  const [year, month] = selectedMonth.value.split('-').map(Number);
  const from = new Date(year, month - 1, 1).getTime();
  const to = new Date(year, month, 1).getTime();
  return new Date(start).getTime() < to && new Date(end || start).getTime() >= from;
};

const visibleSessions = (event) => (event.sessions || []).filter((session) =>
  new Date(session.endsAt || session.startsAt).getTime() > Date.now()
  && matchesMonth(session.startsAt, session.endsAt)
  && (viewFilter.value !== 'workable' || canRequestCompanyEventShift(event, session))
);

const sortedEvents = computed(() =>
  [...(events.value || [])]
    .filter((event) => {
      if (!isUpcomingCompanyEvent(event)) return false;
      if (viewFilter.value === 'relevant' && !shouldShowOnProviderDashboardEvents(event)) return false;
      if (viewFilter.value === 'workable') return visibleSessions(event).some((session) => canRequestCompanyEventShift(event, session));
      const window = companyEventDisplayWindow(event);
      return matchesMonth(window.startsAt, window.endsAt) || visibleSessions(event).length > 0;
    })
    .sort((a, b) => {
    const at = new Date(companyEventDisplayWindow(a).startsAt || 0).getTime();
    const bt = new Date(companyEventDisplayWindow(b).startsAt || 0).getTime();
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

const statusPillClass = (event, sess) => {
  const label = companyEventRequestStatusLabel(event, sess);
  if (label === 'Staffing full') return 'is-full';
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

const requestShift = async (event, sess) => {
  if (!canRequestCompanyEventShift(event, sess) || !event.agencyId) return;
  const key = companyEventRequestKey(event, sess);
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
.calendar-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
.calendar-filters label { display: grid; gap: 4px; font-size: 0.85rem; }
.calendar-filters select, .calendar-filters input { padding: 8px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; background: var(--surface-elevated, #fff); color: inherit; }
.calendar-help { margin: 12px 0 16px; }
.session-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 10px; }
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
