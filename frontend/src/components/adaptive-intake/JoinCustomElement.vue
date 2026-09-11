<template>
  <div v-if="element.type === 'text'" class="join-custom-text"><h2 v-if="copy[element.id + 'Title']">{{ copy[element.id + 'Title'] }}</h2><p v-if="copy[element.id + 'Body']">{{ copy[element.id + 'Body'] }}</p></div>
  <img v-else-if="element.type === 'image' && safeJoinImage(copy[element.id + 'Url'])" class="join-custom-image" :src="safeJoinImage(copy[element.id + 'Url'])" :alt="copy[element.id + 'Alt'] || ''" loading="lazy" />
  <a v-else-if="element.type === 'link' && safeMarketingHref(copy[element.id + 'Href'])" class="join-custom-link" :href="safeMarketingHref(copy[element.id + 'Href'])">{{ copy[element.id + 'Label'] }}</a>
</template>
<script setup>
import { safeJoinImage } from '../../utils/joinPageDesign';
import { safeMarketingHref } from '../../utils/marketingPageQuality';
defineProps({ element: { type: Object, required: true }, copy: { type: Object, required: true } });
</script>
<style scoped>
.join-custom-text h2 { font-size: 1.5rem; color: var(--ajl-heading-color); margin: 0 0 10px; }
.join-custom-text p { white-space: pre-line; line-height: 1.6; margin: 0; }
.join-custom-image { display: block; width: 100%; height: auto; border-radius: 12px; }
.join-custom-link { display: inline-flex; min-height: 44px; align-items: center; padding: 12px 20px; border-radius: 8px; background: var(--ajl-primary-color); color: #fff; text-decoration: none; font-weight: 700; }
.join-custom-link:focus-visible { outline: 3px solid #2867d7; outline-offset: 4px; }
</style>
