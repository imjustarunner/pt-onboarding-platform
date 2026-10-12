<template>
  <header class="training-masthead">
    <div class="training-identity">
      <PlotlineBrand />
      <div class="training-heading"><div><h1>Training center</h1><span class="beta">Beta</span></div><p>{{ agencyName }}</p></div>
    </div>
    <nav aria-label="Workspace shortcuts">
      <router-link :to="`${prefix}/library`"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 5h6l2 2h8v13H4z"/><path d="M4 10h16"/></svg>Document library</router-link>
      <router-link :to="`${prefix}/dashboard`">My dashboard <span aria-hidden="true">↗</span></router-link>
    </nav>
  </header>
</template>
<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import PlotlineBrand from '../plotline/PlotlineBrand.vue';
const route = useRoute(), store = useAgencyStore();
const prefix = computed(() => route.params.organizationSlug ? `/${route.params.organizationSlug}` : '');
const agencyName = computed(() => [store.currentAgency, ...(store.userAgencies || [])].find(a => a && (!route.params.organizationSlug || [a.slug, a.portal_url].includes(route.params.organizationSlug)))?.name || route.params.organizationSlug || 'Your organization');
</script>
<style scoped>
.training-masthead{display:flex;align-items:center;justify-content:space-between;gap:20px;min-width:0;padding:14px 0 18px;border-bottom:1px solid #dce4df;font-family:'Plotline Inter',var(--font-ptco),sans-serif;color:#173930}.training-identity{display:flex;align-items:center;gap:24px;min-width:0}.training-masthead :deep(.plotline-brand){min-width:112px;width:112px;padding-top:12px;flex-shrink:0}.training-masthead :deep(.plotline-brand-name){font-size:33px;letter-spacing:-2.3px}.training-masthead :deep(.plotline-brand-trail){height:24px}.training-masthead :deep(.plotline-brand-by){font-size:7px;letter-spacing:2.2px;margin-top:3px}.training-heading{border-left:1px solid #dce4df;padding-left:24px}.training-heading>div{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.training-heading h1{font:600 21px/1.3 'Plotline Sora',var(--font-ptco),sans-serif;letter-spacing:-.6px;margin:0;color:#16332e}.training-heading p{font-size:12px;color:#66796f;margin:5px 0 0}.beta{background:#f9e9e0;border:1px solid #edcdbb;color:#8b523b;border-radius:20px;padding:3px 8px;font-size:10px;font-weight:600;line-height:1.3}.training-masthead nav{display:flex;align-items:center;gap:8px}.training-masthead a{display:flex;align-items:center;gap:7px;min-height:40px;padding:0 10px;border-radius:7px;font-size:12px;font-weight:500;color:#36554a;text-decoration:none;white-space:nowrap}.training-masthead a:hover{background:#edf3ed}.training-masthead a:focus-visible{outline:3px solid #b87961;outline-offset:2px}.training-masthead svg{width:18px;height:18px;flex-shrink:0}@media(max-width:760px){.training-masthead{align-items:flex-start;flex-direction:column;gap:9px;padding:8px 0 12px}.training-masthead nav{width:100%;justify-content:flex-end;gap:4px}.training-identity{gap:16px}.training-heading{padding-left:16px}.training-heading h1{font-size:19px}.training-masthead a{min-height:34px;padding:0 7px}}
</style>
