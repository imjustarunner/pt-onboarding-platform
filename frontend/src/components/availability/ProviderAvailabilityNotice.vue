<template><aside v-if="reminders.length" class="opening-notice" aria-label="Availability reminders"><div v-for="r in reminders" :key="`${r.agencyId}-${r.format}`"><span>{{r.agencyName}}: no {{r.format==='IN_PERSON'?'in-person':'virtual'}} new-client openings published.</span> <router-link :to="{path:`/admin/users/${r.providerId}`,query:{agencyId:r.agencyId,section:'public-profile'}}">Review availability</router-link> <button type="button" :disabled="busy" @click="snooze(r)">Snooze 7 days</button></div><p v-if="error" role="alert">{{error}}</p></aside></template>
<script setup>
import {ref,onMounted,onUnmounted} from 'vue';
import api from '../../services/api';
const reminders=ref([]),busy=ref(false),error=ref('');let timer,active=true;
async function load(){try{const{data}=await api.get('/availability/me/opening-reminders',{skipGlobalLoading:true,skipAuthRedirect:true});if(active)reminders.value=data.reminders||[];}catch{/* Preserve the app if availability checks are temporarily unavailable. */}}
async function snooze(r){busy.value=true;error.value='';try{await api.post(`/availability/providers/${r.providerId}/public-settings/snooze`,{agencyId:r.agencyId,format:r.format},{skipGlobalLoading:true});await load();}catch{error.value='Could not snooze this reminder. Please try again.';}finally{busy.value=false;}}
onMounted(()=>{load();timer=setInterval(load,60000);window.addEventListener('focus',load);});onUnmounted(()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);});
</script>
<style scoped>.opening-notice{padding:12px 20px;background:#fff5d9;color:#493910;border:1px solid #dec478}.opening-notice>div{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:6px 0}.opening-notice a{color:#365b35;text-decoration:underline}.opening-notice button{border:1px solid #947e40;border-radius:5px;background:white;color:#493910;padding:6px 10px}</style>
