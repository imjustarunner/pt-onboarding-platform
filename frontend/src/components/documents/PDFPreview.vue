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
      <canvas v-else ref="canvasRef" class="pdf-canvas"></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';

const workerVersion = pdfjsLib.version || '5.4.530';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${workerVersion}/build/pdf.worker.min.mjs`;

const props = defineProps({
  pdfUrl: { type: String, required: true }
});

const emit = defineEmits(['loaded', 'page-change']);

const containerRef = ref(null);
const canvasRef = ref(null);

const loading = ref(true);
const error = ref('');
const currentPage = ref(1);
const totalPages = ref(0);
const scale = ref(1.0);

let pdfDoc = null;
let rendering = false;
let didInitialFit = false;
let userZoomed = false;

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
    const viewport = page.getViewport({ scale: scale.value });

    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch (e) {
    console.error('PDF render error:', e);
    error.value = e?.message || 'Failed to render PDF';
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

.pdf-canvas {
  display: block;
  margin: 0;
  background: white;
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

