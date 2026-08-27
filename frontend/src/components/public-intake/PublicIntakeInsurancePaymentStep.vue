<template>
  <div class="pi-ip" :class="{ 'pi-ip--with-sidebar': showSidebar }">
    <div class="pi-ip-main">
      <header class="pi-ip-header">
        <h2 class="pi-ip-title">
          {{ paymentOnly ? tx('Payment Information') : tx('Insurance & Payment Information') }}
        </h2>
        <p class="pi-ip-subtitle">
          {{
            paymentOnly
              ? tx('Set up payment for your selected package or services.')
              : tx('Help us verify your insurance and set up payment for services.')
          }}
        </p>
      </header>

      <div class="pi-ip-why">
        <strong>{{ tx('Why we collect this information') }}</strong>
        <p>
          {{
            paymentOnly
              ? tx('We use this information to process payments securely. You can save a card now or add one later in your portal.')
              : tx('We use this information to verify benefits, bill insurance when applicable, and collect payments. You can choose Self-Pay or provide insurance details — our office will follow up if we need more information.')
          }}
        </p>
      </div>

      <!-- Clinical: Use Insurance vs Self-Pay -->
      <section v-if="!paymentOnly" class="pi-ip-section">
        <h3 class="pi-ip-section-title">{{ tx('How would you like to pay?') }}</h3>
        <div class="pi-ip-choice-row">
          <button
            type="button"
            class="pi-ip-choice"
            :class="{ 'pi-ip-choice--active': !isSelfPay }"
            @click="setSelfPay(false)"
          >
            <span class="pi-ip-choice-radio" aria-hidden="true" />
            <span>
              <strong>{{ tx('Use Insurance') }}</strong>
              <span class="pi-ip-choice-sub">{{ tx('Bill my insurance for services.') }}</span>
            </span>
          </button>
          <button
            type="button"
            class="pi-ip-choice"
            :class="{ 'pi-ip-choice--active': isSelfPay }"
            @click="setSelfPay(true)"
          >
            <span class="pi-ip-choice-radio" aria-hidden="true" />
            <span>
              <strong>{{ tx('Self-Pay') }}</strong>
              <span class="pi-ip-choice-sub">{{ tx('I will pay out of pocket.') }}</span>
            </span>
          </button>
        </div>
        <p class="pi-ip-hint">{{ tx('You can change this later if needed.') }}</p>
      </section>

      <!-- Existing insurance UI (hidden for payment-only / collapsed when self-pay handled inside child) -->
      <section v-if="!paymentOnly" class="pi-ip-section pi-ip-section--insurance">
        <PublicIntakeInsuranceStep
          ref="insuranceRef"
          :model-value="insuranceInfo"
          :step-config="insuranceStepConfig"
          :guardian-name="guardianName"
          :guardian-relationship="guardianRelationship"
          :guardian-phone="guardianPhone"
          :client-names="clientNames"
          :intake-for-self="intakeForSelf"
          :agency-name="agencyName"
          :legal-first-name="legalFirstName"
          :legal-last-name="legalLastName"
          :public-key="publicKey"
          :submission-id="submissionId"
          :saved-signature-data="savedSignatureData"
          :validation-errors="insuranceValidationErrors"
          :hide-authorization="true"
          :external-self-pay="isSelfPay"
          @update:model-value="onInsuranceUpdate"
          @medicaid-change="onMedicaidChange"
        />
      </section>

      <!-- Payment method: clinical non-Medicaid/self-pay OR always for payment-only channels -->
      <section v-if="showPaymentSection" class="pi-ip-section">
        <h3 class="pi-ip-section-title">{{ tx('Payment Method') }}</h3>
        <p class="pi-ip-section-lead">
          {{ tx('Your card will be saved securely with Stripe. You can skip this step and add it later.') }}
        </p>

        <div class="pi-ip-choice-row pi-ip-choice-row--3">
          <button
            type="button"
            class="pi-ip-choice"
            :class="{ 'pi-ip-choice--active': paymentChoice === 'add_card' }"
            @click="paymentChoice = 'add_card'"
          >
            <strong>{{ tx('Add Card') }}</strong>
            <span class="pi-ip-choice-sub">{{ tx('Save card for payments.') }}</span>
          </button>
          <button
            type="button"
            class="pi-ip-choice"
            :class="{ 'pi-ip-choice--active': paymentChoice === 'later' }"
            @click="paymentChoice = 'later'"
          >
            <strong>{{ tx("I'll Add Card Later") }}</strong>
            <span class="pi-ip-choice-sub">{{ tx('You can add a card anytime.') }}</span>
          </button>
          <button
            type="button"
            class="pi-ip-choice"
            :class="{ 'pi-ip-choice--active': paymentChoice === 'na' }"
            @click="paymentChoice = 'na'"
          >
            <strong>{{ tx('N/A — Not Paying Now') }}</strong>
            <span class="pi-ip-choice-sub">{{ tx('For insurance-only billing or staff follow-up.') }}</span>
          </button>
        </div>

        <div v-if="paymentChoice === 'add_card'" class="pi-ip-payment-embed">
          <PublicIntakePaymentStep
            ref="paymentRef"
            :model-value="paymentInfo"
            :step-config="paymentStepConfig"
            :public-key="publicKey"
            :submission-id="submissionId"
            :cost-display="paymentCostDisplay"
            @update:model-value="onPaymentUpdate"
            @card-saved="onCardSaved"
            @skip-acknowledged="onPaymentSkip"
          />
        </div>
        <p v-else-if="paymentChoice === 'later'" class="pi-ip-hint">
          {{ tx('We will remind you to add a payment method in your portal before services begin.') }}
        </p>
        <p v-else class="pi-ip-hint">
          {{ tx('No card will be saved now. Our office may contact you about payment arrangements.') }}
        </p>
      </section>

      <section v-else-if="!paymentOnly && isMedicaid" class="pi-ip-section pi-ip-medicaid-note">
        <strong>{{ tx('Medicaid coverage detected') }}</strong>
        <p>{{ tx('No payment card is required at this time. We will verify benefits and follow up if needed.') }}</p>
      </section>

      <!-- Authorization -->
      <section class="pi-ip-section pi-ip-auth">
        <h3 class="pi-ip-section-title">{{ tx('Authorization & Agreement') }}</h3>
        <p class="pi-ip-section-lead">{{ tx('By checking the box below, I certify that:') }}</p>
        <ul class="pi-ip-auth-list">
          <li>{{ tx('The information I provided is accurate and complete to the best of my knowledge.') }}</li>
          <li v-if="!paymentOnly && !isSelfPay">
            {{ tx('I authorize this organization to release information necessary to verify benefits and bill my insurance.') }}
          </li>
          <li>{{ tx('I understand I am financially responsible for services not covered by insurance or for self-pay balances.') }}</li>
          <li>{{ tx('I understand the office may follow up for missing insurance cards, ID, or payment details.') }}</li>
          <li>{{ tx('I agree to the payment terms described for any selected package or services.') }}</li>
        </ul>

        <label class="pi-ip-auth-check" :class="{ 'pi-ip-auth-check--error': !!authError }">
          <input v-model="authAgreed" type="checkbox" />
          <span>
            {{ tx('I agree to the above statements and authorize verification and billing.') }}
            <span class="req">*</span>
          </span>
        </label>
        <p v-if="authError" class="pi-ip-error">{{ authError }}</p>

        <div class="pi-ip-sign">
          <label class="pi-ip-lbl">{{ tx('Signature') }} <span class="req">*</span></label>
          <input
            v-model="authSignature"
            type="text"
            class="pi-ip-input"
            :placeholder="tx('Type your full legal name')"
            autocomplete="name"
          />
          <button
            v-if="savedSignatureData"
            type="button"
            class="pi-ip-linkbtn"
            @click="useSavedSignature"
          >
            {{ tx('Use my drawn signature from earlier') }}
          </button>
        </div>
      </section>
    </div>

    <aside v-if="showSidebar" class="pi-ip-sidebar">
      <div v-if="selectedPackage" class="pi-ip-side-card">
        <div class="pi-ip-side-kicker">{{ tx('Selected Package') }}</div>
        <strong class="pi-ip-side-name">{{ selectedPackage.name }}</strong>
        <div v-if="selectedPackage.sessionCount" class="pi-ip-side-meta">
          {{ selectedPackage.sessionCount }} {{ selectedPackage.sessionCount === 1 ? tx('session') : tx('sessions') }}
        </div>
        <div class="pi-ip-side-price">{{ formatPrice(selectedPackage.priceCents) }}</div>
      </div>

      <div class="pi-ip-side-card">
        <div class="pi-ip-side-kicker">{{ tx('Payment Summary') }}</div>
        <div class="pi-ip-side-row">
          <span>{{ tx('Package fee') }}</span>
          <strong>{{ formatPrice(selectedPackage?.priceCents || 0) }}</strong>
        </div>
        <div v-if="!paymentOnly && !isSelfPay" class="pi-ip-side-row">
          <span>{{ tx('Est. insurance coverage') }}</span>
          <strong>{{ isMedicaid ? tx('Medicaid') : tx('Pending') }}</strong>
        </div>
        <div class="pi-ip-side-total">
          <span>{{ tx('Your estimated cost') }}</span>
          <strong>{{ estimatedCostLabel }}</strong>
        </div>
        <p class="pi-ip-side-fine">{{ tx('Estimated cost may change after insurance verification.') }}</p>
      </div>

      <div class="pi-ip-side-card">
        <div class="pi-ip-side-kicker">{{ tx('What happens next?') }}</div>
        <ul class="pi-ip-side-list">
          <li v-if="!paymentOnly">{{ tx('We will verify your insurance within 1–3 business days.') }}</li>
          <li>{{ tx('We will contact you if we need more information.') }}</li>
          <li>{{ tx("You'll receive a benefits or payment summary as applicable.") }}</li>
        </ul>
      </div>

      <div class="pi-ip-side-card pi-ip-side-card--secure">
        <strong>{{ tx('Secure & private') }}</strong>
        <p>{{ tx('Your information is encrypted and stored securely. We will never share your information without consent.') }}</p>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import PublicIntakeInsuranceStep from './PublicIntakeInsuranceStep.vue';
import PublicIntakePaymentStep from './PublicIntakePaymentStep.vue';
import { isMedicaidInsurer } from '../../utils/coloradoInsurances.js';

const props = defineProps({
  insuranceInfo: { type: Object, default: () => ({}) },
  paymentInfo: { type: Object, default: () => ({}) },
  stepConfig: { type: Object, default: () => ({}) },
  selectedPackage: { type: Object, default: null },
  paymentOnly: { type: Boolean, default: false },
  guardianName: { type: String, default: '' },
  guardianRelationship: { type: String, default: '' },
  guardianPhone: { type: String, default: '' },
  clientNames: { type: Array, default: () => [] },
  intakeForSelf: { type: Boolean, default: false },
  agencyName: { type: String, default: '' },
  legalFirstName: { type: String, default: '' },
  legalLastName: { type: String, default: '' },
  publicKey: { type: String, default: '' },
  submissionId: { type: [Number, String], default: null },
  savedSignatureData: { type: String, default: '' },
  insuranceValidationErrors: { type: Object, default: () => ({}) },
  paymentCostDisplay: { type: String, default: '' },
  translations: { type: Object, default: () => ({}) }
});

const emit = defineEmits([
  'update:insuranceInfo',
  'update:paymentInfo',
  'medicaid-change',
  'card-saved',
  'skip-acknowledged'
]);

function tx(key) {
  return props.translations?.[key] || key;
}

const insuranceRef = ref(null);
const paymentRef = ref(null);
const authAgreed = ref(!!props.insuranceInfo?.authorizationAgreed);
const authSignature = ref(props.insuranceInfo?.authorizationSignature || '');
const authSignatureData = ref(props.insuranceInfo?.authorizationSignatureData || '');
const authError = ref('');
const paymentChoice = ref(
  props.paymentInfo?.paymentChoice
  || (props.paymentInfo?.cardSaved ? 'add_card' : 'later')
);

const isSelfPay = computed(() => {
  if (props.paymentOnly) return true;
  return !!(
    props.insuranceInfo?.isSelfPay
    || String(props.insuranceInfo?.primary?.insurerName || '').trim().toLowerCase().includes('self-pay')
    || String(props.insuranceInfo?.primary?.insurerName || '').trim().toLowerCase() === 'self pay'
  );
});

const isMedicaid = computed(() => {
  if (isSelfPay.value || props.paymentOnly) return false;
  if (props.insuranceInfo?.primaryIsMedicaid) return true;
  return isMedicaidInsurer(props.insuranceInfo?.primary?.insurerName);
});

const showPaymentSection = computed(() => {
  if (props.paymentOnly) return true;
  if (isSelfPay.value) return true;
  if (isMedicaid.value) return false;
  return true; // commercial insurance
});

const showSidebar = computed(() => !!props.selectedPackage);

const insuranceStepConfig = computed(() => ({
  ...(props.stepConfig || {}),
  hideSelfPayToggle: true
}));

const paymentStepConfig = computed(() => props.stepConfig || {});

const estimatedCostLabel = computed(() => {
  if (props.paymentOnly || isSelfPay.value) {
    return formatPrice(props.selectedPackage?.priceCents || 0);
  }
  if (isMedicaid.value) return formatPrice(0);
  return tx('Pending verification');
});

function formatPrice(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function patchInsurance(patch) {
  emit('update:insuranceInfo', {
    ...(props.insuranceInfo || {}),
    ...patch,
    authorizationAgreed: authAgreed.value,
    authorizationSignature: authSignature.value,
    authorizationSignatureData: authSignatureData.value || props.insuranceInfo?.authorizationSignatureData || '',
    authorizationSignedAt: new Date().toISOString()
  });
}

function setSelfPay(next) {
  const primary = {
    ...(props.insuranceInfo?.primary || {}),
    insurerName: next ? 'Self-Pay' : (props.insuranceInfo?.primary?.insurerName === 'Self-Pay' ? '' : (props.insuranceInfo?.primary?.insurerName || '')),
    isMedicaid: false
  };
  patchInsurance({
    isSelfPay: next,
    primary,
    primaryIsMedicaid: false
  });
  emit('medicaid-change', false);
}

function onInsuranceUpdate(v) {
  emit('update:insuranceInfo', {
    ...v,
    isSelfPay: isSelfPay.value,
    authorizationAgreed: authAgreed.value,
    authorizationSignature: authSignature.value,
    authorizationSignatureData: authSignatureData.value || v?.authorizationSignatureData || ''
  });
}

function onMedicaidChange(v) {
  emit('medicaid-change', v);
}

function onPaymentUpdate(v) {
  emit('update:paymentInfo', { ...(v || {}), paymentChoice: paymentChoice.value });
}

function onCardSaved(payload) {
  emit('card-saved', payload);
  emit('update:paymentInfo', {
    ...(props.paymentInfo || {}),
    paymentChoice: 'add_card',
    cardSaved: true
  });
}

function onPaymentSkip() {
  emit('skip-acknowledged');
}

function useSavedSignature() {
  if (!props.savedSignatureData) return;
  authSignatureData.value = props.savedSignatureData;
  if (!authSignature.value) authSignature.value = props.guardianName || '';
  patchInsurance({});
}

watch(paymentChoice, (v) => {
  emit('update:paymentInfo', { ...(props.paymentInfo || {}), paymentChoice: v });
});

watch([authAgreed, authSignature], () => {
  authError.value = '';
  patchInsurance({});
});

function validateAuthorization() {
  authError.value = '';
  if (!authAgreed.value) {
    authError.value = tx('Please agree to the authorization statements to continue.');
    return false;
  }
  const typed = String(authSignature.value || '').trim();
  const drawn = String(authSignatureData.value || props.insuranceInfo?.authorizationSignatureData || '').trim();
  if (typed.length < 2 && drawn.length < 50) {
    authError.value = tx('Please type your full name as a signature.');
    return false;
  }
  return true;
}

defineExpose({
  insuranceRef,
  paymentRef,
  validateAuthorization,
  showPaymentSection,
  paymentChoice,
  getPhotoFiles: () => insuranceRef.value?.getPhotoFiles?.(),
  getInsuranceEntryState: () => ({
    ...(insuranceRef.value?.getInsuranceEntryState?.() || {}),
    isSelfPay: isSelfPay.value,
    paymentChoice: paymentChoice.value,
    authorizationAgreed: authAgreed.value
  })
});
</script>

<style scoped>
.pi-ip {
  display: grid;
  gap: 1.25rem;
}
.pi-ip--with-sidebar {
  grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
  align-items: start;
  gap: 1.5rem;
}
@media (max-width: 960px) {
  .pi-ip--with-sidebar { grid-template-columns: 1fr; }
}
.pi-ip-main { display: grid; gap: 1.1rem; min-width: 0; }
.pi-ip-title { margin: 0; font-size: 1.45rem; font-weight: 800; color: #0f172a; }
.pi-ip-subtitle { margin: 6px 0 0; color: #64748b; font-size: 0.95rem; }
.pi-ip-why {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 12px;
  padding: 12px 14px;
}
.pi-ip-why p { margin: 6px 0 0; color: #78350f; font-size: 0.88rem; line-height: 1.45; }
.pi-ip-section {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px;
  background: #fff;
  display: grid;
  gap: 12px;
}
.pi-ip-section-title { margin: 0; font-size: 1.05rem; font-weight: 800; }
.pi-ip-section-lead { margin: 0; color: #64748b; font-size: 0.88rem; }
.pi-ip-choice-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.pi-ip-choice-row--3 { grid-template-columns: repeat(3, 1fr); }
@media (max-width: 720px) {
  .pi-ip-choice-row,
  .pi-ip-choice-row--3 { grid-template-columns: 1fr; }
}
.pi-ip-choice {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  text-align: left;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  padding: 12px 14px;
  cursor: pointer;
}
.pi-ip-choice--active {
  border-color: #2563eb;
  background: #eff6ff;
}
.pi-ip-choice-radio {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 2px solid #94a3b8;
  margin-top: 2px;
  flex-shrink: 0;
}
.pi-ip-choice--active .pi-ip-choice-radio {
  border-color: #2563eb;
  box-shadow: inset 0 0 0 4px #2563eb;
}
.pi-ip-choice-sub {
  display: block;
  margin-top: 2px;
  font-size: 0.82rem;
  color: #64748b;
  font-weight: 500;
}
.pi-ip-hint { margin: 0; font-size: 0.82rem; color: #64748b; }
.pi-ip-medicaid-note {
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.pi-ip-auth-list {
  margin: 0;
  padding-left: 1.1rem;
  color: #334155;
  font-size: 0.9rem;
  line-height: 1.45;
}
.pi-ip-auth-check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-weight: 600;
  font-size: 0.92rem;
}
.pi-ip-auth-check--error { color: #b91c1c; }
.pi-ip-error { color: #b91c1c; font-size: 0.85rem; margin: 0; }
.pi-ip-sign { display: grid; gap: 6px; }
.pi-ip-lbl { font-size: 0.8rem; font-weight: 700; color: #475569; }
.pi-ip-input {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}
.req { color: #dc2626; }
.pi-ip-linkbtn {
  background: none;
  border: none;
  color: #1d4ed8;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  text-align: left;
  width: fit-content;
}
.pi-ip-sidebar { display: grid; gap: 12px; }
.pi-ip-side-card {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  padding: 14px;
  display: grid;
  gap: 8px;
}
.pi-ip-side-kicker {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.pi-ip-side-name { font-size: 1.05rem; }
.pi-ip-side-price { font-size: 1.2rem; font-weight: 800; color: #1d4ed8; }
.pi-ip-side-row,
.pi-ip-side-total {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.88rem;
}
.pi-ip-side-total {
  border-top: 1px solid #e2e8f0;
  padding-top: 8px;
  font-size: 1rem;
}
.pi-ip-side-fine { margin: 0; font-size: 0.75rem; color: #94a3b8; }
.pi-ip-side-list {
  margin: 0;
  padding-left: 1rem;
  font-size: 0.85rem;
  color: #475569;
  line-height: 1.4;
}
.pi-ip-side-card--secure {
  background: #f8fafc;
}
.pi-ip-side-card--secure p {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.4;
}
</style>
