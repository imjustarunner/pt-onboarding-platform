<template>
 <div class="school-review">
  <p>Review your current school hours and client spots. Adjust a row to request a change through the existing school scheduling process. Your current assignment remains in place until approval.</p>
  <p v-if="loading">Loading school assignments…</p><p v-if="error" role="alert">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
  <article v-for="school in schools" :key="school.schoolOrganizationId"><h3>{{school.schoolName}}</h3>
   <section v-for="day in school.days" :key="day.assignmentId"><strong>{{day.dayOfWeek}} · {{format(day.startTime)}}–{{format(day.endTime)}}</strong><p>{{day.slotsTotal??'—'}} client spots · {{day.clientCount??'—'}} clients assigned</p>
    <p v-if="pendingFor(school,day)" role="status">Pending request: {{pendingFor(school,day).requestedDay||day.dayOfWeek}} · {{format(pendingFor(school,day).requestedStart)}}–{{format(pendingFor(school,day).requestedEnd)}}; {{pendingFor(school,day).requestedSlots??'current'}} client spots.</p>
    <button type="button" :disabled="readonly" @click="edit(school,day)">{{pendingFor(school,day)?'Change request':'Adjust hours / spots'}}</button>
    <fieldset v-if="target?.day.assignmentId===day.assignmentId" :disabled="busy||readonly"><legend>Requested change</legend>
     <label>Day<select v-model="form.moveToDay"><option v-for="name in days" :key="name">{{name}}</option></select></label>
     <label>Start<input v-model="form.startTime" type="time" /></label><label>End<input v-model="form.endTime" type="time" /></label><label>Client spots<input v-model.number="form.slotsTotal" type="number" min="0" max="40" step="1" /></label>
     <label>Notes<textarea v-model="form.notes" maxlength="600" /></label>
     <p v-if="form.moveToDay!==day.dayOfWeek">Moving days requires review of the clients assigned to the current day.</p>
     <button type="button" @click="save">Submit change for approval</button><button type="button" @click="target=null">Cancel</button>
    </fieldset>
   </section>
  </article>
  <p v-if="!loading&&!schools.length&&!error">No active school assignments.</p>
  <button type="button" :disabled="readonly||busy||loading||!!error||!!target" @click="$emit('complete',{reviewed:true})">Confirm school schedule review</button>
 </div>
</template>
<script setup>
import {ref,onMounted} from 'vue';import api from '../../services/api';
const props=defineProps({base:String,agencyId:[Number,String],readonly:Boolean});defineEmits(['complete']);
const schools=ref([]),pending=ref([]),loading=ref(false),busy=ref(false),error=ref(''),notice=ref(''),target=ref(null),form=ref({});
const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const format=t=>{if(!t)return 'Not set';const [h,m]=String(t).split(':');return `${Number(h)%12||12}:${m} ${Number(h)<12?'AM':'PM'}`;};
const pendingFor=(s,d)=>pending.value.find(p=>p.schoolOrganizationId===s.schoolOrganizationId&&p.dayOfWeek===d.dayOfWeek);
function edit(school,day){target.value={school,day};const p=pendingFor(school,day);form.value={moveToDay:p?.requestedDay||day.dayOfWeek,startTime:p?.requestedStart||String(day.startTime||'').slice(0,5),endTime:p?.requestedEnd||String(day.endTime||'').slice(0,5),slotsTotal:p?.requestedSlots??day.slotsTotal,notes:p?.notes||''};}
async function load(){loading.value=true;error.value='';try{const {data}=await api.get(`${props.base}/school-review`,{params:{agencyId:props.agencyId}});schools.value=data.schools;pending.value=data.pending;}catch(e){error.value=e.response?.data?.error?.message||'Unable to load school assignments.';}finally{loading.value=false;}}
async function save(){if(props.readonly)return;busy.value=true;error.value='';try{await api.post(`${props.base}/school-assignments/${target.value.day.assignmentId}/request`,{...form.value,agencyId:props.agencyId});notice.value='Your requested change is saved for approval.';target.value=null;await load();}catch(e){error.value=e.response?.data?.error?.message||'Unable to save the request.';}finally{busy.value=false;}}
onMounted(load);
</script>
<style scoped>
.school-review,article,section,fieldset{display:grid;gap:12px}article{border:1px solid #dbe4df;border-radius:12px;padding:20px}section{border-top:1px solid #e5e9e6;padding-top:15px}fieldset{padding:16px;border:1px solid #cbdacf;border-radius:8px}label{display:grid;gap:6px}input,select,textarea,button{padding:10px}p{margin:0;color:#53655c;line-height:1.5}
</style>
