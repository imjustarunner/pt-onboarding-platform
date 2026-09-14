<template>
  <div v-if="show" class="df-lang-toggle" role="group" :aria-label="ariaLabel">
    <button
      type="button"
      class="df-lang-btn"
      :class="{ 'df-lang-btn--active': modelValue === 'en' }"
      :disabled="disabled"
      aria-label="English" title="Language: English"
      @click="$emit('update:modelValue', 'en')"
    >
      <span class="df-lang-flag" aria-hidden="true">🇺🇸</span>
    </button>
    <button
      type="button"
      class="df-lang-btn"
      :class="{ 'df-lang-btn--active': modelValue === 'es' }"
      :disabled="disabled"
      aria-label="Español" title="Idioma: Español"
      @click="$emit('update:modelValue', 'es')"
    >
      <span class="df-lang-flag" aria-hidden="true">🇪🇸</span>
    </button>
    <span v-if="switching" class="df-lang-status" aria-live="polite">…</span>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: 'en' },
  show: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  switching: { type: Boolean, default: false },
  ariaLabel: { type: String, default: 'Form language' }
});
defineEmits(['update:modelValue']);
</script>
