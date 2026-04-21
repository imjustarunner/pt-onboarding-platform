<template>
  <div class="pi-ins">
    <!-- Step description + non-Medicaid disclaimer -->
    <p v-if="stepConfig.nonMedicaidDisclaimerText && !allMedicaid" class="pi-ins-disclaimer">
      {{ stepConfig.nonMedicaidDisclaimerText }}
    </p>

    <!--
      Parent feedback: self-pay families were typing "self pay" into the
      insurance-carrier typeahead, which doesn't match any insurer and makes
      validation awkward. Surface a first-class toggle at the very top so they
      can declare self-pay in one click; the rest of the form then collapses
      to a short confirmation instead of asking for a carrier/member ID they
      don't have.
    -->
    <div class="pi-ins-selfpay">
      <label class="pi-ins-selfpay-row" :class="{ 'pi-ins-selfpay-row--active': isSelfPay }">
        <input type="checkbox" :checked="isSelfPay" @change="toggleSelfPay($event.target.checked)" />
        <span>
          <strong>I am self-pay</strong>
          <span class="pi-ins-selfpay-sub">— I don't have insurance to bill, or I prefer to pay out of pocket.</span>
        </span>
      </label>
      <p v-if="isSelfPay" class="pi-ins-selfpay-note">
        Thanks! We'll record this as self-pay. You can skip the insurance carrier / member ID fields below
        and proceed to sign the authorization at the bottom of this page.
      </p>
    </div>

    <!-- PRIMARY INSURANCE -->
    <div v-if="!isSelfPay" class="pi-ins-card">
      <h4 class="pi-ins-card-title">Primary Insurance</h4>
      <p class="pi-ins-card-tip">
        Start by uploading your insurance card images. We will auto-fill what we can, and you can edit anything below.
      </p>

      <div class="form-group">
        <label class="pi-ins-lbl">Insurance Carrier Name <span class="req">*</span></label>
        <div class="pi-ins-typeahead" ref="primarySearchRef">
          <input
            v-model="primaryQuery"
            type="text"
            class="pi-ins-input"
            placeholder="Start typing to search (e.g. Health First Colorado, Aetna…)"
            autocomplete="off"
            @input="onPrimaryInput"
            @focus="primaryOpen = true"
            @blur="onPrimaryBlur"
          />
          <div v-if="primaryOpen && primarySuggestions.length" class="pi-ins-dropdown">
            <div
              v-for="ins in primarySuggestions"
              :key="ins.label"
              class="pi-ins-option"
              :class="{ 'pi-ins-option--medicaid': ins.group === 'Medicaid' }"
              @mousedown.prevent="selectPrimary(ins)"
            >
              <span>{{ ins.label }}</span>
              <span v-if="ins.group === 'Medicaid'" class="pi-ins-badge">Medicaid</span>
            </div>
          </div>
        </div>
        <div v-if="primaryIsMedicaid" class="pi-ins-medicaid-notice">
          ✓ Medicaid detected — no self-pay cost applies for this program.
        </div>
        <div v-if="primaryIsMedicaid" class="pi-ins-field-note">
          If the child has other primary insurance, list that other plan as Primary and add Medicaid under Secondary.
        </div>
      </div>
      <div class="pi-ins-quickfill">
        <button
          v-if="guardianDisplayName"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="fillPrimarySubscriberFromGuardian"
        >
          {{ props.intakeForSelf ? 'Use My Name' : 'Use Guardian Name' }}
        </button>
        <button
          v-if="firstClientDisplayName && !props.intakeForSelf"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="fillPrimarySubscriberFromFirstClient"
        >
          Use Client 1 Name
        </button>
      </div>

      <!-- Insurance card photos -->
      <div
        class="pi-ins-photos"
        data-pi-ins-anchor="card"
        :class="{ 'pi-ins-photos--err': !!validationErrorFor('card') }"
      >
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">Insurance card – front</label>
          <div class="pi-ins-photo-area" @click="triggerUpload('primary_front')">
            <img v-if="primaryFrontPreview" :src="primaryFrontPreview" alt="Front of card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder">
              <span>📷</span>
              <span>Tap to take photo or upload</span>
            </div>
          </div>
          <input
            ref="primaryFrontInput"
            type="file"
            accept="image/*"
            capture="environment"
            style="display:none"
            @change="(e) => onPhotoSelected(e, 'primary_front')"
          />
          <button v-if="primaryFrontPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('primary_front')">
            Remove
          </button>
        </div>
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">Insurance card – back</label>
          <div class="pi-ins-photo-area" @click="triggerUpload('primary_back')">
            <img v-if="primaryBackPreview" :src="primaryBackPreview" alt="Back of card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder">
              <span>📷</span>
              <span>Tap to take photo or upload</span>
            </div>
          </div>
          <input
            ref="primaryBackInput"
            type="file"
            accept="image/*"
            capture="environment"
            style="display:none"
            @change="(e) => onPhotoSelected(e, 'primary_back')"
          />
          <button v-if="primaryBackPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('primary_back')">
            Remove
          </button>
        </div>
      </div>
      <div class="pi-ins-no-card">
        <label class="checkbox-row">
          <input v-model="noPrimaryCardAvailable" type="checkbox" @change="onNoPrimaryCardToggle" />
          <span>I do not have my primary insurance card right now</span>
        </label>
      </div>
      <div v-if="validationErrorFor('card')" class="pi-ins-inline-error">
        {{ validationErrorFor('card') }}
      </div>

      <div class="pi-ins-grid">
        <div class="form-group">
          <label class="pi-ins-lbl">Subscriber Name</label>
          <input
            v-model="local.primary.subscriberName"
            class="pi-ins-input"
            type="text"
            :placeholder="primaryIsMedicaid ? 'Child name' : 'Parent / Guardian name'"
          />
          <div class="pi-ins-field-note">
            {{ primaryIsMedicaid
              ? 'For Medicaid-only coverage, this is usually the child.'
              : 'For private/commercial plans, this is usually the parent/guardian policy holder.' }}
          </div>
        </div>
        <div class="form-group" data-pi-ins-anchor="memberId">
          <label class="pi-ins-lbl">Subscriber ID / Member ID</label>
          <input
            v-model="local.primary.memberId"
            class="pi-ins-input"
            :class="{ 'pi-ins-input--err': !!validationErrorFor('memberId') && !String(local.primary.memberId || '').trim() }"
            type="text"
            placeholder="e.g. COA123456789"
          />
          <div v-if="validationErrorFor('memberId')" class="pi-ins-inline-error">
            {{ validationErrorFor('memberId') }}
          </div>
          <div v-if="primaryIsMedicaid" class="pi-ins-field-note">
            For Medicaid plans, Member ID is recommended but not required.
          </div>
        </div>
        <div v-if="!primaryIsMedicaid" class="form-group">
          <label class="pi-ins-lbl">Group number (if applicable)</label>
          <input v-model="local.primary.groupNumber" class="pi-ins-input" type="text" placeholder="Optional" />
        </div>
        <div v-if="!primaryIsMedicaid" class="form-group">
          <label class="pi-ins-lbl">Patient suffix</label>
          <input v-model="local.primary.patientSuffix" class="pi-ins-input" type="text" placeholder="e.g. -01, -02" />
          <div class="pi-ins-field-note">
            Common on private/commercial plans.
          </div>
        </div>
      </div>

      <div v-if="showMultiClientMedicaidSection" class="pi-ins-multi-client">
        <h5>Per-Client Medicaid Member IDs</h5>
        <p class="pi-ins-field-note" style="margin-top: 0;">
          Since this intake includes multiple clients, capture each child’s Medicaid Member ID so billing is stored correctly per client.
        </p>
        <div v-for="(row, idx) in medicaidByClient" :key="`medicaid-client-${idx}`" class="form-group">
          <label class="pi-ins-lbl">
            {{ clientDisplayNames[idx] || `Client ${idx + 1}` }} — Medicaid Member ID
          </label>
          <input
            v-model="row.memberId"
            class="pi-ins-input"
            type="text"
            placeholder="Enter this client's Medicaid ID"
          />
        </div>
      </div>
    </div>

    <p v-if="!isSelfPay && displayedSecondaryDisclaimer" class="pi-ins-disclaimer pi-ins-secondary-notice">
      {{ displayedSecondaryDisclaimer }}
    </p>

    <!-- SECONDARY INSURANCE (optional) -->
    <div v-if="!isSelfPay" class="pi-ins-secondary-toggle">
      <label class="checkbox-row">
        <input v-model="hasSecondary" type="checkbox" />
        <span>I have secondary insurance to add</span>
      </label>
    </div>

    <div v-if="!isSelfPay && hasSecondary" class="pi-ins-card">
      <h4 class="pi-ins-card-title">Secondary Insurance</h4>

      <div class="form-group">
        <label class="pi-ins-lbl">Insurance Carrier Name</label>
        <div class="pi-ins-typeahead">
          <input
            v-model="secondaryQuery"
            type="text"
            class="pi-ins-input"
            placeholder="Start typing to search…"
            autocomplete="off"
            @input="onSecondaryInput"
            @focus="secondaryOpen = true"
            @blur="onSecondaryBlur"
          />
          <div v-if="secondaryOpen && secondarySuggestions.length" class="pi-ins-dropdown">
            <div
              v-for="ins in secondarySuggestions"
              :key="ins.label"
              class="pi-ins-option"
              :class="{ 'pi-ins-option--medicaid': ins.group === 'Medicaid' }"
              @mousedown.prevent="selectSecondary(ins)"
            >
              <span>{{ ins.label }}</span>
              <span v-if="ins.group === 'Medicaid'" class="pi-ins-badge">Medicaid</span>
            </div>
          </div>
        </div>
        <div class="pi-ins-field-note">
          This is often where Medicaid is listed when the child also has other primary coverage.
          TRICARE is generally primary over Medicaid when both are present.
        </div>
      </div>

      <div class="pi-ins-grid">
        <div class="form-group">
          <label class="pi-ins-lbl">Member ID</label>
          <input v-model="local.secondary.memberId" class="pi-ins-input" type="text" placeholder="Optional" />
        </div>
        <div v-if="!secondaryIsMedicaid" class="form-group">
          <label class="pi-ins-lbl">Group number</label>
          <input v-model="local.secondary.groupNumber" class="pi-ins-input" type="text" placeholder="Optional" />
        </div>
        <div v-if="!secondaryIsMedicaid" class="form-group">
          <label class="pi-ins-lbl">Subscriber name</label>
          <input v-model="local.secondary.subscriberName" class="pi-ins-input" type="text" placeholder="Optional" />
        </div>
      </div>

      <div class="pi-ins-photos">
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">Secondary card – front</label>
          <div class="pi-ins-photo-area" @click="triggerUpload('secondary_front')">
            <img v-if="secondaryFrontPreview" :src="secondaryFrontPreview" alt="Front of secondary card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder"><span>📷</span><span>Tap to upload</span></div>
          </div>
          <input ref="secondaryFrontInput" type="file" accept="image/*" capture="environment" style="display:none"
            @change="(e) => onPhotoSelected(e, 'secondary_front')" />
          <button v-if="secondaryFrontPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('secondary_front')">Remove</button>
        </div>
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">Secondary card – back</label>
          <div class="pi-ins-photo-area" @click="triggerUpload('secondary_back')">
            <img v-if="secondaryBackPreview" :src="secondaryBackPreview" alt="Back of secondary card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder"><span>📷</span><span>Tap to upload</span></div>
          </div>
          <input ref="secondaryBackInput" type="file" accept="image/*" capture="environment" style="display:none"
            @change="(e) => onPhotoSelected(e, 'secondary_back')" />
          <button v-if="secondaryBackPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('secondary_back')">Remove</button>
        </div>
      </div>
    </div>

    <div v-if="!isSelfPay" class="pi-ins-card pi-ins-guarantor-card">
      <h4 class="pi-ins-card-title">Responsible Party (Guarantor)</h4>
      <p class="pi-ins-field-note" style="margin-top: 0;">
        Name: Parent/Guardian
      </p>
      <p class="pi-ins-field-note">
        Contact info: captured earlier in intake and used for billing/consent communications.
      </p>
    </div>

    <!-- Insurance disclaimer -->
    <div v-if="!isSelfPay" class="pi-ins-footer-notice">
      <p>
        <strong>Please note:</strong> Not all insurances are accepted by all providers.
        If this program or class is not covered by your insurance, we may still submit a claim to your
        insurer in the event coverage has changed. All payments collected via our web application will
        be listed as collected outside of our EHR platform and applied to billing claims as necessary.
        Medicaid (Health First Colorado) clients are enrolled at no cost to the family for eligible programs.
      </p>
    </div>

    <!-- Insurance Authorization Acknowledgment -->
    <div
      class="pi-ins-auth-block"
      :class="{ 'pi-ins-auth-block--err': !!validationErrorFor('authorization') }"
      ref="authBlockRef"
      data-pi-ins-anchor="authorization"
    >
      <h4 class="pi-ins-auth-title">Insurance Authorization &amp; Assignment of Benefits</h4>
      <div class="pi-ins-auth-text">
        <p>
          I authorize <strong>{{ props.agencyName || 'the provider' }}</strong> to release information to the insurance companies provided on this form in order to submit insurance claims on my behalf.
        </p>
        <p>
          This authorization extends to the extent necessary to obtain payment for the services provided to me, and includes authorization to release information about mental health, substance use, or HIV diagnoses as required.
        </p>
        <p>
          In consideration of the services provided to me, I assign all benefits to <strong>{{ props.agencyName || 'the provider' }}</strong> if accepted, and authorize my insurance companies, Medicare, or other third-party payers to make payments directly to <strong>{{ props.agencyName || 'the provider' }}</strong> and its affiliates.
        </p>
        <p>
          I understand that I remain responsible for all amounts due by me, including (but not limited to) copays, coinsurance, deductible amounts, and all services not covered by my insurance plan (including those for which I fail to obtain prior authorization), and mutually agreed-upon services or fees that are deemed not medically necessary.
        </p>
        <p class="pi-ins-auth-esign-notice">
          This is a binding electronic signature. By signing below, you acknowledge that your
          electronic signature has the same legal effect as a hand-written one. We record your
          name, the date and time you signed, your IP address, and your browser at finalize time
          and embed that information in the signed PDF kept on file.
        </p>
      </div>

      <div v-if="validationErrorFor('authorization')" class="pi-ins-auth-error">
        {{ validationErrorFor('authorization') }}
      </div>

      <!-- PRIMARY PATH: re-use the signature drawn earlier in this session -->
      <div v-if="savedSignatureData" class="pi-ins-auth-sign">
        <label class="pi-ins-lbl">Sign this authorization</label>
        <div v-if="!authorizationSignatureData" class="pi-ins-auth-apply-wrap">
          <button
            type="button"
            class="btn btn-primary btn-sm pi-ins-auth-apply pi-ins-auth-apply--pulse"
            @click="applySavedAuthSignature"
          >
            Apply my signature to this authorization
          </button>
          <span class="pi-ins-field-note">
            We'll re-use the signature you drew earlier in this session — same legal weight as
            signing here in pen, and you'll see it on the signed PDF.
          </span>
        </div>
        <div v-else class="pi-ins-auth-applied-wrap">
          <div class="pi-ins-auth-applied">
            <span class="pi-ins-auth-check">&#10003;</span>
            <div>
              <div>
                <strong>Signed</strong>
                <span v-if="props.guardianName"> by {{ props.guardianName }}</span>
              </div>
              <div class="pi-ins-auth-stamp">
                e-Signature applied {{ formatSignedAt(authorizationSignedAt) }} ·
                source: reused signature from earlier in this session
              </div>
            </div>
          </div>
          <button
            type="button"
            class="btn btn-secondary btn-sm pi-ins-auth-resign"
            @click="resignAuth"
          >
            Sign again
          </button>
        </div>
      </div>

      <!-- FALLBACK PATH: typed signature for parents who didn't draw one earlier
           (e.g. they bypassed the drawn-signature step). We still capture audit
           metadata so the PDF can show the same "signed by + when + how" block. -->
      <div v-else class="pi-ins-auth-sign">
        <label class="pi-ins-lbl" for="ins-auth-sig">
          Type your name to sign this authorization <span class="req">*</span>
        </label>
        <input
          id="ins-auth-sig"
          :value="authorizationSignature"
          type="text"
          class="pi-ins-input"
          :class="{ 'pi-ins-input--err': !!validationErrorFor('authorization') && !authorizationSignature.trim() }"
          placeholder="Your name"
          autocomplete="name"
          @input="onTypedAuthInput($event.target.value)"
        />
        <div v-if="authorizationSignature.trim().length >= 2" class="pi-ins-auth-confirmed">
          ✓ Signed by {{ authorizationSignature.trim() }}
          <span v-if="authorizationSignedAt" class="pi-ins-auth-stamp"> ({{ formatSignedAt(authorizationSignedAt) }})</span>
        </div>
        <div class="pi-ins-field-note">
          You can use whatever name you go by — it does not have to be your legal name. We'll
          capture the date, time, IP, and browser as part of the audit trail.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { filterInsurances, isMedicaidInsurer } from '../../utils/coloradoInsurances.js';

const DEFAULT_SECONDARY_INSURANCE_NOTICE =
  'If your household carries secondary (supplemental) insurance in addition to the primary plan above, please add it using the option below or contact us promptly with complete policy information. Failure to provide complete and accurate coverage details—including applicable secondary insurance when it exists—may delay authorizations or benefit verification and could result in interruptions or delays in services.';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  stepConfig: { type: Object, default: () => ({}) },
  guardianName: { type: String, default: '' },
  guardianRelationship: { type: String, default: '' },
  guardianPhone: { type: String, default: '' },
  clientNames: { type: Array, default: () => [] },
  intakeForSelf: { type: Boolean, default: false },
  agencyName: { type: String, default: '' },
  /**
   * The signature image data URL the parent already drew earlier in the
   * intake. When present, the Insurance Authorization block lets them re-use
   * it (preferred) instead of typing a name into a text box. Same legal
   * weight, way more legitimate-looking on the saved PDF, and matches how
   * the rest of the document signing step works.
   */
  savedSignatureData: { type: String, default: '' },
  /**
   * Map of inline validation errors keyed by anchor:
   *   { card: '...', memberId: '...', authorization: '...' }
   * The parent step populates this when it blocks Continue so the parent
   * sees the offending control highlighted, instead of just a top banner
   * they have to scroll up to read.
   */
  validationErrors: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['update:modelValue', 'medicaid-change']);

// ── Local state ──────────────────────────────────────────────────────────────
const local = reactive({
  primary: {
    insurerName: props.modelValue?.primary?.insurerName || '',
    memberId: props.modelValue?.primary?.memberId || '',
    groupNumber: props.modelValue?.primary?.groupNumber || '',
    patientSuffix: props.modelValue?.primary?.patientSuffix || '',
    subscriberName: props.modelValue?.primary?.subscriberName || '',
    isMedicaid: props.modelValue?.primary?.isMedicaid || false
  },
  secondary: {
    insurerName: props.modelValue?.secondary?.insurerName || '',
    memberId: props.modelValue?.secondary?.memberId || '',
    groupNumber: props.modelValue?.secondary?.groupNumber || '',
    subscriberName: props.modelValue?.secondary?.subscriberName || '',
    isMedicaid: props.modelValue?.secondary?.isMedicaid || false
  }
});

const hasSecondary = ref(!!(props.modelValue?.secondary?.insurerName));
const noPrimaryCardAvailable = ref(!!props.modelValue?.noPrimaryCardAvailable);
// Self-pay toggle — persisted alongside the rest of the insurance info so the
// flag survives save/resume and downstream consumers (billing, reports) can
// distinguish "declined to provide" from "explicitly self-pay".
const isSelfPay = ref(
  !!props.modelValue?.isSelfPay
  || String(props.modelValue?.primary?.insurerName || '').trim().toLowerCase() === 'self-pay'
  || String(props.modelValue?.primary?.insurerName || '').trim().toLowerCase() === 'self pay'
);
const medicaidByClient = ref(
  Array.isArray(props.modelValue?.medicaidByClient)
    ? props.modelValue.medicaidByClient.map((row) => ({
        clientIndex: Number(row?.clientIndex || 0),
        clientName: String(row?.clientName || ''),
        memberId: String(row?.memberId || '')
      }))
    : []
);

// Photo file references (File objects kept in memory; uploaded on submit)
const photoFiles = reactive({ primary_front: null, primary_back: null, secondary_front: null, secondary_back: null });
const primaryFrontPreview = ref(props.modelValue?.photos?.primary_front_preview || '');
const primaryBackPreview = ref(props.modelValue?.photos?.primary_back_preview || '');
const secondaryFrontPreview = ref(props.modelValue?.photos?.secondary_front_preview || '');
const secondaryBackPreview = ref(props.modelValue?.photos?.secondary_back_preview || '');

// Refs for file inputs
const primaryFrontInput = ref(null);
const primaryBackInput = ref(null);
const secondaryFrontInput = ref(null);
const secondaryBackInput = ref(null);

// Typeahead
const primaryQuery = ref(local.primary.insurerName);
const primaryOpen = ref(false);
const primarySuggestions = computed(() => filterInsurances(primaryQuery.value));

const secondaryQuery = ref(local.secondary.insurerName);
const secondaryOpen = ref(false);
const secondarySuggestions = computed(() => filterInsurances(secondaryQuery.value));

const primaryIsMedicaid = computed(() => isMedicaidInsurer(local.primary.insurerName));
const secondaryIsMedicaid = computed(() => isMedicaidInsurer(local.secondary.insurerName));
const allMedicaid = computed(() => primaryIsMedicaid.value && (!hasSecondary.value || isMedicaidInsurer(local.secondary.insurerName)));
const guardianDisplayName = computed(() => String(props.guardianName || '').trim());
const firstClientDisplayName = computed(() => String((props.clientNames || [])[0] || '').trim());
const clientDisplayNames = computed(() =>
  (Array.isArray(props.clientNames) ? props.clientNames : []).map((name, idx) => {
    const clean = String(name || '').trim();
    return clean || `Client ${idx + 1}`;
  })
);
const medicaidPlanPosition = computed(() => {
  if (primaryIsMedicaid.value) return 'primary';
  if (hasSecondary.value && secondaryIsMedicaid.value) return 'secondary';
  return '';
});
const showMultiClientMedicaidSection = computed(() =>
  clientDisplayNames.value.length > 1 && !!medicaidPlanPosition.value
);

const displayedSecondaryDisclaimer = computed(() => {
  const custom = String(props.stepConfig?.secondaryInsuranceDisclaimerText || '').trim();
  return custom || DEFAULT_SECONDARY_INSURANCE_NOTICE;
});

// ── Typeahead handlers ───────────────────────────────────────────────────────
function onPrimaryInput() {
  primaryOpen.value = true;
  local.primary.insurerName = primaryQuery.value;
  local.primary.isMedicaid = isMedicaidInsurer(primaryQuery.value);
  push();
}
function onPrimaryBlur() {
  setTimeout(() => { primaryOpen.value = false; }, 150);
}
function selectPrimary(ins) {
  primaryQuery.value = ins.label;
  local.primary.insurerName = ins.label;
  local.primary.isMedicaid = ins.group === 'Medicaid';
  primaryOpen.value = false;
  push();
}
function onSecondaryInput() {
  secondaryOpen.value = true;
  local.secondary.insurerName = secondaryQuery.value;
  local.secondary.isMedicaid = isMedicaidInsurer(secondaryQuery.value);
  push();
}
function onSecondaryBlur() {
  setTimeout(() => { secondaryOpen.value = false; }, 150);
}
function selectSecondary(ins) {
  secondaryQuery.value = ins.label;
  local.secondary.insurerName = ins.label;
  local.secondary.isMedicaid = ins.group === 'Medicaid';
  secondaryOpen.value = false;
  push();
}

// ── Photo upload ─────────────────────────────────────────────────────────────
function triggerUpload(slot) {
  const map = {
    primary_front: primaryFrontInput,
    primary_back: primaryBackInput,
    secondary_front: secondaryFrontInput,
    secondary_back: secondaryBackInput
  };
  map[slot]?.value?.click();
}
function onPhotoSelected(event, slot) {
  const file = event.target.files?.[0];
  if (!file) return;
  photoFiles[slot] = file;
  if (slot === 'primary_front' || slot === 'primary_back') noPrimaryCardAvailable.value = false;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (slot === 'primary_front') primaryFrontPreview.value = e.target.result;
    else if (slot === 'primary_back') primaryBackPreview.value = e.target.result;
    else if (slot === 'secondary_front') secondaryFrontPreview.value = e.target.result;
    else if (slot === 'secondary_back') secondaryBackPreview.value = e.target.result;
    push();
  };
  reader.readAsDataURL(file);
}
function clearPhoto(slot) {
  photoFiles[slot] = null;
  if (slot === 'primary_front') primaryFrontPreview.value = '';
  else if (slot === 'primary_back') primaryBackPreview.value = '';
  else if (slot === 'secondary_front') secondaryFrontPreview.value = '';
  else if (slot === 'secondary_back') secondaryBackPreview.value = '';
  push();
}

function onNoPrimaryCardToggle() {
  if (!noPrimaryCardAvailable.value) {
    push();
    return;
  }
  photoFiles.primary_front = null;
  photoFiles.primary_back = null;
  primaryFrontPreview.value = '';
  primaryBackPreview.value = '';
  push();
}

function fillPrimarySubscriberFromGuardian() {
  if (!guardianDisplayName.value) return;
  local.primary.subscriberName = guardianDisplayName.value;
  push();
}

function fillPrimarySubscriberFromFirstClient() {
  if (!firstClientDisplayName.value) return;
  local.primary.subscriberName = firstClientDisplayName.value;
  push();
}

function toggleSelfPay(checked) {
  isSelfPay.value = !!checked;
  if (isSelfPay.value) {
    // Stamp an explicit "Self-Pay" carrier so back-office reports can filter
    // on insurer_name and so the typeahead renders a clear value if the
    // guardian comes back to this step. Clear any Medicaid state so billing
    // downstream doesn't try to route the file as a Medicaid claim.
    local.primary.insurerName = 'Self-Pay';
    local.primary.isMedicaid = false;
    primaryQuery.value = 'Self-Pay';
    hasSecondary.value = false;
    local.secondary.insurerName = '';
    local.secondary.memberId = '';
    local.secondary.groupNumber = '';
    local.secondary.subscriberName = '';
    local.secondary.isMedicaid = false;
    noPrimaryCardAvailable.value = true;
  } else {
    // Un-toggling clears the "Self-Pay" stamp but leaves every other field
    // alone so if a guardian re-opens the card form they don't have to
    // rebuild what they had.
    if (String(local.primary.insurerName || '').trim().toLowerCase() === 'self-pay') {
      local.primary.insurerName = '';
      primaryQuery.value = '';
    }
    noPrimaryCardAvailable.value = false;
  }
  push();
}

// ── Emit helpers ─────────────────────────────────────────────────────────────
function push() {
  const medicaidRows = showMultiClientMedicaidSection.value
    ? medicaidByClient.value.map((row, idx) => ({
        clientIndex: idx,
        clientName: clientDisplayNames.value[idx] || `Client ${idx + 1}`,
        memberId: String(row?.memberId || '').trim()
      }))
    : [];
  const out = {
    primary: { ...local.primary },
    secondary: hasSecondary.value ? { ...local.secondary } : null,
    photos: {
      primary_front_preview: primaryFrontPreview.value,
      primary_back_preview: primaryBackPreview.value,
      secondary_front_preview: secondaryFrontPreview.value,
      secondary_back_preview: secondaryBackPreview.value
    },
    noPrimaryCardAvailable: noPrimaryCardAvailable.value,
    hasSecondary: hasSecondary.value,
    primaryIsMedicaid: primaryIsMedicaid.value,
    medicaidPlanPosition: medicaidPlanPosition.value || null,
    medicaidByClient: medicaidRows,
    isSelfPay: isSelfPay.value
  };
  emit('update:modelValue', out);
  emit('medicaid-change', primaryIsMedicaid.value);
}

/** Returns the photo File objects (for upload at form finalize time). */
function getPhotoFiles() {
  return { ...photoFiles };
}

function getInsuranceEntryState() {
  const hasPrimaryCardPhoto = Boolean(
    photoFiles.primary_front
    || photoFiles.primary_back
    || primaryFrontPreview.value
    || primaryBackPreview.value
    || props.modelValue?.primary_front_url
    || props.modelValue?.primary_back_url
  );
  return {
    hasPrimaryCardPhoto,
    noPrimaryCardAvailable: !!noPrimaryCardAvailable.value,
    isSelfPay: !!isSelfPay.value
  };
}

watch([() => local.primary, () => local.secondary, hasSecondary], push, { deep: true });
watch(
  [primaryIsMedicaid, guardianDisplayName, firstClientDisplayName],
  () => {
    if (String(local.primary.subscriberName || '').trim()) return;
    if (primaryIsMedicaid.value && firstClientDisplayName.value) {
      local.primary.subscriberName = firstClientDisplayName.value;
      push();
      return;
    }
    if (!primaryIsMedicaid.value && guardianDisplayName.value) {
      local.primary.subscriberName = guardianDisplayName.value;
      push();
    }
  },
  { immediate: true }
);
watch(
  [clientDisplayNames, showMultiClientMedicaidSection],
  () => {
    const names = clientDisplayNames.value;
    if (!names.length) {
      medicaidByClient.value = [];
      push();
      return;
    }
    const base = Array.isArray(medicaidByClient.value) ? medicaidByClient.value : [];
    medicaidByClient.value = names.map((name, idx) => ({
      clientIndex: idx,
      clientName: name,
      memberId: String(base[idx]?.memberId || '')
    }));
    if (!local.primary.subscriberName && !primaryIsMedicaid.value && guardianDisplayName.value) {
      local.primary.subscriberName = guardianDisplayName.value;
    } else if (!local.primary.subscriberName && primaryIsMedicaid.value && names.length) {
      local.primary.subscriberName = names[0];
    }
    push();
  },
  { immediate: true, deep: true }
);

const authorizationSignature = ref(String(props.modelValue?.authorizationSignature || ''));
const authorizationSignatureData = ref(String(props.modelValue?.authorizationSignatureData || ''));
const authorizationSignedAt = ref(String(props.modelValue?.authorizationSignedAt || ''));
const authorizationSourceMethod = ref(String(props.modelValue?.authorizationSourceMethod || ''));
const authBlockRef = ref(null);

function getAuthorizationSignature() {
  return authorizationSignature.value;
}

function getAuthorizationSignatureBundle() {
  return {
    authorizationSignature: authorizationSignature.value,
    authorizationSignatureData: authorizationSignatureData.value,
    authorizationSignedAt: authorizationSignedAt.value,
    authorizationSourceMethod: authorizationSourceMethod.value
  };
}

function applySavedAuthSignature() {
  const sig = String(props.savedSignatureData || '').trim();
  if (!sig) return;
  authorizationSignatureData.value = sig;
  authorizationSignedAt.value = new Date().toISOString();
  authorizationSourceMethod.value = 'reused_guardian_signature';
  // Mirror the displayed signer name into authorizationSignature so legacy
  // PDF readers that only know about the typed-name field still surface
  // *something* in the "Signed by" line. The data URL is the real artifact.
  if (!authorizationSignature.value.trim() && props.guardianName) {
    authorizationSignature.value = String(props.guardianName).trim();
  }
  push();
}

function resignAuth() {
  authorizationSignatureData.value = '';
  authorizationSignedAt.value = '';
  authorizationSourceMethod.value = '';
  push();
}

function onTypedAuthInput(v) {
  authorizationSignature.value = String(v || '');
  if (authorizationSignature.value.trim().length >= 2) {
    if (!authorizationSignedAt.value) {
      authorizationSignedAt.value = new Date().toISOString();
    }
    if (!authorizationSourceMethod.value) {
      authorizationSourceMethod.value = 'typed_full_name';
    }
  } else {
    authorizationSignedAt.value = '';
    authorizationSourceMethod.value = '';
  }
  push();
}

function formatSignedAt(iso) {
  if (!iso) return 'just now';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return 'just now';
    return d.toLocaleString();
  } catch {
    return 'just now';
  }
}

function validationErrorFor(anchor) {
  const map = props.validationErrors || {};
  return String(map[anchor] || '').trim();
}

function scrollToAnchor(anchor) {
  const el = (anchor === 'authorization')
    ? authBlockRef.value
    : (typeof document !== 'undefined'
        ? document.querySelector(`[data-pi-ins-anchor="${anchor}"]`)
        : null);
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Watch the auth-signature trio and re-emit so the parent step always
// sees the latest signature artifact + timestamp + source method at
// finalize time. push() above already emits modelValue; this watcher
// just makes sure another push happens whenever the auth signature
// fields change so the parent's reactive ref picks it up. We also
// stash the bundle directly on props.modelValue so legacy pickers
// still see the typed-name field via the same key.
watch(
  [authorizationSignature, authorizationSignatureData, authorizationSignedAt, authorizationSourceMethod],
  () => {
    const insBag = props.modelValue;
    if (insBag && typeof insBag === 'object') {
      insBag.authorizationSignature = authorizationSignature.value;
      insBag.authorizationSignatureData = authorizationSignatureData.value;
      insBag.authorizationSignedAt = authorizationSignedAt.value;
      insBag.authorizationSourceMethod = authorizationSourceMethod.value;
    }
    push();
  }
);

// Expose for parent
defineExpose({
  getPhotoFiles,
  getInsuranceEntryState,
  primaryIsMedicaid,
  getAuthorizationSignature,
  getAuthorizationSignatureBundle,
  scrollToAnchor
});
</script>

<style scoped>
.pi-ins {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.pi-ins-disclaimer {
  background: #fef9c3;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.5;
  color: #713f12;
}
.pi-ins-selfpay {
  margin-bottom: 4px;
}
.pi-ins-selfpay-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
  cursor: pointer;
  font-size: 14px;
}
.pi-ins-selfpay-row--active {
  background: #ecfdf5;
  border-style: solid;
  border-color: #86efac;
}
.pi-ins-selfpay-sub {
  color: var(--text-secondary, #64748b);
  font-weight: 400;
  margin-left: 6px;
}
.pi-ins-selfpay-note {
  margin: 8px 0 0;
  padding: 10px 14px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  font-size: 13.5px;
  color: #166534;
}
.pi-ins-secondary-notice {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1e3a5f;
}
.pi-ins-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 16px;
  background: var(--bg, #fff);
}
.pi-ins-card-title {
  margin: 0 0 12px;
  font-size: 1rem;
}
.pi-ins-card-tip {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
}
.pi-ins-quickfill {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.pi-ins-lbl {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}
.req { color: var(--danger, #dc2626); }
.pi-ins-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  box-sizing: border-box;
}
.pi-ins-typeahead {
  position: relative;
}
.pi-ins-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 50;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.1);
  max-height: 220px;
  overflow-y: auto;
}
.pi-ins-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
  gap: 8px;
}
.pi-ins-option:hover { background: #f1f5f9; }
.pi-ins-option--medicaid { background: #f0fdf4; }
.pi-ins-option--medicaid:hover { background: #dcfce7; }
.pi-ins-badge {
  font-size: 11px;
  font-weight: 600;
  background: #16a34a;
  color: #fff;
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}
.pi-ins-medicaid-notice {
  margin-top: 6px;
  font-size: 13px;
  color: #166534;
  font-weight: 600;
}
.pi-ins-field-note {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary, #64748b);
}
.pi-ins-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}
@media (max-width: 640px) {
  .pi-ins-grid { grid-template-columns: 1fr; }
}
.pi-ins-photos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 14px;
}
@media (max-width: 500px) {
  .pi-ins-photos { grid-template-columns: 1fr; }
}
.pi-ins-photo-slot {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pi-ins-photo-area {
  border: 2px dashed var(--border, #cbd5e1);
  border-radius: 10px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  background: var(--bg-alt, #f8fafc);
  transition: border-color .15s;
}
.pi-ins-photo-area:hover { border-color: var(--primary, #0f766e); }
.pi-ins-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pi-ins-photo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
}
.pi-ins-photo-placeholder span:first-child { font-size: 28px; }
.pi-ins-remove-btn {
  font-size: 12px;
  color: var(--danger, #dc2626);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.pi-ins-secondary-toggle {
  margin-top: 4px;
}
.pi-ins-no-card {
  margin-top: 10px;
}
.pi-ins-multi-client {
  margin-top: 14px;
  border-top: 1px solid var(--border, #e2e8f0);
  padding-top: 12px;
}
.pi-ins-multi-client h5 {
  margin: 0 0 8px;
  font-size: 0.95rem;
}
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.pi-ins-footer-notice {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
}
.pi-ins-footer-notice p { margin: 0; }

.pi-ins-auth-block {
  border: 2px solid var(--primary, #0f766e);
  border-radius: 10px;
  padding: 18px 20px;
  background: #f0fdfa;
}
.pi-ins-auth-title {
  margin: 0 0 12px;
  font-size: 1rem;
  color: var(--primary, #0f766e);
}
.pi-ins-auth-text {
  font-size: 13px;
  line-height: 1.65;
  color: #334155;
  margin-bottom: 16px;
}
.pi-ins-auth-text p {
  margin: 0 0 10px;
}
.pi-ins-auth-text p:last-child { margin-bottom: 0; }
.pi-ins-auth-sign {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pi-ins-auth-confirmed {
  font-size: 13px;
  color: #059669;
  font-weight: 600;
  margin-top: 4px;
}
.pi-ins-auth-block--err {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  background: #fff8f8;
}
.pi-ins-auth-error {
  margin: 8px 0 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #fee2e2;
  color: #991b1b;
  font-size: 13px;
  border: 1px solid #fecaca;
}
.pi-ins-input--err {
  border-color: #dc2626 !important;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12) !important;
}
.pi-ins-inline-error {
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #fee2e2;
  color: #991b1b;
  font-size: 12.5px;
  border: 1px solid #fecaca;
}
.pi-ins-photos--err {
  outline: 2px solid #dc2626;
  outline-offset: 4px;
  border-radius: 8px;
}
.pi-ins-auth-esign-notice {
  background: #f0fdfa;
  border-left: 3px solid #14b8a6;
  padding: 8px 12px;
  border-radius: 0 6px 6px 0;
  font-size: 12.5px;
  color: #115e59;
  margin-top: 4px;
}
.pi-ins-auth-apply-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pi-ins-auth-apply--pulse {
  animation: piInsAuthPulse 1.6s ease-in-out infinite;
}
@keyframes piInsAuthPulse {
  0%   { box-shadow: 0 0 0 0   rgba(15, 118, 110, 0.55); transform: translateY(0); }
  50%  { box-shadow: 0 0 0 10px rgba(15, 118, 110, 0);    transform: translateY(-1px); }
  100% { box-shadow: 0 0 0 0   rgba(15, 118, 110, 0);    transform: translateY(0); }
}
.pi-ins-auth-applied-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  background: #ecfdf5;
  border: 1px solid #86efac;
  border-radius: 8px;
  padding: 10px 14px;
}
.pi-ins-auth-applied {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13.5px;
  color: #166534;
}
.pi-ins-auth-check {
  font-size: 18px;
  line-height: 1.1;
}
.pi-ins-auth-stamp {
  font-size: 11.5px;
  color: #475569;
  margin-top: 2px;
}
.pi-ins-auth-resign {
  align-self: flex-start;
  font-size: 12px;
}
</style>
