<template>
  <div class="packet-section-flow">
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="stage === 'review'" class="packet-section-card">
      <p v-if="!sectionReady && isLoading" class="muted">
        {{ tr('Loading this agreement…', 'Cargando este acuerdo…') }}
      </p>
      <p v-else-if="!sectionReady" class="error" role="alert">
        {{ tr('This section could not be loaded.', 'No se pudo cargar esta sección.') }}
        <button type="button" class="btn btn-secondary btn-sm" @click="emit('retry')">
          {{ tr('Try again', 'Intentar de nuevo') }}
        </button>
      </p>
      <p class="lead">
        {{
          tr(
            'Please review the following agreement carefully. This is the same wording used on the printable packet.',
            'Revise el siguiente acuerdo con cuidado. Este es el mismo texto utilizado en el paquete imprimible.'
          )
        }}
      </p>
      <div v-if="sectionReady" class="packet-section-html" v-html="sectionHtml" />
      <label class="ack-checkbox" :class="{ 'required-highlight': !acknowledged }">
        <input v-model="acknowledged" type="checkbox" :disabled="!sectionReady" />
        <span>
          {{
            tr(
              'I have read and understand this section, and I agree to its terms.',
              'He leído y entiendo esta sección, y acepto sus términos.'
            )
          }}
        </span>
      </label>
      <div class="actions">
        <button type="button" class="btn btn-primary" :disabled="!acknowledged || !sectionReady" @click="goToSign">
          {{ tr('Continue to signature', 'Continuar a la firma') }}
        </button>
      </div>
      <p v-if="sectionReady && !acknowledged" class="muted small">
        {{ tr('Check the agreement box above to continue to the signature.', 'Marque la casilla de acuerdo de arriba para continuar a la firma.') }}
      </p>
    </div>

    <div v-else-if="stage === 'sign'" class="packet-section-card">
      <h3>{{ tr('Electronic signature', 'Firma electrónica') }}</h3>
      <p>
        {{
          tr(
            'Apply your saved signature to this section, or draw a new one.',
            'Aplique su firma guardada a esta sección, o dibuje una nueva.'
          )
        }}
      </p>

      <div v-if="signatureData && !forceResign" class="applied-sig">
        <div class="applied-sig-check">✓ {{ tr('Signature saved', 'Firma guardada') }}</div>
        <img :src="signatureData" alt="Saved signature" class="applied-sig-img" />
        <div class="saved-sig-actions">
          <button type="button" class="btn btn-secondary btn-sm" @click="resign">
            {{ tr('Sign again', 'Firmar de nuevo') }}
          </button>
        </div>
      </div>

      <template v-else>
        <div v-if="sessionSavedSignature" class="saved-sig-preview">
          <p class="muted small">{{ tr('Signature saved', 'Firma guardada') }}</p>
          <button type="button" class="saved-sig-thumb" @click="applySessionSignature">
            <img :src="sessionSavedSignature" alt="Saved signature preview" />
            <span>{{ tr('Apply my signature', 'Aplicar mi firma') }}</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="forceResign = true">
            {{ tr('Use a new signature', 'Usar una firma nueva') }}
          </button>
        </div>
        <div v-if="!sessionSavedSignature || forceResign" class="review-block">
          <label for="packet-typed-signature">{{ tr('Type your full name', 'Escriba su nombre completo') }}</label>
          <input id="packet-typed-signature" v-model="typedSignatureName" class="roi-input" type="text" autocomplete="name" />
          <button type="button" class="btn btn-secondary btn-sm" :disabled="!typedSignatureName.trim()" @click="applyTypedSignature">
            {{ tr('Use typed signature', 'Usar firma escrita') }}
          </button>
          <p class="muted small">{{ tr('Or draw below.', 'O dibuje abajo.') }}</p>
          <SignaturePad
            compact
            :locale="resolvedLocale"
            :initial-value="''"
            @signed="onSigned"
          />
        </div>
      </template>

      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="stage = 'review'">
          {{ tr('Back', 'Atrás') }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!signatureData || !acknowledged"
          @click="complete"
        >
          {{ tr('Continue', 'Continuar') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import SignaturePad from '../SignaturePad.vue';

const props = defineProps({
  sectionContext: { type: Object, default: null },
  savedCapture: { type: Object, default: null },
  sessionSavedSignature: { type: String, default: '' },
  locale: { type: String, default: 'en' }
});

const emit = defineEmits(['captured', 'retry']);

const stage = ref('review');
const acknowledged = ref(false);
const signatureData = ref(null);
const forceResign = ref(false);
const typedSignatureName = ref('');
const error = ref('');

const resolvedLocale = computed(() => {
  const loc = String(props.locale || props.sectionContext?.locale || 'en').toLowerCase();
  return loc === 'es' || loc.startsWith('es') ? 'es' : 'en';
});

const title = computed(() => String(props.sectionContext?.title || 'Agreement').trim());
const sectionHtml = computed(() => String(props.sectionContext?.html || '').trim());
const sectionKey = computed(() => String(props.sectionContext?.sectionKey || '').trim());
const sectionReady = computed(() => !!sectionKey.value && !!sectionHtml.value);
const isLoading = computed(() =>
  !!sectionKey.value && !sectionHtml.value && props.sectionContext?.lite === true
);
const sessionSavedSignature = computed(() => String(props.sessionSavedSignature || '').trim());

const tr = (en, es) => (resolvedLocale.value === 'es' ? es : en);

const restoreSaved = (key) => {
  const saved = props.savedCapture;
  if (saved && String(saved.sectionKey || '') === key && saved.signatureData
    && saved.locale === props.sectionContext?.locale
    && saved.contentHash === props.sectionContext?.contentHash
    && saved.packetVersion === props.sectionContext?.packetVersion
    && (saved.variant || 'self') === (props.sectionContext?.variant || 'self')) {
    acknowledged.value = true;
    signatureData.value = saved.signatureData;
    forceResign.value = false;
    stage.value = 'sign';
    return true;
  }
  return false;
};

const goToSign = () => {
  stage.value = 'sign';
  forceResign.value = false;
  // A checkbox acknowledges the text; applying a reusable signature is a separate, explicit action.
};

const renderTypedSignature = (name) => {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a2e24';
  ctx.font = '48px "Segoe Script", "Bradley Hand", "Apple Chancery", cursive';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 24, canvas.height / 2, canvas.width - 48);
  return canvas.toDataURL('image/png');
};

const applyTypedSignature = () => {
  const name = typedSignatureName.value.trim();
  if (!name) return;
  onSigned(renderTypedSignature(name));
};

const applySessionSignature = () => {
  if (!sessionSavedSignature.value) return;
  signatureData.value = sessionSavedSignature.value;
  forceResign.value = false;
};

const resign = () => {
  signatureData.value = null;
  forceResign.value = true;
};

const onSigned = (data) => {
  signatureData.value = data || null;
  forceResign.value = false;
};

const complete = () => {
  error.value = '';
  if (!acknowledged.value || !signatureData.value) {
    error.value = tr('Please acknowledge and sign before continuing.', 'Reconozca y firme antes de continuar.');
    return;
  }
  if (!sectionKey.value || !sectionHtml.value) {
    error.value = tr('This section could not be loaded.', 'No se pudo cargar esta sección.');
    return;
  }
  emit('captured', {
    sectionKey: sectionKey.value,
    acknowledged: true,
    signatureData: signatureData.value,
    locale: props.sectionContext?.locale || resolvedLocale.value,
    variant: props.sectionContext?.variant || 'self',
    contentHash: props.sectionContext?.contentHash || null,
    packetVersion: props.sectionContext?.packetVersion || null,
    snapshotHtml: sectionHtml.value,
    title: title.value
  });
};

const goNext = () => {
  error.value = '';
  if (stage.value === 'review') {
    if (!acknowledged.value || !sectionReady.value) {
      error.value = tr(
        'Please read and agree to this section before continuing.',
        'Lea y acepte esta sección antes de continuar.'
      );
      return;
    }
    goToSign();
    return;
  }
  if (stage.value === 'sign') {
    complete();
  }
};

defineExpose({ goNext });

watch(
  () => [props.sectionContext?.sectionKey, props.sectionContext?.locale,
    props.sectionContext?.contentHash, props.sectionContext?.packetVersion, props.sectionContext?.variant, props.savedCapture],
  ([key]) => {
    error.value = '';
    forceResign.value = false;
    if (restoreSaved(String(key || ''))) return;
    stage.value = 'review';
    acknowledged.value = false;
    signatureData.value = null;
  },
  { immediate: true }
);
</script>

<style scoped>
.packet-section-flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.packet-section-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
}
.lead {
  color: #4b5563;
  margin-top: 0;
}
.packet-section-html {
  max-height: min(70vh, 820px);
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px 18px;
  background: #fafafa;
}
.ack-checkbox {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 12px;
  font-weight: 600;
}
.ack-checkbox.required-highlight {
  outline: 2px solid #f59e0b;
  border-radius: 8px;
  padding: 8px;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.saved-sig-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.saved-sig-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.saved-sig-thumb {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  border: 1px solid #99f6e4;
  background: #f0fdfa;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  max-width: 320px;
  text-align: left;
  font: inherit;
  font-weight: 700;
  color: #0f766e;
}
.saved-sig-thumb img {
  max-width: 240px;
  max-height: 72px;
  object-fit: contain;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.applied-sig {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.applied-sig-check {
  font-weight: 700;
  color: #166534;
}
.applied-sig-img {
  max-width: 280px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.error {
  color: #b91c1c;
}
.muted {
  color: #6b7280;
}
</style>
