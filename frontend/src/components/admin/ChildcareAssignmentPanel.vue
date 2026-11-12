<template>
  <section v-if="context?.enabled && context.canManagePermissions" class="childcare-assignment">
    <h3>Childcare service assignment</h3>
    <p>Approve this employee’s childcare work separately from their account role and contract clauses. Account readiness and approved pay terms still apply.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <form @submit.prevent="save">
      <label><input v-model="enabled" type="checkbox" />Assigned to childcare in this organization</label>
      <label><input v-model="selfSchedule" type="checkbox" :disabled="!enabled" />Can schedule their own childcare shifts</label>
      <label><input v-model="manageSchedule" type="checkbox" :disabled="!enabled" />Can schedule childcare and assign eligible co-caregivers</label>
      <button type="submit" :disabled="busy || loading">{{ busy ? 'Saving…' : 'Save childcare assignment' }}</button>
    </form>
    <section v-if="rates"><h4>Effective childcare pay</h4><p>Category {{ rates.category || 'not configured' }} · Childcare level {{ rates.childcareLevel || 'not configured' }}<span v-if="rates.effectiveOn"> · Effective {{ rates.effectiveOn }}</span></p><p v-if="rates.reviewRequired">{{ (rates.reasons || []).join('; ') }}</p><dl><template v-for="band in CHILDCARE_BANDS" :key="band"><dt>{{ band }} {{ band === 1 ? 'child' : 'children' }} per caregiver</dt><dd>{{ childcareMoney(rates.ratesByBand?.[band]) }}/hour</dd></template></dl><p>Change individual rates through this person’s approved agreement or amendment.</p></section>
  </section>
  <p v-else-if="error && context?.canManagePermissions" role="alert">{{ error }}</p>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import { CHILDCARE_BANDS, childcareMoney } from '../../utils/childcarePresentation';
const props = defineProps({ userId: { type: Number, required: true }, agencyId: { type: Number, required: true } });
const context = ref(null), enabled = ref(false), selfSchedule = ref(true), manageSchedule = ref(false), rates = ref(null), loading = ref(false), busy = ref(false), error = ref(''), notice = ref('');
let generation = 0;
const data = response => response.data?.data || response.data;
async function load() {
  const token = ++generation; context.value = null; rates.value = null; error.value = ''; notice.value = '';
  if (!props.agencyId || !props.userId) return;
  loading.value = true;
  try {
    const c = data(await api.get('/childcare/context', { params: { agencyId: props.agencyId } })); if (token !== generation) return; context.value = c;
    if (!c.enabled || !c.canManagePermissions) return;
    const people = data(await api.get('/childcare/staff', { params: { agencyId: props.agencyId } })); if (token !== generation) return;
    const grant = people.staff?.find(p => Number(p.userId) === props.userId)?.grant;
    enabled.value = !!grant?.enabled; selfSchedule.value = grant?.selfSchedule !== false; manageSchedule.value = !!grant?.manageSchedule;
    const r = data(await api.get(`/childcare/staff/${props.userId}/rates`, { params: { agencyId: props.agencyId } })); if (token === generation) rates.value = r;
  } catch (e) { if (token === generation) error.value = e.response?.data?.error?.message || 'Childcare assignment could not be loaded. Retry from this employee’s account page.'; }
  finally { if (token === generation) loading.value = false; }
}
async function save() {
  if (busy.value) return;
  const token = generation; busy.value = true; error.value = ''; notice.value = '';
  try { await api.put(`/childcare/staff/${props.userId}/grant`, { agencyId: props.agencyId, enabled: enabled.value, selfSchedule: selfSchedule.value, manageSchedule: manageSchedule.value }); if (token === generation) notice.value = 'Childcare assignment saved.'; }
  catch (e) { if (token === generation) error.value = e.response?.data?.error?.message || 'The assignment was not saved.'; }
  finally { busy.value = false; }
}
watch(() => [props.agencyId, props.userId], load, { immediate: true });
</script>
<style scoped>
.childcare-assignment{padding:20px;border:1px solid #b7cfc3;border-radius:10px;margin:18px 0}.childcare-assignment p{line-height:1.5}.childcare-assignment label{display:flex;align-items:center;gap:8px;margin:12px 0}.childcare-assignment input[type=checkbox]{width:auto}.childcare-assignment button{font:inherit;padding:10px 14px;border-radius:7px;border:1px solid #739b87;cursor:pointer;background:var(--bg-card,#fff);color:inherit}.childcare-assignment dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 20px}.childcare-assignment dd{margin:0}.childcare-assignment [role=alert]{color:#9a2525}
</style>
