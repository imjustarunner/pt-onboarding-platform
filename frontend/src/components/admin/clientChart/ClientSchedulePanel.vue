<template>
 <section aria-label="Client scheduling">
  <div class="schedule-head">
    <h3>Appointments</h3>
    <button type="button" class="btn btn-secondary" @click="calendarOpen = !calendarOpen">{{ calendarOpen ? 'Appointment list' : 'Book on provider calendar' }}</button>
  </div>
  <div v-if="!calendarOpen">
    <p v-if="appointmentsError" role="alert">{{ appointmentsError }}</p>
    <p v-else-if="appointmentsLoading" role="status">Loading appointments…</p>
    <template v-else>
      <section v-for="group in appointmentGroups" :key="group.label" class="appointment-list">
        <h4>{{ group.label }}</h4>
        <p v-if="!group.rows.length">No appointments to show.</p>
        <ul v-else><li v-for="row in group.rows" :key="row.id">
          <strong>{{ appointmentDate(row) }}</strong>
          <span>{{ [row.first_name, row.last_name].filter(Boolean).join(' ') }} · {{ String(row.status||'').replaceAll('_', ' ') }}</span>
        </li></ul>
      </section>
      <button v-if="historyPage" type="button" class="btn btn-secondary" @click="historyPage--">Newer appointments</button>
      <button v-if="appointments.moreHistory" type="button" class="btn btn-secondary" @click="historyPage++">Older appointments</button>
    </template>
  </div>
  <template v-else>
  <p v-if="loading" role="status">Loading assigned providers…</p><p v-if="error" role="alert">{{error}}</p>
  <p v-if="!loading && !providers.length">Assign a provider under Account → Assignments to schedule this client.</p>
  <label v-if="providers.length">Provider<select v-model="selected"><option v-for="provider in providers" :key="provider.id" :value="provider.id">{{provider.name}}</option></select></label>
  <p v-if="selected">Choose a time to book this client.</p>
  <ScheduleAvailabilityGrid v-if="selected" :key="`${client.id}:${selected}`" :user-id="Number(selected)" :agency-id="Number(client.agency_id)" :mode="Number(selected)===Number(auth.user?.id)?'self':'admin'" :booking-client-id="Number(client.id)" :compact-page-chrome="true" :show-company-events-calendar-button="false" />
  </template>
 </section>
</template>
<script setup>
import {computed,defineAsyncComponent,onBeforeUnmount,ref,watch} from 'vue';
import api from '../../../services/api';
import {useAuthStore} from '../../../store/auth';
const ScheduleAvailabilityGrid=defineAsyncComponent(()=>import('../../schedule/ScheduleAvailabilityGrid.vue'));
const props=defineProps({client:{type:Object,required:true}}),auth=useAuthStore();
const providers=ref([]),selected=ref(0),loading=ref(false),error=ref('');let generation=0;
const calendarOpen=ref(false),appointments=ref({upcoming:[],history:[]}),historyPage=ref(0);
const appointmentsError=ref(''),appointmentsLoading=ref(false);
const appointmentGroups=computed(()=>[{label:'Upcoming',rows:appointments.value.upcoming},{label:'Appointment history',rows:appointments.value.history}]);
let appointmentRun=0;
function appointmentDate(row) {
  const raw=row.start_at;
  const date=new Date(String(raw||'').replace(' ','T').replace(/(\d{2}:\d{2}:\d{2})$/, '$1Z'));
  if(!Number.isFinite(+date))return 'Date unavailable';
  try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:row.source_timezone||'America/Denver'}).format(date);}
  catch{return date.toLocaleString();}
}
watch(()=>[props.client.id,props.client.agency_id,historyPage.value,calendarOpen.value],async()=>{
  const run=++appointmentRun;
  if(calendarOpen.value)return;
  appointmentsLoading.value=true;
  appointmentsError.value='';
  try{
    const {data}=await api.get(`/clients/${props.client.id}/chart-appointments`,{params:{agencyId:props.client.agency_id,historyPage:historyPage.value},headers:{'X-Agency-Id':String(props.client.agency_id)},skipGlobalLoading:true});
    if(run===appointmentRun)appointments.value={upcoming:data?.upcoming||[],history:data?.history||[],moreHistory:data?.moreHistory===true};
  }catch(error){
    if(run===appointmentRun)appointmentsError.value=error.response?.data?.error?.message||'Appointments could not be loaded.';
  }finally{
    if(run===appointmentRun)appointmentsLoading.value=false;
  }
},{immediate:true});
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
onBeforeUnmount(()=>{generation++;appointmentRun++;});
</script>
<style scoped>.schedule-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.appointment-list ul{list-style:none;padding:0}.appointment-list li{display:flex;flex-wrap:wrap;gap:8px 18px;padding:9px 0;border-bottom:1px solid #dbe4ef}.appointment-list{margin:14px 0}label{display:grid;gap:6px;max-width:340px;margin:12px 0}select{padding:9px;border:1px solid #b9ccd8;border-radius:8px;background:white;font:inherit}[role=alert]{color:#a12828}</style>
