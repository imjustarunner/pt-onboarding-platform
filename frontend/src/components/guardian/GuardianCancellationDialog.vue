<template>
  <dialog ref="dialog" class="guardian-cancel-dialog" aria-labelledby="guardian-cancel-title" aria-modal="true" @cancel.prevent="emit('close')">
    <header><div><h2 id="guardian-cancel-title">{{ ft('Cancel appointments') }}</h2><p>{{ appointment.providerName }}</p></div><button type="button" aria-label="Close cancellation" @click="emit('close')">×</button></header>
    <div class="cancel-body">
      <p v-if="error" role="alert" class="cancel-error">{{ error }}</p>
      <template v-if="step==='scope'">
        <h3>{{ ft('What would you like to change?') }}</h3>
        <label class="cancel-choice"><input v-model="scope" type="radio" value="single" /> {{ ft('Only this appointment') }}</label>
        <label v-if="appointment.isRecurring" class="cancel-choice"><input v-model="scope" type="radio" value="future" /> {{ ft('All future sessions in this recurring series') }}</label>
        <label v-if="appointment.canEndServices!==false" class="cancel-choice"><input v-model="scope" type="radio" value="end_services" /> {{ ft('Cancel all future sessions and end services') }}</label>
        <p v-else>Contact your care team to end this clinical service. Your appointment access does not include changing the care plan.</p>
        <p v-if="scope==='end_services'">This ends this service with {{ appointment.providerName || 'this provider' }} at this agency, including appointments beyond the six shown. Your other services remain unchanged.</p>
        <p v-else-if="scope==='future'">Every remaining appointment in this series will be included, not only the six shown. This does not end your service.</p>
        <p v-else>{{ when(appointment.startAt,appointment.timeZone) }}</p>
      </template>
      <template v-else-if="step==='reason'">
        <h3>{{ ft('Tell your care team why') }}</h3>
        <label>{{ ft('Reason (required)') }}<select v-model="reasonChoice"><option value="">{{ ft('Choose a reason') }}</option><option v-for="reason in reasons" :key="reason" :value="reason">{{ ft(reason) }}</option><option value="other">{{ ft('Other') }}</option></select></label>
        <label v-if="reasonChoice==='other'">{{ ft('Your reason') }}<textarea v-model="otherReason" maxlength="500" rows="3" required /></label>
        <label>{{ ft('Personal note (optional)') }}<textarea v-model="personalNote" maxlength="1000" rows="3" /></label>
        <p>Your care team and your own confirmation email will include this note. Other guardians receive the schedule update without your personal explanation.</p>
      </template>
      <template v-else-if="step==='review'">
        <h3>{{ review.endsService ? 'End this service and cancel its future appointments?' : 'Review your cancellation' }}</h3>
        <p v-if="review.count"><strong>{{ review.count }} appointment{{ review.count===1?'':'s' }}</strong> {{ review.endsService ? `and ${review.serviceLabel} with this provider` : 'in this selection' }}.</p>
        <p v-else>No future appointments remain to cancel. You can still end {{ review.serviceLabel }} with this provider.</p>
        <p v-if="review.endsService">No later appointments in this service will remain scheduled or generate reminders. Other services and agencies remain unchanged.</p>
        <p><strong>{{ review.totalFeeCents ? `Total cancellation fee: ${money(review.totalFeeCents)}` : 'No cancellation fee applies.' }}</strong></p>
        <details><summary>{{ ft('Dates, deadlines, and fees') }}</summary><ul><li v-for="fee in review.fees" :key="fee.appointmentId">
          <strong>{{ when(fee.startAt,fee.timeZone) }} · {{ money(fee.feeCents) }}</strong>
          <p>{{ fee.policyName }} · {{ fee.noticeHours }} hours’ notice.<template v-if="fee.cancelDeadlineAt"> Cancel by {{ when(fee.cancelDeadlineAt,fee.timeZone) }}.</template> {{ fee.isLate ? 'This is inside the late-cancellation window.' : 'This meets the required notice.' }}</p>
          <p v-if="fee.hasPackage">{{ ['forfeit','late_forfeit'].includes(fee.packageAction) ? 'This package session will be used.' : fee.packageAction==='review' ? 'The care team will review the package credit.' : 'This package session will be returned.' }}</p>
        </li></ul></details>
        <details><summary>{{ ft('Preview your confirmation') }}</summary><p v-if="review.count">{{ review.count }} future appointment{{ review.count===1?' has':'s have' }} been canceled.</p><p v-else>No future appointments remained to cancel.</p><p v-if="review.endsService">You have ended {{ review.serviceLabel }} with this provider. Other services are unchanged.</p><p>Reason: {{ reason }}</p><blockquote v-if="personalNote.trim()"><strong>A personal note</strong><br><em>{{ personalNote.trim() }}</em></blockquote></details>
        <p>One summary will be sent, rather than a separate email for every appointment.</p>
        <label class="cancel-confirm"><input v-model="confirmed" type="checkbox" /> I confirm this selection{{ review.endsService ? ' and that I want to end this service' : '' }}, and acknowledge the {{ money(review.totalFeeCents) }} total fee.</label>
      </template>
      <template v-else>
        <h3>{{ cancellation?.status==='failed' ? 'Your request needs care-team follow-up' : 'Finishing your cancellation' }}</h3>
        <p role="status" aria-live="polite">{{ cancellation?.completed || 0 }} of {{ cancellation?.count || review?.count || 0 }} appointments processed.</p>
        <p>Your request is saved and continues if you close this window. You do not need to cancel each appointment separately.</p>
      </template>
    </div>
    <footer>
      <button v-if="['reason','review'].includes(step)" type="button" :disabled="busy" @click="back">{{ ft('Back') }}</button>
      <button v-if="step==='scope'" type="button" @click="step='reason'">{{ ft('Continue') }}</button>
      <button v-else-if="step==='reason'" type="button" :disabled="busy||!reason" @click="preview">{{ busy ? 'Reviewing…' : ft('Review dates and fees') }}</button>
      <button v-else-if="step==='review'" type="button" class="cancel-danger" :disabled="busy||!confirmed" @click="confirm">{{ busy ? 'Saving your request…' : review.endsService ? 'Cancel all future sessions and end services' : 'Confirm cancellation' }}</button>
      <button v-else type="button" :disabled="busy" @click="poll">{{ ft('Check status') }}</button>
    </footer>
  </dialog>
</template>
<script setup>
import {computed,ref,onMounted,onUnmounted} from 'vue';
import {useFamilyLocale} from '../../composables/useFamilyLocale';
import {usePortalCareApi} from '../../composables/usePortalCareApi';
const {ft,locale}=useFamilyLocale(),api=usePortalCareApi();
const props=defineProps({clientId:{type:Number,required:true},appointment:{type:Object,required:true},initialScope:{type:String,default:'single'}});
const emit=defineEmits(['close','completed']);
const dialog=ref(null);
const step=ref('scope'),scope=ref(props.initialScope),reasonChoice=ref(''),otherReason=ref(''),personalNote=ref(''),review=ref(null),confirmed=ref(false),busy=ref(false),error=ref(''),cancellation=ref(null);
const reasons=['Scheduling conflict','Taking a break','Goals reached or feeling better','Changing provider or service'];
const reason=computed(()=>String(reasonChoice.value==='other'?otherReason.value:reasonChoice.value).trim());
const requestId=ref(null);let timer=null,disposed=false;
const base=computed(()=>`/guardian-portal/clients/${props.clientId}/appointments/${props.appointment.id}`);
const payload=()=>({requestVersion:2,scope:scope.value,reason:reason.value,personalNote:personalNote.value.trim()});
const when=(value,zone)=>new Date(typeof value==='string'&&!/(Z|[+-]\d\d:\d\d)$/.test(value)?value.replace(' ','T')+'Z':value).toLocaleString(locale.value,{timeZone:zone||'America/Denver',dateStyle:'medium',timeStyle:'medium'});
const money=cents=>new Intl.NumberFormat(locale.value,{style:'currency',currency:'USD'}).format((cents||0)/100);
function back(){error.value='';confirmed.value=false;review.value=null;requestId.value=null;step.value=step.value==='review'?'reason':'scope';}
async function preview(){
  busy.value=true;error.value='';
  try{const{data}=await api.post(`${base.value}/cancel-preview`,payload());if(!disposed){review.value=data;confirmed.value=false;requestId.value=null;step.value='review';}}
  catch(e){if(!disposed)error.value=e.response?.data?.error?.message||'Could not review the cancellation. Please retry.';}
  finally{busy.value=false;}
}
async function confirm(){
  if(!confirmed.value||busy.value)return;busy.value=true;error.value='';requestId.value ||= crypto.randomUUID();
  try{const{data}=await api.post(`${base.value}/cancel`,{...payload(),reviewToken:review.value.reviewToken,confirmed:true,requestId:requestId.value});
    if(!disposed){cancellation.value=data.cancellation;step.value='progress';busy.value=false;await poll();}}
  catch(e){if(!disposed){error.value=e.response?.data?.error?.message||'The connection was interrupted. Retry this confirmation to check the same request safely.';
    if(e.response?.status===409){confirmed.value=false;requestId.value=null;step.value='reason';}}}
  finally{busy.value=false;}
}
async function poll(){
  if(disposed||busy.value||!cancellation.value?.id)return;clearTimeout(timer);busy.value=true;
  try{const{data}=await api.get(`/guardian-portal/clients/${props.clientId}/cancellations/${cancellation.value.id}`,{skipGlobalLoading:true});
    if(disposed)return;cancellation.value=data.cancellation;
    if(cancellation.value.status==='completed'){emit('completed',cancellation.value);return;}
    if(cancellation.value.status==='failed'){error.value=cancellation.value.error||'Contact your care team to finish this request.';return;}
    timer=setTimeout(poll,2000);
  }catch{if(!disposed)error.value='Could not check progress. Your saved request continues; use Check status to retry.';}
  finally{busy.value=false;}
}
onMounted(()=>{if(dialog.value?.showModal)dialog.value.showModal();else dialog.value?.setAttribute('open','');});
onUnmounted(()=>{disposed=true;clearTimeout(timer);});
</script>
<style scoped>
.guardian-cancel-dialog{position:fixed;inset:4vh 0 auto;z-index:10020;width:min(680px,calc(100vw - 28px));max-height:90dvh;margin:0 auto;padding:0;border:1px solid #cbd5e1;border-radius:16px;color:#182f38;background:#fff;box-shadow:0 0 0 100vmax #142d3a65,0 20px 80px #142d3a50;overflow:auto}.guardian-cancel-dialog header,.guardian-cancel-dialog footer{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:18px 22px;background:#f1f7f8}.guardian-cancel-dialog h2,.guardian-cancel-dialog header p{margin:0}.cancel-body{padding:8px 22px 22px}.cancel-body label{display:grid;gap:7px;margin:16px 0}.cancel-body .cancel-choice,.cancel-body .cancel-confirm{display:flex;align-items:flex-start;gap:10px;border:1px solid #d3dfe3;border-radius:9px;padding:12px}.cancel-body select,.cancel-body textarea{font:inherit;padding:10px;border:1px solid #9eb3bb;border-radius:7px;box-sizing:border-box;width:100%}.guardian-cancel-dialog button{font:inherit;padding:10px 16px;min-height:44px;border:1px solid #7c9ca7;border-radius:8px;background:#fff;cursor:pointer}.guardian-cancel-dialog button:disabled{opacity:.55;cursor:default}.guardian-cancel-dialog .cancel-danger{background:#a62f38;color:#fff;border-color:#a62f38}.cancel-body details{padding:12px 0;border-bottom:1px solid #dce4e8}.cancel-body blockquote{border-left:4px solid #c9a64f;margin:12px 0;padding:12px;white-space:pre-wrap}.cancel-error{color:#9f1f2c}.cancel-body input[type=radio],.cancel-body input[type=checkbox]{flex:0 0 auto;width:20px;height:20px;margin:0}.cancel-body li{padding:8px 0}.cancel-body li p{margin:5px 0;font-size:14px}
</style>
