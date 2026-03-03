<template>
  <section class="card">
    <div class="section-head">
      <div>
        <h2>Payroll</h2>
        <p>Snapshot and recent periods</p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="load">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="stats" v-if="summary">
      <article class="stat">
        <div class="label">Last paycheck</div>
        <div class="value">{{ formatMoney(summary?.lastPaycheck?.totalPay || 0) }}</div>
      </article>
      <article class="stat">
        <div class="label">PTO sick</div>
        <div class="value">{{ formatNumber(summary?.pto?.balances?.sickHours || 0) }} hrs</div>
      </article>
      <article class="stat">
        <div class="label">PTO training</div>
        <div class="value">{{ formatNumber(summary?.pto?.balances?.trainingHours || 0) }} hrs</div>
      </article>
    </div>

    <h3>Recent Periods</h3>
    <div v-if="loading" class="muted">Loading payroll…</div>
    <div v-else-if="periods.length === 0" class="muted">No payroll periods found.</div>
    <div v-else class="periods">
      <article v-for="p in periods" :key="p.payroll_period_id" class="period">
        <div class="line1">
          <strong>{{ p.period_start }} - {{ p.period_end }}</strong>
          <span class="amount">{{ formatMoney(p.total_pay || 0) }}</span>
        </div>
        <div class="line2">Status: {{ p.status || 'posted' }}</div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();

const loading = ref(false);
const error = ref('');
const summary = ref(null);
const periods = ref([]);

const formatMoney = (v) => Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const formatNumber = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const resolveAgencyId = async () => {
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  if (current?.id) return Number(current.id);
  const rows = await agencyStore.fetchUserAgencies();
  if (Array.isArray(rows) && rows[0]?.id) return Number(rows[0].id);
  return null;
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const agencyId = await resolveAgencyId();
    if (!agencyId) throw new Error('No organization context available.');

    const [summaryResp, periodsResp] = await Promise.all([
      api.get('/payroll/me/dashboard-summary', { params: { agencyId }, skipGlobalLoading: true }),
      api.get('/payroll/me/periods', { params: { agencyId }, skipGlobalLoading: true })
    ]);
    summary.value = summaryResp?.data || null;
    periods.value = Array.isArray(periodsResp?.data) ? periodsResp.data.slice(0, 8) : [];
  } catch (e) {
    summary.value = null;
    periods.value = [];
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load payroll data.';
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.section-head h2 {
  margin: 0;
  font-size: 18px;
}

.section-head p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.stats {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin: 12px 0;
}

.stat {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: var(--bg-alt);
}

.label {
  font-size: 12px;
  color: var(--text-secondary);
}

.value {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 700;
}

h3 {
  margin: 14px 0 10px;
  font-size: 16px;
}

.periods {
  display: grid;
  gap: 8px;
}

.period {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: var(--bg-alt);
}

.line1 {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.amount {
  font-weight: 700;
}

.line2 {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.muted {
  color: var(--text-secondary);
}

.error-box {
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 12px 0;
}
</style>
