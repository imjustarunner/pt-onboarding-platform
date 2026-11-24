<template>
  <span><template v-for="(part, index) in parts" :key="index"><a v-if="part.url" :href="part.url" target="_blank" rel="noopener noreferrer">{{ part.text }}</a><template v-else>{{ part.text }}</template></template></span>
</template>

<script setup>
import { computed } from 'vue';
import { messageLinkParts } from '../../navigation/messageLinks.js';

const props = defineProps({ text: { type: String, default: '' } });
const parts = computed(() => messageLinkParts(props.text));
</script>

<style scoped>
a { color: var(--message-link-color, #245caa); text-decoration: underline; overflow-wrap: anywhere; }
</style>
