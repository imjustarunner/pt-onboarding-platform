<template>
  <svg
    class="latinx-brand-artwork"
    :viewBox="`${artwork.x} ${artwork.y} ${artwork.width} ${artwork.height}`"
    :width="artwork.width"
    :height="artwork.height"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <image :href="artwork.source" :width="LATINX_BOARD_SIZE.width" :height="LATINX_BOARD_SIZE.height" />
  </svg>
</template>
<script setup>
import { computed } from 'vue';
import { LATINX_ARTWORK, LATINX_BOARD_SIZE } from './latinxBrand';
const props = defineProps({ kind: { type: String, default: 'logo' }, label: String });
const artwork = computed(() => LATINX_ARTWORK[props.kind] || LATINX_ARTWORK.logo);
</script>
<style scoped>
.latinx-brand-artwork { display: block; height: auto; overflow: hidden; flex-shrink: 0; }
</style>
