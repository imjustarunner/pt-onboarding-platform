<template>
 <section class="security-setup" data-analytics-ignore>
  <template v-if="signIn?.retainsGoogle">
   <h3>Your sign-in stays the same</h3>
   <p v-if="usesGoogle">Keep using <strong>Sign in with Google</strong> with your work account. Your role will keep its Google account and Gmail access. You do not need to create an app password or a passkey for this update.</p>
   <p v-else>Your role will keep its Google account and Gmail access. Continue using your existing app sign-in. You do not need to create a new password or a passkey for this update.</p>
   <p>Complete the six-digit Quick View code step above, then save and continue.</p>
  </template>
  <template v-else-if="signIn?.showCredentialSetup">
   <h3>{{ signIn.transitionPlanned ? 'Prepare your app sign-in' : 'Your app sign-in' }}</h3>
   <p v-if="signIn.transitionPlanned">You currently sign in with Google using your work account. Prepare an app password for your upcoming change to app-only access. Keep using Google until you receive your changeover instructions. This setup does not turn off Google or Gmail. Check your personal recovery email in Contact &amp; Address.</p>
   <p v-else>You sign in directly to the app. If you already have a password, you can keep it. You do not need to create another one for this update.</p>
   <p v-if="signIn.passkeyEligible">A passkey is optional. After signing in below, choose “Set up a passkey” to open your device’s Face ID, fingerprint, or security-key prompt. Checking your sign-in alone does not create a passkey.</p>
   <template v-if="preview"><p class="notice">Preview only. Staff sign in to their own account before changing credentials.</p><fieldset disabled><label>New app password<input type="password" placeholder="At least 14 characters" /></label><button>Save app password</button><button v-if="signIn.passkeyEligible">Set up a passkey</button></fieldset></template>
   <template v-else>
    <p>{{ usesGoogle ? 'Choose your work Google account in the sign-in window, then return here. Verification for password or passkey setup lasts five minutes.' : 'Sign in to your own app account in the new window, then return here.' }}</p>
    <div class="actions">
     <button type="button" data-testid="verify-account" @click="usesGoogle ? verifyGoogle() : verifyLogin()">{{ usesGoogle ? 'Sign in with Google' : 'Sign in to the app' }}</button>
     <button type="button" data-testid="refresh-verification" :disabled="checking" @click="refresh">{{ checking ? 'Checking sign-in…' : 'Check my sign-in again' }}</button>
    </div>
    <p v-if="message" role="status">{{message}}</p>
    <template v-if="verified"><SignInPasswordSetup :expected-user-id="userId" :key="`password-${revision}`" /><PasskeysPanel v-if="signIn.passkeyEligible" :expected-user-id="userId" :key="`passkey-${revision}`" /></template>
   </template>
  </template>
  <p v-else>Continue using your usual sign-in. Your account’s sign-in instructions are unavailable right now; you can still save your progress and complete your Quick View code step.</p>
 </section>
</template>
<script setup>
import {ref,computed,onMounted,onBeforeUnmount} from 'vue';
import api from '../../services/api';
import SignInPasswordSetup from '../SignInPasswordSetup.vue';
import PasskeysPanel from '../PasskeysPanel.vue';
const props=defineProps({userId:[Number,String],agencySlug:String,preview:Boolean,signIn:Object});
const usesGoogle=computed(()=>props.signIn?.method==='google');
const verified=ref(false),message=ref(''),revision=ref(0),checking=ref(false);let popup=null,awaitingVerification=false;
async function refresh(){
 if(props.preview||!props.signIn?.showCredentialSetup||checking.value)return;
 checking.value=true;
 const action=usesGoogle.value?'Sign in with Google':'Sign in to the app';
 try{
  const {data}=await api.get('/users/me',{cookieAuthOnly:true,skipAuthRedirect:true,skipGlobalLoading:true});
  const user=data.user||data;verified.value=Number(user.id)===Number(props.userId);
  message.value=verified.value?`Your account is signed in. Use the controls below. If asked to verify again, choose “${action}.”`:`This browser is signed in to a different account. Choose “${action}” and use the account named on this Provider Update.`;
  if(verified.value)awaitingVerification=false;
  revision.value++;
 }catch(e){verified.value=false;message.value=e.response?.status===401?`Your invitation opens this update, but changing credentials requires a separate sign-in. Choose “${action}” first; checking again alone will not sign you in.`:e.response?.data?.error?.message||`Could not check your sign-in. Choose “${action},” then return here.`;}
 finally{checking.value=false;}
}
function open(url){awaitingVerification=true;message.value='Complete sign-in in the new window, then return here. Your current sign-in method stays the same.';popup=window.open(url,'provider-update-account-verification','popup,width=540,height=720');if(!popup)message.value='Allow the sign-in pop-up, then try again.';}
function verifyGoogle(){const base=String(api.defaults.baseURL||'/api').replace(/\/$/,'');open(`${base}/auth/google/start?orgSlug=${encodeURIComponent(props.agencySlug||'itsco')}&next=${encodeURIComponent('/provider-update-security-verified')}`);}
function verifyLogin(){open(`/${encodeURIComponent(props.agencySlug||'itsco')}/login?redirect=${encodeURIComponent('/provider-update-security-verified')}`);}
function receive(event){if(event.origin!==window.location.origin||event.source!==popup||event.data?.type!=='provider-update-account-verified')return;refresh();}
function onFocus(){if(awaitingVerification&&!props.preview)refresh();}
onMounted(()=>{window.addEventListener('message',receive);window.addEventListener('focus',onFocus);refresh();});
onBeforeUnmount(()=>{window.removeEventListener('message',receive);window.removeEventListener('focus',onFocus);});
</script>
<style scoped>.security-setup,fieldset,label{display:grid;gap:12px}fieldset{border:1px solid #ccd9d1;border-radius:12px;padding:18px}.actions{display:flex;flex-wrap:wrap;gap:10px}button,input{font:inherit;padding:10px;border:1px solid #aabfb3;border-radius:8px}input{max-width:460px}button{width:fit-content;cursor:pointer}.notice{background:#eef5f8;padding:12px;border-radius:8px}</style>
