<template>
  <section class="aw-archive" aria-labelledby="aw-archive-title">
    <h3 id="aw-archive-title">Medical history PDF</h3>
    <p>Choose this client’s export from the previous EHR. Large PDFs are split into complete, ordered volumes below 25 MB and saved with a page manifest. No old notes are turned into new sessions or claims.</p>
    <label>Client-specific PDF <input ref="fileInput" type="file" accept="application/pdf,.pdf" :disabled="busy" @change="chooseFile" /></label>
    <p v-if="busy" role="status">{{ progress }}</p>
    <p v-if="error" role="alert" class="aw-error">{{ error }}</p>
    <div v-if="archive" class="aw-archive-review">
      <p><strong>{{ archive.filename }}</strong> · {{ archive.pageCount }} pages · {{ archive.parts.length }} volume(s)</p>
      <p v-if="archive.parts.length > 1">Volumes retain the page contents. Keep the original export for any original PDF digital signatures or embedded attachments.</p>
      <ol><li v-for="part in archive.parts" :key="part.title">Pages {{ part.startPage }}–{{ part.endPage }} · {{ (part.bytes.byteLength / 1024 / 1024).toFixed(2) }} MB</li></ol>
      <label class="aw-check"><input v-model="identityConfirmed" type="checkbox" :disabled="busy" />I checked that every page belongs to {{ clientLabel || 'this client' }} (chart #{{ clientId }}).</label>
      <button type="button" class="btn btn-primary" :disabled="busy || !identityConfirmed" @click="upload">{{ busy ? 'Working…' : 'Save PDF history to this chart' }}</button>
    </div>
    <div v-if="savedDocuments.length">
      <p role="status">The archive and manifest are saved. Open or download every volume and check completeness.</p>
      <ul><li v-for="doc in savedDocuments" :key="doc.id"><button type="button" class="aw-link" :disabled="busy" @click="download(doc)">{{ doc.isManifest ? 'Open / download manifest' : doc.original_name || doc.document_title || `Volume #${doc.id}` }}</button></li></ul>
      <label class="aw-check"><input v-model="downloadVerified" type="checkbox" :disabled="busy" @change="emit('saved', { clientId, verified: downloadVerified, documents: savedDocuments })" />I opened/downloaded every volume and verified the full history.</label>
    </div>
    <details><summary>Keep history in the previous EHR for now</summary><p>If an export cannot be stored yet, retain access in TherapyNotes or the previous EHR. Enter a reminder for this client; history remains marked as pending.</p><label>Location / owner / follow-up <textarea v-model="fallback" rows="3" :disabled="busy" placeholder="History stays in TherapyNotes; assigned owner and follow-up date…" /></label><button type="button" class="btn btn-secondary" :disabled="busy || !fallback.trim()" @click="saveFallback">Save archive follow-up on this chart</button><p v-if="fallbackSaved" role="status">Follow-up saved. The archive is still pending.</p></details>
  </section>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import { prepareMedicalArchive, uploadMedicalArchive } from '../../utils/auricwellMedicalArchive.js';
const props = defineProps({ agencyId: { type: [Number, String], required: true }, clientId: { type: [Number, String], required: true }, clientLabel: { type: String, default: '' } });
const emit = defineEmits(['saved', 'busy']);
const archive = ref(null), busy = ref(false), error = ref(''), progress = ref(''), identityConfirmed = ref(false), downloadVerified = ref(false), savedDocuments = ref([]), fallback = ref(''), fallbackSaved = ref(false), fileInput = ref(null);
let generation = 0;
onBeforeUnmount(() => { generation++; });
watch(() => [props.agencyId, props.clientId], () => { generation++; archive.value = null; error.value = ''; identityConfirmed.value = false; downloadVerified.value = false; savedDocuments.value = []; fallback.value = ''; fallbackSaved.value = false; if (fileInput.value) fileInput.value.value = ''; }, { flush: 'sync' });
watch(busy, value => emit('busy', value));
function contextGuard(id) { if (id !== generation) throw new Error('The selected client changed. Review this chart before continuing.'); }
function message(e) { return e.response?.data?.error?.message || e.message || 'The medical archive could not be saved.'; }
async function chooseFile(event) {
  const file = event.target.files?.[0]; if (!file || busy.value) return;
  const id = generation; busy.value = true; error.value = ''; archive.value = null; savedDocuments.value = []; identityConfirmed.value = false; downloadVerified.value = false; progress.value = 'Reading PDF and preparing complete page volumes…';
  try { const prepared = await prepareMedicalArchive(await file.arrayBuffer(), { filename: file.name, onProgress: ({ pages, total }) => { contextGuard(id); progress.value = `Prepared pages ${pages} of ${total}…`; } }); contextGuard(id); archive.value = prepared; }
  catch (e) { error.value = message(e); } finally { busy.value = false; }
}
async function upload() {
  if (!archive.value || !identityConfirmed.value || busy.value) return;
  const id = generation; busy.value = true; error.value = ''; progress.value = 'Checking already uploaded volumes…';
  try { savedDocuments.value = await uploadMedicalArchive(api, Number(props.clientId), archive.value, { assertContext: () => contextGuard(id), onProgress: ({ uploaded, total }) => { progress.value = `Saved ${uploaded} of ${total} archive files…`; } }); emit('saved', { clientId: props.clientId, verified: false, documents: savedDocuments.value }); }
  catch (e) { error.value = message(e); } finally { busy.value = false; }
}
async function download(doc) {
  const id = generation; busy.value = true; error.value = ''; progress.value = 'Opening authorized download…';
  const popup = window.open('about:blank', '_blank');
  try {
    const response = await api.get(`/phi-documents/${doc.id}/view`, { responseType: 'blob', skipGlobalLoading: true }); contextGuard(id);
    const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: response.headers?.['content-type'] || 'application/pdf' });
    let url;
    if (String(response.headers?.['content-type'] || blob.type).includes('application/json')) { const result = JSON.parse(await blob.text()); url = result.url; if (!/^https:\/\//.test(url || '')) throw new Error('The authorized download link was unavailable.'); }
    else { url = URL.createObjectURL(blob); setTimeout(() => URL.revokeObjectURL(url), 120000); }
    if (popup) { popup.opener = null; popup.location.href = url; }
    else { const link = document.createElement('a'); link.href = url; link.download = doc.original_name || 'medical-history.pdf'; link.target = '_blank'; link.rel = 'noopener'; link.click(); }
  } catch (e) { popup?.close(); error.value = message(e); } finally { busy.value = false; }
}
async function saveFallback() {
  if (busy.value || !fallback.value.trim()) return;
  const id = generation; busy.value = true; error.value = ''; progress.value = 'Saving archive follow-up…';
  try { await api.post(`/clients/${props.clientId}/notes`, { message: `AuricWell EHR transition — medical archive PENDING. ${fallback.value.trim()}`, is_internal_only: true, category: 'general', urgency: 'low' }, { skipGlobalLoading: true }); contextGuard(id); fallbackSaved.value = true; emit('saved', { clientId: props.clientId, verified: false, fallback: true }); }
  catch (e) { error.value = message(e); } finally { busy.value = false; }
}
</script>
<style scoped>
.aw-archive { padding:20px; border:1px solid var(--border,#d7e1e8); border-radius:12px; }.aw-archive p{max-width:85ch;line-height:1.6}.aw-archive label{display:block;margin:12px 0}.aw-archive textarea{width:100%;box-sizing:border-box}.aw-check{display:flex!important;align-items:flex-start;gap:8px}.aw-error{color:var(--danger,#b42318)}.aw-link{border:0;background:none;color:var(--primary,#1555b0);text-decoration:underline;cursor:pointer;padding:6px 0}.aw-archive details{margin-top:20px}.aw-archive summary{cursor:pointer;font-weight:600}
</style>
