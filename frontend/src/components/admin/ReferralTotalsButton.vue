<template>
  <section class="referral-summary" aria-label="Referral totals">
    <button ref="summaryButton" type="button" class="referral-button" :disabled="!report" @click="openHistory">
      <span class="referral-heading">Referrals this week <span aria-hidden="true">↗</span></span>
      <strong class="referral-total" aria-live="polite">{{ count(report?.currentWeek.total) }}</strong>
      <span class="referral-breakdown">
        <span>Paper <b>{{ count(report?.currentWeek.paper) }}</b></span>
        <span>Online <b>{{ count(report?.currentWeek.online) }}</b></span>
      </span>
      <span class="referral-hint">{{ loading && !report ? 'Loading referrals…' : 'View weekly & monthly totals →' }}</span>
    </button>
    <p v-if="error" class="referral-error" role="alert">
      {{ error }} <button type="button" :disabled="loading" @click="loadReport(selectedYear)">Retry</button>
    </p>

    <dialog ref="historyDialog" class="referral-dialog" aria-labelledby="referral-history-title" @click="closeOnBackdrop" @close="restoreFocus">
      <template v-if="report">
        <header class="referral-dialog-header">
          <div>
            <h2 id="referral-history-title">Referral totals</h2>
            <p>Paper and online referrals · Demo and test records excluded</p>
          </div>
          <button type="button" class="referral-close" aria-label="Close referral totals" @click="historyDialog.close()">×</button>
        </header>
        <div class="referral-highlights">
          <div><span>This week</span><strong>{{ count(report.currentWeek.total) }}</strong><small>{{ report.currentWeek.paper }} paper · {{ report.currentWeek.online }} online</small></div>
          <div><span>This month</span><strong>{{ count(report.currentMonth.total) }}</strong><small>{{ report.currentMonth.paper }} paper · {{ report.currentMonth.online }} online</small></div>
          <div><span>{{ report.selectedYear }} total</span><strong>{{ count(report.yearTotal.total) }}</strong><small>{{ report.yearTotal.paper }} paper · {{ report.yearTotal.online }} online</small></div>
        </div>
        <div class="referral-controls">
          <div class="referral-period-switch" role="group" aria-label="Group referrals by">
            <button type="button" :aria-pressed="groupBy === 'weekly'" @click="groupBy = 'weekly'">Weekly</button>
            <button type="button" :aria-pressed="groupBy === 'monthly'" @click="groupBy = 'monthly'">Monthly</button>
          </div>
          <label>Year
            <select v-model="selectedYear" :disabled="loading" @change="loadReport(selectedYear)">
              <option v-for="year in report.years" :key="year" :value="year">{{ year }}</option>
            </select>
          </label>
          <button type="button" :disabled="loading" @click="loadReport(selectedYear)">{{ loading ? 'Refreshing…' : 'Refresh' }}</button>
          <button type="button" :disabled="loading" @click="downloadCsv">Export CSV</button>
        </div>
        <p v-if="error" class="referral-error" role="alert">{{ error }}</p>
        <div class="referral-table-wrap" :aria-busy="loading">
          <table>
            <caption>{{ groupBy === 'weekly' ? 'Weekly' : 'Monthly' }} referrals · {{ report.selectedYear }}</caption>
            <thead><tr><th scope="col">{{ groupBy === 'weekly' ? 'Week (Mon–Sun)' : 'Month' }}</th><th scope="col">Paper</th><th scope="col">Online</th><th scope="col">Total</th></tr></thead>
            <tbody>
              <tr v-for="period in periods" :key="period.start" :class="{ 'referral-current': isCurrent(period) }">
                <th scope="row">{{ periodLabel(period) }} <small v-if="isCurrent(period)">so far</small></th>
                <td>{{ count(period.paper) }}</td><td>{{ count(period.online) }}</td><td class="referral-row-total">{{ count(period.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="report.yearTotal.total === 0" class="referral-note">No referrals received in {{ report.selectedYear }}.</p>
        <p class="referral-note">Each child counts once, including siblings on the same online form. Counts use the first received referral, not the date entered on the packet. Weeks run Monday–Sunday in Mountain Time and include the full week across year boundaries. Unfinished forms and uploads are excluded.</p>
        <p class="referral-updated">Updated {{ updatedLabel }}</p>
      </template>
    </dialog>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({ agencyId: { type: [Number, String], required: true } });
const report = ref(null);
const loading = ref(false);
const error = ref('');
const selectedYear = ref(null);
const groupBy = ref('weekly');
const historyDialog = ref(null);
const summaryButton = ref(null);
let requestId = 0;
const count = value => value == null ? '—' : Number(value).toLocaleString();
const periods = computed(() => report.value?.[groupBy.value] || []);
const dayLabel = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const periodLabel = period => groupBy.value === 'monthly'
  ? new Date(`${period.start}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  : `${dayLabel(period.start)} – ${dayLabel(period.end)}`;
const isCurrent = period => period.start <= report.value.today && period.end >= report.value.today;
const updatedLabel = computed(() => report.value ? new Date(report.value.refreshedAt).toLocaleString('en-US', {
  timeZone: report.value.timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
}) : '');

async function loadReport(year = null) {
  const id = ++requestId;
  if (!props.agencyId) { loading.value = false; return; }
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/dashboard/referral-totals', {
      params: { agencyId: props.agencyId, ...(year ? { year } : {}) },
      skipGlobalLoading: true
    });
    if (id !== requestId) return;
    report.value = data;
    selectedYear.value = data.selectedYear;
  } catch (err) {
    if (id !== requestId) return;
    error.value = err.response?.data?.error?.message || 'Unable to load referral totals.';
  } finally {
    if (id === requestId) loading.value = false;
  }
}
function openHistory() { historyDialog.value?.showModal(); }
function closeOnBackdrop(event) {
  if (event.target !== historyDialog.value) return;
  const bounds = historyDialog.value.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) historyDialog.value.close();
}
function restoreFocus() { summaryButton.value?.focus(); }
function downloadCsv() {
  const rows = [['Period start', 'Period end', 'Paper', 'Online', 'Total'],
    ...periods.value.map(p => [p.start, p.end, p.paper, p.online, p.total])];
  const url = URL.createObjectURL(new Blob([rows.map(row => row.join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `referrals-${props.agencyId}-${report.value.selectedYear}-${groupBy.value}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
watch(() => props.agencyId, () => {
  report.value = null;
  selectedYear.value = null;
  historyDialog.value?.close();
  loadReport();
}, { immediate: true });
onBeforeUnmount(() => { requestId++; });
</script>

<style scoped>
.referral-summary { margin-bottom: 14px; }
.referral-button { display: grid; grid-template-columns: auto 1fr; gap: 4px 22px; width: 100%; text-align: left; padding: 16px 20px; border: 1px solid var(--border, #cbded5); border-radius: 14px; background: var(--bg-card, #fff); color: var(--text-primary, #163c2c); cursor: pointer; font: inherit; }
.referral-button:hover:not(:disabled) { border-color: var(--ops-primary, #1f6b4a); box-shadow: 0 4px 16px #163c2c12; }
.referral-button:focus-visible, button:focus-visible, select:focus-visible { outline: 3px solid var(--ops-primary, #1f6b4a); outline-offset: 3px; }
.referral-heading { grid-column: 1 / -1; font-size: 14px; font-weight: 700; display: flex; justify-content: space-between; }
.referral-total { grid-row: span 2; font-size: 48px; line-height: 1.1; letter-spacing: -.04em; }
.referral-breakdown { display: flex; align-items: center; gap: 24px; font-size: 14px; }
.referral-breakdown b { margin-left: 6px; }
.referral-hint { color: var(--text-secondary, #64748b); font-size: 12px; }
.referral-dialog { width: min(840px, calc(100vw - 32px)); max-height: 88dvh; box-sizing: border-box; padding: 24px; border: 1px solid var(--border, #dce4df); border-radius: 18px; background: var(--bg-card, #fff); color: var(--text-primary, #172b22); }
.referral-dialog::backdrop { background: #0f172a80; }
.referral-dialog-header { display: flex; gap: 20px; justify-content: space-between; align-items: flex-start; }
h2 { margin: 0; font-size: 24px; }
.referral-dialog-header p, .referral-note, .referral-updated { font-size: 12px; color: var(--text-secondary, #64748b); line-height: 1.6; }
.referral-close { font-size: 24px; padding: 0 8px; }
.referral-highlights { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
.referral-highlights > div { display: flex; flex-direction: column; gap: 6px; border-radius: 12px; padding: 14px; background: var(--bg-secondary, #f1f6f3); }
.referral-highlights span { font-size: 12px; }
.referral-highlights strong { font-size: 32px; line-height: 1.2; }
.referral-highlights small { font-size: 11px; }
.referral-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.referral-controls label { margin-left: auto; display: flex; gap: 8px; align-items: center; font-size: 13px; }
.referral-controls button, .referral-controls select, .referral-close, .referral-error button { padding: 7px 10px; border: 1px solid var(--border, #d5dfd9); background: var(--bg-card, #fff); color: inherit; border-radius: 7px; cursor: pointer; font: inherit; font-size: 12px; }
.referral-period-switch { display: flex; gap: 4px; }
.referral-period-switch button[aria-pressed="true"] { background: var(--ops-primary, #1f6b4a); color: #fff; border-color: transparent; }
button:disabled { cursor: default; opacity: .65; }
.referral-table-wrap { max-height: 42dvh; overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
caption { text-align: left; padding: 0 0 10px; font-weight: 700; }
th, td { padding: 11px 12px; border-bottom: 1px solid var(--border, #e5ebe7); text-align: right; }
th:first-child { text-align: left; }
thead th { position: sticky; top: 0; background: var(--bg-secondary, #f1f6f3); font-size: 12px; }
tbody th { font-weight: 500; }
.referral-row-total { font-size: 16px; font-weight: 800; }
.referral-current { background: var(--bg-secondary, #f1f6f3); }
.referral-current small { margin-left: 6px; font-size: 10px; }
.referral-error { color: var(--danger, #b91c1c); font-size: 13px; }
.referral-updated { margin-bottom: 0; }
@media (max-width: 540px) { .referral-dialog { padding: 16px; } .referral-highlights { gap: 6px; } .referral-highlights > div { padding: 10px; } .referral-highlights small { font-size: 10px; } .referral-controls label { margin-left: 0; } th, td { padding: 10px 6px; } }
</style>
