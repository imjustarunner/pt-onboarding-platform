<script setup>
import { computed } from 'vue';
const props = defineProps({ sessions: { type: Array, default: () => [] }, clientId: [Number, String], clinicalSessionId: [Number, String] });
const prior = computed(() => props.sessions.filter(row => Number(row.clientId) === Number(props.clientId)
  && ['90791', '90792', 'H0031'].includes(String(row.serviceCode || '').toUpperCase())
  && (!props.clinicalSessionId || Number(row.clinicalSessionId) !== Number(props.clinicalSessionId))));
</script>
<template>
  <aside v-if="prior.length" role="status" class="prior-intake-notice">
    <strong>A signed intake or assessment is already on this chart.</strong>
    <p>Review the earlier assessment before starting another. Continue when a new assessment is appropriate; this notice does not determine billing eligibility.</p>
    <ul><li v-for="row in prior" :key="row.noteId">Note #{{ row.noteId }} · {{ row.dateOfService }} · {{ row.serviceCode }}</li></ul>
  </aside>
</template>
<style scoped>
.prior-intake-notice { margin: 12px 0; padding: 16px; background: #fff8e7; color: #573b0b; border: 1px solid #e5c780; border-radius: 10px; }
p { margin: 6px 0; } ul { margin: 8px 0 0; padding-left: 22px; }
</style>
