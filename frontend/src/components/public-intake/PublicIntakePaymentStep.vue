<template>
  <div class="pi-pay">
    <!-- Cost disclosure -->
    <div v-if="costDisclosure" class="pi-pay-disclosure">
      <p>{{ costDisclosure }}</p>
    </div>

    <!-- Cost summary from event config -->
    <div v-if="costSummary" class="pi-pay-cost-summary">
      <strong>Program cost</strong>
      <span class="pi-pay-amount">{{ costSummary }}</span>
    </div>

    <!-- Payment method notice -->
    <div class="pi-pay-notice">
      <p v-if="stripeEnabled">
        Your payment information is collected securely by <strong>Stripe</strong> — a PCI-compliant
        payment processor trusted by millions of businesses. Your card details are encrypted and
        processed directly by this organization's payment account. They are never stored unmasked
        on any server.
      </p>
      <p v-else>
        Your payment information is stored securely via QuickBooks Payments (Intuit). Card details are
        encrypted and never stored unmasked on our servers.
      </p>
      <p style="margin-top: 8px;">
        You may update or remove your payment method at any time through your guardian portal.
      </p>
    </div>

    <!-- Card form -->
    <div v-if="!paymentSaved" class="pi-pay-card">
      <h4 class="pi-pay-card-title">Payment method</h4>

      <!-- Loading Stripe -->
      <div v-if="stripeLoading" class="pi-pay-loading">
        <span class="pi-pay-spinner" /> Preparing secure card form…
      </div>

      <!-- Stripe Elements form -->
      <template v-else-if="stripeEnabled">
        <div class="pi-pay-row">
          <div class="form-group" style="grid-column: 1 / -1;">
            <label class="pi-pay-lbl">Cardholder name <span class="req">*</span></label>
            <input
              v-model="cardholderName"
              class="pi-pay-input"
              type="text"
              placeholder="Name as it appears on card"
              autocomplete="cc-name"
            />
          </div>
        </div>

        <!-- Stripe Card Element mounts here -->
        <div class="form-group" style="margin-bottom: 12px;">
          <label class="pi-pay-lbl">Card details <span class="req">*</span></label>
          <div id="stripe-card-element" class="pi-pay-stripe-element" />
          <div v-if="stripeElementError" class="pi-pay-error" style="margin-top: 6px;">
            {{ stripeElementError }}
          </div>
        </div>

        <div v-if="formError" class="pi-pay-error">{{ formError }}</div>

        <div class="pi-pay-billing-pref">
          <label class="checkbox-row">
            <input v-model="autoCharge" type="checkbox" />
            <span>Automatically charge this card at the start of each session (recommended)</span>
          </label>
          <p class="pi-pay-pref-hint">
            If not checked, a <strong>Pay &amp; Join</strong> step will appear each time before entering a session.
          </p>
        </div>

        <div class="pi-pay-cta">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="saving || !cardholderName.trim()"
            @click="saveStripeCard"
          >
            <span v-if="saving" class="pi-pay-spinner pi-pay-spinner--btn" />
            {{ saving ? 'Saving securely…' : 'Save payment method' }}
          </button>
        </div>
      </template>

      <!-- Legacy QB Payments fallback form -->
      <template v-else>
        <div class="pi-pay-row">
          <div class="form-group" style="grid-column: 1 / -1;">
            <label class="pi-pay-lbl">Cardholder name <span class="req">*</span></label>
            <input v-model="card.name" class="pi-pay-input" type="text" placeholder="Name as it appears on card" autocomplete="cc-name" />
          </div>
        </div>

        <div class="pi-pay-row">
          <div class="form-group" style="grid-column: 1 / -1;">
            <label class="pi-pay-lbl">Card number <span class="req">*</span></label>
            <input
              v-model="card.number"
              class="pi-pay-input pi-pay-input--card"
              type="text"
              inputmode="numeric"
              maxlength="19"
              placeholder="•••• •••• •••• ••••"
              autocomplete="cc-number"
              @input="formatCardNumber"
            />
          </div>
        </div>

        <div class="pi-pay-row pi-pay-row--3col">
          <div class="form-group">
            <label class="pi-pay-lbl">Expiry month <span class="req">*</span></label>
            <select v-model="card.expMonth" class="pi-pay-input" autocomplete="cc-exp-month">
              <option value="">MM</option>
              <option v-for="m in 12" :key="m" :value="String(m).padStart(2,'0')">{{ String(m).padStart(2,'0') }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="pi-pay-lbl">Expiry year <span class="req">*</span></label>
            <select v-model="card.expYear" class="pi-pay-input" autocomplete="cc-exp-year">
              <option value="">YYYY</option>
              <option v-for="yr in expiryYears" :key="yr" :value="String(yr)">{{ yr }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="pi-pay-lbl">CVV <span class="req">*</span></label>
            <input v-model="card.cvc" class="pi-pay-input" type="text" inputmode="numeric" maxlength="4" placeholder="•••" autocomplete="cc-csc" />
          </div>
        </div>

        <div class="pi-pay-row">
          <div class="form-group">
            <label class="pi-pay-lbl">Billing ZIP code</label>
            <input v-model="card.billingZip" class="pi-pay-input" type="text" inputmode="numeric" maxlength="5" placeholder="80202" autocomplete="postal-code" />
          </div>
        </div>

        <div v-if="formError" class="pi-pay-error">{{ formError }}</div>

        <div class="pi-pay-billing-pref">
          <label class="checkbox-row">
            <input v-model="autoCharge" type="checkbox" />
            <span>Automatically charge this card at the start of each session (recommended)</span>
          </label>
          <p class="pi-pay-pref-hint">
            If not checked, a <strong>Pay &amp; Join</strong> step will appear each time before entering a session.
          </p>
        </div>

        <div class="pi-pay-cta">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="saving || !isQbCardComplete"
            @click="saveQbCard"
          >
            {{ saving ? 'Saving securely…' : 'Save payment method' }}
          </button>
        </div>
      </template>

      <!-- Skip option (shared) -->
      <div class="pi-pay-skip">
        <label class="checkbox-row">
          <input v-model="skipAcknowledged" type="checkbox" />
          <span>
            I understand I may be asked to provide payment information before sessions for copays, deductibles, or other balances.
          </span>
        </label>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="saving || !skipAcknowledged"
          @click="skipForNow"
        >
          Continue without payment method
        </button>
      </div>
    </div>

    <!-- Saved card confirmation -->
    <div v-else class="pi-pay-saved">
      <div class="pi-pay-saved-icon">✓</div>
      <div>
        <strong>Payment method saved</strong>
        <div class="pi-pay-saved-detail">{{ savedCardSummary }}</div>
        <button type="button" class="pi-pay-change-btn" @click="resetCard">Use a different card</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { loadStripe } from '@stripe/stripe-js';
import api from '../../services/api';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  stepConfig: { type: Object, default: () => ({}) },
  publicKey: { type: String, default: '' },
  submissionId: { type: [Number, String], default: null },
  costDisplay: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue', 'card-saved']);

const costDisclosure = computed(() => String(props.stepConfig?.costDisclosureText || '').trim());
const costSummary = computed(() => String(props.costDisplay || props.stepConfig?.costSummary || '').trim());

// ── Stripe state ────────────────────────────────────────────────────────────
const stripeEnabled = ref(false);
const stripeLoading = ref(true);
const stripeElementError = ref('');
const cardholderName = ref('');
let stripeInstance = null;
let stripeElements = null;
let stripeCardElement = null;
let stripeClientSecret = null;
let stripeCustomerId = null;
let stripeConnectedAccountId = null;

// ── QB Payments fallback state ───────────────────────────────────────────────
const card = ref({ name: '', number: '', expMonth: '', expYear: '', cvc: '', billingZip: '' });
const currentYear = new Date().getFullYear();
const expiryYears = computed(() => Array.from({ length: 12 }, (_, i) => currentYear + i));
const isQbCardComplete = computed(() => {
  const raw = card.value.number.replace(/\s/g, '');
  return (
    card.value.name.trim().length > 0
    && raw.length >= 15
    && card.value.expMonth
    && card.value.expYear
    && card.value.cvc.length >= 3
  );
});

// ── Shared state ────────────────────────────────────────────────────────────
const autoCharge = ref(true);
const saving = ref(false);
const formError = ref('');
const paymentSaved = ref(!!props.modelValue?.cardSaved);
const savedCardSummary = ref(props.modelValue?.cardSummary || '');
const skipAcknowledged = ref(!!props.modelValue?.skipAcknowledged);

// ── Init Stripe on mount ────────────────────────────────────────────────────
onMounted(async () => {
  if (!props.publicKey || !props.submissionId) {
    stripeLoading.value = false;
    return;
  }
  try {
    // Ask backend whether Stripe is configured + get publishable key + connected account
    const configResp = await api.get(`/public-intake/${props.publicKey}/stripe-config`);
    const publishableKey = configResp.data?.publishableKey;
    const connectedAccountId = configResp.data?.connectedAccountId;

    // Stripe is only usable when the agency has an active connected account
    if (!publishableKey || !connectedAccountId) {
      stripeLoading.value = false;
      return;
    }

    stripeEnabled.value = true;
    stripeConnectedAccountId = connectedAccountId;

    // Request a SetupIntent scoped to the connected agency account
    const intentResp = await api.post(
      `/public-intake/${props.publicKey}/${props.submissionId}/stripe-setup-intent`
    );
    stripeClientSecret = intentResp.data?.clientSecret;
    stripeCustomerId = intentResp.data?.customerId;

    // Load Stripe.js scoped to the connected account.
    // This is critical — Elements must be initialized on the connected account
    // so the card is stored there and charges go to the agency's bank.
    stripeInstance = await loadStripe(publishableKey, { stripeAccount: connectedAccountId });
    stripeElements = stripeInstance.elements();

    await nextTick();
    stripeCardElement = stripeElements.create('card', {
      style: {
        base: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: '#1e293b',
          '::placeholder': { color: '#94a3b8' }
        }
      },
      hidePostalCode: false
    });

    const mountTarget = document.getElementById('stripe-card-element');
    if (mountTarget) {
      stripeCardElement.mount(mountTarget);
      stripeCardElement.on('change', (e) => {
        stripeElementError.value = e.error ? e.error.message : '';
      });
    }
  } catch (err) {
    console.warn('[PaymentStep] Stripe init failed, falling back to QB form:', err.message);
    stripeEnabled.value = false;
  } finally {
    stripeLoading.value = false;
  }
});

onBeforeUnmount(() => {
  if (stripeCardElement) {
    stripeCardElement.destroy();
    stripeCardElement = null;
  }
});

// ── Stripe save ─────────────────────────────────────────────────────────────
async function saveStripeCard() {
  formError.value = '';
  stripeElementError.value = '';

  if (!cardholderName.value.trim()) {
    formError.value = 'Please enter the cardholder name.';
    return;
  }
  if (!stripeInstance || !stripeCardElement || !stripeClientSecret) {
    formError.value = 'Payment form is not ready. Please refresh and try again.';
    return;
  }

  saving.value = true;
  try {
    // Confirm the card setup — this tokenizes the card inside Stripe's iframe,
    // card numbers never touch our server.
    const { error, setupIntent } = await stripeInstance.confirmCardSetup(stripeClientSecret, {
      payment_method: {
        card: stripeCardElement,
        billing_details: { name: cardholderName.value.trim() }
      }
    });

    if (error) {
      formError.value = error.message || 'Card could not be saved.';
      return;
    }

    const paymentMethodId = setupIntent.payment_method;

    // Tell our backend to attach the PM and store it
    const resp = await api.post(
      `/public-intake/${props.publicKey}/${props.submissionId}/payment-card`,
      {
        stripePaymentMethodId: paymentMethodId,
        stripeCustomerId: stripeCustomerId,
        stripeConnectedAccountId: stripeConnectedAccountId,
        autoCharge: autoCharge.value
      }
    );

    const last4 = resp.data?.last4 || '';
    const brand = resp.data?.brand || 'Card';
    savedCardSummary.value = `${brand} ending in ${last4}`;
    paymentSaved.value = true;
    skipAcknowledged.value = false;
    emit('update:modelValue', {
      cardSaved: true,
      cardSummary: savedCardSummary.value,
      last4,
      brand,
      autoCharge: autoCharge.value,
      stripePaymentMethodId: paymentMethodId,
      skipAcknowledged: false
    });
    emit('card-saved', { last4, brand, autoCharge: autoCharge.value });
  } catch (e) {
    formError.value = e.response?.data?.error?.message || 'Failed to save payment method. Please try again.';
  } finally {
    saving.value = false;
  }
}

// ── QB Payments save (fallback) ──────────────────────────────────────────────
function formatCardNumber(e) {
  const raw = e.target.value.replace(/[^\d]/g, '');
  card.value.number = raw.replace(/(.{4})/g, '$1 ').trim();
}

async function saveQbCard() {
  formError.value = '';
  if (!isQbCardComplete.value) {
    formError.value = 'Please complete all required card fields.';
    return;
  }
  if (!props.publicKey || !props.submissionId) {
    formError.value = 'Session context is missing. Please reload and try again.';
    return;
  }
  saving.value = true;
  try {
    const rawNumber = card.value.number.replace(/\s/g, '');
    const resp = await api.post(
      `/public-intake/${props.publicKey}/${props.submissionId}/payment-card`,
      {
        card: {
          name: card.value.name.trim(),
          number: rawNumber,
          expMonth: card.value.expMonth,
          expYear: card.value.expYear,
          cvc: card.value.cvc,
          address: card.value.billingZip ? { postalCode: card.value.billingZip } : null
        },
        autoCharge: autoCharge.value
      }
    );
    const last4 = resp.data?.last4 || rawNumber.slice(-4);
    const brand = resp.data?.brand || 'Card';
    savedCardSummary.value = `${brand} ending in ${last4} · expires ${card.value.expMonth}/${card.value.expYear}`;
    paymentSaved.value = true;
    skipAcknowledged.value = false;
    emit('update:modelValue', {
      cardSaved: true,
      cardSummary: savedCardSummary.value,
      last4,
      brand,
      autoCharge: autoCharge.value,
      qbCardId: resp.data?.qbCardId || null,
      skipAcknowledged: false
    });
    emit('card-saved', { last4, brand, autoCharge: autoCharge.value });
  } catch (e) {
    formError.value = e.response?.data?.error?.message || 'Failed to save payment method. Please check your card details and try again.';
  } finally {
    saving.value = false;
  }
}

// ── Shared actions ───────────────────────────────────────────────────────────
function resetCard() {
  paymentSaved.value = false;
  savedCardSummary.value = '';
  cardholderName.value = '';
  card.value = { name: '', number: '', expMonth: '', expYear: '', cvc: '', billingZip: '' };
  emit('update:modelValue', { cardSaved: false, skipAcknowledged: !!skipAcknowledged.value });
}

function skipForNow() {
  formError.value = '';
  if (!skipAcknowledged.value) {
    formError.value = 'Please acknowledge the payment responsibility statement to continue.';
    return;
  }
  emit('update:modelValue', {
    cardSaved: false,
    skipAcknowledged: true,
    skipAcknowledgedAt: new Date().toISOString()
  });
}
</script>

<style scoped>
.pi-pay {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pi-pay-disclosure {
  background: #fef9c3;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.5;
  color: #713f12;
}
.pi-pay-cost-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 15px;
}
.pi-pay-amount {
  font-weight: 700;
  font-size: 1.2rem;
  color: var(--primary, #0f766e);
}
.pi-pay-notice {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
}
.pi-pay-notice p { margin: 0; }
.pi-pay-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 16px;
  background: #fff;
}
.pi-pay-card-title {
  margin: 0 0 14px;
  font-size: 1rem;
}
.pi-pay-lbl {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}
.req { color: var(--danger, #dc2626); }
.pi-pay-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
  background: #fff;
}
.pi-pay-input--card {
  font-family: monospace;
  letter-spacing: 1px;
}
.pi-pay-stripe-element {
  padding: 10px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  background: #fff;
  min-height: 38px;
}
.pi-pay-stripe-element.StripeElement--focus {
  outline: 2px solid var(--primary, #0f766e);
  outline-offset: 1px;
}
.pi-pay-row {
  display: grid;
  gap: 10px;
  margin-bottom: 10px;
}
.pi-pay-row--3col {
  grid-template-columns: 1fr 1fr 1fr;
}
@media (max-width: 480px) {
  .pi-pay-row--3col { grid-template-columns: 1fr 1fr; }
}
.pi-pay-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  color: #dc2626;
  margin-bottom: 10px;
}
.pi-pay-billing-pref {
  margin: 12px 0 8px;
}
.checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.pi-pay-pref-hint {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  margin: 4px 0 0 24px;
}
.pi-pay-cta {
  margin-top: 12px;
}
.pi-pay-skip {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px dashed #cbd5e1;
}
.pi-pay-saved {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
}
.pi-pay-saved-icon {
  font-size: 24px;
  color: #16a34a;
  flex-shrink: 0;
}
.pi-pay-saved-detail {
  font-size: 14px;
  color: #166534;
  margin-top: 2px;
}
.pi-pay-change-btn {
  font-size: 13px;
  color: var(--primary, #0f766e);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-top: 6px;
  text-decoration: underline;
}
.pi-pay-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #64748b;
  padding: 8px 0;
}
.pi-pay-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid #e2e8f0;
  border-top-color: var(--primary, #0f766e);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
.pi-pay-spinner--btn {
  width: 13px;
  height: 13px;
  border-width: 2px;
  border-color: rgba(255,255,255,0.3);
  border-top-color: #fff;
  margin-right: 6px;
  vertical-align: middle;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
