<template>
  <section v-if="canManage" class="provider-billing">
    <header class="billing-header">
      <div><h2>{{ providerId ? 'Billing' : 'Agency self-pay rates' }}</h2><p>Set service rates independently of insurance billing. New bookings keep a copy of their rate.</p></div>
      <button class="btn btn-primary" :disabled="loading || saving || !loaded" @click="save">{{ saving ? 'Saving…' : 'Save Changes' }}</button>
    </header>
    <label v-if="agencies.length" class="agency-select">Agency
      <select v-model="selectedAgency" :disabled="saving"><option v-for="agency in agencies" :key="agency.id" :value="Number(agency.id)">{{ agency.name }}</option></select>
    </label>
    <nav v-if="providerId" class="billing-tabs" aria-label="Rate settings">
      <button :class="{ active: scope === 'provider' }" :disabled="saving" @click="scope = 'provider'">Provider self-pay rates</button>
      <button :class="{ active: scope === 'agency' }" :disabled="saving" @click="scope = 'agency'">Agency default rates</button>
    </nav>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="success" role="status" class="success">{{ success }}</p>
    <p v-if="loading">Loading rates…</p>
    <template v-else-if="loaded">
      <div v-if="scope === 'agency'" class="billing-card">
        <label><input v-model="selfPayOnly" type="checkbox" :disabled="saving" /> This agency accepts self-pay and packages only</label>
        <p>Applies to new appointments. Clinical notes remain available; insurance claims are blocked for these appointments. Existing appointments keep their billing arrangement.</p>
      </div>
      <div class="billing-card">
        <h3>Self-Pay Rates <span class="currency">USD</span></h3>
        <p v-if="scope === 'provider'">Only this provider’s assigned practice categories and services appear. Blank overrides use the agency rate; $0 is an explicit free service.</p>
        <p v-else>Agency rates apply to all providers unless they have a service override. A blank rate uses the existing service catalog price.</p>
        <div class="table-scroll" v-if="rows.length"><table>
          <thead><tr><th>Service</th><th>{{ scope === 'provider' ? 'Agency default' : 'Catalog price' }}</th><th>{{ scope === 'provider' ? 'Provider rate' : 'Agency rate' }}</th><th>Rate basis</th><th v-if="scope === 'provider'">Use default</th></tr></thead>
          <tbody><tr v-for="row in rows" :key="row.serviceId">
            <td><strong>{{ row.name }}</strong><small>{{ row.durationMinutes }} min · {{ row.businessType.replaceAll('_', ' ') }}</small></td>
            <td>{{ money(scope === 'provider' ? row.agencyRate?.rateCents ?? row.catalogRateCents : row.catalogRateCents) }}<small>{{ scope === 'provider' && row.agencyRate?.rateUnit === 'hour' ? 'per hour' : 'per session' }}</small></td>
            <td><input v-model="row.dollars" :aria-label="`${row.name} rate in USD`" type="number" min="0" max="1000000" step="0.01" placeholder="Use default" :disabled="saving || (scope === 'provider' && row.useDefault)" /></td>
            <td><select v-model="row.unit" :aria-label="`${row.name} rate basis`" :disabled="saving || (scope === 'provider' && row.useDefault)"><option value="session">Per session</option><option value="hour">Per hour</option></select></td>
            <td v-if="scope === 'provider'"><input v-model="row.useDefault" type="checkbox" :aria-label="`Use agency default for ${row.name}`" :disabled="saving" /></td>
          </tr></tbody>
        </table></div>
        <p v-else>No eligible services. Add services in agency Tenant service types, then assign this provider’s practice categories on their Account tab.</p>
        <p class="billing-help">Hourly rates are prorated to the booked duration and rounded to the nearest cent. Rates are for the whole appointment; package bookings use their purchased credits.</p>
      </div>
      <div class="billing-card"><h3>Packages</h3><p>Purchased packages retain their price and credit balance. Service overrides do not change a purchased package.</p>
        <router-link v-if="organizationSlug" :to="`/${organizationSlug}/admin/package-catalog`">Manage package catalog →</router-link>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
const props = defineProps({ providerId: { type: [Number, String], default: 0 }, agencyId: { type: [Number, String], default: 0 }, agencies: { type: Array, default: () => [] } });
const auth = useAuthStore();
const route = useRoute();
const organizationSlug = computed(() => route.params.organizationSlug);
const canManage = computed(() => ['admin', 'super_admin'].includes(auth.user?.role));
const selectedAgency = ref(Number(props.agencyId || props.agencies[0]?.id || 0));
const scope = ref(props.providerId ? 'provider' : 'agency');
const rows = ref([]), selfPayOnly = ref(false), loading = ref(false), saving = ref(false), loaded = ref(false), error = ref(''), success = ref('');
const endpoint = computed(() => `/tenant-booking/agencies/${selectedAgency.value}${scope.value === 'provider' ? `/providers/${props.providerId}` : ''}/self-pay-rates`);
const money = cents => cents == null ? 'Not set' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
let requestVersion = 0;
function apply(data) {
  selfPayOnly.value = !!data.selfPayOnly;
  rows.value = (data.services || []).map(row => {
    const rate = scope.value === 'provider' ? row.providerRate : row.agencyRate;
    return { ...row, dollars: rate ? (rate.rateCents / 100).toFixed(2) : '', unit: rate?.rateUnit || row.agencyRate?.rateUnit || 'session', useDefault: !rate };
  });
  loaded.value = true;
}
async function load() {
  const version = ++requestVersion;
  loaded.value = false; rows.value = []; error.value = ''; success.value = '';
  if (!canManage.value || !selectedAgency.value) return;
  loading.value = true;
  try { const { data } = await api.get(endpoint.value); if (version === requestVersion) apply(data); }
  catch (e) { if (version === requestVersion) error.value = e.response?.data?.error?.message || 'Unable to load billing rates.'; }
  finally { if (version === requestVersion) loading.value = false; }
}
async function save() {
  if (!canManage.value || !loaded.value || saving.value) return;
  error.value = ''; success.value = '';
  try {
    const rates = rows.value.map(row => {
      const blank = String(row.dollars).trim() === '' || (scope.value === 'provider' && row.useDefault);
      if (!blank && !/^\d+(\.\d{1,2})?$/.test(String(row.dollars))) throw new Error('Enter a nonnegative dollar amount with at most two decimal places.');
      return { serviceId: row.serviceId, rateCents: blank ? null : Math.round(Number(row.dollars) * 100), rateUnit: row.unit };
    });
    saving.value = true;
    const { data } = await api.put(endpoint.value, { rates, ...(scope.value === 'agency' ? { selfPayOnly: selfPayOnly.value } : {}) });
    apply(data); success.value = 'Billing rates saved. New bookings will use these rates.';
  } catch (e) { error.value = e.response?.data?.error?.message || e.message || 'Unable to save billing rates.'; }
  finally { saving.value = false; }
}
watch(() => props.agencyId, value => { if (Number(value)) selectedAgency.value = Number(value); });
watch([endpoint, canManage], load, { immediate: true });
</script>

<style scoped>
.provider-billing { background: #f5f8fb; padding: 24px; border-radius: 14px; }
.billing-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
h2, h3 { margin: 0 0 8px; } p, small { color: var(--text-secondary, #64748b); } p { line-height: 1.5; }
.billing-card { background: var(--bg-primary, white); border: 1px solid #dfe7ee; border-radius: 12px; padding: 22px; margin-top: 18px; }
.billing-tabs { display: flex; gap: 20px; margin-top: 20px; border-bottom: 1px solid #dfe7ee; }
.billing-tabs button { background: none; border: 0; padding: 14px 4px; font-weight: 600; cursor: pointer; }
.billing-tabs .active { border-bottom: 3px solid #139b73; color: #08785a; }
.table-scroll { overflow-x: auto; } table { width: 100%; border-collapse: collapse; text-align: left; } th { background: #f3f6fa; } th, td { padding: 14px 12px; border-bottom: 1px solid #e6edf3; } small { display: block; margin-top: 5px; }
input[type=number] { width: 130px; } input, select { padding: 9px; border: 1px solid #cdd8e3; border-radius: 6px; } input[type=checkbox] { accent-color: #139b73; width: 18px; height: 18px; }
.currency { font-size: 12px; color: #64748b; margin-left: 8px; } .success { color: #08785a; } .error { color: #b91c1c; } .billing-help { font-size: 13px; } .agency-select { display: flex; gap: 12px; align-items: center; }
@media(max-width: 700px) { .provider-billing { padding: 12px; } .billing-header { align-items: flex-start; flex-direction: column; } }
</style>
