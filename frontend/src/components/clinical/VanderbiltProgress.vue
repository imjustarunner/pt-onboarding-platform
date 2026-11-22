<template>
  <section v-if="series.length" class="vanderbilt-progress" aria-label="Vanderbilt progress over time">
    <h3>Vanderbilt · Progress over time</h3>
    <p>Initial and follow-up reports share the same 18 ADHD symptoms and eight performance ratings. Lower scores indicate fewer reported concerns. Compare medication context and clinical history; score changes alone do not establish treatment response.</p>
    <article v-for="group in series" :key="group.key">
      <h4>{{ group.reporter }} <small>· {{ group.channel }}</small></h4>
      <div class="table-scroll"><table>
        <caption>Complete reports from this caregiver, oldest first</caption>
        <thead><tr><th>Date</th><th>Report</th><th>Medication</th><th>ADHD symptoms / 54</th><th>Change from initial</th><th>Change from previous</th><th>Performance / 5</th><th>Performance change from initial</th></tr></thead>
        <tbody><tr v-for="row in group.rows" :key="row.id">
          <td>{{ new Date(row.recordedAt).toLocaleDateString() }}</td><td>{{ row.questionnaire.phase === 'initial' ? 'Initial' : 'Follow-up' }}</td>
          <td>{{ medication(row.answers.medication) }}</td><td>{{ row.result.total }}</td><td>{{ change(row.baselineChange) }}</td><td>{{ change(row.priorChange) }}</td>
          <td>{{ row.result.average.toFixed(2) }}</td><td>{{ change(row.performanceChange, 2) }}</td>
        </tr></tbody>
      </table></div>
    </article>
    <p class="series-note">Different caregivers and portal accounts stay in separate histories. Partial reports remain in the clinical record and are excluded from comparisons. Side effects and associated symptoms stay separate from the ADHD score.</p>
  </section>
</template>
<script setup>
import { computed } from 'vue';
import { vanderbiltProgress } from '../../utils/vanderbiltProgress.js';
const props = defineProps({ responses: { type: Array, default: () => [] } });
const series = computed(() => vanderbiltProgress(props.responses));
const medication = value => ({ 0: 'On medication', 1: 'Not on medication', 2: 'Not sure' }[value] || 'Not recorded');
const change = (value, places = 0) => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(places)}`;
</script>
<style scoped>
.vanderbilt-progress { margin: 28px 0; padding: 20px; border: 1px solid #b7cdbd; border-radius: 10px; background: white; }
h3 { margin: 0; } h4 { margin-bottom: 10px; } p, small, table { font-size: 12px; } small { font-weight: 400; }
.table-scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; } caption { text-align: left; margin-bottom: 10px; }
th, td { padding: 10px; text-align: left; border-bottom: 1px solid #d8e3d9; } th { background: #edf4ef; } td { font-variant-numeric: tabular-nums; }
.series-note { color: #52645b; }
</style>
