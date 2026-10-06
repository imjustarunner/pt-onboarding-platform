<template>
  <div class="tenant-relationship-tools">
    <StaffBusinessCardsButton :user-id="userId" :agency-id="agencyId" />
    <details @toggle="expanded = $event.target.open">
      <summary>Client services and availability for this agency</summary>
      <template v-if="expanded">
        <ProviderAvailabilitySettings @updated="reload" :provider-id="Number(userId)" :agency-id="Number(agencyId)" />
        <section class="assigned-services" aria-label="Assigned services">
          <h4>Services this person provides</h4>
          <p>Choose the services this person provides for this agency. Assignments do not grant clinical permissions or enable online booking.</p>
          <p v-if="loaded"><strong>Credential classification: {{ credentialLabel }}</strong>{{ credential ? ` · ${credential}` : '' }}. Credentials alone do not grant care permissions.</p>
          <p v-if="loaded"><strong>{{ canProvideCare ? 'Client-facing assignment enabled' : 'Care services not enabled for this agency' }}</strong>. {{ canProvideCare ? 'Services remain subject to the assigned role and agency credential policy.' : careReason }}</p>
          <p v-if="loading" role="status">Loading services…</p>
          <fieldset v-else-if="loaded" :disabled="saving || !canProvideCare">
            <legend>Agency service catalog</legend>
            <p v-if="!services.length">No active services have been configured for this agency.</p>
            <label v-for="service in services" :key="service.id">
              <input v-model="selected" type="checkbox" :value="Number(service.id)" :disabled="service.allowedForCredential === false && !selected.includes(Number(service.id))" />
              <span><strong v-if="service.service_code">{{ service.service_code }} · </strong>{{ service.name }}<small v-if="service.allowedForCredential === false"> · Not permitted for this credential classification</small></span>
            </label>
            <button v-if="services.length" type="button" class="btn btn-primary btn-sm" @click="save">{{ saving ? 'Saving…' : 'Save service assignments' }}</button>
          </fieldset>
          <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
        </section>
      </template>
    </details>
  </div>
</template>
<script setup>
import { ref, watch, computed } from 'vue';
import api from '../../services/api';
import StaffBusinessCardsButton from './StaffBusinessCardsButton.vue';
import ProviderAvailabilitySettings from '../availability/ProviderAvailabilitySettings.vue';
const props = defineProps({ userId: { type: [Number, String], required: true }, agencyId: { type: [Number, String], required: true } });
const expanded = ref(false), loading = ref(false), loaded = ref(false), saving = ref(false);
const services = ref([]), selected = ref([]), error = ref(''), notice = ref('');
const credentialTier = ref(''), credential = ref(''), canProvideCare = ref(false), careReason = ref('');
const refresh = ref(0);
function reload() { refresh.value++; }
const credentialLabel = computed(() => ({ bachelors: 'Bachelor’s level', qbha: 'QBHA', intern_plus: 'Intern / master’s / licensed level', unknown: 'Credential review needed' }[credentialTier.value] || 'Credential review needed'));
const endpoint = computed(() => `/users/${props.userId}/agencies/${props.agencyId}/service-assignments`);
let generation = 0;
function apply(data) { services.value = data.services || []; selected.value = services.value.filter(s => Boolean(Number(s.assigned))).map(s => Number(s.id)); credentialTier.value = data.credentialTier || ''; credential.value = data.credential || ''; canProvideCare.value = data.canProvideCare === true; careReason.value = data.reason || 'An administrator must assign a client-facing role and enable Sees clients before assigning care services.'; }
watch(() => [expanded.value, props.userId, props.agencyId, refresh.value], async () => {
  const request = ++generation;
  if (!expanded.value) return;
  loading.value = true; loaded.value = false; error.value = ''; notice.value = '';
  try { const { data } = await api.get(endpoint.value); if (request === generation) { apply(data); loaded.value = true; } }
  catch (e) { if (request === generation) error.value = e.response?.data?.error?.message || 'Could not load service assignments.'; }
  finally { if (request === generation) loading.value = false; }
});
async function save() {
  const request = generation;
  saving.value = true; error.value = ''; notice.value = '';
  try { const { data } = await api.put(endpoint.value, { serviceIds: selected.value }); if (request === generation) { apply(data); notice.value = 'Service assignments saved for this agency.'; } }
  catch (e) { if (request === generation) error.value = e.response?.data?.error?.message || 'Could not save service assignments.'; }
  finally { saving.value = false; }
}
</script>
<style scoped>
.tenant-relationship-tools { display: grid; gap: 16px; margin: 16px 0; }
summary { cursor: pointer; font-weight: 600; padding: 10px 0; }
.assigned-services { padding: 16px; border: 1px solid var(--border-color, #cbd5e1); border-radius: 10px; }
fieldset { border: 0; padding: 0; display: grid; gap: 12px; }
fieldset label { display: flex; align-items: flex-start; gap: 10px; }
fieldset input { width: 18px; height: 18px; flex-shrink: 0; }
fieldset button { justify-self: start; }
</style>
