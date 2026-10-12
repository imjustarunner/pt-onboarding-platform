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
        @input="invalidateTyped"
      />
      <div v-if="typedName.trim()" class="signature-preview" aria-label="Signature preview">{{ typedName }}</div>
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

function invalidateTyped() {
  captured.value = false;
  emit('update:modelValue', '');
}
watch(() => props.modelValue, value => { captured.value = !!value; });
watch(mode, () => { captured.value = false; emit('update:modelValue', ''); });
// Called only by an explicit parent signing/acknowledgement action.
defineExpose({ capture: () => { if (mode.value === 'type') emitTyped(); } });

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
  ctx.fillText(name, 24, canvas.height / 2, canvas.width - 48);
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
.df-btn-primary { background: #086553; color: #fff; border: 1px solid #086553; border-radius: 6px; }
.ai-signature-panel-head {
  margin-bottom: 0.75rem;
}
.ai-signature-panel{border:1px solid #d4e1db;border-radius:16px;padding:24px;background:linear-gradient(140deg,#f5faf7,#fff);font-family:inherit;color:var(--hire-ink,#203b32);min-width:0}
.ai-signature-panel-head strong{font-size:1.05rem}.ai-signature-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:12px;background:#e6eee9;margin:8px 0 20px;flex-wrap:wrap}
.ai-signature-tab{appearance:none;border:0;border-radius:9px;padding:10px 18px;font:inherit;font-size:.9rem;color:#466456;background:transparent;cursor:pointer}.ai-signature-tab--active{background:white;color:#12583f;box-shadow:0 2px 5px #183e321a}
.ai-signature-type-input{box-sizing:border-box;width:100%;border:1px solid #b9cec1;border-radius:10px;background:white;padding:13px 15px;font:inherit;color:inherit;min-height:48px}
.signature-preview{padding:25px 16px 16px;min-height:78px;border-bottom:1px solid #aac5b7;color:#184f3b;font:32px/1.5 "Segoe Script","Bradley Hand","Apple Chancery",cursive;overflow-wrap:anywhere}
.ai-consent-card-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px!important}.df-btn{font:inherit!important;font-size:.9rem!important;padding:11px 18px!important;min-height:44px;border-radius:9px;border:1px solid #b9cec1;cursor:pointer}.df-btn-secondary{background:white;color:#315746}.df-btn-primary{background:var(--hire-brand,#12583f);border-color:var(--hire-brand,#12583f)}.df-btn:disabled{opacity:.5;cursor:default}.ai-signature-captured{margin-top:14px;color:#12583f;font-weight:600}.ai-signature-legal{font-size:.8rem;line-height:1.65;color:#62766b;margin:18px 0 0}
.ai-signature-panel :is(button,input):focus-visible{outline:3px solid #8db8a5;outline-offset:3px}@media(max-width:600px){.ai-signature-panel{padding:16px}}
</style>
