<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3 style="margin: 0;">Internal referral</h3>
        <button type="button" class="btn-link" @click="$emit('close')">Close</button>
      </div>

      <div v-if="loadingClients" class="muted">Loading clients…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <template v-else>
        <label class="field" v-if="!lockClient">
          <span class="label">Client</span>
          <select v-model="selectedClientId" class="select">
            <option value="" disabled>Select a client…</option>
            <option v-for="c in eligibleClients" :key="c.id" :value="c.id">
              {{ c.identifier_code || c.initials }} — {{ formatClientType(c.client_type) }}
            </option>
          </select>
          <span v-if="eligibleClients.length === 0" class="muted small">
            No eligible clients found{{ isBackoffice ? '' : ' assigned to you' }}.
          </span>
        </label>
        <div v-else class="field">
          <span class="label">Client</span>
          <div class="locked-client">{{ presetClientLabel || 'Selected client' }}</div>
        </div>

        <section v-if="selectedClientId" class="field">
          <strong>Shared client information</strong>
          <p class="muted small">Recorded diagnoses and presenting problems are included in the exchange and its notification emails.</p>
          <p v-if="summaryLoading" class="muted">Loading client information…</p>
          <p v-else-if="summaryError" class="error">{{ summaryError }}</p>
          <ClientExchangeSummary v-else :listing="sharedSummary" />
        </section>
        <label class="field">
          <span class="label">Referral purpose</span>
          <select v-model="referralKind" class="select">
            <option value="transfer">Transfer to another therapist</option>
            <option value="additional_service">Add services — keep current therapist assigned</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Requested service</span>
          <select v-model="serviceType" class="select">
            <option value="individual">Individual therapy</option>
            <option value="family">Family therapy</option>
            <option value="couples">Couples therapy</option>
            <option value="group">Group therapy</option>
            <option value="other">Other services</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Send referral to</span>
          <select v-model="destination" class="select">
            <option value="exchange">Client Exchange</option>
            <option value="provider">A specific therapist</option>
          </select>
        </label>
        <label v-if="destination === 'provider'" class="field">
          <span class="label">Therapist</span>
          <select v-model="targetProviderUserId" class="select">
            <option value="" disabled>Select a therapist…</option>
            <option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.first_name }} {{ provider.last_name }}</option>
          </select>
        </label>
        <p class="muted">{{ referralKind === 'additional_service' ? 'The current therapist stays assigned. The receiving therapist is added for this service after acceptance and approval.' : 'The current therapist stays assigned until the transfer is accepted and approved.' }}</p>

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
          <span class="label">Additional presenting problems (one per line)</span>
          <textarea v-model="presentingProblemsRaw" rows="2" placeholder="Add any concerns not already recorded above"></textarea>
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

        <label class="field"><span class="label">Preferred provider gender</span>
          <select v-model="providerGender" class="select"><option value="">No preference</option><option value="female">Female / woman</option><option value="male">Male / man</option><option value="nonbinary">Nonbinary</option></select>
        </label>
        <ClientSchedulePreferences v-model="schedule" />

        <label class="field">
          <span class="label">Notes for other providers</span>
          <textarea v-model="notes" rows="3" placeholder="Why is this client being posted? Anything useful for a new provider to know."></textarea>
        </label>

        <div v-if="submitError" class="error">{{ submitError }}</div>

        <div class="modal-actions">
          <button type="button" class="btn btn-primary" :disabled="!selectedClientId || (destination === 'provider' && !targetProviderUserId) || submitting || posted || summaryLoading || !!summaryError" @click="submit">
            {{ submitting ? 'Sending…' : 'Send referral' }}
          </button>
          <button type="button" class="btn btn-secondary" @click="posted ? $emit('posted') : $emit('close')">{{ posted ? 'Done' : 'Cancel' }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import ClientExchangeSummary from './ClientExchangeSummary.vue';
import ClientSchedulePreferences from './ClientSchedulePreferences.vue';
import { normalizeExchangeSchedule } from '../../utils/clientExchangeSchedule.js';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  agencyId: { type: Number, default: null },
  isBackoffice: { type: Boolean, default: false },
  presetClientId: { type: Number, default: null },
  lockClient: { type: Boolean, default: false },
  presetClientLabel: { type: String, default: '' }
});
const emit = defineEmits(['close', 'posted']);

const authStore = useAuthStore();

const loadingClients = ref(false);
const error = ref('');
const clients = ref([]);
const selectedClientId = ref('');
const referralKind = ref('transfer');
const serviceType = ref('individual');
const destination = ref('exchange');
const targetProviderUserId = ref('');
const providers = ref([]);
const ageBand = ref('');
const gender = ref('');
const presentingProblemsRaw = ref('');
const modality = ref('');
const providerGender = ref('');
const insurance = ref('');
const schedule = ref({});
const notes = ref('');
const submitting = ref(false);
const posted = ref(false);
const submitError = ref('');
const sharedSummary = ref({});
const summaryLoading = ref(false);
const summaryError = ref('');
let summaryVersion = 0;
watch(selectedClientId, async clientId => {
  const version = ++summaryVersion;
  sharedSummary.value = {};
  schedule.value = {}; providerGender.value = '';
  ageBand.value = ''; gender.value = ''; presentingProblemsRaw.value = ''; modality.value = ''; insurance.value = ''; notes.value = '';
  summaryError.value = '';
  summaryLoading.value = false;
  if (!clientId) return;
  summaryLoading.value = true;
  try {
    const response = await api.get(`/client-exchange/clients/${clientId}/summary`, { params: { agencyId: props.agencyId } });
    if (version === summaryVersion) {
      sharedSummary.value = response.data?.summary || {};
      schedule.value = sharedSummary.value.preferences?.schedule || {};
      providerGender.value = sharedSummary.value.preferences?.providerGender || '';
    }
  } catch (error) {
    if (version === summaryVersion) summaryError.value = error?.response?.data?.error?.message || 'Unable to load the client summary. Please try again.';
  } finally {
    if (version === summaryVersion) summaryLoading.value = false;
  }
});

const eligibleClients = computed(() => clients.value);

function formatClientType(t) {
  if (t === 'clinical') return 'Office / Clinical';
  if (t === 'learning') return 'Learning';
  return t;
}

async function loadClients() {
  if (props.lockClient && props.presetClientId) {
    selectedClientId.value = String(props.presetClientId);
    return;
  }
  if (!props.agencyId) return;
  loadingClients.value = true;
  error.value = '';
  try {
    const params = { agency_id: props.agencyId, client_type: 'clinical,learning,basic_nonclinical,school' };
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
    const response = await api.post('/client-exchange/listings', {
      agencyId: props.agencyId,
      clientId: Number(selectedClientId.value),
      referralKind: referralKind.value,
      serviceType: serviceType.value,
      targetProviderUserId: destination.value === 'provider' ? Number(targetProviderUserId.value) : null,
      demographics: {
        ageBand: ageBand.value || undefined,
        gender: gender.value || undefined
      },
      presentingProblems: presentingProblemsRaw.value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      preferences: {
        modality: modality.value || undefined,
        insurance: insurance.value || undefined,
        providerGender: providerGender.value || null,
        schedule: normalizeExchangeSchedule(schedule.value)
      },
      notes: notes.value || null
    });
    const delivery = response.data?.listing?.notifications;
    if (delivery?.failed || delivery?.queued) {
      posted.value = true;
      submitError.value = delivery.failed
        ? 'Client posted, but some matching emails could not be sent. Check notification email delivery in Communications. Do not repost this client.'
        : 'Client posted. Matching emails are awaiting approval in Communications.';
      return;
    }
    emit('posted');
  } catch (e) {
    submitError.value = e?.response?.data?.error?.message || e?.message || 'Failed to post listing';
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  loadingClients.value = true;
  try {
    await loadClients();
    const { data } = await api.get('/client-exchange/providers', { params: { agencyId: props.agencyId } });
    providers.value = data.providers || [];
  } catch (e) { error.value = e?.response?.data?.error?.message || 'Failed to load referral options';
  } finally {
    loadingClients.value = false;
  }
});
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10050;
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
.locked-client {
  padding: 8px 10px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-alt, #f8fafc);
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #1e293b);
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
