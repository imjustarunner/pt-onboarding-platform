<template>
  <section v-if="choices.length" class="family-booking">
    <button v-if="!open" type="button" @click="open=true;loadSlots()">{{ ft("Book a session") }}</button>
    <form v-else @submit.prevent="book">
      <header><h3>{{ ft("Book a session") }}</h3><button type="button" @click="open=false">{{ ft("Close") }}</button></header>
      <label>{{ ft("Provider and service") }}<select v-model="selected" @change="resetSelection();loadSlots()"><option v-for="(choice,index) in choices" :key="`${choice.providerId}:${choice.serviceId}`" :value="index">{{ choice.providerName }} · {{ choice.serviceName }}</option></select></label>
      <label>{{ ft("Week containing") }}<input type="date" v-model="week" @change="resetSelection();loadSlots()" /></label>
      <p>{{ ft('Times shown in {zone}.', {zone: timeZone}) }}</p>
      <p v-if="loading">{{ ft("Loading openings…") }}</p><p v-else-if="!slots.length">{{ ft("No openings this week. Choose another week or contact your care team.") }}</p>
      <fieldset v-if="slots.length"><legend>{{ ft("Available appointments") }}</legend><label v-for="(slot,index) in slots" :key="`${slot.startAt}:${slot.modality}:${slot.roomId}`"><input type="radio" v-model="slotIndex" :value="index" @change="confirmed=false" /> {{ when(slot.startAt) }} · {{ slot.modality==='VIRTUAL'?ft('Online'):slot.location||ft('In person') }}</label></fieldset>
      <section v-if="choice" class="policy">
        <strong>{{ ft('Session price: {amount}', {amount: money(choice.terms.sessionFeeCents)}) }}</strong>
        <p>{{ ft('Cancel at least {hours} hours before your session: no cancellation fee. Cancel with less notice: {late}. Missed appointment: {missed}.', {hours: choice.terms.noticeHours, late: money(choice.terms.lateFeeCents), missed: money(choice.terms.noShowFeeCents)}) }}</p>
        <p>{{ ft("This test workspace records self-pay balances. No card is charged.") }}</p>
        <label><input type="checkbox" v-model="confirmed" required /> {{ ft("I acknowledge the session price and attendance policy.") }}</label>
      </section>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
      <button :disabled="busy||loading||slotIndex===null||!confirmed">{{ busy?ft('Booking…'):ft('Confirm booking') }}</button>
    </form>
  </section>
</template>
<script setup>
import { useFamilyLocale } from '../../composables/useFamilyLocale';
const { ft, locale: familyLocale } = useFamilyLocale();
import {ref,computed,watch} from 'vue';
import {usePortalCareApi} from '../../composables/usePortalCareApi';
const props=defineProps({clientId:Number});const emit=defineEmits(['booked']);const api=usePortalCareApi();
const choices=ref([]),selected=ref(0),open=ref(false),slots=ref([]),slotIndex=ref(null),confirmed=ref(false),loading=ref(false),busy=ref(false),error=ref(''),notice=ref(''),timeZone=ref('America/Denver');
const week=ref(new Date().toLocaleDateString('en-CA',{timeZone:'America/Denver'}));let generation=0;
const choice=computed(()=>choices.value[selected.value]);
const money=cents=>new Intl.NumberFormat(familyLocale.value,{style:'currency',currency:'USD'}).format((cents||0)/100);
const when=value=>new Date(value).toLocaleString(familyLocale.value,{timeZone:timeZone.value,dateStyle:'medium',timeStyle:'short'});
function resetSelection(){slotIndex.value=null;confirmed.value=false;notice.value='';}
async function loadSlots(){
  if(!choice.value)return;const own=++generation;loading.value=true;error.value='';slots.value=[];resetSelection();
  try{const {data}=await api.get(`/guardian-portal/clients/${props.clientId}/session-booking/slots`,{params:{providerId:choice.value.providerId,tenantServiceId:choice.value.serviceId,weekStart:week.value},skipGlobalLoading:true});
    if(own===generation){slots.value=data.slots;timeZone.value=data.timeZone;choices.value[selected.value]=data.choice;}
  }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||ft("Openings could not be loaded.");}finally{if(own===generation)loading.value=false;}
}
async function book(){
  if(busy.value||!confirmed.value||slotIndex.value===null)return;const own=generation;busy.value=true;error.value='';
  try{const {data}=await api.post(`/guardian-portal/clients/${props.clientId}/session-booking`,{providerId:choice.value.providerId,tenantServiceId:choice.value.serviceId,...slots.value[slotIndex.value],acknowledgedTerms:choice.value.terms,confirmed:true});
    if(own===generation){await loadSlots();notice.value=ft('Appointment #{id} is booked for {when}.', {id: data.appointmentId, when: when(data.startAt)});emit('booked');}
  }catch(e){if(own===generation){error.value=e.response?.data?.error?.message||ft("Booking could not be completed. Refresh appointments before trying again.");resetSelection();}}finally{busy.value=false;}
}
watch(()=>props.clientId,async()=>{const own=++generation;choices.value=[];open.value=false;resetSelection();if(!props.clientId)return;
  try{const {data}=await api.get(`/guardian-portal/clients/${props.clientId}/session-booking`,{skipGlobalLoading:true});if(own===generation){choices.value=Array.isArray(data.choices)?data.choices:[];selected.value=0;}}catch{/* Other practices keep their current booking flow. */}
},{immediate:true});
</script>
<style scoped>
.family-booking{margin:16px 0;padding:16px;background:#f0f7ff;border:1px solid #cfdeed;border-radius:12px}.family-booking header{display:flex;justify-content:space-between;align-items:center}.family-booking label{display:flex;gap:8px;align-items:center;margin:12px 0}.family-booking select{max-width:100%}.family-booking fieldset{max-height:300px;overflow:auto;border:1px solid #cfdeed}.policy{padding:16px;background:white;border-radius:8px;margin:16px 0}.family-booking button{padding:10px 16px;border-radius:8px;cursor:pointer}
</style>
