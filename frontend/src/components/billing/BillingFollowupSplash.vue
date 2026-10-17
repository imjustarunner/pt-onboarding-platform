<template><InsuranceEmailReview v-if="task" :task="task" @done="handled" /><div v-if="notice" class="billing-notice" role="status">{{notice}} <button @click="notice=''" aria-label="Dismiss billing update">×</button></div></template>
<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import api from '../../services/api';
import InsuranceEmailReview from './InsuranceEmailReview.vue';
const task=ref(null),notice=ref('');let disposed=false,loading=false,timer,after=0,noticeTimer;
async function load(){if(disposed||loading||task.value||document.visibilityState==='hidden'||document.querySelector('[aria-modal="true"]'))return;loading=true;try{const {data}=await api.get('/family-billing/insurance-cards/review-queue',{params:{after},skipGlobalLoading:true});if(disposed)return;task.value=(data.rows||[]).find(t=>t.reminderDue)||null;after=data.nextAfter||0;}catch{/* Manual task access remains in Billing Workspace; retry on focus. */}finally{loading=false;}}
function handled(result){task.value=null;after=0;notice.value=result.status==='sent'?'Reviewed email sent.':result.snoozedUntil?`Your reminder is snoozed until ${new Date(result.snoozedUntil).toLocaleString()}.`:'';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.value='';},8000);}
onMounted(()=>{load();timer=setInterval(load,60000);window.addEventListener('focus',load);});
onBeforeUnmount(()=>{disposed=true;task.value=null;clearInterval(timer);clearTimeout(noticeTimer);window.removeEventListener('focus',load);});
</script>
<style scoped>.billing-notice{position:fixed;bottom:24px;right:24px;z-index:18000;max-width:340px;background:#fff;color:#193354;box-shadow:0 4px 24px #0002;border:1px solid #cfdded;border-radius:12px;padding:16px}.billing-notice button{background:none;border:0;cursor:pointer;font-size:20px;color:inherit}</style>
