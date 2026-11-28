<template>
  <section v-if="findings.length" class="encounter-prompts" aria-label="Confirm encounter details">
    <h3>Confirm encounter details</h3>
    <article v-for="finding in findings" :key="finding.id">
      <p>{{ finding.message }}</p>
      <NarrivaInlineFinding v-if="finding.action !== 'risk_assessment'" :finding="finding"
        :context="context" :location-choices="locationChoices" :compact="true" :disabled="saving"
        @apply="$emit('apply', $event)" />
      <button v-else type="button" :disabled="saving" @click="$emit('risk')">Include risk assessment</button>
      <button v-if="finding.canBypass" type="button" :disabled="saving" @click="dismiss(finding)">
        {{ finding.action === 'risk_assessment' ? 'Keep as is' : 'Dismiss discrepancy' }}
      </button>
    </article>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import NarrivaInlineFinding from './NarrivaInlineFinding.vue';

const props = defineProps({
  review: Object,
  context: { type: Object, required: true },
  locationChoices: Array,
  riskIncluded: Boolean,
  resolve: { type: Function, required: true }
});
defineEmits(['apply', 'risk']);
const saving = ref(false);
const error = ref('');
const findings = computed(() => {
  if (!props.review || props.review.phase !== 'output' || ['running', 'stale', 'unavailable'].includes(props.review.status)) return [];
  return (props.review.checks || []).flatMap(check => check.findings || []).filter(finding =>
    !finding.bypassed && ((
      finding.action === 'risk_assessment' && finding.canBypass && !props.riskIncluded
    ) || /^(service_code:(additional|client_absent|client_present)|encounter_consent:(location_mismatch|method_mismatch))$/.test(finding.id)));
});
async function dismiss(finding) {
  saving.value = true;
  error.value = '';
  try {
    const result = await props.resolve({
      findingId: finding.id, action: 'bypass',
      reason: finding.action === 'risk_assessment'
        ? 'Provider chose to keep the note as written for clinical review.'
        : 'Provider confirmed the encounter details as recorded.'
    });
    if (!result) error.value = 'This decision could not be saved. Try again.';
  } finally { saving.value = false; }
}
</script>

<style scoped>
.encounter-prompts { display: grid; gap: 8px; padding: 10px; margin-block: 10px; border: 1px solid #d9bf8d; border-radius: 5px; background: #fffaf0; }
.encounter-prompts h3, .encounter-prompts p { margin: 0; }
.encounter-prompts article + article { padding-top: 8px; border-top: 1px solid #dfd7c9; }
.encounter-prompts button { margin: 6px 8px 0 0; padding: 6px 10px; border: 1px solid #b4c8da; border-radius: 5px; background: white; color: #174873; font: inherit; }
</style>
