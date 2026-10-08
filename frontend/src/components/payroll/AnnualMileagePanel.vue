<template>
  <section aria-label="Annual mileage reimbursement limits" class="annual-mileage">
    <h3>Annual mileage reimbursement limits — payroll only</h3>
    <form @submit.prevent="load">
      <label>Calendar year <input v-model.number="year" type="number" min="2000" max="2200" required /></label>
      <button class="btn btn-secondary" :disabled="loading">{{ loading ? 'Loading…' : 'Load year' }}</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="report">
      <p>January 1–December 31, {{ report.year }}. Payroll dollars use the pay-period end date; claim counts and miles use the trip date.
        <strong v-if="report.limitDollars != null">{{ dollars(report.limitDollars) }} annual limit per person.</strong>
        <span v-else>No annual dollar limit configured for this tenant.</span>
        Tracking only; this does not change payments or notify employees.</p>
      <p>Payroll totals include manual mileage and approved claims once. Posted/finalized payroll is not confirmation of bank payment. Pending approvals exclude claims already in posted/finalized periods. Rejected claims are excluded.</p>
      <div class="table-scroll"><table v-if="report.people.length">
        <thead><tr><th>Employee</th><th>Pending claims / miles</th><th>Approved, not posted</th><th>Posted/finalized payroll</th><th>Remaining after payroll</th><th>Limit status</th></tr></thead>
        <tbody><tr v-for="person in report.people" :key="person.userId">
          <td>{{ person.name }}</td><td>{{ person.submittedCount }} / {{ person.submittedMiles.toFixed(1) }} mi</td>
          <td>{{ dollars(person.approvedDollars) }}</td><td>{{ dollars(person.paidDollars) }}</td>
          <td>{{ dollars(person.remainingDollars) }}</td><td><strong>{{ statusLabel[person.status] }}</strong><span v-if="person.overLimitDollars > 0"> · {{ dollars(person.overLimitDollars) }} over including approvals</span></td>
        </tr></tbody>
      </table><p v-else>No submitted, approved, or paid mileage claims for this calendar year.</p></div>
    </template>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api.js';
const props = defineProps({ agencyId: { type: [Number, String], required: true } });
const year = ref(new Date().getFullYear()), report = ref(null), error = ref(''), loading = ref(false);
const dollars = n => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const statusLabel = { reached: 'Limit reached', committed: 'Approvals reach limit', approaching: '90% or more committed', within: 'Within limit', unconfigured: 'No limit configured' };
let generation = 0;
async function load() {
  const current = ++generation; error.value = ''; report.value = null;
  if (!props.agencyId) return;
  loading.value = true;
  try {
    const { data } = await api.get('/payroll/mileage-annual-summary', { params: { agencyId: props.agencyId, year: year.value }, skipGlobalLoading: true });
    if (current === generation) report.value = data;
  } catch (e) { if (current === generation) error.value = e.response?.data?.error?.message || 'Unable to load annual mileage.'; }
  finally { if (current === generation) loading.value = false; }
}
watch(() => props.agencyId, load, { immediate: true });
</script>
<style scoped>
.annual-mileage{border:1px solid var(--border-color,#ddd);border-radius:12px;padding:16px;margin-bottom:20px}form{display:flex;gap:12px;align-items:center;flex-wrap:wrap}input{width:100px}.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--border-color,#ddd)}
</style>
