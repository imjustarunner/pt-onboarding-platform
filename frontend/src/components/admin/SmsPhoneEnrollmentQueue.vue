<template>
  <details class="phone-enrollments">
    <summary>START enrollment · recipients without an account</summary>
    <p>Approved START programs retain phone consent before an account exists. Verify the person and current chart authority before linking. A phone match does not grant portal access. Unapproved disclosures require the existing signed-consent workflow.</p>
    <label>Queue <select v-model="status" :disabled="busy" @change="load"><option value="pending">Pending identity review</option><option value="linked">Linked</option><option value="stopped">Stopped</option></select></label>
    <button type="button" :disabled="busy" @click="load">Refresh START queue</button>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loaded && !items.length">No matching captured phone enrollments.</p>
    <ul><li v-for="item in items" :key="item.id">#{{ item.id }} · phone ending {{ item.phoneLastFour }} · {{ item.status }} · {{ new Date(Number(item.receivedAt)).toLocaleString() }}
      <button type="button" :disabled="busy" @click="inspect(item)">Review original evidence</button>
    </li></ul>
    <button v-if="nextBeforeId" type="button" :disabled="busy" @click="load(nextBeforeId)">Next 100</button>
    <form v-if="selected && evidence" @submit.prevent="review">
      <h3>Enrollment #{{ selected.id }}</h3>
      <p>Phone: {{ evidence.phone }} · Sender #{{ evidence.numberId }} · Original event: {{ evidence.messageId }}</p>
      <p>Received: {{ new Date(evidence.receivedAt).toLocaleString() }}</p>
      <p v-if="evidence.disclosure">Disclosure {{ evidence.disclosure.version }}: {{ evidence.disclosure.disclosure }}<br />Purposes: {{ evidence.disclosure.purposes.join(', ') }}<br />Carrier approval reference: {{ evidence.disclosure.approvalReference }}</p>
      <p v-else>There is no approved first-time START disclosure in this evidence. Use the existing signed-consent workflow.</p>
      <template v-if="selected.status === 'pending' && evidence.disclosure">
        <label>Existing recipient account ID <input v-model="userId" type="number" min="1" required :disabled="busy" /></label>
        <label>Existing client chart ID <input v-model="clientId" type="number" min="1" required :disabled="busy" /></label>
        <label><input v-model="verified" type="checkbox" required :disabled="busy" /> I reviewed identity, current guardian/adult-client authority, saved phone and the original disclosure.</label>
        <p>This activates only the purposes in the original approved disclosure. STOP, category opt-outs and current delivery permissions remain enforced. It does not create an account, add guardians, invite families or send a message.</p>
        <button type="submit" :disabled="busy || !verified">Link reviewed consent</button>
      </template>
    </form>
  </details>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: [String, Number], required: true } });
const status = ref('pending'), items = ref([]), nextBeforeId = ref(null), loaded = ref(false), busy = ref(false), error = ref(''), notice = ref('');
const selected = ref(null), evidence = ref(null), userId = ref(''), clientId = ref(''), verified = ref(false);
let generation = 0;
function resetEvidence() { selected.value = null; evidence.value = null; userId.value = ''; clientId.value = ''; verified.value = false; }
async function run(fn) {
  if (busy.value) return;
  const ticket = ++generation, agencyId = props.agencyId;
  busy.value = true; error.value = '';
  try { await fn({ ticket, agencyId, current: () => ticket === generation }); }
  catch (e) { if (ticket === generation) error.value = e.response?.data?.error?.message || 'Unable to review phone enrollment.'; }
  finally { if (ticket === generation) busy.value = false; }
}
const load = beforeId => run(async ({ agencyId, current }) => {
  resetEvidence();
  const { data } = await api.get(`/sms-numbers/agency/${agencyId}/phone-enrollments`, { params: { status: status.value, ...(Number.isSafeInteger(beforeId) ? { beforeId } : {}) } });
  if (!current()) return; items.value = data.items; nextBeforeId.value = data.nextBeforeId; loaded.value = true;
});
const inspect = item => run(async ({ agencyId, current }) => {
  resetEvidence(); const { data } = await api.get(`/sms-numbers/agency/${agencyId}/phone-enrollments/${item.id}/evidence`);
  if (!current()) return; selected.value = item; evidence.value = data;
});
async function review() {
  if (!selected.value || !verified.value) return;
  await run(async ({ agencyId, current }) => {
    const id = selected.value.id;
    await api.post(`/sms-numbers/agency/${agencyId}/phone-enrollments/${id}/review`, { userId: Number(userId.value), clientId: Number(clientId.value), identityVerified: true });
    if (!current()) return; items.value = items.value.filter(item => item.id !== id); resetEvidence(); notice.value = 'Original consent linked to the reviewed recipient. No account access was granted.';
  });
}
watch(() => props.agencyId, () => { generation++; busy.value = false; items.value = []; loaded.value = false; nextBeforeId.value = null; resetEvidence(); error.value = ''; notice.value = ''; });
onBeforeUnmount(() => generation++);
</script>
<style scoped>
.phone-enrollments{border:1px solid var(--border,#ccd8e0);border-radius:8px;padding:14px;margin:16px 0;line-height:1.5}.phone-enrollments summary{font-weight:700;cursor:pointer}.phone-enrollments label{display:block;margin:10px 0}.phone-enrollments input,.phone-enrollments select,.phone-enrollments button{font:inherit;padding:7px;max-width:100%}.phone-enrollments li{margin:10px 0}.phone-enrollments form{padding:12px;border-top:1px solid var(--border,#ccd8e0);overflow-wrap:anywhere}.phone-enrollments [role=alert]{color:var(--danger,#b42318)}
</style>
