<template>
  <section class="pdf-workspace" aria-label="PDF document workspace" :aria-busy="loading || saving">
    <header class="pdf-heading">
      <div><span class="pdf-label">PDF DOCUMENT <span v-if="resource.scope === 'personal'">· MY DOCUMENT</span></span><h2>{{ resource.name }}</h2></div>
      <div class="pdf-actions">
        <button type="button" :disabled="!pdfUrl || saving" @click="download">Download PDF</button>
        <button v-if="canDistribute" type="button" :disabled="saving" @click="distribute">Share…</button>
        <button type="button" :disabled="saving" @click="close">Close</button>
      </div>
    </header>
    <p v-if="loading" class="pdf-state" role="status">Opening your document…</p>
    <div v-else-if="loadError" class="pdf-state" role="alert"><p>{{ loadError }}</p><button type="button" @click="load">Try again</button></div>
    <template v-else-if="pdfUrl">
      <div class="pdf-savebar">
        <div><strong>Fill &amp; sign</strong><span>Fill highlighted fields or place text, dates, checkmarks and your signature on the page.</span></div>
        <button type="button" @click="showSignature = !showSignature">{{ signatureData ? 'Edit my signature' : 'Add my signature' }}</button>
        <button class="primary" type="button" :disabled="saving || !ready" @click="showSave = !showSave">Save filled copy</button>
      </div>
      <div v-if="showSignature" class="pdf-signature">
        <AdaptiveSignatureCapture v-model="signatureData" title="Your signature" subtitle="Type or draw your signature, then choose My signature in the document toolbar to place it." legal-notice="Your signature is placed only on the personal copy you save." />
      </div>
      <div v-if="showSave" class="pdf-savepanel">
        <label>Copy name<input v-model="copyName" maxlength="255" /></label>
        <p>Saved as a personal copy in this library. The shared original stays unchanged. Saved entries become part of the PDF.</p>
        <label v-if="hasSignature" class="pdf-consent"><input v-model="signatureConsent" type="checkbox" />I intend to place my signature on this document.</label>
        <div class="pdf-actions"><button type="button" :disabled="saving" @click="showSave = false">Keep editing</button><button class="primary" type="button" :disabled="saving || !ready || !copyName.trim() || (hasSignature && (!signatureData || !signatureConsent))" @click="save">{{ saving ? 'Saving…' : 'Save my copy' }}</button></div>
        <p v-if="hasSignature && !signatureData" role="status">Capture your signature above before saving.</p>
      </div>
      <p v-if="error" class="pdf-error" role="alert">{{ error }}</p>
      <PDFDocumentFillEditor ref="editor" :pdf-url="pdfUrl" v-model="entries" v-model:field-values="fieldValues" :signature-data="signatureData" auto-detect-fields initial-tool="select" @ready="ready = $event" @fields-detected="setInitialSnapshot" />
    </template>
  </section>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue';
import PDFDocumentFillEditor from '../documents/PDFDocumentFillEditor.vue';
import AdaptiveSignatureCapture from '../adaptive-intake/AdaptiveSignatureCapture.vue';
import { fetchLibraryPdf, saveLibraryPdfCopy } from '../../services/library';

const props = defineProps({ resource: { type: Object, required: true }, canDistribute: Boolean });
const emit = defineEmits(['close', 'copied', 'distribute']);
const loading = ref(true), saving = ref(false), ready = ref(false), loadError = ref(''), error = ref('');
const pdfUrl = ref(''), entries = ref([]), fieldValues = ref({}), signatureData = ref(''), signatureConsent = ref(false);
const showSignature = ref(false), showSave = ref(false), copyName = ref('');
let request = null, generation = 0, initialSnapshot = '', saved = false;
const hasSignature = computed(() => entries.value.some(entry => entry.kind === 'signature'));
const snapshot = () => JSON.stringify({ entries: entries.value, fieldValues: fieldValues.value });
const isDirty = () => !saved && initialSnapshot && initialSnapshot !== snapshot();
async function setInitialSnapshot() { await nextTick(); initialSnapshot = snapshot(); }
function prepareToLeave() { return !saving.value && (!isDirty() || window.confirm('Your entries have not been saved. Discard them and leave this document?')); }
function close() { if (prepareToLeave()) emit('close'); }
function distribute() { if (isDirty()) { showSave.value = true; error.value = 'Save your filled copy before sharing it.'; return; } emit('distribute'); }
function release() { if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value); pdfUrl.value = ''; }
async function load() {
  const current = ++generation; request?.abort(); request = new AbortController(); release();
  loading.value = true; loadError.value = ''; ready.value = false; error.value = ''; initialSnapshot = ''; saved = false;
  entries.value = []; fieldValues.value = {}; signatureData.value = ''; signatureConsent.value = false; showSave.value = false;
  copyName.value = `${props.resource.name.replace(/\.pdf$/i, '').slice(0, 230)} — filled copy`;
  try { const blob = await fetchLibraryPdf(props.resource.id, props.resource.agencyId, request.signal); if (current === generation) pdfUrl.value = URL.createObjectURL(blob); }
  catch (e) { if (current === generation) loadError.value = e.message || 'The PDF could not be opened.'; }
  finally { if (current === generation) loading.value = false; }
}
async function save() {
  if (saving.value || !ready.value) return;
  saving.value = true; error.value = '';
  try {
    const copy = await saveLibraryPdfCopy(props.resource.id, { agencyId: props.resource.agencyId, name: copyName.value.trim(), expectedVersion: Number(props.resource.version || 1), entries: entries.value, fieldValues: fieldValues.value, signatureData: hasSignature.value ? signatureData.value : undefined, signatureConsent: hasSignature.value && signatureConsent.value });
    saved = true; saving.value = false; emit('copied', copy);
  } catch (e) { error.value = e.response?.data?.error?.message || e.message || 'The copy could not be saved. Your entries are still here.'; }
  finally { saving.value = false; }
}
function download() {
  if (isDirty()) { showSave.value = true; error.value = 'Save your filled copy first, then download that copy with your entries included.'; return; }
  const a = document.createElement('a'); a.href = pdfUrl.value; a.download = props.resource.originalFilename || `${props.resource.name}.pdf`; a.click();
}
function beforeUnload(event) { if (isDirty() || saving.value) { event.preventDefault(); event.returnValue = ''; } }
window.addEventListener('beforeunload', beforeUnload);
watch(() => [props.resource.id, props.resource.agencyId], load, { immediate: true });
onBeforeUnmount(() => { generation++; request?.abort(); release(); window.removeEventListener('beforeunload', beforeUnload); });
defineExpose({ prepareToLeave });
</script>

<style scoped>
.pdf-workspace{height:100%;overflow:auto;background:#f5f7f8;color:#21333b;border-radius:12px;font:14px/1.5 Inter,system-ui,sans-serif}.pdf-heading{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:16px 22px;background:white;border-bottom:1px solid #e2e8e6}.pdf-heading h2{font:600 18px/1.4 Inter,system-ui,sans-serif;margin:3px 0 0;overflow-wrap:anywhere}.pdf-label{font-size:10px;letter-spacing:1.3px;color:#63736e}.pdf-actions{display:flex;gap:8px;flex-wrap:wrap}.pdf-workspace button{font:500 13px/1.4 Inter,system-ui,sans-serif;padding:10px 14px;min-height:40px;border:1px solid #cbd8d3;border-radius:7px;background:white;color:#234b3e;cursor:pointer}.pdf-workspace button.primary{background:#185540;border-color:#185540;color:white}.pdf-workspace button:disabled{opacity:.5;cursor:default}.pdf-savebar{display:flex;align-items:center;gap:12px;padding:14px 22px;background:#edf4f0;border-bottom:1px solid #d5e1da}.pdf-savebar>div{flex:1;display:grid;gap:2px}.pdf-savebar span{font-size:12px;color:#53675d}.pdf-savepanel,.pdf-signature{margin:16px 22px;padding:18px;border:1px solid #ceddd5;border-radius:8px;background:white}.pdf-signature{max-width:650px}.pdf-savepanel>label:not(.pdf-consent){display:grid;gap:5px;font-size:13px;font-weight:600}.pdf-savepanel input:not([type=checkbox]){font:inherit;padding:10px;border:1px solid #b5c9bd;border-radius:6px;max-width:700px}.pdf-savepanel p{font-size:13px;color:#53675d;margin:10px 0}.pdf-consent{display:flex;align-items:center;gap:10px;margin:16px 0;cursor:pointer}.pdf-consent input{width:22px;height:22px;accent-color:#185540}.pdf-error{color:#8e3027;background:#fff0ed;border:1px solid #eebeb5;padding:12px 18px;margin:16px 22px;border-radius:6px}.pdf-state{padding:40px}.pdf-workspace :deep(.fill-editor){padding:18px 22px}.pdf-workspace :deep(.page-scroll){border:1px solid #d9dfdc;box-shadow:0 3px 14px #19342a0c}.pdf-workspace :deep(.entry-controls){background:white}.pdf-workspace :deep(.fill-tools){font-size:12px}.pdf-workspace :deep(.fill-tools button){font-size:12px}.pdf-workspace :deep(.ai-signature-panel){margin:0}
@media(max-width:700px){.pdf-heading,.pdf-savebar{flex-wrap:wrap;padding:12px}.pdf-savebar>div{flex-basis:100%}.pdf-heading h2{font-size:16px}.pdf-workspace :deep(.fill-editor){padding:12px}.pdf-savepanel,.pdf-signature{margin:12px;padding:12px}}
</style>
