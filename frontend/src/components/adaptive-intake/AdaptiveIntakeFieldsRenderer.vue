<template>
  <div class="ai-fields-renderer">
    <section v-for="group in groups" :key="group.id" class="ai-field-section">
      <h2 class="ai-field-section-title">{{ group.title }}</h2>
      <div class="ai-field-section-body">
        <DigitalFormField
          v-for="field in group.fields"
          :key="field.key || field.id"
          :model-value="modelValue[field.key]"
          :type="fieldInputType(field)"
          :label="field.label || field.key"
          :required="!!field.required"
          :options="field.options || []"
          :placeholder="field.placeholder || ''"
          :rows="field.type === 'textarea' ? 4 : 3"
          @update:model-value="onUpdate(field.key, $event)"
        />
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { DigitalFormField } from '../digital-form';
import { groupIntakeFieldsForAdaptiveShell, mapFieldToControl } from '../../utils/adaptiveIntakeFieldAdapter';

const props = defineProps({
  fields: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:modelValue']);

const groups = computed(() => groupIntakeFieldsForAdaptiveShell(props.fields));

function fieldInputType(field) {
  const control = field.uiControl || mapFieldToControl(field);
  if (control === 'textarea') return 'textarea';
  if (control === 'select' || control === 'choice') return field.type === 'radio' ? 'radio' : 'select';
  if (control === 'date') return 'date';
  if (control === 'phone') return 'tel';
  if (control === 'email') return 'email';
  return 'text';
}

function onUpdate(key, value) {
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}
</script>

<style scoped>
.ai-field-section {
  margin-bottom: 1.35rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--df-border, #e2e6e3);
  border-radius: 14px;
  background: #fff;
}
.ai-field-section-title {
  margin: 0 0 0.85rem;
  font-family: Georgia, 'Iowan Old Style', serif;
  font-size: 1.2rem;
  color: var(--df-primary, #1b3d2f);
}
.ai-field-section-body {
  display: grid;
  gap: 0.75rem;
}
</style>
