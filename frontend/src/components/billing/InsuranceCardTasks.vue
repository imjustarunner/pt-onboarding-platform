<template>
  <section class="card-tasks" aria-label="Insurance card follow-up">
    <header><div><h3>{{ staff ? 'Insurance card follow-up' : 'Your insurance cards' }}</h3><p>Upload or view your insurance card here. Medicaid cards are not needed.</p></div><button type="button" :disabled="busy || loading" @click="load()">Refresh</button></header>
    <p v-if="staff" class="muted">Insurance card emails are always reviewed by billing staff before sending. Use the pending task to review, send later, or snooze your reminder for 24 hours.</p>
    <p v-if="loading" role="status">Loading insurance tasks…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <label v-if="staff">Show<select v-model="filter"><option value="actionable">Needs attention</option><option value="all">All policies on this page</option></select></label>
    <article v-for="task in shown" :key="task.profileId" :id="`insurance-card-${task.profileId}`">
      <div class="heading"><h4>{{ task.clients.map(c => c.name || `Client ${c.id}`).join(', ') }}</h4><span class="status">{{ stateLabel(task.state) }}</span></div>
      <div v-if="staff && task.state === 'missing'" class="actions"><button @click="emailReview={...task,agencyId}">Review email / remind me later</button></div>
      <div v-if="staff" class="actions"><a v-for="client in task.clients" :key="client.id" :href="`/admin/medical-billing?agencyId=${agencyId}&clientId=${client.id}`">{{client.name || 'Client'}} · pending tasks →</a></div>
      <p v-if="staff && task.ownerName">Account holder: {{ task.ownerName }}</p>
      <p v-if="task.state === 'help'">The billing team has been asked to help. Reminder emails are paused.</p>
      <p v-if="task.state === 'review'">Both sides are received. No more upload reminders while the office reviews them.</p>
      <p v-if="task.state === 'not_required'">{{ task.coverageVerified ? 'Insurance verification is complete. Card-upload reminders have stopped.' : 'Card images are optional for this policy.' }}</p>
      <div class="sides">
        <div v-for="(slot, key) in task.slots" v-show="slot.encouraged || slot.required || slot.received || (!staff && task.uploadSlots?.includes(key))" :key="key" class="side">
          <strong>{{ slotLabel(key) }}</strong><span>{{ slot.needsReplacement ? 'Please replace this image' : slot.received ? 'Received' : 'Optional' }}</span>
          <button v-if="slot.received" :disabled="busy" type="button" @click="view(task,key)">View {{ slotLabel(key).toLowerCase() }}</button>
          <label v-if="!staff && (slot.encouraged || slot.required || task.uploadSlots?.includes(key))">{{ slot.received ? 'Replace image' : 'Upload image' }}<input type="file" accept="image/jpeg,image/png,application/pdf" :disabled="busy" @change="upload(task,key,$event)" /></label>
          <label v-if="staff && (slot.encouraged || slot.required)"><input v-model="replacements[task.profileId]" type="checkbox" :value="key" /> Request a replacement</label>
        </div>
      </div>
      <template v-if="!staff && task.state !== 'not_required'">
        <p class="muted">JPEG, PNG or PDF · up to 10 MB per side · secure portal upload</p>
        <label><input type="checkbox" :checked="task.emailEnabled" :disabled="busy" @change="act(task,'email_preference',{enabled:$event.target.checked})" /> Email me when a card side is missing</label>
        <button v-if="task.state === 'missing'" type="button" :disabled="busy" @click="act(task,'help')">I don’t have the card / I need help</button>
        <button v-if="task.state === 'help'" type="button" :disabled="busy" @click="act(task,'resume')">Resume my request</button>
      </template>
      <template v-if="staff && task.state !== 'not_required'">
        <p v-if="task.delivery" class="muted">Last email attempt: {{ task.delivery.status }} · {{ date(task.delivery.created_at) }}</p>
        <label>Review note<input v-model="reasons[task.profileId]" maxlength="2000" placeholder="Record your review or reason for an exception" /></label>
        <div class="actions"><button :disabled="busy || !reasonReady(task) || task.missingSlots.length > 0" @click="act(task,'complete')">Approve card images</button><button :disabled="busy || !reasonReady(task) || !replacements[task.profileId]?.length" @click="act(task,'replace',{slots:replacements[task.profileId]})">Request replacement</button><button :disabled="busy || !reasonReady(task)" @click="act(task,'snooze')">Pause 7 days</button><button :disabled="busy || !reasonReady(task)" @click="act(task,'waived')">Waive card request</button><button v-if="['sending','unknown','held'].includes(task.delivery?.status)" :disabled="busy || !reasonReady(task)" @click="act(task,'delivery_reviewed')">Delivery investigated · allow future review tasks</button></div>
      </template>
    </article>
    <p v-if="!loading && !error && !shown.length">{{ staff ? 'No matching insurance card tasks on this page.' : 'No insurance card tasks for this selection.' }}</p>
    <div v-if="staff" class="actions"><button v-if="after" :disabled="loading" @click="after=0;load()">First page</button><button v-if="nextAfter" :disabled="loading" @click="after=nextAfter;load()">Next policies</button></div>
    <InsuranceEmailReview v-if="emailReview" :task="emailReview" @done="emailReview=null;load()" />
    <section v-if="preview" class="preview" aria-label="Private insurance card preview"><button @click="clearPreview">Close card preview</button><img v-if="preview.type.startsWith('image/')" :src="preview.url" :alt="preview.label" /><iframe v-else :src="preview.url" :title="preview.label" sandbox="allow-same-origin" /></section>
  </section>
</template>
<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
import InsuranceEmailReview from './InsuranceEmailReview.vue';
const props=defineProps({agencyId:[String,Number],clientId:[String,Number],staff:Boolean});
const rows=ref([]),loading=ref(false),busy=ref(false),error=ref(''),notice=ref(''),emailReview=ref(null),filter=ref('actionable'),reasons=ref({}),replacements=ref({}),preview=ref(null),after=ref(0),nextAfter=ref(null);
let generation=0;
const base='/family-billing/insurance-cards';
const params=()=>({agencyId:props.agencyId,...(props.clientId?{clientId:props.clientId}:{}),...(props.staff?{after:after.value}:{})});
const shown=computed(()=>rows.value.filter(t=>!props.staff||filter.value==='all'||['missing','help','review'].includes(t.state)));
const slotLabel=key=>({primary_front:'Primary card · front',primary_back:'Primary card · back',secondary_front:'Secondary card · front',secondary_back:'Secondary card · back'}[key]);
const stateLabel=state=>({missing:'Card upload requested',review:'Office review',complete:'Reviewed',waived:'Waived by office',help:'Help requested',not_required:'No images required'}[state]||state);
const date=v=>v?new Date(v).toLocaleDateString():'';
const reasonReady=task=>!!reasons.value[task.profileId]?.trim();
const message=e=>e.response?.data?.error?.message||e.response?.data?.message||'The insurance request could not be completed. Please try again.';
function clearPreview(){if(preview.value)URL.revokeObjectURL(preview.value.url);preview.value=null;}
async function load(){const current=++generation;rows.value=[];error.value='';clearPreview();if(!props.agencyId)return;loading.value=true;try{const {data}=await api.get(`${base}${props.staff?'/staff/workspace':''}`,{params:params()});if(current!==generation)return;const tasks=props.staff?data.rows:data.tasks;if(!Array.isArray(tasks))throw new Error('Invalid task response');rows.value=tasks;nextAfter.value=data.nextAfter||null;replacements.value=Object.fromEntries(rows.value.map(t=>[t.profileId,[]]));}catch(e){if(current===generation)error.value=message(e);}finally{if(current===generation)loading.value=false;}}
async function perform(fn,success){if(busy.value)return;const current=generation;busy.value=true;error.value='';notice.value='';try{await fn();if(current!==generation)return;notice.value=success;await load();}catch(e){if(current===generation)error.value=message(e);}finally{busy.value=false;}}
function act(task,action,extra={}){return perform(()=>api.post(`${base}${props.staff?'/staff':''}/${task.profileId}/action`,{agencyId:props.agencyId,cycle:task.cycle,action,reason:reasons.value[task.profileId],...extra}),'Insurance request updated.');}
function upload(task,slot,event){const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>10*1024*1024){error.value='Choose a file no larger than 10 MB.';return;}const form=new FormData();form.append('file',file);form.append('slot',slot);form.append('cycle',task.cycle);return perform(()=>api.post(`${base}/${task.profileId}/upload`,form,{params:{agencyId:props.agencyId},headers:{'Content-Type':'multipart/form-data'}}),'Card side uploaded securely.');}
async function view(task,slot){const current=generation;clearPreview();error.value='';try{const {data}=await api.get(`${base}${props.staff?'/staff':''}/${task.profileId}/file/${slot}`,{params:{agencyId:props.agencyId},responseType:'blob'});if(current!==generation)return;preview.value={url:URL.createObjectURL(data),type:data.type,label:slotLabel(slot)};}catch(e){if(current===generation)error.value=message(e);}}
watch(()=>[props.agencyId,props.clientId,props.staff],()=>{after.value=0;nextAfter.value=null;emailReview.value=null;reasons.value={};notice.value='';void load();},{immediate:true});
onBeforeUnmount(()=>{generation++;clearPreview();});
</script>
<style scoped>
.card-tasks{padding:24px;border:1px solid var(--border,#dbe4ef);border-radius:14px;background:var(--bg-card,#fff);display:grid;gap:16px;color:var(--text-primary,#183252)}header,.heading,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}h3,h4,p{margin:0}p{line-height:1.5}header p,.muted{color:var(--text-secondary,#52647c);font-size:.9rem;margin-top:8px}article{border-top:1px solid var(--border,#dbe4ef);padding-top:18px;display:grid;gap:14px}.status{padding:5px 10px;background:#edf4ff;color:#194f95;border-radius:20px;font-size:.85rem}.sides{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.side{display:grid;gap:10px;border:1px solid var(--border,#dbe4ef);padding:16px;border-radius:10px}label{display:block;line-height:1.5}input:not([type=checkbox]),select{display:block;padding:10px;border:1px solid #aebed2;border-radius:6px;width:100%;box-sizing:border-box;font:inherit;margin-top:5px}input[type=file]{font-size:.85rem}button{font:inherit;border:1px solid #adc2de;color:#154b96;background:var(--bg-card,#fff);border-radius:7px;padding:9px 13px;cursor:pointer}button:disabled{opacity:.5;cursor:default}.actions{justify-content:flex-start}[role=alert]{color:#a71925}.preview{display:grid;gap:12px}.preview img{max-width:100%;max-height:650px;object-fit:contain}.preview iframe{width:100%;height:600px;border:1px solid #ccd9ea}@media(max-width:600px){.card-tasks{padding:16px}.sides{grid-template-columns:1fr}}
</style>
