<template>
  <div class="smart-roi-flow">
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="stage === 'intro'" class="smart-roi-card">
      <div class="progress-label">Step 1 of {{ totalSteps }}</div>
      <h3>Smart School Release of Information</h3>
      <p>
        This release is specific to <strong>{{ schoolName }}</strong> and the currently active school staff who may need
        information to support the client in the school setting.
      </p>
      <p>
        The app will log the release, protect access, and apply permissions based on the responses entered here.
      </p>
      <p class="required-fields-note">
        Required fields are highlighted. The highlight turns off as each required field is completed.
      </p>

      <div class="subject-choice-row">
        <label class="choice-card" :class="{ 'required-highlight': form.intakeForSelf === null }">
          <input v-model="form.intakeForSelf" :value="true" type="radio" :disabled="isSubjectChoiceLocked" />
          <span>I am the client</span>
        </label>
        <label class="choice-card" :class="{ 'required-highlight': form.intakeForSelf === null }">
          <input v-model="form.intakeForSelf" :value="false" type="radio" :disabled="isSubjectChoiceLocked" />
          <span>My dependent is the client</span>
        </label>
      </div>
      <p v-if="!isSubjectChoiceLocked" class="subject-choice-hint">
        Choose who the client is for this release so the signer and relationship fields are labeled correctly.
      </p>
      <p v-else class="subject-choice-hint">
        Client/guardian role was carried in from earlier intake details.
      </p>

      <div class="summary-grid">
        <div>
          <label>Client</label>
          <div v-if="isClientNameLocked" class="summary-value">{{ form.clientFullName || '—' }}</div>
          <input
            v-else
            v-model="form.clientFullName"
            :class="['roi-input', requiredFieldClass(form.clientFullName)]"
            type="text"
            placeholder="Client full name"
          />
        </div>
        <div>
          <label>{{ subjectDobLabel }}</label>
          <input v-model="form.clientDateOfBirth" :class="['roi-input', requiredFieldClass(form.clientDateOfBirth)]" type="date" />
        </div>
        <div>
          <label>{{ signerFirstNameLabel }}</label>
          <input v-model="form.signer.firstName" :class="['roi-input', requiredFieldClass(form.signer.firstName)]" type="text" />
        </div>
        <div>
          <label>{{ signerLastNameLabel }}</label>
          <input v-model="form.signer.lastName" :class="['roi-input', requiredFieldClass(form.signer.lastName)]" type="text" />
        </div>
        <div>
          <label>Email</label>
          <input v-model="form.signer.email" :class="['roi-input', requiredFieldClass(form.signer.email)]" type="email" />
        </div>
        <div>
          <label>Phone</label>
          <input v-model="form.signer.phone" class="roi-input" type="tel" />
        </div>
        <div>
          <label>Relationship to Client</label>
          <input
            v-if="form.intakeForSelf !== true"
            v-model="form.signer.relationship"
            :class="['roi-input', requiredFieldClass(form.signer.relationship)]"
            type="text"
            placeholder="Parent, guardian, self, etc."
          />
          <div v-else class="summary-value">Self</div>
        </div>
        <div>
          <label>School</label>
          <div class="summary-value">{{ schoolName }}</div>
        </div>
        <div>
          <label>School address</label>
          <div class="summary-value">{{ schoolAddress || '—' }}</div>
        </div>
        <div>
          <label>School contact</label>
          <div class="summary-value">{{ schoolContactLine || '—' }}</div>
        </div>
        <div>
          <label>Relationship to party</label>
          <div class="summary-value">{{ relationshipToParty }}</div>
        </div>
      </div>

      <div class="actions">
        <button type="button" class="btn btn-primary" @click="goNext">Continue</button>
      </div>
    </div>

    <div v-else-if="stage === 'purpose'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>Purpose of release</h3>
      <p>This authorization allows communication for school care coordination within the approved scope.</p>
      <div class="info-panel">
        <ul>
          <li v-for="purpose in roiContext.purposes || []" :key="purpose">{{ purpose }}</li>
        </ul>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
        <button type="button" class="btn btn-primary" @click="goNext">Continue</button>
      </div>
    </div>

    <div v-else-if="stage === 'ack'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>{{ currentAck?.title }}</h3>
      <p>{{ currentAck?.body }}</p>
      <p class="required-note">
        This acknowledgement is required to continue.
      </p>
      <p class="auto-advance-note">Selecting an option will move you to the next question.</p>
      <div class="choice-row">
        <label class="choice-card" @click.prevent="selectAckDecision(true)">
          <input
            :checked="form.requiredAcknowledgements[currentAck.id] === true"
            :value="true"
            type="radio"
          />
          <span>I acknowledge and accept</span>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
      </div>
    </div>

    <div v-else-if="stage === 'waiver'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>{{ currentWaiver?.title }}</h3>
      <p>{{ currentWaiver?.body }}</p>
      <p class="auto-advance-note">Selecting an option will move you to the next question.</p>
      <p v-if="currentWaiver?.requiredAccept" class="required-note">
        This authorization is required to provide services in the school setting.
      </p>
      <div class="choice-row">
        <label class="choice-card" @click.prevent="selectWaiverDecision('accept')">
          <input
            :checked="form.waiverItems[currentWaiver.id] === 'accept'"
            value="accept"
            type="radio"
          />
          <span>{{ currentWaiver?.requiredAccept ? 'Authorize (required)' : 'Authorize' }}</span>
        </label>
        <label
          v-if="!currentWaiver?.requiredAccept"
          class="choice-card"
          @click.prevent="selectWaiverDecision('decline')"
        >
          <input
            :checked="form.waiverItems[currentWaiver.id] === 'decline'"
            value="decline"
            type="radio"
          />
          <span>Do not authorize</span>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
      </div>
    </div>

    <div v-else-if="stage === 'packet'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>Packet and document visibility</h3>
      <p>
        Approved staff will receive basic ROI access. Do you also authorize approved staff to view the packet and related documents?
      </p>
      <p class="auto-advance-note">Selecting an option will move you to the next question.</p>
      <p class="separation-note">
        This choice applies only to approved individual staff on this ROI. School-level scheduling/safety logistics are handled separately.
      </p>
      <div class="choice-row">
        <label class="choice-card" @click.prevent="selectPacketDecision(true)">
          <input :checked="form.packetReleaseAllowed === true" :value="true" type="radio" />
          <span>Yes, approved staff may view the packet</span>
        </label>
        <label class="choice-card" @click.prevent="selectPacketDecision(false)">
          <input :checked="form.packetReleaseAllowed === false" :value="false" type="radio" />
          <span>No, approved staff receive ROI access only</span>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
      </div>
    </div>

    <div v-else-if="stage === 'staff'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>School staff approval</h3>
      <p>Choose whether information may be released to this staff member.</p>
      <p class="auto-advance-note">Selecting an option will move you to the next question.</p>
      <p class="separation-note">
        If no individual staff are approved, no individual ROI or packet access will be granted.
      </p>
      <div class="staff-card">
        <div class="staff-name">{{ currentStaff?.fullName }}</div>
        <div class="staff-meta">{{ currentStaff?.role || 'School staff' }}</div>
        <div class="staff-email" v-if="currentStaff?.email">{{ currentStaff.email }}</div>
        <div class="staff-email" v-if="currentStaff?.phone">{{ currentStaff.phone }}</div>
      </div>
      <div class="choice-row">
        <label class="choice-card" @click.prevent="selectStaffDecision(true)">
          <input :checked="form.staffDecisions[currentStaff.schoolStaffUserId] === true" :value="true" type="radio" />
          <span>Approve release</span>
        </label>
        <label class="choice-card" @click.prevent="selectStaffDecision(false)">
          <input :checked="form.staffDecisions[currentStaff.schoolStaffUserId] === false" :value="false" type="radio" />
          <span>Deny release</span>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
      </div>
    </div>

    <div v-else-if="stage === 'external_programmed'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>Non-school recipient approval</h3>
      <p>Choose whether this ROI may release information to the pre-selected non-school recipient.</p>
      <div class="staff-card">
        <div class="staff-name">{{ programmedRecipient?.name || 'Recipient' }}</div>
        <div class="staff-meta">{{ programmedRecipient?.relationship || 'Relationship not provided' }}</div>
        <div class="staff-email" v-if="programmedRecipient?.email">{{ programmedRecipient.email }}</div>
        <div class="staff-email" v-if="programmedRecipient?.phone">{{ programmedRecipient.phone }}</div>
      </div>
      <div class="choice-row">
        <label class="choice-card" @click.prevent="selectProgrammedExternalDecision(true)">
          <input :checked="form.programmedExternalAllowed === true" :value="true" type="radio" />
          <span>Approve release</span>
        </label>
        <label class="choice-card" @click.prevent="selectProgrammedExternalDecision(false)">
          <input :checked="form.programmedExternalAllowed === false" :value="false" type="radio" />
          <span>Deny release</span>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
      </div>
    </div>

    <div v-else-if="stage === 'external_parent'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>Non-school release recipients</h3>
      <p>Add each non-school person and select whether release is approved for that person.</p>
      <div
        v-for="(recipient, idx) in form.parentExternalRecipients"
        :key="`recipient-${idx}`"
        class="staff-card"
        style="margin-bottom: 12px;"
      >
        <div class="summary-grid" style="margin: 0;">
          <div>
            <label>Name</label>
            <input v-model="recipient.name" class="roi-input" type="text" placeholder="Person name" />
          </div>
          <div>
            <label>Relationship</label>
            <input v-model="recipient.relationship" class="roi-input" type="text" placeholder="Relationship to client" />
          </div>
          <div>
            <label>Email</label>
            <input v-model="recipient.email" class="roi-input" type="email" placeholder="recipient@example.com" />
          </div>
          <div>
            <label>Phone</label>
            <input v-model="recipient.phone" class="roi-input" type="tel" placeholder="(555) 555-5555" />
          </div>
        </div>
        <div class="choice-row" style="margin-top: 10px;">
          <label class="choice-card">
            <input v-model="recipient.allowed" :value="true" type="radio" />
            <span>Approve release</span>
          </label>
          <label class="choice-card">
            <input v-model="recipient.allowed" :value="false" type="radio" />
            <span>Deny release</span>
          </label>
        </div>
        <div class="actions" style="justify-content: flex-end; margin-top: 8px;">
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="form.parentExternalRecipients.length <= 1"
            @click="removeExternalRecipient(idx)"
          >
            Remove
          </button>
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="addExternalRecipient">Add recipient</button>
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
        <button type="button" class="btn btn-primary" @click="goNext">Continue</button>
      </div>
    </div>

    <div v-else-if="stage === 'guidelines'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>Guidelines and limitations</h3>
      <p>These disclosures are limited and documented according to the terms below.</p>
      <div class="info-panel">
        <ul>
          <li v-for="item in roiContext.guidelines || []" :key="item">{{ item }}</li>
        </ul>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
        <button type="button" class="btn btn-primary" @click="goNext">Continue</button>
      </div>
    </div>

    <div v-else-if="stage === 'term'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>Term and revocation</h3>
      <div class="info-panel">
        <ul>
          <li>This authorization is valid for 12 months from the date signed unless revoked earlier.</li>
          <li>Consent may be revoked at any time through support@itsco.health or 833-444-8726 extension 0.</li>
          <li>Actions already taken before revocation cannot be undone.</li>
          <li>Information disclosed may be redistributed by the receiving party and may no longer be protected in the same way.</li>
        </ul>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
        <button type="button" class="btn btn-primary" @click="goNext">Continue</button>
      </div>
    </div>

    <div v-else-if="stage === 'review'" class="smart-roi-card">
      <div class="progress-label">Final Step</div>
      <h3>Review and sign</h3>
      <div class="review-block">
        <p><strong>Client:</strong> {{ form.clientFullName }}</p>
        <p><strong>Date of Birth:</strong> {{ form.clientDateOfBirth }}</p>
        <p><strong>Responsible Party:</strong> {{ signerFullName || '—' }}</p>
        <p><strong>Relationship:</strong> {{ form.signer.relationship || '—' }}</p>
        <p><strong>School:</strong> {{ schoolName }}</p>
        <p><strong>Packet visibility:</strong> {{ form.packetReleaseAllowed ? 'Approved' : 'ROI only' }}</p>
      </div>

      <div class="review-block">
        <h4>Approved staff</h4>
        <ul v-if="approvedStaff.length">
          <li v-for="staff in approvedStaff" :key="staff.schoolStaffUserId">{{ staff.fullName }}</li>
        </ul>
        <p v-else>No staff were approved.</p>
      </div>

      <div v-if="externalReleaseMode === 'sender_programmed'" class="review-block">
        <h4>Programmed non-school recipient</h4>
        <p><strong>Name:</strong> {{ programmedRecipient?.name || '—' }}</p>
        <p><strong>Relationship:</strong> {{ programmedRecipient?.relationship || '—' }}</p>
        <p><strong>Decision:</strong> {{ form.programmedExternalAllowed === true ? 'Approved' : 'Denied' }}</p>
      </div>
      <div v-else-if="externalReleaseMode === 'parent_defined'" class="review-block">
        <h4>Parent-entered non-school recipients</h4>
        <p><strong>Approved:</strong> {{ approvedExternalRecipients.length }}</p>
        <p><strong>Denied:</strong> {{ deniedExternalRecipientsCount }}</p>
      </div>

      <div class="review-block">
        <h4>School-level vs individual disclosure</h4>
        <p>
          <strong>School-level scheduling/safety logistics:</strong>
          {{ schoolSchedulingSafetyAuthorized ? 'Authorized' : 'Not authorized' }}
        </p>
        <p>
          <strong>Individual staff release:</strong>
          {{ approvedStaff.length }} approved, {{ deniedStaffCount }} denied.
          If no individuals are approved, no individual ROI or packet access is granted.
        </p>
      </div>

      <div class="review-block">
        <h4>Electronic signature</h4>
        <SignaturePad compact @signed="onSigned" />
      </div>

      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
        <button type="button" class="btn btn-primary" :disabled="submitting || !signatureData" @click="submitRoi">
          {{ submitting ? 'Submitting...' : (isEmbeddedMode ? 'Continue' : 'Complete release') }}
        </button>
      </div>
    </div>

    <div v-else-if="stage === 'complete'" class="smart-roi-card">
      <h3>Release completed</h3>
      <p>The smart school ROI was signed successfully and permissions were applied.</p>
      <div class="actions">
        <a v-if="downloadUrl" class="btn btn-primary" :href="downloadUrl" target="_blank" rel="noopener">Download signed ROI</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import SignaturePad from '../SignaturePad.vue';

const props = defineProps({
  publicKey: {
    type: String,
    required: true
  },
  sessionToken: {
    type: String,
    required: true
  },
  roiContext: {
    type: Object,
    default: null
  },
  link: {
    type: Object,
    required: true
  },
  boundClient: {
    type: Object,
    default: null
  },
  mode: {
    type: String,
    default: 'standalone'
  },
  prefill: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['completed', 'captured']);

const ackItems = computed(() => Array.isArray(props.roiContext?.requiredAcknowledgements) ? props.roiContext.requiredAcknowledgements : []);
const waiverItems = computed(() => Array.isArray(props.roiContext?.waiverItems) ? props.roiContext.waiverItems : []);
const staffRoster = computed(() => Array.isArray(props.roiContext?.staffRoster) ? props.roiContext.staffRoster : []);
const externalReleaseMode = computed(() => {
  const mode = String(props.roiContext?.externalRelease?.mode || '').trim().toLowerCase();
  if (mode === 'sender_programmed') return 'sender_programmed';
  if (mode === 'parent_defined') return 'parent_defined';
  return 'school_staff_only';
});
const programmedRecipient = computed(() => props.roiContext?.externalRelease?.programmedRecipient || null);

const stageOrder = computed(() => {
  const stages = ['intro', 'purpose'];
  ackItems.value.forEach((item) => stages.push(`ack:${item.id}`));
  waiverItems.value.forEach((item) => stages.push(`waiver:${item.id}`));
  stages.push('packet');
  staffRoster.value.forEach((staff) => stages.push(`staff:${staff.schoolStaffUserId}`));
  if (externalReleaseMode.value === 'sender_programmed') stages.push('external_programmed');
  if (externalReleaseMode.value === 'parent_defined') stages.push('external_parent');
  stages.push('guidelines');
  stages.push('term');
  stages.push('review');
  stages.push('complete');
  return stages;
});

const stageIndex = ref(0);
const submissionId = ref(null);
const signatureData = ref('');
const downloadUrl = ref('');
const submitting = ref(false);
const error = ref('');

const formatClientFullName = (firstName, lastName) =>
  `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
const resolveClientFullName = () => {
  const fromContext = String(props.roiContext?.client?.fullName || '').trim();
  if (fromContext) return fromContext;
  const fromBound = String(props.boundClient?.full_name || props.boundClient?.fullName || '').trim();
  if (fromBound) return fromBound;
  const combined = [
    String(props.boundClient?.first_name || '').trim(),
    String(props.boundClient?.last_name || '').trim()
  ].filter(Boolean).join(' ').trim();
  return combined;
};
const resolveClientDob = () => (
  props.roiContext?.client?.dateOfBirth
  || props.boundClient?.date_of_birth
  || props.boundClient?.dob
  || props.boundClient?.birthdate
  || props.boundClient?.birth_date
  || ''
);
const normalizeDateInput = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slashDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const mm = String(slashDate[1]).padStart(2, '0');
    const dd = String(slashDate[2]).padStart(2, '0');
    return `${slashDate[3]}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const prefill = computed(() => (props.prefill && typeof props.prefill === 'object' ? props.prefill : {}));
const prefillIntakeForSelf = typeof prefill.value.intakeForSelf === 'boolean' ? prefill.value.intakeForSelf : null;
const prefillSignerFirst = String(prefill.value.signerFirstName || '').trim();
const prefillSignerLast = String(prefill.value.signerLastName || '').trim();
const prefillSignerEmail = String(prefill.value.signerEmail || '').trim();
const prefillSignerPhone = String(prefill.value.signerPhone || '').trim();
const prefillSignerRelationship = String(prefill.value.signerRelationship || '').trim();
const prefillClientName = String(prefill.value.clientFullName || '').trim();
const prefillClientDob = normalizeDateInput(prefill.value.clientDateOfBirth || '');
const roiClientName = String(resolveClientFullName() || '').trim();
const roiClientDob = normalizeDateInput(resolveClientDob());

const form = reactive({
  intakeForSelf: prefillIntakeForSelf,
  clientFullName: prefillClientName || roiClientName || formatClientFullName(prefillSignerFirst, prefillSignerLast),
  clientDateOfBirth: prefillClientDob || roiClientDob,
  signer: {
    firstName: prefillSignerFirst,
    lastName: prefillSignerLast,
    email: prefillSignerEmail,
    phone: prefillSignerPhone,
    relationship: prefillIntakeForSelf === true ? 'Self' : prefillSignerRelationship
  },
  packetReleaseAllowed: null,
  requiredAcknowledgements: Object.fromEntries(ackItems.value.map((item) => [item.id, null])),
  waiverItems: Object.fromEntries(waiverItems.value.map((item) => [item.id, null])),
  staffDecisions: Object.fromEntries(staffRoster.value.map((staff) => [staff.schoolStaffUserId, null])),
  programmedExternalAllowed: null,
  parentExternalRecipients: [{
    name: '',
    relationship: '',
    email: '',
    phone: '',
    allowed: null
  }]
});

const hydrateClientFieldsFromContext = () => {
  const nextName = String(resolveClientFullName() || '').trim();
  const nextDob = normalizeDateInput(resolveClientDob());
  if (!String(form.clientFullName || '').trim() && nextName) {
    form.clientFullName = nextName;
  }
  if (!String(form.clientDateOfBirth || '').trim() && nextDob) {
    form.clientDateOfBirth = nextDob;
  }
};

const stageToken = computed(() => stageOrder.value[stageIndex.value] || 'intro');
const stage = computed(() => stageToken.value.split(':')[0]);
const currentAckId = computed(() => stageToken.value.startsWith('ack:') ? stageToken.value.split(':')[1] : null);
const currentWaiverId = computed(() => stageToken.value.startsWith('waiver:') ? stageToken.value.split(':')[1] : null);
const currentStaffId = computed(() => stageToken.value.startsWith('staff:') ? Number(stageToken.value.split(':')[1]) : null);
const currentAck = computed(() => ackItems.value.find((item) => item.id === currentAckId.value) || null);
const currentWaiver = computed(() => waiverItems.value.find((item) => item.id === currentWaiverId.value) || null);
const currentStaff = computed(() => staffRoster.value.find((item) => Number(item.schoolStaffUserId) === Number(currentStaffId.value)) || null);
const totalSteps = computed(() => Math.max(stageOrder.value.length - 1, 1));
const stepNumber = computed(() => Math.min(stageIndex.value + 1, totalSteps.value));
const schoolName = computed(() => props.roiContext?.school?.name || 'School');
const schoolAddress = computed(() => String(props.roiContext?.school?.address || '').trim());
const relationshipToParty = computed(() => String(props.roiContext?.school?.relationshipToParty || 'student'));
const schoolContactLine = computed(() => {
  const contact = props.roiContext?.school?.contact || {};
  return [contact.name, contact.email, contact.phone].filter((value) => String(value || '').trim()).join(' · ');
});
const signerFullName = computed(() => `${form.signer.firstName || ''} ${form.signer.lastName || ''}`.trim());
const approvedStaff = computed(() =>
  staffRoster.value.filter((staff) => form.staffDecisions[staff.schoolStaffUserId] === true)
);
const deniedStaffCount = computed(() =>
  staffRoster.value.filter((staff) => form.staffDecisions[staff.schoolStaffUserId] === false).length
);
const schoolSchedulingSafetyAuthorized = computed(() =>
  form.waiverItems.school_scheduling_safety_logistics === 'accept'
);
const approvedExternalRecipients = computed(() =>
  (form.parentExternalRecipients || []).filter((row) => row.allowed === true)
);
const deniedExternalRecipientsCount = computed(() =>
  (form.parentExternalRecipients || []).filter((row) => row.allowed === false).length
);
const isEmbeddedMode = computed(() => String(props.mode || '').toLowerCase() === 'embedded');
const isSubjectChoiceLocked = computed(() => typeof prefill.value.intakeForSelf === 'boolean');
const isClientNameLocked = computed(
  () => isEmbeddedMode.value && String(prefill.value.clientFullName || '').trim().length > 0
);
const subjectDobLabel = computed(() => (form.intakeForSelf === true ? 'Your Date of Birth' : 'Client Date of Birth'));
const signerFirstNameLabel = computed(() => (form.intakeForSelf === true ? 'Your First Name' : 'Responsible Party First Name'));
const signerLastNameLabel = computed(() => (form.intakeForSelf === true ? 'Your Last Name' : 'Responsible Party Last Name'));
const hasRequiredValue = (value) => String(value || '').trim().length > 0;
const requiredFieldClass = (value) => (hasRequiredValue(value) ? '' : 'required-highlight');

const buildRoiPayload = () => ({
  clientFullName: form.clientFullName,
  clientDateOfBirth: form.clientDateOfBirth,
  signatureData: signatureData.value || null,
  signer: {
    ...form.signer
  },
  packetReleaseAllowed: form.packetReleaseAllowed,
  requiredAcknowledgements: { ...form.requiredAcknowledgements },
  waiverItems: { ...form.waiverItems },
  staffDecisions: staffRoster.value.map((staff) => ({
    schoolStaffUserId: staff.schoolStaffUserId,
    allowed: form.staffDecisions[staff.schoolStaffUserId] === true
  })),
  externalReleaseMode: externalReleaseMode.value,
  programmedExternalRecipient: externalReleaseMode.value === 'sender_programmed'
    ? {
        name: programmedRecipient.value?.name || '',
        relationship: programmedRecipient.value?.relationship || '',
        email: programmedRecipient.value?.email || '',
        phone: programmedRecipient.value?.phone || '',
        allowed: form.programmedExternalAllowed
      }
    : null,
  externalRecipients: externalReleaseMode.value === 'parent_defined'
    ? (form.parentExternalRecipients || []).map((row) => ({
        name: row.name,
        relationship: row.relationship,
        email: row.email,
        phone: row.phone,
        allowed: row.allowed
      }))
    : []
});

const buildSubmissionPayload = () => ({
  sessionToken: props.sessionToken,
  signerName: signerFullName.value,
  signerInitials: props.roiContext?.client?.initials || props.boundClient?.initials || null,
  signerEmail: form.signer.email,
  signerPhone: form.signer.phone,
  guardian: {
    firstName: form.signer.firstName,
    lastName: form.signer.lastName,
    email: form.signer.email,
    phone: form.signer.phone,
    relationship: form.signer.relationship
  },
  clients: [{
    id: props.roiContext?.client?.id || props.boundClient?.id || null,
    fullName: form.clientFullName,
    initials: props.roiContext?.client?.initials || props.boundClient?.initials || null
  }],
  intakeData: {
    guardian: {
      firstName: form.signer.firstName,
      lastName: form.signer.lastName,
      email: form.signer.email,
      phone: form.signer.phone,
      relationship: form.signer.relationship
    },
    clients: [{
      id: props.roiContext?.client?.id || props.boundClient?.id || null,
      fullName: form.clientFullName,
      initials: props.roiContext?.client?.initials || props.boundClient?.initials || null
    }],
    smartSchoolRoi: buildRoiPayload()
  }
});

const validateCurrentStage = () => {
  error.value = '';
  if (stage.value === 'intro') {
    if (form.intakeForSelf === null) {
      error.value = 'Choose whether this release is for you or your dependent.';
      return false;
    }
    if (form.intakeForSelf === true && !form.signer.relationship.trim()) {
      form.signer.relationship = 'Self';
    }
    if (!form.clientFullName.trim() || !form.clientDateOfBirth || !form.signer.firstName.trim() || !form.signer.lastName.trim() || !form.signer.email.trim() || !form.signer.relationship.trim()) {
      error.value = 'Complete the client and responsible party details before continuing.';
      return false;
    }
  }
  if (stage.value === 'ack' && form.requiredAcknowledgements[currentAck.value.id] !== true) {
    error.value = 'This acknowledgement must be accepted to continue.';
    return false;
  }
  if (stage.value === 'waiver' && !form.waiverItems[currentWaiver.value.id]) {
    error.value = 'Choose whether to authorize this item before continuing.';
    return false;
  }
  if (stage.value === 'waiver' && currentWaiver.value?.requiredAccept && form.waiverItems[currentWaiver.value.id] !== 'accept') {
    error.value = 'This authorization is required to continue.';
    return false;
  }
  if (stage.value === 'packet' && typeof form.packetReleaseAllowed !== 'boolean') {
    error.value = 'Choose whether approved staff may view the packet and related documents.';
    return false;
  }
  if (stage.value === 'staff' && typeof form.staffDecisions[currentStaff.value.schoolStaffUserId] !== 'boolean') {
    error.value = 'Choose whether to approve or deny release for this staff member.';
    return false;
  }
  if (stage.value === 'external_programmed' && typeof form.programmedExternalAllowed !== 'boolean') {
    error.value = 'Choose whether to approve release for the programmed non-school recipient.';
    return false;
  }
  if (stage.value === 'external_parent') {
    if (!Array.isArray(form.parentExternalRecipients) || form.parentExternalRecipients.length === 0) {
      error.value = 'Add at least one non-school recipient.';
      return false;
    }
    for (const [idx, row] of form.parentExternalRecipients.entries()) {
      if (!String(row.name || '').trim() || !String(row.relationship || '').trim() || typeof row.allowed !== 'boolean') {
        error.value = `Complete recipient ${idx + 1} name, relationship, and decision before continuing.`;
        return false;
      }
    }
  }
  if (stage.value === 'review' && !signatureData.value) {
    error.value = 'Capture an electronic signature before completing the release.';
    return false;
  }
  return true;
};

const goNext = () => {
  if (!validateCurrentStage()) return;
  if (stageIndex.value < stageOrder.value.length - 1) {
    stageIndex.value += 1;
  }
};

const goBack = () => {
  error.value = '';
  if (stageIndex.value > 0) stageIndex.value -= 1;
};

const selectAckDecision = (accepted) => {
  if (!currentAck.value?.id) return;
  form.requiredAcknowledgements[currentAck.value.id] = accepted === true;
  error.value = '';
  goNext();
};

const selectWaiverDecision = (decision) => {
  if (!currentWaiver.value?.id) return;
  form.waiverItems[currentWaiver.value.id] = decision;
  error.value = '';
  goNext();
};

const selectPacketDecision = (allowed) => {
  form.packetReleaseAllowed = allowed === true;
  error.value = '';
  goNext();
};

const selectStaffDecision = (allowed) => {
  if (!currentStaff.value?.schoolStaffUserId) return;
  form.staffDecisions[currentStaff.value.schoolStaffUserId] = allowed === true;
  error.value = '';
  goNext();
};

const selectProgrammedExternalDecision = (allowed) => {
  form.programmedExternalAllowed = allowed === true;
  error.value = '';
  goNext();
};

const addExternalRecipient = () => {
  form.parentExternalRecipients.push({
    name: '',
    relationship: '',
    email: '',
    phone: '',
    allowed: null
  });
};

const removeExternalRecipient = (index) => {
  if (form.parentExternalRecipients.length <= 1) return;
  form.parentExternalRecipients.splice(index, 1);
};

watch(
  () => [
    props.roiContext?.client?.fullName,
    props.roiContext?.client?.dateOfBirth,
    props.boundClient?.full_name,
    props.boundClient?.fullName,
    props.boundClient?.first_name,
    props.boundClient?.last_name,
    props.boundClient?.date_of_birth,
    props.boundClient?.dob,
    props.boundClient?.birthdate,
    props.boundClient?.birth_date
  ],
  () => {
    hydrateClientFieldsFromContext();
  },
  { immediate: true }
);

const onSigned = (dataUrl) => {
  signatureData.value = dataUrl;
  error.value = '';
};

const withRequestTimeout = (promise, ms = 30000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('request_timeout')), ms);
    })
  ]);

const submitRoi = async () => {
  if (!validateCurrentStage()) return;
  submitting.value = true;
  error.value = '';
  try {
    if (isEmbeddedMode.value) {
      emit('captured', {
        smartSchoolRoi: buildRoiPayload()
      });
      return;
    }
    if (!submissionId.value) {
      const consentResp = await withRequestTimeout(
        api.post(`/public-intake/${props.publicKey}/consent`, buildSubmissionPayload()),
        45000
      );
      submissionId.value = consentResp.data?.submission?.id || null;
      if (consentResp.data?.alreadyCompleted) {
        downloadUrl.value = consentResp.data?.downloadUrl || '';
        stageIndex.value = stageOrder.value.indexOf('complete');
        emit('completed', {
          submissionId: submissionId.value,
          downloadUrl: downloadUrl.value,
          emailDelivery: consentResp.data?.emailDelivery || null,
          clientBundles: []
        });
        return;
      }
    }
    if (!submissionId.value) {
      error.value = 'Unable to start this signing session.';
      return;
    }
    const finalizeResp = await withRequestTimeout(
      api.post(`/public-intake/${props.publicKey}/${submissionId.value}/finalize`, {
        ...buildSubmissionPayload(),
        submissionId: submissionId.value,
        signatureData: signatureData.value
      }),
      60000
    );
    downloadUrl.value = finalizeResp.data?.downloadUrl || '';
    stageIndex.value = stageOrder.value.indexOf('complete');
    emit('completed', {
      submissionId: submissionId.value,
      downloadUrl: downloadUrl.value,
      emailDelivery: finalizeResp.data?.emailDelivery || null,
      clientBundles: finalizeResp.data?.clientBundles || []
    });
  } catch (err) {
    if (String(err?.message || '').includes('request_timeout')) {
      error.value = 'This is taking too long to submit. Please retry in a few seconds.';
    } else {
      error.value = err.response?.data?.error?.message || 'Failed to complete the smart school ROI.';
    }
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.smart-roi-flow {
  display: grid;
  gap: 16px;
}

.smart-roi-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow);
}

.progress-label {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 6px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.summary-grid label,
.review-block h4 {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-secondary);
}

.summary-value {
  min-height: 40px;
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
}

.required-fields-note {
  margin-top: 10px;
  margin-bottom: 0;
  color: #9a6700;
  font-size: 13px;
}

.subject-choice-row {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.subject-choice-hint {
  margin-top: 8px;
  margin-bottom: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.roi-input {
  width: 100%;
}

.required-highlight {
  border: 2px solid #f59e0b;
  background: #fffbeb;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.15);
}

.info-panel,
.review-block,
.staff-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  background: var(--bg-secondary);
  margin-top: 14px;
}

.choice-row {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.choice-card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  background: white;
}

.required-note {
  margin-top: 10px;
  margin-bottom: 0;
  color: #9a6700;
  font-weight: 600;
}

.auto-advance-note {
  margin-top: 10px;
  margin-bottom: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.separation-note {
  margin-top: 6px;
  margin-bottom: 0;
  color: #9a6700;
  font-size: 13px;
}

.staff-name {
  font-size: 18px;
  font-weight: 600;
}

.staff-meta {
  color: var(--text-secondary);
  margin-top: 4px;
}

.staff-email {
  color: var(--text-secondary);
  margin-top: 4px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
</style>
