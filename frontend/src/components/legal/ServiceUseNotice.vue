<template>
  <details class="service-use-notice" :aria-label="`${context.name} terms and privacy`">
    <summary>Terms &amp; privacy</summary>
    <p>{{ context.notice }}</p>
    <nav aria-label="Applicable terms and privacy"><a v-for="link in context.links" :key="link.href" :href="link.href" target="_blank" rel="noopener noreferrer">{{ link.label }}</a></nav>
    <p class="scope">Reading these notices does not enroll you in texts, authorize recording or release records. Organization agreements are signed separately by authorized representatives.</p>
  </details>
</template>
<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { serviceLegalContext } from '../../utils/serviceLegalContext.js';
const props = defineProps({ schoolPortal: Boolean, organizationSlug: { type: String, default: '' }, role: { type: String, default: '' } });
const route = useRoute();
const context = computed(() => serviceLegalContext({ host: typeof window === 'undefined' ? '' : window.location.hostname,
  path: route.path, organizationSlug: props.organizationSlug || route.params?.organizationSlug || '', role: props.role, schoolPortal: props.schoolPortal }));
</script>
<style scoped>
.service-use-notice{max-width:850px;margin:20px auto;padding:18px 22px;background:#f4f7f8;color:#223d4c;border:1px solid #d6e0e5;border-radius:10px;font:14px/1.6 system-ui,sans-serif;text-align:left}.service-use-notice summary{cursor:pointer;font-weight:600}.service-use-notice[open] summary{margin-bottom:12px}.service-use-notice p{margin:0 0 12px}.service-use-notice nav{display:flex;flex-wrap:wrap;gap:8px 20px}.service-use-notice a{color:#165879;text-decoration:underline;min-height:32px}.service-use-notice .scope{font-size:12px;margin:12px 0 0}
</style>
