<script setup>
import { computed } from 'vue';
import { conversaFeature } from '../../conversa/website/feature.mjs';
const props = defineProps({ product: { type: String, default: 'ptco' }, ctaHref: { type: String, default: '/p/ptco/start' }, id: { type: String, default: 'conversa-features' } });
// Repository-owned marketing content, shared with the static AuricWell website.
const html = computed(() => conversaFeature(props));
</script>
<template><link rel="stylesheet" href="/assets/conversa/feature.css"><div v-html="html" /></template>
