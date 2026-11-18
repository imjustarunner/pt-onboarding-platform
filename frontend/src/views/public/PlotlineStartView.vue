<template>
 <PlotlineCompanyFrame class="pl-setup" context="Company owner setup · Create your Plotline workspace">
  <template #product-action><router-link to="/plotline/app">Your workspaces</router-link></template>
  <main class="pl-setup-grid">
   <section class="pl-company-card" aria-live="polite">
    <p class="pl-eyebrow">A little setup. A new beginning.</p>
    <h1 class="pl-company-title">{{editing?'Recognizably yours.':verifyMode?'Your next chapter starts here.':'Make room for your people.'}}</h1>
    <p v-if="!editing">30 days free when you create your company. No card required. No automatic charge.</p>
    <p v-if="error" class="pl-alert error" role="alert">{{error}}</p><p v-if="message" class="pl-alert" role="status">{{message}}</p>
    <details v-if="qaOnly && auth.isAuthenticated && emailVerified && !verifyMode"><summary>QA email delivery check</summary><p>Send one verification message to this QA account. Check actual receipt in the controlled inbox before continuing.</p><button type="button" :disabled="busy || cooldown>0" @click="requestEmail">{{cooldown>0?`Try again in ${cooldown}s`:'Send one Plotline verification email'}}</button></details>
    <p v-if="loading" role="status">Opening your setup…</p>
    <template v-else-if="verifyMode">
     <template v-if="verified"><h2>Email confirmed.</h2><p>Continue with your normal secure sign-in to create your company.</p><router-link class="pl-company-action" :to="login('/plotline/setup')">Sign in & continue</router-link></template>
     <form v-else-if="token" @submit.prevent="verify">
      <template v-if="passwordRequired"><p>Choose your account details. Your company’s name comes next.</p><label>First name<input v-model="account.firstName" required maxlength="100" autocomplete="given-name"></label><label>Last name<input v-model="account.lastName" required maxlength="100" autocomplete="family-name"></label><label>Choose a password<input v-model="account.password" type="password" minlength="12" maxlength="72" autocomplete="new-password" required><small>At least 12 characters. Use a unique password.</small></label></template>
      <button type="submit" class="primary" :disabled="busy">{{busy?'Confirming…':passwordRequired?'Create verified account':'Confirm my email'}}</button>
      <router-link v-if="existingAccount" :to="login('/plotline/verify')">Sign in to your existing account, then confirm here</router-link>
     </form>
     <template v-else><p>Open the personal link in your Plotline email. If it has expired, request a new one.</p><router-link to="/plotline/setup">Request a verification email</router-link></template>
    </template>
    <template v-else-if="available===false"><h2>Let’s help you get started.</h2><p>Self-service setup is being prepared. Request a walkthrough and we’ll help you find the right starting point.</p><router-link class="pl-company-action" to="/plotline/start">Request a walkthrough</router-link></template>
    <form v-else-if="!auth.isAuthenticated || !emailVerified" @submit.prevent="requestEmail">
     <h2>{{requested?'Check your email.':'Start with your email.'}}</h2><p>Confirm your email first. Then name your company and open your workspace.</p>
     <label>Email address<input v-model="account.email" type="email" autocomplete="email" maxlength="254" required :readonly="auth.isAuthenticated"></label>
     <label class="pl-trap" aria-hidden="true">Website<input v-model="account.website" tabindex="-1" autocomplete="off"></label>
     <button class="primary" :disabled="busy || cooldown>0">{{busy?'Requesting…':cooldown>0?`Try again in ${cooldown}s`:requested?'Resend verification':'Send verification email'}}</button>
     <p class="pl-muted">Your trial hasn’t started. Delivery problems won’t use your free days.</p>
     <router-link v-if="!auth.isAuthenticated" :to="login('/plotline/setup')">Already have an account? Sign in</router-link>
    </form>
    <template v-else-if="!draft"><h2>Your company workspace.</h2><p>Your account has reached its trial company limit. You can open a workspace below or request help adding another company.</p><div class="pl-actions"><router-link to="/plotline/app">Open workspaces</router-link><router-link to="/plotline/start">Request another company</router-link></div></template>
    <form v-else @submit.prevent="submit">
     <template v-if="!editing"><h2>What’s your business called?</h2><label>Business name<input v-model="form.name" required maxlength="160" autocomplete="organization" placeholder="For example, Juniper Consulting"></label><label>Business type<select v-model="form.industry"><option value="consulting">Consulting</option><option value="professional_services">Professional services</option><option value="technology">Technology</option><option value="other">Other</option></select></label><label>Timezone<select v-model="form.timezone"><option v-for="zone in timezones" :key="zone" :value="zone">{{zone}}</option></select></label></template>
     <details :open="editing || brandOpen" @toggle="brandOpen=$event.target.open"><summary>Make it yours <small>{{editing?'Company branding':'Optional · You can do this later'}}</small></summary>
      <label>Company logo<input type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="uploadLogo"><small>PNG, JPEG or WebP up to 5 MB. We’ll suggest colors; you decide what to keep.</small></label>
      <div class="pl-color-pair"><label>Primary<input v-model="form.brand.primary" type="color"><small>{{form.brand.primary}}</small></label><label>Accent<input v-model="form.brand.accent" type="color"><small>{{form.brand.accent}}</small></label></div>
      <fieldset><legend>Choose your style</legend><div class="pl-style-options"><button v-for="theme in plotlineThemes" :key="theme.id" type="button" :aria-pressed="form.brand.theme===theme.id" @click="form.brand.theme=theme.id"><strong>{{theme.name}}</strong><small>{{theme.description}}</small></button></div></fieldset>
      <label>Your mission<textarea v-model="form.brand.mission" maxlength="3000" rows="4" placeholder="What matters to your company?"></textarea></label>
      <button type="button" :disabled="busy || !form.brand.mission.trim()" @click="suggestCopy">Suggest a starting point</button><p class="pl-muted">Uses your words. Suggestions are editable and stay unpublished.</p>
      <label>Careers headline<input v-model="form.brand.headline" maxlength="180"></label><label>Introduction<textarea v-model="form.brand.introduction" maxlength="3000" rows="4"></textarea></label>
     </details>
     <template v-if="!editing"><label class="pl-check"><input v-model="authorized" type="checkbox" required><span>I’m authorized to create this company workspace.</span></label><label class="pl-check"><input v-model="acceptTerms" type="checkbox" required><span>I accept the <a href="https://plottwisthq.com/terms" target="_blank" rel="noopener noreferrer">platform terms</a> and have read the <a href="https://plottwisthq.com/privacypolicy" target="_blank" rel="noopener noreferrer">privacy policy</a>.</span></label><p class="pl-muted">Your careers page and jobs stay unpublished until you review and publish them.</p></template>
     <div class="pl-actions"><button class="primary" :disabled="busy">{{busy?'Saving…':editing?'Save company branding':'Create company & start 30 days free'}}</button><button v-if="!editing" type="button" :disabled="busy" @click="saveForLater">Save & finish later</button></div>
     <router-link v-if="editing" :to="`/plotline/company/${route.params.agencyId}`">Return to workspace</router-link>
    </form>
   </section>
   <PlotlineJourneyPreview v-if="draft" :name="form.name" :brand="form.brand" :logo="logoUrl" />
   <aside v-else class="pl-setup-intro"><p class="pl-eyebrow">Start small. Keep growing.</p><h2>Your company.<br>Your next chapter.</h2><ol><li><strong>Confirm your email.</strong><p>A personal link keeps company setup connected to you.</p></li><li><strong>Give your business a home.</strong><p>Enter its name and timezone. Branding is optional.</p></li><li><strong>Take one useful next step.</strong><p>Build your careers page, post a job or prepare onboarding.</p></li></ol><img src="/assets/plotline/website/brand/motifs/plotline-journey-line.svg" alt="" width="400"></aside>
  </main>
 </PlotlineCompanyFrame>
</template>
<script setup>
import {computed,onMounted,onBeforeUnmount,reactive,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useAuthStore} from '../../store/auth';
import api from '../../services/api';
import {enterPublicAuthForm} from '../../utils/publicAuthForm';
import {plotlineThemes,takePlotlineToken,clearPlotlineToken} from '../../utils/plotlineTheme';
import {setLoginRecoveryRecaptchaConfig,getLoginRecoveryCaptchaToken} from '../../utils/loginRecoveryRecaptcha';
import PlotlineCompanyFrame from '../../components/plotline/PlotlineCompanyFrame.vue';
import PlotlineJourneyPreview from '../../components/plotline/PlotlineJourneyPreview.vue';
const route=useRoute(),router=useRouter(),auth=useAuthStore();
const leaveAuth=enterPublicAuthForm();
const verifyMode=computed(()=>route.name==='PlotlineVerify'),editing=computed(()=>route.name==='PlotlineBrandSetup');
const token=ref(takePlotlineToken(route.hash));
if(token.value)window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
const account=reactive({email:'',firstName:'',lastName:'',password:'',website:''});
const form=reactive({name:'',industry:'other',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Denver',brand:{theme:'clarity',primary:'#205846',accent:'#DCAA73',mission:'',headline:'',introduction:''}});
const timezones=[...new Set([form.timezone,'America/Denver','America/New_York','America/Chicago','America/Los_Angeles','America/Phoenix','Europe/London','UTC'])];
const draft=ref(null),logoUrl=ref(''),loading=ref(true),busy=ref(false),available=ref(null),qaOnly=ref(false),emailVerified=ref(false),requested=ref(false),verified=ref(false),passwordRequired=ref(false),existingAccount=ref(false),authorized=ref(false),acceptTerms=ref(false),brandOpen=ref(false),error=ref(''),message=ref(''),cooldown=ref(0);
let timer,captchaSettings;
const config={headers:{'X-Plotline-Request':'1'},skipGlobalLoading:true,skipAuthRedirect:true};
const login=redirect=>({path:'/login',query:{redirect,product:'plotline'}});
async function run(fn){if(busy.value)return;busy.value=true;error.value='';message.value='';try{await fn();}catch(e){error.value=e.response?.data?.error?.message||e.message||'We couldn’t save that. Your entered details are still here.';}finally{busy.value=false;}}
function applyDraft(data){draft.value=data;Object.assign(form,{name:data.name,industry:data.industry,timezone:data.timezone,brand:{...data.brand}});if(!timezones.includes(data.timezone))timezones.push(data.timezone);}
async function loadLogo(){if(!draft.value?.hasLogo)return;const {data}=await api.get(`/plotline/drafts/${draft.value.id}/logo`,{...config,responseType:'blob'});if(logoUrl.value)URL.revokeObjectURL(logoUrl.value);logoUrl.value=URL.createObjectURL(data);}
async function load(){loading.value=true;try{
 const {data}=await api.get('/plotline/availability',config);available.value=data.enabled;qaOnly.value=data.qaOnly===true;captchaSettings=data.captcha;
 if(verifyMode.value)return;
 if(auth.isAuthenticated){const workspace=(await api.get('/plotline/workspace',config)).data;account.email=workspace.email;emailVerified.value=workspace.emailVerified;
  if(available.value&&emailVerified.value&&(editing.value||workspace.canCreateCompany)){applyDraft(editing.value?(await api.get(`/plotline/companies/${route.params.agencyId}/brand`,config)).data:(await api.post('/plotline/drafts',{},config)).data);await loadLogo();}
 }
}catch(e){error.value=e.response?.data?.error?.message||'We couldn’t open setup. Please refresh to retry.';}finally{loading.value=false;}}
function requestEmail(){return run(async()=>{let captchaToken='';if(!auth.isAuthenticated){setLoginRecoveryRecaptchaConfig(captchaSettings);captchaToken=await getLoginRecoveryCaptchaToken('plotline_signup');}const {data}=await api.post('/plotline/verification',{email:account.email,website:account.website,captchaToken},config);requested.value=true;message.value=data.message;cooldown.value=data.resendAfterSeconds||60;clearInterval(timer);timer=setInterval(()=>{cooldown.value=Math.max(0,cooldown.value-1);if(!cooldown.value)clearInterval(timer);},1000);});}
function verify(){return run(async()=>{const {data}=await api.post('/plotline/verify',{token:token.value,...(passwordRequired.value?{firstName:account.firstName,lastName:account.lastName,password:account.password}:{})},config);if(data.passwordRequired){passwordRequired.value=true;return;}if(data.existingAccount){existingAccount.value=true;message.value='Use your existing sign-in to confirm this email. Your password and account access are unchanged.';return;}verified.value=data.verified;account.password='';token.value='';clearPlotlineToken();if(data.verified&&auth.isAuthenticated)await router.push('/plotline/setup');});}
async function persist(){const {data}=await api.put(`/plotline/drafts/${draft.value.id}`,{...form,revision:draft.value.revision},config);applyDraft(data);}
function saveForLater(){return run(async()=>{await persist();message.value='Saved to your account. Return here whenever you’re ready. Your trial has not started.';});}
function uploadLogo(event){const file=event.target.files?.[0];if(!file)return;return run(async()=>{if(!editing.value)await persist();const body=new FormData();body.append('logo',file);body.append('revision',String(draft.value.revision));const endpoint=editing.value?`/plotline/companies/${route.params.agencyId}/logo`:`/plotline/drafts/${draft.value.id}/logo`;const {data}=await api.post(endpoint,body,config);const brand={...form.brand};applyDraft(data);form.brand=brand;if(data.suggestedColors?.primary)form.brand.primary=data.suggestedColors.primary;if(data.suggestedColors?.accent)form.brand.accent=data.suggestedColors.accent;await loadLogo();message.value='Logo saved. Review the suggested colors below.';}).finally(()=>{event.target.value='';});}
function suggestCopy(){return run(async()=>{const {data}=await api.post('/plotline/copy-suggestion',{mission:form.brand.mission},config);if(!form.brand.headline)form.brand.headline=data.headline;if(!form.brand.introduction)form.brand.introduction=data.introduction;message.value='Suggestions fill empty fields. Your edits are kept; review before publishing.';});}
function submit(){return run(async()=>{if(editing.value){const {data}=await api.put(`/plotline/companies/${route.params.agencyId}/brand`,{brand:form.brand,revision:draft.value.revision},config);applyDraft(data);message.value='Company branding saved across your people journey.';return;}await persist();const {data}=await api.post('/plotline/companies',{draftId:draft.value.id,revision:draft.value.revision,authorized:authorized.value,acceptTerms:acceptTerms.value},config);await router.push(`/plotline/company/${data.agencyId}`);});}
watch(()=>route.fullPath,load);onMounted(load);onBeforeUnmount(()=>{leaveAuth();clearInterval(timer);if(logoUrl.value)URL.revokeObjectURL(logoUrl.value);account.password='';});
</script>
<style scoped>
.pl-setup{min-height:100vh}.pl-setup-grid{max-width:1220px;margin:auto;padding:42px 24px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px;align-items:start}.pl-setup-grid>section:first-child{padding:30px}details{border-top:1px solid #dce3dd;border-bottom:1px solid #dce3dd;margin:24px 0;padding:18px 0}summary{cursor:pointer;font-weight:600}summary small{display:block;margin:6px 0;color:#536b5d}.pl-color-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}input[type=color]{height:40px;width:100%;border:1px solid #bacbbf;background:white}fieldset{margin:20px 0;border:0;padding:0}.pl-style-options{display:flex;gap:6px}.pl-style-options button{flex:1;min-width:0;padding:12px 8px;text-align:left;font-size:13px}.pl-style-options button[aria-pressed=true]{outline:2px solid #205846}.pl-style-options small{display:block;font-size:11px;margin-top:6px}.pl-trap{position:absolute;left:-10000px}.pl-setup-intro{padding:30px 12px}.pl-setup-intro h2{font-size:40px}.pl-setup-intro ol{padding-left:24px}.pl-setup-intro li{margin:24px 0}.pl-setup-intro img{max-width:100%}form>a{display:block;margin-top:18px}
@media(max-width:800px){.pl-setup-grid{grid-template-columns:1fr;padding:24px 16px;gap:28px}.pl-setup-grid>section:first-child{padding:24px}.pl-setup-intro{padding:12px}}
</style>
