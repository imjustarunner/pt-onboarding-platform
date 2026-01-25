<template>
  <div class="office-review">
    <div class="card">
      <div class="head">
        <div>
          <h3 style="margin: 0;">Building Review</h3>
          <div class="muted">Biweekly (payroll) review + 6-week booked confirmations.</div>
        </div>
        <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
      </div>

      <div v-if="error" class="error-box">{{ error }}</div>
      <div v-else-if="loading" class="loading">Loading…</div>

      <div v-else>
        <div class="summary">
          <div><strong>Total:</strong> {{ summary?.counts?.total ?? 0 }}</div>
          <div><strong>Needs 2-week review:</strong> {{ summary?.counts?.needsTwoWeekReview ?? 0 }}</div>
          <div><strong>Needs 6-week confirm:</strong> {{ summary?.counts?.needsSixWeekBookedConfirm ?? 0 }}</div>
        </div>

        <div v-if="(summary?.assignments || []).length === 0" class="muted" style="margin-top: 10px;">
          No assigned office slots found.
        </div>

        <div v-else class="list">
          <div v-for="a in summary.assignments" :key="a.standingAssignmentId" class="row">
            <div class="main">
              <div class="title">
                {{ a.officeName }} — {{ a.roomNumber ? `#${a.roomNumber}` : '' }} {{ a.roomName }}
              </div>
              <div class="meta">
                {{ weekdayLabel(a.weekday) }} @ {{ formatHour(a.hour) }}
                • {{ a.assignedFrequency }}
                • {{ a.availabilityMode }}{{ a.isTemporaryActive ? ` (until ${a.temporaryUntilDate})` : '' }}
              </div>
              <div class="meta" v-if="a.bookingPlan">
                Booking: {{ a.bookingPlan.bookedFrequency }} (since {{ a.bookingPlan.bookingStartDate }})
              </div>
            </div>

            <div class="actions">
              <button
                v-if="a.needsTwoWeekReview"
                class="btn btn-secondary btn-sm"
                @click="keepAvailable(a)"
                :disabled="saving"
              >
                Keep available
              </button>
              <button
                v-if="a.needsTwoWeekReview"
                class="btn btn-secondary btn-sm"
                @click="setTemporary(a)"
                :disabled="saving"
              >
                Temporary (4w)
              </button>
              <button
                v-if="a.needsTwoWeekReview"
                class="btn btn-danger btn-sm"
                @click="forfeit(a)"
                :disabled="saving"
              >
                Forfeit
              </button>
              <button
                v-if="a.needsSixWeekBookedConfirm && a.bookingPlan"
                class="btn btn-primary btn-sm"
                @click="confirmBooked(a.bookingPlan.id)"
                :disabled="saving"
              >
                Confirm booked
              </button>
              <router-link class="btn btn-secondary btn-sm" :to="withOfficeId('/buildings/schedule')">Open schedule</router-link>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const officeId = computed(() => (typeof route.query.officeId === 'string' ? route.query.officeId : ''));

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const summary = ref(null);

const withOfficeId = (path) => {
  const q = officeId.value ? `?officeId=${encodeURIComponent(officeId.value)}` : '';
  const slug = typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null;
  const base = slug ? `/${slug}${path}` : path;
  return `${base}${q}`;
};

const weekdayLabel = (n) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][Number(n)] || String(n);
const formatHour = (h) => {
  const d = new Date();
  d.setHours(Number(h), 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/office-review/me/summary', { params: { officeId: officeId.value || undefined } });
    summary.value = resp.data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load review';
  } finally {
    loading.value = false;
  }
};

const confirmBooked = async (planId) => {
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/office-review/me/booking-plans/${planId}/confirm`, { confirmed: true });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to confirm booking';
  } finally {
    saving.value = false;
  }
};

const keepAvailable = async (a) => {
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/office-slots/${a.officeId}/assignments/${a.standingAssignmentId}/keep-available`, { acknowledged: true });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to keep available';
  } finally {
    saving.value = false;
  }
};

const setTemporary = async (a) => {
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/office-slots/${a.officeId}/assignments/${a.standingAssignmentId}/temporary`, { weeks: 4 });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to set temporary';
  } finally {
    saving.value = false;
  }
};

const forfeit = async (a) => {
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/office-slots/${a.officeId}/assignments/${a.standingAssignmentId}/forfeit`, { acknowledged: true });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to forfeit';
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
}
.muted { color: var(--text-secondary); font-size: 13px; margin-top: 4px; }
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.loading { color: var(--text-secondary); }
.summary { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; color: var(--text-secondary); font-size: 13px; }
.list { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.row {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.title { font-weight: 800; }
.meta { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
.actions { display: flex; gap: 10px; align-items: center; }
.btn-sm { padding: 8px 10px; font-size: 13px; text-decoration: none; }
.btn-danger { background: #c0392b; border: 1px solid #b13528; color: white; }
</style>

