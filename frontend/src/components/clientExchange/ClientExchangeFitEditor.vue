<template>
  <section class="client-fit-editor">
    <button v-if="!editing" class="btn btn-secondary" type="button" @click="edit">Edit provider fit preferences</button>
    <template v-else>
      <p>Choose the client’s needs using the same categories providers review on their profiles. These choices are saved for future Exchange referrals. Posting a referral also lets you review them.</p>
      <ClientMatchingPreferences v-model="draft" :max-selections="0" expanded />
      <p v-if="error" role="alert">{{ error }}</p>
      <button class="btn btn-primary" type="button" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save provider fit preferences' }}</button>
      <button class="btn btn-secondary" type="button" :disabled="saving" @click="editing=false">Cancel</button>
    </template>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import ClientMatchingPreferences from '../public/ClientMatchingPreferences.vue';
const props=defineProps({clientId:Number,agencyId:Number,modelValue:Object});
const emit=defineEmits(['update:modelValue']);
const editing=ref(false),saving=ref(false),error=ref(''),draft=ref({});
watch(()=>[props.clientId,props.agencyId],()=>{editing.value=false;error.value='';});
function edit(){draft.value=JSON.parse(JSON.stringify(props.modelValue||{}));error.value='';editing.value=true;}
async function save(){
  const clientId=props.clientId,agencyId=props.agencyId;
  saving.value=true;error.value='';
  try{
    const {data}=await api.put(`/client-exchange/clients/${clientId}/matching-preferences`,{agencyId,matchingPreferences:draft.value});
    if(clientId===props.clientId&&agencyId===props.agencyId){emit('update:modelValue',data.matchingPreferences);editing.value=false;}
  }catch(e){if(clientId===props.clientId)error.value=e.response?.data?.error?.message||'Unable to save preferences';}
  finally{saving.value=false;}
}
</script>
