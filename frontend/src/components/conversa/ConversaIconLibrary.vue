<script setup>
import ConversaBrand from './ConversaBrand.vue';
import ConversaIcon from './ConversaIcon.vue';
import { CONVERSA_TYPES } from '../../constants/conversa';
const types = Object.entries(CONVERSA_TYPES).filter(([id]) => !['all', 'mention'].includes(id));
</script>
<template>
  <section class="conversa-library conversa-surface" aria-label="Conversa communication icons">
    <header><ConversaBrand compact /><div><h2>Communication icons</h2><p>A shared visual language for every conversation.</p></div></header>
    <div class="conversa-library__grid"><div v-for="[id, type] in types" :key="id" class="conversa-library__item"><ConversaIcon :type="id" :size="23" tile /><span>{{ type.label }}</span></div></div>
  </section>
</template>
<style scoped>
.conversa-library { margin-bottom: 28px; padding: 24px; border: 1px solid var(--conversa-border); border-radius: 16px; background: var(--conversa-surface); }
header { display: flex; align-items: center; flex-wrap: wrap; gap: 24px; margin-bottom: 24px; }
h2 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
p { margin: 0; font-size: 13px; color: var(--conversa-muted); }
.conversa-library__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(105px, 1fr)); gap: 18px; }
.conversa-library__item { display: flex; flex-direction: column; align-items: center; gap: 9px; font-size: 12px; text-align: center; }
</style>
