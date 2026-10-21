<template><main class="office-entry"><img v-if="logo" :src="logo" :alt="brand" /><h1>Your virtual tutoring office</h1><p v-if="loading" role="status">Opening your tutor’s office…</p><template v-else><p role="alert">{{error}}</p><button type="button" @click="openOffice">Try again</button><router-link :to="backPath">Back to your portal</router-link></template></main></template>
<script setup>
import {ref,computed,onMounted} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useAgencyStore} from '../../store/agency';
import api from '../../services/api';
const route=useRoute(),router=useRouter(),agencies=useAgencyStore();
const loading=ref(true),error=ref('');
const brand=computed(()=>agencies.currentAgency?.name||'Tutoring');
const logo=computed(()=>agencies.currentAgency?.logo_url||'');
const backPath=computed(()=>route.params.organizationSlug?`/${route.params.organizationSlug}/guardian`:'/dashboard');
async function openOffice(){loading.value=true;error.value='';try{
 const id=Number(route.params.sessionId);if(!Number.isSafeInteger(id)||id<1)throw new Error('Open the tutoring link from your appointment.');
 const {data}=await api.get(`/learning-class-sessions/sessions/${id}`);
 if(!data.officeDestination)throw new Error('This appointment’s virtual office is not available. Check its status in your appointments or contact your tutor.');
 await router.replace(data.officeDestination);
 }catch(e){error.value=e.response?.data?.error?.message||e.message||'The office could not be opened.';}finally{loading.value=false;}}
onMounted(openOffice);
</script>
<style scoped>.office-entry{max-width:540px;margin:8vh auto;padding:32px;border:1px solid #dbe5ed;border-radius:20px;background:white;color:#193453;font-family:system-ui}.office-entry img{max-width:180px;max-height:80px}.office-entry h1{font-size:26px}.office-entry p{line-height:1.6}.office-entry button,.office-entry a{display:inline-block;margin:12px 16px 0 0;padding:10px 14px;border:1px solid #c5d5e4;border-radius:8px;color:#23537a;background:white}</style>
