<template><div :inert="locked||undefined" :aria-hidden="locked?'true':undefined"><slot/></div><SessionLockScreen :is-locked="lock.isLocked" @unlock="unlock" @logout="logout"/><InactivityWarningModal :suppress-actions="lock.isLocked"/></template>
<script setup>
import {computed,onMounted} from 'vue';
import {useAuthStore} from '../../store/auth';
import {useSessionLockStore} from '../../store/sessionLock';
import {startActivityTracking,resetActivityTimer} from '../../utils/activityTracker';
import SessionLockScreen from '../SessionLockScreen.vue';
import InactivityWarningModal from '../InactivityWarningModal.vue';
const auth=useAuthStore(),lock=useSessionLockStore(),locked=computed(()=>lock.isLocked||lock.warningActive);
function unlock(){lock.unlock();lock.dismissWarning();resetActivityTimer();}
function logout(){auth.logout('user_logout');}
onMounted(()=>{if(auth.isAuthenticated)startActivityTracking();});
</script>
