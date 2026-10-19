<template>
  <main class="text-verification-page">
    <header class="verification-header"><RouterLink to="/"><img src="/auricwell-logo.png" alt="AuricWell" /></RouterLink><RouterLink to="/app">Back to sign in</RouterLink></header>
    <section class="verification-card" aria-labelledby="verification-heading">
      <span class="eyebrow">AuricWell account security</span>
      <h1 id="verification-heading">{{ recovery ? 'Recover your account by text' : 'Verification codes by text' }}</h1>
      <p class="intro">{{ recovery ? 'Request a code at the mobile number you already verified with AuricWell.' : 'Choose text messages as a way to verify your AuricWell account.' }}</p>
      <p class="scope">Only account verification codes. Your agency’s appointment and other service messages have separate preferences.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <p v-if="info && !info.available" class="availability" role="status">Text verification is awaiting activation. You can use an authenticator or email recovery now.</p>
      <p v-if="info?.stopped" class="error">Text messages are stopped for this mobile number. Reply START to the AuricWell verification number to restore texts.</p>
      <p v-if="loading" role="status">Loading account security…</p>
      <template v-else-if="info">
        <div v-if="complete" class="success" role="status"><h2>Mobile number verified</h2><p>You can now request a text code when signing in to AuricWell.</p><RouterLink to="/app" class="button">Continue to AuricWell</RouterLink></div>
        <form v-else-if="challenge" @submit.prevent="verify">
          <label for="verification-code">Six-digit code</label><input id="verification-code" v-model="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required />
          <p class="hint">Codes expire after 10 minutes and can be used only once.</p>
          <button :disabled="busy">{{ busy ? 'Checking…' : 'Verify code' }}</button>
          <button class="link-button" type="button" :disabled="busy || cooldown>0" @click="send">{{ cooldown>0 ? `Request another code in ${cooldown}s` : 'Request another code' }}</button>
        </form>
        <form v-else @submit.prevent="send">
          <label v-if="recovery" for="recovery-username">AuricWell username<input id="recovery-username" v-model="username" autocomplete="username" required maxlength="80" /></label>
          <template v-else>
            <label for="verification-phone">Mobile number <span v-if="!info.enrolled" class="optional">(optional)</span></label>
            <input id="verification-phone" v-model="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(719) 555-0123" :readonly="info.enrolled && !changeNumber" aria-describedby="phone-hint" />
            <p id="phone-hint" class="hint">{{ info.enrolled && !changeNumber ? 'Codes go to your verified mobile number.' : 'Use a US number that can receive text messages. You can choose an authenticator instead.' }}</p>
          </template>
          <label class="verification-consent" for="verification-consent">
            <input id="verification-consent" v-model="consent" type="checkbox" />
            <span>{{ info.consentText }} See <a :href="info.terms" target="_blank" rel="noopener">Terms</a> and <a :href="info.privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span>
          </label>
          <p v-if="!recovery && !signedIn" class="hint">Sign in to your AuricWell account before requesting a verification code.</p>
          <p v-if="!recovery && info.needsExistingFactor && (!info.enrolled || changeNumber)" class="hint">Verify your existing security method before changing your mobile number.</p>
          <button :disabled="busy || !consent || !info.available || (!recovery && !signedIn) || (!recovery && info.needsExistingFactor && (!info.enrolled || changeNumber))">{{ busy ? 'Requesting…' : 'Send verification code' }}</button>
          <RouterLink v-if="!recovery && (!signedIn || (info.needsExistingFactor && changeNumber))" class="secondary-link" to="/app?security=text">{{ signedIn ? 'Verify existing security method' : 'Sign in to set up text verification' }}</RouterLink>
          <RouterLink class="secondary-link" to="/app">Use an authenticator or email recovery</RouterLink>
        </form>
        <div v-if="signedIn && info.enrolled && !challenge && !complete" class="manage">
          <button v-if="!changeNumber" class="link-button" @click="changeNumber=true;consent=false;phone=''">Change mobile number</button>
          <button class="link-button" :disabled="busy || !info.verified" @click="disable">Turn off verification texts</button>
          <p v-if="!info.verified" class="hint">Verify your account before changing or turning off text verification.</p>
        </div>
      </template>
      <footer class="verification-help">Need help? <a href="mailto:Support@plottwistco.com">Support@plottwistco.com</a> · <a href="tel:+18337568894">833-756-8894</a></footer>
    </section>
  </main>
</template>
<script setup>
import {ref,computed,onMounted,onBeforeUnmount} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {api} from './api';
const route=useRoute(),router=useRouter(), recovery=computed(()=>route.query.mode==='recovery');
const info=ref(null),signedIn=ref(false),phone=ref(''),username=ref(''),consent=ref(false),loading=ref(true),busy=ref(false),error=ref(''),notice=ref(''),challenge=ref(''),code=ref(''),cooldown=ref(0),changeNumber=ref(false),complete=ref(false);
const timer=setInterval(()=>{if(cooldown.value>0)cooldown.value--;},1000);onBeforeUnmount(()=>clearInterval(timer));
async function load(){
  info.value=await api('/auth/text-verification');
  if(!recovery.value)try{const state=await api('/auth/sms');info.value={...info.value,...state};phone.value=state.phone||'';signedIn.value=true;}catch(e){if(e.status!==401)throw e;}
}
async function run(fn){busy.value=true;error.value='';try{await fn();}catch(e){error.value=e.message;}finally{busy.value=false;}}
const send=()=>run(async()=>{
  if(!consent.value)throw new Error('Select the consent box before requesting a code.');
  const data=await api(recovery.value?'/auth/sms/recovery':'/auth/sms/request',{method:'POST',body:{purpose:info.value.enrolled&&!changeNumber.value?'signin':'enroll',phone:phone.value,username:username.value,consent:consent.value,consentVersion:info.value.consentVersion}});
  challenge.value=data.challengeId;notice.value=data.message;code.value='';cooldown.value=60;
});
const verify=()=>run(async()=>{
  const data=await api(recovery.value?'/auth/sms/recovery/verify':'/auth/sms/verify',{method:'POST',body:{challengeId:challenge.value,code:code.value}});
  code.value='';challenge.value='';
  if(data.accountToken){router.replace(`/app#accountToken=${data.accountToken}`);return;}
  if(info.value.enrolled&&!changeNumber.value){router.replace('/app');return;}
  complete.value=true;notice.value='';
});
const disable=()=>run(async()=>{await api('/auth/sms',{method:'DELETE'});await load();consent.value=false;phone.value='';notice.value='Verification texts are turned off. You can use an authenticator or email recovery.';});
onMounted(async()=>{try{await load();}catch(e){error.value=e.message;}finally{loading.value=false;}});
</script>
<style scoped>
.text-verification-page{min-height:85vh;background:#f4f7fb;padding:28px 24px 48px}.verification-header{max-width:1040px;margin:0 auto 28px;display:flex;align-items:center;justify-content:space-between;gap:20px}.verification-header img{width:112px;height:auto}.verification-header a{font-size:14px;font-weight:600}.verification-card{max-width:660px;margin:auto;padding:36px 40px;background:white;border:1px solid #dce4ee;border-radius:20px;box-shadow:0 10px 32px #102b5008}.verification-card h1{font-size:30px;line-height:1.2;margin:12px 0 16px}.intro{font-size:17px;line-height:1.55}.scope,.hint{font-size:14px;line-height:1.55;color:#596b83}.scope{padding-bottom:18px;border-bottom:1px solid #e3eaf1}.availability{padding:14px 16px;border-radius:10px;background:#fff7e4;color:#695021;font-size:14px;line-height:1.5}.verification-card label{font-size:15px;font-weight:650}.optional{font-weight:400;color:#596b83}.verification-card input:not([type=checkbox]){display:block;width:100%;margin:8px 0;padding:13px 14px;font-size:17px}.verification-card .verification-consent{display:flex;flex-direction:row;align-items:flex-start;gap:14px;border:1px solid #dce4ee;border-radius:12px;padding:18px;margin:24px 0;cursor:pointer;font-weight:400;line-height:1.65}.verification-consent input{width:22px;height:22px;flex:0 0 22px;margin:3px 0;accent-color:#073b8c}.verification-consent a,.verification-help a{text-decoration:underline;text-underline-offset:3px}.verification-card form>button:not(.link-button){width:100%;min-height:48px;font-size:16px}.secondary-link{display:block;text-align:center;margin:18px 0;font-size:14px;font-weight:600}.verification-help{border-top:1px solid #e3eaf1;margin-top:26px;padding-top:20px;font-size:13px;line-height:1.8;color:#596b83}.manage{border-top:1px solid #e3eaf1;padding-top:10px}.success{background:#eef8f0;padding:20px;border-radius:12px}.verification-card button:disabled{opacity:.55;cursor:not-allowed}@media(max-width:600px){.text-verification-page{padding:20px 12px 32px}.verification-header{padding:0 8px}.verification-card{padding:26px 20px}.verification-card h1{font-size:26px}.verification-consent{padding:14px!important}}
</style>
