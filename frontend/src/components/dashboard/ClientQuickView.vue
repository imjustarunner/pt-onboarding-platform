<template>
  <Teleport to="body">
    <div class="cq-backdrop" @click.self="$emit('close')">
      <aside ref="dialog" class="client-quick-view" role="dialog" aria-modal="true" aria-labelledby="client-quick-view-title" tabindex="-1" @keydown="onKeydown">
        <header class="cq-header">
          <div class="cq-avatar" aria-hidden="true">{{ avatar }}</div>
          <div class="cq-heading"><h2 id="client-quick-view-title">{{ label }}</h2>
            <p>{{ client.agency_name || client.agencyName }}<span v-if="client.organization_name && client.organization_id!==client.agency_id"> · {{ client.organization_name }}</span></p>
            <span class="cq-status">{{ status }}</span>
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
              <div><dt>Last completed</dt><dd>{{ date(snapshot?.lastCompletedAt) }}</dd></div></dl>
            <button class="cq-link" type="button" @click="$emit('open-chart',record,'schedule')">View schedule</button>
          </section>
          <section class="cq-card"><h3>To do</h3>
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
            <p v-if="guardiansLoading" role="status">Loading linked contacts…</p>
            <p v-if="guardiansError" role="alert">{{ guardiansError }}</p>
            <p v-if="!guardiansLoading && !guardiansError && !activeGuardians.length">No active guardian account links.</p>
            <article v-for="guardian in activeGuardians" :key="guardian.guardian_user_id" class="cq-contact">
              <strong>{{ [guardian.first_name,guardian.last_name].filter(Boolean).join(' ') || 'Guardian' }}</strong>
              <small>{{ guardian.relationship_title || guardian.relationship_type || 'Guardian' }}</small>
              <a v-if="guardian.phone" :href="'tel:'+guardian.phone">{{ guardian.phone }}</a>
              <span v-if="guardian.email">{{ guardian.email }}</span>
              <button class="cq-link" type="button" @click="messageGuardian(guardian)">Message this guardian</button>
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
    </div>
  </Teleport>
  <ClientFollowUpTask ref="followUp" :agency-id="agencyId" @created="loadTasks" />
</template>
<script setup>
import {portalCalendarDate} from '../../utils/portalDates';
import {computed,ref,watch,onMounted,onBeforeUnmount,nextTick} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useAuthStore} from '../../store/auth';
import api from '../../services/api';
import ClientFollowUpTask from '../clients/ClientFollowUpTask.vue';
import {resolveClientEmail,composeClientEmail} from '../../utils/clientEmailComposer.js';
import {useLinkedGuardianContact} from '../../composables/useLinkedGuardianContact.js';
import {sessionDateLabel as date} from '../../composables/useClientSessionSnapshots.js';
const props=defineProps({client:{type:Object,required:true},label:String,status:String,snapshot:Object,school:Boolean});
const emit=defineEmits(['close','open-chart','school-workspace']);
const route=useRoute(),router=useRouter(),auth=useAuthStore();
const prefix=computed(()=>route.params.organizationSlug?'/'+route.params.organizationSlug:'');
const agencyId=computed(()=>Number(props.client.agency_id));
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
const dialog=ref(null),followUp=ref(null),emailBusy=ref(false),actionError=ref('');
const avatar=computed(()=>String(props.label || props.client.initials || '?').split(/\s+/).map(word=>word[0]).slice(0,2).join(''));
let previousFocus,previousOverflow;
onMounted(async()=>{previousFocus=document.activeElement;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';await nextTick();dialog.value?.focus();});
onBeforeUnmount(()=>{document.body.style.overflow=previousOverflow;previousFocus?.focus?.();});
function onKeydown(event) {
  if(event.key==='Escape'){event.stopPropagation();emit('close');return;}
  if(event.key!=='Tab')return;
  const items=[...dialog.value.querySelectorAll('button:not(:disabled),a[href],input,select,textarea')];
  const first=items[0],last=items.at(-1);
  if(event.shiftKey && (document.activeElement===first || document.activeElement===dialog.value)){event.preventDefault();last?.focus();}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
}
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
  let active=true;onCleanup(()=>{active=false;});record.value={id:props.client.id,agency_id:aid};profileError.value='';actionError.value='';loading.value=true;
  try{const {data}=await api.get(`/clients/${id}`,{headers:{'X-Agency-Id':String(aid)},skipGlobalLoading:true});
    if(active)record.value={...props.client,...data,agency_id:aid};
  }catch{if(active)profileError.value='Client contact details could not load. Reopen the quick view to retry.';}
  finally{if(active)loading.value=false;}
},{immediate:true});
function secureMessage(){emit('close');router.push({path:prefix.value+'/messages',query:{view:'hub',channel:'secure',secureRecipient:'client',secureClientId:String(props.client.id),agencyId:String(agencyId.value)}});}
function messageGuardian(guardian){emit('close');router.push({path:prefix.value+'/messages',query:{view:'hub',channel:'secure',secureRecipient:'guardian',secureClientId:String(props.client.id),secureGuardianUserId:String(guardian.guardian_user_id),agencyId:String(agencyId.value)}});}
async function emailClient(){
  if(!record.value.email){emit('open-chart',record.value,'demographics');return;}
  emailBusy.value=true;actionError.value='';
  try{composeClientEmail(router,await resolveClientEmail(api,props.client.id,agencyId.value));}
  catch(error){actionError.value=error.message;}
  finally{emailBusy.value=false;}
}
</script>
<style scoped>
.cq-backdrop{position:fixed;inset:0;background:#142e3540;z-index:21000;display:flex;justify-content:flex-end}
.client-quick-view{font-family:var(--font-body,Arial,sans-serif);width:min(620px,100vw);height:100dvh;background:#f5f8f7;box-shadow:-12px 0 40px #142e3529;overflow:auto;color:var(--text-primary,#18372d);outline:none}
.cq-header{display:flex;align-items:center;gap:16px;padding:28px;background:linear-gradient(120deg,#eaf4ed,#fff)}
.cq-avatar{width:58px;height:58px;border-radius:50%;background:#d6e8dc;color:#28513c;display:grid;place-items:center;font-size:22px;font-weight:700;flex-shrink:0}
.cq-heading{flex:1;min-width:0}.cq-heading h2{font-size:24px;margin:0 0 8px;overflow-wrap:anywhere}.cq-heading p{margin:0 0 8px;color:#52665d}
.cq-status{display:inline-block;border-radius:20px;padding:5px 10px;background:#e3eee7;font-size:13px}
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
