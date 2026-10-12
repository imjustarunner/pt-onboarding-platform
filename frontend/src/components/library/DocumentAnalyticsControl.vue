<template>
  <div v-if="allowed && agencyId" class="document-stats-control">
    <button type="button" class="stats-toggle" @click="open = !open">{{ open ? 'Close statistics' : 'Statistics' }}</button>
    <DocumentAnalyticsPanel v-if="open" :agency-id="agencyId" :document-key="documentKey" :document-title="documentTitle" />
  </div>
</template>
<script setup>
import { computed, ref, watch, getCurrentInstance } from 'vue';
import { useAuthStore } from '../../store/auth';
import DocumentAnalyticsPanel from './DocumentAnalyticsPanel.vue';
const props = defineProps({ agencyId: [Number, String], documentKey: String, documentTitle: String, initiallyOpen: Boolean });
const pinia = getCurrentInstance()?.appContext.config.globalProperties.$pinia;
const auth = pinia ? useAuthStore(pinia) : null;
const allowed = computed(() => ['admin', 'super_admin', 'superadmin'].includes(auth?.user?.effectiveRole || auth?.user?.role));
const open = ref(props.initiallyOpen);
watch(() => [props.agencyId, props.documentKey], () => { open.value = false; });
</script>
<style scoped>.document-stats-control{margin:12px 0}.stats-toggle{font:inherit;cursor:pointer;padding:10px 16px;border:1px solid #bccdc8;border-radius:8px;background:white;color:#245143}.stats-toggle:focus-visible{outline:3px solid #24644e}</style>
