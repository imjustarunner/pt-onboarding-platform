<template>
  <div class="focus-summary">
    <section v-for="group in summaries" :key="group.key" class="focus-summary-card" :data-focus-summary="group.key">
      <h3>{{ group.title }}</h3>
      <p class="focus-caption">{{ group.reviewed ? 'Highlighted areas' : 'Currently listed' }}</p>
      <ul class="focus-tags"><li v-for="value in group.top" :key="value">{{ value }}</li></ul>
      <p v-if="!group.top.length" class="focus-caption">No highlighted areas selected.</p>
      <details v-if="group.more.length">
        <summary>Show all matching areas ({{ group.top.length + group.more.length }})</summary>
        <p class="focus-caption">Available for a fit discussion. These choices do not indicate specialized training.</p>
        <ul class="focus-tags"><li v-for="value in [...group.top, ...group.more]" :key="value">{{ value }}</li></ul>
      </details>
    </section>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import { FOCUS_GROUPS, publishedFocus } from '../../navigation/providerFocus.js';
const props = defineProps({ focus:Object, highlights:Object, facets:{type:Object,default:()=>({})} });
const titles = {specialties:'Specialties',ageGroups:'Client ages',populations:'Populations served',modalities:'Therapy approaches'};
const summaries = computed(() => FOCUS_GROUPS.map(g => ({key:g.key,title:titles[g.key],...(props.highlights?.[g.key] || publishedFocus(g.key,props.focus,props.facets[g.key]||[]))})));
</script>
<style scoped>
.focus-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.focus-summary-card{min-width:0;border:1px solid #d4e3dc;border-radius:18px;padding:24px;background:#fff;color:#24463d}.focus-summary-card h3{margin:0 0 8px;font-size:1.2rem;color:#24463d}.focus-caption{font-size:.9rem;line-height:1.5;color:#536c65;margin:8px 0 12px}.focus-tags{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0}.focus-tags li{padding:7px 12px;border-radius:12px;background:#edf5f0;font-size:.95rem;line-height:1.4;overflow-wrap:anywhere}.focus-summary-card details{margin-top:18px}.focus-summary-card summary{cursor:pointer;padding:12px 14px;border:1px solid #b7d0c0;border-radius:10px;font-weight:700;color:#285940;background:#f6faf7}.focus-summary-card summary:focus-visible{outline:3px solid #448767;outline-offset:3px}@media(max-width:650px){.focus-summary{grid-template-columns:1fr}.focus-summary-card{padding:18px}}
</style>
