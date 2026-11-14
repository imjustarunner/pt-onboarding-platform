<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {useAuthStore} from '../../store/auth';
import api from '../../services/api';
import SchoolContactWorkflowCard from './SchoolContactWorkflowCard.vue';
const props=defineProps({agencyId:[Number,String],clientId:[Number,String]});
const auth=useAuthStore();
const context=computed(()=>{
 const role=String(auth.user?.role||'').toLowerCase();
 const careRole=['provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant'].includes(role)||[true,1,'1'].includes(auth.user?.has_provider_access);
 const agencyId=Number(props.agencyId),userId=Number(auth.user?.id);
 return careRole&&userId&&Number(props.clientId)>0&&[2,450].includes(agencyId)?`${userId}:${agencyId}`:'';
});
const eligible=ref('');let generation=0;
watch(context,async scope=>{const own=++generation;eligible.value='';if(!scope)return;try{
 // The descriptor owns rollout/cohort eligibility. The workflow endpoint then
 // checks the actor's actual assignment and exact selected client independently.
 const {data}=await api.get('/school-contact-plan',{params:{agencyId:Number(props.agencyId)},skipGlobalLoading:true});
 if(own===generation&&scope===context.value&&data?.eligible===true)eligible.value=scope;
}catch{/* An optional provider workflow never blocks the client overview. */}},{immediate:true});
onBeforeUnmount(()=>generation++);
</script>
<template><SchoolContactWorkflowCard v-if="context && eligible===context" :key="`${context}:${clientId}`" :agency-id="Number(agencyId)" :client-id="clientId" /></template>
