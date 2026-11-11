<template>
  <section class="stripe-card-entry" aria-label="Secure payment details">
    <template v-if="enabled && publishableKey">
      <div class="payment-choice" role="group" :aria-label="tx('Payment method choice')">
        <button type="button" :disabled="disabled || loading" :aria-pressed="!useLink" @click="choose(false)">{{ tx('Enter a card') }}</button>
        <button v-if="allowLink" type="button" :disabled="disabled || loading" :aria-pressed="useLink" @click="choose(true)">{{ tx('Use Link (optional)') }}</button>
      </div>
      <p v-if="email">{{ tx('Payment account email') }}: {{ email }}</p>
      <p v-if="useLink">{{ tx('Click the Link button in the secure form to use your Link account. Stripe may ask you to enter or verify your email and a code after you choose Link. You can enter a card instead.') }}</p>
      <p v-if="useLink">{{ tx('Link is optional. Choosing it does not connect a bank account or authorize recurring charges. Availability and account verification are handled by Stripe.') }}</p>
      <p v-if="loading" role="status">{{ tx('Loading secure payment details…') }}</p>
      <div ref="elementHost" class="stripe-element-host" />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </template>
  </section>
</template>
<script setup>
import {nextTick,onBeforeUnmount,ref,watch} from 'vue';
// The default stripe-js import eagerly inserts its script. The pure loader waits
// until an eligible, explicitly opened payment form actually needs Stripe.
import {loadStripe} from '@stripe/stripe-js/pure';
import {useIntakeStepTx} from '../../composables/useIntakeStepTx.js';
const {tx}=useIntakeStepTx();
const props=defineProps({
 publishableKey:String,connectedAccountId:String,clientSecret:String,email:String,name:String,contextKey:[String,Number],
 enabled:{type:Boolean,default:true},disabled:Boolean,allowLink:{type:Boolean,default:true},
 locale:{type:String,default:'en'}
});
const emit=defineEmits(['change','error','ready']);
const elementHost=ref(null),loading=ref(false),error=ref(''),useLink=ref(false),ready=ref(false);
let stripe=null,elements=null,element=null,generation=0,disposed=false,pendingMount=Promise.resolve();
function destroy(){element?.destroy();element=null;elements=null;stripe=null;ready.value=false;emit('change',{complete:false});}
async function mount(){
 const current=++generation;destroy();error.value='';loading.value=false;
 if(disposed||!props.enabled||!props.publishableKey)return;
 loading.value=true;
 try{
  const loaded=await loadStripe(props.publishableKey,props.connectedAccountId?{stripeAccount:props.connectedAccountId}:undefined);
  if(disposed||current!==generation||!props.enabled)return;
  if(!loaded)throw Error(tx('The secure payment form could not load.'));
  await nextTick();if(disposed||current!==generation||!elementHost.value)return;
  stripe=loaded;
  elements=stripe.elements({locale:props.locale==='es'?'es':'en'});
  element=elements.create('card',{hidePostalCode:false,disableLink:!useLink.value});
  element.on('change',event=>{if(current!==generation||disposed)return;error.value=event.error?.message||'';emit('change',{...event,complete:event.complete===true});});
  element.on('loaderror',event=>{if(current!==generation||disposed)return;error.value=event.error?.message||tx('The secure payment form could not load.');emit('error',error.value);});
  element.mount(elementHost.value);ready.value=true;emit('ready');
 }catch(e){if(current!==generation||disposed)return;error.value=e.message||tx('The secure payment form could not load.');emit('error',error.value);}
 finally{if(current===generation&&!disposed)loading.value=false;}
}
function choose(value){if(props.disabled||loading.value||useLink.value===value)return;useLink.value=value;pendingMount=mount();}
const details=()=>({...(String(props.name||'').trim()?{name:String(props.name).trim()}:{}),...(String(props.email||'').trim()?{email:String(props.email).trim()}: {})});
function assertReady(){if(!props.enabled||!ready.value||!stripe||!element)throw Error(tx('The secure payment form is not ready.'));}
async function confirmSetup(){return run(()=>{assertSecret();return stripe.confirmCardSetup(props.clientSecret,{payment_method:{card:element,billing_details:details()}});});}
async function run(action){
 const current=generation;await pendingMount;
 if(disposed||current!==generation)throw Error(tx('Payment details changed. Review them before continuing.'));
 assertReady();const result=await action();
 if(disposed||current!==generation)throw Error(tx('Payment details changed. Review them before continuing.'));
 return result;
}
function assertSecret(){if(!props.clientSecret)throw Error(tx('The secure payment form is not ready.'));}
async function confirmPayment(){return run(()=>{assertSecret();return stripe.confirmCardPayment(props.clientSecret,{payment_method:{card:element,billing_details:details()}});});}
async function createPaymentMethod(){return run(()=>stripe.createPaymentMethod({type:'card',card:element,billing_details:details()}));}
watch(()=>[props.publishableKey,props.connectedAccountId,props.clientSecret,props.contextKey,props.email,props.enabled,props.locale],()=>{useLink.value=false;pendingMount=mount();},{immediate:true,flush:'post'});
onBeforeUnmount(()=>{disposed=true;generation++;destroy();});
defineExpose({confirmSetup,confirmPayment,createPaymentMethod,reset:()=>{useLink.value=false;pendingMount=mount();return pendingMount;},ensureReady:()=>ready.value||loading.value?pendingMount:(pendingMount=mount()),clear:()=>{generation++;useLink.value=false;destroy();}});
</script>
<style scoped>
.stripe-card-entry{display:grid;gap:10px;min-width:0}.payment-choice{display:flex;gap:10px;flex-wrap:wrap}.payment-choice button{font:inherit;border:1px solid var(--app-line,#a8b8c8);border-radius:7px;padding:9px 12px;background:var(--bg-card,#fff);color:var(--app-ink,#19334a)}.payment-choice button[aria-pressed=true]{outline:2px solid var(--primary-color,#1764a0)}.stripe-element-host{padding:14px;border:1px solid var(--app-line,#a8b8c8);border-radius:8px;min-height:50px;background:var(--bg-card,#fff)}p{margin:0;line-height:1.5;overflow-wrap:anywhere}.error{color:var(--app-text-red,#a71919)}
</style>
