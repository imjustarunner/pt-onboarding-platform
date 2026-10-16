<template>
  <ul v-if="languages.length" class="provider-languages" aria-label="Additional session languages">
    <li v-for="item in languages" :key="item.language" :title="item.proficiency ? `${item.language} · ${item.proficiency} (self-reported)` : `${item.language} (self-reported)`">
      <span aria-hidden="true">{{ item.flag }}</span>
      <span>{{ item.language }}</span>
    </li>
  </ul>
</template>

<script setup>
import { computed } from 'vue';
import { additionalSessionLanguages } from '../../navigation/providerLanguages';
const props = defineProps({ details: { type: Object, default: () => ({}) } });
const languages = computed(() => additionalSessionLanguages(props.details));
</script>

<style scoped>
.provider-languages { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 0; padding:0; list-style:none; }
.provider-languages li { display:inline-flex; align-items:center; gap:6px; padding:5px 9px; border:1px solid #cbded5; border-radius:7px; background:#f2f8f5; color:#244f42; font:600 12px/1.4 system-ui,sans-serif; }
.provider-languages li > span:first-child { font-size:17px; line-height:1; }
</style>
