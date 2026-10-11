<template>
  <section class="handbook-workspace" :style="{ '--handbook-font': handbookFont }">
    <p v-if="loading" role="status">Loading handbook…</p>
    <p v-if="error" class="workspace-error" role="alert">{{ error }} <button type="button" @click="load">Reload</button></p>
    <p v-if="success" class="workspace-success" role="status">{{ success }}</p>
    <template v-if="workspace">
      <div class="workspace-toolbar">
        <div><strong>Handbook workspace</strong><p>Review supplied sections, then publish them for your team.</p></div>
        <div class="workspace-actions">
          <label v-if="options.length > 1">View <select :value="view" @change="changeView($event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          <button v-if="canStage" type="button" :disabled="busy" @click="stage">Add supplied content to draft</button>
          <button v-if="workspace.draft || workspace.published?.version" type="button" :disabled="busy" @click="startEditing">Edit sections</button>
        </div>
      </div>
      <div v-if="workspace.draft && view === 'draft'" class="publish-box">
        <div><strong>Ready for review · Draft v{{ workspace.draft.version.version_number }}</strong><p>{{ workspace.published.version ? `${workspace.changes.length} section changes will be added to Handbook Updates when published.` : 'This first transfer establishes the handbook. It will not announce every imported section as a policy change.' }}</p></div>
        <label>Publication note <input v-model="publicationNote" placeholder="Reason for this update (optional)" /></label>
        <details v-if="workspace.changes.length"><summary>Review section changes</summary><ul><li v-for="change in workspace.changes" :key="change.slug"><strong>{{ change.kind }}</strong> · {{ change.title }}</li></ul></details>
        <details v-if="workspace.draft.requiredCompanySections?.length" open><summary>Complete {{ workspace.draft.requiredCompanySections.length }} company setup topics before publishing</summary><ul><li v-for="topic in workspace.draft.requiredCompanySections" :key="topic.slug">{{ topic.title }}</li></ul><p>Use Edit sections to fill in the company's actual policies. If a program or benefit is not offered, state that explicitly.</p></details>
        <button type="button" class="publish-button" :disabled="busy || editorDirty || !!workspace.draft.requiredCompanySections?.length" @click="publish">{{ busy ? 'Saving…' : 'Publish handbook' }}</button>
      </div>
      <HandbookSectionEditor v-if="editing && view === 'draft' && workspace.draft" :agency-id="agencyId" :version-id="Number(workspace.draft.version.id)" :sections="workspace.draft.sections" :required-sections="workspace.draft.metadata?.template?.requiredSections || []" @dirty="editorDirty = $event" @saved="sectionSaved" />
      <p v-if="view !== 'published' && reviewUpdates.length" class="review-note">{{ reviewUpdates.filter(e => e.status === 'draft').length }} existing draft updates are connected to the relevant sections for review. Publishing the handbook does not publish these draft updates.</p>
      <p v-if="shown && view !== 'published'" class="review-note">Handbook Q&amp;A becomes available in the published handbook view.</p>
      <WorkplaceHandbookBook v-if="shown" ref="book" :handbook="shown" :analytics="{ agencyId, surface: 'handbook', enabled: view === 'published' }" :updates="view === 'published' ? updates : reviewUpdates" :full-handbook-url="fullHandbookUrl" :can-open-original="workspace.access?.canOpenOriginal === true" :can-print="workspace.access?.canPrint === true" :answer-question="view === 'published' ? answerQuestion : null" @reload="load('published')" />
      <p v-else>No in-app handbook has been supplied for this organization yet. Its existing updates and original handbook link remain available.</p>
      <details v-if="workspace.source?.importNotes?.length" class="import-notes"><summary>Source review · {{ workspace.source.importNotes.length }} notes</summary><div v-for="note in workspace.source.importNotes" :key="note.key"><p>{{ note.message }}</p><details v-if="note.sourceExcerpts"><summary>Preserved source excerpts</summary><p v-for="(excerpt, index) in note.sourceExcerpts" :key="index">{{ excerpt.text }} <small>(Original p. {{ excerpt.sourcePage }})</small></p></details></div></details>
    </template>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import api from '../../services/api';
import WorkplaceHandbookBook from './WorkplaceHandbookBook.vue';
import HandbookSectionEditor from './HandbookSectionEditor.vue';
const props = defineProps({ agencyId: { type: [Number, String], required: true }, adminUpdateId: { type: [Number, String], default: null }, pushId: { type: [Number, String], default: null }, updates: { type: Array, default: () => [] }, fullHandbookUrl: { type: String, default: '' } });
const emit = defineEmits(['published', 'sections', 'dirty', 'draft-changed']);
const workspace = ref(null);
const book = ref(null);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const success = ref('');
const view = ref('source');
const publicationNote = ref('');
const editing = ref(false);
const editorDirty = ref(false);
watch(editorDirty, value => emit('dirty', value));
function changeView(value) {
  if (editorDirty.value && !window.confirm('Discard unsaved section changes?')) return;
  editorDirty.value = false; view.value = value;
}
async function startEditing() {
  if (editorDirty.value) { view.value = 'draft'; return; }
  busy.value = true; error.value = '';
  try {
    await api.get('/provider-update/handbook/draft', { params: { agencyId: props.agencyId } });
    await load('draft'); editing.value = true; emit('draft-changed');
  } catch (e) { error.value = e?.response?.data?.error?.message || 'The draft could not be opened.'; }
  finally { busy.value = false; }
}
async function sectionSaved() { editorDirty.value = false; await load('draft'); success.value = 'Section saved to the draft. Publish to update the team handbook.'; }
const reviewUpdates = computed(() => workspace.value?.reviewUpdates || workspace.value?.source?.reviewUpdates || []);
let request = 0;
const options = computed(() => [workspace.value?.draft && { value: 'draft', label: 'Draft' }, workspace.value?.published?.version && { value: 'published', label: 'Published handbook' }, workspace.value?.source && { value: 'source', label: 'Supplied content' }].filter(Boolean));
const canStage = computed(() => workspace.value?.source && workspace.value.source.revision !== workspace.value.published?.version?.source_revision && workspace.value.source.revision !== workspace.value.draft?.version?.source_revision);
const shown = computed(() => {
  if (view.value === 'source' && workspace.value?.source) return { sections: workspace.value.source.sections, metadata: workspace.value.source };
  return workspace.value?.[view.value];
});
const handbookFont = computed(() => ({ 'itsco-foundations': 'var(--font-itsco)', 'nlu-foundations': 'var(--font-nlu)', 'isi-foundations': 'var(--font-isi)' }[shown.value?.metadata?.presentation?.theme] || 'var(--font-ptco)'));
async function openSection(slug) {
  if (editorDirty.value && !window.confirm('Discard unsaved section changes to open another policy?')) return;
  editorDirty.value = false;
  // Admin links target the current supplied policy even before first publication.
  const candidates = ['source', 'draft', 'published'];
  const available = candidates.find(key => workspace.value?.[key]?.sections?.some(s => s.slug === slug && s.content_status !== 'pending' && s.body_html));
  if (!available) return;
  view.value = available;
  await nextTick();
  await book.value?.selectSection(slug, true);
}
defineExpose({ openSection });
async function answerQuestion(payload, options) {
  const { data } = await api.post('/provider-update/handbook/answer', { ...payload, agencyId: Number(props.agencyId) }, { ...options, timeout: 240000 });
  return data;
}
async function load(preferred) {
  const currentRequest = ++request;
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/provider-update/handbook/workspace', { params: { agencyId: props.agencyId } });
    if (currentRequest !== request) return;
    workspace.value = data;
    view.value = typeof preferred === 'string' ? preferred : data.draft?.sections?.some(s => s.content_status !== 'pending') ? 'draft' : data.published?.version ? 'published' : data.source ? 'source' : 'draft';
    emit('sections', data.source?.sections || data.draft?.sections || data.published?.sections || []);
  } catch (e) { if (currentRequest === request) error.value = e?.response?.data?.error?.message || 'The handbook could not be loaded.'; }
  finally { if (currentRequest === request) loading.value = false; }
}
async function stage() {
  busy.value = true; error.value = ''; success.value = '';
  try {
    await api.post('/provider-update/handbook/source/stage', { agencyId: Number(props.agencyId), sourceRevision: workspace.value.source.revision, expectedPublishedVersionId: workspace.value.published?.version?.id || null });
    await load('draft'); success.value = 'Supplied content is in the draft. Review it below before publishing.'; emit('draft-changed');
  } catch (e) { error.value = e?.response?.data?.error?.message || 'The draft could not be prepared.'; }
  finally { busy.value = false; }
}
async function publish() {
  busy.value = true; error.value = ''; success.value = '';
  try {
    const { data } = await api.post('/provider-update/handbook/publish', { agencyId: Number(props.agencyId), versionId: workspace.value.draft.version.id, changelog: publicationNote.value, adminUpdateId: props.adminUpdateId || null, pushId: props.pushId || null });
    await load('published');
    success.value = data.publication?.digestId ? 'Handbook published. Its changes were added to a draft in Handbook Updates for review.' : 'Handbook published.';
    publicationNote.value = ''; emit('published', data.publication);
  } catch (e) { error.value = e?.response?.data?.error?.message || 'The handbook could not be published.'; }
  finally { busy.value = false; }
}
watch(() => props.agencyId, () => { workspace.value = null; editing.value = false; editorDirty.value = false; load(); }, { immediate: true });
</script>

<style scoped>
.handbook-workspace { font-family: var(--handbook-font); display: grid; gap: 18px; }.workspace-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }.workspace-toolbar strong { font-size: 20px; color: #12583f; }.workspace-toolbar p,.publish-box p { font-size: 13px; color: #637267; margin: 6px 0; }.workspace-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }.workspace-actions label { display: flex; align-items: center; gap: 8px; font-size: 12px; }.handbook-workspace button,.handbook-workspace select,.publish-box input { padding: 10px 13px; border-radius: 6px; border: 1px solid #cdd9c6; color: #12583f; background: white; font: inherit; font-size: 12px; }.handbook-workspace button { cursor: pointer; }.handbook-workspace button:disabled { opacity: .5; cursor: default; }.publish-box { display: grid; gap: 12px; background: #f0f5e9; border: 1px solid #cdd9c6; border-radius: 10px; padding: 20px; }.publish-box label { display: grid; gap: 6px; font-size: 12px; }.publish-box .publish-button { justify-self: start; background: #12583f; color: white; }.publish-box details { font-size: 13px; }.import-notes { font-size: 12px; line-height: 1.8; color: #617056; border: 1px solid #dce3d6; border-radius: 8px; padding: 14px 18px; }.import-notes>div { border-top: 1px solid #dce3d6; margin-top: 12px; }.workspace-error { color: #a13222; }.workspace-success { color: #12583f; }.handbook-workspace :focus-visible { outline: 2px solid #12583f; outline-offset: 3px; }
</style>
