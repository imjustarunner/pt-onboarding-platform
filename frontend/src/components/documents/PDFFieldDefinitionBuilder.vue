<template>
  <div class="pdf-field-builder">
    <div class="builder-sidebar">
      <div class="sidebar-header">
        <h4>Custom Fields</h4>
        <button type="button" class="btn btn-sm btn-primary" @click="addField">
          + Add Field
        </button>
      </div>

      <div v-if="fields.length === 0" class="empty">
        No custom fields added yet.
      </div>

      <div v-for="field in fields" :key="field.id" class="field-card" :class="{ active: field.id === activeFieldId }">
        <div class="field-row">
          <input v-model="field.label" type="text" placeholder="Field label" />
        </div>
        <div class="field-row">
          <select v-model="field.type" @change="handleTypeChange(field)">
            <option value="text">Text</option>
            <option value="date">Date</option>
            <option value="ssn">SSN</option>
            <option value="initials">Initials</option>
            <option value="checkbox">Checkbox</option>
          </select>
          <label class="checkbox">
            <input v-model="field.required" type="checkbox" />
            Required
          </label>
        </div>
        <div v-if="field.type === 'date'" class="field-row">
          <label class="checkbox">
            <input v-model="field.autoToday" type="checkbox" />
            Auto-fill today
          </label>
        </div>
        <div class="field-row field-coords">
          <input v-model.number="field.page" type="number" min="1" :max="totalPages || undefined" placeholder="Page" />
          <input v-model.number="field.width" type="number" min="20" placeholder="W" />
          <input v-model.number="field.height" type="number" min="12" placeholder="H" />
        </div>
        <div class="field-actions">
          <button type="button" class="btn btn-sm btn-secondary" @click="setActive(field.id)">
            {{ field.id === activeFieldId ? 'Picking…' : 'Set Position' }}
          </button>
          <button type="button" class="btn btn-sm btn-danger" @click="removeField(field.id)">
            Remove
          </button>
        </div>
      </div>
    </div>

    <div class="builder-preview">
      <div class="pdf-toolbar">
        <div class="toolbar-left">
          <button class="btn btn-sm btn-secondary" @click="previousPage" :disabled="loading || currentPage <= 1">
            Previous
          </button>
          <button class="btn btn-sm btn-secondary" @click="nextPage" :disabled="loading || currentPage >= totalPages">
            Next
          </button>
          <span class="page-indicator" v-if="totalPages > 0">Page {{ currentPage }} / {{ totalPages }}</span>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-sm btn-secondary" @click="zoomOut" :disabled="loading">−</button>
          <span class="zoom-indicator">{{ Math.round(scale * 100) }}%</span>
          <button class="btn btn-sm btn-secondary" @click="zoomIn" :disabled="loading">+</button>
        </div>
      </div>

      <div class="pdf-viewer-container" ref="containerRef">
        <div v-if="loading" class="loading">Loading PDF...</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <div v-else class="pdf-viewer-wrapper">
          <canvas
            ref="canvasRef"
            @click="handleCanvasClick"
            class="pdf-canvas"
            :class="{ picking: !!activeFieldId }"
          ></canvas>

          <div
            v-for="field in fieldsOnPage"
            :key="field.id"
            class="field-preview"
            :style="fieldStyles[field.id] || { display: 'none' }"
          >
            <span class="field-label">{{ field.label || field.type }}</span>
          </div>
        </div>
      </div>

      <small class="hint">Click “Set Position” and then click on the PDF to place the field.</small>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick, onMounted } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';

const workerVersion = pdfjsLib.version || '5.4.530';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${workerVersion}/build/pdf.worker.min.mjs`;

const props = defineProps({
  pdfUrl: { type: String, required: true },
  modelValue: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:modelValue']);

const containerRef = ref(null);
const canvasRef = ref(null);
const loading = ref(true);
const error = ref('');
const currentPage = ref(1);
const totalPages = ref(0);
const scale = ref(1.25);
const activeFieldId = ref(null);

const fields = ref([]);
const fieldStyles = ref({});
let pdfDoc = null;
let rendering = false;

const normalizeField = (field) => ({
  id: field.id || `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  label: field.label || '',
  type: field.type || 'text',
  required: Boolean(field.required),
  autoToday: Boolean(field.autoToday),
  x: field.x ?? null,
  y: field.y ?? null,
  width: field.width ?? 120,
  height: field.height ?? 24,
  page: field.page ?? null
});

const fieldsOnPage = computed(() =>
  fields.value.filter((f) => (f.page || 1) === currentPage.value && f.x !== null && f.y !== null)
);

const syncToParent = () => {
  emit('update:modelValue', fields.value.map((f) => ({ ...f })));
};

watch(
  () => props.modelValue,
  (nextVal) => {
    fields.value = (nextVal || []).map(normalizeField);
  },
  { immediate: true, deep: true }
);

watch(
  fields,
  () => {
    syncToParent();
    updateFieldStyles();
  },
  { deep: true }
);

const addField = () => {
  const field = normalizeField({});
  fields.value.push(field);
  activeFieldId.value = field.id;
};

const removeField = (id) => {
  fields.value = fields.value.filter((f) => f.id !== id);
  if (activeFieldId.value === id) activeFieldId.value = null;
};

const setActive = (id) => {
  activeFieldId.value = activeFieldId.value === id ? null : id;
};

const handleTypeChange = (field) => {
  if (!field) return;
  if (field.type === 'checkbox') {
    if (!field.width || field.width > 30) field.width = 20;
    if (!field.height || field.height > 30) field.height = 20;
  } else if (field.type === 'initials') {
    if (!field.width) field.width = 60;
    if (!field.height) field.height = 24;
  } else if (field.type === 'date') {
    if (!field.width) field.width = 90;
    if (!field.height) field.height = 24;
  }
};

const loadPdf = async () => {
  if (!props.pdfUrl) return;
  loading.value = true;
  error.value = '';
  currentPage.value = 1;
  totalPages.value = 0;
  pdfDoc = null;

  try {
    const task = pdfjsLib.getDocument({ url: props.pdfUrl, withCredentials: true });
    pdfDoc = await task.promise;
    totalPages.value = pdfDoc.numPages;
    loading.value = false;
    await nextTick();
    await renderPage(currentPage.value);
  } catch (e) {
    console.error('PDF load error:', e);
    error.value = e?.message || 'Failed to load PDF';
    loading.value = false;
  }
};

const renderPage = async (pageNum) => {
  if (!pdfDoc || rendering) return;
  rendering = true;
  try {
    await nextTick();
    const canvas = canvasRef.value;
    if (!canvas) return;
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: scale.value });
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    await updateFieldStyles();
  } finally {
    rendering = false;
  }
};

const handleCanvasClick = async (event) => {
  if (!activeFieldId.value || !pdfDoc) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const page = await pdfDoc.getPage(currentPage.value);
  const pdfViewport = page.getViewport({ scale: 1.0 });
  const displayWidth = rect.width || canvas.width;
  const displayHeight = rect.height || canvas.height;

  const pdfX = (x / displayWidth) * pdfViewport.width;
  const pdfYFromTop = (y / displayHeight) * pdfViewport.height;
  const clickedPdfY = pdfViewport.height - pdfYFromTop;

  const target = fields.value.find((f) => f.id === activeFieldId.value);
  if (!target) return;

  const fieldHeight = target.height || 24;
  const pdfY = Math.max(0, clickedPdfY - fieldHeight / 2);

  target.x = Math.round(pdfX);
  target.y = Math.round(pdfY);
  target.page = currentPage.value;
  activeFieldId.value = null;
};

const updateFieldStyles = async () => {
  if (!canvasRef.value || !pdfDoc) return;
  const canvas = canvasRef.value;
  const rect = canvas.getBoundingClientRect();
  const canvasWidth = rect.width || canvas.width;
  const canvasHeight = rect.height || canvas.height;
  const page = await pdfDoc.getPage(currentPage.value);
  const pdfViewport = page.getViewport({ scale: 1.0 });

  const styles = {};
  for (const field of fieldsOnPage.value) {
    const canvasX = (field.x / pdfViewport.width) * canvasWidth;
    const pdfYFromTop = pdfViewport.height - field.y;
    const canvasY = (pdfYFromTop / pdfViewport.height) * canvasHeight;
    const canvasWidthPdf = (field.width / pdfViewport.width) * canvasWidth;
    const canvasHeightPdf = (field.height / pdfViewport.height) * canvasHeight;
    const previewTop = canvasY - canvasHeightPdf;
    styles[field.id] = {
      left: `${canvasX}px`,
      top: `${previewTop}px`,
      width: `${canvasWidthPdf}px`,
      height: `${canvasHeightPdf}px`
    };
  }
  fieldStyles.value = styles;
};

const previousPage = async () => {
  if (currentPage.value <= 1) return;
  currentPage.value -= 1;
  await renderPage(currentPage.value);
};

const nextPage = async () => {
  if (currentPage.value >= totalPages.value) return;
  currentPage.value += 1;
  await renderPage(currentPage.value);
};

const zoomIn = async () => {
  scale.value = Math.min(3.0, scale.value + 0.15);
  await renderPage(currentPage.value);
};

const zoomOut = async () => {
  scale.value = Math.max(0.5, scale.value - 0.15);
  await renderPage(currentPage.value);
};

watch(() => props.pdfUrl, loadPdf, { immediate: true });

onMounted(() => {
  window.addEventListener('resize', () => {
    if (!pdfDoc) return;
    renderPage(currentPage.value);
  });
});
</script>

<style scoped>
.pdf-field-builder {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
}

.builder-sidebar {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  background: #fff;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.empty {
  color: var(--text-secondary);
  font-size: 13px;
}

.field-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  background: #f9f9f9;
}

.field-card.active {
  border-color: var(--primary, #1f4e79);
  background: #eef5ff;
}

.field-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.field-row input,
.field-row select {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.field-coords input {
  flex: 0 0 70px;
}

.checkbox {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  gap: 6px;
  align-items: center;
}

.field-actions {
  display: flex;
  gap: 8px;
}

.builder-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pdf-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: #f8f9fa;
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-indicator,
.zoom-indicator {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.pdf-viewer-container {
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  background: #f5f5f5;
  overflow: auto;
  max-height: 600px;
  padding: 8px;
}

.pdf-viewer-wrapper {
  position: relative;
  display: inline-block;
}

.pdf-canvas {
  display: block;
  max-width: 100%;
}

.pdf-canvas.picking {
  cursor: crosshair;
}

.field-preview {
  position: absolute;
  border: 2px dashed #007bff;
  background: rgba(0, 123, 255, 0.08);
  pointer-events: none;
  box-sizing: border-box;
}

.field-label {
  font-size: 10px;
  color: #007bff;
  background: rgba(255, 255, 255, 0.8);
  padding: 2px 4px;
}

.loading,
.error {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary, #666);
}

.error {
  color: var(--error-color, #dc3545);
}

.hint {
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
