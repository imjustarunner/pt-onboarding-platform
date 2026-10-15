<template>
  <section class="job-packages" aria-label="Job package defaults">
    <header><p class="eyebrow">HIRING SETUP</p><h3>Pre-hire &amp; onboarding packages</h3><p>Start with common requirements, then tailor this job. You can still adjust each person’s package later.</p></header>
    <div class="phase-tabs" role="tablist" aria-label="Package process"><button v-for="item in phases" :key="item.key" type="button" role="tab" :aria-selected="phase === item.key" @click="phase = item.key">{{ item.label }}</button></div>
    <p v-if="loading" role="status">Loading package defaults…</p>
    <div v-else-if="loadError" role="alert">{{ loadError }} <button type="button" @click="load">Retry</button></div>
    <template v-else-if="saved[phase]">
      <div class="scope-tabs" aria-label="Apply to"><button type="button" :aria-pressed="scope === 'job'" @click="scope = 'job'">This job</button><button type="button" :aria-pressed="scope === 'all'" @click="scope = 'all'">All jobs <span v-if="sharedDirty">· Unsaved</span></button></div>
      <div class="scope-note"><strong>{{ scope === 'all' ? 'Editing defaults for every job in this organization' : 'Editing this job’s package' }}</strong><p>{{ scope === 'all' ? 'Save here to update shared defaults. Jobs inherit these items unless they have an exception. Packages already started and completed submissions stay as they are.' : 'All-jobs items are included automatically. Uncheck one to leave it out of this job, or add a job-only item below. Save the job posting to keep these changes.' }}</p></div>
      <p v-if="message" role="status" class="success">{{ message }}</p><p v-if="error" role="alert">{{ error }}</p>
      <fieldset :disabled="saving">
        <label class="package-label">{{ phaseLabel }} package<select :value="selectedPackage" @change="selectPackage($event.target.value)"><option value="">{{ scope === 'all' ? 'No shared package selected' : `Use all-jobs default${sharedPackageName ? ' · ' + sharedPackageName : ''}` }}</option><option v-for="pkg in phasePackages" :key="pkg.id" :value="pkg.id">{{ pkg.name }}</option></select></label>
        <HirePackageContents :package-id="effectivePackage" :documents-only="phase === 'pre_hire'" />
        <p class="help">A package is a reusable collection. The items below are added to it.</p>
        <template v-if="scope === 'job'">
          <section class="inherited"><h4>Included from all jobs <span class="badge">All jobs</span></h4><p v-if="!inheritedResources.length">No shared extra steps for this process yet. Use All jobs to set them up once.</p>
            <div v-for="item in inheritedResources" :key="item.id" class="inherited-row"><label><input type="checkbox" :checked="!excluded.includes(item.id)" @change="includeDefault(item.id, $event.target.checked)" /><span>{{ item.title }}<small>{{ item.kind === 'document' ? 'Document' : item.kind }} · {{ item.required === false ? 'Optional' : 'Required' }}</small></span></label><button type="button" @click="customize(item)">Customize for this job</button></div>
          </section>
          <JobPrehireDocsEditor v-if="phase === 'pre_hire'" :key="defaultsVersion" v-model="model" :agency-id="agencyId" hide-workflow @defaults-saved="refreshDefaults" />
          <HireWorkflowEditor v-model="localWorkflow" :templates="templates" :phase="phase" heading="Extra steps · This job only" :description="'Add documents, videos, links or meetings that apply to this job.'">
            <template #resource-actions="{ item }"><span class="badge">This job only</span><button type="button" @click="makeShared(item)">Use for all jobs</button><button v-if="isShared(item.id)" type="button" @click="restoreDefault(item.id)">Use all-jobs version</button></template>
          </HireWorkflowEditor>
          <TrainingEditor v-if="phase === 'onboarding'" v-model="localTraining" :defaults="saved.onboarding.training" :modules="modules" :tracks="tracks" :guides="guides" />
        </template>
        <template v-else>
          <div v-if="phase === 'onboarding'" class="common"><strong>Common employee forms</strong><p>Add your approved Form I-9 once here to include it across jobs.</p><button type="button" @click="addI9" :disabled="drafts.onboarding.workflow.resources.some(r => r.id === 'i9')">{{ drafts.onboarding.workflow.resources.some(r => r.id === 'i9') ? 'Form I-9 added' : 'Add Form I-9 for all jobs' }}</button></div>
          <JobPrehireDocsEditor v-if="phase === 'pre_hire'" v-model="sharedDocuments" :agency-id="agencyId" :allow-agency-default="false" hide-workflow heading="Documents · All jobs" />
          <HireWorkflowEditor v-model="drafts[phase].workflow" :templates="templates" :phase="phase" heading="Extra steps · All jobs" description="Add a requirement once for every job in this organization." />
          <TrainingEditor v-if="phase === 'onboarding'" v-model="drafts.onboarding.training" shared :modules="modules" :tracks="tracks" :guides="guides" />
          <div class="shared-save"><p>These changes apply to all jobs that inherit these defaults.</p><button type="button" class="primary" :disabled="!phaseDirty(phase) || saving" @click="saveShared(phase)">{{ saving ? 'Saving…' : `Save ${phaseLabel.toLowerCase()} defaults for all jobs` }}</button><button v-if="phaseDirty(phase)" type="button" @click="drafts[phase] = clone(saved[phase])">Discard shared changes</button></div>
        </template>
      </fieldset>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import JobPrehireDocsEditor from './JobPrehireDocsEditor.vue';
import HireWorkflowEditor from '../admin/HireWorkflowEditor.vue';
import HirePackageContents from '../hiring/HirePackageContents.vue';
import TrainingEditor from './JobTrainingDefaultsEditor.vue';
const props = defineProps({ modelValue: { type: Object, default: () => ({ documents: [] }) }, agencyId: [Number, String] });
const emit = defineEmits(['update:modelValue']);
const clone = value => JSON.parse(JSON.stringify(value));
const phases = [{ key: 'pre_hire', label: 'Pre-hire' }, { key: 'onboarding', label: 'Onboarding' }];
const phase = ref('pre_hire'), scope = ref('job'), saved = ref({}), drafts = ref({});
const templates = ref([]), packages = ref([]), modules = ref([]), tracks = ref([]), guides = ref([]);
const loading = ref(false), saving = ref(false), loadError = ref(''), error = ref(''), message = ref(''), defaultsVersion = ref(0);
const model = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) });
const localWorkflow = computed({ get: () => model.value.workflow || { resources: [] }, set: workflow => { model.value = { ...model.value, workflow }; } });
const localTraining = computed({ get: () => model.value.onboardingTraining || {}, set: onboardingTraining => { model.value = { ...model.value, onboardingTraining }; } });
const sharedDocuments = computed({ get: () => ({ documents: drafts.value.pre_hire.documents }), set: value => { drafts.value.pre_hire.documents = value.documents; } });
const phaseLabel = computed(() => phases.find(p => p.key === phase.value).label);
const phasePackages = computed(() => packages.value.filter(p => p.package_type === phase.value));
const jobKey = computed(() => phase.value === 'pre_hire' ? 'prehirePackageId' : 'onboardingPackageId');
const selectedPackage = computed(() => scope.value === 'all' ? drafts.value[phase.value]?.packageId || '' : model.value[jobKey.value] || '');
const effectivePackage = computed(() => selectedPackage.value || (scope.value === 'job' ? saved.value[phase.value]?.packageId : null));
const sharedPackageName = computed(() => packages.value.find(p => Number(p.id) === Number(saved.value[phase.value]?.packageId))?.name);
const excluded = computed(() => localWorkflow.value.excludedResourceIds || []);
const inheritedResources = computed(() => (saved.value[phase.value]?.workflow.resources || []).filter(r => !(localWorkflow.value.resources || []).some(local => local.id === r.id)));
const phaseDirty = key => JSON.stringify(drafts.value[key]) !== JSON.stringify(saved.value[key]);
const sharedDirty = computed(() => phases.some(p => phaseDirty(p.key)));
function selectPackage(value) { const id = Number(value) || null; if (scope.value === 'all') drafts.value[phase.value].packageId = id; else model.value = { ...model.value, [jobKey.value]: id }; }
function includeDefault(id, enabled) { localWorkflow.value = { ...localWorkflow.value, excludedResourceIds: enabled ? excluded.value.filter(key => key !== id) : [...new Set([...excluded.value, id])] }; }
function customize(item) { localWorkflow.value = { ...localWorkflow.value, excludedResourceIds: excluded.value.filter(id => id !== item.id), resources: [...(localWorkflow.value.resources || []), clone(item)] }; }
function isShared(id) { return saved.value[phase.value].workflow.resources.some(r => r.id === id); }
function restoreDefault(id) { localWorkflow.value = { ...localWorkflow.value, excludedResourceIds: excluded.value.filter(key => key !== id), resources: (localWorkflow.value.resources || []).filter(r => r.id !== id) }; }
const params = () => ({ agencyId: props.agencyId });
let sequence = 0;
const list = data => Array.isArray(data) ? data : data?.data || data?.templates || data?.modules || data?.tracks || [];
const available = data => list(data).filter(item => (item.agency_id == null || Number(item.agency_id) === Number(props.agencyId)) && ![false, 0, '0'].includes(item.is_active) && ![true, 1, '1'].includes(item.is_archived));
async function load() {
  const request = ++sequence; loading.value = true; loadError.value = ''; saved.value = {}; drafts.value = {};
  try {
    const responses = await Promise.all(['/hiring/package-defaults', '/onboarding-packages', '/document-templates', '/modules', '/tracks'].map(url => api.get(url, { params: { ...params(), limit: 1000 } })));
    if (request !== sequence) return;
    saved.value = clone(responses[0].data.phases); drafts.value = clone(saved.value); guides.value = responses[0].data.guides || [];
    packages.value = available(responses[1].data); templates.value = available(responses[2].data); modules.value = available(responses[3].data); tracks.value = available(responses[4].data);
  } catch { if (request === sequence) loadError.value = 'Could not load job package defaults.'; }
  finally { if (request === sequence) loading.value = false; }
}
async function refreshDefaults() {
  try { const { data } = await api.get('/hiring/package-defaults', { params: params() }); for (const key of ['pre_hire','onboarding']) { if (!phaseDirty(key)) drafts.value[key] = clone(data.phases[key]); saved.value[key] = clone(data.phases[key]); } }
  catch { error.value = 'The shared item was saved, but defaults could not refresh. Reload this editor before changing shared defaults.'; }
}
async function saveShared(key, resource) {
  saving.value = true; error.value = ''; message.value = '';
  const payload = clone(drafts.value[key]);
  if (resource) payload.workflow.resources = [...payload.workflow.resources.filter(r => r.id !== resource.id), clone(resource)];
  try {
    const { data } = await api.put(`/hiring/package-defaults/${key}`, payload, { params: params() });
    saved.value[key] = clone(data.phases[key]); drafts.value[key] = clone(data.phases[key]); defaultsVersion.value++;
    if (resource) { restoreDefault(resource.id); }
    message.value = `${key === 'pre_hire' ? 'Pre-hire' : 'Onboarding'} defaults saved for all jobs.`;
    return true;
  } catch (e) { error.value = e.response?.data?.error?.message || 'Defaults could not be saved. Your changes are still here.'; return false; }
  finally { saving.value = false; }
}
async function makeShared(item) { if (phaseDirty(phase.value)) { scope.value = 'all'; await Promise.resolve(); error.value = 'Save or discard your shared changes first, then choose Use for all jobs on this item.'; return; } await saveShared(phase.value, item); }
function addI9() {
  const candidates = templates.value.filter(t => /\bi[ -]?9\b/i.test(t.name || ''));
  drafts.value.onboarding.workflow.resources.push({ id: 'i9', phase: 'onboarding', title: 'Form I-9 · employee information', kind: 'document', templateId: candidates.length === 1 ? candidates[0].id : null, required: true, url: '', instructions: '' });
  message.value = 'Choose your approved I-9 template below, then save onboarding defaults for all jobs.';
}
watch(() => props.agencyId, load, { immediate: true });
watch([phase, scope], () => { error.value = ''; message.value = ''; });
defineExpose({ sharedDirty, saving });
</script>
<style scoped>
.job-packages{margin-top:24px;padding:24px;border:1px solid #dce3ed;border-radius:12px;background:#fff;color:#243247;display:grid;gap:20px;min-width:0}.job-packages h3,.job-packages h4,.job-packages p{margin:0}.job-packages h3{color:#172339;font-size:21px}.job-packages p{line-height:1.6;color:#64748b;font-size:14px}.eyebrow{font-size:11px!important;letter-spacing:.12em;font-weight:700}.phase-tabs,.scope-tabs{display:flex;gap:6px;flex-wrap:wrap}.phase-tabs{border-bottom:1px solid #dce3ed;padding-bottom:12px}.job-packages button{border:1px solid #cbd5e1;background:white;color:#243247;border-radius:7px;padding:10px 14px;cursor:pointer;font:inherit;font-size:13px}.phase-tabs button[aria-selected=true],.primary{background:#172339!important;color:white!important;border-color:#172339!important}.scope-tabs button[aria-pressed=true]{background:#e9eef5;border-color:#526a91;font-weight:700}.scope-note,.common{padding:16px;background:#f5f7fb;border-radius:8px;display:grid;gap:7px}.scope-note strong{font-size:14px}fieldset{padding:0;margin:0;border:0;min-width:0;display:grid;gap:22px}.package-label{font-weight:600;font-size:14px;display:grid;gap:7px}.package-label select{padding:11px;border:1px solid #cbd5e1;border-radius:7px;font:inherit;width:100%;box-sizing:border-box;background:white;color:#172339}.inherited{display:grid;gap:12px}.inherited-row{display:flex;justify-content:space-between;align-items:center;gap:15px;border-bottom:1px solid #e2e8f0;padding:12px 0}.inherited-row label{display:flex;gap:10px;align-items:center}.inherited-row input{width:18px;height:18px}.inherited-row small{display:block;color:#64748b;margin-top:5px}.badge{display:inline-block;padding:4px 8px;border-radius:5px;background:#eef2f7;font-size:11px;font-weight:600;color:#43556d}.shared-save{display:flex;align-items:center;flex-wrap:wrap;gap:12px;border-top:1px solid #dce3ed;padding-top:20px}.shared-save p{width:100%}.success{color:#25593f!important}[role=alert]{color:#a12a2a!important}button:disabled{opacity:.55;cursor:default}button:focus-visible{outline:3px solid #8aa7cf;outline-offset:2px}@media(max-width:600px){.job-packages{padding:15px}.inherited-row{align-items:stretch;flex-direction:column}.phase-tabs button,.scope-tabs button{flex:1}.shared-save button{width:100%}}
</style>
