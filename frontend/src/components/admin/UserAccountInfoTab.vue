<template>
  <div class="user-account-info-tab">
    <h2>Account Information</h2>
    
    <div v-if="loading" class="loading">Loading account information...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else>
      <!-- Personal Information Section -->
      <div class="info-section">
        <h3>Personal Information</h3>
        <div class="info-grid">
          <div class="info-item">
            <label>Login Email:</label>
            <span>{{ accountInfo.loginEmail || accountInfo.email }}</span>
          </div>
          <div class="info-item">
            <label>Personal Email:</label>
            <span>{{ accountInfo.personalEmail || 'Not provided' }}</span>
          </div>
          <div class="info-item">
            <label>Cell Phone Number:</label>
            <span>{{ accountInfo.phoneNumber || 'Not provided' }}</span>
          </div>
        </div>
      </div>
      
      <!-- Pending User Login Link Section -->
      <div v-if="accountInfo.status === 'pending' && accountInfo.passwordlessLoginLink" class="info-section">
        <h3>Direct Login Link</h3>
        <div class="passwordless-link-section">
          <p class="link-description">
            Use this link to access your account. You will be asked to verify your last name when you click the link.
          </p>
          
          <!-- Token Status -->
          <div v-if="accountInfo.passwordlessTokenExpiresAt" class="token-status">
            <div class="token-status-row">
              <div>
                <strong>Link Status:</strong>
                <span :class="accountInfo.passwordlessTokenIsExpired ? 'status-expired' : 'status-valid'">
                  {{ accountInfo.passwordlessTokenIsExpired ? '❌ Expired' : '✅ Valid' }}
                </span>
              </div>
              <div class="token-expiry-info">
                <div><strong>Expires:</strong> {{ formatTokenExpiration(accountInfo.passwordlessTokenExpiresAt) }}</div>
                <div v-if="!accountInfo.passwordlessTokenIsExpired && accountInfo.passwordlessTokenExpiresInHours" class="time-until-expiry">
                  ({{ formatTimeUntilExpiry(accountInfo.passwordlessTokenExpiresInHours) }})
                </div>
              </div>
            </div>
          </div>
          
          <div class="link-container">
            <input 
              type="text" 
              :value="accountInfo.passwordlessLoginLink" 
              readonly 
              class="link-input"
              @click="$event.target.select()"
            />
            <button 
              @click="copyLink" 
              class="btn btn-primary btn-sm"
            >
              Copy Link
            </button>
          </div>
          <div class="link-actions">
            <button 
              @click="showResetModal = true" 
              class="btn btn-secondary btn-sm"
              :disabled="resettingToken"
            >
              {{ resettingToken ? 'Resetting...' : 'Reset Link (New Token)' }}
            </button>
            <div v-if="showResetModal" class="reset-modal-inline">
              <label>Expires in:</label>
              <input 
                type="number" 
                v-model="tokenExpirationDays" 
                min="1" 
                max="30"
                class="expiration-input"
              />
              <span>days</span>
              <button @click="confirmResetToken" class="btn btn-success btn-sm" :disabled="resettingToken">
                Confirm
              </button>
              <button @click="showResetModal = false" class="btn btn-secondary btn-sm">
                Cancel
              </button>
            </div>
          </div>
          <small class="link-help">Click the link above to select it, or use the copy button. Use "Reset Link" to generate a new token with custom expiration.</small>
        </div>
      </div>
      
      <!-- Download Section -->
      <div class="info-section">
        <h3>Download Completion Package</h3>
        <div class="download-section">
          <p class="download-description">
            Download a complete package of all completed items for this user, including signed documents, 
            certificates, completion confirmations, and quiz scores.
          </p>
          <button 
            @click="downloadCompletionPackage" 
            class="btn btn-primary btn-large"
            :disabled="downloading"
          >
            {{ downloading ? 'Generating Package...' : 'Download Completion Package' }}
          </button>
        </div>
      </div>
      
      <!-- Account Management Section -->
      <div class="info-section deactivate-section" :class="{ 'activate-section': !userData?.is_active }">
        <h3>Account Management</h3>
        <div class="deactivate-section-content" :class="{ 'activate-section-content': !userData?.is_active }">
          <p class="deactivate-description" v-if="userData?.is_active">
            Deactivate this user account. This will prevent them from logging in. 
            Note: This user may need to be marked as completed or terminated instead.
          </p>
          <p class="deactivate-description" v-else>
            Activate this user account. This will restore their access to the system.
          </p>
          <button 
            v-if="userData?.is_active"
            @click="deactivateUser" 
            class="btn btn-warning btn-large"
            :disabled="deactivating"
          >
            {{ deactivating ? 'Deactivating...' : 'Deactivate User' }}
          </button>
          <button 
            v-else
            @click="activateUser" 
            class="btn btn-success btn-large"
            :disabled="activating"
          >
            {{ activating ? 'Activating...' : 'Activate User' }}
          </button>
        </div>
      </div>
      
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  userId: {
    type: Number,
    required: true
  },
  user: {
    type: Object,
    default: null
  }
});

const authStore = useAuthStore();
const loading = ref(true);
const error = ref('');
const accountInfo = ref({ loginEmail: '', personalEmail: '', phoneNumber: '', status: null, passwordlessLoginLink: null, passwordlessTokenExpiresAt: null, passwordlessTokenExpiresInHours: null, passwordlessTokenIsExpired: false });
const downloading = ref(false);
const deactivating = ref(false);
const activating = ref(false);
const resettingToken = ref(false);
const showResetModal = ref(false);
const tokenExpirationDays = ref(7);
const userData = ref(null);

const copyLink = () => {
  if (accountInfo.value.passwordlessLoginLink) {
    navigator.clipboard.writeText(accountInfo.value.passwordlessLoginLink).then(() => {
      alert('Link copied to clipboard!');
    }).catch(() => {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = accountInfo.value.passwordlessLoginLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert('Link copied to clipboard!');
    });
  }
};

const resetToken = async () => {
  showResetModal.value = true;
};

const confirmResetToken = async () => {
  if (!tokenExpirationDays.value || tokenExpirationDays.value < 1) {
    alert('Please enter a valid number of days (1-30)');
    return;
  }
  
  try {
    resettingToken.value = true;
    const response = await api.post(`/users/${props.userId}/reset-passwordless-token`, {
      expiresInDays: parseInt(tokenExpirationDays.value)
    });
    
    // Refresh account info to get the new link
    await fetchAccountInfo();
    
    showResetModal.value = false;
    alert('Passwordless login link reset successfully! The new link is now displayed above.');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to reset passwordless token';
    alert(error.value);
  } finally {
    resettingToken.value = false;
  }
};

const formatTokenExpiration = (expiresAt) => {
  if (!expiresAt) return 'Unknown';
  const date = new Date(expiresAt);
  return date.toLocaleString();
};

const formatTimeUntilExpiry = (hours) => {
  if (hours <= 0) return 'Expired';
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours === 0) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
  return `${days} day${days !== 1 ? 's' : ''}, ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
};


const fetchAccountInfo = async () => {
  try {
    loading.value = true;
    const response = await api.get(`/users/${props.userId}/account-info`);
    accountInfo.value = response.data;
    
    // Also fetch user data to check is_active status
    try {
      const userResponse = await api.get(`/users/${props.userId}`);
      userData.value = userResponse.data;
    } catch (userErr) {
      // If user fetch fails, use props.user if available
      userData.value = props.user;
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load account information';
  } finally {
    loading.value = false;
  }
};

const downloadCompletionPackage = async () => {
  try {
    downloading.value = true;
    const response = await api.get(`/users/${props.userId}/completion-package`, {
      responseType: 'blob'
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `completion-package-${props.userId}-${Date.now()}.zip`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to download completion package';
    alert(error.value);
  } finally {
    downloading.value = false;
  }
};

const deactivateUser = async () => {
  if (!confirm('Are you sure you want to set this user as inactive? This user may need to be marked as completed or terminated.')) {
    return;
  }
  
  try {
    deactivating.value = true;
    await api.post(`/users/${props.userId}/deactivate`);
    alert('User deactivated successfully');
    // Refresh user data
    await fetchAccountInfo();
    // Emit event to parent to refresh user data
    if (window.parent) {
      window.parent.postMessage({ type: 'userUpdated', userId: props.userId }, '*');
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to deactivate user';
    alert(error.value);
  } finally {
    deactivating.value = false;
  }
};

const activateUser = async () => {
  if (!confirm('Are you sure you want to activate this user? This will restore their access to the system.')) {
    return;
  }
  
  try {
    activating.value = true;
    await api.post(`/users/${props.userId}/mark-active`);
    alert('User activated successfully');
    // Refresh user data
    await fetchAccountInfo();
    // Emit event to parent to refresh user data
    if (window.parent) {
      window.parent.postMessage({ type: 'userUpdated', userId: props.userId }, '*');
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to activate user';
    alert(error.value);
  } finally {
    activating.value = false;
  }
};


onMounted(() => {
  fetchAccountInfo();
});
</script>

<style scoped>
.user-account-info-tab h2 {
  margin-top: 0;
  margin-bottom: 24px;
  color: var(--text-primary);
}

.info-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.info-section:last-child {
  border-bottom: none;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.info-item {
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
}

.info-item label {
  display: block;
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 4px;
}

.info-item span {
  display: block;
  color: var(--text-primary);
  font-size: 14px;
}

.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.account-card {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.account-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.account-header h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
}

.account-actions {
  display: flex;
  gap: 8px;
}

.account-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.detail-item {
  font-size: 14px;
}

.detail-item label {
  display: block;
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 4px;
}

.detail-item span {
  color: var(--text-primary);
}

.detail-item .link {
  color: var(--primary);
  text-decoration: none;
  word-break: break-all;
}

.detail-item .link:hover {
  text-decoration: underline;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.download-section {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  text-align: center;
}

.download-description {
  margin: 0 0 20px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.btn-large {
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 600;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 30px;
  border-radius: 8px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin-top: 0;
  margin-bottom: 20px;
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.deactivate-section {
  border-top: 3px solid var(--warning, #E6A700);
  margin-top: 32px;
  padding-top: 24px;
}

.deactivate-section-content {
  padding: 20px;
  background: #fff3cd;
  border-radius: 8px;
  border: 1px solid var(--warning, #E6A700);
  text-align: center;
}

.deactivate-description {
  margin: 0 0 20px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.btn-warning {
  background-color: var(--warning, #E6A700);
  color: white;
  border: none;
}

.btn-warning:hover {
  background-color: #d99000;
  transform: translateY(-1px);
  box-shadow: var(--shadow);
}

.activate-section {
  border-top: 3px solid var(--success, #28a745);
}

.activate-section-content {
  background: #d4edda;
  border: 1px solid var(--success, #28a745);
}

.btn-success {
  background-color: var(--success, #28a745);
  color: white;
  border: none;
}

.btn-success:hover {
  background-color: #218838;
  transform: translateY(-1px);
  box-shadow: var(--shadow);
}

.passwordless-link-section {
  padding: 20px;
  background: #e7f3ff;
  border-radius: 8px;
  border: 1px solid var(--primary, #007bff);
}

.link-description {
  margin: 0 0 15px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.link-container {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.link-input {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  font-family: monospace;
  background: white;
  cursor: text;
}

.link-input:focus {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.link-help {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  font-style: italic;
}

.link-actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.token-status {
  margin-bottom: 15px;
  padding: 10px;
  background: white;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.token-status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.token-expiry-info {
  text-align: right;
  font-size: 14px;
}

.time-until-expiry {
  font-size: 12px;
  color: #666;
}

.status-valid {
  color: #28a745;
  margin-left: 8px;
  font-weight: 600;
}

.status-expired {
  color: #dc3545;
  margin-left: 8px;
  font-weight: 600;
}

.reset-modal-inline {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: 10px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.reset-modal-inline label {
  font-size: 12px;
  font-weight: 500;
}

.expiration-input {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}
</style>

