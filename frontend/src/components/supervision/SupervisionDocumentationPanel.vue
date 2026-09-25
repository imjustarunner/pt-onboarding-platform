<template>
  <section v-if="visible" class="documentation-panel" aria-label="Documentation oversight">
    <h3>Documentation oversight</h3>
    <p>Control review for this supervisee and record the time you spend overseeing their documentation.</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading">Loading documentation settings…</p>
    <template v-else-if="policy">
      <form @submit.prevent="savePolicy">
        <fieldset :disabled="busy || !canManage">
          <label>Billable note cosign timing<select v-model="policy.cosignTiming"><option value="before_submission">Cosign before claim submission</option><option value="after_submission">Cosign may follow submission where permitted</option></select></label>
          <p>Payer and credential requirements still apply. Deferred cosign leaves an outstanding task; it does not remove supervision.</p>
          <label>Cosign follow-up within <input v-model.number="policy.cosignDueDays" type="number" min="1" max="30" required /> days</label>
          <label>Review non-billable documents<select v-model="policy.nonBillableReview"><option value="all">All types</option><option value="selected">Selected types</option><option value="none">No discretionary review</option></select></label>
          <div class="types" aria-label="Review by non-service note type"><label v-for="type in noteTypes" :key="type"><input :checked="reviewsType(type)" :value="type" type="checkbox" @change="toggleType(type, $event.target.checked)" /> {{ label(type) }}</label></div>
          <p>Turn review on or off for each non-service note type. Payer-required review still applies. Reviewing a document does not make it billable.</p>
          <p><strong>Amendments and addenda always require supervisor sign-off.</strong> These switches and deferred cosign never waive that requirement.</p>
          <label v-if="canManage">Reason for policy change<textarea v-model="policyReason" required maxlength="1000" /></label>
          <button v-if="canManage" :disabled="!policyReason.trim()">Save supervision policy</button>
        </fieldset>
      </form>
      <details>
        <summary>Clinical document review queue</summary>
        <button :disabled="busy" @click="loadDocuments">Refresh documents</button>
        <p>The most recent 100 signed notes and 100 active/final treatment plans are shown. Clinical review and cosign are recorded separately.</p>
        <div class="table-scroll"><table><thead><tr><th>Document</th><th>Review</th><th>Latest outcome</th><th></th></tr></thead><tbody>
          <tr v-for="doc in documents" :key="`${doc.type}-${doc.id}`"><td>{{ doc.title }}<small>{{ label(doc.noteType) }} · #{{ doc.id }}</small></td><td>{{ doc.amendmentSignoffRequired ? 'Amendment · supervisor sign-off required' : doc.mandatoryReview ? 'Mandatory' : doc.reviewRequested ? 'Requested' : 'Discretionary review off' }}</td><td>{{ doc.latestReview ? label(doc.latestReview.outcome) : 'Not reviewed' }}<small v-if="doc.latestReview?.stale">Document changed since review</small><small v-if="doc.reviewRequested && doc.signedAt && !doc.cosignedAt">Cosign due {{ date(doc.cosignDueAt) }}</small><small v-if="doc.cosignedAt">Cosigned {{ date(doc.cosignedAt) }}</small></td><td><button :disabled="busy" @click="openDocument(doc)">Open</button></td></tr>
        </tbody></table></div>
        <p v-if="!documents.length">No documents loaded.</p>
        <section v-if="opened" class="document-review">
          <h4>{{ opened.title }}</h4><pre>{{ opened.content }}</pre>
          <p v-if="opened.latestReview?.feedback">Last review: {{ opened.latestReview.feedback }}</p>
          <form v-if="canAttest" @submit.prevent="recordReview">
            <label>Outcome<select v-model="outcome"><option value="approved">Reviewed and approved</option><option value="changes_requested">Changes requested</option></select></label>
            <label>Feedback<textarea v-model="feedback" maxlength="4000" :required="outcome === 'changes_requested'" /></label>
            <label><input v-model="reviewAttested" type="checkbox" required /> I reviewed this version of the document and its addenda.</label>
            <button :disabled="busy || !reviewAttested">Record clinical review</button>
            <button v-if="opened.type === 'note' && !opened.cosignedAt" type="button" :disabled="busy || !reviewAttested || outcome !== 'approved'" @click="cosign">{{ opened.amendmentSignoffRequired ? 'Sign off on note and all amendments' : 'Cosign this note' }}</button>
          </form><button @click="opened = null">Close document</button>
        </section>
      </details>
      <details @toggle="onTimeToggle">
        <summary>Documentation review &amp; RPO time</summary>
        <p>Review time is separate from supervision meetings and licensure hours. Scheduled time counts only after you attest that the work occurred. Overlapping time is rejected.</p>
        <form v-if="canAttest" @submit.prevent="saveTime">
          <label>Activity<select v-model="time.activityType"><option value="documentation_review">Documentation review</option><option value="rendering_provider_oversight">Rendering provider oversight (RPO)</option></select></label>
          <div class="time-fields"><label>Start<input v-model="time.start" type="datetime-local" required /></label><label>End<input v-model="time.end" type="datetime-local" required /></label></div>
          <p>Timezone: {{ timezone }}</p>
          <label><input v-model="time.attested" type="checkbox" /> I completed this work during the recorded interval and attest that it does not duplicate other counted time.</label>
          <button :disabled="busy">{{ time.attested ? 'Record and attest completed work' : 'Schedule review block' }}</button>
        </form>
        <div class="table-scroll"><table><thead><tr><th>Activity</th><th>When</th><th>Minutes</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="entry in times" :key="entry.id"><td>{{ label(entry.activity_type) }}</td><td>{{ date(entry.start_at) }} – {{ date(entry.end_at) }}</td><td>{{ minutes(entry) }}</td><td>{{ entry.status }}</td><td v-if="canAttest && entry.status !== 'void'"><button v-if="entry.status === 'planned'" :disabled="busy" @click="attest(entry)">Attest completed work</button><button :disabled="busy" @click="voidEntry = entry; voidReason = ''">Void / correct</button></td></tr></tbody></table></div>
        <form v-if="voidEntry" @submit.prevent="voidTime"><label>Reason for voiding #{{ voidEntry.id }}<textarea v-model="voidReason" required maxlength="1000" /></label><button :disabled="busy">Void entry</button><button type="button" @click="voidEntry = null">Cancel</button></form>
      </details>
    </template>
  </section>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true},providerId:{type:Number,required:true}});
const policy=ref(null),canManage=ref(false),canAttest=ref(false),noteTypes=ref([]),visible=ref(true),loading=ref(false),busy=ref(false),error=ref(''),notice=ref(''),policyReason=ref('');
const documents=ref([]),opened=ref(null),outcome=ref('approved'),feedback=ref(''),reviewAttested=ref(false),times=ref([]),voidEntry=ref(null),voidReason=ref('');
const time=ref({activityType:'documentation_review',start:'',end:'',attested:false});
const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
const label=v=>String(v||'').replaceAll('_',' ').toLowerCase();
const instant=v=>new Date(typeof v==='string'&&!v.includes('T')?`${v.replace(' ','T')}Z`:v);
const date=v=>v?instant(v).toLocaleString():'—';
const minutes=e=>Math.round((instant(e.end_at)-instant(e.start_at))/60000);
let generation=0,active=true,requestId='',requestPayload='';
onBeforeUnmount(()=>{active=false;generation++;});
const base=()=>`/supervision-sessions/supervisee/${props.providerId}`;
const params=()=>({agencyId:props.agencyId});
async function run(fn){if(busy.value)return;const g=generation;busy.value=true;error.value='';notice.value='';try{await fn(g);}catch(e){if(active&&g===generation)error.value=e.response?.data?.error?.message||e.message||'Unable to save';}finally{if(active&&g===generation)busy.value=false;}}
async function load(){const g=++generation;policy.value=null;opened.value=null;documents.value=[];times.value=[];busy.value=false;loading.value=true;error.value='';visible.value=true;try{const {data}=await api.get(`${base()}/documentation-policy`,{params:params()});if(active&&g===generation){policy.value=data.policy;canManage.value=data.canManage;canAttest.value=data.canAttest;noteTypes.value=data.noteTypes;policyReason.value='';}}catch(e){if(active&&g===generation){if(e.response?.status===403)visible.value=false;else error.value=e.response?.data?.error?.message||'Documentation settings are awaiting setup.';}}finally{if(active&&g===generation)loading.value=false;}}
const reviewsType=type=>policy.value.nonBillableReview==='all'||(policy.value.nonBillableReview==='selected'&&policy.value.noteTypes.includes(type));
function toggleType(type,checked){const selected=new Set(noteTypes.value.filter(reviewsType));if(checked)selected.add(type);else selected.delete(type);policy.value.noteTypes=[...selected];policy.value.nonBillableReview='selected';}
const savePolicy=()=>run(async g=>{await api.put(`${base()}/documentation-policy`,{...params(),policy:policy.value,version:policy.value.version,reason:policyReason.value});if(active&&g===generation){await load();notice.value='Supervision policy saved.';}});
async function fetchDocuments(g=generation){const {data}=await api.get(`${base()}/document-reviews`,{params:params()});if(active&&g===generation)documents.value=data.documents||[];}
const loadDocuments=()=>run(fetchDocuments);
const openDocument=doc=>run(async g=>{opened.value=null;reviewAttested.value=false;feedback.value='';outcome.value='approved';const {data}=await api.get(`${base()}/document-reviews/${doc.type}/${doc.id}`,{params:params()});if(active&&g===generation)opened.value={...doc,...data};});
const recordReview=()=>run(async g=>{await api.post(`${base()}/document-reviews`,{...params(),documentType:opened.value.type,documentId:opened.value.id,contentHash:opened.value.contentHash,outcome:outcome.value,feedback:feedback.value,attested:reviewAttested.value});if(active&&g===generation){notice.value='Clinical review recorded.';await fetchDocuments(g);}});
const cosign=()=>run(async g=>{await api.post(`/medical-billing/notes/${opened.value.id}/cosign`,{...params(),contentHash:opened.value.contentHash,reviewedAndApproved:true});if(active&&g===generation){notice.value='Supervisor cosign recorded.';opened.value=null;await fetchDocuments(g);}});
async function fetchTimes(g=generation){const {data}=await api.get(`${base()}/review-time`,{params:params()});if(active&&g===generation)times.value=data.items||[];}
const onTimeToggle=e=>{if(e.target.open)run(fetchTimes);};
const saveTime=()=>run(async g=>{const payload={...params(),startAt:new Date(time.value.start).toISOString(),endAt:new Date(time.value.end).toISOString(),timezone,activityType:time.value.activityType,attested:time.value.attested,documents:opened.value?[{type:opened.value.type,id:opened.value.id}]:[]};const key=JSON.stringify(payload);if(key!==requestPayload){requestPayload=key;requestId=crypto.randomUUID();}await api.post(`${base()}/review-time`,{...payload,requestId});if(active&&g===generation){notice.value=time.value.attested?'Completed review work recorded.':'Review block scheduled.';requestId='';requestPayload='';time.value={activityType:'documentation_review',start:'',end:'',attested:false};await fetchTimes(g);}});
const attest=entry=>run(async g=>{if(!window.confirm('I completed this work during the recorded interval and attest it does not duplicate another time entry.'))return;await api.patch(`${base()}/review-time/${entry.id}`,{...params(),action:'attest',attested:true});if(active&&g===generation)await fetchTimes(g);});
const voidTime=()=>run(async g=>{await api.patch(`${base()}/review-time/${voidEntry.value.id}`,{...params(),action:'void',reason:voidReason.value});if(active&&g===generation){voidEntry.value=null;await fetchTimes(g);notice.value='Entry voided. Record a replacement if needed.';}});
watch(()=>[props.agencyId,props.providerId],load,{immediate:true});
</script>
<style scoped>
.documentation-panel{border:1px solid var(--border-color,#dce3eb);border-radius:12px;padding:1.25rem;background:var(--bg-primary,#fff);margin:1rem 0;color:var(--text-primary,#172d45)}fieldset{min-width:0;width:100%;border:0;padding:0}label{display:block;margin:.8rem 0}select,input:not([type=checkbox]),textarea{display:block;max-width:100%;padding:.55rem;border:1px solid #bac6d5;border-radius:6px;background:var(--bg-primary,#fff);color:inherit}select,textarea{width:100%}button{padding:.5rem .8rem;margin:.25rem;border:1px solid #b4c1d0;border-radius:6px;cursor:pointer;background:var(--bg-primary,#fff);color:inherit}button:disabled{opacity:.5;cursor:default}details{border-top:1px solid #dce3eb;padding:1rem 0;margin-top:1rem}summary{font-weight:600;cursor:pointer}.types,.time-fields{display:flex;gap:1rem;flex-wrap:wrap}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:.88rem}td,th{padding:.7rem;border-bottom:1px solid #dce3eb;text-align:left}small{display:block;opacity:.75}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:400px;overflow:auto}.error{color:#a32121}p{line-height:1.5;font-size:.92rem}
</style>
