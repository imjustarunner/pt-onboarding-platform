<template>
  <div class="gwv-f">
    <label class="gwv-check">
      <input
        :checked="!!modelValue.consented"
        type="checkbox"
        :disabled="disabled"
        @change="toggle('consented', $event)"
      />
      I agree to use electronic signatures for program forms and waivers for my child.
    </label>
    <label class="gwv-check">
      <input
        :checked="!!modelValue.understoodElectronicRecords"
        type="checkbox"
        :disabled="disabled"
        @change="toggle('understoodElectronicRecords', $event)"
      />
      I understand I can change or revoke this consent at any time in this portal (a new signature may be required).
    </label>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Object, required: true },
  disabled: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);

function toggle(k, ev) {
  if (props.disabled) return;
  emit('update:modelValue', { ...props.modelValue, [k]: ev.target.checked });
}
</script>

<style scoped>
.gwv-f {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.gwv-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 14px;
}
</style>
