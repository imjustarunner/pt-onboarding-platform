<template>
  <Teleport to="body">
    <dialog ref="dialog" class="join-designer" aria-labelledby="join-designer-title" @cancel.prevent="requestClose" @keydown="onShortcut">
      <header class="jd-header">
        <div><p class="jd-eyebrow">PUBLIC PAGE DESIGNER</p><h1 id="join-designer-title">{{ config.agency?.name || agencySlug }} <span>/ {{ serviceType || config.activeService?.serviceType || 'Join' }}</span></h1></div>
        <div class="jd-actions"><span role="status">{{ busy ? 'Uploading…' : saving ? 'Saving…' : dirty ? 'Unsaved changes' : status || 'All changes saved' }}</span><button type="button" :disabled="!canUndo || locked" @click="undo">Undo</button><button type="button" :disabled="!canRedo || locked" @click="redo">Redo</button><button type="button" :disabled="locked" @click="requestClose">Close</button><button type="button" class="jd-primary" :disabled="locked || !dirty" @click="save">Save changes</button></div>
      </header>
      <div v-if="closing" class="jd-close-check" role="alert">You have unsaved changes. <button type="button" @click="closing = false">Keep editing</button><button type="button" @click="$emit('close')">Discard changes</button><button type="button" class="jd-primary" :disabled="locked" @click="saveAndClose">Save and close</button></div>
      <div v-if="error" class="jd-error" role="alert">{{ error }}</div>
      <div class="jd-toolbar">
        <div class="jd-segments" role="group" aria-label="Editing view"><button v-for="item in JOIN_DEVICES" :key="item.id" type="button" :aria-pressed="device === item.id" @click="device = item.id">{{ item.label }}</button></div>
        <span>{{ deviceInfo.width }} × {{ deviceInfo.height }}</span><label><input v-model="fit" type="checkbox" /> Fit canvas</label><label><input v-model="compare" type="checkbox" /> Show mockup</label>
        <span class="jd-scope">Editing the {{ deviceInfo.label.toLowerCase() }} layout.</span>
      </div>
      <div class="jd-workspace">
        <aside class="jd-elements" aria-label="Page elements">
          <h2>Elements</h2><div class="jd-add"><select v-model="newElementType" aria-label="New element type"><option value="text">Text section</option><option value="image">Image</option><option value="link">Link button</option></select><button type="button" :disabled="locked || elements.length >= 42" @click="addElement">Add</button></div><p>Choose an element here or on the canvas.</p>
          <button type="button" class="jd-layer" :aria-pressed="selected === 'page'" @click="selected = 'page'">Page & background</button>
          <template v-for="group in ['main', 'cards', 'rail', 'footer']" :key="group">
            <h3>{{ { main: 'Main content', cards: 'Intake choices', rail: 'Brand & support', footer: 'Footer' }[group] }}</h3>
            <button v-for="element in orderedElements(group)" :key="element.id" type="button" class="jd-layer" :aria-pressed="selected === element.id" :draggable="!locked && group !== 'footer'" @dragstart="startElementDrag(element, $event)" @dragover.prevent @drop.prevent="dropElement(element, $event)" @click="selected = element.id"><span>{{ element.label }}</span><span v-if="view.hidden[element.id] || (element.id === 'footer' && view.footerStyle === 'hidden')" class="jd-hidden">Hidden</span></button>
          </template>
          <div class="jd-help">Drag elements within their section, or use Move up / Move down. Intake buttons keep their real destinations.</div>
        </aside>
        <main ref="stage" class="jd-stage" aria-label="Live page canvas">
          <div class="jd-canvases" :class="{ 'jd-canvases--compare': compare }">
            <section v-if="compare" class="jd-preview-pane"><h2>Design reference</h2><div class="jd-scroll"><img v-if="design.referenceImageUrl" :src="design.referenceImageUrl" alt="Saved design reference" :style="canvasStyle" /><p v-else class="jd-empty">Choose Page & background, then upload a mockup for comparison.</p></div></section>
            <section class="jd-preview-pane"><h2>{{ deviceInfo.label }} · live preview <span>Select elements directly on the page</span></h2><div class="jd-scroll"><iframe ref="frame" src="/join-design-preview" title="Join page design canvas" :style="{ ...canvasStyle, height: `${deviceInfo.height}px` }" @load="sendPreview" /></div></section>
          </div>
        </main>
        <aside class="jd-inspector" aria-label="Element properties">
          <h2>{{ selectedElement?.label || 'Page & background' }}</h2>
          <fieldset :disabled="locked">
            <template v-if="selected === 'page'">
              <h3>Layout · {{ deviceInfo.label }}</h3>
              <label>Page padding (px)<input v-model.number="view.padding" type="range" min="12" max="80" /><output>{{ view.padding }} px</output></label>
              <label>Section spacing (px)<input v-model.number="view.gap" type="range" min="8" max="64" /><output>{{ view.gap }} px</output></label>
              <label v-if="device === 'mobile'">Brand & support placement<select v-model="view.railPlacement"><option value="after">After intake choices</option><option value="before">Before intake choices</option></select></label>
              <label>Body font<select v-model="view.fonts.body"><option v-for="font in JOIN_FONT_OPTIONS" :key="font.id" :value="font.id">{{ font.label }}</option></select></label>
              <h3>Colors · {{ deviceInfo.label }}</h3>
              <label v-for="(label, key) in { headingColor: 'Heading', primaryColor: 'Primary button', secondaryColor: 'Secondary button', surfaceColor: 'Card surface' }" :key="key">{{ label }}<input v-model="view[key]" type="color" /></label>
              <h3>Background</h3><p>The background can be different in each view.</p>
              <label>{{ deviceInfo.label }} image URL<input v-model="view.backgroundUrl" type="text" placeholder="Uses the shared background when empty" /></label>
              <button type="button" @click="pickUpload('background')">Upload {{ deviceInfo.label.toLowerCase() }} background</button>
              <label>Horizontal focal point<input v-model.number="view.backgroundX" type="range" min="0" max="100" /><output>{{ view.backgroundX }}%</output></label>
              <label>Vertical focal point<input v-model.number="view.backgroundY" type="range" min="0" max="100" /><output>{{ view.backgroundY }}%</output></label>
              <label>Background wash<input v-model.number="view.backgroundWash" type="range" min="0" max="90" /><output>{{ view.backgroundWash }}% white</output></label>
              <h3>Design reference</h3><button type="button" @click="pickUpload('reference')">Upload mockup</button><button v-if="design.referenceImageUrl" type="button" @click="design.referenceImageUrl = ''">Remove reference</button>
              <h3>Reset this view</h3><p>Restore readable spacing and remove saved offsets for {{ deviceInfo.label.toLowerCase() }}. Undo is available.</p><button type="button" @click="resetView">Reset {{ deviceInfo.label.toLowerCase() }} layout</button>
              <details><summary>Link preview image</summary><p>Changes here are saved separately when you use the link-image controls.</p><PublicLinkImageEditor :agency-slug="agencySlug" :page="sharePage" /></details>
            </template>
            <template v-else>
              <template v-if="selectedElement?.type"><p>Element names, sections, and removal are shared across views. Visibility and order are specific to each view.</p><label>Element name<input v-model="design.elements.find(e => e.id === selected).label" type="text" /></label><label>Section<select :value="selectedElement.group" @change="moveElementSection($event.target.value)"><option value="main">Main content</option><option value="rail">Brand & support</option></select></label><button type="button" @click="removeElement">Remove element</button><button v-if="selectedElement.type === 'image'" type="button" @click="pickUpload('element')">Upload image</button></template>
              <h3>{{ deviceInfo.label }} layout</h3>
              <label v-if="selected !== 'cards'" class="jd-checkbox"><input v-model="view.hidden[selected]" type="checkbox" /> Hide in {{ deviceInfo.label.toLowerCase() }}</label>
              <div v-if="selectedElement?.group !== 'footer'" class="jd-reorder"><button type="button" :disabled="elementIndex <= 0" @click="move(-1)">Move up</button><button type="button" :disabled="elementIndex >= groupOrder.length - 1" @click="move(1)">Move down</button></div>
              <label>Alignment<select v-model="view.align[selected]"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
              <label v-if="selectedElement?.size">{{ selectedElement.size.endsWith('Width') ? 'Width (px)' : 'Text size (rem)' }}<input v-model.number="view.sizes[selectedElement.size]" type="number" :min="sizeLimits[0]" :max="sizeLimits[1]" :step="selectedElement.size.endsWith('Width') ? 4 : 0.05" /></label>
              <label v-if="fontKey">Font<select v-model="view.fonts[fontKey]"><option v-for="font in JOIN_FONT_OPTIONS" :key="font.id" :value="font.id">{{ font.label }}</option></select></label>
              <details v-if="!['quick', 'full', 'footer'].includes(selected)"><summary>Fine position</summary><p>Offsets can overlap nearby content. Use the canvas to check the result.</p><label>Horizontal offset (px)<input v-model.number="view.positions[selected].x" type="number" min="-200" max="200" /></label><label>Vertical offset (px)<input v-model.number="view.positions[selected].y" type="number" min="-200" max="200" /></label></details>
              <template v-if="selected === 'logo'"><h3>Organization logo</h3><p>Changing the logo updates this organization’s shared branding after saving.</p><img v-if="model.logoUrl" class="jd-logo-preview" :src="model.logoUrl" alt="Organization logo" /><button type="button" @click="pickUpload('logo')">Upload logo</button></template>
              <template v-if="selected === 'footer'"><label>Footer style<select v-model="view.footerStyle"><option value="hidden">Hidden</option><option value="white">White</option><option value="frost">Frosted</option><option value="dark">Dark</option><option value="clear">Clear</option></select></label></template>
              <template v-if="selectedElement?.fields.length || selectedElement?.bullets">
                <h3>Content</h3>
                <label v-if="device !== 'desktop'" class="jd-checkbox"><input type="checkbox" :checked="hasTextOverride" @change="toggleTextOverride($event.target.checked)" /> Use {{ deviceInfo.label.toLowerCase() }}-only text</label>
                <p class="jd-scope-note">{{ hasTextOverride && device !== 'desktop' ? `These words appear only in ${deviceInfo.label.toLowerCase()}.` : 'Shared text. Used in every view unless that view has an override.' }}</p>
                <label v-for="field in selectedElement.fields" :key="`${device}-${selected}-${field}`">{{ fieldLabel(field) }}<textarea v-model="textTarget[field]" :rows="/Description|Lead|Body/.test(field) ? 4 : 2" /></label>
                <div v-if="selectedElement.bullets" class="jd-bullets"><label v-for="(bullet, i) in textTarget[selectedElement.bullets] || []" :key="i">Bullet {{ i + 1 }}<div><input v-model="textTarget[selectedElement.bullets][i]" type="text" /><button type="button" :aria-label="`Remove bullet ${i + 1}`" @click="textTarget[selectedElement.bullets].splice(i, 1)">×</button></div></label><button type="button" @click="addBullet">Add bullet</button></div>
              </template>
              <template v-if="selected === 'help'"><h3>Organization contact</h3><p>Phone and email are shared across this organization’s public pages.</p><label>Phone<input v-model="model.contact.phone" type="tel" /></label><label>Extension<input v-model="model.contact.phoneExtension" type="text" maxlength="20" /></label><label>Support email<input v-model="model.contact.email" type="email" /></label></template>
              <div v-if="['quick', 'full'].includes(selected)" class="jd-help">{{ selected === 'full' && !full.enabled ? `Enrollment is unavailable: ${full.disabledReason || 'not enabled for this service'}.` : `This button opens the existing ${selected === 'quick' ? 'interest form' : 'enrollment'} flow.` }}</div>
            </template>
          </fieldset>
          <div v-if="issues.length" class="jd-issues"><h3>Before saving</h3><ul><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul></div>
        </aside>
      </div>
      <input ref="fileInput" class="jd-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" @change="uploadFile" />
    </dialog>
  </Teleport>
</template>
<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router';
import PublicLinkImageEditor from '../public/PublicLinkImageEditor.vue';
import { JOIN_FONT_OPTIONS, restoreJoinWelcomeCopy } from '../../utils/joinLandingTemplate';
import { JOIN_DEVICES, JOIN_FIELD_LABELS, JOIN_SIZE_LIMITS, normalizeJoinDesign, joinDesignElements, joinCards, joinDesignIssues } from '../../utils/joinPageDesign';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { tenantSmsImage } from '../../utils/tenantBrandAssets';
const props = defineProps({ config: { type: Object, required: true }, agencySlug: { type: String, required: true }, serviceType: { type: String, default: '' }, quick: { type: Object, required: true }, full: { type: Object, required: true }, contactPhone: { type: String, default: '' }, contactTel: { type: String, default: '' }, contactEmail: { type: String, default: '' } });
const emit = defineEmits(['close', 'saved']);
const clone = value => JSON.parse(JSON.stringify(value));
const initialCopy = restoreJoinWelcomeCopy(clone(props.config.copy || {}), props.config.agency?.name);
// Seed fields missing from older records from their actual rendered cards.
for (const [key, card] of Object.entries(joinCards(initialCopy, props.quick, props.full))) for (const field of ['title', 'tagline', 'description', 'duration', 'bullets', 'cta', 'footer']) initialCopy[key + field[0].toUpperCase() + field.slice(1)] = card[field];
initialCopy.layout = { ...(initialCopy.layout || {}), design: normalizeJoinDesign(initialCopy.layout) };
const model = ref({ copy: initialCopy, contact: { phone: String(props.config.supportContact?.phone ?? props.contactPhone).replace(/\s*(?:ext\.?|x)\s*\S+\s*$/i, ''), phoneExtension: props.config.supportContact?.phoneExtension || '', email: props.config.supportContact?.email ?? props.contactEmail }, logoPath: null, logoUrl: props.config.branding?.logoUrl || '' });
const design = computed(() => model.value.copy.layout.design);
const device = ref('desktop'); const deviceInfo = computed(() => JOIN_DEVICES.find(d => d.id === device.value));
const view = computed(() => design.value.views[device.value]);
const newElementType = ref('text');
const elements = computed(() => joinDesignElements(design.value));
const selected = ref('welcome'); const selectedElement = computed(() => elements.value.find(e => e.id === selected.value));
const dialog = ref(null); const frame = ref(null); const stage = ref(null); const fileInput = ref(null);
const compare = ref(false); const fit = ref(true); const paneWidth = ref(800);
const canvasStyle = computed(() => ({ width: `${deviceInfo.value.width}px`, zoom: fit.value ? Math.min(1, paneWidth.value / deviceInfo.value.width) : 1 }));
const busy = ref(false); const saving = ref(false); const locked = computed(() => busy.value || saving.value); const error = ref(''); const status = ref(''); const closing = ref(false);
let uploadTarget = ''; let uploadDevice = ''; let uploadElement = ''; let uploadTextScope = false; let historyTimer; let observer;
const baseline = ref(JSON.stringify(model.value));
const dirty = computed(() => JSON.stringify(model.value) !== baseline.value);
const history = ref([baseline.value]); const historyIndex = ref(0);
const canUndo = computed(() => historyIndex.value > 0 || JSON.stringify(model.value) !== history.value[historyIndex.value]);
const canRedo = computed(() => historyIndex.value < history.value.length - 1);
function commitHistory() { clearTimeout(historyTimer); const state = JSON.stringify(model.value); if (state === history.value[historyIndex.value]) return; history.value = history.value.slice(0, historyIndex.value + 1); history.value.push(state); if (history.value.length > 60) history.value.shift(); historyIndex.value = history.value.length - 1; }
watch(model, () => { clearTimeout(historyTimer); historyTimer = setTimeout(commitHistory, 350); }, { deep: true });
function undo() { commitHistory(); if (historyIndex.value > 0) model.value = JSON.parse(history.value[--historyIndex.value]); }
function redo() { clearTimeout(historyTimer); if (canRedo.value) model.value = JSON.parse(history.value[++historyIndex.value]); }
const groupOrder = computed(() => view.value.order[selectedElement.value?.group] || []);
const elementIndex = computed(() => groupOrder.value.indexOf(selected.value));
const sizeLimits = computed(() => JOIN_SIZE_LIMITS[selectedElement.value?.size] || [80, 1200]);
const fontKey = computed(() => ({ welcome: 'welcome', script: 'script', quick: 'cardTitle', full: 'cardTitle' })[selected.value]);
const hasTextOverride = computed(() => device.value !== 'desktop' && selectedElement.value?.fields.some(field => field in view.value.copy));
const textTarget = computed(() => hasTextOverride.value ? view.value.copy : model.value.copy);
const issues = computed(() => joinDesignIssues(model.value.copy, props.full.enabled));
const sharePage = computed(() => tenantSmsImage(props.agencySlug, props.serviceType) ? props.serviceType : 'join');
function orderedElements(group) { return group === 'footer' ? elements.value.filter(e => e.group === 'footer') : view.value.order[group].map(id => elements.value.find(e => e.id === id)); }
function addElement() {
  commitHistory(); const id = `custom_${crypto.randomUUID().replaceAll('-', '')}`;
  design.value.elements.push({ id, type: newElementType.value, label: { text: 'Text section', image: 'Image', link: 'Link button' }[newElementType.value], group: 'main' });
  for (const { id: deviceId } of JOIN_DEVICES) { const v = design.value.views[deviceId]; v.order.main.push(id); v.hidden[id] = false; v.align[id] = 'left'; v.positions[id] = { x: 0, y: 0 }; }
  const element = joinDesignElements(design.value).find(e => e.id === id);
  for (const field of element.fields) model.value.copy[field] = '';
  if (element.size) for (const { id: deviceId } of JOIN_DEVICES) design.value.views[deviceId].sizes[element.size] = 600;
  selected.value = id; commitHistory();
}
function moveElementSection(group) {
  commitHistory(); const element = design.value.elements.find(e => e.id === selected.value); if (!element || element.group === group) return;
  for (const { id } of JOIN_DEVICES) { const order = design.value.views[id].order; order[element.group] = order[element.group].filter(k => k !== element.id); order[group].push(element.id); }
  element.group = group; commitHistory();
}
function removeElement() {
  commitHistory(); const element = selectedElement.value; design.value.elements = design.value.elements.filter(e => e.id !== element.id);
  for (const { id } of JOIN_DEVICES) { const v = design.value.views[id]; v.order[element.group] = v.order[element.group].filter(k => k !== element.id); delete v.positions[element.id]; delete v.hidden[element.id]; delete v.align[element.id]; for (const key of element.fields) delete v.copy[key]; }
  for (const key of element.fields) model.value.copy[key] = ''; selected.value = 'page'; commitHistory();
}
function fieldLabel(field) { return JOIN_FIELD_LABELS[field] || field.replace(/^custom_[a-z0-9_-]+?(Title|Body|Url|Alt|Label|Href)$/, '$1').replace(/^(quick|full)/, '').replace(/([a-z])([A-Z])/g, '$1 $2'); }
function startElementDrag(element, event) { event.dataTransfer.setData('text/plain', element.id); event.dataTransfer.effectAllowed = 'move'; }
function dropElement(target, event) {
  if (locked.value) return;
  const sourceId = event.dataTransfer.getData('text/plain'); const source = elements.value.find(e => e.id === sourceId);
  if (!source || source.group !== target.group || source.id === target.id || source.group === 'footer') return;
  commitHistory(); const order = view.value.order[source.group]; const from = order.indexOf(source.id); const to = order.indexOf(target.id);
  if (from < 0 || to < 0) return;
  order.splice(from, 1); order.splice(to, 0, source.id); selected.value = source.id; commitHistory();
}
function move(direction) { commitHistory(); const i = elementIndex.value; const order = groupOrder.value; if (i < 0 || i + direction < 0 || i + direction >= order.length) return; [order[i], order[i + direction]] = [order[i + direction], order[i]]; commitHistory(); }
function toggleTextOverride(enabled) { const element = selectedElement.value; for (const key of [...element.fields, ...(element.bullets ? [element.bullets] : [])]) { if (enabled) view.value.copy[key] = clone(model.value.copy[key] ?? (key === element.bullets ? [] : '')); else delete view.value.copy[key]; } }
function addBullet() { const field = selectedElement.value.bullets; if (!Array.isArray(textTarget.value[field])) textTarget.value[field] = []; textTarget.value[field].push(''); }
function resetView() { commitHistory(); const next = normalizeJoinDesign({ ...model.value.copy.layout, design: { elements: design.value.elements } }).views[device.value]; for (const key of Object.keys(next.positions)) next.positions[key] = { x: 0, y: 0 }; next.copy = clone(view.value.copy); next.backgroundUrl = view.value.backgroundUrl; design.value.views[device.value] = next; commitHistory(); }
const previewModel = computed(() => {
  const config = clone(props.config); config.copy = clone(model.value.copy);
  if (model.value.logoPath) config.branding = { ...(config.branding || {}), logoUrl: model.value.logoUrl };
  return { config, agencySlug: props.agencySlug, serviceType: props.serviceType, quick: props.quick, full: props.full, contactPhone: model.value.contact.phone + (model.value.contact.phoneExtension ? ` ext. ${model.value.contact.phoneExtension}` : ''), contactTel: model.value.contact.phone.replace(/[^\d+]/g, ''), contactEmail: model.value.contact.email };
});
function sendPreview() { frame.value?.contentWindow?.postMessage({ type: 'join-design-update', model: clone(previewModel.value), selected: selected.value }, window.location.origin); }
function receive(event) {
  if (event.origin !== window.location.origin || event.source !== frame.value?.contentWindow) return;
  if (event.data?.type === 'join-design-ready') sendPreview();
  if (event.data?.type === 'join-design-shortcut' && !locked.value && ['save', 'close', 'undo', 'redo'].includes(event.data.action)) ({ save, close: requestClose, undo, redo })[event.data.action]?.();
  if (event.data?.type === 'join-design-select' && elements.value.some(e => e.id === event.data.key)) selected.value = event.data.key;
}
watch([previewModel, selected], sendPreview, { deep: true });
watch([compare, device], async () => { await nextTick(); measure(); });
function measure() { paneWidth.value = Math.max(240, (stage.value?.clientWidth || 800) / (compare.value ? 2 : 1) - 44); }
function pickUpload(target) { uploadTarget = target; uploadDevice = device.value; uploadElement = selected.value; uploadTextScope = hasTextOverride.value; fileInput.value?.click(); }
async function uploadFile(event) {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type) || file.size > 5 * 1024 * 1024) { error.value = 'Choose a PNG, JPEG, WebP, or SVG up to 5 MB.'; return; }
  busy.value = true; error.value = '';
  try {
    const data = new FormData(); data.append('logo', file);
    const response = await api.post('/logos/upload', data, { skipGlobalLoading: true });
    if (!response.data?.path || !response.data?.success) throw new Error('Upload did not return an image path.');
    const url = toUploadsUrl(response.data.path) || response.data.url;
    if (uploadTarget === 'logo') { model.value.logoPath = response.data.path; model.value.logoUrl = url; }
    else if (uploadTarget === 'element') { const targetCopy = uploadTextScope ? design.value.views[uploadDevice].copy : model.value.copy; targetCopy[uploadElement + 'Url'] = url; }
    else if (uploadTarget === 'reference') { design.value.referenceImageUrl = url; compare.value = true; }
    else design.value.views[uploadDevice].backgroundUrl = url;
  } catch (e) { error.value = e.response?.data?.error?.message || e.message || 'Image upload failed.'; }
  finally { busy.value = false; }
}
function requestClose() { if (locked.value) return; if (dirty.value) closing.value = true; else emit('close'); }
async function save() {
  if (locked.value) return false;
  error.value = ''; commitHistory();
  if (issues.value.length) { error.value = 'Resolve the items in Before saving.'; return false; }
  if (model.value.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(model.value.contact.email)) { error.value = 'Enter a valid support email or leave it empty.'; return false; }
  saving.value = true;
  const submitted = clone(model.value);
  submitted.copy.layout.design = normalizeJoinDesign(submitted.copy.layout);
  try {
    const body = { serviceType: props.serviceType || props.config.activeService?.serviceType || 'default', copy: submitted.copy, supportContact: submitted.contact };
    if (submitted.logoPath) body.logoPath = submitted.logoPath;
    const { data } = await api.patch(`/public/adaptive-intake/${encodeURIComponent(props.agencySlug)}/landing`, body, { skipGlobalLoading: true });
    const result = { ...data, copy: { ...submitted.copy, ...(data.copy || {}) } };
    model.value.copy = clone(result.copy); model.value.logoPath = null;
    if (result.branding?.logoUrl) model.value.logoUrl = result.branding.logoUrl;
    if (result.supportContact) model.value.contact = { phone: result.supportContact.phone || '', phoneExtension: result.supportContact.phoneExtension || '', email: result.supportContact.email || '' };
    baseline.value = JSON.stringify(model.value); history.value = [baseline.value]; historyIndex.value = 0; status.value = 'Changes saved'; closing.value = false;
    emit('saved', result); return true;
  } catch (e) { error.value = e.response?.data?.error?.message || e.message || 'Could not save. Your changes are still here.'; return false; }
  finally { saving.value = false; }
}
async function saveAndClose() { if (await save()) emit('close'); }
function onShortcut(event) { if (!(event.metaKey || event.ctrlKey)) return; if (event.key.toLowerCase() === 's') { event.preventDefault(); save(); } else if (event.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(event.target.tagName) && !locked.value) { event.preventDefault(); event.shiftKey ? redo() : undo(); } }
if (inject(matchedRouteKey, null)) onBeforeRouteLeave(() => {
  if (locked.value) return false;
  return !dirty.value || window.confirm('Discard unsaved Join page changes and leave?');
});
function beforeUnload(event) { if (dirty.value || locked.value) { event.preventDefault(); event.returnValue = ''; } }
onMounted(() => { dialog.value.showModal(); window.addEventListener('message', receive); window.addEventListener('beforeunload', beforeUnload); observer = new ResizeObserver(measure); observer.observe(stage.value); measure(); });
onBeforeUnmount(() => { clearTimeout(historyTimer); observer?.disconnect(); window.removeEventListener('message', receive); window.removeEventListener('beforeunload', beforeUnload); dialog.value?.close(); });
</script>
<style scoped>
.join-designer { position: fixed; inset: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; color: #223449; background: #f1f4f7; font-family: Inter, system-ui, sans-serif; }
.join-designer[open] { display: flex; flex-direction: column; }
.join-designer * { box-sizing: border-box; }
.jd-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 24px; background: #fff; border-bottom: 1px solid #dce3e9; }
.jd-eyebrow { margin: 0 0 5px; color: #577084; letter-spacing: .14em; font-size: 10px; font-weight: 700; }
.jd-header h1 { font-size: 17px; margin: 0; color: #183146; }.jd-header h1 span { font-weight: 400; color: #627889; }
.jd-actions, .jd-toolbar, .jd-reorder { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }.jd-actions > span { font-size: 12px; color: #576e7d; margin-right: 10px; }
.join-designer button { border: 1px solid #cad6de; border-radius: 7px; padding: 9px 13px; min-height: 36px; background: #fff; color: #294458; font: inherit; font-size: 12px; cursor: pointer; }
.join-designer button:disabled { opacity: .45; cursor: default; }.join-designer button.jd-primary { background: #205b48; color: #fff; border-color: #205b48; }
.join-designer :is(button, input, select, textarea, summary):focus-visible { outline: 3px solid #5c9dd3; outline-offset: 2px; }
.jd-toolbar { padding: 10px 24px; background: #fff; border-bottom: 1px solid #dce3e9; font-size: 12px; }
.jd-toolbar label { display: flex; align-items: center; gap: 5px; }.jd-scope { margin-left: auto; color: #5d7281; }
.jd-segments { display: flex; padding: 3px; background: #edf2f5; border-radius: 8px; }.jd-segments button { background: transparent; border: 0; }.jd-segments button[aria-pressed=true] { background: #173e56; color: #fff; }
.jd-workspace { display: grid; grid-template-columns: 220px minmax(0, 1fr) 300px; flex: 1; min-height: 0; }
.jd-elements, .jd-inspector { background: #fff; padding: 20px 16px; overflow: auto; }.jd-elements { border-right: 1px solid #dce3e9; }.jd-inspector { border-left: 1px solid #dce3e9; }
.jd-workspace h2 { margin: 0 0 12px; font-size: 15px; color: #183146; }.jd-workspace h3 { margin: 22px 0 10px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #657d8d; }
.jd-workspace p { margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: #607787; }
.join-designer .jd-layer { display: flex; width: 100%; align-items: center; justify-content: space-between; text-align: left; border: 1px solid transparent; margin: 4px 0; padding: 11px 9px; }.join-designer .jd-layer[aria-pressed=true] { background: #eaf2f9; color: #164f84; border-color: #9abedb; }.jd-hidden { font-size: 10px; color: #718290; }
.jd-add { display: flex; gap: 6px; margin-bottom: 12px; }.jd-add select { min-width: 0; width: 100%; border: 1px solid #cad6de; border-radius: 6px; color: #294458; background: #fff; padding: 6px; }
.jd-help { font-size: 12px; line-height: 1.6; padding: 12px; background: #f2f6f8; border-radius: 8px; margin-top: 20px; color: #526b7b; }
.jd-stage { min-width: 0; overflow: auto; padding: 20px; background: #e8eef2; }.jd-canvases { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }.jd-canvases--compare { grid-template-columns: repeat(2, minmax(0, 1fr)); }.jd-preview-pane { min-width: 0; }.jd-preview-pane h2 { font-size: 12px; font-weight: 600; }.jd-preview-pane h2 span { display: block; font-weight: 400; font-size: 10px; margin-top: 5px; color: #5c7484; }
.jd-scroll { overflow: auto; height: calc(100dvh - 200px); background: white; box-shadow: 0 3px 16px #18314614; border-radius: 4px; }.jd-scroll iframe { margin-inline: auto; border: 0; display: block; max-width: none; background: white; }.jd-scroll img { margin-inline: auto; display: block; max-width: none; height: auto; }.jd-empty { padding: 25px; }
.jd-inspector fieldset { padding: 0; border: 0; min-width: 0; }.jd-inspector label { display: grid; gap: 6px; font-size: 12px; font-weight: 600; margin: 14px 0; }.jd-inspector label.jd-checkbox { display: flex; align-items: center; gap: 8px; }
.jd-inspector :is(input:not([type=checkbox]):not([type=range]), textarea, select) { width: 100%; max-width: 100%; border: 1px solid #cbd6df; border-radius: 6px; padding: 9px; background: white; color: #223449; font: inherit; font-size: 13px; }.jd-inspector textarea { resize: vertical; line-height: 1.5; }.jd-inspector input[type=range] { width: 100%; }.jd-inspector output { font-size: 11px; font-weight: 400; color: #617889; }
.jd-inspector details { margin-top: 18px; }.jd-inspector summary { font-size: 12px; cursor: pointer; }.jd-inspector details p { margin-top: 10px; }.jd-logo-preview { max-width: 150px; max-height: 100px; object-fit: contain; display: block; margin-bottom: 12px; }
.jd-bullets label > div { display: flex; gap: 5px; }.jd-issues { margin-top: 20px; padding: 12px; background: #fff4e5; color: #774813; border-radius: 8px; }.jd-issues h3 { margin-top: 0; }.jd-issues ul { padding-left: 16px; font-size: 12px; line-height: 1.5; }
.jd-error, .jd-close-check { padding: 12px 24px; font-size: 13px; background: #fff0ee; color: #8c3028; }.jd-close-check button { margin-left: 10px; }.jd-file { display: none; }
@media (max-width: 1000px) { .jd-workspace { grid-template-columns: 160px minmax(0, 1fr) 250px; }.jd-header { padding: 12px; flex-wrap: wrap; }.jd-scope { display: none; } }
@media (max-width: 700px) { .jd-workspace { grid-template-columns: 1fr; overflow: auto; display: block; }.jd-elements { max-height: 210px; }.jd-stage { min-height: 450px; }.jd-scroll { height: 450px; }.jd-inspector { overflow: visible; }.jd-canvases--compare { grid-template-columns: 1fr; }.jd-header h1 { font-size: 14px; }.jd-toolbar { padding: 8px; } }
</style>
