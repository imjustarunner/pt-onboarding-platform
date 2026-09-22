<template>
 <section class="provider-availability-panel" aria-label="Provider availability">
  <header><h3>Availability</h3><span>{{ statusLabel(status) }}</span><p>In-person, virtual, and school-based support</p></header>
  <div class="availability-content">
   <p v-if="loading" role="status">Checking current openings…</p>
   <p v-if="error" role="alert">{{error}} <button @click="load">Try again</button></p>
   <template v-if="schedule">
    <div class="format-badges"><span v-for="f in formats" :key="f.key"><Icon :name="f.key==='virtual'?'screen':f.key==='school'?'school':'pin'"/>{{f.label}} · {{statusLabel(schedule[f.key]?.status)}}</span></div>
    <PublicOfficeLocations v-if="assignedOffices.length" v-model="selectedOffice" :offices="assignedOffices" title="Office locations"/>
    <button v-if="selectedOffice" type="button" @click="selectedOffice=''">Show all locations and virtual times</button>
    <p v-if="selectedOffice" class="timezone">Showing in-person openings at {{assignedOffices.find(o=>String(o.id)===String(selectedOffice))?.name||'the selected office'}}.</p>
    <h4>Next available appointments</h4>
    <p v-if="!visibleSlots.length">{{status==='accepting'?'Accepting new clients. Appointment times aren’t posted yet; we’ll work with you directly to find a time.':schedule.waitlistEnabled?'No appointment times are posted. You can join the waitlist below.':'Not accepting new clients at this time. Inquire with our team for help finding support.'}}</p>
    <p v-else-if="!schedule.onlineScheduling">These times show this provider’s availability. Contact our team to find a time together; online time selection is not enabled.</p>
    <p v-if="visibleSlots.length" class="timezone">Times shown in {{schedule.timeZone}}. Our team confirms placement.</p>
    <div class="next-openings"><div v-for="slot in visibleSlots.slice(0,6)" :key="slot.startAt+slot.format"><strong>{{day(slot.startAt)}}</strong><span>{{time(slot.startAt)}}</span><small>{{slot.format==='VIRTUAL'?'Virtual':slot.buildingName||'In person'}}</small></div></div>
    <button v-if="schedule.onlineScheduling && visibleSlots.length" class="primary" @click="calendar=!calendar">{{calendar?'Hide full calendar':'View full calendar & request a time'}}</button>
    <PublicProviderSlotPicker v-if="calendar && schedule.onlineScheduling" :agency-slug="agencySlug" :provider-id="Number(provider.id)" :service-type="serviceType" :office-id="selectedOffice" :office-locations="assignedOffices" @hold="$emit('hold',$event)"/>
    <button v-if="schedule.waitlistEnabled" class="primary" @click="waitlistOpen=!waitlistOpen">Join waitlist</button>
    <form v-if="waitlistOpen" @submit.prevent="joinWaitlist">
     <h4>Join {{provider.firstName||provider.displayName}}’s waitlist</h4><p>The team will follow up about your request. Joining does not reserve an appointment.</p>
     <label>Your name<input v-model="contact.name" required autocomplete="name" maxlength="120"/></label>
     <label>Email<input v-model="contact.email" type="email" autocomplete="email" maxlength="255"/></label>
     <label>Phone<input v-model="contact.phone" type="tel" autocomplete="tel" maxlength="40"/></label><small>Enter an email, phone number, or both.</small>
     <label>Preferred format<select v-model="contact.format"><option v-for="f in waitlistFormats" :key="f.value" :value="f.value">{{f.label}}</option></select></label>
     <label>Anything else? (optional)<textarea v-model="contact.message" maxlength="2000" rows="3"/></label>
     <label class="ack"><input v-model="contact.phiAcknowledged" type="checkbox" required/> I will not include private health details in this public form.</label>
     <input v-model="contact.website" class="honeypot" tabindex="-1" aria-hidden="true" autocomplete="off"/>
     <p v-if="waitlistError" role="alert">{{waitlistError}}</p><button class="primary" :disabled="sending">{{sending?'Sending…':'Submit waitlist request'}}</button>
    </form>
    <p v-if="receipt" role="status">Your waitlist request was received. Reference #{{receipt}}. Our team will contact you.</p>
   </template>
   <section v-if="typicalAvailability.length || (!loading && !visibleSlots.length && !error)" class="typical-availability"><h4>Typical in-office availability</h4><ul v-if="typicalAvailability.length"><li v-for="item in typicalAvailability" :key="item">{{item}}</li></ul><p v-else>Typical hours have not been published yet. We’ll work with you directly to find a time.</p></section>
   <router-link class="contact-link" :to="contactPath">Inquire with our team →</router-link>
   <router-link v-if="provider.schools?.length || schedule?.schools?.length" class="contact-link" :to="`/${agencySlug}/school-referral`">Find school enrollment →</router-link>
   <section v-if="locations.length" class="provider-locations"><h4>Locations</h4><article v-for="location in locations" :key="location.name+location.address"><strong>{{location.name}}</strong><p v-if="location.address">{{location.address}}</p><a :href="mapUrl(location)" target="_blank" rel="noopener noreferrer">View on Google Maps ↗</a></article></section>
  </div>
 </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import api from '../../services/api';
import Icon from '../rise/RiseIcon.vue';
import {websiteCaptchaToken} from '../../utils/websiteCaptcha';
import {overallProviderStatus,statusLabel} from '../../utils/providerDirectoryStatus';
import PublicOfficeLocations from './PublicOfficeLocations.vue';
import PublicProviderSlotPicker from './PublicProviderSlotPicker.vue';
const props=defineProps({provider:{type:Object,required:true},agencySlug:{type:String,required:true},serviceType:{type:String,default:'counseling'},officeId:{type:[String,Number],default:''}});
const emit=defineEmits(['hold','loaded']);
const selectedOffice=ref('');
const schedule=ref(null),loading=ref(false),error=ref(''),calendar=ref(false),waitlistOpen=ref(false),sending=ref(false),waitlistError=ref(''),receipt=ref(null);
const contact=ref({name:'',email:'',phone:'',message:'',format:'IN_PERSON',phiAcknowledged:false,website:''});
const base=computed(()=>`/public/agency-services/${encodeURIComponent(props.agencySlug)}/providers/${Number(props.provider.id)}`);
const contactPath=computed(()=>({path:props.agencySlug==='itsco'?'/p/itsco/contact':`/${encodeURIComponent(props.agencySlug)}/support`,query:{category:'provider',provider:String(props.provider.id),providerName:props.provider.displayName||props.provider.name||'',serviceType:props.serviceType,officeId:selectedOffice.value||undefined}}));
const status=computed(()=>overallProviderStatus(props.provider,schedule.value||{}));
const typicalAvailability=computed(()=>Array.isArray(props.provider.details?.typicalAvailability)?props.provider.details.typicalAvailability:[]);
const formats=[{key:'inPerson',value:'IN_PERSON',label:'In person'},{key:'virtual',value:'VIRTUAL',label:'Virtual'},{key:'school',value:'SCHOOL',label:'School-based'}];
const waitlistFormats=computed(()=>formats.filter(f=>(schedule.value?.waitlistFormats||[]).includes(f.value)));
const assignedOffices=computed(()=>schedule.value?.locations||props.provider.officeLocations||[]);
const visibleSlots=computed(()=>(schedule.value?.slots||[]).filter(s=>!selectedOffice.value||(s.format==='IN_PERSON'&&String(s.buildingId)===String(selectedOffice.value))));
watch(()=>props.officeId,id=>{selectedOffice.value=String(id||'');},{immediate:true});
const locations=computed(()=>[
 ...assignedOffices.value,
 ...(schedule.value?.schools||[]).map(s=>({name:s.name,address:[s.city,s.state].filter(Boolean).join(', ')}))
]);
const mapUrl=l=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([l.name,l.address].filter(Boolean).join(', '))}`;
const day=value=>new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',timeZone:schedule.value?.timeZone}).format(new Date(value));
const time=value=>new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone:schedule.value?.timeZone}).format(new Date(value));
let generation=0;
async function load(){const id=++generation;loading.value=true;error.value='';schedule.value=null;
 try{const {data}=await api.get(`${base.value}/schedule-summary`,{params:{serviceType:props.serviceType,officeId:selectedOffice.value||undefined},skipAuthRedirect:true,skipGlobalLoading:true,timeout:60000});if(id!==generation)return;schedule.value=data;contact.value.format=waitlistFormats.value[0]?.value||'IN_PERSON';emit('loaded',data);}
 catch(e){if(id===generation)error.value=e.response?.status===404?'Availability is not published for this profile yet. Please inquire with our team.':e.response?.data?.error?.message||'We could not check openings. Please inquire with our team.';}
 finally{if(id===generation)loading.value=false;}}
watch(selectedOffice,()=>load());
async function joinWaitlist(){sending.value=true;waitlistError.value='';
 try{if(!contact.value.email.trim()&&!contact.value.phone.trim())throw new Error('Enter an email address or phone number so we can contact you.');
  const {data:config}=await api.get(`/public/agency-support/${encodeURIComponent(props.agencySlug)}`,{skipAuthRedirect:true});
  const captchaToken=await websiteCaptchaToken(config.recaptchaSiteKey,'public_agency_support',config.recaptchaRequired);
  const {data}=await api.post(`${base.value}/waitlist`,{...contact.value,serviceType:props.serviceType,captchaToken},{skipAuthRedirect:true});
  if(!data.ok||!data.ticketId)throw new Error('Your request could not be confirmed. Please try again.');
  receipt.value=data.ticketId;waitlistOpen.value=false;
 }catch(e){waitlistError.value=e.response?.data?.error?.message||e.message||'Could not submit your waitlist request.';}finally{sending.value=false;}}
watch(()=>[props.provider.id,props.agencySlug,props.serviceType],()=>{calendar.value=false;waitlistOpen.value=false;receipt.value=null;selectedOffice.value=String(props.officeId||'');load();},{immediate:true});
</script>
<style scoped>
.provider-availability-panel{border:1px solid #cdded7;border-radius:18px;overflow:hidden;background:#fff;color:#153e38}.provider-availability-panel header{padding:22px;background:var(--its-green,var(--agency-primary-color,#155c47));color:#fff}.provider-availability-panel header h3{color:inherit;margin:0 0 10px;font-size:25px}.provider-availability-panel header p{color:inherit;margin-bottom:0}.provider-availability-panel header span{display:inline-block;border-radius:24px;background:#ffffff24;padding:8px 12px}.availability-content{padding:22px}.availability-content h4{font-size:19px;margin:25px 0 14px}.format-badges{display:flex;gap:7px;flex-wrap:wrap}.format-badges svg{width:16px;height:16px;flex-shrink:0}.format-badges span{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:20px;background:#eef5f1;font-size:12px}.next-openings{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}.next-openings>div{display:grid;gap:8px;text-align:center;padding:12px 8px;border:1px solid #d3e4da;border-radius:9px}.next-openings span{padding:7px;background:#eaf5ef;border-radius:6px}.timezone{font-size:12px}.primary{width:100%;padding:13px;margin:16px 0 6px;background:var(--its-green,var(--agency-primary-color,#155c47));border:0;border-radius:9px;color:#fff;font:inherit;cursor:pointer}.contact-link{display:block;padding:12px 0;color:#165943}.provider-locations article{padding:14px;border:1px solid #d3e4da;border-radius:10px;margin:10px 0}.provider-locations a{color:#165943}.provider-locations p{font-size:14px;margin:6px 0}.provider-availability-panel form label{display:grid;gap:6px;margin:12px 0}.provider-availability-panel input,.provider-availability-panel select,.provider-availability-panel textarea{width:100%;min-width:0;box-sizing:border-box;background:white;color:inherit;padding:10px;border:1px solid #b6cbc2;border-radius:6px;font:inherit}.provider-availability-panel .ack{display:flex;align-items:start;font-size:13px}.ack input{width:18px;flex-shrink:0}.honeypot{display:none}.provider-availability-panel li{margin-bottom:8px}.provider-availability-panel button:disabled{opacity:.6}
</style>
