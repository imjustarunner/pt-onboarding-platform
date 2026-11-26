<template>
  <div class="fingerprinting-guide">
    <p v-if="loading" role="status">Loading screenshots…</p>
    <div v-if="failed" class="screenshot-error" role="alert">
      <p>Some screenshots could not be loaded.</p>
      <button type="button" @click="loadImages">Retry screenshots</button>
    </div>
    <div ref="content" v-html="renderedHtml" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { addFingerprintingScreenshots, FINGERPRINTING_SCREENSHOTS } from '../../navigation/hireFingerprintingScreenshots.js';
const props = defineProps({ html: { type: String, required: true }, http: { type: Object, required: true }, token: String, agencyId: [Number, String], preview: Boolean, trainingModuleId: [Number, String], onDemand: Boolean });
const content = ref(null), loading = ref(false), failed = ref(false);
// Older completed submissions retain their original stored instructions. The view can show
// the original reference screenshots without rewriting the saved acknowledgement.
const renderedHtml = computed(() => addFingerprintingScreenshots(props.html));
const imageBase = computed(() => props.trainingModuleId
  ? `${props.onDemand ? '/on-demand-training' : ''}/modules/${encodeURIComponent(props.trainingModuleId)}/fingerprinting-screenshots`
  : props.preview ? '/contracts/fingerprinting-screenshots'
  : '/prehire-portal/' + encodeURIComponent(props.token || '') + '/workflow/denver-school-fingerprinting/images');
const known = new Set(FINGERPRINTING_SCREENSHOTS.map(item => item.sha256));
let generation = 0, controller, objectUrls = [];
function cleanup() {
  controller?.abort();
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
}
async function loadImages() {
  const current = ++generation;
  cleanup(); failed.value = false; loading.value = true;
  controller = new AbortController();
  const signal = controller.signal;
  await nextTick();
  if (current !== generation || !content.value) return;
  content.value.innerHTML = renderedHtml.value;
  const images = [...content.value.querySelectorAll('img[data-fingerprinting-screenshot]')];
  await Promise.all(images.map(async image => {
    const id = image.getAttribute('data-fingerprinting-screenshot');
    if (!known.has(id)) { image.remove(); return; }
    try {
      const { data } = await props.http.get(imageBase.value + '/' + id, {
        responseType: 'blob', skipGlobalLoading: true, signal,
        ...(props.preview && !props.trainingModuleId ? { params: { agencyId: Number(props.agencyId) } } : {})
      });
      if (current !== generation) return;
      if (!(data instanceof Blob) || data.type !== 'image/png') throw new Error('Invalid screenshot');
      const url = URL.createObjectURL(data); objectUrls.push(url);
      image.src = url; image.loading = 'lazy';
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', 'Open screenshot at full size: ' + image.alt);
      image.replaceWith(link); link.append(image);
    } catch {
      if (current === generation) failed.value = true;
    }
  }));
  if (current === generation) loading.value = false;
}
watch([renderedHtml, imageBase, () => props.agencyId], loadImages, { immediate: true });
onBeforeUnmount(() => { generation++; cleanup(); });
</script>

<style scoped>
.fingerprinting-guide :deep(ol), .fingerprinting-guide :deep(ul) { padding-inline-start: 1.5rem; }
.fingerprinting-guide :deep(ol) { list-style: decimal; }
.fingerprinting-guide :deep(ul) { list-style: disc; }
.fingerprinting-guide :deep(ol > li) { margin-block: 1rem; }
.fingerprinting-guide :deep(h3) { margin: 0 0 0.375rem; }
.fingerprinting-guide :deep(figure) { margin: 1rem 0; }
.fingerprinting-guide :deep(img) { display: block; max-width: 100%; height: auto; border: 1px solid #d7dfe7; border-radius: 6px; }
.fingerprinting-guide :deep(figcaption) { margin-top: 0.4rem; font-size: 0.875rem; color: #506176; }
.screenshot-error { border: 1px solid #b77d22; border-radius: 6px; padding: 0.75rem; margin-bottom: 1rem; }
</style>
