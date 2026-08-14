<template>
  <div class="signature-pad-container" :class="{ compact: compact }">
    <div v-if="!signed" class="signature-area">
      <div class="signature-hint">{{ hintText }}</div>
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
        <button @click="clearSignature" class="btn btn-secondary">{{ clearText }}</button>
        <button @click="saveSignature" class="btn btn-primary" :disabled="!hasSignature || saving">
          {{ saving ? savingText : saveText }}
        </button>
      </div>
    </div>
    <div v-else class="signature-saved">
      <div class="success">
        ✓ {{ savedText }}
      </div>
      <div v-if="compact" class="signature-compact">
        <div class="signature-preview-small">
          <img :src="signatureData" alt="Saved signature" />
        </div>
        <div class="signature-links">
          <button type="button" class="link-btn" @click="showExpanded = !showExpanded">
            {{ showExpanded ? hideText : showText }}
          </button>
          <span class="link-sep">·</span>
          <button type="button" class="link-btn" @click="resetSignature">{{ changeText }}</button>
        </div>
        <div v-if="showExpanded" class="signature-preview-expanded">
          <img :src="signatureData" alt="Saved signature" />
        </div>
      </div>
      <template v-else>
        <div class="signature-preview">
          <img :src="signatureData" alt="Saved signature" />
        </div>
        <button @click="resetSignature" class="btn btn-secondary">{{ changeText }}</button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
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
  },
  locale: {
    type: String,
    default: 'en'
  },
  initialValue: {
    type: String,
    default: ''
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
let resizeObserver = null;
let strokeEmitTimer = null;
let ignoreInitialValue = false;

const isEs = computed(() => String(props.locale || '').toLowerCase().startsWith('es'));
const hintText = computed(() => (isEs.value
  ? 'Firme aquí con el dedo o el mouse.'
  : 'Please sign here with your finger or mouse.'));
const clearText = computed(() => (isEs.value ? 'Borrar' : 'Clear'));
const saveText = computed(() => (isEs.value ? 'Guardar firma' : 'Save Signature'));
const savingText = computed(() => (isEs.value ? 'Guardando...' : 'Saving...'));
const savedText = computed(() => (isEs.value ? 'Firma guardada' : 'Signature saved successfully'));
const hideText = computed(() => (isEs.value ? 'Ocultar firma' : 'Hide signature'));
const showText = computed(() => (isEs.value ? 'Mostrar firma' : 'Show signature'));
const changeText = computed(() => (isEs.value ? 'Cambiar firma' : 'Change signature'));

const padHeightForWidth = (width) => {
  const w = Math.max(Number(width) || 0, 280);
  const ratio = props.compact ? 0.42 : 0.38;
  const min = props.compact ? 240 : 300;
  return Math.max(min, Math.round(w * ratio));
};

const setupCanvas = () => {
  if (!canvas.value) return;

  ctx = canvas.value.getContext('2d');
  const width = canvas.value.offsetWidth || canvas.value.parentElement?.clientWidth || 600;
  const height = padHeightForWidth(width);
  canvas.value.width = width;
  canvas.value.height = height;
  canvas.value.style.height = `${height}px`;

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
};

const emitCurrentStroke = () => {
  if (!hasSignature.value || !canvas.value) return;
  emit('signed', canvas.value.toDataURL('image/png'));
};

const scheduleStrokeEmit = () => {
  if (strokeEmitTimer) clearTimeout(strokeEmitTimer);
  strokeEmitTimer = setTimeout(() => {
    strokeEmitTimer = null;
    emitCurrentStroke();
  }, 2000);
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
  ignoreInitialValue = false;
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
  if (!isDrawing.value) return;
  isDrawing.value = false;
  scheduleStrokeEmit();
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
  if (strokeEmitTimer) {
    clearTimeout(strokeEmitTimer);
    strokeEmitTimer = null;
  }
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  hasSignature.value = false;
  emit('signed', null);
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
  if (strokeEmitTimer) {
    clearTimeout(strokeEmitTimer);
    strokeEmitTimer = null;
  }
  ignoreInitialValue = true;
  signed.value = false;
  signatureData.value = '';
  hasSignature.value = false;
  emit('signed', null);
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

watch(
  () => props.initialValue,
  (val) => {
    if (ignoreInitialValue) return;
    const next = String(val || '').trim();
    if (!next) return;
    signatureData.value = next;
    signed.value = true;
    hasSignature.value = true;
    emit('signed', next);
  },
  { immediate: true }
);

onMounted(async () => {
  await initCanvas();
  if (typeof ResizeObserver !== 'undefined' && canvas.value?.parentElement) {
    resizeObserver = new ResizeObserver(() => {
      if (!signed.value && !hasSignature.value) setupCanvas();
    });
    resizeObserver.observe(canvas.value.parentElement);
  }

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

onBeforeUnmount(() => {
  if (strokeEmitTimer) {
    clearTimeout(strokeEmitTimer);
    strokeEmitTimer = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
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
  min-height: 240px;
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

