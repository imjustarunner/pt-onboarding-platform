<template>
 <section class="its-support-panel" aria-labelledby="its-support-heading">
  <p class="its-eyebrow">A real team. A little guidance.</p><h2 id="its-support-heading">How can we help?</h2>
  <p>Send a message to ITSCO’s support team. We’ll follow up using your email. For private care conversations, please use the <router-link to="/itsco/login">client portal</router-link>.</p>
  <form v-if="!sent" @submit.prevent="send">
   <div class="its-two"><label>Your name<input v-model.trim="form.name" autocomplete="name" required minlength="2" maxlength="120" /></label><label>Email address<input v-model.trim="form.email" autocomplete="email" type="email" required maxlength="255" /></label></div>
   <label>What can we help with?<select v-model="form.subject"><option>Getting started with ITSCO</option><option>School partnership</option><option>Finding a provider</option><option>Insurance and billing</option><option>Careers and our team</option><option>Website help</option></select></label>
   <label>Your message<textarea v-model.trim="form.message" required minlength="10" maxlength="4000" rows="5" placeholder="Tell us how we can help. Please leave out private medical details." /></label>
   <input v-model="form.website" class="its-honeypot" tabindex="-1" aria-hidden="true" autocomplete="off" />
   <p v-if="error" role="alert">{{ error }}</p><button class="its-button" type="submit" :disabled="busy">{{ busy ? 'Sending…' : 'Send to our support team' }} →</button>
  </form>
  <div v-else role="status" class="its-soft"><h3>Your message has been sent.</h3><p>Our team will follow up by email. Your reference is #{{ ticketId }}.</p><button class="its-button its-outline" @click="sent=false">Send another message</button></div>
  <p class="its-small">This inbox is not monitored for emergencies.</p>
 </section>
</template>
<script setup>
import {reactive,ref} from 'vue';
import api from '../../services/api';
const form=reactive({name:'',email:'',subject:'Getting started with ITSCO',message:'',website:''});
const busy=ref(false),error=ref(''),sent=ref(false),ticketId=ref(null);
async function send(){if(busy.value)return;busy.value=true;error.value='';try{
 const {data}=await api.post('/public/school-referral/itsco/support-tickets',{...form,sourceKey:'public_school_referral'},{skipAuthRedirect:true});
 if(!data.ok || !data.ticketId)throw new Error('Your message could not be confirmed. Please try again.');
 ticketId.value=data.ticketId;sent.value=true;form.message='';
}catch(e){error.value=e.response?.data?.error?.message||e.message||'Please try sending your message again.';}finally{busy.value=false;}}
</script>
<style scoped>
.its-support-panel{max-width:850px;margin:auto}.its-support-panel label{display:grid;gap:8px;margin-bottom:18px;font-weight:600}.its-honeypot{position:absolute;left:-10000px;width:1px;height:1px}.its-support-panel form{position:relative}.its-support-panel textarea{resize:vertical}
</style>
