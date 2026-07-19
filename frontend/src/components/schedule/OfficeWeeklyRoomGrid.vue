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
              @mousedown.left="onCellMouseDown(dateYmd, h, r.id, $event)"
              @mouseenter="onCellMouseEnter(dateYmd, h, r.id, $event)"
              @click="onCellClick(dateYmd, h, r.id, $event)"
              @keydown.enter.prevent="onCellClick(dateYmd, h, r.id, $event)"
              @keydown.space.prevent="onCellClick(dateYmd, h, r.id, $event)"
            >
              <div class="cell-main">
                <div class="cell-name">{{ slotName(dateYmd, h, r.id) }}</div>
                <div class="cell-badges">
                  <span v-if="slotBadge(dateYmd, h, r.id)" class="cell-badge">{{ slotBadge(dateYmd, h, r.id) }}</span>
                  <span v-if="slotHasInPersonIntake(dateYmd, h, r.id)" class="cell-pill ip-pill" title="In-person intake enabled">IP</span>
                  <span v-if="slotHasVirtualIntake(dateYmd, h, r.id)" class="cell-pill vi-pill" title="Virtual intake enabled">VI</span>
                </div>
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
  canBook: { type: Boolean, default: false },
  selectedKeys: { type: Array, default: () => [] }
});

const emit = defineEmits(['cell-click', 'cell-mousedown', 'cell-mouseenter']);

const grid = computed(() => props.officeGrid);
const rooms = computed(() => {
  const list = Array.isArray(grid.value?.rooms) ? [...grid.value.rooms] : [];
  const numVal = (x) => {
    const n = x?.roomNumber ?? x?.room_number ?? null;
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };
  list.sort((a, b) => {
    const an = numVal(a);
    const bn = numVal(b);
    if (an !== null && bn !== null && an !== bn) return an - bn;
    if (an !== null && bn === null) return -1;
    if (an === null && bn !== null) return 1;
    return String(a?.label || a?.name || '').localeCompare(String(b?.label || b?.name || ''));
  });
  return list;
});
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
const selectedKeySet = computed(() => new Set((props.selectedKeys || []).map((x) => String(x))));
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

const onCellMouseDown = (dateYmd, hour, roomId, event = null) => {
  if (!props.canBook) return;
  if (Number(event?.button) !== 0) return;
  event?.preventDefault?.();
  emit('cell-mousedown', {
    dateYmd: String(dateYmd).slice(0, 10),
    hour: Number(hour),
    roomId: Number(roomId),
    event
  });
};

const onCellMouseEnter = (dateYmd, hour, roomId, event = null) => {
  if (!props.canBook) return;
  emit('cell-mouseenter', {
    dateYmd: String(dateYmd).slice(0, 10),
    hour: Number(hour),
    roomId: Number(roomId),
    event
  });
};

const onCellClick = (dateYmd, hour, roomId, event = null) => {
  if (!props.canBook) return;
  const slot = getSlot(dateYmd, hour, roomId);
  const pending = Number(slot?.pendingRequestCount || 0) > 0;
  const state = String(slot?.state || '');
  emit('cell-click', {
    dateYmd: String(dateYmd).slice(0, 10),
    hour: Number(hour),
    roomId: Number(roomId),
    slot,
    event,
    // Soft-held open cells are not requestable (already requested).
    requestable: isRequestableState(state) && !(pending && state === 'open'),
    alreadyRequested: pending && state === 'open'
  });
};

const slotName = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  if (!s) return '';
  const pending = Number(s?.pendingRequestCount || 0) || 0;
  const state = String(s.state || '');
  if (state === 'conflict') return 'Conflict';
  if (state === 'company_hold') return 'Company hold';
  if (pending > 0 && (state === 'open' || !state)) return 'Requested';
  if (state === 'open') return 'Open';
  if (state === 'assigned_booked') {
    const provider = String(s.bookedProviderName || s.assignedProviderName || '').trim();
    const type = String(s.appointmentType || '').trim().toUpperCase();
    const modality = String(s.modality || '').trim().toUpperCase();
    const sessionHint = type === 'SESSION'
      ? (modality === 'TELEHEALTH' ? 'Session' : modality === 'IN_PERSON' ? 'In-person' : 'Session')
      : (type && type !== 'NONE' ? type.replace(/_/g, ' ') : 'Booked');
    return provider ? `${provider} · ${sessionHint}` : sessionHint;
  }
  if (state === 'assigned_temporary') {
    return String(s.assignedProviderName || '').trim() || 'Temporary';
  }
  if (state === 'assigned_available') {
    return String(s.assignedProviderName || '').trim() || 'Assigned';
  }
  const booked = String(s.bookedProviderName || '').trim();
  const assigned = String(s.assignedProviderName || '').trim();
  return booked || assigned || 'Assigned';
};

const slotBadge = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  const pending = Number(s?.pendingRequestCount || 0) || 0;
  const freqBadge = String(s?.frequencyBadge || '').trim();
  if (String(s?.state || '') === 'conflict') return `${Number(s?.conflictCount || 0) || 2} booked`;
  if (pending > 0 && freqBadge) return `Pending · ${freqBadge}`;
  if (pending > 0) return 'Pending';
  if (String(s?.state || '') === 'assigned_booked') return freqBadge || 'Booked';
  if (String(s?.state || '') === 'assigned_available') return freqBadge || 'Assigned';
  if (String(s?.state || '') === 'company_hold') return 'Hold';
  return freqBadge || '';
};

const slotHasInPersonIntake = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  return Boolean(s?.inPersonIntakeEnabled);
};

const slotHasVirtualIntake = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  return Boolean(s?.virtualIntakeEnabled);
};

const slotMeta = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  if (!s) return '';
  const pending = Number(s?.pendingRequestCount || 0) || 0;
  const names = Array.isArray(s?.pendingRequestNames) ? s.pendingRequestNames : [];
  const state = String(s.state || '');
  if (state === 'conflict') {
    const providers = Array.isArray(s?.conflictEvents)
      ? s.conflictEvents.map((ev) => ev?.providerName).filter(Boolean)
      : [];
    return providers.length ? providers.join(' / ') : 'Multiple bookings';
  }
  if (pending > 0 && names.length) return `Requested by: ${names.join(', ')}`;
  if (pending > 0) return 'Requested';
  if (state === 'open') return '';
  const label = String(s.frequencyLabel || '').trim();
  return label || '';
};

const slotTitle = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  if (!s) return '';
  const parts = [];
  parts.push(roomLabel(rooms.value.find((r) => Number(r.id) === Number(roomId)) || { id: roomId }));
  parts.push(`${hourLabel(hour)}`);
  const name = slotName(dateYmd, hour, roomId);
  const state = String(s.state || '');
  if (state === 'assigned_available') parts.push(name ? `${name} · Assigned (available)` : 'Assigned (available)');
  else if (state === 'assigned_temporary') parts.push(name ? `${name} · Temporary` : 'Temporary assignment');
  else if (state === 'assigned_booked') parts.push(name ? `${name} · Booked` : 'Booked');
  else if (state === 'company_hold') parts.push('Company hold');
  else if (state === 'conflict') parts.push('Conflict');
  else if (state === 'open') parts.push('Open');
  else if (name) parts.push(name);
  if (s.frequencyLabel) parts.push(String(s.frequencyLabel));
  const sessionBits = [
    s.appointmentType && String(s.appointmentType).toUpperCase() !== 'NONE'
      ? String(s.appointmentType).replace(/_/g, ' ')
      : '',
    s.modality ? String(s.modality).replace(/_/g, ' ') : '',
    s.serviceCode ? String(s.serviceCode) : ''
  ].filter(Boolean);
  if (sessionBits.length) parts.push(sessionBits.join(' · '));
  if (String(s?.state || '') === 'conflict' && Array.isArray(s?.conflictEvents)) {
    for (const ev of s.conflictEvents) {
      if (ev?.providerName) parts.push(ev.providerName);
    }
  }
  const pending = Number(s?.pendingRequestCount || 0) || 0;
  if (pending > 0 && Array.isArray(s?.pendingRequestNames) && s.pendingRequestNames.length) {
    parts.push(`Requested by ${s.pendingRequestNames.join(', ')}`);
  } else if (pending > 0) {
    parts.push('Pending request');
  }
  return parts.join(' — ');
};

const slotClass = (dateYmd, hour, roomId) => {
  const s = getSlot(dateYmd, hour, roomId);
  const st = String(s?.state || '');
  const base = st ? `state-${st}` : '';
  const requested = Number(s?.pendingRequestCount || 0) > 0;
  const key = slotKey(dateYmd, hour, roomId);
  const selected = selectedKeySet.value.has(key) ? ' selected' : '';
  return `${base}${requested ? ' requested' : ''}${selected}`;
};

const dayGridStyle = computed(() => ({
  gridTemplateColumns: `74px repeat(${rooms.value.length}, minmax(140px, 1fr))`
}));
</script>

<style scoped>
.office-week-wrap { margin-top: 10px; }
.hint { color: var(--text-secondary); font-size: 13px; }
.office-week { display: flex; flex-direction: column; gap: 14px; }

.day-section { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg); }
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
.cell.clickable { cursor: pointer; user-select: none; }
.cell.clickable:hover { outline: 2px solid rgba(59, 130, 246, 0.22); outline-offset: -2px; }
.cell.today { background: rgba(59, 130, 246, 0.03); }
.day-head.today {
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.24), 0 0 0 2px rgba(59, 130, 246, 0.14);
}
.cell.today {
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16);
}
.cell.selected {
  box-shadow: inset 0 0 0 2px rgba(37, 99, 235, 0.9);
}

.cell-main { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.cell-name { font-weight: 900; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-badges { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.cell-badge { font-size: 11px; font-weight: 900; padding: 2px 6px; border-radius: 999px; border: 1px solid rgba(15, 23, 42, 0.16); background: rgba(15, 23, 42, 0.06); color: rgba(15, 23, 42, 0.78); }
.cell-pill { font-size: 10px; font-weight: 900; padding: 1px 4px; border-radius: 4px; }
.cell-pill.ip-pill { background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); color: #15803d; }
.cell-pill.vi-pill { background: rgba(6, 182, 212, 0.2); border: 1px solid rgba(6, 182, 212, 0.4); color: #0e7490; }
.cell-meta { font-size: 11px; color: var(--text-secondary); font-weight: 800; }

.state-open { background: rgba(16, 185, 129, 0.06); }
.state-assigned_available { background: rgba(39, 174, 96, 0.08); }
.state-assigned_temporary { background: rgba(155, 81, 224, 0.08); }
.state-assigned_booked { background: rgba(235, 87, 87, 0.08); }
.state-conflict {
  background: rgba(220, 38, 38, 0.16);
  border-left: 4px solid #dc2626;
  box-shadow: inset 0 0 0 1px rgba(220, 38, 38, 0.35);
}
.state-conflict .cell-name { color: #991b1b; }
.state-conflict .cell-badge {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fecaca;
}
.cell.requested { border-left: 3px solid rgba(245, 158, 11, 0.8); }
</style>

