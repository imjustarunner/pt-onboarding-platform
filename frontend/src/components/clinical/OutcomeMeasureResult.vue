<template>
  <article class="assessment-result">
    <h3>{{ response.questionnaire.title }}</h3>
    <p>{{ new Date(response.recordedAt).toLocaleString() }} · Answered by {{ reporter }} · {{ method }}</p>
    <p v-if="response.appointment">Saved to appointment #{{ response.appointment.id }} and the client’s Assessments &amp; Evaluations.</p>
    <p v-for="flag in response.result.flags" :key="flag.key" :class="{urgent:flag.urgent}" class="result-flag" :role="flag.urgent?'alert':undefined">{{ flag.text }}</p>
    <p class="score"><strong>{{ response.result.total == null ? 'Separate module results' : response.result.total }}</strong> <span>{{ response.questionnaire.totalLabel || response.questionnaire.scoreRange }}</span><span v-if="response.result.average != null"> · {{ response.questionnaire.averageLabel || 'Average' }} {{ response.result.average.toFixed(2) }} / {{ response.questionnaire.averageMax || 4 }}</span></p>
    <p>{{ response.result.interpretation }}</p>
    <dl><div v-for="(value,label) in response.result.domains" :key="label"><dt>{{ label }}</dt><dd>{{ value == null ? 'Not scored' : value }}</dd></div></dl>
    <details><summary>View recorded answers and edition</summary><p>{{ response.questionnaire.instrumentVersion }}</p><p>{{ response.questionnaire.rights.attribution }}</p><ol><li v-for="item in answered" :key="item.key"><strong>{{ item.label }}</strong><p>{{ outcomeResponseLabel(item,response.answers[item.key]) }}</p></li></ol></details>
  </article>
</template>
<script setup>
import { computed } from 'vue';
import { outcomeReporter } from '../../utils/outcomeTrends.js';
import { outcomeItemVisible, outcomeResponseLabel } from '../../utils/outcomeMeasureFields.js';
const props=defineProps({response:{type:Object,required:true}});
const reporter=computed(()=>outcomeReporter(props.response)?.label||'Respondent not recorded');
const method=computed(()=>({self:'Completed on screen',clinician_assisted:'Provider asked the questions',caregiver:'Caregiver completed the form',caregiver_assisted:'Provider asked the caregiver',observer:'Staff observation'}[props.response.administration]||props.response.administration));
const answered=computed(()=>props.response.questionnaire.items.filter(item=>outcomeItemVisible(item,props.response.answers)));
</script>
<style scoped>
.assessment-result { color:#263f33; line-height:1.6; }.score strong { font-size:32px; } .result-flag { padding:14px; border:1px solid #d8bd76; border-radius:8px; background:#fff8e2; }.result-flag.urgent { color:#852f25; background:#fff0ec; border-color:#d39c90; } dl>div { display:flex; justify-content:space-between; gap:15px; padding:10px 0; border-bottom:1px solid #dce5df; } dd { font-weight:700; } li p { white-space:pre-wrap; overflow-wrap:anywhere; }
</style>
