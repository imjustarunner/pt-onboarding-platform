<template>
  <div>
    <div class="card" style="margin-bottom: 12px;">
      <h2 class="card-title">Platform Revenue</h2>
      <div class="hint">
        Aggregated from canonical Billing Report Import lines across agencies (patient and insurance outstanding tracked separately).
        Super admin only.
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="card" style="margin-bottom: 12px;">
      <div class="actions" style="justify-content: space-between;">
        <h3 class="card-title" style="margin: 0;">Current summary</h3>
        <button class="btn btn-secondary" type="button" @click="refreshSummary" :disabled="loadingSummary">
          {{ loadingSummary ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <div v-if="summary?.totals" class="field-row" style="grid-template-columns: repeat(5, 1fr); margin-top: 10px;">
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Gross / Managed</div>
          <div style="font-size: 18px;"><strong>{{ fmtMoney(summary.totals.gross_charges_total) }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Collected</div>
          <div style="font-size: 18px;"><strong>{{ fmtMoney(summary.totals.collected_total) }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Patient owed</div>
          <div style="font-size: 18px;"><strong>{{ fmtMoney(summary.totals.patient_outstanding_total) }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Insurance owed</div>
          <div style="font-size: 18px;"><strong>{{ fmtMoney(summary.totals.insurance_outstanding_total) }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Lines</div>
          <div style="font-size: 18px;"><strong>{{ summary.totals.line_count || 0 }}</strong></div>
        </div>
      </div>

      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Agency</th>
              <th>Period</th>
              <th class="right">Gross</th>
              <th class="right">Collected</th>
              <th class="right">Patient owed</th>
              <th class="right">Insurance owed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in (summary?.agencies || [])" :key="String(a.agency_id || a.agency_name)">
              <td><strong>{{ a.agency_name || '—' }}</strong></td>
              <td>{{ formatPeriod(a.period_start_min, a.period_end_max) }}</td>
              <td class="right">{{ fmtMoney(a.gross_charges_total) }}</td>
              <td class="right">{{ fmtMoney(a.collected_total) }}</td>
              <td class="right"><strong>{{ fmtMoney(a.patient_outstanding_total) }}</strong></td>
              <td class="right"><strong>{{ fmtMoney(a.insurance_outstanding_total) }}</strong></td>
            </tr>
            <tr v-if="!(summary?.agencies || []).length">
              <td colspan="6" class="muted">No billing report data yet. Import billing reports per agency.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const error = ref('');
const summary = ref(null);
const loadingSummary = ref(false);

const fmtMoney = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};

const formatPeriod = (a, b) => {
  const s = (a || '').toString().slice(0, 10);
  const e = (b || '').toString().slice(0, 10);
  if (!s && !e) return '—';
  if (s && e) return `${s} → ${e}`;
  return s || e;
};

const refreshSummary = async () => {
  loadingSummary.value = true;
  error.value = '';
  try {
    const resp = await api.get('/billing-reports/revenue-summary');
    summary.value = resp.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load revenue summary';
    summary.value = null;
  } finally {
    loadingSummary.value = false;
  }
};

onMounted(() => refreshSummary());
</script>
