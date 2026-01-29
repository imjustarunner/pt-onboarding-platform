<template>
  <div>
    <div class="card" style="margin-bottom: 12px;">
      <h2 class="card-title">Executive Report</h2>
      <div class="hint">Snapshot + trends for meetings. Super admin only.</div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="card" style="margin-bottom: 12px;">
      <div class="actions" style="justify-content: space-between;">
        <h3 class="card-title" style="margin: 0;">Snapshot (latest)</h3>
        <button class="btn btn-secondary" type="button" @click="refreshAll" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <div class="grid">
        <div class="metric">
          <div class="label">Agencies managed</div>
          <div class="value">{{ snapshot?.agencies_managed ?? '—' }}</div>
        </div>
        <div class="metric">
          <div class="label">Providers (active / total)</div>
          <div class="value">{{ fmtInt(snapshot?.providers_active) }} / {{ fmtInt(snapshot?.providers_total) }}</div>
        </div>
        <div class="metric">
          <div class="label">Revenue managed (latest upload)</div>
          <div class="value">{{ fmtMoney(snapshot?.revenue_latest_totals?.managed_total) }}</div>
        </div>
        <div class="metric">
          <div class="label">Collected (latest upload)</div>
          <div class="value">{{ fmtMoney(snapshot?.revenue_latest_totals?.collected_total) }}</div>
        </div>
        <div class="metric">
          <div class="label">Outstanding A/R (latest upload)</div>
          <div class="value">{{ fmtMoney(snapshot?.revenue_latest_totals?.outstanding_total) }}</div>
        </div>
        <div class="metric">
          <div class="label">Receivables A/R (ingested)</div>
          <div class="value">{{ fmtMoney(snapshot?.receivables_ar_totals?.outstanding_total) }}</div>
          <div class="sub">
            14–59: {{ fmtMoney(snapshot?.receivables_ar_totals?.outstanding_14_59_total) }} · 60+: {{ fmtMoney(snapshot?.receivables_ar_totals?.outstanding_60_plus_total) }}
          </div>
        </div>
      </div>

      <div class="hint muted" style="margin-top: 8px;">
        Latest revenue upload: <strong>#{{ snapshot?.revenue_latest_upload?.id || '—' }}</strong>
        · Date: <strong>{{ (snapshot?.revenue_latest_upload?.report_date || '').slice(0, 10) || '—' }}</strong>
        · Label: <strong>{{ snapshot?.revenue_latest_upload?.report_label || '—' }}</strong>
      </div>
    </div>

    <div class="card">
      <div class="actions" style="justify-content: space-between;">
        <h3 class="card-title" style="margin: 0;">Trends (revenue uploads)</h3>
        <div class="actions" style="margin: 0;">
          <label class="hint muted" style="margin: 0 8px 0 0;">Points</label>
          <select v-model="seriesLimit" @change="refreshTimeseries">
            <option :value="12">12</option>
            <option :value="24">24</option>
            <option :value="30">30</option>
            <option :value="60">60</option>
          </select>
        </div>
      </div>

      <div class="chart-wrap">
        <div class="chart-title">Managed revenue</div>
        <svg class="spark" viewBox="0 0 600 120" preserveAspectRatio="none">
          <path :d="sparkPath(series, 'managed_total')" class="line" />
        </svg>
      </div>
      <div class="chart-wrap">
        <div class="chart-title">Outstanding A/R</div>
        <svg class="spark" viewBox="0 0 600 120" preserveAspectRatio="none">
          <path :d="sparkPath(series, 'outstanding_total')" class="line line-warn" />
        </svg>
      </div>

      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Label</th>
              <th class="right">Managed</th>
              <th class="right">Collected</th>
              <th class="right">Outstanding</th>
              <th class="right">Gross</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in series" :key="p.upload_id">
              <td>{{ (p.report_date || '').slice(0, 10) || '—' }}</td>
              <td>{{ p.report_label || '—' }}</td>
              <td class="right">{{ fmtMoney(p.managed_total) }}</td>
              <td class="right">{{ fmtMoney(p.collected_total) }}</td>
              <td class="right"><strong>{{ fmtMoney(p.outstanding_total) }}</strong></td>
              <td class="right">{{ fmtMoney(p.gross_charges_total) }}</td>
            </tr>
            <tr v-if="!series.length">
              <td colspan="6" class="muted">No uploads yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';

const error = ref('');
const loading = ref(false);

const snapshot = ref(null);
const series = ref([]);

const seriesLimit = ref(24);

const fmtMoney = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};
const fmtInt = (n) => {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toLocaleString() : '0';
};

const sparkPath = (pts, key) => {
  const list = Array.isArray(pts) ? pts : [];
  const values = list.map((p) => Number(p?.[key] || 0));
  const max = Math.max(1, ...values);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const w = 600;
  const h = 120;
  if (list.length <= 1) return '';
  const dx = w / (list.length - 1);
  let d = '';
  for (let i = 0; i < list.length; i += 1) {
    const v = values[i];
    const x = i * dx;
    const y = h - ((v - min) / span) * (h - 8) - 4;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return d.trim();
};

const refreshSnapshot = async () => {
  const resp = await api.get('/executive-report/snapshot');
  snapshot.value = resp.data || null;
};

const refreshTimeseries = async () => {
  const resp = await api.get('/executive-report/timeseries/revenue', { params: { limit: seriesLimit.value } });
  series.value = resp.data?.series || [];
};

const refreshAll = async () => {
  loading.value = true;
  error.value = '';
  try {
    await Promise.all([refreshSnapshot(), refreshTimeseries()]);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load executive report';
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  await refreshAll();
});
</script>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}
.metric {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  background: white;
}
.label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.value {
  font-size: 18px;
  font-weight: 900;
  margin-top: 6px;
}
.sub {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}
.chart-wrap {
  margin-top: 12px;
}
.chart-title {
  font-weight: 900;
  margin-bottom: 6px;
}
.spark {
  width: 100%;
  height: 120px;
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.08), rgba(255, 255, 255, 0));
  border: 1px solid var(--border);
  border-radius: 12px;
}
.line {
  fill: none;
  stroke: rgba(37, 99, 235, 0.9);
  stroke-width: 2.5;
}
.line-warn {
  stroke: rgba(245, 158, 11, 0.95);
}
@media (max-width: 980px) {
  .grid { grid-template-columns: 1fr; }
}
</style>

