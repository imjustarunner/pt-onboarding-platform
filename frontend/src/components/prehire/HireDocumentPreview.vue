<template><div class="pdf-preview"><p v-if="loading" role="status">Preparing your branded document…</p><div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" @click="load">Try again</button></div><template v-else><iframe :src="blobUrl" :title="title" /><a :href="blobUrl" target="_blank" rel="noopener">Open full PDF</a></template></div></template>
<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
const props = defineProps({ http: Object, url: String, title: String });
const emit = defineEmits(['ready']);
const loading = ref(true), error = ref(''), blobUrl = ref('');
let generation = 0;
async function load() {
  const request = ++generation; loading.value = true; error.value = ''; emit('ready', false);
  try {
    const response = await props.http.get(props.url, { responseType: 'blob' });
    if (request !== generation) return;
    if (!response.data.type.includes('pdf')) throw new Error('The document is not available as a PDF yet.');
    if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
    blobUrl.value = URL.createObjectURL(response.data); emit('ready', true);
  } catch (e) { if (request === generation) error.value = e.message === 'The document is not available as a PDF yet.' ? e.message : 'The PDF could not be prepared. Please retry or contact People Operations.'; }
  finally { if (request === generation) loading.value = false; }
}
watch(() => props.url, load); onMounted(load);
onBeforeUnmount(() => { generation++; if (blobUrl.value) URL.revokeObjectURL(blobUrl.value); });
</script>
<style scoped>.pdf-preview{margin:15px 0;background:#eef1f4;padding:12px;border-radius:6px}.pdf-preview iframe{width:100%;height:650px;border:0}.pdf-preview a{display:inline-block;margin-top:10px;font-size:13px}.pdf-preview button{padding:8px 14px}@media(max-width:600px){.pdf-preview iframe{height:500px}}</style>
