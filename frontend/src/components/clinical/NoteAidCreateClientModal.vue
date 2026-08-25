<template>
  <div v-if="open" class="na-modal-backdrop" @click.self="emit('close')">
    <div class="na-modal" role="dialog" aria-labelledby="na-create-client-title">
      <header class="na-modal-head">
        <h3 id="na-create-client-title">Create minimal client</h3>
        <button type="button" class="na-link-btn" @click="emit('close')">Close</button>
      </header>
      <p class="na-modal-hint">
        Creates a tenant-specific chart record. You can import a treatment plan and intake next.
      </p>
      <form class="na-modal-form" @submit.prevent="submit">
        <label class="na-label">
          Tenant
          <select v-model="form.agencyId" class="na-input" required>
            <option disabled value="">Select tenant…</option>
            <option v-for="t in tenantOptions" :key="t.id" :value="String(t.id)">
              {{ t.name }}
            </option>
          </select>
        </label>
        <label class="na-label">
          Full name
          <input v-model="form.fullName" class="na-input" type="text" required maxlength="200" />
        </label>
        <label class="na-label">
          Initials
          <input v-model="form.initials" class="na-input" type="text" required maxlength="16" />
        </label>
        <label class="na-label">
          Submission date
          <input v-model="form.submissionDate" class="na-input" type="date" required />
        </label>
        <label class="na-label">
          Client type
          <select v-model="form.clientType" class="na-input">
            <option value="clinical">Clinical</option>
            <option value="coaching">Coaching</option>
            <option value="tutoring">Tutoring</option>
            <option value="consulting">Consulting</option>
            <option value="school">School</option>
          </select>
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="na-modal-actions">
          <button type="button" class="na-btn-outline" @click="emit('close')">Cancel</button>
          <button type="submit" class="na-btn-primary" :disabled="saving">
            {{ saving ? 'Creating…' : 'Create client' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { normalizeNoteAidClientRow } from '../../utils/noteAidTreatmentHelpers.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  defaultAgencyId: { type: [Number, String, null], default: null },
  defaultInitials: { type: String, default: '' },
  defaultName: { type: String, default: '' }
});

const emit = defineEmits(['close', 'created']);

const agencyStore = useAgencyStore();
const saving = ref(false);
const error = ref('');

const form = reactive({
  agencyId: '',
  fullName: '',
  initials: '',
  submissionDate: new Date().toISOString().slice(0, 10),
  clientType: 'clinical'
});

const tenantOptions = computed(() =>
  (agencyStore.userAgencies || [])
    .map((a) => ({
      id: Number(a.id),
      name: a.name || a.organization_name || `Tenant #${a.id}`
    }))
    .filter((t) => t.id > 0)
);

const agencyLookup = computed(() => {
  const map = {};
  for (const t of tenantOptions.value) map[t.id] = t.name;
  return map;
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    error.value = '';
    form.agencyId = String(props.defaultAgencyId || agencyStore.currentAgency?.id || tenantOptions.value[0]?.id || '');
    form.fullName = String(props.defaultName || '').trim();
    form.initials = String(props.defaultInitials || '').trim().toUpperCase();
    form.submissionDate = new Date().toISOString().slice(0, 10);
    form.clientType = 'clinical';
  }
);

async function submit() {
  saving.value = true;
  error.value = '';
  try {
    const agencyId = Number(form.agencyId || 0);
    if (!agencyId) throw new Error('Select a tenant');
    const payload = {
      organization_id: agencyId,
      agency_id: agencyId,
      full_name: String(form.fullName || '').trim(),
      initials: String(form.initials || '').trim().toUpperCase(),
      submission_date: form.submissionDate,
      client_type: form.clientType || 'clinical',
      source: 'NOTE_AID_MINIMAL'
    };
    const res = await api.post('/clients', payload);
    const row = res?.data?.client || res?.data || null;
    const normalized = normalizeNoteAidClientRow(row, agencyLookup.value);
    if (!normalized?.id) throw new Error('Client created but response was incomplete');
    emit('created', normalized);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not create client';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.na-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
  padding: 16px;
}
.na-modal {
  background: #fff;
  border-radius: 14px;
  width: min(480px, 100%);
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.na-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.na-modal-head h3 {
  margin: 0;
  font-size: 1.05rem;
}
.na-modal-hint {
  margin: 8px 0 14px;
  color: #64748b;
  font-size: 0.85rem;
}
.na-modal-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.na-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.error { color: #b91c1c; font-size: 0.85rem; margin: 0; }
</style>
