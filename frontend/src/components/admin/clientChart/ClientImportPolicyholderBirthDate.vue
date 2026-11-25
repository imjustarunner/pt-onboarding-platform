<template>
  <div v-if="policy" class="policyholder-review" :class="{'policyholder-needed':!relationship || (!isSelf && !birthDate)}">
    <label>Client’s relationship to the {{ position }} subscriber
      <select :value="relationship" :disabled="disabled || isMedicaid" @change="updateRelationship($event.target.value)">
        <option value="" disabled>Choose if you know who holds the policy</option>
        <option value="self">Self — the client holds this policy</option>
        <option value="child">Child of the subscriber</option>
        <option value="spouse">Spouse of the subscriber</option>
        <option value="other">Other</option>
      </select>
    </label>
    <p v-if="isSelf">Self coverage uses the client’s saved name, birth date and address from Patient info.</p>
    <template v-else-if="relationship">
      <label>{{ position === 'primary' ? 'Primary' : 'Secondary' }} policyholder date of birth
        <input type="date" :value="birthDate" :disabled="disabled" @change="updateDate($event.target.value)" />
      </label>
      <p v-if="!birthDate">Enter the date of birth of the person who holds this policy. If it’s unavailable, Billing can follow up.</p>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { normalizeImportedSubscriberRelationship, parseChartInsurance } from '../../../navigation/chartPasteParser.js';
import { policyIsMedicaid } from '../../../navigation/insurancePaymentPolicy.js';

const props = defineProps({ text:String, position:String, disabled:Boolean });
const emit = defineEmits(['update']);
const policy = computed(() => {
  if (!props.text?.trim()) return null;
  try { return parseChartInsurance(props.text, { position:props.position })[props.position]; } catch { return null; }
});
const isMedicaid = computed(() => policyIsMedicaid(policy.value));
const relationship = computed(() => isMedicaid.value ? 'self' : normalizeImportedSubscriberRelationship(policy.value?.relationshipToSubscriber));
const isSelf = computed(() => relationship.value === 'self');
function updateRelationship(value) {
  const text = props.text.replace(/^[ \t]*Relationship to Subscriber:\t[^\n]*$/gmi, '').trimEnd();
  emit('update', `${text}\nRelationship to Subscriber:\t${value}`);
}
const birthDate = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(policy.value?.subscriberDob || '') ? policy.value.subscriberDob : '');
function updateDate(value) {
  const text = props.text.replace(/^[ \t]*Subscriber (?:DOB|Date of Birth)[:\t][^\n]*$/gmi, '').trimEnd();
  emit('update', value ? `${text}\nSubscriber DOB:\t${value}` : text);
}
</script>

<style scoped>
.policyholder-review{border:1px solid #d5e1ed;border-radius:8px;padding:10px;margin-top:8px}.policyholder-review label{display:grid;gap:6px;max-width:24rem}.policyholder-needed{background:#fff7e4;border-color:#c49436}.policyholder-review p{font-size:.9rem;margin:6px 0 0}
</style>
