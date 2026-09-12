<template>
  <section id="business-intake" class="ptco-intake-section">
    <div v-if="inviteToken" class="ptco-form-card ptco-activation">
      <p class="ptco-eyebrow">Your next chapter</p><h2>Activate your workspace</h2>
      <p v-if="loading" role="status">Checking your invitation…</p>
      <template v-else-if="activated"><h3>Your company workspace is ready.</h3><p>Sign in with the email and password you just confirmed. Your company setup is next.</p><router-link class="ptco-button" :to="{path:activated.loginPath,query:{redirect:activated.setupPath}}">Sign in & set up my company →</router-link></template>
      <form v-else-if="invitation" @submit.prevent="activate">
        <p><strong>{{ invitation.businessName }}</strong><br>{{ invitation.email }}</p>
        <label>Create a password<input v-model="password" type="password" autocomplete="new-password" minlength="12" required><small>At least 12 characters. Use a unique password.</small></label>
        <label>Confirm password<input v-model="confirmation" type="password" autocomplete="new-password" minlength="12" required></label>
        <label class="ptco-checkbox"><input v-model="authorized" type="checkbox" required><span>I am authorized to administer this company workspace and manage access for its team.</span></label>
        <button class="ptco-button" :disabled="busy">{{ busy?'Creating workspace…':'Create my workspace →' }}</button>
      </form>
      <p v-if="error" class="ptco-error" role="alert">{{ error }}</p>
    </div>
    <div v-else class="ptco-intake-grid">
      <div class="ptco-form-card">
        <template v-if="submitted"><p class="ptco-eyebrow">Request received</p><h2>Your next chapter is underway.</h2><p>Our team will review your business needs and contact you at <strong>{{ form.email }}</strong>. If a new workspace is approved, you’ll receive an invitation to activate your account.</p><p class="ptco-reference">Reference: {{ submitted.id }}</p><p>No payment has been collected and no workspace has been created yet.</p><router-link class="ptco-button" to="/p/ptco/hq">Explore Plot Twist HQ →</router-link></template>
        <template v-else>
          <p class="ptco-eyebrow">Let’s get started</p><h2 ref="heading" tabindex="-1">{{ titles[step] }}</h2><p>Share a few details so we can understand your needs and create the best path forward.</p>
          <ol class="ptco-form-progress" aria-label="Business intake progress"><li v-for="(title,i) in ['Your business','Your needs','Review & send']" :key="title" :aria-current="step===i?'step':undefined"><span>{{ i+1 }}</span>{{ title }}</li></ol>
          <form @submit.prevent="next">
            <div v-if="step===0" class="ptco-fields">
              <label class="span-two">Business name<input v-model.trim="form.businessName" autocomplete="organization" maxlength="200" required></label>
              <label>First name<input v-model.trim="form.firstName" autocomplete="given-name" maxlength="100" required></label>
              <label>Last name<input v-model.trim="form.lastName" autocomplete="family-name" maxlength="100" required></label>
              <label>Email address<input v-model.trim="form.email" type="email" autocomplete="email" maxlength="254" required></label>
              <label>Phone number<input v-model.trim="form.phone" type="tel" autocomplete="tel" maxlength="40" required></label>
              <label>Business type<select v-model="form.businessType" required><option disabled value="">Select your business type</option><option v-for="item in ptcoIndustries" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
              <label>Current stage<select v-model="form.stage" required><option disabled value="">Select your stage</option><option value="idea">Exploring an idea</option><option value="launching">Preparing to launch</option><option value="established">Already established</option><option value="expanding">Growing or restructuring</option></select></label>
            </div>
            <template v-else-if="step===1">
              <label>Your starting point<select v-model="form.path" required><option v-for="item in ptcoPaths" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
              <fieldset><legend>Services you’re interested in <small>(select all that apply)</small></legend><div class="ptco-service-options"><label v-for="item in [...ptcoServices,{id:'hq',title:'Plot Twist HQ'}]" :key="item.id" class="ptco-checkbox"><input v-model="form.services" type="checkbox" :value="item.id"><span>{{ item.title }}</span></label></div></fieldset>
              <label>What would you like help with?<textarea v-model.trim="form.goals" maxlength="1000" rows="5" required placeholder="Share your goals, challenges, and the support you’re looking for."/><small>{{ form.goals.length }}/1000 · Please do not include client, patient, or payment information.</small></label>
            </template>
            <template v-else>
              <dl class="ptco-review"><dt>Business</dt><dd>{{ form.businessName }}</dd><dt>Contact</dt><dd>{{ form.firstName }} {{ form.lastName }}<br>{{ form.email }}<br>{{ form.phone }}</dd><dt>Support</dt><dd>{{ ptcoPaths.find(p=>p.id===form.path)?.title }}<br>{{ serviceNames || 'Let’s discuss the best fit' }}</dd><dt>Your goals</dt><dd>{{ form.goals }}</dd></dl>
              <label class="ptco-checkbox"><input v-model="form.consent" type="checkbox" required><span>I agree that Plot Twist Co. may contact me about this business request. I understand that submitting it does not create a contract or authorize charges.</span></label>
            </template>
            <div class="ptco-trap" aria-hidden="true"><label>Leave this field empty<input v-model="form.websiteTrap" tabindex="-1" autocomplete="off"></label></div>
            <p v-if="error" class="ptco-error" role="alert">{{ error }}</p>
            <div class="ptco-form-actions"><button v-if="step>0" type="button" class="ptco-button ptco-button-light" :disabled="busy" @click="move(step-1)">← Back</button><button class="ptco-button" :disabled="busy">{{ busy?'Submitting…':step===2?'Start my journey →':'Continue →' }}</button></div>
          </form>
        </template>
      </div>
      <aside class="ptco-form-card ptco-next"><p class="ptco-eyebrow">What happens next</p><h2>You’re in good hands.</h2><article v-for="item in nextSteps" :key="item.title"><PtcoIcon :name="item.icon"/><div><h3>{{ item.title }}</h3><p>{{ item.body }}</p></div></article><blockquote>Clarity starts here.<br>From vision to execution,<br>let’s make your next chapter possible.</blockquote></aside>
    </div>
  </section>
</template>
<script setup>
import {computed,nextTick,onMounted,reactive,ref,watch} from 'vue';
import api from '../../services/api';
import {ptcoIndustries,ptcoPaths,ptcoServices} from '../../constants/ptcoWebsite';
import PtcoIcon from './PtcoIcon.vue';
const props=defineProps({path:{type:String,default:'starting'},industry:{type:String,default:''},service:{type:String,default:''},preview:{type:Boolean,default:false}});
const step=ref(0),busy=ref(false),error=ref(''),submitted=ref(null),heading=ref(null);
const form=reactive({businessName:'',firstName:'',lastName:'',email:'',phone:'',businessType:'',stage:'',path:'starting',services:[],goals:'',consent:false,websiteTrap:''});
watch(()=>props.path,p=>{if(ptcoPaths.some(x=>x.id===p))form.path=p;},{immediate:true});
watch(()=>props.industry,p=>{if(ptcoIndustries.some(x=>x.id===p))form.businessType=p;},{immediate:true});
watch(()=>props.service,s=>{if([...ptcoServices,{id:'hq'}].some(x=>x.id===s)&&!form.services.includes(s))form.services.push(s);},{immediate:true});
const titles=['Tell us about your business','Choose the support you need','Let’s make sure it looks right'];
const serviceNames=computed(()=>[...ptcoServices,{id:'hq',title:'Plot Twist HQ'}].filter(s=>form.services.includes(s.id)).map(s=>s.title).join(', '));
let submissionId=crypto.randomUUID();
const move=async n=>{step.value=n;error.value='';await nextTick();heading.value?.focus();};
async function next(){if(step.value<2)return move(step.value+1);if(props.preview){error.value='This is an editor preview. Open the published page to submit a business request.';return;}busy.value=true;error.value='';try{const {data}=await api.post('/public/marketing-pages/ptco/business/requests',{...form},{headers:{'Idempotency-Key':submissionId},skipAuthRedirect:true});submitted.value=data;}catch(e){error.value=e.response?.data?.error?.message||'We could not confirm your request. Please try again.';}finally{busy.value=false;}}
// Keep activation secrets out of server URLs and browser persistence.
const inviteToken=ref(''),invitation=ref(null),password=ref(''),confirmation=ref(''),authorized=ref(false),activated=ref(null),loading=ref(false);
onMounted(async()=>{const token=new URLSearchParams(location.hash.slice(1)).get('invite');if(!token)return;inviteToken.value=token;history.replaceState(history.state,'',location.pathname+location.search);loading.value=true;try{invitation.value=(await api.post('/public/marketing-pages/ptco/business/invitation',{token},{skipAuthRedirect:true})).data;}catch(e){error.value=e.response?.data?.error?.message||'The invitation could not be checked. Open your invitation again to retry.';}finally{loading.value=false;}});
async function activate(){error.value='';if(password.value!==confirmation.value){error.value='The passwords do not match.';return;}busy.value=true;try{activated.value=(await api.post('/public/marketing-pages/ptco/business/activate',{token:inviteToken.value,password:password.value,authorized:authorized.value},{skipAuthRedirect:true})).data;password.value='';confirmation.value='';}catch(e){error.value=e.response?.data?.error?.message||'We could not create your workspace. Please try again.';}finally{busy.value=false;}}
const nextSteps=[{title:'We review your intake',body:'Our team reviews your information and identifies where we can help.',icon:'document'},{title:'We connect with you',body:'Discuss your goals, your team, and the support that fits your business.',icon:'calendar'},{title:'You receive a clear next step',body:'Agree on scope and responsibilities before work begins.',icon:'settings'},{title:'Launch your next chapter',body:'Approved workspace owners receive an invitation to activate their account and begin company setup.',icon:'rocket'}];
</script>
