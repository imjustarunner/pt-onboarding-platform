<template>
  <section class="payment-setup-summary" aria-label="Responsible party and payment method">
    <dl><div><dt>Responsible party</dt><dd>{{ responsibleNames || 'Not recorded' }}</dd></div><div><dt>Payment method</dt><dd>{{ setup?.medicaid ? 'Not required for Medicaid' : setup?.cardOnFile ? 'Card on file' : setup ? 'No card on file' : 'Status not available' }}</dd></div></dl>
    <div v-if="showPaymentSetup" class="fundthred-setup" aria-label="Secure FundThred payment setup">
      <header><FundThredBrand compact /><span>Secure payment setup</span></header>
      <div class="qr-body"><div class="qr-frame"><img v-if="qrImage" :src="qrImage" alt="Scan to sign in and add a payment card securely" width="220" height="220" /><p v-else-if="qrError" role="status">{{ qrError }}</p><p v-else role="status">Preparing secure QR code…</p></div><div><h4>Scan to add a payment method</h4><p>Ask the responsible party to scan this code, sign in to their own account, and add their card securely through Stripe.</p><a :href="safeUrl" target="_blank" rel="noopener noreferrer">Open secure payment setup</a><p class="muted">They can also sign in to their account and open Payment methods.</p></div></div>
    </div>
    <p v-else-if="setup?.paymentMethodNeeded && !setup?.medicaid && !setup?.secureCollectionAvailable" class="muted">Contact Billing to arrange secure payment setup.</p>
  </section>
</template>
<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import QRCode from 'qrcode';
import FundThredBrand from '../fundthred/FundThredBrand.vue';
const props=defineProps({setup:{type:Object,default:null}});
const qrImage=ref(''),qrError=ref('');let generation=0;
const responsibleNames=computed(()=>(props.setup?.responsibleParties||[]).map(p=>p.name).filter(Boolean).join(', '));
const safeUrl=computed(()=>{if(!props.setup?.paymentUrl)return '';try{const url=new URL(props.setup.paymentUrl,window.location.origin);return url.protocol==='https:'?url.href:'';}catch{return '';}});
const showPaymentSetup=computed(()=>props.setup?.medicaid===false&&props.setup?.cardOnFile!==true&&props.setup?.paymentMethodNeeded===true&&props.setup?.secureCollectionAvailable===true&&!!safeUrl.value);
watch([safeUrl,showPaymentSetup],async([url,show])=>{const current=++generation;qrImage.value='';qrError.value='';if(!show)return;try{const image=await QRCode.toDataURL(url,{width:440,margin:4,errorCorrectionLevel:'H',color:{dark:'#123b49',light:'#ffffff'}});if(current===generation)qrImage.value=image;}catch{if(current===generation)qrError.value='Use the secure payment setup link below.';}},{immediate:true});
onBeforeUnmount(()=>generation++);
</script>
<style scoped>
.payment-setup-summary{color:var(--text-primary,#17324d)}dl{margin:0;display:grid;gap:10px}dl>div{display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid var(--border-color,#e4ebf3);padding:8px 0}dt{color:var(--text-secondary,#586a80)}dd{margin:0;text-align:right;font-weight:600}.fundthred-setup{margin-top:20px;border:1px solid #a9c9ca;border-radius:16px;overflow:hidden;background:#f2f9f8}.fundthred-setup header{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;background:#e5f2f0;padding:16px 20px}.fundthred-setup header>span{color:#245f66;font-weight:600;font-size:12px;letter-spacing:.04em}.qr-body{padding:20px;display:flex;align-items:center;gap:24px}.qr-frame{flex:0 0 220px;min-height:220px;background:white;border:1px solid #d5e7e5;border-radius:12px;display:grid;place-items:center;overflow:hidden}.qr-frame img{display:block;width:220px;height:220px}.qr-body h4{margin:0 0 8px;font-size:18px}.qr-body p{line-height:1.5}.qr-body a{display:inline-block;border-radius:7px;padding:10px 14px;background:#147d78;color:white;text-decoration:none}.muted{color:var(--text-secondary,#586a80);font-size:12px}@media(max-width:650px){.qr-body{flex-direction:column;align-items:stretch;padding:16px}.qr-frame{flex:auto;align-self:center}.fundthred-setup header{padding:14px}.qr-body h4{font-size:16px}}
</style>
