<template>
  <div class="my-comp">
    <div class="header">
      <h1>My Compensation</h1>
      <p class="subtitle">Your configured compensation for the selected organization (read-only).</p>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="loading" class="muted">Loading compensation…</div>

    <div v-else class="card">
      <div class="row">
        <strong>Compensation method:</strong>
        <span>{{ compensationMethod }}</span>
      </div>

      <div v-if="compensationMethod === 'Multi-rate card (hourly)'" class="grid">
        <div class="field"><div class="label">Direct rate</div><div class="value">{{ fmtMoney(rateCard.direct_rate) }}/hr</div></div>
        <div class="field"><div class="label">Indirect rate</div><div class="value">{{ fmtMoney(rateCard.indirect_rate) }}/hr</div></div>
        <div class="field"><div class="label">{{ otherRateTitles.title1 }}</div><div class="value">{{ fmtMoney(rateCard.other_rate_1) }}/hr</div></div>
        <div class="field"><div class="label">{{ otherRateTitles.title2 }}</div><div class="value">{{ fmtMoney(rateCard.other_rate_2) }}/hr</div></div>
        <div class="field"><div class="label">{{ otherRateTitles.title3 }}</div><div class="value">{{ fmtMoney(rateCard.other_rate_3) }}/hr</div></div>
      </div>

      <div class="sheet-title">Rate sheet</div>
      <div class="muted" style="margin-top: 4px;">Per-code rates only. Category/unit math is managed by payroll admins in the agency’s Service Code Rules.</div>
      <div style="margin-top: 10px;">
        <div v-if="!visibleRateRows.length" class="muted">No rates configured yet.</div>
        <div v-else class="rate-grid">
          <div v-for="r in visibleRateRows" :key="r.serviceCode" class="rate-item">
            <div class="rate-code">{{ r.serviceCode }}</div>
            <div class="rate-value">{{ fmtMoney(r.rateAmount) }}</div>
          </div>
        </div>
      </div>

      <div class="hint">
        If anything looks wrong, payroll admins can update your rates for a specific pay period.
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const loading = ref(false);
const error = ref('');
const data = ref(null);
const otherRateTitles = ref({ title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' });

const rateCard = computed(() => data.value?.rateCard || null);
const perCodeRates = computed(() => data.value?.perCodeRates || []);
const serviceCodeRules = computed(() => data.value?.serviceCodeRules || []);

const hasRateCard = computed(() => {
  const rc = rateCard.value;
  if (!rc) return false;
  const nums = [
    Number(rc.direct_rate || 0),
    Number(rc.indirect_rate || 0),
    Number(rc.other_rate_1 || 0),
    Number(rc.other_rate_2 || 0),
    Number(rc.other_rate_3 || 0)
  ];
  return nums.some((n) => n > 0.0001);
});

const compensationMethod = computed(() => (hasRateCard.value ? 'Multi-rate card (hourly)' : 'Per service-code rates'));

const fmtMoney = (v) => Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

const fullRateRows = computed(() => {
  const codes = new Map();
  for (const r of serviceCodeRules.value || []) {
    const code = String(r.service_code || '').trim();
    if (!code) continue;
    codes.set(code, { serviceCode: code });
  }
  for (const r of perCodeRates.value || []) {
    const code = String(r.service_code || '').trim();
    if (!code) continue;
    if (!codes.has(code)) codes.set(code, { serviceCode: code });
  }
  const out = Array.from(codes.values()).sort((a, b) => a.serviceCode.localeCompare(b.serviceCode));
  const rateByCode = new Map((perCodeRates.value || []).map((r) => [String(r.service_code || '').trim(), r]));
  return out.map((x) => {
    const r = rateByCode.get(x.serviceCode) || null;
    const rule = (serviceCodeRules.value || []).find((rr) => String(rr.service_code || '').trim() === x.serviceCode) || null;
    const visible = rule ? (rule.show_in_rate_sheet === undefined || rule.show_in_rate_sheet === null ? true : !!rule.show_in_rate_sheet) : true;
    return {
      serviceCode: x.serviceCode,
      rateAmount: r ? Number(r.rate_amount) : null,
      visible
    };
  });
});

const visibleRateRows = computed(() => (fullRateRows.value || []).filter((r) => r.rateAmount !== null && r.visible));

const load = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/payroll/me/compensation', { params: { agencyId: agencyId.value } });
    data.value = resp.data || null;
    try {
      const tr = await api.get('/payroll/other-rate-titles', { params: { agencyId: agencyId.value, userId: authStore.user?.id || null } });
      otherRateTitles.value = {
        title1: tr.data?.title1 || 'Other 1',
        title2: tr.data?.title2 || 'Other 2',
        title3: tr.data?.title3 || 'Other 3'
      };
    } catch {
      otherRateTitles.value = { title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' };
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load compensation';
  } finally {
    loading.value = false;
  }
};

watch(agencyId, async () => {
  await load();
});

onMounted(load);
</script>

<style scoped>
.subtitle { margin: 6px 0 0; color: var(--text-secondary); }
.card { margin-top: 10px; background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
.row { margin: 0 0 10px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
.field { border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
.label { font-size: 12px; color: var(--text-secondary); }
.value { font-weight: 600; margin-top: 4px; }
.sheet-title { margin-top: 14px; font-weight: 700; }
.table-wrap { overflow: auto; margin-top: 10px; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 10px; border-bottom: 1px solid var(--border); }
.right { text-align: right; }
.muted { color: var(--text-secondary); }
.hint { margin-top: 10px; font-size: 12px; color: var(--text-secondary); }
.error-box { background: #ffecec; border: 1px solid #ffb5b5; padding: 10px 12px; border-radius: 10px; margin: 10px 0; }
.rate-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-top: 10px; }
.rate-item { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; background: #fff; }
.rate-code { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rate-value { font-variant-numeric: tabular-nums; text-align: right; }
</style>

