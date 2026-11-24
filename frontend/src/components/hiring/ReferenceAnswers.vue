<template>
  <dl v-if="[2, 3].includes(answers.questionnaireVersion)">
    <dt>Reference</dt><dd>{{ answers.referenceName }} · {{ relationshipLabel }}</dd>
    <template v-if="answers.referenceEmail"><dt>Email</dt><dd>{{ answers.referenceEmail }}</dd></template>
    <template v-if="answers.referencePhone"><dt>Phone</dt><dd>{{ answers.referencePhone }}</dd></template>
    <template v-if="answers.referenceOrganization"><dt>Organization</dt><dd>{{ answers.referenceOrganization }}</dd></template>
    <template v-if="answers.questionnaireVersion === 3"><dt>Time known</dt><dd>{{ durationLabels[answers.relationshipDuration] }}</dd><dt>Professional strengths</dt><dd>{{ answers.strengths }}</dd><dt>Development areas</dt><dd>{{ answers.developmentAreas || 'No comment' }}</dd></template>
    <dt>Would hire or rehire</dt><dd>{{ hireLabels[answers.wouldHire] || answers.wouldHire }}</dd>
    <template v-for="trait in questionnaire?.traits || []" :key="trait.key"><dt>{{ trait.label }}</dt><dd>{{ answers.traits?.[trait.key] === 'not_observed' ? 'Not observed' : `${answers.traits?.[trait.key]} / 5` }}</dd></template>
    <template v-for="question in questionnaire?.questions || []" :key="question.key"><dt>{{ question.label }}</dt><dd>{{ answers.customAnswers?.[question.key] || 'No comment' }}</dd></template>
    <template v-if="answers.questionnaireVersion !== 3"><dt>Reason for recommendation</dt><dd>{{ answers.hireReason || 'No comment' }}</dd><dt>Examples and comments</dt><dd>{{ answers.additionalComments || 'No comment' }}</dd></template>
  </dl>
  <dl v-else><template v-for="(value, key) in answers" :key="key"><dt>{{ key }}</dt><dd>{{ typeof value === 'object' ? JSON.stringify(value) : value }}</dd></template></dl>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ answers: { type:Object, required:true }, questionnaire:Object });
const relationshipLabel = computed(() => props.answers.relationshipType === 'other' ? props.answers.relationshipOther || 'Other'
  : { manager:'Direct supervisor', coworker:'Colleague or coworker', direct_report:'I reported to them' }[props.answers.relationshipType] || props.answers.relationshipType?.replaceAll('_', ' '));
const durationLabels = {under_1_year:'Less than a year','1_2_years':'1–2 years','3_5_years':'3–5 years',over_5_years:'More than 5 years'};
const hireLabels = { yes:'Yes', with_reservations:'Yes, with reservations', no:'No', unable_to_assess:'Unable to assess' };
</script>
<style scoped>dt { font-weight:600; margin-top:10px; } dd { margin:4px 0 12px; white-space:pre-wrap; overflow-wrap:anywhere; }</style>
