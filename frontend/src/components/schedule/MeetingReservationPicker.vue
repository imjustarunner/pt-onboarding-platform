<template>
  <section class="reservation-picker">
    <p v-if="loading" role="status">Loading available times…</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <router-link v-if="needsLogin" :to="{path:'/login',query:{redirect:route.fullPath}}">Sign in to reserve your time</router-link>
    <template v-if="data">
      <h2>{{ data.title }}</h2>
      <p>Invitation for {{ data.name }}</p>
      <template v-if="data.booking">
        <p class="notice" role="status">{{ data.booking.status === 'ACTIVE' ? 'Your time has been reserved. Your host will reach out if there are any changes to their schedule.' : 'This meeting has been canceled. Please contact your host to arrange another time.' }}</p>
        <p><strong>{{ when(data.booking.startAt) }} – {{ endTime(data.booking.endAt) }}</strong></p>
        <template v-if="data.booking.status === 'ACTIVE'">
          <p v-if="data.booking.location">In person: {{ data.booking.location }}</p>
          <p v-if="data.booking.meetingUrl"><a :href="safeMeetingUrl" target="_blank" rel="noopener noreferrer">Open virtual meeting</a></p>
          <button class="btn btn-secondary" @click="downloadCalendar">Add to calendar</button>
          <router-link v-if="data.employee" class="btn btn-secondary" :to="{path:'/my-schedule',query:{eventId:data.booking.eventId,eventKind:'TEAM_MEETING'}}">View My Schedule</router-link>
        </template>
      </template>
      <p v-else-if="data.closed">This invitation has expired or closed. Contact your host for new openings.</p>
      <form v-else @submit.prevent="reserve">
        <p>Choose one time by {{ when(data.expiresAt) }}. Reserving a time schedules the meeting immediately.</p>
        <label>Meeting format<select v-model="modality" required><option value="" disabled>Choose a format</option><option v-if="data.modality !== 'IN_PERSON'" value="VIRTUAL">Virtual</option><option v-if="data.modality !== 'VIRTUAL'" value="IN_PERSON">In person</option></select></label>
        <p v-if="modality === 'IN_PERSON'">{{ data.location }}</p>
        <fieldset><legend>Available times — {{ data.timeZone }}</legend>
          <label v-for="slot in data.slots" :key="slot.id" class="slot"><input v-model="slotId" type="radio" name="meeting-opening" :value="slot.id" required />{{ when(slot.startAt) }} – {{ endTime(slot.endAt) }} ({{ Math.round((new Date(slot.endAt)-new Date(slot.startAt))/60000) }} minutes)</label>
          <p v-if="!data.slots.length">All offered times have been reserved or are no longer available.</p>
        </fieldset>
        <button class="btn btn-primary" :disabled="saving || !slotId || !modality">{{ saving ? 'Reserving…' : 'Reserve this time' }}</button>
      </form>
      <button class="btn btn-secondary" :disabled="loading || saving" @click="load">Refresh availability</button>
    </template>
  </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import {useRoute} from 'vue-router';
import api from '../../services/api';
const props=defineProps({endpoint:{type:String,required:true}}),emit=defineEmits(['reserved']);
const route=useRoute(),data=ref(null),loading=ref(false),saving=ref(false),error=ref(''),needsLogin=ref(false),slotId=ref(null),modality=ref('');
const when=v=>new Intl.DateTimeFormat('en-US',{dateStyle:'full',timeStyle:'short',timeZone:data.value?.timeZone || 'UTC'}).format(new Date(v));
const endTime=v=>new Intl.DateTimeFormat('en-US',{timeStyle:'short',timeZone:data.value?.timeZone || 'UTC'}).format(new Date(v));
const safeMeetingUrl=computed(()=>{try{const u=new URL(data.value?.booking?.meetingUrl);return u.protocol==='https:'?u.href:null;}catch{return null;}});
async function load(){loading.value=true;error.value='';needsLogin.value=false;data.value=null;slotId.value=null;
  try{data.value=(await api.get(props.endpoint,{skipAuthRedirect:true})).data;modality.value=data.value.modality==='BOTH'?'':data.value.modality;}
  catch(e){needsLogin.value=e.response?.status===401;error.value=e.response?.data?.error?.message || 'Unable to load this invitation.';}finally{loading.value=false;}}
async function reserve(){saving.value=true;error.value='';try{data.value=(await api.post(`${props.endpoint}/claim`,{slotId:slotId.value,modality:modality.value},{skipAuthRedirect:true})).data;emit('reserved');}
  catch(e){error.value=e.response?.data?.error?.message || 'Unable to reserve this time. Refresh and try again.';slotId.value=null;}finally{saving.value=false;}}
function downloadCalendar(){const b=data.value.booking,escape=v=>String(v || '').replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;').replaceAll('\r','');
  const stamp=v=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Meeting reservations//EN','BEGIN:VEVENT',`UID:reserved-meeting-${b.eventId}@${window.location.hostname}`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(b.startAt)}`,`DTEND:${stamp(b.endAt)}`,`SUMMARY:${escape(b.title)}`,`LOCATION:${escape(b.location || b.meetingUrl)}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
  const url=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='reserved-meeting.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
watch(()=>props.endpoint,load,{immediate:true});
</script>
<style scoped>
.reservation-picker{max-width:760px;margin:16px auto;padding:24px;border:1px solid var(--border,#d3dce3);border-radius:12px;background:var(--surface-primary,#fff);color:var(--text-primary,#243441)}label{display:grid;gap:8px;margin:14px 0}select{padding:10px;font:inherit}.slot{display:flex;align-items:flex-start;gap:12px;padding:12px;border:1px solid var(--border,#ddd);border-radius:8px}.slot input{margin-top:4px}fieldset{border:0;padding:0}.notice{padding:16px;background:var(--bg-secondary,#edf5f1);border-radius:8px}.error{color:var(--danger,#a32232)}.btn{margin:10px 10px 0 0}a{overflow-wrap:anywhere}
</style>
