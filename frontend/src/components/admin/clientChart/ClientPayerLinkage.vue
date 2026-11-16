<template>
  <section class="payer-linkage" aria-label="Payer linkage and verification">
    <h4>Payer linkage and verification</h4>
    <p class="muted">Match each insurance policy to the agency’s electronic payer directory. Member eligibility and claim readiness are tracked separately.</p>
    <p v-if="error" class="payer-error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">Checking payer links…</p>
    <p v-else-if="!policies.some(policy => policy.hasInsurance)" class="muted">Import insurance to check this client’s payer links.</p>
    <article v-for="policy in policies.filter(policy => policy.hasInsurance)" :key="policy.position">
      <strong>{{ policy.position === 'primary' ? 'Primary' : 'Secondary' }} · {{ policy.insurerName || 'Insurance' }}</strong>
      <p role="status">{{ policy.linked ? `Payer linked · ${policy.directoryName} (${policy.payerId})` : 'Payer needs verification and linking' }}</p>
      <small v-if="policy.sourcePayerId">TherapyNotes payer ID: {{ policy.sourcePayerId }}</small>
      <small v-if="policy.linked">Directory support · Claims: {{ policy.claimsSupport }} · Eligibility: {{ policy.eligibilitySupport }}. Any required payer enrollment remains part of billing setup.</small>
      <label>Find the matching payer<input v-model="searches[policy.position]" :disabled="busy" placeholder="Payer name or leave blank to use the paste" /></label>
      <button type="button" :disabled="busy" @click="search(policy.position)">{{ searching === policy.position ? 'Searching…' : 'Search payer directory' }}</button>
      <div v-if="candidates[policy.position]">
        <p v-if="!candidates[policy.position].length">No matches found. Search another payer name or ask billing to configure this agency’s directory.</p>
        <label v-for="payer in candidates[policy.position]" :key="payer.payerId" class="payer-choice"><input v-model="selected[policy.position]" type="radio" :name="`payer-${clientId}-${policy.position}`" :value="payer.payerId" :disabled="busy" /><span>{{ payer.name }} · {{ payer.payerId }}<small>Claims: {{ payer.claims }} · Eligibility: {{ payer.eligibility }}</small></span></label>
        <button type="button" :disabled="busy || !selected[policy.position]" @click="link(policy.position)">Confirm match and link payer</button>
      </div>
      <details v-if="policy.missingFields.length"><summary>{{ policy.missingFields.length }} insurance field(s) still need billing review</summary><ul><li v-for="field in policy.missingFields" :key="field">{{ field }}</li></ul></details>
    </article>
    <p v-if="policies.some(policy => policy.hasInsurance)" class="muted">{{ coverageVerified ? 'Insurance marked verified for claims in billing.' : 'Member eligibility and claim verification still require billing review.' }}</p>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import api from '../../../services/api';
const props = defineProps({ clientId: { type: [Number,String], required: true }, agencyId: { type: [Number,String], required: true }, refreshKey: { default: 0 } });
const emit = defineEmits(['ready-change', 'busy']);
const policies = ref([]), loading = ref(false), error = ref(''), searching = ref(''), linking = ref(false), coverageVerified = ref(false);
const searches = reactive({ primary: '', secondary: '' }), candidates = reactive({}), selected = reactive({});
let generation = 0;
const busy = computed(() => loading.value || !!searching.value || linking.value);
watch(busy, value => emit('busy', value), { flush: 'sync' });
function config() { return { skipGlobalLoading: true, headers: { 'X-Agency-Id': String(props.agencyId) } }; }
async function load() {
  const version = ++generation;
  loading.value = true; error.value = ''; policies.value = []; coverageVerified.value = false; emit('ready-change', false);
  for (const key of ['primary','secondary']) { candidates[key] = null; selected[key] = ''; searches[key] = ''; }
  try {
    const response = await api.get(`/clients/${props.clientId}/chart-import/payer-readiness`, config());
    if (version !== generation) return;
    policies.value = response.data.policies || []; coverageVerified.value = response.data.coverageVerifiedForClaims === true;
    emit('ready-change', policies.value.some(p => p.hasInsurance) && policies.value.filter(p => p.hasInsurance).every(p => p.linked));
  } catch (err) { if (version === generation) error.value = err.response?.data?.error?.message || 'Payer linkage could not be checked.'; }
  finally { if (version === generation) loading.value = false; }
}
async function search(position) {
  const version = generation;
  searching.value = position; error.value = ''; candidates[position] = null; selected[position] = '';
  try {
    const response = await api.post(`/clients/${props.clientId}/chart-import/payer-search`, { position, search: searches[position] }, config());
    if (version === generation) candidates[position] = response.data.payers || [];
  } catch (err) { if (version === generation) error.value = err.response?.data?.error?.message || 'Payer search failed.'; }
  finally { if (version === generation) searching.value = ''; }
}
async function link(position) {
  const version = generation;
  linking.value = true; error.value = '';
  try {
    await api.post(`/clients/${props.clientId}/chart-import/payer-link`, { position, payerId: selected[position], confirmed: true }, config());
    if (version === generation) await load();
  } catch (err) { if (version === generation) error.value = err.response?.data?.error?.message || 'Payer could not be linked.'; }
  finally { linking.value = false; }
}
watch(() => [props.clientId, props.agencyId, props.refreshKey], load, { immediate: true });
onBeforeUnmount(() => { generation++; emit('busy', false); });
</script>
<style scoped>
.payer-linkage { border: 1px solid #cfddd9; border-radius: 10px; padding: 16px; margin: 12px 0; } h4 { margin: 0 0 8px; } article { padding: 12px 0; border-top: 1px solid #e2e8f0; }
label { display: grid; gap: 6px; margin: 10px 0; } input:not([type=radio]) { padding: 8px; font: inherit; border: 1px solid #b8c6d2; border-radius: 6px; } button { padding: 7px 10px; margin: 6px 0; cursor: pointer; }
.payer-choice { display: flex; gap: 8px; align-items: start; } small { display: block; color: #526777; }.muted { color: #526777; font-size: .85rem; }.payer-error { color: #b91c1c; }
</style>
