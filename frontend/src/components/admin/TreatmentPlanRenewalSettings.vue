<template>
  <section class="renewal-settings">
    <h4>Treatment plan renewal</h4>
    <p>Healthcare agencies default to renewal every 90 days. Changing a frequency or a question does not renew a plan.</p>
    <label><input v-model="policy.flagEnabled" type="checkbox" /> Flag plans due for review</label>
    <label>Flag after days <input v-model.number="policy.flagAfterDays" type="number" min="1" :max="policy.renewAfterDays" /></label>
    <label>Renew after days <input v-model.number="policy.renewAfterDays" type="number" min="1" max="3650" /></label>
    <label>Optional renewal deadline <input v-model="policy.renewByDate" type="date" /></label>
    <label><input v-model="policy.forceUpdate" type="checkbox" /> Require an updated plan before continuing progress notes</label>
    <p v-if="message" role="status">{{ message }}</p>
    <button type="button" :disabled="busy" @click="save">{{ busy ? 'Saving…' : 'Save renewal settings' }}</button>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import { DEFAULT_RENEWAL_POLICY } from '../../utils/treatmentPlanRenewal.js';
const props = defineProps({ agencyId: { type: [Number, String], required: true } });
const emit = defineEmits(['saved']);
const policy = ref({ ...DEFAULT_RENEWAL_POLICY });
const busy = ref(false);
const message = ref('');
watch(() => props.agencyId, async (id) => {
  policy.value = { ...DEFAULT_RENEWAL_POLICY }; message.value = '';
  try { const { data } = await api.get(`/medical-billing/agencies/${id}/treatment-plan-renewal`); if (id === props.agencyId) policy.value = data.policy; }
  catch { message.value = 'Unable to load renewal settings.'; }
}, { immediate: true });
async function save() {
  busy.value = true;
  try { const { data } = await api.put(`/medical-billing/agencies/${props.agencyId}/treatment-plan-renewal`, policy.value); policy.value = data.policy; emit('saved', data.policy); message.value = 'Renewal settings saved.'; }
  catch (e) { message.value = e.response?.data?.error?.message || 'Unable to save renewal settings.'; }
  finally { busy.value = false; }
}
</script>
<style scoped>
.renewal-settings { padding:16px; border:1px solid #cbd5e1; border-radius:8px; margin:16px 0; }
label { display:block; margin:10px 0; } input[type=number], input[type=date] { width:160px; margin-left:8px; }
</style>
