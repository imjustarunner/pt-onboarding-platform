<template>
 <section class="security-setup" data-analytics-ignore>
  <h3>Prepare your app sign-in</h3>
  <p>Save your password and optional passkey now. Keep using Google SSO until your account is switched to app-only access; this setup does not change that date. Store your password safely in your password manager. After the switch, password recovery uses your saved personal email—check it in Contact &amp; Address.</p>
  <template v-if="preview"><p class="notice">Security setup preview. Staff verify their own account, then set their credentials here. This preview cannot change anyone’s password or passkeys.</p><fieldset disabled><label>New app password<input type="password" placeholder="At least 14 characters" /></label><label>Confirm app password<input type="password" /></label><button>Save app password</button><label>Passkey name<input placeholder="My phone" /></label><button>Create passkey on my device</button></fieldset></template>
  <template v-else>
   <p>Verify your own account in the sign-in window, then return here to set your password and passkey. For Google accounts, setup requires verification within the last five minutes.</p>
   <div class="actions"><button type="button" @click="verifyGoogle">Verify with Google</button><button type="button" @click="verifyLogin">Use app sign-in</button><button type="button" @click="refresh">I’ve verified — load setup here</button></div>
   <p v-if="message" role="status">{{message}}</p>
   <template v-if="verified"><SignInPasswordSetup :expected-user-id="userId" :key="`password-${revision}`" /><PasskeysPanel :expected-user-id="userId" :key="`passkey-${revision}`" /></template>
  </template>
 </section>
</template>
<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import api from '../../services/api';
import SignInPasswordSetup from '../SignInPasswordSetup.vue';
import PasskeysPanel from '../PasskeysPanel.vue';
const props=defineProps({userId:[Number,String],agencySlug:String,preview:Boolean});
const verified=ref(false),message=ref(''),revision=ref(0);let popup=null;
async function refresh(){if(props.preview)return;try{const {data}=await api.get('/users/me',{skipAuthRedirect:true,skipGlobalLoading:true});const user=data.user||data;verified.value=Number(user.id)===Number(props.userId);message.value=verified.value?'Account verified. Complete your setup below.':'Sign in to the account named on this Provider Update to set its credentials.';revision.value++;}catch{verified.value=false;message.value='Verify your account first, then load setup here.';}}
function open(url){popup=window.open(url,'provider-update-account-verification','popup,width=540,height=720');if(!popup)message.value='Allow the sign-in pop-up, then try again.';}
function verifyGoogle(){const base=String(api.defaults.baseURL||'/api').replace(/\/$/,'');open(`${base}/auth/google/start?orgSlug=${encodeURIComponent(props.agencySlug||'')}&next=${encodeURIComponent('/provider-update-security-verified')}`);}
function verifyLogin(){open(`/${encodeURIComponent(props.agencySlug||'itsco')}/login?redirect=${encodeURIComponent('/provider-update-security-verified')}`);}
function receive(event){if(event.origin!==window.location.origin||event.source!==popup||event.data?.type!=='provider-update-account-verified')return;refresh();}
onMounted(()=>{window.addEventListener('message',receive);if(!props.preview)refresh();});
onBeforeUnmount(()=>window.removeEventListener('message',receive));
</script>
<style scoped>.security-setup,fieldset,label{display:grid;gap:12px}fieldset{border:1px solid #ccd9d1;border-radius:12px;padding:18px}.actions{display:flex;flex-wrap:wrap;gap:10px}button,input{font:inherit;padding:10px;border:1px solid #aabfb3;border-radius:8px}input{max-width:460px}button{width:fit-content;cursor:pointer}.notice{background:#eef5f8;padding:12px;border-radius:8px}</style>
