<template>
 <div class="kimi-consultation">
  <div v-if="submitted" role="status"><h3>Your request has been received.</h3><p>Kimi will review the requested time and contact you with confirmation. No paid package has been purchased.</p><router-link to="/p/kimi">Return to Kimi’s website →</router-link></div>
  <template v-else>
   <ol class="consult-steps" aria-label="Consultation request steps"><li v-for="(label,i) in ['Your info','Choose a time','Confirm']" :key="label" :aria-current="step===i+1?'step':undefined"><span>{{i+1}}</span>{{label}}</li></ol>
   <form v-if="step===1" @submit.prevent="next">
    <label>Full name<input v-model.trim="form.name" required autocomplete="name" maxlength="120"/></label>
    <label>Email address<input v-model.trim="form.email" required type="email" autocomplete="email" maxlength="255"/></label>
    <label>Phone number (optional)<input v-model.trim="form.phone" type="tel" autocomplete="tel" maxlength="40"/></label>
    <label>What are you interested in?<select v-model="interest"><option value="coaching">Life coaching</option><option value="counseling">Counseling through Next Level Up</option><option value="tutoring">Tutoring through Next Level Up</option><option value="unsure">Not sure — discuss coaching options</option></select></label>
    <div v-if="['counseling','tutoring'].includes(interest)" class="consult-note"><p>{{interest==='counseling'?'Counseling and psychotherapy':'Tutoring and learning services'}} with Kimi are provided through Next Level Up. Continue there for the appropriate intake. Details entered here will not be sent to NLU.</p><router-link :to="interest==='counseling'?'/join/nlu/counseling?source=kimi':'/join/nlu/learning?program=tutoring&source=kimi'">Continue to Next Level Up →</router-link></div>
    <template v-else>
     <label>Package interest<select v-model="form.packageId"><option value="">Help me choose / no preference</option><option v-for="p in packages" :key="p.id" :value="String(p.id)">{{p.name}}</option></select></label>
     <label>What would you like to focus on? (optional)<textarea v-model.trim="form.goals" rows="3" maxlength="2000" placeholder="A goal, transition, or next step you’d like to discuss."/></label>
     <label>Preferred format<select v-model="format"><option value="VIRTUAL">Video consultation</option><option value="PHONE">Phone consultation request</option><option value="IN_PERSON">In-person consultation request</option></select></label>
     <p class="consult-note">Video appointments use published openings. For phone or in-person preferences, send a request so Kimi can confirm arrangements.</p>
     <label class="consult-check"><input v-model="form.adult" type="checkbox" required/><span>I am 18 or older and understand that this is life coaching, not mental-health treatment.</span></label>
     <label class="consult-check"><input v-model="form.contactConsent" type="checkbox" required/><span>Kimi may contact me about this request. I have read the <router-link to="/p/kimi/privacy" target="_blank">privacy information</router-link>. This is not marketing consent.</span></label>
     <button v-if="format==='VIRTUAL'" class="consult-button" type="submit">Continue to Choose a Time →</button><a v-else class="consult-button" href="/intake/kimi-coaching-inquiry">Request a {{format==='PHONE'?'Phone':'Local'}} Consultation →</a>
    </template>
   </form>
   <div v-if="step===2">
    <h3>Choose a requested time</h3><p>Times are shown in America/Denver. Kimi confirms appointment requests before you attend.</p><label>Week starting<input v-model="weekStart" type="date" :min="today" @change="loadSlots"/></label>
    <p v-if="busy" role="status">Looking for openings…</p><p v-else-if="error" role="alert">{{error}}</p>
    <div v-else-if="slots.length" class="consult-slots"><button v-for="slot in slots" :key="slot.startAt" class="consult-slot" :aria-pressed="selected?.startAt===slot.startAt" @click="selected=slot">{{formatTime(slot.startAt)}}</button></div>
    <div v-else class="consult-note"><p>No published consultation times are available for this week. You can check another week or send your preferred times to Kimi.</p><a href="/intake/kimi-coaching-inquiry">Send a consultation request →</a></div>
    <div class="consult-actions"><button class="consult-back" @click="step=1">← Your info</button><button v-if="error" class="consult-back" @click="loadSlots">Retry</button><button class="consult-button" :disabled="!selected||busy" @click="step=3">Review Request →</button></div>
   </div>
   <div v-if="step===3"><h3>Review your request</h3><dl><dt>Name</dt><dd>{{form.name}}</dd><dt>Email</dt><dd>{{form.email}}</dd><dt>Requested video consultation</dt><dd>{{formatTime(selected?.startAt)}} · 30 minutes · Free</dd><template v-if="selectedPackage"><dt>Package to discuss</dt><dd>{{selectedPackage.name}}</dd></template></dl><p>This requests a free consultation. It does not purchase a package or guarantee an appointment.</p><p v-if="error" role="alert">{{error}}</p><div class="consult-actions"><button class="consult-back" :disabled="busy" @click="step=2">← Choose a time</button><button class="consult-button" :disabled="busy" @click="submit">{{busy?'Sending…':'Send Consultation Request →'}}</button></div></div>
  </template>
 </div>
</template>
<script setup>
import {computed,ref} from 'vue';
import {useRoute} from 'vue-router';
import api from '../../services/api';
const props=defineProps({packages:{type:Array,default:()=>[]}}),route=useRoute();
const step=ref(1),submitted=ref(false),busy=ref(false),error=ref(''),interest=ref('coaching'),format=ref('VIRTUAL');
const form=ref({name:'',email:'',phone:'',goals:'',packageId:String(route.query.package||''),adult:false,contactConsent:false});
const selectedPackage=computed(()=>props.packages.find(p=>String(p.id)===form.value.packageId));
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const weekStart=ref(today),slots=ref([]),selected=ref(null);
const formatTime=v=>v?new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(v)):'';
async function next(){if(!form.value.adult||!form.value.contactConsent||!['coaching','unsure'].includes(interest.value))return;step.value=2;await loadSlots();}
let requestVersion=0;
async function loadSlots(){const version=++requestVersion;selected.value=null;busy.value=true;error.value='';try{
 const{data}=await api.get('/public/agency-services/kimi/providers/532/slots',{params:{weekStart:weekStart.value,bookingMode:'NEW_CLIENT',programType:'VIRTUAL',serviceType:'coaching'},skipAuthRedirect:true,skipGlobalLoading:true});
 if(version!==requestVersion)return;
 slots.value=(data.slots||[]).filter(s=>new Date(s.startAt).getTime()>Date.now()&&new Date(s.endAt)-new Date(s.startAt)===30*60000);
}catch{if(version===requestVersion){slots.value=[];error.value='We couldn’t load consultation openings. Please retry or use the contact page to send a request.';}}finally{if(version===requestVersion)busy.value=false;}}
async function submit(){if(busy.value||!selected.value||!form.value.adult||!form.value.contactConsent)return;busy.value=true;error.value='';try{
 const [first,...last]=form.value.name.split(/\s+/);
 await api.post('/public/agency-services/kimi/requests',{serviceType:'coaching',providerId:532,modality:'VIRTUAL',bookingMode:'NEW_CLIENT',programType:'VIRTUAL',startAt:selected.value.startAt,endAt:selected.value.endAt,name:form.value.name,email:form.value.email,phone:form.value.phone||null,clientFullName:form.value.name,guardianFirstName:first,guardianLastName:last.join(' ')||null,guardianEmail:form.value.email,guardianPhone:form.value.phone||null,guardianRelationship:'Self / Contact',notes:['Free 30-minute coaching consultation. Adult confirmed. Contact consent acknowledged; privacy information reviewed.',selectedPackage.value?'Package interest: '+selectedPackage.value.name:'',form.value.goals].filter(Boolean).join('\n')},{skipAuthRedirect:true});submitted.value=true;
 }catch(e){error.value=e.response?.data?.error?.message||'We couldn’t send your request. Please try again.';}finally{busy.value=false;}}
</script>
<style scoped>
.kimi-consultation{color:#23312c}.consult-steps{list-style:none;display:flex;justify-content:space-between;padding:0;gap:16px;margin:30px 0}.consult-steps li{text-align:center;font-size:13px;display:grid;gap:8px;justify-items:center;flex:1}.consult-steps span{width:32px;height:32px;border-radius:50%;background:#e0e4d8;display:grid;place-items:center}.consult-steps [aria-current=step] span{background:#4e624b;color:white}label{display:grid;gap:7px;margin:20px 0;font-size:15px}input:not([type=checkbox]),select,textarea{width:100%;min-width:0;padding:12px;border:1px solid #cdd2c3;border-radius:7px;background:#fffdf9;font:inherit;color:#23312c}textarea{resize:vertical}.consult-check{display:flex;align-items:flex-start;gap:10px;font-size:14px}.consult-check input{margin-top:5px;accent-color:#4e624b}.consult-note{font-size:14px;background:#edf0e7;padding:16px;border-radius:10px}.consult-note p{margin:0 0 12px}a{color:#4e624b;text-underline-offset:3px}.consult-button{display:inline-flex;justify-content:center;align-items:center;gap:10px;background:#4e624b;color:#fff;border:1px solid #4e624b;padding:13px 22px;border-radius:25px;text-decoration:none;font:inherit;cursor:pointer}.consult-button:disabled{opacity:.5;cursor:default}.consult-back{border:0;background:none;color:#4e624b;cursor:pointer;font:inherit;padding:12px 0}.consult-actions{display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-top:25px}.consult-slots{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}.consult-slot{padding:12px;border:1px solid #4e624b;background:#fffdf9;color:#4e624b;border-radius:8px;font:inherit;cursor:pointer}.consult-slot[aria-pressed=true]{background:#4e624b;color:white}h3{font:27px Georgia,serif}dt{font-weight:bold;font-size:14px}dd{margin:0 0 18px}*:focus-visible{outline:3px solid #b9796c;outline-offset:3px}@media(max-width:600px){.consult-slots{grid-template-columns:1fr}}
</style>
