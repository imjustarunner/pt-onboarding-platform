<template>
  <section class="document-workspace" role="dialog" aria-modal="true" aria-label="Document workspace" @keydown.ctrl.s.prevent="save" @keydown.meta.s.prevent="save">
    <header class="workspace-header">
      <div class="workspace-title">
        <input v-if="canEdit" v-model="draft.name" aria-label="Document name" maxlength="255" placeholder="Untitled document" />
        <h2 v-else>{{ draft.name }}</h2>
        <div class="workspace-meta">
          <span>{{ resource.sourceResourceId ? 'Personal template copy' : resource.scope === 'personal' ? 'Personal document' : 'Organization document' }}</span>
          <span v-if="canEdit" role="status" aria-live="polite">{{ saveStatus }}</span>
          <span v-else>Read only</span>
        </div>
      </div>
      <div class="workspace-actions">
        <button v-if="canEdit" type="button" :disabled="saving || !dirty || conflict" @click="save">Save</button>
        <button type="button" :disabled="copying" @click="makeCopy">{{ copying ? 'Creating copy…' : 'Make my copy' }}</button>
        <button v-if="canDistribute" type="button" :disabled="saving" @click="share">Share…</button>
        <button type="button" :disabled="exporting" @click="download('pdf')">Print / PDF</button>
        <button type="button" :disabled="exporting" @click="download('docx')">Word</button>
        <button type="button" @click="close">Close</button>
      </div>
    </header>
    <div v-if="error" class="workspace-error" role="alert">
      <p>{{ error }}</p>
      <template v-if="conflict">
        <button type="button" :disabled="copying" @click="makeCopy">Keep my edits in a personal copy</button>
        <button type="button" @click="reloadLatest">Load latest version…</button>
      </template>
      <button v-else-if="dirty" type="button" :disabled="saving" @click="save">Retry save</button>
      <button v-if="dirty" type="button" @click="discardAndClose">Discard unsaved changes…</button>
    </div>
    <p v-if="!canEdit" class="workspace-notice">Use “Make my copy” to fill out this template. Your copy will be saved in your library, and the original stays available for everyone.</p>
    <p v-else-if="resource.sourceResourceId" class="workspace-notice">You are editing an independent copy. Changes here do not change the original template.</p>
    <LibraryDocumentEditor v-model="draft.bodyHtml" v-model:branding-mode="draft.brandingMode" v-model:letterhead-template-id="draft.letterheadTemplateId" :name="draft.name" :agency-id="resource.agencyId" :organization-id="resource.organizationId" :readonly="!canEdit" />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import LibraryDocumentEditor from './LibraryDocumentEditor.vue';
import { updateLibraryResource, copyLibraryDocument, exportLibraryDocument, fetchLibraryResource } from '../../services/library.js';
const props = defineProps({ resource: { type: Object, required: true }, canDistribute: Boolean });
const emit = defineEmits(['close', 'saved', 'copied', 'distribute']);
const pickDraft = resource => ({ name: resource.name || 'Untitled document', bodyHtml: resource.bodyHtml || '<p></p>', brandingMode: resource.brandingMode || (resource.letterheadTemplateId ? 'letterhead' : 'plain'), letterheadTemplateId: resource.letterheadTemplateId || null });
const draft = reactive(pickDraft(props.resource));
const baseline = ref(JSON.stringify(draft));
const version = ref(Number(props.resource.version));
const canEdit = computed(() => props.resource.canEdit === true);
const dirty = computed(() => canEdit.value && JSON.stringify(draft) !== baseline.value);
const saving = ref(false);
const copying = ref(false);
const exporting = ref(false);
const error = ref('');
const conflict = ref(false);
const saveStatus = computed(() => saving.value ? 'Saving…' : conflict.value ? 'Save conflict · edits kept here' : error.value && dirty.value ? 'Not saved · retry needed' : dirty.value ? 'Unsaved changes' : 'All changes saved');
let timer;
let pendingSave = null;
let disposed = false;
async function performSave() {
  if (!dirty.value) return true;
  if (conflict.value) return false;
  if (!draft.name.trim()) { error.value = 'Give your document a name before saving.'; return false; }
  saving.value = true; error.value = '';
  try {
    // Serialize saves. Edits made during a request are saved in the next iteration.
    while (dirty.value && !disposed) {
      const snapshot = JSON.stringify(draft);
      const updated = await updateLibraryResource(props.resource.id, { ...JSON.parse(snapshot), agencyId: props.resource.agencyId, expectedVersion: version.value });
      version.value = Number(updated.version);
      baseline.value = snapshot;
      emit('saved', updated);
    }
    return !dirty.value;
  } catch (e) {
    conflict.value = e?.response?.status === 409;
    error.value = e?.response?.data?.error?.message || 'Your changes could not be saved. Keep this window open and retry.';
    return false;
  } finally { saving.value = false; }
}
async function save() {
  clearTimeout(timer);
  if (pendingSave) return pendingSave;
  pendingSave = performSave();
  try { return await pendingSave; } finally { pendingSave = null; }
}
watch(draft, () => { clearTimeout(timer); if (dirty.value && !conflict.value && !error.value) timer = setTimeout(save, 1000); });
async function makeCopy() {
  copying.value = true; error.value = '';
  clearTimeout(timer);
  try {
    if (pendingSave) await pendingSave;
    const copy = await copyLibraryDocument(props.resource.id, { ...draft, name: `${draft.name.slice(0, 240)} — My copy`, agencyId: props.resource.agencyId });
    baseline.value = JSON.stringify(draft);
    emit('copied', copy);
  } catch (e) { error.value = e?.response?.data?.error?.message || 'Could not create your copy. Your edits are still here.'; }
  finally { copying.value = false; }
}
async function reloadLatest() {
  if (!window.confirm('Replace your unsaved edits with the latest saved version? Make a personal copy first if you want to keep both.')) return;
  try {
    const latest = await fetchLibraryResource(props.resource.id, { agencyId: props.resource.agencyId });
    baseline.value = JSON.stringify(pickDraft(latest));
    Object.assign(draft, pickDraft(latest)); version.value = Number(latest.version);
    error.value = ''; conflict.value = false; emit('saved', latest);
  } catch { error.value = 'Could not load the latest version. Your edits are still here.'; }
}
async function download(format) {
  if (!(await save())) return;
  exporting.value = true; error.value = '';
  try {
    const blob = await exportLibraryDocument(props.resource.id, format, props.resource.agencyId);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${draft.name.replace(/[<>:"/\\|?*]/g, '_')}.${format}`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch { error.value = 'Could not export the document. Please retry.'; }
  finally { exporting.value = false; }
}
async function share() { if (await save()) emit('distribute'); }
async function close() { if (await save()) emit('close'); }
function discardAndClose() {
  if (window.confirm('Discard your unsaved changes and close this document?')) { baseline.value = JSON.stringify(draft); emit('close'); }
}
function beforeUnload(event) { if (dirty.value || saving.value) { event.preventDefault(); event.returnValue = ''; } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); window.removeEventListener('beforeunload', beforeUnload); });
defineExpose({ prepareToLeave: save });
</script>

<style scoped>
.document-workspace { height: 100%; overflow: auto; background: #f0f2f5; border-radius: 12px; }
.workspace-header { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 16px; padding: 18px; background: white; border-bottom: 1px solid #dce1e7; }
.workspace-title { flex: 1; min-width: 220px; }
.workspace-title input { width: 100%; padding: 5px 0; border: 0; border-bottom: 1px solid #e2e8f0; font-size: 21px; font-weight: 600; color: #172033; background: transparent; }
.workspace-title h2 { margin: 0; font-size: 21px; }
.workspace-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #64748b; margin-top: 8px; }
.workspace-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.workspace-actions button,.workspace-error button { min-height: 36px; border: 1px solid #d6dce4; border-radius: 7px; background: white; color: #172033; padding: 6px 10px; cursor: pointer; }
.workspace-actions button:disabled { opacity: .5; }
.workspace-error { padding: 12px 18px; background: #fff1f0; color: #9d2525; }
.workspace-error p { margin: 0 0 8px; }
.workspace-error button { margin: 0 6px 4px 0; }
.workspace-notice { font-size: 13px; margin: 0; padding: 12px 18px; background: #eef4fa; color: #3d5674; }
</style>
