<template>
  <section class="missed-fees">
    <h2>Missed-session fees and compensation</h2>
    <p>Only an eligible fee actually collected produces a payroll draft: Category 1 receives 20%, Category 2 receives 30%, and Category 3 receives 40%. Work and required waiting time are recorded and paid separately.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <details><summary>Prospective compensation policy</summary>
      <p>{{ policy.enabled ? `Enabled for appointments from ${policy.effectiveOn}.` : 'Not enabled. Existing fees and payroll will not be backfilled.' }}</p>
      <form @submit.prevent="savePolicy">
        <label>Effective date after staff notice<input type="date" v-model="effectiveOn" :disabled="!!policy.effectiveOn" required /></label>
        <label><input type="checkbox" v-model="enabled" /> Enable compensation for eligible fees</label>
        <button :disabled="busy">Save policy</button>
      </form>
    </details>
    <form @submit.prevent="createFee">
      <h3>Prepare a fee for billing review</h3>
      <p>Use the existing client agreement. This does not charge a card. Unused credits and forfeitures do not count as fee collections; Medicaid appointments cannot be charged here.</p>
      <label>Client<select v-model="clientId" required><option value="">Select a client</option><option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option></select></label>
      <label>Appointment ID<input v-model="appointmentId" type="number" min="1" required /></label>
      <label>Agreed fee ($)<input v-model="amount" type="number" min="0.01" step="0.01" required /></label>
      <label>Signed agreement reference<input v-model="reference" minlength="8" maxlength="2000" required /></label>
      <label><input v-model="confirmed" type="checkbox" required /> The existing signed agreement permits this fee; no package exemption or waiver applies.</label>
      <label><input v-model="isPackage" type="checkbox" /> Review a separate fee for a package or subscription appointment</label>
      <fieldset v-if="isPackage"><legend>Package agreement and retained makeup credit</legend>
        <p>An existing fee exemption remains in effect until valid changed terms apply prospectively. Release the unused reservation or restore any forfeited credit through the existing package workflow first. This form does not debit or restore credits.</p>
        <label>Package entitlement ID<input v-model="entitlementId" type="number" min="1" required /></label>
        <label>Agreement signed on<input v-model="signedOn" type="date" required /></label>
        <label>Separate fee terms effective on<input v-model="feeEffectiveOn" type="date" required /></label>
        <label>Maximum separate fee allowed by agreement ($)<input v-model="permittedFee" type="number" min="0.01" step="0.01" required /></label>
        <label><input v-model="packageConsent" type="checkbox" required /> I reviewed the signed agreement referenced above: it permits this separate fee and any prior exemption has been validly resolved for this appointment.</label>
        <label><input v-model="creditRetained" type="checkbox" required /> The unused makeup credit is retained or restored; no credit consumption is being counted as a fee.</label>
      </fieldset>
      <button :disabled="busy || !policy.enabled">Prepare billing review</button>
    </form>
    <h3>Collected fee shares</h3>
    <p>Approve the generated amounts in Payroll → Pending submissions. Do not also enter these fees as legacy missed-appointment adjustments or manual pay lines. Refunds update unapproved drafts; a refund after approval requires review and never automatically deducts wages. Review any regular-rate overtime adjustment for the appointment’s workweek.</p>
    <div class="fee-table"><table><thead><tr><th>Appointment / balance</th><th>Category</th><th>Net collected</th><th>Fee share</th><th>Approved</th><th>Review</th></tr></thead><tbody>
      <tr v-for="fee in fees" :key="fee.id"><td>#{{ fee.appointmentId }} / #{{ fee.receivableId }}<small>{{ String(fee.eventDate).slice(0,10) }}</small></td><td>{{ fee.category }} · {{ fee.percent }}%</td><td>{{ money(fee.netCollectedCents) }}</td><td>{{ money(fee.entitlementCents) }}</td><td>{{ money(fee.approvedCents) }}</td><td>{{ fee.reviewReason || 'See Payroll for pending approval' }}</td></tr>
    </tbody></table></div><p v-if="!fees.length">No fee compensation records yet.</p>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: [String, Number], clients: { type: Array, default: () => [] } });
const policy = ref({}), fees = ref([]), effectiveOn = ref(''), enabled = ref(false), busy = ref(false), error = ref(''), message = ref('');
const clientId = ref(''), appointmentId = ref(''), amount = ref(''), reference = ref(''), confirmed = ref(false);
const isPackage = ref(false), entitlementId = ref(''), signedOn = ref(''), feeEffectiveOn = ref(''), permittedFee = ref(''), packageConsent = ref(false), creditRetained = ref(false);
let sequence = 0;
const money = value => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(value || 0) / 100);
async function load() {
  const current = ++sequence;
  if (!props.agencyId) return;
  try { const { data } = await api.get('/family-billing/staff/missed-session-fees', { params: { agencyId: props.agencyId } });
    if (current !== sequence) return;
    policy.value = data.policy; fees.value = data.fees; enabled.value = data.policy.enabled; effectiveOn.value = data.policy.effectiveOn || '';
  } catch (e) { if (current === sequence) error.value = e.response?.data?.error?.message || 'Fee compensation could not be loaded.'; }
}
async function run(fn) { if (busy.value) return; busy.value = true; error.value = ''; message.value = '';
  try { await fn(); await load(); } catch (e) { error.value = e.response?.data?.error?.message || 'The change could not be saved.'; } finally { busy.value = false; }
}
const savePolicy = () => run(async () => { await api.put('/family-billing/staff/missed-session-fee-policy', { agencyId: props.agencyId, enabled: enabled.value, effectiveOn: effectiveOn.value }); message.value = 'Prospective compensation policy saved.'; });
const createFee = () => run(async () => { const { data } = await api.post('/family-billing/staff/missed-session-fees', { agencyId: props.agencyId, clientId: clientId.value, appointmentId: appointmentId.value, amountCents: Math.round(Number(amount.value) * 100), agreementConfirmed: confirmed.value, agreementReference: reference.value,
  ...(isPackage.value ? { packageFeeReview: { entitlementId: Number(entitlementId.value), agreementReference: reference.value, signedOn: signedOn.value, effectiveOn: feeEffectiveOn.value, permittedFeeCents: Math.round(Number(permittedFee.value) * 100), separateFeePermitted: packageConsent.value, existingExemptionResolved: packageConsent.value, makeupCreditRetained: creditRetained.value } } : {}) }); message.value = `Balance ${data.receivableId} is ready for billing review. No payment was charged.`; });
watch(() => props.agencyId, () => { fees.value = []; policy.value = {}; error.value = ''; message.value = ''; clientId.value = ''; appointmentId.value = ''; reference.value = ''; confirmed.value = false; isPackage.value = false; packageConsent.value = false; creditRetained.value = false; void load(); }, { immediate: true });
</script>
<style scoped>
.missed-fees{display:grid;gap:16px}.missed-fees h2,.missed-fees h3{margin-bottom:0}.missed-fees p{line-height:1.6;margin-top:0}.missed-fees form,.missed-fees details{padding:18px;border:1px solid var(--border,#dbe3ed);border-radius:10px}.missed-fees label{display:block;margin:12px 0}.missed-fees input:not([type=checkbox]),.missed-fees select{display:block;padding:9px;max-width:420px;width:100%;box-sizing:border-box;font:inherit}.missed-fees button{padding:10px 15px;font:inherit}.fee-table{overflow:auto}.fee-table table{width:100%;border-collapse:collapse}.fee-table th,.fee-table td{text-align:left;padding:12px;border-bottom:1px solid var(--border,#dbe3ed)}small{display:block}[role=alert]{color:#a32121}
</style>
