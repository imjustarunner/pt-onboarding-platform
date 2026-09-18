<template>
  <section class="family-calendar" aria-label="Family calendar">
    <header class="calendar-toolbar">
      <div><h2>Our calendar</h2><p>{{ timezone.replaceAll('_',' ') }}</p></div>
      <div class="controls"><button @click="move(-1)" aria-label="Previous period">‹</button><button @click="today">Today</button><button @click="move(1)" aria-label="Next period">›</button><label>Date<input type="date" v-model="date" /></label></div>
      <div class="controls"><button :aria-pressed="mode==='day'" @click="mode='day'">Day</button><button :aria-pressed="mode==='week'" @click="mode='week'">Week</button><label>Show work schedule<select v-model="work"><option value="hidden">Hide work</option><option value="busy">Work only</option><option value="details">Work categories</option></select></label><button @click="load" :disabled="loading">Refresh</button></div>
    </header>
    <p class="work-hint">Each adult can include their work calendar from Settings → Include my work schedule.</p>
    <p v-if="loading" role="status">Loading calendar…</p><p v-if="error" role="alert">{{ error }}</p><p v-for="warning in warnings" :key="warning" role="status">{{ warning }}</p>
    <div class="calendar-scroll" ref="scroll">
      <div class="calendar-grid" :style="{gridTemplateColumns:`52px repeat(${days.length},minmax(150px,1fr))`}">
        <div class="day-heading time-heading">Time</div><div v-for="d in days" :key="d" class="day-heading" :class="{current:d===localDay(new Date())}">{{ heading(d) }}</div>
        <div class="all-day-label">All day</div><div v-for="d in days" :key="`all-${d}`" class="all-day"><button v-for="e in allDay(d)" :key="e.key" class="calendar-event all-day-event" :style="{'--event-color':e.color || '#6552a8'}" @click="selected=e">{{ e.title }}</button></div>
        <div class="hours"><span v-for="hour in 24" :key="hour" :style="{top:`${(hour-1)*60}px`}">{{ hourLabel(hour-1) }}</span></div>
        <div v-for="d in days" :key="`hours-${d}`" class="day-column">
          <button v-for="e in timed(d)" :key="e.key" class="calendar-event" :class="{work:e.work}" :style="e.style" @click="selected=e">
            <span class="event-time">{{ time(e.start) }}<span v-if="e.memberName"> · {{ e.memberName }}</span></span><strong>{{ e.title }}</strong><img v-if="e.photo" :src="e.photo" alt="" /><small v-if="e.source">{{ e.source }}</small>
          </button>
        </div>
      </div>
    </div>
    <p v-if="!loading&&!events.length" class="empty">No plans in this {{ mode }}. Use Add event to plan something together.</p>
    <div v-if="selected" class="event-overlay" @click.self="selected=null"><section class="event-detail" role="dialog" aria-modal="true" aria-label="Event details"><button class="close" @click="selected=null">Close ×</button><h3>{{ selected.title }}</h3><p>{{ selected.startDate ? `${selected.startDate} · All day` : new Date(selected.start).toLocaleString('en-US',{timeZone:timezone}) }}</p><p v-if="selected.memberName">For {{ selected.memberName }}</p><p v-if="selected.location">{{ selected.location }}</p><p v-if="selected.metadata?.notes">{{ selected.metadata.notes }}</p><p v-if="selected.source">From {{ selected.source }}. Edit this event in its source calendar.</p></section></div>
  </section>
</template>
<script setup>
import {computed,onMounted,ref,watch} from 'vue';
const props=defineProps({http:{required:true},householdId:{required:true},timezone:{default:'America/Denver'},revision:{default:0}});
const mode=ref('week'),work=ref('busy'),date=ref(''),events=ref([]),warnings=ref([]),loading=ref(false),error=ref(''),selected=ref(null),scroll=ref(null);
let request=0;
function localDay(value){return new Intl.DateTimeFormat('en-CA',{timeZone:props.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
function shift(day,n){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function today(){date.value=localDay(new Date());}
today();
const days=computed(()=>{let start=date.value || localDay(new Date());if(mode.value==='week')start=shift(start,-new Date(`${start}T12:00:00Z`).getUTCDay());return Array.from({length:mode.value==='week'?7:1},(_,i)=>shift(start,i));});
function move(n){date.value=shift(date.value,n*(mode.value==='week'?7:1));}
function heading(d){return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'});}
const time=value=>new Date(value).toLocaleTimeString('en-US',{timeZone:props.timezone,hour:'numeric',minute:'2-digit'});
const hourLabel=h=>`${h%12||12}${h<12?'a':'p'}`;
function minutes(value){const parts=new Intl.DateTimeFormat('en-US',{timeZone:props.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));return Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);}
function allDay(day){return events.value.filter(e=>e.startDate && e.startDate<=day && e.endDate>day);}
function timed(day){
  const rows=events.value.filter(e=>!e.startDate&&localDay(e.start)<=day&&localDay(new Date(new Date(e.end)-1))>=day).map(e=>({...e,top:localDay(e.start)<day?0:minutes(e.start),bottom:localDay(e.end)>day?1440:minutes(e.end)})).sort((a,b)=>a.top-b.top || b.bottom-a.bottom);
  const groups=[];let group=[],until=0;
  for(const e of rows){e.bottom=Math.max(e.top+34,e.bottom);if(group.length&&e.top>=until){groups.push(group);group=[];until=0;}group.push(e);until=Math.max(until,e.bottom);}if(group.length)groups.push(group);
  return groups.flatMap(items=>{const lanes=[];for(const e of items){let lane=lanes.findIndex(end=>end<=e.top);if(lane<0)lane=lanes.length;lanes[lane]=e.bottom;e.lane=lane;}return items.map(e=>({...e,style:{top:`${e.top}px`,height:`${e.bottom-e.top-2}px`,left:`calc(${e.lane/lanes.length*100}% + 2px)`,width:`calc(${100/lanes.length}% - 4px)`,'--event-color':e.color || (e.work?'#64748b':'#6552a8')}}));});
}
async function load(){const current=++request;loading.value=true;error.value='';try{const {data}=await props.http.get(`/households/${props.householdId}/calendar-view`,{params:{from:`${shift(days.value[0],-1)}T00:00:00Z`,to:`${shift(days.value.at(-1),2)}T00:00:00Z`,work:work.value}});if(current!==request)return;events.value=data.events;warnings.value=data.warnings || [];}catch(e){if(current===request)error.value=e.response?.data?.error?.message || 'Could not load this calendar. Try Refresh.';}finally{if(current===request)loading.value=false;}}
watch([date,mode,work,()=>props.householdId,()=>props.revision],load);
onMounted(()=>{load();if(scroll.value)scroll.value.scrollTop=7*60;});
</script>
<style scoped>
.family-calendar{color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;margin:20px 0}.calendar-toolbar,.controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.calendar-toolbar{justify-content:space-between;margin-bottom:18px}h2{margin:0;font-size:22px}p{font-size:14px;line-height:1.6}.calendar-toolbar p{margin:5px 0;color:var(--muted)}label{display:flex;flex-direction:column;gap:4px;font-size:12px}button,input,select{font:inherit;color:inherit;border:1px solid var(--control);border-radius:7px;background:var(--surface);padding:9px}button{cursor:pointer}button[aria-pressed=true]{background:var(--purple);color:white}.calendar-scroll{height:680px;overflow:auto;border:1px solid var(--line);border-radius:8px}.calendar-grid{display:grid;min-width:100%;width:max-content}.day-heading{position:sticky;top:0;background:var(--surface);padding:14px 8px;z-index:3;text-align:center;border-bottom:1px solid var(--line);font-weight:700}.current{color:var(--purple);background:var(--soft)}.time-heading{font-size:11px}.all-day,.all-day-label{min-height:48px;border-bottom:1px solid var(--line);padding:5px;font-size:11px}.all-day{border-left:1px solid var(--line)}.day-column,.hours{height:1440px;position:relative}.day-column{border-left:1px solid var(--line);background:repeating-linear-gradient(to bottom,transparent 0,transparent 59px,var(--line) 59px,var(--line) 60px)}.hours span{position:absolute;right:7px;font-size:11px;color:var(--muted)}.calendar-event{position:absolute;display:block;text-align:left;overflow:hidden;border:1px solid var(--line);border-left:4px solid var(--event-color);background:var(--soft);padding:4px 6px;border-radius:5px;line-height:1.35;font-size:12px;min-width:0}.calendar-event.work{background:#e9eef1}.calendar-event strong{display:block}.event-time{font-size:10px}.calendar-event img{height:22px;width:22px;border-radius:50%;object-fit:cover}.all-day-event{position:relative;width:100%;margin-bottom:3px;min-height:30px}.event-overlay{position:fixed;inset:0;background:#16212b88;z-index:100;display:grid;place-items:center;padding:24px}.event-detail{background:var(--surface);padding:24px;border-radius:16px;max-width:520px;width:100%;overflow-wrap:anywhere}.close{float:right}.empty{color:var(--muted)}
</style>
