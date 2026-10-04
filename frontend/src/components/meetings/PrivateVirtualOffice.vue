<template>
  <section class="private-office">
    <header><div><div class="office-brand"><img :src="'/assets/auricwell-session-logo.png'" alt="AuricWell" /><strong>AuricWell</strong></div><p class="eyebrow">Your private space</p><h1>My virtual office</h1></div><span v-if="plan">{{ plan.name }}</span></header>
    <p>A permanent link you can share. Guests can add a name and photo, then wait for you to admit them individually.</p>
    <p v-if="error" role="alert">{{ error }}</p><a v-if="needsMfa" href="/account-security">Open Account security</a><p v-if="encounter.state==='ending'" role="status">Ending the session and disconnecting everyone. The next visit stays locked until disconnection completes.</p><p v-else-if="encounter.hasParticipants && encounter.state==='active'">This encounter stays open until you end it, even if the client leaves.</p>
    <template v-if="room">
      <p class="office-tenant">{{ productName || room.branding?.agencyName }}<span v-if="productName"> · {{ room.branding?.agencyName }}</span></p><label>Your office link<input readonly :value="joinUrl" @focus="$event.target.select()" /></label>
      <button @click="copy">{{ copied ? 'Copied' : 'Copy office link' }}</button>
      <p v-if="!plan.multipleOfficeGuests">One guest at a time. Premium Plus supports couples and families.</p>
      <div class="office-layout">
        <div class="office-main"><div v-if="video" class="office-video"><TherapySessionWorkspace :video="video" :is-host="true" :branding="room.branding" :product-name="productName" :request="workspaceRequest" @connected="connected=true" @leave-request="end" @disconnected="onDisconnect" @meeting-ended="onDisconnect" /></div>
          <button v-if="!video" :disabled="busy || encounter.state==='ending'" @click="open">{{ encounter.state==='active' ? 'Reconnect to current session' : 'Open office video' }}</button><button v-if="video || ['active','ending'].includes(encounter.state)" :disabled="busy" @click="end">{{ encounter.state==='ending' ? 'Retry disconnection' : 'End session for everyone' }}</button>
        </div>
        <aside aria-label="Office waiting room"><h2>Waiting · {{ waiting.length }}</h2>
          <p v-if="!waiting.length">No guests waiting.</p>
          <article v-for="guest in waiting" :key="guest.id"><button v-if="guest.guestPhotoUrl" class="photo-button" :aria-label="`Enlarge photo of ${guest.guestDisplayName}`" @click="selectedPhoto=guest"><img :src="guest.guestPhotoUrl" :alt="`Snapshot supplied by ${guest.guestDisplayName}`" /></button><div v-else class="guest-initial">{{ guest.guestDisplayName.slice(0,1) }}</div><strong>{{ guest.guestDisplayName }}</strong>
            <p>{{ guest.guestPhotoUrl ? "Select the photo to enlarge it." : "No photo supplied." }}</p><button :disabled="!connected || busy || encounter.hasParticipants || encounter.state!=='active'" @click="admit(guest.id)">Start session with {{ guest.guestDisplayName }}</button><button v-if="encounter.hasParticipants && admitted.length && plan.multipleOfficeGuests && encounter.state==='active'" :disabled="!connected || busy" @click="sameSessionGuest=guest">Add to this couples / family session</button><button :disabled="busy" @click="dismiss(guest.id)">Dismiss</button>
          </article>
          <h2>Admitted · {{ admitted.length }}</h2><p v-for="guest in admitted" :key="guest.id">{{ guest.guestDisplayName }} <small>{{ guest.ipAddress }}</small></p>
        </aside>
      </div>
    </template>
    <section v-if="sameSessionGuest" class="same-session-confirm" role="dialog" aria-modal="true" aria-label="Add to current session"><h2>Add {{ sameSessionGuest.guestDisplayName }} to this session?</h2><p>Only continue if they are an intended participant in this couples or family session. They will see its shared content.</p><button :disabled="busy" @click="admit(sameSessionGuest.id,true)">Add to current session</button><button @click="sameSessionGuest=null">Cancel</button></section>
    <div v-if="plan && !plan.privateOffice"><p>Your plan includes Documentation Hub. Upgrade to Premium for a private office, or Premium Plus for multiple office guests.</p></div>
    <dialog ref="photoDialog" :open="!!selectedPhoto" class="photo-dialog" @keydown.esc="selectedPhoto=null"><template v-if="selectedPhoto"><h2>{{ selectedPhoto.guestDisplayName }}</h2><img :src="selectedPhoto.guestPhotoUrl" :alt="selectedPhoto.guestDisplayName" /><button @click="selectedPhoto=null">Close photo</button></template></dialog>
    <details v-if="room" @toggle="loadHistory"><summary>Visit history &amp; audit log</summary><div class="history-scroll"><table><thead><tr><th>Guest</th><th>IP address</th><th>Admitted</th><th>Admitted duration</th><th>Video duration</th><th>Status</th><th>Session content</th></tr></thead><tbody><tr v-for="visit in history" :key="visit.id"><td>{{ visit.displayName }}</td><td>{{ visit.ipAddress || 'Unavailable' }}</td><td>{{ new Date(visit.admittedAt).toLocaleString() }}</td><td>{{ visit.durationSeconds == null ? 'In progress' : `${Math.floor(visit.durationSeconds/60)}m ${visit.durationSeconds%60}s` }}</td><td>{{ visit.mediaDurationSeconds == null ? 'Not confirmed' : `${visit.mediaDurationSeconds}s` }}</td><td>{{ visit.status }}</td><td><button @click="viewArtifacts(visit.generation)">View files</button></td></tr></tbody></table></div></details>
    <section v-if="historyArtifacts" class="history-files"><h2>Saved session content</h2><button @click="historyArtifacts=null">Close files</button><p v-if="!historyArtifacts.length">No shared content in this visit.</p><article v-for="a in historyVisibleArtifacts" :key="a.id"><strong>{{ a.payload.title || a.type }}</strong><small> · {{ a.role }}</small><p v-if="a.payload.text">{{ a.payload.text }}</p><p v-for="(answer,i) in a.payload.answers || []" :key="i">{{ answer }}</p><a v-if="a.payload.document" :href="a.payload.document" :download="`${a.payload.title || 'attachment'}.pdf`" @click.prevent="downloadHistory(a)">Download PDF</a><a v-if="a.payload.url" :href="a.payload.url" target="_blank" rel="noopener noreferrer">Open resource</a><svg v-if="a.type==='drawing'" viewBox="0 0 1000 700" aria-label="Saved drawing"><polyline v-for="stroke in historyArtifacts.filter(item=>item.type==='drawing'&&item.payload.shareId===a.payload.shareId)" :key="stroke.id" :points="stroke.payload.points.map(p=>p.join(',')).join(' ')" :stroke="stroke.payload.color" fill="none" stroke-width="4" /></svg></article></section>
    <p v-if="plan?.grandfathered">Your existing account includes Premium Plus.</p>
  </section>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import TherapySessionWorkspace from './TherapySessionWorkspace.vue';
const props=defineProps({agencyId:{type:Number,default:0},request:{type:Function,required:true},publicOrigin:{type:String,default:''},productName:{type:String,default:'AuricWell'}});
const call=(path,method='GET',body)=>props.request(path,{method,body});
const room=ref(null),plan=ref(null),waiting=ref([]),admitted=ref([]),video=ref(null),connected=ref(false),error=ref(''),busy=ref(false),copied=ref(false);
const joinUrl=computed(()=>`${props.publicOrigin||window.location.origin}/join/my-room/${room.value?.slug}`);
const encounter=ref({state:'idle',hasParticipants:false}),sameSessionGuest=ref(null),needsMfa=ref(false);
const historyGeneration=ref(0);
const selectedPhoto=ref(null),history=ref([]),historyArtifacts=ref(null);
const historyVisibleArtifacts=computed(()=>(historyArtifacts.value||[]).filter(a=>a.type!=='drawing'||!historyArtifacts.value.some(other=>other.type==='drawing'&&other.payload.shareId===a.payload.shareId&&other.id>a.id)));
const viewArtifacts=generation=>action(async()=>{historyGeneration.value=generation;historyArtifacts.value=[];let afterId=0,more=true;while(more){const data=await call(`/me/history/${generation}/artifacts?afterId=${afterId}`);historyArtifacts.value.push(...data.artifacts);afterId=data.nextCursor;more=data.hasMore;}});
const downloadHistory=a=>action(async()=>{await call(`/me/history/${historyGeneration.value}/artifacts/download`,'POST',{artifactId:a.id});const link=document.createElement('a');link.href=a.payload.document;link.download=`${a.payload.title || 'attachment'}.pdf`;link.click();});
const workspaceRequest=(_path,options)=>props.request(`/me/workspace${_path}`,options);
async function loadHistory(e){if(e.target.open)await action(async()=>{history.value=(await call('/me/history')).visits;});}
let timer,stopped=false;
async function action(fn){if(busy.value)return;busy.value=true;error.value='';try{await fn();}catch(e){needsMfa.value=e.response?.data?.error?.code==='MFA_REQUIRED';error.value=e.response?.data?.error?.message||e.message;}finally{busy.value=false;}}
async function refresh(){try{const data=await call('/me/lobby');waiting.value=data.waiting;admitted.value=data.admitted;encounter.value=data.encounter||{state:'idle',hasParticipants:false};if(encounter.value.state!=='active'){video.value=null;connected.value=false;}if(connected.value)await call('/me/heartbeat','POST');}catch(e){needsMfa.value=e.response?.data?.error?.code==='MFA_REQUIRED';error.value=e.response?.data?.error?.message||e.message;if([401,403,404].includes(Number(e.response?.status||e.status))){video.value=null;connected.value=false;}}}
const open=()=>action(async()=>{video.value=await call('/me/video-token','POST');});
const end=()=>action(async()=>{await call('/me/end','POST');video.value=null;connected.value=false;await refresh();});
function onDisconnect(){connected.value=false;video.value=null;void refresh();}
const admit=(id,sameEncounter=false)=>action(async()=>{await call(`/lobby/${id}/admit`,'POST',{sameEncounter});sameSessionGuest.value=null;await refresh();});
const dismiss=id=>action(async()=>{await call(`/lobby/${id}/dismiss`,'POST');await refresh();});
const copy=()=>action(async()=>{await navigator.clipboard.writeText(joinUrl.value);copied.value=true;});
onMounted(async()=>{await action(async()=>{plan.value=(await call('/me/plan')).plan;if(plan.value.privateOffice){room.value=(await call('/me')).room;await refresh();}});if(!stopped&&room.value)timer=setInterval(refresh,5000);});
onBeforeUnmount(()=>{stopped=true;clearInterval(timer);});
</script>
<style scoped>
.office-brand{display:flex;align-items:center;gap:12px;font-size:22px}.office-brand img{width:48px!important;height:48px;object-fit:contain!important;aspect-ratio:auto!important}
.private-office{box-sizing:border-box;font-family:system-ui,sans-serif;padding:24px;max-width:1800px;margin:auto;background:#fff;color:#173f39;border-radius:18px}.private-office header{display:flex;justify-content:space-between;align-items:center}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.8rem}.private-office input{box-sizing:border-box;display:block;width:100%;padding:12px;margin:8px 0}.private-office button{padding:10px 15px;margin:6px;border-radius:8px;border:1px solid #29745f;background:white;color:#184b3b}.private-office button:disabled{opacity:.5}.office-main{min-width:0}.office-video{min-height:430px;border-radius:12px}.office-layout{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:18px}.private-office aside{max-height:75vh;overflow:auto}.private-office article{padding:12px;border:1px solid #bad4ca;border-radius:12px;margin:12px 0}.private-office img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px}.private-office [role=alert]{color:#a12424}@media(max-width:750px){.office-layout{grid-template-columns:1fr}}
.photo-button{padding:0!important;width:100%;margin:0!important}.photo-dialog{position:fixed;inset:0;z-index:10000;border:1px solid #d5e4dc;border-radius:18px;box-shadow:0 0 0 100vmax #0009;max-width:min(90vw,720px);padding:24px}.photo-dialog img{max-height:65vh;object-fit:contain}.guest-initial{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:#e1eee8}.history-scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:12px;text-align:left;border-bottom:1px solid #dae7e0}summary{cursor:pointer;padding:18px 0}</style>

<style scoped>.same-session-confirm{position:fixed;z-index:10001;inset:30% auto auto 50%;transform:translateX(-50%);width:min(480px,85vw);background:white;padding:24px;border:1px solid #bad4ca;border-radius:16px;box-shadow:0 0 0 100vmax #0009}</style>
