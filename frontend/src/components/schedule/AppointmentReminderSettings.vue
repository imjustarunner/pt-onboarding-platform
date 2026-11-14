<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import SessionNotificationEditor from './SessionNotificationEditor.vue';
const props=defineProps({mode:{type:String,default:'default'},rules:{type:Array,default:()=>[]},agencyId:{type:Number,required:true},busy:Boolean,showSave:{type:Boolean,default:true},dateYmd:String,startTime:String,timezoneLabel:String});
const emit=defineEmits(['update:mode','update:rules','save']);
const organization=ref([]),personal=ref(null),loading=ref(false),saving=ref(false),error=ref(''),notice=ref('');
const chosen=ref('');
let generation=0;
const clone=rules=>JSON.parse(JSON.stringify(rules));
const signature=rules=>JSON.stringify((rules||[]).map(rule=>({channels:[...(rule.channels||[rule.channel])].sort(),offsetMinutes:rule.offsetMinutes,message:rule.message||'',askConfirmation:rule.askConfirmation!==false})));
const selection=computed(()=>props.mode==='default'?'organization':chosen.value==='custom'?'custom':personal.value&&signature(personal.value)===signature(props.rules)?'personal':'custom');
const preview=computed(()=>props.mode==='default'?organization.value:props.rules);
const channels=rule=>(rule.channels||[rule.channel]).map(channel=>({email:'Email',sms:'Text',in_app:'In-app'})[channel]||channel).join(' + ');
const timing=minutes=>minutes%60===0?`${minutes/60} ${minutes===60?'hour':'hours'}`:`${minutes} minutes`;
async function load(){
 const current=++generation;loading.value=true;error.value='';personal.value=null;organization.value=[];chosen.value='';
 if(!props.agencyId){loading.value=false;return;}
 try{const [org,mine]=await Promise.all([api.get(`/tenant-booking/agencies/${props.agencyId}/session-notifications`,{skipGlobalLoading:true}),api.get(`/tenant-booking/agencies/${props.agencyId}/session-notifications/my-default`,{skipGlobalLoading:true})]);
  if(current===generation){organization.value=org.data.settings?.reminderRules||[];personal.value=mine.data.rules||null;}}
 catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'Could not load reminder defaults.';}
 finally{if(current===generation)loading.value=false;}
}
function choose(value){
 notice.value='';chosen.value=value;
 if(value==='organization'){emit('update:mode','default');return;}
 if(value==='personal'&&!personal.value){emit('update:mode','customizable');if(!props.rules.length)emit('update:rules',clone(organization.value));notice.value='Choose your reminders below, then save them as My default.';return;}
 emit('update:mode','customizable');
 if(value==='personal')emit('update:rules',clone(personal.value));
 else if(!props.rules.length)emit('update:rules',clone(organization.value));
}
async function savePersonal(){
 saving.value=true;error.value='';notice.value='';
 try{const {data}=await api.put(`/tenant-booking/agencies/${props.agencyId}/session-notifications/my-default`,{rules:props.rules},{skipGlobalLoading:true});personal.value=data.rules;chosen.value='personal';notice.value='My default saved for future bookings. Save this appointment to apply its reminder settings.';}
 catch(e){error.value=e.response?.data?.error?.message||'Could not save My default.';}
 finally{saving.value=false;}
}
watch(()=>props.agencyId,load,{immediate:true});
</script>
<template>
 <section class="appointment-reminder-settings" aria-label="Session reminder settings">
  <h3>Reminders</h3><p>Choose an organization default, your own saved default, or a custom schedule for this appointment.</p>
  <div class="reminder-mode" role="group" aria-label="Reminder settings">
   <button v-for="item in [{id:'organization',label:'Organization default'},{id:'personal',label:'My default'},{id:'custom',label:'Custom'}]" :key="item.id" type="button" :disabled="busy||loading" :aria-pressed="selection===item.id" @click="choose(item.id)">{{item.label}}</button>
  </div>
  <p v-if="loading" role="status">Loading reminder defaults…</p><p v-if="error" role="alert">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
  <SessionNotificationEditor v-if="mode==='customizable' && selection==='custom'" :agency-id="agencyId" :rules="rules" :disabled="busy||saving" :date-ymd="dateYmd" :start-time="startTime" :timezone-label="timezoneLabel" @update:rules="emit('update:rules',$event)" />
  <ul v-else class="reminder-default-preview"><li v-for="rule in preview" :key="rule.id"><strong>{{timing(rule.offsetMinutes)}} before</strong> · {{channels(rule)}}</li></ul>
  <p>Confirmed clients receive a friendly reminder. Unconfirmed clients receive an RSVP request. Declined sessions receive no reminders. Text requires recorded opt-in.</p>
  <div class="reminder-settings-actions">
   <button v-if="selection==='personal'" type="button" :disabled="busy||saving" @click="choose('custom')">Customize these reminders</button>
   <button v-if="mode==='customizable' && selection==='custom'" type="button" :disabled="busy||saving||!rules.length" @click="savePersonal">{{saving?'Saving…':'Save as My default'}}</button>
   <button v-if="showSave" type="button" class="btn btn-primary" :disabled="busy||loading||saving" @click="emit('save')">{{busy?'Saving…':'Save reminder settings'}}</button>
  </div>
 </section>
</template>
<style scoped>
.appointment-reminder-settings{margin:12px 0;padding:12px;border:1px solid #dbe4ed;border-radius:10px;background:var(--bg-card,#fff)}h3{margin:0 0 6px;font-size:15px}p{font-size:13px;line-height:1.5;color:#526578}.reminder-mode,.reminder-settings-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}button{font:inherit;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#17385e;padding:8px 12px;cursor:pointer}button[aria-pressed=true]{background:#e8f5ef;border-color:#23836f}button:disabled{opacity:.6;cursor:default}.reminder-default-preview{padding-left:20px;font-size:13px;line-height:1.8}
</style>
