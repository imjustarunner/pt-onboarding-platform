<template>
  <nav class="entry-legal" :aria-label="spanish ? 'Información legal' : 'Legal information'">
    <a v-for="link in links" :key="link.path" :href="`https://plottwisthq.com/${link.path}`" target="_blank" rel="noopener noreferrer">{{ link.label }}</a>
  </nav>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ language: { type: String, default: 'en' } });
const spanish = computed(() => props.language.toLowerCase().startsWith('es'));
const links = computed(() => [
  { path: 'terms', label: spanish.value ? 'Términos y condiciones' : 'Terms & Conditions' },
  { path: 'privacypolicy', label: spanish.value ? 'Política de privacidad' : 'Privacy Policy' },
  { path: 'platformhipaa', label: 'HIPAA' }
]);
</script>
<style scoped>
.entry-legal { position:relative; z-index:1; grid-column:1/-1; display:flex; justify-content:center; flex-wrap:wrap; gap:4px 24px; padding:14px 24px calc(20px + env(safe-area-inset-bottom, 0px)); background:#f4f7f8; color:#183b4c; border-top:1px solid #cedbdf; font:inherit; font-size:13px; }
.entry-legal a { display:inline-flex; align-items:center; min-height:44px; color:inherit; text-decoration:underline; text-underline-offset:3px; }
.entry-legal a:focus-visible { outline:3px solid #2867d7; outline-offset:4px; }
</style>
