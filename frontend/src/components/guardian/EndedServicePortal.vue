<template>
 <section class="ended-portal" aria-label="Limited service portal">
  <header class="service-status"><h2>{{ ft(access.statusLabel) }}</h2><p>{{ service?.label }}<template v-if="service?.provider_name"> · {{ service.provider_name }}</template></p><p v-if="access.endedAt">{{ ft('Ended') }}: {{ when(access.endedAt) }}</p><p>Your portal remains available for billing, receipts, session history, signed copies, and account support. New sessions and care requests are unavailable for this service. Your other active services are unchanged.</p></header>
  <p v-if="access.reason" class="status-reason">{{ access.reason }}</p>
  <ServiceReturnRequest v-if="Number(service?.provider_user_id)>0" :key="`return:${clientId}:${service.id}`" :client-id="clientId" :service-id="Number(service.id)" :provider-name="service.provider_name" />
  <GuardianServiceExitFeedback v-if="feedbackId&&!feedbackClosed" :client-id="clientId" :operation-id="feedbackId" @close="feedbackClosed=true" />
  <FamilyLedgerPanel v-if="panel==='billing'" :agency-id="agencyId" :client-id="clientId" :learning-only="learning" />
  <GuardianPaymentInsuranceTab v-else-if="panel==='payment_methods'" :agency-id="agencyId" :client-id="clientId" :guardian-user-id="userId" :learning-only="learning" />
  <FamilyAccountSettings v-else-if="panel==='account'" :agency-id="agencyId" :client-id="clientId" limited-service />
  <template v-else-if="panel==='documents'"><GuardianIntakeDocuments :client-id="clientId" /><p v-if="personalPortal">Choose Billing &amp; records help to ask the team for your records.</p><router-link v-else :to="{path:'/my-records',query:{agencyId,clientId}}">{{ ft('Request my records') }}</router-link></template>
  <section v-else-if="panel==='help'"><h3>Account, billing, and records support</h3><p>You can pay existing balances, download statements and receipts, manage payment methods, and request records under your existing permissions. Ending services does not erase your records or change amounts already owed.</p><p>Updating your contact information or submitting feedback does not restart services. Contact the team if you want to discuss returning; staff must reactivate the service before another session can be booked.</p><p v-if="personalPortal">Choose Billing &amp; records help to ask the team for your records.</p><router-link v-else :to="{path:'/my-records',query:{agencyId,clientId}}">Request my records</router-link><p><router-link to="/account-security">Security &amp; sign-in settings</router-link></p><form @submit.prevent="support"><label>Billing or records question<textarea v-model="supportQuestion" maxlength="2000" required rows="3" /></label><p v-if="supportNotice" role="status">{{ supportNotice }}</p><p v-if="error" role="alert">{{ error }}</p><button type="submit" :disabled="supportBusy||!supportQuestion.trim()">{{ supportBusy?'Sending…':'Contact account support' }}</button></form></section>
  <section v-else aria-label="Session history"><h3>{{ ft('Session history') }}</h3><p>Appointment dates, providers, attendance status, and format are available here. Clinical notes are requested separately.</p><button type="button" :disabled="downloading" @click="download">{{ downloading?'Downloading…':'Download full session history (CSV)' }}</button><p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">Loading session history…</p><p v-else-if="!sessions.length">No session history is available under your current access.</p><template v-else><p v-if="total>sessions.length">Showing {{ sessions.length }} of {{ total }} entries. The download includes the full history.</p><div class="history-scroll"><table><thead><tr><th>Date</th><th>Provider</th><th>Status</th><th>Format</th></tr></thead><tbody><tr v-for="session in sessions" :key="session.id"><td>{{ when(session.startAt,session.timeZone) }}</td><td>{{ session.providerName }}</td><td>{{ session.status.replaceAll('_',' ') }}</td><td>{{ session.modality==='VIRTUAL'?'Online':'In person' }}</td></tr></tbody></table></div></template></section>
 </section>
</template>
<script setup>
import {ref,computed,watch,onUnmounted} from 'vue';
import {useRoute} from 'vue-router';
import {usePortalCareApi} from '../../composables/usePortalCareApi';
import {useFamilyLocale} from '../../composables/useFamilyLocale';
import FamilyLedgerPanel from '../billing/FamilyLedgerPanel.vue';
import GuardianPaymentInsuranceTab from './GuardianPaymentInsuranceTab.vue';
import FamilyAccountSettings from './FamilyAccountSettings.vue';
import GuardianIntakeDocuments from './GuardianIntakeDocuments.vue';
import GuardianServiceExitFeedback from './GuardianServiceExitFeedback.vue';
import ServiceReturnRequest from './ServiceReturnRequest.vue';
const props=defineProps({clientId:{type:Number,required:true},agencyId:{type:Number,required:true},userId:Number,service:Object,access:{type:Object,required:true},panel:{type:String,default:'overview'},learning:Boolean,personalPortal:Boolean});
const api=usePortalCareApi(),route=useRoute(),{ft,locale}=useFamilyLocale();
const sessions=ref([]),total=ref(0),loading=ref(false),downloading=ref(false),error=ref(''),feedbackClosed=ref(false);let sequence=0;
const supportQuestion=ref(''),supportNotice=ref(''),supportBusy=ref(false);
const feedbackId=computed(()=>Number(route.query.clientId)===props.clientId&&/^[0-9a-f-]{36}$/i.test(route.query.serviceExit||'')?route.query.serviceExit:null);
const when=(value,zone='America/Denver')=>new Date(typeof value==='string'&&!/(Z|[+-]\d\d:\d\d)$/.test(value)?value.replace(' ','T')+'Z':value).toLocaleString(locale.value,{dateStyle:'medium',timeStyle:'short',timeZone:zone});
async function load(){const own=++sequence;sessions.value=[];error.value='';if(!['overview','history','appointments'].includes(props.panel))return;loading.value=true;try{const{data}=await api.get(`/guardian-portal/clients/${props.clientId}/session-history`,{skipGlobalLoading:true});if(own===sequence){sessions.value=data.sessions||[];total.value=data.total||0;}}catch(e){if(own===sequence)error.value=e.response?.data?.error?.message||'Session history could not be loaded.';}finally{if(own===sequence)loading.value=false;}}
async function download(){
 const own=sequence,clientId=props.clientId;downloading.value=true;error.value='';
 try{const{data}=await api.get(`/guardian-portal/clients/${clientId}/session-history/download`,{responseType:'blob',skipGlobalLoading:true});
  if(own!==sequence||clientId!==props.clientId)return;
  const url=URL.createObjectURL(data);try{const a=document.createElement('a');a.href=url;a.download=`session-history-${clientId}.csv`;a.click();}finally{URL.revokeObjectURL(url);}
 }catch{if(own===sequence)error.value='Session history could not be downloaded. Please retry or request your records.';}finally{if(own===sequence)downloading.value=false;}
}

async function support(){supportBusy.value=true;error.value='';try{await api.post('/guardian-portal/support-tickets',{clientId:props.clientId,agencyId:props.agencyId,topic:'billing',subject:'Billing or records support after services ended',question:supportQuestion.value.trim()});supportQuestion.value='';supportNotice.value='Your account support question was sent. This does not restart services.';}catch(e){error.value=e.response?.data?.error?.message||'Your question could not be sent. Please retry.';}finally{supportBusy.value=false;}}
watch(()=>[props.clientId,props.service?.id],()=>{supportQuestion.value='';supportNotice.value='';supportBusy.value=false;downloading.value=false;feedbackClosed.value=false;});
watch(()=>[props.clientId,props.service?.id,props.panel],load,{immediate:true});onUnmounted(()=>{sequence++;});
</script>
<style scoped>
.ended-portal{padding:20px;background:#fff;border:1px solid #ccdce4;border-radius:14px;margin:16px 0}.service-status{padding:16px;background:#f2f6f8;border-left:4px solid #526a7b;border-radius:8px;margin-bottom:20px}.service-status h2{margin:0 0 8px}.ended-portal p{line-height:1.55;color:#435a6b}.ended-portal button{font:inherit;min-height:44px;padding:10px 14px;border:1px solid #7d9cab;border-radius:8px;background:#fff;cursor:pointer}.history-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce6eb}th{background:#f5f8fa}[role=alert]{color:#9f1f2c}
</style>
