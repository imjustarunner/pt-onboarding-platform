<template>
 <section v-if="state?.eligible" class="passkeys security-card" data-analytics-ignore>
  <h2>Passkeys</h2><p v-if="state.ssoSetup">You can prepare a passkey now. Keep using Google while your agency requires SSO; the passkey becomes a sign-in option after your agency enables app-only access.</p>
  <p>Sign in with Face ID, a fingerprint, your device PIN, or a security key. Your biometric information stays with your device.</p>
  <p>Save passkeys on a personal device or your own security key. Use the same portal address when signing in; a passkey saved for another portal address will not appear here.</p>
  <p v-if="!supported">Passkey setup needs a supported browser on a secure portal address. Your usual sign-in is still available.</p>
  <p v-if="error" role="alert" class="error">{{error}}</p><p v-if="message" role="status">{{message}}</p>
  <template v-if="supported">
   <button v-if="state.enabled && !state.ssoSetup" :disabled="busy" @click="verify">Verify with an existing passkey</button>
   <form @submit.prevent="register">
    <label>Passkey name<input v-model="label" maxlength="100" placeholder="My phone" required /></label>
    <label v-if="!state.recentlyVerified">Confirm your account password<input v-model="password" type="password" autocomplete="current-password" /></label>
    <p v-if="!state.recentlyVerified" class="hint">If you already protect your account with a passkey or authenticator, verify it first. A Google sign-in within the last five minutes also authorizes setup. An email link by itself cannot authorize setup.</p>
    <button :disabled="busy">{{busy?'Waiting for your device…':state.keys.length?'Add another passkey':'Set up a passkey'}}</button>
   </form>
  </template>
  <div v-if="recoveryCodes.length" class="recovery" role="status">
   <h3>Save your recovery codes now</h3>
   <p>These codes are shown only once. Keep them somewhere private, separate from your device. With your account password, one code lets you replace lost passkeys.</p>
   <ul><li v-for="code in recoveryCodes" :key="code"><code>{{code}}</code></li></ul>
   <button @click="saveCodes">Download recovery codes</button> <button @click="recoveryCodes=[]">I saved my codes</button>
  </div>
  <ul class="keys"><li v-for="key in state.keys" :key="key.id"><strong>{{key.label}}</strong><span>{{key.rp_id}} · {{key.last_used_at?`Last used ${date(key.last_used_at)}`:'Not used yet'}}</span><button :disabled="busy" @click="removeTarget=key">Remove</button></li></ul>
  <div v-if="removeTarget" role="region" aria-label="Confirm passkey removal"><p>Remove {{removeTarget.label}}? Sessions opened with this passkey will end.</p><button :disabled="busy" @click="remove">Confirm removal</button> <button @click="removeTarget=null">Cancel</button></div>
  <details v-if="state.enabled">
   <summary>Lost access to your passkeys?</summary>
   <p>Sign in with your account password, then enter it here with an unused passkey recovery code. Recovery removes all existing passkeys and ends other sessions. You can then add a replacement.</p>
   <p>If you set up an authenticator, you can also verify it in the section below and add a replacement using your password. If you have neither, contact support for identity verification.</p>
   <form @submit.prevent="recover"><label>Account password<input v-model="recoveryPassword" type="password" autocomplete="current-password" required /></label><label>Unused passkey recovery code<input v-model="recoveryCode" autocomplete="off" maxlength="80" required /></label>
    <label class="check"><input v-model="confirmRecovery" type="checkbox" required /> Remove lost passkeys and end other sessions</label>
    <button :disabled="busy || !confirmRecovery">Recover access</button>
   </form>
   <p>{{state.recoveryCodesRemaining}} unused recovery codes remain.</p>
  </details>
 </section>
 <p v-else-if="error" role="alert">{{error}}</p>
</template>
<script setup>
import {onMounted,onBeforeUnmount,ref} from 'vue';
import {browserSupportsWebAuthn,startRegistration,startAuthentication} from '@simplewebauthn/browser';
import api from '../services/api';import {passkeyError} from '../utils/passkeys';
const emit=defineEmits(['changed']);const supported=browserSupportsWebAuthn()&&window.isSecureContext;
const state=ref(null),busy=ref(false),error=ref(''),message=ref(''),label=ref('My passkey'),password=ref(''),recoveryCodes=ref([]),removeTarget=ref(null),recoveryPassword=ref(''),recoveryCode=ref(''),confirmRecovery=ref(false);
const options={headers:{'X-Account-Security':'1'}},base='/account-security/passkeys';
const date=value=>new Date(value).toLocaleDateString();
async function load(){state.value=(await api.get(base)).data;}
async function changed(){await load();emit('changed');window.dispatchEvent(new Event('account-security-changed'));}
async function run(work){busy.value=true;error.value='';message.value='';try{await work();}catch(e){error.value=passkeyError(e);}finally{busy.value=false;password.value='';recoveryPassword.value='';recoveryCode.value='';}}
async function register(){await run(async()=>{const {data}=await api.post(`${base}/register/options`,{password:password.value,label:label.value},options);password.value='';const response=await startRegistration({optionsJSON:data.options});const result=await api.post(`${base}/register/verify`,{challengeId:data.challengeId,response},options);recoveryCodes.value=result.data.recoveryCodes||[];message.value='Passkey saved. You can use it the next time you sign in.';await changed();});}
async function verify(){await run(async()=>{const {data}=await api.post(`${base}/verify/options`,{},options);const response=await startAuthentication({optionsJSON:data.options});await api.post(`${base}/verify/finish`,{challengeId:data.challengeId,response},options);message.value='Your sign-in is verified.';await changed();});}
async function remove(){await run(async()=>{await api.delete(`${base}/${removeTarget.value.id}`,{...options,data:{password:password.value}});removeTarget.value=null;message.value='Passkey removed.';await changed();});}
async function recover(){await run(async()=>{await api.post(`${base}/recover`,{password:recoveryPassword.value,code:recoveryCode.value},options);confirmRecovery.value=false;message.value='Lost passkeys have been removed. Add a replacement now.';await changed();});}
function saveCodes(){const url=URL.createObjectURL(new Blob([`Portal passkey recovery codes — keep private\n${location.hostname}\nEach code works once, together with your account password.\n\n${recoveryCodes.value.join('\n')}\n`],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='portal-passkey-recovery-codes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
onMounted(()=>run(load));onBeforeUnmount(()=>{password.value='';recoveryPassword.value='';recoveryCode.value='';recoveryCodes.value=[];});
</script>
<style scoped>
.passkeys{padding:1.25rem;border:1px solid var(--border,#cbd5e1);border-radius:10px;margin:1rem 0;background:var(--bg-primary,white)}label{display:grid;gap:.4rem;margin:1rem 0;max-width:420px}input,button{font:inherit;padding:.65rem;border:1px solid var(--border,#aaa);border-radius:6px}button{cursor:pointer;margin:.25rem 0;min-height:44px;color:inherit;background:var(--bg-secondary,#f1f5f9)}button:disabled{opacity:.6;cursor:default}.check{display:flex;align-items:flex-start}.error{color:#a52a1d}.hint{font-size:.9rem}.keys{padding-left:1.2rem}.keys li{margin:1rem 0}.keys span{display:block;overflow-wrap:anywhere}.recovery{border:2px solid #175c43;padding:1rem;border-radius:8px}.recovery code{overflow-wrap:anywhere}summary{cursor:pointer;font-weight:600}h2{font-size:1.2rem}
</style>
