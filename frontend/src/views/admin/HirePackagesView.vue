<template>
  <main class="hire-packages">
    <header><div><p class="eyebrow">People Operations · Hire packages</p><h1>{{ personName || 'Hire packages' }}</h1><p v-if="state">{{ state.candidate.personal_email || state.candidate.email }} · {{ state.candidate.status.replaceAll('_', ' ') }}</p></div><RouterLink :to="profileUrl">View employee profile →</RouterLink></header>
    <p v-if="loading" role="status">Loading this person’s packages…</p>
    <p v-if="error" class="error" role="alert">{{ error }} <button v-if="!state" @click="load">Try again</button></p>
    <template v-if="state && !loading">
      <nav class="phase-tabs" aria-label="Person’s hire package"><button v-for="p in phases" :key="p.key" :aria-pressed="phase === p.key" @click="switchPhase(p.key)"><strong>{{ p.label }}</strong><span>{{ state.phases[p.key].closed ? 'Submitted · retained' : state.phases[p.key].preparing ? 'Prepare for later' : 'In progress' }}{{ isDirty(p.key) ? ' · Unsaved' : '' }}</span></button></nav>
      <section class="package-heading"><div><h2>{{ phaseLabel }} package</h2><p>Changes here apply to {{ personName }}. Switch packages above without leaving their record.</p></div><a :href="settingsUrl" target="_blank" rel="noopener">Edit {{ phaseLabel.toLowerCase() }} defaults ↗</a></section>
      <p v-if="current.closed" class="notice">This submitted package is retained for review. Completed documents and responses remain available from the employee profile.</p>
      <p v-else-if="current.preparing" class="notice">Prepare and save onboarding now. These steps become available to the employee when People Operations moves them to onboarding after pre-hire review.</p>
      <p v-if="saved" class="success" role="status">{{ saved }}</p>
      <form @submit.prevent="save">
        <fieldset :disabled="current.closed || saving">
          <section class="card"><h3>Document and training collection</h3><label>Collection for {{ personName }}<select v-model="draft.packageId"><option :value="null">Individual steps only</option><option v-for="pkg in phasePackages" :key="pkg.id" :value="pkg.id">{{ pkg.name }}{{ Number(pkg.id) === Number(current.suggestedPackageId) ? ' · Suggested' : '' }}</option></select></label><p v-if="!current.preparing">Applying another collection adds its assignments. Previously assigned documents, training and completion records stay with this person.</p><p v-else>Choose the shared collection to assign when onboarding starts.</p></section>
          <section class="card"><HireWorkflowEditor v-model="draft.workflow" :phase="phase" :templates="templates" :editor-url="documentsUrl" :heading="`Additional ${phaseLabel.toLowerCase()} steps for this person`" :locked-resource-ids="current.completedResourceIds" /></section>
        </fieldset>
        <HirePackageContents v-if="draft.packageId" :package-id="draft.packageId" :documents-only="phase === 'pre_hire'" :edit-url="collectionsUrl" />
        <div v-if="!current.closed" class="save-row"><button type="submit" class="primary" :disabled="saving || !isDirty(phase)">{{ saving ? 'Saving…' : `Save ${phaseLabel.toLowerCase()} package` }}</button><span>Saving keeps their current hiring status.</span></div>
      </form>
      <section class="card"><h3>Assigned documents and training</h3><p v-if="!current.tasks.length">{{ current.preparing ? 'Assignments will appear when onboarding starts.' : 'No document or training assignments in this phase yet.' }}</p><ul v-else class="assignments"><li v-for="task in current.tasks" :key="task.id"><span>{{ task.title }}</span><span class="task-status">{{ task.status.replaceAll('_', ' ') }}</span></li></ul><RouterLink :to="profileUrl">Review files and manage assignments in the employee profile →</RouterLink></section>
      <section v-if="phase === 'onboarding' && current.preparing" class="card start-onboarding"><h3>Start onboarding</h3><p v-if="state.candidate.status !== 'PREHIRE_REVIEW'">Available after the employee submits pre-hire for review.</p><p v-else>Review the saved package and access details before starting onboarding.</p><button class="primary" :disabled="state.candidate.status !== 'PREHIRE_REVIEW' || anyDirty || saving" @click="showPromote = true">Review &amp; move to onboarding</button><p v-if="anyDirty">Save your package changes before continuing.</p></section>
    </template>
    <PromoteToOnboardingModal v-if="showPromote" :candidate="state.candidate" :agency-id="agencyId" @close="showPromote = false" @promoted="promoted" />
  </main>
</template>
<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import HireWorkflowEditor from '../../components/admin/HireWorkflowEditor.vue';
import HirePackageContents from '../../components/hiring/HirePackageContents.vue';
import PromoteToOnboardingModal from '../../components/hiring/PromoteToOnboardingModal.vue';
const route = useRoute(), router = useRouter(), agencyStore = useAgencyStore();
const agencyId = computed(() => Number(route.query.agencyId || agencyStore.currentAgency?.id));
const userId = computed(() => Number(route.params.userId));
const prefix = computed(() => route.params.organizationSlug ? `/${route.params.organizationSlug}` : '');
const profileUrl = computed(() => `${prefix.value}/admin/users/${userId.value}`);
const settingsUrl = computed(() => `${prefix.value}/admin/settings?agencyId=${agencyId.value}&category=workflow&item=${phase.value === 'pre_hire' ? 'hiring-prehire' : 'onboarding-setup'}`);
const collectionsUrl = computed(() => `${prefix.value}/admin/settings?agencyId=${agencyId.value}&category=workflow&item=packages`);
const documentsUrl = computed(() => `${prefix.value}/admin/documents?agencyId=${agencyId.value}`);
const phases = [{ key: 'pre_hire', label: 'Pre-hire' }, { key: 'onboarding', label: 'Onboarding' }];
const phase = ref(route.query.phase === 'onboarding' ? 'onboarding' : 'pre_hire');
const phaseLabel = computed(() => phases.find(p => p.key === phase.value).label);
const state = ref(null), drafts = ref({}), originals = ref({}), packages = ref([]), templates = ref([]);
const loading = ref(false), saving = ref(false), error = ref(''), saved = ref(''), showPromote = ref(false);
const current = computed(() => state.value?.phases[phase.value]);
const draft = computed(() => drafts.value[phase.value]);
const personName = computed(() => state.value ? `${state.value.candidate.first_name || ''} ${state.value.candidate.last_name || ''}`.trim() : '');
const phasePackages = computed(() => packages.value.filter(p => p.package_type === phase.value && (!p.agency_id || Number(p.agency_id) === agencyId.value)));
const isDirty = key => JSON.stringify(drafts.value[key]) !== originals.value[key];
const anyDirty = computed(() => !!state.value && phases.some(p => isDirty(p.key)));
const endpoint = () => `/hiring/candidates/${userId.value}/hire-packages`;
let generation = 0;
function setDraft(key, data) { drafts.value[key] = JSON.parse(JSON.stringify({ packageId: data.packageId || (data.preparing ? data.suggestedPackageId : null) || null, workflow: data.workflow })); originals.value[key] = JSON.stringify(drafts.value[key]); }
async function load() {
  const request = ++generation; loading.value = true; error.value = ''; state.value = null;
  try {
    if (!agencyId.value || !userId.value) throw new Error('Select an organization and person to manage their packages.');
    const params = { agencyId: agencyId.value };
    const [workspace, collections, documents] = await Promise.all([api.get(endpoint(), { params }), api.get('/onboarding-packages', { params }), api.get('/document-templates', { params: { ...params, limit: 1000 } })]);
    if (request !== generation) return;
    state.value = workspace.data;
    packages.value = (collections.data || []).filter(p => p.is_active !== false && p.is_active !== 0 && p.is_active !== '0');
    templates.value = Array.isArray(documents.data) ? documents.data : documents.data?.templates || [];
    for (const p of phases) setDraft(p.key, state.value.phases[p.key]);
  } catch (e) { if (request === generation) error.value = e.response?.data?.error?.message || e.message || 'Could not load the packages.'; }
  finally { if (request === generation) loading.value = false; }
}
function switchPhase(value) { phase.value = value; saved.value = ''; router.replace({ query: { ...route.query, phase: value } }); }
async function save() {
  const selected = phase.value; saving.value = true; error.value = ''; saved.value = '';
  try {
    const payload = JSON.parse(JSON.stringify(drafts.value[selected]));
    const { data } = await api.put(`${endpoint()}/${selected}`, { ...payload, revision: state.value.revision }, { params: { agencyId: agencyId.value } });
    state.value.revision = data.revision;
    originals.value[selected] = JSON.stringify(payload);
    state.value.phases[selected] = { ...state.value.phases[selected], ...payload };
    saved.value = `${selected === 'pre_hire' ? 'Pre-hire' : 'Onboarding'} package saved.`;
    // Refresh assignments without discarding unsaved work in the other phase.
    const refreshed = await api.get(endpoint(), { params: { agencyId: agencyId.value } });
    if (refreshed.data.revision === data.revision) state.value.phases[selected].tasks = refreshed.data.phases[selected].tasks;
  } catch (e) { error.value = e.response?.data?.error?.message || 'Could not save the package. Your edits are still here.'; }
  finally { saving.value = false; }
}
async function promoted() { showPromote.value = false; phase.value = 'onboarding'; await load(); }
watch(() => route.query.phase, value => { phase.value = value === 'onboarding' ? 'onboarding' : 'pre_hire'; });
watch([userId, agencyId], load, { immediate: true });
const canLeave = () => !saving.value && (!anyDirty.value || window.confirm('Leave without saving your package changes?'));
onBeforeRouteLeave(canLeave);
onBeforeRouteUpdate((to, from) => to.params.userId === from.params.userId && to.query.agencyId === from.query.agencyId ? true : canLeave());
</script>
<style scoped>
.hire-packages{max-width:1180px;margin:auto;padding:28px;color:#243b53;font:14px/1.6 'Plotline Inter',Inter,system-ui,sans-serif}header,.package-heading{display:flex;justify-content:space-between;gap:24px;align-items:center;margin-bottom:24px}h1{font-size:30px}h1,h2,h3{color:#243b53;margin:0 0 8px}p{color:#5c6d82;margin:6px 0 14px}.eyebrow{text-transform:uppercase;font-size:11px;letter-spacing:.12em}a{color:#345d86}.phase-tabs{display:flex;gap:8px;padding:6px;background:#eef3f8;border-radius:12px;margin:24px 0}.phase-tabs button{flex:1;text-align:left;border:0;background:transparent;padding:15px 20px}.phase-tabs span{display:block;font-size:12px;font-weight:400;color:#5c6d82}.phase-tabs [aria-pressed=true]{background:white;box-shadow:0 2px 6px #15243b12}.card{padding:24px;background:white;border:1px solid #dfe5ed;border-radius:12px;margin:20px 0}.notice{padding:16px 20px;background:#eef3f8;border-radius:10px}.error{padding:14px;background:#fff1f0;color:#922d25}.success{padding:14px;background:#edf5ef;color:#28543a}fieldset{border:0;padding:0;margin:0;min-width:0}fieldset:disabled{opacity:.8}label{display:block;font-weight:600}select{display:block;width:100%;padding:11px;border:1px solid #ccd6e1;border-radius:7px;margin-top:7px;background:white;font:inherit}button{font:inherit;cursor:pointer;border:1px solid #ccd6e1;background:white;color:#243b53;border-radius:8px;padding:10px 16px}button:disabled{opacity:.55;cursor:default}.primary{background:#243b53;color:white;border-color:#243b53}.save-row{display:flex;gap:16px;align-items:center;margin:24px 0}.save-row span{font-size:12px;color:#5c6d82}.assignments{list-style:none;padding:0}.assignments li{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #e5eaf0;padding:12px 0}.task-status{color:#5c6d82;font-size:12px}button:focus-visible,a:focus-visible{outline:3px solid #88a7c5;outline-offset:3px}@media(max-width:650px){.hire-packages{padding:16px}header,.package-heading,.save-row{align-items:flex-start;flex-direction:column}.card{padding:16px}.phase-tabs button{padding:12px}}
</style>
