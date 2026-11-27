<template>
  <main class="plotline-handbook">
    <header>
      <div>
        <p class="pl-eyebrow">Plotline · Company policies</p>
        <h1>Workplace Handbook</h1>
        <p>Start with guided sections or write your own. Publish your reviewed handbook for your team to read.</p>
      </div>
      <router-link class="pl-company-action" :to="`/${route.params.organizationSlug}/workplace-handbook`">Open team handbook</router-link>
    </header>
    <WorkplaceHandbookWorkspace v-if="companyId" :key="companyId" :agency-id="companyId" plotline-self-service @dirty="dirty = $event" />
    <p v-else role="status">Opening the company handbook…</p>
  </main>
</template>

<script setup>
import { ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { usePlotlineCompanyScope } from '../../composables/usePlotlineCompanyScope';
import WorkplaceHandbookWorkspace from '../../components/handbook/WorkplaceHandbookWorkspace.vue';

const route = useRoute();
const { companyId } = usePlotlineCompanyScope(route, useAgencyStore());
const dirty = ref(false);
const confirmLeave = () => !dirty.value || window.confirm('Leave without saving this section?');
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate((to, from) => {
  if (to.params.organizationSlug !== from.params.organizationSlug) return confirmLeave();
});
</script>

<style scoped>
.plotline-handbook { max-width: 1220px; margin: auto; padding: clamp(16px, 4vw, 48px); }
header { display: flex; justify-content: space-between; align-items: end; gap: 16px; flex-wrap: wrap; padding: 24px; margin-bottom: 22px; background: #eaf1e9; border: 1px solid #d6e4d7; border-radius: var(--pl-company-radius, 14px); }
h1 { margin: 5px 0; font-size: clamp(1.7rem, 4vw, 2.8rem); }
header p { margin: 0; }
</style>
