<template><section v-if="guests.length" class="calendar-lobby"><h4>Calendar guests waiting · {{ guests.length }}</h4><p role="status">These guests are not signed in. Their display names are self-reported.</p><p v-if="error" role="alert">{{ error }}</p><div v-for="guest in guests" :key="guest.id"><strong>{{ guest.displayName }} · Guest</strong> <button :disabled="busy" @click="admit(guest.id)">Admit individually</button></div></section></template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';import api from '../../services/api';
const props=defineProps({meetingKind:String,sessionId:[String,Number]});const guests=ref([]),error=ref(''),busy=ref(false);let timer;
const emit=defineEmits(['update:guests','update:busy']);
watch(busy,value=>emit('update:busy',value));
let generation=0,fetchingGeneration=null;
const base=()=>props.meetingKind==='team-meeting'?`/team-meetings/${props.sessionId}/calendar-guests`:`/supervision/sessions/${props.sessionId}/calendar-guests`;
async function load(){
 const current=generation;if(fetchingGeneration===current)return;fetchingGeneration=current;
 try{
  const data=(await api.get(base(),{skipGlobalLoading:true,skipAuthRedirect:true})).data;
  if(current!==generation)return;
  guests.value=Array.isArray(data?.guests)?data.guests:[];error.value='';emit('update:guests',guests.value);
 }catch(e){if(current===generation&&guests.value.length)error.value=e.response?.data?.error?.message||'Cannot load calendar guests.';}
 finally{if(fetchingGeneration===current)fetchingGeneration=null;}
}
async function admit(id){if(busy.value)return;busy.value=true;try{await api.post(`${base()}/${id}/admit`);await load();}catch(e){error.value=e.response?.data?.error?.message||'Could not admit guest.';}finally{busy.value=false;}}
watch(()=>[props.meetingKind,props.sessionId],()=>{
 clearInterval(timer);generation++;guests.value=[];emit('update:guests',[]);
 if(props.sessionId){void load();timer=setInterval(load,5000);}
},{immediate:true});
onBeforeUnmount(()=>{generation++;clearInterval(timer);});
defineExpose({admit});
</script>
<style scoped>.calendar-lobby{padding:14px;margin:10px 0;background:#edf5f2;color:#163f34;border:1px solid #94c1b2;border-radius:10px}.calendar-lobby button{padding:9px;margin:6px}</style>
