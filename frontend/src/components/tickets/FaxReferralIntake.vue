<template>
  <section v-if="receipt" class="fax-referral" aria-label="Fax referral intake">
    <h3>Fax referral</h3>
    <template v-if="receipt.state === 'linked'">
      <p>Filed to the client chart with an incoming referral link.</p>
    </template>
    <template v-else>
      <label>Service organization
        <select v-model.number="organizationId" :disabled="saving">
          <option v-for="org in organizations" :key="org.id" :value="Number(org.id)">{{ org.name }}</option>
        </select>
      </label>
      <FaxClientIntake :agency-id="agencyId" :organization-id="organizationId" :inbox-receipt-id="receipt.id" @change="review = $event" />

      <fieldset :disabled="saving" class="fax-filing">
        <legend>File this referral</legend>
        <label>Client chart
          <select v-model="mode"><option value="existing">Link an existing chart</option><option value="new">Create a new client</option></select>
        </label>
        <NoteAidClientPicker v-if="mode === 'existing'" v-model="clientId" :agency-id="agencyId" :search-all-tenants="false" />
        <label v-else-if="!isSchool">Service
          <select v-model="service"><option value="clinical">Counseling</option><option value="learning">Tutoring</option></select>
        </label>
        <label v-if="mode === 'existing'" class="fax-confirm"><input v-model="sameClient" type="checkbox" /> I verified this is the same client.</label>
        <button type="button" class="btn btn-primary" :disabled="!review?.ready || (mode === 'existing' && (!clientId || !sameClient))" @click="file">
          {{ saving ? 'Filing…' : mode === 'existing' ? 'Link client and referral' : 'Create client and file referral' }}
        </button>
      </fieldset>
    </template>
  </section>
  <p v-if="loading" role="status">Loading fax intake…</p>
  <p v-if="error" role="alert">{{ error }}</p>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import FaxClientIntake from '../clients/FaxClientIntake.vue';
import NoteAidClientPicker from '../clinical/NoteAidClientPicker.vue';

const props = defineProps({ agencyId: { type: Number, required: true }, ticketId: { type: Number, required: true } });
const emit = defineEmits(['filed']);
const receipt = ref(null), organizations = ref([]), organizationId = ref(0);
const loading = ref(false), saving = ref(false), error = ref('');
const review = ref(null), clientId = ref(null), sameClient = ref(false), mode = ref('existing'), service = ref('clinical');
const isSchool = computed(() => organizations.value.some(org =>
  Number(org.id) === organizationId.value && org.organization_type === 'school'
));
let controller;

async function load() {
  controller?.abort();
  const pending = new AbortController();
  controller = pending;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/fax-intake/inbox/ticket/${props.ticketId}`, {
      params: { agencyId: props.agencyId }, signal: pending.signal, skipGlobalLoading: true
    });
    if (pending.signal.aborted) return;
    receipt.value = data.receipt;
    organizations.value = data.organizations;
    organizationId.value ||= props.agencyId;
  } catch (e) {
    if (!pending.signal.aborted) error.value = e.response?.data?.error?.message || 'Could not load this fax referral.';
  } finally {
    if (!pending.signal.aborted) loading.value = false;
  }
}

async function file() {
  if (saving.value || !review.value?.ready) return;
  saving.value = true;
  error.value = '';
  try {
    if (mode.value === 'existing') {
      if (!sameClient.value || !clientId.value) return;
      await api.post(`/fax-intake/inbox/${receipt.value.id}/link`, { agencyId: props.agencyId, clientId: clientId.value, fax: review.value });
    } else {
      const submissionDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      await api.post('/clients', {
        agency_id: props.agencyId, organization_id: organizationId.value, submission_date: submissionDate,
        client_type: isSchool.value ? 'school' : service.value,
        faxIntake: review.value
      });
    }
    await load();
    emit('filed');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not file the referral.';
  } finally {
    saving.value = false;
  }
}
watch(clientId, () => { sameClient.value = false; });
onMounted(load);
onBeforeUnmount(() => controller?.abort());
</script>

<style scoped>
.fax-referral { padding: 12px 16px; }
.fax-filing { display: grid; gap: 12px; border: 1px solid var(--border, #d4dce6); border-radius: 8px; padding: 12px; }
.fax-referral label { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.fax-filing button { justify-self: start; }
</style>
