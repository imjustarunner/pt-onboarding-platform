<template><PrivateVirtualOffice :request="request" :agency-id="Number(agencies.currentAgency?.id||0)" /></template>
<script setup>
import api from '../services/api';
const request=(path,{method='GET',body}={})=>api({url:`/my-room${path}`,method,data:body,params:{agencyId:agencies.currentAgency?.id},skipAuthRedirect:true,skipGlobalLoading:true}).then(r=>r.data);
import PrivateVirtualOffice from '../components/meetings/PrivateVirtualOffice.vue';
import { useAgencyStore } from '../store/agency';
const agencies=useAgencyStore();
</script>
