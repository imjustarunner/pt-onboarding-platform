<template>
  <section v-if="!hasMedicaidCoverage(insuranceInfo) && !eligible" class="school-payment">
    <button type="button" class="btn btn-secondary" @click="confirmCoverage">{{ tx('Confirm primary and any secondary coverage') }}</button>
    <p v-if="reviewError" role="alert">{{ tx(reviewError) }}</p>
  </section>
  <section v-else-if="eligible" class="school-payment" aria-labelledby="school-payment-heading">
    <h3 id="school-payment-heading">{{ tx('Payment method') }}</h3>
    <p>{{ tx('You can save a card now or add one later in your portal. Saving a card does not charge it.') }}</p>
    <p v-if="loading" role="status">{{ tx('Checking secure card availability…') }}</p>
    <div class="school-payment__choices">
      <button v-if="available" type="button" class="btn btn-secondary" :aria-pressed="choice === 'add_card'" @click="choose('add_card')">{{ tx('Add card now') }}</button>
      <button type="button" class="btn btn-secondary" :aria-pressed="choice === 'later'" @click="choose('later')">{{ tx('Add card later') }}</button>
    </div>
    <p v-if="!loading && !available">{{ tx('Card collection is unavailable right now. You can continue enrollment and arrange payment with the office later.') }}</p>
    <PublicIntakePaymentStep v-if="available && choice === 'add_card'" :public-key="publicKey" :submission-id="submissionId" :model-value="modelValue" :insurance-info="insuranceInfo" :collection-allowed="eligible" :step-config="{ paymentRequired: false }" @update:model-value="$emit('update:modelValue', { ...$event, paymentChoice: 'add_card' })" @card-saved="$emit('card-saved', $event)" @skip-acknowledged="choose('later')" />
    <p v-if="choice === 'later'">{{ tx('No card will be saved now. Add one in your portal before paid services begin, or contact the office about payment arrangements.') }}</p>
  </section>
</template>
<script setup>
import { computed, watch, ref } from 'vue';
import { hasMedicaidCoverage } from '../../utils/insurancePaymentPolicy.js';
import api from '../../services/api';
import { useIntakeStepTx } from '../../composables/useIntakeStepTx.js';
import PublicIntakePaymentStep from './PublicIntakePaymentStep.vue';
const props = defineProps({ publicKey: String, submissionId: [Number, String], modelValue: { type: Object, default: () => ({}) }, insuranceInfo: { type: Object, required: true } });
const emit = defineEmits(['update:modelValue', 'card-saved']);
const { tx } = useIntakeStepTx();
const loading = ref(true), available = ref(false);
const choice = computed(() => props.modelValue.paymentChoice || '');
const fingerprint = computed(() => JSON.stringify(props.insuranceInfo));
const reviewed = ref(null), reviewError = ref('');
const eligible = computed(() => !hasMedicaidCoverage(props.insuranceInfo) &&
  (props.insuranceInfo.isSelfPay === true || reviewed.value === fingerprint.value));
watch(fingerprint, () => { reviewed.value = null; reviewError.value = ''; });
function confirmCoverage() {
  const info = props.insuranceInfo;
  if (!String(info.primary?.insurerName || '').trim() || (info.hasSecondary && !String(info.secondary?.insurerName || '').trim())) {
    reviewError.value = 'Enter the insurer for your primary and any secondary coverage before confirming.';
    return;
  }
  reviewed.value = fingerprint.value;
  reviewError.value = '';
}
function choose(paymentChoice) {
  emit('update:modelValue', { ...props.modelValue, paymentChoice, skipAcknowledged: paymentChoice === 'later', requiresPaymentFollowup: paymentChoice === 'later' });
}
let requestGeneration = 0;
watch(eligible, async enabled => {
  const generation = ++requestGeneration;
  available.value = false;
  loading.value = enabled;
  if (!enabled) return;
  try {
    const { data } = await api.get(`/public-intake/${encodeURIComponent(props.publicKey)}/stripe-config`, { skipGlobalLoading: true });
    if (generation === requestGeneration) available.value = data?.stripeEnabled !== false && Boolean(data?.publishableKey && data?.connectedAccountId);
  } catch { if (generation === requestGeneration) available.value = false; }
  finally { if (generation === requestGeneration) loading.value = false; }
}, { immediate: true });
</script>
<style scoped>
.school-payment { display: grid; gap: 12px; margin-top: 24px; }
.school-payment__choices { display: flex; flex-wrap: wrap; gap: 12px; }
p, h3 { margin: 0; }
button[aria-pressed="true"] { outline: 2px solid currentColor; }
</style>
