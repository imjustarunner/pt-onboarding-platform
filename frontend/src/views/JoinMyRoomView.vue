<template><PrivateOfficeGuest :key="route.params.slug" :slug="String(route.params.slug)" :request="request" /></template>
<script setup>
import {useRoute} from 'vue-router';import api from '../services/api';
import PrivateOfficeGuest from '../components/meetings/PrivateOfficeGuest.vue';
const route=useRoute();
const request=(url,{method='GET',body,...options}={})=>api({url,method,data:body,...options}).then(r=>r.data);
</script>
