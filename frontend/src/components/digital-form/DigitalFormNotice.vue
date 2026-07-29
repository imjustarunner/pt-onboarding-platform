<template>
  <aside class="df-notice" :class="variantClass" role="note">
    <div class="df-notice-icon" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    </div>
    <div>
      <p v-if="title" class="df-notice-title">{{ title }}</p>
      <p v-if="body" class="df-notice-body">{{ body }}</p>
      <slot />
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  title: { type: String, default: '' },
  body: { type: String, default: '' },
  variant: { type: String, default: 'info' }
});

const variantClass = computed(() =>
  props.variant === 'warn' ? 'df-notice--warn' : ''
);
</script>
