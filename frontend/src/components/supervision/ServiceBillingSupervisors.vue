<template>
  <section v-if="visible" aria-label="Billing supervisors by service">
    <h4>Billing supervisors by service</h4>
    <p>Choose the billing supervisor and required note cosigner for a service and its dates. The clinical supervisor and other services retain their existing assignments. Payer enrollment and billing rules still apply.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <ul v-if="entries.length"><li v-for="entry in entries" :key="`${entry.serviceCode}-${entry.effectiveFrom}`">{{ entry.serviceCode }} · {{ supervisorName(entry.supervisorUserId) }} · {{ entry.effectiveFrom }} through {{ entry.effectiveThrough || 'ongoing' }} · cosign before submission</li></ul>
    <form @submit.prevent="save">
      <fieldset :disabled="busy">
        <label>Service code<input v-model="form.serviceCode" maxlength="5" required placeholder="H0002" /></label>
        <label>Billing supervisor<select v-model.number="form.supervisorUserId" required><option :value="0" disabled>Choose supervisor</option><option v-for="person in supervisors" :key="person.id" :value="person.id">{{ person.name }} · {{ person.credential }}</option></select></label>
        <label>First service date<input v-model="form.effectiveFrom" type="date" required /></label>
        <label>Last service date (optional)<input v-model="form.effectiveThrough" type="date" /></label>
        <label>Reason<textarea v-model="form.reason" maxlength="1000" required /></label>
        <button :disabled="!form.supervisorUserId">Save service default</button>
      </fieldset>
    </form>
  </section>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: Number, required: true }, providerId: { type: Number, required: true } });
const entries = ref([]), supervisors = ref([]), revision = ref(0), visible = ref(false), busy = ref(false), error = ref(''), notice = ref('');
const fresh = () => ({ serviceCode: '', supervisorUserId: 0, effectiveFrom: '', effectiveThrough: '', reason: '' });
const form = ref(fresh());
let generation = 0;
onBeforeUnmount(() => { generation++; });
const params = () => ({ agencyId: props.agencyId, providerUserId: props.providerId });
const supervisorName = id => supervisors.value.find(p => p.id === id)?.name || `Supervisor #${id}`;
async function load() {
  const current = ++generation; visible.value = false; entries.value = []; supervisors.value = []; form.value = fresh(); error.value = ''; notice.value = ''; busy.value = true;
  try {
    const { data } = await api.get('/medical-billing/service-supervisors', { params: params(), skipGlobalLoading: true });
    if (current !== generation) return;
    entries.value = Array.isArray(data.entries) ? data.entries : []; supervisors.value = Array.isArray(data.supervisors) ? data.supervisors : []; revision.value = Number(data.revision || 0); visible.value = true;
  } catch (e) { if (current === generation && e.response?.status !== 403) { visible.value = true; error.value = e.response?.data?.error?.message || 'Service defaults could not be loaded.'; } }
  finally { if (current === generation) busy.value = false; }
}
async function save() {
  if (busy.value) return;
  const current = generation; busy.value = true; error.value = ''; notice.value = '';
  try {
    const { data } = await api.put('/medical-billing/service-supervisors', { ...params(), ...form.value, revision: revision.value });
    if (current !== generation) return;
    entries.value = Array.isArray(data.entries) ? data.entries : []; revision.value = Number(data.revision || 0); form.value = fresh(); notice.value = 'Service billing supervisor saved.';
  } catch (e) { if (current === generation) error.value = e.response?.data?.error?.message || 'Service default could not be saved.'; }
  finally { if (current === generation) busy.value = false; }
}
watch(() => [props.agencyId, props.providerId], load, { immediate: true });
</script>
<style scoped>
section{border-top:1px solid var(--border-color,#dce3eb);margin-top:1rem;padding-top:1rem}fieldset{border:0;padding:0}label{display:block;margin:.75rem 0}input,select,textarea{display:block;max-width:100%;padding:.5rem}p,li{line-height:1.5}button{padding:.5rem .75rem}
</style>
