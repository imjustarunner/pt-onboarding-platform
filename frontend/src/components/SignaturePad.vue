<template>
  <div class="signature-pad-container" :class="{ compact: compact }">
    <div v-if="!signed" class="signature-area">
      <div class="signature-hint">Please sign here with your finger or mouse.</div>
      <canvas
        ref="canvas"
        @mousedown="startDrawing"
        @mousemove="draw"
        @mouseup="stopDrawing"
        @mouseleave="stopDrawing"
        @touchstart="startDrawingTouch"
        @touchmove="drawTouch"
        @touchend="stopDrawing"
      ></canvas>
      <div class="signature-controls">
        <button @click="clearSignature" class="btn btn-secondary">Clear</button>
        <button @click="saveSignature" class="btn btn-primary" :disabled="!hasSignature || saving">
          {{ saving ? 'Saving...' : 'Save Signature' }}
        </button>
      </div>
    </div>
    <div v-else class="signature-saved">
      <div class="success">
        ✓ Signature saved successfully
      </div>
      <div v-if="compact" class="signature-compact">
        <div class="signature-preview-small">
          <img :src="signatureData" alt="Saved signature" />
        </div>
        <div class="signature-links">
          <button type="button" class="link-btn" @click="showExpanded = !showExpanded">
            {{ showExpanded ? 'Hide signature' : 'Show signature' }}
          </button>
          <span class="link-sep">·</span>
          <button type="button" class="link-btn" @click="resetSignature">Change signature</button>
        </div>
        <div v-if="showExpanded" class="signature-preview-expanded">
          <img :src="signatureData" alt="Saved signature" />
        </div>
      </div>
      <template v-else>
        <div class="signature-preview">
          <img :src="signatureData" alt="Saved signature" />
        </div>
        <button @click="resetSignature" class="btn btn-secondary">Sign Again</button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue';
import api from '../services/api';

const props = defineProps({
  moduleId: {
    type: [String, Number],
    required: false,
    default: null
  },
  compact: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['signed']);

const canvas = ref(null);
const isDrawing = ref(false);
const hasSignature = ref(false);
const signed = ref(false);
const saving = ref(false);
const signatureData = ref('');
const showExpanded = ref(false);

let ctx = null;

const setupCanvas = () => {
  if (!canvas.value) return;
  
  ctx = canvas.value.getContext('2d');
  canvas.value.width = canvas.value.offsetWidth;
  canvas.value.height = props.compact ? 120 : 300;
  
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
};

const getEventPos = (e) => {
  const rect = canvas.value.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
};

const getTouchPos = (e) => {
  const rect = canvas.value.getBoundingClientRect();
  const touch = e.touches[0] || e.changedTouches[0];
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top
  };
};

const startDrawing = (e) => {
  isDrawing.value = true;
  const pos = getEventPos(e);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  hasSignature.value = true;
};

const draw = (e) => {
  if (!isDrawing.value) return;
  const pos = getEventPos(e);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
};

const stopDrawing = () => {
  isDrawing.value = false;
};

const startDrawingTouch = (e) => {
  e.preventDefault();
  isDrawing.value = true;
  const pos = getTouchPos(e);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  hasSignature.value = true;
};

const drawTouch = (e) => {
  e.preventDefault();
  if (!isDrawing.value) return;
  const pos = getTouchPos(e);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
};

const clearSignature = () => {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  hasSignature.value = false;
};

const saveSignature = async () => {
  if (!hasSignature.value) return;
  
  try {
    saving.value = true;
    const dataUrl = canvas.value.toDataURL('image/png');
    
    // For module signatures, save to API
    if (props.moduleId) {
      await api.post('/signatures', {
        moduleId: parseInt(props.moduleId),
        signatureData: dataUrl
      });
    }
    
    signatureData.value = dataUrl;
    signed.value = true;
    emit('signed', dataUrl);
  } catch (error) {
    alert(error.response?.data?.error?.message || 'Failed to save signature');
  } finally {
    saving.value = false;
  }
};

const resetSignature = () => {
  signed.value = false;
  signatureData.value = '';
  hasSignature.value = false;
};

const initCanvas = async () => {
  await nextTick();
  setupCanvas();
};

watch(
  () => signed.value,
  (isSigned) => {
    if (!isSigned) nextTick().then(setupCanvas);
  }
);

onMounted(async () => {
  await initCanvas();

  // Check if signature already exists
  if (!props.moduleId) return;
  try {
    const response = await api.get(`/signatures/${props.moduleId}`);
    signatureData.value = response.data.signature_data;
    signed.value = true;
    emit('signed', signatureData.value);
  } catch (e) {
    // No signature yet
  }
});
</script>

<style scoped>
.signature-pad-container {
  width: 100%;
}

.signature-area {
  position: relative;
  border: 2px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: white;
  box-shadow: var(--shadow);
}

.signature-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 12px;
  font-size: 14px;
  color: #8a8f98;
  pointer-events: none;
}

.signature-area canvas {
  display: block;
  width: 100%;
  cursor: crosshair;
  background: white;
}

.signature-controls {
  display: flex;
  justify-content: space-between;
  padding: 15px;
  background: #f8f9fa;
  border-top: 1px solid #ddd;
}

.signature-saved {
  text-align: center;
}

.signature-preview {
  margin: 20px 0;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.signature-preview img {
  max-width: 100%;
  border: 1px solid #ddd;
  border-radius: 4px;
}

/* Compact mode */
.signature-compact {
  margin-top: 12px;
}

.signature-preview-small {
  display: inline-block;
  max-height: 60px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.signature-preview-small img {
  display: block;
  max-height: 44px;
  max-width: 180px;
  object-fit: contain;
}

.signature-links {
  margin-top: 8px;
  font-size: 13px;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--primary, #1f4e79);
  cursor: pointer;
  text-decoration: underline;
  font-size: inherit;
}

.link-btn:hover {
  text-decoration: none;
}

.link-sep {
  color: var(--text-secondary, #6b7280);
  margin: 0 4px;
}

.signature-preview-expanded {
  margin-top: 12px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.signature-preview-expanded img {
  max-width: 100%;
  display: block;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

