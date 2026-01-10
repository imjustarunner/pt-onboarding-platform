<template>
  <div class="container">
    <div class="completion-card">
      <div class="completion-icon">✓</div>
      <h1>Pre-Hire Process Complete</h1>
      <p class="completion-message">
        You have successfully completed the pre-hire process. Your access to this portal has been locked.
      </p>
      <div class="next-steps">
        <h2>Next Steps</h2>
        <p>Your information has been submitted for review. An administrator will:</p>
        <ul>
          <li>Review your completed items</li>
          <li>Contact references</li>
          <li>Move you to the next stage of onboarding</li>
        </ul>
        <p>You will be notified when your account is activated and you can begin the full onboarding process.</p>
      </div>
      <div class="contact-info">
        <p>If you have any questions, please contact your agency administrator.</p>
      </div>
      <div class="download-section">
        <button @click="downloadCompletionSummary" class="btn btn-primary" :disabled="downloading">
          {{ downloading ? 'Generating...' : 'Download Completion Summary' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import api from '../services/api';

const router = useRouter();
const authStore = useAuthStore();
const downloading = ref(false);

onMounted(() => {
  // Check if user is actually in ready_for_review status
  // If not, redirect to dashboard
  const user = authStore.user;
  if (user && user.status !== 'ready_for_review' && user.status !== 'pending') {
    router.push('/dashboard');
  }
});

const downloadCompletionSummary = async () => {
  try {
    downloading.value = true;
    const userId = authStore.user?.id;
    if (!userId) {
      throw new Error('User not found');
    }
    
    const response = await api.get(`/users/${userId}/pending/completion-summary`, {
      responseType: 'blob'
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `completion-summary-${authStore.user.first_name}-${authStore.user.last_name}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading completion summary:', error);
    alert(error.response?.data?.error?.message || 'Failed to download completion summary');
  } finally {
    downloading.value = false;
  }
};
</script>

<style scoped>
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
  padding: 20px;
}

.completion-card {
  background: white;
  padding: 48px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  max-width: 600px;
  width: 100%;
  text-align: center;
}

.completion-icon {
  font-size: 64px;
  color: var(--success, #10b981);
  margin-bottom: 24px;
}

.completion-card h1 {
  margin-bottom: 16px;
  color: var(--primary, #3b82f6);
}

.completion-message {
  font-size: 18px;
  margin-bottom: 32px;
  color: #666;
}

.next-steps {
  text-align: left;
  margin: 32px 0;
  padding: 24px;
  background: #f9fafb;
  border-radius: 8px;
}

.next-steps h2 {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 20px;
}

.next-steps ul {
  margin: 16px 0;
  padding-left: 24px;
}

.next-steps li {
  margin: 8px 0;
}

.contact-info {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
  color: #666;
}

.download-section {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
}

.download-section .btn {
  padding: 12px 24px;
  font-size: 16px;
}
</style>
