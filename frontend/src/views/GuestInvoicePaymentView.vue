<template>
  <main class="guest-payment" :lang="spanish?'es':'en'">
    <header><h1>{{ t('Secure guest payment','Pago seguro como invitado') }}</h1><label>{{ t('Language','Idioma') }}<select v-model="language"><option value="en">English</option><option value="es">Español</option></select></label></header>
    <p v-if="loading" role="status">{{ t('Opening payment request…','Abriendo solicitud de pago…') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-if="invoice">
      <h2>{{ invoice.agencyName }}</h2>
      <template v-if="paid"><p role="status">{{ t('Payment confirmed. Thank you.','Pago confirmado. Gracias.') }}</p></template>
      <template v-else>
        <p>{{ t('Amount requested','Importe solicitado') }}</p><strong class="guest-amount">{{ money(invoice.amountCents) }}</strong>
        <p>{{ t('This is a one-time payment. No account is required. Card details are handled securely by Stripe.','Este es un pago único. No necesita una cuenta. Stripe procesa los datos de la tarjeta de forma segura.') }}</p>
        <template v-if="!clientSecret">
          <label class="guest-consent"><input v-model="consent" type="checkbox" :disabled="busy" />{{ t(`I authorize a one-time payment of ${money(invoice.amountCents)}. My card will not be saved for future charges.`,`Autorizo un pago único de ${money(invoice.amountCents)}. Mi tarjeta no se guardará para cargos futuros.`) }}</label>
          <button type="button" :disabled="busy || !consent" @click="prepare">{{ t('Continue to secure card entry','Continuar a los datos seguros de la tarjeta') }}</button>
        </template>
        <form v-show="clientSecret" @submit.prevent="pay">
          <div ref="cardMount" class="guest-card" aria-label="Secure card details"></div>
          <button :disabled="busy || !cardReady">{{ busy?t('Processing…','Procesando…'):t(`Pay ${money(invoice.amountCents)}`,`Pagar ${money(invoice.amountCents)}`) }}</button>
        </form>
        <button v-if="clientSecret" type="button" :disabled="busy" @click="check">{{ t('Refresh payment confirmation','Actualizar confirmación del pago') }}</button>
      </template>
    </section>
  </main>
</template>
<script setup>
import {computed,nextTick,onBeforeUnmount,onMounted,ref} from 'vue';
import {loadStripe} from '@stripe/stripe-js';
import api from '../services/api';
import {portalAuthError} from '../utils/portalAuthLocale.js';
const token=window.location.hash.slice(1),invoice=ref(null),language=ref(new URLSearchParams(window.location.search).get('lang')==='es'?'es':'en'),loading=ref(false),busy=ref(false),error=ref(''),paid=ref(false),consent=ref(false),clientSecret=ref(''),cardMount=ref(null),cardReady=ref(false);
const spanish=computed(()=>language.value==='es'),t=(en,es)=>spanish.value?es:en;
const money=value=>new Intl.NumberFormat(spanish.value?'es-US':'en-US',{style:'currency',currency:invoice.value?.currency||'USD'}).format(value/100);
const config=()=>({skipGlobalLoading:true,skipAuthRedirect:true,headers:{'X-Guest-Invoice-Token':token}});
let stripe=null,card=null,alive=true;
async function request(action,body){return api.post(`/public/guest-invoices/${action}`,body,config());}
async function load(){loading.value=true;error.value='';try{const{data}=await api.get('/public/guest-invoices/context',config());if(!alive)return;invoice.value=data;language.value=data.locale==='es'?'es':'en';paid.value=data.paid===true;}catch(e){if(alive)error.value=portalAuthError(e,language.value,t('This payment link is unavailable. Ask the sender for a new link.','Este enlace de pago no está disponible. Pida un enlace nuevo.'));}finally{if(alive)loading.value=false;}}
async function prepare(){if(busy.value)return;busy.value=true;error.value='';try{const{data}=await request('intent',{expectedAmountCents:invoice.value.amountCents,consentAccepted:consent.value});if(!alive)return;if(data.paid){paid.value=true;return;}stripe=await loadStripe(data.publishableKey,{stripeAccount:data.connectedAccountId,locale:spanish.value?'es':'en'});if(!alive)return;if(!stripe)throw new Error('Secure card entry is unavailable.');clientSecret.value=data.clientSecret;await nextTick();card=stripe.elements({locale:spanish.value?'es':'en'}).create('card');card.on('ready',()=>{cardReady.value=true;});card.mount(cardMount.value);}catch(e){if(alive)error.value=portalAuthError(e,language.value,t('Secure card entry could not be prepared. Refresh before trying again.','No se pudo preparar el pago seguro. Actualice antes de intentar otra vez.'));}finally{if(alive)busy.value=false;}}
async function check(){if(busy.value)return;busy.value=true;error.value='';try{const{data}=await request('confirm',{});if(alive){paid.value=data.paid===true;if(!paid.value)error.value=t('Payment is not confirmed yet. Refresh before making another attempt.','El pago aún no está confirmado. Actualice antes de intentarlo otra vez.');}}catch(e){if(alive)error.value=portalAuthError(e,language.value,t('Payment confirmation is pending.','La confirmación del pago está pendiente.'));}finally{if(alive)busy.value=false;}}
async function pay(){if(busy.value||!cardReady.value)return;busy.value=true;error.value='';try{const result=await stripe.confirmCardPayment(clientSecret.value,{payment_method:{card}});if(!alive)return;if(result.error){error.value=t('The card payment could not be completed. Check the card details or try another card.','No se pudo completar el pago. Revise los datos o pruebe otra tarjeta.');return;}const{data}=await request('confirm',{});if(alive){paid.value=data.paid===true;if(!paid.value)error.value=t('Payment is processing. Refresh its confirmation before trying again.','El pago se está procesando. Actualice la confirmación antes de intentarlo otra vez.');}}catch(e){if(alive)error.value=portalAuthError(e,language.value,t('Payment confirmation is pending. Do not start another payment.','La confirmación está pendiente. No inicie otro pago.'));}finally{if(alive)busy.value=false;}}
onMounted(()=>{const meta=document.createElement('meta');meta.name='referrer';meta.content='no-referrer';meta.dataset.guestInvoice='';document.head.appendChild(meta);load();});
onBeforeUnmount(()=>{alive=false;card?.destroy();document.querySelector('meta[data-guest-invoice]')?.remove();});
</script>
<style scoped>
.guest-payment{max-width:620px;margin:40px auto;padding:24px;color:#23364a}header{display:flex;justify-content:space-between;gap:14px;align-items:start}h1{font-size:25px}h2{font-size:19px}section{padding:24px;border:1px solid #dce4ed;border-radius:12px;line-height:1.6}.guest-amount{font-size:30px}.guest-consent{display:flex;align-items:start;gap:9px;margin:20px 0}.guest-card{padding:16px;border:1px solid #9badbd;border-radius:7px;margin:18px 0}button{background:#16457c;color:#fff;border:0;border-radius:7px;padding:13px 18px;font:inherit;margin:8px 8px 8px 0;cursor:pointer}button:disabled{opacity:.55}select{padding:6px}[role=alert]{color:#a11}@media(max-width:500px){.guest-payment{padding:12px;margin:0}header{flex-direction:column}section{padding:18px}}
</style>
