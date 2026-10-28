<template>
  <section class="etpr">
    <p v-if="loading">Loading event travel report…</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <template v-if="record">
      <EventTravelReportSummary :report="record.report">
        <template #segment="{ segment }">
          <div class="etpr-decision">
            <small>{{ segment.reason }}<span v-if="segment.distanceSource === 'employee'"> Reported mileage: {{ segment.distanceNote }}</span></small>
            <small v-if="segment.from">{{ segment.from.address || 'Origin address missing' }} → {{ segment.to.address || 'Destination address missing' }}</small>
            <label><input v-model="decisions[segment.key].timeEligible" type="checkbox" /> Pay {{ segment.minutes }} minutes at Support Activity rate</label>
            <template v-if="segment.kind === 'travel' && record.report.form.vehicle === 'personal' && !record.report.form.existingMileageClaimId">
              <label><input v-model="decisions[segment.key].mileageEligible" type="checkbox" /> Reimburse personal vehicle miles</label>
              <label v-if="decisions[segment.key].mileageEligible">Verified miles <input v-model="decisions[segment.key].miles" type="number" min="0" max="2000" step="0.01" /></label>
            </template>
          </div>
        </template>
      </EventTravelReportSummary>
      <label class="etpr-note">Review note<textarea v-model.trim="note" rows="2" maxlength="2000" placeholder="Confirm the route and explain any changes or exceptions." /></label>
      <p v-if="record.report.form.existingMileageClaimId">Save this review, then approve the linked travel-time entry. The existing mileage reimbursement remains unchanged.</p>
      <p v-else>Save this review, then approve the linked time and mileage entries into payroll. Event mileage uses the organization’s flat mileage rate, independently of school benefit tiers.</p>
      <button type="button" class="btn btn-primary" :disabled="saving || !note" @click="save">{{ saving ? 'Saving…' : 'Save travel review' }}</button>
      <p v-if="success" role="status">Review saved. The linked time and mileage entries have been updated.</p>
    </template>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import EventTravelReportSummary from '../events/EventTravelReportSummary.vue';
const props = defineProps({ reportId: { type: [Number, String], required: true } });
const emit = defineEmits(['reviewed']);
const record = ref(null), decisions = ref({}), note = ref(''), loading = ref(false), saving = ref(false), error = ref(''), success = ref(false);
function assign(data) { record.value = data; decisions.value = Object.fromEntries(data.report.segments.map(s => [s.key, { key: s.key, timeEligible: !!s.timeEligible, mileageEligible: !!s.mileageEligible, miles: s.miles }])); note.value = data.report.reviewNote || ''; }
watch(() => props.reportId, async id => { loading.value = true; error.value = ''; record.value = null; try { assign((await api.get(`/payroll/event-travel-reports/${id}`)).data); } catch (e) { error.value = e.response?.data?.error?.message || 'Unable to load report'; } finally { loading.value = false; } }, { immediate: true });
async function save() {
  saving.value = true; error.value = ''; success.value = false;
  try { assign((await api.put(`/payroll/event-travel-reports/${props.reportId}/review`, { revision: record.value.revision, segments: Object.values(decisions.value), note: note.value })).data); success.value = true; emit('reviewed'); }
  catch (e) { error.value = e.response?.data?.error?.message || 'Unable to save review'; }
  finally { saving.value = false; }
}
</script>
<style scoped>
.etpr { padding: 14px; background: var(--bg-primary, white); }.etpr-decision { display: grid; gap: 8px; margin-top: 8px; padding: 12px; background: var(--bg-secondary, #f8fafc); border-radius: 8px; }.etpr-decision label { display: flex; align-items: center; gap: 8px; }.etpr-decision input[type=number] { width: 100px; padding: 6px; }.etpr-note { display: grid; gap: 8px; margin-top: 16px; }textarea { padding: 8px; font: inherit; }.error { color: #991b1b; }small { color: var(--text-secondary, #475569); }p { line-height: 1.5; }
</style>
