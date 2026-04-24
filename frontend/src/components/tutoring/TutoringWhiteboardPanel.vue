<template>
  <div class="tutoring-whiteboard">
    <div class="tutoring-whiteboard-toolbar">
      <div class="tutoring-whiteboard-group">
        <button
          v-for="color in colorOptions"
          :key="color.value"
          type="button"
          class="tutoring-whiteboard-color"
          :class="{ active: strokeColor === color.value }"
          :style="{ '--tw-color': color.value }"
          :disabled="disabled"
          :aria-label="`Choose ${color.label} ink`"
          @click="strokeColor = color.value"
        ></button>
      </div>

      <div class="tutoring-whiteboard-group tutoring-whiteboard-group-slider">
        <label>
          <span>Width</span>
          <input v-model.number="strokeWidth" type="range" min="2" max="14" step="1" :disabled="disabled" />
        </label>
        <strong>{{ strokeWidth }}px</strong>
      </div>

      <button type="button" class="tutoring-whiteboard-btn tutoring-whiteboard-btn-secondary" :disabled="disabled || !strokes.length" @click="undoLastStroke">
        Undo
      </button>
      <button type="button" class="tutoring-whiteboard-btn tutoring-whiteboard-btn-danger" :disabled="disabled || !strokes.length" @click="clearBoard">
        Clear board
      </button>
    </div>

    <div
      ref="boardRef"
      class="tutoring-whiteboard-board"
      :class="{ disabled }"
      @pointerdown="startStroke"
      @pointermove="continueStroke"
      @pointerup="finishStroke"
      @pointerleave="finishStroke"
      @pointercancel="finishStroke"
    >
      <div class="tutoring-whiteboard-grid"></div>
      <canvas ref="canvasRef" class="tutoring-whiteboard-canvas"></canvas>

      <div v-if="!strokes.length" class="tutoring-whiteboard-empty">
        <strong>Scratch whiteboard</strong>
        <p>Use this space for worked examples, quick diagrams, visual scaffolds, and thinking aloud with the student.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);

const colorOptions = [
  { label: 'Midnight', value: '#F8FAFC' },
  { label: 'Emerald', value: '#6EE7B7' },
  { label: 'Sky', value: '#7DD3FC' },
  { label: 'Amber', value: '#FCD34D' },
  { label: 'Coral', value: '#FDA4AF' }
];

const boardRef = ref(null);
const canvasRef = ref(null);
const strokeColor = ref(colorOptions[0].value);
const strokeWidth = ref(4);
const strokes = ref([]);

let activeStroke = null;
let drawing = false;
let resizeObserver = null;

function cloneStrokes(raw = []) {
  return Array.isArray(raw)
    ? raw.map((stroke = {}, index) => ({
        id: stroke.id || `stroke-${index + 1}`,
        color: String(stroke.color || '#F8FAFC'),
        width: Number.isFinite(Number(stroke.width)) ? Number(stroke.width) : 4,
        points: Array.isArray(stroke.points)
          ? stroke.points
              .map((point = {}) => ({
                x: Number(point.x) || 0,
                y: Number(point.y) || 0
              }))
              .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
          : []
      }))
    : [];
}

function getCanvasSize() {
  return {
    width: boardRef.value?.clientWidth || 960,
    height: boardRef.value?.clientHeight || 560
  };
}

function toNormalizedPoint(event) {
  const rect = boardRef.value?.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height) return null;
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  };
}

function redrawAll() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const context = canvas.getContext('2d');
  const { width, height } = getCanvasSize();
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (const stroke of strokes.value) {
    if (!Array.isArray(stroke.points) || !stroke.points.length) continue;
    context.beginPath();
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    stroke.points.forEach((point, index) => {
      const scaledX = point.x * width;
      const scaledY = point.y * height;
      if (index === 0) context.moveTo(scaledX, scaledY);
      else context.lineTo(scaledX, scaledY);
    });
    context.stroke();
  }
}

function syncOut() {
  emit('update:modelValue', cloneStrokes(strokes.value));
}

function startStroke(event) {
  if (props.disabled) return;
  const point = toNormalizedPoint(event);
  if (!point) return;
  drawing = true;
  activeStroke = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    color: strokeColor.value,
    width: strokeWidth.value,
    points: [point]
  };
  strokes.value = [...strokes.value, activeStroke];
  syncOut();
  event.target?.setPointerCapture?.(event.pointerId);
  redrawAll();
}

function continueStroke(event) {
  if (!drawing || !activeStroke || props.disabled) return;
  const point = toNormalizedPoint(event);
  if (!point) return;
  activeStroke.points.push(point);
  syncOut();
  redrawAll();
}

function finishStroke(event) {
  if (!drawing) return;
  drawing = false;
  activeStroke = null;
  event.target?.releasePointerCapture?.(event.pointerId);
}

function clearBoard() {
  strokes.value = [];
  syncOut();
  redrawAll();
}

function undoLastStroke() {
  if (!strokes.value.length) return;
  strokes.value = strokes.value.slice(0, -1);
  syncOut();
  redrawAll();
}

function bindResizeObserver() {
  if (!boardRef.value || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(() => {
    redrawAll();
  });
  resizeObserver.observe(boardRef.value);
}

onMounted(() => {
  strokes.value = cloneStrokes(props.modelValue);
  redrawAll();
  bindResizeObserver();
});

watch(
  () => props.modelValue,
  async (nextValue) => {
    const nextSerialized = JSON.stringify(nextValue || []);
    const currentSerialized = JSON.stringify(strokes.value || []);
    if (nextSerialized === currentSerialized) return;
    strokes.value = cloneStrokes(nextValue);
    await nextTick();
    redrawAll();
  },
  { deep: true }
);

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect();
});
</script>

<style scoped>
.tutoring-whiteboard {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tutoring-whiteboard-toolbar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
}

.tutoring-whiteboard-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tutoring-whiteboard-group-slider label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: rgba(238, 246, 255, 0.76);
}

.tutoring-whiteboard-group-slider input {
  accent-color: #6ee7b7;
}

.tutoring-whiteboard-color,
.tutoring-whiteboard-btn {
  border: none;
  cursor: pointer;
  font: inherit;
}

.tutoring-whiteboard-color {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--tw-color);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.08);
}

.tutoring-whiteboard-color.active {
  outline: 2px solid rgba(255, 255, 255, 0.8);
  outline-offset: 2px;
}

.tutoring-whiteboard-color:disabled,
.tutoring-whiteboard-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tutoring-whiteboard-btn {
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: #eef6ff;
}

.tutoring-whiteboard-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
}

.tutoring-whiteboard-btn-danger {
  background: rgba(255, 107, 107, 0.16);
  color: #ffd3d3;
}

.tutoring-whiteboard-board {
  position: relative;
  min-height: 540px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.04));
}

.tutoring-whiteboard-board.disabled {
  opacity: 0.82;
}

.tutoring-whiteboard-grid,
.tutoring-whiteboard-canvas,
.tutoring-whiteboard-empty {
  position: absolute;
  inset: 0;
}

.tutoring-whiteboard-grid {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 32px 32px;
}

.tutoring-whiteboard-canvas {
  width: 100%;
  height: 100%;
  touch-action: none;
}

.tutoring-whiteboard-empty {
  display: grid;
  place-items: center;
  text-align: center;
  padding: 24px;
  pointer-events: none;
  color: rgba(238, 246, 255, 0.74);
}

.tutoring-whiteboard-empty strong {
  display: block;
  margin-bottom: 8px;
  color: #eef6ff;
  font-size: 1.05rem;
}

.tutoring-whiteboard-empty p {
  max-width: 420px;
  margin: 0;
  line-height: 1.6;
}

@media (max-width: 860px) {
  .tutoring-whiteboard-toolbar {
    align-items: stretch;
  }

  .tutoring-whiteboard-group {
    flex-wrap: wrap;
  }

  .tutoring-whiteboard-board {
    min-height: 420px;
  }
}
</style>
