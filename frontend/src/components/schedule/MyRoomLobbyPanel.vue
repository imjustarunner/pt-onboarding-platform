<template><PrivateVirtualOffice :key="agencies.currentAgency?.id" :agency-id="Number(agencies.currentAgency?.id||0)" :request="request" /></template>
<script setup>
import {computed} from 'vue';
import api from '../../services/api';
import {useAgencyStore} from '../../store/agency';
const agencies=useAgencyStore();
const request=computed(()=>{const agencyId=agencies.currentAgency?.id;return (path,{method='GET',body}={})=>api({url:`/my-room${path}`,method,data:body,params:{agencyId},skipAuthRedirect:true,skipGlobalLoading:true}).then(r=>r.data);});
import PrivateVirtualOffice from '../meetings/PrivateVirtualOffice.vue';
</script>
