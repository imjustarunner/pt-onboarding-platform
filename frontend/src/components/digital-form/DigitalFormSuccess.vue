<template>
  <div class="df-success">
    <div v-if="logos.length" class="df-success-logos">
      <img v-for="(src, i) in logos" :key="`${src}-${i}`" :src="src" alt="" />
    </div>
    <h1 class="df-success-title">{{ title }}</h1>
    <p v-if="body" class="df-success-body">{{ body }}</p>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: 'Thank you!' },
  body: { type: String, default: '' },
  logos: { type: Array, default: () => [] }
});
</script>
