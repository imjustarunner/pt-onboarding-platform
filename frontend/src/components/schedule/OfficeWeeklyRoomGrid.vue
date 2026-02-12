<template>
  <div class="office-week-wrap" data-tour="my-schedule-office-layout">
    <div v-if="!grid" class="hint">No office grid loaded.</div>
    <div v-else class="office-week">
      <div v-for="dateYmd in days" :key="`day-${dateYmd}`" class="day-section">
        <div class="day-head" :class="{ today: isToday(dateYmd) }">
          <div class="day-title">
            <span class="day-dow">{{ dayNameFromYmd(dateYmd) }}</span>
            <span class="day-date">{{ fmtMmdd(dateYmd) }}</span>
          </div>
          <div class="day-sub">{{ grid.location?.name || 'Office' }}</div>
        </div>

        <div class="day-grid" :style="dayGridStyle">
          <div class="corner"></div>
          <div v-for="r in rooms" :key="`rh-${r.id}`" class="room-head">
            <div class="room-title">{{ roomLabel(r) }}</div>
          </div>

          <template v-for="h in hours" :key="`row-${dateYmd}-${h}`">
            <div class="hour">{{ hourLabel(h) }}</div>
            <div
              v-for="r in rooms"
              :key="`cell-${dateYmd}-${h}-${r.id}`"
              class="cell"
              :class="[slotClass(dateYmd, h, r.id), { today: isToday(dateYmd), clickable: canBook }]"
              :title="slotTitle(dateYmd, h, r.id)"
              :role="canBook ? 'button' : undefined"
              :tabindex="canBook ? 0 : undefined"
              @click="onCellClick(dateYmd, h, r.id)"
              @keydown.enter.prevent="onCellClick(dateYmd, h, r.id)"
              @keydown.space.prevent="onCellClick(dateYmd, h, r.id)"
            >
              <div class="cell-main">
                <div class="cell-name">{{ slotName(dateYmd, h, r.id) }}</div>
                <div v-if="slotBadge(dateYmd, h, r.id)" class="cell-badge">{{ slotBadge(dateYmd, h, r.id) }}</div>
              </div>
              <div v-if="slotMeta(dateYmd, h, r.id)" class="cell-meta">{{ slotMeta(dateYmd, h, r.id) }}</div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  officeGrid: { type: Object, default: null },
  todayYmd: { type: String, default: null },
  canBook: { type: Boolean, default: false }
});

const emit = defineEmits(['cell-click']);

const grid = computed(() => props.officeGrid);
const rooms = computed(() => (Array.isArray(grid.value?.rooms) ? grid.value.rooms : []));
const days = computed(() => (Array.isArray(grid.value?.days) ? grid.value.days : []));
const hours = computed(() => (Array.isArray(grid.value?.hours) ? grid.value.hours : []));

const pad2 = (n) => String(n).padStart(2, '0');
const localTodayYmd = computed(() => {
  if (props.todayYmd && /^\d{4}-\d{2}-\d{2}$/.test(String(props.todayYmd))) return String(props.todayYmd).slice(0, 10);
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
});

const isToday = (ymd) => String(ymd || '').slice(0, 10) === localTodayYmd.value;

const dayNameFromYmd = (ymd) => {
  const s = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, m, d] = s.split('-').map((n) => Number(n));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(dt.getTime())) return '';
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dt.getDay()] || '';
};
const fmtMmdd = (ymd) => {
  const s = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return `${s.slice(5, 7)}/${s.slice(8, 10)}`;
};

const hourLabel = (h) => {
  const d = new Date();
  d.setHours(Number(h), 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};

const roomLabel = (r) => {
  const num = r?.roomNumber ?? r?.room_number ?? null;
  const n = num === null || num === undefined ? '' : `#${String(num).trim()} `;
  const label = String(r?.label || r?.name || '').trim();
  return `${n}${label}`.trim() || String(r?.id || '');
};

const slotKey = (dateYmd, hour, roomId) => `${String(dateYmd).slice(0, 10)}|${Number(hour)}|${Number(roomId)}`;
const slotsByKey = computed(() => {
  const m = new Map();
  const slots = Array.isArray(grid.value?.slots) ? grid.value.slots : [];
  for (const s of slots) {
    m.set(slotKey(s.date, s.hour, s.roomId), s);
  }
  return m;
});

const getSlot = (dateYmd, hour, roomId) => slotsByKey.value.get(slotKey(dateYmd, hour, roomId)) || null;

const isRequestableState = (st) => st === 'open' || st === 'assigned_available';

const onCellClick = (dateYmd, hour, roomId) => {
  if (!props.canBook) return;
  const slot = getSlot(dateYmd, hour, roomId);
  emit('cell-click', {
    dateYmd: String(dateYmd).slice(0, 10),
    hour: Number(hour),
    roomId: Number(roomId),
    slot,
    requestable: isRequestableState(String(slot?.state || ''))
  });
};

const slotName = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  if (!s) return '';
  const state = String(s.state || '');
  if (state === 'open') return 'Open';
  const booked = String(s.bookedProviderName || '').trim();
  const assigned = String(s.assignedProviderName || '').trim();
  return booked || assigned || 'Assigned';
};

const slotBadge = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  const badge = String(s?.frequencyBadge || '').trim();
  return badge || '';
};

const slotMeta = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  if (!s) return '';
  const state = String(s.state || '');
  if (state === 'open') return '';
  const label = String(s.frequencyLabel || '').trim();
  return label || '';
};

const slotTitle = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  if (!s) return '';
  const parts = [];
  parts.push(roomLabel(rooms.value.find((r) => Number(r.id) === Number(roomId)) || { id: roomId }));
  parts.push(`${String(dateYmd).slice(0, 10)} ${hourLabel(hour)}`);
  parts.push(`State: ${String(s.state || '')}`);
  const name = slotName(dateYmd, hour, roomId);
  if (name) parts.push(`Person: ${name}`);
  if (s.frequencyLabel) parts.push(`Frequency: ${s.frequencyLabel}`);
  return parts.join('\n');
};

const slotClass = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  const st = String(s?.state || '');
  return st ? `state-${st}` : '';
};

const dayGridStyle = computed(() => ({
  gridTemplateColumns: `74px repeat(${rooms.value.length}, minmax(140px, 1fr))`
}));
</script>

<style scoped>
.office-week-wrap { margin-top: 10px; }
.hint { color: var(--text-secondary); font-size: 13px; }
.office-week { display: flex; flex-direction: column; gap: 14px; }

.day-section { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: #fff; }
.day-head { padding: 10px 12px; background: var(--bg-alt); border-bottom: 1px solid var(--border); }
.day-head.today { background: linear-gradient(180deg, rgba(59, 130, 246, 0.14), rgba(59, 130, 246, 0.06)); }
.day-title { display: flex; gap: 8px; align-items: baseline; }
.day-dow { font-weight: 900; }
.day-date { font-weight: 900; color: var(--text-secondary); }
.day-sub { margin-top: 2px; font-size: 12px; color: var(--text-secondary); font-weight: 700; }

.day-grid { display: grid; overflow-x: auto; }
.corner { background: var(--bg-alt); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.room-head { background: var(--bg-alt); border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); padding: 8px 10px; }
.room-title { font-weight: 900; font-size: 12px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.hour { background: var(--bg-alt); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 8px 10px; font-weight: 900; font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
.cell { border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); padding: 6px 8px; min-height: 44px; display: flex; flex-direction: column; gap: 2px; }
.cell.clickable { cursor: pointer; }
.cell.clickable:hover { outline: 2px solid rgba(59, 130, 246, 0.22); outline-offset: -2px; }
.cell.today { background: rgba(59, 130, 246, 0.03); }
.day-head.today {
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.24), 0 0 0 2px rgba(59, 130, 246, 0.14);
}
.cell.today {
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16);
}

.cell-main { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.cell-name { font-weight: 900; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-badge { font-size: 11px; font-weight: 900; padding: 2px 6px; border-radius: 999px; border: 1px solid rgba(15, 23, 42, 0.16); background: rgba(15, 23, 42, 0.06); color: rgba(15, 23, 42, 0.78); }
.cell-meta { font-size: 11px; color: var(--text-secondary); font-weight: 800; }

.state-open { background: rgba(16, 185, 129, 0.06); }
.state-assigned_available { background: rgba(39, 174, 96, 0.08); }
.state-assigned_temporary { background: rgba(155, 81, 224, 0.08); }
.state-assigned_booked { background: rgba(235, 87, 87, 0.08); }
</style>

