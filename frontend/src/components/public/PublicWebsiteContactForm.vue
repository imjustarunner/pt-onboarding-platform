<template>
 <section class="website-contact" :aria-label="internshipInquiry ? 'Contact Rachel about practicum or internship' : 'Contact our team'">
  <h2>{{title}}</h2><p v-if="internshipInquiry">Ask Rachel Finch about a practicum or internship placement. Your message goes directly to Rachel, who can reply to the email you provide.</p><p v-else>Send our support team a message. We’ll follow up by email or phone. Do not share protected health information here.</p>
  <p class="contact-small"><a href="/community-standards" target="_blank" rel="noopener">Community Standards &amp; communication privacy</a> apply to all communications.</p>
  <p v-if="fromChat" class="contact-small">Referred from Live Chat. Our support team will see that this inquiry came from your chat.</p>
  <p v-if="preview" role="status">Contact form preview. Messages are sent from the published website.</p>
  <form v-else-if="!sent" @submit.prevent="send">
   <div class="contact-fields"><label>Your name<input v-model.trim="form.name" autocomplete="name" required minlength="2" maxlength="120"/></label><label>Email address<input v-model.trim="form.email" type="email" autocomplete="email" :required="internshipInquiry || !form.phone" maxlength="255"/></label><label>Phone number<input v-model.trim="form.phone" type="tel" autocomplete="tel" :required="!internshipInquiry && !form.email" maxlength="40" minlength="7"/></label></div>
   <p class="contact-small">{{internshipInquiry ? 'Name, email, and message are required. Phone is optional. Include your academic program, preferred location, and placement term in your message.' : 'Enter an email address, a phone number, or both so we can respond.'}}</p>
   <p v-if="internshipInquiry"><strong>Subject:</strong> Practicum/Internship inquiry</p><label v-else>What can we help with?<select v-model="form.category" required><option disabled value="">Select a topic</option><option v-for="c in categories" :key="c.id" :value="c.id">{{c.label}}</option></select></label>
   <label>Your message<textarea v-model.trim="form.message" rows="5" required minlength="10" maxlength="4000"/></label>
   <input v-model="form.website" class="contact-honeypot" tabindex="-1" aria-hidden="true" autocomplete="off"/>
   <label class="contact-check"><input v-model="form.phiAcknowledged" type="checkbox" required/>I understand this is a website inquiry. I won’t include protected health information, Social Security numbers, or payment card details.</label>
   <p v-if="error" role="alert">{{error}}</p><button type="submit" :disabled="busy||!ready">{{busy?'Sending…':internshipInquiry?'Send to Rachel →':'Send to our support team →'}}</button>
  </form>
  <div v-else role="status"><h3>{{internshipInquiry ? 'Your inquiry has been received.' : 'Your message has been sent.'}}</h3><p>Your reference is #{{ticketId}}. {{internshipInquiry ? 'Your conversation is assigned to Rachel. She can reply to the email you provided.' : 'Our team will follow up using the contact information you provided.'}}</p><p v-if="internshipInquiry && emailDelivered === false">Your inquiry is saved in Rachel’s ticket desk, but the email notification could not be delivered. You do not need to submit it again.</p><button @click="sent=false">Send another message</button></div>
  <p class="contact-small">This inbox is not monitored for emergencies.</p>
 </section>
</template>
<script setup>
import {reactive,ref,onMounted} from 'vue';
import api from '../../services/api';
import {websiteCaptchaToken} from '../../utils/websiteCaptcha';
const preview = new URLSearchParams(window.location.search).get('marketingPreview') === '1' || window.self !== window.top;
const props=defineProps({agencySlug:{type:String,required:true},title:{type:String,default:'How can we help?'},initialMessage:{type:String,default:''},chatReferral:{type:String,default:''},internshipInquiry:{type:Boolean,default:false}});
const referralToken=props.chatReferral||new URLSearchParams(window.location.search).get('ref')||'';
const fromChat=ref(false);
const form=reactive({name:'',email:'',phone:'',category:'',message:props.initialMessage.slice(0,4000),website:'',phiAcknowledged:false});
const emailDelivered=ref(null);
const busy=ref(false),error=ref(''),sent=ref(false),ticketId=ref(null),ready=ref(false),categories=ref([]);let config={};
onMounted(async()=>{if(preview)return;try{const {data}=await api.get(`/public/agency-support/${props.agencySlug}`,{skipAuthRedirect:true,skipGlobalLoading:true});config=data;categories.value=data.categories||[];if(referralToken){try{const {data:referral}=await api.get(`/public/agency-support/${props.agencySlug}/chat-referral/${encodeURIComponent(referralToken)}`,{skipAuthRedirect:true,skipGlobalLoading:true});fromChat.value=!!referral.fromLiveChat;if(referral.category&&referral.categoryLabel){if(!categories.value.some(c=>c.id===referral.category))categories.value.push({id:referral.category,label:referral.categoryLabel});form.category=referral.category;}}catch{/* Expired referrals do not prevent an inquiry. */}}ready.value=true;}catch{error.value='The contact form is temporarily unavailable. Please try again shortly.';}});
async function send(){if(preview||busy.value||!ready.value)return;busy.value=true;error.value='';try{
 const captchaToken=await websiteCaptchaToken(config.recaptchaSiteKey,'public_agency_support',config.recaptchaRequired);
 const {data}=await api.post(props.internshipInquiry ? '/public/agency-support/itsco/internship-inquiries' : `/public/agency-support/${props.agencySlug}/tickets`,{...form,captchaToken,chatReferral:fromChat.value?referralToken:undefined},{skipAuthRedirect:true});
 if(!data.ok||!data.ticketId)throw new Error('Your message could not be confirmed. Please try again.');
 ticketId.value=data.ticketId;emailDelivered.value=data.emailDelivered;sent.value=true;form.message='';
}catch(e){error.value=e.response?.data?.error?.message||e.message||'Please try again.';}finally{busy.value=false;}}
</script>
<style scoped>
.website-contact{max-width:850px;margin:40px auto;padding:24px;color:inherit}.website-contact label{display:grid;gap:8px;margin-bottom:18px}.contact-fields{display:grid;grid-template-columns:1fr 1fr;gap:20px}.contact-fields>label:first-child{grid-column:1 / -1}.website-contact input,.website-contact select,.website-contact textarea{font:inherit;color:#172d36;background:#fff;border:1px solid #b5c8c5;border-radius:8px;padding:12px;width:100%;box-sizing:border-box}.website-contact .contact-check{display:flex;align-items:flex-start;font-size:14px}.contact-check input{width:20px;height:20px;flex:0 0 20px;margin-top:4px}.website-contact button{font:inherit;background:#16564b;color:#fff;border:0;border-radius:8px;padding:12px 22px;cursor:pointer}.website-contact button:disabled{opacity:.6;cursor:wait}.contact-honeypot{position:absolute;left:-10000px!important;width:1px!important;height:1px!important}.contact-small{font-size:13px}.website-contact textarea{resize:vertical}@media(max-width:600px){.contact-fields{grid-template-columns:1fr}}
</style>
