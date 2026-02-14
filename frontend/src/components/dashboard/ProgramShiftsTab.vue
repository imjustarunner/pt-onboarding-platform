<template>
  <div class="program-shifts-tab">
    <h2>My Program Shifts</h2>
    <p class="hint">View your scheduled shifts and on-call assignments. Sign up for shifts or call off if you cannot make one.</p>

    <div class="toolbar">
      <button type="button" class="btn btn-primary" @click="showSignupModal = true">
        Sign up for shifts
      </button>
      <div class="view-toggle">
        <button
          type="button"
          class="btn btn-sm"
          :class="{ 'btn-primary': viewMode === 'list' }"
          @click="viewMode = 'list'"
        >
          List
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :class="{ 'btn-primary': viewMode === 'calendar' }"
          @click="viewMode = 'calendar'"
        >
          Calendar
        </button>
      </div>
    </div>

    <!-- Coverage needed: pending calloffs where I'm on-call -->
    <div v-if="coverageOpportunities.length > 0" class="coverage-section">
      <h3>Coverage needed</h3>
      <p class="hint">You are on-call for these dates. Someone has called off — you can cover the shift.</p>
      <div v-for="opp in coverageOpportunities" :key="opp.calloff_id" class="shift-card coverage-card">
        <div class="shift-info">
          <strong>{{ formatDate(opp.slot_date) }}</strong>
          <span>{{ opp.site_name }} — {{ opp.program_name }}</span>
          <span v-if="opp.start_time || opp.end_time" class="muted">
            {{ formatTime(opp.start_time) }} – {{ formatTime(opp.end_time) }}
          </span>
          <span v-if="opp.reason" class="muted">Reason: {{ opp.reason }}</span>
        </div>
        <div class="shift-actions">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="covering === opp.calloff_id"
            @click="coverShift(opp)"
          >
            {{ covering === opp.calloff_id ? 'Covering…' : 'Cover this shift' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="signups.length === 0 && coverageOpportunities.length === 0" class="empty-state">
      <p>You have no upcoming shifts.</p>
    </div>
    <div v-else-if="viewMode === 'calendar'" class="calendar-view">
      <div class="calendar-nav">
        <button type="button" class="btn btn-sm" @click="calendarWeekOffset--">← Prev</button>
        <span class="calendar-week-label">{{ calendarWeekLabel }}</span>
        <button type="button" class="btn btn-sm" @click="calendarWeekOffset++">Next →</button>
      </div>
      <div class="calendar-grid">
        <div v-for="day in calendarDays" :key="day.date" class="calendar-day" :class="{ today: day.isToday }">
          <div class="calendar-day-header">
            <span class="day-name">{{ day.weekday }}</span>
            <span class="day-date">{{ day.monthDay }}</span>
          </div>
          <div class="calendar-day-shifts">
            <div
              v-for="s in day.shifts"
              :key="s.id"
              class="calendar-shift"
              :class="s.signup_type === 'on_call' ? 'on-call' : 'scheduled'"
            >
              <span class="shift-site">{{ s.site_name }}</span>
              <span class="shift-type">{{ s.signup_type === 'on_call' ? 'On-Call' : 'Scheduled' }}</span>
              <span v-if="s.start_time || s.end_time" class="shift-time">{{ formatTime(s.start_time) }}–{{ formatTime(s.end_time) }}</span>
              <button
                v-if="s.signup_type === 'scheduled' && isUpcoming(s.slot_date)"
                type="button"
                class="btn btn-xs btn-danger"
                :disabled="callingOff === s.id"
                @click.stop="callOff(s)"
              >
                {{ callingOff === s.id ? '…' : 'Call Off' }}
              </button>
            </div>
            <div v-if="day.shifts.length === 0" class="no-shifts muted">—</div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="shifts-list">
      <div v-for="s in signups" :key="s.id" class="shift-card">
        <div class="shift-info">
          <strong>{{ formatDate(s.slot_date) }}</strong>
          <span>{{ s.site_name }} — {{ s.signup_type === 'on_call' ? 'On-Call' : 'Scheduled' }}</span>
          <span v-if="s.start_time || s.end_time" class="muted">
            {{ formatTime(s.start_time) }} – {{ formatTime(s.end_time) }}
          </span>
        </div>
        <div v-if="s.signup_type === 'scheduled' && isUpcoming(s.slot_date)" class="shift-actions">
          <button
            type="button"
            class="btn btn-sm btn-danger"
            :disabled="callingOff === s.id"
            @click="callOff(s)"
          >
            {{ callingOff === s.id ? 'Calling off…' : 'Call Off' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showSignupModal" class="modal-overlay" @click.self="showSignupModal = false">
      <div class="modal-content">
        <h3>Sign up for a shift</h3>
        <div class="form-group">
          <label>Program</label>
          <select v-model="signupForm.programId" class="input" @change="signupForm.siteId = ''">
            <option value="">Select program…</option>
            <option v-for="p in myPrograms" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
          </select>
        </div>
        <div v-if="signupForm.programId" class="form-group">
          <label>Site</label>
          <select v-model="signupForm.siteId" class="input">
            <option value="">Select site…</option>
            <option v-for="s in (selectedProgram?.sites || [])" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date</label>
          <input v-model="signupForm.slotDate" type="date" class="input" />
        </div>
        <div class="form-group">
          <label>Type</label>
          <select v-model="signupForm.signupType" class="input">
            <option value="scheduled">Scheduled</option>
            <option value="on_call">On-Call</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showSignupModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="signupSaving || !signupForm.programId || !signupForm.siteId || !signupForm.slotDate" @click="submitSignup">
            {{ signupSaving ? 'Signing up…' : 'Sign up' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const signups = ref([]);
const myPrograms = ref([]);
const showSignupModal = ref(false);
const signupForm = ref({
  programId: '',
  siteId: '',
  slotDate: new Date().toISOString().slice(0, 10),
  signupType: 'scheduled'
});
const signupSaving = ref(false);

const selectedProgram = computed(() => {
  const id = signupForm.value.programId;
  if (!id) return null;
  return myPrograms.value.find((p) => String(p.id) === id) || null;
});

watch(() => signupForm.value.programId, (programId) => {
  const prog = myPrograms.value.find((p) => String(p.id) === programId);
  if (prog?.sites?.length === 1) {
    signupForm.value.siteId = String(prog.sites[0].id);
  } else {
    signupForm.value.siteId = '';
  }
});
const loading = ref(false);
const error = ref('');
const callingOff = ref(null);
const coverageOpportunities = ref([]);
const covering = ref(null);
const viewMode = ref('list');
const calendarWeekOffset = ref(0);

const formatDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d;
  }
};

const formatTime = (t) => {
  if (!t) return '—';
  const s = String(t);
  if (s.length >= 5) return s.slice(0, 5);
  return s;
};

const isUpcoming = (d) => {
  if (!d) return false;
  const today = new Date().toISOString().slice(0, 10);
  return d >= today;
};

const calendarWeekLabel = computed(() => {
  const start = new Date();
  start.setDate(start.getDate() + calendarWeekOffset.value * 7);
  const startOfWeek = new Date(start);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${fmt(startOfWeek)} – ${fmt(endOfWeek)}, ${startOfWeek.getFullYear()}`;
});

const calendarDays = computed(() => {
  const start = new Date();
  start.setDate(start.getDate() + calendarWeekOffset.value * 7);
  const startOfWeek = new Date(start);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const today = new Date().toISOString().slice(0, 10);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const shifts = (signups.value || []).filter((s) => String(s.slot_date) === dateStr);
    days.push({
      date: dateStr,
      weekday: d.toLocaleDateString([], { weekday: 'short' }),
      monthDay: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      isToday: dateStr === today,
      shifts
    });
  }
  return days;
});

const loadSignups = async () => {
  try {
    loading.value = true;
    error.value = '';
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 7);
    const end = new Date(today);
    end.setDate(end.getDate() + 60);
    const res = await api.get('/shift-programs/my-signups', {
      params: {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10)
      }
    });
    signups.value = (res.data || []).sort((a, b) => String(a.slot_date).localeCompare(String(b.slot_date)));
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load shifts';
    signups.value = [];
  } finally {
    loading.value = false;
  }
};

const loadCoverageOpportunities = async () => {
  try {
    const res = await api.get('/shift-programs/my-coverage-opportunities');
    coverageOpportunities.value = res.data || [];
  } catch {
    coverageOpportunities.value = [];
  }
};

const coverShift = async (opp) => {
  const programId = opp.program_id;
  const calloffId = opp.calloff_id;
  if (!programId || !calloffId) return;
  try {
    covering.value = calloffId;
    error.value = '';
    await api.post(`/shift-programs/${programId}/calloffs/${calloffId}/cover`);
    await loadCoverageOpportunities();
    await loadSignups();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to cover shift';
  } finally {
    covering.value = null;
  }
};

const callOff = async (signup) => {
  const reason = prompt('Reason for calling off (optional):');
  if (reason === null) return;
  const programId = signup.program_id;
  if (!programId) {
    error.value = 'Cannot determine program for this shift';
    return;
  }
  try {
    callingOff.value = signup.id;
    error.value = '';
    await api.post(`/shift-programs/${programId}/calloffs`, {
      shiftSignupId: signup.id,
      reason: reason?.trim() || null
    });
    await loadSignups();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to call off';
  } finally {
    callingOff.value = null;
  }
};

const loadMyPrograms = async () => {
  try {
    const res = await api.get('/shift-programs/my-programs');
    myPrograms.value = res.data || [];
  } catch {
    myPrograms.value = [];
  }
};

const submitSignup = async () => {
  const { programId, siteId, slotDate, signupType } = signupForm.value;
  if (!programId || !siteId || !slotDate) return;
  try {
    signupSaving.value = true;
    error.value = '';
    await api.post(`/shift-programs/${programId}/sites/${siteId}/signups`, {
      slotDate,
      signupType
    });
    showSignupModal.value = false;
    signupForm.value = { programId: '', siteId: '', slotDate: new Date().toISOString().slice(0, 10), signupType: 'scheduled' };
    await loadSignups();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to sign up';
  } finally {
    signupSaving.value = false;
  }
};

onMounted(async () => {
  await loadMyPrograms();
  await Promise.all([loadSignups(), loadCoverageOpportunities()]);
});
</script>

<style scoped>
.program-shifts-tab { padding: 16px 0; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.view-toggle { display: flex; gap: 4px; }
.hint { color: var(--text-secondary); font-size: 13px; margin-bottom: 16px; }
.calendar-view { margin-top: 16px; }
.calendar-nav { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
.calendar-week-label { font-weight: 600; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
@media (max-width: 768px) { .calendar-grid { grid-template-columns: repeat(2, 1fr); } }
.calendar-day {
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  background: var(--bg, #fff);
  min-height: 100px;
}
.calendar-day.today { border-color: var(--primary, #2563eb); background: rgba(37, 99, 235, 0.05); }
.calendar-day-header { padding: 8px; border-bottom: 1px solid var(--border-color, #eee); font-size: 12px; }
.day-name { display: block; color: var(--text-secondary); }
.day-date { font-weight: 600; }
.calendar-day-shifts { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.calendar-shift {
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 6px;
  display: flex; flex-direction: column; gap: 2px;
}
.calendar-shift.scheduled { background: rgba(37, 99, 235, 0.12); border-left: 3px solid var(--primary, #2563eb); }
.calendar-shift.on-call { background: rgba(107, 114, 128, 0.15); border-left: 3px solid #6b7280; }
.shift-site { font-weight: 600; }
.shift-type, .shift-time { font-size: 11px; color: var(--text-secondary); }
.no-shifts { font-size: 12px; }
.btn-xs { padding: 2px 6px; font-size: 11px; }
.coverage-section { margin-bottom: 24px; }
.coverage-section h3 { margin-bottom: 8px; }
.coverage-card { border-left: 4px solid var(--primary, #2563eb); }
.shifts-list { display: flex; flex-direction: column; gap: 12px; }
.shift-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  background: var(--bg, #fff);
}
.shift-info { display: flex; flex-direction: column; gap: 4px; }
.shift-info .muted { font-size: 13px; color: var(--text-secondary); }
.shift-actions { flex-shrink: 0; }
.empty-state { padding: 24px; text-align: center; color: var(--text-secondary); }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  padding: 24px;
  border-radius: 12px;
  min-width: 320px;
  max-width: 90vw;
}
.modal-content .form-group { margin-bottom: 12px; }
.modal-content label { display: block; margin-bottom: 4px; font-weight: 600; }
.modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; }
</style>
