<template>
  <Teleport to="body">
      <aside ref="dialog" class="client-quick-view" role="region" aria-labelledby="client-quick-view-title" tabindex="-1" @keydown="onKeydown" @mouseenter="$emit('keep-open')" @mouseleave="leavePanel" @focusin="$emit('keep-open')" @focusout="leaveFocus">
        <header class="cq-header">
          <div class="cq-avatar" aria-hidden="true">{{ avatar }}</div>
          <div class="cq-heading"><h2 id="client-quick-view-title">{{ label }}</h2>
            <p>{{ client.agency_name || client.agencyName }}<span v-if="client.organization_name && client.organization_id!==client.agency_id"> · {{ client.organization_name }}</span></p>
            <span class="cq-status">{{ status }}</span>
            <span v-if="lifecycle && lifecycle!==status" class="cq-status">Chart status: {{ lifecycle }}</span>
          </div>
          <button class="cq-close" type="button" aria-label="Close client quick view" @click="$emit('close')">×</button>
        </header>
        <div class="cq-actions">
          <button class="cq-primary" type="button" @click="$emit('open-chart',record)">Open chart ↗</button>
          <button type="button" @click="secureMessage">Secure message</button>
          <button type="button" :disabled="emailBusy" @click="emailClient">{{ record.email ? 'Email client' : 'Add client email' }}</button>
          <button type="button" @click="followUp?.open(record)">Follow-up task</button>
        </div>
        <div class="cq-content">
          <p v-if="loading" role="status">Loading client overview…</p>
          <p v-if="profileError" role="alert">{{ profileError }}</p>
          <p v-if="actionError" role="alert">{{ actionError }}</p>
          <section class="cq-card"><h3>Appointments</h3>
            <p v-if="snapshot?.unavailable" role="status">Some appointment dates are unavailable.</p>
            <dl><div><dt>Next scheduled</dt><dd>{{ date(snapshot?.nextAt) }}</dd></div>
              <div><dt>Last scheduled</dt><dd>{{ date(snapshot?.lastAt) }}</dd></div>
              <div><dt>Last completed</dt><dd>{{ date(snapshot?.lastCompletedAt) }}</dd></div>
              <div v-if="daysSinceVisit!==null"><dt>Since completed visit</dt><dd>{{ daysSinceVisit }} days</dd></div></dl>
            <details class="cq-status-help"><summary>How status works</summary><p>Received is an intake / chart status. Staff can change it in the chart; completing record import marks the client Current. Active services reflects an active service assignment. Billing imports currently apply a 60-day rule based on billed encounters; this overview does not automatically discharge a client.</p></details>
            <button class="cq-link" type="button" @click="$emit('open-chart',record,'schedule')">View schedule</button>
          </section>
          <section class="cq-card"><h3>Messages</h3>
            <p v-if="snapshot?.messagesUnavailable || !snapshot">Unread secure messages could not be checked.</p>
            <p v-else>{{ snapshot.unreadFamilyMessages || 0 }} unread client / guardian secure message{{ snapshot.unreadFamilyMessages===1?'':'s' }} in your inbox.</p>
            <p v-if="snapshot?.correspondenceUnavailable">Email / SMS conversations could not be fully checked.</p><p v-else-if="snapshot">{{ snapshot.unreadCorrespondence || 0 }} unread email / SMS conversation{{ snapshot.unreadCorrespondence===1?'':'s' }} filed to this chart.</p>
            <button class="cq-link" type="button" @click="openMessages">Open secure conversations</button>
            <button class="cq-link" style="display:block;margin-top:8px" type="button" @click="$emit('open-chart',record,'communications')">View chart communications</button>
          </section>
          <section class="cq-card"><h3>To do and care reminders</h3>
            <p v-if="chartTypeError" role="status">Service reminders could not be checked. Open the chart to review.</p>
            <p v-else-if="!chartProfile" role="status">Checking service types…</p>
            <p v-else-if="!clinicalCare"><button type="button" class="cq-link" @click="$emit('open-chart',record,'notes')">{{ chartProfile.types.includes('learning') ? 'View Learning notes' : 'View care record' }}</button></p>
            <ClientCareOverview v-if="clinicalCare" :key="`${agencyId}:${client.id}`" :client-id="client.id" :agency-id="agencyId" @open-chart="tab=>$emit('open-chart',record,tab)" @close="$emit('close')" @fiscal-sessions="$emit('fiscal-sessions',$event)" @keep-open="$emit('keep-open')" @leave="$emit('leave')" />
            <h4>Your follow-up tasks</h4>
            <p v-if="tasksLoading" role="status">Loading your follow-ups…</p>
            <p v-if="tasksError" role="alert">{{ tasksError }}</p>
            <ul v-if="tasks.length" class="cq-task-list"><li v-for="task in tasks" :key="task.id">
              <RouterLink :to="{path:prefix+'/tasks',query:{taskId:String(task.id),agencyId:String(agencyId)}}">{{ task.title }}</RouterLink>
              <small v-if="task.dueDate">Due {{ portalCalendarDate(task.dueDate) }}</small>
            </li></ul>
            <p v-else-if="!tasksLoading && !tasksError">No open follow-up tasks assigned to you.</p>
            <p v-if="record.action_needed || record.next_action">{{ record.action_needed || record.next_action }}</p>
            <p v-if="record.document_status==='NONE'">Paperwork needs attention.</p>
            <button class="cq-link" type="button" @click="$emit('open-chart',record,'checklist')">View client action items</button>
          </section>
          <section class="cq-card"><h3>Client contact</h3>
            <dl><div><dt>Phone</dt><dd><a v-if="record.contact_phone" :href="'tel:'+record.contact_phone">{{ record.contact_phone }}</a><span v-else>Not recorded</span></dd></div>
              <div><dt>Email</dt><dd><button v-if="record.email" class="cq-link" type="button" @click="emailClient">{{ record.email }}</button><span v-else>Not recorded</span></dd></div></dl>
            <button class="cq-link" type="button" @click="$emit('open-chart',record,'demographics')">Edit contact details</button>
          </section>
          <section v-if="canViewGuardians" class="cq-card"><h3>Guardians and authorized contacts</h3>
            <p v-if="guardianActionError" role="alert">{{ guardianActionError }}</p>
            <p v-if="guardiansLoading" role="status">Loading linked contacts…</p>
            <p v-if="guardiansError" role="alert">{{ guardiansError }}</p>
            <p v-if="!guardiansLoading && !guardiansError && !activeGuardians.length">No active guardian account links.</p>
            <article v-for="guardian in activeGuardians" :key="guardian.guardian_user_id" class="cq-contact">
              <strong>{{ [guardian.first_name,guardian.last_name].filter(Boolean).join(' ') || 'Guardian' }}</strong>
              <small>{{ guardian.relationship_title || guardian.relationship_type || 'Guardian' }}</small>
              <a v-if="guardian.phone" :href="'tel:'+guardian.phone">{{ guardian.phone }}</a>
              <span v-if="guardian.email">{{ guardian.email }}</span>
              <button class="cq-link" type="button" :disabled="!!recipientBusy" @click="messageGuardian(guardian)">{{ recipientBusy===Number(guardian.guardian_user_id)?'Checking guardian…':'Message this guardian' }}</button>
            </article>
            <button class="cq-link" type="button" @click="$emit('open-chart',record,'guardians')">View relationships and access</button>
          </section>
          <section v-if="school" class="cq-card"><h3>School coordination</h3>
            <dl><div><dt>School</dt><dd>{{ client.organization_name || '—' }}</dd></div>
              <div><dt>Grade / year</dt><dd>{{ [client.grade,client.school_year].filter(Boolean).join(' · ') || '—' }}</dd></div>
              <div><dt>Assigned day</dt><dd>{{ client.service_day || 'Not assigned' }}</dd></div>
              <div><dt>ROI expires</dt><dd>{{ client.roi_expires_at ? portalCalendarDate(client.roi_expires_at) : '—' }}</dd></div></dl>
            <button class="cq-link" type="button" @click="$emit('school-workspace',client)">Comments and school tickets</button>
          </section>
        </div>
      </aside>
  </Teleport>
  <ClientFollowUpTask ref="followUp" :agency-id="agencyId" @created="loadTasks" />
</template>
<script setup>
import {portalCalendarDate} from '../../utils/portalDates';
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useAuthStore} from '../../store/auth';
import api from '../../services/api';
import ClientFollowUpTask from '../clients/ClientFollowUpTask.vue';
import ClientCareOverview from './ClientCareOverview.vue';
import {useClientChartTypes} from '../../composables/useClientChartTypes.js';
import {resolveClientEmail,composeClientEmail} from '../../utils/clientEmailComposer.js';
import {useLinkedGuardianContact} from '../../composables/useLinkedGuardianContact.js';
import {sessionDateLabel as date} from '../../composables/useClientSessionSnapshots.js';
const props=defineProps({client:{type:Object,required:true},label:String,status:String,snapshot:Object,school:Boolean});
const emit=defineEmits(['close','open-chart','school-workspace','keep-open','leave','fiscal-sessions']);
const route=useRoute(),router=useRouter(),auth=useAuthStore();
const prefix=computed(()=>route.params.organizationSlug?'/'+route.params.organizationSlug:'');
const agencyId=computed(()=>Number(props.client.agency_id));
const {profile:chartProfile,error:chartTypeError}=useClientChartTypes(()=>[Number(props.client.id),agencyId.value,true]);
const clinicalCare=computed(()=>chartProfile.value?.types?.some(type=>['clinical','school'].includes(type)));
const record=ref({id:props.client.id,agency_id:props.client.agency_id}),loading=ref(false),profileError=ref('');
const tasks=ref([]),tasksLoading=ref(false),tasksError=ref(''),reload=ref(0);
const guardians=ref([]),guardiansLoading=ref(false),guardiansError=ref('');
const canViewGuardians=computed(()=>['super_admin','admin','support','provider','provider_plus','intern','intern_plus','clinical_practice_assistant','supervisor'].includes(auth.user?.role));
useLinkedGuardianContact({clientId:computed(()=>props.client.id),canView:canViewGuardians,guardians,loading:guardiansLoading,error:guardiansError,api});
const activeGuardians=computed(()=>guardians.value.filter(g=>{
  let p=g.permissions_json;
  if(typeof p==='string'){try{p=JSON.parse(p);}catch{return false;}}
  return Number(g.access_enabled)===1 && g.relationship_type!=='self' && !p?.revoked && !p?.relationshipRevoked;
}));
const guardianActionError=ref(''),recipientBusy=ref(0);let recipientRequest=0;onBeforeUnmount(()=>recipientRequest++);
const dialog=ref(null),followUp=ref(null),emailBusy=ref(false),actionError=ref('');
const avatar=computed(()=>String(props.label || props.client.initials || '?').split(/\s+/).map(word=>word[0]).slice(0,2).join(''));
const lifecycle=computed(()=>record.value.client_status_label || record.value.status_label || '');
const daysSinceVisit=computed(()=>{const value=props.snapshot?.lastCompletedAt;if(!value)return null;const days=Math.floor((Date.now()-new Date(value).getTime())/86400000);return Number.isFinite(days)?Math.max(0,days):null;});
function leavePanel(){if(dialog.value?.contains(document.activeElement))emit('keep-open');else emit('leave');}
function leaveFocus(event){if(!dialog.value?.contains(event.relatedTarget))emit('leave');}
function onKeydown(event){if(event.key==='Escape'){event.stopPropagation();emit('close');}}
function openMessages(){emit('close');router.push({path:prefix.value+'/messages',query:{view:'hub',secureClientId:String(props.client.id),agencyId:String(agencyId.value)}});}
function loadTasks(){reload.value++;}
watch(()=>[props.client.id,agencyId.value,reload.value],async([id,aid],_,onCleanup)=>{
  let active=true;onCleanup(()=>{active=false;});
  tasks.value=[];tasksError.value='';tasksLoading.value=true;
  try{const {data}=await api.get(`/clients/${id}/quick-view-tasks`,{params:{agencyId:aid},headers:{'X-Agency-Id':String(aid)},skipGlobalLoading:true});
    if(active)tasks.value=data.tasks || [];
  }catch{if(active)tasksError.value='Your follow-up tasks could not load.';}
  finally{if(active)tasksLoading.value=false;}
},{immediate:true});
watch(()=>[props.client.id,agencyId.value],async([id,aid],_,onCleanup)=>{
  let active=true;recipientRequest++;recipientBusy.value=0;guardianActionError.value='';onCleanup(()=>{active=false;});record.value={id:props.client.id,agency_id:aid};profileError.value='';actionError.value='';loading.value=true;
  try{const {data}=await api.get(`/clients/${id}`,{headers:{'X-Agency-Id':String(aid)},skipGlobalLoading:true});
    if(active)record.value={...props.client,...data,agency_id:aid};
  }catch{if(active)profileError.value='Client contact details could not load. Reopen the quick view to retry.';}
  finally{if(active)loading.value=false;}
},{immediate:true});
function secureMessage(){emit('close');router.push({path:prefix.value+'/messages',query:{view:'hub',channel:'secure',secureRecipient:'client',secureClientId:String(props.client.id),agencyId:String(agencyId.value)}});}
async function messageGuardian(guardian){
  const request=++recipientRequest,clientId=Number(props.client.id),aid=agencyId.value,uid=Number(guardian.guardian_user_id);
  recipientBusy.value=uid;guardianActionError.value='';emit('keep-open');
  try{
    const {data}=await api.get(`/messages/hub/people/${encodeURIComponent(`client:${clientId}@${aid}`)}`,{params:{agencyId:aid},skipGlobalLoading:true});
    if(request!==recipientRequest)return;
    const person=data?.person,linked=person?.clientMessaging?.guardians?.find(g=>Number(g.userId)===uid&&!g.isSelf);
    const method=linked?.methods?.find(m=>m.id==='secure');
    if(Number(person?.clientId)!==clientId||Number(person?.agencyId)!==aid||!linked||linked.sharedSecureEligible===false||!method?.available)throw Error(linked?.sharedSecureEligible===false ? 'Secure messaging is not enabled for this guardian on this chart. Review relationships and portal access.' : method?.reason||'This guardian does not have an available secure messaging account. Review their portal access in the chart.');
    emit('close');await router.push({path:prefix.value+'/messages',query:{view:'hub',channel:'secure',secureRecipient:'guardian',secureClientId:String(clientId),secureGuardianUserId:String(uid),agencyId:String(aid)}});
  }catch(error){if(request===recipientRequest)guardianActionError.value=error.response ? 'Guardian messaging could not be checked. Try again or open relationships and access.' : error.message;}
  finally{if(request===recipientRequest)recipientBusy.value=0;}
}
async function emailClient(){
  if(!record.value.email){emit('open-chart',record.value,'demographics');return;}
  emailBusy.value=true;actionError.value='';
  try{composeClientEmail(router,await resolveClientEmail(api,props.client.id,agencyId.value));}
  catch(error){actionError.value=error.message;}
  finally{emailBusy.value=false;}
}
</script>
<style scoped>
.client-quick-view{position:fixed;top:0;right:0;z-index:21000;font-family:var(--font-body,Arial,sans-serif);width:min(620px,100vw);height:100dvh;background:#f5f8f7;box-shadow:-12px 0 40px #142e3529;overflow:auto;color:var(--text-primary,#18372d);outline:none}
.cq-header{display:flex;align-items:center;gap:16px;padding:28px;background:linear-gradient(120deg,#eaf4ed,#fff)}
.cq-avatar{width:58px;height:58px;border-radius:50%;background:#d6e8dc;color:#28513c;display:grid;place-items:center;font-size:22px;font-weight:700;flex-shrink:0}
.cq-heading{flex:1;min-width:0}.cq-heading h2{font-size:24px;margin:0 0 8px;overflow-wrap:normal;word-break:normal}.cq-heading p{margin:0 0 8px;color:#52665d}
.cq-status{display:inline-block;margin:2px 4px 2px 0;border-radius:20px;padding:5px 10px;background:#e3eee7;font-size:13px}
.cq-close{align-self:flex-start;background:none;border:0;font-size:28px;color:#697c72;cursor:pointer}
.cq-actions{display:flex;flex-wrap:wrap;gap:8px;padding:16px 28px;background:#fff;border-bottom:1px solid #dce6df}
.cq-actions button{font:inherit;border:1px solid #cbdcd0;background:#fff;color:#315c42;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:13px}
.cq-actions .cq-primary{background:var(--primary,#4e8262);color:#fff;border-color:transparent}
.cq-content{padding:20px;display:grid;gap:16px}.cq-card{background:#fff;border:1px solid #dce6df;border-radius:12px;padding:20px;min-width:0}.cq-card h3{font-size:16px;margin:0 0 16px}
.cq-card dl{margin:0}.cq-card dl>div{display:grid;grid-template-columns:145px minmax(0,1fr);gap:12px;margin:12px 0;font-size:14px}.cq-card dt{color:#64756c}.cq-card dd{margin:0;overflow-wrap:anywhere}
.cq-link{border:0;padding:0;background:none;font:inherit;color:var(--primary,#386e4b);cursor:pointer;text-align:left;text-decoration:underline;font-size:14px}
.cq-contact{display:grid;gap:6px;padding:12px 0;border-top:1px solid #e8eeea;overflow-wrap:anywhere}.cq-contact small,.cq-task-list small{color:#68776e}
.cq-task-list{padding-left:20px}.cq-task-list li{margin-bottom:12px}.cq-task-list small{display:block;margin-top:4px}.cq-card p{font-size:14px}
@media(max-width:480px){.cq-header{padding:20px}.cq-content{padding:12px}.cq-card dl>div{grid-template-columns:115px minmax(0,1fr)}.cq-actions{padding:12px}}
</style>
