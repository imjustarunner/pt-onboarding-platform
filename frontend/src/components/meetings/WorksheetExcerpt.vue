<template>
  <details>
    <summary>Insert a worksheet excerpt</summary>
    <label v-if="materials?.length"
      >Prepared materials<select @change="fromMaterial">
        <option value="">Choose a worksheet</option>
        <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.title }}</option>
      </select></label
    >
    <label
      >PDF or image<input type="file" accept="application/pdf,image/png,image/jpeg" @change="fromFile"
    /></label>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="source">
      <label v-if="pages > 1"
        >Page<input type="number" min="1" :max="pages" v-model.number="page" @change="render"
      /></label>
      <div class="preview" ref="preview">
        <canvas
          ref="canvas"
          @pointerdown="start"
          @pointermove="move"
          @pointerup="end"
          @pointercancel="cancelDrag"
        />
        <div
          v-if="crop"
          class="selection"
          :style="{
            left: crop.x * 100 + '%',
            top: crop.y * 100 + '%',
            width: crop.w * 100 + '%',
            height: crop.h * 100 + '%'
          }"
        />
      </div>
      <p>Drag across a question to crop it, or use the whole page.</p>
      <button type="button" :disabled="!ready" @click="attach">
        {{ crop ? 'Use selection' : 'Use page' }}
      </button>
      <button
        type="button"
        @click="
          crop = null;
          selected = false;
          $emit('selected', null);
        "
      >
        Reset selection</button
      ><span v-if="selected" role="status">Excerpt attached to draft</span>
    </template>
  </details>
</template>
<script setup>
import { ref, nextTick, onBeforeUnmount } from 'vue';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;
const props = defineProps({ materials: Array, readMaterial: Function }),
  emit = defineEmits(['selected']);
const source = ref(''),
  canvas = ref(null),
  pages = ref(1),
  page = ref(1),
  ready = ref(false),
  crop = ref(null),
  selected = ref(false),
  error = ref('');
let selectedMaterialId = null;
let doc = null,
  bitmap = null,
  task = null,
  drag = null,
  generation = 0,
  paint = 0;
function cleanup() {
  paint++;
  task?.cancel();
  task = null;
  void doc?.destroy();
  doc = null;
  bitmap?.close();
  bitmap = null;
}
async function open(blob, name, materialId = null) {
  selectedMaterialId = materialId;
  const gen = ++generation;
  cleanup();
  emit('selected', null);
  source.value = '';
  ready.value = false;
  selected.value = false;
  error.value = '';
  crop.value = null;
  page.value = 1;
  pages.value = 1;
  try {
    if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('Choose a PDF or image under 8 MB.');
    if (blob.type === 'application/pdf') {
      const result = await getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        isEvalSupported: false
      }).promise;
      if (gen !== generation) {
        await result.destroy();
        return;
      }
      doc = result;
      pages.value = doc.numPages;
    } else if (['image/png', 'image/jpeg'].includes(blob.type)) {
      const image = await createImageBitmap(blob);
      if (gen !== generation) {
        image.close();
        return;
      }
      bitmap = image;
    } else throw new Error('Choose a PDF, PNG or JPEG.');
    source.value = name;
    await nextTick();
    await render();
  } catch (e) {
    if (gen === generation) error.value = e.message;
  }
}
function fromFile(e) {
  const f = e.target.files?.[0];
  if (f) open(f, f.name);
}
async function fromMaterial(e) {
  const m = props.materials.find((item) => Number(item.id) === Number(e.target.value));
  if (!m) return;
  try {
    const file = await props.readMaterial(m.id);
    await open(file, m.title, Number(m.id));
  } catch {
    error.value = 'This worksheet could not be opened.';
  }
}
async function render() {
  const token = ++paint;
  ready.value = false;
  selected.value = false;
  crop.value = null;
  emit('selected', null);
  task?.cancel();
  const c = canvas.value;
  try {
    if (doc) {
      page.value = Math.min(pages.value, Math.max(1, page.value || 1));
      const pg = await doc.getPage(page.value);
      if (token !== paint) return;
      const v = pg.getViewport({ scale: 1 });
      const viewport = pg.getViewport({ scale: Math.min(1.8, 1200 / Math.max(v.width, v.height)) });
      c.width = viewport.width;
      c.height = viewport.height;
      task = pg.render({ canvasContext: c.getContext('2d'), viewport });
      await task.promise;
    } else if (bitmap) {
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      c.width = bitmap.width * scale;
      c.height = bitmap.height * scale;
      c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
    }
    if (token === paint) ready.value = true;
  } catch (e) {
    if (token === paint) error.value = 'This page could not be rendered.';
  }
}
function point(e) {
  const b = canvas.value.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
    y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height))
  };
}
function start(e) {
  if (!ready.value) return;
  canvas.value.setPointerCapture(e.pointerId);
  drag = point(e);
  crop.value = null;
  selected.value = false;
  emit('selected', null);
}
function move(e) {
  if (!drag) return;
  const p = point(e);
  crop.value = {
    x: Math.min(p.x, drag.x),
    y: Math.min(p.y, drag.y),
    w: Math.abs(p.x - drag.x),
    h: Math.abs(p.y - drag.y)
  };
}
function cancelDrag() {
  drag = null;
  crop.value = null;
}
function end(e) {
  move(e);
  drag = null;
  if (crop.value?.w < 0.015 || crop.value?.h < 0.015) crop.value = null;
}
function attach() {
  const c = canvas.value,
    b = crop.value || { x: 0, y: 0, w: 1, h: 1 },
    out = document.createElement('canvas');
  out.width = Math.max(1, c.width * b.w);
  out.height = Math.max(1, c.height * b.h);
  const g = out.getContext('2d');
  g.fillStyle = 'white';
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(
    c,
    c.width * b.x,
    c.height * b.y,
    c.width * b.w,
    c.height * b.h,
    0,
    0,
    out.width,
    out.height
  );
  const image = out.toDataURL('image/jpeg', 0.8);
  if (image.length > 800000) {
    error.value = 'Choose a smaller excerpt.';
    return;
  }
  emit('selected', {
    image,
    label: source.value.slice(0, 140),
    page: page.value,
    ...(selectedMaterialId ? { materialId: selectedMaterialId } : {})
  });
  selected.value = true;
}
onBeforeUnmount(() => {
  generation++;
  cleanup();
});
</script>
<style scoped>
.preview {
  display: table;
  max-width: 100%;
  position: relative;
}
.preview canvas {
  display: block;
  max-width: 100%;
  max-height: 320px;
  touch-action: none;
  cursor: crosshair;
}
.selection {
  position: absolute;
  pointer-events: none;
  border: 2px solid #168275;
  background: #51c4b433;
}
details {
  background: #f5f9f9;
  border-radius: 6px;
  padding: 0.5rem;
}
summary {
  cursor: pointer;
}
</style>
