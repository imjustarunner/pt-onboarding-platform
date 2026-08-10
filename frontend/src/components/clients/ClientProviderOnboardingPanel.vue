<template>
  <div class="provider-steps">
    <p class="provider-steps-hint">
      Record parent contact, intake, and first service. When all steps are complete and staff onboarding is finished,
      the client is marked <strong>Current</strong> automatically.
    </p>

    <div v-if="!isSchool" class="provider-office-note muted">
      Office clients use the client record for intake and first-service dates.
      <router-link v-if="clientRecordTo" :to="clientRecordTo">Open client record</router-link>
    </div>

    <template v-else>
      <div v-if="loading" class="muted small">Loading checklist…</div>
      <div v-else class="provider-steps-form">
        <div
          v-for="item in checklistItems"
          :key="item.key"
          class="step-row"
          :class="{ done: item.done }"
        >
          <span class="step-check" :aria-label="item.done ? 'Complete' : 'Incomplete'">
            <svg v-if="item.done" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clip-rule="evenodd"/>
            </svg>
          </span>
          <span class="step-label">{{ item.label }}</span>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label for="prov-parents-contacted">Parents contacted</label>
            <input id="prov-parents-contacted" v-model="form.parentsContactedAt" type="date" class="input" />
          </div>
          <div class="form-group">
            <label for="prov-contact-success">Contact successful?</label>
            <select id="prov-contact-success" v-model="form.parentsContactedSuccessful" class="input">
              <option value="">—</option>
              <option value="true">Successful</option>
              <option value="false">Unsuccessful</option>
            </select>
          </div>
          <div class="form-group">
            <label for="prov-intake">First intake completed</label>
            <input id="prov-intake" v-model="form.intakeAt" type="date" class="input" />
          </div>
          <div class="form-group">
            <label for="prov-first-service">First date of service</label>
            <div class="input-with-today">
              <input id="prov-first-service" v-model="form.firstServiceAt" type="date" class="input" />
              <button type="button" class="btn-today" @click="setFirstServiceToday">Today</button>
            </div>
            <p class="field-hint">
              Only enter a first-service date after the appointment has occurred — this can mark the client as Current.
            </p>
          </div>
        </div>

        <div v-if="error" class="error small">{{ error }}</div>
        <div class="provider-steps-actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save my steps' }}
          </button>
          <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  clientType: { type: String, default: 'school' },
  clientRecordTo: { type: Object, default: null },
  providerItems: { type: Array, default: () => [] }
});
const emit = defineEmits(['saved']);

const isSchool = computed(() => String(props.clientType || 'school').toLowerCase() === 'school');
const checklistItems = computed(() => props.providerItems || []);

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const saveMsg = ref('');

const form = ref({
  parentsContactedAt: '',
  parentsContactedSuccessful: '',
  intakeAt: '',
  firstServiceAt: ''
});

function syncFormFromClient(client) {
  if (!client) return;
  form.value = {
    parentsContactedAt: client.parents_contacted_at ? String(client.parents_contacted_at).slice(0, 10) : '',
    parentsContactedSuccessful:
      client.parents_contacted_successful === null || client.parents_contacted_successful === undefined
        ? ''
        : client.parents_contacted_successful
          ? 'true'
          : 'false',
    intakeAt: client.intake_at ? String(client.intake_at).slice(0, 10) : '',
    firstServiceAt: client.first_service_at ? String(client.first_service_at).slice(0, 10) : ''
  };
}

async function loadClient() {
  if (!isSchool.value) return;
  const cid = Number(props.clientId || 0);
  if (!cid) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/clients/${cid}`);
    syncFormFromClient(data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load client';
  } finally {
    loading.value = false;
  }
}

function setFirstServiceToday() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  form.value.firstServiceAt = `${yyyy}-${mm}-${dd}`;
}

async function save() {
  if (!isSchool.value) return;
  saving.value = true;
  error.value = '';
  saveMsg.value = '';
  try {
    const payload = {
      parentsContactedAt: form.value.parentsContactedAt || null,
      parentsContactedSuccessful:
        form.value.parentsContactedSuccessful === ''
          ? null
          : form.value.parentsContactedSuccessful === 'true',
      intakeAt: form.value.intakeAt || null,
      firstServiceAt: form.value.firstServiceAt || null
    };
    const { data } = await api.put(`/clients/${props.clientId}/compliance-checklist`, payload);
    syncFormFromClient(data);
    saveMsg.value = 'Saved';
    const checklistRes = await api.get(`/clients/${props.clientId}/onboarding-checklist`);
    emit('saved', checklistRes.data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

watch(() => props.clientId, () => loadClient(), { immediate: true });
</script>

<style scoped>
.provider-steps-hint {
  margin: 0 0 14px;
  font-size: 0.84rem;
  color: #475569;
  line-height: 1.45;
}
.provider-office-note {
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 0.85rem;
}
.step-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 0.86rem;
  color: #64748b;
}
.step-row.done { color: #166534; }
.step-check {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid #cbd5e1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.step-row.done .step-check {
  background: #22c55e;
  border-color: #22c55e;
  color: #fff;
}
.step-check svg { width: 12px; height: 12px; }
.step-label { font-weight: 600; }
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.form-group label {
  display: block;
  font-size: 0.8rem;
  font-weight: 700;
  color: #475569;
  margin-bottom: 4px;
}
.input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.9rem;
}
.input-with-today {
  display: flex;
  gap: 8px;
  align-items: center;
}
.btn-today {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.field-hint {
  margin: 6px 0 0;
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.35;
}
.provider-steps-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 14px;
}
.save-msg {
  font-size: 0.82rem;
  color: #166534;
  font-weight: 600;
}
</style>
