<template>
  <component :is="buttonMode ? 'div' : 'details'" ref="container" class="service-information" :class="{ 'service-information--button': buttonMode }" @toggle="onToggle" @keydown.esc="onEscape">
    <button v-if="buttonMode" ref="trigger" type="button" class="service-information__trigger" :disabled="!code" :aria-label="`Service information for ${code || 'selected code'}`" :aria-expanded="expanded" :aria-controls="panelId" title="View service details and source" @click="toggle"><span aria-hidden="true">ⓘ</span></button>
    <summary v-else>Service information <span v-if="code">· {{ code }}</span></summary>
    <Teleport to="body" :disabled="!buttonMode">
    <div v-if="!buttonMode || expanded" :id="panelId" ref="panel" class="service-information__body" :class="{ 'service-information__popover': buttonMode }" :style="buttonMode ? popupStyle : undefined" @keydown.esc="onEscape" :aria-busy="loading" :role="buttonMode ? 'region' : undefined" :aria-label="buttonMode ? `Service information for ${code}` : undefined" :tabindex="buttonMode ? -1 : undefined">
      <header v-if="buttonMode" class="service-information__header"><strong>{{ code }} · Service information</strong><button type="button" aria-label="Close service information" @click="close">×</button></header>
      <p v-if="loading" role="status">Loading service information…</p>
      <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></p>
      <template v-else-if="reference">
        <h4>{{ reference.title }}</h4>
        <p class="service-information__kind">{{ sourceKind }}</p>
        <p v-if="!sourceAvailable" role="status">{{ reference.note || 'An approved source for this service is unavailable.' }}</p>
        <dl v-if="sourceAvailable">
          <template v-if="reference.unitLabel"><dt>Manual unit</dt><dd>{{ reference.unitLabel }}<template v-if="reference.minUnitMinutes"> · Minimum {{ reference.minUnitMinutes }} minutes</template><template v-if="reference.maxUnitMinutes"> · Maximum {{ reference.maxUnitMinutes }} minutes per unit</template></dd></template>
          <template v-for="field in fields" :key="field.key"><template v-if="reference[field.key]"><dt>{{ field.label }}</dt><dd>{{ reference[field.key] }}</dd></template></template>
        </dl>
        <ul v-if="sourceAvailable && reference.requirements?.length" class="service-information__requirements"><li v-for="requirement in reference.requirements" :key="requirement.id">{{ requirement.text }}</li></ul>
        <p v-if="sourceAvailable && reference.zeroClientCharge">No client charge. An underlying clinical service must be documented.</p>
        <p v-if="sourceAvailable && reference.crisisReview" class="service-information__review">{{ reference.crisisReview.message }}</p>
        <details v-if="sourceAvailable && reference.manualText"><summary>Full supplied service details</summary><p class="service-information__manual">{{ reference.manualText }}</p></details>
        <p v-if="sourceAvailable" class="service-information__source"><strong>{{ reference.source.title }}</strong><template v-if="reference.source.edition"> · {{ reference.source.edition }}</template><template v-if="reference.source.effectiveDate"> · Effective {{ reference.source.effectiveDate }}</template><template v-if="isAgencyPolicy && reference.source.version"> · Policy version {{ reference.source.version }}</template><template v-if="!isAgencyPolicy && reference.source.pages?.length"> · Page {{ reference.source.pages.join(', ') }}</template></p>
        <p v-if="sourceAvailable && reference.supportingReferences?.length" class="service-information__notice">Supporting guidance: {{ reference.supportingReferences.map(item => item.title).filter(Boolean).join('; ') }}</p>
        <p v-if="reference.reviewNotice" class="service-information__notice">{{ reference.reviewNotice }}</p>
      </template>
      <p v-else>Select a service to see its documentation requirements.</p>
    </div>
    </Teleport>
  </component>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
const props = defineProps({ serviceCode: { type: String, default: '' }, agencyId: { type: [Number, String], default: null }, serviceInfo: { type: Object, default: null }, apiClient: { type: Object, default: null }, referenceBasePath: { type: String, default: '/medical-billing/service-reference' }, presentation: { type: String, default: 'disclosure' } });
const code = computed(() => String(props.serviceCode || props.serviceInfo?.code || '').trim().toUpperCase());
const buttonMode = computed(() => props.presentation === 'button');
const container = ref(null), trigger = ref(null), panel = ref(null), panelId = `service-information-${useId()}`;
const popupStyle = ref({});
const fetched = ref(null), loading = ref(false), error = ref(''), expanded = ref(false);
const reference = computed(() => String(props.serviceInfo?.code || '').toUpperCase() === code.value ? props.serviceInfo : fetched.value);
const isAgencyPolicy = computed(() => reference.value?.source?.kind === 'user_agency_policy');
const sourceAvailable = computed(() => !!reference.value?.source?.title && (reference.value.status === 'available' && !isAgencyPolicy.value && reference.value.source.pages?.length > 0 || reference.value.status === 'supplemental-policy' && isAgencyPolicy.value));
const sourceKind = computed(() => !sourceAvailable.value ? 'Source unavailable' : isAgencyPolicy.value ? `Agency supplemental policy${reference.value.policyKind === 'addon' ? ' · Add-on service' : reference.value.policyKind === 'funding' ? ' · Funding arrangement' : ''}` : 'Supplied service handbook');
let requestId = 0;
const fields = [
  { key: 'providerQualifications', label: 'Listed provider qualifications' },
  { key: 'providerTypesThatCanBill', label: 'Provider types that can bill (manual)' },
  { key: 'serviceDescription', label: 'Service and examples' }, { key: 'documentation', label: 'Documentation and limitations' },
  { key: 'ageGroups', label: 'Ages' },
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
  if (buttonMode.value || event.currentTarget && event.target !== event.currentTarget) return;
  const opening = event.target.open && !expanded.value;
  expanded.value = event.target.open;
  if (opening && !error.value) load();
}
async function toggle() {
  if (expanded.value) return close();
  expanded.value = true;
  if (!error.value) load();
  await nextTick(); positionPanel(); panel.value?.focus();
}
function close() { if (!buttonMode.value || !expanded.value) return; expanded.value = false; nextTick(() => trigger.value?.focus()); }
function onEscape(event) { if (!buttonMode.value || !expanded.value) return; event.stopPropagation(); event.preventDefault(); close(); }
function positionPanel(event) {
  if (!buttonMode.value || !expanded.value || !trigger.value || event?.target instanceof Node && panel.value?.contains(event.target)) return;
  const rect = trigger.value.getBoundingClientRect(), viewWidth = window.innerWidth, viewHeight = window.innerHeight;
  const width = Math.max(0, Math.min(576, viewWidth - 32)), below = viewHeight - rect.bottom - 24;
  const maxHeight = Math.min(520, viewHeight * .65, below >= 160 ? below : Math.max(160, rect.top - 24));
  const top = below >= 160 ? rect.bottom + 8 : Math.max(16, rect.top - maxHeight - 8);
  popupStyle.value = { left: `${Math.max(16, Math.min(rect.right - width, viewWidth - width - 16))}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${maxHeight}px` };
}
function outside(event) { if (buttonMode.value && expanded.value && container.value && !container.value.contains(event.target) && !panel.value?.contains(event.target)) expanded.value = false; }
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('resize', positionPanel); document.addEventListener('scroll', positionPanel, true); });
onBeforeUnmount(() => { requestId++; document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', positionPanel); document.removeEventListener('scroll', positionPanel, true); });
watch(() => [code.value, props.agencyId], () => { requestId++; fetched.value = null; loading.value = false; error.value = ''; if (buttonMode.value) expanded.value = false; else if (expanded.value) load(); });
</script>

<style scoped>
.service-information{border:1px solid var(--border,#d8e2ec);border-radius:12px;background:var(--surface,#fff);color:var(--text,#19354a);margin:12px 0;font-size:.9rem;min-width:0}
.service-information>summary{cursor:pointer;font-weight:650;padding:12px 14px}.service-information__body{padding:0 14px 14px}.service-information__body h4{margin:4px 0 10px}.service-information__body dl{margin:0}.service-information__body dt{font-weight:650;margin:12px 0 4px}.service-information__body dd{margin:0;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.service-information__manual{line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.service-information__source,.service-information__notice{font-size:.8rem;color:var(--text-muted,#526879);line-height:1.5}.service-information__kind{font-size:.8rem;font-weight:650;color:#345d7b}.service-information__review{padding:12px;border-left:3px solid #b98a17;background:#fff9e8;color:#6c5012}.service-information__requirements{padding-left:20px;line-height:1.6}.service-information__body button{font:inherit;color:inherit}.service-information--button{position:relative;display:inline-flex;flex:none;align-self:center;border:0;background:transparent;margin:0}.service-information__trigger{display:grid;place-items:center;width:36px;height:36px;border:1px solid #c2d3e3;border-radius:50%;background:#f3f8fc;color:#245a83!important;cursor:pointer;font-size:23px!important}.service-information__trigger:focus-visible{outline:3px solid #74a7dc;outline-offset:2px}.service-information__trigger:disabled{opacity:.45;cursor:default}.service-information__popover{position:fixed;color:var(--text,#19354a);font-size:.9rem;width:min(36rem,calc(100vw - 32px));max-height:min(65vh,36rem);overflow-y:auto;box-sizing:border-box;padding:14px;background:var(--surface,#fff);border:1px solid #becfdf;border-radius:12px;box-shadow:0 10px 30px #17375429;z-index:100000;line-height:1.5;white-space:normal}.service-information__popover:focus{outline:2px solid #94b9d9;outline-offset:2px}.service-information__header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #dae4ed;padding-bottom:8px;margin-bottom:12px}.service-information__header button{display:grid;place-items:center;flex:none;width:36px;height:36px;background:#f3f7fb;border:1px solid #ccdae7;border-radius:8px;font-size:24px;cursor:pointer}
</style>
