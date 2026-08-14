<template>
  <div class="packet-section-flow">
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="stage === 'review'" class="packet-section-card">
      <h3>{{ title }}</h3>
      <p v-if="!sectionReady" class="error">
        {{ tr('This section could not be loaded.', 'No se pudo cargar esta sección.') }}
      </p>
      <p class="lead">
        {{
          tr(
            'Please review the following agreement carefully. This text comes from the school referral packet and is the same wording used on the printable packet.',
            'Revise el siguiente acuerdo con cuidado. Este texto proviene del paquete de referencia escolar y es el mismo texto utilizado en el paquete imprimible.'
          )
        }}
      </p>
      <div class="packet-section-html" v-html="sectionHtml" />
      <label class="ack-checkbox" :class="{ 'required-highlight': !acknowledged }">
        <input v-model="acknowledged" type="checkbox" />
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
        <button type="button" class="btn btn-primary" :disabled="!acknowledged || !sectionReady" @click="stage = 'sign'">
          {{ tr('Continue to signature', 'Continuar a la firma') }}
        </button>
      </div>
    </div>

    <div v-else-if="stage === 'sign'" class="packet-section-card">
      <h3>{{ tr('Electronic signature', 'Firma electrónica') }}</h3>
      <p>
        {{
          tr(
            'Sign below to acknowledge this section.',
            'Firme abajo para reconocer esta sección.'
          )
        }}
      </p>
      <div class="review-block">
        <SignaturePad compact @signed="onSigned" />
      </div>
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
  locale: { type: String, default: 'en' }
});

const emit = defineEmits(['captured']);

const stage = ref('review');
const acknowledged = ref(false);
const signatureData = ref(null);
const error = ref('');

const resolvedLocale = computed(() => {
  const loc = String(props.locale || props.sectionContext?.locale || 'en').toLowerCase();
  return loc === 'es' || loc.startsWith('es') ? 'es' : 'en';
});

const title = computed(() => String(props.sectionContext?.title || 'Agreement').trim());
const sectionHtml = computed(() => String(props.sectionContext?.html || '').trim());
const sectionKey = computed(() => String(props.sectionContext?.sectionKey || '').trim());
const sectionReady = computed(() => !!sectionKey.value && !!sectionHtml.value);

const tr = (en, es) => (resolvedLocale.value === 'es' ? es : en);

const onSigned = (data) => {
  signatureData.value = data || null;
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
    locale: resolvedLocale.value,
    contentHash: props.sectionContext?.contentHash || null,
    packetVersion: props.sectionContext?.packetVersion || null,
    snapshotHtml: sectionHtml.value,
    title: title.value
  });
};

watch(
  () => props.sectionContext?.sectionKey,
  () => {
    stage.value = 'review';
    acknowledged.value = false;
    signatureData.value = null;
    error.value = '';
  }
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
  max-height: 420px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 14px;
  background: #fafafa;
  margin: 12px 0;
  font-size: 14px;
  line-height: 1.45;
}
.packet-section-html :deep(h2) {
  margin-top: 0;
  font-size: 1.1rem;
}
.packet-section-html :deep(h3) {
  font-size: 1rem;
}
.ack-checkbox {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 12px 0;
  font-size: 14px;
}
.ack-checkbox.required-highlight {
  outline: 2px solid #fca5a5;
  outline-offset: 4px;
  border-radius: 6px;
  padding: 4px;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.error {
  color: #b91c1c;
  font-size: 13px;
}
.review-block {
  margin: 12px 0;
}
</style>
