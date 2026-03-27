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

    <!-- Payment method disclaimer -->
    <div class="pi-pay-notice">
      <p>
        Your payment information is stored securely via QuickBooks Payments (Intuit). Card details are
        encrypted and never stored unmasked on our servers. You may update or remove your payment method
        at any time through your guardian portal.
      </p>
      <p style="margin-top: 8px;">
        All payments collected via our web application will be listed as collected outside of our EHR
        platform and applied to billing claims as necessary.
      </p>
    </div>

    <!-- Card form -->
    <div v-if="!paymentSaved" class="pi-pay-card">
      <h4 class="pi-pay-card-title">Payment method</h4>

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

      <!-- Billing preference -->
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
          :disabled="saving || !isCardComplete"
          @click="saveCard"
        >
          {{ saving ? 'Saving securely…' : 'Save payment method' }}
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
import { ref, computed } from 'vue';
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

const card = ref({
  name: '',
  number: '',
  expMonth: '',
  expYear: '',
  cvc: '',
  billingZip: ''
});
const autoCharge = ref(true);
const saving = ref(false);
const formError = ref('');
const paymentSaved = ref(!!props.modelValue?.cardSaved);
const savedCardSummary = ref(props.modelValue?.cardSummary || '');

const currentYear = new Date().getFullYear();
const expiryYears = computed(() => Array.from({ length: 12 }, (_, i) => currentYear + i));

const isCardComplete = computed(() => {
  const raw = card.value.number.replace(/\s/g, '');
  return (
    card.value.name.trim().length > 0
    && raw.length >= 15
    && card.value.expMonth
    && card.value.expYear
    && card.value.cvc.length >= 3
  );
});

function formatCardNumber(e) {
  const raw = e.target.value.replace(/[^\d]/g, '');
  card.value.number = raw.replace(/(.{4})/g, '$1 ').trim();
}

async function saveCard() {
  formError.value = '';
  if (!isCardComplete.value) {
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
    emit('update:modelValue', {
      cardSaved: true,
      cardSummary: savedCardSummary.value,
      last4,
      brand,
      autoCharge: autoCharge.value,
      qbCardId: resp.data?.qbCardId || null
    });
    emit('card-saved', { last4, brand, autoCharge: autoCharge.value });
  } catch (e) {
    formError.value = e.response?.data?.error?.message || 'Failed to save payment method. Please check your card details and try again.';
  } finally {
    saving.value = false;
  }
}

function resetCard() {
  paymentSaved.value = false;
  savedCardSummary.value = '';
  card.value = { name: '', number: '', expMonth: '', expYear: '', cvc: '', billingZip: '' };
  emit('update:modelValue', { cardSaved: false });
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
</style>
