<template>
  <p v-if="policy && isSelf" class="policyholder-help">Self coverage uses the client’s date of birth from Patient info.</p>
  <div v-else-if="policy?.relationshipToSubscriber" class="policyholder-review" :class="{'policyholder-needed':!birthDate}">
    <label>{{ position === 'primary' ? 'Primary' : 'Secondary' }} policyholder date of birth
      <input type="date" :value="birthDate" :disabled="disabled" @change="updateDate($event.target.value)" />
    </label>
    <p v-if="!birthDate">Enter the date of birth of the person who holds this policy. If it’s unavailable, Billing can follow up.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { parseChartInsurance } from '../../../navigation/chartPasteParser.js';
import { policyIsMedicaid } from '../../../navigation/insurancePaymentPolicy.js';

const props = defineProps({ text:String, position:String, disabled:Boolean });
const emit = defineEmits(['update']);
const policy = computed(() => {
  if (!props.text?.trim()) return null;
  try { return parseChartInsurance(props.text, { position:props.position })[props.position]; } catch { return null; }
});
const isSelf = computed(() => policy.value?.relationshipToSubscriber === 'self' || policyIsMedicaid(policy.value));
const birthDate = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(policy.value?.subscriberDob || '') ? policy.value.subscriberDob : '');
function updateDate(value) {
  const text = props.text.replace(/^[ \t]*Subscriber (?:DOB|Date of Birth)[:\t][^\n]*$/gmi, '').trimEnd();
  emit('update', value ? `${text}\nSubscriber DOB:\t${value}` : text);
}
</script>

<style scoped>
.policyholder-review{border:1px solid #d5e1ed;border-radius:8px;padding:10px;margin-top:8px}.policyholder-review label{display:grid;gap:6px;max-width:24rem}.policyholder-needed{background:#fff7e4;border-color:#c49436}.policyholder-review p,.policyholder-help{font-size:.9rem;margin:6px 0 0}
</style>
