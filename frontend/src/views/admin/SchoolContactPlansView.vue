<template>
  <main class="plans">
    <h1>School contact plans</h1>
    <p>Review each provider's choice and require setup when needed. A requirement does not send messages or enroll existing assignments.</p>
    <p v-if="!authorized" role="alert">An agency administrator is required to manage contact plans.</p>
    <p v-else-if="agencyId !== 450" role="status">Contact-plan management is currently available in the ITSCOLLC demo.</p>
    <template v-else>
      <p v-if="error" role="alert">{{ error }}</p>
      <button type="button" @click="load" :disabled="busy">{{ busy ? 'Loading…' : 'Refresh' }}</button>
      <table aria-label="Provider contact plans"><thead><tr><th>Provider</th><th>Contact plan</th><th>Intakes needing follow-up</th><th>Requirement</th></tr></thead>
        <tbody><tr v-for="provider in providers" :key="provider.id"><td>{{ provider.first_name }} {{ provider.last_name }}</td><td>{{ labels[provider.status] || provider.status }}</td><td>{{ provider.intake_followup_required ?? 0 }}</td><td><label><input type="checkbox" :checked="provider.required" :disabled="busy" @change="onRequirementChange(provider,$event)">Require contact-plan setup</label></td></tr></tbody>
      </table>
      <p v-if="!busy && !error && !providers.length">No assigned school providers found.</p>
    </template>
  </main>
</template>
<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {useAgencyStore} from '../../store/agency';
import {useAuthStore} from '../../store/auth';
import api from '../../services/api';
const agency = useAgencyStore(), auth = useAuthStore();
const providers = ref([]), busy = ref(false), error = ref('');
const agencyId = computed(() => Number(agency.currentAgency?.id || agency.currentAgencyId || agency.selectedAgencyId || 0));
const authorized = computed(() => ['admin','super_admin'].includes(String(auth.user?.role || '').toLowerCase()));
const labels = {enabled:'On',declined:'Declined',unconfigured:'Setup needed'};
let version = 0;
const config = id => ({params:{agencyId:id},skipGlobalLoading:true});
async function load() {
  const current = ++version, id = agencyId.value;
  providers.value = []; error.value = '';
  if (!authorized.value || id !== 450) { busy.value = false; return; }
  busy.value = true;
  try { const {data} = await api.get('/school-contact-plan/providers',config(id)); if(current === version) providers.value = Array.isArray(data) ? data : []; }
  catch(e) { if(current === version) error.value = e.response?.data?.error?.message || 'Contact plans could not be loaded.'; }
  finally { if(current === version) busy.value = false; }
}
function onRequirementChange(provider,event) {
  const required = event.target.checked; event.target.checked = !!provider.required;
  setRequired(provider,required);
}
async function setRequired(provider,required) {
  if (busy.value || !authorized.value || agencyId.value !== 450) return;
  const current = version, id = agencyId.value;
  busy.value = true; error.value = '';
  try { await api.put(`/school-contact-plan/providers/${provider.id}/required`,{required},config(id)); if(current === version) await load(); }
  catch(e) { if(current === version) { error.value = e.response?.data?.error?.message || 'The requirement could not be saved.'; } }
  finally { if(current === version) busy.value = false; }
}
watch([agencyId,authorized],load,{immediate:true});
onBeforeUnmount(() => {version += 1;});
</script>
<style scoped>
.plans{max-width:1100px;margin:auto;padding:24px;color:#173650}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{text-align:left;padding:16px;border-bottom:1px solid #d7e1e8}input{margin-right:8px}button{padding:10px 18px;border:1px solid #bad0dd;border-radius:8px;background:white}p{line-height:1.6}
</style>
