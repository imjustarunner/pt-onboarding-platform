<template>
  <div class="pi-ip" :class="{ 'pi-ip--with-sidebar': showSidebar }">
    <div class="pi-ip-main">
      <header class="pi-ip-header">
        <h2 v-if="!hideHeading" class="pi-ip-title">
          {{ paymentSuppressed ? tx('Insurance Information') : paymentOnly ? tx('Payment Information') : tx('Insurance & Payment Information') }}
        </h2>
        <p class="pi-ip-subtitle">
          {{
            paymentSuppressed
              ? tx('Our office will review your insurance and confirm benefits.')
              : paymentOnly
              ? tx('Set up payment for your selected package or services.')
              : tx('Help us verify your insurance and set up payment for services.')
          }}
        </p>
      </header>

      <div class="pi-ip-why">
        <strong>{{ tx('Why we collect this information') }}</strong>
        <p>
          {{
            paymentOnly && !paymentSuppressed
              ? tx('We use this information to process payments securely. You can save a card now or add one later in your portal.')
              : tx('We use this information to verify benefits and bill your insurance for eligible services. Our office will follow up if anything is missing.')
          }}
        </p>
      </div>

      <!-- Clinical: Use Insurance vs Self-Pay -->
      <section v-if="!paymentOnly && !insuranceOnFile && !isMedicaid" class="pi-ip-section">
        <h3 class="pi-ip-section-title">{{ tx('Insurance Information') }}</h3>
        <div class="pi-ip-choice-row">
          <button
            type="button"
            class="pi-ip-choice"
            :class="{ 'pi-ip-choice--active': payerChoice === 'insurance' }"
            :aria-pressed="payerChoice === 'insurance'"
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
            :aria-pressed="isSelfPay"
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

      <!-- Insurance details only when billing insurance — never for Self-Pay. -->
      <section
        v-if="!paymentOnly && !insuranceOnFile && payerChoice === 'insurance'"
        class="pi-ip-section pi-ip-section--insurance"
      >
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
          :external-self-pay="false"
          @update:model-value="onInsuranceUpdate"
          @medicaid-change="onMedicaidChange"
        />
      </section>

      <section v-if="!paymentOnly && !insuranceOnFile && payerChoice === 'insurance' && !isMedicaid && !coverageReviewed" class="pi-ip-section">
        <p>{{ tx('Finish entering your primary insurance and any secondary coverage, then confirm below.') }}</p>
        <button type="button" class="pi-ip-linkbtn" @click="confirmCoverage">{{ tx('Confirm primary and any secondary coverage') }}</button>
        <p v-if="coverageReviewError" class="pi-ip-error" role="alert">{{ tx(coverageReviewError) }}</p>
      </section>

      <section v-if="paymentEligible" class="pi-ip-section">
        <h3>{{ tx('Your payment arrangement') }}</h3>
        <p>{{ tx('Tell us what you propose for copays or other patient responsibility. This is a request for review, not permission to charge your card.') }}</p>
        <label>{{ tx('I am willing to') }}
          <select :value="paymentInfo.arrangement || 'discuss'" @change="emit('update:paymentInfo', { ...paymentInfo, arrangement: $event.target.value })">
            <option value="discuss">{{ tx('Discuss payment with the office') }}</option>
            <option value="all">{{ tx('Pay all of the verified patient responsibility') }}</option>
            <option value="part">{{ tx('Pay part of the verified patient responsibility') }}</option>
            <option v-if="!intakeForSelf" value="alternate">{{ tx('Alternate sessions with another parent') }}</option>
          </select>
        </label>
        <label>{{ tx('Agreement details or proposed share') }}<textarea :value="paymentInfo.arrangementNotes || ''" maxlength="2000" rows="2" @input="emit('update:paymentInfo', { ...paymentInfo, arrangementNotes: $event.target.value })" /></label>
      </section>

      <!-- Payment method: clinical non-Medicaid/self-pay OR always for payment-only channels -->
      <section v-if="showPaymentSection" class="pi-ip-section">
        <h3 class="pi-ip-section-title">{{ tx('Payment Method') }}</h3>
        <p class="pi-ip-section-lead">
          {{ tx('Save your card securely with Stripe. Payment information is required before paid services; contact the office if you need another arrangement.') }}
        </p>

        <div class="pi-ip-choice-row pi-ip-choice-row--3">
          <button
            v-if="paymentOnly || cardAvailable"
            type="button"
            class="pi-ip-choice"
            :class="{ 'pi-ip-choice--active': paymentChoice === 'add_card' }"
            :aria-pressed="paymentChoice === 'add_card'"
            @click="paymentChoice = 'add_card'"
          >
            <strong>{{ tx('Add Card') }}</strong>
            <span class="pi-ip-choice-sub">{{ tx('Save card for payments.') }}</span>
          </button>
          <button
            v-if="allowsNoCardChoice"
            type="button"
            class="pi-ip-choice"
            :class="{ 'pi-ip-choice--active': paymentChoice === 'later' }"
            :aria-pressed="paymentChoice === 'later'"
            @click="paymentChoice = 'later'"
          >
            <strong>{{ tx("I'll Add Card Later") }}</strong>
            <span class="pi-ip-choice-sub">{{ tx('You can add a card anytime.') }}</span>
          </button>
          <button
            v-if="allowsNoCardChoice"
            type="button"
            class="pi-ip-choice"
            :class="{ 'pi-ip-choice--active': paymentChoice === 'na' }"
            :aria-pressed="paymentChoice === 'na'"
            @click="paymentChoice = 'na'"
          >
            <strong>{{ tx('N/A — Not Paying Now') }}</strong>
            <span class="pi-ip-choice-sub">{{ tx('For insurance-only billing or staff follow-up.') }}</span>
          </button>
        </div>

        <p v-if="!paymentOnly && checkingCard" role="status">{{ tx('Checking secure card availability…') }}</p>
        <template v-else-if="!paymentOnly && !cardAvailable">
          <p>{{ tx('Card collection is unavailable right now. You can continue enrollment and arrange payment with the office later.') }}</p>
          <button type="button" class="btn btn-secondary" @click="deferUnavailableCard">{{ tx('Continue with payment follow-up') }}</button>
        </template>
        <div v-if="(paymentOnly || cardAvailable) && paymentChoice === 'add_card'" class="pi-ip-payment-embed">
          <PublicIntakePaymentStep
            ref="paymentRef"
            :model-value="paymentInfo"
            :step-config="paymentStepConfig"
            :public-key="publicKey"
            :submission-id="submissionId"
            :cost-display="paymentCostDisplay"
            :insurance-info="insuranceInfo" :payment-only="paymentOnly" :collection-allowed="showPaymentSection"
            @update:model-value="onPaymentUpdate"
            @card-saved="onCardSaved"
            @skip-acknowledged="onPaymentSkip"
          />
        </div>
        <p v-else-if="paymentChoice === 'later'" class="pi-ip-hint">
          {{ tx('Add a payment method in your portal before paid services begin.') }}
        </p>
        <p v-else-if="paymentChoice === 'na'" class="pi-ip-hint">
          {{ tx('No card will be saved now. Our office may contact you about payment arrangements.') }}
        </p>
      </section>

      <section v-else-if="!paymentOnly && !insuranceOnFile && isMedicaid" class="pi-ip-section pi-ip-medicaid-note">
        <strong>{{ tx('Medicaid coverage detected') }}</strong>
        <p>{{ tx('No payment card is required at this time. We will verify benefits and follow up if needed.') }}</p>
      </section>

      <!-- Authorization -->
      <section class="pi-ip-section pi-ip-auth">
        <h3 class="pi-ip-section-title">{{ tx('Authorization & Agreement') }}</h3>
        <p class="pi-ip-section-lead">{{ tx('By checking the box below, I certify that:') }}</p>
        <ul class="pi-ip-auth-list">
          <li>{{ tx('The information I provided is accurate and complete to the best of my knowledge.') }}</li>
          <li v-if="!paymentOnly && !insuranceOnFile && payerChoice === 'insurance'">
            {{ tx('I authorize this organization to release information necessary to verify benefits and bill my insurance.') }}
          </li>
          <li v-if="!paymentSuppressed">{{ tx('I understand the office will explain any patient responsibility and applicable payment terms before collecting payment.') }}</li>
          <li>{{ tx('I understand the office may follow up for missing information.') }}</li>
        </ul>

        <label class="pi-ip-auth-check" :class="{ 'pi-ip-auth-check--error': !!authError }">
          <input v-model="authAgreed" type="checkbox" />
          <span>
            {{ tx('I agree to the above statements and authorize verification and billing.') }}
            <span class="req">*</span>
          </span>
        </label>
        <p v-if="authError" class="pi-ip-error">{{ tx(authError) }}</p>

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
      <div v-if="selectedPackage && !paymentSuppressed" class="pi-ip-side-card">
        <div class="pi-ip-side-kicker">{{ tx('Selected Package') }}</div>
        <strong class="pi-ip-side-name">{{ selectedPackage.name }}</strong>
        <div v-if="selectedPackage.sessionCount" class="pi-ip-side-meta">
          {{ selectedPackage.sessionCount }} {{ selectedPackage.sessionCount === 1 ? tx('session') : tx('sessions') }}
        </div>
        <div class="pi-ip-side-price">{{ formatPrice(selectedPackage.priceCents) }}</div>
      </div>

      <div v-if="!isMedicaid && paymentEligible" class="pi-ip-side-card">
        <div class="pi-ip-side-kicker">{{ tx('Payment Summary') }}</div>
        <div v-if="selectedPackage && !isMedicaid" class="pi-ip-side-row">
          <span>{{ tx('Package fee') }}</span>
          <strong>{{ formatPrice(selectedPackage.priceCents) }}</strong>
        </div>
        <div v-if="!paymentOnly && !insuranceOnFile && payerChoice === 'insurance'" class="pi-ip-side-row">
          <span>{{ tx('Est. insurance coverage') }}</span>
          <strong>{{ isMedicaid ? tx('Medicaid') : tx('Pending') }}</strong>
        </div>
        <div class="pi-ip-side-total">
          <span>{{ isMedicaid ? tx('Payment during enrollment') : tx('Your estimated cost') }}</span>
          <strong>{{ estimatedCostLabel }}</strong>
        </div>
        <p class="pi-ip-side-fine">{{ isMedicaid ? tx('No card is requested for this enrollment. Our office will verify coverage for your services.') : tx('This is not a bill. Insurance benefits and any patient responsibility still need verification.') }}</p>
      </div>

      <div class="pi-ip-side-card">
        <div class="pi-ip-side-kicker">{{ tx('What happens next?') }}</div>
        <ul class="pi-ip-side-list">
          <li v-if="!paymentOnly && !insuranceOnFile">{{ tx('Our office will review your insurance and confirm benefits.') }}</li>
          <li>{{ tx('We will contact you if we need more information.') }}</li>
          <li v-if="!paymentSuppressed">{{ tx("You'll receive a benefits or payment summary as applicable.") }}</li>
        </ul>
      </div>

      <div class="pi-ip-side-card pi-ip-side-card--secure">
        <strong>{{ tx('Secure & private') }}</strong>
        <p>{{ paymentSuppressed ? tx('Your insurance information is encrypted and available only through authorized access.') : tx('Card details are collected by Stripe. Insurance details are available to authorized billing staff and your own payer account.') }}</p>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import PublicIntakeInsuranceStep from './PublicIntakeInsuranceStep.vue';
import PublicIntakePaymentStep from './PublicIntakePaymentStep.vue';
import { hasMedicaidCoverage } from '../../utils/insurancePaymentPolicy.js';
import { clearCoverageAuthorization, coverageWithAuthorization, coverageWithChoice, enrollmentCoverageFingerprint, isSelfPayCoverage } from '../../utils/enrollmentCoverage.js';
import { useIntakeStepTx } from '../../composables/useIntakeStepTx.js';
const { tx: structuredTx } = useIntakeStepTx();

const props = defineProps({
  insuranceInfo: { type: Object, default: () => ({}) },
  paymentInfo: { type: Object, default: () => ({}) },
  stepConfig: { type: Object, default: () => ({}) },
  selectedPackage: { type: Object, default: null },
  hideHeading: { type: Boolean, default: false },
  paymentOnly: { type: Boolean, default: false },
  insuranceOnFile: { type: Boolean, default: false },
  paymentCollectionAvailable: { type: Boolean, default: true },
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
  return structuredTx(key) !== key ? structuredTx(key) : (props.translations?.[key] || key);
}

const insuranceRef = ref(null);
const paymentRef = ref(null);
const authAgreed = ref(!!props.insuranceInfo?.authorizationAgreed);
const authSignature = ref(props.insuranceInfo?.authorizationSignature || '');
const authSignatureData = ref(props.insuranceInfo?.authorizationSignatureData || '');
const authError = ref('');
const paymentChoice = ref(props.paymentInfo?.paymentChoice || '');

const isSelfPay = computed(() => props.paymentOnly || isSelfPayCoverage(props.insuranceInfo));

// A legacy false isSelfPay value is not evidence that insurance was chosen.
const payerChoice = computed(() => {
  if (props.paymentOnly || isSelfPay.value) return 'self_pay';
  if (['insurance', 'self_pay'].includes(props.insuranceInfo?.payerChoice)) return props.insuranceInfo.payerChoice;
  return String(props.insuranceInfo?.primary?.insurerName || '').trim() ? 'insurance' : '';
});

const isMedicaid = computed(() => {
  return !props.paymentOnly && hasMedicaidCoverage(props.insuranceInfo);
});
// The bound descriptor may protect Medicaid already on file without exposing
// that policy in this guardian's new/additional insurance fields.
const paymentSuppressed = computed(() => !props.paymentCollectionAvailable || isMedicaid.value);

const coverageReviewError = ref('');
const reviewedCoverage = ref(null);
const coverageFingerprint = computed(() => enrollmentCoverageFingerprint(props.insuranceInfo));
const coverageReviewed = computed(() => reviewedCoverage.value === coverageFingerprint.value);
// An edit needs a new review even if the user later restores the old value.
watch(coverageFingerprint, () => { reviewedCoverage.value = null; }, { flush: 'sync' });
const paymentEligible = computed(() => {
  if (paymentSuppressed.value) return false;
  if (props.paymentOnly || isSelfPay.value) return true;
  return payerChoice.value === 'insurance' && coverageReviewed.value;
});
function confirmCoverage() {
  const info = props.insuranceInfo || {};
  if (!String(info.primary?.insurerName || '').trim()
    || (info.hasSecondary === true && !String(info.secondary?.insurerName || '').trim())) {
    coverageReviewError.value = 'Enter the insurer for your primary and any secondary coverage before confirming.';
    return;
  }
  coverageReviewError.value = '';
  reviewedCoverage.value = coverageFingerprint.value;
}

const allowsNoCardChoice = computed(() => (
  !props.paymentOnly || props.stepConfig?.paymentRequired === false || props.insuranceOnFile
));

const showPaymentSection = computed(() => {
  return props.paymentCollectionAvailable && paymentEligible.value;
});

const cardAvailable = ref(false);
const checkingCard = ref(false);
let cardRequest = 0;
watch([showPaymentSection, () => props.publicKey, () => props.paymentOnly], async ([shown, key, paymentOnly]) => {
  const request = ++cardRequest;
  cardAvailable.value = false;
  checkingCard.value = false;
  if (!shown || paymentOnly || !key) return;
  checkingCard.value = true;
  try {
    const { data } = await api.get(`/public-intake/${encodeURIComponent(key)}/stripe-config`, { skipGlobalLoading: true });
    if (request === cardRequest) cardAvailable.value = data?.stripeEnabled !== false && !!(data?.publishableKey && data?.connectedAccountId);
  } catch { if (request === cardRequest) cardAvailable.value = false; }
  finally { if (request === cardRequest) checkingCard.value = false; }
}, { immediate: true });
function deferUnavailableCard() {
  paymentChoice.value = 'later';
  onPaymentSkip();
}

const showSidebar = computed(() => true);

const insuranceStepConfig = computed(() => ({
  ...(props.stepConfig || {}),
  hideSelfPayToggle: true
}));

const paymentStepConfig = computed(() => ({ ...props.stepConfig, ...(props.insuranceOnFile ? { paymentRequired: false } : {}) }));

const estimatedCostLabel = computed(() => {
  if (isMedicaid.value) return tx('Not required');
  if (props.paymentOnly || isSelfPay.value) {
    return props.selectedPackage ? formatPrice(props.selectedPackage.priceCents) : tx('Pending service selection');
  }
  return tx('Pending verification');
});

function formatPrice(cents) {
  if (cents == null || !Number.isSafeInteger(Number(cents)) || Number(cents) < 0) return tx('Pending confirmation');
  const n = Number(cents) / 100;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function currentAuthorization() {
  return {
    agreed: authAgreed.value,
    signature: authSignature.value,
    signatureData: authSignatureData.value
  };
}

function patchInsurance(patch) {
  const chosen = coverageWithChoice(
    { ...(props.insuranceInfo || {}), ...patch },
    patch.isSelfPay === true || (patch.isSelfPay !== false && isSelfPay.value)
  );
  emit('update:insuranceInfo', coverageWithAuthorization(chosen, currentAuthorization()));
}

function setSelfPay(next) {
  const chosen = coverageWithChoice(props.insuranceInfo, next);
  syncAuthorization(chosen);
  emit('update:insuranceInfo', chosen);
}

function onInsuranceUpdate(v) {
  const chosen = coverageWithChoice({ ...v, payerChoice: payerChoice.value }, isSelfPay.value);
  const changed = enrollmentCoverageFingerprint(v) !== enrollmentCoverageFingerprint(props.insuranceInfo);
  if (changed) syncAuthorization(clearCoverageAuthorization(chosen));
  emit('update:insuranceInfo', coverageWithAuthorization(changed ? clearCoverageAuthorization(chosen) : chosen, currentAuthorization()));
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
  if (!validateAuthorization()) return;
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

let syncingAuthorization = false;
function syncAuthorization(info = {}) {
  syncingAuthorization = true;
  authAgreed.value = info.authorizationAgreed === true;
  authSignature.value = String(info.authorizationSignature || '');
  authSignatureData.value = String(info.authorizationSignatureData || '');
  syncingAuthorization = false;
}
watch([authAgreed, authSignature], () => {
  if (syncingAuthorization) return;
  authError.value = '';
  patchInsurance({});
}, { flush: 'sync' });
watch(() => props.insuranceInfo, info => syncAuthorization(info), { deep: true, flush: 'sync' });

function validateAuthorization() {
  authError.value = '';
  if (!props.paymentOnly && !props.insuranceOnFile && !payerChoice.value) {
    authError.value = 'Please choose insurance or self-pay.';
    return false;
  }
  if (!props.paymentOnly && !props.insuranceOnFile && payerChoice.value === 'insurance' && !isMedicaid.value && !coverageReviewed.value) {
    authError.value = 'Please confirm your primary and any secondary coverage.';
    return false;
  }
  if (insuranceRef.value?.validateCoverageConfirmations && !insuranceRef.value.validateCoverageConfirmations()) {
    authError.value = insuranceRef.value.getCoverageValidationError?.() || 'Please confirm coverage for every listed client.';
    return false;
  }
  if (showPaymentSection.value && !paymentChoice.value) {
    authError.value = 'Please choose a payment method option.';
    return false;
  }
  if (!authAgreed.value) {
    authError.value = 'Please agree to the authorization statements to continue.';
    return false;
  }
  const typed = String(authSignature.value || '').trim();
  const drawn = String(authSignatureData.value || props.insuranceInfo?.authorizationSignatureData || '').trim();
  if (typed.length < 2 && drawn.length < 50) {
    authError.value = 'Please type your full name as a signature.';
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
  awaitPhotoUploads: () => insuranceRef.value?.awaitPhotoUploads?.(),
  uploadingPhotos: computed(() => insuranceRef.value?.uploadingPhotos || false),
  getInsuranceEntryState: () => ({
    ...(insuranceRef.value?.getInsuranceEntryState?.() || {}),
    isSelfPay: isSelfPay.value,
    payerChoice: payerChoice.value,
    paymentChoice: paymentChoice.value,
    authorizationAgreed: authAgreed.value,
    authorizationSignature: authSignature.value,
    authorizationSignatureData: authSignatureData.value || props.insuranceInfo?.authorizationSignatureData || '',
    authorizationSignedAt: props.insuranceInfo?.authorizationSignedAt || null,
    authorizationSourceMethod: props.insuranceInfo?.authorizationSourceMethod || 'typed_full_name'
  })
});
</script>

<style scoped>
.pi-ip {
  --intake-accent: var(--df-primary, var(--primary, #1558d6));
  color: #17213c;
  display: grid;
  gap: 1.25rem;
}
.pi-ip--with-sidebar {
  grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
  align-items: start;
  gap: clamp(20px, 3vw, 36px);
}
@media (max-width: 960px) {
  .pi-ip--with-sidebar { grid-template-columns: 1fr; }
}
.pi-ip-main { display: grid; gap: 1.7rem; min-width: 0; }
.pi-ip-title { margin: 0; font-size: 1.45rem; font-weight: 800; color: #0f172a; }
.pi-ip-subtitle { margin: 6px 0 0; color: #64748b; font-size: 0.95rem; }
.pi-ip-why {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px 14px;
}
.pi-ip-why p { margin: 6px 0 0; color: #78350f; font-size: 0.88rem; line-height: 1.45; }
.pi-ip-section {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
.pi-ip-section-title { margin: 0; font-size: 1.05rem; font-weight: 800; }
.pi-ip-section-lead { margin: 0; color: #64748b; font-size: 0.88rem; }
.pi-ip-choice-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.pi-ip-choice-row--3 { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.pi-ip-choice-row--3 .pi-ip-choice { flex-direction: column; gap: 4px; }
@media (max-width: 720px) {
  .pi-ip-choice-row,
  .pi-ip-choice-row--3 { grid-template-columns: 1fr; }
}
.pi-ip-choice {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  text-align: left;
  border: 1px solid #d9e0ed;
  border-radius: 8px;
  background: #fff;
  padding: 12px 14px;
  cursor: pointer;
}
.pi-ip-choice--active {
  border-color: var(--intake-accent);
  background: color-mix(in srgb, var(--intake-accent) 4%, white);
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
  border-color: var(--intake-accent);
  box-shadow: inset 0 0 0 4px var(--intake-accent);
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
  color: var(--intake-accent);
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  text-align: left;
  width: fit-content;
}
.pi-ip-sidebar { display: grid; gap: 20px; min-width: 0; padding-top: 72px; }
@media (max-width: 960px) { .pi-ip-sidebar { padding-top: 0; } }
.pi-ip-side-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  padding: 22px;
  box-shadow: 0 2px 10px #17213c05;
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
.pi-ip-side-price { font-size: 1.2rem; font-weight: 800; color: var(--intake-accent); }
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
.pi-ip-side-fine { margin: 0; font-size: 0.78rem; color: #64748b; line-height: 1.5; }
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
.pi-ip-auth { padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background: white; }
.pi-ip-medicaid-note { padding: 16px; border-radius: 8px; }
.pi-ip-choice { font: inherit; color: inherit; min-width: 0; }
.pi-ip-choice:focus-visible, .pi-ip-input:focus-visible { outline: 2px solid var(--intake-accent); outline-offset: 3px; }
.pi-ip input[type="checkbox"] { accent-color: var(--intake-accent); }
.pi-ip-side-total strong { text-align: right; }
.pi-ip-sign input { min-width: 0; width: 100%; box-sizing: border-box; }
</style>
