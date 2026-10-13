<template><div class="office-page"><router-link class="office-back" :to="dashboardPath">← Back to my dashboard</router-link><PrivateVirtualOffice :key="agencies.currentAgency?.id" :request="request" :agency-id="Number(agencies.currentAgency?.id||0)" /></div></template>
<script setup>
import {computed} from 'vue';
import {useRoute} from 'vue-router';
import {registerClinicalWorkspace} from '../composables/useClinicalWorkspace';
const route=useRoute();
const dashboardPath=computed(()=>route.params.organizationSlug ? `/${route.params.organizationSlug}/dashboard` : '/dashboard');
registerClinicalWorkspace(computed(()=>true));
import api from '../services/api';
const request=computed(()=>{const agencyId=agencies.currentAgency?.id;return (path,{method='GET',body}={})=>api({url:`/my-room${path}`,method,data:body,params:{agencyId},skipAuthRedirect:true,skipGlobalLoading:true}).then(r=>r.data);});
import PrivateVirtualOffice from '../components/meetings/PrivateVirtualOffice.vue';
import { useAgencyStore } from '../store/agency';
const agencies=useAgencyStore();
</script>
<style scoped>.office-page{width:100%;min-width:0;background:#fff;min-height:100vh}.office-back{display:block;width:fit-content;margin:16px 24px 0;color:#677d93;font:12px system-ui;text-decoration:none}.office-back:hover{text-decoration:underline}</style>
