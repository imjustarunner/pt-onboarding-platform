<script setup>
import { computed } from 'vue';
import ConversaIcon from './ConversaIcon.vue';
import { conversaType } from '../../constants/conversa';
const props = defineProps({ type: { type: String, default: 'chat' }, label: { type: String, default: '' } });
const meta = computed(() => conversaType(props.type));
</script>
<template>
  <span class="conversa-badge" :class="'conversa-tone--' + meta.tone"><ConversaIcon :type="type" :size="13" />{{ label || meta.label }}</span>
</template>
<style scoped>
.conversa-badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 6px; padding: 3px 7px; color: var(--conversa-tone-ink); background: var(--conversa-tone-bg); font: 500 11px/1.4 var(--conversa-font, Inter, sans-serif); white-space: nowrap; vertical-align: middle; }
</style>
