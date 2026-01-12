<template>
  <div class="container">
    <h1>{{ isPending ? 'Pre-Hire Checklist' : 'My Training Dashboard' }}</h1>
    
    <!-- Pending Completion Button -->
    <div v-if="isPending && pendingCompletionStatus?.allComplete && !pendingCompletionStatus?.accessLocked && (userStatus === 'PREHIRE_OPEN' || userStatus === 'pending')" class="pending-completion-banner">
      <div class="completion-content">
        <strong>✓ All Items Complete</strong>
        <p>You have completed all required pre-hire tasks. Mark the hiring process as complete when you're ready.</p>
        <PendingCompletionButton @completed="handlePendingCompleted" />
      </div>
    </div>
    
    <!-- Ready for Review Banner -->
    <div v-if="userStatus === 'PREHIRE_REVIEW' || userStatus === 'ready_for_review'" class="ready-for-review-banner">
      <div class="review-content">
        <strong>✓ Pre-Hire Process Complete</strong>
        <p>You have completed all required pre-hire tasks. Your account is now ready for review by your administrator. You will be notified when your account is activated.</p>
        <p><em>Your access to this portal has been locked. An administrator will review your information and activate your account.</em></p>
      </div>
    </div>
    
    <!-- Onboarding Status Banner -->
    <div v-if="userStatus === 'ONBOARDING'" class="onboarding-banner">
      <div class="onboarding-content">
        <strong>📚 Onboarding in Progress</strong>
        <p>You are currently completing your onboarding training. Continue working through your assigned modules and documents.</p>
      </div>
    </div>
    
    <!-- Status Warning Banner (for legacy completed status) -->
    <div v-if="(userStatus === 'ACTIVE_EMPLOYEE' || userStatus === 'completed') && daysRemaining !== null" class="status-warning-banner">
      <div class="warning-content">
        <strong>⚠️ Onboarding Complete</strong>
        <p v-if="daysRemaining > 0">
          You have {{ daysRemaining }} day{{ daysRemaining !== 1 ? 's' : '' }} remaining to download your finalized onboarding document.
        </p>
        <p v-else>
          Your access has expired. Please contact your agency for assistance.
        </p>
        <p class="warning-note">
          Once your checklist is marked as completed, you will have approximately 7 days to download your finalized onboarding document, though it will be accessible via the agency's website.
        </p>
      </div>
      <button 
        v-if="daysRemaining > 0"
        @click="downloadOnboardingDocument" 
        class="btn btn-primary"
        :disabled="downloading"
      >
        {{ downloading ? 'Generating...' : 'Download Onboarding Document' }}
      </button>
    </div>
    
    <!-- Onboarding Checklist Card -->
    <div v-if="onboardingCompletion < 100" class="onboarding-card">
      <div class="onboarding-header">
        <h2>Onboarding Checklist</h2>
        <span class="completion-badge">{{ onboardingCompletion }}% Complete</span>
      </div>
      <div class="onboarding-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: onboardingCompletion + '%' }"></div>
        </div>
      </div>
      <p class="onboarding-description">Complete your onboarding tasks to get started.</p>
      <router-link to="/onboarding" class="btn btn-primary">View Checklist</router-link>
    </div>
    
    <!-- Tab Navigation -->
    <div class="dashboard-tabs">
      <button
        v-for="tab in filteredTabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="['tab-button', { active: activeTab === tab.id }]"
      >
        {{ tab.label }}
        <span v-if="tab.badgeCount > 0" class="tab-badge">{{ tab.badgeCount }}</span>
      </button>
    </div>
    
    <!-- Tab Content -->
    <div class="tab-content">
      <TrainingFocusTab
        v-show="activeTab === 'training' && !isPending"
        @update-count="updateTrainingCount"
      />
      
      <DocumentsTab
        v-show="activeTab === 'documents'"
        @update-count="updateDocumentsCount"
      />
      
      <UnifiedChecklistTab
        v-show="activeTab === 'checklist'"
        @update-count="updateChecklistCount"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import TrainingFocusTab from '../components/dashboard/TrainingFocusTab.vue';
import DocumentsTab from '../components/dashboard/DocumentsTab.vue';
import UnifiedChecklistTab from '../components/dashboard/UnifiedChecklistTab.vue';
import PendingCompletionButton from '../components/PendingCompletionButton.vue';

const router = useRouter();
const authStore = useAuthStore();
const activeTab = ref('checklist');
const onboardingCompletion = ref(100);
const trainingCount = ref(0);
const documentsCount = ref(0);
const checklistCount = ref(0);
const userStatus = ref('active');
const daysRemaining = ref(null);
const downloading = ref(false);
const isPending = ref(false);
const pendingCompletionStatus = ref(null);

const tabs = computed(() => [
  { id: 'checklist', label: 'Checklist', badgeCount: checklistCount.value },
  { id: 'training', label: 'Training', badgeCount: trainingCount.value },
  { id: 'documents', label: 'Documents', badgeCount: documentsCount.value }
]);

const filteredTabs = computed(() => {
  // PREHIRE_OPEN, PREHIRE_REVIEW, and ONBOARDING users see limited tabs
  if (isPending.value || userStatus.value === 'PREHIRE_REVIEW' || userStatus.value === 'ONBOARDING' || 
      userStatus.value === 'ready_for_review') {
    // Pre-hire and onboarding users only see checklist and documents (no training tab)
    return tabs.value.filter(tab => tab.id !== 'training');
  }
  // ACTIVE_EMPLOYEE and TERMINATED_PENDING users see all tabs
  return tabs.value;
});

const updateTrainingCount = (count) => {
  trainingCount.value = count;
};

const updateDocumentsCount = (count) => {
  documentsCount.value = count;
};

const updateChecklistCount = (count) => {
  checklistCount.value = count;
};

const fetchOnboardingStatus = async () => {
  try {
    const api = (await import('../services/api')).default;
    const userId = authStore.user?.id;
    if (userId) {
      const [checklistResponse, userResponse] = await Promise.all([
        api.get(`/users/${userId}/onboarding-checklist`),
        api.get(`/users/${userId}`)
      ]);
      onboardingCompletion.value = checklistResponse.data.completionPercentage || 100;
      userStatus.value = userResponse.data.status || 'ACTIVE_EMPLOYEE';
      isPending.value = userStatus.value === 'PREHIRE_OPEN' || userStatus.value === 'PENDING_SETUP' || userStatus.value === 'pending';
      
      // Fetch pending completion status if user is in pre-hire status
      if (isPending.value || userStatus.value === 'PREHIRE_REVIEW' || userStatus.value === 'ready_for_review') {
        try {
          const statusResponse = await api.get(`/users/${userId}/pending/status`);
          pendingCompletionStatus.value = statusResponse.data;
        } catch (err) {
          console.error('Error fetching pending completion status:', err);
          // If user is PREHIRE_REVIEW, set accessLocked to true
          if (userStatus.value === 'PREHIRE_REVIEW' || userStatus.value === 'ready_for_review') {
            pendingCompletionStatus.value = { accessLocked: true, allComplete: true };
          }
        }
      }
      
      // Calculate days remaining
      if (userResponse.data.status_expires_at) {
        const expiresAt = new Date(userResponse.data.status_expires_at);
        const now = new Date();
        const diffTime = expiresAt - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysRemaining.value = diffDays > 0 ? diffDays : 0;
      } else {
        daysRemaining.value = null;
      }
    }
  } catch (err) {
    // If checklist doesn't exist or error, assume complete
    onboardingCompletion.value = 100;
  }
};

const handlePendingCompleted = () => {
  // Redirect to completion view
  router.push('/pending-completion');
};

const downloadOnboardingDocument = async () => {
  try {
    downloading.value = true;
    const api = (await import('../services/api')).default;
    const userId = authStore.user?.id;
    
    const response = await api.get(`/users/${userId}/onboarding-document`, {
      responseType: 'blob'
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `onboarding-document-${Date.now()}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download onboarding document');
  } finally {
    downloading.value = false;
  }
};

onMounted(async () => {
  await fetchOnboardingStatus();
});
</script>

<style scoped>
h1 {
  margin-bottom: 30px;
  color: #2c3e50;
}

.onboarding-card {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  color: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 32px;
  box-shadow: var(--shadow-lg);
}

.onboarding-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.onboarding-header h2 {
  margin: 0;
  color: white;
  font-size: 24px;
}

.completion-badge {
  background: rgba(255, 255, 255, 0.2);
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 14px;
}

.onboarding-progress {
  margin-bottom: 16px;
}

.progress-bar {
  width: 100%;
  height: 12px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: white;
  transition: width 0.3s ease;
  border-radius: 6px;
}

.onboarding-description {
  margin: 0 0 16px 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
}

.onboarding-card .btn {
  background: white;
  color: var(--primary);
  border: none;
}

.onboarding-card .btn:hover {
  background: rgba(255, 255, 255, 0.9);
}

.dashboard-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0;
}

.tab-button {
  position: relative;
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--text-primary);
}

.tab-button.active {
  color: var(--primary);
  border-bottom-color: var(--accent);
}

.tab-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  background: #dc2626;
  color: white;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  min-width: 20px;
  text-align: center;
}

.tab-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.status-warning-banner {
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.warning-content {
  flex: 1;
}

.warning-content strong {
  display: block;
  margin-bottom: 8px;
  color: #92400e;
  font-size: 16px;
}

.warning-content p {
  margin: 4px 0;
  color: #78350f;
  font-size: 14px;
}

.warning-note {
  margin-top: 12px !important;
  font-size: 12px !important;
  font-style: italic;
  color: #78350f !important;
}

.pending-completion-banner {
  background: #d1fae5;
  border-left: 4px solid #10b981;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.completion-content strong {
  display: block;
  color: #065f46;
  font-size: 18px;
  margin-bottom: 12px;
}

.completion-content p {
  margin: 8px 0;
  color: #047857;
}

.ready-for-review-banner {
  background: #dbeafe;
  border-left: 4px solid #3b82f6;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.review-content strong {
  display: block;
  color: #1e40af;
  font-size: 18px;
  margin-bottom: 12px;
}

.review-content p {
  margin: 8px 0;
  color: #1e3a8a;
}

.review-content em {
  color: #64748b;
  font-size: 14px;
}
</style>
