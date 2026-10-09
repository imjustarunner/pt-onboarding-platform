<template>
  <form @submit.prevent="submit" class="sms-consent-form">
    <ConversaEnrollmentHeader heading="h1" title="Your messages. Your choice." :organization-name="disclosure.brandName"
      description="Choose the texts you want to receive, review the details, and sign your preferences."
      :status="example ? 'Preview only' : 'Review & sign'" />
    <div class="consent-body">
    <div class="organization-card"><ConversaIcon type="email" :size="21" /><div><span class="detail-label">Messages from</span><strong>{{ disclosure.brandName }}</strong><span>{{ disclosure.legalName }} · Support: {{ disclosure.supportContact }}</span></div></div>
    <p v-if="example" class="example">Example for review only. This page does not enroll anyone or send messages. All choices start unselected.</p>
    <section class="disclosure-details" aria-label="Text messaging disclosure"><h2>Before you choose</h2><p>{{ disclosure.text }}</p></section>
    <p><a :href="disclosure.termsUrl" target="_blank" rel="noopener noreferrer">SMS terms</a> · <a :href="disclosure.privacyUrl" target="_blank" rel="noopener noreferrer">Privacy policy</a></p>
    <p v-if="phoneLastFour">This request is for the phone ending in {{ phoneLastFour }}.</p>
    <div class="consent-section-heading"><span class="section-number">01</span><div><h2>Choose your message types</h2><p>Every choice is yours. You may select No for every type.</p></div></div>
    <fieldset v-for="item in disclosure.purposes" :key="item.purpose">
      <legend>{{ item.label }}</legend>
      <label class="consent-option"><input v-model="choices[item.purpose]" type="radio" :name="`sms-${item.purpose}`" value="yes" required /> Yes, I opt in to these messages from {{ disclosure.brandName }}.</label>
      <label class="consent-option"><input v-model="choices[item.purpose]" type="radio" :name="`sms-${item.purpose}`" value="no" required /> No, I opt out of these messages.</label>
      <p>Select Yes or No. A choice is required.</p>
      <p v-if="item.purpose === 'marketing'">This is a separate marketing choice. It is optional and is not a condition of care or purchase.</p>
    </fieldset>
    <div class="consent-section-heading signature-heading"><span class="section-number">02</span><div><h2>Confirm &amp; sign</h2><p>Your signature records the choices you made above.</p></div></div>
    <label>Phone number covered by these choices<input v-model="phone" type="tel" autocomplete="tel" required /></label>
    <label>Your full name (electronic signature)<input v-model="signerName" autocomplete="name" maxlength="200" required /></label>
    <p v-if="signerRole">Signing as: {{ signerRole === 'guardian' ? 'authorized guardian' : signerRole === 'staff' ? 'staff recipient' : 'client recipient' }}.</p>
    <label><input v-model="authorityAccepted" type="checkbox" required /> I control this phone number and am authorized to make these choices as the recipient or authorized guardian.</label>
    <label><input v-model="electronicSignatureAccepted" type="checkbox" required /> {{ disclosure.signatureText }}</label>
    <p>Disclosure version {{ disclosure.version }}. Choose Yes or No for every message type before signing. You may choose No for all types.</p>
    <p v-if="choiceError" role="alert">Choose Yes or No for every message type before signing.</p>
    <button class="consent-submit" type="submit" :disabled="busy || example">{{ example ? 'Example — signing disabled' : busy ? 'Saving signature…' : 'Sign my choices' }}</button>
    <p class="consent-footer">Conversa manages messaging for {{ disclosure.brandName }}. Your organization reviews signed choices before activating selected text subscriptions.</p>
    </div>
  </form>
</template>

<script setup>
import { ref, watch } from 'vue';
import ConversaEnrollmentHeader from '../conversa/ConversaEnrollmentHeader.vue';
import ConversaIcon from '../conversa/ConversaIcon.vue';
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
.sms-consent-form{max-width:760px;margin:0 auto;background:#fff;color:#233653;line-height:1.65;border:1px solid #d6e1ef;border-radius:18px;overflow:hidden;box-shadow:0 16px 60px #122e5b10}.consent-body{padding:28px 32px}.organization-card{display:flex;align-items:center;gap:13px;border:1px solid #e1e8f2;border-radius:11px;padding:16px 18px;background:#fbfcfe}.organization-card>div{display:grid;gap:2px;min-width:0}.organization-card strong{font-size:15px}.organization-card span{font-size:12px;color:#61738c;overflow-wrap:anywhere}.organization-card .detail-label{text-transform:uppercase;font-size:9px;letter-spacing:.12em;font-weight:700}.disclosure-details{font-size:13px;color:#536680;margin-top:24px}.disclosure-details h2{font-size:14px;color:#233653;margin:0 0 8px}.consent-body a{color:#1559ae;text-underline-offset:3px;font-size:13px}.consent-section-heading{display:flex;gap:12px;align-items:flex-start;margin:30px 0 17px}.consent-section-heading h2{font-size:18px;letter-spacing:-.025em;line-height:1.3;margin:0}.consent-section-heading p{font-size:12px;color:#61738c;margin:5px 0 0}.section-number{display:grid;place-items:center;flex:0 0 31px;height:31px;border-radius:9px;background:#edf3fc;color:#275187;font-size:11px;font-weight:700}fieldset{margin:19px 0;padding:17px 18px 12px;border:1px solid #d6e1ee;border-radius:12px;min-width:0}legend{font-size:14px;font-weight:650;padding:0 6px}label{display:block;margin:12px 0;font-size:13px}.consent-option{display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:12px;border:1px solid #e0e7f1;border-radius:8px}.consent-option:has(input:checked){border-color:#668ec2;background:#f2f7fe}.consent-option input{margin:3px 0 0;flex-shrink:0}fieldset p{font-size:11px;color:#61738c;margin:10px 0}.signature-heading{border-top:1px solid #e1e8f2;padding-top:25px}input{accent-color:#155abb}input[type=radio],input[type=checkbox]{width:17px;height:17px;vertical-align:middle}input:not([type=radio]):not([type=checkbox]){box-sizing:border-box;display:block;width:100%;padding:12px;border:1px solid #b9cbe1;border-radius:8px;margin-top:7px;font:inherit}.example{background:#fff7e6;color:#70571f;padding:14px 16px;border-radius:8px;font-size:13px}.consent-body>p{font-size:12px}.consent-submit{padding:13px 22px;background:#0f3977;color:white;border:0;border-radius:9px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px #143d7620}button:disabled{opacity:.6;cursor:not-allowed}:is(input,button,a):focus-visible{outline:3px solid #6d9ed6;outline-offset:3px}.consent-body .consent-footer{border-top:1px solid #e1e8f2;padding-top:17px;margin-top:23px;color:#61738c;font-size:11px}[role=alert]{color:#a12d34}@media(max-width:560px){.consent-body{padding:22px 20px}fieldset{padding:12px}.consent-submit{width:100%}}
</style>
