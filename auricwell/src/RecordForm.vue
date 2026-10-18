<template>
  <form
    class="record-form"
    @change="$emit('change', { ...model })"
    @submit.prevent="$emit('save', { ...model })"
  >
    <div class="form-grid">
      <label
        v-for="field in fields"
        :key="field.key"
        :class="{ 'full-width': field.type === 'textarea' }"
        >{{ field.label
        }}<textarea
          v-if="field.type === 'textarea'"
          v-model="model[field.key]"
          :aria-label="field.label"
          :required="field.required"
          rows="5"
        ></textarea
        ><select
          v-else-if="field.options"
          v-model="model[field.key]"
          :aria-label="field.label"
          :required="field.required"
          :multiple="field.multiple"
        >
          <option value="">Select…</option>
          <option
            v-for="option in field.options"
            :key="option.value ?? option"
            :value="option.value ?? option"
          >
            {{ option.label ?? option }}
          </option></select
        ><input
          v-else-if="field.type === 'checkbox'"
          v-model="model[field.key]"
          :aria-label="field.label"
          type="checkbox" /><input
          v-else-if="field.type === 'number'"
          v-model.number="model[field.key]"
          :aria-label="field.label"
          type="number"
          :min="field.min ?? 0"
          :required="field.required" /><input
          v-else
          v-model="model[field.key]"
          :aria-label="field.label"
          :type="field.type || 'text'"
          :readonly="field.readonly"
          :required="field.required"
          :placeholder="field.placeholder"
      /></label>
    </div>
    <slot :model="model" />
    <div class="actions">
      <button :disabled="busy">{{ busy ? "Saving…" : submitLabel }}</button
      ><button
        v-if="cancelable"
        class="outline"
        type="button"
        @click="$emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </form>
</template>
<script setup>
import { reactive, watch } from "vue";
const props = defineProps({
  fields: Array,
  initial: { type: Object, default: () => ({}) },
  busy: Boolean,
  cancelable: Boolean,
  submitLabel: { type: String, default: "Save" },
});
defineEmits(["save", "cancel", "change"]);
const model = reactive({ ...props.initial });
watch(
  () => props.initial,
  (value) => {
    for (const key of Object.keys(model)) delete model[key];
    Object.assign(model, value);
  },
);
</script>
