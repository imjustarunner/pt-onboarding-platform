<template><PrivateVirtualOffice :request="request" /></template>
<script setup>
import api from '../../services/api';
const request=(path,{method='GET',body}={})=>api({url:`/my-room${path}`,method,data:body,skipAuthRedirect:true,skipGlobalLoading:true}).then(r=>r.data);
import PrivateVirtualOffice from '../meetings/PrivateVirtualOffice.vue';
</script>
