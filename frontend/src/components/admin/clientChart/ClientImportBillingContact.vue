<template>
  <section class="billing-contact-review" aria-label="Responsible billing party">
    <h4>Responsible billing party</h4>
    <p v-if="pending" role="status">{{ pending.fullName }} is pending Billing review.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <label>Contact to review for billing responsibility
      <select v-model="selectedId" :disabled="disabled || busy || loading">
        <option value="">Choose a contact</option>
        <option v-for="contact in contacts" :key="contact.affiliationId" :value="String(contact.affiliationId)">
          {{ contact.fullName }} · {{ contact.relationshipType || 'Contact' }}
        </option>
      </select>
    </label>
    <p>Billing confirms who receives balances. Use Payment only in Portal access for a contact who should only be able to pay.</p>
    <button type="button" class="ehr-btn-ghost" :disabled="disabled || busy || loading || !selectedId || selectedId === String(pending?.affiliationId)"
      @click="sendForReview">{{ busy ? 'Saving…' : 'Send to Billing for review' }}</button>
  </section>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import sharedApi from '../../../services/api';
import {transitionRequestScope} from '../../../utils/transitionRequestScope';
const api={...sharedApi,...transitionRequestScope(sharedApi,()=>props.agencyId)};

const props = defineProps({ clientId:[Number,String], agencyId:[Number,String], contacts:Array, disabled:Boolean });
const emit = defineEmits(['busy']);
const selectedId = ref(''), pending = ref(null), error = ref(''), busy = ref(false), loading = ref(false);
let generation = 0;
const endpoint = () => `/clients/${props.clientId}/chart-import/responsible-billing-contact`;
const request = () => ({ skipGlobalLoading:true, headers:{'X-Agency-Id':String(props.agencyId)} });

watch(() => [props.clientId, props.agencyId], async () => {
  const own = ++generation;
  selectedId.value = ''; pending.value = null; error.value = ''; loading.value = true;
  try {
    const { data } = await api.get(endpoint(), request());
    if (own === generation) pending.value = data?.pending || null;
  } catch (e) {
    if (own === generation) error.value = e.response?.data?.error?.message || 'Billing contact review could not be loaded.';
  } finally { if (own === generation) loading.value = false; }
}, { immediate:true });

async function sendForReview() {
  const own = generation;
  if (!selectedId.value || busy.value || props.disabled) return;
  busy.value = true; error.value = ''; emit('busy', true);
  try {
    const { data } = await api.put(endpoint(), { affiliationId:Number(selectedId.value) }, request());
    if (own === generation) pending.value = data.pending;
  } catch (e) {
    if (own === generation) error.value = e.response?.data?.error?.message || 'The billing contact could not be saved for review.';
  } finally { busy.value = false; emit('busy', false); }
}
onBeforeUnmount(() => { generation++; emit('busy', false); });
</script>

<style scoped>
.billing-contact-review{margin:12px 0;padding:12px 16px;border:1px solid #c7d7e7;border-radius:8px}.billing-contact-review h4{margin:0 0 8px}.billing-contact-review label{display:grid;gap:5px;max-width:36rem}.billing-contact-review p{font-size:.9rem}.billing-contact-review select{width:100%;font:inherit;padding:8px;border:1px solid #bacce0;border-radius:6px}
</style>
