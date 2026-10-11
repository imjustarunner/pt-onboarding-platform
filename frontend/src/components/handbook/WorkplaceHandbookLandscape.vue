<template>
  <figure v-if="artwork?.url && !failed" class="handbook-landscape">
    <img :src="artwork.url" :alt="artwork.alt || artwork.title" :width="artwork.width" :height="artwork.height" :style="{ objectPosition: artwork.position || 'center' }" loading="lazy" decoding="async" @error="failed = true" />
    <figcaption><span>{{ artwork.title }}</span><span>Colorado</span></figcaption>
  </figure>
</template>

<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ artwork: { type: Object, default: null } });
const failed = ref(false);
watch(() => props.artwork?.url, () => { failed.value = false; });
</script>

<style scoped>
.handbook-landscape { margin: 0 0 30px; }
.handbook-landscape img { display: block; width: 100%; height: clamp(160px, 20vw, 245px); object-fit: cover; border-radius: 10px 10px 2px 2px; background: #e5eddf; }
.handbook-landscape figcaption { display: flex; justify-content: space-between; gap: 12px; padding-top: 10px; color: #61705c; font: 10px/1.5 var(--handbook-font, var(--font-ptco)); letter-spacing: .035em; }
.handbook-landscape figcaption span:last-child { text-transform: uppercase; letter-spacing: .12em; }
@media(max-width:450px) { .handbook-landscape img { height: 165px; }.handbook-landscape figcaption { font-size: 9px; } }
</style>
