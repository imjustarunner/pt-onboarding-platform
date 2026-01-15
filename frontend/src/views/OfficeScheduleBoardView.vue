<template>
  <div class="container schedule-board">
    <div class="header">
      <div>
        <h2>Office Availability</h2>
        <p class="subtitle">
          Read-only availability. Clinician name + last initial only. Login is required to request bookings.
        </p>
      </div>
      <div class="controls">
        <div class="field">
          <label>Date</label>
          <input v-model="date" type="date" @change="load" />
        </div>
        <div class="field">
          <label>Access key</label>
          <input v-model="key" type="text" placeholder="ACCESS_KEY" @keyup.enter="load" />
        </div>
        <button class="btn btn-primary" @click="load" :disabled="loading">Load</button>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else-if="board" class="content">
      <div class="legend">
        <div class="legend-item"><span class="dot available"></span> Available</div>
        <div class="legend-item"><span class="dot pending"></span> Pending</div>
        <div class="legend-item"><span class="dot occupied"></span> Occupied</div>
      </div>

      <div class="grid">
        <div class="map-card">
          <div class="map-header">
            <h3>{{ board.location?.name }}</h3>
          </div>
          <div v-if="board.location?.svg_markup" class="svg-wrap" ref="svgWrap" v-html="board.location.svg_markup"></div>
          <div v-else class="empty">No SVG map configured for this location.</div>
        </div>

        <div class="list-card">
          <h3>Rooms</h3>
          <div class="room-list">
            <div v-for="r in board.rooms" :key="r.roomId" class="room-row" :class="r.status">
              <div class="room-name">{{ r.roomName }}</div>
              <div class="room-meta">
                <span class="status-pill" :class="r.status">{{ labelForStatus(r.status) }}</span>
                <span v-if="r.clinicianDisplayName" class="clinician">{{ r.clinicianDisplayName }}</span>
              </div>
            </div>
          </div>
          <div class="note">
            To request bookings, log in and open <strong>Office Schedule</strong>.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const locationId = ref(route.params.locationId);

const loading = ref(false);
const error = ref('');
const board = ref(null);
const svgWrap = ref(null);

const todayISO = () => new Date().toISOString().slice(0, 10);
const date = ref(todayISO());
const key = ref(route.query.key ? String(route.query.key) : '');

const labelForStatus = (s) => {
  if (s === 'available') return 'Available';
  if (s === 'pending') return 'Pending';
  if (s === 'occupied') return 'Occupied';
  return s;
};

const clearSvgClasses = (el) => {
  el.classList.remove('room-available', 'room-pending', 'room-occupied');
};

const paintSvg = () => {
  if (!board.value?.rooms?.length) return;
  const root = svgWrap.value;
  if (!root) return;
  for (const room of board.value.rooms) {
    if (!room.svgRoomId) continue;
    const el = root.querySelector(`#${CSS.escape(room.svgRoomId)}`);
    if (!el) continue;
    clearSvgClasses(el);
    el.classList.add(`room-${room.status}`);
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

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    board.value = null;

    if (!key.value) {
      error.value = 'Access key required';
      return;
    }

    const startAt = new Date(`${date.value}T00:00:00`).toISOString();
    const endAt = new Date(`${date.value}T23:59:59`).toISOString();

    const resp = await api.get(`/office-schedule/board/${locationId.value}`, {
      params: { key: key.value, startAt, endAt }
    });
    board.value = resp.data;
    await nextTick();
    paintSvg();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load board';
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-end;
  margin-bottom: 14px;
}
.subtitle { color: var(--text-secondary); margin: 6px 0 0 0; }
.controls {
  display: flex;
  gap: 10px;
  align-items: end;
}
.field { display: flex; flex-direction: column; gap: 6px; }
input {
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
.legend-item { display: flex; align-items: center; gap: 8px; }
.dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.dot.available { background: #17b26a; }
.dot.pending { background: #fdb022; }
.dot.occupied { background: #f04438; }
.grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 14px; }
.map-card, .list-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.svg-wrap :deep(svg) { width: 100%; height: auto; max-height: 70vh; }
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
.room-list { display: flex; flex-direction: column; gap: 10px; }
.room-row {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.room-row.available { border-left: 6px solid #17b26a; }
.room-row.pending { border-left: 6px solid #fdb022; }
.room-row.occupied { border-left: 6px solid #f04438; }
.room-meta { display: flex; align-items: center; gap: 10px; }
.status-pill {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.clinician { color: var(--text-primary); font-weight: 600; }
.note { margin-top: 12px; color: var(--text-secondary); font-size: 13px; }
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.loading { color: var(--text-secondary); }
</style>

