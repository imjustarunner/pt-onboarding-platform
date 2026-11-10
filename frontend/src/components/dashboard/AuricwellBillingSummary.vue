<template>
  <section v-if="permitted && (loading || error || summary?.organizations?.length)" class="auricwell-billing" aria-labelledby="auricwell-billing-title">
    <div class="billing-heading"><div><h2 id="auricwell-billing-title">AuricWell billing</h2><p>{{ scopeLabel }} · Current claims</p></div><button type="button" :disabled="loading" @click="load">Refresh</button></div>
    <p v-if="loading && !summary" role="status">Loading claim counts…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="summary && !error">
      <div class="billing-counts">
        <router-link :to="queue('submitted_or_processing')"><span>Submitted / processing</span><strong>{{ summary.counts.submitted }}</strong><small>Awaiting payer updates</small></router-link>
        <router-link :to="queue('needs_review')"><span>For review</span><strong>{{ summary.counts.review }}</strong><small>Review before submission</small></router-link>
      </div>
      <router-link :to="queue('needs_help')" class="billing-help" :class="{urgent:summary.counts.needsHelp>0}"><div><strong>Claims needing help</strong><span>Failed checks, corrections, rejections or missing information</span></div><b>{{ summary.counts.needsHelp }}</b><span aria-hidden="true">→</span></router-link>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import { canAccessBillingWorkspace, canAccessMedicalBilling } from '../../config/medicalBillingAccess';
import { auricwellAppBase } from '../../auricwell/paths';
import api from '../../services/api';

const props=defineProps({agencyId:{type:Number,default:null}});
const auth=useAuthStore(),summary=ref(null),loading=ref(false),error=ref('');
let sequence=0,active=true;
const permitted=computed(()=>canAccessBillingWorkspace(auth.user)&&(!props.agencyId||canAccessMedicalBilling(auth.user,props.agencyId)));
const scopeLabel=computed(()=>summary.value?.organizations?.length===1?summary.value.organizations[0].name:'Your billing organizations');
const queue=status=>({path:auricwellAppBase(),query:{billingSection:'claims',billingStatus:status,...(props.agencyId?{agencyId:String(props.agencyId)}:{})}});
async function load(){
 const run=++sequence;summary.value=null;error.value='';loading.value=false;
 if(!permitted.value)return;
 loading.value=true;
 try{
  const {data}=await api.get('/medical-billing/workspace/dashboard-summary',{params:props.agencyId?{agencyId:props.agencyId}:{},skipGlobalLoading:true});
  if(active&&run===sequence)summary.value=data;
 }catch(e){if(active&&run===sequence&&e.response?.status!==403)error.value='Billing counts are unavailable. Refresh to try again.';}
 finally{if(active&&run===sequence)loading.value=false;}
}
watch([()=>props.agencyId,permitted],load,{immediate:true});
onBeforeUnmount(()=>{active=false;sequence++;});
</script>

<style scoped>
.auricwell-billing{background:var(--card-bg,var(--app-surface,#fff));color:var(--text-primary,#17334d);border:1px solid var(--border-color,#d6e0ea);border-radius:14px;padding:20px;margin:18px 0}.billing-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.billing-heading h2{font-size:20px;margin:0 0 5px}.billing-heading p{font-size:13px;color:var(--text-secondary,#52677c);margin:0 0 18px}.billing-heading button{font:inherit;font-size:13px;background:transparent;border:1px solid #aebdcc;border-radius:6px;padding:7px 11px;cursor:pointer}.billing-counts{display:grid;grid-template-columns:1fr 1fr;gap:14px}.billing-counts a{display:grid;gap:6px;padding:16px;border:1px solid var(--border-color,#d6e0ea);border-radius:9px;color:inherit;text-decoration:none}.billing-counts span{font-size:14px;font-weight:600}.billing-counts strong{font-size:30px;color:#1555b0}.billing-counts small{font-size:12px;color:var(--text-secondary,#52677c)}.billing-help{display:flex;align-items:center;gap:14px;margin-top:14px;padding:16px;border:1px solid var(--border-color,#d6e0ea);border-radius:9px;color:inherit;text-decoration:none}.billing-help div{display:grid;gap:5px;flex:1}.billing-help strong{font-size:14px}.billing-help div span{font-size:12px}.billing-help b{font-size:26px}.billing-help.urgent{border-color:#e4b5a8;background:var(--app-surface-muted,#fff5f1);color:var(--app-text-red,#8b3524)}[role=alert]{color:#8b3524}@media(max-width:480px){.auricwell-billing{padding:15px}.billing-counts{gap:10px}.billing-counts a{padding:12px}.billing-help{padding:12px}.billing-help div span{line-height:1.5}}
</style>
