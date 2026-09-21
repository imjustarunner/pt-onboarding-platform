<template>
  <section class="fill-editor" aria-label="Fill document">
    <div class="fill-tools">
      <button type="button" :disabled="page <= 1 || busy" @click="page--">Previous page</button>
      <span>Page {{ page }} of {{ pages }}</span>
      <button type="button" :disabled="page >= pages || busy" @click="page++">Next page</button>
      <label>Add <select v-model="tool" aria-label="Add entry type"><option value="text">Text</option><option value="check">Checkmark</option><option value="signature">My signature</option></select></label>
      <label>Zoom <select v-model.number="zoom" aria-label="Document zoom"><option :value="1">Fit page</option><option :value="1.5">150%</option><option :value="2">200%</option><option :value="3">300%</option></select></label>
    </div>
    <p>Choose a tool, then click or tap where it belongs on the page. Select an entry to change its size or position. Your signature is captured before submission.</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></p>
    <p v-if="busy" role="status">Loading page…</p>
    <div class="fill-workspace">
    <div class="page-scroll">
    <div v-show="!busy && !error" class="page-surface" :style="{ aspectRatio: `${pageWidth} / ${pageHeight}`, width: `${zoom * 100}%` }" @click="place">
      <canvas ref="canvas" aria-label="Document page" />
      <button v-for="entry in pageEntries" :key="entry.index" type="button" :aria-label="`${entry.kind} entry ${entry.index + 1}`" :class="['entry', { selected: selected === entry.index }]" :style="entryStyle(entry)" @click.stop="selected = entry.index" @pointerdown="beginMove($event, entry)" @pointermove="moveEntry" @pointerup="endMove" @pointercancel="endMove">
        <template v-if="entry.kind === 'signature'"><img v-if="signatureData" :src="signatureData" alt="Your signature" /><span v-else>Your signature</span></template>
        <span v-else>{{ entry.kind === 'check' ? '✓' : entry.text || 'Type your answer below' }}</span>
      </button>
    </div>
    </div>
    <div v-if="selectedEntry" class="entry-controls">
      <label v-if="selectedEntry.kind === 'text'">Your answer<textarea :value="selectedEntry.text" maxlength="4000" rows="3" @input="updateEntry({ text: $event.target.value })" /></label>
      <div class="dimensions">
        <label v-for="dimension in ['x', 'y', 'width', 'height']" :key="dimension">{{ {x:'Left',y:'Top',width:'Width',height:'Height'}[dimension] }}
          <input type="number" :min="dimension === 'width' || dimension === 'height' ? 8 : 0" step="1" :value="Math.round(selectedEntry[dimension])" @change="updateEntry({ [dimension]: Number($event.target.value) })" />
        </label>
        <label v-if="selectedEntry.kind === 'text'">Text size<input type="number" min="6" max="36" :value="selectedEntry.fontSize" @change="updateEntry({ fontSize: Number($event.target.value) })" /></label>
      </div>
      <button type="button" @click="removeEntry">Remove this entry</button>
      <p v-if="selectedEntry.kind === 'text'">Text shrinks to fit when saved. Enlarge the box for longer answers.</p>
    </div>
    <p v-else class="entry-controls">Select an entry to edit it, or tap the document to add one.</p>
    </div>
    <p>{{ modelValue.length }} {{ modelValue.length === 1 ? 'entry' : 'entries' }} added. Entries are saved in the completed PDF when you sign and submit.</p>
  </section>
</template>
<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const props = defineProps({ pdfUrl: String, modelValue: { type: Array, default: () => [] }, signatureData: String });
const emit = defineEmits(['update:modelValue', 'ready']);
const canvas = ref(null), page = ref(1), pages = ref(0), busy = ref(true), error = ref('');
const zoom = ref(1);
const pageWidth = ref(612), pageHeight = ref(792), tool = ref('text'), selected = ref(-1);
let moving = null;
function beginMove(event, entry) {
  selected.value = entry.index;
  moving = { entry: { ...entry }, x: event.clientX, y: event.clientY, scale: pageWidth.value / event.currentTarget.parentElement.getBoundingClientRect().width };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}
function moveEntry(event) { if (moving) updateEntry({ x: moving.entry.x + (event.clientX - moving.x) * moving.scale, y: moving.entry.y + (event.clientY - moving.y) * moving.scale }); }
function endMove() { moving = null; }
let pdf = null, loader = null, renderTask = null, generation = 0, renderGeneration = 0;
const pageEntries = computed(() => props.modelValue.map((entry, index) => ({ ...entry, index })).filter(entry => entry.page === page.value));
const selectedEntry = computed(() => props.modelValue[selected.value]?.page === page.value ? props.modelValue[selected.value] : null);
function entryStyle(entry) {
  return { left: `${entry.x / pageWidth.value * 100}%`, top: `${entry.y / pageHeight.value * 100}%`, width: `${entry.width / pageWidth.value * 100}%`, height: `${entry.height / pageHeight.value * 100}%`, fontSize: `${entry.fontSize / pageWidth.value * 100}cqw` };
}
function place(event) {
  if (busy.value || error.value || props.modelValue.length >= 100) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const width = Math.min(tool.value === 'check' ? 18 : 170, pageWidth.value), height = tool.value === 'signature' ? 55 : tool.value === 'check' ? 18 : 30;
  const x = Math.max(0, Math.min(pageWidth.value - width, (event.clientX - rect.left) / rect.width * pageWidth.value));
  const y = Math.max(0, Math.min(pageHeight.value - height, (event.clientY - rect.top) / rect.height * pageHeight.value));
  selected.value = props.modelValue.length;
  emit('update:modelValue', [...props.modelValue, { kind: tool.value, page: page.value, x, y, width, height, text: '', fontSize: 12 }]);
}
function updateEntry(patch) {
  const entry = { ...selectedEntry.value, ...patch };
  entry.x = Math.max(0, Math.min(Number.isFinite(entry.x) ? entry.x : 0, pageWidth.value - 8));
  entry.y = Math.max(0, Math.min(Number.isFinite(entry.y) ? entry.y : 0, pageHeight.value - 8));
  entry.width = Math.max(8, Math.min(entry.width || 8, pageWidth.value - entry.x));
  entry.height = Math.max(8, Math.min(entry.height || 8, pageHeight.value - entry.y));
  entry.fontSize = Math.max(6, Math.min(entry.fontSize || 12, 36));
  emit('update:modelValue', props.modelValue.map((item, index) => index === selected.value ? entry : item));
}
function removeEntry() { emit('update:modelValue', props.modelValue.filter((_, index) => index !== selected.value)); selected.value = -1; }
async function render() {
  if (!pdf || !canvas.value) return;
  const current = ++renderGeneration;
  renderTask?.cancel(); busy.value = true; error.value = ''; emit('ready', false);
  try {
    const pdfPage = await pdf.getPage(page.value);
    if (current !== renderGeneration) return;
    const viewport = pdfPage.getViewport({ scale: 1, rotation: 0 });
    pageWidth.value = viewport.width; pageHeight.value = viewport.height;
    const scaled = pdfPage.getViewport({ scale: Math.min(2, 1600 / viewport.width), rotation: 0 });
    canvas.value.width = scaled.width; canvas.value.height = scaled.height;
    renderTask = pdfPage.render({ canvasContext: canvas.value.getContext('2d'), viewport: scaled });
    await renderTask.promise;
    if (current === renderGeneration) emit('ready', true);
  } catch (e) { if (current === renderGeneration && e.name !== 'RenderingCancelledException') error.value = 'Could not display this page. Please retry.'; }
  finally { if (current === renderGeneration) busy.value = false; }
}
async function load() {
  const current = ++generation; renderGeneration++; renderTask?.cancel(); loader?.destroy();
  busy.value = true; error.value = ''; emit('ready', false); pdf = null; page.value = 1; selected.value = -1;
  if (!props.pdfUrl) return;
  try {
    loader = pdfjsLib.getDocument({ url: props.pdfUrl, isEvalSupported: false });
    const loaded = await loader.promise;
    if (current !== generation) { loaded.destroy(); return; }
    pdf = loaded; pages.value = pdf.numPages; await render();
  } catch { if (current === generation) { error.value = 'Could not open the document. Please retry.'; busy.value = false; } }
}
watch(() => props.pdfUrl, load, { immediate: true, flush: 'post' });
watch(canvas, value => { if (value && pdf) render(); });
watch(page, () => { selected.value = -1; render(); });
onBeforeUnmount(() => { generation++; renderGeneration++; renderTask?.cancel(); loader?.destroy(); });
</script>
<style scoped>
.fill-editor{display:grid;gap:12px;color:#213b34}.fill-tools,.dimensions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.fill-editor p{font-size:13px;margin:0;line-height:1.5}.fill-editor button,.fill-editor select,.fill-editor input,.fill-editor textarea{font:inherit;border:1px solid #b4c9c0;border-radius:5px;padding:8px;background:white;color:#163e31}.fill-editor button:disabled{opacity:.5}.fill-editor label{display:grid;gap:5px;font-size:13px}.fill-editor input{width:90px}.fill-workspace{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:16px;align-items:start}.page-scroll{overflow:auto;max-height:80vh;min-width:0}.page-surface{position:relative;width:100%;background:white;container-type:inline-size;cursor:crosshair}.page-surface canvas{width:100%;height:100%;display:block}.page-surface .entry{position:absolute;padding:0;border:1px dashed #678e80;border-radius:0;background:rgba(239,248,241,.25);text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;overflow:hidden;line-height:1.2;color:#111;cursor:move;touch-action:none}.page-surface .entry.selected{outline:2px solid #165b45}.entry img{width:100%;height:100%;object-fit:contain;object-position:left center}.entry-controls{position:sticky;top:12px;display:grid;gap:10px;padding:12px;border:1px solid #cadad4;border-radius:6px}.entry-controls textarea{width:100%;box-sizing:border-box}
@media(max-width:900px){.fill-workspace{grid-template-columns:minmax(0,1fr)}.entry-controls{position:static}.page-scroll{max-height:65vh}}
</style>
