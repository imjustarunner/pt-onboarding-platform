<template>
  <details class="essentials"><summary>Update matching details after a call</summary>
    <form @submit.prevent="save">
      <p>Use the saved record or the family’s answers. A home city can supply the in-person location. Diagnoses and therapist gender remain optional.</p>
      <label>Visit format *<select v-model="form.modality" required><option value="">Choose…</option><option value="in_person">In person</option><option value="virtual">Virtual</option><option value="either">Either</option></select></label>
      <label v-if="form.modality !== 'virtual'">In-person city *<select v-model="form.serviceLocation" required><option value="">Choose…</option><option v-for="city in EXCHANGE_CITIES" :key="city">{{ city }}</option></select></label>
      <label>Insurance plan or self-pay *<input v-model="form.insurance" maxlength="200" required /></label>
      <ClientSchedulePreferences v-model="form.schedule" required />
      <label>{{ hasConcerns ? 'Brief matching concern (optional update)' : 'Brief matching concern *' }}<textarea v-model="form.concerns" :required="!hasConcerns" maxlength="2000" rows="3" /></label>
      <p class="muted">Use a brief description suitable for sharing on the Exchange. Do not paste intake answers or chart narratives.</p>
      <p v-if="listing.preferences?.scheduleNotesRestricted" class="muted">Existing scheduling notes are restricted in this view and will be preserved unless you enter replacement notes.</p>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="saved" role="status">Matching details saved. Insurance coverage is still checked separately.</p>
      <button type="submit" class="btn btn-secondary" :disabled="busy">{{ busy ? 'Saving…' : 'Save matching details' }}</button>
    </form>
  </details>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import api from '../../services/api';
import {EXCHANGE_CITIES,assertExchangeEssentials} from '../../navigation/clientExchangeEssentials.js';
import ClientSchedulePreferences from './ClientSchedulePreferences.vue';
const props=defineProps({listing:{type:Object,required:true}}),emit=defineEmits(['saved']);
const form=ref({}),busy=ref(false),error=ref(''),saved=ref(false);
const hasConcerns=computed(()=>!!props.listing.hasClinicalConcerns || !!props.listing.presentingProblems?.length);
let syncing=false,dirty=false,editVersion=0;
watch(form,()=>{if(!syncing){dirty=true;editVersion++;saved.value=false;}},{deep:true,flush:'sync'});
watch(()=>props.listing,(listing,previous)=>{
  const changed=previous?.id!==listing.id;
  if(changed){saved.value=false;error.value='';dirty=false;editVersion++;}
  if(!changed&&dirty)return;
  const p=listing.preferences||{};
  syncing=true;
  form.value={modality:p.modality||'',serviceLocation:p.serviceLocation||'',insurance:p.insurance||'',schedule:JSON.parse(JSON.stringify(p.schedule||{})),concerns:p.sharedMatchingConcern||''};
  syncing=false;
},{immediate:true});
async function save(){
  if(busy.value)return;
  busy.value=true;error.value='';saved.value=false;
  const listingId=props.listing.id,version=editVersion;
  try{
    assertExchangeEssentials({preferences:form.value,presentingProblems:[form.value.concerns,hasConcerns.value?'Recorded':'']});
    const schedule=JSON.parse(JSON.stringify(form.value.schedule||{}));
    const preferences=props.listing.preferences||{};
    const unchangedUnsharedNotes=preferences.sharedSchedulingNotes==null&&String(schedule.notes||'')===String(preferences.schedule?.notes||'');
    if(unchangedUnsharedNotes||(preferences.scheduleNotesRestricted&&!schedule.notes))delete schedule.notes;
    await api.put(`/client-exchange/clients/${props.listing.clientId}/service-preferences`,{agencyId:props.listing.agencyId,...form.value,schedule});
    if(props.listing.id!==listingId)return;
    dirty=editVersion!==version;saved.value=!dirty;
    emit('saved');
  }catch(e){if(props.listing.id===listingId)error.value=e.response?.data?.error?.message||e.message;}finally{busy.value=false;}
}
</script>
<style scoped>
.essentials{margin:16px 0;border:1px solid #d8e4dc;border-radius:8px;padding:14px}summary{cursor:pointer;font-weight:600}form{display:grid;gap:14px;margin-top:12px}label{display:grid;gap:5px}input,select,textarea{font:inherit;padding:10px;width:100%;box-sizing:border-box}
</style>
