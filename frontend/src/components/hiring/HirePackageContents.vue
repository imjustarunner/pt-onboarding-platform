<template>
  <section class="package-contents" aria-live="polite">
    <p v-if="loading">Loading included items…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Try again</button></p>
    <template v-else-if="packageId">
      <h3>{{ details.name }} · included items</h3><p>{{ details.description }}</p>
      <p v-if="documentsOnly">Pre-hire imports the documents from this collection. Add videos and other pre-hire resources as individual steps below.</p>
      <p v-if="!items.length">This collection has no items.</p>
      <ul><li v-for="item in items" :key="item.key"><a v-if="item.editUrl" :href="item.editUrl" target="_blank" rel="noopener"><strong>{{ item.title }}</strong> ↗</a><strong v-else>{{ item.title }}</strong><span>{{ item.kind }}</span></li></ul>
      <a v-if="editUrl" :href="collectionEditUrl" target="_blank" rel="noopener">Edit this collection in Settings ↗</a>
      <button type="button" @click="load">Refresh contents</button>
    </template>
    <p v-else>Use the individual steps below without a saved collection.</p>
  </section>
</template>
<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ packageId: [Number, String], editUrl: String, documentsOnly: Boolean });
const emit = defineEmits(['loaded']);
const details = ref({}), loading = ref(false), error = ref('');
let request = 0;
const collectionEditUrl = computed(() => props.editUrl ? `${props.editUrl}${props.editUrl.includes('?') ? '&' : '?'}packageId=${props.packageId}` : '');
function documentEditUrl(id) {
  if (!id || !props.editUrl) return null;
  const [path, query] = props.editUrl.split('?');
  const agencyId = new URLSearchParams(query).get('agencyId');
  return `${path.replace(/settings$/, 'documents')}/${id}/edit${agencyId ? '?agencyId=' + agencyId : ''}`;
}
const items = computed(() => [
  ...(props.documentsOnly ? ['documents'] : ['documents', 'modules', 'trainingFocuses', 'checklistItems', 'intakeLinks']).flatMap(kind => (details.value[kind] || []).map((item, index) => ({
    key: `${kind}-${index}`, editUrl: kind === 'documents' ? documentEditUrl(item.document_template_id) : null, title: item.name || item.title || item.document_name || item.module_title || item.track_name || item.item_label || item.item_text || 'Untitled item',
    kind: ({ documents: 'Review / sign document', modules: 'Training module', trainingFocuses: 'Training collection', checklistItems: 'Checklist', intakeLinks: 'Online form' })[kind]
  })))
]);
async function load() {
  const current = ++request; details.value = {}; error.value = ''; loading.value = !!props.packageId;
  if (!props.packageId) return;
  try { const { data } = await api.get(`/onboarding-packages/${props.packageId}`); if (current !== request) return; details.value = data; emit('loaded', data); }
  catch (e) { if (current === request) { error.value = e.response?.data?.error?.message || 'Could not load collection contents.'; emit('loaded', null); } }
  finally { if (current === request) loading.value = false; }
}
watch(() => props.packageId, load, { immediate: true });
</script>
<style scoped>
.package-contents{padding:16px;background:#f4f8f7;border:1px solid #d9e5df;border-radius:8px;margin:14px 0;color:#223d35}.package-contents h3{font-size:15px}.package-contents ul{padding-left:20px}.package-contents li{padding:8px 0}.package-contents span{display:block;font-size:12px;color:#586c66}.package-contents button,.package-contents a{font:inherit;font-size:13px;color:#165c46;margin-right:14px}.package-contents button{background:white;border:1px solid #b7d0c6;border-radius:5px;padding:7px 10px}
</style>
