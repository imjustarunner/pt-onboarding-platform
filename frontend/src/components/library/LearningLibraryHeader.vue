<template>
  <header class="learning-library-header">
    <div class="learning-library-heading"><div><PlotlineBrand/><span class="beta">Beta</span><p>{{ agencyName }} · Library &amp; learning</p><h1>{{ active === 'training' ? 'Your learning, all together.' : 'A place to find what you need.' }}</h1><p>Company guides, useful resources and your next step in learning.</p></div><router-link :to="`${prefix}/dashboard`">My dashboard →</router-link></div>
    <nav aria-label="Library and learning">
      <router-link :to="`${prefix}/library?section=guides`" :aria-current="active === 'guides' ? 'page' : undefined">Handbooks &amp; guides</router-link>
      <router-link :to="`${prefix}/library?section=resources`" :aria-current="active === 'resources' ? 'page' : undefined">Resources &amp; files</router-link>
      <router-link :to="`${prefix}/my-learning`" :aria-current="active === 'training' ? 'page' : undefined">My training &amp; on-demand</router-link>
      <router-link :to="`${prefix}/clinical-forms`">Clinical forms</router-link>
    </nav>
  </header>
</template>
<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import PlotlineBrand from '../plotline/PlotlineBrand.vue';
defineProps({ active: { type: String, default: 'guides' } });
const route = useRoute(), store = useAgencyStore();
const prefix = computed(() => route.params.organizationSlug ? `/${route.params.organizationSlug}` : '');
const agencyName = computed(() => [store.currentAgency, ...(store.userAgencies || [])].find(a => a && (!route.params.organizationSlug || [a.slug, a.portal_url].includes(route.params.organizationSlug)))?.name || route.params.organizationSlug || 'Your organization');
</script>
<style scoped>
.learning-library-header{font-family:var(--font-ptco),sans-serif;color:#203d35;background:#f8f6f0;border:1px solid #dedfd6;border-radius:20px;padding:clamp(16px,2vw,26px);margin-bottom:24px}.learning-library-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}.learning-library-heading h1{font:600 clamp(24px,2.4vw,34px)/1.3 var(--font-ptco),sans-serif;color:#203d35;margin:12px 0 8px}.learning-library-heading p{font-size:14px;line-height:1.6;margin:10px 0}.beta{display:inline-block;vertical-align:middle;margin-left:20px;border:1px solid #b87961;background:#f6e4d8;border-radius:30px;padding:6px 12px;font-size:12px;font-weight:700}.learning-library-header nav{display:flex;flex-wrap:wrap;gap:8px;border-top:1px solid #d9dfd6;margin-top:18px;padding-top:14px}.learning-library-header a{font-size:14px;color:#254b40;text-decoration:none;border-radius:10px;padding:12px 16px}.learning-library-header nav a:hover{background:#e6ede5}.learning-library-header [aria-current=page]{background:#234b3e!important;color:white}.learning-library-header a:focus-visible{outline:3px solid #b87961;outline-offset:3px}
</style>
