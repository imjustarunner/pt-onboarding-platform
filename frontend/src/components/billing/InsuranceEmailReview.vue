<template>
  <Teleport to="body">
    <div class="review-shade" @keydown="trapFocus">
      <section ref="panel" class="review-panel" role="dialog" aria-modal="true" aria-labelledby="insurance-review-title" tabindex="-1">
        <p class="eyebrow">AURICWELL · BILLING FOLLOW-UP</p>
        <h2 id="insurance-review-title">Review an insurance card email</h2>
        <p>{{ task.organization?.name }} <span v-if="task.organization?.name">·</span> {{ task.clients?.map(c => c.name).join(', ') }}</p>
        <p class="hint">This email is sent only when you choose Send. The client’s upload task stays open until the required card sides arrive.</p>
        <p v-if="loading" role="status">Loading current email…</p>
        <template v-if="preview">
          <dl><dt>From</dt><dd>{{ preview.from || 'Billing mailbox needs setup' }}</dd><dt>To</dt><dd>{{ preview.to || 'No email address' }}</dd><dt>Subject</dt><dd>{{ preview.subject }}</dd></dl>
          <div class="email-text">{{ preview.text }}</div>
          <p v-if="preview.blocked" role="status">{{ preview.blocked }}</p>
          <button v-if="!preview.from && task.organization?.slug" :disabled="busy" @click="openSettings">Open billing mailbox setup →</button>
        </template>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="actions">
          <button class="primary" :disabled="busy || loading || !preview?.canSend" @click="send">{{ busy ? 'Saving…' : 'Send reviewed email' }}</button>
          <button :disabled="busy || loading" @click="load">Refresh preview</button>
          <button :disabled="busy" @click="later(1)">Send later · 1 hour</button>
          <button :disabled="busy" @click="later(24)">Snooze 24 hours</button>
        </div>
        <div class="actions"><button v-for="client in task.clients" :key="client.id" :disabled="busy" @click="openClient(client)">Open {{ client.name || 'client' }}’s pending tasks →</button></div>
        <p class="hint">Snoozing affects your reminder only. Other authorized billers can still handle the task.</p>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import {ref,watch,nextTick,onBeforeUnmount} from 'vue';
import {useRouter} from 'vue-router';
import api from '../../services/api';
const props=defineProps({task:{type:Object,required:true}}),emit=defineEmits(['done']);
const router=useRouter(),panel=ref(null),preview=ref(null),loading=ref(false),busy=ref(false),error=ref('');
let generation=0,previousFocus=document.activeElement;
const base=task=>`/family-billing/insurance-cards/staff/${task.profileId}`;
const context=task=>({agencyId:task.agencyId,cycle:task.cycle});
const message=e=>e.response?.data?.error?.message||e.response?.data?.message||'The task could not be updated. Please try again.';
async function load(){const version=++generation,task=props.task;preview.value=null;error.value='';loading.value=true;await nextTick();panel.value?.focus();try{const {data}=await api.get(`${base(task)}/email-preview`,{params:context(task),skipGlobalLoading:true});if(version===generation)preview.value=data;}catch(e){if(version===generation)error.value=message(e);}finally{if(version===generation)loading.value=false;}}
async function perform(action){if(busy.value)return;busy.value=true;error.value='';const version=generation;try{const result=await action();if(version===generation)emit('done',result);}catch(e){if(version===generation){error.value=message(e);if(e.response?.status===409&&preview.value)preview.value.canSend=false;}}finally{busy.value=false;}}
function send(){const task=props.task,reviewHash=preview.value?.reviewHash;return perform(async()=>{const {data}=await api.post(`${base(task)}/send-email`,{...context(task),reviewHash});if(data.status!=='sent')throw new Error('held');return data;}).then(()=>{if(error.value==='The task could not be updated. Please try again.'&&preview.value){preview.value.canSend=false;error.value='Delivery needs investigation in the billing workspace before another email is sent.';}});}
function later(hours){const task=props.task;return perform(async()=>{const {data}=await api.post(`${base(task)}/remind-later`,{...context(task),hours});return data;});}
async function openClient(client){const task=props.task;await perform(async()=>{await api.post(`${base(task)}/remind-later`,{...context(task),hours:1});await router.push({path:'/admin/medical-billing',query:{agencyId:String(task.agencyId),clientId:String(client.id)}});return {opened:true};});}
async function openSettings(){const task=props.task;await perform(async()=>{await api.post(`${base(task)}/remind-later`,{...context(task),hours:1});await router.push({path:`/${task.organization.slug}/admin/family-billing`,query:{agencyId:String(task.agencyId),tab:'settings'}});return {opened:true};});}
function trapFocus(event){if(event.key==='Escape'){event.preventDefault();if(!busy.value)later(1);return;}if(event.key!=='Tab')return;const nodes=[...panel.value.querySelectorAll('button:not(:disabled),a[href]')];if(!nodes.length){event.preventDefault();return;}if(event.shiftKey&&[nodes[0],panel.value].includes(document.activeElement)){event.preventDefault();nodes.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}}
watch(()=>[props.task.agencyId,props.task.profileId,props.task.cycle],load,{immediate:true});
onBeforeUnmount(()=>{generation++;previousFocus?.focus?.();});
</script>
<style scoped>
.review-shade{position:fixed;inset:0;z-index:18000;background:#14264099;display:grid;place-items:center;padding:20px;overflow:auto}.review-panel{box-sizing:border-box;width:min(100%,760px);max-height:92dvh;overflow:auto;background:#fff;color:#193354;border-radius:20px;padding:30px;box-shadow:0 18px 80px #0003}.eyebrow{font-size:11px;letter-spacing:1.5px;color:#9a7027}h2{font-size:26px;margin:10px 0}.hint{font-size:13px;color:#53647a;line-height:1.6}dl{display:grid;grid-template-columns:65px 1fr;gap:10px;font-size:14px}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}.email-text{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f7fc;border:1px solid #dce6f1;border-radius:10px;padding:20px;line-height:1.65;font-size:14px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}button{font:inherit;font-size:14px;border:1px solid #b6c7dc;background:white;color:#134f9c;padding:11px 14px;border-radius:8px;cursor:pointer}.primary{color:white;background:#1453bd;border-color:#1453bd}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:3px solid #c38e29;outline-offset:3px}[role=alert]{color:#a72230}@media(max-width:500px){.review-panel{padding:20px}.actions button{width:100%}}
</style>
