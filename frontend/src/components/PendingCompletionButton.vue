<template>
  <div class="pending-completion-button">
    <button 
      @click="showConfirmModal = true" 
      class="btn btn-primary btn-large"
      :disabled="loading"
    >
      {{ loading ? 'Processing...' : 'Mark Hiring Process Completed' }}
    </button>
    
    <!-- Confirmation Modal -->
    <div v-if="showConfirmModal" class="modal-overlay" @click="showConfirmModal = false">
      <div class="modal-content" @click.stop>
        <h2>Mark Hiring Process as Complete</h2>
        <p>Are you sure you want to mark the hiring process as complete? This will:</p>
        <ul>
          <li>Change your status to "Ready for Review"</li>
          <li>Lock your access to this portal immediately</li>
          <li>Invalidate your passwordless login link</li>
          <li>Notify administrators for next steps</li>
        </ul>
        <p><strong>Your access will be locked and you will not be able to log in again until an administrator moves you to active status.</strong></p>
        <p><strong>This action cannot be undone.</strong></p>
        <div class="modal-actions">
          <button @click="showConfirmModal = false" class="btn btn-secondary">Cancel</button>
          <button @click="confirmCompletion" class="btn btn-primary" :disabled="loading">
            {{ loading ? 'Processing...' : 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import api from '../services/api';

const router = useRouter();
const authStore = useAuthStore();

const showConfirmModal = ref(false);
const loading = ref(false);

const emit = defineEmits(['completed']);

const confirmCompletion = async () => {
  try {
    loading.value = true;
    const userId = authStore.user?.id;
    
    if (!userId) {
      throw new Error('User not found');
    }
    
    await api.post(`/users/${userId}/pending/complete`);
    
    // Emit completion event
    emit('completed');
    
    // Redirect to completion view
    router.push('/pending-completion');
  } catch (error) {
    console.error('Error marking pending complete:', error);
    const errorMessage = error.response?.data?.error?.message || 'Failed to mark hiring process as complete. Please try again.';
    
    // If user is already in ready_for_review, show a more helpful message
    if (error.response?.data?.error?.status === 'ready_for_review' || errorMessage.includes('ready for review') || errorMessage.includes('already completed')) {
      alert('You have already completed the pre-hire process. Your account is now ready for review by your administrator. You will be notified when your account is activated.');
      // Refresh the page to update the UI
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      alert(errorMessage);
    }
    
    loading.value = false;
    showConfirmModal.value = false;
  }
};
</script>

<style scoped>
.pending-completion-button {
  margin-top: 16px;
}

.btn-large {
  padding: 12px 24px;
  font-size: 16px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
}

.modal-content h2 {
  margin-top: 0;
  margin-bottom: 16px;
}

.modal-content ul {
  margin: 16px 0;
  padding-left: 24px;
}

.modal-content li {
  margin: 8px 0;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>
