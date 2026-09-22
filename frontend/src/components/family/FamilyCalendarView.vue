<template>
  <section ref="calendarRoot" class="family-calendar" :class="{'touch-edit':touchEdit,'calendar-dragging':gesture?.moved}" aria-label="Family calendar">
    <div class="calendar-context">
      <section class="glance" aria-label="Today at a glance">
        <header><h2>☀ Today at a glance</h2><span>{{ heading(todayKey) }} · {{ todayEvents.length }} plans</span></header>
        <div class="glance-events">
          <button v-for="e in todayEvents.slice(0,4)" :key="e.key" :style="eventStyle(e)" @click="showEvent(e)"><span class="context-icon">{{ icon(e) }}</span><span><small>{{ e.startDate ? 'All day' : time(e.start) }}</small><strong>{{ e.title }}</strong></span></button>
          <p v-if="!todayEvents.length">{{ loading ? 'Loading today’s plans…' : 'A little room in your day. Add a plan together.' }}</p>
          <button v-if="todayEvents.length>4" class="more-today" @click="today();mode='day'">+{{ todayEvents.length-4 }} more</button>
        </div>
      </section>
      <section class="up-next" aria-label="Up next">
        <header><h2>Up next</h2><button v-if="upNext" @click="date=localDay(upNext.start);mode='day'">Show day →</button></header>
        <button v-if="upNext" class="up-next-event" :style="eventStyle(upNext)" @click="showEvent(upNext)"><span class="context-icon">{{ icon(upNext) }}</span><span><strong>{{ upNext.title }}</strong><small>{{ localDay(upNext.start)===todayKey ? 'Today' : heading(localDay(upNext.start)) }} · {{ time(upNext.start) }}</small><small v-if="upNext.location">{{ upNext.location }}</small></span></button>
        <p v-else>{{ loading ? 'Finding your next plan…' : 'No upcoming plans in the next seven days.' }}</p>
      </section>
    </div>
    <header class="calendar-toolbar">
      <div class="controls date-controls"><button @click="move(-1)" aria-label="Previous period">‹</button><button @click="today">Today</button><button @click="move(1)" aria-label="Next period">›</button><label class="date-picker"><span>{{ periodLabel }}</span><input type="date" v-model="date" aria-label="Calendar date" /></label></div>
      <div class="controls view-controls">
        <div class="view-switch" aria-label="Calendar view"><button :aria-pressed="mode==='day'" @click="mode='day'">Day</button><button :aria-pressed="mode==='week'" @click="mode='week'">Week</button></div>
        <label class="sr-only" for="family-calendar-source">Show calendars</label><select id="family-calendar-source" v-model="source"><option value="all">All calendars</option><option value="family">Family events</option><option value="work">Work schedule</option><option value="google">Google calendar</option></select>
        <button :aria-pressed="touchEdit" @click="touchEdit=!touchEdit" aria-label="Touch editing">☝ <span class="options-label">Touch edit</span></button><button :aria-expanded="optionsOpen" @click="optionsOpen=!optionsOpen" aria-label="Calendar display options">⚙ <span class="options-label">Display</span></button>
      </div>
    </header>
    <div v-if="optionsOpen" class="calendar-options">
      <label>Event colors<select v-model="colorMode"><option value="activity">Color by activity</option><option value="person">Color by person</option></select></label>
      <label>Show work schedule<select v-model="work"><option value="hidden">Hide work</option><option value="busy">Work only</option><option value="details">Work categories</option></select></label>
      <label>First day of week<select v-model.number="weekStartsOn" aria-label="First day of week"><option :value="1">Monday</option><option :value="0">Sunday</option></select></label><label class="weekend-option"><input v-model="showWeekends" type="checkbox" /> Show weekends</label><span>{{ timezone.replaceAll('_',' ') }}</span><button @click="load" :disabled="loading">Refresh</button><button @click="$emit('settings')">Calendar connections &amp; family colors →</button>
    </div>
    <p class="calendar-gesture-hint">Tap a time to add · Drag to choose a duration · Use an event’s move grip or bottom edge to reschedule. <span v-if="touchEdit">Touch editing is on. Turn it off to swipe-scroll.</span><span v-else>Swipe to scroll, or turn on Touch edit to draw a time range.</span></p>
    <p v-if="changeMessage" class="calendar-change" role="status">{{ changeMessage }} <button v-if="undoChange" :disabled="saving||changing" @click="undoLastChange">Undo</button></p>
    <p v-if="error" class="calendar-message" role="alert">{{ error }} <button @click="load">Try again</button></p><p v-for="warning in warnings" :key="warning" class="calendar-message" role="status">{{ warning }}</p>
    <div class="calendar-scroll" ref="scroll" :style="calendarHeight ? {height:calendarHeight+'px'} : undefined" :aria-busy="loading||saving||changing" @pointermove="moveGesture" @pointerup="endGesture" @pointercancel="cancelGesture" tabindex="0" aria-label="Schedule; scroll to see earlier or later hours">
      <div class="calendar-grid" :style="{gridTemplateColumns:`48px repeat(${days.length},minmax(0,1fr))`,minWidth:mode==='week'?'680px':'0','--hour-height':`${hourHeight}px`}">
        <div class="day-heading time-heading"><span v-if="loading" role="status">•••</span><span v-else>{{ mode==='week' ? 'Week' : 'Day' }}</span></div><div v-for="d in days" :key="d" class="day-heading" :class="{current:d===todayKey}">{{ weekday(d) }} <span>{{ Number(d.slice(-2)) }}</span></div>
        <template v-if="days.length"><div class="all-day-label">All day</div><div v-for="d in days" :key="`all-${d}`" class="all-day"><button class="all-day-add" :aria-label="'Add all-day event on '+d" @click="createAllDay(d)">＋</button><button v-for="e in allDay(d)" :key="e.key" class="calendar-event all-day-event" :style="eventStyle(e)" @click="showEvent(e)">{{ icon(e) }} {{ e.title }}</button></div></template>
        <div class="hours"><span v-for="hour in 24" :key="hour" :style="{top:`${(hour-1)*hourHeight}px`}">{{ hourLabel(hour-1) }}</span></div>
        <div v-for="d in days" :key="`hours-${d}`" class="day-column" :data-day="d" :class="{'today-column':d===todayKey}" tabindex="0" :aria-label="heading(d)+', tap a time or press Enter to add an event'" @keydown.enter.self.prevent="createAt(d,540)" @pointerdown="beginGesture($event,d)">
          <button v-for="e in timed(d)" :key="e.key" class="calendar-event" :style="e.style" :class="{editable:canEdit(e)}" @pointerdown.stop="beginGesture($event,d,e)" :aria-label="`${e.title}, ${time(e.start)} to ${time(e.end)}${e.memberName?', '+e.memberName:''}`" @click="eventClick(e)">
            <span v-if="canEdit(e)" class="event-move-handle" title="Drag to move this event" aria-hidden="true" @pointerdown.stop="beginGesture($event,d,e,'move')">⠿</span><strong><span aria-hidden="true">{{ icon(e) }}</span> {{ e.title }}</strong><span class="event-time">{{ time(e.start) }} – {{ time(e.end) }}</span><small v-if="e.memberName" class="event-person"><img v-if="e.photo" :src="e.photo" alt="" />{{ e.memberName }}</small>
            <span v-if="canEdit(e)&&localDay(new Date(new Date(e.end)-1))===d" class="event-resize-handle" title="Drag to change the end time" aria-hidden="true" @pointerdown.stop="beginGesture($event,d,e,'resize')" />
          </button>
          <div v-if="gesture?.preview&&touchesDay(gesture.preview,d)" class="selection-preview" :style="previewStyle(d)"><strong>{{ gesture.kind==='create'?'New event':gesture.event.title }}</strong><span>{{ time(gesture.preview.start) }} – {{ time(gesture.preview.end) }}</span></div>
          <div v-if="d===todayKey" class="now-line" :style="{top:`${minutes(now)*hourHeight/60}px`}" aria-label="Current time" />
        </div>
      </div>
    </div>
    <p v-if="!loading&&!visibleEvents.some(inVisibleDays)" class="empty">No plans match this {{ mode }}. Change your filters or add an event.</p>
    <dialog ref="eventDialog" class="event-detail" @close="selected=null" @click="closeOutside">
      <template v-if="selected"><button class="close" @click="closeEvent">Close ×</button><div class="detail-icon" :style="eventStyle(selected)">{{ icon(selected) }}</div><h3>{{ selected.title }}</h3><p>{{ selected.startDate ? `${heading(selected.startDate)} · All day` : new Date(selected.start).toLocaleString('en-US',{timeZone:timezone}) + ' – ' + time(selected.end) }}</p><p v-if="selected.memberName">For {{ selected.memberName }}</p><p v-if="selected.location">{{ selected.location }}</p><p v-if="selected.metadata?.notes">{{ selected.metadata.notes }}</p><button v-if="canEdit(selected)" @click="editSelected">Edit event &amp; color</button><p v-else-if="selected.source">From {{ selected.source }}. Edit this event in its source calendar.</p></template>
    </dialog>
  </section>
</template>
<script setup>
import {computed,nextTick,onMounted,onUnmounted,ref,watch} from 'vue';
import {eventType} from '../../utils/familyCommandCenter';
import {calendarWeekDays,calendarSlotIso,calendarSelection,movedCalendarTime} from '../../utils/familyCalendarInteraction';
import {calendarEventStyle,filterCalendarEvents} from '../../utils/familyCalendarDisplay';
const props=defineProps({http:{required:true},householdId:{required:true},timezone:{default:'America/Denver'},revision:{default:0},members:{default:()=>[]},memberFilter:{default:'all'},now:{default:()=>new Date()},saving:Boolean,reschedule:Function});
const emit=defineEmits(['edit','settings','create']);
const mode=ref(window.innerWidth<700?'day':'week'),work=ref('busy'),date=ref(''),events=ref([]),contextEvents=ref([]),warnings=ref([]),loading=ref(false),error=ref(''),selected=ref(null),scroll=ref(null),eventDialog=ref(null);
const weekStartsOn=ref(1),showWeekends=ref(true),touchEdit=ref(false),gesture=ref(null),changing=ref(false),undoChange=ref(null),changeMessage=ref('');
let ignoreClickUntil=0,scrollFrame;
const source=ref('all'),colorMode=ref('activity'),optionsOpen=ref(false),hourHeight=44;
const calendarRoot=ref(null),calendarHeight=ref(null);
let request=0,resizeObserver,resizeFrame;
function scheduleFit(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(fitCalendar);}
function fitCalendar(){calendarHeight.value=window.innerWidth>760&&scroll.value?Math.max(340,Math.floor(window.innerHeight-scroll.value.getBoundingClientRect().top-12)):null;}
// Display preferences belong to this device and household; failure to store them never prevents viewing.
function preferenceKey(){return `family-calendar-display:${props.householdId}`;}
function restorePreferences(){try{const saved=JSON.parse(localStorage.getItem(preferenceKey())||'{}');colorMode.value=saved.colorMode==='person'?'person':'activity';weekStartsOn.value=saved.weekStartsOn===0?0:1;showWeekends.value=saved.showWeekends!==false;}catch{colorMode.value='activity';weekStartsOn.value=1;showWeekends.value=true;}}
restorePreferences();
watch([colorMode,weekStartsOn,showWeekends],()=>{try{localStorage.setItem(preferenceKey(),JSON.stringify({colorMode:colorMode.value,weekStartsOn:weekStartsOn.value,showWeekends:showWeekends.value}));}catch{/* storage may be unavailable on shared devices */}});
function localDay(value){return new Intl.DateTimeFormat('en-CA',{timeZone:props.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
function shift(day,n){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
const todayKey=computed(()=>localDay(props.now));
function today(){date.value=todayKey.value;}
today();
const days=computed(()=>mode.value==='week'?calendarWeekDays(date.value||todayKey.value,weekStartsOn.value,showWeekends.value):[date.value||todayKey.value]);
const periodLabel=computed(()=>mode.value==='day'?heading(date.value):`${heading(days.value[0])} – ${heading(days.value.at(-1))}`);
const visibleEvents=computed(()=>filterCalendarEvents(events.value,props.memberFilter,source.value));
const filteredContext=computed(()=>filterCalendarEvents(contextEvents.value,props.memberFilter,source.value));
const touchesDay=(e,day)=>e.startDate ? e.startDate<=day && e.endDate>day : localDay(e.start)<=day&&localDay(new Date(new Date(e.end)-1))>=day;
const todayEvents=computed(()=>filteredContext.value.filter(e=>touchesDay(e,todayKey.value)).sort((a,b)=>Number(!!b.startDate)-Number(!!a.startDate)||new Date(a.start)-new Date(b.start)));
const upNext=computed(()=>filteredContext.value.filter(e=>!e.startDate&&new Date(e.end)>props.now).sort((a,b)=>new Date(a.start)-new Date(b.start))[0]);
const inVisibleDays=e=>days.value.some(d=>touchesDay(e,d));
function move(n){date.value=shift(date.value,n*(mode.value==='week'?7:1));}
function heading(d){return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'});}
function weekday(d){return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short'});}
const time=value=>new Date(value).toLocaleTimeString('en-US',{timeZone:props.timezone,hour:'numeric',minute:'2-digit'});
const hourLabel=h=>`${h%12||12} ${h<12?'AM':'PM'}`;
const eventStyle=e=>calendarEventStyle(e,colorMode.value,props.members);
const icon=e=>e.work?'▣':e.source==='Google'?'▦':eventType(e.metadata?.eventType).icon;
function minutes(value){const parts=new Intl.DateTimeFormat('en-US',{timeZone:props.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));return Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);}
function allDay(day){return visibleEvents.value.filter(e=>e.startDate&&touchesDay(e,day));}
function timed(day){
  const rows=visibleEvents.value.filter(e=>!e.startDate&&touchesDay(e,day)).map(e=>({...e,top:(localDay(e.start)<day?0:minutes(e.start))*hourHeight/60,bottom:(localDay(e.end)>day?1440:minutes(e.end))*hourHeight/60})).sort((a,b)=>a.top-b.top || b.bottom-a.bottom);
  const groups=[];let group=[],until=0;
  for(const e of rows){e.bottom=Math.max(e.top+30,e.bottom);if(group.length&&e.top>=until){groups.push(group);group=[];until=0;}group.push(e);until=Math.max(until,e.bottom);}if(group.length)groups.push(group);
  return groups.flatMap(items=>{const lanes=[];for(const e of items){let lane=lanes.findIndex(end=>end<=e.top);if(lane<0)lane=lanes.length;lanes[lane]=e.bottom;e.lane=lane;}return items.map(e=>({...e,style:{...eventStyle(e),top:`${e.top}px`,height:`${e.bottom-e.top-2}px`,left:`calc(${e.lane/lanes.length*100}% + 2px)`,width:`calc(${100/lanes.length}% - 4px)`}}));});
}
async function showEvent(event){selected.value=event;await nextTick();eventDialog.value?.showModal();}
function closeEvent(){eventDialog.value?.close();}
function closeOutside(event){if(event.target===eventDialog.value){const r=eventDialog.value.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeEvent();}}
const canEdit=e=>String(e.key).startsWith('family:')&&e.id!=null;
function editSelected(){const event=selected.value;closeEvent();emit('edit',event);}
function createAt(day,minute){try{emit('create',calendarSelection({day,minute},{day,minute},props.timezone,false));}catch(e){error.value=e.message;}}
function createAllDay(day){try{emit('create',{start:calendarSlotIso(day,0,props.timezone),end:calendarSlotIso(day,1440,props.timezone),allDay:true});}catch(e){error.value=e.message;}}
function eventClick(e){if(performance.now()>ignoreClickUntil)showEvent(e);}
function slotAt(clientX,clientY,fallbackDay){
  const columns=[...calendarRoot.value.querySelectorAll('.day-column')];
  const column=columns.find(el=>{const r=el.getBoundingClientRect();return clientX>=r.left&&clientX<r.right;})||columns.find(el=>el.dataset.day===fallbackDay);
  if(!column)return null;const rect=column.getBoundingClientRect();
  return {day:column.dataset.day,minute:Math.max(0,Math.min(1425,Math.floor((clientY-rect.top)/hourHeight*60/15)*15))};
}
function beginGesture(e,day,event=null,action=null){
  if(e.button!==0||!e.isPrimary||props.saving||changing.value||loading.value||gesture.value)return;
  if(event&&(!canEdit(event)||event.startDate))return;
  if(event&&e.pointerType==='touch'&&!action&&!touchEdit.value)return;
  const anchor=slotAt(e.clientX,e.clientY,day);if(!anchor)return;
  // Avoid browser focus scrolling the tall day column underneath a touch gesture.
  e.preventDefault();
  const target=e.currentTarget;target.setPointerCapture(e.pointerId);
  gesture.value={pointerId:e.pointerId,target,kind:action||(event?'move':'create'),event,anchor,current:anchor,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,preview:null,pointerType:e.pointerType};
  error.value='';
}
function updatePreview(g){
  try{g.preview=g.kind==='create'?calendarSelection(g.anchor,g.current,props.timezone,g.moved):movedCalendarTime(g.event,g.anchor,g.current,props.timezone,g.kind==='resize');}
  catch(e){g.preview=null;error.value=e.message;}
}
function moveGesture(e){
  const g=gesture.value;if(!g||e.pointerId!==g.pointerId)return;
  g.lastX=e.clientX;g.lastY=e.clientY;
  if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>6)g.moved=true;
  if(!g.moved)return;
  // Normal touch swipes stay scrolling gestures. The explicit edit mode/grips opt into dragging.
  if(g.pointerType==='touch'&&g.kind==='create'&&!touchEdit.value){cancelGesture();return;}
  e.preventDefault();g.current=slotAt(e.clientX,e.clientY,g.anchor.day)||g.current;updatePreview(g);
  if(!scrollFrame)scrollFrame=requestAnimationFrame(autoScrollGesture);
}
function autoScrollGesture(){
  scrollFrame=null;const g=gesture.value;if(!g?.moved||!scroll.value)return;
  const r=scroll.value.getBoundingClientRect();
  if(g.lastX<r.left||g.lastX>r.right)return;
  const dy=g.lastY<r.top+90?-8:g.lastY>r.bottom-35?8:0;
  const dx=g.lastX<r.left+25?-8:g.lastX>r.right-25?8:0;
  if(dy||dx){scroll.value.scrollBy(dx,dy);g.current=slotAt(g.lastX,g.lastY,g.current.day)||g.current;updatePreview(g);scrollFrame=requestAnimationFrame(autoScrollGesture);}
}
function cancelGesture(){const g=gesture.value;gesture.value=null;cancelAnimationFrame(scrollFrame);scrollFrame=null;if(g?.target.hasPointerCapture(g.pointerId))g.target.releasePointerCapture(g.pointerId);}
function gestureKeydown(e){if(e.key==='Escape'&&gesture.value){e.preventDefault();ignoreClickUntil=performance.now()+500;cancelGesture();}}
async function endGesture(e){
  const g=gesture.value;if(!g||e.pointerId!==g.pointerId)return;
  if(g.moved)ignoreClickUntil=performance.now()+500;
  const preview=g.preview;cancelGesture();
  if(g.kind==='create'){
    if(g.moved){if(preview)emit('create',preview);}else createAt(g.anchor.day,g.anchor.minute);
  }else if(g.moved&&preview&&(preview.start!==g.event.start||preview.end!==g.event.end))await applyMove(g.event,preview);
}
function previewStyle(day){const e=gesture.value.preview;const top=(localDay(e.start)<day?0:minutes(e.start))*hourHeight/60;const bottom=(localDay(e.end)>day?1440:minutes(e.end))*hourHeight/60;return {top:top+'px',height:Math.max(30,bottom-top)+'px'};}
async function applyMove(event,times,undo=false){
  if(!props.reschedule)return;changing.value=true;error.value='';
  try{
    await props.reschedule(event,times);
    undoChange.value=undo?null:{event,times:{start:event.start,end:event.end}};
    changeMessage.value=undo?'Original time restored.':`${event.title} rescheduled. ${time(times.start)} – ${time(times.end)}.`;
    await load();
  }catch(e){error.value=e.response?.data?.error?.message||e.message||'Could not save the new time.';}
  finally{changing.value=false;}
}
function undoLastChange(){if(undoChange.value)applyMove(undoChange.value.event,undoChange.value.times,true);}
watch([date,mode,weekStartsOn,showWeekends,touchEdit],()=>cancelGesture());
async function load(){
  const current=++request;loading.value=true;error.value='';
  const fetchRange=(from,to)=>props.http.get(`/households/${props.householdId}/calendar-view`,{params:{from:`${shift(from,-1)}T00:00:00Z`,to:`${shift(to,2)}T00:00:00Z`,work:work.value}});
  // Keep today's context accurate even when browsing another week. Merge into one request when nearby.
  const contextEnd=shift(todayKey.value,6),from=[days.value[0],todayKey.value].sort()[0],to=[days.value.at(-1),contextEnd].sort().at(-1);
  const combined=(new Date(to)-new Date(from))/86400000<=30;
  try{
    const [view,context]=await Promise.all([fetchRange(combined?from:days.value[0],combined?to:days.value.at(-1)),combined?Promise.resolve(null):fetchRange(todayKey.value,contextEnd)]);
    if(current!==request)return;
    events.value=view.data.events;contextEvents.value=(context?.data.events||view.data.events).filter(e=>e.startDate?e.startDate<=contextEnd&&e.endDate>todayKey.value:localDay(e.start)<=contextEnd&&localDay(e.end)>=todayKey.value);
    warnings.value=[...new Set([...(view.data.warnings||[]),...(context?.data.warnings||[])])];
  }catch(e){if(current===request){events.value=[];contextEvents.value=[];error.value=e.response?.data?.error?.message || 'Could not load this calendar.';}}finally{if(current===request)loading.value=false;}
}
watch([date,mode,work,weekStartsOn,showWeekends,()=>props.revision,todayKey],load);
watch(()=>props.householdId,()=>{cancelGesture();undoChange.value=null;changeMessage.value='';events.value=[];contextEvents.value=[];closeEvent();restorePreferences();today();load();});
onMounted(()=>{load();if(scroll.value)scroll.value.scrollTop=6*hourHeight;fitCalendar();resizeObserver=new ResizeObserver(scheduleFit);resizeObserver.observe(calendarRoot.value);window.addEventListener('resize',scheduleFit);window.addEventListener('keydown',gestureKeydown);});
onUnmounted(()=>{cancelGesture();window.removeEventListener('keydown',gestureKeydown);request++;resizeObserver?.disconnect();window.removeEventListener('resize',scheduleFit);cancelAnimationFrame(resizeFrame);});
</script>
<style scoped>
.family-calendar{color:var(--ink);min-width:0}
.calendar-context{display:grid;grid-template-columns:minmax(0,2.4fr) minmax(230px,1fr);gap:12px;margin-bottom:12px}
.glance,.up-next{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-width:0}
.calendar-context header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}
h2{font-size:14px;margin:0;font-weight:750}.calendar-context header>span{font-size:11px;color:var(--muted);white-space:nowrap}.family-calendar .calendar-context header button{min-height:0;border:0;padding:0;font-size:12px;background:none}
.glance-events{display:flex;gap:6px;overflow-x:auto}.family-calendar .glance-events>button,.family-calendar .up-next-event{display:flex;align-items:center;gap:8px;border:0;background:var(--event-fill);color:var(--event-ink);padding:6px 8px;text-align:left;border-radius:8px;min-width:0;flex:1}
.family-calendar .glance-events>button{min-width:130px;flex:1 0 130px}.family-calendar .glance-events>.more-today{min-width:64px;flex:0 0 64px}.calendar-context strong{display:block;font-size:12px;line-height:1.4}.glance-events strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.calendar-context small{display:block;font-size:11px;line-height:1.4}.calendar-context p{font-size:13px;margin:7px 0;color:var(--muted)}.context-icon{font-size:23px;flex-shrink:0}.family-calendar .up-next-event{width:100%;background:transparent;padding:0}.up-next-event>span:last-child{min-width:0}.up-next-event strong,.up-next-event small{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.up-next-event .context-icon{background:var(--event-fill);padding:6px;border-radius:50%}
.calendar-toolbar,.controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.calendar-toolbar{justify-content:space-between;margin-bottom:10px;gap:8px}.family-calendar button,.family-calendar input,.family-calendar select{border:1px solid var(--control);border-radius:8px;background:var(--surface);color:var(--ink);padding:7px 10px;font:inherit;font-size:13px;min-height:36px;cursor:pointer}.family-calendar select{width:auto;padding:6px 9px}.view-switch{display:flex;border:1px solid var(--control);border-radius:9px;overflow:hidden}.family-calendar .view-switch button{border:0;border-radius:0;padding:7px 15px}.view-switch button[aria-pressed=true]{background:var(--purple);color:white}.date-controls>button{font-size:16px;min-width:36px}.date-controls>button:nth-child(2){font-size:13px}
.date-picker{position:relative;border:1px solid var(--control);border-radius:8px;padding:7px 12px;font-weight:650;color:var(--ink)}.date-picker input{position:absolute;inset:0;width:100%;height:100%;opacity:0;min-height:0}.date-picker input::-webkit-calendar-picker-indicator{position:absolute;inset:0;width:auto;height:auto;cursor:pointer}.date-picker:focus-within{outline:2px solid var(--purple);outline-offset:2px}
.calendar-options{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:12px;margin-bottom:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}.calendar-options label{display:flex;flex-direction:column;font-size:12px;gap:3px}.calendar-options>span{font-size:12px;align-self:center}.calendar-message{font-size:13px;padding:8px;background:var(--surface);border-radius:8px}
.calendar-scroll{height:calc(100dvh - 252px);min-height:340px;overflow:auto;overscroll-behavior:contain;overflow-anchor:none;border:1px solid #c8ccd5;border-radius:10px;background:#fffdf9;scroll-padding-top:40px}.calendar-scroll:focus-visible{outline:2px solid var(--purple);outline-offset:2px}.calendar-grid{display:grid;width:100%}.day-heading{position:sticky;top:0;background:#f4f3f8;padding:8px 4px;z-index:3;text-align:center;border-bottom:1px solid #c8ccd5;font-weight:700;font-size:13px;min-height:40px}.day-heading span{display:inline-grid;place-items:center;min-width:25px;height:25px}.day-heading.current{background:#e9e4f8;color:#3f3285}.current span{border-radius:50%;background:var(--purple);color:white}.time-heading{font-size:10px;display:grid;place-items:center}.all-day,.all-day-label{position:sticky;top:40px;z-index:3;background:#fffdf9;min-height:35px;border-bottom:1px solid var(--line);padding:4px;font-size:10px}.all-day{border-left:1px solid var(--line)}.day-column,.hours{height:calc(var(--hour-height)*24);position:relative}.day-column{border-left:1px solid #dddfe5;background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(var(--hour-height) - 1px),#e0e2e7 calc(var(--hour-height) - 1px),#e0e2e7 var(--hour-height))}.today-column{background-color:#f5f2ff}.hours span{position:absolute;right:5px;font-size:10px;color:#536072;line-height:1.2;white-space:nowrap}
.family-calendar .calendar-event{position:absolute;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;text-align:left;overflow:hidden;border:0;border-left:3px solid var(--event-color);background:var(--event-fill);color:var(--event-ink);padding:3px 5px;border-radius:5px;line-height:1.25;font-size:12px;min-width:0;min-height:0;z-index:1}.calendar-event strong{display:block;flex-shrink:0;font-size:12px;font-weight:700}.calendar-event strong>span{font-size:13px}.event-time{display:block;flex-shrink:0;font-size:10px;white-space:nowrap}.event-person{display:flex;align-items:center;gap:4px;margin-top:3px;font-size:10px}.event-person img{height:18px;width:18px;border-radius:50%;object-fit:cover}.calendar-event:hover,.calendar-event:focus-visible{outline:2px solid var(--event-ink);outline-offset:-2px;z-index:2}.family-calendar .all-day-event{position:relative;width:100%;margin-bottom:3px;min-height:27px}.now-line{position:absolute;width:100%;height:2px;background:#c54554;z-index:2;pointer-events:none}.now-line:before{content:'';position:absolute;left:-3px;top:-3px;width:8px;height:8px;border-radius:50%;background:#c54554}
.event-detail{color:var(--ink);background:var(--surface);padding:24px;border:1px solid var(--line);border-radius:16px;max-width:520px;width:calc(100% - 32px);max-height:85dvh;overflow:auto;margin:auto}.event-detail::backdrop{background:#16212b88}.event-detail p{white-space:pre-line;font-size:14px}.event-detail h3{font-size:22px;margin:12px 0}.detail-icon{color:var(--event-ink);background:var(--event-fill);border-left:4px solid var(--event-color);font-size:30px;padding:5px 12px;display:inline-block;border-radius:8px}.close{float:right}.empty{color:var(--muted);font-size:13px;margin:6px 0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
@media(min-width:761px) and (max-width:1100px){.calendar-context{grid-template-columns:minmax(0,2fr) minmax(210px,1fr)}.glance-events>button{min-width:115px}.calendar-context header>span{display:none}.calendar-toolbar{gap:6px}.date-picker{font-size:12px;padding:7px}.options-label{display:none}.calendar-scroll{height:calc(100dvh - 254px)}}
@media(max-width:760px){.calendar-context{grid-template-columns:1fr}.up-next{display:none}.calendar-toolbar{align-items:stretch}.controls{gap:5px}.date-controls{justify-content:space-between;width:100%}.date-picker{flex:1;text-align:center}.view-controls{width:100%;justify-content:space-between}.calendar-scroll{height:65dvh;min-height:400px}.calendar-context header>span{font-size:10px}.options-label{display:none}.glance-events>button{min-width:130px}}
.calendar-gesture-hint{font-size:11px;color:var(--muted);margin:4px 0 8px}.calendar-change{font-size:13px;margin:6px 0;padding:6px 10px;background:var(--soft);border-radius:8px}.calendar-change button{margin-left:10px}.calendar-options .weekend-option{flex-direction:row;align-items:center}.weekend-option input{min-height:0;width:auto}.all-day{padding-right:25px}.family-calendar .all-day-add{position:absolute;right:2px;top:3px;z-index:2;min-height:24px;padding:0 5px;border:0;background:transparent;color:var(--muted)}.day-column{touch-action:pan-x pan-y}.touch-edit .day-column{touch-action:none}.touch-edit .calendar-scroll{overflow:hidden;touch-action:none}.day-column:focus-visible{outline:2px solid var(--purple);outline-offset:-2px}.calendar-dragging{user-select:none;-webkit-user-select:none}.selection-preview{position:absolute;left:2px;right:2px;z-index:5;border:2px solid var(--purple);border-radius:6px;background:#ece5ffdd;color:#33265e;padding:4px;pointer-events:none;font-size:11px;overflow:hidden}.selection-preview strong,.selection-preview span{display:block}.calendar-event.editable{cursor:grab;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.calendar-event.editable strong{padding-right:16px}.event-move-handle{position:absolute;right:0;top:0;width:20px;height:22px;text-align:center;font-size:19px;line-height:20px;cursor:grab;touch-action:none}.touch-edit .event-resize-handle{height:14px}.event-resize-handle{position:absolute;bottom:0;left:4px;right:4px;height:8px;cursor:ns-resize;touch-action:none;border-bottom:2px solid var(--event-color)}.family-calendar button[aria-pressed=true]{background:var(--purple);color:white}
</style>
