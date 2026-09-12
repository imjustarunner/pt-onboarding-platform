<template>
  <div class="pi-pay">
    <p v-if="costDisplay || stepConfig.costDisclosureText">{{ costDisplay || stepConfig.costDisclosureText }}</p>
    <SecureCardSetup :public-key="publicKey" :submission-id="submissionId" @saved="onSaved" @unavailable="unavailable = true" />
    <div v-if="stepConfig.paymentRequired === false || unavailable" class="payment-followup">
      <p v-if="unavailable">Secure card collection is not enabled yet. Your account will need payment follow-up before paid services.</p>
      <button type="button" class="btn btn-secondary" @click="defer">Continue with payment follow-up</button>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue';
import SecureCardSetup from '../billing/SecureCardSetup.vue';
const props = defineProps({ modelValue: { type:Object, default:()=>({}) }, stepConfig: { type:Object, default:()=>({}) }, publicKey:String, submissionId:[String,Number], costDisplay:String });
const emit = defineEmits(['update:modelValue','card-saved','skip-acknowledged']);
const unavailable = ref(false);
function onSaved(card) {
  const value = { cardSaved:true, cardId:card.id, cardSummary:`${card.card_brand} ending in ${card.card_last4}`, brand:card.card_brand, last4:card.card_last4, autoCharge:false, skipAcknowledged:false };
  emit('update:modelValue',value); emit('card-saved',value);
}
function defer() { emit('update:modelValue',{ cardSaved:false, skipAcknowledged:true, requiresPaymentFollowup:true }); emit('skip-acknowledged'); }
</script>
<style scoped>.pi-pay { display:grid; gap:16px; } .payment-followup { padding:14px; border:1px solid #cbd5e1; border-radius:8px; }</style>
