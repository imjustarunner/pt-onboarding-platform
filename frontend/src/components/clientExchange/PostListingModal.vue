<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3 style="margin: 0;">Post a client to the exchange</h3>
        <button type="button" class="btn-link" @click="$emit('close')">Close</button>
      </div>

      <div v-if="loadingClients" class="muted">Loading your office clients…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <template v-else>
        <label class="field">
          <span class="label">Client</span>
          <select v-model="selectedClientId" class="select">
            <option value="" disabled>Select a client…</option>
            <option v-for="c in eligibleClients" :key="c.id" :value="c.id">
              {{ c.identifier_code || c.initials }} — {{ formatClientType(c.client_type) }}
            </option>
          </select>
          <span v-if="eligibleClients.length === 0" class="muted small">
            No eligible office clients found{{ isBackoffice ? '' : ' assigned to you' }}.
          </span>
        </label>

        <div class="field-row">
          <label class="field">
            <span class="label">Age band</span>
            <input v-model="ageBand" class="input" placeholder="e.g. 8-10, adult" />
          </label>
          <label class="field">
            <span class="label">Gender (optional)</span>
            <input v-model="gender" class="input" placeholder="e.g. female" />
          </label>
        </div>

        <label class="field">
          <span class="label">Presenting problems (comma separated)</span>
          <input v-model="presentingProblemsRaw" class="input" placeholder="anxiety, family conflict" />
        </label>

        <div class="field-row">
          <label class="field">
            <span class="label">Preferred modality</span>
            <select v-model="modality" class="select">
              <option value="">No preference</option>
              <option value="in_person">In person</option>
              <option value="virtual">Virtual</option>
              <option value="either">Either</option>
            </select>
          </label>
          <label class="field">
            <span class="label">Insurance (optional)</span>
            <input v-model="insurance" class="input" placeholder="e.g. Aetna" />
          </label>
        </div>

        <label class="field">
          <span class="label">Notes for other providers</span>
          <textarea v-model="notes" rows="3" placeholder="Why is this client being posted? Anything useful for a new provider to know."></textarea>
        </label>

        <div v-if="submitError" class="error">{{ submitError }}</div>

        <div class="modal-actions">
          <button type="button" class="btn btn-primary" :disabled="!selectedClientId || submitting" @click="submit">
            {{ submitting ? 'Posting…' : 'Post to exchange' }}
          </button>
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  agencyId: { type: Number, default: null },
  isBackoffice: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'posted']);

const authStore = useAuthStore();

const loadingClients = ref(false);
const error = ref('');
const clients = ref([]);
const selectedClientId = ref('');
const ageBand = ref('');
const gender = ref('');
const presentingProblemsRaw = ref('');
const modality = ref('');
const insurance = ref('');
const notes = ref('');
const submitting = ref(false);
const submitError = ref('');

const eligibleClients = computed(() => clients.value);

function formatClientType(t) {
  if (t === 'clinical') return 'Office / Clinical';
  if (t === 'learning') return 'Learning';
  return t;
}

async function loadClients() {
  if (!props.agencyId) return;
  loadingClients.value = true;
  error.value = '';
  try {
    const params = { agency_id: props.agencyId, client_type: 'clinical,learning' };
    if (!props.isBackoffice) {
      params.provider_id = authStore.user?.id;
    }
    const res = await api.get('/clients', { params });
    const rows = Array.isArray(res.data) ? res.data : (res.data?.items || []);
    clients.value = rows.filter((c) => String(c?.status || '').toUpperCase() !== 'ARCHIVED');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load clients';
  } finally {
    loadingClients.value = false;
  }
}

async function submit() {
  if (!selectedClientId.value) return;
  submitting.value = true;
  submitError.value = '';
  try {
    await api.post('/client-exchange/listings', {
      agencyId: props.agencyId,
      clientId: Number(selectedClientId.value),
      demographics: {
        ageBand: ageBand.value || undefined,
        gender: gender.value || undefined
      },
      presentingProblems: presentingProblemsRaw.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      preferences: {
        modality: modality.value || undefined,
        insurance: insurance.value || undefined
      },
      notes: notes.value || null
    });
    emit('posted');
  } catch (e) {
    submitError.value = e?.response?.data?.error?.message || e?.message || 'Failed to post listing';
  } finally {
    submitting.value = false;
  }
}

onMounted(loadClients);
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.modal-card {
  background: #fff;
  border-radius: 14px;
  padding: 20px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  display: grid;
  gap: 12px;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.field {
  display: grid;
  gap: 6px;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary, #64748b);
}
.input,
.select,
textarea {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  width: 100%;
}
textarea {
  resize: vertical;
}
.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.btn-link {
  background: none;
  border: none;
  color: #1d4ed8;
  cursor: pointer;
  font-weight: 700;
}
.error {
  color: #c33;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.small {
  font-size: 12px;
}
@media (max-width: 520px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
