<template>
 <div v-if="supported" class="passkey-sign-in" data-analytics-ignore>
  <button type="button" class="btn btn-secondary" :disabled="busy || disabled" @click="signIn">{{busy?'Waiting for your device…':'Sign in with a passkey'}}</button>
  <p v-if="error" role="alert">{{error}}</p>
 </div>
</template>
<script setup>
import {ref} from 'vue';
import {browserSupportsWebAuthn,startAuthentication} from '@simplewebauthn/browser';
import api from '../services/api';
import {passkeyError} from '../utils/passkeys';
defineProps({disabled:Boolean});const emit=defineEmits(['signed-in']);
const supported=browserSupportsWebAuthn() && window.isSecureContext;
const busy=ref(false),error=ref('');
async function signIn(){busy.value=true;error.value='';try{
 const config={headers:{'X-Account-Security':'1'}};
 const {data}=await api.post('/auth/passkeys/options',{},config);
 const response=await startAuthentication({optionsJSON:data.options});
 const result=await api.post('/auth/passkeys/verify',{challengeId:data.challengeId,response},config);
 emit('signed-in',result.data);
}catch(e){error.value=passkeyError(e);}finally{busy.value=false;}}
</script>
<style scoped>
.passkey-sign-in{margin:1rem 0}.passkey-sign-in button{width:100%;min-height:44px}.passkey-sign-in p{font-size:.9rem;color:var(--text-primary,#222)}
</style>
