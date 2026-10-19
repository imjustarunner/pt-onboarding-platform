<template>
 <details class="training-schedule" @toggle="$event.target.open && load()"><summary>Scheduled training &amp; training logs</summary>
  <p v-if="error" role="alert">{{error}}</p><p v-if="!events.length && !loading">No upcoming training.</p>
  <ul><li v-for="e in events" :key="e.id"><button type="button" @click="selected=selected===e.id?null:e.id">{{e.title}} · {{date(e.start_at,e.event_timezone)}}</button><router-link v-if="e.invited" :to="`/join/team-meeting/${e.id}`">Open meeting</router-link><ScheduledTrainingPanel v-if="selected===e.id" :event-id="e.id" /></li></ul>
  <h4>Your training log</h4><p v-if="!logs.length && !loading">Attendance will appear after you attend training.</p><table v-if="logs.length"><thead><tr><th>Training</th><th>Date</th><th>Attendance</th><th>Credit</th></tr></thead><tbody><tr v-for="l in logs" :key="l.event_id"><td>{{l.title}}</td><td>{{date(l.start_at,l.event_timezone)}}</td><td>{{(l.attendance_seconds/3600).toFixed(2)}} hours</td><td>{{l.credit_type==='indirect'?'Indirect · unpaid':l.credit_type==='support_activity'?'Support Activity':l.credit_type==='admin_time'?'Administrative time override':'Optional attendance'}}</td></tr></tbody></table>
 </details>
</template>
<script setup>
import {ref,watch} from 'vue';import api from '../../services/api';import ScheduledTrainingPanel from '../meetings/ScheduledTrainingPanel.vue';
const props=defineProps({agencyId:{type:Number,required:true}});const events=ref([]),logs=ref([]),selected=ref(null),loading=ref(false),error=ref('');
function date(v,timeZone){return new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:timeZone||'America/Denver'}).format(new Date(/[zZ]|[+-]\d\d:\d\d$/.test(v)?v:`${String(v).replace(' ','T')}Z`));}
async function load(){loading.value=true;error.value='';try{const [calendar,history]=await Promise.all([api.get('/team-meetings/training-calendar',{params:{agencyId:props.agencyId}}),api.get('/team-meetings/training-logs',{params:{agencyId:props.agencyId}})]);events.value=calendar.data.events;logs.value=history.data.logs;}catch(e){error.value=e.response?.data?.error?.message||'Could not load training.';}finally{loading.value=false;}}
watch(()=>props.agencyId,()=>{events.value=[];logs.value=[];selected.value=null;});
</script>
<style scoped>.training-schedule{padding:8px 0}.training-schedule summary{cursor:pointer}.training-schedule button{margin:8px;padding:8px}table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #cbd5e1}</style>
