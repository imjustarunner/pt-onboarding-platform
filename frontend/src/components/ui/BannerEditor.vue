<template>
  <div class="be-root">
    <!-- Live drag preview -->
    <div
      ref="previewRef"
      class="be-preview"
      :class="{ 'be-preview--empty': !imageUrl }"
      :style="previewStyle"
      @pointerdown.prevent="startDrag"
    >
      <div class="be-overlay">
        <span class="be-hint">{{ imageUrl ? 'Drag to reposition' : emptyLabel }}</span>
        <strong v-if="imageUrl" class="be-coords">{{ localX }}% / {{ localY }}%</strong>
      </div>
      <div
        v-if="imageUrl"
        class="be-handle"
        :style="{ left: `${localX}%`, top: `${localY}%` }"
      ></div>
    </div>

    <!-- Controls row -->
    <div class="be-controls">
      <label class="be-btn be-btn--upload" :class="{ 'be-btn--disabled': uploading }">
        <span>{{ uploading ? 'Uploading…' : (imageUrl ? uploadLabelReplace : uploadLabel) }}</span>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="be-file-input"
          :disabled="uploading"
          @change="onFileChange"
        />
      </label>

      <button
        v-if="imageUrl"
        type="button"
        class="be-btn be-btn--save"
        :disabled="saving || !imageUrl"
        @click="$emit('save-focal', { x: localX, y: localY })"
      >{{ saving ? 'Saving…' : 'Save Position' }}</button>

      <button
        v-if="imageUrl"
        type="button"
        class="be-btn be-btn--ghost"
        @click="centerFocal"
      >Center</button>

      <button
        v-if="imageUrl && showRemove"
        type="button"
        class="be-btn be-btn--danger"
        @click="$emit('remove')"
      >Remove</button>
    </div>

    <p v-if="imageUrl" class="be-tip">Drag the preview to adjust the crop, then click Save Position.</p>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';

const props = defineProps({
  imageUrl:    { type: String, default: '' },
  focalX:      { type: Number, default: 50 },
  focalY:      { type: Number, default: 50 },
  saving:      { type: Boolean, default: false },
  uploading:   { type: Boolean, default: false },
  uploadLabel: { type: String, default: 'Upload Banner' },
  uploadLabelReplace: { type: String, default: 'Replace Banner' },
  emptyLabel:  { type: String, default: 'Upload a banner to preview and reposition it here' },
  showRemove:  { type: Boolean, default: true },
});

const emit = defineEmits(['upload', 'save-focal', 'remove', 'focal-change']);

const previewRef  = ref(null);
const fileInputRef = ref(null);
const localX = ref(clamp(props.focalX));
const localY = ref(clamp(props.focalY));
const dragging = ref(false);
const activePid = ref(null);

function clamp(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
}

watch(() => props.focalX, (v) => { if (!dragging.value) localX.value = clamp(v); });
watch(() => props.focalY, (v) => { if (!dragging.value) localY.value = clamp(v); });

const previewStyle = computed(() => ({
  backgroundImage: props.imageUrl
    ? `url(${props.imageUrl})`
    : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
  backgroundPosition: `${localX.value}% ${localY.value}%`,
}));

function applyFromPointer(clientX, clientY) {
  const el = previewRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  const y = Math.round(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)));
  localX.value = x;
  localY.value = y;
  emit('focal-change', { x, y });
}

function onPointerMove(e) {
  if (!dragging.value) return;
  if (activePid.value != null && e.pointerId != null && e.pointerId !== activePid.value) return;
  applyFromPointer(e.clientX, e.clientY);
}

async function onPointerUp() {
  if (!dragging.value) return;
  dragging.value = false;
  activePid.value = null;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
}

function startDrag(e) {
  if (!props.imageUrl) return;
  dragging.value = true;
  activePid.value = e.pointerId ?? null;
  applyFromPointer(e.clientX, e.clientY);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  if (e.currentTarget?.setPointerCapture && e.pointerId != null) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
}

function centerFocal() {
  localX.value = 50;
  localY.value = 50;
  emit('focal-change', { x: 50, y: 50 });
  emit('save-focal', { x: 50, y: 50 });
}

function onFileChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  emit('upload', file);
  if (fileInputRef.value) fileInputRef.value.value = '';
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
});
</script>

<style scoped>
.be-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.be-preview {
  position: relative;
  min-height: 220px;
  border-radius: 16px;
  overflow: hidden;
  background-color: #1a1a2e;
  background-size: cover;
  background-repeat: no-repeat;
  border: 1px solid #dbe4f0;
  cursor: crosshair;
}

.be-preview--empty {
  cursor: default;
}

.be-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 4px;
  padding: 14px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.06) 55%, rgba(0, 0, 0, 0));
  color: #fff;
  pointer-events: none;
}

.be-hint {
  font-size: 0.88rem;
  font-weight: 600;
}

.be-coords {
  font-size: 0.95rem;
}

.be-handle {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid #fff;
  background: rgba(37, 99, 235, 0.95);
  box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.25);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.be-controls {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.be-file-input {
  display: none;
}

.be-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 700;
  padding: 9px 16px;
  cursor: pointer;
  transition: opacity 0.15s;
  text-align: center;
}

.be-btn:disabled,
.be-btn--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.be-btn--upload {
  background: #f1f5f9;
  color: #0f172a;
}

.be-btn--upload:hover:not(.be-btn--disabled) {
  background: #e2e8f0;
}

.be-btn--save {
  background: #0f172a;
  color: #fff;
}

.be-btn--save:hover:not(:disabled) {
  background: #1e293b;
}

.be-btn--ghost {
  background: #e2e8f0;
  color: #0f172a;
}

.be-btn--ghost:hover {
  background: #cbd5e1;
}

.be-btn--danger {
  background: #fee2e2;
  color: #b91c1c;
}

.be-btn--danger:hover {
  background: #fecaca;
}

.be-tip {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
}

@media (max-width: 520px) {
  .be-preview {
    min-height: 180px;
  }
  .be-controls {
    flex-direction: column;
    align-items: stretch;
  }
  .be-btn {
    justify-content: center;
  }
}
</style>
