<template>
 <div class="availability-review">
  <p v-if="view==='calendar'">Click a reserved office hour to make it OPEN for online booking—in person, virtually, or both. Click an empty calendar time to request a recurring room or make virtual appointments Open. A room request goes through the existing scheduling review; it does not schedule a client or meeting. Choose weekly, every other week, or every four weeks. Booked appointments and other commitments stay unavailable.</p>
  <p v-if="readonly" class="notice">Read-only preview. You can browse weeks and open the public profile. Publishing is available through the provider’s own update link.</p>
  <section v-if="calendar &amp;&amp; view==='settings'" class="settings">
   <h3>How new clients can connect with you</h3><p>Choose a status for each appointment format at {{calendar.agency?.name}}. Your profile stays listed when a format is Closed.</p>
   <fieldset :disabled="!canEdit||busy||loading">
    <label>In-person appointments<select v-model="settings.inPersonStatus" @change="saveSettings"><option value="accepting">Open — accepting new clients</option><option value="waitlist">Waitlist — accept waitlist requests</option><option value="unavailable">Closed — not accepting new clients</option></select></label>
    <label>Virtual appointments<select v-model="settings.virtualStatus" @change="saveSettings"><option value="accepting">Open — accepting new clients</option><option value="waitlist">Waitlist — accept waitlist requests</option><option value="unavailable">Closed — not accepting new clients</option></select></label>
    <p><strong>Open:</strong> Publish recurring appointment openings in Set Availability. Providers with published openings receive priority in the directory. If you are Open without any published openings, your account will continue to show a reminder to set availability. <strong>Waitlist:</strong> Clients can review your typical availability and request your waitlist for that format. <strong>Closed:</strong> No new-client bookings or waitlist requests for that format. Existing appointments stay in place.</p><p>Keep Typical Availability up to date so people joining your waitlist know the days and times you usually offer.</p><p role="status">Changes save automatically.</p>
   </fieldset>
  </section>
  <div v-if="view==='profile' &amp;&amp; profileUrl" class="profile-share">
   <div><h3>Your public profile</h3><p>Your biography, photo, focus areas, and published openings appear here. Changes are saved as you select them. Open your profile to review your information, appointment statuses, typical availability, and current published openings.</p>
    <label v-if="calendar.profileServices?.length>1">Profile service<select v-model="profileService"><option v-for="service in calendar.profileServices" :key="service" :value="service">{{service}}</option></select></label>
    <a :href="profileUrl" target="_blank" rel="noopener noreferrer" class="primary button">View my live profile ↗</a>
    <label>Shareable profile link<input :value="profileUrl" readonly aria-label="Shareable profile link" @focus="$event.target.select()" /></label>
    <div class="row"><button type="button" @click="copyProfile">Copy profile link</button><button type="button" @click="makeQr">Create profile QR code</button></div>
   </div>
   <div v-if="qr" class="qr"><img :src="qr" alt="QR code for your public provider profile" /><a :href="qr" :download="`provider-${calendar.provider.id}-profile.png`">Download QR code</a></div>
  </div>
  <p v-if="view==='profile' && calendar && !profileUrl" class="notice">A public profile service and agency web address must be configured before a shareable profile is available.</p>
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
     <div class="day-body" :class="{'can-add':canEdit}" :style="{height:`${calendarHeight}px`}" @click.self="chooseCalendarTime($event,day.date)">
      <span v-for="hour in hours" :key="hour" class="hour-line" :style="{top:`${(hour-firstHour)*hourHeight}px`}" />
      <button v-for="event in day.events" :key="event.key" type="button" class="calendar-event" :class="event.kind" :style="eventStyle(event,day.events)" :title="`${time(event.startAt)}–${time(event.endAt)} · ${event.label} · ${event.detail||''}`" @click.stop="selectEvent(event)">
       <strong>{{time(event.startAt)}}–{{time(event.endAt)}}</strong><span>{{event.label}}</span><small>{{event.detail}}</small>
      </button>
     </div>
     <button type="button" class="day-add" v-if="canEdit" :disabled="busy||loading||day.date<calendar.today" @click="startOpening(day.date)">+ Available hour</button>
    </section>
   </div>
  </div>
  <p v-if="calendar && !calendar.canEdit && !readonly" class="notice">This update can display your schedule. Publishing requires an active care-provider assignment and a schedule owned by this agency. A shared schedule must be edited in its originating agency.</p>
  <section v-if="selected" ref="selectionPanel" class="edit-panel" tabindex="-1">
   <h3>{{selected.office?'Reserved office hour':'Selected time'}} · {{time(selected.startAt)}}–{{time(selected.endAt)}}</h3>
   <p>{{selected.label}} · {{selected.detail}}</p>
   <p v-if="selected.kind==='busy'">This time is blocked by a commitment or an unavailable room. Existing appointments are managed in your regular schedule.</p>
   <template v-else-if="selected.office">
    <p>Make this reserved office hour OPEN for online booking when it has no client appointment. Repeating choices use your existing recurring room reservation.</p>
    <p v-if="!selected.assignmentId" class="notice">This is a one-time reservation. Only recurring office reservations can be opened in this updater.</p>
    <fieldset :disabled="!canEdit||busy||loading||!selected.assignmentId"><label>Offer this office hour<select v-model="officeFormat"><option value="private">Keep private / occupied</option><option v-if="inPersonOpen" value="inPerson">In person</option><option v-if="virtualOpen" value="virtual">Virtual</option><option v-if="inPersonOpen &amp;&amp; virtualOpen" value="both">In person or virtual</option></select></label><label>Repeat<select v-model="officeFrequency"><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every other week</option><option value="EVERY_4_WEEKS">Every four weeks</option></select></label><button type="button" class="primary" @click="saveOffice">Save this availability</button></fieldset>
    <p class="muted">“Keep private” removes the public opening, keeping your room reservation. Future openings remain subject to client bookings and calendar conflicts.</p>
   </template>
   <template v-else-if="selected.weeklyId"><fieldset :disabled="!canEdit||busy||loading"><label>Remove opening<select v-model="closeScope"><option value="single">This date only</option><option value="future">This and future dates</option></select></label><button type="button" @click="closeOpening">Delete this virtual opening</button></fieldset><p class="muted">This removes the saved {{selected.weeklyWindow}} availability window on the selected dates; existing client appointments stay in place.</p></template>
   <button type="button" @click="selected=null">Close details</button>
  </section>
  <section v-if="openingChoice!==null" ref="virtualPanel" class="edit-panel">
   <h3>What would you like to make available?</h3><div class="row"><button type="button" @click="openingChoice='room';rooms=[]">Request a recurring room</button><button type="button" @click="openingChoice='virtual'">Open virtual appointments</button><button type="button" @click="openingChoice=null">Cancel</button></div>
   <template v-if="openingChoice==='room'"><p>Request a room for one hour, repeating weekly, every other week, or every four weeks. The room search checks the next six occurrences. Staff review the request before it becomes your office reservation.</p><fieldset :disabled="!canEdit||busy||loading"><div class="row"><label>Date<input v-model="opening.date" type="date" :min="calendar?.today" /></label><label>Start<input v-model="opening.startTime" type="time" /></label><label>Repeat<select v-model="opening.frequency"><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every other week</option><option value="EVERY_4_WEEKS">Every four weeks</option></select></label><label>Office<select v-model="requestLocation"><option value="">Choose an office</option><option v-for="office in calendar?.offices||[]" :key="office.id" :value="office.id">{{office.name}} · {{office.city}}</option></select></label></div><button type="button" @click="findRooms">Find available rooms</button><label v-if="rooms.length">Room<select v-model="requestRoom"><option value="">Choose a room</option><option v-for="room in rooms" :key="room.id" :value="room.id">{{room.label||room.name}}</option></select></label><p v-if="roomsChecked && !rooms.length">No rooms are available for that pattern. Try another office or time.</p><button v-if="rooms.length" type="button" class="primary" @click="requestOffice">Submit room request</button></fieldset></template>
   <template v-if="openingChoice==='virtual'">
   <h3>Add virtual availability</h3><p>Publishing this hour also sets Virtual appointments to Open on your public profile. Cancel above to keep your current setting.</p><p>Virtual openings can be added outside your office reservations. To offer in-person or combined availability, select a reserved office hour in the calendar.</p>
   <fieldset :disabled="!canEdit||busy||loading"><div class="row"><label>Date<input ref="openingDate" v-model="opening.date" type="date" :min="calendar?.today" /></label><label>Start time<input v-model="opening.startTime" type="time" /></label><label>Repeat<select v-model="opening.frequency"><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every other week</option><option value="EVERY_4_WEEKS">Every four weeks</option></select></label></div><p>One hour · Virtual · {{calendar?.timeZone}}</p><button type="button" class="primary" @click="addOpening">Publish virtual opening</button></fieldset></template>
  </section>

  </template>
  <section v-if="calendar &amp;&amp; view==='settings'" class="format-openings">
   <article v-if="inPersonOpen"><h3>In-person openings this week</h3><ul v-if="calendar.inPersonSlots?.length"><li v-for="(slot,i) in calendar.inPersonSlots" :key="i">{{slotDay(slot.startAt)}} · {{time(slot.startAt)}}–{{time(slot.endAt)}}</li></ul><p v-else>No public in-person openings this week. Open reserved office hours in Set Availability.</p></article>
   <article v-if="virtualOpen"><h3>Virtual openings this week</h3><ul v-if="calendar.virtualSlots?.length"><li v-for="(slot,i) in calendar.virtualSlots" :key="i">{{slotDay(slot.startAt)}} · {{time(slot.startAt)}}–{{time(slot.endAt)}}</li></ul><p v-else>No public virtual openings this week. Add an hour in Set Availability.</p></article>
   <p>Continue to Set Availability to add or remove openings. Your public profile shows the live result.</p>
  </section>
  <p v-if="calendar?.diagnostics?.length" class="muted">Some saved openings are hidden by schedule conflicts or profile settings. The calendar shows the openings that are currently available.</p>
  <button type="button" class="primary" :disabled="readonly||busy||loading||!calendar||!!error" @click="emit('complete',{reviewed:true,weeklyAvailabilityReviewed:true})">{{view==='settings'?'Confirm public profile settings':view==='profile'?'Confirm public profile review':'Confirm weekly availability'}}</button>

 </div>
</template>
<script setup>
import {computed,nextTick,onMounted,onUnmounted,reactive,ref,watch} from 'vue';
import api from '../../services/api';
import {providerProfileUrl} from '../../utils/providerProfileLinks';
import {calendarDays,shiftDate} from '../../utils/providerUpdateCalendar';
const props=defineProps({agencyId:[Number,String],mode:{type:String,default:'auth'},token:String,data:Object,readonly:Boolean,view:{type:String,default:'calendar'}});
const emit=defineEmits(['complete']);
const base=computed(()=>props.mode==='token'?`/public/provider-update/${encodeURIComponent(props.token)}`:'/provider-update/me');
const calendar=ref(null),loading=ref(false),busy=ref(false),error=ref(''),message=ref(''),qr=ref(''),selected=ref(null),officeFormat=ref('private'),officeFrequency=ref('WEEKLY'),closeScope=ref('single'),selectionPanel=ref(null),openingDate=ref(null),virtualPanel=ref(null);
const openingChoice=ref(null),requestLocation=ref(''),requestRoom=ref(''),rooms=ref([]),roomsChecked=ref(false);
const opening=reactive({date:'',startTime:'09:00',frequency:'WEEKLY'}),settings=reactive({inPersonStatus:'unavailable',virtualStatus:'unavailable'});
const inPersonOpen=computed(()=>settings.inPersonStatus==='accepting'),virtualOpen=computed(()=>settings.virtualStatus==='accepting');
const profileService=ref('counseling');
const canEdit=computed(()=>!props.readonly&&!!calendar.value?.canEdit);
const days=computed(()=>calendarDays(calendar.value));
const hourHeight=76;
const firstHour=computed(()=>Math.min(7,...days.value.flatMap(d=>d.events.map(e=>Math.floor(e.startMinute/60)))));
const lastHour=computed(()=>Math.max(20,...days.value.flatMap(d=>d.events.map(e=>Math.ceil(e.endMinute/60)))));
const hours=computed(()=>Array.from({length:lastHour.value-firstHour.value+1},(_,i)=>firstHour.value+i));
const calendarHeight=computed(()=>(lastHour.value-firstHour.value)*hourHeight);
const profileUrl=computed(()=>{const c=calendar.value,slug=c?.agency?.portal_url||c?.agency?.slug;if(!c?.provider?.id||!slug||c.profileServices?.length===0)return '';if(slug==='itsco'&&profileService.value==='counseling')return providerProfileUrl(c.provider);const path=`/${encodeURIComponent(slug)}/provider/${c.provider.id}?serviceType=${encodeURIComponent(profileService.value)}`;return new URL(path,window.location.origin).href;});
const slotDay=value=>new Date(value).toLocaleDateString('en-US',{timeZone:calendar.value?.timeZone,weekday:'short',month:'short',day:'numeric'});
const time=value=>new Date(value).toLocaleTimeString('en-US',{timeZone:calendar.value?.timeZone,hour:'numeric',minute:'2-digit'});
function eventStyle(event,events){
 const overlapping=events.filter(e=>e.startMinute<event.endMinute&&e.endMinute>event.startMinute),index=overlapping.indexOf(event),columns=Math.max(1,overlapping.length);
 return {top:`${(event.startMinute-firstHour.value*60)*hourHeight/60}px`,height:`${Math.max(32,(event.endMinute-event.startMinute)*hourHeight/60-3)}px`,width:`calc(${100/columns}% - 4px)`,left:`calc(${index*100/columns}% + 2px)`};
}
let loadId=0;
async function load(weekStart=''){
 const id=++loadId;loading.value=true;error.value='';
 try{const {data}=await api.get(`${base.value}/availability-calendar`,{params:{agencyId:props.agencyId,...(weekStart?{weekStart}:{})},timeout:60000});if(id!==loadId)return;calendar.value=data;const p=data.preferences||{},fallback=format=>(format==='IN_PERSON'?p.inPerson:p.virtual)?p.acceptingNewClients?'accepting':p.waitlistEnabled?'waitlist':'unavailable':'unavailable';settings.inPersonStatus=p.intakeStatusByFormat?.IN_PERSON||fallback('IN_PERSON');settings.virtualStatus=p.intakeStatusByFormat?.VIRTUAL||fallback('VIRTUAL');if(data.profileServices?.length&&!data.profileServices.includes(profileService.value))profileService.value=data.profileServices[0];if(!opening.date)opening.date=data.today;selected.value=null;}
 catch(e){if(id===loadId)error.value=e.response?.data?.error?.message||'The calendar could not be loaded. Refresh before making changes.';}
 finally{if(id===loadId)loading.value=false;}
}
function navigate(amount){if(calendar.value)load(shiftDate(calendar.value.weekStart,amount));}
async function selectEvent(event){selected.value=event;closeScope.value='single';await nextTick();officeFrequency.value='WEEKLY';officeFormat.value=event.label==='In person or virtual'?'both':event.label==='In person'?'inPerson':event.label==='Virtual'?'virtual':'private';selectionPanel.value?.focus();}
async function startOpening(date,startTime){if(!canEdit.value||busy.value||loading.value||date<calendar.value.today)return;openingChoice.value='choose';rooms.value=[];roomsChecked.value=false;opening.date=date;if(startTime)opening.startTime=startTime;selected.value=null;await nextTick();virtualPanel.value?.scrollIntoView?.({behavior:'smooth',block:'start'});openingDate.value?.focus({preventScroll:true});}
function chooseCalendarTime(event,date){const hour=Math.min(22,Math.max(0,firstHour.value+Math.floor((event.clientY-event.currentTarget.getBoundingClientRect().top)/hourHeight)));return startOpening(date,`${String(hour).padStart(2,'0')}:00`);}
async function mutate(action,payload,success,weekStart){if(!canEdit.value||busy.value||loading.value)return;busy.value=true;error.value='';message.value='';try{await api.post(`${base.value}/availability-calendar/${action}`,{agencyId:props.agencyId,...payload},{timeout:60000});message.value=success;await load(weekStart||calendar.value.weekStart);}catch(e){error.value=e.response?.data?.error?.message||'The change could not be confirmed. Refresh the calendar before trying again.';}finally{busy.value=false;}}
function addOpening(){return mutate('virtual',{...opening,enableVirtualOpen:true},'Your virtual opening was saved. Review it in the My Public Profile step later in this update.',opening.date);}
function saveOffice(){return mutate('office',{eventId:selected.value.id,frequency:officeFrequency.value,inPerson:['inPerson','both'].includes(officeFormat.value),virtual:['virtual','both'].includes(officeFormat.value)},'Office availability saved. Booked occurrences remain unavailable.');}
function closeOpening(){return mutate('close',{id:selected.value.weeklyId,date:selected.value.date,scope:closeScope.value},'Virtual availability removed for the selected dates.');}
function saveSettings(){return mutate('settings',{inPersonStatus:settings.inPersonStatus,virtualStatus:settings.virtualStatus},'Profile availability settings saved.');}
watch(()=>[opening.date,opening.startTime,opening.frequency,requestLocation.value],()=>{rooms.value=[];requestRoom.value='';roomsChecked.value=false;});
async function findRooms(){if(!canEdit.value||busy.value)return;busy.value=true;error.value='';try{const result=await api.get(`${base.value}/availability-rooms`,{params:{agencyId:props.agencyId,locationId:requestLocation.value,...opening}});rooms.value=result.data.rooms||[];roomsChecked.value=true;}catch(e){error.value=e.response?.data?.error?.message||'Unable to check rooms.';}finally{busy.value=false;}}
async function requestOffice(){if(!canEdit.value||busy.value||!requestRoom.value)return;busy.value=true;error.value='';try{await api.post(`${base.value}/availability-rooms`,{agencyId:props.agencyId,locationId:requestLocation.value,roomId:requestRoom.value,...opening});message.value='Room request submitted for scheduling review. No client appointment was created.';openingChoice.value=null;await load(calendar.value.weekStart);}catch(e){error.value=e.response?.data?.error?.message||'Unable to request this room.';}finally{busy.value=false;}}
async function copyProfile(){try{await navigator.clipboard.writeText(profileUrl.value);message.value='Profile link copied.';}catch{message.value='Select the profile link above and copy it.';}}
async function makeQr(){try{const QRCode=(await import('qrcode')).default;qr.value=await QRCode.toDataURL(profileUrl.value,{width:320,margin:2});}catch{error.value='The QR code could not be created. You can still copy your profile link.';}}
watch(profileUrl,()=>{qr.value='';});
function refresh(){if(calendar.value&&!busy.value&&!loading.value&&!document.hidden)load(calendar.value.weekStart);}
function changed(event){if(Number(event.detail?.agencyId)===Number(props.agencyId))refresh();}
watch(()=>[props.view,props.token,props.agencyId],()=>load());
onMounted(()=>{load();window.addEventListener('focus',refresh);window.addEventListener('provider-update-availability-changed',changed);document.addEventListener('visibilitychange',refresh);});
onUnmounted(()=>{loadId++;window.removeEventListener('focus',refresh);window.removeEventListener('provider-update-availability-changed',changed);document.removeEventListener('visibilitychange',refresh);});
</script>
<style scoped>
.availability-review{display:grid;gap:18px;min-width:0;color:#243c32}.availability-review p{line-height:1.55;margin:0}.availability-review h3{margin:0 0 10px}.profile-share{background:#f0f7f3;border:1px solid #c7dfcf;border-radius:14px;padding:20px;display:flex;gap:24px;align-items:center}.profile-share>div:first-child{display:grid;gap:12px;flex:1;min-width:0}.profile-share input{width:100%;box-sizing:border-box}.qr{display:grid;gap:8px;text-align:center}.qr img{width:150px}.row,.week-toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.week-toolbar{justify-content:space-between}.availability-review button,.button,.availability-review input,.availability-review select{font:inherit;padding:9px 12px;border-radius:8px;border:1px solid #b5c9bc;background:white;color:inherit;box-sizing:border-box}.availability-review button,.button{cursor:pointer;text-decoration:none}.primary,.availability-review button.primary{background:#376b50;color:#fff;border-color:#376b50;width:fit-content}.availability-review button:disabled{opacity:.5;cursor:default}.availability-review label{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.profile-share label{display:grid}.notice{padding:12px;background:#eef5f8;border-radius:8px}.error{color:#a52b29;background:#fff1f0;padding:12px;border-radius:8px}.muted{color:#617368;font-size:.9rem}.key{display:inline-block;padding:4px 8px;margin:3px;border-radius:5px}.open{background:#e4f4ea;border-color:#71a88a!important;color:#174f32}.reserved{background:#fff5dc;border-color:#dec385!important;color:#6e4c0c}.busy{background:#edf0f4;border-color:#c7ced8!important;color:#40516a}.calendar-scroll{max-width:100%;overflow-x:auto;border:1px solid #d9e3dd;border-radius:12px}.week-grid{display:grid;grid-template-columns:70px repeat(7,minmax(135px,1fr));min-width:1050px}.day-column{min-width:0;border-left:1px solid #e0e7e2}.day-heading{box-sizing:border-box;height:54px;display:flex;align-items:center;justify-content:center;margin:0;background:#f7faf8;font-size:.85rem;border-bottom:1px solid #d9e3dd}.today{background:#dcefe2;color:#245737}.day-body{position:relative}.day-body.can-add{cursor:crosshair}.hour-label{position:absolute;right:9px;font-size:.72rem;transform:translateY(-.4em);color:#677a6d}.hour-label:first-child{transform:translateY(0)}.hour-line{pointer-events:none;position:absolute;width:100%;border-top:1px solid #e6ece8}.calendar-event{position:absolute;display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:2px;overflow:hidden;padding:5px!important;border-radius:5px!important;font-size:.72rem!important;z-index:1}.calendar-event.open{background:#e4f4ea}.calendar-event.reserved{background:#fff5dc}.calendar-event.busy{background:#edf0f4}.calendar-event strong{font-size:.66rem;white-space:nowrap}.calendar-event small{font-size:.66rem}.day-add{margin:8px 4px;font-size:.78rem!important;width:calc(100% - 8px)}.edit-panel,.settings{border:1px solid #ccd9d1;border-radius:12px;padding:18px;display:grid;gap:12px}.settings summary{cursor:pointer;font-weight:650}.settings[open] summary{margin-bottom:14px}.availability-review fieldset{border:0;display:grid;gap:12px;padding:0;margin:0;min-width:0}.availability-review :focus-visible{outline:3px solid #578878;outline-offset:3px}@media(max-width:650px){.profile-share{align-items:flex-start;flex-direction:column}.row label{width:100%}}
</style>
