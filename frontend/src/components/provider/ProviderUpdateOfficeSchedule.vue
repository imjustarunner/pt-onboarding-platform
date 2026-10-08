<template>
 <div class="availability-review">
  <p v-if="view==='calendar'">Open the hours you want clients to see on your public profile. Booked appointments, school commitments, and calendar conflicts stay unavailable.</p>
  <p v-if="readonly" class="notice">Read-only preview. You can browse weeks and open the public profile. Publishing is available through the provider’s own update link.</p>
  <section v-if="calendar &amp;&amp; view==='settings'" class="settings"><h3>Public profile availability</h3><p>These settings apply to {{calendar.agency?.name}}. Published openings appear when the matching format and new-client availability are enabled.</p><fieldset :disabled="!canEdit||busy||loading"><label><input v-model="settings.acceptingNewClients" type="checkbox" @change="saveSettings" /> Accepting new clients</label><label><input v-model="settings.inPerson" type="checkbox" @change="saveSettings" /> In-person appointments</label><label><input v-model="settings.virtual" type="checkbox" @change="saveSettings" /> Virtual appointments</label><p role="status">Changes save automatically.</p></fieldset></section>
  <div v-if="profileUrl" class="profile-share">
   <div><h3>Your public profile</h3><p>Your biography, photo, focus areas, and published openings appear here. Changes are saved as you select them. Open your profile to see the current published openings.</p>
    <label v-if="calendar.profileServices?.length>1">Profile service<select v-model="profileService"><option v-for="service in calendar.profileServices" :key="service" :value="service">{{service}}</option></select></label>
    <a :href="profileUrl" target="_blank" rel="noopener noreferrer" class="primary button">View my live profile ↗</a>
    <label>Shareable profile link<input :value="profileUrl" readonly aria-label="Shareable profile link" @focus="$event.target.select()" /></label>
    <div class="row"><button type="button" @click="copyProfile">Copy profile link</button><button type="button" @click="makeQr">Create profile QR code</button></div>
   </div>
   <div v-if="qr" class="qr"><img :src="qr" alt="QR code for your public provider profile" /><a :href="qr" :download="`provider-${calendar.provider.id}-profile.png`">Download QR code</a></div>
  </div>
  <p v-if="calendar && !profileUrl" class="notice">A public profile service and agency web address must be configured before a shareable profile is available.</p>
  <p v-if="message" role="status" class="notice">{{message}}</p>
  <p v-if="error" role="alert" class="error">{{error}}</p>
  <template v-if="view==='calendar'">
  <div class="week-toolbar">
   <h3>Your week</h3><div class="row"><button type="button" :disabled="loading||busy" aria-label="Previous week" @click="navigate(-7)">←</button><button type="button" :disabled="loading||busy" @click="load('')">This week</button><button type="button" :disabled="loading||busy" aria-label="Next week" @click="navigate(7)">→</button><label>Week of <input type="date" :value="calendar?.weekStart" :disabled="loading||busy" @change="load($event.target.value)" /></label><button type="button" :disabled="loading||busy" @click="load(calendar?.weekStart)">Refresh</button></div>
  </div>
  <p v-if="calendar" class="muted">{{calendar.timeZone}} · <span class="key open">Public opening</span> <span class="key reserved">Reserved / kept private</span> <span class="key busy">Unavailable</span></p>
  <p v-if="loading" role="status">Loading weekly calendar…</p>
  <p v-for="warning in calendar?.calendarWarnings||[]" :key="warning" role="alert" class="notice">{{warning}}</p>
  <div v-if="calendar" class="calendar-scroll" :aria-busy="loading" tabindex="0" aria-label="Weekly availability calendar; scroll horizontally to see all seven days">
   <div class="week-grid">
    <div class="time-column"><div class="day-heading">Time</div><div class="day-body" :style="{height:`${calendarHeight}px`}"><span v-for="hour in hours" :key="hour" class="hour-label" :style="{top:`${(hour-firstHour)*hourHeight}px`}">{{hour%12||12}} {{hour<12?'AM':'PM'}}</span></div></div>
    <section v-for="day in days" :key="day.date" class="day-column"><h4 class="day-heading" :class="{today:day.date===calendar.today}">{{day.label}}</h4>
     <div class="day-body" :style="{height:`${calendarHeight}px`}">
      <span v-for="hour in hours" :key="hour" class="hour-line" :style="{top:`${(hour-firstHour)*hourHeight}px`}" />
      <button v-for="event in day.events" :key="event.key" type="button" class="calendar-event" :class="event.kind" :style="eventStyle(event,day.events)" :title="`${time(event.startAt)}–${time(event.endAt)} · ${event.label} · ${event.detail||''}`" @click="selectEvent(event)">
       <strong>{{time(event.startAt)}}–{{time(event.endAt)}}</strong><span>{{event.label}}</span><small>{{event.detail}}</small>
      </button>
     </div>
     <button type="button" class="day-add" :disabled="!canEdit||!settings.virtual||busy||loading||day.date<calendar.today" @click="startOpening(day.date)">+ Virtual hour</button>
    </section>
   </div>
  </div>
  <p v-if="calendar && !calendar.canEdit && !readonly" class="notice">This update can display your schedule. Publishing requires an active care-provider assignment and a schedule owned by this agency. A shared schedule must be edited in its originating agency.</p>
  <section v-if="selected" ref="selectionPanel" class="edit-panel" tabindex="-1">
   <h3>{{selected.office?'Reserved office hour':'Selected time'}} · {{time(selected.startAt)}}–{{time(selected.endAt)}}</h3>
   <p>{{selected.label}} · {{selected.detail}}</p>
   <p v-if="selected.kind==='busy'">This time is blocked by a commitment or an unavailable room. Existing appointments are managed in your regular schedule.</p>
   <template v-else-if="selected.office">
    <p>Publish only this reserved room time when it has no client appointment. Repeating choices apply only to matching reservations that already exist.</p>
    <fieldset :disabled="!canEdit||busy||loading"><label>Offer this office hour<select v-model="officeFormat"><option value="private">Keep private / occupied</option><option v-if="settings.inPerson" value="inPerson">In person</option><option v-if="settings.virtual" value="virtual">Virtual</option><option v-if="settings.inPerson &amp;&amp; settings.virtual" value="both">In person or virtual</option></select></label><label>Repeat<select v-model="officeFrequency"><option value="ONCE">This week only</option><option v-if="selected.assignmentId" value="WEEKLY">Weekly</option><option v-if="selected.assignmentId" value="BIWEEKLY">Every other week</option><option v-if="selected.assignmentId" value="MONTHLY">Monthly — same weekday and week</option></select></label><button type="button" class="primary" @click="saveOffice">Save this availability</button></fieldset>
    <p class="muted">“Keep private” removes the public opening, keeping your room reservation. Future openings remain subject to client bookings and calendar conflicts.</p>
   </template>
   <template v-else-if="selected.weeklyId"><fieldset :disabled="!canEdit||busy||loading"><label>Remove opening<select v-model="closeScope"><option value="single">This date only</option><option value="future">This and future dates</option></select></label><button type="button" @click="closeOpening">Delete this virtual opening</button></fieldset><p class="muted">This removes the saved {{selected.weeklyWindow}} availability window on the selected dates; existing client appointments stay in place.</p></template>
   <button type="button" @click="selected=null">Close details</button>
  </section>
  <section v-if="settings.virtual" class="edit-panel">
   <h3>Add virtual availability</h3><p>Virtual openings can be added outside your office reservations. To offer in-person or combined availability, select a reserved office hour in the calendar.</p>
   <fieldset :disabled="!canEdit||busy||loading"><div class="row"><label>Date<input ref="openingDate" v-model="opening.date" type="date" :min="calendar?.today" /></label><label>Start time<input v-model="opening.startTime" type="time" /></label><label>Repeat<select v-model="opening.frequency"><option value="ONCE">This date only</option><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every other week</option><option value="MONTHLY">Monthly — same weekday and week</option></select></label></div><p>One hour · Virtual · {{calendar?.timeZone}}</p><button type="button" class="primary" @click="addOpening">Publish virtual opening</button></fieldset>
  </section>

  </template>
  <section v-if="calendar &amp;&amp; view==='settings'" class="format-openings">
   <article v-if="settings.inPerson"><h3>In-person openings this week</h3><ul v-if="calendar.inPersonSlots?.length"><li v-for="(slot,i) in calendar.inPersonSlots" :key="i">{{slotDay(slot.startAt)}} · {{time(slot.startAt)}}–{{time(slot.endAt)}}</li></ul><p v-else>No public in-person openings this week. Open reserved office hours in Set Availability.</p></article>
   <article v-if="settings.virtual"><h3>Virtual openings this week</h3><ul v-if="calendar.virtualSlots?.length"><li v-for="(slot,i) in calendar.virtualSlots" :key="i">{{slotDay(slot.startAt)}} · {{time(slot.startAt)}}–{{time(slot.endAt)}}</li></ul><p v-else>No public virtual openings this week. Add an hour in Set Availability.</p></article>
   <p>Continue to Set Availability to add or remove openings. Your public profile shows the live result.</p>
  </section>
  <p v-if="calendar?.diagnostics?.length" class="muted">Some saved openings are hidden by schedule conflicts or profile settings. The calendar shows the openings that are currently available.</p>
  <button type="button" class="primary" :disabled="readonly||busy||loading||!calendar||!!error" @click="emit('complete',{reviewed:true,weeklyAvailabilityReviewed:true})">{{view==='settings'?'Confirm public profile settings':'Confirm weekly availability'}}</button>

 </div>
</template>
<script setup>
import {computed,nextTick,onMounted,reactive,ref,watch} from 'vue';
import api from '../../services/api';
import {providerProfileUrl} from '../../utils/providerProfileLinks';
import {calendarDays,shiftDate} from '../../utils/providerUpdateCalendar';
const props=defineProps({agencyId:[Number,String],mode:{type:String,default:'auth'},token:String,data:Object,readonly:Boolean,view:{type:String,default:'calendar'}});
const emit=defineEmits(['complete']);
const base=computed(()=>props.mode==='token'?`/public/provider-update/${encodeURIComponent(props.token)}`:'/provider-update/me');
const calendar=ref(null),loading=ref(false),busy=ref(false),error=ref(''),message=ref(''),qr=ref(''),selected=ref(null),officeFormat=ref('private'),officeFrequency=ref('ONCE'),closeScope=ref('single'),selectionPanel=ref(null),openingDate=ref(null);
const opening=reactive({date:'',startTime:'09:00',frequency:'ONCE'}),settings=reactive({acceptingNewClients:false,inPerson:false,virtual:false});
const profileService=ref('counseling');
const canEdit=computed(()=>!props.readonly&&!!calendar.value?.canEdit);
const days=computed(()=>calendarDays(calendar.value));
const hourHeight=76;
const firstHour=computed(()=>Math.min(7,...days.value.flatMap(d=>d.events.map(e=>Math.floor(e.startMinute/60)))));
const lastHour=computed(()=>Math.max(20,...days.value.flatMap(d=>d.events.map(e=>Math.ceil(e.endMinute/60)))));
const hours=computed(()=>Array.from({length:lastHour.value-firstHour.value+1},(_,i)=>firstHour.value+i));
const calendarHeight=computed(()=>(lastHour.value-firstHour.value)*hourHeight);
const profileUrl=computed(()=>{const c=calendar.value,slug=c?.agency?.portal_url||c?.agency?.slug;if(!c?.provider?.id||!slug||c.profileServices?.length===0)return '';if(slug==='itsco'&&profileService.value==='counseling')return providerProfileUrl(c.provider);const path=`/${encodeURIComponent(slug)}/provider/${c.provider.id}?serviceType=${encodeURIComponent(profileService.value)}`;return new URL(path,window.location.origin).href;});
const selectedAssignment=computed(()=>calendar.value?.assignments?.find(s=>Number(s.id)===Number(selected.value?.assignmentId)));
const slotDay=value=>new Date(value).toLocaleDateString('en-US',{timeZone:calendar.value?.timeZone,weekday:'short',month:'short',day:'numeric'});
const time=value=>new Date(value).toLocaleTimeString('en-US',{timeZone:calendar.value?.timeZone,hour:'numeric',minute:'2-digit'});
function eventStyle(event,events){
 const overlapping=events.filter(e=>e.startMinute<event.endMinute&&e.endMinute>event.startMinute),index=overlapping.indexOf(event),columns=Math.max(1,overlapping.length);
 return {top:`${(event.startMinute-firstHour.value*60)*hourHeight/60}px`,height:`${Math.max(32,(event.endMinute-event.startMinute)*hourHeight/60-3)}px`,width:`calc(${100/columns}% - 4px)`,left:`calc(${index*100/columns}% + 2px)`};
}
let loadId=0;
async function load(weekStart=''){
 const id=++loadId;loading.value=true;error.value='';
 try{const {data}=await api.get(`${base.value}/availability-calendar`,{params:{agencyId:props.agencyId,...(weekStart?{weekStart}:{})},timeout:60000});if(id!==loadId)return;calendar.value=data;Object.assign(settings,data.preferences);if(data.profileServices?.length&&!data.profileServices.includes(profileService.value))profileService.value=data.profileServices[0];if(!opening.date)opening.date=data.today;selected.value=null;}
 catch(e){if(id===loadId)error.value=e.response?.data?.error?.message||'The calendar could not be loaded. Refresh before making changes.';}
 finally{if(id===loadId)loading.value=false;}
}
function navigate(amount){if(calendar.value)load(shiftDate(calendar.value.weekStart,amount));}
async function selectEvent(event){selected.value=event;closeScope.value='single';await nextTick();officeFrequency.value='ONCE';officeFormat.value=event.label==='In person or virtual'?'both':event.label==='In person'?'inPerson':event.label==='Virtual'?'virtual':'private';selectionPanel.value?.focus();}
async function startOpening(date){opening.date=date;selected.value=null;await nextTick();openingDate.value?.focus();}
async function mutate(action,payload,success,weekStart){if(!canEdit.value||busy.value||loading.value)return;busy.value=true;error.value='';message.value='';try{await api.post(`${base.value}/availability-calendar/${action}`,{agencyId:props.agencyId,...payload},{timeout:60000});message.value=success;await load(weekStart||calendar.value.weekStart);}catch(e){error.value=e.response?.data?.error?.message||'The change could not be confirmed. Refresh the calendar before trying again.';}finally{busy.value=false;}}
function addOpening(){return mutate('virtual',{...opening},'Your virtual opening was saved. View your live profile to see the available time.',opening.date);}
function saveOffice(){return mutate('office',{eventId:selected.value.id,frequency:officeFrequency.value,inPerson:['inPerson','both'].includes(officeFormat.value),virtual:['virtual','both'].includes(officeFormat.value)},'Office availability saved. Booked occurrences remain unavailable.');}
function closeOpening(){return mutate('close',{id:selected.value.weeklyId,date:selected.value.date,scope:closeScope.value},'Virtual availability removed for the selected dates.');}
function saveSettings(){return mutate('settings',{acceptingNewClients:settings.acceptingNewClients,inPerson:settings.inPerson,virtual:settings.virtual},'Profile availability settings saved.');}
async function copyProfile(){try{await navigator.clipboard.writeText(profileUrl.value);message.value='Profile link copied.';}catch{message.value='Select the profile link above and copy it.';}}
async function makeQr(){try{const QRCode=(await import('qrcode')).default;qr.value=await QRCode.toDataURL(profileUrl.value,{width:320,margin:2});}catch{error.value='The QR code could not be created. You can still copy your profile link.';}}
watch(profileUrl,()=>{qr.value='';});
onMounted(()=>load());
</script>
<style scoped>
.availability-review{display:grid;gap:18px;min-width:0;color:#243c32}.availability-review p{line-height:1.55;margin:0}.availability-review h3{margin:0 0 10px}.profile-share{background:#f0f7f3;border:1px solid #c7dfcf;border-radius:14px;padding:20px;display:flex;gap:24px;align-items:center}.profile-share>div:first-child{display:grid;gap:12px;flex:1;min-width:0}.profile-share input{width:100%;box-sizing:border-box}.qr{display:grid;gap:8px;text-align:center}.qr img{width:150px}.row,.week-toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.week-toolbar{justify-content:space-between}.availability-review button,.button,.availability-review input,.availability-review select{font:inherit;padding:9px 12px;border-radius:8px;border:1px solid #b5c9bc;background:white;color:inherit;box-sizing:border-box}.availability-review button,.button{cursor:pointer;text-decoration:none}.primary,.availability-review button.primary{background:#376b50;color:#fff;border-color:#376b50;width:fit-content}.availability-review button:disabled{opacity:.5;cursor:default}.availability-review label{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.profile-share label{display:grid}.notice{padding:12px;background:#eef5f8;border-radius:8px}.error{color:#a52b29;background:#fff1f0;padding:12px;border-radius:8px}.muted{color:#617368;font-size:.9rem}.key{display:inline-block;padding:4px 8px;margin:3px;border-radius:5px}.open{background:#e4f4ea;border-color:#71a88a!important;color:#174f32}.reserved{background:#fff5dc;border-color:#dec385!important;color:#6e4c0c}.busy{background:#edf0f4;border-color:#c7ced8!important;color:#40516a}.calendar-scroll{max-width:100%;overflow-x:auto;border:1px solid #d9e3dd;border-radius:12px}.week-grid{display:grid;grid-template-columns:70px repeat(7,minmax(135px,1fr));min-width:1050px}.day-column{min-width:0;border-left:1px solid #e0e7e2}.day-heading{box-sizing:border-box;height:54px;display:flex;align-items:center;justify-content:center;margin:0;background:#f7faf8;font-size:.85rem;border-bottom:1px solid #d9e3dd}.today{background:#dcefe2;color:#245737}.day-body{position:relative}.hour-label{position:absolute;right:9px;font-size:.72rem;transform:translateY(-.4em);color:#677a6d}.hour-label:first-child{transform:translateY(0)}.hour-line{position:absolute;width:100%;border-top:1px solid #e6ece8}.calendar-event{position:absolute;display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:2px;overflow:hidden;padding:5px!important;border-radius:5px!important;font-size:.72rem!important;z-index:1}.calendar-event.open{background:#e4f4ea}.calendar-event.reserved{background:#fff5dc}.calendar-event.busy{background:#edf0f4}.calendar-event strong{font-size:.66rem;white-space:nowrap}.calendar-event small{font-size:.66rem}.day-add{margin:8px 4px;font-size:.78rem!important;width:calc(100% - 8px)}.edit-panel,.settings{border:1px solid #ccd9d1;border-radius:12px;padding:18px;display:grid;gap:12px}.settings summary{cursor:pointer;font-weight:650}.settings[open] summary{margin-bottom:14px}.availability-review fieldset{border:0;display:grid;gap:12px;padding:0;margin:0;min-width:0}.availability-review :focus-visible{outline:3px solid #578878;outline-offset:3px}@media(max-width:650px){.profile-share{align-items:flex-start;flex-direction:column}.row label{width:100%}}
</style>
