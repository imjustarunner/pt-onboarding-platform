<script setup>
import { CONVERSA_ICON_URL, CONVERSA_TAGLINE, CONVERSA_OWNERSHIP } from '../../constants/conversa';
defineProps({ compact: Boolean, tagline: Boolean, heading: { type: String, default: 'div' } });
</script>

<template>
  <div class="conversa-brand" :title="CONVERSA_OWNERSHIP" :class="{ 'conversa-brand--compact': compact }">
    <img class="conversa-brand__mark" :src="CONVERSA_ICON_URL" alt="" width="44" height="44" />
    <div class="conversa-brand__copy">
      <component :is="heading" class="conversa-brand__name">
        Messages <span class="conversa-brand__endorsement">by <strong>Conversa</strong></span>
      </component>
      <p v-if="tagline" class="conversa-brand__tagline">{{ CONVERSA_TAGLINE }}</p>
      <p v-if="!compact || tagline" class="conversa-brand__ownership">{{ CONVERSA_OWNERSHIP }}</p>
    </div>
  </div>
</template>

<style scoped>
.conversa-brand { display: flex; align-items: center; gap: 11px; min-width: 0; color: var(--conversa-navy, #0f2d6b); font-family: var(--conversa-font, Inter, sans-serif); }
.conversa-brand__mark { flex: 0 0 auto; width: 44px; height: 44px; }
.conversa-brand__copy { min-width: 0; }
.conversa-brand .conversa-brand__name { margin: 0; color: inherit; font: 600 28px/1.05 var(--conversa-font, Inter, sans-serif); letter-spacing: -.045em; text-shadow: none; }
.conversa-brand__endorsement { display: block; font-weight: 400; font-size: 11px; line-height: 1.6; letter-spacing: .01em; }
.conversa-brand__endorsement strong { font-weight: 600; }
.conversa-brand .conversa-brand__tagline { margin: 5px 0 0; color: var(--conversa-muted, #687280); font-size: 12px; line-height: 1.5; }
.conversa-brand__ownership { margin: 4px 0 0; color: var(--conversa-muted, #687280); font-size: 10px; line-height: 1.5; }
.conversa-brand--compact { gap: 8px; }
.conversa-brand--compact .conversa-brand__mark { width: 32px; height: 32px; }
.conversa-brand--compact .conversa-brand__name { font-size: 22px; }
.conversa-brand--compact .conversa-brand__endorsement { font-size: 10px; }
</style>
