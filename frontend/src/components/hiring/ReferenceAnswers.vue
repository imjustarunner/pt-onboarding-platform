<template>
  <dl v-if="answers.questionnaireVersion === 2">
    <dt>Reference</dt><dd>{{ answers.referenceName }} · {{ answers.relationshipType?.replaceAll('_', ' ') }} {{ answers.relationshipOther }}</dd>
    <dt>Would hire or rehire</dt><dd>{{ hireLabels[answers.wouldHire] || answers.wouldHire }}</dd>
    <template v-for="trait in questionnaire?.traits || []" :key="trait.key"><dt>{{ trait.label }}</dt><dd>{{ answers.traits?.[trait.key] === 'not_observed' ? 'Not observed' : `${answers.traits?.[trait.key]} / 5` }}</dd></template>
    <dt>Reason for recommendation</dt><dd>{{ answers.hireReason || 'No comment' }}</dd><dt>Examples and comments</dt><dd>{{ answers.additionalComments || 'No comment' }}</dd>
  </dl>
  <dl v-else><template v-for="(value, key) in answers" :key="key"><dt>{{ key }}</dt><dd>{{ typeof value === 'object' ? JSON.stringify(value) : value }}</dd></template></dl>
</template>
<script setup>
defineProps({ answers: { type:Object, required:true }, questionnaire:Object });
const hireLabels = { yes:'Yes', with_reservations:'Yes, with reservations', no:'No', unable_to_assess:'Unable to assess' };
</script>
<style scoped>dt { font-weight:600; margin-top:10px; } dd { margin:4px 0 12px; white-space:pre-wrap; overflow-wrap:anywhere; }</style>
