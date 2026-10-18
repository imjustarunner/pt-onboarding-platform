<template><PrivateOfficeGuest product-name="AuricWell" :key="route.params.slug" :slug="String(route.params.slug)" :request="request" /></template>
<script setup>
import {useRoute} from 'vue-router';import {api} from './api';
import PrivateOfficeGuest from '../../frontend/src/components/meetings/PrivateOfficeGuest.vue';
const route=useRoute();const request=(url,options)=>api(url.replace('/my-room/','/office-public/'),options);
</script>
