<template>
  <section v-if="groups.length" class="outcome-trends" aria-label="Assessment trends and graphs">
    <h3>Trends &amp; graphs</h3>
    <label>Measure and respondent<select :value="active?.key" @change="selection=$event.target.value"><option v-for="group in groups" :key="group.key" :value="group.key">{{ group.title }} · {{ group.reporter }}</option></select></label>
    <template v-if="active">
      <p>{{ active.reporter }} · {{ active.rows.length }} complete {{ active.rows.length === 1 ? 'report' : 'reports' }}. Different respondents and incompatible editions stay separate.</p>
      <label v-if="active.questionnaire.comparisonFamily === 'vanderbilt-parent'">Graph<select v-model="metric"><option value="total">ADHD symptoms (0–54)</option><option value="average">Average performance (1–5)</option></select></label>
      <svg viewBox="0 0 640 220" role="img" :aria-label="`${active.title}, ${active.reporter}, ${metricLabel} over time`">
        <title>{{ active.title }} · {{ active.reporter }}</title>
        <line x1="48" y1="20" x2="48" y2="174" stroke="#83988c" /><line x1="48" y1="174" x2="610" y2="174" stroke="#83988c" />
        <line x1="48" y1="20" x2="610" y2="20" stroke="#e0e8e3" />
        <text x="38" y="25" text-anchor="end">{{ maximum }}</text><text x="38" y="178" text-anchor="end">{{ minimum }}</text>
        <polyline :points="points.map(point=>`${point.x},${point.y}`).join(' ')" fill="none" stroke="#32654b" stroke-width="3" />
        <circle v-for="point in points" :key="point.row.id" :cx="point.x" :cy="point.y" r="4" fill="#32654b"><title>{{ date(point.row.recordedAt) }} · {{ point.value }}</title></circle>
        <text x="48" y="199">{{ date(active.rows[0].recordedAt) }}</text><text x="610" y="216" text-anchor="end">{{ date(active.rows.at(-1).recordedAt) }}</text>
      </svg>
      <p>{{ metricLabel }} · {{ active.questionnaire.id === 'rses' ? 'Higher scores indicate higher reported self-esteem.' : active.questionnaire.comparisonFamily === 'vanderbilt-parent' ? 'Lower scores indicate fewer reported concerns.' : 'Interpret change with the instrument guidance and clinical history.' }}</p>
      <details><summary>View graph data</summary><div class="table-scroll"><table><caption>{{ active.title }} · {{ active.reporter }}</caption><thead><tr><th>Date</th><th>Score</th><th v-if="active.questionnaire.comparisonFamily === 'vanderbilt-parent'">Average performance</th><th>Session</th></tr></thead><tbody><tr v-for="row in active.rows" :key="row.id"><td>{{ date(row.recordedAt) }}</td><td>{{ row.trendValue }}</td><td v-if="active.questionnaire.comparisonFamily === 'vanderbilt-parent'">{{ row.result.average?.toFixed(2) }}</td><td>{{ row.appointment?.id ? `#${row.appointment.id}` : 'Client record' }}</td></tr></tbody></table></div></details>
      <p class="trend-note">Partial reports remain in the clinical record and are excluded from graphs. Screening scores do not establish a diagnosis.</p>
    </template>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue';
import { outcomeTrendSeries } from '../../utils/outcomeTrends.js';
const props = defineProps({ responses:{type:Array,default:()=>[]} });
const selection = ref(''), metric = ref('total');
const groups = computed(()=>outcomeTrendSeries(props.responses));
const active = computed(()=>groups.value.find(group=>group.key===selection.value)||groups.value[0]);
const average = computed(()=>metric.value==='average' && active.value?.questionnaire.comparisonFamily==='vanderbilt-parent');
const minimum = computed(()=>average.value?1:0);
const maximum = computed(()=>average.value?5:Number((active.value?.domain||active.value?.questionnaire.scoreRange)?.match(/0[–-](\d+)/)?.[1]) || Math.max(1,...(active.value?.rows||[]).map(row=>row.trendValue)));
const metricLabel = computed(()=>average.value?'Average performance':active.value?.domain||active.value?.questionnaire.totalLabel||'Symptom / measure score');
const date = value=>new Date(value).toLocaleDateString();
const points = computed(()=>{
  const rows=active.value?.rows||[], times=rows.map(row=>new Date(row.recordedAt).getTime()), first=Math.min(...times), span=Math.max(...times)-first;
  return rows.map((row,index)=>{ const value=average.value?row.result.average:row.trendValue;return {row,value,x:span?48+(times[index]-first)/span*562:329,y:174-(value-minimum.value)/(maximum.value-minimum.value)*154}; });
});
</script>
<style scoped>
.outcome-trends { padding:20px; margin:24px 0; border:1px solid #bdd0c2; border-radius:12px; background:#fff; color:#253e32; }
h3 { margin-top:0; } label { display:grid; gap:6px; font-size:13px; margin:12px 0; } select { padding:10px; border:1px solid #b8ccbf; border-radius:7px; background:white; max-width:100%; }
svg { display:block; width:100%; max-height:300px; } svg text { font-size:12px; fill:#4b6255; } p,table { font-size:12px; } .trend-note { color:#5d6f63; }
.table-scroll { overflow:auto; } table { width:100%; border-collapse:collapse; text-align:left; } th,td { padding:10px; border-bottom:1px solid #dbe5de; } caption { text-align:left; margin:8px 0; }
.outcome-trends,label,select { min-width:0; } select { width:100%; box-sizing:border-box; }
</style>
