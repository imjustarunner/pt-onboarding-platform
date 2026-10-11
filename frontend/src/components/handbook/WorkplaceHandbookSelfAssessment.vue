<template>
  <section class="handbook-self-assessment">
    <p class="form-version">Form version {{ form.version }} · Role-specific self-assessment</p>
    <EmployeeEvaluationWorkspace :bundle="blankBundle" mode="readonly" preview />
  </section>
</template>

<script setup>
import { computed } from 'vue';
import EmployeeEvaluationWorkspace from '../evaluations/EmployeeEvaluationWorkspace.vue';
const props = defineProps({ form: { type: Object, required: true } });
// Construct a blank bundle explicitly. Never forward a cycle or personnel record.
const blankBundle = computed(() => ({ cycle: {}, responses: [{
  templateSlug: props.form.slug, templateName: props.form.name,
  isSupervisorRubric: props.form.isSupervisorRubric, rubricSnapshot: props.form.rubric,
  ratings: {}, sectionActionItems: {}, reflection: {}
}] }));
</script>

<style scoped>
.form-version{font-size:12px;color:#617552;line-height:1.7}
.handbook-self-assessment :deep(.ee-workspace){border:0;padding:0;background:transparent}
.handbook-self-assessment :deep(.ee-ratings){grid-template-columns:repeat(2,minmax(0,1fr))}
.handbook-self-assessment :deep(.ee-rating){background:#f3f6ee;border-color:#d6dfcd;opacity:1}
.handbook-self-assessment :deep(.ee-rating-label){color:#18543f}
.handbook-self-assessment :deep(.ee-rating-anchor){color:#435440}
.handbook-self-assessment :deep(.ee-section-title){color:#18543f}
@media(max-width:600px){.handbook-self-assessment :deep(.ee-ratings){grid-template-columns:minmax(0,1fr)}}
</style>
