<template>
  <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Office request – Assign or deny</h3>
        <button type="button" class="modal-close" @click="$emit('close')" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <p v-if="request" class="muted">{{ request.providerName }} requested office availability.</p>
        <div v-if="loading" class="loading">Loading…</div>
        <div v-else-if="error" class="error-box">{{ error }}</div>
        <template v-else-if="request">
          <div class="form-row readonly-display">
            <label>Requested (approve as-is)</label>
            <div class="readonly-values">
              <div><span class="readonly-label">Office:</span> {{ formDisplay.office }}</div>
              <div><span class="readonly-label">Room:</span> {{ formDisplay.room }}</div>
              <div><span class="readonly-label">Time:</span> {{ formDisplay.time }}</div>
            </div>
            <p v-if="formIncomplete" class="muted hint">Provider must specify office, room, and time when requesting. Deny and ask for resubmission.</p>
          </div>
        </template>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="saving || formIncomplete"
          @click="assign"
        >
          {{ saving ? 'Approving…' : 'Approve' }}
        </button>
        <button type="button" class="btn btn-danger" :disabled="saving" @click="deny">
          {{ saving ? '…' : 'Deny' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  visible: { type: Boolean, default: false },
  requestId: { type: Number, default: null },
  agencyId: { type: Number, default: null }
});

const emit = defineEmits(['close', 'assigned', 'denied']);

const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
];
const weekdayLabel = (n) => weekdays.find((d) => d.value === Number(n))?.label || String(n);
const hourLabel = (h) => {
  const d = new Date();
  d.setHours(Number(h), 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};

const loading = ref(false);
const error = ref('');
const saving = ref(false);
const request = ref(null);
const offices = ref([]);
const rooms = ref([]);
const form = ref({ officeId: '', roomId: '', slotKey: '' });

const slotOptions = computed(() => {
  if (!request.value?.slots) return [];
  const out = [];
  for (const s of request.value.slots) {
    const start = Number(s.startHour);
    const end = Number(s.endHour);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const key = `${s.weekday}:${start}:${end}`;
    out.push({
      key,
      weekday: Number(s.weekday),
      startHour: start,
      endHour: end,
      label: `${weekdayLabel(s.weekday)} ${hourLabel(start)}–${hourLabel(end)}`
    });
  }
  return out;
});

const formDisplay = computed(() => {
  const f = form.value;
  const opt = slotOptions.value.find((o) => o.key === f.slotKey);
  const officeName = (id) => (offices.value || []).find((o) => Number(o.id) === Number(id))?.name || `#${id}`;
  const roomName = (id) => {
    const rm = (rooms.value || []).find((r) => Number(r.id) === Number(id));
    return rm ? `${rm.roomNumber ? `#${rm.roomNumber} ` : ''}${rm.label || rm.name}`.trim() : `#${id}`;
  };
  return {
    office: f.officeId ? officeName(f.officeId) : 'Not specified',
    room: f.roomId ? roomName(f.roomId) : 'Not specified',
    time: opt ? opt.label : (f.slotKey || 'Not specified')
  };
});

const formIncomplete = computed(() => {
  const f = form.value;
  return !f.officeId || !f.roomId || !f.slotKey;
});

const load = async () => {
  if (!props.agencyId || !props.requestId) return;
  loading.value = true;
  error.value = '';
  request.value = null;
  form.value = { officeId: '', roomId: '', slotKey: '' };
  rooms.value = [];
  try {
    const [officesResp, reqResp] = await Promise.all([
      api.get('/offices'),
      api.get('/availability/admin/office-requests', { params: { agencyId: props.agencyId, status: 'PENDING' } })
    ]);
    offices.value = officesResp.data || [];
    const list = reqResp.data || [];
    request.value = list.find((r) => Number(r.id) === Number(props.requestId)) || null;
    if (!request.value) {
      error.value = 'Request not found or already resolved.';
    } else {
      // Pre-fill form from request data (prefer provider's preferred offices over first in list)
      const prefOffices = Array.isArray(request.value.preferredOfficeIds) ? request.value.preferredOfficeIds : [];
      const slots = Array.isArray(request.value.slots) ? request.value.slots : [];
      const firstSlot = slots[0];
      const officeIdsAvailable = (offices.value || []).map((o) => String(o.id));
      let officeId = firstSlot?.officeLocationId
        ? String(firstSlot.officeLocationId)
        : (prefOffices.length > 0 ? String(prefOffices[0]) : '');
      // Ensure chosen office exists in available list; fallback to first preferred or first office
      if (officeId && !officeIdsAvailable.includes(officeId)) {
        officeId = (prefOffices || []).map((id) => String(id)).find((id) => officeIdsAvailable.includes(id)) || '';
      }
      let roomId = firstSlot?.roomId ? String(firstSlot.roomId) : '';
      const slotKey = firstSlot != null && Number.isFinite(firstSlot.weekday) && Number.isFinite(firstSlot.startHour) && Number.isFinite(firstSlot.endHour) && firstSlot.endHour > firstSlot.startHour
        ? `${firstSlot.weekday}:${firstSlot.startHour}:${firstSlot.endHour}`
        : '';
      form.value = { officeId, roomId, slotKey };
      if (officeId) {
        await loadRooms();
        // loadRooms clears roomId; restore from request when provider specified a room; do not default to first room when "Any"
        const loadedRooms = rooms.value || [];
        const finalRoomId = roomId && loadedRooms.some((rm) => String(rm.id) === roomId) ? roomId : '';
        form.value = { ...form.value, roomId: finalRoomId };
      }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
};

const loadRooms = async () => {
  const officeId = form.value.officeId;
  if (!officeId) {
    rooms.value = [];
    return;
  }
  try {
    const resp = await api.get(`/offices/${officeId}/rooms`);
    rooms.value = resp.data || [];
    form.value.roomId = '';
  } catch {
    rooms.value = [];
  }
};

const assign = async () => {
  if (!props.requestId || !props.agencyId || !form.value.officeId || !form.value.roomId || !form.value.slotKey) return;
  const requestedFrequency = String(request.value?.requestedFrequency || 'ONCE').toUpperCase();
  const requestedOccurrenceCount = Math.max(1, Number(request.value?.requestedOccurrenceCount || 1));
  let assignedFrequency = 'WEEKLY';
  let weeks = 6;
  if (requestedFrequency === 'ONCE') {
    assignedFrequency = 'WEEKLY';
    weeks = 1;
  } else if (requestedFrequency === 'WEEKLY') {
    assignedFrequency = 'WEEKLY';
    weeks = Math.min(6, requestedOccurrenceCount);
  } else if (requestedFrequency === 'BIWEEKLY') {
    assignedFrequency = 'BIWEEKLY';
    weeks = Math.max(1, requestedOccurrenceCount) * 2;
  } else if (requestedFrequency === 'MONTHLY') {
    assignedFrequency = 'WEEKLY';
    weeks = Math.max(1, requestedOccurrenceCount) * 4;
  }
  const parts = String(form.value.slotKey).split(':').map((x) => Number(x));
  const weekday = parts[0];
  const hour = parts[1];
  const endHour = parts.length >= 3 && Number.isFinite(parts[2]) && parts[2] > hour ? parts[2] : hour + 1;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/availability/admin/office-requests/${props.requestId}/assign-temporary`, {
      agencyId: props.agencyId,
      officeId: Number(form.value.officeId),
      roomId: Number(form.value.roomId),
      weekday,
      hour,
      endHour,
      weeks,
      assignedFrequency,
      requestedFrequency,
      requestedOccurrenceCount
    });
    emit('assigned');
    emit('close');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to assign';
  } finally {
    saving.value = false;
  }
};

const deny = async () => {
  if (!props.requestId || !props.agencyId) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/availability/admin/office-requests/${props.requestId}/deny`, {
      agencyId: props.agencyId
    });
    emit('denied');
    emit('close');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to deny';
  } finally {
    saving.value = false;
  }
};

watch(
  () => [props.visible, props.requestId, props.agencyId],
  ([v, rid, aid]) => {
    if (v && rid && aid) load();
  },
  { immediate: true }
);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.modal-card {
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  min-width: 360px;
  max-width: 90vw;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.modal-header h3 {
  margin: 0;
  font-size: 18px;
}
.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  opacity: 0.7;
}
.modal-body {
  padding: 20px;
}
.form-row {
  margin-bottom: 12px;
}
.form-row label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}
.form-row select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
}
.modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border, #e5e7eb);
}
.readonly-display .readonly-values {
  padding: 10px 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-alt, #f9fafb);
}
.readonly-display .readonly-values > div { margin-bottom: 4px; }
.readonly-display .readonly-values > div:last-child { margin-bottom: 0; }
.readonly-label { font-weight: 600; color: var(--text-secondary, #6b7280); margin-right: 6px; }
.readonly-display .hint { font-size: 12px; margin-top: 8px; }
.error-box {
  background: rgba(239, 68, 68, 0.1);
  color: #b91c1c;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
}
.muted {
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
  margin-bottom: 12px;
}
</style>
