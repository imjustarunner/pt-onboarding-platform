<template>
  <div v-if="open" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Add New Member</h2>
        <button type="button" class="btn-close" @click="$emit('close')" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="hint">Enter the member's email, username, or phone number. We'll check if they already have an account.</p>
        <form v-if="!success" @submit.prevent="submit" class="add-member-form">
          <div class="form-group">
            <label for="add-member-identifier">Email, username, or phone *</label>
            <input
              id="add-member-identifier"
              v-model="identifier"
              type="text"
              required
              placeholder="name@example.com · username · 555-867-5309"
              :disabled="loading"
              class="form-input"
              autocomplete="off"
            />
          </div>
          <div v-if="error" class="error-msg">{{ error }}</div>
          <div v-if="notFound" class="not-found-msg">
            <strong>No account found.</strong> They can sign up as a participant and apply to join your club from the club search page.
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="loading || !identifier.trim()">
              {{ loading ? 'Checking…' : 'Add Member' }}
            </button>
          </div>
        </form>
        <div v-else class="success-msg">
          <p>{{ successMessage }}</p>
          <button type="button" class="btn btn-primary" @click="handleDone">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  clubId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'added']);

const identifier = ref('');
const loading = ref(false);
const error = ref('');
const notFound = ref(false);
const success = ref(false);
const successMessage = ref('');

watch(() => props.open, (open) => {
  if (!open) {
    identifier.value = '';
    error.value = '';
    notFound.value = false;
    success.value = false;
    successMessage.value = '';
  }
});

const submit = async () => {
  if (!props.clubId) return;
  loading.value = true;
  error.value = '';
  notFound.value = false;
  try {
    const r = await api.post(`/summit-stats/clubs/${props.clubId}/add-member`, {
      identifier: identifier.value.trim()
    }, { skipGlobalLoading: true });
    if (r.data?.exists === false) {
      notFound.value = true;
      return;
    }
    success.value = true;
    successMessage.value = r.data?.message || 'Member added successfully.';
    emit('added');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to add member.';
  } finally {
    loading.value = false;
  }
};

const handleDone = () => {
  emit('close');
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1400;
}

.modal-content {
  background: white;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  width: 96%;
  max-width: 440px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 20px;
}

.hint {
  margin: 0 0 16px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.add-member-form .form-group {
  margin-bottom: 16px;
}

.add-member-form label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 14px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.error-msg {
  color: #b91c1c;
  font-size: 13px;
  margin-bottom: 12px;
}

.not-found-msg {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 16px;
  padding: 12px;
  background: #fef3c7;
  border-radius: 8px;
}

.success-msg {
  text-align: center;
}

.success-msg p {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
