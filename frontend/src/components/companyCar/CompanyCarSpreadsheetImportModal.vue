<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal" style="width: min(480px, 100%);">
        <div class="modal-header">
          <h2>Import spreadsheet</h2>
          <button type="button" class="btn-close" @click="$emit('close')" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="error" class="warn-box" style="margin-bottom: 12px;">{{ error }}</div>
          <p class="hint" style="margin-bottom: 12px;">
            Upload a CSV or Excel file with columns: Date, Starting Odometer, Ending Odometer, Destinations, Reason for Travel.
          </p>

          <div class="field">
            <label>Company car</label>
            <select v-model="companyCarId">
              <option :value="null" disabled>Select car…</option>
              <option v-for="c in cars" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>

          <div class="field" style="margin-top: 12px;">
            <label>File (.csv, .xlsx)</label>
            <input ref="fileInput" type="file" accept=".csv,.xlsx,.xls" @change="onFileChange" />
          </div>

          <div v-if="result" class="hint" style="margin-top: 12px;">
            Imported <strong>{{ result.created }}</strong> trips
            ({{ result.skipped }} skipped, {{ result.errors }} errors).
            <button type="button" class="btn btn-secondary btn-sm" style="margin-left: 8px;" @click="undoImport">
              Undo last import
            </button>
          </div>

          <div class="actions" style="margin-top: 16px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
            <button type="button" class="btn btn-primary" :disabled="importing || !canImport" @click="runImport">
              {{ importing ? 'Importing…' : 'Import' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, required: true },
  cars: { type: Array, default: () => [] }
});

const emit = defineEmits(['close', 'imported']);

const companyCarId = ref(null);
const selectedFile = ref(null);
const importing = ref(false);
const error = ref('');
const result = ref(null);
const fileInput = ref(null);

const canImport = computed(() => companyCarId.value && selectedFile.value);

function onFileChange(ev) {
  selectedFile.value = ev.target?.files?.[0] || null;
  result.value = null;
}

async function runImport() {
  if (!canImport.value) return;
  error.value = '';
  importing.value = true;
  try {
    const fd = new FormData();
    fd.append('file', selectedFile.value);
    fd.append('agencyId', String(props.agencyId));
    fd.append('companyCarId', String(companyCarId.value));
    const res = await api.post('/company-car/import', fd);
    result.value = res.data;
    emit('imported');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Import failed';
  } finally {
    importing.value = false;
  }
}

async function undoImport() {
  try {
    await api.post('/company-car/import/undo', { agencyId: props.agencyId });
    result.value = null;
    emit('imported');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Undo failed';
  }
}

watch(
  () => props.cars,
  (list) => {
    if (list?.length === 1 && !companyCarId.value) companyCarId.value = list[0].id;
  },
  { immediate: true }
);
</script>
