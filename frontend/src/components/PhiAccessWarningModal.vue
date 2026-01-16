<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="header">
        <h3 style="margin:0;">PHI Access Warning</h3>
        <button class="close" type="button" @click="$emit('close')">×</button>
      </div>

      <div class="body">
        <div class="warning">
          <strong>Protected Health Information (PHI)</strong>
          <div class="sub">
            You are about to open a client packet/document. Only open if you have a valid work-related reason.
          </div>
        </div>

        <label class="check">
          <input type="checkbox" v-model="ack" />
          I understand and acknowledge this access will be logged.
        </label>

        <textarea
          v-model="reason"
          rows="3"
          placeholder="Reason (optional, recommended)…"
        />
      </div>

      <div class="footer">
        <button class="btn btn-secondary" type="button" @click="$emit('close')" :disabled="submitting">
          Cancel
        </button>
        <button class="btn btn-primary" type="button" @click="confirm" :disabled="submitting || !ack">
          {{ submitting ? 'Opening…' : 'Open Document' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '../services/api';

const props = defineProps({
  clientId: { type: [Number, String], required: false, default: null },
  agencyId: { type: [Number, String], required: false, default: null },
  resourceType: { type: String, required: true },
  resourceId: { type: String, required: false, default: null },
  openUrl: { type: String, required: true }
});

const emit = defineEmits(['close', 'opened']);

const ack = ref(false);
const reason = ref('');
const submitting = ref(false);

const confirm = async () => {
  submitting.value = true;
  try {
    await api.post('/phi-access', {
      clientId: props.clientId,
      agencyId: props.agencyId,
      resourceType: props.resourceType,
      resourceId: props.resourceId,
      acknowledgedWarning: true,
      reason: reason.value?.trim() || null
    });

    window.open(props.openUrl, '_blank', 'noopener');
    emit('opened');
    emit('close');
  } catch (e) {
    console.error(e);
    // If logging fails, do not open.
    alert(e.response?.data?.error?.message || 'Failed to log access. Document not opened.');
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}
.modal {
  width: 560px;
  max-width: 95vw;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
.close {
  border: none;
  background: none;
  font-size: 28px;
  cursor: pointer;
  color: var(--text-secondary);
}
.body { padding: 16px; display: grid; gap: 12px; }
.warning {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #7c2d12;
  padding: 12px;
  border-radius: 10px;
}
.sub { margin-top: 6px; color: #9a3412; font-size: 13px; }
.check { display: flex; gap: 10px; align-items: center; color: var(--text-primary); }
textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px;
  border-top: 1px solid var(--border);
}
.btn {
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
}
.btn-primary { background: var(--primary); color: white; }
.btn-secondary { background: var(--bg-alt); color: var(--text-primary); border: 1px solid var(--border); }
</style>

