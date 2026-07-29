<template>
  <button
    type="button"
    class="df-selection-card"
    :class="{ 'df-selection-card--selected': selected }"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <div v-if="icon || $slots.icon" class="df-selection-card-icon">
      <slot name="icon">
        <span aria-hidden="true">{{ icon }}</span>
      </slot>
    </div>
    <div class="df-selection-card-title">{{ title }}</div>
    <div v-if="description" class="df-selection-card-desc">{{ description }}</div>
    <slot />
  </button>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '' },
  selected: { type: Boolean, default: false }
});
defineEmits(['select']);
</script>
