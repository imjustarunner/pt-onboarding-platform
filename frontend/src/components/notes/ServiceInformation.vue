<template>
  <details class="service-information" @toggle="onToggle">
    <summary>Service information <span v-if="code">· {{ code }}</span></summary>
    <div class="service-information__body" :aria-busy="loading">
      <p v-if="loading" role="status">Loading service information…</p>
      <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></p>
      <template v-else-if="reference">
        <h4>{{ reference.title }}</h4>
        <p v-if="reference.status !== 'available'">{{ reference.note || 'This service is not described in the supplied manual.' }}</p>
        <dl>
          <template v-if="reference.unitLabel"><dt>Manual unit</dt><dd>{{ reference.unitLabel }}<template v-if="reference.minUnitMinutes"> · Minimum {{ reference.minUnitMinutes }} minutes</template><template v-if="reference.maxUnitMinutes"> · Maximum {{ reference.maxUnitMinutes }} minutes per unit</template></dd></template>
          <template v-for="field in fields" :key="field.key">
            <template v-if="reference[field.key]"><dt>{{ field.label }}</dt><dd>{{ reference[field.key] }}</dd></template>
          </template>
        </dl>
        <p v-if="reference.crisisReview" class="service-information__review">{{ reference.crisisReview.message }}</p>
        <details v-if="reference.manualText"><summary>Full supplied service details</summary><p class="service-information__manual">{{ reference.manualText }}</p></details>
        <p class="service-information__source">{{ reference.source?.title }} · Effective {{ reference.source?.effectiveDate }}<template v-if="reference.source?.pages?.length"> · Page {{ reference.source.pages.join(', ') }}</template></p>
        <p class="service-information__notice">{{ reference.reviewNotice }}</p>
      </template>
      <p v-else>Select a service to see its documentation requirements.</p>
    </div>
  </details>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
const props = defineProps({ serviceCode: { type: String, default: '' }, agencyId: { type: [Number, String], default: null }, serviceInfo: { type: Object, default: null }, apiClient: { type: Object, default: null }, referenceBasePath: { type: String, default: '/medical-billing/service-reference' } });
const code = computed(() => String(props.serviceCode || props.serviceInfo?.code || '').trim().toUpperCase());
const fetched = ref(null), loading = ref(false), error = ref(''), expanded = ref(false);
const reference = computed(() => props.serviceInfo?.code === code.value ? props.serviceInfo : fetched.value);
let requestId = 0;
const fields = [
  { key: 'serviceDescription', label: 'Service and examples' }, { key: 'documentation', label: 'Documentation and limitations' },
  { key: 'ageGroups', label: 'Ages' }, { key: 'providerQualifications', label: 'Listed provider qualifications' },
  { key: 'placesOfService', label: 'Listed places of service' }
];
async function load() {
  if (loading.value || reference.value || !code.value || !Number(props.agencyId)) return;
  const id = ++requestId;
  loading.value = true; error.value = '';
  try {
    const client = props.apiClient || (await import('../../services/api')).default;
    const { data } = await client.get(`${props.referenceBasePath}/${encodeURIComponent(code.value)}`, { params: { agencyId: props.agencyId } });
    if (id === requestId) fetched.value = data.serviceInfo;
  } catch {
    if (id === requestId) error.value = 'Service information could not be verified. Your existing agency rules still apply.';
  } finally { if (id === requestId) loading.value = false; }
}
function onToggle(event) {
  if(event.currentTarget && event.target!==event.currentTarget)return;
  const opening=event.target.open && !expanded.value;
  expanded.value=event.target.open;
  if(opening && !error.value)load();
}
watch(() => [code.value, props.agencyId], () => { requestId++; fetched.value = null; loading.value = false; error.value = ''; if (expanded.value) load(); });
</script>

<style scoped>
.service-information{border:1px solid var(--border,#d8e2ec);border-radius:12px;background:var(--surface,#fff);color:var(--text,#19354a);margin:12px 0;font-size:.9rem}
.service-information>summary{cursor:pointer;font-weight:650;padding:12px 14px}.service-information__body{padding:0 14px 14px}.service-information h4{margin:4px 0 10px}.service-information dl{margin:0}.service-information dt{font-weight:650;margin:12px 0 4px}.service-information dd{margin:0;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.service-information__manual{line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.service-information__source,.service-information__notice{font-size:.8rem;color:var(--text-muted,#526879);line-height:1.5}.service-information__review{padding:12px;border-left:3px solid #b98a17;background:#fff9e8;color:#6c5012}.service-information button{font:inherit;color:inherit}
</style>
