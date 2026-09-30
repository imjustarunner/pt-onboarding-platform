<template><aside v-if="groups.length" class="caseload-feedback"><strong>Client feedback averages</strong><p>Each client counts once. Change compares first and latest scores within the last 42 days; clients without two scores are excluded from change averages. Custom feedback, not validated measures.</p><section v-for="group in groups" :key="group.key"><small>{{group.label}}</small><div v-for="metric in metrics" :key="metric.key"><b>{{metric.label}}</b> · Current {{format(group[metric.key].current)}}/10 · Average {{format(group[metric.key].average)}} · 6w average {{format(group[metric.key].recent)}} · <strong>6w change {{delta(group[metric.key].change)}}</strong> <small>({{group[metric.key].count}} scored clients; {{group[metric.key].changeCount}} with change)</small></div></section></aside></template>
<script setup>
import {computed} from 'vue';
const props=defineProps({byClient:{type:Object,default:()=>({})}});
const metrics=[{key:'connection',label:'Connection'},{key:'progress',label:'Progress'}];
const mean=values=>{const scored=values.filter(v=>v!=null);return scored.length?Math.round(scored.reduce((a,b)=>a+b,0)/scored.length*10)/10:null;};
const format=v=>v==null?'—':v.toFixed(1);const delta=v=>v==null?'Not enough history':v>0?`+${v}`:String(v);
const groups=computed(()=>{
 const map=new Map();
 for(const row of Object.values(props.byClient).flat()){
  const key=[row.providerId,row.serviceType,row.respondentType].join(':');
  if(!map.has(key))map.set(key,{key,label:`${row.providerName} · ${row.serviceType==='tutoring'?'Tutoring':'Therapy'} · ${row.respondentType==='caregiver'?'Dependent / caregiver':row.respondentType==='youth_self'?'Youth self':'Adult self'}`,rows:[]});
  map.get(key).rows.push(row);
 }
 return [...map.values()].map(({rows,...group})=>{
  for(const {key} of metrics){const ms=rows.map(r=>r.metrics[key]);group[key]={current:mean(ms.map(m=>m.current)),average:mean(ms.map(m=>m.average)),recent:mean(ms.map(m=>m.sixWeekAverage)),change:mean(ms.map(m=>m.change)),count:ms.filter(m=>m.current!=null).length,changeCount:ms.filter(m=>m.change!=null).length};}return group;
 });
});
</script>
<style scoped>.caseload-feedback{border:1px solid var(--border-color,#d8e2d6);border-radius:12px;padding:14px;margin:12px 0;font-size:13px}.caseload-feedback p{font-size:12px;max-width:850px;color:var(--text-secondary,#657565);line-height:1.5}.caseload-feedback section{margin-top:12px}.caseload-feedback section div{margin-top:5px}.caseload-feedback small{color:var(--text-secondary,#657565)}</style>
