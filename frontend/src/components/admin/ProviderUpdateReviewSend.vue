<template>
 <section class="review-send">
  <h2>Staff progress &amp; individual sends</h2>
  <p>See everyone in one list, including staff who have not received an invitation. Preview a person’s update and amendment, mark your review complete, then send from their row. Time shown is recorded active time; idle and timed-out periods are excluded.</p>
  <label>Saved Provider Update<select v-model="pushId" :disabled="busy" @change="loadPush"><option value="">Choose an update…</option><option v-for="p in availablePushes" :key="p.id" :value="p.id">{{p.title}} · #{{p.id}} · {{p.status}}</option></select></label>
  <p v-if="!availablePushes.length">Create and save a Provider Update from Compose first.</p>
  <p v-if="error" role="alert" class="error">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
  <template v-if="push">
   <details v-if="push.status !== 'closed'"><summary>Manage videos, photos &amp; subsection guides</summary><ProviderUpdateTrainingEditor :agency-id="agencyId" :push-id="push.id" :config="push.section_config_json" @saved="trainingSaved" /></details>
   <div class="roster-toolbar">
    <label>Find a person<input v-model="search" type="search" placeholder="Name or work email" /></label>
    <button type="button" :disabled="busy || refreshing" @click="refreshProgress">Refresh progress</button>
    <small role="status">{{refreshedAt ? `Updated ${refreshedAt.toLocaleTimeString()}` : ''}} · Refreshes every 30 seconds while this page is visible.</small>
   </div>
   <p v-if="refreshError" role="alert" class="error">{{refreshError}}</p>
   <p class="roster-summary"><strong>{{rows.length}} staff</strong> · {{rows.filter(r=>['sent','delivered'].includes(r.recipient?.last_delivery_status)).length}} invitations sent · {{rows.filter(r=>r.recipient?.status==='finalized').length}} complete</p>
   <div class="roster-scroll">
    <table class="roster">
     <thead><tr><th scope="col">Staff member</th><th scope="col">Invitation</th><th scope="col">Progress</th><th scope="col">Active time</th><th scope="col">Last opened</th><th scope="col">Individual actions</th></tr></thead>
     <tbody>
      <tr v-for="row in filteredRows" :key="row.provider_user_id" :data-person-id="row.provider_user_id">
       <th scope="row">{{row.first_name}} {{row.last_name}}<small>{{row.work_email || row.email || 'No work email saved'}}</small><small v-if="!row.eligible">No longer eligible for a new invitation</small></th>
       <td><span class="status">{{invitationStatus(row.recipient)}}</span><small v-if="row.recipient?.last_sent_at">{{formatDate(row.recipient.last_sent_at)}}</small><small v-if="row.recipient?.last_delivery_error" class="error">{{row.recipient.last_delivery_error}}</small></td>
       <td><strong>{{progressStatus(row.recipient)}}</strong><template v-if="Number(row.recipient?.sections_total)"><small>{{row.recipient.sections_completed}} / {{row.recipient.sections_total}} sections</small><progress :value="Number(row.recipient.sections_completed)" :max="Number(row.recipient.sections_total)" :aria-label="`${row.first_name}’s section progress`" /></template></td>
       <td><strong>{{duration(row.recipient?.active_seconds)}}</strong><details v-if="Object.keys(row.recipient?.timeSummary?.sections || {}).length"><summary>Time by section</summary><div v-for="(seconds,key) in row.recipient.timeSummary.sections" :key="key" class="section-time">{{sectionTitle(key)}}: {{duration(seconds)}}</div></details></td>
       <td>{{formatDate(row.recipient?.last_viewed_at)}}</td>
       <td><div class="row-actions"><button type="button" class="row-preview" :disabled="busy || !row.eligible" @click="previewPerson(row)">Preview / review</button><button type="button" class="row-send primary" :disabled="busy || !row.eligible || push.status === 'closed' || !reviews[row.provider_user_id]?.approved" @click="sendRow(row)">{{['sent','delivered'].includes(row.recipient?.last_delivery_status)?'Resend':'Send'}} to {{row.first_name}}</button></div><small>{{reviews[row.provider_user_id]?.approved?'Reviewed — ready to send':'Review before sending'}}</small></td>
      </tr>
      <tr v-if="!filteredRows.length"><td colspan="6">No matching staff.</td></tr>
     </tbody>
    </table>
   </div>
   <div v-if="reviewOpen && person" class="review-overlay" @click.self="closeReview">
    <section class="review-dialog" role="dialog" aria-modal="true" :aria-label="`${name}’s update review`" @keydown.esc="closeReview">
    <button type="button" class="close-review" :disabled="busy" @click="closeReview">Back to staff list</button>
    <h3>{{name}}</h3><p>{{person.work_email || person.email || 'No work email saved'}}</p>
    <p v-if="busy" role="status">Loading / saving…</p>
    <p v-if="error" role="alert" class="error">{{error}}</p>
    <div v-if="previewUrl" class="preview">
     <a :href="previewUrl" target="_blank" rel="noopener noreferrer">Open {{name}}’s full read-only update ↗</a>
     <template v-if="amendment">
      <h3>{{amendment.name}}’s amendment</h3><p>{{amendment.draft?'Private draft — not yet released for signing.':'Previously released agreement.'}}</p>
      <p v-if="wrongReleasedPush" class="error">This agreement belongs to a different update. Select that update or prepare the correct agreement before sending.</p>
      <ul v-if="amendment.issues?.length" class="error"><li v-for="issue in amendment.issues" :key="issue">{{issue}}</li></ul>
      <iframe sandbox="" title="Selected person’s compensation amendment" :srcdoc="amendmentHtml" />
      <button type="button" @click="download">Open printable amendment</button>
     </template>
     <p v-else-if="needsAmendment" class="error">This person’s update includes an amendment, but no matching agreement is available. Prepare it before sending.</p>
     <p v-else>No compensation amendment is assigned in this person’s update.</p>
     <label class="confirm"><input v-model="approved" type="checkbox" :disabled="busy || !ready || push.status === 'closed'" @change="rememberReview" /> I reviewed {{name}}’s update{{amendment?' and amendment':''}} and it is ready to send.</label>
     <p v-if="amendment?.draft">Sending will release this reviewed amendment for their electronic signature and send only {{name}} an invitation at their work email.</p>
     <button type="button" class="primary" :disabled="busy || !approved || !ready || push.status === 'closed'" @click="sendOne">{{amendment?.draft?'Release amendment & send':'Send invitation'}} to {{name}} only</button>
    </div>
    </section>
   </div>
  </template>
 </section>
</template>
<script setup>
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {PROVIDER_UPDATE_SECTIONS} from '../../utils/providerUpdate';
import api from '../../services/api';
import ProviderUpdateTrainingEditor from './ProviderUpdateTrainingEditor.vue';
const props=defineProps({agencyId:{type:[Number,String],required:true},pushes:{type:Array,default:()=>[]}}),emit=defineEmits(['sent']);
const pushId=ref(''),push=ref(null),people=ref([]),personId=ref(''),recipients=ref([]),search=ref(''),busy=ref(false),error=ref(''),notice=ref(''),previewUrl=ref(''),amendment=ref(null),needsAmendment=ref(false),approved=ref(false);
const availablePushes=computed(()=>props.pushes.filter(p=>!String(p.title).startsWith('[PREVIEW]')));
const person=computed(()=>people.value.find(p=>Number(p.provider_user_id)===Number(personId.value)));
const name=computed(()=>person.value?`${person.value.first_name} ${person.value.last_name}`.trim():'');
const reviewOpen=ref(false),reviews=ref({}),refreshing=ref(false),refreshedAt=ref(null),refreshError=ref('');
let refreshTimer,alive=true,reviewTrigger=null;
const rows=computed(()=>{
 const byId=new Map(people.value.map(p=>[Number(p.provider_user_id),{...p,eligible:true,recipient:null}]));
 for(const r of recipients.value){if(Number(r.is_demo_snapshot))continue;const id=Number(r.provider_user_id);byId.set(id,{...(byId.get(id)||{...r,eligible:false}),recipient:r});}
 return [...byId.values()].sort((a,b)=>`${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
});
const filteredRows=computed(()=>rows.value.filter(p=>`${p.first_name} ${p.last_name} ${p.work_email||p.email||''}`.toLowerCase().includes(search.value.toLowerCase())));
function duration(raw){const n=Math.max(0,Math.floor(Number(raw)||0));return `${n>=3600?Math.floor(n/3600)+'h ':''}${Math.floor(n%3600/60)}m ${n%60}s`;}
function formatDate(raw){if(!raw)return '—';const d=new Date(typeof raw==='string'&&!/[zZ]|[+-]\d\d:\d\d$/.test(raw)?raw.replace(' ','T')+'Z':raw);return Number.isNaN(d.getTime())?'—':d.toLocaleString();}
function sectionTitle(key){return PROVIDER_UPDATE_SECTIONS.find(s=>s.key===key)?.title||key.replaceAll('_',' ');}
function invitationStatus(r){return ({sent:'Sent',delivered:'Delivered',pending:'Pending delivery',failed:'Failed',bounced:'Bounced',skipped:'Skipped'})[r?.last_delivery_status]||(r?'Link prepared — not emailed':'Not sent');}
function progressStatus(r){return r?.status==='finalized'?'Complete':r?.status==='in_progress'||Number(r?.active_seconds)>0||Number(r?.sections_completed)>0?'In progress':r?.last_viewed_at?'Opened':'Not started';}
async function refreshProgress(){if(!push.value||refreshing.value)return;const id=Number(push.value.id);refreshing.value=true;refreshError.value='';try{
 const {data}=await api.get(`/provider-update/pushes/${id}`,{params:{agencyId:props.agencyId},skipGlobalLoading:true});
 if(!alive||Number(pushId.value)!==id)return;
 if(JSON.stringify([push.value.section_config_json,push.value.amendment_plan_json])!==JSON.stringify([data.push.section_config_json,data.push.amendment_plan_json])){reviews.value={};approved.value=false;previewUrl.value='';amendment.value=null;reviewOpen.value=false;}
 push.value=data.push;recipients.value=data.recipients||[];refreshedAt.value=new Date();
 }catch(e){if(alive&&Number(pushId.value)===id)refreshError.value='Could not refresh progress. The last recorded values remain visible.';}finally{refreshing.value=false;}}
function rememberReview(){if(!personId.value)return;reviews.value={...reviews.value,[personId.value]:{previewUrl:previewUrl.value,amendment:amendment.value,needsAmendment:needsAmendment.value,approved:approved.value&&ready.value}};}
function closeReview(){if(busy.value)return;reviewOpen.value=false;nextTick(()=>reviewTrigger?.focus?.());}
async function previewPerson(row){reviewTrigger=document.activeElement;personId.value=row.provider_user_id;reviews.value={...reviews.value,[personId.value]:null};reviewOpen.value=true;await preview();await nextTick();document.querySelector('.close-review')?.focus();}
async function sendRow(row){const saved=reviews.value[row.provider_user_id];if(!saved?.approved||busy.value)return;personId.value=row.provider_user_id;previewUrl.value=saved.previewUrl;amendment.value=saved.amendment;needsAmendment.value=saved.needsAmendment;approved.value=saved.approved;await sendOne();}

const wrongReleasedPush=computed(()=>!!amendment.value&&!amendment.value.draft&&Number(amendment.value.pushId)!==Number(push.value?.id));
const ready=computed(()=>!wrongReleasedPush.value&&!!previewUrl.value&&(!needsAmendment.value||!!amendment.value)&&!(amendment.value?.issues?.length));
const amendmentHtml=computed(()=>`<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;padding:24px;color:#243b30}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:9px}h1,h2,h3{color:#3e6d54}
</style></head><body>${amendment.value?.html||''}</body></html>`);
function resetReview(){previewUrl.value='';amendment.value=null;approved.value=false;needsAmendment.value=false;notice.value='';error.value='';}
async function loadPush(){resetReview();reviews.value={};reviewOpen.value=false;push.value=null;recipients.value=[];refreshedAt.value=null;personId.value='';if(!pushId.value)return;busy.value=true;
 try{const {data}=await api.get(`/provider-update/pushes/${pushId.value}`,{params:{agencyId:props.agencyId}});push.value=data.push;recipients.value=data.recipients||[];refreshedAt.value=new Date();}
 catch(e){error.value=e.response?.data?.error?.message||'Could not load update.';}finally{busy.value=false;}}
async function initialize(){busy.value=true;try{const {data}=await api.get('/provider-update/eligible-providers',{params:{agencyId:props.agencyId}});people.value=(data.providers||[]).filter(p=>!Number(p.is_demo)).sort((a,b)=>`${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));}catch(e){error.value=e.response?.data?.error?.message||'Could not load people.';}finally{busy.value=false;}}
function chooseDefault(){if(!pushId.value&&availablePushes.value.length){pushId.value=(availablePushes.value.find(p=>p.status!=='closed')||availablePushes.value[0]).id;void loadPush();}}
watch(availablePushes,chooseDefault);onMounted(()=>{void initialize();chooseDefault();refreshTimer=setInterval(()=>{if(!document.hidden&&!busy.value)void refreshProgress();},30000);});
onBeforeUnmount(()=>{alive=false;clearInterval(refreshTimer);});
function trainingSaved(updated){push.value=updated;reviews.value={};resetReview();}
async function preview(){resetReview();busy.value=true;try{
 const p=push.value;
 const {data}=await api.post(`/provider-update/providers/${Number(personId.value)}/preview-link`,{agencyId:Number(props.agencyId),title:p.title,sectionConfig:p.section_config_json,attachedAdminUpdateId:p.attached_admin_update_id,sectionAudience:p.section_audience_json,amendmentPlan:p.amendment_plan_json});
 const base=`/public/provider-update/${encodeURIComponent(data.token)}`;
 const bundle=(await api.get(base)).data;
 needsAmendment.value=(bundle.sections||[]).some(s=>s.key==='amendments');
 if(needsAmendment.value)amendment.value=(await api.get(`${base}/amendment`)).data.amendment;
 previewUrl.value=data.publicUrl;
 }catch(e){error.value=e.response?.data?.error?.message||'Could not prepare this preview.';}finally{busy.value=false;}}
async function sendOne(){if(!approved.value||!ready.value||busy.value||push.value?.status==='closed')return;busy.value=true;error.value='';notice.value='';const id=Number(personId.value);
 try{
  if(amendment.value?.draft){await api.post(`/provider-update/compensation-drafts/${amendment.value.id}/release`,{agencyId:Number(props.agencyId),pushId:Number(push.value.id),expectedHtml:amendment.value.html});amendment.value={...amendment.value,draft:false,pushId:Number(push.value.id)};}
  const {data}=await api.post(`/provider-update/pushes/${push.value.id}/send`,{agencyId:Number(props.agencyId),providerUserIds:[id]});
  const result=(data.results||[]).find(r=>Number(r.providerUserId)===id);
  notice.value=result?.deliveryStatus==='sent'?`Invitation sent to ${name.value}.`:`Invitation status: ${result?.deliveryStatus||'unknown'}. ${result?.errorMessage||'Check delivery before retrying.'}`;
  approved.value=false;delete reviews.value[id];reviewOpen.value=false;await refreshProgress();emit('sent');
 }catch(e){approved.value=false;delete reviews.value[id];error.value=e.response?.data?.error?.message||'Could not send. Check delivery before retrying.';}finally{busy.value=false;}}
function download(){const url=URL.createObjectURL(new Blob([amendmentHtml.value],{type:'text/html'}));const a=document.createElement('a');a.href=url;a.download=`amendment-${personId.value}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
</script>
<style scoped>.review-send{padding:20px;border:1px solid #d3ded8;border-radius:14px;background:white}.review-send label{display:grid;gap:8px;margin:16px 0}.review-send input,.review-send select,.review-send button{font:inherit;padding:10px;border:1px solid #9aafa1;border-radius:8px}.review-send button{cursor:pointer}.review-send button:disabled{opacity:.55;cursor:default}.review-send iframe{width:100%;height:70vh;border:1px solid #d0ddd4;background:white}.review-send .confirm{display:flex;align-items:center}.preview{display:grid;gap:14px;margin:20px 0}.primary{background:#3d6b4f;color:white}.error{color:#9f2f2f}.review-send summary{cursor:pointer;font-weight:650;padding:16px 0}
.roster-toolbar{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.roster-toolbar label{flex:1;min-width:200px}.roster-toolbar small{width:100%;color:#52665c}.roster-summary{padding:14px;background:#edf4f1;border-radius:8px}.roster-scroll{overflow-x:auto}.roster{width:100%;border-collapse:collapse;min-width:1000px}.roster th,.roster td{text-align:left;vertical-align:top;padding:16px 12px;border-bottom:1px solid #dbe4df}.roster thead{background:#edf3f6}.roster tbody tr:hover{background:#f8fbf9}.roster small{display:block;font-weight:400;color:#52665c;margin-top:6px}.roster progress{width:120px;max-width:100%;accent-color:#3d6b4f}.row-actions{display:flex;gap:8px;flex-wrap:wrap}.row-actions button{font-size:14px}.roster details summary{font-size:13px;padding:8px 0}.section-time{font-size:13px;margin:5px 0}.review-overlay{position:fixed;inset:0;z-index:10000;background:#12342bcc;display:grid;place-items:center;padding:20px}.review-dialog{background:white;border-radius:16px;padding:24px;width:min(1100px,94vw);max-height:90vh;overflow:auto;box-sizing:border-box}.review-dialog .close-review{position:sticky;top:0;background:white;z-index:1}.review-dialog iframe{box-sizing:border-box}.status{font-weight:600}
</style>
