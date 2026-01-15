<template>
  <div class="tab-panel">
    <h2>Payroll</h2>
    <p class="section-description">Pay-period totals and service-code breakdown (admin/support only).</p>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="loading" class="loading">Loading payroll...</div>

    <div v-else>
      <div class="field">
        <label>Agency</label>
        <select v-model="selectedAgencyId">
          <option v-for="a in userAgencies" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Pay Period</th>
              <th>Status</th>
              <th class="right">Units</th>
              <th class="right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in periods" :key="p.id" class="clickable" @click="toggleOpen(p)">
              <td>
                <div class="title">{{ p.label }}</div>
                <div class="meta">{{ p.period_start }} → {{ p.period_end }}</div>
              </td>
              <td>{{ p.status }}</td>
              <td class="right">{{ fmtNum(p.total_units) }}</td>
              <td class="right">{{ fmtMoney(p.total_amount) }}</td>
            </tr>
            <tr v-if="!periods.length">
              <td colspan="4" class="muted">No payroll records yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="openPeriod" class="breakdown-card">
        <h3 class="breakdown-title">Breakdown: {{ openPeriod.label }}</h3>
        <div class="breakdown-grid" v-if="openPeriod.breakdown && Object.keys(openPeriod.breakdown).length">
          <div v-for="(v, code) in openPeriod.breakdown" :key="code" class="breakdown-row">
            <div class="code">{{ code }}</div>
            <div class="muted">{{ fmtNum(v.units) }} units</div>
            <div class="muted">@ {{ fmtMoney(v.rateAmount) }}</div>
            <div class="right">{{ fmtMoney(v.amount) }}</div>
          </div>
        </div>
        <div v-else class="muted">No breakdown available.</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  userId: { type: Number, required: true },
  userAgencies: { type: Array, default: () => [] }
});

const selectedAgencyId = ref(null);
const loading = ref(false);
const error = ref('');
const periods = ref([]);
const openPeriodId = ref(null);

const openPeriod = computed(() => periods.value.find((p) => p.id === openPeriodId.value) || null);

const fmtMoney = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};
const fmtNum = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const load = async () => {
  if (!selectedAgencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    openPeriodId.value = null;
    const resp = await api.get(`/payroll/users/${props.userId}/periods`, {
      params: { agencyId: selectedAgencyId.value }
    });
    periods.value = (resp.data || []).map((p) => {
      if (typeof p.breakdown === 'string') {
        try { p.breakdown = JSON.parse(p.breakdown); } catch { /* ignore */ }
      }
      return p;
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load payroll';
  } finally {
    loading.value = false;
  }
};

const toggleOpen = (p) => {
  openPeriodId.value = openPeriodId.value === p.id ? null : p.id;
};

watch(
  () => props.userAgencies,
  (agencies) => {
    if (!selectedAgencyId.value && Array.isArray(agencies) && agencies.length) {
      selectedAgencyId.value = agencies[0].id;
    }
  },
  { immediate: true }
);

watch(selectedAgencyId, load);

onMounted(load);
</script>

<style scoped>
.section-description {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
}
.field {
  margin-bottom: 12px;
}
label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
}
.table-wrap {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.right {
  text-align: right;
}
.title {
  font-weight: 600;
}
.meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.muted {
  color: var(--text-secondary);
}
.clickable {
  cursor: pointer;
}
.breakdown-card {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
}
.breakdown-title {
  margin: 0 0 10px 0;
}
.breakdown-grid {
  display: grid;
  gap: 6px;
}
.breakdown-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.code {
  font-weight: 600;
}
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
}
.loading {
  color: var(--text-secondary);
}
</style>

