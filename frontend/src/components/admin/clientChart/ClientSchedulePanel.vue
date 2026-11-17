<template>
 <section aria-label="Client scheduling">
  <h3>Schedule {{client.full_name || client.initials || 'client'}}</h3>
  <p v-if="loading" role="status">Loading assigned providers…</p><p v-if="error" role="alert">{{error}}</p>
  <p v-if="!loading && !providers.length">Assign a provider under Account → Assignments to schedule this client.</p>
  <label v-if="providers.length">Provider<select v-model="selected"><option v-for="provider in providers" :key="provider.id" :value="provider.id">{{provider.name}}</option></select></label>
  <p v-if="selected">Choose a time on this provider’s calendar. The client will be selected in the booking form when available for that provider.</p>
  <ScheduleAvailabilityGrid v-if="selected" :key="`${client.id}:${selected}`" :user-id="Number(selected)" :agency-id="Number(client.agency_id)" :mode="Number(selected)===Number(auth.user?.id)?'self':'admin'" :booking-client-id="Number(client.id)" :compact-page-chrome="true" :show-company-events-calendar-button="false" />
 </section>
</template>
<script setup>
import {defineAsyncComponent,onBeforeUnmount,ref,watch} from 'vue';
import api from '../../../services/api';
import {useAuthStore} from '../../../store/auth';
const ScheduleAvailabilityGrid=defineAsyncComponent(()=>import('../../schedule/ScheduleAvailabilityGrid.vue'));
const props=defineProps({client:{type:Object,required:true}}),auth=useAuthStore();
const providers=ref([]),selected=ref(0),loading=ref(false),error=ref('');let generation=0;
watch(()=>[props.client.id,props.client.agency_id],async()=>{
 const own=++generation;providers.value=[];selected.value=0;loading.value=true;error.value='';
 try{
  const {data}=await api.get(`/clients/${props.client.id}/service-enrollments`,{params:{agencyId:Number(props.client.agency_id)},headers:{'X-Agency-Id':String(props.client.agency_id)},skipGlobalLoading:true});
  if(own!==generation)return;
  const rows=(data.services||[]).filter(row=>Number(row.is_active)===1 && (!row.agency_id || Number(row.agency_id)===Number(props.client.agency_id))).flatMap(row=>row.providers?.length?row.providers:[row]);
  const values=rows.map(row=>({id:Number(row.provider_user_id),name:row.provider_name||`Provider #${row.provider_user_id}`})).filter(row=>row.id>0);
  if(!data.services?.length&&Number(props.client.provider_id)>0)values.push({id:Number(props.client.provider_id),name:props.client.provider_name||`Provider #${props.client.provider_id}`});
  const manager=['super_admin','admin','support','staff','clinical_practice_assistant','schedule_manager'].includes(auth.user?.role);
  providers.value=[...new Map(values.filter(row=>manager||row.id===Number(auth.user?.id)).map(row=>[row.id,row])).values()];selected.value=providers.value[0]?.id||0;
 }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Assigned providers could not be loaded.';}finally{if(own===generation)loading.value=false;}
},{immediate:true});
onBeforeUnmount(()=>generation++);
</script>
<style scoped>label{display:grid;gap:6px;max-width:340px;margin:12px 0}select{padding:9px;border:1px solid #b9ccd8;border-radius:8px;background:white;font:inherit}[role=alert]{color:#a12828}</style>
