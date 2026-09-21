<template><aside v-if="stats" class="profile-stats" data-analytics-ignore aria-label="Provider profile statistics"><strong>{{stats.visitors}} unique visitors</strong><span>{{stats.clicks}} profile clicks · last {{stats.days}} days</span><small>Anonymous browsers, deduplicated across profile buttons. Signed-in staff visits are excluded.</small></aside></template>
<script setup>
import {ref,watch} from 'vue';
import {useAuthStore} from '../../store/auth';
import api from '../../services/api';
const props=defineProps({providerId:{type:Number,required:true}}),auth=useAuthStore(),stats=ref(null);
let version=0;
watch(()=>[auth.user?.id,props.providerId],async()=>{const n=++version;stats.value=null;if(!auth.user?.id)return;try{const {data}=await api.get(`/website-analytics/itsco/providers/${props.providerId}`,{skipGlobalLoading:true,skipAuthRedirect:true});if(n===version)stats.value=data;}catch{/* Counts are only visible to authorized agency staff. */}},{immediate:true});
</script>
<style scoped>.profile-stats{display:grid;gap:4px;padding:14px;background:#edf6f1;border:1px solid #c8ded3;border-radius:12px;margin:16px 0;font-size:13px}.profile-stats small{color:#597369;font-size:11px}</style>
