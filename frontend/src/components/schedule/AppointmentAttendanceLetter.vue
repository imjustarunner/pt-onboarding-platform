<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import SafetyPlanDocument from '../safetyPlans/SafetyPlanDocument.vue';
import SafetyPlanSigning from '../safetyPlans/SafetyPlanSigning.vue';
import { attendanceLetterText } from '../../navigation/attendanceLetter.js';
const props=defineProps({eventType:{type:String,required:true},eventId:{type:Number,required:true},appointmentId:{type:Number,default:0},clientId:{type:Number,default:0}});
const emit=defineEmits(['close']);
const auth=useAuthStore(),dialog=ref(null),loading=ref(true),busy=ref(false),error=ref(''),step=ref('compose');
const catalog=ref(null),plan=ref(null),form=ref({}),signer=ref(null),delivery=ref({recipients:[],deliveries:[]}),recipientKey=ref(''),channels=ref([]),authority=ref(false);
let previousFocus,alive=true;
const recipient=computed(()=>delivery.value.recipients.find(item=>item.key===recipientKey.value));
const letter=computed(()=>attendanceLetterText(step.value==='compose'?{data:form.value,branding:catalog.value?.branding}:plan.value||{}));
const receipts=computed(()=>delivery.value.deliveries.filter(item=>item.recipientKey===recipientKey.value));
const channelNames={email:'Email a signed PDF',portal:'Post a portal copy',sms:'Text a signed copy'};
const statusLabel=status=>({sent:'Sent',queued:'Queued for delivery',sending:'Sending — check Communications before retrying',failed:'Not sent',review:'Delivery uncertain — check Communications'})[status]||status;
const locked=channel=>receipts.value.some(item=>item.channel===channel&&item.status!=='failed');
const message=e=>e.response?.data?.error?.message||e.message||'The appointment letter could not be loaded.';
function chooseRecipient(){channels.value=recipient.value?.channels.portal?['portal']:[];authority.value=false;}
async function loadDelivery(){
 const {data}=await api.get(`/clinical-forms/${plan.value.id}/attendance-delivery`,{skipGlobalLoading:true});
 if(!alive)return;delivery.value=data;if(!data.recipients.some(item=>item.key===recipientKey.value))recipientKey.value=data.recipients[0]?.key||'';chooseRecipient();
}
async function load(){
 loading.value=true;error.value='';
 try{
  const {data}=await api.get('/clinical-forms/template',{params:{documentKey:'attendance-verification',eventType:props.eventType,eventId:props.eventId,...(props.appointmentId?{appointmentId:props.appointmentId}:{}),...(props.clientId?{clientId:props.clientId}:{})},skipGlobalLoading:true});
  if(!alive)return;catalog.value=data;
  const {data:saved}=await api.get('/clinical-forms',{params:{clientId:data.client.id},skipGlobalLoading:true});
  if(!alive)return;
  const existing=(saved.plans||[]).find(item=>item.documentKey==='attendance-verification'&&item.appointment?.eventType===props.eventType&&Number(item.appointment?.eventId)===props.eventId&&(!props.appointmentId||Number(item.appointment?.appointmentId)===props.appointmentId));
  if(existing){const {data:record}=await api.get(`/clinical-forms/${existing.id}`,{skipGlobalLoading:true});if(!alive)return;plan.value=record;}
  form.value=plan.value?JSON.parse(JSON.stringify(plan.value.data)):{documentName:'Appointment letter',personLabel:data.client.name,planDate:new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),...data.prefill,issuerTitle:auth.user?.credential||auth.user?.title||''};
  if(plan.value?.signers?.some(item=>item.kind==='clinician'&&item.signedAt&&!item.revokedAt)){step.value='deliver';await loadDelivery();}
 }catch(e){if(alive)error.value=message(e);}finally{if(alive)loading.value=false;}
}
async function prepareSignature(){
 busy.value=true;error.value='';
 try{
  const payload={documentKey:'attendance-verification',agencyId:catalog.value.client.agencyId,clientId:catalog.value.client.id,eventType:props.eventType,eventId:props.eventId,appointmentId:props.appointmentId||undefined,data:form.value,version:plan.value?.version};
  const saved=plan.value?await api.put(`/clinical-forms/${plan.value.id}`,payload):await api.post('/clinical-forms',payload);
  if(!alive)return;plan.value=saved.data;
  const {data}=await api.post(`/clinical-forms/${plan.value.id}/signers`,{version:plan.value.version,kind:'clinician'});
  if(!alive)return;plan.value=data;signer.value=data.signers.find(item=>item.kind==='clinician'&&Number(item.userId)===Number(auth.user?.id)&&!item.revokedAt&&!item.signedAt);step.value='sign';
 }catch(e){if(alive)error.value=message(e);}finally{if(alive)busy.value=false;}
}
async function onSigned(){
 busy.value=true;error.value='';
 try{const {data}=await api.get(`/clinical-forms/${plan.value.id}`,{skipGlobalLoading:true});if(!alive)return;plan.value=data;step.value='deliver';await loadDelivery();}
 catch(e){if(alive)error.value=message(e);}finally{if(alive)busy.value=false;}
}
async function send(){
 busy.value=true;error.value='';
 try{
  const selected=channels.value.filter(channel=>!locked(channel));
  const {data}=await api.post(`/clinical-forms/${plan.value.id}/attendance-delivery`,{version:plan.value.version,recipientKey:recipientKey.value,channels:selected,authorityConfirmed:authority.value});
  if(!alive)return;const chosen=new Set(data.deliveries.map(item=>item.channel));
  delivery.value={...delivery.value,deliveries:[...delivery.value.deliveries.filter(item=>item.recipientKey!==recipientKey.value||!chosen.has(item.channel)),...data.deliveries]};
  channels.value=channels.value.filter(channel=>!locked(channel));
 }catch(e){if(alive)error.value=message(e);}finally{if(alive)busy.value=false;}
}
async function download(){
 busy.value=true;error.value='';
 try{const {data}=await api.get(`/clinical-forms/${plan.value.id}/attendance-pdf`,{responseType:'blob',skipGlobalLoading:true});const url=URL.createObjectURL(data),link=document.createElement('a');link.href=url;link.download='appointment-letter.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 catch(e){if(alive)error.value=message(e);}finally{if(alive)busy.value=false;}
}
function keydown(event){
 if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy.value)emit('close');}
 if(event.key==='Tab'){const elements=[...dialog.value.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node=>node.getClientRects().length);if(!elements.length){event.preventDefault();return;}const first=elements[0],last=elements.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.value)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
}
onMounted(async()=>{previousFocus=document.activeElement;await nextTick();dialog.value?.focus();void load();});
onBeforeUnmount(()=>{alive=false;previousFocus?.focus?.();});
</script>
<template>
 <Teleport to="body">
  <div class="attendance-letter-backdrop" @keydown="keydown">
   <section ref="dialog" class="attendance-letter-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-letter-title" tabindex="-1">
    <header><div><p class="letter-eyebrow">For this session</p><h2 id="attendance-letter-title">Appointment letter</h2><p>{{step==='compose'?'Prepare the letter using the saved appointment.':step==='sign'?'Review and digitally sign this version.':'Your signed letter is ready. Choose how to send it.'}}</p></div><button type="button" class="letter-close" :disabled="busy" aria-label="Back to session" @click="emit('close')">×</button></header>
    <div class="letter-body" :aria-busy="loading||busy">
     <p v-if="loading" role="status">Loading this appointment’s letter…</p>
     <p v-if="error" role="alert" class="letter-error">{{error}}</p>
     <template v-if="catalog&&!loading">
      <template v-if="step==='compose'">
       <p class="letter-hint">Use “Scheduled appointment” to confirm a booking, or “Attendance verification” after attendance has actually been verified.</p>
       <SafetyPlanDocument v-model="form" :template="plan?.template||catalog.template" :branding="catalog.branding" editable />
      </template>
      <article v-else class="letter-preview"><p class="letter-agency">{{plan.branding?.name}}</p><h3>{{letter.title}}</h3><p v-for="paragraph in letter.body" :key="paragraph">{{paragraph}}</p><img v-if="letter.signer?.evidence?.signature" :src="letter.signer.evidence.signature" alt="Recorded staff signature" class="letter-signature"/><p class="letter-signed">{{letter.signature}}</p></article>
      <SafetyPlanSigning v-if="step==='sign'&&signer" :plan="plan" :signer="signer" @signed="onSigned" @cancel="step='compose'" />
      <section v-if="step==='deliver'" class="letter-delivery" aria-label="Send signed appointment letter">
       <h3>Send a copy</h3><p v-if="!delivery.recipients.length">No authorized recipient is available. Review the client’s contact details or linked portal accounts.</p>
       <template v-else>
        <label class="letter-recipient">Recipient<select v-model="recipientKey" :disabled="busy" @change="chooseRecipient"><option v-for="item in delivery.recipients" :key="item.key" :value="item.key">{{item.name}}</option></select></label>
        <div class="letter-channels"><label v-for="(label,channel) in channelNames" :key="channel" :class="{unavailable:!recipient?.channels[channel]||locked(channel)}"><input v-model="channels" type="checkbox" :value="channel" :disabled="busy||!recipient?.channels[channel]||locked(channel)"/><span><strong>{{label}}</strong><small v-if="channel==='email'">{{recipient?.email||recipient?.reasons.email}}</small><small v-if="channel==='portal'">{{recipient?.channels.portal?'Visible in their portal documents':recipient?.reasons.portal}}</small><small v-if="channel==='sms'">{{recipient?.channels.sms?`${recipient.phone} · From ${delivery.sender?.from}`:recipient?.reasons.sms}}</small></span></label></div>
        <p class="letter-hint">Text sends the complete letter text and electronic-signature details. Email includes the signed PDF. Each selected channel has its own result below.</p>
        <label v-if="recipient?.kind==='guardian'" class="letter-check"><input v-model="authority" type="checkbox" :disabled="busy"/>I confirm this guardian is authorized to receive the letter.</label>
        <button type="button" class="letter-primary" :disabled="busy||!channels.some(channel=>!locked(channel))||(recipient?.kind==='guardian'&&!authority)" @click="send">{{busy?'Sending…':'Send selected copies'}}</button>
       </template>
       <ul v-if="receipts.length" class="letter-receipts" aria-live="polite"><li v-for="item in receipts" :key="item.channel" :class="`letter-receipt--${item.status}`"><strong>{{item.channel==='portal'&&item.status==='sent'?'Portal copy posted':`${item.channel==='sms'?'Text':item.channel==='email'?'Email':'Portal'} · ${statusLabel(item.status)}`}}</strong><p v-if="item.error">{{item.error}}</p></li></ul>
      </section>
     </template>
    </div>
    <footer><button type="button" :disabled="busy" @click="emit('close')">Back to session</button><button v-if="step==='compose'&&catalog" type="button" class="letter-primary" :disabled="loading||busy" @click="prepareSignature">{{busy?'Saving…':'Save and review for signature'}}</button><template v-if="step==='deliver'"><button type="button" :disabled="busy" @click="step='compose'">Revise as a new version</button><button type="button" :disabled="busy" @click="download">Download signed PDF</button></template></footer>
   </section>
  </div>
 </Teleport>
</template>
<style scoped>
.attendance-letter-backdrop{position:fixed;inset:0;z-index:10600;background:rgba(30,48,65,.28);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:18px}.attendance-letter-dialog{width:min(920px,100%);max-height:calc(100dvh - 36px);display:flex;flex-direction:column;border:1px solid rgba(217,232,242,.7);border-radius:22px;background:var(--bg-card,#fff);background:color-mix(in srgb,var(--bg-card,#fff) 96%,transparent);color:var(--text-primary,#243d50);box-shadow:0 28px 90px rgba(17,38,58,.18);outline:none;overflow:hidden}.attendance-letter-dialog header{display:flex;justify-content:space-between;align-items:flex-start;padding:22px 24px 16px;border-bottom:1px solid rgba(140,165,186,.16)}h2{margin:3px 0 5px;font-size:23px;letter-spacing:-.03em}h3{font-size:17px}header p{margin:0;font-size:13px;line-height:1.5;color:var(--text-secondary,#60788a)}.letter-eyebrow{text-transform:uppercase;letter-spacing:.1em;font-size:10px!important}.letter-body{padding:20px 24px;overflow:auto}.letter-hint{font-size:12px;line-height:1.6;color:var(--text-secondary,#60788a)}button,select{font:inherit;border:1px solid rgba(119,148,173,.25);border-radius:11px;padding:9px 14px;background:color-mix(in srgb,var(--bg-card,#fff) 78%,transparent);color:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}.letter-close{font-size:24px;border:0;background:transparent;padding:0 5px}.letter-primary{background:#1b725e;color:#fff;border-color:transparent;box-shadow:0 3px 10px rgba(27,114,94,.1)}footer{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;padding:14px 24px;border-top:1px solid rgba(140,165,186,.16)}footer button:first-child{margin-right:auto}.letter-preview{padding:24px;border:1px solid rgba(143,167,186,.2);border-radius:16px;background:rgba(244,249,252,.45);line-height:1.8;font-size:14px}.letter-agency{font-size:12px;font-weight:600;color:#47677b}.letter-signed{font-size:11px;color:#60788a}.letter-signature{max-width:180px;max-height:65px;object-fit:contain}.letter-delivery{margin-top:22px}.letter-recipient{display:grid;gap:6px;font-size:13px;max-width:420px}.letter-channels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}.letter-channels label{display:flex;align-items:flex-start;gap:9px;border:1px solid rgba(125,159,181,.2);padding:13px;border-radius:14px;background:rgba(239,247,251,.45);font-size:12px;cursor:pointer}.letter-channels small{display:block;margin-top:5px;line-height:1.5;color:#61798a;overflow-wrap:anywhere}.letter-channels input,.letter-check input{width:16px!important;height:16px!important;flex:none;margin:1px 0 0}.letter-channels .unavailable{opacity:.6;cursor:default}.letter-check{display:flex;gap:8px;align-items:flex-start;font-size:12px;margin:14px 0;line-height:1.6}.letter-error{padding:12px 14px;border-radius:12px;color:#a33639;background:rgba(228,91,91,.07)}.letter-receipts{padding:0;list-style:none;display:grid;gap:6px;font-size:12px}.letter-receipts li{padding:10px 13px;border-radius:11px;background:rgba(227,241,247,.6)}.letter-receipts p{margin:4px 0 0}.letter-receipt--sent{color:#1c6d4c}.letter-receipt--failed,.letter-receipt--review{color:#965315}.letter-body :deep(.safety-document){border:0;background:transparent}.letter-body :deep(.section){background:transparent}.letter-body :deep(.signing){border:1px solid rgba(87,140,119,.2);background:rgba(230,242,235,.4);border-radius:16px}.letter-body :deep(input:not([type=checkbox])),.letter-body :deep(textarea){border-radius:10px;border-color:rgba(119,148,173,.3)}@media(max-width:600px){.attendance-letter-backdrop{padding:8px}.attendance-letter-dialog{max-height:calc(100dvh - 16px);border-radius:17px}.attendance-letter-dialog header,.letter-body,footer{padding:16px}.letter-channels{grid-template-columns:1fr}.letter-preview{padding:17px}footer button{flex:1 1 auto}}
</style>
