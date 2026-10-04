<template><PrivateVirtualOffice :key="agencies.currentAgency?.id" :request="request" :agency-id="Number(agencies.currentAgency?.id||0)" /></template>
<script setup>
import {computed} from 'vue';
import api from '../services/api';
const request=computed(()=>{const agencyId=agencies.currentAgency?.id;return (path,{method='GET',body}={})=>api({url:`/my-room${path}`,method,data:body,params:{agencyId},skipAuthRedirect:true,skipGlobalLoading:true}).then(r=>r.data);});
import PrivateVirtualOffice from '../components/meetings/PrivateVirtualOffice.vue';
import { useAgencyStore } from '../store/agency';
const agencies=useAgencyStore();
</script>
