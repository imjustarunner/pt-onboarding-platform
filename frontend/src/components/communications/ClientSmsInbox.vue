<template>
  <section class="card sms-inbox">
    <div class="section-heading"><h2>Client text messages</h2><button class="outline" :disabled="busy" @click="refresh">Refresh</button></div>
    <div v-if="patientId" class="actions"><button class="outline" :disabled="busy" @click="start('main')">Start support conversation</button><button class="outline" :disabled="busy" @click="start('provider')">Start provider conversation</button></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <div class="sms-layout">
      <div><p v-if="!threads.length" class="muted">No text conversations yet. Incoming messages will appear here once the numbers are connected.</p>
        <button v-for="t in threads" :key="t.id" class="thread" :class="{active:current?.thread.id===t.id}" @click="load(t.id)">
          <strong>{{ t.data.title }}</strong><span>{{ t.phone }} · {{ t.data.line === 'main' ? 'Support' : 'Provider' }}</span>
          <small>{{ t.stopped ? 'SMS stopped' : t.data.needsReply ? 'Needs a reply' : t.data.status }} · Code {{ t.data.tag }}</small>
        </button>
      </div>
      <article v-if="current">
        <div class="section-heading"><h3>{{ current.thread.data.title }}</h3><button class="outline" :disabled="busy" @click="resolve">Mark resolved</button></div>
        <p v-if="current.stopped" class="notice">SMS is stopped. Use app, email or phone. The recipient must text START to receive SMS replies.</p>
        <p class="muted">Conversation code: {{ current.thread.data.tag }}. New incoming messages reopen the conversation.</p>
        <label v-if="current.providerChoices?.length">Assigned provider<select :value="current.thread.data.assignedTo || ''" :disabled="busy" @change="assign($event.target.value)"><option disabled value="">Choose the intended provider</option><option v-for="provider in current.providerChoices" :key="provider.id" :value="provider.id">{{ provider.name }}</option></select></label>
        <p v-if="current.thread.data.line==='provider'&&!current.thread.data.assignedTo" class="notice">Support review needed: this conversation has no enabled provider assigned. It will not be forwarded to a guessed recipient.</p>
        <ol class="messages"><li v-for="m in current.messages" :key="m.id" :class="m.direction">
          <p>{{ m.body }}</p><small>{{ m.direction==='inbound' ? 'Received from client' : `${m.senderName || (m.origin==='automation'?'Automated message':'Staff')} · ${m.origin==='staff_sms'?'staff phone':m.origin==='app'?'app':'system'}` }} · {{ new Date(m.at).toLocaleString() }}{{ m.status ? ` · ${m.status.replaceAll('_',' ')}` : '' }}</small>
          <p v-if="m.attachment" class="notice">This message includes media. Review it in the authorized carrier account; attachments are not downloaded automatically.</p>
        </li></ol>
        <form @submit.prevent="reply"><label>Reply from the agency number<textarea v-model="body" rows="4" required maxlength="4000" :disabled="current.stopped" /></label><button :disabled="busy||current.stopped">Queue reply</button></form>
      </article>
      <p v-else class="muted">Select a conversation to read and reply.</p>
    </div>
  </section>
</template>
<script setup>
import { ref,watch } from 'vue';
const props=defineProps({base:String,patientId:{type:String,default:''},request:{type:Function,required:true}});
const request=(path,options)=>props.request(path,options);
const threads=ref([]),current=ref(null),body=ref(''),busy=ref(false),error=ref(''),notice=ref('');let requestId=crypto.randomUUID();
async function run(fn){busy.value=true;error.value='';notice.value='';try{await fn();}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function fetchThreads(){threads.value=await request(`${props.base}/sms/threads${props.patientId?`?patientId=${encodeURIComponent(props.patientId)}`:''}`);}
const start=line=>run(async()=>{const t=await request(`${props.base}/sms/threads`,{method:'POST',body:{patientId:props.patientId,line}});current.value=await request(`${props.base}/sms/threads/${t.id}`);await fetchThreads();});
const refresh=()=>run(async()=>{await fetchThreads();if(current.value)current.value=await request(`${props.base}/sms/threads/${current.value.thread.id}`);});
const load=id=>run(async()=>{current.value=await request(`${props.base}/sms/threads/${id}`);body.value='';requestId=crypto.randomUUID();});
const reply=()=>run(async()=>{await request(`${props.base}/sms/threads/${current.value.thread.id}/replies`,{method:'POST',body:{body:body.value,requestId}});body.value='';requestId=crypto.randomUUID();current.value=await request(`${props.base}/sms/threads/${current.value.thread.id}`);await fetchThreads();notice.value='Reply queued. The delivery status will update after sending.';});
const resolve=()=>run(async()=>{await request(`${props.base}/sms/threads/${current.value.thread.id}/resolve`,{method:'POST',body:{}});await fetchThreads();notice.value='Conversation marked resolved.';});
const assign=accountId=>run(async()=>{await request(`${props.base}/sms/threads/${current.value.thread.id}/assignment`,{method:'PUT',body:{accountId}});current.value=await request(`${props.base}/sms/threads/${current.value.thread.id}`);await fetchThreads();notice.value='Provider assignment saved.';});
watch(()=>[props.base,props.patientId],()=>{current.value=null;refresh();},{immediate:true});
</script>
<style scoped>
.sms-layout{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,2fr);gap:24px}.thread{display:flex;flex-direction:column;align-items:flex-start;text-align:left;width:100%;gap:7px;background:#f3f7f4;color:#203d32;border:1px solid #d8e1db;border-radius:12px;margin:10px 0;padding:16px}.thread.active{border-color:#397357;background:#e5f3eb}.messages{list-style:none;padding:0;max-height:550px;overflow:auto}.messages li{padding:16px;border-radius:12px;background:#f1f5f3;margin:12px 0;white-space:pre-wrap;overflow-wrap:anywhere}.messages li.outbound{background:#e7f4ec;margin-left:24px}.messages p{margin:0 0 8px}.messages small{color:#51665b}@media(max-width:760px){.sms-layout{grid-template-columns:1fr}}
</style>
