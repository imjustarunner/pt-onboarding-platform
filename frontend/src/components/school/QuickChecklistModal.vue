<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h3 style="margin: 0;">Quick Checklist — {{ clientLabel }}</h3>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div v-if="saving" class="muted">Saving…</div>
        <div v-else class="form-grid">
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
            <label>Intake Date</label>
            <div class="input-with-today">
              <input v-model="form.intakeAt" type="date" class="input" />
              <button type="button" class="btn-today" @click="setIntakeToday">Today</button>
            </div>
          </div>
          <div class="form-group">
            <label>First Date of Service</label>
            <div class="input-with-today">
              <input v-model="form.firstServiceAt" type="date" class="input" />
              <button type="button" class="btn-today" @click="setFirstServiceToday">Today</button>
            </div>
            <p class="hint" style="margin-top: 6px; font-size: 12px;">
              Do not list the date of first service unless the appointment has actually occurred, as this will mark the client as current.
            </p>
          </div>
        </div>
        <div v-if="error" class="error" style="margin-top: 10px;">{{ error }}</div>
        <div class="actions" style="margin-top: 14px;">
          <button class="btn btn-primary" type="button" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <button class="btn btn-secondary" type="button" @click="$emit('close')">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  client: { type: Object, required: true }
});
const emit = defineEmits(['close', 'saved']);

const form = ref({
  parentsContactedAt: '',
  parentsContactedSuccessful: '',
  intakeAt: '',
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
    intakeAt: c.intake_at ? String(c.intake_at).slice(0, 10) : '',
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

const setIntakeToday = () => {
  form.value.intakeAt = todayYmd();
};

const setFirstServiceToday = () => {
  form.value.firstServiceAt = todayYmd();
};

const save = async () => {
  if (!props.client?.id) return;
  try {
    saving.value = true;
    error.value = '';
    const payload = {
      parentsContactedAt: form.value.parentsContactedAt || null,
      parentsContactedSuccessful:
        form.value.parentsContactedSuccessful === '' ? null : form.value.parentsContactedSuccessful === 'true',
      intakeAt: form.value.intakeAt || null,
      firstServiceAt: form.value.firstServiceAt || null
    };
    await api.put(`/clients/${props.client.id}/compliance-checklist`, payload);
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
.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
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
