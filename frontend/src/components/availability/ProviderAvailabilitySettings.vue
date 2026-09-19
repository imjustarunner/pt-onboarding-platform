<template>
 <ProviderServiceOfferings :provider-id="providerId" :agency-id="agencyId" @updated="$emit('updated', {kind: 'services', ...$event})" />
 <section class="availability-settings" aria-label="New client availability">
  <h3>New client availability</h3><p>Choose whether you are taking new clients and the formats you offer. These choices apply across your public profiles.</p>
  <p v-if="loading" role="status">Loading availability settings…</p>
  <template v-else-if="loaded"><div class="choices"><label><input v-model="preferences.seesClients" type="checkbox" :disabled="busy || !canManageParticipation"/> Sees clients — provides services</label><small>Separate from accepting new clients. Only an admin can change this.</small><label><input v-model="preferences.acceptingNewClients" type="checkbox" :disabled="busy"/> Accepting new clients</label><label><input v-model="preferences.inPerson" type="checkbox" :disabled="busy"/> Open for in-person appointments</label><label><input v-model="preferences.virtual" type="checkbox" :disabled="busy"/> Open for virtual appointments</label></div>
   <div class="actions"><button type="button" :disabled="busy" @click="save">{{busy?'Working…':'Save availability'}}</button><button type="button" :disabled="busy" @click="check">Check published openings</button><router-link :to="schedulePath">Add or edit openings →</router-link></div>
   <p v-if="checkedAt">Openings last checked {{new Date(checkedAt).toLocaleString()}}.</p>
   <article v-for="reminder in reminders" :key="reminder.format" class="warning"><strong>No {{reminder.format==='IN_PERSON'?'in-person':'virtual'}} new-client openings published in the next four schedule weeks.</strong><p><router-link :to="schedulePath">Add {{reminder.format==='IN_PERSON'?'in-person':'virtual'}} openings →</router-link> or update your choices above.</p><p v-if="reminder.snoozed">Reminder snoozed until {{new Date(reminder.snoozedUntil).toLocaleDateString()}}. This warning remains here until resolved.</p><button v-else type="button" :disabled="busy" @click="snooze(reminder.format)">Snooze reminder for 7 days</button></article>
  </template><p v-if="error" role="alert">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
 </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import ProviderServiceOfferings from './ProviderServiceOfferings.vue';
import api from '../../services/api';
import {useAuthStore} from '../../store/auth';
const auth=useAuthStore();
const canManageParticipation=computed(()=>['admin','super_admin'].includes(auth.user?.role));
const props=defineProps({providerId:{type:Number,required:true},agencyId:{type:Number,required:true}});
const emit=defineEmits(['updated']);
const preferences=ref({acceptingNewClients:false,inPerson:false,virtual:false}),reminders=ref([]),checkedAt=ref(null),loading=ref(false),loaded=ref(false),busy=ref(false),error=ref(''),notice=ref('');
const endpoint=computed(()=>`/availability/providers/${props.providerId}/public-settings`);
const schedulePath=computed(()=>({path:`/admin/users/${props.providerId}`,query:{agencyId:props.agencyId,tab:'schedule_availability'}}));
function apply(data){preferences.value={...data.preferences};reminders.value=data.reminders||[];checkedAt.value=data.checkedAt;}
let generation=0;
watch(()=>[props.providerId,props.agencyId],async()=>{const id=++generation;loaded.value=false;error.value='';if(!props.providerId||!props.agencyId)return;loading.value=true;try{const{data}=await api.get(endpoint.value,{params:{agencyId:props.agencyId},skipGlobalLoading:true});if(id===generation){apply(data);loaded.value=true;}}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Could not load availability settings.';}finally{if(id===generation)loading.value=false;}},{immediate:true});
async function action(kind,body={}){busy.value=true;error.value='';notice.value='';const id=generation;try{const config={skipGlobalLoading:true};const {data}=kind==='save'?await api.put(endpoint.value,{agencyId:props.agencyId,...preferences.value,...(!canManageParticipation.value?{seesClients:undefined}:{})},config):await api.post(`${endpoint.value}/${kind}`,{agencyId:props.agencyId,...body},config);if(id!==generation)return;apply(data);notice.value=data.checkError||(kind==='save'?'Availability saved.':kind==='snooze'?'Reminder snoozed for seven days.':'Published openings checked.');emit('updated', {kind, ...data});}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Could not update availability. Please try again.';}finally{busy.value=false;}}
const save=()=>action('save'),check=()=>action('check'),snooze=format=>action('snooze',{format});
</script>
<style scoped>
.availability-settings{margin:18px 0;padding:20px;border:1px solid #c3d5ce;border-radius:12px;background:#fff;color:#203e36}.availability-settings h3{color:#203e36;font-size:21px}.choices{display:grid;gap:12px}.choices label{display:flex;align-items:center;gap:10px}.choices input{width:20px;height:20px}.actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:18px 0}.availability-settings button{padding:10px 14px;border:1px solid #53796b;border-radius:6px;background:#f0f7f4;color:#173d30;font:inherit;cursor:pointer}.availability-settings a{color:#145e48;text-decoration:underline}.warning{background:#fff7df;border:1px solid #ddbb6e;border-radius:8px;padding:16px;margin:12px 0}.availability-settings p{line-height:1.5}.availability-settings button:disabled{opacity:.6}
</style>
