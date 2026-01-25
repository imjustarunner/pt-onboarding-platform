<template>
  <div class="office-schedule">
    <div class="header">
      <div>
        <h3 style="margin: 0;">Building Schedule</h3>
        <div class="subtitle">Weekly office grid (Mon–Sun, 7am–9pm).</div>
      </div>
      <div class="controls">
        <div class="field">
          <label>Week of</label>
          <input v-model="weekStart" type="date" @change="loadGrid" :disabled="!officeId" />
        </div>
        <button class="btn btn-secondary" @click="loadGrid" :disabled="loading || !officeId">Refresh</button>
      </div>
    </div>

    <div v-if="!officeId" class="muted">Select a building above to view the schedule.</div>
    <div v-else-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else-if="grid" class="grid-wrap">
      <div class="legend">
        <div class="legend-item"><span class="dot open"></span> Open</div>
        <div class="legend-item"><span class="dot assigned_available"></span> Assigned available</div>
        <div class="legend-item"><span class="dot assigned_temporary"></span> Assigned temporary</div>
        <div class="legend-item"><span class="dot assigned_booked"></span> Assigned booked</div>
      </div>

      <div v-for="room in grid.rooms" :key="room.id" class="room-card">
        <div class="room-head">
          <div class="room-title">
            <strong>{{ room.roomNumber ? `#${room.roomNumber}` : '' }} {{ room.label || room.name }}</strong>
          </div>
        </div>

        <div class="week-table">
          <div class="cell corner"></div>
          <div v-for="d in grid.days" :key="d" class="cell day-head">
            {{ formatDay(d) }}
          </div>

          <template v-for="h in grid.hours" :key="h">
            <div class="cell hour-head">{{ formatHour(h) }}</div>
            <div
              v-for="d in grid.days"
              :key="`${room.id}-${d}-${h}`"
              class="cell slot"
              :class="slotClass(room.id, d, h)"
              :title="slotTitle(room.id, d, h)"
              @click="onSlotClick(room.id, d, h)"
            >
              <span class="initials">{{ slotInitials(room.id, d, h) }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Slot actions modal -->
    <div v-if="showModal" class="modal-overlay" @click="closeModal">
      <div class="modal" @click.stop>
        <h3 style="margin-top: 0;">Slot</h3>
        <div class="muted" style="margin-bottom: 10px;">
          {{ modalSlot ? `${modalSlot.date} ${formatHour(modalSlot.hour)} — ${modalSlot.state}` : '' }}
        </div>

        <div v-if="modalSlot?.state === 'open'" class="muted">
          Open slots will become assignable once the standing-assignment workflow is wired to the UI.
        </div>

        <template v-else>
          <div class="section">
            <div class="section-title">Provider actions</div>

            <div class="row">
              <label style="font-weight: 700;">Book frequency</label>
              <select v-model="bookFreq">
                <option value="">Select…</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
              <button class="btn btn-primary" @click="bookSlot" :disabled="saving || !bookFreq || !modalSlot?.standingAssignmentId">
                Book
              </button>
            </div>

            <div class="row" style="margin-top: 10px;">
              <label class="check">
                <input type="checkbox" v-model="ackAvailable" />
                <span>I understand this reservation will be available for temporary booking that I can approve or deny by my peers.</span>
              </label>
              <button class="btn btn-secondary" @click="keepAvailable" :disabled="saving || !ackAvailable || !modalSlot?.standingAssignmentId">
                Keep available
              </button>
            </div>

            <div class="row" style="margin-top: 10px;">
              <button class="btn btn-secondary" @click="setTemporary" :disabled="saving || !modalSlot?.standingAssignmentId">
                Set temporary (4 weeks)
              </button>
            </div>

            <div class="row" style="margin-top: 10px;">
              <label class="check">
                <input type="checkbox" v-model="ackForfeit" />
                <span>I understand this slot's day/time/frequency is forfeit at this time and available to others.</span>
              </label>
              <button class="btn btn-danger" @click="forfeit" :disabled="saving || !ackForfeit || !modalSlot?.standingAssignmentId">
                Forfeit
              </button>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Staff/admin action</div>
            <div class="muted" style="margin-bottom: 8px;">
              Booking converts this occurrence to assigned_booked immediately (no approval gate).
            </div>
            <button class="btn btn-primary" @click="staffBook" :disabled="saving || !modalSlot?.eventId">
              Mark booked for this occurrence
            </button>
          </div>
        </template>

        <div class="actions">
          <button class="btn btn-secondary" @click="closeModal" :disabled="saving">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
const route = useRoute();

const officeId = computed(() => (typeof route.query.officeId === 'string' ? route.query.officeId : ''));

const loading = ref(false);
const error = ref('');
const grid = ref(null);
const weekStart = ref(new Date().toISOString().slice(0, 10));

const formatDay = (d) => {
  try {
    const dt = new Date(`${d}T00:00:00`);
    return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
};

const formatHour = (h) => {
  const hour = Number(h);
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};

const slotMap = computed(() => {
  const m = new Map();
  const slots = grid.value?.slots || [];
  for (const s of slots) {
    m.set(`${s.roomId}:${s.date}:${s.hour}`, s);
  }
  return m;
});

const getSlot = (roomId, date, hour) => slotMap.value.get(`${roomId}:${date}:${hour}`) || null;

const slotClass = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  return s?.state || 'open';
};

const slotInitials = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  return s?.providerInitials || '';
};

const slotTitle = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  if (!s) return '';
  return `${date} ${formatHour(hour)} — ${s.state}${s.providerInitials ? ` (${s.providerInitials})` : ''}`;
};

const loadGrid = async () => {
  if (!officeId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/office-schedule/locations/${officeId.value}/weekly-grid`, { params: { weekStart: weekStart.value } });
    grid.value = resp.data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load weekly grid';
  } finally {
    loading.value = false;
  }
};

const showModal = ref(false);
const modalSlot = ref(null);
const saving = ref(false);
const bookFreq = ref('');
const ackAvailable = ref(false);
const ackForfeit = ref(false);

const closeModal = () => {
  showModal.value = false;
  modalSlot.value = null;
  bookFreq.value = '';
  ackAvailable.value = false;
  ackForfeit.value = false;
};

const onSlotClick = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  if (!s) return;
  modalSlot.value = s;
  showModal.value = true;
};

const bookSlot = async () => {
  if (!officeId.value || !modalSlot.value?.standingAssignmentId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/booking-plan`, {
      bookedFrequency: bookFreq.value,
      bookingStartDate: modalSlot.value.date
    });
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to set booking plan';
  } finally {
    saving.value = false;
  }
};

const keepAvailable = async () => {
  if (!officeId.value || !modalSlot.value?.standingAssignmentId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/keep-available`, {
      acknowledged: true
    });
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to keep available';
  } finally {
    saving.value = false;
  }
};

const setTemporary = async () => {
  if (!officeId.value || !modalSlot.value?.standingAssignmentId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/temporary`, { weeks: 4 });
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to set temporary';
  } finally {
    saving.value = false;
  }
};

const forfeit = async () => {
  if (!officeId.value || !modalSlot.value?.standingAssignmentId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/forfeit`, {
      acknowledged: true
    });
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to forfeit';
  } finally {
    saving.value = false;
  }
};

const staffBook = async () => {
  if (!officeId.value || !modalSlot.value?.eventId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/book`, {});
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to mark booked';
  } finally {
    saving.value = false;
  }
};

watch(() => officeId.value, async () => {
  grid.value = null;
  await loadGrid();
}, { immediate: true });

onMounted(loadGrid);
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 12px;
}
.subtitle { color: var(--text-secondary); margin-top: 4px; font-size: 13px; }
.controls { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 6px; }
input[type='date'] {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.muted { color: var(--text-secondary); }
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.loading { color: var(--text-secondary); }
.legend { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 10px 0 12px; color: var(--text-secondary); font-size: 13px; }
.legend-item { display: inline-flex; gap: 8px; align-items: center; }
.dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.dot.open { background: #94a3b8; }
.dot.assigned_available { background: #fbbf24; }
.dot.assigned_temporary { background: #3b82f6; }
.dot.assigned_booked { background: #ef4444; }

.room-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}
.room-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }

.week-table {
  display: grid;
  grid-template-columns: 90px repeat(7, minmax(0, 1fr));
  gap: 6px;
}
.cell {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: var(--bg-alt);
  font-size: 12px;
  color: var(--text-secondary);
}
.corner { background: transparent; border: none; }
.day-head { background: white; font-weight: 800; color: var(--text-primary); text-align: center; }
.hour-head { background: white; font-weight: 700; color: var(--text-primary); }
.slot {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
}
.slot.open { background: #f8fafc; }
.slot.assigned_available { background: rgba(251,191,36,0.22); border-color: rgba(251,191,36,0.45); }
.slot.assigned_temporary { background: rgba(59,130,246,0.18); border-color: rgba(59,130,246,0.35); }
.slot.assigned_booked { background: rgba(239,68,68,0.18); border-color: rgba(239,68,68,0.35); }
.initials { font-weight: 800; color: var(--text-primary); }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 50;
}
.modal {
  width: 760px;
  max-width: 100%;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.section {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 12px;
}
.section-title { font-weight: 800; margin-bottom: 8px; }
.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.check { display: inline-flex; gap: 10px; align-items: flex-start; }
.check span { color: var(--text-secondary); font-size: 13px; line-height: 1.35; }
</style>

