<template>
  <main class="po-contact">
    <header><a href="https://plotlinepo.com" rel="noreferrer"><img :src="plotlineLogo" alt="Plotline" width="150" /></a><span>A People Operations Platform</span></header>
    <section class="contact-card" aria-live="polite">
      <p v-if="loading" role="status">Opening Plotline Support…</p>
      <template v-else-if="meta">
        <div class="employer"><div><strong>{{ meta.productName }} Support</strong><span>Operated by {{ meta.operatorName }}</span></div></div>
        <template v-if="done">
          <p class="eyebrow">Message received</p><h1>Thank you for reaching out.</h1>
          <p>Your question is saved<span v-if="done.ticketId"> as ticket <strong>#{{ done.ticketId }}</strong></span> with the {{ meta.operatorName }} platform support team.</p>
          <p>The team can review your message in the app and reply to your email. You can close this window.</p>
        </template>
        <form v-else @submit.prevent="send">
          <p class="eyebrow">We’re here to help</p><h1>Contact Plotline Support</h1>
          <p>Get help using Plotline from the {{ meta.operatorName }} platform team. You don’t need an account. For hiring decisions or employment questions, reply to the hiring company’s email instead.</p>
          <details :open="!knownDetails" class="details"><summary>Your details{{ knownDetails ? ': '+form.name : '' }}</summary><label>Your name<input v-model="form.name" name="name" autocomplete="name" maxlength="120" required /></label><label>Email for a reply<input v-model="form.email" name="email" type="email" autocomplete="email" maxlength="254" required /></label></details>
          <label>Subject<input v-model="form.subject" name="subject" maxlength="140" minlength="3" required /></label>
          <label>How can we help?<textarea v-model="form.message" name="message" rows="6" minlength="10" maxlength="4000" required /></label>
          <p class="note">Keep reference answers in the questionnaire. Please don’t include passwords, Social Security numbers or payment card details here.</p>
          <label class="honeypot" aria-hidden="true">Website<input v-model="form.website" name="website" tabindex="-1" autocomplete="off" /></label>
          <p v-if="error" role="alert" class="error">{{ error }}</p>
          <button :disabled="sending" type="submit">{{ sending?'Sending…':'Send to Plotline Support' }}</button>
        </form>
      </template>
      <template v-else><h1>Contact link unavailable</h1><p role="alert">{{ error }}</p><p><a href="https://plotlinepo.com/support" rel="noreferrer">Start a new support request</a>.</p></template>
    </section>
    <footer><a href="https://plotlinepo.com" rel="noreferrer"><img :src="plotlineLogo" alt="Plotline" width="96" /></a><p>A People Operations Platform · Operated by PlotTwistCo</p><a href="https://plotlinepo.com/plotline/start" rel="noreferrer">Want to use Plotline for your organization?</a></footer>
  </main>
</template>
<script setup>
import {computed,ref,reactive,watch} from 'vue';
import '../../styles/brandTypography.css';
import {useRoute} from 'vue-router';
import api from '../../services/api';
import {plotlineSupportCaptcha} from '../../utils/plotlineSupportCaptcha';
const route=useRoute(),meta=ref(null),loading=ref(false),error=ref(''),sending=ref(false),done=ref(null),knownDetails=ref(false);
const plotlineLogo='/assets/plotline/website/brand/logos/plotline-primary-transparent.png';
const form=reactive({name:'',email:'',subject:'',message:'',website:''});
const endpoint=computed(()=>route.params.token?`/public/hiring/reference/${encodeURIComponent(route.params.token)}/support`:`/public/agency-support/plotline/platform`);
let generation=0,submissionKey;
watch(endpoint,async path=>{
  const current=++generation;loading.value=true;sending.value=false;meta.value=null;done.value=null;error.value='';knownDetails.value=false;submissionKey=crypto.randomUUID();Object.assign(form,{name:'',email:'',subject:'',message:'',website:''});
  try{const {data}=await api.get(path,{skipGlobalLoading:true});if(current!==generation)return;meta.value=data;form.name=data.contact?.name||'';form.email=data.contact?.email||'';form.subject=data.subject||'Help with Plotline';knownDetails.value=!!(form.name&&form.email);}
  catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'The contact form could not be opened. Please try again.';}
  finally{if(current===generation)loading.value=false;}
},{immediate:true});
async function send(){
  if(sending.value||!meta.value||done.value)return;
  const current=generation,path=endpoint.value,key=submissionKey;sending.value=true;error.value='';
  try{
    const captchaToken=meta.value.recaptchaRequired?await plotlineSupportCaptcha(meta.value.recaptchaSiteKey,meta.value.recaptchaUseEnterprise):'';
    if(current!==generation)return;
    const {data}=await api.post(path,{...form,submissionKey:key,captchaToken},{skipGlobalLoading:true});
    if(current===generation)done.value=data;
  }catch(e){if(current===generation)error.value=e.response?.data?.error?.message||e.message||'Your message could not be confirmed. Please try again; the same submission will not create a duplicate ticket.';}
  finally{if(current===generation)sending.value=false;}
}
</script>
<style scoped>
.po-contact{min-height:100vh;background:#f3f0e9;color:#203b33;font:16px/1.6 Montserrat,Arial,sans-serif;padding-bottom:28px}.po-contact header{display:flex;align-items:center;gap:24px;padding:20px 5%;background:white;border-bottom:1px solid #dce6e1}.po-contact header span{font-size:13px;color:#546c62}.po-contact img{display:block;height:auto;object-fit:contain}.contact-card{max-width:650px;margin:36px auto;padding:32px;background:white;border:1px solid #dce6e1;border-radius:16px}.employer{display:flex;align-items:center;gap:14px;border-bottom:1px solid #dce6e1;padding-bottom:20px;margin-bottom:24px}.employer img{width:48px;max-height:48px}.employer span{display:block;font-size:12px}.eyebrow{text-transform:uppercase;font-size:12px;font-weight:700;letter-spacing:.12em;color:#8b583e}h1{font-size:29px;line-height:1.25;color:#143e33}form,label{display:grid;gap:9px}form{gap:18px}input,textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b4c5b9;border-radius:8px;font:inherit;color:#203b33;background:white}.details{border:1px solid #dce6e1;border-radius:10px;padding:14px}.details summary{cursor:pointer}.details label{margin-top:12px}.note{font-size:13px;color:#546c62;margin:0}button{background:#143e33;color:white;padding:14px;border:0;border-radius:8px;font:inherit;font-weight:700;cursor:pointer}button:disabled{opacity:.6}.error{color:#9b2820}.honeypot{position:absolute;left:-10000px}footer{max-width:650px;margin:24px auto;padding:0 20px;text-align:center;font-size:12px;color:#546c62}footer img{margin:auto}a{color:#143e33}a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #b97350;outline-offset:4px}@media(max-width:700px){.contact-card{margin:20px 12px;padding:22px}.po-contact header{gap:15px;flex-wrap:wrap}h1{font-size:25px}}
</style>
