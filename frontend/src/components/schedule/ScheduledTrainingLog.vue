<template>
 <details class="training-schedule" :open="expanded" @toggle="$event.target.open && load()"><summary>Upcoming training &amp; attendance log</summary>
  <p v-if="error" role="alert">{{error}}</p><p v-if="!events.length && !loading">No upcoming training.</p>
  <ul><li v-for="e in events" :key="e.id"><button type="button" @click="selected=selected===e.id?null:e.id">{{e.title}} · {{date(e.start_at,e.event_timezone)}}</button><router-link v-if="e.invited" :to="`/join/team-meeting/${e.id}`">Open meeting</router-link><ScheduledTrainingPanel v-if="selected===e.id" :event-id="e.id" @rsvp-saved="load" /></li></ul>
  <h4>Your training log</h4><p v-if="!logs.length && !loading">Attendance will appear after you attend training.</p><table v-if="logs.length"><thead><tr><th>Training</th><th>Date</th><th>Hours</th><th>Credit</th></tr></thead><tbody><tr v-for="l in logs" :key="l.event_id"><td>{{l.title}}</td><td>{{date(l.start_at,l.event_timezone)}}</td><td>{{trainingLogCredit(l).hours.toFixed(2)}} hours<small v-if="trainingLogCredit(l).approved">Approved · {{(l.attendance_seconds/3600).toFixed(2)}} hours recorded on platform</small></td><td>{{trainingLogCredit(l).label}}<small v-if="l.credit_approved_at && l.credit_approved_by_user_id && l.credit_reason">{{l.credit_reason}}</small></td></tr></tbody></table>
 </details>
</template>
<script setup>
import {ref,watch} from 'vue';import api from '../../services/api';import ScheduledTrainingPanel from '../meetings/ScheduledTrainingPanel.vue';
import {trainingLogCredit} from '../../utils/scheduledTraining';
const props=defineProps({agencyId:{type:Number,required:true},expanded:Boolean});const events=ref([]),logs=ref([]),selected=ref(null),loading=ref(false),error=ref('');
function date(v,timeZone){return new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:timeZone||'America/Denver'}).format(new Date(/[zZ]|[+-]\d\d:\d\d$/.test(v)?v:`${String(v).replace(' ','T')}Z`));}
async function load(){if(loading.value)return;loading.value=true;error.value='';try{const [calendar,history]=await Promise.all([api.get('/team-meetings/training-calendar',{params:{agencyId:props.agencyId}}),api.get('/team-meetings/training-logs',{params:{agencyId:props.agencyId}})]);events.value=calendar.data.events;logs.value=history.data.logs;}catch(e){error.value=e.response?.data?.error?.message||'Could not load training.';}finally{loading.value=false;}}
watch(()=>[props.agencyId,props.expanded],()=>{events.value=[];logs.value=[];selected.value=null;if(props.expanded)void load();},{immediate:true});
</script>
<style scoped>.training-schedule{padding:8px 0}.training-schedule summary{cursor:pointer}.training-schedule button{margin:8px;padding:8px}table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #cbd5e1}td small{display:block;margin-top:4px;color:#475569}</style>
