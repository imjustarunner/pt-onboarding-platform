<template>
  <div class="setup-document-preview">
    <button type="button" @click="open = !open">{{ open ? 'Close preview' : 'Preview document' }}</button>
    <template v-if="open">
      <p v-if="loading" role="status">Opening document…</p>
      <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Try again</button></p>
      <template v-else-if="blobUrl">
        <PDFPreview v-if="mime === 'application/pdf'" :pdf-url="blobUrl" :aria-label="`${title} preview`" />
        <img v-else-if="mime.startsWith('image/')" :src="blobUrl" :alt="title" />
        <a :href="blobUrl" target="_blank" rel="noopener" :download="mime !== 'application/pdf' && !mime.startsWith('image/') ? title : undefined">{{ mime === 'application/pdf' ? 'Open full document' : 'Download document' }}</a>
      </template>
    </template>
  </div>
</template>
<script setup>
import { defineAsyncComponent, ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
const PDFPreview = defineAsyncComponent(() => import('../documents/PDFPreview.vue').then(module => module.default));
const props = defineProps({ title: String, agencyId: [Number, String], jobId: [Number, String], documentId: String, templateId: [Number, String] });
const open = ref(false), loading = ref(false), error = ref(''), blobUrl = ref(''), mime = ref('');
let generation = 0, controller;
function clear() { if (blobUrl.value) URL.revokeObjectURL(blobUrl.value); blobUrl.value = ''; }
async function load() {
  controller?.abort(); controller = new AbortController();
  const current = ++generation; clear(); error.value = ''; loading.value = true;
  try {
    const { data } = await api.get('/hiring/packet-preview/document', { params: { agencyId: props.agencyId, jobId: props.jobId, documentId: props.documentId, templateId: props.templateId }, responseType: 'blob', signal: controller.signal, timeout: 90000, skipGlobalLoading: true });
    if (current !== generation) return;
    mime.value = data.type || 'application/octet-stream'; blobUrl.value = URL.createObjectURL(data);
  } catch (e) {
    if (current !== generation) return;
    let message;
    try { message = JSON.parse(await e.response?.data?.text()).error?.message; } catch { /* use the actionable fallback */ }
    if (current === generation) error.value = message || 'Could not open this document. Try again or check its source in the job settings.';
  } finally { if (current === generation) loading.value = false; }
}
watch(() => [open.value, props.agencyId, props.jobId, props.documentId, props.templateId], () => { if (open.value) load(); else { generation++; controller?.abort(); clear(); } });
onBeforeUnmount(() => { generation++; controller?.abort(); clear(); });
</script>
<style scoped>
.setup-document-preview{display:grid;gap:14px;margin:14px 0;min-width:0}.setup-document-preview button{justify-self:start;padding:10px 16px;border:1px solid #cbd7e2;border-radius:8px;background:white;color:#243b53;font:inherit;cursor:pointer}.setup-document-preview :deep(.viewer){max-height:65vh;overflow:auto}img{max-width:100%;max-height:65vh;object-fit:contain}
</style>
