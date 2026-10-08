<script setup>
import { computed } from 'vue';
import { CONVERSA_ASSET_REVISION, CONVERSA_PRODUCT_URL } from '../../constants/conversa';
import { conversaFeature } from '../../conversa/website/feature.mjs';
const props = defineProps({
  product: { type: String, default: 'ptco' },
  ctaHref: { type: String, default: CONVERSA_PRODUCT_URL },
  ctaLabel: { type: String, default: '' },
  heading: { type: String, default: 'h2' },
  id: { type: String, default: 'conversa-features' }
});
// Repository-owned marketing content, shared with the static AuricWell website.
const html = computed(() => conversaFeature(props));
</script>
<template><link rel="stylesheet" :href="`/assets/conversa/feature.css?v=${CONVERSA_ASSET_REVISION}`"><div v-html="html" /></template>
