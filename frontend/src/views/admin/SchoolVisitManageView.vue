<template>
  <main class="manager">
    <p><a href="/admin">Back to workspace</a></p><h1>Manage school visit</h1>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="message" role="status" class="notice">{{ message }}</p>
    <template v-if="data">
      <h2>{{ data.visit.schoolName }}</h2>
      <p v-if="data.visit.status === 'cancelled'">This visit is cancelled.</p>
      <div v-if="data.calendar" class="notice"><strong>Rachel’s current Google Calendar details</strong><br>{{ calendarWhen }}<br>{{ data.calendar.summary }}<br>{{ data.calendar.location }}<br><a v-if="data.calendar.meetLink" :href="data.calendar.meetLink" target="_blank" rel="noopener noreferrer">Virtual meeting link</a><p>Use Rachel’s latest arrangements when applying any update below.</p><button v-if="data.visit.status === 'booked'" type="button" @click="useCalendarTimes">Use these calendar times</button></div>
      <div v-if="data.visit.calendarSyncStatus !== 'ready'" class="error"><p>{{ data.calendarSyncError || 'Calendar sync is pending.' }} Reminders are paused.</p><button :disabled="busy" @click="act('retry_sync')">Retry calendar sync</button></div>
      <section><h3>School change requests</h3><p v-if="!pending.length">No pending requests.</p>
        <article v-for="request in pending" :key="request.id" class="request"><strong>{{ request.details.name }} — {{ request.details.kind }}</strong><p>{{ request.details.note }}</p><a :href="`mailto:${request.details.email}`">{{ request.details.email }}</a><p><label><input v-model="form.requestId" type="radio" :value="request.id" /> Resolve this request with the update below</label></p><button :disabled="busy" @click="act('reject_request', request.id)">Decline request</button></article>
      </section>
      <form v-if="data.visit.status === 'booked'" @submit.prevent="act('update')">
        <h3>Confirmed arrangements</h3><p>Times are in Mountain time. Saving updates the booking, school event and linked Google invitations.</p>
        <label>Starts<input v-model="form.startsAt" type="datetime-local" required /></label><label>Ends<input v-model="form.endsAt" type="datetime-local" required /></label>
        <label>Visit format<select v-model="form.modality"><option value="in_person">In person</option><option value="virtual">Virtual</option></select></label>
        <label v-if="form.modality === 'in_person'">Location<input v-model.trim="form.location" required maxlength="500" /></label>
        <button :disabled="busy">{{ busy ? 'Saving…' : 'Save and update calendars' }}</button>
        <details class="cancel"><summary>Cancel this visit</summary><p>This cancels the appointment and calendar invitations and stops future reminders.</p><label><input v-model="cancelConfirmed" type="checkbox" /> I intend to cancel this visit</label><button type="button" :disabled="busy || !cancelConfirmed" @click="act('cancel')">Cancel visit and invitations</button></details>
      </form>
      <section><h3>Reminder delivery</h3><p v-if="!data.reminders.length">No reminders have been recorded.</p><p v-for="(reminder,i) in data.reminders" :key="i">{{ reminder.delivery_status }} · {{ reminder.recipient }} <span v-if="reminder.last_error">— {{ reminder.last_error }}</span></p></section>
    </template>
    <p v-else-if="!error">Loading…</p>
  </main>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
const route=useRoute(),data=ref(null),busy=ref(false),error=ref(''),message=ref(''),cancelConfirmed=ref(false);
const form=reactive({startsAt:'',endsAt:'',modality:'in_person',location:'',requestId:null});
const path=computed(()=>`/school-visits/${Number(route.params.bookingId)}`);
const mountain=value=>{if(!value)return '';const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;};
const calendarWhen=computed(()=>data.value?.calendar ? `${mountain(data.value.calendar.startAt).replace('T',' ')} – ${mountain(data.value.calendar.endAt).slice(11)} Mountain time`:'');
const pending=computed(()=>(data.value?.requests||[]).filter(r=>r.status==='pending').map(r=>{let details={};try{details=typeof r.after_json==='string'?JSON.parse(r.after_json):r.after_json||{};}catch{}return {...r,details};}));
function useCalendarTimes(){form.startsAt=mountain(data.value.calendar.startAt);form.endsAt=mountain(data.value.calendar.endAt);}
async function load(){const response=await api.get(path.value);data.value=response.data;const v=data.value.visit;Object.assign(form,{startsAt:mountain(v.startsAt),endsAt:mountain(v.endsAt),modality:v.modality,location:v.location||'',requestId:null});}
onMounted(async()=>{try{await load();}catch(e){error.value=e.response?.data?.error?.message||'Unable to load this visit.';}});
async function act(action,requestId=form.requestId){busy.value=true;error.value='';message.value='';try{const response=await api.post(path.value,{...form,action,requestId,revision:data.value.visit.revision});message.value=response.data.message||'Request resolved.';await load();}catch(e){error.value=e.response?.data?.error?.message||'Unable to save. Please try again.';}finally{busy.value=false;}}
</script>
<style scoped>
.manager{max-width:820px;padding:24px;margin:auto;color:var(--text-primary,#263c33)}section,form{margin:24px 0;padding:20px;border:1px solid #cad8cf;border-radius:12px}label{display:block;margin:14px 0}input:not([type=checkbox]):not([type=radio]),select{display:block;width:100%;box-sizing:border-box;padding:10px;margin-top:6px;font:inherit}button{padding:12px 18px;background:#145a3d;color:#fff;border:0;border-radius:8px;cursor:pointer}button:disabled{opacity:.6}.notice,.request{background:#edf5ef;padding:16px;border-radius:8px;color:#263c33}.request{margin:12px 0}.error{color:#a32626}.cancel{margin-top:24px}a{color:#145a3d}
</style>
