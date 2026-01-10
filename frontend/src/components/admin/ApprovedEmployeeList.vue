<template>
  <div class="approved-employee-list">
    <div class="section-header">
      <h2>Approved Employee Emails</h2>
      <p class="section-description">Manage employees who can access on-demand training</p>
    </div>

    <div class="agency-selector-bar">
      <div class="form-group">
        <label>Agency *</label>
        <select v-model="selectedAgencyId" @change="handleAgencyChange" class="agency-select" required>
          <option value="">Select an agency</option>
          <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- Company Default Password Section -->
    <div v-if="selectedAgencyId" class="company-password-section">
      <h3>Company Default Password Settings</h3>
      
      <!-- Toggle for Use Default Password -->
      <div class="toggle-section">
        <label class="toggle-label">
          <input
            v-model="useDefaultPassword"
            type="checkbox"
            @change="updateDefaultPasswordToggle"
            :disabled="updatingToggle"
          />
          <span>Use Agency Default Password</span>
        </label>
        <p class="toggle-description">
          <span v-if="useDefaultPassword">
            When enabled, employees can use the agency default password. Individual passwords are optional.
          </span>
          <span v-else>
            When disabled, each employee must have their own individual password. No default password will be used.
          </span>
        </p>
        <p v-if="!useDefaultPassword" class="warning-message">
          ⚠️ Warning: All employees must have individual passwords set when default password is disabled.
        </p>
      </div>

      <!-- Default Password Input (only shown when toggle is ON) -->
      <div v-if="useDefaultPassword" class="default-password-input-section">
        <p class="section-description">Set a default password for all approved employees. This will automatically update employees who don't have individual passwords set.</p>
        <div class="password-input-group">
          <div class="password-input-wrapper">
            <input
              v-model="companyDefaultPassword"
              :type="companyPasswordVisible ? 'text' : 'password'"
              placeholder="Enter company default password"
              class="password-input"
            />
            <button
              type="button"
              @click="companyPasswordVisible = !companyPasswordVisible"
              class="btn-eye"
              :title="companyPasswordVisible ? 'Hide password' : 'Show password'"
              v-if="companyDefaultPassword"
            >
              {{ companyPasswordVisible ? '👁️' : '👁️‍🗨️' }}
            </button>
          </div>
          <button
            @click="saveCompanyDefaultPassword"
            class="btn btn-primary"
            :disabled="savingCompanyPassword"
          >
            {{ savingCompanyPassword ? 'Saving...' : 'Set Default Password' }}
          </button>
        </div>
        <p v-if="companyPasswordMessage" :class="['password-message', companyPasswordMessageType]">
          {{ companyPasswordMessage }}
        </p>
      </div>
    </div>

    <div class="actions-bar" v-if="selectedAgencyId">
      <button @click="showAddModal = true" class="btn btn-primary">Add Email</button>
      <button @click="showBulkImportModal = true" class="btn btn-secondary">Bulk Import</button>
    </div>

    <div v-if="loading" class="loading">Loading approved employees...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="employees-table">
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Verification Status</th>
            <th>Password</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="employee in employees" :key="employee.id">
            <td>{{ employee.email }}</td>
            <td>
              <span v-if="employee.is_from_user_table" class="badge" :class="{
                'badge-info': employee.status === 'completed',
                'badge-danger': employee.status === 'terminated',
                'badge-secondary': !employee.is_active
              }">
                {{ employee.status === 'terminated' ? 'Terminated' : employee.status === 'completed' ? 'Completed' : 'Inactive' }}
              </span>
              <template v-else>
                <span v-if="employee.verified_at" class="badge badge-success">Verified</span>
                <span v-else-if="employee.requires_verification" class="badge badge-warning">Pending</span>
                <span v-else class="badge badge-info">Not Required</span>
              </template>
            </td>
            <td>
              <div class="password-cell">
                <div class="password-status">
                  <span v-if="getPasswordStatus(employee) === 'individual'" class="badge badge-success">
                    Individual
                  </span>
                  <span v-else-if="getPasswordStatus(employee) === 'default' && useDefaultPassword" class="badge badge-info">
                    Using Default
                  </span>
                  <span v-else-if="getPasswordStatus(employee) === 'required'" class="badge badge-danger">
                    Required
                  </span>
                  <span v-else class="badge badge-secondary">
                    No Password
                  </span>
                </div>
                <div class="password-actions">
                  <div class="password-input-wrapper">
                    <input
                      v-model="employeePasswords[employee.id]"
                      :type="passwordVisibility[employee.id] ? 'text' : 'password'"
                      :placeholder="getPasswordPlaceholder(employee)"
                      class="password-input-small"
                      @keyup.enter="savePassword(employee.id, employeePasswords[employee.id] || (useDefaultPassword && companyDefaultPassword ? companyDefaultPassword : ''))"
                    />
                    <button
                      @click="togglePasswordVisibility(employee.id)"
                      type="button"
                      class="btn-eye"
                      :title="passwordVisibility[employee.id] ? 'Hide password' : 'Show password'"
                      v-if="employeePasswords[employee.id] || (useDefaultPassword && companyDefaultPassword && !employee.password_hash)"
                    >
                      {{ passwordVisibility[employee.id] ? '👁️' : '👁️‍🗨️' }}
                    </button>
                  </div>
                  <button
                    v-if="useDefaultPassword && companyDefaultPassword && !employee.password_hash"
                    @click="employeePasswords[employee.id] = companyDefaultPassword; passwordVisibility[employee.id] = false"
                    class="btn btn-sm btn-info"
                    title="Use company default password"
                  >
                    Use Default
                  </button>
                  <button
                    @click="generatePassword(employee.id)"
                    class="btn btn-sm btn-secondary"
                    title="Generate Password"
                  >
                    🔑
                  </button>
                  <button
                    v-if="employeePasswords[employee.id] || (useDefaultPassword && companyDefaultPassword && !employee.password_hash)"
                    @click="savePassword(employee.id, employeePasswords[employee.id] || (useDefaultPassword && companyDefaultPassword ? companyDefaultPassword : ''))"
                    class="btn btn-sm btn-primary"
                  >
                    Save
                  </button>
                </div>
              </div>
            </td>
            <td>{{ formatDate(employee.created_at) }}</td>
            <td>
              <button
                v-if="employee.requires_verification && !employee.verified_at"
                @click="sendVerification(employee.id)"
                class="btn btn-sm btn-secondary"
                :disabled="sendingVerification"
              >
                Send Verification
              </button>
              <!-- For inactive users from users table: show Activate and Archive -->
              <template v-if="employee.is_from_user_table === true && (employee.is_active === false || employee.is_active === 0 || !employee.is_active)">
                <button
                  @click="activateUserFromList(employee)"
                  class="btn btn-sm btn-success"
                  :disabled="updatingStatus"
                >
                  Activate
                </button>
                <button
                  @click="archiveEmployee(employee)"
                  class="btn btn-sm btn-warning"
                  :disabled="archiving"
                >
                  Archive
                </button>
              </template>
              <!-- For active users from users table with completed status: show Terminate and Deactivate -->
              <template v-else-if="employee.is_from_user_table === true && employee.status === 'completed' && (employee.is_active === true || employee.is_active === 1)">
                <button
                  @click="terminateUser(employee)"
                  class="btn btn-sm btn-danger"
                  :disabled="updatingStatus"
                >
                  Terminate
                </button>
                <button
                  @click="deactivateUser(employee)"
                  class="btn btn-sm btn-warning"
                  :disabled="updatingStatus"
                >
                  Deactivate
                </button>
                <button
                  @click="archiveEmployee(employee)"
                  class="btn btn-sm btn-warning"
                  :disabled="archiving"
                >
                  Archive
                </button>
              </template>
              <!-- For approved employees (not from users table) -->
              <template v-else-if="!employee.is_from_user_table || employee.is_from_user_table === false">
                <button
                  @click="toggleActive(employee)"
                  class="btn btn-sm"
                  :class="employee.is_active ? 'btn-warning' : 'btn-success'"
                >
                  {{ employee.is_active ? 'Deactivate' : 'Activate' }}
                </button>
                <button 
                  @click="deleteEmployee(employee.id)" 
                  class="btn btn-sm btn-danger"
                >
                  Delete
                </button>
              </template>
              <!-- Fallback: if somehow is_from_user_table is undefined but user_id exists -->
              <template v-else-if="employee.user_id && (employee.is_active === false || employee.is_active === 0 || !employee.is_active)">
                <button
                  @click="activateUserFromList(employee)"
                  class="btn btn-sm btn-success"
                  :disabled="updatingStatus"
                >
                  Activate
                </button>
                <button
                  @click="archiveEmployee(employee)"
                  class="btn btn-sm btn-warning"
                  :disabled="archiving"
                >
                  Archive
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add Email Modal -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="closeAddModal">
      <div class="modal">
        <h3>Add Approved Email</h3>
        <form @submit.prevent="addEmployee">
          <div class="form-group">
            <label>Email</label>
            <input v-model="employeeForm.email" type="email" required placeholder="employee@example.com" />
            <p v-if="employeeForm.emailError" class="error-message">{{ employeeForm.emailError }}</p>
          </div>
          <div class="form-group">
            <label>Password {{ useDefaultPassword ? '(Optional - will use company default if not set)' : '*' }}</label>
            <div class="password-input-group">
              <div class="password-input-wrapper">
                <input
                  v-model="employeeForm.password"
                  :type="formPasswordVisible ? 'text' : 'password'"
                  :required="!useDefaultPassword"
                  :placeholder="useDefaultPassword ? 'Optional (uses company default)' : 'Enter password (min 6 characters)'"
                  class="password-input"
                />
                <button
                  @click="formPasswordVisible = !formPasswordVisible"
                  type="button"
                  class="btn-eye"
                  :title="formPasswordVisible ? 'Hide password' : 'Show password'"
                  v-if="employeeForm.password || (useDefaultPassword && companyDefaultPassword)"
                >
                  {{ formPasswordVisible ? '👁️' : '👁️‍🗨️' }}
                </button>
              </div>
              <button
                type="button"
                @click="generatePasswordForForm"
                class="btn btn-secondary"
              >
                Generate
              </button>
              <button
                v-if="useDefaultPassword && companyDefaultPassword"
                type="button"
                @click="employeeForm.password = companyDefaultPassword; formPasswordVisible = false"
                class="btn btn-info"
                title="Use company default password"
              >
                Use Default
              </button>
            </div>
            <p v-if="useDefaultPassword && !employeeForm.password && companyDefaultPassword" class="password-hint">
              Will use company default password: {{ companyPasswordVisible ? companyDefaultPassword : '••••••••' }}
              <button
                type="button"
                @click="companyPasswordVisible = !companyPasswordVisible"
                class="btn-link"
                style="margin-left: 8px; font-size: 12px;"
              >
                {{ companyPasswordVisible ? 'Hide' : 'Show' }}
              </button>
            </p>
          </div>
          <div class="form-group">
            <label>
              <input v-model="employeeForm.requiresVerification" type="checkbox" />
              Require Email Verification
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeAddModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Adding...' : 'Add Email' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Bulk Import Modal -->
    <div v-if="showBulkImportModal" class="modal-overlay" @click.self="closeBulkImportModal">
      <div class="modal">
        <h3>Bulk Import Emails</h3>
        <div class="import-tabs">
          <button 
            @click="importMethod = 'text'" 
            :class="['tab-button', { active: importMethod === 'text' }]"
          >
            Text Input
          </button>
          <button 
            @click="importMethod = 'csv'" 
            :class="['tab-button', { active: importMethod === 'csv' }]"
          >
            CSV File
          </button>
        </div>
        
        <form @submit.prevent="importMethod === 'csv' ? importFromCsv() : bulkImport()">
          <!-- Text Input Method -->
          <div v-if="importMethod === 'text'" class="form-group">
            <label>Emails (one per line or comma-separated)</label>
            <textarea
              v-model="bulkEmails"
              rows="10"
              placeholder="employee1@example.com&#10;employee2@example.com&#10;employee3@example.com"
              required
            ></textarea>
            <small class="form-help">Enter emails separated by commas or new lines</small>
          </div>
          
          <!-- CSV File Method -->
          <div v-if="importMethod === 'csv'" class="form-group">
            <label>CSV File *</label>
            <input
              ref="csvFileInput"
              type="file"
              accept=".csv,text/csv"
              @change="handleCsvFileSelect"
              required
            />
            <small class="form-help">CSV file must contain an "email" column. Other columns will be ignored.</small>
            <div v-if="csvFileName" class="file-selected">
              <span>Selected: {{ csvFileName }}</span>
            </div>
          </div>
          
          <div v-if="error" class="error-message">{{ error }}</div>
          <div class="modal-actions">
            <button type="button" @click="closeBulkImportModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving || (importMethod === 'csv' && !csvFile)">
              {{ saving ? 'Importing...' : 'Import Emails' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const employees = ref([]);
const loading = ref(true);
const error = ref('');
const saving = ref(false);
const sendingVerification = ref(false);
const updatingStatus = ref(false);
const showAddModal = ref(false);
const showBulkImportModal = ref(false);
const selectedAgencyId = ref(null);
const availableAgencies = ref([]);

const employeeForm = ref({
  email: '',
  requiresVerification: false,
  password: '',
  emailError: ''
});

const bulkEmails = ref('');
const employeePasswords = ref({});
const passwordVisibility = ref({});
const formPasswordVisible = ref(false);
const companyDefaultPassword = ref('');
const companyPasswordVisible = ref(false);
const savingCompanyPassword = ref(false);
const companyPasswordMessage = ref('');
const companyPasswordMessageType = ref('');
const useDefaultPassword = ref(true);
const updatingToggle = ref(false);
const archiving = ref(false);

const userRole = computed(() => authStore.user?.role);

const fetchAgencies = async () => {
  try {
    if (userRole.value === 'super_admin') {
      // Super admin sees all agencies
      const response = await api.get('/agencies');
      availableAgencies.value = response.data;
    } else {
      // Admin sees only their affiliated agencies
      await agencyStore.fetchUserAgencies();
      availableAgencies.value = agencyStore.userAgencies || [];
      
      // Auto-select first agency if available
      if (availableAgencies.value.length > 0 && !selectedAgencyId.value) {
        selectedAgencyId.value = availableAgencies.value[0].id;
      }
    }
  } catch (err) {
    console.error('Failed to fetch agencies:', err);
    error.value = 'Failed to load agencies';
  }
};

const handleAgencyChange = async () => {
  if (selectedAgencyId.value) {
    await fetchAgencyPasswordSettings();
    // Load saved password from localStorage
    const savedPassword = localStorage.getItem(`companyDefaultPassword_${selectedAgencyId.value}`);
    if (savedPassword) {
      companyDefaultPassword.value = savedPassword;
      companyPasswordVisible.value = false; // Keep it hidden by default
    }
    fetchEmployees();
  } else {
    employees.value = [];
  }
};

const fetchAgencyPasswordSettings = async () => {
  if (!selectedAgencyId.value) return;
  
  try {
    const response = await api.get('/approved-employees/agency-password-settings', {
      params: { agencyId: selectedAgencyId.value }
    });
    useDefaultPassword.value = response.data.useDefaultPassword !== undefined ? response.data.useDefaultPassword : true;
  } catch (err) {
    console.error('Failed to fetch agency password settings:', err);
    useDefaultPassword.value = true; // Default to true on error
  }
};

const updateDefaultPasswordToggle = async () => {
  if (!selectedAgencyId.value) return;
  
  try {
    updatingToggle.value = true;
    await api.put('/approved-employees/agency-default-password-toggle', {
      agencyId: selectedAgencyId.value,
      useDefaultPassword: useDefaultPassword.value
    });
    
    // Refresh employees to see updated password statuses
    await fetchEmployees();
    
    if (!useDefaultPassword.value) {
      alert('Default password disabled. All employees must now have individual passwords.');
    }
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || 'Failed to update toggle';
    alert(errorMsg);
    // Revert toggle on error
    useDefaultPassword.value = !useDefaultPassword.value;
  } finally {
    updatingToggle.value = false;
  }
};

const fetchEmployees = async () => {
  try {
    loading.value = true;
    if (!selectedAgencyId.value) {
      error.value = 'Please select an agency';
      employees.value = [];
      return;
    }
    const response = await api.get('/approved-employees', {
      params: { agencyId: selectedAgencyId.value }
    });
    employees.value = response.data;
    // Debug: log employee structure for debugging
    console.log('All employees:', employees.value.map(emp => ({
      email: emp.email,
      is_from_user_table: emp.is_from_user_table,
      is_active: emp.is_active,
      user_id: emp.user_id,
      status: emp.status
    })));
    error.value = '';
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load employees';
    employees.value = [];
  } finally {
    loading.value = false;
  }
};

const addEmployee = async () => {
  try {
    saving.value = true;
    employeeForm.value.emailError = '';
    
    if (!selectedAgencyId.value) {
      error.value = 'Please select an agency';
      return;
    }
    
    // Validate password if default password is disabled
    if (!useDefaultPassword.value && (!employeeForm.value.password || employeeForm.value.password.length < 6)) {
      employeeForm.value.emailError = 'Password is required and must be at least 6 characters when default password is disabled';
      return;
    }
    
    // If useDefaultPassword is enabled and no individual password is set, use company default
    let passwordToUse = employeeForm.value.password;
    if (useDefaultPassword.value && (!passwordToUse || passwordToUse.trim() === '') && companyDefaultPassword.value) {
      passwordToUse = companyDefaultPassword.value;
    }
    
    await api.post('/approved-employees', {
      email: employeeForm.value.email,
      agencyId: selectedAgencyId.value,
      requiresVerification: employeeForm.value.requiresVerification,
      password: passwordToUse || null
    });
    closeAddModal();
    await fetchEmployees();
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || 'Failed to add employee';
    if (errorMsg.includes('active user')) {
      employeeForm.value.emailError = errorMsg;
    } else {
      error.value = errorMsg;
    }
  } finally {
    saving.value = false;
  }
};

const bulkImport = async () => {
  try {
    saving.value = true;
    if (!selectedAgencyId.value) {
      error.value = 'Please select an agency';
      return;
    }
    
    // Parse emails (support both newline and comma separation)
    const emailList = bulkEmails.value
      .split(/[,\n]/)
      .map(e => e.trim())
      .filter(e => e.length > 0);
    
    await api.post('/approved-employees/bulk', {
      emails: emailList,
      agencyId: selectedAgencyId.value
    });
    
    closeBulkImportModal();
    await fetchEmployees();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to import employees';
  } finally {
    saving.value = false;
  }
};

const sendVerification = async (id) => {
  try {
    sendingVerification.value = true;
    await api.post(`/approved-employees/${id}/send-verification`);
    await fetchEmployees();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to send verification';
  } finally {
    sendingVerification.value = false;
  }
};

const toggleActive = async (employee) => {
  try {
    await api.put(`/approved-employees/${employee.id}`, {
      isActive: !employee.is_active
    });
    await fetchEmployees();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to update employee';
  }
};

const terminateUser = async (employee) => {
  if (!confirm(`Are you sure you want to terminate "${employee.email}"? They will be marked as inactive after 7 days and archived after 14 days if not done manually.`)) {
    return;
  }
  
  try {
    updatingStatus.value = true;
    await api.put(`/approved-employees/${employee.id}`, {
      status: 'terminated'
    });
    await fetchEmployees();
    alert('User terminated successfully. They will be marked as inactive after 7 days.');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to terminate user';
    alert(error.value);
  } finally {
    updatingStatus.value = false;
  }
};

const deactivateUser = async (employee) => {
  if (!confirm(`Are you sure you want to deactivate "${employee.email}"? This will prevent them from logging in.`)) {
    return;
  }
  
  try {
    updatingStatus.value = true;
    await api.put(`/approved-employees/${employee.id}`, {
      isActive: false
    });
    await fetchEmployees();
    alert('User deactivated successfully.');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to deactivate user';
    alert(error.value);
  } finally {
    updatingStatus.value = false;
  }
};

const activateUserFromList = async (employee) => {
  if (!confirm(`Are you sure you want to activate "${employee.email}"? This will restore their access to the system.`)) {
    return;
  }
  
  try {
    updatingStatus.value = true;
    // If this is from users table, use the user activation endpoint
    if (employee.is_from_user_table && employee.user_id) {
      await api.post(`/users/${employee.user_id}/mark-active`);
    } else {
      // For approved employees, just toggle active status
      await api.put(`/approved-employees/${employee.id}`, {
        isActive: true
      });
    }
    await fetchEmployees();
    alert('User activated successfully.');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to activate user';
    alert(error.value);
  } finally {
    updatingStatus.value = false;
  }
};

const deleteEmployee = async (id) => {
  if (!confirm('Are you sure you want to remove this approved email?')) {
    return;
  }
  
  try {
    await api.delete(`/approved-employees/${id}`);
    await fetchEmployees();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to delete employee';
  }
};

const archiveEmployee = async (employee) => {
  if (!confirm(`Are you sure you want to archive "${employee.email}"? This will remove them from the approved list and prevent access to on-demand training.`)) {
    return;
  }
  
  try {
    archiving.value = true;
    await api.post(`/approved-employees/${employee.id}/archive`);
    await fetchEmployees();
    alert('Employee archived successfully.');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to archive employee';
    alert(error.value);
  } finally {
    archiving.value = false;
  }
};

const updatePasswordInput = (employeeId, value) => {
  employeePasswords.value[employeeId] = value;
};

const togglePasswordVisibility = (employeeId) => {
  passwordVisibility.value[employeeId] = !passwordVisibility.value[employeeId];
};

const generatePassword = (employeeId = null) => {
  const password = generateRandomPassword();
  if (employeeId) {
    employeePasswords.value[employeeId] = password;
    // Show password by default when generated
    passwordVisibility.value[employeeId] = true;
  }
  return password;
};

const generatePasswordForForm = () => {
  employeeForm.value.password = generateRandomPassword();
  // Show password by default when generated
  formPasswordVisible.value = true;
};

const generateRandomPassword = () => {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

const getPasswordStatus = (employee) => {
  if (employee.password_hash) {
    return 'individual';
  }
  if (useDefaultPassword.value) {
    return 'default';
  }
  return 'required';
};

const getPasswordPlaceholder = (employee) => {
  if (employee.password_hash) {
    return 'Enter new password';
  }
  if (!useDefaultPassword.value) {
    return 'Password required';
  }
  return 'Optional (uses default)';
};

const savePassword = async (employeeId, password) => {
  // If no password provided and useDefaultPassword is enabled, use company default
  if (!password && useDefaultPassword.value && companyDefaultPassword.value) {
    password = companyDefaultPassword.value;
  }
  
  if (!password || password.length < 6) {
    if (password && password.length > 0) {
      alert('Password must be at least 6 characters');
    } else {
      alert('Please enter a password or use the "Use Default" button');
    }
    return;
  }
  
  try {
    await api.put(`/approved-employees/${employeeId}/password`, {
      password: password
    });
    // Clear the input after saving (show as placeholder)
    employeePasswords.value[employeeId] = '';
    passwordVisibility.value[employeeId] = false;
    await fetchEmployees(); // Refresh to update password status
    alert('Password updated successfully');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to update password';
    alert(error.value);
  }
};

const saveCompanyDefaultPassword = async () => {
  if (!companyDefaultPassword.value || companyDefaultPassword.value.length < 6) {
    companyPasswordMessage.value = 'Password must be at least 6 characters';
    companyPasswordMessageType.value = 'error';
    return;
  }
  
  if (!selectedAgencyId.value) {
    companyPasswordMessage.value = 'Please select an agency first';
    companyPasswordMessageType.value = 'error';
    return;
  }
  
  try {
    savingCompanyPassword.value = true;
    companyPasswordMessage.value = '';
    await api.put('/approved-employees/company-default-password', {
      agencyId: selectedAgencyId.value,
      password: companyDefaultPassword.value
    });
    // Don't clear the password - keep it in the input (masked)
    // Save to localStorage for persistence
    if (selectedAgencyId.value) {
      localStorage.setItem(`companyDefaultPassword_${selectedAgencyId.value}`, companyDefaultPassword.value);
    }
    companyPasswordVisible.value = false; // Hide it after saving
    companyPasswordMessage.value = 'Company default password updated successfully. All employees without individual passwords have been updated.';
    companyPasswordMessageType.value = 'success';
    setTimeout(() => {
      companyPasswordMessage.value = '';
    }, 5000);
  } catch (err) {
    companyPasswordMessage.value = err.response?.data?.error?.message || 'Failed to update company default password';
    companyPasswordMessageType.value = 'error';
  } finally {
    savingCompanyPassword.value = false;
  }
};

const closeAddModal = () => {
  showAddModal.value = false;
  employeeForm.value = { email: '', requiresVerification: false, password: '', emailError: '' };
};

const closeBulkImportModal = () => {
  showBulkImportModal.value = false;
  bulkEmails.value = '';
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString();
};

onMounted(async () => {
  await fetchAgencies();
  // If an agency is auto-selected, fetch employees and settings
  if (selectedAgencyId.value) {
    await fetchAgencyPasswordSettings();
    // Load saved password from localStorage
    const savedPassword = localStorage.getItem(`companyDefaultPassword_${selectedAgencyId.value}`);
    if (savedPassword) {
      companyDefaultPassword.value = savedPassword;
      companyPasswordVisible.value = false; // Keep it hidden by default
    }
    await fetchEmployees();
  } else {
    loading.value = false;
  }
});

// Watch for agency changes to load saved password
watch(selectedAgencyId, (newAgencyId) => {
  if (newAgencyId) {
    const savedPassword = localStorage.getItem(`companyDefaultPassword_${newAgencyId}`);
    if (savedPassword) {
      companyDefaultPassword.value = savedPassword;
      companyPasswordVisible.value = false;
    }
  }
});
</script>

<style scoped>
.company-password-section {
  margin-bottom: 30px;
  padding: 20px;
  background: var(--bg-alt, #f8f9fa);
  border-radius: 8px;
  border: 1px solid var(--border, #dee2e6);
}

.company-password-section h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary, #2c3e50);
  font-size: 18px;
}

.section-description {
  margin: 0 0 16px 0;
  color: var(--text-secondary, #6c757d);
  font-size: 14px;
}

.password-input-group {
  display: flex;
  gap: 12px;
  align-items: center;
}

.password-input {
  flex: 1;
  padding: 10px 40px 10px 12px;
  border: 1px solid var(--border, #dee2e6);
  border-radius: 6px;
  font-size: 14px;
}

.password-message {
  margin: 12px 0 0 0;
  font-size: 14px;
  padding: 8px 12px;
  border-radius: 6px;
}

.password-message.success {
  background: #d1fae5;
  color: #065f46;
}

.password-message.error {
  background: #fee2e2;
  color: #991b1b;
}

.password-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.password-input-small {
  padding: 6px 35px 6px 8px;
  border: 1px solid var(--border, #dee2e6);
  border-radius: 4px;
  font-size: 12px;
  width: 150px;
}

.password-hint {
  font-size: 11px;
  color: var(--text-secondary, #6c757d);
  font-style: italic;
}
.section-header {
  margin-bottom: 24px;
}

.section-description {
  color: var(--text-secondary);
  font-size: 14px;
  margin-top: 8px;
}

.agency-selector-bar {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.agency-selector-bar .form-group {
  margin: 0;
}

.agency-selector-bar label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.company-password-section {
  margin-bottom: 30px;
  padding: 20px;
  background: var(--bg-alt, #f8f9fa);
  border-radius: 8px;
  border: 1px solid var(--border, #dee2e6);
}

.company-password-section h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary, #2c3e50);
  font-size: 18px;
}

.section-description {
  margin: 0 0 16px 0;
  color: var(--text-secondary, #6c757d);
  font-size: 14px;
}

.password-input-group {
  display: flex;
  gap: 12px;
  align-items: center;
}

.password-input {
  flex: 1;
  padding: 10px 40px 10px 12px;
  border: 1px solid var(--border, #dee2e6);
  border-radius: 6px;
  font-size: 14px;
}

.password-message {
  margin: 12px 0 0 0;
  font-size: 14px;
  padding: 8px 12px;
  border-radius: 6px;
}

.password-message.success {
  background: #d1fae5;
  color: #065f46;
}

.password-message.error {
  background: #fee2e2;
  color: #991b1b;
}

.password-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.password-input-small {
  padding: 6px 35px 6px 8px;
  border: 1px solid var(--border, #dee2e6);
  border-radius: 4px;
  font-size: 12px;
  width: 150px;
}

.password-hint {
  font-size: 11px;
  color: var(--text-secondary, #6c757d);
  font-style: italic;
}

.agency-select {
  width: 100%;
  max-width: 400px;
  padding: 10px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
}

.actions-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.employees-table {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow);
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: var(--bg-alt);
}

th {
  padding: 16px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
}

td {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

tbody tr:hover {
  background: var(--bg-alt);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal h3 {
  margin-bottom: 24px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  font-family: monospace;
}

.password-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
}

.password-input-wrapper input {
  padding-right: 40px;
}

.btn-eye {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: opacity 0.2s;
  z-index: 1;
}

.btn-eye:hover {
  opacity: 1;
}

.btn-eye:focus {
  outline: none;
  opacity: 1;
}

.password-actions .password-input-wrapper {
  position: relative;
  display: inline-block;
}

.password-actions .password-input-wrapper .btn-eye {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: opacity 0.2s;
  z-index: 1;
}

.password-actions .password-input-wrapper .btn-eye:hover {
  opacity: 1;
}

.btn-info {
  background-color: #17a2b8;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s;
}

.btn-info:hover {
  background-color: #138496;
}

.btn-link {
  background: none;
  border: none;
  color: #007bff;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font-size: inherit;
}

.btn-link:hover {
  color: #0056b3;
}

.import-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  border-bottom: 2px solid var(--border, #e0e0e0);
}

.import-tabs .tab-button {
  padding: 10px 20px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, #666);
  transition: all 0.2s;
  margin-bottom: -2px;
}

.import-tabs .tab-button:hover {
  color: var(--text-primary, #333);
}

.import-tabs .tab-button.active {
  color: var(--primary, #007bff);
  border-bottom-color: var(--accent, #0056b3);
}

.file-selected {
  margin-top: 8px;
  padding: 8px;
  background: var(--background, #f5f5f5);
  border-radius: 4px;
  font-size: 14px;
  color: var(--text-primary, #333);
}
</style>

