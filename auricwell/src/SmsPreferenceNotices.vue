<template><aside v-if="notices.length" aria-label="Text-message preferences"><p v-for="n in notices" :key="n.id" class="notice">{{ n.body }}</p></aside></template>
<script setup>
import {ref,onMounted} from 'vue';import {api} from './api';const props=defineProps({base:String});const notices=ref([]);onMounted(async()=>{try{notices.value=await api(`${props.base}/sms/notices`);}catch{/* Preferences remain available even if notices cannot load. */}});
</script>
