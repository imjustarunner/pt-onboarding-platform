<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h3 style="margin: 0;">{{ viewOnly ? 'View new client' : `New Client — ${clientLabel}` }}</h3>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div v-if="saving" class="muted">Saving…</div>
        <div v-else class="form-grid">
          <fieldset class="qcm-fields" :disabled="viewOnly">
          <div class="form-group">
            <label>Parents Contacted</label>
            <input v-model="form.parentsContactedAt" type="date" class="input" />
          </div>
          <div class="form-group">
            <label>Contact Successful?</label>
            <select v-model="form.parentsContactedSuccessful" class="input">
              <option value="">—</option>
              <option value="true">Successful</option>
              <option value="false">Unsuccessful</option>
            </select>
          </div>
          <div class="form-group">
            <label>First Date of Service</label>
            <div class="input-with-today">
              <input v-model="form.firstServiceAt" type="date" class="input" />
              <button type="button" class="btn-today" @click="setFirstServiceToday">Today</button>
            </div>
            <p class="hint" style="margin-top: 6px; font-size: 12px;">
              Do not list the date of first service unless the appointment has actually occurred.
            </p>
          </div>
          </fieldset>
        </div>
        <div v-if="error" class="error" style="margin-top: 10px;">{{ error }}</div>
        <div class="actions" style="margin-top: 14px;">
          <button v-if="!viewOnly" class="btn btn-primary" type="button" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <button class="btn btn-secondary" type="button" @click="$emit('close')">
            {{ viewOnly ? 'Close' : 'Cancel' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  client: { type: Object, required: true },
  parentAgencyId: { type: Number, default: null },
  viewOnly: { type: Boolean, default: false },
  apiBase: { type: String, default: '' }
});
const emit = defineEmits(['close', 'saved']);

const form = ref({
  parentsContactedAt: '',
  parentsContactedSuccessful: '',
  firstServiceAt: ''
});

const saving = ref(false);
const error = ref('');
const clientLabel = ref('');

const syncForm = () => {
  const c = props.client;
  if (!c) return;
  clientLabel.value = c.initials || c.identifier_code || `Client ${c.id}` || '—';
  form.value = {
    parentsContactedAt: c.parents_contacted_at ? String(c.parents_contacted_at).slice(0, 10) : '',
    parentsContactedSuccessful:
      c.parents_contacted_successful === null || c.parents_contacted_successful === undefined
        ? ''
        : c.parents_contacted_successful
          ? 'true'
          : 'false',
    firstServiceAt: c.first_service_at ? String(c.first_service_at).slice(0, 10) : ''
  };
};

watch(() => props.client?.id, syncForm, { immediate: true });

const onKeydown = (e) => {
  if (e.key === 'Escape') emit('close');
};
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const setFirstServiceToday = () => {
  form.value.firstServiceAt = todayYmd();
};

const save = async () => {
  if (!props.client?.id) return;
  try {
    saving.value = true;
    error.value = '';
    const path = props.apiBase
      ? `${props.apiBase}/clients/${props.client.id}/compliance-checklist`
      : `/clients/${props.client.id}/compliance-checklist`;
    await api.put(path, {
      parentsContactedAt: form.value.parentsContactedAt || null,
      parentsContactedSuccessful:
        form.value.parentsContactedSuccessful === '' ? null : form.value.parentsContactedSuccessful === 'true',
      firstServiceAt: form.value.firstServiceAt || null
    }, props.apiBase ? { skipAuthRedirect: true } : undefined);
    emit('saved');
    emit('close');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}
.modal {
  background: white;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  min-width: 280px;
  max-width: 95vw;
  width: 100%;
  margin: 12px;
  max-height: 90vh;
  overflow-y: auto;
}
.qcm-fields {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.modal-header .btn {
  min-width: 44px;
  min-height: 44px;
  padding: 8px 12px;
}
.modal-body {
  padding: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-group > label:not(.choice-card):not(.check-row) {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.continuation-section {
  grid-column: 1 / -1;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt, #f8fafc);
}
.nested-fields {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.day-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.day-chip {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  min-height: 52px;
  padding: 8px 10px;
  border: 1px solid #166534;
  border-radius: 10px;
  background: #fff;
  color: #166534;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.day-chip.active {
  background: #166534;
  color: #fff;
}
.day-short {
  font-size: 13px;
  font-weight: 800;
}
.day-meta {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.85;
  margin-top: 2px;
}
.hint.warn {
  color: #9a3412;
  background: rgba(234, 88, 12, 0.08);
  border: 1px solid rgba(234, 88, 12, 0.2);
  border-radius: 8px;
  padding: 10px 12px;
}
.hint.thank-you {
  color: #166534;
  font-weight: 600;
}
.check-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13px;
  line-height: 1.35;
  cursor: pointer;
}
.check-row input {
  margin-top: 2px;
}
.textarea {
  resize: vertical;
  min-height: 72px;
}
.input-with-today {
  display: flex;
  gap: 8px;
  align-items: center;
}
.input-with-today .input {
  flex: 1;
  min-width: 0;
}
.btn-today {
  flex-shrink: 0;
  padding: 10px 14px;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-alt);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  color: var(--text-secondary);
}
.btn-today:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.actions .btn {
  min-height: 44px;
  padding: 10px 16px;
}
.error {
  color: #c33;
  font-size: 13px;
}
.hint {
  color: var(--text-secondary, #666);
  margin: 0;
}

@media (max-width: 640px) {
  .modal {
    min-width: 0;
    margin: 8px;
    max-height: 85vh;
  }
  .modal-overlay {
    align-items: flex-end;
    padding: 0;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .input-with-today {
    flex-wrap: wrap;
  }
  .input-with-today .input {
    width: 100%;
  }
}
</style>
