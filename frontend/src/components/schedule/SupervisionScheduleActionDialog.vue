<template>
  <div class="action-backdrop" @click.self="!busy && $emit('close')">
    <section class="action-dialog" role="dialog" aria-modal="true" aria-labelledby="supervision-action-title">
      <header><h2 id="supervision-action-title">{{ heading }}</h2><button type="button" class="btn btn-secondary" :disabled="busy" @click="$emit('close')">Close</button></header>
      <p class="context">{{ name }} · {{ when }}</p>
      <ol class="steps" aria-label="Progress"><li :class="{current:step===1}">1 · Details</li><li :class="{current:step===2}">2 · Review</li></ol>
      <div v-if="step===1" class="fields">
        <fieldset v-if="recurring && ['change','cancel'].includes(mode)"><legend>Which sessions?</legend>
          <label><input v-model="scope" type="radio" value="single" /> Just this session; keep the recurring series</label>
          <label><input v-model="scope" type="radio" value="future" /> This and all future sessions</label>
        </fieldset>
        <label v-if="mode==='cancel'" class="field">Cancellation due to
          <select v-model="attribution" required><option value="" disabled>Select a responsible party</option><option value="supervisor">Supervisor</option><option value="supervisee">Supervisee / clinician</option><option value="organization">Organization / office</option><option value="other">Other</option></select>
        </label>
        <p v-if="mode==='missed'">Confirm that the supervisee did not attend. Recorded attendance or credited hours must be reviewed in Attendance &amp; time first. Only this occurrence will be marked missed.</p>
        <p v-if="mode==='deleted'">Remove this cancelled or missed occurrence from the calendar. Its record and history remain available. Future recurring dates stay unchanged. No email is sent.</p>
        <p v-if="mode==='change' && targetWhen"><strong>New schedule:</strong> {{ targetWhen }}</p>
        <label class="field">{{ mode==='change' ? 'Reason for the change' : mode==='deleted' ? 'Reason for deleting' : mode==='missed' ? 'Missed-session note' : 'Cancellation reason' }} <span>(required)</span>
          <textarea v-model="reason" rows="3" maxlength="500" required :placeholder="mode==='missed' ? 'For example, the supervisee did not attend the scheduled appointment.' : 'Explain the change clearly.'" />
        </label>
        <small v-if="mode!=='deleted'">This wording is included in the notification. Include only details appropriate to share.</small>
        <label v-if="mode==='cancel' && (future || scope==='future')"><input v-model="notify" type="checkbox" /> Email the supervisor and supervisee(s)</label>
        <p v-if="mode==='cancel' && !future && scope!=='future'" class="context">Past cancellations update the record without sending cancellation emails.</p>
      </div>
      <div v-else class="review">
        <p><strong>{{ scope==='future' ? 'This and all future sessions' : 'Just this session' }}</strong></p>
        <p v-if="mode==='change' && targetWhen">New schedule: {{ targetWhen }}</p>
        <p v-if="mode==='cancel'">Due to: {{ attributionLabel }}</p>
        <p class="reason">{{ reason }}</p>
        <p>{{ outcome }}</p>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <footer><button v-if="step===2" type="button" class="btn btn-secondary" :disabled="busy" @click="step=1">Back</button>
        <button v-if="step===1" type="button" class="btn btn-primary" :disabled="!valid || busy" @click="step=2">Review</button>
        <button v-else type="button" class="btn" :class="mode==='change' ? 'btn-primary' : 'btn-danger'" :disabled="busy || !valid" @click="$emit('confirm',{scope,reason:reason.trim(),attribution,notify})">{{ busy ? 'Saving…' : confirmLabel }}</button>
      </footer>
    </section>
  </div>
</template>
<script setup>
import {ref,computed} from 'vue';
const props=defineProps({mode:String,name:String,when:String,targetWhen:String,recurring:Boolean,future:Boolean,busy:Boolean,error:String});
defineEmits(['close','confirm']);
const step=ref(1),scope=ref('single'),reason=ref(''),attribution=ref(''),notify=ref(true);
const valid=computed(()=>!!reason.value.trim() && (props.mode!=='cancel' || !!attribution.value));
const attributionLabel=computed(()=>({supervisor:'Supervisor',supervisee:'Supervisee / clinician',organization:'Organization / office',other:'Other'})[attribution.value]);
const heading=computed(()=>({change:'Review supervision changes',cancel:'Cancel supervision',missed:'Mark supervision missed',deleted:'Delete from calendar'})[props.mode]);
const confirmLabel=computed(()=>({change:'Save changes',cancel:'Confirm cancellation',missed:'Save missed & notify',deleted:'Delete from calendar'})[props.mode]);
const outcome=computed(()=>props.mode==='deleted' ? 'The record is retained; only this calendar entry is removed.' : props.mode==='missed' ? 'This session stays on the calendar as Missed. The supervisor and affected supervisee(s) will receive one notification. Future sessions are unchanged.' : props.mode==='cancel' ? `Cancelled sessions stay on the calendar. ${notify.value && (props.future || scope.value==='future') ? 'The supervisor and supervisee(s) will receive the reason and cancellation details.' : 'No cancellation email will be sent.'}` : 'The selected schedule changes will be saved. Update emails include the reason when participant notifications are enabled.');
</script>
<style scoped>
.action-backdrop{position:fixed;inset:0;z-index:10003;background:rgba(15,23,42,.4);display:flex;align-items:center;justify-content:center;padding:20px}
.action-dialog{background:var(--bg-card,#fff);color:var(--text-primary,#172033);border:1px solid var(--border-color,#dce3ee);border-radius:20px;width:min(560px,100%);max-height:90vh;overflow:auto;padding:24px;box-shadow:0 20px 70px #0f172a33}
header,footer,.steps{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{margin:0;font-size:1.3rem}.context,small{color:var(--text-secondary,#64748b)}
.steps{list-style:none;padding:12px 0;border-bottom:1px solid #dce3ee;justify-content:flex-start;gap:28px}.current{font-weight:700;color:var(--primary-color,#4f46e5)}
.fields,.field{display:flex;flex-direction:column;gap:10px}.fields{gap:18px}.field{font-weight:600}.field span,small{font-weight:400}fieldset{border:1px solid #dce3ee;border-radius:12px;padding:14px}fieldset label{display:block;margin:10px 0}
textarea,select{width:100%;box-sizing:border-box;border:1px solid #becbdf;background:var(--bg-card,#fff);color:inherit;border-radius:10px;padding:12px;font:inherit}textarea{resize:vertical}footer{justify-content:flex-end;margin-top:24px}.reason{white-space:pre-wrap;background:var(--bg-secondary,#f3f6fa);padding:14px;border-radius:10px}.error{color:#b91c1c}
</style>
