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
          <div class="form-row">
            <label>Office</label>
            <select v-model="form.officeId" @change="loadRooms">
              <option value="">Select office…</option>
              <option v-for="o in offices" :key="o.id" :value="String(o.id)">{{ o.name }}</option>
            </select>
          </div>
          <div class="form-row">
            <label>Room</label>
            <select v-model="form.roomId" :disabled="!form.officeId">
              <option value="">Select room…</option>
              <option v-for="r in rooms" :key="r.id" :value="String(r.id)">
                {{ r.roomNumber ? `#${r.roomNumber} ` : '' }}{{ r.label || r.name }}
              </option>
            </select>
          </div>
          <div class="form-row">
            <label>Day/time</label>
            <select v-model="form.slotKey">
              <option value="">Select slot…</option>
              <option v-for="opt in slotOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
            </select>
          </div>
        </template>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="saving || !form.officeId || !form.roomId || !form.slotKey"
          @click="assign"
        >
          {{ saving ? 'Assigning…' : 'Assign' }}
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
    for (let h = start; h < end; h++) {
      const key = `${s.weekday}:${h}`;
      out.push({ key, weekday: Number(s.weekday), hour: h, label: `${weekdayLabel(s.weekday)} ${hourLabel(h)}` });
    }
  }
  const byKey = new Map();
  for (const x of out) byKey.set(x.key, x);
  return Array.from(byKey.values());
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
  const [weekday, hour] = String(form.value.slotKey).split(':').map((x) => Number(x));
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/availability/admin/office-requests/${props.requestId}/assign-temporary`, {
      agencyId: props.agencyId,
      officeId: Number(form.value.officeId),
      roomId: Number(form.value.roomId),
      weekday,
      hour,
      weeks: 6,
      assignedFrequency: 'WEEKLY'
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
