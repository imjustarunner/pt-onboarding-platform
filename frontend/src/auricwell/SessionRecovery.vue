<template><main class="aw-welcome"><h1>Unlock AuricWell</h1><p>Your practice page will reopen after you unlock.</p><p v-if="loading" role="status">Checking your session…</p><form v-else-if="policy" @submit.prevent="resume"><label v-if="policy.pinRequired">Session passcode<input v-model="pin" type="password" inputmode="numeric" autocomplete="off" autofocus></label><button class="aw-button" :disabled="busy || (policy.pinRequired && !pin)">{{ busy?'Unlocking…':'Unlock and return' }}</button></form><p v-if="error" role="alert">{{error}}</p><button v-if="!policy && !loading" type="button" @click="load">Try again</button><p><a :href="loginUrl">Sign in again</a></p></main></template>
<script setup>
import {ref,onMounted} from 'vue';
import api from '../services/api';
defineProps({loginUrl:String});const emit=defineEmits(['resumed']);
const policy=ref(null),loading=ref(true),busy=ref(false),pin=ref(''),error=ref('');
async function load(){loading.value=true;error.value='';try{const {data}=await api.get('/auth/session-lock-config');policy.value=data;}catch(e){error.value=e.response?.data?.error?.message||'Session check failed. Try again or sign in.';}finally{loading.value=false;}}
async function resume(){busy.value=true;error.value='';try{await api.post('/auth/session-activity',{action:'resume',...(policy.value.pinRequired?{pin:pin.value}:{})});pin.value='';emit('resumed');}catch(e){error.value=e.response?.data?.error?.message||'Unable to unlock. Try again or sign in.';pin.value='';}finally{busy.value=false;}}
onMounted(load);
</script>
