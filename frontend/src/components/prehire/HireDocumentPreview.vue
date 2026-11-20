<template><div class="pdf-preview"><p v-if="loading" role="status">Preparing your branded document…</p><div v-else-if="error" role="alert"><p>{{ error }}</p><a v-if="blobUrl" :href="blobUrl" target="_blank" rel="noopener">Open full PDF</a><button type="button" @click="load">Try again</button></div><template v-else><PDFDocumentFillEditor v-if="editable" :pdf-url="blobUrl" :model-value="modelValue" :signature-data="signatureData" :field-definitions="fieldDefinitions" :field-values="fieldValues" @update:field-values="emit('update:fieldValues', $event)" @update:model-value="emit('update:modelValue', $event)" @ready="handleReady" /><PDFPreview v-else :pdf-url="blobUrl" @loaded="handleReady(true)" /><a :href="blobUrl" target="_blank" rel="noopener">Open full PDF</a></template></div></template>
<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import PDFDocumentFillEditor from '../documents/PDFDocumentFillEditor.vue';
import PDFPreview from '../documents/PDFPreview.vue';
const props = defineProps({ http: Object, url: String, title: String, editable: Boolean, modelValue: { type: Array, default: () => [] }, signatureData: String, fieldDefinitions: { type: Array, default: () => [] }, fieldValues: { type: Object, default: () => ({}) } });
const emit = defineEmits(['ready', 'update:modelValue', 'update:fieldValues']);
const loading = ref(true), error = ref(''), blobUrl = ref('');
let generation = 0;
const previewTimeoutMs = 90000;
const timeoutMessage = 'This document is taking longer than expected to open. Please try again or contact People Operations if it keeps happening.';
let controller, previewTimer;
function clearPreviewTimer() { clearTimeout(previewTimer); previewTimer = undefined; }
function startPreviewTimer() {
  clearPreviewTimer();
  const request = generation;
  previewTimer = setTimeout(() => {
    if (request !== generation) return;
    generation++;
    controller?.abort();
    loading.value = false;
    error.value = timeoutMessage;
    emit('ready', false);
    clearPreviewTimer();
  }, previewTimeoutMs);
}
function handleReady(ready) {
  if (loading.value || error.value) return;
  if (ready) clearPreviewTimer();
  else startPreviewTimer();
  emit('ready', ready);
}
async function load() {
  controller?.abort();
  controller = new AbortController();
  const request = ++generation; loading.value = true; error.value = ''; emit('ready', false);
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = '';
  startPreviewTimer();
  try {
    const response = await props.http.get(props.url, { responseType: 'blob', timeout: previewTimeoutMs, signal: controller.signal });
    if (request !== generation) return;
    if (!response.data.type.includes('pdf')) throw new Error('The document is not available as a PDF yet.');
    if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
    blobUrl.value = URL.createObjectURL(response.data);
  } catch (e) {
    if (request === generation) {
      clearPreviewTimer();
      error.value = ['ECONNABORTED', 'ETIMEDOUT'].includes(e.code) ? timeoutMessage : e.message === 'The document is not available as a PDF yet.' ? e.message : 'The PDF could not be prepared. Please retry or contact People Operations.';
    }
  }
  finally { if (request === generation) loading.value = false; }
}
watch(() => props.url, load); onMounted(load);
onBeforeUnmount(() => { generation++; controller?.abort(); clearPreviewTimer(); if (blobUrl.value) URL.revokeObjectURL(blobUrl.value); });
</script>
<style scoped>.pdf-preview{margin:15px 0;background:#eef1f4;padding:12px;border-radius:6px}.pdf-preview iframe{width:100%;height:650px;border:0}.pdf-preview a{display:inline-block;margin-top:10px;font-size:13px}.pdf-preview button{padding:8px 14px}@media(max-width:600px){.pdf-preview iframe{height:500px}}</style>
