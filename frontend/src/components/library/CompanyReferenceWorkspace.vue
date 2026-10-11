<template>
  <section class="reference-workspace" :style="fontStyle" :aria-label="`${documentTitle} workspace`">
    <header class="reference-heading"><div><p class="eyebrow">Company documents · Mental health practice</p><h2>{{ documentTitle }}</h2><p>{{ documentKey === 'caseload-management-sop' ? 'Reference only · Capacity, scheduling, documentation, engagement and continuity. No onboarding assignment or quiz.' : documentKey === 'mandated-reporting-sop' ? 'Reporting responsibilities, safety, privacy and documentation, with required staff onboarding.' : documentKey === 'group-psychotherapy-sop' ? 'Reference only · Planning, consent, delivery and documentation for approved psychotherapy groups. No onboarding assignment or quiz.' : documentKey === 'service-documentation-standards' ? 'Practical standards for accurate notes, meaningful progress and service-specific records.' : documentKey === 'facilitator-coding-protocol' ? 'Approved services, documentation, coding review and work-time guidance for bachelor’s-level facilitators.' : documentKey === 'crisis-response-guide' ? 'Find preparation, emergency response, Colorado reporting and follow-up procedures. Q&A is a reference, not an emergency service.' : documentKey === 'facilities-guide' ? 'Shared office procedures, room use and approved access for your company.' : documentKey === 'skill-development-guide' ? 'Connection, regulation and learning, with your company’s group rules and supervised practice.' : documentKey === 'counseling-guide' ? 'An introduction to approaches, helping skills and professional scope. Familiarization does not authorize clinical practice.' : documentKey === 'school-practice-guide' ? 'ITSCO school assignments, intake, caseload management and essential protocols.' : 'Clinical expectations, documentation and guidance for your role.' }}</p></div><button v-if="closable" type="button" @click="close">Close guide</button></header>
    <p v-if="error" role="alert" class="reference-error">{{ error }} <button type="button" :disabled="busy" @click="load">Retry</button></p>
    <p v-if="loading" role="status">Loading the guide…</p>
    <template v-else-if="manage">
      <nav class="edition-tabs" aria-label="Guide editions"><button v-for="item in modes" :key="item.key" type="button" :aria-pressed="mode === item.key" :disabled="!state[item.key]" @click="selectMode(item.key)">{{ item.title }}</button></nav>
      <div class="reference-actions"><p v-if="state.draft">Draft v{{ state.draft.version.version_number }} · {{ state.changes?.length || 0 }} changes to review. Staff see the published edition.</p><p v-else-if="state.source || state.published">Review this company’s edition, then create a draft to make changes.</p><p v-else>This company’s guide becomes available when its document package is assigned.</p><button v-if="!state.draft && (state.source || state.published)" type="button" :disabled="busy" @click="createDraft(false)">{{ busy ? 'Preparing…' : 'Create company draft' }}</button><button v-if="documentKey === 'crisis-response-guide' && state.source && state.published && !state.draft" type="button" :disabled="busy" @click="createDraft(true)">Prepare safety-plan workflow update</button><button v-if="mode === 'draft'" type="button" :disabled="busy || dirty || !ready" @click="publish">{{ busy ? 'Saving…' : 'Publish reviewed edition' }}</button></div>
      <HandbookSectionEditor v-if="mode === 'draft' && state.draft" :key="state.draft.version.id" :agency-id="agencyId" :version-id="state.draft.version.id" :sections="state.draft.sections" :required-sections="state.draft.metadata.requiredSections || []" :api-base="base" :anchor-prefix="documentKey" updates-label="this guide’s change record" @saved="load" @dirty="dirty = $event; $emit('dirty', $event)" />
      <details v-if="mode === 'draft' && state.changes?.length" class="reference-changes"><summary>Review {{ state.changes.length }} section changes</summary><article v-for="change in state.changes" :key="change.slug"><h3>{{ change.title }} · {{ change.kind }}</h3><div class="change-comparison"><div v-if="change.beforeHtml"><strong>Before</strong><div v-html="safe(change.beforeHtml)" /></div><div v-if="change.afterHtml"><strong>After</strong><div v-html="safe(change.afterHtml)" /></div></div></article></details>
    </template>
    <DocumentTrainingReview v-if="manage && isPublished && shown.metadata?.learningPurpose !== 'reference-only'" :key="`${agencyId}:${documentKey}:${shown.version.id}`" :agency-id="agencyId" :document-key="documentKey" :version-id="shown.version.id" @dirty="quizDirty = $event; emit('dirty', dirty || quizDirty)" />
    <WorkplaceHandbookBook v-if="!loading && shown" :key="`${documentKey}:${mode}:${shown.version?.id || 'source'}`" ref="book" :handbook="shown" :analytics="{ agencyId, surface: 'library', enabled: isPublished }" :answer-question="isPublished ? answer : null" @reload="load" @handbook-link="$emit('handbook-link', $event)" />
    <p v-else-if="!loading && !manage">Your company’s {{ documentTitle }} is being prepared. It will appear here when published.</p>
    <details v-if="isPublished && shown?.changes?.length" class="reference-changes"><summary>Changes in this edition</summary><ul><li v-for="change in shown.changes" :key="change.slug">{{ change.kind }} · <button v-if="change.kind !== 'removed'" type="button" @click="book?.selectSection(change.slug, true)">{{ change.title }} ↗</button><span v-else>{{ change.title }}</span></li></ul></details>
  </section>
</template>
<script setup>
import DocumentTrainingReview from '../training/DocumentTrainingReview.vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import WorkplaceHandbookBook from '../handbook/WorkplaceHandbookBook.vue';
import HandbookSectionEditor from '../handbook/HandbookSectionEditor.vue';
const props = defineProps({ agencyId: { type: [Number, String], required: true }, manage: Boolean, closable: Boolean, documentKey: { type: String, default: 'provider-guide' }, documentTitle: { type: String, default: 'Provider’s Guide' } });
const emit = defineEmits(['dirty', 'close', 'handbook-link', 'published']);
const base = computed(() => `/provider-update/company-documents/${props.documentKey}`);
const state = ref({}), mode = ref('published'), loading = ref(false), busy = ref(false), error = ref(''), dirty = ref(false), book = ref(null);
const quizDirty = ref(false);
const modes = [{ key: 'published', title: 'Published edition' }, { key: 'draft', title: 'Company draft' }, { key: 'source', title: 'Supplied starting point' }];
const shown = computed(() => state.value[mode.value]);
const isPublished = computed(() => mode.value === 'published' && !!shown.value?.version?.id);
const ready = computed(() => state.value.draft?.sections?.length && state.value.draft.sections.every(s => s.content_status === 'ready' && s.body_html));
const fontStyle = computed(() => ({ '--handbook-font': shown.value?.metadata?.presentation?.theme === 'itsco-foundations' ? 'var(--font-itsco)' : 'var(--font-ptco)' }));
const safe = value => DOMPurify.sanitize(value || '');
let sequence = 0;
function canLeave() { if (busy.value) return false; if ((dirty.value || quizDirty.value) && !window.confirm('Discard unsaved changes to this guide or learning module?')) return false; dirty.value = false; quizDirty.value = false; emit('dirty', false); return true; }
function selectMode(value) { if (canLeave()) mode.value = value; }
function close() { if (canLeave()) emit('close'); }
async function load() {
  const current = ++sequence;
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get(`${base.value}/${props.manage ? 'workspace' : 'published'}`, { params: { agencyId: Number(props.agencyId) } });
    if (current !== sequence) return;
    state.value = props.manage ? data : { published: data };
    if (!state.value[mode.value]) mode.value = state.value.draft ? 'draft' : state.value.published ? 'published' : 'source';
  } catch (e) { if (current === sequence) error.value = e?.response?.data?.error?.message || 'The guide could not be loaded.'; }
  finally { if (current === sequence) loading.value = false; }
}
async function createDraft(applyCrisisWorkflowUpdate = false) {
  busy.value = true; error.value = '';
  try { await api.post(`${base.value}/draft`, { agencyId: Number(props.agencyId), sourceRevision: state.value.source?.revision, applyCrisisWorkflowUpdate, expectedPublishedVersionId: state.value.published?.version.id || null }); mode.value = 'draft'; await load(); }
  catch (e) { error.value = e?.response?.data?.error?.message || 'Could not create the draft.'; }
  finally { busy.value = false; }
}
async function publish() {
  if (dirty.value || !ready.value || !window.confirm(`Publish this reviewed ${props.documentTitle} for this company? Staff and guide answers will use this edition.`)) return;
  busy.value = true; error.value = '';
  try { await api.post(`${base.value}/publish`, { agencyId: Number(props.agencyId), expectedVersionId: state.value.draft.version.id, expectedRevision: state.value.draft.version.revision }); mode.value = 'published'; await load(); emit('published'); }
  catch (e) { error.value = e?.response?.data?.error?.message || 'Could not publish this edition.'; }
  finally { busy.value = false; }
}
async function answer(payload, options) { const { data } = await api.post(`${base.value}/answer`, { ...payload, agencyId: Number(props.agencyId) }, { ...options, timeout: 240000 }); return data; }
watch(() => [props.agencyId, props.manage, props.documentKey], () => { state.value = {}; mode.value = 'published'; load(); }, { immediate: true });
onBeforeUnmount(() => { sequence++; });
defineExpose({ canLeave });
</script>
<style scoped>
.reference-workspace{min-width:0;font-family:var(--handbook-font,var(--font-ptco));color:#223b39;margin:22px 0}.reference-heading{display:flex;justify-content:space-between;align-items:start;gap:16px;flex-wrap:wrap;margin:24px 0}.reference-heading h2{font:700 27px/1.3 var(--handbook-font,var(--font-ptco));margin:7px 0}.reference-heading p{font-size:13px;line-height:1.7}.eyebrow{font-size:10px!important;letter-spacing:.13em;text-transform:uppercase;color:#61716c}.reference-workspace button{font:inherit;font-size:12px;padding:10px 14px;border:1px solid #cbd9d0;border-radius:6px;background:white;color:#254b3c;cursor:pointer}.reference-workspace button:disabled{opacity:.5;cursor:default}.edition-tabs{display:flex;gap:8px;flex-wrap:wrap}.edition-tabs [aria-pressed=true]{background:#254b3c;color:white}.reference-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:18px 0}.reference-actions p{flex:1;font-size:12px;line-height:1.8;min-width:200px}.reference-error{padding:12px;color:#952f24;background:#fff0ed}.reference-changes{margin:18px 0;padding:18px;background:#f1f5ee;border:1px solid #d6e1d3;border-radius:8px;font-size:13px;line-height:1.8}.reference-changes summary{cursor:pointer;font-weight:600}.reference-changes article{padding:20px 0;border-bottom:1px solid #cedace}.change-comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:18px}.change-comparison>div{min-width:0;overflow-wrap:anywhere;padding:14px;background:white;max-height:440px;overflow:auto}.reference-changes li{margin:8px 0}.reference-workspace:deep(.section-editor){margin-bottom:22px}
</style>
