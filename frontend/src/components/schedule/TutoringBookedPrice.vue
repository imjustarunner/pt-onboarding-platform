<template>
 <section v-if="quote" aria-label="Saved tutoring session price">
  <p>{{ quote.label || 'Saved appointment price' }}: {{ quote.packageCovered ? 'Package credit' : amount }}</p>
  <button v-if="[453,454].includes(agencyId)" type="button" :disabled="busy" @click="reconcile">{{ busy ? 'Reconciling…' : 'Reconcile QA tutoring balance' }}</button>
  <p v-if="message" role="status">{{message}}</p>
 </section>
</template>
<script setup>
import {ref,computed,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({appointmentId:{type:Number,required:true}});
const quote=ref(null),agencyId=ref(0),busy=ref(false),message=ref('');let generation=0;
const amount=computed(()=>new Intl.NumberFormat('en-US',{style:'currency',currency:quote.value?.currency||'USD'}).format(Number(quote.value?.total||0)/100));
watch(()=>props.appointmentId,async id=>{const current=++generation;quote.value=null;agencyId.value=0;message.value='';if(!Number.isSafeInteger(id)||id<=0)return;
 try{const {data}=await api.get(`/appointments/${id}`,{skipGlobalLoading:true});if(current!==generation)return;const a=data.appointment;if(a?.businessType==='tutoring'&&a.customerQuote){quote.value=a.customerQuote;agencyId.value=Number(a.agencyId);}}catch{ /* The server controls whether this account can see customer prices. */ }
},{immediate:true});
async function reconcile(){if(busy.value)return;const id=props.appointmentId;busy.value=true;message.value='';try{const {data}=await api.post(`/appointments/${id}/qa-billing-reconcile`,{},{skipGlobalLoading:true});if(id!==props.appointmentId)return;message.value=data.holdReason==='payer_assignment'?'The QA balance needs a payer. Assign the responsible payer in family billing, then review its simulated payment.':data.status==='review'?`The QA balance is still held for ${data.holdReason||'office review'}. Open family billing to resolve that hold.`:'QA balance reconciled. Refresh family billing to review its simulated payment.';}catch(e){if(id===props.appointmentId)message.value=e.response?.data?.error?.message||'Could not confirm the reconciliation. Refresh family billing before trying again.';}finally{busy.value=false;}}
</script>
