<template>
  <section class="plan-review" aria-label="Treatment plan review and signatures">
    <h3>Treatment plan review</h3>
    <p>Treatment plans require provider and supervisor signoff. Quick sign does not apply. The approved version is then shared for client or guardian approval.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="approval">
      <p><strong>Provider:</strong> {{ approval.providerApproved ? 'Signed and reviewed' : 'Review required' }} · <strong>Supervisor:</strong> {{ approval.supervisorApproved ? 'Approved' : 'Review required' }}</p>
      <p v-if="approval.legacyRecordOnFile">This historical finalized plan remains on file. Provider and supervisor signatures were not captured in this workflow; new sharing requires their review.</p>
      <template v-if="canProviderSign && !approval.providerApproved">
        <label><input v-model="confirmed" type="checkbox" :disabled="busy || disabled" /> I reviewed the full plan and confirm its clinical content is accurate and supported.</label>
        <button type="button" :disabled="!confirmed || busy || disabled" @click="sign">{{ busy ? 'Saving…' : 'Sign plan and send for supervisor review' }}</button>
      </template>
      <p v-else-if="!approval.ready">The assigned supervisor can open this plan in their document review queue.</p>
      <p v-if="approval.ready">Both reviews are complete for this version. Client or guardian approval remains a separate step.</p>
    </template>
    <button type="button" :disabled="busy" @click="load">Refresh review status</button>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: [Number, String], clientId: [Number, String], planId: [Number, String], disabled: Boolean });
const emit = defineEmits(['updated']);
let requestSequence = 0;
const approval = ref(null), canProviderSign = ref(false), confirmed = ref(false), busy = ref(false), error = ref('');
async function load() {
  const request = ++requestSequence;
  approval.value = null; confirmed.value = false; canProviderSign.value = false; busy.value = false;
  if (!props.agencyId || !props.clientId || !props.planId) return;
  busy.value = true; error.value = '';
  try { const { data } = await api.get(`/medical-billing/treatment-plans/${props.planId}/approval`, { params: { agencyId: props.agencyId, clientId: props.clientId } }); if (request !== requestSequence) return; approval.value = data.approval; canProviderSign.value = data.canProviderSign; }
  catch (e) { if (request === requestSequence) error.value = e.response?.data?.error?.message || 'Could not load treatment plan review status.'; }
  finally { if (request === requestSequence) busy.value = false; }
}
async function sign() {
  if (busy.value || props.disabled || !confirmed.value || !approval.value?.contentHash) return;
  const request = ++requestSequence;
  busy.value = true; error.value = '';
  try { const { data } = await api.post(`/medical-billing/treatment-plans/${props.planId}/provider-review`, { agencyId: props.agencyId, clientId: props.clientId, contentHash: approval.value.contentHash, reviewedAndAccurate: true }); if (request !== requestSequence) return; approval.value = data.approval; emit('updated', data.approval); }
  catch (e) { if (request === requestSequence) error.value = e.response?.data?.error?.message || 'Could not sign this treatment plan.'; }
  finally { if (request === requestSequence) busy.value = false; }
}
watch(() => [props.agencyId, props.clientId, props.planId], load, { immediate: true });
</script>
<style scoped>
.plan-review{padding:16px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc}.plan-review h3{margin:0 0 8px}.plan-review p{line-height:1.5}.plan-review label{display:flex;align-items:flex-start;gap:8px}.plan-review button{margin:12px 8px 0 0;padding:9px 12px;border:1px solid #2563eb;border-radius:8px;background:white;color:#1e40af}.plan-review button:disabled{opacity:.5}.plan-review [role=alert]{color:#b91c1c}
</style>
