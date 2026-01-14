<template>
  <div class="referral-form">
    <div class="form-header">
      <h2>Refer Student</h2>
      <p class="form-description">Complete the referral form to submit a new student referral</p>
    </div>

    <form @submit.prevent="handleSubmit" class="referral-form-content">
      <div class="form-group">
        <label for="student-name">Student Name *</label>
        <input
          id="student-name"
          v-model="formData.studentName"
          type="text"
          required
          placeholder="Enter student name"
          class="form-input"
        />
      </div>

      <div class="form-group">
        <label for="student-initials">Student Initials *</label>
        <input
          id="student-initials"
          v-model="formData.studentInitials"
          type="text"
          required
          placeholder="e.g., JD"
          maxlength="10"
          class="form-input"
        />
      </div>

      <div class="form-group">
        <label for="referral-reason">Referral Reason *</label>
        <textarea
          id="referral-reason"
          v-model="formData.referralReason"
          required
          placeholder="Describe the reason for referral"
          rows="4"
          class="form-textarea"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="additional-notes">Additional Notes</label>
        <textarea
          id="additional-notes"
          v-model="formData.additionalNotes"
          placeholder="Any additional information (optional)"
          rows="3"
          class="form-textarea"
        ></textarea>
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>

      <div v-if="success" class="success-message">
        {{ success }}
      </div>

      <div class="form-actions">
        <button type="button" @click="$emit('cancel')" class="btn btn-secondary">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="submitting">
          <span v-if="submitting">Submitting...</span>
          <span v-else>Submit Referral</span>
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '../../services/api';

const props = defineProps({
  organizationSlug: {
    type: String,
    required: true
  },
  organizationId: {
    type: Number,
    required: true
  }
});

const emit = defineEmits(['cancel', 'submitted']);

const formData = ref({
  studentName: '',
  studentInitials: '',
  referralReason: '',
  additionalNotes: ''
});

const submitting = ref(false);
const error = ref('');
const success = ref('');

const handleSubmit = async () => {
  if (!formData.value.studentName || !formData.value.studentInitials || !formData.value.referralReason) {
    error.value = 'Please fill in all required fields';
    return;
  }

  submitting.value = true;
  error.value = '';
  success.value = '';

  try {
    // TODO: Update endpoint when referrals API is ready
    const response = await api.post('/referrals', {
      organization_id: props.organizationId,
      student_name: formData.value.studentName,
      student_initials: formData.value.studentInitials,
      referral_reason: formData.value.referralReason,
      additional_notes: formData.value.additionalNotes,
      status: 'PENDING'
    });

    success.value = 'Referral submitted successfully!';
    
    // Emit success event after a short delay
    setTimeout(() => {
      emit('submitted', response.data);
    }, 1500);
  } catch (err) {
    console.error('Referral submission error:', err);
    error.value = err.response?.data?.error?.message || 'Failed to submit referral. Please try again.';
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.referral-form {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.form-header {
  margin-bottom: 32px;
  text-align: center;
}

.form-header h2 {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.form-description {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

.referral-form-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
  transition: all 0.2s;
  box-sizing: border-box;
  font-family: inherit;
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--primary);
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #fcc;
}

.success-message {
  background: #efe;
  color: #3c3;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #cfc;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 32px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-dark, var(--primary));
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--border);
}
</style>
