<template>
  <div class="pi-ins">
    <p v-if="fileError" class="pi-ins-inline-error" role="alert">{{ fileError }}</p>
    <!-- Step description + non-Medicaid disclaimer -->
    <p v-if="stepConfig.nonMedicaidDisclaimerText && !hasAnyMedicaid" class="pi-ins-disclaimer">
      {{ tx(stepConfig.nonMedicaidDisclaimerText) }}
    </p>

    <!--
      Parent feedback: self-pay families were typing "self pay" into the
      insurance-carrier typeahead, which doesn't match any insurer and makes
      validation awkward. Surface a first-class toggle at the very top so they
      can declare self-pay in one click; the rest of the form then collapses
      to a short confirmation instead of asking for a carrier/member ID they
      don't have.
    -->
    <div v-if="!hideSelfPayToggle" class="pi-ins-selfpay">
      <label class="pi-ins-selfpay-row" :class="{ 'pi-ins-selfpay-row--active': isSelfPay }">
        <input type="checkbox" :checked="isSelfPay" @change="toggleSelfPay($event.target.checked)" />
        <span>
          <strong>{{ tx('I am self-pay') }}</strong>
          <span class="pi-ins-selfpay-sub">{{ tx('— I don\'t have insurance to bill, or I prefer to pay out of pocket.') }}</span>
        </span>
      </label>
      <p v-if="isSelfPay" class="pi-ins-selfpay-note">
        {{ tx('Thanks! We\'ll record this as self-pay. You can skip the insurance carrier / member ID fields below and proceed to sign the authorization at the bottom of this page.') }}
      </p>
    </div>

    <!-- PRIMARY INSURANCE -->
    <div v-if="!isSelfPay" class="pi-ins-card">
      <h4 class="pi-ins-card-title">{{ tx('Primary Insurance') }}</h4>
      <p class="pi-ins-card-tip">
        {{ tx('Enter the policy details below and upload both sides of your insurance card. Our office will review your coverage.') }}
      </p>

      <div class="form-group">
        <label class="pi-ins-lbl">{{ tx('Insurance Carrier Name') }} <span class="req">*</span></label>
        <div class="pi-ins-typeahead" ref="primarySearchRef">
          <input
            v-model="primaryQuery"
            type="text"
            class="pi-ins-input"
            :placeholder="tx('Start typing to search (e.g. Health First Colorado, Aetna…)')"
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
          {{ tx('Medicaid recorded — our office will verify coverage for your services.') }}
        </div>
        <div v-if="primaryIsMedicaid" class="pi-ins-field-note">
          {{ tx('If the child has other primary insurance, list that other plan as Primary and add Medicaid under Secondary.') }}
        </div>
      </div>
      <div class="pi-ins-quickfill">
        <button
          v-if="guardianDisplayName"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="fillPrimarySubscriberFromGuardian"
        >
          {{ props.intakeForSelf ? tx('Use My Name') : tx('Use Guardian Name') }}
        </button>
        <button
          v-if="firstClientDisplayName && !props.intakeForSelf"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="fillPrimarySubscriberFromFirstClient"
        >
          {{ tx('Use Client 1 Name') }}
        </button>
      </div>

      <div class="pi-ins-grid">
        <div class="form-group">
          <label class="pi-ins-lbl">{{ tx('Subscriber Name') }}</label>
          <input
            v-model="local.primary.subscriberName"
            class="pi-ins-input"
            type="text"
            :placeholder="primaryIsMedicaid ? tx('Child name') : tx('Parent / Guardian name')"
          />
          <div class="pi-ins-field-note">
            {{ primaryIsMedicaid
              ? tx('For Medicaid-only coverage, this is usually the child.')
              : tx('For private/commercial plans, this is usually the parent/guardian policy holder.') }}
          </div>
        </div>
        <div class="form-group" data-pi-ins-anchor="memberId">
          <label class="pi-ins-lbl">{{ tx('Subscriber ID / Member ID') }}</label>
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
            {{ tx('For Medicaid plans, Member ID is recommended but not required.') }}
          </div>
        </div>
        <div v-if="!primaryIsMedicaid" class="form-group">
          <label class="pi-ins-lbl">{{ tx('Group number (if applicable)') }}</label>
          <input v-model="local.primary.groupNumber" class="pi-ins-input" type="text" :placeholder="tx('Optional')" />
        </div>
        <div v-if="!primaryIsMedicaid" class="form-group">
          <label class="pi-ins-lbl">{{ tx('Patient suffix') }}</label>
          <input v-model="local.primary.patientSuffix" class="pi-ins-input" type="text" placeholder="e.g. -01, -02" />
          <div class="pi-ins-field-note">
            {{ tx('Common on private/commercial plans.') }}
          </div>
        </div>
      </div>

      <div class="claim-fields">
        <h4>Primary subscriber</h4>
        <label>Client’s relationship to subscriber<select v-model="local.primary.relationshipToSubscriber" @change="push"><option value="">Select</option><option value="self">Self (client is the subscriber)</option><option value="child">Child</option><option value="spouse">Spouse</option><option value="other">Other</option></select></label>
        <label>Subscriber date of birth<input v-model="local.primary.subscriberDob" type="date" @change="push" /></label>
        <label>Subscriber sex on policy<select v-model="local.primary.subscriberSex" @change="push"><option value="">Select</option><option>M</option><option>F</option><option>U</option></select></label>
        <label v-for="field in [{key:'subscriberFirstName',label:'Subscriber legal first name'},{key:'subscriberLastName',label:'Subscriber legal last name'},{key:'subscriberAddressLine1',label:'Subscriber address'},{key:'subscriberCity',label:'City'},{key:'subscriberState',label:'State'},{key:'subscriberPostalCode',label:'ZIP code'},{key:'payerId',label:'Electronic payer ID (if known)'},{key:'planType',label:'Plan type (if known)'}]" :key="field.key">{{ field.label }}<input v-model="local.primary[field.key]" maxlength="255" @input="push" /></label>
      </div>
      <!-- Insurance card photos -->
      <div
        class="pi-ins-photos"
        data-pi-ins-anchor="card"
        :class="{ 'pi-ins-photos--err': !!validationErrorFor('card') }"
      >
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">{{ tx('Insurance card – front') }}</label>
          <div class="pi-ins-photo-area" role="button" tabindex="0" aria-label="Upload primary front of insurance card" @keydown.enter.prevent="triggerUpload('primary_front')" @keydown.space.prevent="triggerUpload('primary_front')" @dragover.prevent @drop.prevent="onPhotoSelected({ target: { files: $event.dataTransfer.files } }, 'primary_front')" @click="triggerUpload('primary_front')">
            <span v-if="photoFiles.primary_front?.type === 'application/pdf'" class="pi-ins-file-name">{{ photoFiles.primary_front.name }}</span>
            <img v-else-if="primaryFrontPreview" :src="primaryFrontPreview" alt="Front of card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder">
              <span aria-hidden="true">↑</span>
              <span>{{ tx('Choose file or drop here') }}</span>
            </div>
          </div>
          <input
            ref="primaryFrontInput"
            type="file"
            accept="image/jpeg,image/png,application/pdf"

            style="display:none"
            @change="(e) => onPhotoSelected(e, 'primary_front')"
          />
          <button v-if="primaryFrontPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('primary_front')">
            {{ tx('Remove') }}
          </button>
        </div>
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">{{ tx('Insurance card – back') }}</label>
          <div class="pi-ins-photo-area" role="button" tabindex="0" aria-label="Upload primary back of insurance card" @keydown.enter.prevent="triggerUpload('primary_back')" @keydown.space.prevent="triggerUpload('primary_back')" @dragover.prevent @drop.prevent="onPhotoSelected({ target: { files: $event.dataTransfer.files } }, 'primary_back')" @click="triggerUpload('primary_back')">
            <span v-if="photoFiles.primary_back?.type === 'application/pdf'" class="pi-ins-file-name">{{ photoFiles.primary_back.name }}</span>
            <img v-else-if="primaryBackPreview" :src="primaryBackPreview" alt="Back of card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder">
              <span aria-hidden="true">↑</span>
              <span>{{ tx('Choose file or drop here') }}</span>
            </div>
          </div>
          <input
            ref="primaryBackInput"
            type="file"
            accept="image/jpeg,image/png,application/pdf"

            style="display:none"
            @change="(e) => onPhotoSelected(e, 'primary_back')"
          />
          <button v-if="primaryBackPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('primary_back')">
            {{ tx('Remove') }}
          </button>
        </div>
      </div>
      <div class="pi-ins-no-card">
        <label class="checkbox-row">
          <input v-model="noPrimaryCardAvailable" type="checkbox" @change="onNoPrimaryCardToggle" />
          <span>{{ tx('I do not have my primary insurance card right now') }}</span>
        </label>
      </div>
      <div v-if="validationErrorFor('card')" class="pi-ins-inline-error">
        {{ validationErrorFor('card') }}
      </div>

      <div v-if="showMultiClientMedicaidSection" class="pi-ins-multi-client">
        <h5>{{ tx('Per-Client Medicaid Member IDs') }}</h5>
        <p class="pi-ins-field-note" style="margin-top: 0;">
          {{ tx("Since this intake includes multiple clients, capture each child's Medicaid Member ID so billing is stored correctly per client.") }}
        </p>
        <div v-for="(row, idx) in medicaidByClient" :key="`medicaid-client-${idx}`" class="form-group">
          <label class="pi-ins-lbl">
            {{ clientDisplayNames[idx] || `Client ${idx + 1}` }} — {{ tx('Medicaid Member ID') }}
          </label>
          <input
            v-model="row.memberId"
            class="pi-ins-input"
            type="text"
            :placeholder="tx('Enter this client\'s Medicaid ID')"
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
        <span>{{ tx('I have secondary insurance to add') }}</span>
      </label>
    </div>

    <div v-if="!isSelfPay && hasSecondary" class="pi-ins-card">
      <h4 class="pi-ins-card-title">{{ tx('Secondary Insurance') }}</h4>

      <div class="form-group">
        <label class="pi-ins-lbl">{{ tx('Insurance Carrier Name') }}</label>
        <div class="pi-ins-typeahead">
          <input
            v-model="secondaryQuery"
            type="text"
            class="pi-ins-input"
            :placeholder="tx('Start typing to search…')"
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
          {{ tx('This is often where Medicaid is listed when the child also has other primary coverage. TRICARE is generally primary over Medicaid when both are present.') }}
        </div>
      </div>

      <div class="pi-ins-grid">
        <div class="form-group">
          <label class="pi-ins-lbl">{{ tx('Member ID') }}</label>
          <input v-model="local.secondary.memberId" class="pi-ins-input" type="text" placeholder="Optional" />
        </div>
        <div v-if="!secondaryIsMedicaid" class="form-group">
          <label class="pi-ins-lbl">{{ tx('Group number') }}</label>
          <input v-model="local.secondary.groupNumber" class="pi-ins-input" type="text" placeholder="Optional" />
        </div>
        <div v-if="!secondaryIsMedicaid" class="form-group">
          <label class="pi-ins-lbl">{{ tx('Subscriber name') }}</label>
          <input v-model="local.secondary.subscriberName" class="pi-ins-input" type="text" placeholder="Optional" />
        </div>
      </div>

      <div class="claim-fields">
        <h4>Secondary subscriber</h4>
        <label>Client’s relationship to subscriber<select v-model="local.secondary.relationshipToSubscriber" @change="push"><option value="">Select</option><option value="self">Self (client is the subscriber)</option><option value="child">Child</option><option value="spouse">Spouse</option><option value="other">Other</option></select></label>
        <label>Subscriber date of birth<input v-model="local.secondary.subscriberDob" type="date" @change="push" /></label>
        <label>Subscriber sex on policy<select v-model="local.secondary.subscriberSex" @change="push"><option value="">Select</option><option>M</option><option>F</option><option>U</option></select></label>
        <label v-for="field in [{key:'subscriberFirstName',label:'Subscriber legal first name'},{key:'subscriberLastName',label:'Subscriber legal last name'},{key:'subscriberAddressLine1',label:'Subscriber address'},{key:'subscriberCity',label:'City'},{key:'subscriberState',label:'State'},{key:'subscriberPostalCode',label:'ZIP code'},{key:'payerId',label:'Electronic payer ID (if known)'},{key:'planType',label:'Plan type (if known)'}]" :key="field.key">{{ field.label }}<input v-model="local.secondary[field.key]" maxlength="255" @input="push" /></label>
      </div>
      <div class="pi-ins-photos">
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">{{ tx('Secondary card – front') }}</label>
          <div class="pi-ins-photo-area" role="button" tabindex="0" aria-label="Upload secondary front of insurance card" @keydown.enter.prevent="triggerUpload('secondary_front')" @keydown.space.prevent="triggerUpload('secondary_front')" @dragover.prevent @drop.prevent="onPhotoSelected({ target: { files: $event.dataTransfer.files } }, 'secondary_front')" @click="triggerUpload('secondary_front')">
            <span v-if="photoFiles.secondary_front?.type === 'application/pdf'" class="pi-ins-file-name">{{ photoFiles.secondary_front.name }}</span>
            <img v-else-if="secondaryFrontPreview" :src="secondaryFrontPreview" alt="Front of secondary card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder"><span aria-hidden="true">↑</span><span>{{ tx('Choose file or drop here') }}</span></div>
          </div>
          <input ref="secondaryFrontInput" type="file" accept="image/jpeg,image/png,application/pdf"  style="display:none"
            @change="(e) => onPhotoSelected(e, 'secondary_front')" />
          <button v-if="secondaryFrontPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('secondary_front')">{{ tx('Remove') }}</button>
        </div>
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">{{ tx('Secondary card – back') }}</label>
          <div class="pi-ins-photo-area" role="button" tabindex="0" aria-label="Upload secondary back of insurance card" @keydown.enter.prevent="triggerUpload('secondary_back')" @keydown.space.prevent="triggerUpload('secondary_back')" @dragover.prevent @drop.prevent="onPhotoSelected({ target: { files: $event.dataTransfer.files } }, 'secondary_back')" @click="triggerUpload('secondary_back')">
            <span v-if="photoFiles.secondary_back?.type === 'application/pdf'" class="pi-ins-file-name">{{ photoFiles.secondary_back.name }}</span>
            <img v-else-if="secondaryBackPreview" :src="secondaryBackPreview" alt="Back of secondary card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder"><span aria-hidden="true">↑</span><span>{{ tx('Choose file or drop here') }}</span></div>
          </div>
          <input ref="secondaryBackInput" type="file" accept="image/jpeg,image/png,application/pdf"  style="display:none"
            @change="(e) => onPhotoSelected(e, 'secondary_back')" />
          <button v-if="secondaryBackPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('secondary_back')">{{ tx('Remove') }}</button>
        </div>
      </div>
    </div>

    <div v-if="!isSelfPay && !hasAnyMedicaid" class="pi-ins-card pi-ins-guarantor-card">
      <h4 class="pi-ins-card-title">{{ tx('Responsible Party (Guarantor)') }}</h4>
      <template v-if="props.intakeForSelf">
        <div class="pi-ins-guarantor-choices">
          <label class="pi-ins-selfpay-row" :class="{ 'pi-ins-selfpay-row--active': guarantorMode === 'self' }">
            <input v-model="guarantorMode" type="radio" value="self" @change="onGuarantorModeChange" />
            <span><strong>{{ tx('This is me') }}</strong> — {{ guarantorSelfName || tx('the person completing this form') }}</span>
          </label>
          <label class="pi-ins-selfpay-row" :class="{ 'pi-ins-selfpay-row--active': guarantorMode === 'other' }">
            <input v-model="guarantorMode" type="radio" value="other" @change="onGuarantorModeChange" />
            <span><strong>{{ tx('Someone else') }}</strong></span>
          </label>
        </div>
        <div v-if="guarantorMode === 'other'" class="pi-ins-guarantor-other">
          <div class="form-group">
            <label class="pi-ins-lbl">{{ tx('Responsible party name') }}</label>
            <input v-model="guarantorOtherName" class="pi-ins-input" type="text" @input="push" />
          </div>
          <div class="form-group">
            <label class="pi-ins-lbl">{{ tx('Responsible party phone or email') }}</label>
            <input v-model="guarantorOtherContact" class="pi-ins-input" type="text" @input="push" />
          </div>
        </div>
        <p v-else class="pi-ins-field-note">
          {{ tx('You are listed as financially responsible for services provided to you.') }}
        </p>
      </template>
      <template v-else>
        <p class="pi-ins-field-note" style="margin-top: 0;">
          {{ tx('Name: Parent/Guardian') }}{{ guarantorSelfName ? ` — ${guarantorSelfName}` : '' }}
        </p>
        <p class="pi-ins-field-note">
          {{ tx('Contact info: captured earlier in intake and used for billing/consent communications.') }}
        </p>
      </template>
    </div>

    <section v-if="!isSelfPay" class="pi-ins-claim-details">
      <h4>Coverage and subscriber details</h4>
      <p>The subscriber may be the parent or the child. Check the policy details and confirm who is covered. A matching name alone does not verify coverage.</p>
      <label>Policy applies to
        <select v-model="coverageScope" @change="push"><option value="client">One client</option><option value="account_holder">Account holder with covered dependents</option></select>
      </label>
      <label v-for="(clientName, index) in clientDisplayNames" :key="index" class="checkbox-row"><input v-model="coverageClientIndexes" :value="index" type="checkbox" @change="push" /> I confirm {{ clientName }} is covered by this policy.</label>
      <div v-for="index in coverageClientIndexes" :key="`separate-${index}`">
        <label class="checkbox-row"><input :checked="!!separatePolicies[index]" type="checkbox" @change="toggleSeparatePolicy(index,$event.target.checked)" /> {{ clientDisplayNames[index] }} has a different policy</label>
        <div v-if="separatePolicies[index]" class="pi-ins-claim-details">
          <h4>Policy for {{ clientDisplayNames[index] }}</h4>
          <InsurancePolicyFields v-model="separatePolicies[index].primary" @update:model-value="push" />
          <label v-for="slot in ['primary_front','primary_back']" :key="slot">{{ slot === 'primary_front' ? 'Card front' : 'Card back' }}<input type="file" accept="image/png,image/jpeg,application/pdf" :disabled="coverageUploadBusy" @change="uploadSeparateCard(index,slot,$event)" /><span v-if="separatePolicies[index][`${slot}_url`]">Uploaded securely</span></label>
        </div>
      </div>
      <p v-if="coverageUploadError" role="alert">{{ coverageUploadError }}</p>

    </section>
    <div class="pi-ins-card pi-ins-identity-card">
      <h4 class="pi-ins-card-title">{{ tx('Identity verification') }}</h4>
      <p class="pi-ins-field-note">
        {{ tx('To help prevent insurance fraud and protect you, our organization, and our providers, we ask that you verify you are who you say you are. You can skip for now and may be asked later in the portal to provide or upload ID.') }}
      </p>
      <div class="pi-ins-photos" style="grid-template-columns: 1fr;">
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">{{ tx('Driver’s license or government ID (optional)') }}</label>
          <div class="pi-ins-photo-area" role="button" tabindex="0" aria-label="Upload identification" @keydown.enter.prevent="triggerIdUpload" @keydown.space.prevent="triggerIdUpload" @dragover.prevent @drop.prevent="onIdSelected({ target: { files: $event.dataTransfer.files } })" @click="triggerIdUpload">
            <span v-if="idFile?.type === 'application/pdf'" class="pi-ins-file-name">{{ idFile.name }}</span>
            <img v-else-if="idPreview" :src="idPreview" alt="ID" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder"><span aria-hidden="true">↑</span><span>{{ tx('Choose file or drop here') }}</span></div>
          </div>
          <input ref="idInput" type="file" accept="image/jpeg,image/png,application/pdf"  style="display:none" @change="onIdSelected" />
          <button v-if="idPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearId">{{ tx('Remove') }}</button>
        </div>
      </div>
      <p v-if="identityStatusMessage" class="pi-ins-identity-status" :class="{ ok: identityVerified === true }">
        {{ tx(identityStatusMessage) }}
      </p>
      <label class="pi-ins-selfpay-row" style="margin-top: 8px;">
        <input v-model="identitySkipped" type="checkbox" @change="onIdentitySkip" />
        <span>{{ tx('Skip identity verification for now') }}</span>
      </label>

    </div>

    <!-- Insurance disclaimer -->
    <div v-if="!isSelfPay" class="pi-ins-footer-notice">
      <p>
        {{ tx('Our office will verify whether your plan covers the selected services. Insurance information is not a guarantee of coverage. We will explain any permitted patient responsibility after review.') }}
      </p>
    </div>

    <!-- Insurance Authorization Acknowledgment -->
    <div
      v-if="!hideAuthorization"
      class="pi-ins-auth-block"
      :class="{ 'pi-ins-auth-block--err': !!validationErrorFor('authorization') }"
      ref="authBlockRef"
      data-pi-ins-anchor="authorization"
    >
      <h4 class="pi-ins-auth-title">{{ tx('Insurance Authorization & Assignment of Benefits') }}</h4>
      <div class="pi-ins-auth-text">
        <p>
          {{ tx('I authorize') }} <strong>{{ props.agencyName || 'the provider' }}</strong> {{ tx('to release information to the insurance companies provided on this form in order to submit insurance claims on my behalf.') }}
        </p>
        <p>
          {{ tx('This authorization extends to the extent necessary to obtain payment for the services provided to me, and includes authorization to release information about mental health, substance use, or HIV diagnoses as required.') }}
        </p>
        <p>
          {{ tx('In consideration of the services provided to me, I assign all benefits to') }} <strong>{{ props.agencyName || 'the provider' }}</strong> if accepted, and authorize my insurance companies, Medicare, or other third-party payers to make payments directly to <strong>{{ props.agencyName || 'the provider' }}</strong> and its affiliates.
        </p>
        <p v-if="!hasAnyMedicaid">
          {{ tx('I understand that I remain responsible for all amounts due by me, including (but not limited to) copays, coinsurance, deductible amounts, and all services not covered by my insurance plan (including those for which I fail to obtain prior authorization), and mutually agreed-upon services or fees that are deemed not medically necessary.') }}
        </p>
        <p class="pi-ins-auth-esign-notice">
          {{ tx('This is a binding electronic signature. By signing below, you acknowledge that your electronic signature has the same legal effect as a hand-written one. We record your name, the date and time you signed, your IP address, and your browser at finalize time and embed that information in the signed PDF kept on file.') }}
        </p>
      </div>

      <div v-if="validationErrorFor('authorization')" class="pi-ins-auth-error">
        {{ validationErrorFor('authorization') }}
      </div>

      <!-- PRIMARY PATH: re-use the signature drawn earlier in this session -->
      <div v-if="savedSignatureData" class="pi-ins-auth-sign">
        <label class="pi-ins-lbl">{{ tx('Sign this authorization') }}</label>
        <div v-if="!authorizationSignatureData" class="pi-ins-auth-apply-wrap">
          <button
            type="button"
            class="btn btn-primary btn-sm pi-ins-auth-apply pi-ins-auth-apply--pulse"
            @click="applySavedAuthSignature"
          >
            {{ tx('Apply my signature to this authorization') }}
          </button>
          <span class="pi-ins-field-note">
            {{ tx("We'll re-use the signature you drew earlier in this session — same legal weight as signing here in pen, and you'll see it on the signed PDF.") }}
          </span>
        </div>
        <div v-else class="pi-ins-auth-applied-wrap">
          <div class="pi-ins-auth-applied">
            <span class="pi-ins-auth-check">&#10003;</span>
            <div>
              <div>
                <strong>{{ tx('Signed') }}</strong>
                <span v-if="props.guardianName"> by {{ props.guardianName }}</span>
              </div>
              <div class="pi-ins-auth-stamp">
                {{ tx('e-Signature applied') }} {{ formatSignedAt(authorizationSignedAt) }} · {{ tx('source: reused signature from earlier in this session') }}
              </div>
            </div>
          </div>
          <button
            type="button"
            class="btn btn-secondary btn-sm pi-ins-auth-resign"
            @click="resignAuth"
          >
            {{ tx('Sign again') }}
          </button>
        </div>
      </div>

      <!-- FALLBACK PATH: typed signature for parents who didn't draw one earlier
           (e.g. they bypassed the drawn-signature step). We still capture audit
           metadata so the PDF can show the same "signed by + when + how" block. -->
      <div v-else class="pi-ins-auth-sign">
        <label class="pi-ins-lbl" for="ins-auth-sig">
          {{ tx('Type your name to sign this authorization') }} <span class="req">*</span>
        </label>
        <input
          id="ins-auth-sig"
          :value="authorizationSignature"
          type="text"
          class="pi-ins-input"
          :class="{ 'pi-ins-input--err': !!validationErrorFor('authorization') && !authorizationSignature.trim() }"
          :placeholder="tx('Your name')"
          autocomplete="name"
          @input="onTypedAuthInput($event.target.value)"
        />
        <div v-if="authorizationSignature.trim().length >= 2" class="pi-ins-auth-confirmed">
          {{ tx('✓ Signed by') }} {{ authorizationSignature.trim() }}
          <span v-if="authorizationSignedAt" class="pi-ins-auth-stamp"> ({{ formatSignedAt(authorizationSignedAt) }})</span>
        </div>
        <div class="pi-ins-field-note">
          {{ tx("You can use whatever name you go by — it does not have to be your legal name. We'll capture the date, time, IP, and browser as part of the audit trail.") }}
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, inject } from 'vue';
import { hasMedicaidCoverage, policyIsMedicaid } from '../../utils/insurancePaymentPolicy.js';
import { filterInsurances, isMedicaidInsurer } from '../../utils/coloradoInsurances.js';
import { useIntakeStepTx } from '../../composables/useIntakeStepTx.js';
import api from '../../services/api.js';
import InsurancePolicyFields from '../billing/InsurancePolicyFields.vue';

const { tx } = useIntakeStepTx();
const intakeSessionToken = inject('intakeSessionToken', ref(''));

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
  legalFirstName: { type: String, default: '' },
  legalLastName: { type: String, default: '' },
  publicKey: { type: String, default: '' },
  submissionId: { type: [Number, String], default: null },
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
  validationErrors: { type: Object, default: () => ({}) },
  /** When true, parent combined step owns Use Insurance / Self-Pay. */
  hideSelfPayToggle: { type: Boolean, default: false },
  /** When true, authorization is collected by the parent combined step. */
  hideAuthorization: { type: Boolean, default: false },
  /** Controlled self-pay from parent when hideSelfPayToggle is true. */
  externalSelfPay: { type: Boolean, default: null }
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
    ...Object.fromEntries(['subscriberFirstName','subscriberLastName','payerId','subscriberDob','subscriberSex','relationshipToSubscriber','subscriberAddressLine1','subscriberAddressLine2','subscriberCity','subscriberState','subscriberPostalCode','planType','effectiveDate','terminationDate','claimsPhone'].map(key => [key, props.modelValue?.primary?.[key] || ''])),
    isMedicaid: props.modelValue?.primary?.isMedicaid || false
  },
  secondary: {
    insurerName: props.modelValue?.secondary?.insurerName || '',
    memberId: props.modelValue?.secondary?.memberId || '',
    groupNumber: props.modelValue?.secondary?.groupNumber || '',
    subscriberName: props.modelValue?.secondary?.subscriberName || '',
    ...Object.fromEntries(['subscriberFirstName','subscriberLastName','payerId','subscriberDob','subscriberSex','relationshipToSubscriber','subscriberAddressLine1','subscriberAddressLine2','subscriberCity','subscriberState','subscriberPostalCode','planType','effectiveDate','terminationDate','claimsPhone'].map(key => [key, props.modelValue?.secondary?.[key] || ''])),
    isMedicaid: props.modelValue?.secondary?.isMedicaid || false
  }
});

const coverageScope = ref(props.modelValue?.coverageScope || 'client');
const separatePolicies = reactive(Object.fromEntries((props.modelValue?.clientCoverages || []).filter(row => row.primary).map(row => [row.clientIndex, { ...row }])));
const coverageUploadError = ref('');
const coverageUploadBusy = ref(false);
const coverageClientIndexes = ref((props.modelValue?.clientCoverages || []).filter(row => row.confirmed).map(row => Number(row.clientIndex)));
const hasSecondary = ref(props.modelValue?.hasSecondary === true || !!(props.modelValue?.secondary?.insurerName || props.modelValue?.secondary?.isMedicaid));
const noPrimaryCardAvailable = ref(!!props.modelValue?.noPrimaryCardAvailable);
// Self-pay toggle — persisted alongside the rest of the insurance info so the
// flag survives save/resume and downstream consumers (billing, reports) can
// distinguish "declined to provide" from "explicitly self-pay".
const isSelfPay = ref(
  (props.externalSelfPay === true || props.externalSelfPay === false)
    ? !!props.externalSelfPay
    : (
      !!props.modelValue?.isSelfPay
      || String(props.modelValue?.primary?.insurerName || '').trim().toLowerCase() === 'self-pay'
      || String(props.modelValue?.primary?.insurerName || '').trim().toLowerCase() === 'self pay'
    )
);

const hideSelfPayToggle = computed(() => !!props.hideSelfPayToggle || !!props.stepConfig?.hideSelfPayToggle);
const hideAuthorization = computed(() => !!props.hideAuthorization);
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
const idInput = ref(null);
const idFile = ref(null);
const idPreview = ref(props.modelValue?.identity?.preview || '');
const identityVerified = ref(
  props.modelValue?.identity?.verified === true
    ? true
    : props.modelValue?.identity?.verified === false
      ? false
      : null
);
const identitySkipped = ref(!!props.modelValue?.identity?.skipped);
const identityStatusMessage = ref(String(props.modelValue?.identity?.message || ''));
const identityImageUrl = ref(props.modelValue?.identity?.imageUrl || '');
const guarantorMode = ref(
  props.modelValue?.guarantor?.mode
    || (props.intakeForSelf ? 'self' : 'guardian')
);
const guarantorOtherName = ref(props.modelValue?.guarantor?.otherName || '');
const guarantorOtherContact = ref(props.modelValue?.guarantor?.otherContact || '');

// Typeahead
const primaryQuery = ref(local.primary.insurerName);
const primaryOpen = ref(false);
const primarySuggestions = computed(() => filterInsurances(primaryQuery.value));

const secondaryQuery = ref(local.secondary.insurerName);
const secondaryOpen = ref(false);
const secondarySuggestions = computed(() => filterInsurances(secondaryQuery.value));

const primaryIsMedicaid = computed(() => policyIsMedicaid(local.primary));
const secondaryIsMedicaid = computed(() => policyIsMedicaid(local.secondary));
const hasAnyMedicaid = computed(() => hasMedicaidCoverage({ primary: local.primary, secondary: hasSecondary.value ? local.secondary : null }));
const guardianDisplayName = computed(() => String(props.guardianName || '').trim());
const guarantorSelfName = computed(() => {
  const fromLegal = `${props.legalFirstName || ''} ${props.legalLastName || ''}`.trim();
  return fromLegal || guardianDisplayName.value || '';
});
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
const fileError = ref('');
function validUpload(file) {
  fileError.value = '';
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    fileError.value = 'Choose a JPG, PNG, or PDF file no larger than 5 MB.';
    return false;
  }
  return true;
}
function onPhotoSelected(event, slot) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!validUpload(file)) return;
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
  reader.onerror = () => { fileError.value = 'This file could not be read. Choose it again.'; };
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
  // A payment preference must not erase insurance or suppress Medicaid review.
  if (!checked && String(local.primary.insurerName || '').trim().toLowerCase() === 'self-pay') {
    local.primary.insurerName = '';
    primaryQuery.value = '';
  }
  push();
}

watch(
  () => props.externalSelfPay,
  (v) => {
    if (v === true || v === false) {
      if (isSelfPay.value !== v) toggleSelfPay(v);
    }
  }
);

function toggleSeparatePolicy(index, enabled) {
  if (enabled) separatePolicies[index] = { clientIndex: index, primary: {} };
  else delete separatePolicies[index];
  push();
}
async function uploadSeparateCard(index, slot, event) {
  const file = event.target.files?.[0]; if (!file) return;
  coverageUploadBusy.value = true; coverageUploadError.value = '';
  try {
    const form = new FormData(); form.append(slot,file); form.append('clientIndex',String(index));
    const result = await api.post(`/public-intake/${props.publicKey}/${props.submissionId}/insurance-card-photos`,form,{headers:{'x-intake-session':intakeSessionToken.value}});
    if (separatePolicies[index]) Object.assign(separatePolicies[index],result.data.urls);
    push();
  } catch(e) { coverageUploadError.value = e.response?.data?.error?.message || 'Card upload failed. Please retry.'; }
  finally { coverageUploadBusy.value = false; }
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
    ...props.modelValue,
    coverageScope: coverageScope.value,
    clientCoverages: coverageClientIndexes.value.map(clientIndex => ({ ...separatePolicies[clientIndex], clientIndex, confirmed: true })),
    primary: { ...local.primary, isMedicaid: primaryIsMedicaid.value },
    secondary: hasSecondary.value ? { ...local.secondary, isMedicaid: secondaryIsMedicaid.value } : null,
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
    isSelfPay: isSelfPay.value,
    guarantor: {
      mode: guarantorMode.value,
      name: guarantorMode.value === 'other'
        ? String(guarantorOtherName.value || '').trim()
        : (guarantorSelfName.value || guardianDisplayName.value || ''),
      otherName: String(guarantorOtherName.value || '').trim(),
      otherContact: String(guarantorOtherContact.value || '').trim(),
      contact: guarantorMode.value === 'other'
        ? String(guarantorOtherContact.value || '').trim()
        : String(props.guardianPhone || '').trim()
    },
    identity: {
      verified: identityVerified.value,
      skipped: !!identitySkipped.value,
      message: identityStatusMessage.value || '',
      preview: idPreview.value || '',
      imageUrl: identityImageUrl.value || ''
    }
  };
  // Inline client-name arrays and restored parent models may refresh while
  // carrying identical values. Do not create another parent render for an
  // unchanged snapshot (which would trigger the same watcher again).
  if (JSON.stringify(out) !== JSON.stringify(props.modelValue)) emit('update:modelValue', out);
  emit('medicaid-change', primaryIsMedicaid.value);
}

/** Returns the photo File objects (for upload at form finalize time). */
function getPhotoFiles() {
  return { ...photoFiles, identity_id: idFile.value || null };
}

function onGuarantorModeChange() {
  push();
}

function triggerIdUpload() {
  idInput.value?.click();
}

function clearId() {
  idFile.value = null;
  idPreview.value = '';
  identityVerified.value = null;
  identityStatusMessage.value = '';
  identityImageUrl.value = '';
  identitySkipped.value = false;
  push();
}

function onIdentitySkip() {
  if (identitySkipped.value) {
    identityStatusMessage.value = 'Thank you for your submission.';
    identityVerified.value = null;
  }
  push();
}

async function onIdSelected(event) {
  const file = event.target?.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!validUpload(file)) return;
  idFile.value = file;
  identitySkipped.value = false;
  try {
    idPreview.value = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  } catch {
    idPreview.value = '';
  }
  identityStatusMessage.value = 'Checking…';
  push();
  const pk = String(props.publicKey || '').trim();
  const sid = Number(props.submissionId || 0);
  if (!pk || !sid) {
    identityVerified.value = null;
    identityStatusMessage.value = 'Thank you for your submission.';
    push();
    return;
  }
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('legalFirstName', props.legalFirstName || '');
    form.append('legalLastName', props.legalLastName || '');
    const res = await api.post(`/public-intake/${encodeURIComponent(pk)}/${sid}/identity-verify`, form, {
      headers: { 'x-intake-session': intakeSessionToken.value },
      skipGlobalLoading: true
    });
    identityVerified.value = !!res.data?.verified;
    identityImageUrl.value = String(res.data?.imageUrl || '');
    identityStatusMessage.value = identityVerified.value
      ? 'Thank you, you’ve been verified.'
      : 'Thank you for your submission.';
  } catch {
    identityVerified.value = null;
    identityStatusMessage.value = 'Thank you for your submission.';
  }
  push();
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

// Restored/OCR-updated policies must reach local controls before another child
// watcher emits its snapshot. Otherwise a parent refresh can erase secondary
// coverage with a stale local value.
watch(() => [props.modelValue?.primary, props.modelValue?.secondary], ([primary, secondary]) => {
  for (const [tier, incoming] of [['primary', primary], ['secondary', secondary]]) {
    for (const key of new Set([...Object.keys(local[tier]), ...Object.keys(incoming || {})])) {
      const value = incoming?.[key] ?? (key === 'isMedicaid' ? false : '');
      if (local[tier][key] !== value) local[tier][key] = value;
    }
  }
  primaryQuery.value = local.primary.insurerName;
  secondaryQuery.value = local.secondary.insurerName;
  hasSecondary.value = props.modelValue?.hasSecondary === true || !!(secondary?.insurerName || secondary?.isMedicaid);
}, { deep: true, flush: 'sync' });
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
  min-width: 0;
  max-width: 100%;
  width: 100%;
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
  background: color-mix(in srgb, var(--df-primary, #1e4d3b) 8%, #fff);
  border-style: solid;
  border-color: var(--df-accent, var(--df-primary, #1e4d3b));
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
  border: 1px solid var(--df-border, var(--border, #e2e8f0));
  border-radius: var(--df-radius, 14px);
  padding: 16px;
  background: var(--df-surface, var(--bg, #fff));
}
.pi-ins-card-title {
  margin: 0 0 12px;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--df-primary, #1e4d3b);
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
  object-fit: contain;
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
.pi-ins-photo-area:focus-visible { outline: 2px solid var(--df-primary, #1558d6); outline-offset: 3px; }
.pi-ins-file-name { padding: 12px; font-size: 13px; overflow-wrap: anywhere; }
.pi-ins-card { background: transparent; border: 0; padding: 0; }
.pi-ins .btn { font: inherit; font-size: 13px; padding: 8px 12px; min-height: 36px; border: 1px solid #d9e0ed; border-radius: 6px; cursor: pointer; }
.pi-ins > * { min-width: 0; max-width: 100%; }
.pi-ins-claim-details > label:not(.checkbox-row) { display: grid; gap: 6px; }
.pi-ins-claim-details select { width: 100%; max-width: 100%; min-width: 0; }
.pi-ins-claim-details { margin: 0; padding: 18px; background: #f8fafc; }
.pi-ins-grid, .claim-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.pi-ins-grid > *, .claim-fields > *, .pi-ins-photos > * { min-width: 0; }
.claim-fields input, .claim-fields select { width: 100%; min-width: 0; box-sizing: border-box; }
.pi-ins :is(input, select):focus-visible { outline: 2px solid var(--df-primary, #1558d6); outline-offset: 2px; }
.pi-ins :is(input[type="checkbox"], input[type="radio"]) { accent-color: var(--df-primary, #1558d6); }
@media (max-width: 640px) { .pi-ins-grid, .claim-fields { grid-template-columns: minmax(0, 1fr); } }
</style>

<style scoped>.pi-ins-claim-details { margin-top:20px; padding:18px; border:1px solid #cbd5e1; border-radius:10px; } .claim-fields { display:grid;  gap:12px; } .claim-fields h4 { grid-column:1/-1; } .claim-fields label { display:grid; gap:6px; } .claim-fields input,.claim-fields select { padding:9px; border:1px solid #94a3b8; border-radius:6px; }</style>
