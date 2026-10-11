<template><main class="outcome-library"><router-link :to="`${prefix}/library?companyDocument=provider-guide#provider-guide-appendix-a`">← Provider’s Guide · Appendix A</router-link><OutcomeMeasuresPanel ref="panel" :agency-id="agencyStore.currentAgency?.id" :initial-measure="String(route.query.measure || '')" /></main></template>
<script setup>
import { computed, ref } from 'vue';
import { useAgencyStore } from '../store/agency';
const agencyStore = useAgencyStore();
import { useRoute, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import OutcomeMeasuresPanel from '../components/clinical/OutcomeMeasuresPanel.vue';
const route = useRoute(), panel = ref(null);
const prefix = computed(() => route.params.organizationSlug ? `/${route.params.organizationSlug}` : '');
onBeforeRouteLeave(() => panel.value?.canLeave() !== false);
onBeforeRouteUpdate(() => panel.value?.canLeave() !== false);
</script>
<style scoped>.outcome-library{max-width:1240px;margin:0 auto;padding:30px clamp(12px,3vw,36px)}.outcome-library>a{font-size:12px;color:#345c48}</style>
