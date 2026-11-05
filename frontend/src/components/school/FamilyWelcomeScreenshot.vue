<template>
  <img v-show="loaded" class="fw-screenshot" :src="src" :alt="alt" decoding="async" @load="loaded = true" @error="loaded = false" />
  <slot v-if="!loaded" />
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({ src: { type: String, required: true }, alt: { type: String, required: true } });
const loaded = ref(false);
watch(() => props.src, () => { loaded.value = false; });
</script>

<style scoped>
.fw-screenshot{display:block;width:100%;height:auto;max-width:100%;background:#fff}
</style>
