<template>
  <details class="guest-invoice-share">
    <summary>{{ externalResponsible ? t('Send invoice to the responsible billing party','Enviar factura al responsable de facturación') : t('Ask someone to make a guest payment','Pedir a otra persona un pago como invitado') }}</summary>
    <p>{{ t('They will see only the amount requested. This does not give them access to the client’s account, records or services.','Solo verá el importe solicitado. Esto no da acceso a la cuenta, los expedientes ni los servicios del cliente.') }}</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <template v-if="!share">
      <button v-if="externalResponsible" type="button" :disabled="busy" @click="previewExternal">{{ t('Preview invoice and recipient','Ver factura y destinatario') }}</button>
      <div v-if="externalPreview"><p>{{ externalPreview.recipientName }} · {{ externalPreview.recipientEmail }}</p><strong>{{ externalPreview.subject }}</strong><p class="guest-preview">{{ externalPreview.text }}</p></div>
      <label>{{ t('Amount ($)','Importe ($)') }}<input v-model="amount" type="number" min="0.01" :max="amountCents/100" step="0.01" :disabled="busy" /></label>
      <button type="button" :disabled="busy || (externalResponsible && !externalPreview) || !amount || Number(amount)<=0 || Number(amount)*100>amountCents" @click="create">{{ t('Create private payment link','Crear enlace de pago privado') }}</button>
    </template>
    <template v-else>
      <label>{{ t('Private payment link · expires in 7 days','Enlace de pago privado · vence en 7 días') }}<input :value="share.url" readonly @focus="$event.target.select()" /></label>
      <button type="button" :disabled="busy" @click="copy">{{ t('Copy link','Copiar enlace') }}</button>
      <form @submit.prevent="send">
        <label>{{ t('Recipient email','Correo del destinatario') }}<input v-model="email" type="email" maxlength="254" required :readonly="externalResponsible" :disabled="busy || submitted" /></label>
        <p>{{ t('Email preview','Vista previa del correo') }}: {{ t('You have a payment request for','Tiene una solicitud de pago de') }} {{ money(share.amountCents) }}. {{ t('Pay securely using the private link. No account is required.','Pague de forma segura con el enlace privado. No necesita una cuenta.') }}</p>
        <label class="guest-confirm"><input v-model="confirmed" type="checkbox" :disabled="busy || submitted" />{{ t('I checked this email and want to send the payment request.','Revisé este correo y quiero enviar la solicitud de pago.') }}</label>
        <button :disabled="busy || !confirmed || submitted">{{ t('Send invoice email','Enviar correo de pago') }}</button>
      </form>
      <button type="button" :disabled="busy" @click="revoke">{{ t('Cancel this payment link','Cancelar este enlace de pago') }}</button>
    </template>
  </details>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import {usePortalCareApi} from '../../composables/usePortalCareApi';
import {useFamilyLocale} from '../../composables/useFamilyLocale';
const props=defineProps({agencyId:[Number,String],allocationId:[Number,String],amountCents:{type:Number,required:true},currency:{type:String,default:'USD'},externalResponsible:Boolean});
const api=usePortalCareApi(),{locale}=useFamilyLocale();
const spanish=computed(()=>locale.value==='es'),t=(en,es)=>spanish.value?es:en;
const amount=ref(''),share=ref(null),externalPreview=ref(null),email=ref(''),confirmed=ref(false),busy=ref(false),submitted=ref(false),error=ref(''),message=ref('');
let generation=0;
watch(()=>[props.agencyId,props.allocationId],()=>{generation++;busy.value=false;share.value=null;externalPreview.value=null;email.value='';confirmed.value=false;submitted.value=false;amount.value=(props.amountCents/100).toFixed(2);error.value='';message.value='';},{immediate:true});
const money=value=>new Intl.NumberFormat(spanish.value?'es-US':'en-US',{style:'currency',currency:props.currency}).format(value/100);
const path=action=>`/family-billing/allocations/${props.allocationId}/guest-invoices${action?`/${action}`:''}`;
async function action(run){if(busy.value)return;const version=generation;busy.value=true;error.value='';message.value='';try{await run(version);}catch(e){if(version===generation)error.value=e.response?.data?.error?.message||t('The payment request could not be updated.','No se pudo actualizar la solicitud de pago.');}finally{if(version===generation)busy.value=false;}}
async function previewExternal(){await action(async version=>{const{data}=await api.post(path('external-preview'),{agencyId:props.agencyId,locale:spanish.value?'es':'en'});if(version===generation)externalPreview.value=data;});}
async function create(){await action(async version=>{const{data}=await api.post(path(''),{agencyId:props.agencyId,amountCents:Math.round(Number(amount.value)*100),locale:spanish.value?'es':'en',...(props.externalResponsible?{externalResponsible:true}:{})});if(version===generation){share.value=data;if(data.recipientEmail)email.value=data.recipientEmail;}});}
async function send(){await action(async version=>{const{data}=await api.post(path('send'),{agencyId:props.agencyId,token:share.value.token,recipientEmail:email.value,confirmed:confirmed.value});if(version!==generation)return;submitted.value=true;message.value=data.status==='sent'?t('Payment request submitted for delivery.','Solicitud de pago enviada.'):t('Delivery needs billing review.','La entrega necesita revisión de facturación.');});}
async function revoke(){await action(async version=>{await api.post(path('revoke'),{agencyId:props.agencyId,token:share.value.token});if(version===generation){share.value=null;submitted.value=false;message.value=t('The payment link was canceled.','Se canceló el enlace de pago.');}});}
async function copy(){try{await navigator.clipboard.writeText(share.value.url);message.value=t('Private payment link copied.','Enlace de pago privado copiado.');}catch{message.value=t('Select and copy the link above.','Seleccione y copie el enlace de arriba.');}}
</script>
<style scoped>
.guest-invoice-share{border-top:1px solid #dce4ed;margin-top:14px;padding-top:12px}summary{cursor:pointer;font-weight:600}label{display:grid;gap:6px;margin:12px 0}input{max-width:100%;box-sizing:border-box;padding:9px;font:inherit}.guest-confirm{display:flex;align-items:start}.guest-preview{white-space:pre-wrap}button{padding:9px 12px;margin:4px 6px 4px 0;cursor:pointer}[role=alert]{color:#a11}p{max-width:70ch;line-height:1.5}
</style>
