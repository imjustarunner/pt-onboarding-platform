<template>
  <div class="tng-page">
    <header class="tng-page__header">
      <div><span>{{ agencyStore.currentAgency?.name || 'Note Workspace' }}</span><h1>THERAPY NOTES AI NOTE GENERATOR</h1><p>Generate, save, and quick copy unlinked notes into TherapyNotes.</p></div>
      <router-link :to="workspacePath">← Note Workspace</router-link>
    </header>
    <TherapyNotesQuickGenerator v-if="agencyStore.currentAgency && supportsTherapyNotesQuickGenerator(agencyStore.currentAgency)" ref="generator" :key="agencyStore.currentAgency.id" :agency="agencyStore.currentAgency" />
    <p v-else class="tng-page__empty">Select ITSCO or NLU to use the temporary Therapy Notes generator.</p>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import TherapyNotesQuickGenerator from '../components/clinical/TherapyNotesQuickGenerator.vue';
import { supportsTherapyNotesQuickGenerator } from '../config/therapyNotesQuickGenerator.js';
const agencyStore = useAgencyStore(), route = useRoute();
const generator = ref(null);
const workspacePath = computed(() => `${route.params.organizationSlug ? `/${route.params.organizationSlug}` : ''}/note-aid`);
onBeforeRouteLeave(async () => (await generator.value?.prepareToLeave()) !== false);
onBeforeRouteUpdate(async () => (await generator.value?.prepareToLeave()) !== false);
</script>
<style scoped>
.tng-page{min-height:100vh;background:#f4f7fa;color:#203d56;padding:28px;box-sizing:border-box}.tng-page__header{max-width:1400px;margin:0 auto 24px;display:flex;justify-content:space-between;align-items:center;gap:20px}.tng-page__header span{font-size:.8rem;font-weight:700;color:#63758b}.tng-page h1{font-size:1.6rem;line-height:1.35;margin:8px 0}.tng-page p{line-height:1.5;margin:6px 0}.tng-page__header a{color:#2367a4;background:white;border:1px solid #c6d7e5;border-radius:8px;padding:12px 16px;white-space:nowrap;text-decoration:none}.tng-page__empty{max-width:1400px;margin:auto}@media(max-width:700px){.tng-page{padding:16px}.tng-page__header{align-items:flex-start;flex-direction:column}.tng-page h1{font-size:1.25rem}}
</style>
