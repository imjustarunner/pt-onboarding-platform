<template>
  <div class="classroom-pdf-workspace">
    <div class="classroom-pdf-toolbar">
      <div class="classroom-pdf-toolbar-group">
        <button type="button" class="classroom-pdf-btn" :disabled="loading || currentPage <= 1" @click="previousPage">
          Previous
        </button>
        <button type="button" class="classroom-pdf-btn" :disabled="loading || currentPage >= totalPages" @click="nextPage">
          Next
        </button>
        <span v-if="totalPages > 0" class="classroom-pdf-indicator">Page {{ currentPage }} / {{ totalPages }}</span>
      </div>

      <div class="classroom-pdf-toolbar-group">
        <button type="button" class="classroom-pdf-btn" :disabled="loading" @click="zoomOut">-</button>
        <span class="classroom-pdf-indicator">{{ Math.round(scale * 100) }}%</span>
        <button type="button" class="classroom-pdf-btn" :disabled="loading" @click="zoomIn">+</button>
      </div>
    </div>

    <div class="classroom-pdf-viewer" ref="containerRef">
      <div v-if="loading" class="classroom-pdf-state">Loading PDF...</div>
      <div v-else-if="error" class="classroom-pdf-state classroom-pdf-state-error">{{ error }}</div>
      <div v-else class="classroom-pdf-canvas-layer">
        <canvas ref="canvasRef" class="classroom-pdf-canvas"></canvas>

        <template v-for="field in positionedFields" :key="field.renderKey">
          <label
            v-if="field.kind === 'radio'"
            class="classroom-pdf-overlay classroom-pdf-overlay-radio"
            :style="field.style"
          >
            <input
              :checked="modelValue?.[field.fieldId] === field.optionValue"
              type="radio"
              :name="`pdf-radio-${field.fieldId}`"
              :disabled="disabled"
              @change="updateField(field.fieldId, field.optionValue)"
            />
            <span>{{ field.label }}</span>
          </label>

          <label
            v-else-if="field.kind === 'checkbox'"
            class="classroom-pdf-overlay classroom-pdf-overlay-checkbox"
            :style="field.style"
          >
            <input
              :checked="Boolean(modelValue?.[field.fieldId])"
              type="checkbox"
              :disabled="disabled"
              @change="updateField(field.fieldId, $event.target.checked)"
            />
          </label>

          <select
            v-else-if="field.kind === 'select'"
            class="classroom-pdf-overlay classroom-pdf-overlay-input"
            :style="field.style"
            :disabled="disabled"
            :value="modelValue?.[field.fieldId] ?? ''"
            @change="updateField(field.fieldId, $event.target.value)"
          >
            <option value="">Select...</option>
            <option
              v-for="option in field.options"
              :key="`${field.fieldId}-${option.value || option.label}`"
              :value="option.value || option.label"
            >
              {{ option.label || option.value }}
            </option>
          </select>

          <input
            v-else-if="field.kind === 'date'"
            class="classroom-pdf-overlay classroom-pdf-overlay-input"
            :style="field.style"
            :disabled="disabled || field.autoToday"
            :value="modelValue?.[field.fieldId] ?? ''"
            type="date"
            @input="updateField(field.fieldId, $event.target.value)"
          />

          <input
            v-else
            class="classroom-pdf-overlay classroom-pdf-overlay-input"
            :style="field.style"
            :disabled="disabled"
            :placeholder="field.label"
            :type="field.kind === 'ssn' ? 'password' : 'text'"
            :value="modelValue?.[field.fieldId] ?? ''"
            @input="updateField(field.fieldId, $event.target.value)"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';

const workerVersion = pdfjsLib.version || '5.4.530';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${workerVersion}/build/pdf.worker.min.mjs`;

const props = defineProps({
  pdfUrl: { type: String, required: true },
  fieldDefinitions: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'loaded', 'page-change']);

const containerRef = ref(null);
const canvasRef = ref(null);
const loading = ref(true);
const error = ref('');
const currentPage = ref(1);
const totalPages = ref(0);
const scale = ref(1);

let pdfDoc = null;
let rendering = false;
let didInitialFit = false;
let userZoomed = false;
let lastViewport = null;
let lastViewportBase = null;

const isFieldVisible = (field) => {
  const showIf = field?.showIf;
  if (!showIf || !showIf.fieldId) return true;
  const actual = props.modelValue?.[showIf.fieldId];
  const expected = showIf.equals;
  if (Array.isArray(expected)) {
    return expected.map(String).includes(String(actual));
  }
  if (expected === '' || expected === null || expected === undefined) {
    return Boolean(actual);
  }
  return String(actual ?? '') === String(expected ?? '');
};

const positionedFields = computed(() => {
  if (!lastViewport || !lastViewportBase || !canvasRef.value) return [];
  const canvasWidth = canvasRef.value.width || lastViewport.width;
  const canvasHeight = canvasRef.value.height || lastViewport.height;
  const baseWidth = lastViewportBase.width || lastViewport.width;
  const baseHeight = lastViewportBase.height || lastViewport.height;
  const fields = [];

  (props.fieldDefinitions || []).filter(isFieldVisible).forEach((field) => {
    if (field.type === 'radio') {
      (field.options || []).forEach((option) => {
        const page = Number(option.page || field.page || 1) || 1;
        if (page !== currentPage.value || option.x == null || option.y == null) return;
        const width = Number(option.width ?? field.width ?? 24) || 24;
        const height = Number(option.height ?? field.height ?? 24) || 24;
        const top = ((baseHeight - Number(option.y) - height) / baseHeight) * canvasHeight;
        const left = (Number(option.x) / baseWidth) * canvasWidth;
        fields.push({
          renderKey: `${field.id}-${option.id}`,
          fieldId: field.id,
          optionValue: option.value || option.label || '',
          label: option.label || option.value || 'Option',
          kind: 'radio',
          style: {
            left: `${left}px`,
            top: `${top}px`,
            width: `${(width / baseWidth) * canvasWidth}px`,
            height: `${(height / baseHeight) * canvasHeight}px`
          }
        });
      });
      return;
    }

    const page = Number(field.page || 1) || 1;
    if (page !== currentPage.value || field.x == null || field.y == null) return;
    const width = Number(field.width || (field.type === 'checkbox' ? 22 : 140)) || 140;
    const height = Number(field.height || (field.type === 'checkbox' ? 22 : 28)) || 28;
    const top = ((baseHeight - Number(field.y) - height) / baseHeight) * canvasHeight;
    const left = (Number(field.x) / baseWidth) * canvasWidth;
    fields.push({
      renderKey: String(field.id),
      fieldId: field.id,
      label: field.label || 'Field',
      kind: field.type || 'text',
      autoToday: !!field.autoToday,
      options: Array.isArray(field.options) ? field.options : [],
      style: {
        left: `${left}px`,
        top: `${top}px`,
        width: `${(width / baseWidth) * canvasWidth}px`,
        height: `${(height / baseHeight) * canvasHeight}px`
      }
    });
  });

  return fields;
});

const fitToWidth = async (page) => {
  if (!containerRef.value) return;
  const viewportAtOne = page.getViewport({ scale: 1 });
  const containerWidth = Math.max(320, containerRef.value.clientWidth - 8);
  const nextScale = containerWidth / viewportAtOne.width;
  scale.value = Math.min(2.2, Math.max(0.6, nextScale));
};

const renderPage = async (pageNumber) => {
  if (!pdfDoc || rendering) return;
  rendering = true;
  try {
    await nextTick();
    const canvas = canvasRef.value;
    if (!canvas) return;

    const page = await pdfDoc.getPage(pageNumber);
    if (!didInitialFit && !userZoomed) {
      await fitToWidth(page);
      didInitialFit = true;
    }
    const viewportBase = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: scale.value });
    lastViewportBase = viewportBase;
    lastViewport = viewport;

    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
  } catch (err) {
    error.value = err?.message || 'Failed to render PDF';
  } finally {
    rendering = false;
  }
};

const loadPdf = async () => {
  if (!props.pdfUrl) return;
  loading.value = true;
  error.value = '';
  currentPage.value = 1;
  totalPages.value = 0;
  pdfDoc = null;
  didInitialFit = false;
  userZoomed = false;
  lastViewport = null;
  lastViewportBase = null;

  try {
    const task = pdfjsLib.getDocument({ url: props.pdfUrl, withCredentials: true });
    pdfDoc = await task.promise;
    totalPages.value = pdfDoc.numPages;
    loading.value = false;
    emit('loaded', { totalPages: totalPages.value });
    await renderPage(1);
  } catch (err) {
    error.value = err?.message || 'Failed to load PDF';
    loading.value = false;
  }
};

const updateField = (fieldId, value) => {
  const nextValue = { ...(props.modelValue || {}), [fieldId]: value };
  emit('update:modelValue', nextValue);
};

const previousPage = async () => {
  if (currentPage.value <= 1) return;
  currentPage.value -= 1;
  await renderPage(currentPage.value);
  emit('page-change', { currentPage: currentPage.value, totalPages: totalPages.value });
};

const nextPage = async () => {
  if (currentPage.value >= totalPages.value) return;
  currentPage.value += 1;
  await renderPage(currentPage.value);
  emit('page-change', { currentPage: currentPage.value, totalPages: totalPages.value });
};

const zoomOut = async () => {
  scale.value = Math.max(0.6, Number((scale.value - 0.1).toFixed(2)));
  userZoomed = true;
  await renderPage(currentPage.value);
};

const zoomIn = async () => {
  scale.value = Math.min(2.2, Number((scale.value + 0.1).toFixed(2)));
  userZoomed = true;
  await renderPage(currentPage.value);
};

watch(
  () => props.pdfUrl,
  () => {
    loadPdf();
  },
  { immediate: true }
);

watch(
  () => props.fieldDefinitions,
  async () => {
    if (!loading.value && pdfDoc) {
      await renderPage(currentPage.value);
    }
  },
  { deep: true }
);

onMounted(() => {
  loadPdf();
});

onBeforeUnmount(() => {
  pdfDoc = null;
});
</script>

<style scoped>
.classroom-pdf-workspace {
  display: grid;
  gap: 10px;
}

.classroom-pdf-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.classroom-pdf-toolbar-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.classroom-pdf-btn {
  border: 1px solid rgba(24, 35, 55, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  color: #182337;
  padding: 7px 10px;
  font: inherit;
  cursor: pointer;
}

.classroom-pdf-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.classroom-pdf-indicator {
  font-size: 0.9rem;
  color: #5d6c83;
}

.classroom-pdf-viewer {
  position: relative;
  min-height: 420px;
  max-height: 780px;
  overflow: auto;
  border: 1px solid #d7dfeb;
  border-radius: 16px;
  background: #eef3fb;
  padding: 10px;
}

.classroom-pdf-state {
  display: grid;
  place-items: center;
  min-height: 320px;
  color: #56667f;
}

.classroom-pdf-state-error {
  color: #b4364f;
}

.classroom-pdf-canvas-layer {
  position: relative;
  width: max-content;
}

.classroom-pdf-canvas {
  display: block;
  border-radius: 12px;
  box-shadow: 0 16px 34px rgba(8, 17, 31, 0.12);
}

.classroom-pdf-overlay {
  position: absolute;
  display: flex;
  align-items: center;
}

.classroom-pdf-overlay-input {
  position: absolute;
  border: 1px solid rgba(24, 35, 55, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  color: #182337;
  padding: 4px 6px;
  font: 600 0.78rem/1.2 "Source Sans 3", "Segoe UI", sans-serif;
}

.classroom-pdf-overlay-input:disabled {
  background: rgba(244, 247, 252, 0.98);
  color: #6c7890;
}

.classroom-pdf-overlay-checkbox {
  justify-content: center;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(24, 35, 55, 0.18);
  border-radius: 8px;
}

.classroom-pdf-overlay-checkbox input {
  width: 16px;
  height: 16px;
}

.classroom-pdf-overlay-radio {
  gap: 4px;
  padding: 2px 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  font-size: 0.68rem;
  color: #182337;
}

.classroom-pdf-overlay-radio input {
  margin: 0;
}
</style>
