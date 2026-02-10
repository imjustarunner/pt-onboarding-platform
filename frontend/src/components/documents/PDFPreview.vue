<template>
  <div class="pdf-preview">
    <div class="toolbar">
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

    <div class="viewer" ref="containerRef">
      <div v-if="loading" class="loading">Loading PDF…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else class="canvas-layer">
        <canvas ref="canvasRef" class="pdf-canvas"></canvas>
        <button
          v-for="marker in markers"
          :key="marker.id"
          class="pdf-marker"
          :class="{
            active: marker.id === activeMarkerId,
            checkbox: marker.type === 'checkbox',
            checked: marker.type === 'checkbox' && marker.checked
          }"
          :style="markerStyles[marker.id] || { display: 'none' }"
          type="button"
          @click.stop="emit('marker-click', marker)"
          :aria-label="marker.label || 'Custom field'"
        >
          <span v-if="marker.type === 'checkbox'" class="marker-checkbox" aria-hidden="true">✓</span>
          <span v-else class="marker-label">{{ marker.label || marker.type || 'Field' }}</span>
        </button>
      </div>
    </div>

    <div class="toolbar toolbar-bottom">
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
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';

const workerVersion = pdfjsLib.version || '5.4.530';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${workerVersion}/build/pdf.worker.min.mjs`;

const props = defineProps({
  pdfUrl: { type: String, required: true },
  markers: { type: Array, default: () => [] },
  activeMarkerId: { type: String, default: null }
});

const emit = defineEmits(['loaded', 'page-change', 'marker-click']);

const containerRef = ref(null);
const canvasRef = ref(null);

const loading = ref(true);
const error = ref('');
const currentPage = ref(1);
const totalPages = ref(0);
const scale = ref(1.0);
const markerStyles = ref({});

let pdfDoc = null;
let rendering = false;
let didInitialFit = false;
let userZoomed = false;
let lastViewport = null;
let lastViewportBase = null;

const fitToWidth = async (page) => {
  if (!containerRef.value) return;
  const viewportAt1 = page.getViewport({ scale: 1.0 });
  const containerWidth = Math.max(320, containerRef.value.clientWidth);
  const nextScale = containerWidth / viewportAt1.width;
  // Clamp to avoid extreme zoom. Allow more auto-upscale so it snaps to width.
  scale.value = Math.min(2.2, Math.max(0.5, nextScale));
};

const renderPage = async (pageNum) => {
  if (!pdfDoc || rendering) return;
  rendering = true;
  try {
    await nextTick();
    const canvas = canvasRef.value;
    if (!canvas) return;

    const page = await pdfDoc.getPage(pageNum);
    // Auto-fit width only once (initial load), and never override user zoom.
    if (!didInitialFit && !userZoomed) {
      await fitToWidth(page);
      didInitialFit = true;
    }
    const viewportBase = page.getViewport({ scale: 1.0 });
    const viewport = page.getViewport({ scale: scale.value });
    lastViewportBase = viewportBase;
    lastViewport = viewport;

    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    updateMarkerStyles();
    if (containerRef.value) {
      containerRef.value.scrollTop = 0;
      containerRef.value.scrollLeft = 0;
    }
  } catch (e) {
    console.error('PDF render error:', e);
    error.value = e?.message || 'Failed to render PDF';
  } finally {
    rendering = false;
  }
};

const updateMarkerStyles = () => {
  if (!canvasRef.value || !lastViewport) return;
  const canvas = canvasRef.value;
  const canvasWidth = canvas.width || lastViewport.width;
  const canvasHeight = canvas.height || lastViewport.height;
  const baseViewport = lastViewportBase || lastViewport;
  const baseWidth = baseViewport.width || lastViewport.width;
  const baseHeight = baseViewport.height || lastViewport.height;
  const styles = {};
  const pageMarkers = (props.markers || []).filter((m) => (m.page || 1) === currentPage.value);

  pageMarkers.forEach((marker) => {
    if (marker.x === null || marker.y === null) return;
    const pdfYFromTop = baseHeight - marker.y;
    const canvasX = (marker.x / baseWidth) * canvasWidth;
    const canvasY = (pdfYFromTop / baseHeight) * canvasHeight;
    const canvasWidthPdf = (marker.width / baseWidth) * canvasWidth;
    const canvasHeightPdf = (marker.height / baseHeight) * canvasHeight;
    const previewTop = canvasY - canvasHeightPdf;
    styles[marker.id] = {
      left: `${canvasX}px`,
      top: `${previewTop}px`,
      width: `${canvasWidthPdf}px`,
      height: `${canvasHeightPdf}px`
    };
  });
  markerStyles.value = styles;
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

  try {
    // Use CORS-enabled XHR (backend already sets ACAO for localhost:5173)
    const task = pdfjsLib.getDocument({ url: props.pdfUrl, withCredentials: true });
    pdfDoc = await task.promise;
    totalPages.value = pdfDoc.numPages;
    loading.value = false;
    emit('loaded', { totalPages: totalPages.value });
    await nextTick();
    await renderPage(1);
  } catch (e) {
    console.error('PDF load error:', e);
    error.value = e?.message || 'Failed to load PDF';
    loading.value = false;
  }
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

const goToPage = async (pageNum) => {
  if (!pdfDoc) return;
  const target = Math.max(1, Math.min(Number(pageNum) || 1, totalPages.value || 1));
  if (target === currentPage.value) return;
  currentPage.value = target;
  await renderPage(currentPage.value);
  emit('page-change', { currentPage: currentPage.value, totalPages: totalPages.value });
};

const zoomIn = async () => {
  userZoomed = true;
  scale.value = Math.min(3.0, scale.value + 0.15);
  await renderPage(currentPage.value);
};

const zoomOut = async () => {
  userZoomed = true;
  scale.value = Math.max(0.25, scale.value - 0.15);
  await renderPage(currentPage.value);
};

watch(() => props.pdfUrl, () => {
  loadPdf();
}, { immediate: true });

watch(
  () => [props.markers, currentPage.value, scale.value],
  () => {
    updateMarkerStyles();
  },
  { deep: true }
);

defineExpose({
  goToPage,
  goToNextPage: nextPage,
  goToPreviousPage: previousPage
});

onMounted(() => {
  // Re-fit on resize only if user hasn't manually zoomed.
  window.addEventListener('resize', () => {
    if (!pdfDoc) return;
    if (userZoomed) return;
    // Allow a refit (but don't mark as user zoom)
    didInitialFit = false;
    renderPage(currentPage.value);
  });
});
</script>

<style scoped>
.pdf-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
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

.viewer {
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  background: white;
  height: 80vh;
  min-height: 520px;
  overflow: auto;
  padding: 0;
  width: 100%;
}

.canvas-layer {
  position: relative;
  display: inline-block;
}

.pdf-canvas {
  display: block;
  margin: 0;
  background: white;
}

.pdf-marker {
  position: absolute;
  border: 2px dashed #ff8c00;
  background: rgba(255, 140, 0, 0.12);
  color: #8a4a00;
  font-size: 10px;
  line-height: 1.2;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  cursor: pointer;
  z-index: 2;
}

.pdf-marker.active {
  border-color: #1f4e79;
  background: rgba(31, 78, 121, 0.14);
  color: #1f4e79;
}

.pdf-marker.checkbox {
  border: 3px solid #1f4e79;
  background: rgba(31, 78, 121, 0.18);
  box-shadow: 0 0 0 2px rgba(31, 78, 121, 0.2);
  min-width: 22px;
  min-height: 22px;
  align-items: center;
  justify-content: center;
}

.pdf-marker.checkbox .marker-checkbox {
  font-size: 16px;
  line-height: 1;
  font-weight: 700;
  color: #1f4e79;
  opacity: 0;
}

.pdf-marker.checkbox.checked .marker-checkbox {
  opacity: 1;
}

.marker-label {
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 4px;
  border-radius: 3px;
  pointer-events: none;
  white-space: nowrap;
}

.loading,
.error {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary, #666);
}

.error {
  color: var(--error-color, #dc3545);
}
</style>

