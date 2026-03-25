<template>
  <div class="gwv-f">
    <label class="gwv-l">Meals / foods you approve</label>
    <textarea v-model="local.allowedMeals" class="input" rows="2" :disabled="disabled" @input="push" />
    <label class="gwv-l">Meals / foods to avoid</label>
    <textarea v-model="local.restrictedMeals" class="input" rows="2" :disabled="disabled" @input="push" />
    <label class="gwv-l">Notes</label>
    <textarea v-model="local.notes" class="input" rows="2" :disabled="disabled" @input="push" />
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  disabled: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);

const local = reactive({
  allowedMeals: props.modelValue.allowedMeals || '',
  restrictedMeals: props.modelValue.restrictedMeals || '',
  notes: props.modelValue.notes || ''
});

watch(
  () => props.modelValue,
  (v) => {
    local.allowedMeals = v.allowedMeals || '';
    local.restrictedMeals = v.restrictedMeals || '';
    local.notes = v.notes || '';
  },
  { deep: true }
);

function push() {
  emit('update:modelValue', { ...props.modelValue, ...local });
}
</script>

<style scoped>
.gwv-f {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gwv-l {
  font-size: 13px;
  font-weight: 600;
}
.input {
  width: 100%;
  resize: vertical;
}
</style>
