<template>
  <fieldset class="reference-questionnaire">
    <legend>Professional reference questions</legend>
    <p>Your answers will not be shared with the applicant. Only authorized People Operations and administrators can review them for hiring.</p>
    <label>Your name<input v-model="answers.referenceName" required maxlength="255" /></label>
    <label>Relationship to applicant<select v-model="answers.relationshipType" required><option value="">Select</option><option value="manager">Manager</option><option value="coworker">Coworker</option><option value="direct_report">Direct report</option><option value="other">Other</option></select></label>
    <label v-if="answers.relationshipType === 'other'">Describe your relationship<input v-model="answers.relationshipOther" required maxlength="500" /></label>
    <label>Would you hire or rehire this person?<select v-model="answers.wouldHire" required><option value="">Select</option><option value="yes">Yes</option><option value="with_reservations">Yes, with reservations</option><option value="no">No</option><option value="unable_to_assess">Unable to assess</option></select></label>
    <p>{{ questionnaire.scale }}</p>
    <label v-for="trait in questionnaire.traits" :key="trait.key">
      <strong>{{ trait.label }}</strong><span>{{ trait.question }}</span><small>{{ trait.example }}</small>
      <select v-model="answers.traits[trait.key]" required :aria-label="trait.label"><option value="">Select a rating</option><option v-for="n in 5" :key="n" :value="n">{{ n }} — {{ scaleLabels[n - 1] }}</option><option value="not_observed">Not observed</option></select>
    </label>
    <label>What most influenced your hiring recommendation? (optional)<textarea v-model="answers.hireReason" rows="3" maxlength="4000" /></label>
    <label>Share an example, strengths, or areas where support would help. (optional)<textarea v-model="answers.additionalComments" rows="3" maxlength="8000" /></label>
  </fieldset>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ modelValue: { type: Object, required: true }, questionnaire: { type: Object, required: true } });
const answers = computed(() => props.modelValue);
const scaleLabels = ['Consistently falls short', 'Needs frequent support', 'Meets expectations', 'Often exceeds expectations', 'Consistently excels'];
</script>
<style scoped>
.reference-questionnaire { border:1px solid var(--border-color,#d8e1dc); border-radius:12px; padding:20px; }
label { display:flex; flex-direction:column; gap:6px; margin:18px 0; } input, select, textarea { padding:10px; border:1px solid #aabbb2; border-radius:6px; font:inherit; width:100%; box-sizing:border-box; } small { color:#52665b; font-weight:normal; }
</style>
