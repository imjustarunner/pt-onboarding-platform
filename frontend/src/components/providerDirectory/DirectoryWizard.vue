<template>
 <div class="directory-wizard">
  <nav class="steps" aria-label="Profile setup"><button v-for="(label,i) in steps" :key="label" type="button" :class="{selected:step===i}" :aria-current="step===i?'step':undefined" @click="step=i"><span>{{ i+1 }}</span>{{ label }}</button></nav>
  <div class="wizard-layout"><form class="wizard-form" @submit.prevent="next">
   <p class="eyebrow">Step {{ step+1 }} of {{ steps.length }}</p><h2>{{ steps[step] }}</h2>
   <p v-if="notice" role="status">{{ notice }}</p><p v-if="error" class="error" role="alert">{{ error }}</p>
   <p v-if="member.reviewNote" class="review-note"><strong>Review feedback:</strong> {{ member.reviewNote }}</p>
   <template v-if="step===0"><p>Introduce yourself. Only fields marked public will appear in the directory.</p>
    <div class="form-grid"><label>Full professional name<input v-model="profile.name" autocomplete="name" maxlength="250" required /></label><label>Credentials<input v-model="profile.credentials" placeholder="e.g. LCSW, LPC, LMFT" maxlength="100" required /></label><label>Pronouns (optional)<input v-model="profile.pronouns" placeholder="e.g. she/her" maxlength="80" /></label><label>Practice / business name<input v-model="profile.practice" maxlength="250" /></label><label>Public contact email<input v-model="profile.publicEmail" type="email" maxlength="254" /></label><label>Public contact phone<input v-model="profile.publicPhone" type="tel" maxlength="40" /></label><label>Public website<input v-model="profile.website" type="url" placeholder="https://" /></label></div>
    <p>Your account email, {{ member.email }}, stays private unless you also enter it as your public contact email.</p>
    <label v-if="portal.heritageRequired">Your heritage (private)<select v-model="heritage"><option value="">Select your self-identified heritage</option><option v-for="h in HERITAGES" :key="h">{{ h }}</option></select></label>
    <p v-if="portal.heritageRequired">This directory is for providers who identify as Hispanic, Latino, Latina, Latinx or Latine. This answer is used for eligibility and is not shown publicly.</p>
    <DirectoryMultiSelect v-model="profile.languages" label="Languages offered in sessions" :options="LANGUAGES" custom />
   </template>
   <template v-else-if="step===1"><p>Add the states where you are licensed to provide care. License numbers and expiration dates are visible only to reviewers.</p>
    <fieldset v-for="(license,i) in profile.licenses" :key="i"><legend>License {{ i+1 }}</legend><div class="form-grid"><label>State / territory<select v-model="license.state" required><option value="">Choose state</option><option v-for="s in STATES" :key="s">{{ s }}</option></select></label><label>License type<input v-model="license.type" placeholder="e.g. LPC" required /></label><label>License number (private)<input v-model="license.number" required /></label><label>Expires (private)<input v-model="license.expires" type="date" required /></label></div><button type="button" @click="profile.licenses.splice(i,1)">Remove license</button></fieldset>
    <button type="button" @click="profile.licenses.push({state:'',type:'',number:'',expires:''})">+ Add license</button>
    <div class="checks"><label><input v-model="profile.virtual" type="checkbox" /> Virtual sessions in my licensed states</label><label><input v-model="profile.inPerson" type="checkbox" /> In-person sessions</label></div>
    <template v-if="profile.inPerson"><fieldset v-for="(location,i) in profile.locations" :key="i"><legend>Practice location {{ i+1 }}</legend><div class="form-grid"><label>City<input v-model="location.city" required /></label><label>State<select v-model="location.state" required><option value="">Choose state</option><option v-for="s in STATES" :key="s">{{ s }}</option></select></label><label>ZIP code<input v-model="location.zip" inputmode="numeric" maxlength="10" /></label></div><button type="button" @click="profile.locations.splice(i,1)">Remove location</button></fieldset><button type="button" @click="profile.locations.push({city:'',state:'',zip:''})">+ Add location</button></template>
   </template>
   <template v-else-if="step===2"><p>Keep what you help with, client ages, communities served and treatment approaches separate so people can find the right match.</p>
    <DirectoryMultiSelect v-model="profile.specialties" label="Specialties — what I help with" :options="SPECIALTIES" />
    <DirectoryMultiSelect v-model="profile.clientAges" label="Client ages — who I see by age" :options="CLIENT_AGES" />
    <DirectoryMultiSelect v-model="profile.populations" label="Populations served — communities and client types" :options="POPULATIONS" />
    <DirectoryMultiSelect v-model="profile.approaches" label="Therapy approaches — how I provide treatment" :options="THERAPY_APPROACHES" />
   </template>
   <template v-else-if="step===3"><DirectoryMultiSelect v-model="profile.insurance" label="Insurance & payment options" :options="INSURANCES" custom />
    <label>Session fees / sliding scale (public)<input v-model="profile.fee" placeholder="e.g. $120–$160; sliding scale available" maxlength="150" /></label>
    <label class="check"><input v-model="profile.acceptingClients" type="checkbox" /> I am accepting new clients</label>
    <label>Availability (public)<textarea v-model="profile.availability" maxlength="500" rows="3" placeholder="e.g. Weekday afternoons; contact me for current openings" /></label>
   </template>
   <template v-else-if="step===4"><label>Your professional biography (public)<textarea v-model="profile.bio" minlength="40" maxlength="6000" rows="9" placeholder="Tell visitors about your experience, approach and what working with you is like." required /></label>
    <label>Profile photo (optional)<input type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="photo" /></label><p>Choose a professional photo. PNG, JPEG or WebP, up to 5 MB. It will be publicly viewable when uploaded; do not include private information.</p>
   </template>
   <template v-else><p>Review the full public preview below. Your listing appears only after a tenant administrator approves it.</p>
    <p v-if="!member.verified" class="review-note">Verify your account email before submitting. <button type="button" @click="verify">Resend verification email</button><button type="button" @click="$emit('refresh')">I verified — refresh</button></p>
    <DirectoryProfile :profile="profile" detail />
    <label class="check consent"><input v-model="optIn" type="checkbox" /> I request inclusion in {{ portal.name }} and consent to publication of the profile and public contact information shown above. I confirm the information is accurate.</label>
    <p>Account email, heritage, license numbers and expiration dates are not displayed. Updates to published profiles require review.</p>
   </template>
   <div class="wizard-actions"><button type="button" :disabled="busy" @click="save">{{ busy?'Saving…':'Save draft' }}</button><button v-if="step>0" type="button" :disabled="busy" @click="step--">← Back</button><button class="primary" type="submit" :disabled="busy || member.status==='suspended'">{{ step===5?'Submit for review':'Save & continue →' }}</button></div>
  </form><aside><h3>Live profile preview</h3><p>This preview shows your unsaved edits.</p><DirectoryProfile :profile="profile" @open="step=5" /><div class="preview-note">Your progress stays in this account when you save. No hiring documents or employment steps are part of this process.</div></aside></div>
 </div>
</template>
<script setup>
import {ref,watch} from 'vue';import DirectoryMultiSelect from './DirectoryMultiSelect.vue';import DirectoryProfile from './DirectoryProfile.vue';
import {directoryRequest,STATES,HERITAGES,LANGUAGES,INSURANCES} from '../../services/providerDirectory';
import {SPECIALTIES,CLIENT_AGES,POPULATIONS,THERAPY_APPROACHES} from '../../constants/providerClinicalTaxonomy';
const props=defineProps({member:Object,portal:Object});const emit=defineEmits(['saved','submitted','refresh']);
const steps=['Basic information','Licenses & locations','Services & specialties','Insurance & availability','Biography & photo','Review & submit'];
const step=ref(0),busy=ref(false),error=ref(''),notice=ref(''),profile=ref({}),heritage=ref(''),optIn=ref(false),revision=ref(0);
watch(()=>props.member,m=>{profile.value=JSON.parse(JSON.stringify(m.profile));for(const key of ['licenses','locations','languages','specialties','clientAges','populations','approaches','insurance']) profile.value[key] ||= [];heritage.value=m.heritage;optIn.value=m.optIn;revision.value=m.revision;},{immediate:true});
async function save(){busy.value=true;error.value='';try{const m=await directoryRequest(props.portal.slug,'/me','put',{profile:profile.value,heritage:heritage.value,optIn:optIn.value,revision:revision.value});emit('saved',m);notice.value='Draft saved.';return true;}catch(e){error.value=e.response?.data?.error?.message||'Could not save. Your edits are still here.';return false;}finally{busy.value=false;}}
async function next(){if(!await save())return;if(step.value<5){step.value++;notice.value='';return;}busy.value=true;try{const m=await directoryRequest(props.portal.slug,'/me/submit','post',{});emit('submitted',m);}catch(e){error.value=e.response?.data?.error?.message||'Could not submit your profile.';}finally{busy.value=false;}}
async function verify(){try{const r=await directoryRequest(props.portal.slug,'/me/verify','post',{});notice.value=r.message;}catch(e){error.value=e.response?.data?.error?.message||'Could not send verification.';}}
async function photo(event){const file=event.target.files[0];if(!file)return;if(file.size>5*1024*1024){error.value='Choose a photo under 5 MB.';return;}if(!await save())return;busy.value=true;try{const data=new FormData();data.append('photo',file);emit('saved',await directoryRequest(props.portal.slug,'/me/photo','post',data));notice.value='Photo uploaded. Submit your changes for review when ready.';}catch(e){error.value=e.response?.data?.error?.message||'Photo upload failed.';}finally{busy.value=false;event.target.value='';}}
</script>
<style scoped>
.steps{display:flex;gap:8px;overflow:auto;padding:16px 0;margin-bottom:20px}.steps button{flex:1;min-width:130px;font-size:13px;display:grid;gap:8px;text-align:left}.steps span{font-size:18px}.steps .selected{background:#631957;color:white}.wizard-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:28px}.wizard-form{background:white;padding:32px;border-radius:18px;border:1px solid #e6dfe9;min-width:0}.wizard-form h2{margin-top:5px}.wizard-form>label{display:grid;gap:8px;margin:22px 0}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px}.form-grid label{display:grid;gap:7px}fieldset{border:1px solid #e6dfe9;border-radius:12px;padding:18px;margin:20px 0}.check,.checks label{display:flex!important;align-items:flex-start;gap:10px;margin:18px 0}.check input,.checks input{width:auto!important;margin-top:4px}.wizard-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;border-top:1px solid #eee;padding-top:24px;margin-top:28px}.preview-note,.review-note{background:#fff7db;border-radius:12px;padding:18px;margin-top:20px;line-height:1.6}.wizard-form p,aside p{line-height:1.6;color:#61566a}.directory-multi{margin:20px 0}.consent{font-weight:600}.eyebrow{text-transform:uppercase;font-size:12px;letter-spacing:.12em}.error{background:#fff0f0;padding:14px;color:#991b1b!important}
@media(max-width:900px){.wizard-layout{grid-template-columns:1fr}.wizard-layout aside{display:none}}@media(max-width:550px){.form-grid{grid-template-columns:1fr}.wizard-form{padding:20px}.wizard-actions button{flex:1}}
</style>
