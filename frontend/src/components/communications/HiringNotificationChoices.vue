<template>
 <section class="hiring-choices" aria-label="Hiring and onboarding notifications">
  <h3>Hiring and onboarding notifications</h3>
  <p>Get your private portal link, notices when documents or tasks are added, and updates when pre-hire or onboarding starts or finishes.</p>
  <fieldset :disabled="busy">
   <label><input type="radio" :name="id" value="email" v-model="choice.channel" /> Email only</label>
   <label><input type="radio" :name="id" value="email_sms" v-model="choice.channel" :disabled="!context?.available" /> Email and text</label>
   <p v-if="!context?.available">Text enrollment is not available yet. You can continue with email.</p>
   <template v-if="choice.channel==='email_sms' && context?.disclosure">
    <p>{{context.disclosure.text}}</p>
    <p><a :href="context.disclosure.termsUrl" target="_blank" rel="noopener">SMS terms</a> · <a :href="context.disclosure.privacyUrl" target="_blank" rel="noopener">SMS privacy</a></p>
    <label>My mobile number<input type="tel" v-model="choice.phone" autocomplete="tel" required /></label>
    <label>Full name for electronic signature<input v-model="choice.signerName" maxlength="200" autocomplete="name" required /></label>
    <label><input type="checkbox" v-model="choice.authorityAccepted" required /> I control this mobile number and want hiring and onboarding texts.</label>
    <label><input type="checkbox" v-model="choice.electronicSignatureAccepted" required /> I electronically sign this optional enrollment. Declining does not affect my application or employment.</label>
   </template>
  </fieldset>
  <p v-if="context?.active">Your hiring text enrollment has been reviewed. Email continues, and STOP is always respected.</p>
  <p v-else-if="context?.channel==='email_sms'">Your choice is saved. Email continues while People Operations reviews text enrollment. STOP is always respected.</p>
  <button v-if="showSave" type="button" :disabled="busy || !valid" @click="emit('save',{...choice})">{{busy?'Saving…':'Save notification preference'}}</button>
 </section>
</template>
<script setup>
import {reactive,watch,computed,useId} from 'vue';
const props=defineProps({context:{type:Object,default:null},modelValue:{type:Object,default:null},phone:{type:String,default:''},showSave:Boolean,busy:Boolean});
const emit=defineEmits(['update:modelValue','save']);const id=useId();
const choice=reactive({channel:props.modelValue?.channel||props.context?.channel||'email',phone:props.modelValue?.phone||props.context?.phone||props.phone||'',signerName:'',authorityAccepted:false,electronicSignatureAccepted:false,disclosureHash:props.context?.disclosureHash,...props.modelValue});
watch(()=>props.context,c=>{choice.disclosureHash=c?.disclosureHash;choice.authorityAccepted=false;choice.electronicSignatureAccepted=false;});
watch(()=>props.phone,(p,old)=>{if(!choice.phone||choice.phone===old)choice.phone=p;});
watch(()=>choice.phone,()=>{choice.authorityAccepted=false;choice.electronicSignatureAccepted=false;});
watch(choice,c=>emit('update:modelValue',{...c}),{deep:true,immediate:true});
const valid=computed(()=>choice.channel==='email'||(props.context?.available&&choice.phone.trim()&&choice.signerName.trim()&&choice.authorityAccepted&&choice.electronicSignatureAccepted));
</script>
<style scoped>
.hiring-choices{padding:20px;border:1px solid #cbd5d1;border-radius:12px;line-height:1.6}fieldset{border:0;padding:0;min-width:0}label{display:block;margin:12px 0}input:not([type=radio]):not([type=checkbox]){display:block;box-sizing:border-box;width:100%;max-width:480px;padding:10px;font:inherit;border:1px solid #94a39d;border-radius:6px}button{padding:12px;border:0;border-radius:6px;background:#17624b;color:white;font:inherit}
</style>
