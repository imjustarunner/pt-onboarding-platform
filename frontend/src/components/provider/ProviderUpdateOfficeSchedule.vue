<template>
 <div class="availability-review">
  <p v-if="view==='calendar'">Click a reserved office hour to make it OPEN for online booking—in person, virtually, or both. Click an empty calendar time to request a recurring room or make virtual appointments Open. A room request goes through the existing scheduling review; it does not schedule a client or meeting. Choose weekly, every other week, or every four weeks. Booked appointments and other commitments stay unavailable.</p>
  <p v-if="readonly" class="notice">Preview: click calendar times and try the availability controls. Changes cannot be published from this preview; use the provider’s own update link to save.</p>
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
   <div v-if="qr" class="qr"><p>Share your profile</p><img :src="qr" alt="Agency-branded QR code for your public provider profile" /><a :href="qr" :download="`provider-${calendar.provider.id}-profile.png`">Download QR code</a></div>
  </div>
  <p v-if="view==='profile' && calendar && !profileUrl" class="notice">A public profile service and agency web address must be configured before a shareable profile is available.</p>
  <p v-if="message" role="status" class="notice">{{message}}</p>
  <p v-if="error" role="alert" class="error">{{error}}</p>
  <template v-if="view==='calendar'">
  <section v-if="calendar?.pendingRoomRequests?.length" class="notice" aria-label="Pending room requests">
   <h3>Room requests awaiting approval</h3>
   <p>These are saved requests, not confirmed reservations or published client openings. Scheduling staff must approve the room first.</p>
   <ul><li v-for="request in calendar.pendingRoomRequests" :key="request.id">
    <strong>{{slotDay(request.startAt)}} · {{time(request.startAt)}}–{{time(request.endAt)}}</strong>
    · {{request.officeName}} · {{officeRoomLabel({...request,label:request.roomLabel})}} · {{requestFrequency(request.frequency)}} · Pending approval
   </li></ul>
  </section>
  <div class="week-toolbar">
   <h3>Your week</h3><div class="row"><button type="button" :disabled="loading||busy" aria-label="Previous week" @click="navigate(-7)">←</button><button type="button" :disabled="loading||busy" @click="load('')">This week</button><button type="button" :disabled="loading||busy" aria-label="Next week" @click="navigate(7)">→</button><label>Week of <input type="date" :value="calendar?.weekStart" :disabled="loading||busy" @change="load($event.target.value)" /></label><button type="button" :disabled="loading||busy" @click="load(calendar?.weekStart)">Refresh</button></div>
  </div>
  <p v-if="calendar" class="muted">{{calendar.timeZone}} · <span class="key open">Public opening</span> <span class="key reserved">Reserved / kept private</span> <span class="key busy">Unavailable</span> <span v-if="calendar.schoolAssignments?.length" class="key school">Reserved for school clients</span></p>
  <div v-if="calendar?.schoolAssignments?.length" class="notice"><p>School hours are reserved for that school’s clients, including virtual visits. Saved virtual hours can overlap school time, with a warning. Assigned school hours remain reserved from public booking until an hours change is approved.</p><button type="button" @click="openSchoolReview(false,true)">View school schedule</button></div>
  <p v-if="loading" role="status">Loading weekly calendar…</p>
  <p v-for="warning in calendar?.calendarWarnings||[]" :key="warning" role="alert" class="notice">{{warning}}</p>
  <div v-if="calendar" class="calendar-scroll" :aria-busy="loading" tabindex="0" aria-label="Weekly availability calendar; scroll horizontally to see all seven days">
   <div class="week-grid">
    <div class="time-column"><div class="day-heading">Time</div><div class="day-body" :style="{height:`${calendarHeight}px`}"><span v-for="hour in hours" :key="hour" class="hour-label" :style="{top:`${(hour-firstHour)*hourHeight}px`}">{{hour%12||12}} {{hour<12?'AM':'PM'}}</span></div></div>
    <section v-for="day in days" :key="day.date" class="day-column"><h4 class="day-heading" :class="{today:day.date===calendar.today}">{{day.label}}</h4>
     <div class="day-body" :class="{'can-add':canExplore}" :style="{height:`${calendarHeight}px`}" @click.self="chooseCalendarTime($event,day.date)">
      <span v-for="hour in hours" :key="hour" class="hour-line" :style="{top:`${(hour-firstHour)*hourHeight}px`}" />
      <button v-for="event in day.events" :key="event.key" type="button" class="calendar-event" :class="event.kind" :style="eventStyle(event,day.events)" :title="`${time(event.startAt)}–${time(event.endAt)} · ${event.label} · ${event.detail||''}`" @click.stop="selectEvent(event)">
       <strong>{{time(event.startAt)}}–{{time(event.endAt)}}</strong><span>{{event.label}}</span><small>{{event.detail}}</small>
      </button>
     </div>
     <button type="button" class="day-add" v-if="canExplore" :disabled="busy||loading" @click="startOpening(day.date)">+ Available hour</button>
    </section>
   </div>
  </div>
  <p v-if="calendar && !calendar.canEdit && canRequestRooms && !readonly" class="notice">Your existing office reservations allow you to request recurring rooms here. Publishing client openings separately requires an active care-provider assignment.</p>
  <p v-if="calendar && !calendar.canEdit && !canRequestRooms && !readonly" class="notice">This update can display your schedule. Publishing requires an active care-provider assignment and a schedule owned by this agency. A shared schedule must be edited in its originating agency.</p>
  <section v-if="selected" ref="selectionPanel" class="edit-panel" tabindex="-1">
   <h3>{{selected.office?'Reserved office hour':'Selected time'}} · {{time(selected.startAt)}}–{{time(selected.endAt)}}</h3>
   <p>{{selected.label}} · {{selected.detail}}</p>
   <template v-if="selectedSchool">
    <h4>Reserved for school clients</h4>
    <p>These hours{{selectedSchool.schoolName?` at ${selectedSchool.schoolName}`:''}} aren’t available for public booking, even when no appointment is scheduled. Virtual visits with school clients belong in the school schedule.</p>
    <p>To offer public appointments during this time, request a school-hours adjustment. The current hours stay reserved until approval. Existing appointments remain booked.</p>
    <div class="row"><button type="button" :disabled="busy||loading" @click="openSchoolReview()">View school schedule</button><button v-if="!readonly" type="button" class="primary" :disabled="busy||loading" @click="openSchoolReview(true)">Request school hours change</button></div>
   </template>
   <p v-else-if="selected.kind==='busy'">This time is blocked by a commitment or an unavailable room. Existing appointments are managed in your regular schedule.</p>
   <template v-else-if="selected.office">
    <p>Make this reserved office hour OPEN for online booking when it has no client appointment. Repeating choices use your existing recurring room reservation. Publishing an opening switches the selected format from Waitlist to Open.</p>
    <p v-if="!selected.assignmentId" class="notice">This is a one-time reservation. Only recurring office reservations can be opened in this updater.</p>
    <fieldset :disabled="!canEdit||busy||loading||!selected.assignmentId"><label>Offer this office hour<select v-model="officeFormat"><option value="private">Keep private / occupied</option><option v-if="inPersonOpen" value="inPerson">In person</option><option v-if="virtualOpen" value="virtual">Virtual</option><option v-if="inPersonOpen &amp;&amp; virtualOpen" value="both">In person or virtual</option></select></label><label>Repeat<select v-model="officeFrequency"><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every other week</option><option value="EVERY_4_WEEKS">Every four weeks</option></select></label><button type="button" class="primary" @click="saveOffice">Save this availability</button></fieldset>
    <p class="muted">“Keep private” removes the public opening, keeping your room reservation. Future openings remain subject to client bookings and calendar conflicts.</p>
   </template>
   <template v-else-if="selected.weeklyId"><fieldset :disabled="!canEdit||busy||loading"><label>Remove opening<select v-model="closeScope"><option value="single">This date only</option><option value="future">This and future dates</option></select></label><button type="button" @click="closeOpening">Delete this virtual opening</button></fieldset><p class="muted">This removes the saved {{selected.weeklyWindow}} availability window on the selected dates; existing client appointments stay in place.</p></template>
   <button type="button" @click="selected=null">Close details</button>
  </section>
  <section v-if="schoolReview" ref="schoolReviewPanel" class="edit-panel" tabindex="-1" aria-label="School schedule and change requests">
   <h3>School schedule</h3>
   <ProviderUpdateSchoolSchedule :key="`${schoolReview.assignmentId||0}-${schoolReview.requestChange}`" :base="base" :agency-id="agencyId" :school-id="schoolReview.schoolId" :initial-assignment-id="schoolReview.assignmentId" :request-change="schoolReview.requestChange" :readonly="readonly" hide-complete />
   <button type="button" @click="schoolReview=null;load(calendar.weekStart)">Back to public availability</button>
  </section>
  <section v-if="openingChoice!==null" ref="virtualPanel" class="edit-panel">
   <h3>What would you like to make available?</h3><div class="row"><button type="button" @click="openingChoice='room';rooms=[]">Request a recurring room</button><button v-if="canEdit || readonly" type="button" @click="openingChoice='virtual'">Open virtual appointments</button><button type="button" @click="openingChoice=null">Cancel</button></div>
   <template v-if="openingChoice==='room'"><p>Request a room for the full time range you need, repeating weekly, every other week, or every four weeks. The room search checks the next six occurrences. Staff review the request before it becomes your office reservation.</p><fieldset :disabled="!canExplore||busy||loading"><div class="request-fields"><label>Date<input v-model="opening.date" type="date" :min="calendar?.today" /></label><label>Start<input v-model="opening.startTime" type="time" step="3600" /></label><label>End<input v-model="roomEndTime" type="time" step="3600" :min="opening.startTime" aria-label="Room request end time" /></label><label>Repeat<select v-model="opening.frequency"><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every other week</option><option value="EVERY_4_WEEKS">Every four weeks</option></select></label><label>Office location<select v-model="requestLocation" aria-label="Office location"><option value="">Choose an office</option><option v-for="office in calendar?.offices||[]" :key="office.id" :value="office.id">{{[office.name,office.city].filter(Boolean).join(' · ')}}</option></select></label></div><p v-if="!roomRangeValid" class="error">Choose whole-hour times, with the end after the start.</p><button type="button" :disabled="!canRequestRooms||!requestLocation||!roomRangeValid" @click="findRooms">Find available rooms</button><label v-if="rooms.length" class="room-select">Room at {{selectedOfficeName}}<select v-model="requestRoom" aria-label="Available room"><option value="">Choose a room</option><option v-for="room in rooms" :key="room.id" :value="room.id">{{selectedOfficeName}} · {{officeRoomLabel(room)}}</option></select></label><p v-if="roomsChecked && !rooms.length">No rooms are available for that pattern. Try another office or time.</p><p v-if="selectedRoom" class="request-summary"><strong>Your request:</strong> {{selectedOfficeName}} · {{officeRoomLabel(selectedRoom)}}<br />{{opening.date}} · {{opening.startTime}}–{{roomEndTime}} · {{roomHours}} {{roomHours===1?'hour':'hours'}} · {{opening.frequency==='WEEKLY'?'Weekly':opening.frequency==='BIWEEKLY'?'Every other week':'Every four weeks'}}</p><button v-if="rooms.length" type="button" class="primary" :disabled="!canRequestRooms||!selectedRoom" @click="requestOffice">Submit room request</button></fieldset></template>
   <template v-if="openingChoice==='virtual'">
   <h3>Add public virtual availability</h3><p>Publishing this hour also sets Virtual appointments to Open on your public profile. Virtual visits for school clients are managed in the school schedule. Cancel above to keep your current setting.</p><p>Public virtual openings can be added outside your school hours and office reservations. To offer in-person or combined availability, select a reserved office hour in the calendar.</p>
   <fieldset :disabled="!canExplore||busy||loading"><div class="row"><label>Date<input ref="openingDate" v-model="opening.date" type="date" :min="calendar?.today" /></label><label>Start time<input v-model="opening.startTime" type="time" /></label><label>Repeat<select v-model="opening.frequency"><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every other week</option><option value="EVERY_4_WEEKS">Every four weeks</option></select></label></div><p>One hour · Virtual · {{calendar?.timeZone}}</p><button type="button" class="primary" :disabled="!canEdit" @click="addOpening">Publish virtual opening</button></fieldset></template>
  </section>

  </template>
  <section v-if="calendar &amp;&amp; view==='settings'" class="format-openings">
   <article v-if="inPersonOpen"><h3>In-person openings this week</h3><ul v-if="calendar.inPersonSlots?.length"><li v-for="(slot,i) in calendar.inPersonSlots" :key="i">{{slotDay(slot.startAt)}} · {{time(slot.startAt)}}–{{time(slot.endAt)}}</li></ul><p v-else>No public in-person openings this week. Open reserved office hours in Set Availability.</p></article>
   <article v-if="virtualOpen"><h3>Virtual openings this week</h3><ul v-if="calendar.virtualSlots?.length"><li v-for="(slot,i) in calendar.virtualSlots" :key="i">{{slotDay(slot.startAt)}} · {{time(slot.startAt)}}–{{time(slot.endAt)}}</li></ul><p v-else>No public virtual openings this week. Add an hour in Set Availability.</p></article>
   <p>Continue to Set Availability to add or remove openings. Your public profile shows the live result.</p>
  </section>
  <p v-if="calendar?.diagnostics?.length" class="muted">Some saved openings are hidden by schedule conflicts or profile settings. The calendar shows the openings that are currently available.</p>
  <button type="button" class="primary" :disabled="readonly||busy||loading||!calendar||!!error" @click="emit('complete',{reviewed:true,weeklyAvailabilityReviewed:true})">Save and continue</button>

 </div>
</template>
<script setup>
import {computed,nextTick,onMounted,onUnmounted,reactive,ref,watch} from 'vue';
import api from '../../services/api';
import {createProviderProfileQr} from '../../utils/providerProfileQr';
import {providerProfileUrl} from '../../utils/providerProfileLinks';
import {officeRoomLabel} from '../../utils/officeRoomLabel';
import {calendarDays,shiftDate,localParts} from '../../utils/providerUpdateCalendar';
import ProviderUpdateSchoolSchedule from './ProviderUpdateSchoolSchedule.vue';
const props=defineProps({agencyId:[Number,String],mode:{type:String,default:'auth'},token:String,data:Object,readonly:Boolean,view:{type:String,default:'calendar'}});
const emit=defineEmits(['complete']);
const base=computed(()=>props.mode==='token'?`/public/provider-update/${encodeURIComponent(props.token)}`:'/provider-update/me');
const calendar=ref(null),loading=ref(false),busy=ref(false),error=ref(''),message=ref(''),qr=ref(''),selected=ref(null),officeFormat=ref('private'),officeFrequency=ref('WEEKLY'),closeScope=ref('single'),selectionPanel=ref(null),openingDate=ref(null),virtualPanel=ref(null);
const openingChoice=ref(null),requestLocation=ref(''),requestRoom=ref(''),rooms=ref([]),roomsChecked=ref(false);
const schoolReview=ref(null),schoolReviewPanel=ref(null);
const selectedSchool=computed(()=>selected.value?.sourceType==='SCHOOL_ASSIGNMENT'?selected.value:selected.value?.schoolAssignment);
async function openSchoolReview(requestChange=false,all=false){schoolReview.value={schoolId:all?undefined:selectedSchool.value?.schoolId,assignmentId:all?undefined:selectedSchool.value?.assignmentId,requestChange};openingChoice.value=null;await nextTick();schoolReviewPanel.value?.scrollIntoView?.({behavior:'smooth',block:'start'});schoolReviewPanel.value?.focus({preventScroll:true});}
const selectedOfficeName=computed(()=>calendar.value?.offices?.find(o=>String(o.id)===String(requestLocation.value))?.name||'Selected office');
const selectedRoom=computed(()=>rooms.value.find(r=>String(r.id)===String(requestRoom.value)));
const roomEndTime=ref('10:00');
const roomHours=computed(()=>{const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));return (minutes(roomEndTime.value)-minutes(opening.startTime))/60;});
const roomRangeValid=computed(()=>Number.isFinite(roomHours.value)&&roomHours.value>0&&opening.startTime.endsWith(':00')&&roomEndTime.value.endsWith(':00'));
const opening=reactive({date:'',startTime:'09:00',frequency:'WEEKLY'}),settings=reactive({inPersonStatus:'unavailable',virtualStatus:'unavailable'});
const inPersonOpen=computed(()=>['accepting','waitlist'].includes(settings.inPersonStatus)),virtualOpen=computed(()=>['accepting','waitlist'].includes(settings.virtualStatus));
const profileService=ref('counseling');
const canEdit=computed(()=>!props.readonly&&!!calendar.value?.canEdit);
const canRequestRooms=computed(()=>!props.readonly && !!(calendar.value?.canRequestRooms??calendar.value?.canEdit));
const canExplore=computed(()=>canEdit.value || canRequestRooms.value || props.readonly && !!calendar.value);
const days=computed(()=>calendarDays(calendar.value));
const hourHeight=76;
const firstHour=computed(()=>Math.min(7,...days.value.flatMap(d=>d.events.map(e=>Math.floor(e.startMinute/60)))));
const lastHour=computed(()=>Math.max(20,...days.value.flatMap(d=>d.events.map(e=>Math.ceil(e.endMinute/60)))));
const hours=computed(()=>Array.from({length:lastHour.value-firstHour.value+1},(_,i)=>firstHour.value+i));
const calendarHeight=computed(()=>(lastHour.value-firstHour.value)*hourHeight);
const profileUrl=computed(()=>{const c=calendar.value,slug=c?.agency?.portal_url||c?.agency?.slug;if(!c?.provider?.id||!slug||c.profileServices?.length===0)return '';if(slug==='itsco'&&profileService.value==='counseling')return providerProfileUrl(c.provider);const path=`/${encodeURIComponent(slug)}/provider/${c.provider.id}?serviceType=${encodeURIComponent(profileService.value)}`;return new URL(path,slug==='nlu'?'https://nextleveluplcc.com':window.location.origin).href;});
const slotDay=value=>new Date(value).toLocaleDateString('en-US',{timeZone:calendar.value?.timeZone,weekday:'short',month:'short',day:'numeric'});
const requestFrequency=value=>({WEEKLY:'Weekly',BIWEEKLY:'Every other week',EVERY_4_WEEKS:'Every four weeks',ONCE:'One time'}[value]||value);
const time=value=>new Date(value).toLocaleTimeString('en-US',{timeZone:calendar.value?.timeZone,hour:'numeric',minute:'2-digit'});
function eventStyle(event,events){
 const overlapping=events.filter(e=>e.kind!=='school'&&e.startMinute<event.endMinute&&e.endMinute>event.startMinute),index=event.kind==='school'?0:overlapping.indexOf(event),columns=event.kind==='school'?1:Math.max(1,overlapping.length);
 return {top:`${(event.startMinute-firstHour.value*60)*hourHeight/60}px`,height:`${Math.max(32,(event.endMinute-event.startMinute)*hourHeight/60-3)}px`,width:`calc(${100/columns}% - 4px)`,left:`calc(${index*100/columns}% + 2px)`,zIndex:event.kind==='school'?0:1};
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
async function startOpening(date,startTime){if(!canExplore.value||busy.value||loading.value)return;const clickedDate=date;while(date<calendar.value.today)date=shiftDate(date,7);if(date!==clickedDate)message.value=`That day has passed. Your recurring request will start on ${date}; you can change the date below.`;openingChoice.value='choose';rooms.value=[];roomsChecked.value=false;opening.date=date;if(startTime)opening.startTime=startTime;roomEndTime.value=`${String(Math.min(23,Number(opening.startTime.slice(0,2))+1)).padStart(2,'0')}:${opening.startTime.slice(3)}`;selected.value=null;await nextTick();virtualPanel.value?.scrollIntoView?.({behavior:'smooth',block:'start'});openingDate.value?.focus({preventScroll:true});}
function chooseCalendarTime(event,date){const hour=Math.min(22,Math.max(0,firstHour.value+Math.floor((event.clientY-event.currentTarget.getBoundingClientRect().top)/hourHeight)));return startOpening(date,`${String(hour).padStart(2,'0')}:00`);}
async function mutate(action,payload,success,weekStart){if(!canEdit.value||busy.value||loading.value)return;busy.value=true;error.value='';message.value='';try{await api.post(`${base.value}/availability-calendar/${action}`,{agencyId:props.agencyId,...payload},{timeout:60000});message.value=success;await load(weekStart||calendar.value.weekStart);}catch(e){error.value=e.response?.data?.error?.message||'The change could not be confirmed. Refresh the calendar before trying again.';}finally{busy.value=false;}}
function addOpening(){return confirmSchoolOpening();}
function confirmSchoolOpening(){const minutes=Number(opening.startTime.slice(0,2))*60+Number(opening.startTime.slice(3));const overlapsSchool=(calendar.value?.schoolAssignments||[]).some(row=>{const start=localParts(row.startAt,calendar.value.timeZone),end=localParts(row.endAt,calendar.value.timeZone);return start.date===opening.date && start.minute<minutes+60 && end.minute>minutes;});if(overlapsSchool&&!window.confirm('These virtual hours overlap your assigned school time. School hours stay reserved from public booking; request an hours change if you intend to see other clients then. Save the virtual hours?'))return;return mutate('virtual',{...opening,enableVirtualOpen:true,...(overlapsSchool?{acknowledgeSchoolOverlap:true}:{})},'Your virtual hours were saved. Assigned school time and existing appointments remain protected.',opening.date);}
function saveOffice(){return mutate('office',{eventId:selected.value.id,frequency:officeFrequency.value,inPerson:['inPerson','both'].includes(officeFormat.value),virtual:['virtual','both'].includes(officeFormat.value)},'Office availability saved. Booked occurrences remain unavailable.');}
function closeOpening(){return mutate('close',{id:selected.value.weeklyId,date:selected.value.date,scope:closeScope.value},'Virtual availability removed for the selected dates.');}
function saveSettings(){return mutate('settings',{inPersonStatus:settings.inPersonStatus,virtualStatus:settings.virtualStatus},'Profile availability settings saved.');}
watch(()=>[opening.date,opening.startTime,roomEndTime.value,opening.frequency,requestLocation.value],()=>{rooms.value=[];requestRoom.value='';roomsChecked.value=false;});
async function findRooms(){if(!canRequestRooms.value||busy.value||!requestLocation.value||!roomRangeValid.value)return;busy.value=true;error.value='';try{const result=await api.get(`${base.value}/availability-rooms`,{params:{agencyId:props.agencyId,locationId:requestLocation.value,...opening,endTime:roomEndTime.value}});rooms.value=result.data.rooms||[];roomsChecked.value=true;}catch(e){error.value=e.response?.data?.error?.message||'Unable to check rooms.';}finally{busy.value=false;}}
async function requestOffice(){if(!canRequestRooms.value||busy.value||!requestRoom.value)return;busy.value=true;error.value='';try{await api.post(`${base.value}/availability-rooms`,{agencyId:props.agencyId,locationId:requestLocation.value,roomId:requestRoom.value,...opening,endTime:roomEndTime.value});message.value='Room request submitted for scheduling review. No client appointment was created.';openingChoice.value=null;await load(calendar.value.weekStart);}catch(e){error.value=e.response?.data?.error?.message||'Unable to request this room.';}finally{busy.value=false;}}
async function copyProfile(){try{await navigator.clipboard.writeText(profileUrl.value);message.value='Profile link copied.';}catch{message.value='Select the profile link above and copy it.';}}
watch(profileUrl,()=>{qr.value='';});
async function makeQr(){error.value='';try{const url=profileUrl.value;const image=await createProviderProfileQr(url,calendar.value.agency);if(url===profileUrl.value)qr.value=image;}catch{error.value='The branded QR code or agency logo could not be loaded. Try again, or copy your profile link.';}}
watch(profileUrl,()=>{qr.value='';});
function refresh(){if(calendar.value&&!busy.value&&!loading.value&&!document.hidden)load(calendar.value.weekStart);}
function changed(event){if(Number(event.detail?.agencyId)===Number(props.agencyId))refresh();}
watch(()=>[props.view,props.token,props.agencyId],()=>{schoolReview.value=null;load();});
onMounted(()=>{load();window.addEventListener('focus',refresh);window.addEventListener('provider-update-availability-changed',changed);document.addEventListener('visibilitychange',refresh);});
onUnmounted(()=>{loadId++;window.removeEventListener('focus',refresh);window.removeEventListener('provider-update-availability-changed',changed);document.removeEventListener('visibilitychange',refresh);});
</script>
<style scoped>
.school{background:rgba(100,116,139,.08);border-color:rgba(100,116,139,.25)!important;color:#637182}.calendar-event.school{border-style:dashed;opacity:.75}
.request-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:14px}.request-fields label,.room-select{display:grid!important;min-width:0}.request-fields input,.request-fields select,.room-select select{width:100%;min-width:0;max-width:100%}.edit-panel{min-width:0;max-width:100%;box-sizing:border-box}.edit-panel button{max-width:100%;white-space:normal}.request-summary{padding:12px;background:#edf6f0;border-radius:8px;overflow-wrap:anywhere}.availability-review{display:grid;gap:18px;min-width:0;color:#243c32}.availability-review p{line-height:1.55;margin:0}.availability-review h3{margin:0 0 10px}.profile-share{background:#f0f7f3;border:1px solid #c7dfcf;border-radius:14px;padding:20px;display:flex;gap:24px;align-items:center}.profile-share>div:first-child{display:grid;gap:12px;flex:1;min-width:0}.profile-share input{width:100%;box-sizing:border-box}.qr{display:grid;gap:8px;text-align:center}.qr img{width:240px;max-width:100%;border-radius:16px;box-shadow:0 8px 24px #173c3420}.row,.week-toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.week-toolbar{justify-content:space-between}.availability-review button,.button,.availability-review input,.availability-review select{font:inherit;padding:9px 12px;border-radius:8px;border:1px solid #b5c9bc;background:white;color:inherit;box-sizing:border-box}.availability-review button,.button{cursor:pointer;text-decoration:none}.primary,.availability-review button.primary{background:#376b50;color:#fff;border-color:#376b50;width:fit-content}.availability-review button:disabled{opacity:.5;cursor:default}.availability-review label{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.profile-share label{display:grid}.notice{padding:12px;background:#eef5f8;border-radius:8px}.error{color:#a52b29;background:#fff1f0;padding:12px;border-radius:8px}.muted{color:#617368;font-size:.9rem}.key{display:inline-block;padding:4px 8px;margin:3px;border-radius:5px}.open{background:#e4f4ea;border-color:#71a88a!important;color:#174f32}.reserved{background:#fff5dc;border-color:#dec385!important;color:#6e4c0c}.busy{background:#edf0f4;border-color:#c7ced8!important;color:#40516a}.calendar-scroll{max-width:100%;overflow-x:auto;border:1px solid #d9e3dd;border-radius:12px}.week-grid{display:grid;grid-template-columns:70px repeat(7,minmax(135px,1fr));min-width:1050px}.day-column{min-width:0;border-left:1px solid #e0e7e2}.day-heading{box-sizing:border-box;height:54px;display:flex;align-items:center;justify-content:center;margin:0;background:#f7faf8;font-size:.85rem;border-bottom:1px solid #d9e3dd}.today{background:#dcefe2;color:#245737}.day-body{position:relative}.day-body.can-add{cursor:crosshair}.hour-label{position:absolute;right:9px;font-size:.72rem;transform:translateY(-.4em);color:#677a6d}.hour-label:first-child{transform:translateY(0)}.hour-line{pointer-events:none;position:absolute;width:100%;border-top:1px solid #e6ece8}.calendar-event{position:absolute;display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:2px;overflow:hidden;padding:5px!important;border-radius:5px!important;font-size:.72rem!important;z-index:1}.calendar-event.open{background:#e4f4ea}.calendar-event.reserved{background:#fff5dc}.calendar-event.busy{background:#edf0f4}.calendar-event strong{font-size:.66rem;white-space:nowrap}.calendar-event small{font-size:.66rem}.day-add{margin:8px 4px;font-size:.78rem!important;width:calc(100% - 8px)}.edit-panel,.settings{border:1px solid #ccd9d1;border-radius:12px;padding:18px;display:grid;gap:12px}.settings summary{cursor:pointer;font-weight:650}.settings[open] summary{margin-bottom:14px}.availability-review fieldset{border:0;display:grid;gap:12px;padding:0;margin:0;min-width:0}.availability-review :focus-visible{outline:3px solid #578878;outline-offset:3px}@media(max-width:650px){.profile-share{align-items:flex-start;flex-direction:column}.row label{width:100%}}
</style>
