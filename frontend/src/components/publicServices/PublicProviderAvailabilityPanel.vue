<template>
 <section ref="panel" class="provider-availability-panel" aria-label="Provider availability">
  <header><h3>Availability</h3><span>{{ loading && !schedule ? 'Checking schedule…' : statusLabel(status) }}</span><p>Find availability by care setting.</p></header>
  <div class="availability-content">
   <PublicAvailabilityLoading v-if="loading && !schedule"/>
   <p v-else-if="loading" class="schedule-refresh" role="status">Updating this provider’s schedule · {{checkedWeeks}} of 4 weeks checked. Saved times remain visible.</p>
   <p v-if="error" role="alert">{{error}} <span v-if="schedule">Saved times remain visible and are subject to change.</span> <button @click="load({force:true})">Try again</button></p>
   <section v-for="f in formats" :key="f.key" class="format-section" :class="'format-'+f.key" :aria-label="f.label+' availability'">
    <div class="format-heading"><span class="format-icon"><Icon :name="f.icon"/></span><div><h4>{{f.label}}</h4><p>{{f.description}}</p></div><span v-if="schedule" class="format-status">{{statusLabel(schedule[f.key]?.status)}}</span></div>
    <template v-if="f.key==='inPerson'">
     <div v-if="assignedOffices.length" class="provider-locations"><h5>Office locations</h5><article v-for="office in assignedOffices" :key="office.id"><strong>{{office.name}}</strong><p v-if="office.address">{{office.address}}</p><a :href="mapUrl(office)" target="_blank" rel="noopener noreferrer">Get directions ↗</a><button v-if="assignedOffices.length>1" type="button" :aria-pressed="selectedOffice===String(office.id)" @click="selectedOffice=selectedOffice===String(office.id)?'':String(office.id)">{{selectedOffice===String(office.id)?'Showing this office':'Show times here'}}</button></article></div>
     <p v-if="selectedOffice" class="timezone">In-person times are filtered to {{assignedOffices.find(o=>String(o.id)===selectedOffice)?.name||'your selected office'}}. <button type="button" @click="selectedOffice=''">Show all offices</button></p>
    </template>
    <template v-if="schedule && f.key!=='school'">
     <h5>{{partialSchedule?'Available appointments':'Next available appointments'}}</h5>
     <p v-if="!slotsFor(f).length">{{emptyMessage(f)}}</p>
     <p v-else-if="!schedule.onlineScheduling" class="scheduling-note">Select a preferred time for enrollment; online booking is off. Our team confirms availability.</p>
     <div v-if="slotsFor(f).length" class="next-openings"><div v-for="group in daysFor(f).slice(0,expanded===f.value?60:6)" :key="group.date"><strong>{{day(group.startAt)}}</strong><div class="day-times"><div v-for="slot in group.slots" :key="slot.startAt+':'+slot.endAt+':'+slot.frequency+':'+slot.purpose+':'+slot.buildingId+':'+slot.roomId" class="day-time"><span>{{time(slot.startAt)}}</span><div class="day-time-details"><small>{{availabilityLabel(slot)}}</small><small v-if="f.key==='inPerson'"><Icon name="pin"/>{{slot.buildingName||assignedOffices.find(o=>Number(o.id)===Number(slot.buildingId))?.name||'In person'}}</small><small v-else title="Virtual"><Icon name="screen"/><span class="availability-sr-only">Virtual</span></small></div><button type="button" :disabled="selecting" :aria-label="(schedule.onlineScheduling?'Reserve time':'Select preferred time')+' '+day(slot.startAt)+' '+time(slot.startAt)+' '+f.label" @click="schedule.onlineScheduling?openCalendar(f,slot):selectPreference(f,slot)">{{schedule.onlineScheduling?'Reserve time':'Select time'}} <Icon name="arrow"/></button></div></div></div></div>
     <p v-if="slotsFor(f).length" class="timezone">Times shown in {{schedule.timeZone}}. Our team confirms placement.</p>
     <button v-if="slotsFor(f).length && (schedule.onlineScheduling || daysFor(f).length>6)" type="button" class="calendar-toggle" :aria-expanded="calendar===f.value || expanded===f.value" @click="toggleCalendar(f)">{{calendar===f.value || expanded===f.value?'Hide calendar':'View all '+f.label.toLowerCase()+' availability →'}}</button>
     <PublicProviderSlotPicker v-if="calendar===f.value" :key="f.value+calendarWeek+calendarOffice" :agency-slug="agencySlug" :provider-id="Number(provider.id)" :service-type="serviceType" :office-id="calendarOffice" :office-locations="assignedOffices" :fixed-format="f.value" :initial-week="calendarWeek" :time-zone="schedule.timeZone" @hold="selection=$event;$emit('hold',$event)"/>
    </template>
    <section v-if="f.key==='inPerson' && typicalAvailability.length" class="typical-availability"><h5>Typical in-office availability</h5><ul><li v-for="item in typicalAvailability" :key="item">{{item}}</li></ul></section>
    <template v-if="schedule && f.key==='school'">
     <h5>School locations</h5><p>Availability is shown for each school. Our team coordinates school-based scheduling.</p>
     <div class="school-locations"><article v-for="school in schedule.schools||[]" :key="school.id"><Icon name="school"/><div><strong>{{school.name}}</strong><p>{{[school.city,school.state].filter(Boolean).join(', ')}}</p><span class="format-status">{{statusLabel(school.status||(school.hasOpenings?'accepting':'unavailable'))}}</span></div></article></div>
     <p v-if="!schedule.schools?.length">No school locations are currently published for this provider.</p>
     <router-link v-if="schedule.schools?.length && ['accepting','waitlist'].includes(schedule.school?.status)" class="contact-link" :to="`/${agencySlug}/school-referral`">Find school enrollment →</router-link>
    </template>
    <router-link v-if="enrollmentOption(f)" class="enrollment-link" :to="formatEnrollmentPath(f)">{{enrollmentOption(f).status==='waitlist'?'Join '+f.label.toLowerCase()+' waitlist':'Request '+f.label.toLowerCase()+' care with this provider'}} →</router-link>
    <p v-if="enrollmentOption(f)" class="scheduling-note">{{enrollmentOption(f).status==='waitlist'?'Complete full enrollment to request this provider’s waitlist.':'Complete full enrollment with this person as your desired provider.'}} Selecting a provider does not guarantee placement. Our support team or a care coordinator will contact you to coordinate care.</p>
    <router-link class="contact-link" :to="formatContactPath(f)">Inquire with our team →</router-link>
   </section>
   <section v-if="selection && enrollmentPath" class="scheduling-note" role="status"><strong>{{selection.token?'Time reserved pending confirmation':'Preferred time selected — not reserved'}}</strong><p>{{day(selection.startAt)}} · {{time(selection.startAt)}} · {{availabilityLabel(selection)}}</p><router-link :to="enrollmentPath">Continue enrollment with this time →</router-link></section>
   <p v-if="selectionError && !pendingPreference" role="alert">{{selectionError}}</p>
   <PreferredTimeConfirmation v-if="pendingPreference" :opening="pendingPreference" :provider-name="provider.displayName || provider.name" :busy="selecting" :error="selectionError" @close="pendingPreference=null" @confirm="confirmPreference"/>

  </div>
 </section>
</template>
<script setup>
import {availabilityLabel} from '../../utils/availabilityLabel.js';

import {computed,nextTick,onBeforeUnmount,ref,watch} from 'vue';
import {useRouter} from 'vue-router';
import PreferredTimeConfirmation from './PreferredTimeConfirmation.vue';
import PublicAvailabilityLoading from './PublicAvailabilityLoading.vue';
import {availabilityDayGroups} from '../../utils/availabilityDayGroups';
import api from '../../services/api';
import {getCachedProviderWeek,providerWeekStarts,mergeProviderWeeks,readProviderWeek} from '../../services/publicAvailabilityRead';
import Icon from '../rise/RiseIcon.vue';
import {providerEnrollmentFormats,providerEnrollmentPath} from '../../utils/providerEnrollmentEntry';
import {overallProviderStatus,statusLabel} from '../../utils/providerDirectoryStatus';
import PublicProviderSlotPicker from './PublicProviderSlotPicker.vue';
const props=defineProps({provider:{type:Object,required:true},agencySlug:{type:String,required:true},serviceType:{type:String,default:'counseling'},officeId:{type:[String,Number],default:''}});
const emit=defineEmits(['hold','loaded','load-error','office-change']);
const panel=ref(null),partialSchedule=ref(false),checkedWeeks=ref(0);
const router=useRouter();
const pendingPreference=ref(null);
const selectedOffice=ref('');
const schedule=ref(null),loading=ref(false),error=ref(''),calendar=ref(''),expanded=ref(''),calendarWeek=ref(''),calendarOffice=ref('');
const selection=ref(null),selecting=ref(false),selectionError=ref('');
const enrollmentOptions=computed(()=>providerEnrollmentFormats(schedule.value));
const enrollmentOption=f=>enrollmentOptions.value.find(item=>item.format===f.value);
const formatEnrollmentPath=(f,officeId=selectedOffice.value)=>providerEnrollmentPath({agencySlug:props.agencySlug,providerId:props.provider.id,serviceType:props.serviceType,format:f.value,query:{officeId:f.value==='IN_PERSON'?officeId||undefined:undefined}});
const enrollmentPath=computed(()=>{const option=enrollmentOptions.value.find(item=>item.format===selection.value?.modality);return option?formatEnrollmentPath({value:option.format},selection.value.buildingId||selectedOffice.value):null;});
function selectPreference(f,slot){
 selectionError.value='';
 if(enrollmentOption(f)?.status!=='accepting'){
  selectionError.value='This provider is no longer accepting requests in this setting. Please check another setting or contact our team.';return;
 }
 pendingPreference.value={providerId:Number(props.provider.id),serviceType:props.serviceType,modality:f.value,
  startAt:slot.startAt,endAt:slot.endAt,frequency:slot.frequency,purpose:slot.purpose,
  recurring:slot.frequency!=='ONCE',timeZone:schedule.value.timeZone,
  buildingId:slot.buildingId||null,buildingName:slot.buildingName||assignedOffices.value.find(o=>String(o.id)===String(slot.buildingId))?.name||'',preferenceOnly:true};
}
async function confirmPreference(){
 const value=pendingPreference.value;
 if(!value||selecting.value)return;
 selecting.value=true;selectionError.value='';
 try{
  if(!enrollmentOptions.value.some(option=>option.format===value.modality&&option.status==='accepting'))throw new Error('This setting is no longer accepting requests. Please choose another setting or contact our team.');
  const key=`provider-hold:${props.agencySlug}`;let previous;try{previous=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
  if(previous?.token)await api.post(`/public/agency-services/${encodeURIComponent(props.agencySlug)}/release-hold`,{token:previous.token},{skipAuthRedirect:true});
  if(pendingPreference.value!==value)return;
  try{sessionStorage.setItem(key,JSON.stringify(value));}catch{throw new Error('Could not save this preference in your browser. Please try again.');}
  selection.value=value;emit('hold',value);
  const failure=await router.push(providerEnrollmentPath({agencySlug:props.agencySlug,providerId:value.providerId,serviceType:value.serviceType,format:value.modality,
   query:{officeId:value.modality==='IN_PERSON'?value.buildingId||undefined:undefined}}));
  if(failure)throw new Error('Your preferred time is saved, but enrollment could not be opened. Please try again.');
  pendingPreference.value=null;
 }catch(e){selectionError.value=e.response?.data?.error?.message||e.message||'Could not save this preference and open enrollment. Please try again.';}
 finally{selecting.value=false;}
}
const contactPath=computed(()=>({path:props.agencySlug==='itsco'?'/p/itsco/contact':`/${encodeURIComponent(props.agencySlug)}/support`,query:{category:'provider',provider:String(props.provider.id),providerName:props.provider.displayName||props.provider.name||'',serviceType:props.serviceType,officeId:selectedOffice.value||undefined}}));
const status=computed(()=>overallProviderStatus(props.provider,schedule.value||{}));
const typicalAvailability=computed(()=>Array.isArray(props.provider.details?.typicalAvailability)?props.provider.details.typicalAvailability:[]);
const formats=[
 {key:'virtual',value:'VIRTUAL',label:'Virtual',icon:'screen',description:'Online sessions in the states this provider serves.'},
 {key:'inPerson',value:'IN_PERSON',label:'In-person',icon:'pin',description:'Face-to-face sessions at an assigned office.'},
 {key:'school',value:'SCHOOL',label:'School-based',icon:'school',description:'On-site support at your school.'}
];
const assignedOffices=computed(()=>schedule.value?.locations||props.provider.officeLocations||[]);
const slotsFor=f=>(schedule.value?.[f.key]?.status==='accepting'?(schedule.value?.slots||[]):[]).filter(s=>s.format===f.value&&(f.key!=='inPerson'||!selectedOffice.value||String(s.buildingId)===selectedOffice.value));
const daysFor=f=>availabilityDayGroups(slotsFor(f),schedule.value?.timeZone);
const emptyMessage=f=>partialSchedule.value ? 'No openings in the weeks loaded so far. Use the weekly calendar above to check another week.' : schedule.value?.[f.key]?.status==='accepting'
 ? 'Accepting new clients. Appointment times aren’t posted yet; we’ll work with you directly to find a time.'
 : schedule.value?.[f.key]?.status==='waitlist'?'No appointment times are posted. You can join the waitlist for this setting.':'Closed to new clients in this setting. Inquire with our team for help finding support.';
function toggleCalendar(f){if(schedule.value?.onlineScheduling){calendar.value===f.value?calendar.value='':openCalendar(f);}else expanded.value=expanded.value===f.value?'':f.value;}
function openCalendar(f,slot){calendarWeek.value=slot?.startAt?new Date(slot.startAt).toLocaleDateString('en-CA',{timeZone:schedule.value?.timeZone}):'';calendarOffice.value=f.key==='inPerson'?String(slot?.buildingId||selectedOffice.value||''):'';calendar.value=f.value;}
async function selectOpening({slot,schedule:currentSchedule}){
 const f=formats.find(format=>format.value===slot.format);
 if(!f||selecting.value||!currentSchedule)return;
 // Use the selected week's current status and location details for the same enrollment flow.
 schedule.value={...schedule.value,timeZone:currentSchedule.timeZone,onlineScheduling:currentSchedule.onlineScheduling,inPerson:currentSchedule.inPerson,virtual:currentSchedule.virtual,locations:currentSchedule.locations};
 if(!schedule.value.onlineScheduling){selectPreference(f,slot);return;}
 openCalendar(f,slot);
 await nextTick();
 const picker=panel.value?.querySelector('.opening-picker');
 picker?.scrollIntoView({behavior:'smooth',block:'center'});
 if(picker){picker.setAttribute('tabindex','-1');picker.focus({preventScroll:true});}
}
const formatContactPath=f=>{
 const office=f.key==='inPerson'?(assignedOffices.value.find(o=>String(o.id)===selectedOffice.value)||(assignedOffices.value.length===1?assignedOffices.value[0]:null)):null;
 return {...contactPath.value,query:{...contactPath.value.query,format:f.value,officeId:office?.id,officeName:office?.name}};
};
watch(()=>props.officeId,id=>{selectedOffice.value=String(id||'');},{immediate:true});
const mapUrl=l=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([l.name,l.address].filter(Boolean).join(', '))}`;
const day=value=>new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',timeZone:schedule.value?.timeZone}).format(new Date(value));
const time=value=>new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone:schedule.value?.timeZone}).format(new Date(value));
let generation=0;
async function load({force=false}={}){
 const id=++generation,options={agencySlug:props.agencySlug,providerId:Number(props.provider.id),serviceType:props.serviceType};
 let starts=providerWeekStarts(options);
 const weeks=new Map(starts.map(weekStart=>[weekStart,getCachedProviderWeek({...options,weekStart})]).filter(([,value])=>value));
 const publish=()=>{schedule.value=mergeProviderWeeks(starts.map(start=>weeks.get(start)));partialSchedule.value=starts.some(start=>!weeks.has(start));if(schedule.value)emit('loaded',schedule.value);};
 loading.value=true;error.value='';checkedWeeks.value=0;publish();
 const failed=[];
 for(let index=0;index<starts.length;index++){
  try{
   let data=await readProviderWeek({...options,weekStart:starts[index]},{force});
   if(id!==generation)return;
   if(index===0){
    const corrected=providerWeekStarts(options);
    if(corrected[0]!==starts[0]){starts=corrected;data=await readProviderWeek({...options,weekStart:starts[0]},{force});if(id!==generation)return;}
   }
   weeks.set(starts[index],data);checkedWeeks.value++;publish();
  }catch(e){if(id!==generation)return;failed.push(e);}
 }
 if(id!==generation)return;
 if(failed.length){error.value=schedule.value?'Some weeks could not be updated. Please try again.':'We could not load this provider’s available schedule. Please try again or inquire with our team.';emit('load-error',error.value);}
 loading.value=false;
}
watch(selectedOffice,value=>{calendar.value='';emit('office-change',value);});
watch([()=>props.provider.id,()=>props.agencySlug,()=>props.serviceType],()=>{calendar.value='';pendingPreference.value=null;selectionError.value='';selectedOffice.value=String(props.officeId||'');schedule.value=null;partialSchedule.value=false;load();},{immediate:true});
onBeforeUnmount(()=>{generation++;pendingPreference.value=null;});
defineExpose({selectOpening,load});
</script>
<style scoped>
.enrollment-link{display:block;background:var(--format-ink);color:#fff;padding:12px;border-radius:9px;margin-top:16px;text-align:center;font-weight:600;text-decoration:none}.day-times{display:grid;gap:10px}.day-time{display:grid;gap:6px}.day-time+.day-time{border-top:1px solid var(--format-border);padding-top:10px}

.provider-availability-panel{border:1px solid #cdded7;border-radius:18px;overflow:hidden;background:#fff;color:#153e38}.provider-availability-panel header{padding:22px;background:var(--its-green,var(--agency-primary-color,#155c47));color:#fff}.provider-availability-panel header h3{color:inherit;margin:0 0 10px;font-size:25px}.provider-availability-panel header p{color:inherit;margin-bottom:0}.provider-availability-panel header span{display:inline-block;border-radius:24px;background:#ffffff24;padding:8px 12px}.availability-content{padding:16px;display:grid;gap:16px}.availability-content h4{font-size:19px;margin:25px 0 14px}.format-badges{display:flex;gap:7px;flex-wrap:wrap}.format-badges svg{width:16px;height:16px;flex-shrink:0}.format-badges span{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:20px;background:#eef5f1;font-size:12px}.next-openings{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.next-openings>div{display:grid;gap:8px;text-align:center;padding:12px 8px;border:1px solid #d3e4da;border-radius:9px}.next-openings span{padding:7px;background:var(--format-tint,#eaf5ef);border-radius:6px}.timezone{font-size:12px}.primary{width:100%;padding:13px;margin:16px 0 6px;background:var(--its-green,var(--agency-primary-color,#155c47));border:0;border-radius:9px;color:#fff;font:inherit;cursor:pointer}.contact-link{display:block;padding:12px 0;color:#165943}.provider-locations article{padding:14px;border:1px solid #d3e4da;border-radius:10px;margin:10px 0}.provider-locations a{color:#165943}.provider-locations p{font-size:14px;margin:6px 0}.provider-availability-panel form label{display:grid;gap:6px;margin:12px 0}.provider-availability-panel input,.provider-availability-panel select,.provider-availability-panel textarea{width:100%;min-width:0;box-sizing:border-box;background:white;color:inherit;padding:10px;border:1px solid #b6cbc2;border-radius:6px;font:inherit}.provider-availability-panel .ack{display:flex;align-items:start;font-size:13px}.ack input{width:18px;flex-shrink:0}.honeypot{display:none}.provider-availability-panel li{margin-bottom:8px}.provider-availability-panel button:disabled{opacity:.6}

.format-section{--format-ink:#075439;--format-tint:#e3f3e9;--format-border:#b9ddc9;min-width:0;padding:18px;border:1px solid var(--format-border);border-radius:16px;background:linear-gradient(145deg,#fff,var(--format-tint));color:#183e38}
.format-virtual{--format-ink:#075a9a;--format-tint:#e5f2ff;--format-border:#b9dafa}.format-school{--format-ink:#984000;--format-tint:#fff2df;--format-border:#efd0a0}
.format-heading{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--format-border);padding-bottom:14px;margin-bottom:16px}.format-heading>div{flex:1;min-width:150px}.format-heading h4{color:var(--format-ink);font-size:23px;margin:0 0 3px}.format-heading p{font-size:13px;line-height:1.5;margin:0}.format-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--format-tint);color:var(--format-ink)}.format-icon svg{width:24px;height:24px}.format-status{display:inline-block;font-size:12px;line-height:1.4;border-radius:20px;background:var(--format-tint);color:var(--format-ink);padding:7px 10px}.format-section h5{font-size:16px;margin:18px 0 10px;color:var(--format-ink)}.format-section p{line-height:1.6}.format-section .contact-link{font-size:14px;color:var(--format-ink);font-weight:600}.format-section button{font:inherit;font-size:13px;border:1px solid var(--format-border);background:#fff;color:var(--format-ink);border-radius:8px;min-height:40px;padding:8px 10px;cursor:pointer}.next-openings>div{background:#ffffffb0;border-color:var(--format-border);font-size:13px;min-width:0}.next-openings small{overflow-wrap:anywhere}.next-openings button{font-weight:600}.format-section .calendar-toggle{width:100%;margin:10px 0}.scheduling-note{font-size:13px}.provider-locations article{margin:8px 0;background:#ffffffaa}.provider-locations button{display:block;margin-top:10px}.school-locations article{display:flex;gap:10px;padding:14px;border:1px solid var(--format-border);background:#ffffffb0;border-radius:10px;margin:10px 0}.school-locations svg{width:24px;height:24px;flex-shrink:0;color:var(--format-ink)}.school-locations p{font-size:13px;margin:5px 0}.typical-availability{font-size:13px}.provider-availability-panel :focus-visible{outline:3px solid #c99718;outline-offset:3px}@media(max-width:440px){.availability-content{padding:10px;gap:12px}.format-section{padding:14px}.next-openings{grid-template-columns:repeat(2,minmax(0,1fr))}}
.provider-availability-panel header{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.provider-availability-panel header h3{margin:0}.provider-availability-panel header p{grid-column:1 / -1;margin:0}.provider-availability-panel header span{font-size:13px}@media(max-width:440px){.provider-availability-panel header{grid-template-columns:1fr}.provider-availability-panel header span{justify-self:start}}
.next-openings{grid-template-columns:minmax(0,1fr)}.day-times{grid-template-columns:repeat(auto-fit,minmax(100px,1fr))}.day-time+.day-time{border-top:0;padding-top:0}
.provider-availability-panel header{padding:15px 18px;gap:5px}.provider-availability-panel header h3{font-size:19px}.provider-availability-panel header p{font-size:12px}.provider-availability-panel header span{font-size:11px;padding:5px 9px}.availability-content{padding:12px;gap:12px}.format-section{padding:14px;border-radius:12px}.format-heading{padding-bottom:10px;margin-bottom:10px;gap:8px}.format-icon{width:34px;height:34px;flex-shrink:0}.format-icon svg{width:19px;height:19px}.format-heading>div{min-width:100px}.format-heading h4{font-size:18px}.format-heading p{font-size:12px}.format-status{font-size:10px;padding:5px 8px}.format-section h5{font-size:13px;margin:12px 0 8px}.format-section .scheduling-note{font-size:12px;line-height:1.5;margin:8px 0 12px}.next-openings{gap:8px}.next-openings>div{text-align:left;padding:10px;gap:7px}.next-openings>div>strong{font-size:12px}.day-times{display:grid;grid-template-columns:1fr;gap:6px}.day-time{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px}.day-time>span{font-size:12px;font-weight:650;padding:6px;white-space:nowrap}.day-time-details{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;min-width:0;font-size:12px}.day-time-details small{display:inline-flex;gap:3px;align-items:center}.day-time svg{width:13px;height:13px;flex-shrink:0}.day-time>button{display:inline-flex;align-items:center;gap:5px;font-size:11px;min-height:34px;padding:6px 8px;white-space:nowrap}.provider-locations article{padding:10px;font-size:13px}.provider-locations p{font-size:12px;line-height:1.5}.provider-locations a{font-size:12px}.provider-locations button{display:inline-block;margin:5px 0 0 12px;font-size:11px;min-height:32px}.format-section .contact-link{font-size:12px;padding:8px 0}.enrollment-link{font-size:13px;padding:10px;margin-top:12px}.timezone{font-size:11px;margin:8px 0}.school-locations article{padding:10px}.school-locations{font-size:13px}.typical-availability{font-size:12px}
.availability-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.schedule-refresh{font-size:12px;line-height:1.5;margin:0;padding:10px 12px;border-radius:8px;background:#edf6f1;color:#20533f}
</style>
