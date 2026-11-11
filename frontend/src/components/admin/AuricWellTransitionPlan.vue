<template>
  <div>
    <AuricWellTransitionWorkbench ref="workbench" :scoped-agency-id="scopedAgencyId" />
    <details class="aw-reference"><summary>Transition process and readiness reference</summary><AuricWellTransitionReadiness :scoped-agency-id="scopedAgencyId" /></details>
  </div>
</template>
<script setup>
import { ref } from 'vue';
import AuricWellTransitionWorkbench from './AuricWellTransitionWorkbench.vue';
import AuricWellTransitionReadiness from './AuricWellTransitionReadiness.vue';
defineProps({ scopedAgencyId: { type: [Number, String], default: null } });
const workbench = ref(null);
defineExpose({ beforeNavigate: () => workbench.value?.beforeNavigate?.() !== false });
</script>
<style scoped>.aw-reference{margin-top:32px;border-top:1px solid var(--border,#d7e1e8);padding-top:16px}.aw-reference>summary{cursor:pointer;font-weight:600}.aw-reference article{margin-top:18px}</style>
