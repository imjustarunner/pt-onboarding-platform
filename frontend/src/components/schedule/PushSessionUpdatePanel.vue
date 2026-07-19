<template>
  <div v-if="open" class="psu-backdrop" @click.self="emit('close')">
    <aside class="psu-panel" role="dialog" aria-labelledby="psu-title">
      <header class="psu-head">
        <div>
          <h2 id="psu-title">Push Session Update</h2>
          <p class="psu-sub">Notifications are intentional — nothing sends until you choose.</p>
        </div>
        <button type="button" class="psu-close" aria-label="Close" @click="emit('close')">×</button>
      </header>

      <div class="psu-body">
        <div v-if="error" class="psu-error">{{ error }}</div>
        <div v-if="loading" class="muted">Loading preview…</div>
        <template v-else-if="preview">
          <p v-if="!preview.providerPushedUpdatesEnabled" class="psu-warn">
            Client has disabled “Send me session changes and important updates.” Optional channels will be skipped.
          </p>

          <h3>What changed</h3>
          <ul v-if="changes.length" class="psu-list">
            <li v-for="(c, i) in changes" :key="i">
              <strong>{{ c.label || c.field }}</strong>: {{ display(c.from) }} → {{ display(c.to) }}
            </li>
          </ul>
          <p v-else class="muted">Pass changes from the editor, or edit fields below will be empty.</p>

          <h3>Who will be notified</h3>
          <p class="muted">
            Client #{{ preview.clientId || '—' }} · channels:
            <strong>{{ (preview.willNotifyChannels || []).join(', ') || 'none' }}</strong>
          </p>

          <h3>Message</h3>
          <textarea v-model="messageOverride" class="input" rows="4" :placeholder="preview.messagePreview" />

          <h3>Buffer</h3>
          <select v-model.number="bufferMinutes" class="input">
            <option :value="15">15 minutes</option>
            <option :value="30">30 minutes</option>
            <option :value="60">60 minutes</option>
          </select>
          <p class="muted">Edits during the buffer combine into one notification.</p>

          <div v-if="pending" class="psu-pending">
            Pending update fires at {{ pending.fireAt }} ({{ (pending.changes || []).length }} change(s)).
          </div>
        </template>
      </div>

      <footer class="psu-foot">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Close</button>
        <button v-if="pending" type="button" class="btn btn-secondary" :disabled="busy" @click="cancelPending">Cancel pending</button>
        <button v-if="pending" type="button" class="btn btn-secondary" :disabled="busy" @click="extendBuffer">Extend buffer</button>
        <button type="button" class="btn btn-secondary" :disabled="busy || !changes.length" @click="queue(false)">
          Queue with buffer
        </button>
        <button type="button" class="btn btn-primary" :disabled="busy || !changes.length" @click="queue(true)">
          Send immediately
        </button>
      </footer>
    </aside>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  appointmentId: { type: [Number, String], required: true },
  changes: { type: Array, default: () => [] }
});

const emit = defineEmits(['close', 'queued']);

const loading = ref(false);
const busy = ref(false);
const error = ref('');
const preview = ref(null);
const pending = ref(null);
const messageOverride = ref('');
const bufferMinutes = ref(15);

const display = (v) => (v == null || v === '' ? '—' : String(v));

const load = async () => {
  const id = Number(props.appointmentId || 0);
  if (!id || !props.open) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.post(`/appointments/${id}/push-update/preview`, {});
    preview.value = r.data?.preview || null;
    pending.value = r.data?.pending || null;
    bufferMinutes.value = Number(preview.value?.bufferMinutes || 15);
    messageOverride.value = '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load preview';
  } finally {
    loading.value = false;
  }
};

const queue = async (immediate) => {
  const id = Number(props.appointmentId || 0);
  busy.value = true;
  error.value = '';
  try {
    const r = await api.post(`/appointments/${id}/push-update`, {
      changes: props.changes,
      messageOverride: messageOverride.value || null,
      bufferMinutes: bufferMinutes.value,
      sendImmediately: !!immediate
    });
    pending.value = r.data?.pending || null;
    emit('queued', r.data);
    if (immediate) emit('close');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to queue';
  } finally {
    busy.value = false;
  }
};

const cancelPending = async () => {
  const id = Number(props.appointmentId || 0);
  busy.value = true;
  try {
    await api.patch(`/appointments/${id}/pending-update`, { cancel: true });
    pending.value = null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to cancel';
  } finally {
    busy.value = false;
  }
};

const extendBuffer = async () => {
  const id = Number(props.appointmentId || 0);
  busy.value = true;
  try {
    const r = await api.patch(`/appointments/${id}/pending-update`, {
      extendBufferMinutes: bufferMinutes.value
    });
    pending.value = r.data?.pending || null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to extend';
  } finally {
    busy.value = false;
  }
};

watch(() => [props.open, props.appointmentId], ([isOpen]) => {
  if (isOpen) void load();
});
</script>

<style scoped>
.psu-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); z-index: 10060;
  display: flex; justify-content: flex-end;
}
.psu-panel {
  width: min(440px, 100%); height: 100%; background: #fff;
  display: flex; flex-direction: column; box-shadow: -8px 0 28px rgba(15, 23, 42, 0.18);
}
.psu-head { display: flex; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid #e5e7eb; }
.psu-head h2 { margin: 0; font-size: 1.15rem; }
.psu-sub { margin: 4px 0 0; color: #64748b; font-size: 0.85rem; }
.psu-close { border: none; background: transparent; font-size: 1.6rem; cursor: pointer; color: #64748b; }
.psu-body { padding: 16px 18px; overflow: auto; flex: 1; }
.psu-body h3 { margin: 14px 0 6px; font-size: 0.9rem; }
.psu-list { margin: 0; padding-left: 18px; }
.psu-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid #e5e7eb; background: #f8fafc; }
.psu-error { margin-bottom: 10px; padding: 8px 10px; border-radius: 8px; background: #fef2f2; color: #991b1b; font-size: 0.85rem; }
.psu-warn { padding: 8px 10px; border-radius: 8px; background: #fffbeb; color: #92400e; font-size: 0.85rem; }
.psu-pending { margin-top: 10px; padding: 8px; background: #eff6ff; border-radius: 8px; font-size: 0.85rem; }
.input { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font: inherit; }
.muted { color: #64748b; font-size: 0.82rem; }
</style>
