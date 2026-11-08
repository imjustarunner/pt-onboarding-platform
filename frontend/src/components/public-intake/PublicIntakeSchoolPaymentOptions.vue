<template>
  <section class="school-payment" aria-labelledby="school-payment-heading">
    <h3 id="school-payment-heading">{{ tx('Payment method') }}</h3>
    <p>{{ tx('You can save a card now or add one later in your portal. Saving a card does not charge it.') }}</p>
    <p v-if="loading" role="status">{{ tx('Checking secure card availability…') }}</p>
    <div class="school-payment__choices">
      <button v-if="available" type="button" class="btn btn-secondary" :aria-pressed="choice === 'add_card'" @click="choose('add_card')">{{ tx('Add card now') }}</button>
      <button type="button" class="btn btn-secondary" :aria-pressed="choice === 'later'" @click="choose('later')">{{ tx('Add card later') }}</button>
    </div>
    <p v-if="!loading && !available">{{ tx('Card collection is unavailable right now. You can continue enrollment and arrange payment with the office later.') }}</p>
    <PublicIntakePaymentStep v-if="available && choice === 'add_card'" :public-key="publicKey" :submission-id="submissionId" :model-value="modelValue" :step-config="{ paymentRequired: false }" @update:model-value="$emit('update:modelValue', { ...$event, paymentChoice: 'add_card' })" @card-saved="$emit('card-saved', $event)" @skip-acknowledged="choose('later')" />
    <p v-if="choice === 'later'">{{ tx('No card will be saved now. Add one in your portal before paid services begin, or contact the office about payment arrangements.') }}</p>
  </section>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useIntakeStepTx } from '../../composables/useIntakeStepTx.js';
import PublicIntakePaymentStep from './PublicIntakePaymentStep.vue';
const props = defineProps({ publicKey: String, submissionId: [Number, String], modelValue: { type: Object, default: () => ({}) } });
const emit = defineEmits(['update:modelValue', 'card-saved']);
const { tx } = useIntakeStepTx();
const loading = ref(true), available = ref(false);
const choice = computed(() => props.modelValue.paymentChoice || '');
function choose(paymentChoice) {
  emit('update:modelValue', { ...props.modelValue, paymentChoice, skipAcknowledged: paymentChoice === 'later', requiresPaymentFollowup: paymentChoice === 'later' });
}
onMounted(async () => {
  try {
    const { data } = await api.get(`/public-intake/${encodeURIComponent(props.publicKey)}/stripe-config`, { skipGlobalLoading: true });
    available.value = data?.stripeEnabled !== false && Boolean(data?.publishableKey && data?.connectedAccountId);
  } catch { available.value = false; }
  finally { loading.value = false; }
});
</script>
<style scoped>
.school-payment { display: grid; gap: 12px; margin-top: 24px; }
.school-payment__choices { display: flex; flex-wrap: wrap; gap: 12px; }
p, h3 { margin: 0; }
button[aria-pressed="true"] { outline: 2px solid currentColor; }
</style>
