<template>
  <form @submit.prevent="submit" class="sms-consent-form">
    <h1>{{ disclosure.brandName }} text messaging choices</h1>
    <p>{{ disclosure.legalName }} · Support: {{ disclosure.supportContact }}</p>
    <p v-if="example" class="example">Example for review only. This page does not enroll anyone or send messages. All choices start unselected.</p>
    <p>{{ disclosure.text }}</p>
    <p><a :href="disclosure.termsUrl" target="_blank" rel="noopener noreferrer">SMS terms</a> · <a :href="disclosure.privacyUrl" target="_blank" rel="noopener noreferrer">Privacy policy</a></p>
    <p v-if="phoneLastFour">This request is for the phone ending in {{ phoneLastFour }}.</p>
    <fieldset v-for="item in disclosure.purposes" :key="item.purpose">
      <legend>{{ item.label }}</legend>
      <label><input v-model="choices[item.purpose]" type="radio" :name="`sms-${item.purpose}`" value="yes" required /> Yes, I opt in to these messages from {{ disclosure.brandName }}.</label>
      <label><input v-model="choices[item.purpose]" type="radio" :name="`sms-${item.purpose}`" value="no" required /> No, I opt out of these messages.</label>
      <p>Select Yes or No. A choice is required.</p>
      <p v-if="item.purpose === 'marketing'">This is a separate marketing choice. It is optional and is not a condition of care or purchase.</p>
    </fieldset>
    <label>Phone number covered by these choices<input v-model="phone" type="tel" autocomplete="tel" required /></label>
    <label>Your full name (electronic signature)<input v-model="signerName" autocomplete="name" maxlength="200" required /></label>
    <p v-if="signerRole">Signing as: {{ signerRole === 'guardian' ? 'authorized guardian' : signerRole === 'staff' ? 'staff recipient' : 'client recipient' }}.</p>
    <label><input v-model="authorityAccepted" type="checkbox" required /> I control this phone number and am authorized to make these choices as the recipient or authorized guardian.</label>
    <label><input v-model="electronicSignatureAccepted" type="checkbox" required /> {{ disclosure.signatureText }}</label>
    <p>Disclosure version {{ disclosure.version }}. Choose Yes or No for every message type before signing. You may choose No for all types.</p>
    <p v-if="choiceError" role="alert">Choose Yes or No for every message type before signing.</p>
    <button type="submit" :disabled="busy || example">{{ example ? 'Example — signing disabled' : busy ? 'Saving signature…' : 'Sign my choices' }}</button>
  </form>
</template>

<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ disclosure: { type: Object, required: true }, disclosureHash: String, phoneLastFour: String, signerRole: String, example: Boolean, busy: Boolean });
const emit = defineEmits(['sign']);
const choiceError = ref(false);
const choices = ref({}), phone = ref(''), signerName = ref(''), authorityAccepted = ref(false), electronicSignatureAccepted = ref(false);
watch(() => props.disclosure, () => { choices.value = Object.fromEntries(props.disclosure.purposes.map((p) => [p.purpose, null])); choiceError.value = false; authorityAccepted.value = false; electronicSignatureAccepted.value = false; }, { immediate: true });
function submit() {
  if (props.example || props.busy) return;
  choiceError.value = props.disclosure.purposes.some((p) => !['yes', 'no'].includes(choices.value[p.purpose]));
  if (choiceError.value) return;
  emit('sign', { choices: { ...choices.value }, phone: phone.value, signerName: signerName.value,
    authorityAccepted: authorityAccepted.value, electronicSignatureAccepted: electronicSignatureAccepted.value, disclosureHash: props.disclosureHash });
}
</script>

<style scoped>
.sms-consent-form { max-width: 760px; margin: 32px auto; padding: 24px; background: white; color: #173b40; line-height: 1.65; border-radius: 12px; }
fieldset { margin: 24px 0; padding: 16px; border: 1px solid #b3c6c5; }
legend { font-weight: 650; }
label { display: block; margin: 12px 0; }
input:not([type=radio]):not([type=checkbox]) { box-sizing: border-box; display: block; width: 100%; padding: 10px; border: 1px solid #8aa4a4; border-radius: 6px; }
.example { background: #fff3d4; padding: 16px; }
button { padding: 12px 20px; background: #173b40; color: white; border: 0; border-radius: 6px; }
button:disabled { opacity: .65; }
</style>
