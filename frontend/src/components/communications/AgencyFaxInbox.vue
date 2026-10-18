<template>
  <section class="fax-inbox" aria-label="Agency fax inbox">
    <header><div><h3>Agency faxes</h3><p>{{ state.number ? `Primary fax number: ${state.number}` : 'Fax setup is not complete. A platform superadmin must verify the primary number.' }}</p></div><button type="button" :disabled="busy" @click="refresh">Refresh</button></header>
    <p v-if="error" class="fax-error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <details v-if="state.canSend" class="fax-compose">
      <summary>Send a fax</summary>
      <form @submit.prevent="send">
        <label>Recipient fax number<input v-model="recipient" type="tel" placeholder="+17195550123" required :disabled="busy||!!pendingId" /></label>
        <label>PDF document<input ref="fileInput" type="file" accept="application/pdf,.pdf" required :disabled="busy||!!pendingId" @change="selectFile" /></label>
        <p>One PDF, up to 5 MB and 100 pages. Include a cover sheet in the PDF if needed.</p>
        <p v-if="fileName"><strong>{{ fileName }}</strong> will be sent from {{ state.number }} to <strong>{{ recipient || 'the number entered above' }}</strong>.</p>
        <label class="fax-confirm"><input v-model="confirmed" type="checkbox" required :disabled="busy" /><span>I checked the recipient number and document.</span></label>
        <div class="fax-actions"><button type="submit" :disabled="busy||!base64||!confirmed">{{ pendingId ? 'Check this send request' : 'Send fax' }}</button><button v-if="pendingId" type="button" :disabled="busy" @click="refresh">Refresh delivery status</button><button v-if="pendingId" type="button" :disabled="busy" @click="newDraft">Start another fax</button></div>
        <p v-if="pendingId">This request may already have been submitted. Checking it will not send a duplicate. Review its status before starting another fax.</p>
      </form>
    </details>
    <div class="fax-tabs" role="group" aria-label="Fax folder"><button v-for="folder in ['received','sent']" :key="folder" type="button" :aria-pressed="direction===folder" @click="direction=folder">{{ folder==='received' ? 'Received' : 'Sent' }} ({{ state.records.filter(r=>r.data.direction===folder).length }})</button></div>
    <p v-if="!visible.length">{{ busy ? 'Loading faxes…' : 'No faxes in this folder.' }}</p>
    <ul class="fax-list"><li v-for="record in visible" :key="record.id">
      <div><strong>{{ direction==='received' ? 'From ' + (record.data.from || 'unknown sender') : 'To ' + record.data.to }}</strong><p>{{ new Date(record.createdAt).toLocaleString() }} · {{ record.data.pages || 'Unknown' }} pages · {{ statusLabel(record) }}</p><p v-if="['sending','needs_review'].includes(record.data.status)">Delivery is not confirmed. Check Notifyre’s fax activity before sending again.</p></div>
      <div class="fax-actions"><button type="button" :disabled="busy||(!record.data.documentId&&direction==='sent')" @click="download(record)">Download PDF</button><button v-if="direction==='received'&&!record.data.reviewedAt" type="button" :disabled="busy" @click="review(record)">Mark reviewed</button></div>
    </li></ul>
    <p class="fax-muted">Showing the latest 500 faxes. Downloads are recorded in the audit log.</p>
  </section>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue';
const props=defineProps({base:{type:String,required:true},request:{type:Function,required:true}});
const state=ref({records:[],number:'',canSend:false}),direction=ref('received'),busy=ref(false),error=ref(''),notice=ref('');
const recipient=ref(''),base64=ref(''),fileName=ref(''),confirmed=ref(false),pendingId=ref(''),fileInput=ref(null);
const visible=computed(()=>state.value.records.filter(r=>r.data.direction===direction.value));
const statusLabel=r=>r.data.direction==='received'?(r.data.reviewedAt?'Reviewed':'Needs review'):({sending:'Awaiting carrier confirmation',submitted:'Submitted to Notifyre',delivered:'Delivered',failed:'Delivery failed',needs_review:'Check carrier receipt'}[r.data.status]||r.data.status);
async function run(fn){busy.value=true;error.value='';try{await fn();}catch(e){error.value=e.message;}finally{busy.value=false;}}
const load=async()=>{state.value=await props.request(`${props.base}/faxes`);};
const refresh=()=>run(load);
async function selectFile(event){
  base64.value='';confirmed.value=false;fileName.value='';error.value='';
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>5*1024*1024){error.value='Choose a PDF no larger than 5 MB.';event.target.value='';return;}
  try{const reader=new FileReader();const content=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read this document.'));reader.readAsDataURL(file);});base64.value=String(content).split(',')[1];fileName.value=file.name;}catch(e){error.value=e.message;}
}
const newDraft=()=>{if(window.confirm('The previous request may have been sent. Check the Sent folder and Notifyre before sending it again. Start another fax?')){pendingId.value='';base64.value='';fileName.value='';confirmed.value=false;recipient.value='';if(fileInput.value)fileInput.value.value='';}};
const send=()=>run(async()=>{
  pendingId.value ||= crypto.randomUUID();
  const result=await props.request(`${props.base}/faxes`,{method:'POST',body:{requestId:pendingId.value,to:recipient.value,base64:base64.value}});
  notice.value=`Fax recorded: ${statusLabel(result)}.`;pendingId.value='';base64.value='';fileName.value='';confirmed.value=false;recipient.value='';if(fileInput.value)fileInput.value.value='';direction.value='sent';await load();
});
const review=record=>run(async()=>{await props.request(`${props.base}/faxes/${record.id}/review`,{method:'POST',body:{}});await load();});
const download=record=>run(async()=>{const doc=await props.request(`${props.base}/faxes/${record.id}/document`);const bytes=Uint8Array.from(atob(doc.base64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=doc.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);});
onMounted(refresh);
</script>
<style scoped>
.fax-inbox{padding:20px;background:#fff;border:1px solid #d6e3dd;border-radius:16px;margin:16px 0;color:#263d35}.fax-inbox header{display:flex;align-items:center;justify-content:space-between;gap:16px}.fax-inbox h3{margin:0}.fax-inbox p{line-height:1.5}.fax-inbox button{padding:10px 16px;min-height:44px;border:1px solid #aac4b6;border-radius:10px;background:#f0f7f3;color:#244d39;font-weight:600;cursor:pointer}.fax-inbox button:disabled{opacity:.55;cursor:default}.fax-tabs{display:flex;gap:10px;margin:20px 0}.fax-tabs button[aria-pressed=true]{background:#32674d;color:white}.fax-compose{padding:18px;border:1px solid #d6e3dd;border-radius:12px;margin-top:16px}.fax-compose summary{cursor:pointer;font-weight:700}.fax-compose form{max-width:650px}.fax-compose label{display:flex;flex-direction:column;gap:8px;margin:16px 0}.fax-compose input:not([type=checkbox]){width:100%;box-sizing:border-box;padding:12px;border:1px solid #b6c9be;border-radius:8px}.fax-compose .fax-confirm{flex-direction:row;align-items:center}.fax-confirm input{width:22px;height:22px;flex-shrink:0}.fax-list{list-style:none;padding:0}.fax-list li{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #e0e9e4;padding:18px 0}.fax-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.fax-error{color:#a12828}.fax-muted{color:#5f7068;font-size:.9rem}@media(max-width:700px){.fax-list li{flex-direction:column}.fax-inbox header{align-items:flex-start}}
</style>
