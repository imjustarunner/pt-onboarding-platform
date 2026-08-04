<template>
  <div class="ai-signature-panel">
    <div class="ai-signature-panel-head">
      <strong>{{ title }}</strong>
      <p v-if="subtitle" class="ai-page-lead" style="margin: 0.25rem 0 0; font-size: 0.88rem;">{{ subtitle }}</p>
    </div>

    <div class="ai-signature-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="ai-signature-tab"
        :class="{ 'ai-signature-tab--active': mode === 'type' }"
        :aria-selected="mode === 'type'"
        @click="mode = 'type'"
      >
        Type Signature
      </button>
      <button
        type="button"
        role="tab"
        class="ai-signature-tab"
        :class="{ 'ai-signature-tab--active': mode === 'draw' }"
        :aria-selected="mode === 'draw'"
        @click="mode = 'draw'"
      >
        Draw Signature
      </button>
    </div>

    <div v-if="mode === 'type'">
      <label class="sr-only" for="ai-typed-sig">Typed signature</label>
      <input
        id="ai-typed-sig"
        v-model="typedName"
        class="ai-signature-type-input"
        type="text"
        :placeholder="placeholder"
        autocomplete="name"
        @blur="emitTyped"
      />
      <div class="ai-consent-card-actions" style="margin-top: 0.65rem;">
        <button type="button" class="df-btn df-btn-secondary" style="padding: 0.4rem 0.75rem; font-size: 0.82rem;" @click="clearTyped">
          Clear
        </button>
        <button
          type="button"
          class="df-btn df-btn-primary"
          style="padding: 0.4rem 0.85rem; font-size: 0.82rem;"
          :disabled="!typedName.trim()"
          @click="emitTyped"
        >
          Capture Signature
        </button>
      </div>
      <div v-if="captured && mode === 'type'" class="ai-signature-captured">✓ Signature captured</div>
    </div>

    <div v-else>
      <SignaturePad compact @signed="onDrawn" />
    </div>

    <p class="ai-signature-legal">{{ legalNotice }}</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import SignaturePad from '../SignaturePad.vue';

const props = defineProps({
  title: { type: String, default: 'Digital Signature' },
  subtitle: { type: String, default: '' },
  placeholder: { type: String, default: 'Type your full legal name' },
  modelValue: { type: String, default: '' },
  signerName: { type: String, default: '' },
  legalNotice: {
    type: String,
    default:
      'By typing or drawing your name above, you agree that your electronic signature is the legal equivalent of your handwritten signature.'
  }
});

const emit = defineEmits(['update:modelValue', 'signed']);

const mode = ref('type');
const typedName = ref(props.signerName || '');
const captured = ref(!!props.modelValue);

watch(
  () => props.signerName,
  (v) => {
    if (v && !typedName.value) typedName.value = v;
  }
);

function clearTyped() {
  typedName.value = '';
  captured.value = false;
  emit('update:modelValue', '');
}

function emitTyped() {
  const name = typedName.value.trim();
  if (!name) return;
  const dataUrl = renderTypedSignature(name);
  captured.value = true;
  emit('update:modelValue', dataUrl);
  emit('signed', { dataUrl, method: 'type', typedName: name });
}

function onDrawn(payload) {
  const dataUrl = typeof payload === 'string' ? payload : payload?.signatureData || payload?.dataUrl || '';
  if (!dataUrl) return;
  captured.value = true;
  emit('update:modelValue', dataUrl);
  emit('signed', { dataUrl, method: 'draw' });
}

function renderTypedSignature(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a2e24';
  ctx.font = '48px "Segoe Script", "Bradley Hand", "Apple Chancery", cursive';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 24, canvas.height / 2);
  return canvas.toDataURL('image/png');
}
</script>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
.ai-signature-panel-head {
  margin-bottom: 0.75rem;
}
</style>
