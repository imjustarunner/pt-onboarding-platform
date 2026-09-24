<template>
  <section class="calendar-connection">
    <h2>▦ Bring in a Google calendar</h2>
    <p>Choose a shared calendar from your Workspace account. Events added on your computer or in Google appear live with a matching picture and activity based on their title, such as “Pick up Sam from airport” or “Going to zoo”. To assign a person or keep a separate copy, add it to the family calendar.</p>
    <p class="calendar-note">Imports are saved copies. Later changes in Google and changes here are separate.</p>
    <template v-if="!connection">
      <button :disabled="busy" @click="listCalendars">Find my shared calendars</button>
      <form v-if="calendars.length" @submit.prevent="connect"><label>Family calendar<select v-model="selected" required><option value="" disabled>Choose a calendar</option><option v-for="c in calendars" :key="c.id" :value="c.id">{{ c.name }}</option></select></label><button :disabled="busy || !selected">Connect calendar</button></form>
      <p v-if="searched && !calendars.length">No shared calendars found. Add your family calendar to your Google account, then try again.</p>
    </template>
    <template v-else><div class="calendar-actions"><strong>{{ connection.calendar_name }}</strong><button :disabled="busy" @click="refresh">Refresh Google events</button><button :disabled="busy" @click="disconnect">Disconnect</button></div>
      <div v-if="events.length" class="calendar-actions"><label>Import for<select v-model="memberId"><option :value="null">Everyone</option><option v-for="m in members" :key="m.user_id" :value="m.user_id">{{ m.display_name }}</option></select></label><label><input v-model="automatic" type="checkbox" /> Match each event’s title automatically</label><FamilyEventTypePicker v-if="!automatic" v-model="type" label="Theme" @change="artworkVariant=null" /><FamilyArtworkPicker v-if="!automatic" v-model="artworkVariant" :event-type="type" /></div>
      <div class="google-events"><article v-for="e in events" :key="e.id"><div><strong>{{ e.title }}</strong><small>{{ date(e) }}</small></div><button :disabled="busy || e.imported" @click="importEvent(e)">{{ e.imported?'Added ✓':'＋ Add to family' }}</button></article></div>
      <p v-if="loaded && !events.length">No events in the next 90 days.</p>
    </template>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
<script setup>
import { onMounted,ref } from 'vue';
import { inferFamilyEventType } from '../../utils/familyCommandCenter';
import FamilyEventTypePicker from './FamilyEventTypePicker.vue';
import FamilyArtworkPicker from './FamilyArtworkPicker.vue';
const props=defineProps({http:{type:Function,required:true},householdId:{type:[Number,String],required:true},members:{type:Array,default:()=>[]},timezone:String});
const emit=defineEmits(['updated','error']);
const automatic=ref(true);
const busy=ref(false),connection=ref(null),calendars=ref([]),events=ref([]),selected=ref(''),searched=ref(false),loaded=ref(false),memberId=ref(null),type=ref('family'),artworkVariant=ref(null),message=ref('');
const path=()=>`/households/${props.householdId}`;
async function run(fn){if(busy.value)return;busy.value=true;message.value='';try{await fn();}catch(e){emit('error',e);}finally{busy.value=false;}}
async function listCalendars(){await run(async()=>{calendars.value=(await props.http.get(`${path()}/google/calendars`)).data;searched.value=true;});}
async function connect(){await run(async()=>{const{data}=await props.http.post(`${path()}/google/connect`,{calendarId:selected.value});connection.value={calendar_name:data.name};await loadEvents();emit('updated');});}
async function loadEvents(){events.value=(await props.http.get(`${path()}/google/events`)).data.events;loaded.value=true;}
async function refresh(){await run(async()=>{await loadEvents();emit('updated');});}
async function disconnect(){await run(async()=>{await props.http.delete(`${path()}/google`);connection.value=null;events.value=[];message.value='Disconnected. Events already added remain on your family calendar.';emit('updated');});}
async function importEvent(e){await run(async()=>{await props.http.post(`${path()}/google/import`,{eventId:e.id,memberUserId:memberId.value,eventType:automatic.value?inferFamilyEventType(e.title).id:type.value,autoTheme:automatic.value,artworkVariant:automatic.value?null:artworkVariant.value});e.imported=true;message.value='Added to the family calendar and personal schedules.';emit('updated');});}
function date(e){return new Date(e.startAt).toLocaleString('en-US',{month:'short',day:'numeric',...(e.allDay?{}:{hour:'numeric',minute:'2-digit'}),timeZone:props.timezone})+(e.allDay?' · All day':'');}
onMounted(()=>run(async()=>{connection.value=(await props.http.get(`${path()}/tools`)).data.calendar;if(connection.value)await loadEvents();}));
</script>
<style scoped>
.calendar-connection{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:24px;margin:22px 0;max-width:850px;color:var(--ink)}
.calendar-connection h2{font-size:18px;margin:0 0 12px;color:var(--purple)}
.calendar-connection p{font-size:13px;line-height:1.7;margin:12px 0}
.calendar-connection .calendar-note{font-size:13px;color:var(--muted)}
.calendar-connection label{display:flex;flex-direction:column;gap:8px;font-size:13px;margin:12px 0}
.calendar-connection select{font:inherit;padding:10px;border:1px solid var(--control);border-radius:9px;background:var(--surface);color:inherit;max-width:100%}
.calendar-connection button{font:inherit;font-size:13px;padding:10px;border:1px solid var(--control);background:var(--soft);border-radius:9px;color:var(--purple);cursor:pointer}
.calendar-connection button:disabled{opacity:.55;cursor:default}
.calendar-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.google-events{max-height:430px;overflow:auto;margin-top:15px}
.google-events article{display:flex;gap:15px;align-items:center;justify-content:space-between;padding:15px 0;border-bottom:1px solid var(--line)}
.google-events strong{font-size:13px}
.google-events small{display:block;margin-top:5px;color:var(--muted)}
.google-events button{flex-shrink:0}

</style>
