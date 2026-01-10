<template>
  <div class="pdf-coordinate-picker">
    <div class="picker-header">
      <h4>Set Signature Position</h4>
      <p class="instructions">
        Click on the PDF where you want the signature to be placed. 
        You can adjust the size using the controls below.
      </p>
    </div>

    <div class="pdf-viewer-container" ref="containerRef">
      <div v-if="loading" class="loading">Loading PDF...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else class="pdf-viewer-wrapper">
        <canvas 
          ref="canvasRef" 
          @click="handleCanvasClick"
          class="pdf-canvas"
          :class="{ 'picking-mode': pickingMode }"
        ></canvas>
        
        <!-- Signature preview overlay -->
        <div 
          v-if="coordinates.x !== null && coordinates.y !== null"
          class="signature-preview"
          :style="previewStyle"
        >
          <div class="preview-label">Signature</div>
        </div>
      </div>
    </div>

    <div class="coordinate-controls">
      <div class="control-group">
        <label>X Position (points)</label>
        <input 
          type="number" 
          v-model.number="coordinates.x" 
          @input="updateCoordinates"
          step="1"
          min="0"
        />
      </div>
      <div class="control-group">
        <label>Y Position (points)</label>
        <input 
          type="number" 
          v-model.number="coordinates.y" 
          @input="updateCoordinates"
          step="1"
          min="0"
        />
      </div>
      <div class="control-group">
        <label>Width (points)</label>
        <input 
          type="number" 
          v-model.number="coordinates.width" 
          @input="updateCoordinates"
          step="1"
          min="50"
          max="500"
        />
      </div>
      <div class="control-group">
        <label>Height (points)</label>
        <input 
          type="number" 
          v-model.number="coordinates.height" 
          @input="updateCoordinates"
          step="1"
          min="30"
          max="200"
        />
      </div>
      <div class="control-group">
        <label>Page Number</label>
        <input 
          type="number" 
          v-model.number="coordinates.page" 
          @input="updateCoordinates"
          step="1"
          min="1"
          :max="totalPages"
        />
        <small>Leave empty or 0 for last page</small>
      </div>
    </div>

    <div class="picker-actions">
      <button @click="enablePicking" class="btn btn-primary" :disabled="pickingMode">
        {{ pickingMode ? 'Click on PDF to set position' : 'Click to Set Position' }}
      </button>
      <button @click="clearCoordinates" class="btn btn-secondary">Clear</button>
      <button @click="resetView" class="btn btn-secondary">Reset View</button>
    </div>

    <div class="page-navigation" v-if="totalPages > 1">
      <button @click="previousPage" :disabled="currentPage === 1" class="btn btn-sm">Previous</button>
      <span>Page {{ currentPage }} of {{ totalPages }}</span>
      <button @click="nextPage" :disabled="currentPage === totalPages" class="btn btn-sm">Next</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed, nextTick } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker - use jsdelivr CDN which is more reliable
// Fallback to local worker if CDN fails
const workerVersion = pdfjsLib.version || '5.4.530';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${workerVersion}/build/pdf.worker.min.mjs`;

const props = defineProps({
  pdfUrl: {
    type: String,
    required: true
  },
  modelValue: {
    type: Object,
    default: () => ({
      x: null,
      y: null,
      width: 200,
      height: 60,
      page: null
    })
  }
});

const emit = defineEmits(['update:modelValue']);

const containerRef = ref(null);
const canvasRef = ref(null);
const loading = ref(true);
const error = ref(null);
const pickingMode = ref(false);
const currentPage = ref(1);
const totalPages = ref(0);
const scale = ref(1.5);
let pdfDoc = null;
let pageRendering = false;

const coordinates = ref({
  x: props.modelValue.x ?? null,
  y: props.modelValue.y ?? null,
  width: props.modelValue.width ?? 200,
  height: props.modelValue.height ?? 60,
  page: props.modelValue.page ?? null
});

const previewStyle = ref({ display: 'none' });

// Flag to prevent recursive updates
let isUpdatingFromProps = false;
let isInitialMount = true;

// Watch for external changes to modelValue
watch(() => props.modelValue, (newVal) => {
  if (newVal && !isUpdatingFromProps) {
    const newCoords = {
      x: newVal.x ?? null,
      y: newVal.y ?? null,
      width: newVal.width ?? 200,
      height: newVal.height ?? 60,
      page: newVal.page ?? null
    };
    
    // Only update if values are actually different
    if (
      coordinates.value.x !== newCoords.x ||
      coordinates.value.y !== newCoords.y ||
      coordinates.value.width !== newCoords.width ||
      coordinates.value.height !== newCoords.height ||
      coordinates.value.page !== newCoords.page
    ) {
      isUpdatingFromProps = true;
      coordinates.value = newCoords;
      if (newVal.page && newVal.page !== currentPage.value && pdfDoc) {
        currentPage.value = newVal.page;
        renderPage(newVal.page);
      }
      // Reset flag after next tick
      nextTick(() => {
        isUpdatingFromProps = false;
      });
    }
  }
}, { deep: true });

// Watch coordinates and emit updates
watch(coordinates, async (newCoords) => {
  if (!isUpdatingFromProps && !isInitialMount) {
    emit('update:modelValue', { ...newCoords });
  }
  // Update preview style when coordinates change
  if (newCoords.x !== null && newCoords.y !== null) {
    previewStyle.value = await getPreviewStyle();
  } else {
    previewStyle.value = { display: 'none' };
  }
}, { deep: true });

// Watch for page changes to update preview
watch(currentPage, async () => {
  if (coordinates.value.x !== null && coordinates.value.y !== null) {
    previewStyle.value = await getPreviewStyle();
  }
});

const loadPDF = async () => {
  try {
    if (!props.pdfUrl) {
      error.value = 'PDF URL is required';
      return;
    }
    
    // Wait for container to be mounted (important for conditionally rendered components)
    await nextTick();
    let retries = 30;
    while (!containerRef.value && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 50));
      retries--;
    }
    
    if (!containerRef.value) {
      throw new Error('Component container not found. Please ensure the component is fully mounted.');
    }
    
    loading.value = true;
    error.value = null;
    
    // Load the PDF document first
    const loadingTask = pdfjsLib.getDocument(props.pdfUrl);
    pdfDoc = await loadingTask.promise;
    totalPages.value = pdfDoc.numPages;
    
    // Set initial page based on coordinates or default to page 1
    const initialPage = coordinates.value.page && coordinates.value.page <= totalPages.value 
      ? coordinates.value.page 
      : 1;
    currentPage.value = initialPage;
    
    // Set loading to false so the canvas appears in the DOM
    loading.value = false;
    
    // Wait for canvas to appear after loading state changes
    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Now render the page (canvas should be available now)
    await renderPage(initialPage);
    
    // Update preview style if coordinates are set
    if (coordinates.value.x !== null && coordinates.value.y !== null) {
      previewStyle.value = await getPreviewStyle();
    }
  } catch (err) {
    console.error('Error loading PDF:', err);
    error.value = err.message || 'Failed to load PDF. Please check the file URL.';
    loading.value = false;
  }
};

const renderPage = async (pageNum) => {
  if (pageRendering) return;
  if (!pdfDoc) return;
  
  pageRendering = true;
  
  try {
    // Wait for canvas to be available (it's conditionally rendered when loading is false)
    await nextTick();
    let retries = 20;
    while (!canvasRef.value && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 50));
      retries--;
    }
    
    const canvas = canvasRef.value;
    if (!canvas) {
      console.warn('Canvas not available for rendering');
      pageRendering = false;
      return;
    }
    
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: scale.value });
    
    const context = canvas.getContext('2d');
    
    // Set canvas dimensions
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // Clear the canvas before rendering
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Wait a tiny bit to ensure canvas is ready
    await nextTick();
    
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    pageRendering = false;
    
    // Update preview style after rendering
    if (coordinates.value.x !== null && coordinates.value.y !== null) {
      previewStyle.value = await getPreviewStyle();
    }
  } catch (err) {
    console.error('Error rendering page:', err);
    pageRendering = false;
  }
};

const handleCanvasClick = async (event) => {
  if (!pickingMode.value || !pdfDoc) return;
  
  const canvas = canvasRef.value;
  if (!canvas) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  try {
    // Convert canvas coordinates to PDF points
    // Get the page's viewport - use scale 1.0 to get actual PDF dimensions in points
    const page = await pdfDoc.getPage(currentPage.value);
    const pdfViewport = page.getViewport({ scale: 1.0 }); // Get unscaled viewport for actual PDF dimensions
    const displayViewport = page.getViewport({ scale: scale.value }); // Scaled viewport for display
    
    // Calculate PDF coordinates from canvas click position
    // X coordinate: direct mapping (both use left-to-right)
    const pdfX = (x / canvas.width) * pdfViewport.width;
    
    // Y coordinate: PDF uses bottom-left origin, canvas uses top-left origin
    // Canvas Y increases downward, PDF Y increases upward
    // User clicks at position y (from top of canvas) - this is where they want the signature
    // Convert to PDF Y coordinate (from bottom of PDF page)
    const canvasYFromTop = y; // Y position from top of canvas in pixels
    const pdfYFromTop = (canvasYFromTop / canvas.height) * pdfViewport.height; // Convert to PDF points from top
    const clickedPdfY = pdfViewport.height - pdfYFromTop; // PDF Y coordinate from bottom where user clicked
    
    // pdf-lib's drawImage() places the BOTTOM-LEFT corner of the image at the specified Y coordinate
    // The user clicks where they want the signature to appear - we'll interpret this as where they want
    // the CENTER of the signature to be. So we need to adjust the Y coordinate.
    const signatureHeight = coordinates.value.height || 60; // Default height if not set
    // If user clicks at Y, and we want the center there, the bottom-left should be at Y - (height/2)
    const pdfY = clickedPdfY - (signatureHeight / 2); // Center the signature on the click position
    
    // Ensure Y doesn't go negative (signature would be cut off)
    const finalPdfY = Math.max(0, pdfY);
    
    // Debug logging
    console.log('=== Signature Coordinate Calculation ===');
    console.log('Canvas click position:', { x, y, canvasWidth: canvas.width, canvasHeight: canvas.height });
    console.log('PDF viewport (unscaled):', { width: pdfViewport.width, height: pdfViewport.height });
    console.log('Coordinate conversion steps:', {
      canvasYFromTop,
      pdfYFromTop: pdfYFromTop.toFixed(2),
      clickedPdfY: clickedPdfY.toFixed(2),
      signatureHeight,
      pdfY: pdfY.toFixed(2),
      finalPdfY: finalPdfY.toFixed(2)
    });
    console.log('Final stored coordinates:', { 
      x: Math.round(pdfX), 
      y: Math.round(finalPdfY),
      width: coordinates.value.width,
      height: coordinates.value.height,
      page: currentPage.value
    });
    console.log('========================================');
    
    coordinates.value.x = Math.round(pdfX);
    coordinates.value.y = Math.round(finalPdfY);
    coordinates.value.page = currentPage.value;
    
    pickingMode.value = false;
  } catch (err) {
    console.error('Error calculating PDF coordinates:', err);
    error.value = 'Failed to set coordinates. Please try again.';
  }
};

const enablePicking = () => {
  pickingMode.value = true;
};

const clearCoordinates = () => {
  coordinates.value = {
    x: null,
    y: null,
    width: 200,
    height: 60,
    page: null
  };
  pickingMode.value = false;
};

const updateCoordinates = () => {
  // Coordinates are already reactive, just ensure they're valid
  if (coordinates.value.page && coordinates.value.page > totalPages.value) {
    coordinates.value.page = totalPages.value;
  }
  if (coordinates.value.page && coordinates.value.page < 1) {
    coordinates.value.page = null;
  }
};

const resetView = () => {
  renderPage(currentPage.value);
};

const previousPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
    renderPage(currentPage.value);
  }
};

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    renderPage(currentPage.value);
  }
};

const getPreviewStyle = async () => {
  if (!canvasRef.value || coordinates.value.x === null || coordinates.value.y === null || !pdfDoc) {
    return { display: 'none' };
  }
  
  try {
    const canvas = canvasRef.value;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // Get the page to access viewport for accurate conversion
    const page = await pdfDoc.getPage(coordinates.value.page || currentPage.value);
    const pdfViewport = page.getViewport({ scale: 1.0 }); // Unscaled viewport for actual PDF dimensions
    const displayViewport = page.getViewport({ scale: scale.value }); // Scaled viewport for display
    
    // Convert PDF X coordinate to canvas X (both use left-to-right)
    const canvasX = (coordinates.value.x / pdfViewport.width) * canvasWidth;
    
    // Convert PDF Y coordinate to canvas Y
    // PDF Y is from bottom, canvas Y is from top
    // coordinates.value.y is the PDF Y coordinate (from bottom) where the bottom-left corner of signature will be placed
    const pdfYFromBottom = coordinates.value.y; // PDF Y coordinate (from bottom) - this is the bottom-left corner
    const pdfYFromTop = pdfViewport.height - pdfYFromBottom; // Convert to distance from top in PDF points
    const canvasY = (pdfYFromTop / pdfViewport.height) * canvasHeight; // Convert to canvas pixels from top
    
    // Convert width and height from PDF points to canvas pixels
    const canvasWidth_pdf = (coordinates.value.width / pdfViewport.width) * canvasWidth;
    const canvasHeight_pdf = (coordinates.value.height / pdfViewport.height) * canvasHeight;
    
    // Preview should show where the signature will appear
    // pdf-lib places the bottom-left corner at (x, y), so the signature extends upward from there
    // On canvas, we need to show the preview with its bottom edge at canvasY
    // Since we're centering the signature on the click, the stored Y is (clickY - height/2)
    // So the bottom-left is at that Y, and the signature extends upward from there
    const previewTop = canvasY - canvasHeight_pdf; // Top of preview box (bottom-left at canvasY, extends upward)
    
    // Debug logging
    console.log('Preview style calculation:', {
      storedPdfCoords: { x: coordinates.value.x, y: coordinates.value.y },
      pdfViewport: { width: pdfViewport.width, height: pdfViewport.height },
      canvasSize: { width: canvasWidth, height: canvasHeight },
      calculated: { 
        pdfYFromBottom, 
        pdfYFromTop: pdfYFromTop.toFixed(2), 
        canvasY: canvasY.toFixed(2), 
        previewTop: previewTop.toFixed(2), 
        canvasWidth_pdf: canvasWidth_pdf.toFixed(2), 
        canvasHeight_pdf: canvasHeight_pdf.toFixed(2) 
      }
    });
    
    return {
      position: 'absolute',
      left: `${canvasX}px`,
      top: `${previewTop}px`, // Position from top, accounting for height
      width: `${canvasWidth_pdf}px`,
      height: `${canvasHeight_pdf}px`,
      border: '2px dashed #007bff',
      backgroundColor: 'rgba(0, 123, 255, 0.1)',
      pointerEvents: 'none',
      boxSizing: 'border-box'
    };
  } catch (err) {
    console.error('Error calculating preview style:', err);
    return { display: 'none' };
  }
};

// Watch for pdfUrl changes (important for conditionally rendered components)
watch(() => props.pdfUrl, (newUrl) => {
  if (newUrl && !pdfDoc) {
    // Wait a bit to ensure component is fully mounted
    nextTick(() => {
      setTimeout(() => {
        loadPDF();
      }, 100);
    });
  }
}, { immediate: true });

onMounted(() => {
  // Only load if pdfUrl is already set (for immediate mounts)
  // Otherwise, the watcher will handle it
  if (props.pdfUrl) {
    // Give extra time for conditional rendering
    nextTick(() => {
      setTimeout(() => {
        loadPDF();
      }, 100);
    });
  }
  // Allow emits after initial mount
  nextTick(() => {
    isInitialMount = false;
  });
});
</script>

<style scoped>
.pdf-coordinate-picker {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.picker-header {
  margin-bottom: 8px;
}

.picker-header h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
}

.instructions {
  margin: 0;
  color: var(--text-secondary, #666);
  font-size: 14px;
}

.pdf-viewer-container {
  position: relative;
  border: 2px solid var(--border, #ddd);
  border-radius: 8px;
  background: #f5f5f5;
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  max-height: 600px;
}

.pdf-viewer-wrapper {
  position: relative;
  display: inline-block;
}

.pdf-canvas {
  display: block;
  max-width: 100%;
  cursor: default;
}

.pdf-canvas.picking-mode {
  cursor: crosshair;
}

.signature-preview {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed #007bff;
  background-color: rgba(0, 123, 255, 0.1);
  pointer-events: none;
}

.preview-label {
  color: #007bff;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}

.loading, .error {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary, #666);
}

.error {
  color: var(--error-color, #dc3545);
}

.coordinate-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #666);
}

.control-group input {
  padding: 8px;
  border: 1px solid var(--border, #ddd);
  border-radius: 4px;
  font-size: 14px;
}

.control-group small {
  font-size: 11px;
  color: var(--text-secondary, #666);
}

.picker-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.page-navigation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
}

.page-navigation button {
  padding: 6px 12px;
}
</style>
