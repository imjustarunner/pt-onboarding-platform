<template><section class="client-care-snapshot"><h3>Care & consent</h3>
 <p>{{client.consent||client.paperwork_status_label||'Paperwork status not recorded'}}</p>
 <p><strong>Next visit:</strong> {{clientVisitLabel(client,timeZone)}}</p>
 <p v-if="loading" role="status">Loading care summary…</p>
 <p v-else-if="error" role="status">{{error}}</p>
 <template v-else-if="snapshot">
  <p v-if="snapshot.guardians?.length"><strong>Guardians:</strong> {{snapshot.guardians.map(g=>g.name).join(' · ')}}</p>
  <template v-if="snapshot.plan"><h4>{{snapshot.plan.title}}</h4><p>{{snapshot.plan.status}}<span v-if="snapshot.plan.frequency"> · {{snapshot.plan.frequency}}</span></p>
   <div v-for="goal in snapshot.plan.goals" :key="goal.id" class="care-goal"><strong>{{goal.text}}</strong><div v-for="objective in goal.objectives" :key="objective.id"><p>{{objective.text}}</p><p v-if="objective.current!=null||objective.target!=null" class="care-rating">Recorded plan rating: {{objective.current??'—'}}/10 · Target {{objective.target??'—'}}/10</p></div></div>
  </template><p v-else>No treatment plan recorded.</p>
 </template>
</section></template>
<script setup>
import {clientVisitLabel} from './clientVisit';
defineProps({client:{type:Object,required:true},snapshot:{type:Object,default:null},loading:Boolean,error:String,timeZone:{type:String,default:'America/Denver'}});
</script>
<style scoped>.client-care-snapshot{padding:16px;font-size:13px;line-height:1.6}.client-care-snapshot h3{font-size:15px;margin:0 0 12px}.client-care-snapshot h4{font-size:14px;margin:18px 0 6px}.client-care-snapshot p{margin:6px 0 10px}.care-goal{border-top:1px solid #dce6f2;margin-top:14px;padding-top:12px}.care-rating{color:#60768e;font-size:12px}</style>
