<script setup>
import {mobileApi} from './transport.js';
import {familyDeviceContext} from './familyContext.js';
import {onBeforeUnmount,ref,watch} from 'vue';
import {useAuthStore} from '../store/auth.js';
import {useAgencyStore} from '../store/agency.js';
import SecureSessionCommentsHost from '../components/session-comments/SecureSessionCommentsHost.vue';
import FamilySharingNoticeHost from '../components/session-comments/FamilySharingNoticeHost.vue';
const props=defineProps({profile:Object,privateVisible:{type:Boolean,default:true}});const emit=defineEmits(['logout','account']);
const auth=useAuthStore(),agencies=useAgencyStore();
const secureScopeGeneration=ref(0);
watch(()=>[props.profile?.user?.id,props.profile?.workspace?.id],()=>{secureScopeGeneration.value++;},{immediate:true,flush:'sync'});
watch(()=>props.profile,profile=>{const user=profile.user;auth.user={id:user.id,role:user.role==='guardian'?'client_guardian':user.role,first_name:user.firstName,last_name:user.lastName,email:user.email};agencies.userAgencies=profile.agencies;agencies.currentAgency=profile.workspace;},{immediate:true});
let lastActivity=0;
async function activity(){if(Date.now()-lastActivity<30000)return;lastActivity=Date.now();const context=familyDeviceContext();if(!context)return;try{await mobileApi.post('/activity',{},{headers:{'X-Quick-View-Session':context.sessionToken}});}catch(error){if([401,423].includes(error.response?.status))context.onLocked?.();}}
const previousLogout=auth.logout;auth.logout=()=>emit('logout');
onBeforeUnmount(()=>{auth.logout=previousLogout;auth.user=null;agencies.currentAgency=null;agencies.userAgencies=[];});
</script>
<template><section class="mobile-family" @pointerdown="activity" @keydown="activity"><FamilySharingNoticeHost v-if="profile?.user?.id" :user-id="profile.user.id" :enabled="privateVisible" :scope-key="`${profile.workspace?.id || 0}:${secureScopeGeneration}`" /><SecureSessionCommentsHost v-if="profile?.user?.id" :user-id="profile.user.id" family :enabled="privateVisible" :scope-key="`${profile.workspace?.id || 0}:${secureScopeGeneration}`" /><nav class="family-device-tools"><button @click="emit('account')">App lock &amp; device settings</button></nav><RouterView/></section></template>
<style scoped>.mobile-family{min-height:100dvh;background:#f6f8fc;color:#173754;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}.family-device-tools{display:flex;justify-content:flex-end;padding:8px 16px}.family-device-tools button{font:inherit;font-size:12px;padding:9px 12px;border:1px solid #d0def0;border-radius:9px;color:#21578c;background:white}</style>
