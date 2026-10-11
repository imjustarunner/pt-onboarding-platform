<template>
  <section v-if="pilot.length" class="nlu-progress" aria-label="NLU learning pilot progress">
    <p class="eyebrow">Therapy Plus Tutoring · Pilot</p><h3>Two perspectives on progress</h3>
    <p>Emotional functioning and academic performance stay separate. Kiosk connection and care feedback remain a brief check-in, not an academic test.</p>
    <div class="tracks"><article><h4>Feeling and functioning</h4>
      <p v-if="!groups.length">No student or caregiver profiles recorded yet.</p>
      <section v-for="group in groups" :key="group.key"><h5>{{ group.title }}<small>{{ group.instrumentVersion }} · {{ respondentLabel(group.respondent) }} · {{ administrationLabel(group.administration) }}</small></h5>
        <dl><div v-for="metric in group.metrics" :key="metric.label"><dt>{{ metric.label }}</dt><dd>{{ metric.value ?? 'Not scored' }}{{ metric.value == null ? '' : ' / 4' }}</dd><small>{{ metric.direction === 'lower' ? 'Lower reported distress' : 'Higher reported skill use / participation' }} is favorable · {{ metric.count }} scored reports</small><small v-if="metric.lastDate">Last scored {{ metric.lastDate }}</small><small v-if="metric.change != null">{{ metric.change > 0 ? '+' : '' }}{{ metric.change }} since {{ metric.firstDate }}. Descriptive difference only.</small></div></dl>
      </section>
    </article><article><h4>Academic task performance</h4><p v-if="!academic.length">No observed reading or math tasks recorded yet.</p>
      <section v-for="record in academic" :key="record.id"><h5>{{ record.pilotContext.observedOn }} · {{ record.answers.subject?.replaceAll('_', ' ') }}</h5><p>{{ record.answers.task_family }} · Form {{ record.answers.task_form }} · {{ record.answers.difficulty }}</p><p>{{ record.answers.correct ?? '—' }} correct / {{ record.answers.attempted ?? '—' }} attempted / {{ record.answers.presented ?? '—' }} presented</p><p>Accuracy: {{ record.result.domains['Task accuracy (%)'] == null ? 'Not scored' : record.result.domains['Task accuracy (%)'] + '%' }} · Support: {{ supportLabel(record.answers.support) }}</p></section>
      <p>Task accuracy is not a standardized achievement score. Different forms, difficulty, assistance and practice exposure can change results. No automatic academic growth estimate is made.</p>
    </article></div>
    <p class="method">Not validated. No diagnostic cutoffs, population norms or meaningful-change threshold. Student and caregiver reports are not averaged together. Repeated reports are not independent participants and do not establish that the program caused change.</p>
  </section>
</template>
<script setup>
import { computed } from 'vue';
import { nluLearningTrends } from '../../utils/nluLearningTrends.js';
const props = defineProps({ responses: { type: Array, default: () => [] } });
const respondentLabel = value => value === 'student' ? 'Student' : value.startsWith('caregiver_') ? value.replace('caregiver_', 'Caregiver ') : 'Recording staff member';
const administrationLabel = value => ({ self: 'Self-report', clinician_assisted: 'With staff assistance', caregiver: 'Caregiver report', caregiver_assisted: 'With staff assistance' }[value] || value);
const supportLabel = value => ({ independent: 'Independent', directions: 'Directions clarified', prompted: 'Prompted', modeled: 'Modeled', mixed: 'Mixed assistance' }[value] || 'Not recorded');
const pilot = computed(() => props.responses.filter(r => r.questionnaire?.kind === 'original_pilot'));
const groups = computed(() => nluLearningTrends(pilot.value));
const academic = computed(() => pilot.value.filter(r => r.measureId === 'nlu-academic-observation' && r.pilotContext));
</script>
<style scoped>
.nlu-progress{margin:24px 0;padding:24px;background:#f2f6f5;border:1px solid #ceddd7;border-radius:16px;color:#233d45}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.1em}.tracks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.tracks>article{background:white;padding:20px;border-radius:12px;min-width:0;overflow-wrap:anywhere}h5{font-size:14px;line-height:1.6}p{font-size:13px;line-height:1.7}dl>div{padding:12px 0;border-bottom:1px solid #d8e4df}dt{font-size:13px}dd{font-size:22px;margin:5px 0}small{display:block;font-size:11px;line-height:1.6}.method{font-size:12px;color:#4a6161}@media(max-width:750px){.tracks{grid-template-columns:1fr}.nlu-progress{padding:14px}}
</style>
