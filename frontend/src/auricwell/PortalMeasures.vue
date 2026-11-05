<template>
  <section id="portal-measures" class="portal-measures" aria-label="Assessments and evaluations">
    <header>
      <p class="eyebrow">Platform measures</p>
      <h2>Assessments and evaluations</h2>
      <p>These are the same platform measures for every practice. Assign one for the client to finish in the portal, or complete it here in this account.</p>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <div class="measure-layout">
      <section aria-label="Platform assessments">
        <div class="section-heading"><h3>Assessments</h3><div class="tool-controls"><input v-model="toolSearch" type="search" aria-label="Search assessments" placeholder="Name or topic"><select v-model="kind" aria-label="Assessment type"><option value="all">All types</option><option value="clinical">Clinical</option><option value="non_clinical">Non-clinical</option></select><select v-model="population" aria-label="Population"><option value="all">All populations</option><option v-for="item in populations" :key="item" :value="item">{{ item }}</option></select><select v-model="toolSort" aria-label="Sort assessments"><option value="asc">A–Z</option><option value="desc">Z–A</option></select><div class="view-switch" role="group" aria-label="Assessment layout"><button type="button" :aria-pressed="toolView==='cards'" @click="toolView='cards'">Cards</button><button type="button" :aria-pressed="toolView==='list'" @click="toolView='list'">List</button></div></div></div>
        <ul :class="toolView">
          <li v-for="tool in visibleTools" :key="tool.id">
            <div><strong>{{ tool.title }}</strong><span>{{ tool.littleName }}</span><p>{{ tool.description }}</p></div>
            <button type="button" :disabled="assigning" @click="assign(tool)">Assign</button>
          </li>
        </ul>
        <p v-if="toolLimit" class="limit-note">{{ toolLimit }}</p>
        <p v-if="lastLink" class="share-link"><span>Client link</span><input :value="lastLink" readonly aria-label="Assigned assessment link"><button type="button" @click="copyLink">Copy link</button></p>
        <h3>Assigned to this client</h3>
        <p v-if="loading">Loading assigned assessments…</p>
        <p v-else-if="!assessments.length">None assigned yet.</p>
        <ul v-else>
          <li v-for="item in assessments" :key="`${item.family}-${item.id}`">
            <div><strong>{{ item.title }}</strong><span>{{ item.status || 'Assigned' }}</span></div>
            <button v-if="item.accessToken" type="button" @click="complete(item)">Complete here</button>
          </li>
        </ul>
        <h3>Shared documents</h3>
        <p v-if="!deliverables.length && !loading">No assessment documents yet.</p>
        <ul>
          <li v-for="doc in deliverables" :key="doc.id">
            <div><strong>{{ doc.title || 'Assessment document' }}</strong><span>{{ doc.sharedWithClient ? 'Shared with the client' : 'Not shared' }}</span></div>
            <button v-if="!doc.sharedWithClient" type="button" @click="share(doc)">Share with client</button>
          </li>
        </ul>
      </section>
      <section v-if="liveUrl" aria-label="Complete assessment">
        <div class="section-heading"><h3>Complete with the client</h3><button type="button" @click="liveUrl=''">Close</button></div>
        <iframe :src="liveUrl" title="Assigned assessment"></iframe>
      </section>
    </div>
    <OutcomeMeasuresPanel :client-id="client.id" :agency-id="client.agency_id || agency.id" inline-screener @open-screener="screenerOpen = true" />
    <SafetyPlansPanel v-if="screenerOpen" :key="client.id" :agency-id="client.agency_id || agency.id" :client-id="client.id" initial-document-key="cssrs-screener" />
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../services/api';
import { ASSESSMENT_TOOLS, getAssessmentTokenUrl } from '../navigation/toolsCatalog.js';
import { lettersFit, narrowingLimits } from '../utils/letterMatch.js';
import OutcomeMeasuresPanel from '../components/clinical/OutcomeMeasuresPanel.vue';
import SafetyPlansPanel from '../components/safetyPlans/SafetyPlansPanel.vue';
const props = defineProps({ client: Object, agency: Object, slug: String });
const toolSearch = ref(''), kind = ref('all'), population = ref('all'), toolSort = ref('asc'), toolView = ref('cards'), assessments = ref([]), deliverables = ref([]), loading = ref(false), assigning = ref(false), error = ref(''), notice = ref(''), lastLink = ref(''), liveUrl = ref(''), screenerOpen = ref(false);
const populations = computed(() => [...new Set(ASSESSMENT_TOOLS.map(tool => tool.population).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
const toolChecks = computed(() => {
  const checks = [];
  if (toolSearch.value.trim()) checks.push({ label: 'this search', test: tool => lettersFit(toolSearch.value, `${tool.title} ${tool.littleName || ''} ${tool.description} ${(tool.tags || []).join(' ')}`) });
  if (kind.value !== 'all') checks.push({ label: kind.value === 'clinical' ? 'Clinical' : 'Non-clinical', test: tool => tool.clinicalKind === kind.value });
  if (population.value !== 'all') checks.push({ label: `Population: ${population.value}`, test: tool => tool.population === population.value });
  return checks;
});
const visibleTools = computed(() => ASSESSMENT_TOOLS.filter(tool => toolChecks.value.every(check => check.test(tool))).sort((a, b) => a.title.localeCompare(b.title) * (toolSort.value === 'desc' ? -1 : 1)));
const toolLimit = computed(() => {
  if (visibleTools.value.length || !toolChecks.value.length) return '';
  const limits = narrowingLimits(ASSESSMENT_TOOLS, toolChecks.value);
  return limits.length ? `No assessments match. Other assessments are available without ${limits.map(item => `${item.label} (${item.count})`).join('; ')}.` : 'No assessments match this search.';
});
async function load() {
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get(`/assessment-deliverables/clients/${props.client.id}`);
    assessments.value = data.assessments || [];
    deliverables.value = data.deliverables || [];
  } catch (e) { error.value = e.response?.data?.error?.message || e.response?.data?.error || 'Assigned assessments could not be loaded.'; }
  finally { loading.value = false; }
}
async function assign(tool) {
  assigning.value = true; error.value = ''; notice.value = '';
  try {
    const { data } = await api.post('/assessment-deliverables/assign', {
      family: tool.id, clientId: Number(props.client.id), agencyId: Number(props.client.agency_id || props.agency.id), organizationSlug: props.client.agency_slug || props.slug || ''
    });
    lastLink.value = data.accessToken ? getAssessmentTokenUrl(window.location.origin, tool.path || `/${tool.id}`, data.accessToken, props.client.agency_slug || props.slug) : '';
    notice.value = `${tool.title} is assigned. The client gets one delayed portal notice, even if you assign more than one.`;
    await load();
  } catch (e) { error.value = e.response?.data?.error?.message || e.response?.data?.error || 'This assessment could not be assigned.'; }
  finally { assigning.value = false; }
}
function complete(item) {
  const path = `/${String(item.catalogId || item.family || '').replace(/_/g, '-')}`;
  liveUrl.value = getAssessmentTokenUrl(window.location.origin, path, item.accessToken, props.client.agency_slug || props.slug);
}
async function share(doc) {
  error.value = '';
  try {
    await api.post(`/assessment-deliverables/${doc.id}/share`);
    notice.value = 'Shared with the client. The notice is grouped with any other shares.';
    await load();
  } catch (e) { error.value = e.response?.data?.error?.message || e.response?.data?.error || 'This document could not be shared.'; }
}
async function copyLink() {
  try { await navigator.clipboard.writeText(lastLink.value); notice.value = 'Link copied.'; }
  catch { notice.value = 'Copy the link above.'; }
}
watch(() => props.client.id, () => { liveUrl.value = ''; screenerOpen.value = false; lastLink.value = ''; load(); }, { immediate: true });
</script>
<style scoped>
.portal-measures{margin-top:28px;padding:24px;background:white;border:1px solid #d7e4f2;border-radius:16px}
.eyebrow{margin:0;color:#5d7690;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.portal-measures h2{margin:8px 0}.portal-measures h3{margin:0}
.section-heading{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:18px 0;flex-wrap:wrap}
.tool-controls,.view-switch{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.portal-measures input,.portal-measures select{font:inherit;padding:10px 12px;border:1px solid #b7cbe0;border-radius:8px;background:white}
.portal-measures ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
.portal-measures ul.list{grid-template-columns:1fr}
.portal-measures li{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:14px;border:1px solid #d7e4f2;border-radius:12px}
.view-switch [aria-pressed=true]{background:#173c62}
.limit-note{padding:12px 14px;background:#f8eed9;border-radius:8px;color:#5c4818}
.portal-measures li span{display:block;color:#5d7690;font-size:13px}.portal-measures li p{margin:6px 0 0;color:#31485f}
.portal-measures button{font:inherit;padding:10px 14px;border:0;border-radius:8px;background:#2467a7;color:white;cursor:pointer}
.portal-measures button:disabled{opacity:.6}
.share-link{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.share-link input{flex:1;min-width:220px}
iframe{width:100%;min-height:720px;border:1px solid #d7e4f2;border-radius:12px;background:white}
</style>
