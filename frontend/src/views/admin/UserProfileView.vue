<template>
  <div class="container">
    <div class="page-header">
      <div>
        <router-link to="/admin/users" class="back-link">← Back to Users</router-link>
        <div class="user-header-info">
          <h1>{{ user?.first_name }} {{ user?.last_name }}</h1>
          <span 
            v-if="user" 
            :class="['status-badge-header', getStatusBadgeClass(user.status, user.is_active)]"
          >
            {{ getStatusLabel(user.status, user.is_active) }}
          </span>
        </div>
        <p class="subtitle">{{ user?.email }}</p>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading user profile...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="profile-content">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="['tab-button', { active: activeTab === tab.id }]"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="tab-content">
        <div v-if="activeTab === 'account'" class="tab-panel">
          <h2>Account Information</h2>
          <div class="account-layout">
            <form v-if="canEditUser" @submit.prevent="saveAccount" class="account-form">
              <div class="form-grid">
                <div class="form-group">
                  <label>First Name</label>
                  <input v-model="accountForm.firstName" type="text" />
                </div>
                <div class="form-group">
                  <label>Last Name</label>
                  <input v-model="accountForm.lastName" type="text" />
                </div>
                <div class="form-group">
                  <label>Email</label>
                  <input v-model="accountForm.email" type="email" disabled />
                </div>
                <div class="form-group">
                  <label>Personal Phone Number</label>
                  <input v-model="accountForm.personalPhone" type="tel" />
                </div>
                <div class="form-group">
                  <label>Work Phone Number</label>
                  <input v-model="accountForm.workPhone" type="tel" />
                </div>
                <div class="form-group">
                  <label>Work Phone Extension</label>
                  <input v-model="accountForm.workPhoneExtension" type="text" />
                </div>
                
                <div v-if="canToggleSupervisorPrivileges" class="form-group form-group-full">
                  <label class="toggle-label">
                    <span>Supervisor Privileges</span>
                    <div class="toggle-switch">
                      <input 
                        type="checkbox" 
                        v-model="accountForm.hasSupervisorPrivileges" 
                        :disabled="!canEditUser"
                        id="supervisor-privileges-toggle"
                      />
                      <span class="slider"></span>
                    </div>
                  </label>
                  <small class="form-help">Allows this user to be assigned as a supervisor while maintaining their primary role</small>
                  <small v-if="!canEditUser" class="form-help" style="display: block; margin-top: 4px;">You don't have permission to edit this field</small>
                </div>
                <div class="form-group form-group-full">
                  <label>Role</label>
                  <select v-model="accountForm.role" :disabled="!canChangeRole">
                    <option v-if="canAssignSuperAdmin" value="super_admin">Super Admin</option>
                    <option v-if="canAssignAdmin" value="admin">Admin</option>
                    <option v-if="canAssignSupport" value="support">Support</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="clinical_practice_assistant">Clinical Practice Assistant</option>
                    <option value="staff">Staff</option>
                    <option value="clinician">Clinician</option>
                    <option value="facilitator">Facilitator</option>
                    <option value="intern">Intern</option>
                  </select>
                  <small v-if="!canChangeRole" class="form-help">You don't have permission to change roles</small>
                  <small v-else-if="!canAssignSuperAdmin && accountForm.role === 'super_admin'" class="form-help">Only super admins can assign the super admin role</small>
                  <small v-else-if="!canAssignAdmin && accountForm.role === 'admin'" class="form-help">Only super admins and admins can assign the admin role</small>
                  <small v-else-if="!canAssignSupport && accountForm.role === 'support'" class="form-help">Only super admins and admins can assign the support role</small>
                </div>
              </div>
              
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" :disabled="saving">
                  {{ saving ? 'Saving...' : 'Save Changes' }}
                </button>
              </div>
            </form>
            <div v-else class="view-only-notice">
              <p><strong>View Only:</strong> Clinical Practice Assistants and Supervisors have view-only access to user profiles. Contact an administrator to make changes.</p>
            </div>
            
            <div class="agency-assignments-section">
              <h3>Agency Assignments</h3>
              <div class="agency-assignments">
                <div v-if="userAgencies.length === 0" class="no-agencies">
                  <p>No agencies assigned</p>
                </div>
                <div v-else class="agencies-list">
                  <div v-for="agency in userAgencies" :key="agency.id" class="agency-item">
                    <span class="agency-name">{{ agency.name }}</span>
                    <button @click="removeAgency(agency.id)" class="btn btn-danger btn-sm">Remove</button>
                  </div>
                </div>
                
                <div class="add-agency-section">
                  <select v-model="selectedAgencyId" class="agency-select">
                    <option value="">Select an agency...</option>
                    <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
                      {{ agency.name }}
                    </option>
                  </select>
                  <button @click="addAgency" class="btn btn-primary btn-sm" :disabled="!selectedAgencyId || assigningAgency">
                    {{ assigningAgency ? 'Assigning...' : 'Assign' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
            
            <div class="section-divider">
              <h3>Status Management</h3>
            </div>
            
            <div class="password-status-layout">
              <!-- Send Reset Password Link Section -->
              <div class="reset-password-section">
                <h4>Password Reset</h4>
                <p>Send a password reset link to this user. They can use it to set or change their password.</p>
                <button 
                  @click="generateResetPasswordLink" 
                  type="button" 
                  class="btn btn-primary btn-sm"
                  :disabled="generatingResetLink"
                >
                  {{ generatingResetLink ? 'Generating...' : 'Send Reset Password Link' }}
                </button>
              </div>
              
              <div class="status-management">
                <h4>Status Management</h4>
                <div class="current-status">
                  <p><strong>Current Status:</strong> 
                    <span :class="['status-badge', getStatusBadgeClass(user.status, user.is_active)]">
                      {{ getStatusLabel(user.status, user.is_active) }}
                    </span>
                  </p>
                  <p v-if="user.completed_at"><strong>Completed:</strong> {{ formatDate(user.completed_at) }}</p>
                  <p v-if="user.terminated_at"><strong>Terminated:</strong> {{ formatDate(user.terminated_at) }}</p>
                  <p v-if="user.status_expires_at">
                    <strong>Access Expires:</strong> {{ formatDate(user.status_expires_at) }}
                    <span class="expiration-warning">(7 days after status change)</span>
                  </p>
                </div>
                
                <div class="status-actions">
                  <!-- For PREHIRE_REVIEW users: Show "Promote to Onboarding" button -->
                  <button 
                    v-if="(user.status === 'PREHIRE_REVIEW' || user.status === 'ready_for_review') && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support') && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)"
                    @click="promoteToOnboarding" 
                    class="btn btn-primary btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Processing...' : 'Promote to Onboarding' }}
                  </button>
                  
                  <!-- Legacy: For ready_for_review users: Show "Mark as Reviewed and Activate" button -->
                  <button 
                    v-if="user.status === 'ready_for_review' && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support') && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)"
                    @click="handleMarkAsReviewedAndActivate" 
                    class="btn btn-primary btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Processing...' : 'Mark as Reviewed and Activate' }}
                  </button>
                  
                  <!-- Admins can mark ONBOARDING users as ACTIVE_EMPLOYEE -->
                  <button 
                    v-if="(user.status === 'ONBOARDING' || user.status === 'PREHIRE_OPEN' || user.status === 'PREHIRE_REVIEW' || user.status === 'pending' || user.status === 'active') && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support') && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)"
                    @click="markComplete" 
                    class="btn btn-success btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Processing...' : 'Mark as Active Employee' }}
                  </button>
                  
                  <!-- Mark Terminated: Only for ACTIVE_EMPLOYEE users -->
                  <button 
                    v-if="(user.status === 'ACTIVE_EMPLOYEE' || user.status === 'active') && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)"
                    @click="markTerminated" 
                    class="btn btn-danger btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Updating...' : 'Mark Terminated' }}
                  </button>
                  
                  <!-- Archive: Available for most statuses except ARCHIVED -->
                  <button 
                    v-if="user.status !== 'ARCHIVED' && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin') && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)"
                    @click="archiveUser" 
                    class="btn btn-warning btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Archiving...' : 'Archive' }}
                  </button>
                  
                  <!-- Show "Reactivate" for ARCHIVED users -->
                  <button 
                    v-if="user.status === 'ARCHIVED' && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)"
                    @click="markActive" 
                    class="btn btn-secondary btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Updating...' : 'Restore' }}
                  </button>
                  
                  <!-- Show "Activate" for pending users (admin can activate directly) -->
                  <button 
                    v-if="user.status === 'pending' && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support') && authStore.user?.role !== 'clinical_practice_assistant' && authStore.user?.role !== 'supervisor'"
                    @click="showMoveToActiveModal = true" 
                    class="btn btn-primary btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Processing...' : 'Activate' }}
                  </button>
                </div>
                
                <div v-if="user.status === 'completed' || user.status === 'terminated'" class="status-warning">
                  <p>⚠️ User access will expire 7 days after being marked as {{ user.status === 'completed' ? 'complete' : 'terminated' }}.</p>
                </div>
                
                <div v-if="user.status === 'completed' || user.status === 'terminated'" class="download-section">
                  <h5>Onboarding Document</h5>
                  <p>Download the complete onboarding document for this user.</p>
                  <button 
                    @click="downloadOnboardingDocument" 
                    class="btn btn-primary btn-sm"
                    :disabled="downloadingDocument"
                  >
                    {{ downloadingDocument ? 'Generating...' : 'Download' }}
                  </button>
                </div>
              </div>
            </div>
          
          <div class="section-divider">
            <h3>Additional Account Information</h3>
          </div>
          
          <div class="additional-account-info">
            <div v-if="accountInfoLoading" class="loading">Loading account information...</div>
            <div v-else-if="accountInfoError" class="error">{{ accountInfoError }}</div>
            <div v-else>
              <div class="info-grid">
                <div class="info-item">
                  <label>Email:</label>
                  <span>{{ user?.email || 'Not provided' }}</span>
                </div>
                <div v-if="user?.work_email" class="info-item">
                  <label>Work Email (Username):</label>
                  <span>{{ user.work_email }}</span>
                </div>
                <div v-if="user?.personal_email" class="info-item">
                  <label>Personal Email:</label>
                  <span>{{ user.personal_email }}</span>
                </div>
                <div class="info-item">
                  <label>Personal Phone Number:</label>
                  <span>{{ accountInfo.personalPhone || accountInfo.phoneNumber || user?.phone_number || 'Not provided' }}</span>
                </div>
                <div class="info-item">
                  <label>Work Phone Number:</label>
                  <span>{{ accountInfo.workPhone ? (accountInfo.workPhone + (accountInfo.workPhoneExtension ? ' ext. ' + accountInfo.workPhoneExtension : '')) : 'Not provided' }}</span>
                </div>
              </div>
              
              <!-- Supervisor Information Section -->
              <div v-if="accountInfo.supervisors && accountInfo.supervisors.length > 0" class="supervisors-section" style="margin-top: 24px;">
                <h4 style="margin-top: 0; margin-bottom: 15px;">Supervisor Information</h4>
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
              <div v-if="user?.status === 'pending' && accountInfo.passwordlessLoginLink" class="passwordless-link-section" style="margin-top: 24px; padding: 20px; background: #e7f3ff; border-radius: 8px; border: 1px solid #007bff;">
                <h4 style="margin-top: 0; margin-bottom: 15px;">Direct Login Link</h4>
                <p style="margin: 0 0 15px 0; color: #666; font-size: 14px; line-height: 1.6;">
                  Use this link to access the account. The user will be asked to verify their last name when they click the link.
                </p>
                
                <!-- Token Status -->
                <div v-if="accountInfo.passwordlessTokenExpiresAt" style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 6px; border: 1px solid #ddd;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <strong>Link Status:</strong>
                      <span :style="{ color: accountInfo.passwordlessTokenIsExpired ? '#dc3545' : '#28a745', marginLeft: '8px' }">
                        {{ accountInfo.passwordlessTokenIsExpired ? '❌ Expired' : '✅ Valid' }}
                      </span>
                    </div>
                    <div style="text-align: right;">
                      <div><strong>Expires:</strong> {{ formatTokenExpiration(accountInfo.passwordlessTokenExpiresAt) }}</div>
                      <div v-if="!accountInfo.passwordlessTokenIsExpired && accountInfo.passwordlessTokenExpiresInHours" style="font-size: 12px; color: #666;">
                        ({{ formatTimeUntilExpiry(accountInfo.passwordlessTokenExpiresInHours) }})
                      </div>
                    </div>
                  </div>
                </div>
                
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                  <input 
                    type="text" 
                    :value="accountInfo.passwordlessLoginLink" 
                    readonly 
                    style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; font-family: monospace; background: white; cursor: text;"
                    @click="$event.target.select()"
                  />
                  <button 
                    @click="copyPasswordlessLink" 
                    class="btn btn-primary btn-sm"
                  >
                    Copy Link
                  </button>
                </div>
                <div style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
                  <button 
                    @click="showResetTokenModal = true" 
                    class="btn btn-secondary btn-sm"
                    :disabled="resettingToken"
                  >
                    {{ resettingToken ? 'Resetting...' : 'Reset Link (New Token)' }}
                  </button>
                  <div v-if="showResetTokenModal" style="display: flex; gap: 10px; align-items: center; margin-left: 10px;">
                    <label style="font-size: 12px;">Expires in:</label>
                    <input 
                      type="number" 
                      v-model="tokenExpirationDays" 
                      min="1" 
                      max="30"
                      style="width: 60px; padding: 4px; border: 1px solid #ddd; border-radius: 4px;"
                    />
                    <span style="font-size: 12px;">days</span>
                    <button 
                      @click="confirmResetToken" 
                      class="btn btn-success btn-sm"
                      :disabled="resettingToken"
                    >
                      Confirm
                    </button>
                    <button 
                      @click="showResetTokenModal = false" 
                      class="btn btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <small style="display: block; color: #666; font-size: 12px; font-style: italic; margin-top: 10px;">
                  Click the link above to select it, or use the copy button. Use "Reset Link" to generate a new token with custom expiration.
                </small>
              </div>
              
              <div class="download-section">
                <h4>Download Completion Package</h4>
                <p class="download-description">
                  Download a complete package of all completed items for this user, including signed documents, 
                  certificates, completion confirmations, and quiz scores.
                </p>
                <button 
                  @click="downloadCompletionPackage" 
                  class="btn btn-primary btn-sm"
                  :disabled="downloadingPackage"
                >
                  {{ downloadingPackage ? 'Generating...' : 'Download' }}
                </button>
              </div>
              
              <div v-if="canEditUser" class="account-management-section">
                <h4>Account Management</h4>
                <div class="account-management-content" :class="{ 'activate-section': !user?.is_active }">
                  <p v-if="user?.is_active">
                    Deactivate this user account. This will prevent them from logging in. 
                    Note: This user may need to be marked as completed or terminated instead.
                  </p>
                  <p v-else>
                    Activate this user account. This will restore their access to the system.
                  </p>
                  <button 
                    v-if="user?.is_active"
                    @click="deactivateUser" 
                    class="btn btn-warning btn-sm"
                    :disabled="deactivatingUser"
                  >
                    {{ deactivatingUser ? 'Deactivating...' : 'Deactivate' }}
                  </button>
                  <button 
                    v-else
                    @click="activateUser" 
                    class="btn btn-success btn-sm"
                    :disabled="activatingUser"
                  >
                    {{ activatingUser ? 'Activating...' : 'Activate' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div class="section-divider">
            <h3>Supervisor Assignments</h3>
          </div>
          
          <div v-if="canManageAssignments" class="supervisor-assignments-section">
            <SupervisorAssignmentManager
              :supervisor-id="(user && (isSupervisor(user) || user.role === 'clinical_practice_assistant')) ? userId : null"
              :supervisee-id="['staff', 'clinician', 'facilitator', 'intern'].includes(user?.role) ? userId : null"
            />
          </div>
          
          <div v-else class="supervisor-assignments-section">
            <div v-if="(user && isSupervisor(user)) || user?.role === 'clinical_practice_assistant'" class="assignments-info">
              <h4>Assigned Supervisees</h4>
              <div v-if="superviseesLoading" class="loading">Loading supervisees...</div>
              <div v-else-if="supervisees.length === 0" class="empty-state">
                <p>No supervisees assigned. Contact an administrator to assign supervisees.</p>
              </div>
              <div v-else class="supervisees-list">
                <div v-for="supervisee in supervisees" :key="supervisee.id" class="supervisee-item">
                  <span>{{ supervisee.supervisee_first_name }} {{ supervisee.supervisee_last_name }}</span>
                  <small style="color: var(--text-secondary);">{{ supervisee.supervisee_email }}</small>
                </div>
              </div>
            </div>
            <div v-else-if="['staff', 'clinician', 'facilitator', 'intern'].includes(user?.role)" class="assignments-info">
              <h4>Assigned Supervisors</h4>
              <div v-if="supervisorsLoading" class="loading">Loading supervisors...</div>
              <div v-else-if="supervisors.length === 0" class="empty-state">
                <p>No supervisors assigned.</p>
              </div>
              <div v-else class="supervisors-list">
                <div v-for="supervisor in supervisors" :key="supervisor.id" class="supervisor-item">
                  <span>{{ supervisor.supervisor_first_name }} {{ supervisor.supervisor_last_name }}</span>
                  <small style="color: var(--text-secondary);">{{ supervisor.supervisor_email }}</small>
                </div>
              </div>
            </div>
          </div>

          <div class="section-divider">
            <h3>Additional User Information</h3>
          </div>
          
          <UserInformationTab
            :userId="userId"
          />
        </div>

        <UserTrainingTab
          v-if="activeTab === 'training'"
          :userId="userId"
          :viewOnly="!canEditUser"
        />

        <UserDocumentsTab
          v-if="activeTab === 'documents'"
          :userId="userId"
          :highlight-task-id="route.query.taskId ? parseInt(route.query.taskId) : null"
          :viewOnly="!canEditUser"
        />

        <UserCommunicationsTab
          v-if="activeTab === 'communications'"
          :userId="userId"
          :userAgencies="userAgencies"
          :viewOnly="!canEditUser"
        />

        <UserActivityLogTab
          v-if="activeTab === 'activity'"
          :userId="userId"
        />

        <div v-if="activeTab === 'preferences'" class="tab-panel">
          <h2>User Preferences</h2>
          <div class="preferences-admin-section">
            <p class="section-description">Manage this user's preferences. Some settings are user-editable, while others are admin-controlled.</p>

            <UserPreferencesHub
              :userId="userId"
              :viewOnly="!canEditUser"
              :allowAdminControlledEdits="canEditUser"
              :identity="user"
              :organizations="userAgencies"
            />
          </div>
        </div>

        <UserPayrollTab
          v-if="activeTab === 'payroll'"
          :userId="userId"
          :userAgencies="userAgencies"
        />

      </div>
    </div>
    
    <!-- Move to Active Modal -->
    <MovePendingToActiveModal
      :show="showMoveToActiveModal"
      :user="user"
      @close="showMoveToActiveModal = false"
      @confirm="handleMoveToActive"
    />
    
    <!-- Reset Password Link Modal -->
    <div v-if="showResetPasswordLinkModal" class="modal-overlay" @click="closeResetPasswordLinkModal">
      <div class="modal-content credentials-modal" @click.stop>
        <h2>Send Reset Password Link</h2>
        <p class="credentials-description">Copy this reset password link to send to the user. They can use it to set or change their password.</p>
        
        <div class="credentials-section">
          <div class="credential-item">
            <label>Reset Password Link:</label>
            <div class="credential-value">
              <input 
                type="text" 
                :value="resetPasswordLink" 
                readonly 
                class="credential-input" 
                ref="resetLinkInput" 
              />
              <button @click="copyResetLink" class="btn-copy">Copy</button>
            </div>
            <small>This link will expire in 48 hours. If the user is inactive, they will be activated when they set their password.</small>
          </div>
        </div>
        
        <div class="credentials-actions">
          <button 
            @click="copyResetLink" 
            class="btn btn-primary"
            :disabled="!resetPasswordLink"
          >
            Copy Link
          </button>
          <button 
            @click="sendViaTextMessage" 
            class="btn btn-secondary"
            :disabled="!resetPasswordLink || sendingResetSms"
          >
            {{ sendingResetSms ? 'Sending…' : 'Send via Text Message' }}
          </button>
          <button 
            @click="sendViaEmail" 
            class="btn btn-secondary"
            disabled
            title="Email integration coming soon"
          >
            Send via Email
          </button>
          <button @click="closeResetPasswordLinkModal" class="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>

    <!-- User Credentials Modal -->
    <div v-if="showCredentialsModal" class="modal-overlay" @click="showCredentialsModal = false">
      <div class="modal-content credentials-modal large" @click.stop>
        <h2>User Credentials & Email</h2>
        <p class="credentials-description">Copy these credentials and the generated email to send to the new user:</p>
        
        <div class="credentials-section">
          <div class="credential-item">
            <label>Passwordless Login Link:</label>
            <div class="credential-value">
              <input type="text" :value="userCredentials.tokenLink || ''" readonly class="credential-input" ref="tokenLinkInput" />
              <button @click="copyToClipboard('tokenLink')" class="btn-copy">Copy</button>
            </div>
            <small>Direct login link that redirects to password change</small>
          </div>
          
          <div class="credential-item">
            <label>Username:</label>
            <div class="credential-value">
              <input type="text" :value="userCredentials.username" readonly class="credential-input" ref="usernameInput" />
              <button @click="copyToClipboard('username')" class="btn-copy">Copy</button>
            </div>
          </div>
          
          <!-- Temporary passwords have been deprecated in favor of reset-password links -->
        </div>
        
        <!-- Generated Emails Section -->
        <div v-if="userCredentials.generatedEmails && userCredentials.generatedEmails.length > 0" class="generated-emails-section">
          <h3>Generated Email{{ userCredentials.generatedEmails.length > 1 ? 's' : '' }}</h3>
          <div v-for="(email, index) in userCredentials.generatedEmails" :key="index" class="email-card">
            <div class="email-header">
              <h4>{{ email.agencyName }}</h4>
            </div>
            <div class="email-content">
              <div class="email-field">
                <label>Subject:</label>
                <div class="email-value">{{ email.subject }}</div>
              </div>
              <div class="email-field">
                <label>Body:</label>
                <pre class="email-body">{{ email.body }}</pre>
              </div>
            </div>
            <div class="email-actions">
              <button @click="copyEmail(email)" class="btn btn-primary btn-sm">Copy Email</button>
            </div>
          </div>
        </div>
        
        <div class="credentials-actions">
          <button @click="copyAllCredentials" class="btn btn-secondary">Copy All Credentials</button>
          <button v-if="userCredentials.generatedEmails && userCredentials.generatedEmails.length > 0" 
                  @click="copyAllEmails" 
                  class="btn btn-primary">
            Copy All Emails
          </button>
          <button @click="closeCredentialsModal" class="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { isSupervisor } from '../../utils/helpers.js';
import UserTrainingTab from '../../components/admin/UserTrainingTab.vue';
import UserDocumentsTab from '../../components/admin/UserDocumentsTab.vue';
import UserInformationTab from '../../components/admin/UserInformationTab.vue';
import UserCommunicationsTab from '../../components/admin/UserCommunicationsTab.vue';
import UserActivityLogTab from '../../components/admin/UserActivityLogTab.vue';
import UserPayrollTab from '../../components/admin/UserPayrollTab.vue';
import SupervisorAssignmentManager from '../../components/admin/SupervisorAssignmentManager.vue';
import MovePendingToActiveModal from '../../components/admin/MovePendingToActiveModal.vue';
import UserPreferencesHub from '../../components/UserPreferencesHub.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const userId = computed(() => parseInt(route.params.userId));

const loading = ref(true);
const error = ref('');
const user = ref(null);
// Initialize activeTab from query parameter or default to 'account'
const activeTab = ref(route.query.tab || 'account');
const saving = ref(false);

const canViewActivityLog = computed(() => {
  const user = authStore.user;
  if (!user) return false;
  return isSupervisor(user) || user.role === 'clinical_practice_assistant' || user.role === 'admin' || user.role === 'super_admin' || user.role === 'support';
});

const canManageAssignments = computed(() => {
  const role = authStore.user?.role;
  return role === 'admin' || role === 'super_admin' || role === 'support';
});

const canViewPayroll = computed(() => {
  const role = authStore.user?.role;
  return role === 'admin' || role === 'super_admin' || role === 'support';
});

const supervisees = ref([]);
const supervisors = ref([]);
const superviseesLoading = ref(false);
const supervisorsLoading = ref(false);

const tabs = computed(() => {
  const baseTabs = [
    { id: 'account', label: 'Account' },
    { id: 'training', label: 'Training' },
    { id: 'documents', label: 'Documents' },
    { id: 'communications', label: 'Communications' },
    { id: 'preferences', label: 'Preferences' }
  ];

  if (canViewPayroll.value) {
    baseTabs.push({ id: 'payroll', label: 'Payroll' });
  }
  
  if (canViewActivityLog.value) {
    baseTabs.push({ id: 'activity', label: 'Activity Log' });
  }
  
  return baseTabs;
});

const accountForm = ref({
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  personalPhone: '',
  workPhone: '',
  workPhoneExtension: '',
  role: '',
  hasSupervisorPrivileges: false,
  hasProviderAccess: false,
  hasStaffAccess: false
});

const canToggleSupervisorPrivileges = computed(() => {
  const role = user.value?.role || accountForm.value?.role;
  if (!role) {
    return false;
  }
  const eligibleRoles = ['admin', 'super_admin', 'clinical_practice_assistant'];
  return eligibleRoles.includes(role);
});

// Watch for role changes to reset supervisor privileges if role becomes ineligible
watch(() => accountForm.value.role, (newRole) => {
  const eligibleRoles = ['admin', 'super_admin', 'clinical_practice_assistant'];
  if (!eligibleRoles.includes(newRole)) {
    accountForm.value.hasSupervisorPrivileges = false;
  }
  // Reset permission attributes when role changes
  if (newRole !== 'staff' && newRole !== 'support') {
    accountForm.value.hasProviderAccess = false;
  }
  if (newRole !== 'provider' && newRole !== 'clinician') {
    accountForm.value.hasStaffAccess = false;
  }
});

const showResetPasswordLinkModal = ref(false);
const generatingResetLink = ref(false);
const resetPasswordLink = ref('');
const resetLinkInput = ref(null);

const userAgencies = ref([]);
const availableAgencies = ref([]);
const selectedAgencyId = ref('');
const assigningAgency = ref(false);

const accountInfo = ref({ loginEmail: '', personalEmail: '', phoneNumber: '', personalPhone: '', workPhone: '', workPhoneExtension: '', supervisors: [], status: null, passwordlessLoginLink: null, passwordlessTokenExpiresAt: null, passwordlessTokenExpiresInHours: null, passwordlessTokenIsExpired: false });
const accountInfoLoading = ref(false);
const accountInfoError = ref('');
const downloadingPackage = ref(false);
const deactivatingUser = ref(false);
const activatingUser = ref(false);
const resettingToken = ref(false);
const showResetTokenModal = ref(false);
const tokenExpirationDays = ref(7);
const showMoveToActiveModal = ref(false);
const showCredentialsModal = ref(false);
const userCredentials = ref({
  token: '',
  tokenLink: '',
  username: '',
  generatedEmails: []
});

// Role assignment permissions
const canEditUser = computed(() => {
  const user = authStore.user;
  if (!user) return false;
  // CPAs and supervisors have view-only access
  return !isSupervisor(user) && user.role !== 'clinical_practice_assistant';
});

const canChangeRole = computed(() => {
  const currentUserRole = authStore.user?.role;
  return currentUserRole === 'super_admin' || currentUserRole === 'admin' || currentUserRole === 'support';
});

const canAssignSuperAdmin = computed(() => {
  return authStore.user?.role === 'super_admin';
});

const canAssignAdmin = computed(() => {
  const currentUserRole = authStore.user?.role;
  return currentUserRole === 'super_admin' || currentUserRole === 'admin';
});

const canAssignSupport = computed(() => {
  const currentUserRole = authStore.user?.role;
  return currentUserRole === 'super_admin' || currentUserRole === 'admin';
});


const fetchUser = async () => {
  try {
    loading.value = true;
    const response = await api.get(`/users/${userId.value}`);
    user.value = response.data;
    
    // Preserve the current form values if user data is missing to prevent toggle from disappearing
    const currentRole = user.value?.role || accountForm.value?.role || '';
    const currentHasSupervisorPrivileges = user.value?.has_supervisor_privileges !== undefined 
      ? (user.value.has_supervisor_privileges === true || user.value.has_supervisor_privileges === 1 || user.value.has_supervisor_privileges === '1')
      : accountForm.value?.hasSupervisorPrivileges || false;
    
    accountForm.value = {
      firstName: user.value.first_name || accountForm.value?.firstName || '',
      lastName: user.value.last_name || accountForm.value?.lastName || '',
      email: user.value.email || accountForm.value?.email || '',
      phoneNumber: user.value.phone_number || accountForm.value?.phoneNumber || '',
      personalPhone: user.value.personal_phone || accountForm.value?.personalPhone || '',
      workPhone: user.value.work_phone || accountForm.value?.workPhone || '',
      workPhoneExtension: user.value.work_phone_extension || accountForm.value?.workPhoneExtension || '',
      role: currentRole,
      hasSupervisorPrivileges: currentHasSupervisorPrivileges,
      hasProviderAccess: user.value.has_provider_access === true || user.value.has_provider_access === 1 || user.value.has_provider_access === '1' || false,
      hasStaffAccess: user.value.has_staff_access === true || user.value.has_staff_access === 1 || user.value.has_staff_access === '1' || false
    };
    
    // Fetch user agencies
    await fetchUserAgencies();
    // Fetch available agencies
    await fetchAvailableAgencies();
    // Fetch account info
    await fetchAccountInfo();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load user';
    console.error('Error fetching user:', err);
  } finally {
    loading.value = false;
  }
};

const fetchAccountInfo = async () => {
  try {
    accountInfoLoading.value = true;
    const response = await api.get(`/users/${userId.value}/account-info`);
    accountInfo.value = response.data;
  } catch (err) {
    accountInfoError.value = err.response?.data?.error?.message || 'Failed to load account information';
  } finally {
    accountInfoLoading.value = false;
  }
};

const copyPasswordlessLink = () => {
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

const resetPasswordlessToken = async () => {
  showResetTokenModal.value = true;
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
    
    showResetTokenModal.value = false;
    alert('Passwordless login link reset successfully! The new link is now displayed above.');
  } catch (err) {
    accountInfoError.value = err.response?.data?.error?.message || 'Failed to reset passwordless token';
    alert(accountInfoError.value);
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

const downloadCompletionPackage = async () => {
  try {
    downloadingPackage.value = true;
    const response = await api.get(`/users/${userId.value}/completion-package`, {
      responseType: 'blob'
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `completion-package-${userId.value}-${Date.now()}.zip`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download completion package');
  } finally {
    downloadingPackage.value = false;
  }
};

const deactivateUser = async () => {
  if (!confirm('Are you sure you want to set this user as inactive? This user may need to be marked as completed or terminated.')) {
    return;
  }
  
  try {
    deactivatingUser.value = true;
    await api.post(`/users/${userId.value}/deactivate`);
    alert('User deactivated successfully');
    await fetchUser();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to deactivate user');
  } finally {
    deactivatingUser.value = false;
  }
};

const activateUser = async () => {
  if (!confirm('Are you sure you want to activate this user? This will restore their access to the system.')) {
    return;
  }
  
  try {
    activatingUser.value = true;
    await api.post(`/users/${userId.value}/mark-active`);
    alert('User activated successfully');
    await fetchUser();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to activate user');
  } finally {
    activatingUser.value = false;
  }
};

const fetchUserAgencies = async () => {
  try {
    const response = await api.get(`/users/${userId.value}/agencies`);
    userAgencies.value = response.data || [];
  } catch (err) {
    console.error('Failed to load user agencies:', err);
    userAgencies.value = [];
  }
};

const fetchAvailableAgencies = async () => {
  try {
    if (authStore.user?.role === 'super_admin') {
      await agencyStore.fetchAgencies();
      availableAgencies.value = agencyStore.agencies || [];
    } else {
      await agencyStore.fetchUserAgencies();
      availableAgencies.value = agencyStore.userAgencies || [];
    }
  } catch (err) {
    console.error('Failed to load agencies:', err);
    availableAgencies.value = [];
  }
};

const addAgency = async () => {
  if (!selectedAgencyId.value) return;
  
  try {
    assigningAgency.value = true;
    await api.post('/users/assign/agency', {
      userId: userId.value,
      agencyId: parseInt(selectedAgencyId.value)
    });
    await fetchUserAgencies();
    selectedAgencyId.value = '';
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to assign agency';
    alert(error.value);
  } finally {
    assigningAgency.value = false;
  }
};

const removeAgency = async (agencyId) => {
  if (!confirm('Remove this agency assignment?')) return;
  
  try {
    await api.post('/users/remove/agency', {
      userId: userId.value,
      agencyId: agencyId
    });
    await fetchUserAgencies();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to remove agency';
    alert(error.value);
  }
};

const saveAccount = async () => {
  // Validate role assignment permissions
  if (accountForm.value.role === 'super_admin' && !canAssignSuperAdmin.value) {
    error.value = 'Only super admins can assign the super admin role';
    alert(error.value);
    return;
  }
  
  if (accountForm.value.role === 'admin' && !canAssignAdmin.value) {
    error.value = 'Only super admins and admins can assign the admin role';
    alert(error.value);
    return;
  }
  
  if (accountForm.value.role === 'support' && !canAssignSupport.value) {
    error.value = 'Only super admins and admins can assign the support role';
    alert(error.value);
    return;
  }
  
  try {
    saving.value = true;
    const updateData = {
      firstName: accountForm.value.firstName,
      lastName: accountForm.value.lastName,
      phoneNumber: accountForm.value.phoneNumber,
      personalPhone: accountForm.value.personalPhone,
      workPhone: accountForm.value.workPhone,
      workPhoneExtension: accountForm.value.workPhoneExtension,
      role: accountForm.value.role
    };
    
    // Include supervisor privileges if user has eligible role
    // Always include it if the toggle is visible (even if false) to ensure it's saved
    if (canToggleSupervisorPrivileges.value) {
      updateData.hasSupervisorPrivileges = Boolean(accountForm.value.hasSupervisorPrivileges);
      console.log('Sending supervisor privileges toggle:', updateData.hasSupervisorPrivileges, 'for user role:', accountForm.value.role);
    } else {
      console.log('Cannot toggle supervisor privileges - user role:', accountForm.value.role, 'canToggle:', canToggleSupervisorPrivileges.value);
    }
    
    // Include permission attributes for cross-role capabilities
    if (accountForm.value.role === 'staff' || accountForm.value.role === 'support') {
      updateData.hasProviderAccess = Boolean(accountForm.value.hasProviderAccess);
    }
    if (accountForm.value.role === 'provider' || accountForm.value.role === 'clinician') {
      updateData.hasStaffAccess = Boolean(accountForm.value.hasStaffAccess);
    }
    
    console.log('Update data being sent:', updateData);
    const response = await api.put(`/users/${userId.value}`, updateData);
    // Always fetch fresh user data to ensure all fields are up to date
    await fetchUser();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save changes';
    alert(error.value);
  } finally {
    saving.value = false;
  }
};

const generateResetPasswordLink = async () => {
  try {
    generatingResetLink.value = true;
    const response = await api.post(`/users/${userId.value}/send-reset-password-link`);
    resetPasswordLink.value = response.data.tokenLink;
    showResetPasswordLinkModal.value = true;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to generate reset password link';
    alert(error.value);
  } finally {
    generatingResetLink.value = false;
  }
};

const copyResetLink = async () => {
  if (resetLinkInput.value) {
    resetLinkInput.value.select();
    try {
      await navigator.clipboard.writeText(resetPasswordLink.value);
      // Could show a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
};

const closeResetPasswordLinkModal = () => {
  showResetPasswordLinkModal.value = false;
  resetPasswordLink.value = '';
};

const sendViaTextMessage = () => {
  // Implemented: send reset link via Twilio SMS
  sendResetLinkSms();
};

const sendViaEmail = () => {
  // Placeholder for future Email API integration
  alert('Email integration coming soon');
};

const sendingResetSms = ref(false);
const sendResetLinkSms = async () => {
  try {
    if (!resetPasswordLink.value) return;
    sendingResetSms.value = true;
    const resp = await api.post(`/users/${userId.value}/send-reset-password-link-sms`, {
      tokenLink: resetPasswordLink.value
    });
    alert(`Sent SMS to ${resp.data.to}`);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to send SMS');
  } finally {
    sendingResetSms.value = false;
  }
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
};

const updatingStatus = ref(false);
const downloadingDocument = ref(false);

const getStatusLabel = (status, isActive = true) => {
  if (!isActive) {
    return 'Inactive';
  }
  const labels = {
    'active': 'Active',
    'completed': 'Completed',
    'terminated': 'Terminated',
    'pending': 'Pending',
    'ready_for_review': 'Ready for Review'
  };
  return labels[status] || 'Active';
};

const getStatusBadgeClass = (status, isActive = true) => {
  if (!isActive) {
    return 'badge-secondary';
  }
  const classes = {
    'active': 'badge-success',
    'completed': 'badge-info',
    'terminated': 'badge-danger',
    'pending': 'badge-warning',
    'ready_for_review': 'badge-primary'
  };
  return classes[status] || 'badge-secondary';
};

const markComplete = async () => {
  // Admins can mark pending, ready_for_review, or active users as completed
  // The backend will handle the flow automatically
  if (!confirm('Are you sure you want to mark this user as complete? Their access will expire in 7 days.')) {
    return;
  }
  
  try {
    updatingStatus.value = true;
    await api.post(`/users/${userId.value}/mark-complete`);
    await fetchUser();
    alert('User marked as complete. Access will expire in 7 days.');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to mark user as complete';
    alert(error.value);
  } finally {
    updatingStatus.value = false;
  }
};

const promoteToOnboarding = async () => {
  if (!confirm('Are you sure you want to promote this user to onboarding? This will change their status to ONBOARDING.')) {
    return;
  }
  
  try {
    updatingStatus.value = true;
    await api.post(`/users/${userId.value}/promote-to-onboarding`);
    await fetchUser();
    alert('User promoted to onboarding status successfully.');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to promote user to onboarding';
    alert(error.value);
  } finally {
    updatingStatus.value = false;
  }
};

const handleMarkAsReviewedAndActivate = async () => {
  try {
    updatingStatus.value = true;
    
    // First, download the completion summary
    try {
      const summaryResponse = await api.get(`/users/${userId.value}/pending/completion-summary`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([summaryResponse.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = `completion-summary-${user.value?.first_name}-${user.value?.last_name}-${Date.now()}.pdf`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading completion summary:', err);
      // Continue even if download fails
    }
    
    // Then open the modal for work email entry
    showMoveToActiveModal.value = true;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to download completion summary';
    alert(error.value);
  } finally {
    updatingStatus.value = false;
  }
};

const handleMoveToActive = async (data) => {
  try {
    updatingStatus.value = true;
    const workEmail = typeof data === 'string' ? data : data.workEmail;
    const personalEmail = typeof data === 'object' ? data.personalEmail : null;
    const templateId = typeof data === 'object' ? data.templateId : null;
    const response = await api.post(`/users/${userId.value}/move-to-active`, {
      workEmail: workEmail,
      personalEmail: personalEmail,
      templateId: templateId
    });
    
    // Close the work email modal
    showMoveToActiveModal.value = false;
    
    // Show credentials modal with all information
    if (response.data.credentials) {
      userCredentials.value = {
        token: response.data.credentials.passwordlessToken,
        tokenLink: response.data.credentials.passwordlessTokenLink,
        username: response.data.credentials.workEmail,
        generatedEmails: response.data.credentials.generatedEmail ? [{
          type: 'Welcome Active',
          subject: response.data.credentials.emailSubject || 'Your Account Credentials',
          body: response.data.credentials.generatedEmail,
          agencyName: user.value?.agencies?.[0]?.name || 'Your Agency'
        }] : []
      };
      showCredentialsModal.value = true;
    } else {
      alert('User moved to active status successfully.');
    }
    
    await fetchUser();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to move user to active status';
    alert(error.value);
  } finally {
    updatingStatus.value = false;
  }
};

const markTerminated = async () => {
  if (!confirm('Are you sure you want to mark this user as terminated? They will have 7 days of access before being archived.')) {
    return;
  }
  
  try {
    updatingStatus.value = true;
    const response = await api.post(`/users/${userId.value}/mark-terminated`);
    await fetchUser();
    const terminationDate = response.data.terminationDate ? new Date(response.data.terminationDate) : null;
    const message = terminationDate 
      ? `User marked as terminated. Access will expire on ${terminationDate.toLocaleDateString()}.`
      : 'User marked as terminated. Access will expire in 7 days.';
    alert(message);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to mark user as terminated';
    alert(error.value);
  } finally {
    updatingStatus.value = false;
  }
};

const markActive = async () => {
  if (!confirm('Are you sure you want to reactivate this user? This will restore their access immediately.')) {
    return;
  }
  
  try {
    updatingStatus.value = true;
    await api.post(`/users/${userId.value}/mark-active`);
    await fetchUser();
    alert('User account reactivated.');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to reactivate user';
  } finally {
    updatingStatus.value = false;
  }
};

const archiveUser = async () => {
  if (!confirm(`Are you sure you want to archive "${user.value?.first_name} ${user.value?.last_name}"? You can restore them from the Archive section in Settings.`)) {
    return;
  }
  
  try {
    updatingStatus.value = true;
    await api.post(`/users/${userId.value}/archive`);
    alert('User archived successfully');
    // Redirect to users list
    router.push('/admin/users');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to archive user';
    alert(error.value);
  } finally {
    updatingStatus.value = false;
  }
};

const downloadOnboardingDocument = async () => {
  try {
    downloadingDocument.value = true;
    const response = await api.get(`/users/${userId.value}/onboarding-document`, {
      responseType: 'blob'
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const filename = `onboarding-document-${user.value.first_name}-${user.value.last_name}-${Date.now()}.pdf`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to download onboarding document';
  } finally {
    downloadingDocument.value = false;
  }
};

const closeCredentialsModal = () => {
  showCredentialsModal.value = false;
  userCredentials.value = {
    token: '',
    tokenLink: '',
    username: '',
    generatedEmails: []
  };
};

const copyToClipboard = async (type) => {
  let text = '';
  if (type === 'tokenLink') {
    text = userCredentials.value.tokenLink || '';
  } else if (type === 'username') {
    text = userCredentials.value.username;
  }
  
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

const copyEmail = async (email) => {
  const emailText = `Subject: ${email.subject}\n\n${email.body}`;
  try {
    await navigator.clipboard.writeText(emailText);
  } catch (err) {
    console.error('Failed to copy email:', err);
  }
};

const copyAllEmails = async () => {
  if (!userCredentials.value.generatedEmails || userCredentials.value.generatedEmails.length === 0) {
    return;
  }
  
  const allEmails = userCredentials.value.generatedEmails.map(email => 
    `--- ${email.agencyName} ---\nSubject: ${email.subject}\n\n${email.body}`
  ).join('\n\n');
  
  try {
    await navigator.clipboard.writeText(allEmails);
  } catch (err) {
    console.error('Failed to copy all emails:', err);
  }
};

const copyAllCredentials = async () => {
  const parts = [];
  if (userCredentials.value.tokenLink) {
    parts.push(`Passwordless Login Link: ${userCredentials.value.tokenLink}`);
  }
  parts.push(`Username: ${userCredentials.value.username}`);
  
  const allText = parts.join('\n');
  
  try {
    await navigator.clipboard.writeText(allText);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

// Watch for tab query parameter changes
watch(() => route.query.tab, (newTab) => {
  const validTabs = ['account', 'training', 'documents', 'communications', 'activity'];
  if (newTab && validTabs.includes(newTab)) {
    activeTab.value = newTab;
  }
}, { immediate: true });

const fetchSupervisees = async () => {
  if (!user.value || (!isSupervisor(user.value) && user.value.role !== 'clinical_practice_assistant')) {
    return;
  }
  
  try {
    superviseesLoading.value = true;
    const response = await api.get(`/supervisor-assignments/supervisor/${userId.value}`);
    supervisees.value = response.data;
  } catch (err) {
    console.error('Failed to fetch supervisees:', err);
    supervisees.value = [];
  } finally {
    superviseesLoading.value = false;
  }
};

const fetchSupervisors = async () => {
  if (!user.value || !['staff', 'clinician', 'facilitator', 'intern'].includes(user.value.role)) {
    return;
  }
  
  try {
    supervisorsLoading.value = true;
    const response = await api.get(`/supervisor-assignments/supervisee/${userId.value}`);
    supervisors.value = response.data;
  } catch (err) {
    console.error('Failed to fetch supervisors:', err);
    supervisors.value = [];
  } finally {
    supervisorsLoading.value = false;
  }
};

onMounted(async () => {
  await fetchUser();
  await Promise.all([fetchSupervisees(), fetchSupervisors()]);
});
</script>

<style scoped>
.page-header {
  margin-bottom: 32px;
}

.back-link {
  display: inline-block;
  margin-bottom: 12px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.2s;
}

.back-link:hover {
  color: var(--primary);
}

.user-header-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 4px;
}

.page-header h1 {
  margin: 0;
  color: var(--text-primary);
}

.status-badge-header {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.subtitle {
  color: var(--text-secondary);
  margin: 0;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
  border-bottom: 2px solid var(--border);
}

.tab-button {
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--primary);
}

.tab-button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.tab-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
}

.tab-panel h2 {
  margin-top: 0;
  margin-bottom: 24px;
  color: var(--text-primary);
}

.preferences-admin-section {
  background: white;
  border-radius: 8px;
  padding: 32px;
  border: 1px solid var(--border);
}

.preferences-admin-section .section-description {
  margin-bottom: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}

.preferences-placeholder {
  padding: 40px;
  text-align: center;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 2px dashed var(--border);
}

.preferences-placeholder p {
  margin: 0 0 16px 0;
  color: var(--text-secondary);
  font-size: 16px;
}

.preferences-placeholder ul {
  text-align: left;
  display: inline-block;
  margin: 16px 0;
  color: var(--text-secondary);
}

.preferences-placeholder .placeholder-note {
  font-size: 14px;
  color: var(--text-secondary);
  font-style: italic;
  opacity: 0.8;
  margin-top: 16px;
}

.account-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  align-items: start;
}

.account-form {
  max-width: 100%;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: var(--text-primary);
  font-size: 13px;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.form-group-full {
  grid-column: 1 / -1;
}

.toggle-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  cursor: pointer;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-switch .slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.4s;
  border-radius: 24px;
}

.toggle-switch .slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.4s;
  border-radius: 50%;
}

.toggle-switch input:checked + .slider {
  background-color: var(--primary, #4CAF50);
}

.toggle-switch input:checked + .slider:before {
  transform: translateX(26px);
}

.toggle-switch input:disabled + .slider {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-actions {
  margin-top: 24px;
}

.section-divider {
  margin: 32px 0 20px 0;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.section-divider h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
}

.password-status-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  align-items: start;
}

.reset-password-section h4,
.temp-password-section h4,
.status-management h4 {
  margin-top: 0;
  margin-bottom: 12px;
  color: var(--text-primary);
  font-size: 16px;
}

.reset-password-section {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.reset-password-section h4 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.reset-password-section p {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.temp-password-section {
  margin-top: 0;
}

.temp-password-status {
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 12px;
}

.temp-password-status p {
  margin: 4px 0;
  font-size: 13px;
}

.temp-password-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.temp-password-actions .btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
  width: auto;
  min-width: auto;
  flex-shrink: 0;
}

.temp-password-display {
  padding: 16px;
  background: #fff3cd;
  border: 2px solid #ffc107;
  border-radius: 6px;
  margin-top: 16px;
}

.temp-password-display p {
  margin: 0 0 12px 0;
  font-size: 14px;
}

.password-display {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.password-input {
  flex: 1;
  padding: 10px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-family: monospace;
  font-size: 14px;
  background-color: white;
}

.password-warning {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: #856404;
  font-weight: 500;
}

.status-management {
  padding: 0;
}

.current-status {
  margin-bottom: 12px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
}

.current-status p {
  margin: 4px 0;
  color: var(--text-primary);
  font-size: 13px;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  margin-left: 8px;
}

.badge-success {
  background: #d1fae5;
  color: #065f46;
}

.badge-info {
  background: #dbeafe;
  color: #1e40af;
}

.badge-danger {
  background: #fee2e2;
  color: #991b1b;
}

.badge-secondary {
  background: #e5e7eb;
  color: #374151;
}

.expiration-warning {
  color: #dc2626;
  font-size: 12px;
  margin-left: 8px;
}

.status-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.status-actions .btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
  width: auto;
  min-width: auto;
  flex-shrink: 0;
}

.status-warning {
  padding: 12px;
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  border-radius: 4px;
  color: #92400e;
}

.status-warning p {
  margin: 0;
}

.download-section {
  margin-top: 12px;
  padding: 12px;
  background: #f0f4ff;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.download-section h5 {
  margin: 0 0 6px 0;
  color: var(--text-primary);
  font-size: 14px;
}

.download-section p {
  margin: 0 0 8px 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.download-section .btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
  width: auto;
  min-width: auto;
}

.form-help {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.agency-assignments-section {
  max-width: 100%;
}

.agency-assignments-section h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--text-primary);
  font-size: 18px;
}

.agency-assignments {
  margin-top: 0;
}

.no-agencies {
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 16px;
  color: var(--text-secondary);
  font-size: 13px;
}

.agencies-list {
  margin-bottom: 16px;
}

.agency-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 6px;
}

.agency-name {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 14px;
}

.agency-item .btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
  width: auto;
  min-width: auto;
  flex-shrink: 0;
}

.add-agency-section {
  display: flex;
  gap: 8px;
  align-items: center;
}

.agency-select {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.add-agency-section .btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
  width: auto;
  min-width: auto;
  flex-shrink: 0;
}

.additional-account-info {
  margin-top: 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.info-item {
  padding: 10px;
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
  font-size: 13px;
}

.download-section {
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 16px;
}

.download-section h4 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 14px;
}

.download-description {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.download-section .btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
  width: auto;
  min-width: auto;
}

.account-management-section {
  padding: 12px;
  background: #fff3cd;
  border-radius: 6px;
  border: 1px solid #E6A700;
}

.account-management-section.activate-section {
  background: #d4edda;
  border-color: #28a745;
}

.account-management-section h4 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 14px;
}

.account-management-content {
  text-align: center;
}

.account-management-content p {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.account-management-content .btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
  width: auto;
  min-width: auto;
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

.credentials-modal.large {
  max-width: 900px;
}

.credentials-description {
  color: #666;
  margin-bottom: 20px;
}

.credentials-section {
  margin-bottom: 20px;
}

.credential-item {
  margin-bottom: 20px;
}

.credential-item label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #333;
}

.credential-value {
  display: flex;
  gap: 8px;
  align-items: center;
}

.credential-input {
  flex: 1;
  padding: 10px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-family: monospace;
  font-size: 14px;
  background-color: #f8f9fa;
}

.btn-copy {
  padding: 10px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-copy:hover {
  background: #0056b3;
}

.generated-emails-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid #ddd;
}

.generated-emails-section h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
}

.email-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  background: #f8f9fa;
}

.email-header h4 {
  margin: 0 0 12px 0;
  color: #007bff;
}

.email-content {
  margin-bottom: 12px;
}

.email-field {
  margin-bottom: 12px;
}

.email-field label {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
  font-size: 13px;
  color: #666;
}

.email-value {
  font-size: 14px;
  padding: 8px;
  background: white;
  border-radius: 4px;
  border: 1px solid #ddd;
}

.email-body {
  font-size: 13px;
  padding: 12px;
  background: white;
  border-radius: 4px;
  border: 1px solid #ddd;
  white-space: pre-wrap;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  max-height: 300px;
  overflow-y: auto;
}

.email-actions {
  display: flex;
  justify-content: flex-end;
}

.credentials-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.supervisors-section {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.supervisors-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.supervisor-item {
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.supervisor-name {
  margin-bottom: 8px;
  font-size: 15px;
  color: var(--text-primary);
}

.supervisor-agency {
  color: var(--text-secondary);
  font-weight: normal;
  font-size: 13px;
}

.supervisor-contact {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}
</style>

