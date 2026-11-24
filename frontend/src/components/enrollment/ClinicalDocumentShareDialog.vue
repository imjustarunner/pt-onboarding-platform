<template>
  <Teleport to="body">
    <div class="share-backdrop" @click.self="close" @keydown.esc.prevent="close">
      <section ref="panel" class="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-documents-heading" tabindex="-1" @keydown.tab="keepFocus">
        <header>
          <h3 id="share-documents-heading">Share {{ documents.length === 1 ? 'document' : 'documents' }}</h3>
          <button type="button" class="btn btn-secondary" :disabled="busy" @click="close">Close</button>
        </header>
        <ul class="documents"><li v-for="(item,index) in documents" :key="index">{{ item.title || 'Selected document' }}</li></ul>
        <p v-if="loading" role="status">Checking recipients and delivery options…</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <button v-if="error && !preview && !loading" class="btn btn-secondary" type="button" @click="load">Try again</button>
        <template v-if="result">
          <h4>Sharing status</h4>
          <ul class="receipts">
            <li v-for="request in result.requests" :key="request.id">
              <strong>{{ request.recipient }}</strong>
              <span v-if="request.portal">Available in portal</span>
              <span v-if="request.error">{{ request.error }}</span>
              <span v-for="delivery in request.deliveries" :key="delivery.id">{{ channelLabel(delivery.channel) }} · {{ delivery.redirectedTo ? 'Sent to '+delivery.redirectedTo : stateLabel(delivery.state) }}</span>
            </li>
          </ul>
          <button class="btn btn-primary" type="button" @click="close">Done</button>
        </template>
        <form v-else-if="preview" @submit.prevent="send">
          <p v-if="!visibleRecipients.length">There are no authorized recipients for this selection. Review the client’s contact details and permissions.</p>
          <fieldset v-for="recipient in visibleRecipients" :key="recipient.key" :disabled="busy || loading">
            <legend>
              <label class="check">
                <input type="checkbox" :checked="Boolean(chosen[recipient.key])" @change="toggleRecipient(recipient,$event.target.checked)" />
                {{ recipient.name }} · {{ recipient.kind === 'guardian' ? 'Parent / guardian' : 'Client' }}
              </label>
            </legend>
            <template v-if="chosen[recipient.key]">
              <p v-if="recipient.emailHint || recipient.phoneHint" class="destination">
                <span v-if="recipient.emailHint">{{ recipient.emailHint }}</span>
                <span v-if="recipient.emailHint && recipient.phoneHint"> · </span>
                <span v-if="recipient.phoneHint">Phone {{ recipient.phoneHint }}</span>
              </p>
              <div v-if="recipient.items.length > 1 || related[recipient.key]?.length" class="item-choices">
                <label v-for="item in recipientItems(recipient)" :key="item.key" class="check">
                  <input v-model="chosen[recipient.key].items" type="checkbox" :value="item.key" />
                  {{ item.clientName ? item.clientName + ' · ' : '' }}{{ item.title }}
                </label>
                <label v-for="client in remainingRelated(recipient)" :key="client.id" class="check">
                  <input type="checkbox" :disabled="loading" @change="addClient(recipient,client)" />
                  {{ client.name }} · Add the selected assessment
                </label>
              </div>
              <label class="channel">Share via
                <select v-model="chosen[recipient.key].mode" required>
                  <option value="" disabled>Select a delivery method</option>
                  <option v-for="method in availableModes(recipient)" :key="method.key" :value="method.key">{{ method.label }}</option>
                </select>
              </label>
              <p v-if="!availableModes(recipient).length">No delivery method is available for these items.</p>
              <p v-if="recipient.portal==='setup' && chosen[recipient.key].mode==='portal'">This client or guardian hasn’t signed in to their portal yet. Sending will also invite them to set up their account.</p>
            </template>
          </fieldset>
          <label v-if="needsGuardian" class="check"><input type="checkbox" v-model="authorityConfirmed" required />I verified each guardian’s authority for the selected client.</label>
          <label v-if="needsContact" class="check"><input type="checkbox" v-model="contactConfirmed" required />I verified the selected recipients’ contact details on their charts.</label>
          <label v-if="needsClinicalFit" class="check"><input type="checkbox" v-model="clinicalFitConfirmed" required />I confirmed the assessment and respondent are appropriate for each selected client.</label>
          <label v-if="needsSetup" class="check"><input type="checkbox" v-model="setupConfirmed" required />Send the portal setup invitation.</label>
          <footer>
            <button type="button" class="btn btn-secondary" :disabled="busy" @click="close">Cancel</button>
            <button class="btn btn-primary" :disabled="!canSend">{{ busy?'Sharing…':'Share' }}</button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import {computed,inject,nextTick,onBeforeUnmount,onMounted,ref} from 'vue';
import liveApi from '../../services/api';

const api=inject('clinicalFormsHttp',liveApi);
const props=defineProps({
  clientId:{type:[Number,String],required:true},agencyId:{type:[Number,String],required:true},
  documents:{type:Array,required:true},context:{type:Object,default:()=>({})},
  initialAction:{type:String,default:'sign'},recipientUserId:[Number,String]
});
const emit=defineEmits(['close','shared']);
const panel=ref(null),preview=ref(null),chosen=ref({}),related=ref({}),additional=ref([]);
const busy=ref(false),loading=ref(false),error=ref(''),result=ref(null);
const authorityConfirmed=ref(false),contactConfirmed=ref(false),setupConfirmed=ref(false),clinicalFitConfirmed=ref(false);
let previousFocus,active=true,requestKey=crypto.randomUUID(),lastPayload='';

const endpoint=computed(()=>`/clinical-document-requests/clients/${props.clientId}`);
const visibleRecipients=computed(()=>(preview.value?.recipients||[]).filter(recipient=>
  !props.recipientUserId||Number(recipient.userId)===Number(props.recipientUserId)));
const selectedRecipients=computed(()=>visibleRecipients.value.filter(recipient=>chosen.value[recipient.key]));
const needsGuardian=computed(()=>selectedRecipients.value.some(recipient=>recipient.kind==='guardian'));
const needsSetup=computed(()=>selectedRecipients.value.some(recipient=>recipient.portal==='setup'&&chosen.value[recipient.key].mode==='portal'));
const needsContact=computed(()=>selectedRecipients.value.some(recipient=>{
  const mode=chosen.value[recipient.key].mode;
  return ['email','sms','both'].includes(mode)||(mode==='all'&&availableModes(recipient).some(method=>method.key==='email'||method.key==='sms'));
}));
const needsClinicalFit=computed(()=>selectedRecipients.value.some(recipient=>
  preview.value.items.some(item=>item.outcome&&chosen.value[recipient.key].items.includes(item.key))));
const canSend=computed(()=>!busy.value&&!loading.value&&selectedRecipients.value.length>0&&
  selectedRecipients.value.every(recipient=>availableModes(recipient).some(mode=>mode.key===chosen.value[recipient.key].mode))&&
  (!needsGuardian.value||authorityConfirmed.value)&&(!needsContact.value||contactConfirmed.value)&&(!needsSetup.value||setupConfirmed.value)&&(!needsClinicalFit.value||clinicalFitConfirmed.value));
const canChooseRelated=computed(()=>props.documents.length>0&&props.documents.every(item=>(item.foundationKey||item.assessmentKey)&&item.instrumentId));

const selection=()=>({
  agencyId:Number(props.agencyId),context:props.context,
  documents:[...props.documents,...additional.value].map(document=>{
    const {recordId,version,foundationKey,release,contactId,treatmentPlanId,fileId,templateId,assessmentKey,clientId,documentKey,action}=document;
    return {recordId,version,foundationKey,release,contactId,treatmentPlanId,fileId,templateId,assessmentKey,clientId,documentKey,action:action||props.initialAction};
  })
});

function recipientItems(recipient){
  const keys=new Set(recipient.items.map(item=>item.key));
  return preview.value.items.filter(item=>keys.has(item.key));
}
function availableModes(recipient){
  const keys=chosen.value[recipient.key]?.items||[];
  const items=recipient.items.filter(item=>keys.includes(item.key));
  const available=channel=>items.length>0&&items.every(item=>item.channels[channel]);
  const email=available('email'),sms=available('sms'),portal=available('portal');
  return [
    email&&{key:'email',label:'Email direct link'},
    sms&&{key:'sms',label:'Text direct link'},
    email&&sms&&{key:'both',label:'Email and text'},
    portal&&{key:'portal',label:'Portal only'},
    [email,sms,portal].filter(Boolean).length>1&&{key:'all',label:'Share all available'}
  ].filter(Boolean);
}
function remainingRelated(recipient){
  const added=new Set(additional.value.map(item=>Number(item.clientId)));
  return (related.value[recipient.key]||[]).filter(client=>!added.has(Number(client.id)));
}
async function toggleRecipient(recipient,checked){
  if(!checked){
    delete chosen.value[recipient.key];
    return;
  }
  chosen.value[recipient.key]={items:recipientItems(recipient).filter(item=>Number(item.clientId)===Number(props.clientId)).map(item=>item.key),mode:''};
  if(canChooseRelated.value&&recipient.kind==='guardian'&&!related.value[recipient.key]){
    try{
      const {data}=await api.get(endpoint.value+'/related',{params:{agencyId:props.agencyId,recipient:recipient.key}});
      if(active)related.value[recipient.key]=data.clients||[];
    }catch(e){if(active)error.value=e.response?.data?.error?.message||'Other linked clients could not be loaded.';}
  }
}
async function load(){
  loading.value=true;error.value='';
  try{
    const {data}=await api.post(endpoint.value+'/preview',selection());
    if(active)preview.value=data;
    return data;
  }catch(e){if(active)error.value=e.response?.data?.error?.message||'Sharing options could not be loaded.';}
  finally{if(active)loading.value=false;}
}
async function addClient(recipient,client){
  const before=additional.value;
  additional.value=[...before,...props.documents.map(item=>({...item,clientId:client.id}))];
  const data=await load();
  if(!data){additional.value=before;return;}
  const latest=data.recipients.find(item=>item.key===recipient.key);
  if(latest&&chosen.value[recipient.key]){
    const keys=new Set(latest.items.map(item=>item.key));
    const choices=data.items.filter(item=>Number(item.clientId)===Number(client.id)&&keys.has(item.key));
    if(choices.length)chosen.value[recipient.key].items.push(...choices.map(item=>item.key));
    else error.value='These assessments are unavailable for this child or guardian.';
  }
}
async function send(){
  if(!canSend.value)return;
  const payload={...selection(),recipients:selectedRecipients.value.map(recipient=>({key:recipient.key,...chosen.value[recipient.key]})),
    authorityConfirmed:authorityConfirmed.value,contactConfirmed:contactConfirmed.value,setupConfirmed:setupConfirmed.value,clinicalFitConfirmed:clinicalFitConfirmed.value};
  const snapshot=JSON.stringify(payload);
  if(lastPayload&&snapshot!==lastPayload)requestKey=crypto.randomUUID();
  lastPayload=snapshot;
  busy.value=true;error.value='';
  try{
    const {data}=await api.post(endpoint.value+'/send',{...payload,requestKey});
    if(active)result.value=data;
  }catch(e){if(active)error.value=e.response?.data?.error?.message||'Sharing could not be confirmed. You can retry the same request.';}
  finally{if(active)busy.value=false;}
}
function close(){
  if(busy.value)return;
  if(result.value)emit('shared',result.value);
  else emit('close');
}
function keepFocus(event){
  const focusable=[...panel.value.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
  const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.value)){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
}
const channelLabel=channel=>({email:'Email',sms:'Text',portal:'Portal notification'}[channel]||channel);
const stateLabel=state=>({sending:'Sending',sent:'Sent',queued:'Accepted for delivery',failed:'Failed',unconfirmed:'Delivery unconfirmed'}[state]||state);
onMounted(async()=>{previousFocus=document.activeElement;await nextTick();panel.value?.focus();await load();});
onBeforeUnmount(()=>{active=false;if(previousFocus?.isConnected)previousFocus.focus();});
</script>

<style scoped>
.share-backdrop{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:1rem;background:#142847a6}
.share-dialog{width:min(100%,42rem);max-height:90dvh;overflow:auto;background:white;color:#142d50;border-radius:1rem;padding:1.5rem;box-shadow:0 16px 60px #14284755}
header,footer{display:flex;justify-content:space-between;gap:1rem;align-items:center}
h3,h4{margin:0}.documents{padding-left:1.25rem}.check{display:flex;gap:.55rem;align-items:flex-start}
fieldset{border:1px solid #cfdae7;border-radius:.6rem;margin:1rem 0;padding:.8rem}
legend{font-weight:650;padding:0 .25rem}.item-choices{display:grid;gap:.45rem;margin-bottom:.8rem}
.channel{display:grid;gap:.3rem}.channel select{padding:.45rem}.receipts span{display:block}
form>.check{margin:.7rem 0}footer{margin-top:1rem;justify-content:flex-end}[role=alert]{color:#8a251e}
</style>
