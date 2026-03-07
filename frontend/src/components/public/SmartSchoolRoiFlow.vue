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

      <div class="summary-grid">
        <div>
          <label>Client</label>
          <div class="summary-value">{{ form.clientFullName || '—' }}</div>
        </div>
        <div>
          <label>Date of Birth</label>
          <input v-model="form.clientDateOfBirth" type="date" />
        </div>
        <div>
          <label>Responsible Party First Name</label>
          <input v-model="form.signer.firstName" type="text" />
        </div>
        <div>
          <label>Responsible Party Last Name</label>
          <input v-model="form.signer.lastName" type="text" />
        </div>
        <div>
          <label>Email</label>
          <input v-model="form.signer.email" type="email" />
        </div>
        <div>
          <label>Phone</label>
          <input v-model="form.signer.phone" type="tel" />
        </div>
        <div>
          <label>Relationship to Client</label>
          <input v-model="form.signer.relationship" type="text" placeholder="Parent, guardian, self, etc." />
        </div>
        <div>
          <label>School</label>
          <div class="summary-value">{{ schoolName }}</div>
        </div>
      </div>

      <div class="info-panel">
        <h4>Purpose of this release</h4>
        <ul>
          <li v-for="purpose in roiContext.purposes || []" :key="purpose">{{ purpose }}</li>
        </ul>
      </div>

      <div class="actions">
        <button type="button" class="btn btn-primary" @click="goNext">Continue</button>
      </div>
    </div>

    <div v-else-if="stage === 'ack'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>{{ currentAck?.title }}</h3>
      <p>{{ currentAck?.body }}</p>
      <div class="choice-row">
        <label class="choice-card">
          <input v-model="form.requiredAcknowledgements[currentAck.id]" :value="true" type="radio" />
          <span>I acknowledge and accept</span>
        </label>
        <label class="choice-card">
          <input v-model="form.requiredAcknowledgements[currentAck.id]" :value="false" type="radio" />
          <span>I do not accept</span>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
        <button type="button" class="btn btn-primary" @click="goNext">Continue</button>
      </div>
    </div>

    <div v-else-if="stage === 'waiver'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>{{ currentWaiver?.title }}</h3>
      <p>{{ currentWaiver?.body }}</p>
      <div class="choice-row">
        <label class="choice-card">
          <input v-model="form.waiverItems[currentWaiver.id]" value="accept" type="radio" />
          <span>Authorize</span>
        </label>
        <label class="choice-card">
          <input v-model="form.waiverItems[currentWaiver.id]" value="decline" type="radio" />
          <span>Do not authorize</span>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
        <button type="button" class="btn btn-primary" @click="goNext">Continue</button>
      </div>
    </div>

    <div v-else-if="stage === 'packet'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>Packet and document visibility</h3>
      <p>
        Approved staff will receive basic ROI access. Do you also authorize approved staff to view the packet and related documents?
      </p>
      <div class="choice-row">
        <label class="choice-card">
          <input v-model="form.packetReleaseAllowed" :value="true" type="radio" />
          <span>Yes, approved staff may view the packet</span>
        </label>
        <label class="choice-card">
          <input v-model="form.packetReleaseAllowed" :value="false" type="radio" />
          <span>No, approved staff receive ROI access only</span>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
        <button type="button" class="btn btn-primary" @click="goNext">Continue</button>
      </div>
    </div>

    <div v-else-if="stage === 'staff'" class="smart-roi-card">
      <div class="progress-label">Step {{ stepNumber }} of {{ totalSteps }}</div>
      <h3>School staff approval</h3>
      <p>Choose whether information may be released to this staff member.</p>
      <div class="staff-card">
        <div class="staff-name">{{ currentStaff?.fullName }}</div>
        <div class="staff-email" v-if="currentStaff?.email">{{ currentStaff.email }}</div>
      </div>
      <div class="choice-row">
        <label class="choice-card">
          <input v-model="form.staffDecisions[currentStaff.schoolStaffUserId]" :value="true" type="radio" />
          <span>Approve release</span>
        </label>
        <label class="choice-card">
          <input v-model="form.staffDecisions[currentStaff.schoolStaffUserId]" :value="false" type="radio" />
          <span>Deny release</span>
        </label>
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

      <div class="review-block">
        <h4>Electronic signature</h4>
        <SignaturePad compact @signed="onSigned" />
      </div>

      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
        <button type="button" class="btn btn-primary" :disabled="submitting || !signatureData" @click="submitRoi">
          {{ submitting ? 'Submitting...' : 'Complete release' }}
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
import { computed, reactive, ref } from 'vue';
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
    required: true
  },
  link: {
    type: Object,
    required: true
  },
  boundClient: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['completed']);

const ackItems = computed(() => Array.isArray(props.roiContext?.requiredAcknowledgements) ? props.roiContext.requiredAcknowledgements : []);
const waiverItems = computed(() => Array.isArray(props.roiContext?.waiverItems) ? props.roiContext.waiverItems : []);
const staffRoster = computed(() => Array.isArray(props.roiContext?.staffRoster) ? props.roiContext.staffRoster : []);

const stageOrder = computed(() => {
  const stages = ['intro'];
  ackItems.value.forEach((item) => stages.push(`ack:${item.id}`));
  waiverItems.value.forEach((item) => stages.push(`waiver:${item.id}`));
  stages.push('packet');
  staffRoster.value.forEach((staff) => stages.push(`staff:${staff.schoolStaffUserId}`));
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

const form = reactive({
  clientFullName: props.roiContext?.client?.fullName || props.boundClient?.full_name || '',
  clientDateOfBirth: props.roiContext?.client?.dateOfBirth || props.boundClient?.date_of_birth || '',
  signer: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    relationship: ''
  },
  packetReleaseAllowed: null,
  requiredAcknowledgements: Object.fromEntries(ackItems.value.map((item) => [item.id, null])),
  waiverItems: Object.fromEntries(waiverItems.value.map((item) => [item.id, null])),
  staffDecisions: Object.fromEntries(staffRoster.value.map((staff) => [staff.schoolStaffUserId, null]))
});

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
const signerFullName = computed(() => `${form.signer.firstName || ''} ${form.signer.lastName || ''}`.trim());
const approvedStaff = computed(() =>
  staffRoster.value.filter((staff) => form.staffDecisions[staff.schoolStaffUserId] === true)
);

const buildRoiPayload = () => ({
  clientFullName: form.clientFullName,
  clientDateOfBirth: form.clientDateOfBirth,
  signer: {
    ...form.signer
  },
  packetReleaseAllowed: form.packetReleaseAllowed,
  requiredAcknowledgements: { ...form.requiredAcknowledgements },
  waiverItems: { ...form.waiverItems },
  staffDecisions: staffRoster.value.map((staff) => ({
    schoolStaffUserId: staff.schoolStaffUserId,
    allowed: form.staffDecisions[staff.schoolStaffUserId] === true
  }))
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
    if (!form.clientFullName.trim() || !form.clientDateOfBirth || !form.signer.firstName.trim() || !form.signer.lastName.trim() || !form.signer.email.trim() || !form.signer.relationship.trim()) {
      error.value = 'Complete the client and responsible party details before continuing.';
      return false;
    }
  }
  if (stage.value === 'ack' && form.requiredAcknowledgements[currentAck.value.id] === null) {
    error.value = 'Choose whether you accept this acknowledgement before continuing.';
    return false;
  }
  if (stage.value === 'ack' && form.requiredAcknowledgements[currentAck.value.id] !== true) {
    error.value = 'This acknowledgement must be accepted to continue.';
    return false;
  }
  if (stage.value === 'waiver' && !form.waiverItems[currentWaiver.value.id]) {
    error.value = 'Choose whether to authorize this item before continuing.';
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

const onSigned = (dataUrl) => {
  signatureData.value = dataUrl;
  error.value = '';
};

const submitRoi = async () => {
  if (!validateCurrentStage()) return;
  submitting.value = true;
  error.value = '';
  try {
    if (!submissionId.value) {
      const consentResp = await api.post(`/public-intake/${props.publicKey}/consent`, buildSubmissionPayload());
      submissionId.value = consentResp.data?.submission?.id || null;
    }
    if (!submissionId.value) {
      error.value = 'Unable to start this signing session.';
      return;
    }
    const finalizeResp = await api.post(`/public-intake/${props.publicKey}/${submissionId.value}/finalize`, {
      ...buildSubmissionPayload(),
      submissionId: submissionId.value,
      signatureData: signatureData.value
    });
    downloadUrl.value = finalizeResp.data?.downloadUrl || '';
    stageIndex.value = stageOrder.value.indexOf('complete');
    emit('completed', {
      submissionId: submissionId.value,
      downloadUrl: downloadUrl.value,
      clientBundles: finalizeResp.data?.clientBundles || []
    });
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to complete the smart school ROI.';
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

.staff-name {
  font-size: 18px;
  font-weight: 600;
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
