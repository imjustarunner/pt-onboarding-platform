<template>
  <div class="container">
    <div class="page-header">
      <h1>User Management</h1>
      <div class="header-actions">
        <button v-if="!isSupervisor(user) && user?.role !== 'clinical_practice_assistant'" @click="showBulkAssignModal = true" class="btn btn-primary">Assign Documents</button>
        <button v-if="!isSupervisor(user) && user?.role !== 'clinical_practice_assistant'" @click="showCreateModal = true" class="btn btn-primary">Create New User</button>
        <button v-if="user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'support'" @click="showSupervisorsModal = true" class="btn btn-secondary">Supervisors</button>
      </div>
    </div>
    
    <div v-if="loading" class="loading">Loading users...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else>
      <div class="table-controls">
        <div class="sort-controls">
          <label for="agencySort">Filter by Agency:</label>
          <select id="agencySort" v-model="agencySort" @change="applySorting">
            <option value="">All Agencies</option>
            <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
              {{ agency.name }}
            </option>
          </select>
        </div>
        <div class="sort-controls">
          <label for="statusSort">Filter by Status:</label>
          <select id="statusSort" v-model="statusSort" @change="applySorting">
            <option value="">All</option>
            <option value="PENDING_SETUP">Pending Setup</option>
            <option value="PREHIRE_OPEN">Pre-Hire</option>
            <option value="PREHIRE_REVIEW">Ready for Review</option>
            <option value="ONBOARDING">Onboarding</option>
            <option value="ACTIVE_EMPLOYEE">Active Employee</option>
            <option value="TERMINATED_PENDING">Terminated (Grace Period)</option>
            <option value="ARCHIVED">Archived</option>
            <!-- Legacy statuses for backward compatibility -->
            <option value="pending">Pre-Hire (Legacy)</option>
            <option value="ready_for_review">Ready for Review (Legacy)</option>
            <option value="active">Active (Legacy)</option>
            <option value="completed">Completed (Legacy)</option>
            <option value="terminated">Terminated (Legacy)</option>
          </select>
        </div>
      </div>
      <div class="users-table">
        <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Agency</th>
            <th>Role</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in sortedUsers" :key="user.id">
            <td>{{ user.first_name }} {{ user.last_name }}</td>
            <td>{{ user.email }}</td>
            <td>{{ user.agencies || 'No Agency' }}</td>
            <td>
              <span :class="['badge', user.role === 'admin' ? 'badge-success' : 'badge-info']">
                {{ formatRole(user.role) }}
              </span>
            </td>
            <td>
              <span :class="['badge', getStatusBadgeClassWrapper(user.status, user.is_active)]">
                {{ getStatusLabelWrapper(user.status, user.is_active) }}
              </span>
            </td>
            <td>{{ formatDate(user.created_at) }}</td>
            <td class="actions-cell">
              <div class="action-buttons">
                <router-link :to="`/admin/users/${user.id}`" class="btn btn-primary btn-sm">View Profile</router-link>
                <button v-if="!isSupervisor(authStore.user) && authStore.user?.role !== 'clinical_practice_assistant'" @click="editUser(user)" class="btn btn-secondary btn-sm">Edit</button>
                <button 
                  v-if="(user.status === 'PREHIRE_OPEN' || user.status === 'pending') && !user.pending_access_locked && !isSupervisor(authStore.user) && authStore.user?.role !== 'clinical_practice_assistant'" 
                  @click="showPendingCompleteModal(user)" 
                  class="btn btn-success btn-sm"
                >
                  Mark Hiring Process Complete
                </button>
                <button 
                  v-if="(user.status === 'PREHIRE_REVIEW' || user.status === 'ready_for_review') && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support') && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)" 
                  @click="moveToActive(user)" 
                  class="btn btn-primary btn-sm"
                >
                  Mark as Reviewed and Activate
                </button>
                <button 
                  v-if="(user.status === 'PREHIRE_OPEN' || user.status === 'PREHIRE_REVIEW' || user.status === 'pending' || user.status === 'ready_for_review') && (canArchiveDelete || user.role === 'admin' || user.role === 'super_admin') && !isSupervisor(authStore.user) && authStore.user?.role !== 'clinical_practice_assistant'" 
                  @click="downloadAndWipeUserData(user)" 
                  class="btn btn-sm btn-danger"
                  title="Download completion summary and wipe training/document data"
                >
                  Download & Wipe Training/Docs
                </button>
                <button 
                  v-if="canArchiveDelete && !isSupervisor(authStore.user) && authStore.user?.role !== 'clinical_practice_assistant'" 
                  @click="archiveUser(user)" 
                  class="btn btn-warning btn-sm"
                >
                  Archive
                </button>
              </div>
            </td>
          </tr>
        </tbody>
        </table>
      </div>
    </div>
    
    <!-- Bulk Document Assignment Modal -->
    <BulkDocumentAssignmentDialog
      v-if="showBulkAssignModal"
      @close="showBulkAssignModal = false"
      @assigned="handleBulkAssigned"
    />

    <!-- Supervisors Modal -->
    <div v-if="showSupervisorsModal" class="modal-overlay" @click="showSupervisorsModal = false">
      <div class="modal-content large" @click.stop style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h2>Supervisors</h2>
          <button @click="showSupervisorsModal = false" class="btn btn-secondary">Close</button>
        </div>
        
        <!-- Agency Filter -->
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">Filter by Agency:</label>
          <select v-model="supervisorsAgencyFilter" @change="fetchSupervisorsList" style="padding: 8px; border: 1px solid var(--border); border-radius: 6px; min-width: 200px;">
            <option value="">All Agencies</option>
            <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
              {{ agency.name }}
            </option>
          </select>
        </div>
        
        <div v-if="supervisorsLoading" class="loading">Loading supervisors...</div>
        <div v-else-if="supervisorsError" class="error">{{ supervisorsError }}</div>
        <div v-else-if="supervisorsList.length === 0" class="empty-state">
          <p>No supervisors found.</p>
        </div>
        <div v-else class="supervisors-list">
          <div v-for="supervisor in supervisorsList" :key="supervisor.id" class="supervisor-item" style="border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px; background: white;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="flex: 1;">
                <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">
                  {{ supervisor.first_name }} {{ supervisor.last_name }}
                </h3>
                <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">{{ supervisor.email }}</p>
                <p v-if="supervisor.agencies" style="margin: 4px 0 0 0; color: var(--text-secondary); font-size: 12px;">
                  Agencies: {{ supervisor.agencies }}
                </p>
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <button 
                  @click="toggleSupervisorExpanded(supervisor.id)" 
                  class="btn btn-sm btn-secondary"
                  style="min-width: 100px;"
                >
                  {{ expandedSupervisors[supervisor.id] ? '▼ Hide' : '▶ Show' }} Supervisees
                </button>
                <button 
                  @click="openAddSuperviseeModal(supervisor)" 
                  class="btn btn-sm btn-primary"
                >
                  Add Supervisee
                </button>
              </div>
            </div>
            
            <!-- Expanded Supervisees List -->
            <div v-if="expandedSupervisors[supervisor.id]" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
              <div v-if="superviseesLoading[supervisor.id]" class="loading-small" style="padding: 12px; text-align: center; font-size: 14px;">
                Loading supervisees...
              </div>
              <div v-else-if="superviseesBySupervisor[supervisor.id] && superviseesBySupervisor[supervisor.id].length === 0" class="empty-state-small" style="padding: 12px; text-align: center; color: var(--text-secondary); font-size: 14px;">
                No supervisees assigned.
              </div>
              <div v-else class="supervisees-list" style="display: grid; gap: 8px;">
                <div 
                  v-for="assignment in superviseesBySupervisor[supervisor.id]" 
                  :key="assignment.id"
                  style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid var(--border);"
                >
                  <div>
                    <strong>{{ assignment.supervisee_first_name }} {{ assignment.supervisee_last_name }}</strong>
                    <br>
                    <small style="color: var(--text-secondary);">{{ assignment.supervisee_email }}</small>
                    <br>
                    <small style="color: var(--text-secondary); font-size: 11px;">Agency: {{ assignment.agency_name }}</small>
                  </div>
                  <router-link 
                    :to="`/admin/users/${assignment.supervisee_id}`" 
                    class="btn btn-sm btn-primary"
                    @click="showSupervisorsModal = false"
                  >
                    View Profile
                  </router-link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Add Supervisee Modal -->
    <div v-if="showAddSuperviseeModal && selectedSupervisor" class="modal-overlay" @click="showAddSuperviseeModal = false">
      <div class="modal-content" @click.stop style="max-width: 600px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h2>Add Supervisee to {{ selectedSupervisor.first_name }} {{ selectedSupervisor.last_name }}</h2>
          <button @click="showAddSuperviseeModal = false" class="btn btn-secondary">Close</button>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500;">Supervisee</label>
          <select v-model="newSuperviseeAssignment.superviseeId" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
            <option value="">Select a user...</option>
            <option v-for="user in availableSupervisees" :key="user.id" :value="user.id">
              {{ user.first_name }} {{ user.last_name }} ({{ user.email }})
            </option>
          </select>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500;">Agency</label>
          <select v-model="newSuperviseeAssignment.agencyId" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
            <option value="">Select an agency...</option>
            <option v-for="agency in availableAgenciesForAssignment" :key="agency.id" :value="agency.id">
              {{ agency.name }}
            </option>
          </select>
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <button @click="showAddSuperviseeModal = false" class="btn btn-secondary">Cancel</button>
          <button 
            @click="createSuperviseeAssignment" 
            class="btn btn-primary"
            :disabled="!newSuperviseeAssignment.superviseeId || !newSuperviseeAssignment.agencyId || creatingSuperviseeAssignment"
          >
            {{ creatingSuperviseeAssignment ? 'Creating...' : 'Create Assignment' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="(showCreateModal || editingUser) && !isSupervisor(authStore.user) && authStore.user?.role !== 'clinical_practice_assistant'" class="modal-overlay" @click="closeModal">
      <div class="modal-content large" @click.stop>
        <h2>{{ editingUser ? 'Edit User' : 'Create New User' }}</h2>
        
        <!-- Multi-step form for creating new users -->
        <div v-if="!editingUser" class="create-user-steps">
          <div class="step-indicator">
            <div :class="['step', currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : '']">
              <span class="step-number">1</span>
              <span class="step-label">User Information</span>
            </div>
            <div :class="['step', currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : '']">
              <span class="step-number">2</span>
              <span class="step-label">Agency & Package</span>
            </div>
          </div>
          
          <!-- Step 1: User Information -->
          <div v-if="currentStep === 1" class="step-content">
            <form @submit.prevent="nextStep">
              <div class="form-group">
                <label>Email (Optional)</label>
                <input
                  v-model="userForm.email"
                  type="email"
                />
                <small class="form-help">Optional - Work email will be set when user moves to active status</small>
              </div>
              <div class="form-group">
                <label>Personal Email (Optional)</label>
                <input
                  v-model="userForm.personalEmail"
                  type="email"
                />
                <small class="form-help">For communications, not used for login</small>
              </div>
              <div class="form-group">
                <label>First Name</label>
                <input v-model="userForm.firstName" type="text" />
              </div>
              <div class="form-group">
                <label>Last Name *</label>
                <input v-model="userForm.lastName" type="text" required />
              </div>
              <div class="form-group">
                <label>Personal Phone Number</label>
                <input v-model="userForm.personalPhone" type="tel" placeholder="(555) 123-4567" />
              </div>
              <div class="form-group">
                <label>Work Phone Number</label>
                <input v-model="userForm.workPhone" type="tel" placeholder="(555) 123-4567" />
              </div>
              <div class="form-group">
                <label>Work Phone Extension</label>
                <input v-model="userForm.workPhoneExtension" type="text" placeholder="1234" />
              </div>
              <div class="form-group">
                <label>Role *</label>
                <select v-model="userForm.role" required>
                  <option v-if="user?.role === 'super_admin'" value="super_admin">Super Admin</option>
                  <option v-if="user?.role === 'super_admin' || user?.role === 'admin'" value="admin">Admin</option>
                  <option v-if="user?.role === 'super_admin' || user?.role === 'admin'" value="support">Support</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="clinical_practice_assistant">Clinical Practice Assistant</option>
                  <option value="staff">Staff</option>
                  <option value="clinician">Clinician</option>
                  <option value="facilitator">Facilitator</option>
                  <option value="intern">Intern</option>
                </select>
                <small v-if="userForm.role === 'super_admin' && user?.role !== 'super_admin'" class="form-help">Only super admins can assign the super admin role</small>
                <small v-else-if="userForm.role === 'admin' && user?.role !== 'super_admin' && user?.role !== 'admin'" class="form-help">Only super admins and admins can assign the admin role</small>
                <small v-else-if="userForm.role === 'support' && user?.role !== 'super_admin' && user?.role !== 'admin'" class="form-help">Only super admins and admins can assign the support role</small>
              </div>
              <div class="modal-actions">
                <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
                <button type="submit" class="btn btn-primary">
                  Next: Agency & Package
                </button>
              </div>
            </form>
          </div>
          
          <!-- Step 2: Agency Assignment & Onboarding Package -->
          <div v-if="currentStep === 2" class="step-content">
            <form @submit.prevent="saveUser">
              <div class="form-group">
                <label>Assign to Agencies *</label>
                <div class="agency-selector">
                  <div v-for="agency in agencies" :key="agency.id" class="agency-checkbox">
                    <label>
                      <input
                        type="checkbox"
                        :value="agency.id"
                        v-model="userForm.agencyIds"
                      />
                      {{ agency.name }}
                    </label>
                  </div>
                </div>
                <small v-if="userForm.agencyIds.length === 0" class="form-help">Please select at least one agency</small>
              </div>
              
              <div class="form-group">
                <label>Assign Onboarding Package (Optional)</label>
                <select v-model="userForm.onboardingPackageId" class="form-select">
                  <option value="">No package (assign later)</option>
                  <option v-for="pkg in availablePackages" :key="pkg.id" :value="pkg.id">
                    {{ pkg.name }} {{ pkg.agency_id ? `(${getAgencyName(pkg.agency_id)})` : '(Platform)' }}
                  </option>
                </select>
                <small class="form-help">Select an onboarding package to automatically assign training focuses, modules, and documents</small>
              </div>
              
              <div v-if="userForm.onboardingPackageId && selectedPackage" class="package-preview">
                <h4>Package Preview:</h4>
                <p><strong>{{ selectedPackage.name }}</strong></p>
                <p v-if="selectedPackage.description">{{ selectedPackage.description }}</p>
                <div class="package-items">
                  <p v-if="selectedPackage.trainingFocuses && selectedPackage.trainingFocuses.length > 0">
                    <strong>Training Focuses:</strong> {{ selectedPackage.trainingFocuses.length }}
                  </p>
                  <p v-if="selectedPackage.modules && selectedPackage.modules.length > 0">
                    <strong>Modules:</strong> {{ selectedPackage.modules.length }}
                  </p>
                  <p v-if="selectedPackage.documents && selectedPackage.documents.length > 0">
                    <strong>Documents:</strong> {{ selectedPackage.documents.length }}
                  </p>
                </div>
              </div>
              
              <div class="modal-actions">
                <button type="button" @click="currentStep = 1" class="btn btn-secondary">Back</button>
                <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
                <button 
                  type="submit" 
                  class="btn btn-primary" 
                  :disabled="saving || userForm.agencyIds.length === 0"
                  :title="userForm.agencyIds.length === 0 ? 'Please select at least one agency' : ''"
                >
                  {{ saving ? 'Creating...' : 'Create User' }}
                </button>
              </div>
              <div v-if="userForm.agencyIds.length === 0" class="form-error" style="margin-top: 10px; color: #dc3545;">
                ⚠️ Please select at least one agency to continue
              </div>
            </form>
          </div>
        </div>
        
        <!-- Edit form (single step) -->
        <form v-else @submit.prevent="saveUser">
          <div class="form-group">
            <label>Email *</label>
            <input
              v-model="userForm.email"
              type="email"
              required
              disabled
            />
          </div>
          <div class="form-group">
            <label>Password (leave blank to keep current)</label>
            <input
              v-model="userForm.password"
              type="password"
              minlength="6"
            />
          </div>
          <div class="form-group">
            <label>First Name</label>
            <input v-model="userForm.firstName" type="text" />
          </div>
          <div class="form-group">
            <label>Last Name</label>
            <input v-model="userForm.lastName" type="text" />
          </div>
          <div class="form-group">
            <label>Phone Number</label>
            <input v-model="userForm.personalPhone" type="tel" placeholder="(555) 123-4567" />
            <small class="form-help">Personal phone number</small>
          </div>
          <div class="form-group">
            <label>Work Phone Number</label>
            <input v-model="userForm.workPhone" type="tel" placeholder="(555) 123-4567" />
          </div>
          <div class="form-group">
            <label>Work Phone Extension</label>
            <input v-model="userForm.workPhoneExtension" type="text" placeholder="1234" />
          </div>
          <div class="form-group">
            <label>Role *</label>
            <select v-model="userForm.role" required>
              <option v-if="user?.role === 'super_admin'" value="super_admin">Super Admin</option>
              <option v-if="user?.role === 'super_admin' || user?.role === 'admin'" value="admin">Admin</option>
              <option v-if="user?.role === 'super_admin' || user?.role === 'admin'" value="support">Support</option>
              <option value="supervisor">Supervisor</option>
              <option value="clinical_practice_assistant">Clinical Practice Assistant</option>
              <option value="staff">Staff</option>
              <option value="clinician">Clinician</option>
              <option value="facilitator">Facilitator</option>
              <option value="intern">Intern</option>
            </select>
            <small v-if="userForm.role === 'super_admin' && user?.role !== 'super_admin'" class="form-help">Only super admins can assign the super admin role</small>
            <small v-else-if="userForm.role === 'admin' && user?.role !== 'super_admin' && user?.role !== 'admin'" class="form-help">Only super admins and admins can assign the admin role</small>
            <small v-else-if="userForm.role === 'support' && user?.role !== 'super_admin' && user?.role !== 'admin'" class="form-help">Only super admins and admins can assign the support role</small>
          </div>
          <div v-if="userForm.role === 'admin' || userForm.role === 'super_admin' || userForm.role === 'clinical_practice_assistant'" class="form-group">
            <label class="toggle-label">
              <span>Supervisor Privileges</span>
              <div class="toggle-switch">
                <input 
                  type="checkbox" 
                  v-model="userForm.hasSupervisorPrivileges"
                  id="supervisor-privileges-toggle-create"
                />
                <span class="slider"></span>
              </div>
            </label>
            <small class="form-help">Allows this user to be assigned as a supervisor while maintaining their primary role</small>
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- User Credentials Modal -->
    <div v-if="showCredentialsModal" class="modal-overlay" @click="closeCredentialsModal">
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
            <small v-if="!userCredentials.temporaryPassword">Work email will be set when user moves to active status</small>
          </div>
          
          <!-- Temporary Password - Only shown for active users, not pending users -->
          <div v-if="userCredentials.temporaryPassword" class="credential-item">
            <label>Temporary Password:</label>
            <div class="credential-value">
              <input type="text" :value="userCredentials.temporaryPassword" readonly class="credential-input" ref="passwordInput" />
              <button @click="copyToClipboard('password')" class="btn-copy">Copy</button>
            </div>
            <small>Expires in 48 hours</small>
          </div>
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
    
    <!-- Duplicate Name Modal -->
    <div v-if="showDuplicateNameModal" class="modal-overlay" @click="showDuplicateNameModal = false">
      <div class="modal-content large" @click.stop>
        <h2>User with Same Name Found</h2>
        <p>A user with the name <strong>{{ pendingUserData?.firstName }} {{ pendingUserData?.lastName }}</strong> already exists in the system.</p>
        
        <div class="duplicate-users-list">
          <h3>Existing Users:</h3>
          <div v-for="duplicate in duplicateUsers" :key="duplicate.id" class="duplicate-user-card">
            <div class="user-info">
              <p><strong>{{ duplicate.firstName }} {{ duplicate.lastName }}</strong></p>
              <p>Email: {{ duplicate.email }}</p>
              <p v-if="duplicate.personalEmail">Personal Email: {{ duplicate.personalEmail }}</p>
              <p>Role: {{ duplicate.role }}</p>
              <p>Status: {{ duplicate.status }}</p>
              <p>Agencies: {{ duplicate.agencyNames || 'No agencies' }}</p>
            </div>
            <div class="user-actions">
              <router-link 
                :to="`/admin/users/${duplicate.id}`" 
                class="btn btn-primary btn-sm"
                @click="showDuplicateNameModal = false"
              >
                View Profile
              </router-link>
              <div v-if="!canViewUser(duplicate)" class="contact-message">
                <p class="warning-text">⚠️ This user belongs to another organization. Please contact that organization to proceed.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-actions">
          <button @click="proceedWithCreation" class="btn btn-primary">
            Create New User Anyway
          </button>
          <button @click="cancelCreation" class="btn btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
    
    <!-- Mark Hiring Process Complete Confirmation Modal -->
    <div v-if="showPendingCompleteConfirmModal" class="modal-overlay" @click="showPendingCompleteConfirmModal = false">
      <div class="modal-content" @click.stop>
        <h2>Mark Hiring Process Complete</h2>
        <p v-if="selectedUserForPendingComplete">
          Are you ready to mark <strong>{{ selectedUserForPendingComplete.first_name }} {{ selectedUserForPendingComplete.last_name }}</strong> as active and initiate the onboarding process?
        </p>
        <p class="warning-text" style="margin-top: 16px; padding: 12px; background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 4px;">
          <strong>Note:</strong> This action should only be taken if the user has completed all their pre-hire tasks and has not already marked themselves as complete. This will change their status to "Ready for Review".
        </p>
        <div class="modal-actions">
          <button @click="showPendingCompleteConfirmModal = false" class="btn btn-secondary">Cancel</button>
          <button @click="markPendingComplete" class="btn btn-primary">Yes, Mark as Complete</button>
        </div>
      </div>
    </div>
    
    <!-- Move to Active Modal -->
    <div v-if="showMoveToActiveModal" class="modal-overlay" @click="showMoveToActiveModal = false">
      <div class="modal-content" @click.stop>
        <h2>Mark as Reviewed and Activate</h2>
        <p>Enter the work email that will be used as the username for {{ selectedUserForActivation?.first_name }} {{ selectedUserForActivation?.last_name }}:</p>
        <div class="form-group">
          <label>Work Email (Username) *</label>
          <input
            v-model="workEmailInput"
            type="email"
            required
            placeholder="user@example.com"
            class="form-input"
          />
          <small class="form-help">This email will be used as the username for login</small>
        </div>
        <div class="form-group">
          <label>Personal Email (Optional)</label>
          <input
            v-model="personalEmailInput"
            type="email"
            placeholder="personal@example.com"
            class="form-input"
          />
          <small class="form-help">Personal email for storage purposes only</small>
        </div>
        <div class="form-group">
          <label>Email Template</label>
          <select
            v-model="selectedTemplateId"
            class="form-input"
          >
            <option value="">Use Default Template</option>
            <option v-for="template in welcomeTemplates" :key="template.id" :value="template.id">
              {{ template.name }} {{ getTemplateScopeLabel(template) }}
            </option>
          </select>
          <small class="form-help">Select a welcome email template to use, or leave as default</small>
        </div>
        <div class="modal-actions">
          <button @click="showMoveToActiveModal = false" class="btn btn-secondary">Cancel</button>
          <button @click="confirmMoveToActive" class="btn btn-primary" :disabled="moveToActiveLoading || !workEmailInput.trim()">
            {{ moveToActiveLoading ? 'Processing...' : 'Mark as Reviewed and Activate' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { isSupervisor } from '../../utils/helpers.js';
import { getStatusLabel, getStatusBadgeClass } from '../../utils/statusUtils.js';
import BulkDocumentAssignmentDialog from '../../components/documents/BulkDocumentAssignmentDialog.vue';

const router = useRouter();
const authStore = useAuthStore();
const user = computed(() => authStore.user);
const canArchiveDelete = computed(() => {
  const role = authStore.user?.role;
  return role === 'admin' || role === 'super_admin';
});

// Supervisors modal state
const showSupervisorsModal = ref(false);
const supervisorsList = ref([]);
const supervisorsLoading = ref(false);
const supervisorsError = ref('');
const supervisorsAgencyFilter = ref('');
const expandedSupervisors = ref({});
const superviseesBySupervisor = ref({});
const superviseesLoading = ref({});

// Add Supervisee modal state
const showAddSuperviseeModal = ref(false);
const selectedSupervisor = ref(null);
const availableSupervisees = ref([]);
const availableAgenciesForAssignment = ref([]);
const creatingSuperviseeAssignment = ref(false);
const newSuperviseeAssignment = ref({
  superviseeId: '',
  agencyId: ''
});

const users = ref([]);
const agencies = ref([]);
const loading = ref(true);
const error = ref('');
const showCreateModal = ref(false);
const showBulkAssignModal = ref(false);
const editingUser = ref(null);
const saving = ref(false);
const statusSort = ref('');
const agencySort = ref('');

const currentStep = ref(1);
const availablePackages = ref([]);
const selectedPackage = ref(null);

const userForm = ref({
  email: '',
  personalEmail: '',
  password: '',
  firstName: '',
  lastName: '',
  phoneNumber: '',
  personalPhone: '',
  workPhone: '',
  workPhoneExtension: '',
  role: 'clinician',
  hasSupervisorPrivileges: false,
  agencyIds: [],
  onboardingPackageId: ''
});

const showCredentialsModal = ref(false);
const userCredentials = ref({
  token: '',
  tokenLink: '',
  username: '',
  temporaryPassword: '',
  generatedEmails: []
});

const showDuplicateNameModal = ref(false);
const duplicateUsers = ref([]);
const pendingUserData = ref(null);
const tokenInput = ref(null);
const usernameInput = ref(null);
const passwordInput = ref(null);

const fetchUsers = async () => {
  try {
    loading.value = true;
    const response = await api.get('/users');
    users.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load users';
  } finally {
    loading.value = false;
  }
};

const fetchAgencies = async () => {
  try {
    const response = await api.get('/agencies');
    agencies.value = response.data;
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

const fetchPackages = async () => {
  try {
    const response = await api.get('/onboarding-packages');
    availablePackages.value = response.data.filter(pkg => pkg.is_active !== false);
  } catch (err) {
    console.error('Failed to load packages:', err);
    availablePackages.value = [];
  }
};

const getAgencyName = (agencyId) => {
  const agency = agencies.value.find(a => a.id === agencyId);
  return agency ? agency.name : 'Unknown';
};

const nextStep = () => {
  if (currentStep.value === 1) {
    // Validate step 1 - lastName is required, email is optional
    if (!userForm.value.lastName || !userForm.value.role) {
      error.value = 'Please fill in all required fields (Last Name and Role)';
      return;
    }
    currentStep.value = 2;
    // Fetch packages when moving to step 2
    fetchPackages();
  }
};

watch(() => userForm.value.onboardingPackageId, async (newPackageId) => {
  if (newPackageId) {
    try {
      const response = await api.get(`/onboarding-packages/${newPackageId}`);
      selectedPackage.value = response.data;
    } catch (err) {
      console.error('Failed to load package details:', err);
      selectedPackage.value = null;
    }
  } else {
    selectedPackage.value = null;
  }
});

const editUser = (user) => {
  editingUser.value = user;
  userForm.value = {
    email: user.email,
    password: '',
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    phoneNumber: user.phone_number || '',
    personalPhone: user.personal_phone || '',
    workPhone: user.work_phone || '',
    workPhoneExtension: user.work_phone_extension || '',
    role: user.role,
    hasSupervisorPrivileges: user.has_supervisor_privileges === true || user.has_supervisor_privileges === 1 || user.has_supervisor_privileges === '1' || false,
    agencyIds: [],
    onboardingPackageId: ''
  };
};

const saveUser = async () => {
  let createData = null; // Declare in broader scope for error handling
  try {
    // Validate before submitting (for new users)
    if (!editingUser.value) {
      // Creating new user - validate required fields
      if (!userForm.value.lastName || !userForm.value.lastName.trim()) {
        error.value = 'Last name is required';
        saving.value = false;
        alert('Please enter a last name');
        return;
      }
      if (!userForm.value.role) {
        error.value = 'Role is required';
        saving.value = false;
        alert('Please select a role');
        return;
      }
      if (!userForm.value.agencyIds || userForm.value.agencyIds.length === 0) {
        error.value = 'Please select at least one agency';
        saving.value = false;
        alert('Please select at least one agency');
        return;
      }
    }
    
    saving.value = true;
    error.value = ''; // Clear any previous errors
    
    if (editingUser.value) {
      // Update user
      const updateData = {
        firstName: userForm.value.firstName,
        lastName: userForm.value.lastName,
        phoneNumber: userForm.value.phoneNumber,
        personalPhone: userForm.value.personalPhone,
        workPhone: userForm.value.workPhone,
        workPhoneExtension: userForm.value.workPhoneExtension,
        role: userForm.value.role
      };
      
      // Include supervisor privileges if user has eligible role
      if (userForm.value.role === 'admin' || userForm.value.role === 'super_admin' || userForm.value.role === 'clinical_practice_assistant') {
        updateData.hasSupervisorPrivileges = Boolean(userForm.value.hasSupervisorPrivileges);
      }
      if (userForm.value.password) {
        updateData.password = userForm.value.password;
      }
      await api.put(`/users/${editingUser.value.id}`, updateData);
      closeModal();
      fetchUsers();
    } else {
      // Create user (password is auto-generated, not sent)
      createData = {
        lastName: userForm.value.lastName?.trim() || '',
        role: userForm.value.role || 'clinician',
        agencyIds: userForm.value.agencyIds && userForm.value.agencyIds.length > 0 
          ? userForm.value.agencyIds.map(id => parseInt(id)).filter(id => !isNaN(id))
          : []
      };
      
      // Only include firstName if it has a value
      if (userForm.value.firstName && userForm.value.firstName.trim()) {
        createData.firstName = userForm.value.firstName.trim();
      }
      
      // Only include phoneNumber if it has a value (for backward compatibility)
      if (userForm.value.phoneNumber && userForm.value.phoneNumber.trim()) {
        createData.phoneNumber = userForm.value.phoneNumber.trim();
      }
      
      // Include new phone fields if they have values
      if (userForm.value.personalPhone && userForm.value.personalPhone.trim()) {
        createData.personalPhone = userForm.value.personalPhone.trim();
      }
      if (userForm.value.workPhone && userForm.value.workPhone.trim()) {
        createData.workPhone = userForm.value.workPhone.trim();
      }
      if (userForm.value.workPhoneExtension && userForm.value.workPhoneExtension.trim()) {
        createData.workPhoneExtension = userForm.value.workPhoneExtension.trim();
      }
      
      // Include supervisor privileges if user has eligible role
      if (userForm.value.role === 'admin' || userForm.value.role === 'super_admin' || userForm.value.role === 'clinical_practice_assistant') {
        createData.hasSupervisorPrivileges = Boolean(userForm.value.hasSupervisorPrivileges);
      }
      
      // Only include email fields if they have values
      if (userForm.value.email && userForm.value.email.trim()) {
        createData.email = userForm.value.email.trim();
      }
      if (userForm.value.personalEmail && userForm.value.personalEmail.trim()) {
        createData.personalEmail = userForm.value.personalEmail.trim();
      }
      
      console.log('Creating user with data:', createData);
      console.log('Form values:', {
        lastName: userForm.value.lastName,
        role: userForm.value.role,
        agencyIds: userForm.value.agencyIds,
        firstName: userForm.value.firstName
      });
      // Store pending user data in case we need to retry after duplicate check
      pendingUserData.value = createData;
      const response = await api.post('/auth/register', createData);
      const newUserId = response.data.user.id;
      
      // Assign onboarding package if selected
      if (userForm.value.onboardingPackageId && userForm.value.agencyIds.length > 0) {
        try {
          // Use the first selected agency for package assignment
          const primaryAgencyId = parseInt(userForm.value.agencyIds[0]);
          const packageId = parseInt(userForm.value.onboardingPackageId);
          
          if (isNaN(primaryAgencyId) || isNaN(packageId) || isNaN(newUserId)) {
            throw new Error('Invalid ID format');
          }
          
          const assignData = {
            userIds: [parseInt(newUserId)],
            agencyId: primaryAgencyId
          };
          
          console.log('Assigning package:', { packageId, assignData });
          await api.post(`/onboarding-packages/${packageId}/assign`, assignData);
          console.log('Package assigned successfully');
        } catch (pkgErr) {
          console.error('Failed to assign onboarding package:', pkgErr);
          console.error('Error response:', pkgErr.response?.data);
          // Don't fail user creation if package assignment fails
          alert('User created successfully, but failed to assign onboarding package. You can assign it manually later.');
        }
      }
      
      // Show credentials modal with generated email
      // For pending users, no temporary password is generated
      userCredentials.value = {
        token: response.data.passwordlessToken,
        tokenLink: response.data.passwordlessTokenLink,
        username: userForm.value.email || 'N/A (Work email will be set when moved to active)',
        temporaryPassword: null, // No temp password for pending users
        generatedEmails: response.data.generatedEmails || []
      };
      
      closeModal();
      showCredentialsModal.value = true;
      fetchUsers();
    }
  } catch (err) {
    console.error('Error creating user:', err);
    console.error('Error response:', err.response?.data);
    console.error('Full error response:', JSON.stringify(err.response?.data, null, 2));
    if (createData) {
      console.error('Request data sent:', createData);
    }
    
    // Handle duplicate name error
    if (err.response?.status === 409 && err.response?.data?.error?.code === 'DUPLICATE_NAME') {
      const duplicates = err.response.data.error.potentialDuplicates || [];
      showDuplicateNameModal.value = true;
      duplicateUsers.value = duplicates;
      saving.value = false;
      return;
    }
    
    const errorMessage = err.response?.data?.error?.message || 'Failed to save user';
    const validationErrors = err.response?.data?.error?.errors;
    if (validationErrors && Array.isArray(validationErrors) && validationErrors.length > 0) {
      const errorDetails = validationErrors.map(e => {
        const param = e.param || e.path || 'unknown';
        const msg = e.msg || e.message || 'validation error';
        const value = e.value !== undefined ? ` (value: ${JSON.stringify(e.value)})` : '';
        return `${param}: ${msg}${value}`;
      }).join('\n');
      error.value = errorMessage + '\n' + errorDetails;
      alert(errorMessage + '\n\nValidation errors:\n' + errorDetails);
    } else {
      const fullError = err.response?.data ? JSON.stringify(err.response.data, null, 2) : '';
      error.value = errorMessage;
      alert(errorMessage + (fullError ? '\n\n' + fullError : ''));
    }
  } finally {
    saving.value = false;
  }
};

const handleBulkAssigned = () => {
  showBulkAssignModal.value = false;
};

const showPendingCompleteModal = (user) => {
  selectedUserForPendingComplete.value = user;
  showPendingCompleteConfirmModal.value = true;
};

const selectedUserForPendingComplete = ref(null);
const showPendingCompleteConfirmModal = ref(false);

const markPendingComplete = async () => {
  if (!selectedUserForPendingComplete.value) {
    return;
  }
  
  const user = selectedUserForPendingComplete.value;
  
  try {
    await api.post(`/users/${user.id}/pending/complete`);
    alert('Hiring process marked as complete. User status changed to "Ready for Review".');
    showPendingCompleteConfirmModal.value = false;
    selectedUserForPendingComplete.value = null;
    await fetchUsers();
  } catch (error) {
    alert(error.response?.data?.error?.message || 'Failed to mark hiring process as complete.');
  }
};

const showMoveToActiveModal = ref(false);
const selectedUserForActivation = ref(null);
const workEmailInput = ref('');
const personalEmailInput = ref('');
const selectedTemplateId = ref('');
const welcomeTemplates = ref([]);
const moveToActiveLoading = ref(false);

const getTemplateScopeLabel = (template) => {
  // Platform template: agency_id is null (with or without platform_branding_id)
  // If platform_branding_id exists, it's definitely platform
  // If agency_id is null but platform_branding_id is also null, it might still be platform (created before fix)
  if (!template.agency_id) {
    return '(Platform)';
  }
  // Agency template: has agency_id
  if (template.agency_id) {
    return `(${template.agency_name || 'Agency'})`;
  }
  // Fallback
  return '(Unknown Scope)';
};

const fetchWelcomeTemplates = async () => {
  try {
    // Fetch both user_welcome and welcome_active templates
    const [userWelcomeResponse, welcomeActiveResponse] = await Promise.all([
      api.get('/email-templates', { params: { templateType: 'user_welcome' } }),
      api.get('/email-templates', { params: { templateType: 'welcome_active' } })
    ]);
    
    // Combine both types, removing duplicates by ID
    const allTemplates = [
      ...(userWelcomeResponse.data || []),
      ...(welcomeActiveResponse.data || [])
    ];
    const uniqueTemplates = allTemplates.filter((template, index, self) =>
      index === self.findIndex(t => t.id === template.id)
    );
    
    // Sort: platform templates first (agency_id is null), then by name
    uniqueTemplates.sort((a, b) => {
      const aIsPlatform = !a.agency_id;
      const bIsPlatform = !b.agency_id;
      if (aIsPlatform && !bIsPlatform) return -1;
      if (!aIsPlatform && bIsPlatform) return 1;
      return a.name.localeCompare(b.name);
    });
    
    welcomeTemplates.value = uniqueTemplates;
    console.log('Fetched welcome templates:', uniqueTemplates.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      agency_id: t.agency_id,
      platform_branding_id: t.platform_branding_id,
      scope: getTemplateScopeLabel(t)
    })));
  } catch (error) {
    console.error('Error fetching welcome templates:', error);
    welcomeTemplates.value = [];
  }
};

const moveToActive = async (user) => {
  selectedUserForActivation.value = user;
  workEmailInput.value = user.work_email || '';
  personalEmailInput.value = user.personal_email || '';
  selectedTemplateId.value = '';
  fetchWelcomeTemplates();
  
  // First, download the completion summary
  try {
    const summaryResponse = await api.get(`/users/${user.id}/pending/completion-summary`, {
      responseType: 'blob'
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([summaryResponse.data]));
    const link = document.createElement('a');
    link.href = url;
    const filename = `completion-summary-${user.first_name}-${user.last_name}-${Date.now()}.pdf`;
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
};

const confirmMoveToActive = async () => {
  if (!workEmailInput.value || !workEmailInput.value.trim()) {
    alert('Work email is required');
    return;
  }
  
  try {
    moveToActiveLoading.value = true;
    const response = await api.post(`/users/${selectedUserForActivation.value.id}/move-to-active`, {
      workEmail: workEmailInput.value.trim(),
      personalEmail: personalEmailInput.value.trim() || null,
      templateId: selectedTemplateId.value || null
    });
    
    // Show credentials modal with generated credentials
    userCredentials.value = {
      token: response.data.credentials.passwordlessToken,
      tokenLink: response.data.credentials.passwordlessTokenLink,
      username: response.data.credentials.workEmail,
      temporaryPassword: response.data.credentials.temporaryPassword,
      generatedEmails: response.data.credentials.generatedEmail ? [{
        type: 'Welcome Active',
        subject: response.data.credentials.emailSubject || 'Your Account Credentials',
        body: response.data.credentials.generatedEmail,
        agencyName: selectedUserForActivation.value?.agencies?.[0]?.name || agencies.value.find(a => a.id === selectedUserForActivation.value?.agencyIds?.[0])?.name || 'Your Agency'
      }] : []
    };
    
    showMoveToActiveModal.value = false;
    selectedUserForActivation.value = null;
    workEmailInput.value = '';
    await fetchUsers();
    showCredentialsModal.value = true;
  } catch (error) {
    alert(error.response?.data?.error?.message || 'Failed to move user to active status.');
  } finally {
    moveToActiveLoading.value = false;
  }
};

const archiveUser = async (user) => {
  if (!confirm(`Are you sure you want to archive "${user.first_name} ${user.last_name}" (${user.email})? You can restore them from the Archive section in Settings.`)) {
    return;
  }
  
  try {
    await api.post(`/users/${user.id}/archive`);
    alert('User archived successfully');
    await fetchUsers();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to archive user');
  }
};

const downloadAndWipeUserData = async (user) => {
  const confirmMessage = `This will:\n1. Download the completion summary PDF\n2. Permanently delete all training and document data for ${user.first_name} ${user.last_name}\n\nNote: The user record and other information will be preserved.\n\nAre you sure you want to proceed?`;
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  try {
    // First, download the completion summary
    const response = await api.get(`/users/${user.id}/pending/completion-summary`, {
      responseType: 'blob'
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `completion-summary-${user.first_name}-${user.last_name}-${Date.now()}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    // Wait a moment for download to start, then confirm wipe
    setTimeout(async () => {
      const wipeConfirm = confirm(`Completion summary downloaded.\n\nProceed with wiping training and document data? This cannot be undone.`);
      
      if (!wipeConfirm) {
        return;
      }
      
      try {
        await api.delete(`/users/${user.id}/pending/wipe-data`);
        alert('Training and document data wiped successfully. User record preserved.');
        await fetchUsers();
      } catch (err) {
        alert(err.response?.data?.error?.message || 'Failed to wipe user data');
      }
    }, 500);
  } catch (error) {
    console.error('Error downloading completion summary:', error);
    alert(error.response?.data?.error?.message || 'Failed to download completion summary');
  }
};

const closeModal = () => {
  showCreateModal.value = false;
  editingUser.value = null;
  currentStep.value = 1;
  userForm.value = {
    email: '',
    personalEmail: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    personalPhone: '',
    workPhone: '',
    workPhoneExtension: '',
    role: 'clinician',
    agencyIds: [],
    onboardingPackageId: ''
  };
  selectedPackage.value = null;
};

const closeCredentialsModal = () => {
  showCredentialsModal.value = false;
  userCredentials.value = {
    token: '',
    tokenLink: '',
    username: '',
    temporaryPassword: '',
    generatedEmails: []
  };
};

const copyToClipboard = async (type) => {
  let text = '';
  if (type === 'tokenLink') {
    text = userCredentials.value.tokenLink || '';
  } else if (type === 'username') {
    text = userCredentials.value.username;
  } else if (type === 'password') {
    // Only copy if temporary password exists (not for pending users)
    if (!userCredentials.value.temporaryPassword) {
      return;
    }
    text = userCredentials.value.temporaryPassword;
  }
  
  try {
    await navigator.clipboard.writeText(text);
    // Could show a toast notification here
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
  // Only include temporary password if it exists (not for pending users)
  if (userCredentials.value.temporaryPassword) {
    parts.push(`Temporary Password: ${userCredentials.value.temporaryPassword}`);
  }
  
  const allText = parts.join('\n');
  
  try {
    await navigator.clipboard.writeText(allText);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

const formatRole = (role) => {
  const roleMap = {
    'super_admin': 'Super Admin',
    'admin': 'Admin',
    'support': 'Support',
    'supervisor': 'Supervisor',
    'clinical_practice_assistant': 'CPA',
    'staff': 'Staff',
    'clinician': 'Clinician',
    'facilitator': 'Facilitator',
    'intern': 'Intern'
  };
  return roleMap[role] || role;
};

const fetchSupervisorsList = async () => {
  try {
    supervisorsLoading.value = true;
    supervisorsError.value = '';
    
    const response = await api.get('/users');
    // Filter to supervisors using has_supervisor_privileges as source of truth
    let supervisors = response.data.filter(u => isSupervisor(u));
    
    // Filter by agency if selected
    if (supervisorsAgencyFilter.value) {
      const agencyId = parseInt(supervisorsAgencyFilter.value);
      supervisors = supervisors.filter(supervisor => {
        // Check if supervisor belongs to the selected agency
        if (supervisor.agency_ids) {
          const supervisorAgencyIds = typeof supervisor.agency_ids === 'string'
            ? supervisor.agency_ids.split(',').map(id => parseInt(id.trim()))
            : supervisor.agency_ids;
          return supervisorAgencyIds.includes(agencyId);
        }
        return false;
      });
    }
    
    supervisorsList.value = supervisors;
    
    // Pre-expand and fetch supervisees for all supervisors
    for (const supervisor of supervisors) {
      expandedSupervisors.value[supervisor.id] = false; // Start collapsed
      await fetchSuperviseesForSupervisor(supervisor.id);
    }
  } catch (err) {
    supervisorsError.value = err.response?.data?.error?.message || 'Failed to load supervisors';
    console.error('Error fetching supervisors:', err);
  } finally {
    supervisorsLoading.value = false;
  }
};

const fetchSuperviseesForSupervisor = async (supervisorId) => {
  try {
    superviseesLoading.value[supervisorId] = true;
    
    const params = {};
    if (supervisorsAgencyFilter.value) {
      params.agencyId = supervisorsAgencyFilter.value;
    }
    
    const response = await api.get(`/supervisor-assignments/supervisor/${supervisorId}`, { params });
    superviseesBySupervisor.value[supervisorId] = response.data || [];
  } catch (err) {
    console.error(`Error fetching supervisees for supervisor ${supervisorId}:`, err);
    superviseesBySupervisor.value[supervisorId] = [];
  } finally {
    superviseesLoading.value[supervisorId] = false;
  }
};

const toggleSupervisorExpanded = async (supervisorId) => {
  expandedSupervisors.value[supervisorId] = !expandedSupervisors.value[supervisorId];
  
  // Fetch supervisees if not already loaded
  if (expandedSupervisors.value[supervisorId] && !superviseesBySupervisor.value[supervisorId]) {
    await fetchSuperviseesForSupervisor(supervisorId);
  }
};

const openAddSuperviseeModal = async (supervisor) => {
  selectedSupervisor.value = supervisor;
  showAddSuperviseeModal.value = true;
  
  // Fetch available supervisees and agencies
  try {
    // Get supervisor's agencies
    const agenciesResponse = await api.get(`/users/${supervisor.id}/agencies`);
    availableAgenciesForAssignment.value = agenciesResponse.data || [];
    
    // Get all users that could be supervisees (staff, clinician, facilitator, intern)
    const usersResponse = await api.get('/users');
    let users = usersResponse.data.filter(u => 
      ['staff', 'clinician', 'facilitator', 'intern'].includes(u.role)
    );
    
    // Filter by supervisor's agencies
    if (availableAgenciesForAssignment.value.length > 0) {
      const agencyIds = availableAgenciesForAssignment.value.map(a => a.id);
      users = users.filter(user => {
        if (user.agency_ids) {
          const userAgencyIds = typeof user.agency_ids === 'string'
            ? user.agency_ids.split(',').map(id => parseInt(id.trim()))
            : user.agency_ids;
          return userAgencyIds.some(id => agencyIds.includes(id));
        }
        return false;
      });
    }
    
    availableSupervisees.value = users;
  } catch (err) {
    console.error('Error fetching data for add supervisee modal:', err);
    availableSupervisees.value = [];
    availableAgenciesForAssignment.value = [];
  }
};

const createSuperviseeAssignment = async () => {
  if (!newSuperviseeAssignment.value.superviseeId || !newSuperviseeAssignment.value.agencyId) {
    alert('Please select both a supervisee and an agency');
    return;
  }
  
  try {
    creatingSuperviseeAssignment.value = true;
    
    await api.post('/supervisor-assignments', {
      supervisorId: selectedSupervisor.value.id,
      superviseeId: parseInt(newSuperviseeAssignment.value.superviseeId),
      agencyId: parseInt(newSuperviseeAssignment.value.agencyId)
    });
    
    // Refresh the supervisees list for this supervisor
    await fetchSuperviseesForSupervisor(selectedSupervisor.value.id);
    
    // Reset form
    newSuperviseeAssignment.value = {
      superviseeId: '',
      agencyId: ''
    };
    
    showAddSuperviseeModal.value = false;
    alert('Assignment created successfully');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to create assignment');
  } finally {
    creatingSuperviseeAssignment.value = false;
  }
};

// Watch for modal opening to fetch supervisors
watch(showSupervisorsModal, (isOpen) => {
  if (isOpen) {
    fetchSupervisorsList();
  }
});

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString();
};

// Status label and badge class functions are now imported from statusUtils.js
// Keeping wrapper functions for backward compatibility with isActive parameter
const getStatusLabelWrapper = (status, isActive = true) => {
  // isActive is deprecated but kept for backward compatibility
  if (status === 'ARCHIVED') {
    return 'Archived';
  }
  return getStatusLabel(status);
};

const getStatusBadgeClassWrapper = (status, isActive = true) => {
  // isActive is deprecated but kept for backward compatibility
  return getStatusBadgeClass(status, isActive);
};

const sortedUsers = computed(() => {
  let filtered = users.value;
  
  // Filter by agency
  if (agencySort.value) {
    filtered = filtered.filter(user => {
      if (!user.agency_ids) return false;
      // Check if any of the user's agency IDs match the selected agency
      const userAgencyIds = user.agency_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      return userAgencyIds.includes(parseInt(agencySort.value));
    });
  }
  
  // Filter by status
  if (statusSort.value) {
    if (statusSort.value === 'inactive') {
      // Legacy inactive filter - map to ARCHIVED status
      filtered = filtered.filter(user => user.status === 'ARCHIVED');
    } else {
      filtered = filtered.filter(user => {
        return user.status === statusSort.value;
      });
    }
  }
  
  return filtered;
});

const applySorting = () => {
  // Sorting is handled by computed property
};

const canViewUser = (user) => {
  // Check if current user has access to any of the duplicate user's agencies
  if (!user.agencyIds || user.agencyIds.length === 0) return false;
  const currentUserAgencies = authStore.user?.agencies || [];
  const currentUserAgencyIds = currentUserAgencies.map(a => a.id);
  return user.agencyIds.some(id => currentUserAgencyIds.includes(id)) || authStore.user?.role === 'super_admin';
};

const navigateToUser = (userId) => {
  showDuplicateNameModal.value = false;
  router.push(`/admin/users/${userId}`);
};

const proceedWithCreation = async () => {
  if (!pendingUserData.value) return;
  
  showDuplicateNameModal.value = false;
  saving.value = true;
  
  try {
    // Retry the creation, bypassing the duplicate check by adding a flag
    const createDataWithFlag = { ...pendingUserData.value, bypassDuplicateCheck: true };
    const response = await api.post('/auth/register', createDataWithFlag);
    const newUserId = response.data.user.id;
    
    // Continue with package assignment and credentials display (same as before)
    if (userForm.value.onboardingPackageId && userForm.value.agencyIds.length > 0) {
      try {
        const primaryAgencyId = parseInt(userForm.value.agencyIds[0]);
        const packageId = parseInt(userForm.value.onboardingPackageId);
        
        if (!isNaN(primaryAgencyId) && !isNaN(packageId) && !isNaN(newUserId)) {
          const assignData = {
            userIds: [parseInt(newUserId)],
            agencyId: primaryAgencyId
          };
          await api.post(`/onboarding-packages/${packageId}/assign`, assignData);
        }
      } catch (pkgErr) {
        console.error('Failed to assign onboarding package:', pkgErr);
      }
    }
    
    userCredentials.value = {
      token: response.data.passwordlessToken,
      tokenLink: response.data.passwordlessTokenLink,
      username: pendingUserData.value.email || 'N/A (Work email will be set when moved to active)',
      temporaryPassword: null,
      generatedEmails: response.data.generatedEmails || []
    };
    
    closeModal();
    showCredentialsModal.value = true;
    fetchUsers();
    pendingUserData.value = null;
    duplicateUsers.value = [];
  } catch (err) {
    console.error('Error creating user:', err);
    alert(err.response?.data?.error?.message || 'Failed to create user');
  } finally {
    saving.value = false;
  }
};

const cancelCreation = () => {
  showDuplicateNameModal.value = false;
  duplicateUsers.value = [];
  pendingUserData.value = null;
};

onMounted(() => {
  fetchUsers();
  fetchAgencies();
  fetchPackages();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.page-header h1 {
  margin: 0;
  color: #2c3e50;
}

.table-controls {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-controls label {
  font-weight: 600;
  color: var(--text-primary, #2c3e50);
  white-space: nowrap;
}

.sort-controls select {
  padding: 8px 12px;
  border: 1px solid var(--border, #dee2e6);
  border-radius: 6px;
  font-size: 14px;
  min-width: 150px;
  background: white;
  cursor: pointer;
}

.sort-controls select:hover {
  border-color: var(--primary, #C69A2B);
}

.sort-controls select:focus {
  outline: none;
  border-color: var(--primary, #C69A2B);
  box-shadow: 0 0 0 2px rgba(198, 154, 43, 0.2);
}

.users-table {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background-color: #f8f9fa;
}

th, td {
  padding: 12px 8px;
  text-align: left;
  border-bottom: 1px solid #dee2e6;
}

.actions-cell {
  white-space: nowrap;
  width: 1%;
  padding: 8px 4px !important;
  max-width: 400px;
  overflow-x: auto;
  overflow-y: hidden;
}

.action-buttons {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  align-items: center;
  min-width: max-content;
}

.action-buttons .btn {
  white-space: nowrap;
  flex-shrink: 0;
  width: auto;
  min-width: auto;
}

/* Smooth scrolling for action buttons */
.actions-cell::-webkit-scrollbar {
  height: 6px;
}

.actions-cell::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.actions-cell::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

.actions-cell::-webkit-scrollbar-thumb:hover {
  background: #555;
}

th {
  font-weight: 600;
  color: #2c3e50;
}

.btn-sm {
  padding: 5px 10px;
  font-size: 14px;
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
  max-width: 500px;
  width: 90%;
}

.modal-content h2 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #2c3e50;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.credentials-modal.large {
  max-width: 900px;
}

.generated-emails-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.generated-emails-section h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
}

.email-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  background: var(--bg-secondary);
}

.email-header h4 {
  margin: 0 0 12px 0;
  color: var(--primary);
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
  color: var(--text-secondary);
}

.email-value {
  font-size: 14px;
  padding: 8px;
  background: white;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.email-body {
  font-size: 13px;
  padding: 12px;
  background: white;
  border-radius: 4px;
  border: 1px solid var(--border);
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

.credentials-modal {
  max-width: 600px;
}

.credentials-description {
  color: var(--text-secondary);
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
  color: var(--text-primary);
}

.credential-value {
  display: flex;
  gap: 8px;
  align-items: center;
}

.credential-input {
  flex: 1;
  padding: 10px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-family: monospace;
  font-size: 14px;
  background-color: #f8f9fa;
}

.btn-copy {
  padding: 10px 16px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
  transition: background-color 0.2s;
}

.btn-copy:hover {
  background: var(--primary-dark);
}

.credentials-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 2px solid var(--border);
}

.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
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

.btn-warning {
  background-color: #E6A700;
  color: white;
  border: none;
}

.btn-warning:hover {
  background-color: #cc9600;
}

/* Multi-step form styles */
.create-user-steps {
  margin-bottom: 24px;
}

.step-indicator {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border);
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
  flex: 1;
  max-width: 200px;
}

.step::after {
  content: '';
  position: absolute;
  top: 20px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: var(--border);
  z-index: 0;
}

.step:last-child::after {
  display: none;
}

.step.completed::after {
  background: var(--primary);
}

.step-number {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--border);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  position: relative;
  z-index: 1;
}

.step.active .step-number {
  background: var(--primary);
  color: white;
}

.step.completed .step-number {
  background: var(--primary);
  color: white;
}

.step-label {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}

.step.active .step-label {
  color: var(--primary);
  font-weight: 600;
}

.step-content {
  min-height: 300px;
}

.agency-selector {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  background: var(--bg-secondary, #f9fafb);
}

.agency-checkbox {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.agency-checkbox:last-child {
  border-bottom: none;
}

.agency-checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
}

.agency-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.package-preview {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.package-preview h4 {
  margin: 0 0 12px 0;
  color: var(--text-primary);
  font-size: 16px;
}

.package-preview p {
  margin: 8px 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.package-items {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.modal-content.large {
  max-width: 700px;
  max-height: 90vh;
  overflow-y: auto;
}

.duplicate-users-list {
  margin: 20px 0;
  max-height: 400px;
  overflow-y: auto;
}

.duplicate-users-list h3 {
  margin-bottom: 16px;
  font-size: 16px;
  color: #2c3e50;
}

.duplicate-user-card {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  background: #f8f9fa;
}

.duplicate-user-card .user-info {
  margin-bottom: 12px;
}

.duplicate-user-card .user-info p {
  margin: 4px 0;
  font-size: 14px;
}

.duplicate-user-card .user-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.contact-message {
  flex: 1;
}

.warning-text {
  color: #dc3545;
  font-size: 13px;
  margin: 0;
  font-weight: 500;
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
</style>

