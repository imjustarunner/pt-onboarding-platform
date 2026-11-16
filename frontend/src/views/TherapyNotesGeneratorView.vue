<template>
  <ClinicalWorkspaceFrame immersive hide-header :tenant-id="agencyStore.currentAgency?.id">
  <div class="tng-page auricwell-surface">
    <header class="tng-page__header">
      <div class="tng-page__brand"><img :src="AURICWELL_MARK_URL" alt="" /><div><strong>AuricWell</strong><h1>THERAPY NOTES AI NOTE GENERATOR</h1></div></div>
      <div class="tng-page__nav"><span class="tng-page__tenant">{{ agencyStore.currentAgency?.name || 'Note Workspace' }}</span><router-link :to="workspacePath">← Note Workspace</router-link></div>
    </header>
    <TherapyNotesQuickGenerator v-if="agencyStore.currentAgency && supportsTherapyNotesQuickGenerator(agencyStore.currentAgency)" ref="generator" :key="agencyStore.currentAgency.id" :agency="agencyStore.currentAgency" />
    <p v-else class="tng-page__empty">Select ITSCO or NLU to use the temporary Therapy Notes generator.</p>
  </div>
  </ClinicalWorkspaceFrame>
</template>
<script setup>
import { computed, ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import TherapyNotesQuickGenerator from '../components/clinical/TherapyNotesQuickGenerator.vue';
import { supportsTherapyNotesQuickGenerator } from '../config/therapyNotesQuickGenerator.js';
import ClinicalWorkspaceFrame from '../components/clinicalWorkspace/ClinicalWorkspaceFrame.vue';
import { AURICWELL_MARK_URL } from '../constants/auricwellBrand.js';
const agencyStore = useAgencyStore(), route = useRoute();
const generator = ref(null);
const workspacePath = computed(() => `${route.params.organizationSlug ? `/${route.params.organizationSlug}` : ''}/note-aid`);
onBeforeRouteLeave(async () => (await generator.value?.prepareToLeave()) !== false);
onBeforeRouteUpdate(async () => (await generator.value?.prepareToLeave()) !== false);
</script>
<style scoped>
.tng-page{min-height:100vh;background:#f3f6fa;color:#213d56;padding:0 24px 28px;box-sizing:border-box}.tng-page__header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:18px 0;margin-bottom:20px;border-bottom:1px solid #dce5ed}.tng-page__brand{display:flex;align-items:center;gap:12px}.tng-page__brand img{width:46px;height:46px;object-fit:contain}.tng-page__brand strong{display:block;color:#193f64;font-size:1.65rem;letter-spacing:-.04em;line-height:1.2}.tng-page__brand h1{display:block;font-size:.65rem;font-weight:600;letter-spacing:.09em;color:#94722e;margin:5px 0 0}.tng-page__nav{display:flex;align-items:center;gap:20px}.tng-page__tenant{font-size:.8rem;font-weight:650;color:#6d8194}.tng-page__header a{color:#315d80;background:#fff;border:1px solid #ccdbe6;border-radius:8px;padding:10px 14px;white-space:nowrap;text-decoration:none;font-size:.8rem}.tng-page__header a:hover{border-color:#7c9ebc}.tng-page__empty{padding:24px;background:#fff;border-radius:12px}@media(max-width:700px){.tng-page{padding:0 14px 20px}.tng-page__header{align-items:flex-start;gap:14px;flex-wrap:wrap;padding:16px 0;margin-bottom:16px}.tng-page__brand strong{font-size:1.4rem}.tng-page__brand h1{font-size:.57rem}.tng-page__brand img{width:40px;height:40px}.tng-page__nav{justify-content:space-between;width:100%;gap:10px}}
</style>
