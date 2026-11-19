<template>
  <PlotlineReleaseStatus />
  <AccountSecurityNotice />
  <SessionLockScreen :is-locked="lock.isLocked" @unlock="unlocked" @logout="signOut" />
  <InactivityWarningModal :suppress-actions="lock.isLocked" />
</template>
<script setup>
import {onMounted,onBeforeUnmount,watch} from 'vue';
import {useAuthStore} from '../../store/auth';
import {useSessionLockStore} from '../../store/sessionLock';
import {startActivityTracking,stopActivityTracking,resetActivityTimer} from '../../utils/activityTracker';
import SessionLockScreen from '../SessionLockScreen.vue';
import InactivityWarningModal from '../InactivityWarningModal.vue';
import PlotlineReleaseStatus from './PlotlineReleaseStatus.vue';
import AccountSecurityNotice from '../AccountSecurityNotice.vue';
const auth=useAuthStore(),lock=useSessionLockStore();
let mounted=false;
function sync(){if(!mounted)return;if(auth.isAuthenticated)void startActivityTracking();else stopActivityTracking();}
function unlocked(){lock.unlock();lock.dismissWarning();resetActivityTimer();}
async function signOut(){stopActivityTracking({dismissWarning:false});await auth.logout('user_logout',{skipStatusPrompt:true,redirectTo:'/plotline/app'});}
onMounted(()=>{mounted=true;sync();});
watch(()=>[auth.isAuthenticated,auth.user?.id],sync,{flush:'post'});
onBeforeUnmount(()=>{mounted=false;stopActivityTracking();});
</script>
