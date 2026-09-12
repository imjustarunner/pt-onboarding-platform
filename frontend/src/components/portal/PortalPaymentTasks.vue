<template><section class="portal-payment-tasks"><h2>Action items</h2><p v-if="loading" role="status">Loading your tasks…</p><p v-if="error" role="alert">{{ error }} <button @click="load">Retry</button></p><router-link v-for="task in tasks" :key="task.id" :to="{path:'/billing/complete',query:{task:task.id,agencyId}}"><PortalIcon name="tasks" /><span><strong>{{ task.title }}</strong><small>Verify your payment method and sign your authorization</small></span><span aria-hidden="true">→</span></router-link><p v-if="!loading && !error && !tasks.length">No pending payment setup tasks.</p></section></template>
<script setup>
import {ref,watch} from 'vue';import api from '../../services/api';import PortalIcon from './PortalIcon.vue';
const props=defineProps({agencyId:[Number,String],clientId:[Number,String]});const tasks=ref([]),loading=ref(false),error=ref('');let sequence=0;
async function load(){const request=++sequence;tasks.value=[];error.value='';loading.value=false;if(!props.agencyId)return;loading.value=true;try{const {data}=await api.get('/family-billing/tasks',{params:{agencyId:props.agencyId,clientId:props.clientId||undefined}});if(request===sequence)tasks.value=(data.tasks||[]).filter(t=>t.status==='pending');}catch{if(request===sequence)error.value='Your tasks could not be loaded.';}finally{if(request===sequence)loading.value=false;}}
watch(()=>[props.agencyId,props.clientId],load,{immediate:true});
</script>
<style scoped>
h2{font-size:18px;margin:0 0 16px}p{font-size:14px;color:#536984}a{display:flex;align-items:center;gap:12px;padding:16px 0;text-decoration:none;border-top:1px solid #e2eaf4;color:var(--portal-accent)}a svg{width:24px;height:24px;flex-shrink:0}a>span:nth-child(2){flex:1}strong{font-size:14px}small{display:block;font-size:12px;color:#5b6e89;margin-top:5px;line-height:1.5}button{background:white;color:var(--portal-accent);border:1px solid #dbe5f0;padding:6px 12px;border-radius:7px}
</style>
