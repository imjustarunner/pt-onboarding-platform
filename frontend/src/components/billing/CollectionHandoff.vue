<template>
  <section v-if="workspace.enabled || error" class="handoff">
    <h2>Management company collections</h2>
    <p>Transfer selected balances with their billing history. The originating agency retains the receivable.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <form v-if="workspace.canEscalate && workspace.agreements.length" @submit.prevent="transfer">
      <label>Management agreement
        <select v-model="agreementId" :disabled="busy">
          <option :value="null">Select an agreement</option>
          <option v-for="a in workspace.agreements" :key="a.id" :value="a.id">{{ a.managingAgencyName }} · {{ a.feeBasisPoints / 100 }}% of recovery · {{ a.eligibilityDays }} days</option>
        </select>
      </label>
      <label>Client and responsible payer
        <select v-model="groupId" :disabled="busy">
          <option :value="null">Select a balance group</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">Client {{ g.clientId }} · {{ g.payerName }}</option>
        </select>
      </label>
      <fieldset v-if="group" :disabled="busy">
        <legend>Balance items to transfer</legend>
        <label v-for="item in group.items" :key="item.allocationId" class="item">
          <input v-model="selectedIds" type="checkbox" :value="item.allocationId" />
          Service {{ item.serviceDate ? day(item.serviceDate) : 'date not recorded' }} · Due {{ day(item.dueDate) }} · {{ money(item.balanceCents) }}
        </label>
      </fieldset>
      <label>Confirmed mailing address for this responsible payer
        <textarea v-model="mailingAddress" maxlength="1000" rows="4" :disabled="busy" required />
      </label>
      <p>{{ money(selectedTotal) }} selected. The handoff includes contact details, service references, payments, refunds, and recorded notices.</p>
      <button :disabled="busy || !selectedIds.length || !agreementId || !mailingAddress.trim()">Transfer to management company</button>
    </form>
    <p v-else-if="workspace.canEscalate">No active management agreement is configured for this agency.</p>
    <h3 v-if="workspace.enabled">Assigned collection cases</h3>
    <p v-if="workspace.enabled && !workspace.cases.length">No collection cases assigned.</p>
    <p v-else-if="workspace.enabled">Showing up to 200 most recent cases.</p>
    <article v-for="c in workspace.cases" :key="c.id" class="case-row">
      <div><strong>Case {{ c.id }} · {{ c.agencyName }}</strong><p>Managed by {{ c.managingAgencyName }} · {{ c.status }} · {{ money(c.transferredAmountCents) }} at transfer</p></div>
      <button :disabled="busy" @click="openCase(c.id)">Open collection case</button>
    </article>
    <article v-if="detail" class="case-detail">
      <h3>Collection case {{ detail.caseId }}</h3>
      <p><strong>{{ detail.outstandingCents === null ? 'Balance requires reconciliation' : `${money(detail.outstandingCents)} outstanding` }}</strong> · {{ money(detail.transferredAmountCents) }} transferred {{ day(detail.transferredAt) }}</p>
      <p v-if="detail.collectionBlocked" role="status">Collection is paused or the balance is satisfied. Review the current items before contacting the payer.</p>
      <p v-if="detail.feeBasisPoints !== undefined">Collection fee: {{ detail.feeBasisPoints / 100 }}% of actual recovery.</p>
      <h4>{{ detail.packet.responsibleParty.name }} · {{ detail.packet.clientName }}</h4>
      <p>{{ detail.packet.responsibleParty.email }} · {{ detail.packet.responsibleParty.phone }}</p>
      <p class="address">{{ detail.packet.responsibleParty.mailingAddress }}</p>
      <p>Contact details recorded at transfer. {{ detail.packet.responsibleParty.communicationConsent }}.</p>
      <h4>Service and balance details</h4>
      <ul><li v-for="item in detail.packet.serviceItems" :key="item.allocationId">
        {{ item.description }} · {{ item.serviceDate || 'Date not recorded' }} · {{ item.sourceType }} #{{ item.sourceReference }}
        <p>Assigned {{ money(item.assignedAmountCents) }} · Paid before transfer {{ money(item.paidBeforeTransferCents) }}</p>
        <p>{{ currentItem(item.allocationId)?.issue || `Current outstanding: ${money(currentItem(item.allocationId)?.outstandingCents)}` }}</p>
      </li></ul>
      <h4>Payments and attempts</h4>
      <p v-if="!detail.currentHistory.payments.length">No recorded payment attempts.</p>
      <ul><li v-for="p in detail.currentHistory.payments" :key="p.paymentId">{{ day(p.receivedAt || p.createdAt) }} · {{ p.processor }} · {{ money(p.amountCents) }} · {{ p.status }} · {{ p.receiptNumber }}</li></ul>
      <h4>Refunds</h4>
      <p v-if="!detail.currentHistory.refunds.length">No recorded refunds.</p>
      <ul><li v-for="r in detail.currentHistory.refunds" :key="r.refundId">Payment {{ r.paymentId }} · {{ money(r.amountCents) }} · {{ r.status }}</li></ul>
      <h4>Communication history</h4>
      <p v-if="!detail.currentHistory.communications.length">No recorded notices for these balance items.</p>
      <ul><li v-for="n in detail.currentHistory.communications" :key="n.noticeId">{{ day(n.createdAt) }} · {{ n.kind }} · {{ n.status }}</li></ul>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: Number, required: true }, balances: { type: Array, default: () => [] } });
const emit = defineEmits(['transferred']);
const workspace = ref({ enabled: false, agreements: [], cases: [] });
const agreementId = ref(null), groupId = ref(null), selectedIds = ref([]), mailingAddress = ref('');
const error = ref(''), message = ref(''), busy = ref(false), detail = ref(null);
let requestKey = crypto.randomUUID();
const agreement = computed(() => workspace.value.agreements.find(a => a.id === agreementId.value));
const groups = computed(() => {
  const grouped = new Map();
  if (!agreement.value) return [];
  const asOf = Date.parse(new Date().toISOString().slice(0, 10));
  for (const item of props.balances) {
    const age = (asOf - Date.parse(String(item.dueDate).slice(0,10))) / 86400000;
    if (!item.payerUserId || item.externallyManaged || item.status !== 'open' || item.holdReason || item.disputedAt || item.plan || item.pendingPaymentId || item.balanceCents <= 0 || !(age >= agreement.value.eligibilityDays)) continue;
    const id = `${item.clientId}:${item.payerUserId}`;
    if (!grouped.has(id)) grouped.set(id, { id, clientId: item.clientId, payerName: item.payerName, items: [] });
    grouped.get(id).items.push(item);
  }
  return [...grouped.values()];
});
const group = computed(() => groups.value.find(g => g.id === groupId.value));
const selectedTotal = computed(() => (group.value?.items || []).filter(i => selectedIds.value.includes(i.allocationId)).reduce((n,i) => n + Number(i.balanceCents),0));
const money = value => value == null ? 'Requires reconciliation' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)/100);
const day = value => value ? String(value).slice(0,10) : '';
const currentItem = allocationId => detail.value?.currentItems.find(item => item.allocationId === allocationId);
async function refresh() {
  workspace.value = (await api.get('/family-billing/staff/collection-handoff', { params: { agencyId: props.agencyId } })).data;
}
async function openCase(caseId) {
  busy.value = true; error.value = ''; detail.value = null;
  try { detail.value = (await api.get(`/family-billing/staff/collection-handoff/${caseId}`, { params: { agencyId: props.agencyId } })).data; }
  catch (e) { error.value = e.response?.data?.error?.message || 'The collection case could not be loaded.'; }
  finally { busy.value = false; }
}
async function transfer() {
  if (busy.value) return;
  busy.value = true; error.value = ''; message.value = '';
  try {
    const result = (await api.post('/family-billing/staff/collection-handoff', { agencyId: props.agencyId, agreementId: agreementId.value,
      allocationIds: selectedIds.value, expectedAmountCents: selectedTotal.value, mailingAddress: mailingAddress.value, idempotencyKey: requestKey })).data;
    selectedIds.value = []; mailingAddress.value = ''; requestKey = crypto.randomUUID();
    message.value = `Transferred to collection case ${result.caseId}. Agency reminders and automatic charges are paused.`;
    emit('transferred'); await refresh(); await openCase(result.caseId);
  } catch (e) { error.value = e.response?.data?.error?.message || 'The handoff could not be completed. Retry to check the same request.'; }
  finally { busy.value = false; }
}
watch([agreementId, groupId], () => { selectedIds.value = []; mailingAddress.value = ''; requestKey = crypto.randomUUID(); });
watch([selectedIds, mailingAddress], () => { requestKey = crypto.randomUUID(); }, { deep: true });
onMounted(async () => { try { await refresh(); } catch { error.value = 'Management collections could not be loaded.'; } });
</script>

<style scoped>
.handoff { margin: 28px 0; border: 1px solid var(--app-line, #c8d8d5); border-radius: 12px; padding: 24px; background: var(--app-surface-muted, #f8fbfa); }
label { display: grid; gap: 8px; margin: 16px 0; max-width: 680px; }
select, textarea { font: inherit; padding: 10px; border: 1px solid var(--app-line, #a9bace); border-radius: 6px; }
.item { display: flex; align-items: center; }.case-row { border-top: 1px solid var(--app-line, #d9e2ef); padding: 16px 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.case-detail { background: var(--bg-card); padding: 20px; border: 1px solid var(--app-line, #d9e2ef); border-radius: 8px; }.address { white-space: pre-line; }[role=alert] { color: var(--app-text-red, #b42318); }
</style>
