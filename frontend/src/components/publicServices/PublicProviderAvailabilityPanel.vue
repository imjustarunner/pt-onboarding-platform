<template>
 <section class="provider-availability-panel" aria-label="Provider availability">
  <header><h3>Availability</h3><span>{{ statusLabel(status) }}</span><p>Find availability by care setting.</p></header>
  <div class="availability-content">
   <p v-if="loading" role="status">Checking current openings…</p>
   <p v-if="error" role="alert">{{error}} <button @click="load">Try again</button></p>
   <section v-for="f in formats" :key="f.key" class="format-section" :class="'format-'+f.key" :aria-label="f.label+' availability'">
    <div class="format-heading"><span class="format-icon"><Icon :name="f.icon"/></span><div><h4>{{f.label}}</h4><p>{{f.description}}</p></div><span v-if="schedule" class="format-status">{{statusLabel(schedule[f.key]?.status)}}</span></div>
    <template v-if="f.key==='inPerson'">
     <div v-if="assignedOffices.length" class="provider-locations"><h5>Office locations</h5><article v-for="office in assignedOffices" :key="office.id"><strong>{{office.name}}</strong><p v-if="office.address">{{office.address}}</p><a :href="mapUrl(office)" target="_blank" rel="noopener noreferrer">Get directions ↗</a><button v-if="assignedOffices.length>1" type="button" :aria-pressed="selectedOffice===String(office.id)" @click="selectedOffice=selectedOffice===String(office.id)?'':String(office.id)">{{selectedOffice===String(office.id)?'Showing this office':'Show times here'}}</button></article></div>
     <p v-if="selectedOffice" class="timezone">In-person times are filtered to {{assignedOffices.find(o=>String(o.id)===selectedOffice)?.name||'your selected office'}}. <button type="button" @click="selectedOffice=''">Show all offices</button></p>
    </template>
    <template v-if="schedule && f.key!=='school'">
     <h5>Next available appointments</h5>
     <p v-if="!slotsFor(f).length">{{emptyMessage(f)}}</p>
     <p v-else-if="!schedule.onlineScheduling" class="scheduling-note">These times show this provider’s {{f.key==='virtual'?'virtual':'in-person'}} availability; online time selection is not enabled. Inquire with our team to arrange a time.</p>
     <div v-if="slotsFor(f).length" class="next-openings"><div v-for="slot in slotsFor(f).slice(0,expanded===f.value?60:6)" :key="slot.startAt+':'+slot.buildingId"><strong>{{day(slot.startAt)}}</strong><span>{{time(slot.startAt)}}</span><small>{{f.key==='virtual'?'Virtual':slot.buildingName||assignedOffices.find(o=>Number(o.id)===Number(slot.buildingId))?.name}}</small><button v-if="schedule.onlineScheduling" type="button" @click="openCalendar(f,slot)">Request time</button></div></div>
     <p v-if="slotsFor(f).length" class="timezone">Times shown in {{schedule.timeZone}}. Our team confirms placement.</p>
     <button v-if="slotsFor(f).length && (schedule.onlineScheduling || slotsFor(f).length>6)" type="button" class="calendar-toggle" :aria-expanded="calendar===f.value || expanded===f.value" @click="toggleCalendar(f)">{{calendar===f.value || expanded===f.value?'Hide calendar':'View all '+f.label.toLowerCase()+' availability →'}}</button>
     <PublicProviderSlotPicker v-if="calendar===f.value" :key="f.value+calendarWeek+calendarOffice" :agency-slug="agencySlug" :provider-id="Number(provider.id)" :service-type="serviceType" :office-id="calendarOffice" :office-locations="assignedOffices" :fixed-format="f.value" :initial-week="calendarWeek" :time-zone="schedule.timeZone" @hold="$emit('hold',$event)"/>
    </template>
    <section v-if="f.key==='inPerson' && typicalAvailability.length" class="typical-availability"><h5>Typical in-office availability</h5><ul><li v-for="item in typicalAvailability" :key="item">{{item}}</li></ul></section>
    <template v-if="schedule && f.key==='school'">
     <h5>School locations</h5><p>Availability is shown for each school. Our team coordinates school-based scheduling.</p>
     <div class="school-locations"><article v-for="school in schedule.schools||[]" :key="school.id"><Icon name="school"/><div><strong>{{school.name}}</strong><p>{{[school.city,school.state].filter(Boolean).join(', ')}}</p><span class="format-status">{{statusLabel(school.status||(school.hasOpenings?'accepting':'unavailable'))}}</span></div></article></div>
     <p v-if="!schedule.schools?.length">No school locations are currently published for this provider.</p>
     <router-link v-if="schedule.schools?.length" class="contact-link" :to="`/${agencySlug}/school-referral`">Find school enrollment →</router-link>
    </template>
    <button v-if="schedule?.waitlistEnabled && waitlistFormats.some(item=>item.value===f.value)" type="button" class="waitlist-button" @click="openWaitlist(f)">Join {{f.label.toLowerCase()}} waitlist</button>
    <router-link class="contact-link" :to="formatContactPath(f)">Inquire with our team →</router-link>
   </section>
   <template v-if="schedule">
    <form v-if="waitlistOpen" ref="waitlistForm" @submit.prevent="joinWaitlist">
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
  </div>
 </section>
</template>
<script setup>
import {computed,nextTick,ref,watch} from 'vue';
import api from '../../services/api';
import Icon from '../rise/RiseIcon.vue';
import {websiteCaptchaToken} from '../../utils/websiteCaptcha';
import {overallProviderStatus,statusLabel} from '../../utils/providerDirectoryStatus';
import PublicProviderSlotPicker from './PublicProviderSlotPicker.vue';
const props=defineProps({provider:{type:Object,required:true},agencySlug:{type:String,required:true},serviceType:{type:String,default:'counseling'},officeId:{type:[String,Number],default:''}});
const emit=defineEmits(['hold','loaded']);
const selectedOffice=ref('');
const schedule=ref(null),loading=ref(false),error=ref(''),calendar=ref(''),expanded=ref(''),calendarWeek=ref(''),calendarOffice=ref(''),waitlistOpen=ref(false),sending=ref(false),waitlistError=ref(''),receipt=ref(null);
const waitlistForm=ref(null);
async function openWaitlist(f){contact.value.format=f.value;waitlistOpen.value=true;await nextTick();waitlistForm.value?.querySelector('input')?.focus();}
const contact=ref({name:'',email:'',phone:'',message:'',format:'IN_PERSON',phiAcknowledged:false,website:''});
const base=computed(()=>`/public/agency-services/${encodeURIComponent(props.agencySlug)}/providers/${Number(props.provider.id)}`);
const contactPath=computed(()=>({path:props.agencySlug==='itsco'?'/p/itsco/contact':`/${encodeURIComponent(props.agencySlug)}/support`,query:{category:'provider',provider:String(props.provider.id),providerName:props.provider.displayName||props.provider.name||'',serviceType:props.serviceType,officeId:selectedOffice.value||undefined}}));
const status=computed(()=>overallProviderStatus(props.provider,schedule.value||{}));
const typicalAvailability=computed(()=>Array.isArray(props.provider.details?.typicalAvailability)?props.provider.details.typicalAvailability:[]);
const formats=[
 {key:'virtual',value:'VIRTUAL',label:'Virtual',icon:'screen',description:'Online sessions in the states this provider serves.'},
 {key:'inPerson',value:'IN_PERSON',label:'In-person',icon:'pin',description:'Face-to-face sessions at an assigned office.'},
 {key:'school',value:'SCHOOL',label:'School-based',icon:'school',description:'On-site support at your school.'}
];
const waitlistFormats=computed(()=>formats.filter(f=>(schedule.value?.waitlistFormats||[]).includes(f.value)));
const assignedOffices=computed(()=>schedule.value?.locations||props.provider.officeLocations||[]);
const slotsFor=f=>(schedule.value?.slots||[]).filter(s=>s.format===f.value&&(f.key!=='inPerson'||!selectedOffice.value||String(s.buildingId)===selectedOffice.value));
const emptyMessage=f=>schedule.value?.[f.key]?.status==='accepting'
 ? 'Accepting new clients. Appointment times aren’t posted yet; we’ll work with you directly to find a time.'
 : schedule.value?.[f.key]?.status==='waitlist'?'No appointment times are posted. You can join the waitlist for this setting.':'Closed to new clients in this setting. Inquire with our team for help finding support.';
function toggleCalendar(f){if(schedule.value?.onlineScheduling){calendar.value===f.value?calendar.value='':openCalendar(f);}else expanded.value=expanded.value===f.value?'':f.value;}
function openCalendar(f,slot){calendarWeek.value=slot?.startAt?new Date(slot.startAt).toLocaleDateString('en-CA',{timeZone:schedule.value?.timeZone}):'';calendarOffice.value=f.key==='inPerson'?String(slot?.buildingId||selectedOffice.value||''):'';calendar.value=f.value;}
const formatContactPath=f=>{
 const office=f.key==='inPerson'?(assignedOffices.value.find(o=>String(o.id)===selectedOffice.value)||(assignedOffices.value.length===1?assignedOffices.value[0]:null)):null;
 return {...contactPath.value,query:{...contactPath.value.query,format:f.value,officeId:office?.id,officeName:office?.name}};
};
watch(()=>props.officeId,id=>{selectedOffice.value=String(id||'');},{immediate:true});
const mapUrl=l=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([l.name,l.address].filter(Boolean).join(', '))}`;
const day=value=>new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',timeZone:schedule.value?.timeZone}).format(new Date(value));
const time=value=>new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone:schedule.value?.timeZone}).format(new Date(value));
let generation=0;
async function load(){const id=++generation;loading.value=true;error.value='';schedule.value=null;
 try{const {data}=await api.get(`${base.value}/schedule-summary`,{params:{serviceType:props.serviceType},skipAuthRedirect:true,skipGlobalLoading:true,timeout:60000});if(id!==generation)return;schedule.value=data;contact.value.format=waitlistFormats.value[0]?.value||'IN_PERSON';emit('loaded',data);}
 catch(e){if(id===generation)error.value=e.response?.status===404?'Availability is not published for this profile yet. Please inquire with our team.':e.response?.data?.error?.message||'We could not check openings. Please inquire with our team.';}
 finally{if(id===generation)loading.value=false;}}
watch(selectedOffice,()=>{calendar.value='';});
async function joinWaitlist(){sending.value=true;waitlistError.value='';
 try{if(!contact.value.email.trim()&&!contact.value.phone.trim())throw new Error('Enter an email address or phone number so we can contact you.');
  const {data:config}=await api.get(`/public/agency-support/${encodeURIComponent(props.agencySlug)}`,{skipAuthRedirect:true});
  const captchaToken=await websiteCaptchaToken(config.recaptchaSiteKey,'public_agency_support',config.recaptchaRequired);
  const {data}=await api.post(`${base.value}/waitlist`,{...contact.value,serviceType:props.serviceType,captchaToken},{skipAuthRedirect:true});
  if(!data.ok||!data.ticketId)throw new Error('Your request could not be confirmed. Please try again.');
  receipt.value=data.ticketId;waitlistOpen.value=false;
 }catch(e){waitlistError.value=e.response?.data?.error?.message||e.message||'Could not submit your waitlist request.';}finally{sending.value=false;}}
watch(()=>[props.provider.id,props.agencySlug,props.serviceType],()=>{calendar.value='';waitlistOpen.value=false;receipt.value=null;selectedOffice.value=String(props.officeId||'');load();},{immediate:true});
</script>
<style scoped>
.provider-availability-panel{border:1px solid #cdded7;border-radius:18px;overflow:hidden;background:#fff;color:#153e38}.provider-availability-panel header{padding:22px;background:var(--its-green,var(--agency-primary-color,#155c47));color:#fff}.provider-availability-panel header h3{color:inherit;margin:0 0 10px;font-size:25px}.provider-availability-panel header p{color:inherit;margin-bottom:0}.provider-availability-panel header span{display:inline-block;border-radius:24px;background:#ffffff24;padding:8px 12px}.availability-content{padding:16px;display:grid;gap:16px}.availability-content h4{font-size:19px;margin:25px 0 14px}.format-badges{display:flex;gap:7px;flex-wrap:wrap}.format-badges svg{width:16px;height:16px;flex-shrink:0}.format-badges span{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:20px;background:#eef5f1;font-size:12px}.next-openings{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.next-openings>div{display:grid;gap:8px;text-align:center;padding:12px 8px;border:1px solid #d3e4da;border-radius:9px}.next-openings span{padding:7px;background:var(--format-tint,#eaf5ef);border-radius:6px}.timezone{font-size:12px}.primary{width:100%;padding:13px;margin:16px 0 6px;background:var(--its-green,var(--agency-primary-color,#155c47));border:0;border-radius:9px;color:#fff;font:inherit;cursor:pointer}.contact-link{display:block;padding:12px 0;color:#165943}.provider-locations article{padding:14px;border:1px solid #d3e4da;border-radius:10px;margin:10px 0}.provider-locations a{color:#165943}.provider-locations p{font-size:14px;margin:6px 0}.provider-availability-panel form label{display:grid;gap:6px;margin:12px 0}.provider-availability-panel input,.provider-availability-panel select,.provider-availability-panel textarea{width:100%;min-width:0;box-sizing:border-box;background:white;color:inherit;padding:10px;border:1px solid #b6cbc2;border-radius:6px;font:inherit}.provider-availability-panel .ack{display:flex;align-items:start;font-size:13px}.ack input{width:18px;flex-shrink:0}.honeypot{display:none}.provider-availability-panel li{margin-bottom:8px}.provider-availability-panel button:disabled{opacity:.6}

.format-section{--format-ink:#075439;--format-tint:#e3f3e9;--format-border:#b9ddc9;min-width:0;padding:18px;border:1px solid var(--format-border);border-radius:16px;background:linear-gradient(145deg,#fff,var(--format-tint));color:#183e38}
.format-virtual{--format-ink:#075a9a;--format-tint:#e5f2ff;--format-border:#b9dafa}.format-school{--format-ink:#984000;--format-tint:#fff2df;--format-border:#efd0a0}
.format-heading{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--format-border);padding-bottom:14px;margin-bottom:16px}.format-heading>div{flex:1;min-width:150px}.format-heading h4{color:var(--format-ink);font-size:23px;margin:0 0 3px}.format-heading p{font-size:13px;line-height:1.5;margin:0}.format-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--format-tint);color:var(--format-ink)}.format-icon svg{width:24px;height:24px}.format-status{display:inline-block;font-size:12px;line-height:1.4;border-radius:20px;background:var(--format-tint);color:var(--format-ink);padding:7px 10px}.format-section h5{font-size:16px;margin:18px 0 10px;color:var(--format-ink)}.format-section p{line-height:1.6}.format-section .contact-link{font-size:14px;color:var(--format-ink);font-weight:600}.format-section button{font:inherit;font-size:13px;border:1px solid var(--format-border);background:#fff;color:var(--format-ink);border-radius:8px;min-height:40px;padding:8px 10px;cursor:pointer}.next-openings>div{background:#ffffffb0;border-color:var(--format-border);font-size:13px;min-width:0}.next-openings small{overflow-wrap:anywhere}.next-openings button{font-weight:600}.format-section .calendar-toggle{width:100%;margin:10px 0}.scheduling-note{font-size:13px}.provider-locations article{margin:8px 0;background:#ffffffaa}.provider-locations button{display:block;margin-top:10px}.school-locations article{display:flex;gap:10px;padding:14px;border:1px solid var(--format-border);background:#ffffffb0;border-radius:10px;margin:10px 0}.school-locations svg{width:24px;height:24px;flex-shrink:0;color:var(--format-ink)}.school-locations p{font-size:13px;margin:5px 0}.typical-availability{font-size:13px}.provider-availability-panel :focus-visible{outline:3px solid #c99718;outline-offset:3px}@media(max-width:440px){.availability-content{padding:10px;gap:12px}.format-section{padding:14px}.next-openings{grid-template-columns:repeat(2,minmax(0,1fr))}}
.provider-availability-panel header{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.provider-availability-panel header h3{margin:0}.provider-availability-panel header p{grid-column:1 / -1;margin:0}.provider-availability-panel header span{font-size:13px}@media(max-width:440px){.provider-availability-panel header{grid-template-columns:1fr}.provider-availability-panel header span{justify-self:start}}
</style>
