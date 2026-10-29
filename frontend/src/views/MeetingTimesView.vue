<template>
  <main class="meeting-times">
    <header><div><h1>Offer meeting times</h1><p>Invite people to reserve a meeting or employee evaluation with you.</p></div><router-link class="btn btn-secondary" :to="schedulePath">My Schedule</router-link></header>
    <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="!agencyId">Select your agency to manage meeting invitations.</p>
    <template v-else>
      <MeetingReservationPicker v-if="invitationId" :endpoint="`/meeting-reservations/invitations/${invitationId}`" @reserved="refreshList" />
      <section v-if="invitations.length"><h2>Invitations for you</h2><button v-for="i in invitations" :key="i.id" class="btn btn-secondary" @click="openInvitation(i.id)">{{ i.title }} — {{ i.slot_id ? 'Reserved' : 'Choose a time' }}</button></section>
      <section v-if="!editing && !detail"><button class="btn btn-primary" @click="newOffer">Create an offer</button>
        <h2>Your offers</h2><p v-if="!offers.length">You have not offered any meeting times yet.</p>
        <ul><li v-for="o in offers" :key="o.id"><button class="offer-link" @click="openOffer(o.id)">{{ o.title }}</button> — {{ o.status }} · expires {{ when(o.expires_at) }}</li></ul>
      </section>
      <form v-if="editing" @submit.prevent="review">
        <h2>{{ draftId ? 'Edit draft' : 'New meeting offer' }}</h2>
        <div class="fields"><label>Title<input v-model.trim="form.title" required maxlength="180" placeholder="Quarterly employee evaluation" /></label><label>Meeting type<select v-model="form.type"><option value="general">Meeting</option><option value="evaluation">Employee evaluation</option></select></label></div>
        <p>This offer schedules a meeting with you. For a clinical client appointment, use the client scheduling flow.</p>
        <div class="fields"><label>Time zone<input v-model.trim="form.timeZone" required placeholder="America/Denver" /></label><label>Format<select v-model="form.modality"><option value="VIRTUAL">Virtual</option><option value="IN_PERSON">In person</option><option value="BOTH">Let the invitee choose</option></select></label></div>
        <label v-if="form.modality !== 'VIRTUAL'">Confirmed location<input v-model.trim="form.location" required maxlength="500" placeholder="Office, room and address" /></label>
        <p v-if="form.modality !== 'VIRTUAL'">Arrange or request your office through My Schedule before offering that location. This offer reserves your calendar time; it does not reserve an office.</p>
        <label v-if="form.modality !== 'IN_PERSON'">Video meeting link<input v-model.trim="form.meetingUrl" type="url" required placeholder="https://meet.google.com/..." maxlength="1024" /></label>
        <fieldset><legend>Dates and time windows</legend><div v-for="(w,index) in form.windows" :key="index" class="window fields">
          <label>From<input v-model="w.localStart" type="datetime-local" required /></label><label>Until<input v-model="w.localEnd" type="datetime-local" required /></label>
          <label>Length<select v-model.number="w.durationMinutes"><option :value="30">30 minutes</option><option :value="45">45 minutes</option><option :value="60">60 minutes</option></select></label>
          <label>Gap (minutes)<input v-model.number="w.gapMinutes" type="number" min="0" max="120" required /></label><button v-if="form.windows.length>1" type="button" class="btn btn-secondary" @click="form.windows.splice(index,1)">Remove window</button>
        </div><button type="button" class="btn btn-secondary" :disabled="form.windows.length>=14" @click="form.windows.push(emptyWindow())">Add another date or window</button><button type="button" class="btn btn-secondary" :disabled="busy" @click="checkWindows">Check openings</button></fieldset>
        <fieldset v-if="slots.length"><legend>Select the times to offer</legend><button type="button" class="btn btn-secondary" @click="form.selectedStarts=slots.filter(s=>s.available).map(s=>s.startAt)">Select all available</button>
          <label v-for="s in slots" :key="s.startAt" class="check"><input v-model="form.selectedStarts" type="checkbox" :value="s.startAt" :disabled="!s.available" />{{ when(s.startAt) }} – {{ time(s.endAt) }}{{ s.available ? '' : ' — busy' }}</label>
        </fieldset>
        <label>Reservations close at<input v-model="form.expiresLocal" type="datetime-local" required /></label>
        <fieldset><legend>People invited to reserve one time each</legend><div class="fields"><label>Tag an employee<select v-model="employeeId"><option value="">Select an employee</option><option v-for="person in availablePeople" :key="person.id" :value="person.id">{{ person.name }}</option></select></label><button type="button" class="btn btn-secondary" :disabled="!employeeId" @click="addEmployee">Tag employee</button><button type="button" class="btn btn-secondary" @click="form.recipients.push({name:'',email:'',sendEmail:true})">Add email recipient</button></div>
          <div v-for="(r,index) in form.recipients" :key="index" class="recipient fields"><label>Name<input v-model.trim="r.name" :readonly="!!r.userId" required maxlength="150" /></label><label v-if="r.userId" class="check"><input v-model="r.sendEmail" type="checkbox" />Email as well as notify in the app</label><label v-if="r.sendEmail!==false">Email<input v-model.trim="r.email" type="email" required /></label><button type="button" class="btn btn-secondary" @click="form.recipients.splice(index,1)">Remove</button></div>
        </fieldset>
        <label>Email subject<input v-model.trim="form.subject" required maxlength="180" /></label><label>Message<textarea v-model.trim="form.message" rows="5" required maxlength="3000" /></label>
        <p>Each person receives their own invitation. They cannot see other invitees or reservations.</p>
        <button class="btn btn-primary" :disabled="busy || !form.selectedStarts.length || !form.recipients.length">{{ busy ? 'Preparing…' : 'Review invitations' }}</button><button type="button" class="btn btn-secondary" @click="editing=false;detail=null">Back to offers</button>
      </form>
      <section v-if="detail && !editing">
        <h2>{{ detail.title }}</h2><p>Status: {{ detail.status }} · Reservations close {{ when(detail.expires_at) }}</p>
        <template v-if="detail.status==='draft'">
          <h3>Review recipients and email</h3><ul><li v-for="r in detail.config.recipients" :key="r.key">{{ r.name }} — {{ r.email || 'In-app invitation only' }}</li></ul>
          <strong>{{ detail.config.subject }}</strong><p class="email-preview">{{ detail.config.message }}</p><p>Choose one available time by {{ when(detail.expires_at) }}. Your reservation schedules the meeting immediately. Your host will reach out if there are any changes.</p><p>Each invitation includes a personal reservation link and the recipient’s name.</p>
          <ul><li v-for="s in detail.config.slots" :key="s.startAt">{{ when(s.startAt) }} – {{ time(s.endAt) }}</li></ul>
          <p>{{ detail.config.modality === 'BOTH' ? 'Invitees choose in person or virtual' : detail.config.modality === 'VIRTUAL' ? 'Virtual' : 'In person' }}<template v-if="detail.config.location"> · {{ detail.config.location }}</template></p>
          <p v-if="detail.config.meetingUrl">Video meeting: {{ detail.config.meetingUrl }}</p>
          <label class="check commitment"><input v-model="commitment" type="checkbox" /><span><strong>Only offer times you can commit to.</strong> A reservation schedules the meeting automatically. If you later need to change it, update the meeting in My Schedule and notify the attendee.</span></label>
          <button class="btn btn-primary" :disabled="busy || !commitment" @click="publish">Publish and invite</button><button class="btn btn-secondary" :disabled="busy" @click="editDraft">Edit recipients, message or times</button>
        </template>
        <template v-else>
          <p>Confirmations go out after a reservation. Upcoming meetings use reminders 24 hours and one hour beforehand.</p>
          <h3>Reservations</h3><ul><li v-for="s in detail.slots" :key="s.id">{{ when(s.current_start || s.start_at) }} — {{ s.status==='booked' ? (s.event_status==='ACTIVE' ? 'Reserved' : 'Canceled meeting') : s.status }} <router-link v-if="s.status==='booked'" :to="{path:schedulePath,query:{eventId:s.event_id,eventKind:'TEAM_MEETING'}}">Open in My Schedule</router-link></li></ul>
          <h3>Invitation activity</h3><div class="table-wrap"><table><thead><tr><th>Person</th><th>Email</th><th>Invitation viewed</th><th>Reservation</th><th>Delivery</th></tr></thead><tbody><tr v-for="r in detail.recipients" :key="r.id"><td>{{ r.display_name }}</td><td>{{ r.email || 'In app only' }}</td><td>{{ r.first_viewed_at ? when(r.first_viewed_at) : 'Not yet viewed' }}</td><td>{{ r.booked_at ? when(r.booked_at) : 'Not reserved' }}</td><td><p v-for="d in detail.deliveries.filter(d=>Number(d.invitee_id)===Number(r.id))" :key="d.id">{{ deliveryLabel(d.kind) }}: {{ d.status }}<template v-if="d.sent_at"> · {{ when(d.sent_at) }}</template><template v-if="d.opened_at"> · Email opened {{ when(d.opened_at) }}</template><span v-if="d.error_message"> — {{ d.error_message }}</span></p></td></tr></tbody></table></div>
          <p>Email open tracking is approximate. The invitation-view timestamp records when the reservation page was opened.</p>
          <button v-if="detail.status==='open'" class="btn btn-secondary" :disabled="busy" @click="closeOffer">Close offer and release unclaimed times</button><button class="btn btn-secondary" :disabled="busy" @click="openOffer(detail.id)">Refresh activity</button>
        </template>
        <button class="btn btn-secondary" @click="detail=null;refreshList()">Back to offers</button>
      </section>
    </template>
  </main>
</template>
<script setup>
import {computed,nextTick,reactive,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useAgencyStore} from '../store/agency';
import api from '../services/api';
import MeetingReservationPicker from '../components/schedule/MeetingReservationPicker.vue';
const route=useRoute(),router=useRouter(),agencyStore=useAgencyStore(),agencyId=computed(()=>Number(route.query.agencyId || agencyStore.currentAgency?.id || 0));
const schedulePath=computed(()=>route.params.organizationSlug?`/${route.params.organizationSlug}/my-schedule`:'/my-schedule');
const invitationId=computed(()=>Number(route.query.invitation)||null),offers=ref([]),invitations=ref([]),people=ref([]),detail=ref(null),editing=ref(false),busy=ref(false),error=ref(''),notice=ref(''),commitment=ref(false),draftId=ref(null),revision=ref(null),slots=ref([]),employeeId=ref('');
const emptyWindow=()=>({localStart:'',localEnd:'',durationMinutes:30,gapMinutes:10});
const defaults=()=>({title:'',type:'general',timeZone:agencyStore.currentAgency?.timezone || 'America/Denver',modality:'VIRTUAL',location:'',meetingUrl:'',windows:[emptyWindow()],selectedStarts:[],expiresLocal:'',recipients:[],subject:'Choose a meeting time',message:'Please choose one of the available times that works for you.'});
const form=reactive(defaults()),availablePeople=computed(()=>people.value.filter(p=>!form.recipients.some(r=>Number(r.userId)===Number(p.id))));
const parsed=v=>new Date(typeof v==='string' && /^\d{4}-\d\d-\d\d /.test(v)?v.replace(' ','T')+'Z':v);
const when=v=>new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:detail.value?.config?.timeZone || form.timeZone || 'UTC'}).format(parsed(v));
const time=v=>new Intl.DateTimeFormat('en-US',{timeStyle:'short',timeZone:detail.value?.config?.timeZone || form.timeZone || 'UTC'}).format(parsed(v));
const deliveryLabel=k=>({tag:'In-app invitation',invitation:'Email invitation',confirmation:'Confirmation',host_booking:'Host email',host_alert:'Host notification',change:'Schedule update',reminder:'Reminder'}[k] || k);
async function run(action){busy.value=true;error.value='';notice.value='';try{await action();}catch(e){error.value=e.response?.data?.error?.message || e.message || 'Unable to save this offer.';}finally{busy.value=false;}}
async function loadList(){if(!agencyId.value)return;const {data}=await api.get('/meeting-reservations',{params:{agencyId:agencyId.value}});offers.value=data.offers;invitations.value=data.invitations;}
const refreshList=()=>run(loadList);
function newOffer(){Object.assign(form,defaults());draftId.value=null;revision.value=null;detail.value=null;slots.value=[];editing.value=true;commitment.value=false;}
function addEmployee(){const p=people.value.find(p=>Number(p.id)===Number(employeeId.value));if(p)form.recipients.push({userId:p.id,name:p.name,email:p.email || '',sendEmail:true});employeeId.value='';}
async function checkWindows(){await run(async()=>{slots.value=(await api.post('/meeting-reservations/windows',{agencyId:agencyId.value,timeZone:form.timeZone,windows:form.windows})).data.slots;form.selectedStarts=slots.value.filter(s=>s.available).map(s=>s.startAt);});}
async function review(){await run(async()=>{const body={...form,agencyId:agencyId.value,revision:revision.value};detail.value=(await (draftId.value?api.put(`/meeting-reservations/${draftId.value}`,body):api.post('/meeting-reservations',body))).data;draftId.value=detail.value.id;revision.value=detail.value.revision;editing.value=false;commitment.value=false;});}
async function editDraft(){const config=detail.value.config;Object.assign(form,JSON.parse(JSON.stringify(config.editor)));await nextTick();slots.value=config.slots.map(s=>({...s,available:true}));form.selectedStarts=config.slots.map(s=>s.startAt);draftId.value=detail.value.id;revision.value=detail.value.revision;editing.value=true;commitment.value=false;}
async function openOffer(id){await run(async()=>{detail.value=(await api.get(`/meeting-reservations/${id}`)).data;editing.value=false;commitment.value=false;});}
async function publish(){await run(async()=>{detail.value=(await api.post(`/meeting-reservations/${detail.value.id}/publish`,{revision:detail.value.revision,reviewed:true,commitment:commitment.value})).data;notice.value='The times are now offered. Invitations are queued; delivery status appears below.';await loadList();});}
async function closeOffer(){await run(async()=>{detail.value=(await api.post(`/meeting-reservations/${detail.value.id}/close`)).data;notice.value='The offer is closed. Existing reservations remain scheduled.';await loadList();});}
function openInvitation(id){router.push({query:{...route.query,invitation:id}});}
watch(()=>JSON.stringify([form.windows,form.timeZone]),()=>{slots.value=[];form.selectedStarts=[];});
watch(agencyId,()=>run(async()=>{editing.value=false;detail.value=null;if(!agencyId.value)return;await loadList();people.value=(await api.get('/meeting-reservations/roster',{params:{agencyId:agencyId.value}})).data;}),{immediate:true});
</script>
<style scoped>
.meeting-times{max-width:1120px;margin:0 auto;padding:24px;color:var(--text-primary,#26333f)}header{display:flex;justify-content:space-between;gap:16px;align-items:center}h1{margin:0}section,form{margin:24px 0;padding:24px;background:var(--surface-primary,#fff);border:1px solid var(--border,#d4dde5);border-radius:12px}.fields{display:flex;flex-wrap:wrap;gap:16px;align-items:end}label{display:grid;gap:6px;margin:14px 0;flex:1;min-width:180px}input,select,textarea{font:inherit;padding:10px;border:1px solid var(--border,#b8c4cf);border-radius:6px;background:var(--bg-primary,#fff);color:inherit;box-sizing:border-box;width:100%}fieldset{margin:20px 0;padding:16px;border:1px solid var(--border,#d4dde5);border-radius:8px}.check{display:flex;align-items:flex-start;gap:10px;min-width:0}.check input{width:auto;margin-top:4px}.commitment{padding:16px;background:var(--bg-secondary,#edf5f1);border-radius:8px}.btn{margin:8px 8px 8px 0}.error{color:var(--danger,#a32232)}li{margin:12px 0}.offer-link{background:none;border:0;color:var(--primary,#236491);font:inherit;text-decoration:underline;cursor:pointer}.email-preview{white-space:pre-wrap}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:10px;border-bottom:1px solid var(--border,#ddd);text-align:left;vertical-align:top}td p{margin:0 0 6px}.recipient,.window{border-bottom:1px solid var(--border,#ddd);padding-bottom:8px}@media(max-width:600px){.meeting-times{padding:12px}header{display:block}section,form{padding:16px}.fields{display:block}}
</style>
