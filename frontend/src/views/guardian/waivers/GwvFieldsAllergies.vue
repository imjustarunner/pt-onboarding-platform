<template>
  <div class="gwv-f">
    <label class="gwv-l">Allergies / medical notes</label>
    <textarea v-model="local.allergies" class="input" rows="3" :disabled="disabled" @input="push" />
    <label class="gwv-l">Approved snacks</label>
    <textarea v-model="local.approvedSnacks" class="input" rows="2" :disabled="disabled" @input="push" />
    <label class="gwv-l">Other notes</label>
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
  allergies: props.modelValue.allergies || '',
  approvedSnacks: props.modelValue.approvedSnacks || '',
  notes: props.modelValue.notes || ''
});

watch(
  () => props.modelValue,
  (v) => {
    local.allergies = v.allergies || '';
    local.approvedSnacks = v.approvedSnacks || '';
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
