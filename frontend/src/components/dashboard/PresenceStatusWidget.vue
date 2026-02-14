<template>
  <div class="presence-widget">
    <div class="presence-widget-header">
      <span class="presence-widget-title">My Status</span>
      <router-link v-if="canViewTeamBoard" to="/admin/presence" class="presence-team-link">View Team Board</router-link>
    </div>
    <div class="presence-widget-body">
      <select
        :value="currentStatus"
        class="presence-select"
        :disabled="saving"
        @change="onChange"
      >
        <option value="">— Set status —</option>
        <option
          v-for="opt in statusOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
      <p v-if="loading" class="presence-muted">Loading…</p>
      <p v-else-if="error" class="presence-error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const canViewTeamBoard = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  if (role !== 'admin') return false;
  const flags = agencyStore.currentAgency?.feature_flags || agencyStore.currentAgency?.featureFlags || {};
  const f = typeof flags === 'object' ? flags : (() => { try { return JSON.parse(flags || '{}'); } catch { return {}; } })();
  return f?.presenceEnabled === true;
});

const statusOptions = [
  { value: 'in_available', label: 'In – Available' },
  { value: 'in_heads_down', label: 'In – Heads Down' },
  { value: 'in_available_for_phone', label: 'In – Available for Phone' },
  { value: 'out_quick', label: 'Out – Quick (Under 90 min)' },
  { value: 'out_am', label: 'Out – AM' },
  { value: 'out_pm', label: 'Out – PM' },
  { value: 'out_full_day', label: 'Out – Full Day' },
  { value: 'traveling_offsite', label: 'Traveling / Offsite' }
];

const currentStatus = ref('');
const loading = ref(true);
const saving = ref(false);
const error = ref('');

const fetchStatus = async () => {
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/presence/status/me');
    currentStatus.value = res.data?.presence_status || '';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load';
    currentStatus.value = '';
  } finally {
    loading.value = false;
  }
};

const parseDateInput = (input) => {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (s === 'today') return today;
  if (s === 'tomorrow') {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const onChange = async (event) => {
  const newStatus = event.target?.value || '';
  if (!newStatus) return;

  let payload = { status: newStatus };
  if (newStatus === 'out_quick') {
    const ret = prompt('Expected return time (e.g. 2:15 PM). Must be within 90 minutes:');
    if (!ret) {
      event.target.value = currentStatus.value;
      return;
    }
    const parsed = parseReturnTime(ret);
    if (parsed) {
      const now = new Date();
      const mins = (new Date(parsed) - now) / (60 * 1000);
      if (mins > 90) {
        error.value = 'Return time must be within 90 minutes of now';
        event.target.value = currentStatus.value;
        return;
      }
      payload.expected_return_at = parsed;
    } else {
      payload.note = ret;
    }
    const note = prompt('Optional note (e.g. "Errand", "Appointment"):');
    if (note && note.trim()) payload.note = payload.note ? `${payload.note} – ${note.trim()}` : note.trim();
  } else if (['out_am', 'out_pm', 'out_full_day', 'traveling_offsite'].includes(newStatus)) {
    const dateInput = prompt('For which date? (today, tomorrow, or YYYY-MM-DD). Leave blank for today:');
    const d = dateInput ? parseDateInput(dateInput) : new Date();
    if (d) {
      const start = new Date(d);
      const end = new Date(d);
      if (newStatus === 'out_full_day' || newStatus === 'traveling_offsite') {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else if (newStatus === 'out_am') {
        start.setHours(8, 0, 0, 0);
        end.setHours(12, 0, 0, 0);
      } else {
        start.setHours(12, 0, 0, 0);
        end.setHours(17, 0, 0, 0);
      }
      payload.started_at = start.toISOString();
      payload.ends_at = end.toISOString();
    }
    const note = prompt('Optional note (e.g. "Travel day", "Appointment"):');
    if (note && note.trim()) payload.note = note.trim();
  } else {
    const note = prompt('Optional note:');
    if (note && note.trim()) payload.note = note.trim();
  }

  try {
    saving.value = true;
    error.value = '';
    await api.put('/presence/status/me', payload);
    currentStatus.value = newStatus;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update';
    event.target.value = currentStatus.value;
  } finally {
    saving.value = false;
  }
};

const parseReturnTime = (input) => {
  const s = String(input || '').trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const meridiem = (m[3] || '').toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};

onMounted(fetchStatus);
</script>

<style scoped>
.presence-widget {
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 16px;
  box-shadow: var(--shadow);
}

.presence-widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.presence-team-link {
  font-size: 0.8rem;
  color: var(--primary, #2563eb);
  text-decoration: none;
}
.presence-team-link:hover {
  text-decoration: underline;
}

.presence-widget-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.presence-widget-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.presence-select {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 0.9rem;
  min-width: 180px;
}

.presence-select:disabled {
  opacity: 0.7;
}

.presence-muted {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.presence-error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--danger);
}
</style>
