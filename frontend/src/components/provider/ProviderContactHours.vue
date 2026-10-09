<template>
 <section class="contact-hours">
  <h3>When may the app contact me?</h3>
  <p>These hours control routine email and text delivery when those channels are enabled. They do not set appointment hours or opt you into texts. Urgent alerts and meeting reminders may follow your separate bypass settings.</p>
  <p v-if="loading">Loading your saved contact hours…</p>
  <p v-if="error" role="alert">{{error}}</p>
  <template v-if="schedule">
   <p><strong>Current setting:</strong> {{savedLabel}}. Time zone: {{schedule.timezone}}.</p>
   <p v-if="schedule.legacyQuietHours">An older quiet-hours rule is also active. Saving here replaces it with the contact hours below.</p>
   <fieldset :disabled="readonly||busy"><legend>Contact hours</legend>
    <label><input v-model="schedule.mode" type="radio" value="follow" /> Follow my saved availability settings: {{availabilityLabel}}</label>
    <label><input v-model="schedule.mode" type="radio" value="anytime" /> Anytime, any day</label>
    <label><input v-model="schedule.mode" type="radio" value="custom" /> Set my daily hours</label>
    <label>Time zone<input v-model="schedule.timezone" placeholder="America/Denver" /></label>
    <div v-if="schedule.mode==='custom'" class="day-grid">
     <section v-for="(name,index) in days" :key="name"><strong>{{name}}</strong>
      <p v-if="!schedule.blocks.some(b=>b.dayOfWeek===index)">Off — no routine notifications</p>
      <div v-for="block in schedule.blocks.filter(b=>b.dayOfWeek===index)" :key="block.id" class="window"><input v-model="block.startTime" type="time" :aria-label="`${name} start`" /><span>to</span><input v-model="block.endTime" type="time" :aria-label="`${name} end`" /><button type="button" @click="schedule.blocks=schedule.blocks.filter(b=>b!==block)">Remove</button></div>
      <button type="button" @click="schedule.blocks.push({id:++nextId,dayOfWeek:index,startTime:'09:00',endTime:'17:00'})">Add hours</button>
     </section>
    </div>
    <button type="button" @click="save">{{busy?'Saving…':'Save contact hours'}}</button>
   </fieldset><p v-if="notice" role="status">{{notice}}</p>
  </template>
 </section>
</template>
<script setup>
import {ref,onMounted} from 'vue';import api from '../../services/api';
const props=defineProps({base:String,agencyId:[Number,String],readonly:Boolean});
const schedule=ref(null),loading=ref(true),busy=ref(false),error=ref(''),notice=ref(''),savedLabel=ref(''),availabilityLabel=ref('');let nextId=0;
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const format=t=>{const [h,m]=String(t).split(':');return `${Number(h)%12||12}:${m} ${Number(h)<12?'AM':'PM'}`;};
function hydrate(data){availabilityLabel.value=data.blocks.map(b=>`${days[b.dayOfWeek]} ${format(b.startTime)}–${format(b.endTime)}`).join('; ')||`Monday–Friday ${format(data.defaults.startTime)}–${format(data.defaults.endTime)}`;schedule.value={...data,mode:data.mode==='anytime'?'anytime':'follow',blocks:data.blocks.map(b=>({...b,id:++nextId}))};savedLabel.value=data.mode==='anytime'?'Anytime':data.blocks.map(b=>`${days[b.dayOfWeek]} ${format(b.startTime)}–${format(b.endTime)}`).join('; ');}
onMounted(async()=>{try{hydrate((await api.get(`${props.base}/contact-hours`,{params:{agencyId:props.agencyId}})).data);}catch(e){error.value=e.response?.data?.error?.message||'Unable to load contact hours.';}finally{loading.value=false;}});
async function save(){if(props.readonly)return;busy.value=true;error.value='';notice.value='';try{hydrate((await api.put(`${props.base}/contact-hours`,{...schedule.value,agencyId:props.agencyId})).data);notice.value='Contact hours saved.';}catch(e){error.value=e.response?.data?.error?.message||'Unable to save contact hours.';}finally{busy.value=false;}}
</script>
<style scoped>
.contact-hours{border:1px solid #cbdacf;border-radius:12px;padding:20px;display:grid;gap:10px}fieldset{border:0;display:grid;gap:12px;padding:0}label,.window{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.day-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.day-grid section{border:1px solid #dbe4df;padding:12px;border-radius:8px;display:grid;gap:8px}input,button{padding:8px}p{line-height:1.5;margin:0;color:#53655c}
</style>
