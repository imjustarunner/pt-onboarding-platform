<template>
  <div class="container schedule-view">
    <div class="header">
      <div>
        <h2>Office Schedule</h2>
        <p class="subtitle">Select a location, then click a room to request a booking.</p>
      </div>
      <div class="controls">
        <div class="field">
          <label>Location</label>
          <select v-model="selectedLocationId" @change="loadLocation">
            <option value="">Select a location…</option>
            <option v-for="l in locations" :key="l.id" :value="String(l.id)">{{ l.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>Date</label>
          <input v-model="date" type="date" @change="refreshAvailability" :disabled="!selectedLocationId" />
        </div>
        <div class="field">
          <label>Start</label>
          <input v-model="startTime" type="time" @change="refreshAvailability" :disabled="!selectedLocationId" />
        </div>
        <div class="field">
          <label>Duration</label>
          <select v-model="durationMinutes" @change="refreshAvailability" :disabled="!selectedLocationId">
            <option :value="30">30 min</option>
            <option :value="60">1 hour</option>
            <option :value="90">90 min</option>
            <option :value="120">2 hours</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else-if="selectedLocationId && availability" class="content">
      <div class="legend">
        <div class="legend-item"><span class="dot available"></span> Available</div>
        <div class="legend-item"><span class="dot pending"></span> Pending</div>
        <div class="legend-item"><span class="dot occupied"></span> Occupied</div>
        <div class="legend-item note">Clinician name + last initial shown only (no client data).</div>
      </div>

      <div class="grid">
        <div class="map-card">
          <div class="map-header">
            <h3>{{ availability.location?.name }}</h3>
            <button class="btn btn-secondary btn-sm" @click="refreshAvailability" :disabled="loading">Refresh</button>
          </div>

          <div v-if="availability.location?.svg_markup" class="svg-wrap" ref="svgWrap" v-html="availability.location.svg_markup"></div>
          <div v-else class="empty">
            No SVG map configured for this location yet. Rooms will still appear in the list on the right.
          </div>
        </div>

        <div class="list-card">
          <h3>Rooms</h3>
          <div class="room-list">
            <button
              v-for="r in availability.rooms"
              :key="r.roomId"
              class="room-row"
              :class="r.status"
              @click="onRoomClick(r)"
            >
              <div class="room-name">{{ r.roomName }}</div>
              <div class="room-meta">
                <span class="status-pill" :class="r.status">{{ labelForStatus(r.status) }}</span>
                <span v-if="r.clinicianDisplayName" class="clinician">{{ r.clinicianDisplayName }}</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Request modal -->
    <div v-if="showRequestModal" class="modal-overlay" @click="closeModal">
      <div class="modal" @click.stop>
        <h3>Request booking</h3>
        <p class="modal-subtitle">
          {{ modalRoom?.roomName }} — {{ formatWindow() }}
        </p>

        <div v-if="modalRoom?.status === 'occupied'" class="warning-box">
          This room is currently occupied for this window. You can still request it if you want, but it may be denied.
        </div>

        <div class="field">
          <label>Notes (optional)</label>
          <textarea v-model="notes" rows="3" placeholder="Anything the CPA should know?" />
        </div>

        <div class="actions">
          <button class="btn btn-secondary" @click="closeModal" :disabled="saving">Cancel</button>
          <button class="btn btn-primary" @click="submitRequest" :disabled="saving">
            {{ saving ? 'Submitting…' : 'Submit request' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import api from '../services/api';
import { useAuthStore } from '../store/auth';

const authStore = useAuthStore();

const loading = ref(true);
const saving = ref(false);
const error = ref('');

const locations = ref([]);
const selectedLocationId = ref('');
const availability = ref(null);
const svgWrap = ref(null);

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowHHMM = () => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const date = ref(todayISO());
const startTime = ref(nowHHMM());
const durationMinutes = ref(60);

const windowStartISO = computed(() => {
  if (!date.value || !startTime.value) return null;
  return new Date(`${date.value}T${startTime.value}:00`).toISOString();
});
const windowEndISO = computed(() => {
  if (!windowStartISO.value) return null;
  const d = new Date(windowStartISO.value);
  d.setMinutes(d.getMinutes() + Number(durationMinutes.value || 60));
  return d.toISOString();
});

const labelForStatus = (s) => {
  if (s === 'available') return 'Available';
  if (s === 'pending') return 'Pending';
  if (s === 'occupied') return 'Occupied';
  return s;
};

const loadLocations = async () => {
  const resp = await api.get('/office-schedule/locations');
  locations.value = resp.data || [];
};

const loadLocation = async () => {
  if (!selectedLocationId.value) {
    availability.value = null;
    return;
  }
  await refreshAvailability();
};

const refreshAvailability = async () => {
  if (!selectedLocationId.value) return;
  if (!windowStartISO.value || !windowEndISO.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/office-schedule/locations/${selectedLocationId.value}/availability`, {
      params: { startAt: windowStartISO.value, endAt: windowEndISO.value }
    });
    availability.value = resp.data;
    await nextTick();
    paintSvg();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load availability';
  } finally {
    loading.value = false;
  }
};

const clearSvgClasses = (el) => {
  el.classList.remove('room-available', 'room-pending', 'room-occupied');
};

const paintSvg = () => {
  if (!availability.value?.rooms?.length) return;
  const root = svgWrap.value;
  if (!root) return;

  for (const room of availability.value.rooms) {
    if (!room.svgRoomId) continue;
    const el = root.querySelector(`#${CSS.escape(room.svgRoomId)}`);
    if (!el) continue;
    clearSvgClasses(el);
    el.classList.add(`room-${room.status}`);
    el.style.cursor = 'pointer';

    // Click handler (replace to avoid stacking)
    el.onclick = () => onRoomClick(room);

    // Title tooltip
    const titleText = room.clinicianDisplayName ? `${room.roomName} — ${room.clinicianDisplayName}` : room.roomName;
    const existingTitle = el.querySelector('title');
    if (existingTitle) existingTitle.textContent = titleText;
    else {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      t.textContent = titleText;
      el.prepend(t);
    }
  }
};

watch([date, startTime, durationMinutes], () => {
  // debounce not needed for MVP; this is only on change events usually
});

// Request modal
const showRequestModal = ref(false);
const modalRoom = ref(null);
const notes = ref('');

const formatWindow = () => {
  return `${date.value} ${startTime.value} (+${durationMinutes.value}m)`;
};

const closeModal = () => {
  showRequestModal.value = false;
  modalRoom.value = null;
  notes.value = '';
};

const onRoomClick = (room) => {
  modalRoom.value = room;
  showRequestModal.value = true;
};

const submitRequest = async () => {
  if (!modalRoom.value) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post('/office-schedule/requests', {
      locationId: Number(selectedLocationId.value),
      roomId: modalRoom.value.roomId,
      startAt: windowStartISO.value,
      endAt: windowEndISO.value,
      notes: notes.value || null
    });
    closeModal();
    await refreshAvailability();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit request';
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  if (!authStore.isAuthenticated) return;
  try {
    loading.value = true;
    await loadLocations();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load locations';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 16px;
}
.subtitle {
  color: var(--text-secondary);
  margin: 6px 0 0 0;
}
.controls {
  display: grid;
  grid-template-columns: 240px 160px 140px 160px;
  gap: 10px;
  align-items: end;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
select,
input[type='date'],
input[type='time'],
textarea {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.legend {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 10px 0 14px 0;
  color: var(--text-secondary);
  font-size: 13px;
  flex-wrap: wrap;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.legend-item.note {
  opacity: 0.9;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
}
.dot.available { background: #17b26a; }
.dot.pending { background: #fdb022; }
.dot.occupied { background: #f04438; }

.grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 14px;
}
.map-card,
.list-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.map-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.svg-wrap :deep(svg) {
  width: 100%;
  height: auto;
  max-height: 70vh;
}
.svg-wrap :deep(.room-available) { fill: rgba(23,178,106,0.35) !important; stroke: rgba(23,178,106,0.9) !important; stroke-width: 2px; }
.svg-wrap :deep(.room-pending) { fill: rgba(253,176,34,0.35) !important; stroke: rgba(253,176,34,0.95) !important; stroke-width: 2px; }
.svg-wrap :deep(.room-occupied) { fill: rgba(240,68,56,0.35) !important; stroke: rgba(240,68,56,0.95) !important; stroke-width: 2px; }
.empty {
  color: var(--text-secondary);
  background: var(--bg-alt);
  border: 2px dashed var(--border);
  border-radius: 10px;
  padding: 14px;
}
.room-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.room-row {
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: white;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.room-row.available { border-left: 6px solid #17b26a; }
.room-row.pending { border-left: 6px solid #fdb022; }
.room-row.occupied { border-left: 6px solid #f04438; }
.room-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.status-pill {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.clinician {
  color: var(--text-primary);
  font-weight: 600;
}
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.loading { color: var(--text-secondary); }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 50;
}
.modal {
  width: 640px;
  max-width: 100%;
  background: white;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.modal-subtitle { color: var(--text-secondary); margin: 6px 0 12px 0; }
.warning-box {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  padding: 10px 12px;
  border-radius: 10px;
  margin: 10px 0;
  color: #9a3412;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}
.btn-sm { padding: 8px 10px; font-size: 13px; }
</style>

