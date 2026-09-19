<template>
 <section class="provider-services" aria-label="Services offered">
  <h3>Services offered</h3>
  <p v-if="agencyName">Select every service this provider offers at <strong>{{agencyName}}</strong>. You can choose more than one.</p>
  <p v-if="loading" role="status">Loading services…</p>
  <template v-else-if="loaded">
   <fieldset :disabled="busy"><legend>Services for this agency</legend>
    <label v-for="service in services" :key="service.serviceType"><input type="checkbox" v-model="selected" :value="service.serviceType"/> {{service.displayName}}</label>
   </fieldset>
   <p v-if="!services.length">This agency has no public services enabled yet.</p>
   <p>Selected services place the provider in the matching public directories when “Sees clients” is on. New-client availability is managed separately. Selecting a service does not enable online booking; removing one also turns off its online booking.</p>
   <button v-if="services.length" type="button" :disabled="busy" @click="save">{{busy?'Saving…':'Save services'}}</button>
  </template>
  <p v-if="error" role="alert">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
 </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({providerId:{type:Number,required:true},agencyId:{type:Number,required:true}}),emit=defineEmits(['updated']);
const services=ref([]),selected=ref([]),agencyName=ref(''),loading=ref(false),loaded=ref(false),busy=ref(false),error=ref(''),notice=ref('');
let generation=0;
const endpoint=()=>`/availability/providers/${props.providerId}/services`;
function apply(data){services.value=data.services||[];selected.value=services.value.filter(s=>s.offered).map(s=>s.serviceType);agencyName.value=data.agencyName||'';}
watch(()=>[props.providerId,props.agencyId],async()=>{const id=++generation;loaded.value=false;error.value='';notice.value='';if(!props.providerId||!props.agencyId)return;loading.value=true;try{const{data}=await api.get(endpoint(),{params:{agencyId:props.agencyId},skipGlobalLoading:true});if(id===generation){apply(data);loaded.value=true;}}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Could not load services.';}finally{if(id===generation)loading.value=false;}},{immediate:true});
async function save(){const id=generation;busy.value=true;error.value='';notice.value='';try{const{data}=await api.put(endpoint(),{agencyId:props.agencyId,services:[...selected.value]},{skipGlobalLoading:true});if(id!==generation)return;apply(data);notice.value='Services saved for this agency.';emit('updated',data);}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Could not save services.';}finally{busy.value=false;}}
</script>
<style scoped>
.provider-services{margin:18px 0;padding:20px;border:1px solid #c3d5ce;border-radius:12px;background:#fff;color:#203e36}.provider-services h3{font-size:21px;color:inherit}.provider-services p{line-height:1.5}.provider-services fieldset{border:0;padding:0;display:grid;gap:12px}.provider-services legend{font-weight:600;margin-bottom:12px}.provider-services label{display:flex;align-items:center;gap:10px}.provider-services input{width:20px;height:20px}.provider-services button{padding:10px 14px;border:1px solid #53796b;border-radius:6px;background:#f0f7f4;color:#173d30;font:inherit;cursor:pointer}
</style>
