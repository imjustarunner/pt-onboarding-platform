<template>
  <section class="pl-lead-form" aria-label="Request a Plotline conversation">
    <div v-if="submitted" class="pl-form-success" role="status" tabindex="-1" ref="success">
      <span class="pl-eyebrow">Request received</span><h2>Your next chapter is underway.</h2><p>Our team will review your request and follow up at <strong>{{ form.email }}</strong>.</p><p class="pl-reference">Reference: {{ submitted }}</p><p>No payment has been collected and no subscription has started.</p><router-link class="pl-button" to="/plottline/product">Explore the platform →</router-link>
    </div>
    <form v-else @submit.prevent="submit">
      <h2>Tell us a little about your team.</h2><p>We’ll help you find the right starting point.</p>
      <div class="pl-form-grid">
        <label class="pl-full">Organization name<input v-model.trim="form.businessName" autocomplete="organization" required maxlength="200"></label>
        <label>First name<input v-model.trim="form.firstName" autocomplete="given-name" required maxlength="100"></label>
        <label>Last name<input v-model.trim="form.lastName" autocomplete="family-name" required maxlength="100"></label>
        <label>Work email<input v-model.trim="form.email" type="email" autocomplete="email" required maxlength="254"></label>
        <label>Phone number<input v-model.trim="form.phone" type="tel" autocomplete="tel" required maxlength="40"></label>
        <label>Organization type<select v-model="form.businessType" required><option value="" disabled>Select your organization</option><option value="mental-health">Care or behavioral health</option><option value="consulting">Consulting</option><option value="coaching">Coaching</option><option value="tutoring">Education or tutoring</option><option value="other">Nonprofit or another organization</option></select></label>
        <label>Current stage<select v-model="form.stage" required><option value="established">Established</option><option value="expanding">Growing or restructuring</option><option value="launching">Preparing to launch</option><option value="idea">Exploring an idea</option></select></label>
        <label class="pl-full">What would you like to explore?<select v-model="interest"><option>Plotline walkthrough</option><option>Standalone plan</option><option>Connected plan</option><option>Suite plan</option><option>Multiple organizations</option></select></label>
        <label class="pl-full">What would make a difference for your team?<textarea aria-label="What would make a difference for your team?" v-model.trim="form.goals" required maxlength="750" rows="4" placeholder="Tell us about your team, your current process, and what you’d like to improve."/><small>Please leave out employee, applicant, patient, and payment details.</small></label>
      </div>
      <div class="pl-trap" aria-hidden="true"><label>Leave empty<input v-model="form.websiteTrap" tabindex="-1" autocomplete="off"></label></div>
      <label class="pl-consent"><input v-model="form.consent" type="checkbox" required><span>I agree that PlotTwistCo may contact me about this request. This does not create a contract or authorize charges. <a href="https://plottwisthq.com/privacypolicy" target="_blank" rel="noopener">Privacy policy</a></span></label>
      <p v-if="error" class="pl-form-error" role="alert">{{ error }}</p>
      <button class="pl-button" :disabled="busy">{{ busy ? 'Sending your request…' : 'Let’s talk about your team →' }}</button>
    </form>
  </section>
</template>
<script setup>
import { ref, reactive, nextTick } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
const plans = {standalone:'Standalone plan', connected:'Connected plan', suite:'Suite plan'};
const interest = ref(plans[route.query.plan] || 'Plotline walkthrough');
const form = reactive({businessName:'',firstName:'',lastName:'',email:'',phone:'',businessType:'',stage:'established',goals:'',consent:false,websiteTrap:''});
const busy=ref(false),error=ref(''),submitted=ref(''),success=ref(null);
let submissionKey='',lastPayload='';
async function submit() {
  if (busy.value) return;
  busy.value=true;error.value='';
  // The existing public business intake accepts "people". Keep compatibility
  // with the deployed backend while recording Plotline explicitly in the request.
  const payload=JSON.stringify({...form,path:'hq',services:['people'],goals:`Plotline website · ${interest.value}\n${form.goals}`});
  if (payload!==lastPayload) { submissionKey=crypto.randomUUID();lastPayload=payload; }
  try {
    const response=await fetch('/api/public/marketing-pages/ptco/business/requests',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','Idempotency-Key':submissionKey},body:payload});
    const data=await response.json();
    if (!response.ok || !data.id) throw new Error(data.error?.message || 'We could not confirm your request. Please try again.');
    submitted.value=data.id;await nextTick();success.value?.focus();
  } catch(e) { error.value=e instanceof TypeError ? 'We could not connect. Your request has not been confirmed. Please try again.' : e.message; }
  finally { busy.value=false; }
}
</script>
<style scoped>
.pl-lead-form{background:#fff;border:1px solid #e6e1d9;border-radius:24px;padding:36px}.pl-lead-form h2{font-size:25px;margin-top:0}.pl-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pl-full{grid-column:1/-1}.pl-lead-form label{font-size:13px;display:grid;gap:7px;font-weight:500}.pl-lead-form input:not([type=checkbox]),.pl-lead-form select,.pl-lead-form textarea{border:1px solid #c8cec6;border-radius:8px;padding:12px;width:100%;min-width:0;background:#fcfbf8;color:#0f2d24;font:inherit}.pl-lead-form small{font-size:11px;font-weight:400;color:#5c6760}.pl-lead-form .pl-consent{display:flex;align-items:flex-start;gap:10px;margin:24px 0;font-size:12px;font-weight:400}.pl-consent input{margin-top:4px}.pl-trap{position:absolute;left:-9999px}.pl-form-error{color:#9a3026!important}.pl-reference{font-size:12px;overflow-wrap:anywhere}.pl-lead-form button:disabled{opacity:.6;cursor:wait}@media(max-width:600px){.pl-form-grid{grid-template-columns:1fr}.pl-lead-form{padding:24px}}
</style>
