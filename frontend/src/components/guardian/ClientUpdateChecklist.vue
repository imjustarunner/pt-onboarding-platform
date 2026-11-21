<template>
  <section class="update-card" aria-label="Client updates">
    <p v-if="loading">{{ ft("Checking assigned updates…") }}</p>
    <p v-else-if="data.enabled===false" role="status">{{ ft("Client updates are not currently available. Your existing portal information remains available in its usual panels.") }}</p>
    <p v-if="error" class="update-error" role="alert">{{ ft(error) }}</p>
    <template v-if="data.assigned">
      <p class="eyebrow">{{ ft("Updates for this profile") }}</p>
      <h2>{{ ft("Complete the items selected for you") }}</h2>
      <p>{{ ft("These are the only items requested. You do not need to complete a new enrollment.") }}</p>
      <article v-for="item in data.items" :key="item.id" class="update-item">
        <h3>{{ ft(item.title) }}</h3>
        <p v-if="item.waiting">{{ item.detail || 'Your care team is preparing this step. It does not block the others.' }}</p>
        <template v-else>
          <p>{{ ft(item.detail) }}</p>
          <a v-if="item.href && ['document','assessment'].includes(item.type)" class="update-action" :href="item.href">{{ ft("Open") }} {{ ft(item.title) }}</a>
          <template v-else-if="item.type === 'information'">
            <GuardianClientDetails :client-id="Number(clientId)" />
            <details><summary>{{ ft("Review additional contacts") }}</summary>
              <ClientAffiliatedContactsPanel :client-id="Number(clientId)" mode="guardian" title="Additional contacts" embedded />
            </details>
          </template>
          <FamilyNotificationChoices v-else-if="item.type === 'notifications'" :agency-id="agencyId" :client-id="clientId" @saved="load" />
          <GuardianPlanProgressPanel v-else-if="item.type === 'plan'" :client-id="clientId" :agency-id="agencyId" :client-type="clientType" />
          <InsuranceCardTasks v-else-if="item.type === 'insurance'" :agency-id="agencyId" :client-id="clientId" />
          <GuardianPaymentInsuranceTab v-else-if="['authorization','payment'].includes(item.type)" :agency-id="agencyId" :client-id="clientId" :section="item.type" />
          <label v-if="item.type === 'information'" class="confirm"><input v-model="confirmed" type="checkbox" /> {{ ft("I reviewed this information. It is correct, or I submitted the needed corrections.") }}</label>
          <button v-if="item.type === 'information'" type="button" :disabled="busy || !confirmed" @click="confirm(item)">{{ ft("Save confirmation") }}</button>
          <button v-else-if="item.type !== 'notifications'" type="button" :disabled="busy" @click="load">{{ ft("Check again") }}</button>
        </template>
      </article>
    </template>
    <p v-else-if="!loading && !error && data.enabled!==false">{{ ft("No pending selected updates for this profile.") }}</p>
  </section>
</template>
<script setup>
import {useFamilyLocale} from '../../composables/useFamilyLocale';
const {ft}=useFamilyLocale();
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
import GuardianClientDetails from './GuardianClientDetails.vue';
import FamilyNotificationChoices from './FamilyNotificationChoices.vue';
import GuardianPlanProgressPanel from './GuardianPlanProgressPanel.vue';
import GuardianPaymentInsuranceTab from './GuardianPaymentInsuranceTab.vue';
import ClientAffiliatedContactsPanel from '../client/ClientAffiliatedContactsPanel.vue';
import InsuranceCardTasks from '../billing/InsuranceCardTasks.vue';

const props = defineProps({
  agencyId: [Number, String],
  clientId: [Number, String],
  clientType: String,
  profiles: { type: Array, default: () => [] }
});
const emit = defineEmits(['state']);
const data = ref({ assigned: false, items: [] });
const error = ref('');
const loading = ref(false);
const busy = ref(false);
const confirmed = ref(false);
let seq = 0;

async function load() {
  const own = ++seq;
  error.value = '';
  data.value={assigned:false,items:[]};confirmed.value=false;
  if (!props.agencyId || !props.clientId) {
    loading.value=false;
    data.value = { assigned: false, items: [] };
    emit('state', data.value);
    return;
  }
  loading.value = true;
  try {
    const response = await api.get(`/client-updates/clients/${props.clientId}`, { params: { agencyId: props.agencyId } });
    if (own !== seq) return;
    data.value = response.data || { assigned: false, items: [] };
    emit('state', data.value);
  } catch (err) {
    if (own !== seq) return;
    error.value = err.response?.data?.error?.message || 'Assigned updates could not be loaded.';
    emit('state', { assigned: false, items: [] });
  } finally {
    if (own === seq) loading.value = false;
  }
}

async function confirm(item) {
  if (busy.value || !confirmed.value) return;
  busy.value = true;
  error.value = '';
  const own=seq;
  try {
    const response = await api.post(`/client-updates/clients/${props.clientId}/items/${item.id}/confirm`, { agencyId: Number(props.agencyId) });
    if(own!==seq)return;
    data.value = response.data || data.value;
    confirmed.value = false;
    emit('state', data.value);
  } catch (err) {
    if(own===seq)error.value = err.response?.data?.error?.message || 'The confirmation could not be saved.';
  } finally {
    busy.value = false;
  }
}

watch(() => [props.agencyId, props.clientId], load, { immediate: true });
onBeforeUnmount(()=>{seq++;});
</script>
<style scoped>
.update-card { padding: 8px 0 24px; color: #173451; }
.eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #2467a7; }
.update-card h2 { margin: 8px 0; }
.update-item { margin-top: 16px; padding: 18px; border: 1px solid #d6e3ef; border-radius: 12px; background: #fff; }
.update-item h3 { margin: 0 0 8px; }
.update-action, .update-item button { display: inline-block; margin-top: 12px; padding: 10px 14px; border-radius: 8px; background: #16457c; color: #fff; text-decoration: none; border: 0; }
.confirm { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; }
.update-error { color: #9b2c2c; }
</style>
