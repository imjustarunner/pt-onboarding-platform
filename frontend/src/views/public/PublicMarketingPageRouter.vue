<template>
  <p v-if="waiting" role="status" style="padding: 32px">{{ previewMode ? 'Waiting for editor preview…' : 'Loading…' }}</p>
  <PublicMarketingLandingTisiView v-else-if="isLanding" :preview-page="previewMode ? previewPage : null" />
  <PublicMarketingHubView v-else />
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import PublicMarketingHubView from './PublicMarketingHubView.vue';
import PublicMarketingLandingTisiView from './PublicMarketingLandingTisiView.vue';
const route = useRoute();
const previewMode = window.parent !== window && route.query.marketingPreview === '1';
const previewPage = ref(null);
const waiting = ref(true);
const landingTemplate = ref('');
const isLanding = computed(() => previewMode || landingTemplate.value === 'tisi' || route.params.hubSlug === 'tisi');
function receive(event) {
  if (!previewMode || event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== 'marketing-preview') return;
  if (!event.data.page || event.data.page.slug !== route.params.hubSlug) return;
  previewPage.value = event.data.page;
  waiting.value = false;
}
let requestId = 0;
async function loadType() {
  if (previewMode) return;
  const id = ++requestId;
  waiting.value = true;
  try {
    const { data } = await api.get(`/public/marketing-pages/${route.params.hubSlug}`, { skipGlobalLoading: true, skipAuthRedirect: true });
    if (id === requestId) landingTemplate.value = data?.page?.branding?.landingTemplate || '';
  } catch { if (id === requestId) landingTemplate.value = ''; }
  finally { if (id === requestId) waiting.value = false; }
}
onMounted(() => {
  window.addEventListener('message', receive);
  if (previewMode) window.parent.postMessage({ type: 'marketing-preview-ready' }, window.location.origin);
  else loadType();
});
watch(() => route.params.hubSlug, loadType);
onUnmounted(() => window.removeEventListener('message', receive));
</script>
