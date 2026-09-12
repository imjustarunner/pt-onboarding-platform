<template>
  <section class="secure-card">
    <p>Card details go directly to Stripe. Your selected clients and other guardians cannot view your card.</p>
    <p v-if="loading" role="status">Preparing secure card form…</p>
    <template v-else-if="ready && !saved">
      <label>Cardholder name <input v-model="name" autocomplete="cc-name" maxlength="255" /></label>
      <div ref="cardHost" class="card-host" />
      <details open><summary>Card storage and billing authorization</summary><p>{{ terms }}</p></details>
      <label class="check"><input v-model="accepted" type="checkbox" /> I have read and accept this authorization to store my card.</label>
      <p>Saving a card does not enable recurring charges. You authorize recurring billing separately for each client in Billing.</p>
      <button type="button" class="btn btn-primary" :disabled="busy || !accepted || !name.trim() || !complete" @click="save">{{ busy ? 'Saving…' : 'Save card securely' }}</button>
    </template>
    <p v-if="saved" role="status">{{ saved }}</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <button v-if="!loading && !ready" type="button" class="btn btn-secondary" @click="initialize">Retry secure card setup</button>
  </section>
</template>
<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount, inject } from 'vue';
import { loadStripe } from '@stripe/stripe-js';
import api from '../../services/api';
const props = defineProps({ agencyId: [String, Number], publicKey: String, submissionId: [String, Number] });
const emit = defineEmits(['saved', 'unavailable']);
const intakeSession = inject('intakeSessionToken', ref(''));
const cardHost = ref(null), loading = ref(true), ready = ref(false), busy = ref(false), error = ref(''), name = ref(''), accepted = ref(false), complete = ref(false), saved = ref(''), terms = ref('');
let stripe, card, clientSecret, termsVersion, disposed = false;
const intake = () => !!props.publicKey;
const requestOptions = () => intake() ? { headers: { 'x-intake-session': intakeSession.value } } : {};
async function initialize() {
  loading.value = true; ready.value = false; error.value = '';
  try {
    const cfg = intake() ? (await api.get(`/public-intake/${props.publicKey}/stripe-config`)).data : (await api.get('/guardian-billing/overview', { params: { agencyId: props.agencyId } })).data.stripe;
    if (!cfg?.publishableKey || !cfg?.connectedAccountId) { emit('unavailable'); throw new Error('Card collection is not available for this organization yet. Please contact the office about payment arrangements.'); }
    const setup = await api.post(intake() ? `/public-intake/${props.publicKey}/${props.submissionId}/stripe-setup-intent` : '/guardian-billing/card-setup', intake() ? {} : { agencyId: props.agencyId }, requestOptions());
    clientSecret = setup.data.clientSecret; terms.value = setup.data.terms; termsVersion = setup.data.termsVersion;
    stripe = await loadStripe(cfg.publishableKey, { stripeAccount: setup.data.connectedAccountId });
    if (disposed) return;
    ready.value = true; loading.value = false;
    await nextTick();
    card?.destroy();
    card = stripe.elements().create('card', { hidePostalCode: false });
    card.mount(cardHost.value);
    card.on('change', event => { complete.value = event.complete; error.value = event.error?.message || ''; });
  } catch (e) { ready.value = false; error.value = e.response?.data?.error?.message || e.message || 'Secure card setup failed'; }
  finally { loading.value = false; }
}
async function save() {
  if (busy.value || !accepted.value || !name.value.trim() || !complete.value) return;
  busy.value = true; error.value = '';
  try {
    const result = await stripe.confirmCardSetup(clientSecret, { payment_method: { card, billing_details: { name: name.value.trim() } } });
    if (disposed) return;
    if (result.error) throw new Error(result.error.message);
    const payload = { agencyId: props.agencyId, setupIntentId: result.setupIntent.id, consent: { accepted: true, version: termsVersion, signatureName: name.value.trim() } };
    const response = await api.post(intake() ? `/public-intake/${props.publicKey}/${props.submissionId}/payment-card` : '/guardian-billing/card-setup/complete', payload, requestOptions());
    if (disposed) return;
    const value = response.data.card || { id: response.data.cardId, card_brand: response.data.brand, card_last4: response.data.last4 };
    saved.value = `${value.card_brand} ending in ${value.card_last4} saved.`;
    emit('saved', value);
  } catch (e) { error.value = e.response?.data?.error?.message || e.message || 'Card could not be saved'; }
  finally { busy.value = false; }
}
onMounted(initialize);
onBeforeUnmount(() => { disposed = true; card?.destroy(); });
</script>
<style scoped>
.secure-card { display:grid; gap:14px; max-width:700px; } label { display:grid; gap:6px; } input:not([type=checkbox]) { padding:10px; border:1px solid #94a3b8; border-radius:6px; } .check { display:flex; align-items:flex-start; gap:10px; } .card-host { padding:16px; border:1px solid #94a3b8; border-radius:8px; min-height:52px; background:white; } p { margin:0; line-height:1.5; } details { padding:12px; background:#f1f5f9; border-radius:8px; } details p { padding-top:10px; } .error { color:#b91c1c; }
</style>
