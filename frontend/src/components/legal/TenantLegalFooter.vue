<template>
  <nav v-if="profile" class="tenant-legal-footer" :style="{color:profile.color}" :aria-label="`${profile.name} policies`">
    <span>{{ profile.name }}</span><a v-for="link in links" :key="link.type" :href="(profile.legalOrigin || profile.origin) + link.path">{{ link.label }}</a>
  </nav>
</template>
<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { legalProfileForContext, tenantLegalLinks } from '../../content/tenantLegalProfiles.js';
const route=useRoute();
const profile=computed(()=>legalProfileForContext({host:typeof window==='undefined'?'':window.location.hostname,organizationSlug:route.params?.organizationSlug||route.params?.hubSlug,path:route.path}));
const links=computed(()=>profile.value?tenantLegalLinks(profile.value):[]);
</script>
<style scoped>
.tenant-legal-footer{display:flex;justify-content:center;flex-wrap:wrap;align-items:center;gap:12px 24px;padding:24px;background:#fff;border-top:1px solid #ddd;font:14px/1.6 system-ui,sans-serif}.tenant-legal-footer a{color:inherit;text-underline-offset:4px;min-height:44px;display:inline-flex;align-items:center}.tenant-legal-footer span{font-weight:700}
</style>
