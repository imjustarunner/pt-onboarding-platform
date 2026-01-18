<template>
  <div class="container">
    <div class="page-header">
      <h1>Account Information</h1>
    </div>
    
    <div v-if="loading" class="loading">Loading account information...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="account-info-content">
      <!-- Personal Information Section -->
      <div class="info-section">
        <h2>Personal Information</h2>
        <div class="info-grid">
          <div class="info-item">
            <label>Login Email:</label>
            <span>{{ accountInfo.loginEmail }}</span>
          </div>
          <div class="info-item">
            <label>Personal Email:</label>
            <span>{{ accountInfo.personalEmail || 'Not provided' }}</span>
          </div>
          <div class="info-item">
            <label>Personal Phone Number:</label>
            <span>{{ accountInfo.personalPhone || accountInfo.phoneNumber || 'Not provided' }}</span>
          </div>
          <div class="info-item">
            <label>Work Phone Number:</label>
            <span>{{ accountInfo.workPhone ? (accountInfo.workPhone + (accountInfo.workPhoneExtension ? ' ext. ' + accountInfo.workPhoneExtension : '')) : 'Not provided' }}</span>
          </div>
        </div>

        <div class="card" style="margin-top: 16px;">
          <div class="section-header">
            <h3 style="margin: 0;">Home Address</h3>
            <button class="btn btn-primary btn-large" @click="saveHomeAddress" :disabled="savingHomeAddress">
              {{ savingHomeAddress ? 'Saving...' : 'Save Home Address' }}
            </button>
          </div>
          <div class="hint" style="margin-top: 6px;">
            Used for School Mileage auto-calculation.
          </div>
          <div v-if="homeAddressError" class="error" style="margin-top: 10px;">{{ homeAddressError }}</div>
          <div class="fields-grid" style="margin-top: 12px;">
            <div class="field-item">
              <label>Street</label>
              <input v-model="homeAddressForm.street" type="text" placeholder="123 Main St" />
            </div>
            <div class="field-item">
              <label>City</label>
              <input v-model="homeAddressForm.city" type="text" placeholder="City" />
            </div>
            <div class="field-item">
              <label>State</label>
              <input v-model="homeAddressForm.state" type="text" placeholder="State" />
            </div>
            <div class="field-item">
              <label>Postal code</label>
              <input v-model="homeAddressForm.postalCode" type="text" placeholder="ZIP" />
            </div>
          </div>
        </div>
      </div>

      <!-- Profile Information (Custom Input Modules / User Info) -->
      <div class="info-section">
        <div class="section-header">
          <h2 style="margin: 0;">Profile Information</h2>
          <button class="btn btn-primary btn-large" @click="saveMyUserInfo" :disabled="savingUserInfo">
            {{ savingUserInfo ? 'Saving...' : 'Save Profile' }}
          </button>
        </div>

        <div v-if="userInfoLoading" class="loading">Loading profile information...</div>
        <div v-else-if="userInfoError" class="error">{{ userInfoError }}</div>
        <div v-else>
          <div v-if="myCategoryOptions.length > 1" class="category-tabs">
            <button
              v-for="cat in myCategoryOptions"
              :key="cat.key"
              @click="activeMyCategoryKey = cat.key"
              :class="['category-tab', { active: activeMyCategoryKey === cat.key }]"
            >
              {{ cat.label }}
            </button>
          </div>

          <div v-if="filteredMyFields.length === 0" class="empty-state">
            <p>No profile fields found for this category.</p>
          </div>

          <div v-else class="fields-grid">
            <div v-for="field in filteredMyFields" :key="field.id" class="field-item">
              <label :for="`my-field-${field.id}`">
                {{ field.field_label }}
                <span v-if="field.is_required" class="required-asterisk">*</span>
                <span v-if="field.agency_name" class="agency-badge">{{ field.agency_name }}</span>
              </label>

              <input
                v-if="field.field_type === 'text' || field.field_type === 'email' || field.field_type === 'phone'"
                :id="`my-field-${field.id}`"
                :type="field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'"
                v-model="myUserInfoValues[field.id]"
                :required="field.is_required"
              />
              <input
                v-else-if="field.field_type === 'number'"
                :id="`my-field-${field.id}`"
                type="number"
                v-model="myUserInfoValues[field.id]"
                :required="field.is_required"
              />
              <input
                v-else-if="field.field_type === 'date'"
                :id="`my-field-${field.id}`"
                type="date"
                v-model="myUserInfoValues[field.id]"
                :required="field.is_required"
              />
              <textarea
                v-else-if="field.field_type === 'textarea'"
                :id="`my-field-${field.id}`"
                v-model="myUserInfoValues[field.id]"
                :required="field.is_required"
                rows="4"
              ></textarea>
              <select
                v-else-if="field.field_type === 'select'"
                :id="`my-field-${field.id}`"
                v-model="myUserInfoValues[field.id]"
                :required="field.is_required"
              >
                <option value="">Select an option</option>
                <option v-for="option in (field.options || [])" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
              <div v-else-if="field.field_type === 'multi_select'" class="multi-select">
                <label v-for="option in (field.options || [])" :key="option" class="multi-select-option">
                  <input
                    type="checkbox"
                    :checked="Array.isArray(myUserInfoValues[field.id]) ? myUserInfoValues[field.id].includes(option) : false"
                    @change="toggleMyMultiSelect(field.id, option)"
                  />
                  <span>{{ option }}</span>
                </label>
              </div>
              <div v-else-if="field.field_type === 'boolean'" class="checkbox-wrapper">
                <input
                  :id="`my-field-${field.id}`"
                  type="checkbox"
                  :checked="myUserInfoValues[field.id] === 'true' || myUserInfoValues[field.id] === true"
                  @change="myUserInfoValues[field.id] = $event.target.checked ? 'true' : 'false'"
                />
                <label :for="`my-field-${field.id}`" class="checkbox-label">Yes</label>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Supervisor Information Section -->
      <div v-if="accountInfo.supervisors && accountInfo.supervisors.length > 0" class="info-section">
        <h2>Supervisor Information</h2>
        <div class="supervisors-list">
          <div v-for="supervisor in accountInfo.supervisors" :key="supervisor.id" class="supervisor-item">
            <div class="supervisor-name">
              <strong>{{ supervisor.firstName }} {{ supervisor.lastName }}</strong>
              <span v-if="supervisor.agencyName" class="supervisor-agency">({{ supervisor.agencyName }})</span>
            </div>
            <div v-if="supervisor.workPhone" class="supervisor-contact">
              <span>Work Phone: {{ supervisor.workPhone }}</span>
              <span v-if="supervisor.workPhoneExtension"> ext. {{ supervisor.workPhoneExtension }}</span>
            </div>
            <div v-if="supervisor.email" class="supervisor-contact">
              <span>Email: {{ supervisor.email }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Pending User Login Link Section -->
      <div v-if="accountInfo.status === 'pending' && accountInfo.passwordlessLoginLink" class="info-section">
        <h2>Direct Login Link</h2>
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
              class="btn btn-primary btn-large"
            >
              Copy Link
            </button>
          </div>
          <div class="link-actions">
            <button 
              @click="showResetModal = true" 
              class="btn btn-secondary btn-large"
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
              <button @click="confirmResetToken" class="btn btn-success btn-large" :disabled="resettingToken">
                Confirm
              </button>
              <button @click="showResetModal = false" class="btn btn-secondary btn-large">
                Cancel
              </button>
            </div>
          </div>
          <small class="link-help">Click the link above to select it, or use the copy button. Use "Reset Link" to generate a new token with custom expiration.</small>
        </div>
      </div>
      
      <!-- Progress & Time Section -->
      <div class="info-section">
        <h2>Onboarding Progress</h2>
        <div class="info-grid">
          <div class="info-item progress-item">
            <label>Total Progress:</label>
            <span class="progress-value">{{ accountInfo.totalProgress ?? 0 }} incomplete items</span>
            <p class="progress-description">Total of all assigned and currently active (not complete) items</p>
          </div>
          <div class="info-item time-item">
            <label>Total Onboarding Time:</label>
            <span class="time-value">{{ accountInfo.totalOnboardingTime?.formatted ?? '0m' }}</span>
            <p class="time-description">Calculated from training focus and module participation</p>
          </div>
        </div>
      </div>
      
      <!-- Download Section -->
      <div class="info-section">
        <h2>Download Completion Package</h2>
        <div class="download-section">
          <p class="download-description">
            Download a complete package of all your completed items, including signed documents, certificates, 
            completion confirmations, and quiz scores.
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
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../services/api';
import { useAuthStore } from '../store/auth';

const authStore = useAuthStore();
const userId = computed(() => authStore.user?.id);

const loading = ref(true);
const error = ref('');
const accountInfo = ref({ 
  loginEmail: '', 
  personalEmail: '', 
  phoneNumber: '', 
  personalPhone: '',
  workPhone: '',
  workPhoneExtension: '',
  supervisors: [],
  totalProgress: 0,
  totalOnboardingTime: { formatted: '0m' },
  status: null,
  passwordlessLoginLink: null,
  passwordlessTokenExpiresAt: null,
  passwordlessTokenExpiresInHours: null,
  passwordlessTokenIsExpired: false
});
const downloading = ref(false);
const resettingToken = ref(false);
const showResetModal = ref(false);
const tokenExpirationDays = ref(7);

// User Info (profile fields saved by Custom Input Modules)
const userInfoLoading = ref(false);
const userInfoError = ref('');
const myUserInfoFields = ref([]);
const myUserInfoCategories = ref([]);
const myUserInfoValues = ref({});
const savingUserInfo = ref(false);
const activeMyCategoryKey = ref('__all');

const savingHomeAddress = ref(false);
const homeAddressError = ref('');
const homeAddressForm = ref({
  street: '',
  city: '',
  state: '',
  postalCode: ''
});

const normalizeMultiSelectValue = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
};

const toggleMyMultiSelect = (fieldId, option) => {
  const current = normalizeMultiSelectValue(myUserInfoValues.value[fieldId]);
  const exists = current.includes(option);
  const next = exists ? current.filter((x) => x !== option) : [...current, option];
  myUserInfoValues.value[fieldId] = next;
};

const myCategoryOptions = computed(() => {
  const byKey = new Map((myUserInfoCategories.value || []).map((c) => [c.category_key, c]));
  const keysFromFields = new Set((myUserInfoFields.value || []).map((f) => f.category_key || '__uncategorized'));

  const options = [
    { key: '__all', label: 'All' },
    ...Array.from(keysFromFields)
      .filter((k) => k !== '__all')
      .map((k) => {
        if (k === '__uncategorized') return { key: k, label: 'Uncategorized', order: 999999 };
        const c = byKey.get(k);
        return { key: k, label: c?.category_label || k, order: c?.order_index ?? 0 };
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.label).localeCompare(String(b.label)))
  ];

  return options;
});

const filteredMyFields = computed(() => {
  if (activeMyCategoryKey.value === '__all') return myUserInfoFields.value;
  if (activeMyCategoryKey.value === '__uncategorized') {
    return myUserInfoFields.value.filter((f) => !f.category_key);
  }
  return myUserInfoFields.value.filter((f) => f.category_key === activeMyCategoryKey.value);
});

const fetchMyUserInfo = async () => {
  try {
    userInfoLoading.value = true;
    userInfoError.value = '';
    const [fieldsRes, catsRes] = await Promise.all([
      api.get(`/users/${userId.value}/user-info`),
      api.get('/user-info-categories')
    ]);
    myUserInfoFields.value = fieldsRes.data || [];
    myUserInfoCategories.value = catsRes.data || [];

    const valuesMap = {};
    myUserInfoFields.value.forEach((field) => {
      if (field.field_type === 'multi_select') {
        valuesMap[field.id] = normalizeMultiSelectValue(field.value);
      } else {
        valuesMap[field.id] = field.value || '';
      }
    });
    myUserInfoValues.value = valuesMap;
  } catch (err) {
    userInfoError.value = err.response?.data?.error?.message || 'Failed to load profile information';
  } finally {
    userInfoLoading.value = false;
  }
};

const saveMyUserInfo = async () => {
  try {
    savingUserInfo.value = true;
    userInfoError.value = '';

    const values = Object.keys(myUserInfoValues.value).map((fieldId) => ({
      fieldDefinitionId: parseInt(fieldId),
      value: Array.isArray(myUserInfoValues.value[fieldId]) ? JSON.stringify(myUserInfoValues.value[fieldId]) : (myUserInfoValues.value[fieldId] || null)
    }));

    await api.post(`/users/${userId.value}/user-info`, { values });
    await fetchMyUserInfo();
    alert('Profile information saved successfully!');
  } catch (err) {
    userInfoError.value = err.response?.data?.error?.message || 'Failed to save profile information';
    alert(userInfoError.value);
  } finally {
    savingUserInfo.value = false;
  }
};

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
    const response = await api.post(`/users/${userId.value}/reset-passwordless-token`, {
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
    const response = await api.get(`/users/${userId.value}/account-info`);
    accountInfo.value = response.data;
    homeAddressForm.value = {
      street: response.data?.homeStreetAddress || '',
      city: response.data?.homeCity || '',
      state: response.data?.homeState || '',
      postalCode: response.data?.homePostalCode || ''
    };
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load account information';
  } finally {
    loading.value = false;
  }
};

const saveHomeAddress = async () => {
  try {
    savingHomeAddress.value = true;
    homeAddressError.value = '';
    await api.put('/payroll/me/home-address', {
      homeStreetAddress: homeAddressForm.value.street,
      homeCity: homeAddressForm.value.city,
      homeState: homeAddressForm.value.state,
      homePostalCode: homeAddressForm.value.postalCode
    });
    await fetchAccountInfo();
    alert('Home address saved successfully!');
  } catch (err) {
    homeAddressError.value = err.response?.data?.error?.message || 'Failed to save home address';
    alert(homeAddressError.value);
  } finally {
    savingHomeAddress.value = false;
  }
};

const downloadCompletionPackage = async () => {
  try {
    downloading.value = true;
    const response = await api.get(`/users/${userId.value}/completion-package`, {
      responseType: 'blob'
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `completion-package-${Date.now()}.zip`);
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


onMounted(() => {
  if (userId.value) {
    fetchAccountInfo();
    fetchMyUserInfo();
  }
});
</script>

<style scoped>
.page-header {
  margin-bottom: 32px;
}

.page-header h1 {
  margin: 0;
  color: var(--text-primary);
}

.account-info-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
}

.info-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.info-section:last-child {
  border-bottom: none;
}

.info-section h2 {
  margin: 0 0 20px 0;
  color: var(--text-primary);
  font-size: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 18px 0;
}

.category-tab {
  border: 1px solid var(--border);
  background: white;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
}

.category-tab.active {
  background: #e3f2fd;
  border-color: #90caf9;
  color: #1e3a8a;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-item label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}

.required-asterisk {
  color: #dc3545;
  margin-left: 4px;
}

.agency-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #374151;
  font-size: 12px;
  font-weight: 600;
}

.field-item input,
.field-item select,
.field-item textarea {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.checkbox-label {
  font-weight: 600;
  color: var(--text-secondary);
}

.multi-select {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  background: #fafbfc;
}

.multi-select-option {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
  color: var(--text-primary);
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

.progress-item .progress-value,
.time-item .time-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--primary);
  margin-top: 4px;
}

.progress-description,
.time-description {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  font-style: italic;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
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

.supervisors-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.supervisor-item {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.supervisor-name {
  margin-bottom: 8px;
  font-size: 16px;
  color: var(--text-primary);
}

.supervisor-agency {
  color: var(--text-secondary);
  font-weight: normal;
  font-size: 14px;
}

.supervisor-contact {
  margin-top: 4px;
  font-size: 14px;
  color: var(--text-secondary);
}
</style>

