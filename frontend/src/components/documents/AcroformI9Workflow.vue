<template>
  <div class="acroform-i9-workflow">
    <div v-if="error" class="error-message">
      <strong>Error:</strong> {{ error }}
    </div>

    <div v-if="loading" class="loading">Loading I-9...</div>

    <div v-else>
      <div v-if="step === 'consent'" class="step">
        <h2>Electronic Signature Consent</h2>
        <p>
          You are being asked to complete and sign an I-9 electronically. By proceeding, you consent to conduct
          this process electronically and receive electronic records.
        </p>
        <button class="btn btn-primary" :disabled="submitting" @click="giveConsent">
          {{ submitting ? 'Processing...' : 'I Consent' }}
        </button>
      </div>

      <div v-else-if="step === 'wizard'" class="step">
        <h2>I-9 Information (Section 1)</h2>
        <p class="note">Complete the form below. You will sign on the next step.</p>

        <form @submit.prevent="goToSignature" class="wizard-form">
          <div class="grid">
            <div class="form-group">
              <label>First name</label>
              <input v-model="wizard.employeeFirstName" type="text" required />
            </div>
            <div class="form-group">
              <label>Last name</label>
              <input v-model="wizard.employeeLastName" type="text" required />
            </div>
            <div class="form-group">
              <label>Middle initial</label>
              <input v-model="wizard.employeeMiddleInitial" type="text" maxlength="1" />
            </div>
            <div class="form-group">
              <label>Other last names used (optional)</label>
              <input v-model="wizard.employeeOtherLastNames" type="text" />
            </div>

            <div class="form-group">
              <label>Street address</label>
              <input v-model="wizard.addressStreet" type="text" required />
            </div>
            <div class="form-group">
              <label>Apt (optional)</label>
              <input v-model="wizard.addressApt" type="text" />
            </div>
            <div class="form-group">
              <label>City</label>
              <input v-model="wizard.addressCity" type="text" required />
            </div>
            <div class="form-group">
              <label>State</label>
              <input v-model="wizard.addressState" type="text" required />
            </div>
            <div class="form-group">
              <label>ZIP</label>
              <input v-model="wizard.addressZip" type="text" required />
            </div>

            <div class="form-group">
              <label>Date of birth (MM/DD/YYYY)</label>
              <input v-model="wizard.dateOfBirth" type="text" placeholder="MM/DD/YYYY" required />
            </div>
            <div class="form-group">
              <label>SSN</label>
              <input v-model="wizard.ssn" type="text" />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input v-model="wizard.email" type="email" />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input v-model="wizard.phone" type="tel" />
            </div>

            <div class="form-group">
              <label>Citizenship/immigration status</label>
              <select v-model="wizard.citizenshipStatus" required>
                <option value="citizen">Citizen of the United States</option>
                <option value="noncitizen_national">Noncitizen national of the United States</option>
                <option value="permanent_resident">Lawful permanent resident</option>
                <option value="authorized_alien">Alien authorized to work</option>
              </select>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-primary" type="submit">Continue to Signature</button>
            <button class="btn btn-secondary" type="button" @click="router.push(getDashboardRoute())">Cancel</button>
          </div>
        </form>
      </div>

      <div v-else-if="step === 'signature'" class="step">
        <h2>Sign I-9</h2>
        <p class="note">Please sign below to finalize.</p>
        <SignaturePad @signed="onSigned" />
        <div class="actions">
          <button class="btn btn-primary" :disabled="!signatureData || submitting" @click="finalize">
            {{ submitting ? 'Finalizing...' : 'Finalize I-9' }}
          </button>
          <button class="btn btn-secondary" :disabled="submitting" @click="step = 'wizard'">Back</button>
        </div>
      </div>

      <div v-else-if="step === 'complete'" class="step">
        <h2>I-9 Completed</h2>
        <p>✓ Your I-9 has been generated and finalized.</p>
        <div class="actions">
          <button class="btn btn-primary" :disabled="submitting" @click="download">
            {{ submitting ? 'Downloading...' : 'Download PDF' }}
          </button>
          <button class="btn btn-secondary" @click="router.push(getDashboardRoute())">Return to Dashboard</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import SignaturePad from '../SignaturePad.vue';
import { useDocumentsStore } from '../../store/documents';
import { getDashboardRoute } from '../../utils/router';

const route = useRoute();
const router = useRouter();
const documentsStore = useDocumentsStore();

const taskId = route.params.taskId;
const loading = ref(true);
const submitting = ref(false);
const error = ref('');

const step = ref('consent'); // consent -> wizard -> signature -> complete
const signatureData = ref('');

const wizard = ref({
  employeeFirstName: '',
  employeeLastName: '',
  employeeMiddleInitial: '',
  employeeOtherLastNames: '',
  addressStreet: '',
  addressApt: '',
  addressCity: '',
  addressState: '',
  addressZip: '',
  dateOfBirth: '',
  ssn: '',
  email: '',
  phone: '',
  citizenshipStatus: 'citizen'
});

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    // Ensure task exists and is accessible
    await api.get(`/document-signing/${taskId}`);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load I-9 task';
  } finally {
    loading.value = false;
  }
};

const giveConsent = async () => {
  try {
    submitting.value = true;
    error.value = '';
    await api.post(`/document-signing/${taskId}/consent`);
    step.value = 'wizard';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to record consent';
  } finally {
    submitting.value = false;
  }
};

const goToSignature = async () => {
  step.value = 'signature';
};

const onSigned = (dataUrl) => {
  signatureData.value = dataUrl;
};

const finalize = async () => {
  try {
    submitting.value = true;
    error.value = '';
    await documentsStore.finalizeAcroformI9(taskId, wizard.value, signatureData.value);
    step.value = 'complete';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to finalize I-9';
  } finally {
    submitting.value = false;
  }
};

const download = async () => {
  try {
    submitting.value = true;
    await documentsStore.downloadSignedDocument(taskId);
  } finally {
    submitting.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.error-message {
  background: #fee;
  border: 1px solid #fcc;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.note {
  color: var(--text-secondary);
  margin: 6px 0 18px;
}

.wizard-form .grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  box-sizing: border-box;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
}
</style>

