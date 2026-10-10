<template>
 <section class="security-setup" data-analytics-ignore>
  <h3>Prepare for your future app sign-in</h3>
  <p><strong>You can keep using Google SSO.</strong> This is preparation for a future change, not a request to stop using Google now. Save your password and optional passkey now. Keep using Google SSO until your account is switched to app-only access; this setup does not change that date. Store your password safely in your password manager. After the switch, password recovery uses your saved personal email—check it in Contact &amp; Address.</p>
  <template v-if="preview"><p class="notice">Security setup preview. Staff verify their own account, then set their credentials here. This preview cannot change anyone’s password or passkeys.</p><fieldset disabled><label>New app password<input type="password" placeholder="At least 14 characters" /></label><label>Confirm app password<input type="password" /></label><button>Save app password</button><label>Passkey name<input placeholder="My phone" /></label><button>Create passkey on my device</button></fieldset></template>
  <template v-else>
   <p><strong>1.</strong> If you use SSO, click “Verify with Google” and choose your work account. <strong>2.</strong> Return here; the password and passkey controls will load automatically. <strong>3.</strong> Choose “Set up a passkey” below to open your device’s Face ID, fingerprint, or security-key prompt. Google verification lasts five minutes.</p>
   <div class="actions"><button type="button" @click="verifyGoogle">Verify with Google</button><button type="button" @click="verifyLogin">I don’t use Google — sign in</button><button type="button" :disabled="checking" @click="refresh">{{ checking ? 'Checking sign-in…' : 'Check my verification again' }}</button></div>
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
const verified=ref(false),message=ref(''),revision=ref(0),checking=ref(false);let popup=null,awaitingVerification=false;
async function refresh(){
 if(props.preview||checking.value)return;
 checking.value=true;
 try{
  const {data}=await api.get('/users/me',{cookieAuthOnly:true,skipAuthRedirect:true,skipGlobalLoading:true});
  const user=data.user||data;verified.value=Number(user.id)===Number(props.userId);
  message.value=verified.value?'Your account is signed in. Use the password and passkey controls below. If asked to verify again, click Verify with Google.':'This browser is signed in to a different account. Click Verify with Google and choose the work account named on this Provider Update.';
  if(verified.value)awaitingVerification=false;
  revision.value++;
 }catch(e){verified.value=false;message.value=e.response?.status===401?'This update link opens your review, but does not verify your sign-in for password or passkey changes. Click Verify with Google first; checking again alone will not sign you in.':e.response?.data?.error?.message||'Could not check your sign-in. Try Verify with Google, then return here.';}
 finally{checking.value=false;}
}
function open(url){awaitingVerification=true;message.value='Complete sign-in in the new window, then return here. Your Google SSO access stays enabled.';popup=window.open(url,'provider-update-account-verification','popup,width=540,height=720');if(!popup)message.value='Allow the sign-in pop-up, then try again.';}
function verifyGoogle(){const base=String(api.defaults.baseURL||'/api').replace(/\/$/,'');open(`${base}/auth/google/start?orgSlug=${encodeURIComponent(props.agencySlug||'itsco')}&next=${encodeURIComponent('/provider-update-security-verified')}`);}
function verifyLogin(){open(`/${encodeURIComponent(props.agencySlug||'itsco')}/login?redirect=${encodeURIComponent('/provider-update-security-verified')}`);}
function receive(event){if(event.origin!==window.location.origin||event.source!==popup||event.data?.type!=='provider-update-account-verified')return;refresh();}
function onFocus(){if(awaitingVerification&&!props.preview)refresh();}
onMounted(()=>{window.addEventListener('message',receive);window.addEventListener('focus',onFocus);if(!props.preview)refresh();});
onBeforeUnmount(()=>{window.removeEventListener('message',receive);window.removeEventListener('focus',onFocus);});
</script>
<style scoped>.security-setup,fieldset,label{display:grid;gap:12px}fieldset{border:1px solid #ccd9d1;border-radius:12px;padding:18px}.actions{display:flex;flex-wrap:wrap;gap:10px}button,input{font:inherit;padding:10px;border:1px solid #aabfb3;border-radius:8px}input{max-width:460px}button{width:fit-content;cursor:pointer}.notice{background:#eef5f8;padding:12px;border-radius:8px}</style>
