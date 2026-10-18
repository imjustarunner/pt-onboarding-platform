<template><section class="clinical-texts"><h3>Agency client texts</h3><p v-if="error" class="error" role="alert">{{ error }}</p><label v-if="practices.length">Practice<select v-model="practiceId"><option v-for="p in practices" :key="p.id" :value="p.id">{{ p.name }}</option></select></label><ClientSmsInbox v-if="practiceId" :key="practiceId" :base="`/communications/client-texts/practices/${practiceId}`" :request="request" /><p v-else-if="!error">No linked AuricWell practice is available for this staff account.</p></section></template>
<script setup>
import {ref,onMounted} from 'vue';import api from '../../services/api';import ClientSmsInbox from './ClientSmsInbox.vue';
const practices=ref([]),practiceId=ref(''),error=ref('');
const request=async(path,options={})=>{try{return(await api.request({url:path,method:options.method||'GET',data:options.body})).data;}catch(e){throw new Error(e.response?.data?.error?.message||e.response?.data?.error||e.message);}};
onMounted(async()=>{try{practices.value=await request('/communications/client-texts/practices');practiceId.value=practices.value[0]?.id||'';}catch(e){error.value=e.message;}});
</script>
<style scoped>.clinical-texts{padding:20px;border:1px solid #cdded5;border-radius:16px;background:white;margin:20px 0}.clinical-texts select{padding:10px;border-radius:8px;margin-left:12px}.error{color:#9f2222}</style>
