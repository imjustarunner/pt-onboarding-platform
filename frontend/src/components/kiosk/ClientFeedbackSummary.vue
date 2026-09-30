<template><div class="feedback-summary">
 <span v-if="loading">Loading feedback…</span><span v-else-if="unavailable">Feedback unavailable</span><span v-else-if="!summaries.length" class="empty">No scored feedback</span>
 <section v-else v-for="group in summaries" :key="group.key">
  <small>{{group.providerName}} · {{group.serviceType==='tutoring'?'Tutoring':'Therapy'}} · {{group.respondentType==='caregiver'?'Dependent / caregiver':group.respondentType==='youth_self'?'Youth self':'Adult self'}}</small>
  <div v-for="metric in metrics" :key="metric.key" class="metric">
   <strong>{{metric.label}}</strong>
   <span :title="date(group.metrics[metric.key].currentAt)">Current <b :style="{color:color(group.metrics[metric.key].current)}">{{number(group.metrics[metric.key].current)}}/10</b></span>
   <span :title="`${group.metrics[metric.key].count} completed scores; all available history`">Avg {{number(group.metrics[metric.key].average)}}</span>
   <span :title="`${group.metrics[metric.key].sixWeekCount} completed scores in the last 42 days`">6w avg {{number(group.metrics[metric.key].sixWeekAverage)}}</span>
   <span :title="changeTitle(group.metrics[metric.key])">6w change <b :style="{color:changeColor(group.metrics[metric.key].change)}">{{delta(group.metrics[metric.key].change)}}</b></span>
  </div>
 </section>
</div></template>
<script setup>
defineProps({summaries:{type:Array,default:()=>[]},loading:Boolean,unavailable:Boolean});
const metrics=[{key:'connection',label:'Connection'},{key:'progress',label:'Progress'}];
const number=v=>v==null?'—':v.toFixed(1);
const delta=v=>v==null?'Not enough history':v>0?`+${v}`:String(v);
const color=v=>v==null?'var(--text-secondary, #657565)':`hsl(${v<=5?v*8:40+(v-5)*17} 65% 36%)`;
const changeColor=v=>v==null||v===0?'var(--text-secondary, #657565)':v>0?'#23833d':'#bc3030';
const date=v=>v?new Date(v).toLocaleDateString():'No completed score';
const changeTitle=m=>m.change==null?'Two completed scores on different dates are needed within the last 42 days.':`${date(m.fromAt)} → ${date(m.toAt)}; latest minus first score within the last 42 days.`;
</script>
<style scoped>.feedback-summary{font-size:12px;min-width:250px;max-width:560px;text-align:left;white-space:normal}.feedback-summary section+section{margin-top:10px}.feedback-summary small,.empty{color:var(--text-secondary,#657565)}.metric{display:flex;gap:5px 10px;flex-wrap:wrap;align-items:baseline;margin-top:5px}.metric>strong{min-width:77px}.metric span{white-space:nowrap}.metric b{font-variant-numeric:tabular-nums}</style>
