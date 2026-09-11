<template>
  <AdaptiveJoinLanding v-if="model" v-bind="model" :can-edit="false" :design-mode="true" :selected-element="selected" @select-element="select" />
  <p v-else role="status" style="padding: 32px; font-family: system-ui">Open this preview from the Join page designer.</p>
</template>
<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import AdaptiveJoinLanding from '../../components/adaptive-intake/AdaptiveJoinLanding.vue';
const model = ref(null); const selected = ref('');
function receive(event) {
  if (window.parent === window || event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== 'join-design-update') return;
  const next = event.data.model;
  if (!next?.config || !next.quick || !next.full || typeof next.agencySlug !== 'string') return;
  // Only public presentation data and inert editor selection cross this boundary.
  model.value = { config: next.config, agencySlug: next.agencySlug, serviceType: next.serviceType, quick: next.quick, full: next.full, contactPhone: next.contactPhone, contactTel: next.contactTel, contactEmail: next.contactEmail };
  selected.value = String(event.data.selected || '');
}
function shortcut(event) {
  const key = event.key.toLowerCase();
  if (key === 'escape') { event.preventDefault(); window.parent.postMessage({ type: 'join-design-shortcut', action: 'close' }, window.location.origin); }
  else if ((event.metaKey || event.ctrlKey) && ['s', 'z'].includes(key)) { event.preventDefault(); window.parent.postMessage({ type: 'join-design-shortcut', action: key === 's' ? 'save' : event.shiftKey ? 'redo' : 'undo' }, window.location.origin); }
}
function select(key) { window.parent.postMessage({ type: 'join-design-select', key }, window.location.origin); }
onMounted(() => { window.addEventListener('message', receive); window.addEventListener('keydown', shortcut); if (window.parent !== window) window.parent.postMessage({ type: 'join-design-ready' }, window.location.origin); });
onUnmounted(() => { window.removeEventListener('message', receive); window.removeEventListener('keydown', shortcut); });
</script>
