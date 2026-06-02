<template>
  <PDFFieldDefinitionBuilder
    v-model="fieldsProxy"
    :pdf-url="pdfUrl"
    :allow-signature="allowSignature"
    :title="title"
  />
</template>

<script setup>
import { computed } from 'vue';
import PDFFieldDefinitionBuilder from './PDFFieldDefinitionBuilder.vue';

const props = defineProps({
  pdfUrl: { type: String, required: true },
  modelValue: { type: Array, default: () => [] },
  allowSignature: { type: Boolean, default: true },
  title: { type: String, default: 'Document fields' }
});

const emit = defineEmits(['update:modelValue']);

const fieldsProxy = computed({
  get: () => props.modelValue || [],
  set: (val) => emit('update:modelValue', val || [])
});
</script>
