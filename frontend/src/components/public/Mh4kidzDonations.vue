<template>
  <section class="mh-donations mh-section" aria-labelledby="donation-title" data-analytics-ignore>
    <div class="mh-wrap">
      <p v-if="error" role="alert" class="donation-error">{{ error }}</p>
      <div v-if="receiptToken" class="donation-receipt">
        <template v-if="receipt?.receipt">
          <article v-html="receipt.receipt.html" />
          <div class="donation-receipt-actions">
            <button class="mh-button" @click="printReceipt">Print / save PDF</button>
            <button v-if="receipt.publicRecognition" class="mh-button mh-outline" :disabled="busy" @click="makeAnonymous">Make my donation anonymous</button>
            <p v-else>Your donation is anonymous on the website.</p>
          </div>
        </template>
        <template v-else>
          <h2>Confirming your donation</h2>
          <p role="status">Your receipt will appear once your payment is confirmed. This can take a moment.</p>
          <button class="mh-button" :disabled="busy" @click="loadReceipt">Check payment status</button>
          <p>For help, contact MH4Kidz with the email you used at checkout.</p>
        </template>
      </div>
      <template v-else>
        <div class="donation-intro"><p class="mh-eyebrow">A little generosity. A world of possibility.</p><h2 id="donation-title">Help brighter futures take shape.</h2><p>Your gift supports MH4Kidz’s work with kids, families, and communities.</p></div>
        <p v-if="cancelled" class="donation-notice" role="status">You left checkout. You can start again whenever you’re ready.</p>
        <p v-if="loading" role="status">Loading donation options…</p>
        <div v-else-if="!status.acceptingDonations && !preview" class="donation-opening">
          <h3>Online giving is opening soon.</h3><p>We’re getting everything ready to welcome your support. Please check back soon.</p>
          <router-link class="mh-button mh-outline" to="/p/mh4kidz/contact">Contact MH4Kidz</router-link>
        </div>
        <form v-else class="donation-form" @submit.prevent="checkout">
          <p v-if="preview" class="donation-notice">Website preview — payments are disabled.</p>
          <fieldset :disabled="busy"><legend>Choose a one-time gift</legend>
            <div class="donation-amounts"><button v-for="n in [25,50,100,250]" :key="n" type="button" :aria-pressed="Number(amount)===n" @click="amount=String(n)">${{n}}</button></div>
            <label>Gift amount (USD)<input v-model="amount" type="number" min="1" max="10000" step="0.01" required inputmode="decimal" /></label>
            <div class="donation-fields"><label>Your full name<input v-model="form.name" autocomplete="name" maxlength="200" required /></label><label>Email for your receipt<input v-model="form.email" type="email" autocomplete="email" maxlength="254" required /></label></div>
          </fieldset>
          <fieldset :disabled="busy" class="donation-recognition"><legend>How would you like to be recognized?</legend>
            <label class="donation-radio"><input v-model="form.publicRecognition" type="radio" :value="true" /><span><strong>Celebrate my gift publicly</strong><small>Show my name, gift amount, and city/state or region on the MH4Kidz website.</small></span></label>
            <label class="donation-radio"><input v-model="form.publicRecognition" type="radio" :value="false" /><span><strong>Keep my gift anonymous</strong><small>Keep my name, location, and gift off the public donor list. MH4Kidz still needs my name and email for its financial records and my receipt.</small></span></label>
            <div v-if="form.publicRecognition" class="donation-fields"><label>City<input v-model="form.city" autocomplete="address-level2" maxlength="100" required /></label><label>State / region<input v-model="form.region" autocomplete="address-level1" maxlength="100" required /></label></div>
            <p v-if="form.publicRecognition" class="donation-preview">Public listing: <strong>{{form.name||'Your name'}}</strong> · {{money(Number(amount)*100)}} · {{form.city||'City'}}, {{form.region||'State / region'}}</p>
          </fieldset>
          <p>Your email is never shown on the donor list. A donation acknowledgment will be emailed after payment. No goods or services are provided in exchange for your gift.</p>
          <button class="mh-button donation-submit" :disabled="busy||preview">{{busy?'Opening secure checkout…':`Donate ${money(Number(amount)*100)} now`}}</button>
          <p class="donation-secure">Secure payment through Stripe · One-time gift · No account needed</p>
        </form>
      </template>
      <section v-if="status.donors.length" class="donation-wall" aria-labelledby="donor-title"><p class="mh-eyebrow">Our community of support</p><h2 id="donor-title">Thank you for making room for possibility.</h2><p>Recent gifts shared with donor permission. We’re grateful for our anonymous supporters, too.</p><ul><li v-for="(donor,i) in status.donors" :key="i"><span class="donor-heart" aria-hidden="true">♥</span><div><strong>{{donor.name}}</strong><span>{{donor.city}}, {{donor.region}}</span></div><b>{{money(donor.amountCents)}}</b></li></ul></section>
    </div>
  </section>
</template>
<script setup>
import {onMounted,onBeforeUnmount,ref} from 'vue';
import {useRoute} from 'vue-router';
import api from '../../services/api';
const props=defineProps({preview:{type:Boolean,default:false}}),route=useRoute();
const status=ref({acceptingDonations:false,donors:[]}),loading=ref(true),busy=ref(false),error=ref(''),amount=ref('50');
const form=ref({name:'',email:'',city:'',region:'',publicRecognition:true});
const receiptToken=new URLSearchParams(String(route.hash||'').replace(/^#/, '')).get('receipt')||'';
const cancelled=route.query.checkout==='cancelled',receipt=ref(null);
const options={skipAuthRedirect:true,skipGlobalLoading:true};
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number.isFinite(n)?n/100:0);
let alive=true,timer=null,polls=0,attempt=null;
onBeforeUnmount(()=>{alive=false;clearTimeout(timer);});
async function load(){try{const r=await api.get('/public/mh4kidz/donations',options);if(alive)status.value={acceptingDonations:r.data.acceptingDonations===true,donors:Array.isArray(r.data.donors)?r.data.donors:[]};}catch{if(alive)error.value='Donation information could not load. Please refresh to try again.';}finally{if(alive)loading.value=false;}}
async function checkout(){
  if(props.preview||busy.value)return;
  error.value='';busy.value=true;
  try{
    const cents=Number(amount.value)*100;
    if(!/^\d+(?:\.\d{1,2})?$/.test(amount.value)||!Number.isSafeInteger(Math.round(cents))||cents<100||cents>1000000)throw Error('Enter a gift between $1 and $10,000, with up to two decimal places.');
    const data={...form.value,city:form.value.publicRecognition?form.value.city:'',region:form.value.publicRecognition?form.value.region:'',amountCents:Math.round(cents),recognitionVersion:'public-name-amount-city-region-v1'};
    const key=JSON.stringify(data);
    if(attempt?.key!==key)attempt={key,requestKey:crypto.randomUUID(),receiptToken:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')};
    const r=await api.post('/public/mh4kidz/donations/checkout',{...data,requestKey:attempt.requestKey,receiptToken:attempt.receiptToken},options);
    if(!r.data.url?.startsWith('https://checkout.stripe.com/'))throw Error('Secure checkout is unavailable. Please try again.');
    window.location.assign(r.data.url);
  }catch(e){error.value=e.response?.data?.error?.message||e.message||'Checkout could not open. Please try again.';}finally{busy.value=false;}
}
async function loadReceipt(){
  if(props.preview||!receiptToken||!alive)return;
  clearTimeout(timer);busy.value=true;error.value='';
  try{const r=await api.post('/public/mh4kidz/donations/receipt',{receiptToken},options);if(!alive)return;receipt.value=r.data;if(r.data.status==='processing'&&polls++<12)timer=setTimeout(loadReceipt,5000);else if(r.data.receipt)await load();}
  catch{if(alive)error.value='We couldn’t retrieve this receipt. Please try again or contact MH4Kidz.';}finally{if(alive)busy.value=false;}
}
async function makeAnonymous(){busy.value=true;error.value='';try{await api.post('/public/mh4kidz/donations/anonymous',{receiptToken},options);await loadReceipt();}catch{error.value='Your privacy choice could not be saved. Please try again.';}finally{busy.value=false;}}
const printReceipt=()=>window.print();
onMounted(()=>{if(props.preview){loading.value=false;return;}load();if(receiptToken)loadReceipt();});
</script>
<style scoped>
.donation-intro{max-width:660px;margin:0 auto 32px;text-align:center}.donation-intro h2{font-size:clamp(28px,4vw,44px);line-height:1.15}.donation-form,.donation-opening,.donation-receipt{max-width:740px;margin:auto;padding:clamp(20px,4vw,40px);border:1px solid #d7e9e4;border-radius:24px;background:#fff;box-shadow:0 16px 48px #163d3b0b}.donation-form fieldset{border:0;padding:0;margin:0 0 28px;min-width:0}.donation-form legend{font-size:21px;font-weight:750;margin-bottom:18px}.donation-form label{display:grid;gap:8px;font-weight:650;font-size:15px;min-width:0}.donation-form input:not([type=radio]){font:inherit;border:1px solid #aec7c0;border-radius:10px;padding:13px;width:100%;box-sizing:border-box;background:white;color:#173c42}.donation-form input:focus{outline:3px solid #26a59c;outline-offset:2px}.donation-amounts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}.donation-amounts button{padding:14px 4px;border:1px solid #aec7c0;border-radius:12px;background:#fff;font:inherit;font-size:20px;font-weight:700;color:#173c42;cursor:pointer}.donation-amounts button[aria-pressed=true]{background:#173c42;color:#fff;border-color:#173c42}.donation-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}.donation-form .donation-radio{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid #d7e9e4;border-radius:12px;margin-bottom:10px;cursor:pointer}.donation-radio input{margin-top:5px;accent-color:#147a72;flex-shrink:0;width:18px;height:18px}.donation-radio small{display:block;font-weight:400;line-height:1.5;margin-top:5px}.donation-form p{font-size:14px;line-height:1.6}.donation-preview,.donation-notice{padding:14px;background:#edf6f2;border-radius:10px}.donation-submit{width:100%;justify-content:center}.donation-secure{text-align:center;color:#41645b}.donation-error{max-width:740px;margin:0 auto 20px;padding:16px;background:#fff1ec;border-radius:12px;color:#903822}.donation-wall{margin:64px auto 0;max-width:900px;text-align:center}.donation-wall ul{list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:16px;text-align:left}.donation-wall li{display:flex;align-items:center;gap:16px;border:1px solid #d7e9e4;background:#fff;border-radius:16px;padding:20px;overflow-wrap:anywhere}.donation-wall li div{flex:1}.donation-wall li span:not(.donor-heart){display:block;font-size:14px;margin-top:4px}.donor-heart{color:#dc8b44;font-size:26px}.donation-receipt-actions{display:flex;flex-wrap:wrap;gap:12px}.donation-opening{text-align:center}.donation-form button:disabled{opacity:.65;cursor:default}@media(max-width:600px){.donation-fields,.donation-wall ul{grid-template-columns:1fr}.donation-form{padding:20px}.donation-amounts{gap:8px}}@media print{.donation-wall,.donation-receipt-actions,.donation-error{display:none}.donation-receipt{border:0;box-shadow:none;padding:0}}
</style>
