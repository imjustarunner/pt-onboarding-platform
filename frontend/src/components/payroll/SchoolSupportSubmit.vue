<template>
  <section v-if="eligible || loading || error" class="school-support-submit" aria-label="School Support Hours — Temporary">
    <h3>School Support Hours <span>Temporary</span></h3>
    <p v-if="submitContext"><strong>Submitting for {{ submitContext.employee.firstName }} {{ submitContext.employee.lastName }}</strong> · You are recorded as the submitter.</p>
    <p v-if="loading">Loading your available hours…</p>
    <p v-if="error" role="alert">{{ error }} <button v-if="!data" type="button" @click="load">Try again</button></p>
    <template v-if="eligible">
      <p><strong>{{ number(available) }} hours available</strong> from your earned school support bank.</p>
      <p>Enter the date and hours you want to use. Your payment is added to the applicable open pay period when you submit. No attachment, appointment link, or payroll approval is needed.</p>
      <p v-if="pending > 0">{{ number(pending) }} hours are reserved for your earlier pending requests.</p>
      <form @submit.prevent="submit">
        <label>Use date<input v-model="useDate" type="date" required :disabled="saving" /></label>
        <label>Hours<input v-model="hours" type="number" min="0.01" :max="Math.min(24, available)" step="0.01" required :disabled="saving" /></label>
        <p v-if="rate > 0">{{ money(Number(hours || 0) * rate) }} estimated at {{ money(rate) }}/hour. The rate for your use date applies.</p>
        <button type="submit" :disabled="loading || saving || available <= 0">{{ saving ? 'Adding to payroll…' : 'Submit School Support Hours' }}</button>
      </form>
      <p v-if="success" role="status">{{ success }}</p>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useSubmitApi, useSubmitContext } from '../../composables/useSubmitContext';
const api = useSubmitApi(), submitContext = useSubmitContext();
const props = defineProps({ agencyId: [Number, String] });
const emit = defineEmits(['submitted']);
const data = ref(null), loading = ref(false), saving = ref(false), error = ref(''), success = ref('');
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const useDate = ref(localToday()), hours = ref('');
let submissionKey = crypto.randomUUID(), generation = 0;
const eligible = computed(() => !!data.value?.policy?.schoolSupportEnabled && (!!data.value?.account?.school_support_eligible || Number(data.value?.balances?.schoolSupportHours) > 0));
const pending = computed(() => Number(data.value?.balances?.schoolSupportPendingHours || 0));
const available = computed(() => Math.max(0, Number(data.value?.balances?.schoolSupportHours || 0) - pending.value));
const rate = computed(() => Number(data.value?.schoolSupportPayRate || 0));
const number = n => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const money = n => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
async function load() {
  const id = props.agencyId, current = ++generation;
  if (!id) { data.value = null; loading.value = false; return; }
  loading.value = true; error.value = '';
  try { const response = await api.get('/payroll/me/pto-balances', { params: { agencyId: id } }); if (current === generation) data.value = response.data; }
  catch (e) { if (current === generation) error.value = e.response?.data?.error?.message || 'Unable to load your School Support Hours.'; }
  finally { if (current === generation) loading.value = false; }
}
async function submit() {
  if (saving.value || loading.value) return;
  const id = props.agencyId, current = generation;
  const amount = Number(hours.value);
  if (!useDate.value || !Number.isFinite(amount) || amount <= 0 || amount > Math.min(24, available.value)) { error.value = 'Enter a date and hours within your available balance.'; return; }
  saving.value = true; error.value = ''; success.value = '';
  try {
    const { data: result } = await api.post('/payroll/me/pto-requests', { agencyId: id, requestType: 'school_support', submissionKey, items: [{ date: useDate.value, hours: amount }] });
    if (current !== generation || String(id) !== String(props.agencyId)) return;
    const rates = typeof result.approved_rates_json === 'string' ? JSON.parse(result.approved_rates_json) : result.approved_rates_json || [];
    const pay = rates.reduce((sum, item) => sum + Number(item.hours) * Number(item.rate), 0);
    success.value = `${number(amount)} ${amount === 1 ? 'hour' : 'hours'} and ${money(pay)} added to payroll. Your bank has been updated.${result.payrollRefreshPending ? ' The payroll summary is awaiting recalculation.' : ''}`;
    submissionKey = crypto.randomUUID(); hours.value = '';
    await load(); emit('submitted', result);
  } catch (e) { if (current === generation) error.value = e.response?.data?.error?.message || 'Unable to confirm submission. Try again; the same submission will only be applied once.'; }
  finally { saving.value = false; }
}
watch(() => props.agencyId, () => { data.value = null; success.value = ''; hours.value = ''; submissionKey = crypto.randomUUID(); load(); }, { immediate: true });
</script>

<style scoped>
.school-support-submit{padding:20px;margin:16px 0;border:1px solid #d9e2eb;border-radius:14px;background:#fff;color:#172b4d}.school-support-submit h3{margin:0 0 12px}.school-support-submit h3 span{display:inline-block;margin-left:8px;padding:3px 8px;border-radius:6px;background:#fff1cc;color:#765200;font-size:13px}.school-support-submit p{line-height:1.5}.school-support-submit form{display:flex;flex-wrap:wrap;gap:14px;align-items:end}.school-support-submit label{display:grid;gap:6px;min-width:150px}.school-support-submit input{min-height:44px;padding:8px;border:1px solid #aebdce;border-radius:6px;font:inherit}.school-support-submit form p{flex-basis:100%;margin:0}.school-support-submit button{min-height:44px;padding:10px 16px;border:1px solid #087d76;border-radius:8px;background:#e9f8f5;color:#075e59;font:inherit;font-weight:600;cursor:pointer}.school-support-submit button:disabled{opacity:.55;cursor:default}
</style>
