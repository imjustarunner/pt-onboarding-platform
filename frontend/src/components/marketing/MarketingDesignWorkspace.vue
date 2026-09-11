<template>
  <section class="design-workspace" :class="{ 'design-workspace--expanded': expanded }" aria-label="Mockup and page preview">
    <div class="design-top">
      <div><h3>Design reference & live preview</h3><p>Compare your unsaved page with the mockup at the same width.</p></div>
      <button type="button" @click="expanded = !expanded">{{ expanded ? 'Exit full screen' : 'Expand workspace' }}</button>
      <button type="button" @click="previewOpen = !previewOpen">{{ previewOpen ? 'Hide preview' : 'Compare page' }}</button>
    </div>
    <label class="design-upload">Choose mockup or source artwork
      <input type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="loadSource" />
    </label>
    <p class="design-help">Select a rectangle to extract a hero, banner, or logo. Cropping preserves any text inside that rectangle. Use clean artwork behind editable page text.</p>
    <div v-if="sourceUrl" class="crop-tools">
      <div ref="cropStage" class="crop-stage" @pointerdown="beginCrop" @pointermove="moveCrop" @pointerup="endCrop" @pointercancel="endCrop">
        <img :src="sourceUrl" alt="Design reference. Select a rectangular region or use the crop fields below." draggable="false" />
        <div class="crop-box" :style="cropStyle" />
      </div>
      <div class="crop-settings">
        <label v-for="field in ['x', 'y', 'width', 'height']" :key="field">{{ field }} (%)
          <input v-model.number="crop[field]" type="number" min="0" max="100" step="0.1" @change="normalizeCrop" />
        </label>
        <label>Use crop as<select v-model="target"><option value="hero">Hero</option><option value="cta">Consultation banner</option><option value="logo">Logo</option></select></label>
        <p>{{ cropPixels.width }} × {{ cropPixels.height }} pixels</p>
        <p v-if="cropPixels.width < (target === 'logo' ? 160 : 1200)" class="design-warning">This crop may look soft at desktop size. A larger original will give a sharper result.</p>
        <button type="button" :disabled="busy || !cropPixels.width || !cropPixels.height" @click="applyCrop">{{ busy ? 'Uploading…' : 'Apply crop to draft' }}</button>
        <button type="button" :disabled="busy" @click="saveReference">Save full image as design reference</button>
      </div>
    </div>
    <p v-if="error" role="alert" class="design-warning">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="previewOpen">
      <div class="preview-toolbar">
        <button v-for="size in sizes" :key="size.width" type="button" :aria-pressed="viewport === size.width" @click="viewport = size.width">{{ size.label }}</button>
        <label><input v-model="fitPreview" type="checkbox" /> Fit to pane</label>
        <span>{{ viewport }} px · unsaved preview</span>
      </div>
      <div ref="comparison" class="comparison">
        <div><h4>Reference</h4><div class="reference-scroll"><img v-if="referenceUrl || sourceUrl" :src="referenceUrl || sourceUrl" :style="{ width: `${viewport}px`, zoom: previewScale }" alt="Original design reference" /><p v-else>Choose a mockup to compare the layout and imagery.</p></div></div>
        <div><h4>Working page</h4><div class="preview-scroll"><iframe ref="frame" :key="page.slug" :src="`/p/${encodeURIComponent(page.slug || 'preview')}?marketingPreview=1`" :style="{ width: `${viewport}px`, zoom: previewScale }" title="Unsaved public page preview" @load="sendPreview" /></div></div>
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ page: { type: Object, required: true }, referenceUrl: { type: String, default: '' } });
const emit = defineEmits(['asset', 'reference', 'busy']);
const previewOpen = ref(false);
const expanded = ref(false);
const fitPreview = ref(true);
const comparison = ref(null);
const paneWidth = ref(400);
const previewScale = computed(() => fitPreview.value ? Math.min(1, paneWidth.value / viewport.value) : 1);
let resizeObserver;
watch([previewOpen, expanded], async () => {
  await nextTick();
  resizeObserver?.disconnect();
  if (!comparison.value) return;
  resizeObserver = new ResizeObserver(() => { paneWidth.value = comparison.value?.firstElementChild?.clientWidth || 400; });
  resizeObserver.observe(comparison.value);
});
const viewport = ref(1400);
const sizes = [{ label: 'Desktop', width: 1400 }, { label: 'Tablet', width: 768 }, { label: 'Mobile', width: 390 }];
const frame = ref(null);
const sourceUrl = ref('');
const sourceImage = ref(null);
const sourceFile = ref(null);
const cropStage = ref(null);
const crop = ref({ x: 0, y: 0, width: 100, height: 100 });
const target = ref('hero');
const busy = ref(false);
const error = ref('');
const notice = ref('');
let start = null;
let sourceVersion = 0;
const cropStyle = computed(() => ({ left: `${crop.value.x}%`, top: `${crop.value.y}%`, width: `${crop.value.width}%`, height: `${crop.value.height}%` }));
const cropPixels = computed(() => ({ width: Math.round((sourceImage.value?.naturalWidth || 0) * crop.value.width / 100), height: Math.round((sourceImage.value?.naturalHeight || 0) * crop.value.height / 100) }));
function normalizeCrop() {
  const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
  crop.value.x = clamp(crop.value.x, 0, 99.9); crop.value.y = clamp(crop.value.y, 0, 99.9);
  crop.value.width = clamp(crop.value.width, .1, 100 - crop.value.x); crop.value.height = clamp(crop.value.height, .1, 100 - crop.value.y);
}
async function loadSource(event) {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  error.value = ''; notice.value = '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) { error.value = 'Choose a PNG, JPEG, or WebP up to 8 MB.'; return; }
  const version = ++sourceVersion;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (version !== sourceVersion) { URL.revokeObjectURL(url); return; }
    if (img.naturalWidth * img.naturalHeight > 40000000) throw new Error('Image is too large. Choose artwork under 40 megapixels.');
    if (sourceUrl.value) URL.revokeObjectURL(sourceUrl.value);
    sourceUrl.value = url; sourceImage.value = img; sourceFile.value = file;
    crop.value = { x: 0, y: 0, width: 100, height: 100 };
  } catch (e) { URL.revokeObjectURL(url); error.value = e.message || 'Unable to read this image.'; }
}
function point(event) {
  const rect = cropStage.value.getBoundingClientRect();
  return { x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)) };
}
function beginCrop(event) { if (busy.value) return; start = point(event); cropStage.value.setPointerCapture(event.pointerId); }
function moveCrop(event) {
  if (!start) return;
  const end = point(event);
  crop.value = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}
function endCrop() { start = null; normalizeCrop(); }
async function upload(file) {
  const fd = new FormData(); fd.append('file', file);
  const { data } = await api.post('/platform/public-marketing-pages/upload', fd, { skipGlobalLoading: true });
  if (!data?.url) throw new Error('Upload did not return an image URL.');
  return data.url;
}
async function applyCrop() {
  busy.value = true; error.value = ''; notice.value = '';
  try {
    normalizeCrop();
    const canvas = document.createElement('canvas');
    canvas.width = cropPixels.value.width; canvas.height = cropPixels.value.height;
    const img = sourceImage.value;
    canvas.getContext('2d').drawImage(img, Math.round(img.naturalWidth * crop.value.x / 100), Math.round(img.naturalHeight * crop.value.y / 100), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('Crop exceeds the 8 MB upload limit. Select a smaller region.');
    const url = await upload(new File([blob], `${props.page.slug}-${target.value}.png`, { type: 'image/png' }));
    emit('asset', { target: target.value, url }); notice.value = 'Crop applied to your draft. Save the page to publish it.';
  } catch (e) { error.value = e.response?.data?.error?.message || e.message || 'Crop upload failed.'; }
  finally { busy.value = false; }
}
async function saveReference() {
  busy.value = true; error.value = ''; notice.value = '';
  try { emit('reference', await upload(sourceFile.value)); notice.value = 'Reference attached to your draft.'; }
  catch (e) { error.value = e.message || 'Reference upload failed.'; }
  finally { busy.value = false; }
}
function sendPreview() { frame.value?.contentWindow?.postMessage({ type: 'marketing-preview', page: JSON.parse(JSON.stringify(props.page)) }, window.location.origin); }
function receive(event) { if (event.origin === window.location.origin && event.source === frame.value?.contentWindow && event.data?.type === 'marketing-preview-ready') sendPreview(); }
watch(() => props.page, sendPreview, { deep: true });
watch(busy, value => emit('busy', value), { flush: 'sync' });
onMounted(() => window.addEventListener('message', receive));
onUnmounted(() => { resizeObserver?.disconnect(); sourceVersion++; window.removeEventListener('message', receive); if (sourceUrl.value) URL.revokeObjectURL(sourceUrl.value); });
</script>
<style scoped>
.design-workspace { border: 1px solid #cbdbe3; border-radius: 12px; background: #f4f8fa; padding: 20px; margin: 20px 0; color: #17384a; }
.design-workspace--expanded { position: fixed; inset: 12px; z-index: 2000; margin: 0; overflow: auto; }
h3, h4, p { margin: 0 0 10px; } p { font-size: 13px; line-height: 1.5; }
.design-top, .preview-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
button { padding: 10px 14px; border: 1px solid #b9ccd7; border-radius: 6px; background: white; color: #17384a; cursor: pointer; font: inherit; font-size: 13px; }
button[aria-pressed=true] { background: #17384a; color: white; } button:disabled { opacity: .5; cursor: wait; }
.design-upload { display: grid; gap: 8px; margin: 12px 0; font-weight: 600; }
.design-help { color: #496473; } .design-warning { color: #90400e; }
.crop-tools { display: grid; grid-template-columns: minmax(0, 1fr) 210px; gap: 16px; align-items: start; }
.crop-stage { position: relative; touch-action: none; user-select: none; cursor: crosshair; }
.crop-stage img { width: 100%; display: block; }
.crop-box { position: absolute; border: 2px solid #68e9ab; background: #2aaf6b22; box-sizing: border-box; pointer-events: none; }
.crop-settings { display: grid; gap: 10px; } .crop-settings label { display: grid; gap: 3px; font-size: 12px; text-transform: capitalize; }
.crop-settings input, select { width: 100%; padding: 8px; box-sizing: border-box; }
.preview-toolbar { margin: 20px 0 12px; justify-content: start; font-size: 12px; }
.comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .comparison > div { min-width: 0; }
.reference-scroll, .preview-scroll { height: 650px; overflow: auto; background: white; border: 1px solid #d2dce2; }
.reference-scroll img { max-width: none; display: block; } iframe { max-width: none; height: 1500px; border: 0; display: block; }
@media (max-width: 700px) { .crop-tools, .comparison { grid-template-columns: 1fr; } .reference-scroll { height: 300px; } }
</style>
