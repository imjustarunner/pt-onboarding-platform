<template>
  <section class="fill-editor" :class="{'native-pdf-fields': autoDetectFields}" aria-label="Fill document">
    <div class="fill-tools">
      <button type="button" :disabled="page <= 1 || busy" @click="page--">Previous page</button>
      <span>Page {{ page }} of {{ pages }}</span>
      <button type="button" :disabled="page >= pages || busy" @click="page++">Next page</button>
      <button v-if="effectiveFields.length" type="button" :disabled="busy || !widgets.length" @click="nextField">Next field →</button>
      <label v-if="allowPlacement">Add <select v-model="tool" aria-label="Add entry type"><option v-if="autoDetectFields" value="select">Select / read</option><option value="text">Text</option><option v-if="autoDetectFields" value="date">Date</option><option value="check">Checkmark</option><option value="signature">My signature</option></select></label>
      <label>Zoom <select v-model.number="zoom" aria-label="Document zoom"><option :value="1">Fit page</option><option :value="1.5">150%</option><option :value="2">200%</option><option :value="3">300%</option></select></label>
    </div>
    <p v-if="effectiveFields.length">Click or tap a highlighted field on the document and enter your answer. Use Tab or Next field to continue. {{ autoDetectFields ? 'Add anything else with the tools above.' : 'Required fields and your signature are checked before submission.' }}</p>
    <p v-if="allowPlacement">Choose a tool, then click or tap where it belongs on the page. Drag an entry to move it; select it to edit.</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></p>
    <p v-if="busy" role="status">Loading page…</p>
    <div class="fill-workspace" :class="{ 'mapped-fields': effectiveFields.length && !allowPlacement }">
    <div class="page-scroll">
    <div v-show="!busy && !error" class="page-surface" :style="{ aspectRatio: `${pageWidth} / ${pageHeight}`, width: `${zoom * 100}%` }" @click="place">
      <canvas ref="canvas" aria-label="Document page" />
      <template v-for="field in pageFields" :key="field.widgetId">
        <input v-if="field.type === 'checkbox' || field.type === 'radio'" class="mapped-input mapped-choice" :style="fieldStyle(field)" :type="field.type" :name="`pdf-${field.fieldId}`" :data-pdf-field="field.widgetId" :aria-label="field.label" :title="field.label" :checked="field.type === 'checkbox' ? !!fieldValues[field.fieldId] : String(fieldValues[field.fieldId]) === String(field.option)" :disabled="field.autoToday || field.readOnly" @click.stop @change="setField(field, field.type === 'checkbox' ? $event.target.checked : field.option)" />
        <select v-else-if="field.type === 'select'" class="mapped-input" :style="fieldStyle(field)" :data-pdf-field="field.widgetId" :aria-label="field.label" :title="field.label" :value="fieldValues[field.fieldId] || ''" :required="field.required" :disabled="field.readOnly" @click.stop @change="setField(field,$event.target.value)"><option value="">Select</option><option v-for="option in field.options" :key="option.value ?? option.label" :value="option.value ?? option.label">{{ option.label ?? option.value }}</option></select>
        <textarea v-else-if="field.type === 'textarea'" class="mapped-input" :style="fieldStyle(field)" :data-pdf-field="field.widgetId" :aria-label="field.label" :title="field.label" :value="fieldValues[field.fieldId] || ''" :required="field.required" :disabled="field.readOnly" @click.stop @input="setField(field,$event.target.value)" />
        <input v-else class="mapped-input" :style="fieldStyle(field)" :data-pdf-field="field.widgetId" :aria-label="field.label" :title="field.label" :type="field.type === 'ssn' ? 'password' : 'text'" :placeholder="field.type === 'date' && !field.autoToday ? 'MM/DD/YYYY' : ''" :value="fieldValues[field.fieldId] || ''" :readonly="field.autoToday || field.readOnly" :required="field.required" autocomplete="off" @click.stop @input="setField(field,$event.target.value)" />
      </template>
      <template v-for="entry in pageEntries" :key="entry.index">
      <textarea v-if="autoDetectFields && entry.kind === 'text' && selected === entry.index" class="entry selected inline-text" :style="entryStyle(entry)" :data-entry-index="entry.index" aria-label="Text on document" :value="entry.text" maxlength="4000" placeholder="Type here" @click.stop @input="updateEntry({ text: $event.target.value })" />
      <button v-else type="button" :aria-label="`${entry.kind} entry ${entry.index + 1}`" :class="['entry', { selected: selected === entry.index }]" :style="entryStyle(entry)" @click.stop="selected = entry.index" @pointerdown="beginMove($event, entry)" @pointermove="moveEntry" @pointerup="endMove" @pointercancel="endMove">
        <template v-if="entry.kind === 'signature'"><img v-if="signatureData" :src="signatureData" alt="Your signature" /><span v-else>Your signature</span></template>
        <span v-else>{{ entry.kind === 'check' ? '✓' : entry.text || 'Type your answer below' }}</span>
      </button>
      </template>
    </div>
    </div>
    <div v-if="allowPlacement && selectedEntry" class="entry-controls">
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
    <p v-else-if="allowPlacement" class="entry-controls">Select an entry to edit it, or tap the document to add one.</p>
    </div>
    <p v-if="allowPlacement">{{ modelValue.length }} {{ modelValue.length === 1 ? 'entry' : 'entries' }} added. {{ autoDetectFields ? 'Save a filled copy to keep your work.' : 'Entries are saved in the completed PDF when you sign and submit.' }}</p>
  </section>
</template>
<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue';
import { pdfFieldWidgets, pdfFieldStyle } from '../../utils/pdfFillLayout';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const props = defineProps({ pdfUrl: String, modelValue: { type: Array, default: () => [] }, signatureData: String, fieldDefinitions: { type: Array, default: () => [] }, fieldValues: { type: Object, default: () => ({}) }, autoDetectFields: { type: Boolean, default: false }, initialTool: { type: String, default: 'text' } });
const emit = defineEmits(['update:modelValue', 'update:fieldValues', 'ready', 'fields-detected', 'document-loaded']);
const canvas = ref(null), page = ref(1), pages = ref(0), busy = ref(true), error = ref('');
const zoom = ref(1);
const pageWidth = ref(612), pageHeight = ref(792), tool = ref(props.initialTool), selected = ref(-1);
const detectedFields = ref([]);
const effectiveFields = computed(() => props.fieldDefinitions.length ? props.fieldDefinitions : detectedFields.value);
const allowPlacement = computed(() => props.autoDetectFields || !effectiveFields.value.length);
const widgets = computed(() => pdfFieldWidgets(effectiveFields.value, pages.value));
const pageFields = computed(() => widgets.value.filter(field => field.page === page.value));
const fieldStyle = field => pdfFieldStyle(field, pageWidth.value, pageHeight.value);
function setField(field,value) { if (field.readOnly) return; fieldCursor = widgets.value.findIndex(widget => widget.widgetId === field.widgetId); emit('update:fieldValues', {...props.fieldValues,[field.fieldId]:value}); }
let fieldCursor = -1, pendingFocus = null;
async function focusField() {
  await nextTick();
  if (!pendingFocus || busy.value) return;
  const element = canvas.value?.parentElement?.querySelector(`[data-pdf-field="${CSS.escape(pendingFocus)}"]`);
  element?.focus(); element?.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});
  pendingFocus = null;
}
async function nextField() {
  if (!widgets.value.length) return;
  fieldCursor = (fieldCursor + 1) % widgets.value.length;
  const target = widgets.value[fieldCursor]; pendingFocus = target.widgetId;
  if (page.value !== target.page) page.value = target.page;
  else await focusField();
}
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
async function place(event) {
  if (!allowPlacement.value || tool.value === 'select' || busy.value || error.value || props.modelValue.length >= 100) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const width = Math.min(tool.value === 'check' ? 18 : 170, pageWidth.value), height = tool.value === 'signature' ? 55 : tool.value === 'check' ? 18 : 30;
  const x = Math.max(0, Math.min(pageWidth.value - width, (event.clientX - rect.left) / rect.width * pageWidth.value));
  const y = Math.max(0, Math.min(pageHeight.value - height, (event.clientY - rect.top) / rect.height * pageHeight.value));
  selected.value = props.modelValue.length;
  emit('update:modelValue', [...props.modelValue, { kind: tool.value === 'date' ? 'text' : tool.value, page: page.value, x, y, width, height, text: tool.value === 'date' ? new Date().toLocaleDateString('en-US') : '', fontSize: 12 }]);
  if (props.autoDetectFields && tool.value === 'text') {
    await nextTick();
    canvas.value?.parentElement?.querySelector(`[data-entry-index="${selected.value}"]`)?.focus();
  }
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
  finally { if (current === renderGeneration) { busy.value = false; await focusField(); } }
}

async function detectFields(document, current) {
  if (document.numPages > 200) throw new Error('Use a document with 200 pages or fewer.');
  const definitions = [], defaults = {};
  for (let number = 1; number <= document.numPages; number++) {
    const pdfPage = await document.getPage(number);
    const viewport = pdfPage.getViewport({ scale: 1, rotation: 0 });
    const annotations = await pdfPage.getAnnotations({ intent: 'display' });
    if (current !== generation) return;
    for (const annotation of annotations) {
      if (annotation.subtype !== 'Widget' || !annotation.fieldName || !annotation.rect || annotation.fieldType === 'Sig' || annotation.pushButton || annotation.hidden) continue;
      const rect = viewport.convertToViewportRectangle(annotation.rect);
      const x = Math.min(rect[0], rect[2]), top = Math.min(rect[1], rect[3]);
      const width = Math.abs(rect[2] - rect[0]), height = Math.abs(rect[3] - rect[1]);
      if (width < 1 || height < 1) continue;
      const field = { id: annotation.fieldName, label: annotation.alternativeText || annotation.fieldName, page: number, x, y: viewport.height - top - height, width, height, readOnly: !!annotation.readOnly, required: false };
      if (annotation.fieldType === 'Tx') { field.type = annotation.multiLine ? 'textarea' : 'text'; defaults[field.id] = String(annotation.fieldValue || ''); }
      else if (annotation.checkBox) { field.type = 'checkbox'; defaults[field.id] = !!annotation.fieldValue && annotation.fieldValue !== 'Off'; }
      else if (annotation.radioButton) {
        field.type = 'radio'; field.options = [{ x, y: field.y, page: number, width, height, value: annotation.buttonValue, label: field.label }];
        defaults[field.id] = annotation.fieldValue || '';
      }
      else if (annotation.fieldType === 'Ch' && !annotation.multiSelect) {
        field.type = 'select'; field.options = (annotation.options || []).map(option => ({ value: option.exportValue, label: option.displayValue }));
        defaults[field.id] = Array.isArray(annotation.fieldValue) ? annotation.fieldValue[0] || '' : annotation.fieldValue || '';
      } else continue;
      const prior = definitions.find(definition => definition.id === field.id && definition.type === 'radio');
      if (field.type === 'radio' && prior) prior.options.push(...field.options); else definitions.push(field);
    }
  }
  detectedFields.value = definitions;
  emit('update:fieldValues', { ...defaults, ...props.fieldValues });
  emit('fields-detected', definitions.length);
}

async function load() {
  const current = ++generation; renderGeneration++; renderTask?.cancel(); loader?.destroy();
  busy.value = true; error.value = ''; emit('ready', false); pdf = null; detectedFields.value = []; page.value = 1; selected.value = -1;
  if (!props.pdfUrl) return;
  try {
    loader = pdfjsLib.getDocument({ url: props.pdfUrl, isEvalSupported: false });
    const loaded = await loader.promise;
    if (current !== generation) { loaded.destroy(); return; }
    pdf = loaded; pages.value = pdf.numPages;
    emit('document-loaded', pdf.numPages);
    // A library can switch long reference books to its reading view before field scanning.
    await nextTick();
    if (current !== generation) return;
    if (props.autoDetectFields) await detectFields(loaded, current);
    if (current !== generation) return;
    await render();
  } catch { if (current === generation) { error.value = 'Could not open the document. Please retry.'; busy.value = false; } }
}
watch(() => props.pdfUrl, load, { immediate: true, flush: 'post' });
watch(canvas, value => { if (value && pdf) render(); });
watch(page, () => { selected.value = -1; render(); });
onBeforeUnmount(() => { generation++; renderGeneration++; renderTask?.cancel(); loader?.destroy(); });
</script>
<style scoped>
.native-pdf-fields .page-surface .mapped-input{background:#fff}.native-pdf-fields .page-surface .mapped-input[readonly],.native-pdf-fields .page-surface .mapped-input:disabled{background:#f2f5f3}.native-pdf-fields .page-surface .mapped-choice{appearance:none;background:white;border:1px solid #237963}.native-pdf-fields .page-surface .mapped-choice:checked{background:#12583f url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m5 12 4 4 10-10' fill='none' stroke='white' stroke-width='3'/%3E%3C/svg%3E") center/contain no-repeat}.native-pdf-fields .page-surface input[type=radio]{border-radius:50%}.mapped-fields{grid-template-columns:minmax(0,1fr)!important}.page-surface .mapped-input{position:absolute;box-sizing:border-box;margin:0;min-width:0;width:auto;border:1px solid #237963;border-radius:2px;background:rgba(226,247,239,.65);padding:1px 2px;line-height:1.15;color:#132c22;resize:none;font-family:Arial,sans-serif}.page-surface .mapped-input:focus{outline:2px solid #12583f;background:#fff;z-index:2}.page-surface .mapped-choice{padding:0;accent-color:#12583f;cursor:pointer}.page-surface .mapped-input[readonly]{background:rgba(238,241,244,.8);border-color:#83938b}.fill-editor{display:grid;gap:12px;color:#213b34}.fill-tools,.dimensions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.fill-editor p{font-size:13px;margin:0;line-height:1.5}.fill-editor button,.fill-editor select,.fill-editor input,.fill-editor textarea{font:inherit;border:1px solid #b4c9c0;border-radius:5px;padding:8px;background:white;color:#163e31}.fill-editor button:disabled{opacity:.5}.fill-editor label{display:grid;gap:5px;font-size:13px}.fill-editor input{width:90px}.fill-workspace{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:16px;align-items:start}.page-scroll{overflow:auto;max-height:80vh;min-width:0}.page-surface{position:relative;width:100%;background:white;container-type:inline-size;cursor:crosshair}.page-surface canvas{width:100%;height:100%;display:block}.page-surface .entry{position:absolute;padding:0;border:1px dashed #678e80;border-radius:0;background:rgba(239,248,241,.25);text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;overflow:hidden;line-height:1.2;color:#111;cursor:move;touch-action:none}.page-surface .entry.selected{outline:2px solid #165b45}.page-surface .entry.inline-text{resize:none;cursor:text;background:rgba(255,255,255,.85);font-family:Arial,sans-serif;touch-action:auto}.entry img{width:100%;height:100%;object-fit:contain;object-position:left center}.entry-controls{position:sticky;top:12px;display:grid;gap:10px;padding:12px;border:1px solid #cadad4;border-radius:6px}.entry-controls textarea{width:100%;box-sizing:border-box}
@media(max-width:900px){.fill-workspace{grid-template-columns:minmax(0,1fr)}.entry-controls{position:static}.page-scroll{max-height:65vh}}
</style>
