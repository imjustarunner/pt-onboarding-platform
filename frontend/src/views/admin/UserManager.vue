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
      <div class="users-layout">
        <aside class="filters-sidebar">
          <div class="filter-section">
            <label for="userSearch" class="filter-label">Search</label>
            <input
              id="userSearch"
              v-model="userSearch"
              type="text"
              class="filter-input"
              placeholder="Name, email, agency, role, status, credential…"
              autocomplete="off"
            />
          </div>

          <div class="filter-section">
            <label for="agencySort" class="filter-label">Agency</label>
            <select id="agencySort" v-model="agencySort" class="filter-select">
              <option value="">All agencies</option>
              <option v-for="a in agencyOptions" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
            </select>
          </div>

          <div class="filter-section">
            <label for="organizationSort" class="filter-label">Organization</label>
            <input
              v-model="organizationSearch"
              type="text"
              class="filter-input"
              placeholder="Search organizations…"
              autocomplete="off"
              style="margin-bottom: 8px;"
            />
            <select
              id="organizationSort"
              v-model="organizationSort"
              class="filter-select"
              :disabled="organizationOptions.length === 0"
            >
              <option value="">All organizations</option>
              <option v-for="o in organizationOptions" :key="o.id" :value="String(o.id)">{{ o.name }}</option>
            </select>
            <div class="filter-help muted">Organizations are scoped by the selected agency.</div>
          </div>

          <div class="filter-section">
            <label for="statusSort" class="filter-label">Status</label>
            <select id="statusSort" v-model="statusSort" class="filter-select">
              <option value="">All</option>
              <option value="PROSPECTIVE">Prospective (Applicant)</option>
              <option value="PENDING_SETUP">Pending Setup</option>
              <option value="PREHIRE_OPEN">Pre-Hire</option>
              <option value="PREHIRE_REVIEW">Ready for Review</option>
              <option value="ONBOARDING">Onboarding</option>
              <option value="ACTIVE_EMPLOYEE">Active</option>
              <option value="TERMINATED_PENDING">Terminated (Grace Period)</option>
            </select>
          </div>

          <div class="filter-section">
            <div class="filter-label">Quick user type</div>
            <div class="type-filter-row">
              <button
                type="button"
                class="btn btn-secondary btn-sm type-filter-btn"
                :class="{ active: userTypeFilter === 'guardians' }"
                @click="toggleUserType('guardians')"
              >
                Show guardians
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm type-filter-btn"
                :class="{ active: userTypeFilter === 'supervisors' }"
                @click="toggleUserType('supervisors')"
              >
                Show supervisors
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm type-filter-btn"
                :class="{ active: userTypeFilter === 'staff' }"
                @click="toggleUserType('staff')"
              >
                Show staff
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm type-filter-btn"
                :class="{ active: userTypeFilter === 'providers' }"
                @click="toggleUserType('providers')"
              >
                Show providers
              </button>
              <button
                v-if="isSuperAdmin"
                type="button"
                class="btn btn-secondary btn-sm type-filter-btn"
                :class="{ active: userTypeFilter === 'super_admins' }"
                @click="toggleUserType('super_admins')"
              >
                Show super admins
              </button>
            </div>
          </div>

          <div class="filter-section advanced-filters">
            <div class="filter-label">More filters</div>
            <div class="filter-subsection">
              <label for="roleSort" class="filter-label">Role</label>
              <select id="roleSort" v-model="roleSort" class="filter-select">
                <option value="">All roles</option>
                <option value="provider">Provider</option>
                <option value="school_staff">School Staff</option>
                <option value="clinical_practice_assistant">Clinical Practice Assistant</option>
                <option value="client_guardian">Guardian</option>
                <option value="staff">Staff</option>
                <option value="support">Staff (Admin Tools)</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          </div>
        </aside>

        <div class="users-main">
          <div class="ai-query-card">
            <div class="ai-query-banner">
              <img :src="aiBannerSrc" alt="AI status" class="ai-query-banner-img" />
            </div>

            <div class="ai-query-body">
              <div class="ai-query-header">
                <div class="ai-query-title">
                  <img :src="aiIconSrc" alt="AI" class="ai-query-icon" />
                  <div>
                    <div class="ai-query-title-text">AI Search (Gemini-ready)</div>
                    <div class="ai-query-subtitle">Ask questions across all user info fields and get a copyable email list.</div>
                  </div>
                </div>

                <div class="ai-query-actions">
                  <button class="btn btn-secondary btn-sm" type="button" @click="clearAiQuery" :disabled="aiState === 'thinking'">
                    Clear
                  </button>
                  <button class="btn btn-primary btn-sm" type="button" @click="runAiQuery" :disabled="aiState === 'thinking' || !String(aiQueryText || '').trim()">
                    {{ aiState === 'thinking' ? 'Searching…' : 'Search' }}
                  </button>
                </div>
              </div>

              <div class="ai-query-input-row">
                <input
                  v-model="aiQueryText"
                  type="text"
                  class="ai-query-input"
                  placeholder="Type your query here… e.g. list all the people who mentioned that they are interested in hiking"
                  @keydown.enter.prevent="runAiQuery"
                />
              </div>

              <div class="ai-query-toggles">
                <label class="ai-query-toggle">
                  <input type="checkbox" v-model="aiActiveOnly" :disabled="aiState === 'thinking'" />
                  <span>Active only</span>
                </label>
                <label class="ai-query-toggle">
                  <input type="checkbox" v-model="aiProvidersOnly" :disabled="aiState === 'thinking'" />
                  <span>Providers only</span>
                </label>
              </div>

              <div v-if="aiState === 'thinking'" class="ai-query-status muted">Thinking… searching user info fields.</div>
              <div v-else-if="aiState === 'error'" class="ai-query-status error">{{ aiError || 'No results found.' }}</div>
              <div v-else-if="aiState === 'success'" class="ai-query-status success">
                Found {{ aiResults.length }} user{{ aiResults.length === 1 ? '' : 's' }}.
              </div>

              <div v-if="aiState === 'success' && aiResults.length" class="ai-query-results">
                <div class="ai-query-results-header">
                  <div class="ai-query-results-title">Results</div>
                  <div class="ai-query-results-meta muted">Showing up to 50 here. Use copy for the full list.</div>
                </div>

                <ul class="ai-query-results-list">
                  <li v-for="u in aiResults.slice(0, 50)" :key="u.id">
                    <router-link :to="`/admin/users/${u.id}`">
                      {{ u.first_name }} {{ u.last_name }}
                    </router-link>
                    <span class="muted"> — {{ u.email }}</span>
                  </li>
                </ul>

                <div class="ai-query-copy">
                  <label class="ai-query-copy-label">Semicolon-separated</label>
                  <textarea class="ai-query-copy-text" readonly :value="aiEmailsSemicolon" rows="3"></textarea>
                  <div class="ai-query-copy-actions">
                    <button class="btn btn-secondary btn-sm" type="button" @click="copyAiEmails" :disabled="!aiEmailsSemicolon">
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="users-table" :class="{ 'users-table--expanded': userTableExpanded }">
            <div class="users-table-toolbar">
              <button type="button" class="btn btn-secondary btn-sm" @click="userTableExpanded = !userTableExpanded">
                {{ userTableExpanded ? 'Collapse columns' : 'Expand columns' }}
              </button>
              <span class="muted users-table-toolbar-hint">
                When expanded, scroll horizontally to see all columns.
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th class="sortable" @click="toggleTableSort('name')">
                    Name <span class="sort-indicator">{{ sortIndicator('name') }}</span>
                  </th>
                  <th class="sortable col-email" @click="toggleTableSort('email')">
                    Email <span class="sort-indicator">{{ sortIndicator('email') }}</span>
                  </th>
                  <th class="sortable" @click="toggleTableSort('agency')">
                    Agency <span class="sort-indicator">{{ sortIndicator('agency') }}</span>
                  </th>
                  <th class="sortable" @click="toggleTableSort('role')">
                    Role <span class="sort-indicator">{{ sortIndicator('role') }}</span>
                  </th>
                  <th class="sortable col-credential" @click="toggleTableSort('credential')">
                    Credential <span class="sort-indicator">{{ sortIndicator('credential') }}</span>
                  </th>
                  <th class="sortable col-status" @click="toggleTableSort('status')">
                    Status <span class="sort-indicator">{{ sortIndicator('status') }}</span>
                  </th>
                  <th class="sortable col-created" @click="toggleTableSort('created')">
                    Created <span class="sort-indicator">{{ sortIndicator('created') }}</span>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in sortedUsers" :key="user.id">
            <td>
              <router-link :to="`/admin/users/${user.id}`" class="user-name-link">
                {{ user.first_name }} {{ user.last_name }}
              </router-link>
            </td>
            <td class="col-email">
              <span class="table-truncate" :title="String(user.email || '')">{{ user.email }}</span>
            </td>
            <td class="user-affiliations-cell">
              <div class="user-affiliations-inline">
                <span
                  class="user-affiliations-agencies table-truncate"
                  :title="userAgencyNames(user).length ? userAgencyNames(user).join(', ') : String(user.agencies || 'No Agency')"
                >
                  {{ userAgencySummary(user) }}
                </span>

                <div
                  v-if="userChildOrgs(user).length > 0"
                  class="user-affiliations-details-wrap"
                  @mouseenter="openUserAffiliationsPopover(Number(user.id))"
                  @mouseleave="closeUserAffiliationsPopover(Number(user.id))"
                >
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm user-affiliations-details-btn"
                    @click.prevent="toggleUserAffiliationsPopover(Number(user.id))"
                    :aria-expanded="isUserAffiliationsPopoverOpenFor(Number(user.id)) ? 'true' : 'false'"
                    :title="`Show schools / other orgs (${userChildOrgs(user).length})`"
                  >
                    Details
                    <span class="muted" style="font-weight: 800;">({{ userChildOrgs(user).length }})</span>
                  </button>

                  <div v-if="isUserAffiliationsPopoverOpenFor(Number(user.id))" class="user-affiliations-popover">
                    <div class="user-affiliations-popover-title">Schools &amp; other orgs</div>
                    <div
                      v-for="org in userChildOrgs(user)"
                      :key="org.id"
                      class="user-affiliations-popover-item"
                    >
                      <span class="user-affiliations-popover-item-name">
                        {{ org.name }}
                        <span v-if="org.organization_type" class="muted" style="font-size: 11px; font-weight: 800;">
                          ({{ org.organization_type }})
                        </span>
                      </span>
                    </div>
                    <div class="muted" style="font-size: 12px; margin-top: 8px;">
                      Tip: hover to peek, click to pin open.
                    </div>
                  </div>
                </div>
              </div>
            </td>
            <td>
              <span :class="['badge', user.role === 'admin' ? 'badge-success' : 'badge-info']">
                {{ formatRole(user.role) }}
              </span>
              <span
                v-if="(String(user.role || '').toLowerCase() === 'provider')"
                :class="['badge', availabilityBadgeClass(user)]"
                style="margin-left: 6px; font-size: 10px;"
                :title="availabilityBadgeTitle(user)"
              >
                {{ availabilityBadgeText(user) }}
              </span>
              <span
                v-if="canQuickToggleAvailability(user)"
                class="inline-availability-toggle"
                title="Global availability (provider can also toggle this themselves)."
              >
                <label class="mini-switch">
                  <input
                    type="checkbox"
                    :checked="user.provider_accepting_new_clients !== false"
                    :disabled="availabilitySavingId === user.id"
                    @change="toggleUserAvailability(user, $event.target.checked)"
                  />
                  <span class="mini-slider" />
                </label>
              </span>
              <span v-if="user.has_provider_access && (user.role === 'staff' || user.role === 'support')" class="badge badge-secondary" style="margin-left: 4px; font-size: 10px;">+Provider</span>
              <span v-if="user.has_staff_access && user.role === 'provider'" class="badge badge-secondary" style="margin-left: 4px; font-size: 10px;">+Staff</span>
            </td>
            <td class="muted col-credential">
              {{ user.provider_credential || '—' }}
            </td>
            <td class="col-status">
              <span :class="['badge', getStatusBadgeClassWrapper(user.status, user.is_active)]">
                {{ getStatusLabelWrapper(user.status, user.is_active) }}
              </span>
            </td>
            <td class="col-created">{{ formatDate(user.created_at) }}</td>
            <td class="actions-cell">
              <div class="action-buttons">
                <router-link :to="`/admin/users/${user.id}`" class="btn btn-primary btn-sm">View Profile</router-link>
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
            <option v-for="agency in agencyOptions" :key="agency.id" :value="agency.id">
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
              <span class="step-label">{{ step1Label }}</span>
            </div>
            <div :class="['step', currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : '']">
              <span class="step-number">2</span>
              <span class="step-label">{{ step2Label }}</span>
            </div>
          </div>
          
          <!-- Step 1: User Information -->
          <div v-if="currentStep === 1" class="step-content">
            <form @submit.prevent="nextStep">
              <div class="form-group">
                <label>Role *</label>
                <select v-model="userForm.role" required>
                  <option v-if="user?.role === 'super_admin'" value="super_admin">Super Admin</option>
                  <option v-if="user?.role === 'super_admin' || user?.role === 'admin'" value="admin">Admin</option>
                  <option v-if="user?.role === 'super_admin' || user?.role === 'admin'" value="support">Staff (Admin Tools)</option>
                  <option value="clinical_practice_assistant">Clinical Practice Assistant</option>
                  <option value="staff">Staff</option>
                  <option value="provider">Provider</option>
                  <option value="school_staff">School Staff</option>
                  <option value="client_guardian">Guardian</option>
                </select>
                <small v-if="userForm.role === 'client_guardian'" class="form-help">
                  Guardians are portal users (non-employee). They don't receive onboarding packages.
                </small>
                <small v-else-if="userForm.role === 'school_staff'" class="form-help">
                  School staff should be assigned to at least one school organization.
                </small>
                <small v-else-if="userForm.role === 'super_admin' && user?.role !== 'super_admin'" class="form-help">Only super admins can assign the super admin role</small>
                <small v-else-if="userForm.role === 'admin' && user?.role !== 'super_admin' && user?.role !== 'admin'" class="form-help">Only super admins and admins can assign the admin role</small>
                <small v-else-if="userForm.role === 'support' && user?.role !== 'super_admin' && user?.role !== 'admin'" class="form-help">Only super admins and admins can assign the staff role</small>
              </div>

              <div class="form-group">
                <label>Agency *</label>
                <select
                  v-if="shouldPickAgencyForUserCreate"
                  v-model="userForm.primaryAgencyId"
                  class="form-select"
                  required
                >
                  <option value="" disabled>Select an agency</option>
                  <option v-for="agency in parentAgenciesForUserCreate" :key="agency.id" :value="String(agency.id)">
                    {{ agency.name }}
                  </option>
                </select>
                <div v-else class="muted" style="padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;">
                  {{ parentAgenciesForUserCreate[0]?.name || 'Agency' }}
                </div>
                <small class="form-help">
                  {{ shouldPickAgencyForUserCreate ? agencyHelpText : 'This user will be created under your agency.' }}
                </small>
              </div>

              <div class="form-group" style="margin-top: 10px;">
                <label>{{ orgAssignmentLabel }}</label>
                <div v-if="!userForm.primaryAgencyId" class="muted">Select an agency above to view its organizations.</div>
                <div v-else>
                  <div v-if="affiliatedOrgsLoading" class="muted">Loading organizations…</div>
                  <div v-else-if="affiliatedOrgsError" class="muted" style="color:#dc3545;">{{ affiliatedOrgsError }}</div>
                  <div v-else-if="(affiliatedOrgsForCreateDisplay || []).length === 0" class="muted">{{ orgEmptyMessage }}</div>
                  <div v-else class="agency-selector" style="max-height: 180px; overflow:auto; border: 1px solid var(--border); border-radius: 8px; padding: 10px;">
                    <div v-for="org in affiliatedOrgsForCreateDisplay" :key="org.id" class="agency-checkbox" style="margin-bottom: 6px;">
                      <label style="display:flex; gap:10px; align-items:center;">
                        <input
                          type="checkbox"
                          :value="String(org.id)"
                          v-model="userForm.organizationIds"
                        />
                        <span style="flex:1;">
                          {{ org.name }}
                          <span v-if="org.organization_type" style="color: var(--text-secondary); font-size: 12px; margin-left: 6px;">
                            ({{ org.organization_type }})
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                  <small v-if="orgAssignmentRequired" class="form-help">
                    Required for this role.
                  </small>
                  <small v-else class="form-help">Optional: assign schools/programs now. You can add/remove assignments later from the user profile.</small>
                </div>
              </div>

              <div v-if="supportsEmployeeWorkflow" class="form-group">
                <label class="toggle-label">
                  <span>Create as Current Employee (Active User)</span>
                  <div class="toggle-switch">
                    <input
                      type="checkbox"
                      v-model="userForm.createAsCurrentEmployee"
                      id="create-current-employee-toggle-step1"
                    />
                    <span class="slider"></span>
                  </div>
                </label>
                <small class="form-help">
                  If enabled, we will create the user directly as <strong>ACTIVE</strong> and their <strong>Work Email</strong> will be their username/login.
                </small>
              </div>

              <div v-if="supportsEmployeeWorkflow && userForm.createAsCurrentEmployee" class="form-group">
                <label>Work Email *</label>
                <input
                  v-model="userForm.workEmail"
                  type="email"
                  required
                  placeholder="employee@company.com"
                />
                <small class="form-help">Required for current employees. This will be their username and login email.</small>
              </div>

              <div class="form-group">
                <label>{{ isGuardianRole ? 'Email *' : 'Email (Optional)' }}</label>
                <input
                  v-model="userForm.email"
                  type="email"
                  :required="isGuardianRole"
                  :disabled="supportsEmployeeWorkflow && userForm.createAsCurrentEmployee"
                />
                <small class="form-help">
                  {{ isGuardianRole ? 'Required for guardian login.' : 'Optional for onboarding users. If creating a current employee, this field is ignored (use Work Email).' }}
                </small>
              </div>
              <div class="form-group">
                <label>Personal Email (Optional)</label>
                <input
                  v-model="userForm.personalEmail"
                  type="email"
                  :disabled="supportsEmployeeWorkflow && userForm.createAsCurrentEmployee"
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

              <div v-if="['admin','support','staff'].includes(userForm.role)" class="form-group">
                <label class="toggle-label">
                  <span>Selectable as Provider</span>
                  <div class="toggle-switch">
                    <input
                      type="checkbox"
                      v-model="userForm.hasProviderAccess"
                      id="provider-access-toggle-create"
                    />
                    <span class="slider"></span>
                  </div>
                </label>
                <small class="form-help">Allows this Admin/Support/Staff user to be selected anywhere a Provider is selected (scheduling, assignments, etc.).</small>
              </div>
              <div class="modal-actions">
                <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
                <button type="submit" class="btn btn-primary">
                  Next: {{ step2Label }}
                </button>
              </div>
            </form>
          </div>
          
          <!-- Step 2: Agency Assignment & Onboarding Package -->
          <div v-if="currentStep === 2" class="step-content">
            <form @submit.prevent="saveUser">
              <div class="form-group">
                <label>Role</label>
                <div class="muted" style="padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;">
                  {{ formatRole(userForm.role) }}
                </div>
              </div>
              <div class="form-group">
                <label>Agency</label>
                <div class="muted" style="padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;">
                  {{ getAgencyName(parseInt(userForm.primaryAgencyId || '0', 10)) }}
                </div>
              </div>
              
              <div v-if="supportsEmployeeWorkflow" class="form-group">
                <label class="toggle-label">
                  <span>Create as Current Employee (Active User)</span>
                  <div class="toggle-switch">
                    <input 
                      type="checkbox" 
                      v-model="userForm.createAsCurrentEmployee"
                      id="create-current-employee-toggle"
                    />
                    <span class="slider"></span>
                  </div>
                </label>
                <small class="form-help">Creates user directly as ACTIVE, bypassing pre-hire and onboarding.</small>
              </div>
              
              <div v-if="supportsEmployeeWorkflow && userForm.createAsCurrentEmployee" class="form-group">
                <label>Work Email *</label>
                <input
                  v-model="userForm.workEmail"
                  type="email"
                  required
                  placeholder="employee@company.com"
                />
                <small class="form-help">Required for current employees. This will be their username and login email.</small>
              </div>
              
              <div v-if="supportsEmployeeWorkflow && !userForm.createAsCurrentEmployee" class="form-group">
                <label>Assign Onboarding Package (Optional)</label>
                <select v-model="userForm.onboardingPackageId" class="form-select">
                  <option value="">No package (assign later)</option>
                  <option v-for="pkg in availablePackages" :key="pkg.id" :value="pkg.id">
                    {{ pkg.name }} {{ pkg.agency_id ? `(${getAgencyName(pkg.agency_id)})` : '(Platform)' }}
                  </option>
                </select>
                <small class="form-help">Select an onboarding package to automatically assign training focuses, modules, and documents</small>
              </div>
              
              <div v-if="supportsEmployeeWorkflow && userForm.onboardingPackageId && selectedPackage && !userForm.createAsCurrentEmployee" class="package-preview">
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

              <div v-if="!supportsEmployeeWorkflow" class="muted" style="margin-top: 10px;">
                Guardians do not use onboarding packages. This will create a portal account under the selected agency/org context.
              </div>
              
              <div class="modal-actions">
                <button type="button" @click="currentStep = 1" class="btn btn-secondary">Back</button>
                <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
                <button 
                  type="submit" 
                  class="btn btn-primary" 
                  :disabled="saving || !userForm.primaryAgencyId || (userForm.createAsCurrentEmployee && !userForm.workEmail)"
                  :title="!userForm.primaryAgencyId ? 'Please select an agency' : (userForm.createAsCurrentEmployee && !userForm.workEmail ? 'Work email is required for current employees' : '')"
                >
                  {{ saving ? 'Creating...' : (userForm.createAsCurrentEmployee ? 'Create Current Employee' : 'Create User') }}
                </button>
              </div>
              <div v-if="!userForm.primaryAgencyId" class="form-error" style="margin-top: 10px; color: #dc3545;">
                ⚠️ Please select an agency to continue
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
          
          <div v-if="canManageLoginAliasesForEditingUser" class="form-group">
            <label>Additional login emails (for multi-organization users)</label>
            <div class="form-help" style="margin-bottom: 8px;">
              These emails can also be used to log into the same account. Useful for different agency brandings (e.g. `/agency` vs `/agency2`).
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input v-model="userForm.newLoginEmailAlias" type="email" placeholder="other-email@company.com" />
              <button type="button" class="btn btn-secondary btn-sm" @click="addLoginEmailAlias">Add</button>
            </div>
            <div v-if="(userForm.loginEmailAliases || []).length > 0" style="margin-top: 10px;">
              <div
                v-for="e in userForm.loginEmailAliases"
                :key="e"
                style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 6px;"
              >
                <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
                  {{ e }}
                </div>
                <button type="button" class="btn btn-danger btn-sm" @click="removeLoginEmailAlias(e)">Remove</button>
              </div>
            </div>
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
              <option v-if="user?.role === 'super_admin' || user?.role === 'admin'" value="support">Staff (Admin Tools)</option>
              <option value="clinical_practice_assistant">Clinical Practice Assistant</option>
              <option value="client_guardian">Guardian</option>
              <option value="staff">Staff</option>
              <option value="provider">Provider</option>
              <option value="school_staff">School Staff</option>
            </select>
            <small v-if="userForm.role === 'super_admin' && user?.role !== 'super_admin'" class="form-help">Only super admins can assign the super admin role</small>
            <small v-else-if="userForm.role === 'admin' && user?.role !== 'super_admin' && user?.role !== 'admin'" class="form-help">Only super admins and admins can assign the admin role</small>
            <small v-else-if="userForm.role === 'support' && user?.role !== 'super_admin' && user?.role !== 'admin'" class="form-help">Only super admins and admins can assign the staff role</small>
          </div>
          <div v-if="userForm.role === 'provider' || userForm.role === 'admin' || userForm.role === 'super_admin' || userForm.role === 'clinical_practice_assistant'" class="form-group">
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
          <div class="credential-item" v-if="userCredentials.portalLoginLink">
            <label>Login Link:</label>
            <div class="credential-value">
              <input type="text" :value="userCredentials.portalLoginLink" readonly class="credential-input" />
              <button @click="copyText(userCredentials.portalLoginLink)" class="btn-copy">Copy</button>
            </div>
            <small>User will be prompted to set a new password after login.</small>
          </div>
          
          <div class="credential-item">
            <label>Username:</label>
            <div class="credential-value">
              <input type="text" :value="userCredentials.username" readonly class="credential-input" ref="usernameInput" />
              <button @click="copyToClipboard('username')" class="btn-copy">Copy</button>
            </div>
            <small>Work email will be set when user moves to active status</small>
          </div>

          <div class="credential-item" v-if="userCredentials.temporaryPassword">
            <label>Temporary Password:</label>
            <div class="credential-value">
              <input type="text" :value="userCredentials.temporaryPassword" readonly class="credential-input" />
              <button @click="copyText(userCredentials.temporaryPassword)" class="btn-copy">Copy</button>
            </div>
            <small>This temporary password expires. User must set a new password after login.</small>
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

    <!-- Super-admin tools: small bottom buttons -->
    <div v-if="isSuperAdmin" class="admin-tools-bar">
      <button type="button" class="btn btn-secondary btn-sm" @click="openProviderUploadModal">
        Provider Upload
      </button>
      <button type="button" class="btn btn-secondary btn-sm" @click="openRateSheetModal">
        Pay Rate Matrix Upload
      </button>
      <button type="button" class="btn btn-secondary btn-sm" @click="openEmailUpdateModal">
        Email Update Upload
      </button>
      <button type="button" class="btn btn-secondary btn-sm" @click="openEmployeeInfoModal">
        Employee Info Import
      </button>
    </div>

    <!-- Provider Upload Modal -->
    <div v-if="showProviderUploadModal" class="modal-overlay" @click="closeProviderUploadModal">
      <div class="modal-content large" @click.stop style="max-width: 820px;">
        <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px;">
          <h2 style="margin:0;">Provider upload</h2>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeProviderUploadModal">Close</button>
        </div>
        <div class="muted" style="margin-top: 8px;">
          Creates/updates provider accounts and stores your columns into Provider Info fields.
        </div>

        <div class="form-group" style="margin-top: 14px;">
          <label>Agency *</label>
          <select v-model="agencySort">
            <option value="">Select an agency…</option>
            <option v-for="agency in agencyOptions" :key="agency.id" :value="agency.id">{{ agency.name }}</option>
          </select>
          <small class="form-help">Pick the agency context for the import.</small>
        </div>

        <div class="form-group">
          <label>File (CSV/XLSX)</label>
          <input type="file" @change="onProviderListFileChange" accept=".csv,.xlsx,.xls" />
          <small class="form-help">Works with comma-CSV or semicolon-CSV.</small>
        </div>

        <div class="form-group">
          <label style="display:flex; align-items:center; gap: 10px;">
            <input type="checkbox" v-model="providerUseAi" />
            Use Gemini assist (best effort)
          </label>
          <small class="form-help">If enabled and Gemini is configured, we’ll try to map headers automatically.</small>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeProviderUploadModal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="runProviderBulkCreate" :disabled="!providerListFile || !agencySort || providerBulkRunning">
            {{ providerBulkRunning ? 'Importing…' : 'Import Providers' }}
          </button>
        </div>

        <div v-if="providerBulkResult" class="import-results">
          <div><strong>Rows:</strong> {{ providerBulkResult.rowCount }}</div>
          <div><strong>Created providers:</strong> {{ providerBulkResult.createdProviders }}</div>
          <div><strong>Updated providers:</strong> {{ providerBulkResult.updatedProviders }}</div>
          <div v-if="(providerBulkResult.errors || []).length" class="muted" style="margin-top: 8px;">
            Showing up to 50 errors.
          </div>
        </div>
      </div>
    </div>

    <!-- Pay Rate Matrix Upload Modal -->
    <div v-if="showRateSheetModal" class="modal-overlay" @click="closeRateSheetModal">
      <div class="modal-content large" @click.stop style="max-width: 820px;">
        <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px;">
          <h2 style="margin:0;">Pay rate matrix upload</h2>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeRateSheetModal">Close</button>
        </div>
        <div class="muted" style="margin-top: 8px;">
          Imports direct/indirect rates and per-service-code rates into payroll for the selected agency.
        </div>

        <div class="form-group" style="margin-top: 14px;">
          <label>Agency *</label>
          <select v-model="agencySort">
            <option value="">Select an agency…</option>
            <option v-for="agency in agencyOptions" :key="agency.id" :value="agency.id">{{ agency.name }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>File (CSV/XLSX)</label>
          <input type="file" @change="onRateSheetFileChange" accept=".csv,.xlsx,.xls" />
        </div>

        <div class="form-group">
          <label style="display:flex; align-items:center; gap: 10px;">
            <input type="checkbox" v-model="rateSheetDryRun" />
            Dry run (preview only)
          </label>
        </div>

        <div class="form-group">
          <label style="display:flex; align-items:center; gap: 10px;">
            <input type="checkbox" v-model="rateSheetUseAi" />
            Use Gemini assist (best effort)
          </label>
          <small class="form-help">If enabled and Gemini is configured, we’ll try to map unusual headers automatically.</small>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeRateSheetModal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="runRateSheetImport" :disabled="!rateSheetFile || !agencySort || rateSheetImporting">
            {{ rateSheetImporting ? (rateSheetDryRun ? 'Previewing…' : 'Importing…') : (rateSheetDryRun ? 'Preview Rate Sheet' : 'Import Rate Sheet') }}
          </button>
        </div>

        <div v-if="rateSheetResult" class="import-results">
          <div><strong>Processed rows:</strong> {{ rateSheetResult.processed }}</div>
          <div><strong>Skipped inactive:</strong> {{ rateSheetResult.skippedInactive }}</div>
          <div><strong>Created users:</strong> {{ (rateSheetResult.createdUsers || []).length }}</div>
          <div><strong>Templates created:</strong> {{ rateSheetResult.templatesCreated || 0 }}</div>
          <div><strong>Templates reused:</strong> {{ rateSheetResult.templatesReused || 0 }}</div>
          <div><strong>Templates applied:</strong> {{ rateSheetResult.templatesApplied || 0 }}</div>
          <div><strong>Updated rate cards:</strong> {{ rateSheetResult.updatedRateCards }}</div>
          <div><strong>Replaced per-code rates (users):</strong> {{ rateSheetResult.replacedPerCodeRatesForUsers }}</div>
          <div><strong>Upserted per-code rates:</strong> {{ rateSheetResult.upsertedPerCodeRates }}</div>
          <div v-if="rateSheetResult.dryRun" class="muted" style="margin-top: 8px;">
            Dry run: no payroll data was modified.
          </div>
          <div v-if="(rateSheetResult.errors || []).length" class="muted" style="margin-top: 8px;">
            Showing up to 50 errors.
          </div>
        </div>
      </div>
    </div>

    <!-- Provider Email Update Modal -->
    <div v-if="showEmailUpdateModal" class="modal-overlay" @click="closeEmailUpdateModal">
      <div class="modal-content large" @click.stop style="max-width: 820px;">
        <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px;">
          <h2 style="margin:0;">Provider email update upload</h2>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeEmailUpdateModal">Close</button>
        </div>
        <div class="muted" style="margin-top: 8px;">
          Updates provider login email by matching names. Assumes <strong>Column A</strong> is First Name, <strong>Column B</strong> is Last Name, and <strong>Column C</strong> is Email.
        </div>

        <div class="form-group" style="margin-top: 14px;">
          <label>Agency *</label>
          <select v-model="agencySort">
            <option value="">Select an agency…</option>
            <option v-for="agency in agencyOptions" :key="agency.id" :value="agency.id">{{ agency.name }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>File (CSV/XLSX)</label>
          <input type="file" @change="onEmailUpdateFileChange" accept=".csv,.xlsx,.xls" />
        </div>

        <div class="form-group">
          <label style="display:flex; align-items:center; gap: 10px;">
            <input type="checkbox" v-model="emailUpdateDryRun" />
            Dry run (preview only)
          </label>
        </div>

        <div class="form-group">
          <label style="display:flex; align-items:center; gap: 10px;">
            <input type="checkbox" v-model="emailUpdateCreateIfMissing" />
            Create provider profiles if missing
          </label>
          <small class="form-help">
            If a provider is not found in the selected agency, we’ll create a Provider user, assign them to the agency, and store this email as an agency login alias.
          </small>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeEmailUpdateModal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="runEmailUpdateImport" :disabled="!emailUpdateFile || !agencySort || emailUpdateImporting">
            {{ emailUpdateImporting ? (emailUpdateDryRun ? 'Previewing…' : 'Updating…') : (emailUpdateDryRun ? 'Preview Email Update' : 'Update Emails') }}
          </button>
        </div>

        <div v-if="emailUpdateResult" class="import-results">
          <div><strong>Processed rows:</strong> {{ emailUpdateResult.processed }}</div>
          <div><strong>Matched users:</strong> {{ emailUpdateResult.matchedUsers }}</div>
          <div><strong>Updated users:</strong> {{ emailUpdateResult.updatedUsers }}</div>
          <div v-if="emailUpdateResult.createdUsers !== undefined"><strong>Created users:</strong> {{ emailUpdateResult.createdUsers }}</div>
          <div v-if="emailUpdateResult.assignedToAgency !== undefined"><strong>Assigned to agency:</strong> {{ emailUpdateResult.assignedToAgency }}</div>
          <div v-if="emailUpdateResult.createdAliases !== undefined"><strong>Login aliases created:</strong> {{ emailUpdateResult.createdAliases }}</div>
          <div><strong>Skipped invalid email:</strong> {{ emailUpdateResult.skippedInvalidEmail }}</div>
          <div><strong>Skipped no match:</strong> {{ emailUpdateResult.skippedNoMatch }}</div>
          <div v-if="emailUpdateResult.dryRun" class="muted" style="margin-top: 8px;">
            Dry run: no users were modified.
          </div>
        </div>
      </div>
    </div>

    <!-- Employee Info Import Modal -->
    <div v-if="showEmployeeInfoModal" class="modal-overlay" @click="closeEmployeeInfoModal">
      <div class="modal-content large" @click.stop style="max-width: 860px;">
        <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px;">
          <h2 style="margin:0;">Employee Info import</h2>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeEmployeeInfoModal">Close</button>
        </div>
        <div class="muted" style="margin-top: 8px;">
          Imports legacy employee/provider info (Start date, personal email, address, phone, education, license, NPI, Medicaid location). Dry run is recommended first.
        </div>

        <div class="form-group" style="margin-top: 14px;">
          <label>Agency *</label>
          <select v-model="employeeInfoAgencyId">
            <option value="">Select an agency…</option>
            <option v-for="agency in agencyOptions" :key="agency.id" :value="agency.id">{{ agency.name }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>File (CSV/XLSX)</label>
          <input type="file" @change="onEmployeeInfoFileChange" accept=".csv,.xlsx,.xls" />
        </div>

        <div class="form-group">
          <label style="display:flex; align-items:center; gap: 10px;">
            <input type="checkbox" v-model="employeeInfoDryRun" />
            Dry run (preview only)
          </label>
        </div>

        <div class="form-group">
          <label style="display:flex; align-items:center; gap: 10px;">
            <input type="checkbox" v-model="employeeInfoUseAi" />
            Use Gemini assist (best effort)
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeEmployeeInfoModal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="runEmployeeInfoImport" :disabled="!employeeInfoFile || !employeeInfoAgencyId || employeeInfoImporting">
            {{ employeeInfoImporting ? (employeeInfoDryRun ? 'Previewing…' : 'Importing…') : (employeeInfoDryRun ? 'Preview Import' : 'Import') }}
          </button>
        </div>

        <div v-if="employeeInfoResult" class="import-results">
          <div><strong>Processed rows:</strong> {{ employeeInfoResult.processed }}</div>
          <div><strong>Matched users:</strong> {{ employeeInfoResult.matchedUsers }}</div>
          <div><strong>Created users:</strong> {{ employeeInfoResult.createdUsers }}</div>
          <div><strong>Updated users:</strong> {{ employeeInfoResult.updatedUsers }}</div>
          <div><strong>User info fields updated:</strong> {{ employeeInfoResult.updatedUserInfoFields }}</div>
          <div v-if="employeeInfoResult.dryRun" class="muted" style="margin-top: 8px;">Dry run: no data was written.</div>
          <div v-if="(employeeInfoResult.errors || []).length" class="muted" style="margin-top: 8px;">
            Showing up to {{ (employeeInfoResult.errors || []).length }} errors.
          </div>
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
import { useAgencyStore } from '../../store/agency';
import { isSupervisor } from '../../utils/helpers.js';
import { getStatusLabel, getStatusBadgeClass } from '../../utils/statusUtils.js';
import BulkDocumentAssignmentDialog from '../../components/documents/BulkDocumentAssignmentDialog.vue';
import aiIconAsset from '../../assets/ai/ai-icon.svg';
import aiReadyAsset from '../../assets/ai/ready.svg';
import aiThinkingAsset from '../../assets/ai/thinking.svg';
import aiSuccessAsset from '../../assets/ai/success.svg';
import aiErrorAsset from '../../assets/ai/error.svg';

const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const user = computed(() => authStore.user);
const isSuperAdmin = computed(() => user.value?.role === 'super_admin');
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
// Map orgId -> parent agencyId (best-effort; populated from /affiliated-organizations).
const orgAffiliationById = ref({});
const loading = ref(true);
const error = ref('');
const showCreateModal = ref(false);
const showBulkAssignModal = ref(false);
const editingUser = ref(null);
const saving = ref(false);
// Default to Active Employee per admin workflow.
const statusSort = ref('ACTIVE_EMPLOYEE');
const agencySort = ref('');
const organizationSort = ref('');
const roleSort = ref('');
const userSearch = ref('');
const userTypeFilter = ref('');
const organizationSearch = ref('');

const tableSortKey = ref('name');
const tableSortDir = ref('asc'); // 'asc' | 'desc'
const userTableExpanded = ref(false);

const agencyOptions = computed(() => {
  const list = Array.isArray(agencies.value) ? agencies.value : [];
  return list
    .filter((o) => String(o?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

const organizationOptions = computed(() => {
  const list = Array.isArray(agencies.value) ? agencies.value : [];
  const isChildType = (o) => ['school', 'program', 'learning'].includes(String(o?.organization_type || '').toLowerCase());
  const scoped = list.filter(isChildType);
  const q = String(organizationSearch.value || '').trim().toLowerCase();
  const applySearch = (rows) => (q ? rows.filter((o) => String(o?.name || '').toLowerCase().includes(q)) : rows);
  if (!agencySort.value) return applySearch(scoped).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  const aid = parseInt(String(agencySort.value), 10);
  if (!aid) return [];
  return applySearch(scoped)
    .filter((o) => parseInt(String(o?.__affiliatedAgencyId || orgAffiliationById.value?.[String(o?.id)] || ''), 10) === aid)
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

// User affiliations display helpers (keep table rows compact)
const orgById = computed(() => {
  const out = {};
  for (const o of agencies.value || []) {
    const id = Number(o?.id || 0);
    if (!id) continue;
    out[id] = o;
  }
  return out;
});
const orgTypeFor = (org) => String(org?.organization_type || 'agency').toLowerCase();
const parseUserOrgIds = (u) => {
  const raw = u?.agency_ids;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0);
  return String(raw)
    .split(',')
    .map((s) => parseInt(String(s).trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
};
const userAgencyIds = (u) => {
  const ids = parseUserOrgIds(u);
  const parentIds = new Set();
  for (const orgId of ids) {
    const parentId = parseInt(String(orgAffiliationById.value?.[String(orgId)] || ''), 10);
    if (parentId) parentIds.add(parentId);
  }
  return Array.from(parentIds.values()).sort((a, b) => a - b);
};
const userAgencyNames = (u) => {
  const ids = userAgencyIds(u);
  const names = ids.map((id) => String(orgById.value?.[id]?.name || `Agency ${id}`));
  names.sort((a, b) => a.localeCompare(b));
  return names;
};
const userAgencySummary = (u) => {
  const names = userAgencyNames(u);
  if (!names.length) return String(u?.agencies || 'No Agency') || 'No Agency';
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
};
const userChildOrgs = (u) => {
  const ids = parseUserOrgIds(u);
  const rows = ids
    .map((id) => orgById.value?.[Number(id)] || null)
    .filter((o) => o && orgTypeFor(o) !== 'agency');
  rows.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  return rows;
};

const hoverUserAffiliationsPopoverUserId = ref(null);
const pinnedUserAffiliationsPopoverUserId = ref(null);
const isUserAffiliationsPopoverOpenFor = (userId) => {
  const id = Number(userId);
  return hoverUserAffiliationsPopoverUserId.value === id || pinnedUserAffiliationsPopoverUserId.value === id;
};
const openUserAffiliationsPopover = (userId) => {
  const id = Number(userId);
  if (pinnedUserAffiliationsPopoverUserId.value !== null && pinnedUserAffiliationsPopoverUserId.value !== id) return;
  hoverUserAffiliationsPopoverUserId.value = id;
};
const closeUserAffiliationsPopover = (userId) => {
  const id = Number(userId);
  if (hoverUserAffiliationsPopoverUserId.value === id) hoverUserAffiliationsPopoverUserId.value = null;
};
const toggleUserAffiliationsPopover = (userId) => {
  const id = Number(userId);
  if (pinnedUserAffiliationsPopoverUserId.value === id) {
    pinnedUserAffiliationsPopoverUserId.value = null;
  } else {
    pinnedUserAffiliationsPopoverUserId.value = id;
    hoverUserAffiliationsPopoverUserId.value = id;
  }
};

// AI Search (Gemini-ready)
const aiQueryText = ref('');
const aiState = ref('ready'); // 'ready' | 'thinking' | 'success' | 'error'
const aiResults = ref([]);
const aiEmailsSemicolon = ref('');
const aiError = ref('');
const aiMeta = ref(null);
const aiActiveOnly = ref(true);
const aiProvidersOnly = ref(false);

const aiIconSrc = aiIconAsset;
const aiBannerSrc = computed(() => {
  if (aiState.value === 'thinking') return aiThinkingAsset;
  if (aiState.value === 'success') return aiSuccessAsset;
  if (aiState.value === 'error') return aiErrorAsset;
  return aiReadyAsset;
});

const clearAiQuery = () => {
  aiQueryText.value = '';
  aiState.value = 'ready';
  aiResults.value = [];
  aiEmailsSemicolon.value = '';
  aiError.value = '';
  aiMeta.value = null;
  aiActiveOnly.value = true;
  aiProvidersOnly.value = false;
};

const runAiQuery = async () => {
  const q = String(aiQueryText.value || '').trim();
  if (!q) {
    clearAiQuery();
    return;
  }

  try {
    aiState.value = 'thinking';
    aiError.value = '';
    aiResults.value = [];
    aiEmailsSemicolon.value = '';
    aiMeta.value = null;

    const response = await api.get('/users/ai-query', {
      params: {
        query: q,
        limit: 500,
        activeOnly: aiActiveOnly.value,
        providersOnly: aiProvidersOnly.value,
        // Provider matching is agency-scoped when using the provider index.
        agencyId: agencySort.value ? parseInt(String(agencySort.value), 10) : undefined
      }
    });
    const data = response.data || {};
    aiResults.value = Array.isArray(data.results) ? data.results : [];
    aiEmailsSemicolon.value = String(data.emailsSemicolon || '');
    aiMeta.value = data.meta || null;

    if (!aiResults.value.length) {
      aiState.value = 'error';
      aiError.value = 'No matching users found.';
      return;
    }
    aiState.value = 'success';
  } catch (e) {
    aiState.value = 'error';
    aiError.value = e?.response?.data?.error?.message || 'AI search failed. Please try again.';
  }
};

const copyAiEmails = async () => {
  const text = String(aiEmailsSemicolon.value || '').trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for older browsers / blocked clipboard API
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
};

// Provider uploads (User Management)
const providerListFile = ref(null);
const providerBulkRunning = ref(false);
const providerBulkResult = ref(null);
const providerUseAi = ref(true);
const rateSheetFile = ref(null);
const rateSheetDryRun = ref(true);
const rateSheetUseAi = ref(true);
const rateSheetImporting = ref(false);
const rateSheetResult = ref(null);
const showProviderUploadModal = ref(false);
const showRateSheetModal = ref(false);
const showEmailUpdateModal = ref(false);
const showEmployeeInfoModal = ref(false);
const emailUpdateFile = ref(null);
const emailUpdateDryRun = ref(true);
const emailUpdateCreateIfMissing = ref(true);
const emailUpdateImporting = ref(false);
const emailUpdateResult = ref(null);

// Employee info import
const employeeInfoAgencyId = ref('');
const employeeInfoFile = ref(null);
const employeeInfoDryRun = ref(true);
const employeeInfoUseAi = ref(true);
const employeeInfoImporting = ref(false);
const employeeInfoResult = ref(null);

const currentStep = ref(1);
const availablePackages = ref([]);
const selectedPackage = ref(null);

const userForm = ref({
  email: '',
  personalEmail: '',
  workEmail: '',
  loginEmailAliases: [],
  newLoginEmailAlias: '',
  firstName: '',
  hasProviderAccess: false,
  hasStaffAccess: false,
  lastName: '',
  phoneNumber: '',
  personalPhone: '',
  workPhone: '',
  workPhoneExtension: '',
  role: 'provider',
  hasSupervisorPrivileges: false,
  agencyIds: [],
  primaryAgencyId: '',
  organizationIds: [],
  onboardingPackageId: '',
  createAsCurrentEmployee: false
});

const isGuardianRole = computed(() => String(userForm.value?.role || '').toLowerCase() === 'client_guardian');
const isSchoolStaffRole = computed(() => String(userForm.value?.role || '').toLowerCase() === 'school_staff');
const supportsEmployeeWorkflow = computed(() => !isGuardianRole.value);
const orgAssignmentRequired = computed(() => isGuardianRole.value || isSchoolStaffRole.value);
const orgAssignmentLabel = computed(() => {
  if (isSchoolStaffRole.value) return 'Assign to School(s) *';
  if (isGuardianRole.value) return 'Portal Organization(s) *';
  return 'Optional: Assign to Schools / Programs';
});
const affiliatedOrgsForCreateDisplay = computed(() => {
  const rows = Array.isArray(affiliatedOrgsForUserCreate.value) ? affiliatedOrgsForUserCreate.value : [];
  const type = (o) => String(o?.organization_type || '').toLowerCase();
  if (isSchoolStaffRole.value) return rows.filter((o) => type(o) === 'school');
  if (isGuardianRole.value) return rows.filter((o) => ['school', 'program', 'learning'].includes(type(o)));
  return rows;
});
const orgEmptyMessage = computed(() => {
  if (isSchoolStaffRole.value) return 'No schools found for this agency.';
  if (isGuardianRole.value) return 'No portal organizations found for this agency.';
  return 'No schools/programs found for this agency.';
});
const agencyHelpText = computed(() => {
  if (orgAssignmentRequired.value) return 'Select the agency first. Next you will assign organizations for this role.';
  return 'Select the agency first. Next you can optionally assign schools/programs for this user.';
});
const step1Label = computed(() => 'Role & Details');
const step2Label = computed(() => (isGuardianRole.value ? 'Confirm' : 'Agency & Package'));

watch(
  () => userForm.value.role,
  (newRole) => {
    const r = String(newRole || '').toLowerCase();
    if (r === 'client_guardian') {
      // Guardians are non-employee portal users; avoid employee-only fields.
      userForm.value.createAsCurrentEmployee = false;
      userForm.value.workEmail = '';
      userForm.value.onboardingPackageId = '';
      userForm.value.hasProviderAccess = false;
      userForm.value.hasStaffAccess = false;
      userForm.value.hasSupervisorPrivileges = false;
    }
  }
);

const parentAgenciesForUserCreate = computed(() => {
  const list = Array.isArray(agencies.value) ? agencies.value : [];
  return list
    .filter((o) => String(o?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

const shouldPickAgencyForUserCreate = computed(() => {
  return parentAgenciesForUserCreate.value.length > 1;
});

const affiliatedOrgsForUserCreate = ref([]);
const affiliatedOrgsLoading = ref(false);
const affiliatedOrgsError = ref('');

const loadAffiliatedOrgsForUserCreate = async () => {
  const agencyId = userForm.value.primaryAgencyId ? parseInt(String(userForm.value.primaryAgencyId), 10) : null;
  affiliatedOrgsError.value = '';
  affiliatedOrgsForUserCreate.value = [];
  if (!agencyId) return;

  try {
    affiliatedOrgsLoading.value = true;
    const r = await api.get(`/agencies/${agencyId}/affiliated-organizations`);
    const rows = Array.isArray(r.data) ? r.data : [];
    affiliatedOrgsForUserCreate.value = rows
      .filter((o) => ['school', 'program', 'learning'].includes(String(o?.organization_type || '').toLowerCase()))
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  } catch (e) {
    affiliatedOrgsError.value = e?.response?.data?.error?.message || 'Failed to load affiliated organizations';
    affiliatedOrgsForUserCreate.value = [];
  } finally {
    affiliatedOrgsLoading.value = false;
  }
};

watch(() => userForm.value.primaryAgencyId, async () => {
  // Reset optional org selections when agency changes.
  userForm.value.organizationIds = [];
  await loadAffiliatedOrgsForUserCreate();
});

const showCredentialsModal = ref(false);
const userCredentials = ref({
  token: '',
  tokenLink: '',
  username: '',
  temporaryPassword: '',
  portalLoginLink: '',
  generatedEmails: []
});

const showDuplicateNameModal = ref(false);
const duplicateUsers = ref([]);
const pendingUserData = ref(null);
const tokenInput = ref(null);
const usernameInput = ref(null);

const fetchUsers = async () => {
  try {
    loading.value = true;
    // Archived users are managed in Settings → Archive, not in the main user list.
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
    const base = response.data || [];

    // Expand with affiliated orgs (schools/programs/learning) for each parent agency.
    // This lets admins assign providers to affiliated orgs even if they aren't directly assigned yet.
    const parents = base.filter((a) => String(a.organization_type || 'agency').toLowerCase() === 'agency');
    const affLists = await Promise.all(
      parents.map(async (a) => {
        try {
          const r = await api.get(`/agencies/${a.id}/affiliated-organizations`);
          const rows = Array.isArray(r.data) ? r.data : [];
          // Annotate each returned org with its parent agency.
          return rows.map((o) => ({ ...(o || {}), __affiliatedAgencyId: a.id }));
        } catch (e) {
          return [];
        }
      })
    );

    const merged = [...base, ...affLists.flat()];
    const byId = new Map();
    const affiliation = {};
    for (const org of merged) {
      if (!org?.id) continue;
      // best-effort: keep/merge affiliation hints
      const orgId = String(org.id);
      const type = String(org.organization_type || 'agency').toLowerCase();
      if (type === 'agency') {
        affiliation[orgId] = parseInt(orgId, 10);
      } else if (org.__affiliatedAgencyId) {
        affiliation[orgId] = parseInt(String(org.__affiliatedAgencyId), 10);
      } else if (orgAffiliationById.value?.[orgId]) {
        affiliation[orgId] = parseInt(String(orgAffiliationById.value[orgId]), 10);
      }

      if (!byId.has(org.id)) {
        byId.set(org.id, org);
      } else {
        const prev = byId.get(org.id) || {};
        byId.set(org.id, { ...prev, ...org });
      }
    }
    orgAffiliationById.value = affiliation;
    agencies.value = Array.from(byId.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

const resolveDefaultAgencyAndOrg = () => {
  // Prefer the currently-selected brand/agency (stored in agencyStore.currentAgency) when present.
  if (agencySort.value) return;
  const cur = agencyStore.currentAgency?.value || null;
  if (!cur?.id) return;
  const curId = parseInt(String(cur.id), 10);
  if (!curId) return;
  const curType = String(cur.organization_type || 'agency').toLowerCase();
  if (curType === 'agency') {
    agencySort.value = String(curId);
    return;
  }
  // Child org selected: set agency to its affiliated parent (best-effort), and org to the selected org.
  const parentId = parseInt(String(orgAffiliationById.value?.[String(curId)] || ''), 10);
  if (parentId) {
    agencySort.value = String(parentId);
    organizationSort.value = String(curId);
  }
};

watch(
  () => agencySort.value,
  () => {
    // Keep organization selection consistent with agency selection.
    if (!organizationSort.value) return;
    const orgId = parseInt(String(organizationSort.value), 10);
    const agencyId = parseInt(String(agencySort.value), 10);
    if (!orgId || !agencyId) return;
    const parentId = parseInt(String(orgAffiliationById.value?.[String(orgId)] || ''), 10);
    if (parentId && parentId !== agencyId) {
      organizationSort.value = '';
    }
  }
);

const toggleUserType = (type) => {
  userTypeFilter.value = userTypeFilter.value === type ? '' : type;
};

const toggleTableSort = (key) => {
  const k = String(key || '').trim();
  if (!k) return;
  if (tableSortKey.value === k) {
    tableSortDir.value = tableSortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    tableSortKey.value = k;
    tableSortDir.value = 'asc';
  }
};

const sortIndicator = (key) => {
  if (tableSortKey.value !== key) return '';
  return tableSortDir.value === 'asc' ? '▲' : '▼';
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
    // If user only has access to one agency, preselect it.
    if (!userForm.value.primaryAgencyId && parentAgenciesForUserCreate.value.length === 1) {
      userForm.value.primaryAgencyId = String(parentAgenciesForUserCreate.value[0].id);
    }
    if (!userForm.value.role) {
      error.value = 'Please select a role';
      alert('Please select a role');
      return;
    }
    if (!userForm.value.primaryAgencyId && shouldPickAgencyForUserCreate.value) {
      error.value = 'Please select an agency';
      alert('Please select an agency');
      return;
    }
    // Validate step 1 - lastName is required, email is optional
    if (!userForm.value.lastName || !userForm.value.role) {
      error.value = 'Please fill in all required fields (Last Name and Role)';
      return;
    }
    if (isGuardianRole.value) {
      if (!userForm.value.email || !String(userForm.value.email).trim()) {
        error.value = 'Email is required for guardians';
        alert('Please enter an email');
        return;
      }
    }
    if (orgAssignmentRequired.value) {
      const ids = Array.isArray(userForm.value.organizationIds) ? userForm.value.organizationIds : [];
      if (ids.length === 0) {
        error.value = 'Please select at least one organization';
        alert('Please select at least one organization');
        return;
      }
    }
    if (userForm.value.createAsCurrentEmployee) {
      if (!userForm.value.workEmail || !String(userForm.value.workEmail).trim()) {
        error.value = 'Work email is required for current employees';
        alert('Please enter a work email');
        return;
      }
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

const editUser = async (user) => {
  editingUser.value = user;
  userForm.value = {
    email: user.email,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    phoneNumber: user.phone_number || '',
    hasProviderAccess: user.has_provider_access || false,
    hasStaffAccess: user.has_staff_access || false,
    personalPhone: user.personal_phone || '',
    workPhone: user.work_phone || '',
    workPhoneExtension: user.work_phone_extension || '',
    role: user.role,
    hasSupervisorPrivileges: user.has_supervisor_privileges === true || user.has_supervisor_privileges === 1 || user.has_supervisor_privileges === '1' || false,
    agencyIds: [],
    onboardingPackageId: '',
    loginEmailAliases: [],
    newLoginEmailAlias: ''
  };

  // Load existing login email aliases (only meaningful for users with 2+ orgs).
  try {
    const agencyIds = user?.agencyIds || [];
    if (Array.isArray(agencyIds) && agencyIds.length >= 2) {
      const r = await api.get(`/users/${user.id}/login-email-aliases`);
      userForm.value.loginEmailAliases = (r.data?.loginEmailAliases || []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean);
    }
  } catch (e) {
    // Non-blocking; allow user edit even if this fails.
  }
};

const canManageLoginAliasesForEditingUser = computed(() => {
  if (!editingUser.value) return false;
  const ids = editingUser.value?.agencyIds || [];
  return Array.isArray(ids) && ids.length >= 2;
});

const addLoginEmailAlias = () => {
  const v = String(userForm.value.newLoginEmailAlias || '').trim().toLowerCase();
  if (!v) return;
  if (!v.includes('@')) {
    alert('Please enter a valid email address');
    return;
  }
  const existing = (userForm.value.loginEmailAliases || []).map(e => String(e || '').trim().toLowerCase());
  if (existing.includes(v)) {
    userForm.value.newLoginEmailAlias = '';
    return;
  }
  userForm.value.loginEmailAliases = [...existing, v];
  userForm.value.newLoginEmailAlias = '';
};

const removeLoginEmailAlias = (email) => {
  const v = String(email || '').trim().toLowerCase();
  userForm.value.loginEmailAliases = (userForm.value.loginEmailAliases || []).filter(e => String(e || '').trim().toLowerCase() !== v);
};

const saveUser = async () => {
  if (saving.value) return;
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
      if (!userForm.value.primaryAgencyId) {
        error.value = 'Please select an agency';
        saving.value = false;
        alert('Please select an agency');
        return;
      }
      if (isGuardianRole.value) {
        if (!userForm.value.email || !String(userForm.value.email).trim()) {
          error.value = 'Email is required for guardians';
          saving.value = false;
          alert('Please enter an email');
          return;
        }
      }
      if (orgAssignmentRequired.value) {
        const ids = Array.isArray(userForm.value.organizationIds) ? userForm.value.organizationIds : [];
        if (ids.length === 0) {
          error.value = 'Please select at least one organization';
          saving.value = false;
          alert('Please select at least one organization');
          return;
        }
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
      
      if (canManageLoginAliasesForEditingUser.value) {
        updateData.loginEmailAliases = (userForm.value.loginEmailAliases || []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean);
      }
      
      // Include supervisor privileges if user has eligible role
      if (userForm.value.role === 'provider' || userForm.value.role === 'admin' || userForm.value.role === 'super_admin' || userForm.value.role === 'clinical_practice_assistant') {
        updateData.hasSupervisorPrivileges = Boolean(userForm.value.hasSupervisorPrivileges);
      }
      
      // Include permission attributes for cross-role capabilities
      if (userForm.value.role === 'staff' || userForm.value.role === 'support') {
        updateData.hasProviderAccess = Boolean(userForm.value.hasProviderAccess);
      }
      if (userForm.value.role === 'provider') {
        updateData.hasStaffAccess = Boolean(userForm.value.hasStaffAccess);
      }
      try {
        await api.put(`/users/${editingUser.value.id}`, updateData);
      } catch (e) {
        const impacts = e?.response?.data?.billingImpact?.impacts;
        if (e?.response?.status === 409 && Array.isArray(impacts) && impacts.length > 0) {
          const msg = impacts
            .map(i => `Agency ${i.agencyName || i.agencyId}: +$${(Number(i.deltaMonthlyCents || 0) / 100).toFixed(2)} / month`)
            .join('\n');
          const ok = confirm(`${msg}\n\nProceed?`);
          if (ok) {
            await api.put(`/users/${editingUser.value.id}`, { ...updateData, billingAcknowledged: true });
          } else {
            throw e;
          }
        } else {
          throw e;
        }
      }
      closeModal();
      fetchUsers();
    } else {
      // Guardians are non-employee portal users: ensure employee-only fields aren't used.
      if (isGuardianRole.value) {
        userForm.value.createAsCurrentEmployee = false;
        userForm.value.workEmail = '';
        userForm.value.onboardingPackageId = '';
      }

      // Check if creating as current employee
      if (userForm.value.createAsCurrentEmployee) {
        // Validate required fields for current employee
        if (!userForm.value.workEmail || !userForm.value.workEmail.trim()) {
          error.value = 'Work email is required for current employees';
          saving.value = false;
          alert('Please enter a work email');
          return;
        }
        if (!userForm.value.primaryAgencyId) {
          error.value = 'Please select an agency';
          saving.value = false;
          alert('Please select an agency');
          return;
        }
        
        // Create current employee using the dedicated endpoint
        const currentEmployeeData = {
          firstName: userForm.value.firstName?.trim() || '',
          lastName: userForm.value.lastName?.trim() || '',
          workEmail: userForm.value.workEmail.trim(),
          agencyId: parseInt(userForm.value.primaryAgencyId, 10),
          role: userForm.value.role || 'provider'
        };

        const orgIds = (userForm.value.organizationIds || [])
          .map((v) => parseInt(String(v), 10))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (orgIds.length) {
          currentEmployeeData.organizationIds = orgIds;
        }
        
        console.log('Creating current employee with data:', currentEmployeeData);
        let response;
        try {
          response = await api.post('/users/current-employee', currentEmployeeData);
        } catch (e) {
          const impacts = e?.response?.data?.billingImpact?.impacts;
          if (e?.response?.status === 409 && Array.isArray(impacts) && impacts.length > 0) {
            const msg = impacts
              .map(i => `Agency ${i.agencyName || i.agencyId}: +$${(Number(i.deltaMonthlyCents || 0) / 100).toFixed(2)} / month`)
              .join('\n');
            const ok = confirm(`${msg}\n\nProceed?`);
            if (!ok) throw e;
            response = await api.post('/users/current-employee', { ...currentEmployeeData, billingAcknowledged: true });
          } else {
            throw e;
          }
        }
        
        // Show credentials modal
        userCredentials.value = {
          token: response.data.passwordlessToken || '',
          tokenLink: response.data.passwordlessTokenLink || '',
          username: response.data.user.email,
          temporaryPassword: response.data.temporaryPassword || response.data.credentials?.temporaryPassword || '',
          portalLoginLink: response.data.portalLoginLink || response.data.credentials?.portalLoginLink || '',
          generatedEmails: []
        };
        
        closeModal();
        showCredentialsModal.value = true;
        fetchUsers();
      } else {
        // Create user (password is auto-generated, not sent)
        const primaryAgencyId = parseInt(userForm.value.primaryAgencyId, 10);
        createData = {
          lastName: userForm.value.lastName?.trim() || '',
          role: userForm.value.role || 'provider',
          agencyIds: !isNaN(primaryAgencyId) ? [primaryAgencyId] : []
        };

        const orgIds2 = (userForm.value.organizationIds || [])
          .map((v) => parseInt(String(v), 10))
          .filter((n) => Number.isFinite(n) && n > 0);
        // Only send organizationIds if non-empty; backend prefers organizationIds over agencyIds.
        if (orgIds2.length) {
          createData.organizationIds = orgIds2;
        }

        // Include provider-selectable capability for admin/support/staff if enabled
        if (['admin','support','staff'].includes(createData.role) && userForm.value.hasProviderAccess === true) {
          createData.hasProviderAccess = true;
        }
        
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
        let response;
        try {
          response = await api.post('/auth/register', createData);
        } catch (e) {
          const impacts = e?.response?.data?.billingImpact?.impacts;
          if (e?.response?.status === 409 && Array.isArray(impacts) && impacts.length > 0) {
            const msg = impacts
              .map(i => `Agency ${i.agencyName || i.agencyId}: +$${(Number(i.deltaMonthlyCents || 0) / 100).toFixed(2)} / month`)
              .join('\n');
            const ok = confirm(`${msg}\n\nProceed?`);
            if (!ok) throw e;
            response = await api.post('/auth/register', { ...createData, billingAcknowledged: true });
          } else {
            throw e;
          }
        }
        const newUserId = response.data.user.id;
        
        // Assign onboarding package if selected
        if (userForm.value.onboardingPackageId && userForm.value.primaryAgencyId) {
          try {
            // Use the first selected agency for package assignment
            const primaryAgencyId = parseInt(userForm.value.primaryAgencyId, 10);
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
          token: response.data.passwordlessToken || '',
          tokenLink: response.data.passwordlessTokenLink || '',
          username: userForm.value.email || response.data.user?.email || response.data.user?.personalEmail || 'N/A',
          temporaryPassword: response.data.temporaryPassword || '',
          portalLoginLink: response.data.portalLoginLink || '',
          generatedEmails: response.data.generatedEmails || []
        };
        
        closeModal();
        showCredentialsModal.value = true;
        fetchUsers();
      }
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
    workEmail: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    hasProviderAccess: false,
    hasStaffAccess: false,
    personalPhone: '',
    workPhone: '',
    workPhoneExtension: '',
    role: 'provider',
    agencyIds: [],
    primaryAgencyId: '',
    organizationIds: [],
    onboardingPackageId: '',
    createAsCurrentEmployee: false
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
    portalLoginLink: '',
    generatedEmails: []
  };
};

const copyText = async (text) => {
  const value = String(text || '');
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
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
  if (userCredentials.value.portalLoginLink) parts.push(`Login Link: ${userCredentials.value.portalLoginLink}`);
  parts.push(`Username: ${userCredentials.value.username}`);
  if (userCredentials.value.temporaryPassword) parts.push(`Temporary Password: ${userCredentials.value.temporaryPassword}`);
  
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
    'support': 'Staff (Admin Tools)',
    'supervisor': 'Provider',
    'clinical_practice_assistant': 'CPA',
    'staff': 'Staff',
    'provider': 'Provider',
    // 'clinician': 'Provider', // legacy (removed)
    'school_staff': 'School Staff',
    'facilitator': 'Provider',
    'intern': 'Provider'
  };
  return roleMap[role] || role;
};

const availabilityBadgeText = (u) => {
  const globalOpen = u?.provider_accepting_new_clients !== false;
  if (globalOpen) return 'OPEN';
  const openSchool = !!u?.provider_has_open_school_slots;
  return openSchool ? 'OPEN School' : 'CLOSED';
};

const availabilityBadgeTitle = (u) => {
  const globalOpen = u?.provider_accepting_new_clients !== false;
  if (globalOpen) return 'Open globally for new clients';
  const openSchool = !!u?.provider_has_open_school_slots;
  return openSchool ? 'Closed globally, but Open for at least one school (override + slots available)' : 'Closed for new clients';
};

const availabilityBadgeClass = (u) => {
  const globalOpen = u?.provider_accepting_new_clients !== false;
  if (globalOpen) return 'badge-success';
  const openSchool = !!u?.provider_has_open_school_slots;
  return openSchool ? 'badge-info' : 'badge-warning';
};

const availabilitySavingId = ref(null);
const canQuickToggleAvailability = (u) => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const can = role === 'super_admin' || role === 'admin' || role === 'support';
  const isProviderLike = ['provider'].includes(String(u?.role || '').toLowerCase());
  return can && isProviderLike;
};

const toggleUserAvailability = async (u, checked) => {
  try {
    if (!u?.id) return;
    availabilitySavingId.value = u.id;
    await api.put(`/users/${u.id}`, { providerAcceptingNewClients: !!checked });
    // Update local row immediately
    u.provider_accepting_new_clients = !!checked;
    // Reload users to refresh OPEN School calculation + consistency
    await fetchUsers();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update availability');
    await fetchUsers();
  } finally {
    availabilitySavingId.value = null;
  }
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
    availableAgenciesForAssignment.value = (agenciesResponse.data || []).filter(
      (a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'
    );
    
    // Get all users that could be supervisees (providers/staff)
    const usersResponse = await api.get('/users');
    let users = usersResponse.data.filter(u => 
      ['provider', 'staff', 'facilitator', 'intern'].includes(u.role)
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
  const hasSearch = !!(userSearch.value && String(userSearch.value).trim());

  const parseOrgIds = (u) => {
    const raw = u?.agency_ids;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n));
    return String(raw)
      .split(',')
      .map((s) => parseInt(String(s).trim(), 10))
      .filter((n) => Number.isFinite(n));
  };
  const isActiveUser = (u) => {
    const st = String(u?.status || '').toUpperCase();
    if (st === 'ACTIVE_EMPLOYEE' || st === 'ACTIVE') return true;
    if (u?.is_active === true || u?.is_active === 1) return true;
    return false;
  };
  const belongsToAgency = (u, agencyId) => {
    const ids = parseOrgIds(u);
    if (ids.includes(agencyId)) return true;
    // If user is only assigned to child orgs, treat them as belonging to the parent agency (best-effort).
    return ids.some((orgId) => parseInt(String(orgAffiliationById.value?.[String(orgId)] || ''), 10) === agencyId);
  };

  // Super admins should be hidden unless a super admin explicitly toggles them on.
  // Also prevents non-super-admins from searching/finding super admins.
  const viewerIsSuperAdmin = String(authStore.user?.role || '').toLowerCase() === 'super_admin';
  const showSuperAdmins = viewerIsSuperAdmin && userTypeFilter.value === 'super_admins';
  if (!showSuperAdmins) {
    filtered = filtered.filter((u) => String(u?.role || '').toLowerCase() !== 'super_admin');
  }
  
  // Filter by agency
  if (agencySort.value) {
    const aid = parseInt(String(agencySort.value), 10);
    if (aid) {
    filtered = filtered.filter(user => {
        return belongsToAgency(user, aid);
    });
    }
  }

  // Filter by organization (school/program/learning)
  if (organizationSort.value) {
    const oid = parseInt(String(organizationSort.value), 10);
    if (oid) {
      filtered = filtered.filter((u) => parseOrgIds(u).includes(oid));
    }
  }
  
  // Filter by status
  // Keep default status = Active for workflow, but when the user types a search query
  // we temporarily search across ALL statuses (unless they explicitly changed the status filter).
  const shouldOverrideDefaultActiveStatus = hasSearch && statusSort.value === 'ACTIVE_EMPLOYEE';
  if (statusSort.value && !shouldOverrideDefaultActiveStatus) {
    if (statusSort.value === 'inactive') {
      // Legacy inactive filter - map to ARCHIVED status
      filtered = filtered.filter(user => user.status === 'ARCHIVED');
    } else if (statusSort.value === 'ACTIVE_EMPLOYEE') {
      // Include legacy 'active' rows for older databases.
      filtered = filtered.filter((user) => user.status === 'ACTIVE_EMPLOYEE' || user.status === 'active');
    } else {
      filtered = filtered.filter(user => {
        return user.status === statusSort.value;
      });
    }
  }

  // Filter by role
  if (roleSort.value) {
    filtered = filtered.filter((u) => {
      const r = String(u.role || '').trim();
      if (!r) return false;
      if (roleSort.value === 'provider') return r === 'provider';
      return r === roleSort.value;
    });
  }

  // Quick user-type buttons
  if (userTypeFilter.value) {
    const t = String(userTypeFilter.value);
    filtered = filtered.filter((u) => {
      const r = String(u?.role || '').toLowerCase();
      if (t === 'guardians') return r === 'client_guardian';
      if (t === 'super_admins') return r === 'super_admin';
      if (t === 'providers') return r === 'provider';
      if (t === 'staff') return r === 'staff' || r === 'support';
      if (t === 'supervisors') return isSupervisor(u);
      return true;
    });
  }

  // Search
  if (hasSearch) {
    const q = String(userSearch.value).trim().toLowerCase();
    filtered = filtered.filter((u) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase();
      const email = String(u.email || '').trim().toLowerCase();
      const agenciesStr = String(u.agencies || '').toLowerCase();
      const role = String(u.role || '').trim().toLowerCase();
      const status = String(u.status || '').trim().toLowerCase();
      const statusLabel = String(getStatusLabelWrapper(u.status, u.is_active) || '').trim().toLowerCase();
      const credential = String(u.provider_credential || '').trim().toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        agenciesStr.includes(q) ||
        role.includes(q) ||
        status.includes(q) ||
        statusLabel.includes(q) ||
        credential.includes(q)
      );
    });
  }

  const get = (u, k) => String(u?.[k] || '').trim().toLowerCase();
  const nameLastFirst = (u) => `${get(u, 'last_name')}\u0000${get(u, 'first_name')}`;
  const nameFirstLast = (u) => `${get(u, 'first_name')}\u0000${get(u, 'last_name')}`;

  const sorted = [...filtered];
  const dir = tableSortDir.value === 'desc' ? -1 : 1;
  const cmpStr = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
  const cmpNum = (a, b) => (a === b ? 0 : a > b ? 1 : -1);

  sorted.sort((a, b) => {
    // Always show active users first (within whatever filters are applied).
    const aActive = isActiveUser(a) ? 1 : 0;
    const bActive = isActiveUser(b) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;

    const key = tableSortKey.value;
    if (key === 'name') return dir * nameLastFirst(a).localeCompare(nameLastFirst(b));
    if (key === 'email') return dir * cmpStr(get(a, 'email'), get(b, 'email'));
    if (key === 'agency') return dir * cmpStr(String(a?.agencies || ''), String(b?.agencies || ''));
    if (key === 'role') return dir * cmpStr(String(a?.role || ''), String(b?.role || ''));
    if (key === 'credential') {
      const c = cmpStr(get(a, 'provider_credential'), get(b, 'provider_credential'));
      if (c !== 0) return dir * c;
      return dir * nameLastFirst(a).localeCompare(nameLastFirst(b));
    }
    if (key === 'status') {
      const la = String(getStatusLabelWrapper(a?.status, a?.is_active) || '');
      const lb = String(getStatusLabelWrapper(b?.status, b?.is_active) || '');
      const c = cmpStr(la, lb);
      if (c !== 0) return dir * c;
      return dir * nameLastFirst(a).localeCompare(nameLastFirst(b));
    }
    if (key === 'created') {
      const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
      const c = cmpNum(ta, tb);
      if (c !== 0) return dir * c;
      return dir * nameLastFirst(a).localeCompare(nameLastFirst(b));
    }
    return dir * nameLastFirst(a).localeCompare(nameLastFirst(b));
  });

  return sorted;
});

const applySorting = () => {
  // Sorting is handled by computed property
};

const openProviderUploadModal = () => {
  providerBulkResult.value = null;
  providerListFile.value = null;
  showProviderUploadModal.value = true;
};
const closeProviderUploadModal = () => {
  showProviderUploadModal.value = false;
};
const openRateSheetModal = () => {
  rateSheetResult.value = null;
  rateSheetFile.value = null;
  rateSheetUseAi.value = true;
  showRateSheetModal.value = true;
};
const closeRateSheetModal = () => {
  showRateSheetModal.value = false;
};

const openEmailUpdateModal = () => {
  emailUpdateResult.value = null;
  emailUpdateFile.value = null;
  emailUpdateDryRun.value = true;
  emailUpdateCreateIfMissing.value = true;
  showEmailUpdateModal.value = true;
};
const closeEmailUpdateModal = () => {
  showEmailUpdateModal.value = false;
};

const openEmployeeInfoModal = () => {
  employeeInfoResult.value = null;
  employeeInfoFile.value = null;
  employeeInfoAgencyId.value = agencySort.value || '';
  employeeInfoDryRun.value = true;
  employeeInfoUseAi.value = true;
  showEmployeeInfoModal.value = true;
};
const closeEmployeeInfoModal = () => {
  showEmployeeInfoModal.value = false;
};

const onProviderListFileChange = (e) => {
  providerListFile.value = e?.target?.files?.[0] || null;
  providerBulkResult.value = null;
};

const runProviderBulkCreate = async () => {
  if (!providerListFile.value || !agencySort.value) return;
  try {
    providerBulkRunning.value = true;
    providerBulkResult.value = null;
    const fd = new FormData();
    fd.append('file', providerListFile.value);
    fd.append('agencyId', String(parseInt(agencySort.value, 10)));
    fd.append('useAi', providerUseAi.value ? 'true' : 'false');
    // Do NOT set Content-Type manually for FormData; the browser must set the boundary.
    const r = await api.post('/provider-import/bulk-create', fd);
    providerBulkResult.value = r.data;
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Provider import failed');
  } finally {
    providerBulkRunning.value = false;
  }
};

const onRateSheetFileChange = (e) => {
  rateSheetFile.value = e?.target?.files?.[0] || null;
  rateSheetResult.value = null;
};

const onEmailUpdateFileChange = (e) => {
  emailUpdateFile.value = e?.target?.files?.[0] || null;
  emailUpdateResult.value = null;
};

const onEmployeeInfoFileChange = (e) => {
  employeeInfoFile.value = e?.target?.files?.[0] || null;
  employeeInfoResult.value = null;
};

const runRateSheetImport = async () => {
  if (!rateSheetFile.value || !agencySort.value) return;
  try {
    rateSheetImporting.value = true;
    rateSheetResult.value = null;
    const fd = new FormData();
    fd.append('file', rateSheetFile.value);
    fd.append('agencyId', String(parseInt(agencySort.value, 10)));
    fd.append('dryRun', rateSheetDryRun.value ? 'true' : 'false');
    fd.append('useAi', rateSheetUseAi.value ? 'true' : 'false');
    // Do NOT set Content-Type manually for FormData; the browser must set the boundary.
    const r = await api.post('/payroll/rate-sheet/import', fd);
    rateSheetResult.value = r.data;
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Rate sheet import failed');
  } finally {
    rateSheetImporting.value = false;
  }
};

const runEmailUpdateImport = async () => {
  if (!emailUpdateFile.value || !agencySort.value) return;
  try {
    emailUpdateImporting.value = true;
    emailUpdateResult.value = null;
    const fd = new FormData();
    fd.append('file', emailUpdateFile.value);
    fd.append('agencyId', String(parseInt(agencySort.value, 10)));
    fd.append('dryRun', emailUpdateDryRun.value ? 'true' : 'false');
    fd.append('createIfMissing', emailUpdateCreateIfMissing.value ? 'true' : 'false');
    const r = await api.post('/provider-import/email-update', fd);
    emailUpdateResult.value = r.data;
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Email update import failed');
  } finally {
    emailUpdateImporting.value = false;
  }
};

const runEmployeeInfoImport = async () => {
  if (!employeeInfoFile.value || !employeeInfoAgencyId.value) return;
  try {
    employeeInfoImporting.value = true;
    employeeInfoResult.value = null;
    const fd = new FormData();
    fd.append('file', employeeInfoFile.value);
    fd.append('agencyId', String(parseInt(employeeInfoAgencyId.value, 10)));
    fd.append('dryRun', employeeInfoDryRun.value ? 'true' : 'false');
    fd.append('useAi', employeeInfoUseAi.value ? 'true' : 'false');
    const r = await api.post('/provider-import/employee-info', fd);
    employeeInfoResult.value = r.data;
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Employee info import failed');
  } finally {
    employeeInfoImporting.value = false;
  }
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

onMounted(async () => {
  // Ensure the current brand/agency selection is hydrated (used for default filters).
  try {
    const role = String(authStore.user?.role || '').toLowerCase();
    // For super admins, don't overwrite the brand/agency preview selection.
    if (role && role !== 'super_admin') {
      await agencyStore.fetchUserAgencies();
    }
  } catch {
    // ignore (best effort)
  }
  await Promise.all([fetchUsers(), fetchAgencies(), fetchPackages()]);
  resolveDefaultAgencyAndOrg();
});
</script>

<style scoped>
.user-name-link {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
}
.user-name-link:hover {
  text-decoration: underline;
}

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

.users-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 18px;
  align-items: start;
}

.filters-sidebar {
  position: sticky;
  top: 14px;
  padding: 14px;
  border: 1px solid var(--border, #dee2e6);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.05);
}

.filter-section {
  margin-bottom: 14px;
}

.filter-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}

.filter-input,
.filter-select {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--border, #dee2e6);
  border-radius: 10px;
  font-size: 14px;
  background: #fff;
}

.filter-help {
  font-size: 12px;
  margin-top: 6px;
}

.type-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.type-filter-btn {
  width: auto;
  padding: 6px 10px;
  line-height: 1.2;
}

.type-filter-btn.active {
  border-color: var(--primary, #C69A2B);
  color: var(--primary, #C69A2B);
  background: rgba(198, 154, 43, 0.08);
}

.advanced-filters {
  border-top: 1px solid var(--border, #dee2e6);
  padding-top: 12px;
}

.users-main {
  min-width: 0;
}

.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.sort-indicator {
  display: inline-block;
  width: 14px;
  text-align: center;
  color: var(--text-secondary, #6b7280);
  font-size: 11px;
}

.ai-query-card {
  border: 1px solid var(--border, #dee2e6);
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 16px;
  background: var(--bg, #fff);
  box-shadow: 0 6px 18px rgba(0,0,0,0.06);
}

.ai-query-banner {
  background: #0B1220;
}

.ai-query-banner-img {
  display: block;
  width: 100%;
  height: 140px;
  object-fit: cover;
}

.ai-query-body {
  padding: 12px 14px 14px 14px;
}

.ai-query-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.ai-query-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ai-query-icon {
  width: 28px;
  height: 28px;
}

.ai-query-title-text {
  font-weight: 700;
  color: var(--text-primary, #2c3e50);
}

.ai-query-subtitle {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  margin-top: 2px;
}

.ai-query-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ai-query-input-row {
  margin-bottom: 8px;
}

.ai-query-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border, #dee2e6);
  border-radius: 10px;
  font-size: 14px;
}

.ai-query-toggles {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 6px;
  margin-bottom: 6px;
}

.ai-query-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
}

.ai-query-toggle input[type="checkbox"] {
  transform: translateY(0.5px);
}

.ai-query-status {
  margin-top: 6px;
  margin-bottom: 6px;
}

.ai-query-results {
  margin-top: 10px;
  border-top: 1px solid var(--border, #dee2e6);
  padding-top: 10px;
}

.ai-query-results-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}

.ai-query-results-title {
  font-weight: 700;
  color: var(--text-primary, #2c3e50);
}

.ai-query-results-list {
  margin: 0;
  padding-left: 18px;
  max-height: 240px;
  overflow: auto;
}

.ai-query-results-list li {
  margin: 6px 0;
}

.ai-query-copy {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--border, #dee2e6);
  border-radius: 12px;
  background: var(--bg-alt, #f9fafb);
}

.ai-query-copy-label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}

.ai-query-copy-text {
  width: 100%;
  border: 1px solid var(--border, #dee2e6);
  border-radius: 10px;
  padding: 10px;
  font-size: 13px;
  resize: vertical;
}

.ai-query-copy-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.additional-filters {
  display: flex;
  gap: 20px;
  margin: 0 0 18px 0;
  flex-wrap: wrap;
}

.import-results {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border, #dee2e6);
  font-size: 14px;
}

.muted {
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
}

.admin-tools-bar {
  position: sticky;
  bottom: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px;
  margin-top: 16px;
  background: rgba(255,255,255,0.85);
  border: 1px solid var(--border, #dee2e6);
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.08);
  backdrop-filter: blur(8px);
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
  /* On smaller desktop screens, tables can exceed viewport width.
     Allow horizontal scrolling instead of clipping content. */
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.users-table-toolbar {
  display: none;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #dee2e6;
  background: #f8f9fa;
}

.users-table-toolbar-hint {
  font-size: 12px;
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
  vertical-align: middle;
}

.table-truncate {
  display: inline-block;
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

.user-affiliations-cell {
  position: relative;
}

.user-affiliations-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.user-affiliations-agencies {
  max-width: 320px;
  min-width: 0;
}

.user-affiliations-details-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.user-affiliations-details-btn {
  padding: 3px 8px;
  font-size: 12px;
}

.user-affiliations-popover {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 6px;
  min-width: 320px;
  max-width: 520px;
  background: #ffffff;
  border: 1px solid var(--border, #dee2e6);
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.15);
  z-index: 60;
}

.user-affiliations-popover-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-primary, #2c3e50);
  margin-bottom: 8px;
}

.user-affiliations-popover-item {
  padding: 6px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.user-affiliations-popover-item:first-of-type {
  border-top: none;
  padding-top: 0;
}

.user-affiliations-popover-item-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary, #2c3e50);
}

.actions-cell {
  white-space: nowrap;
  width: 1%;
  padding: 8px 4px !important;
  max-width: 400px;
  overflow-x: auto;
  overflow-y: hidden;
}

/* Responsive: make User Manager usable on 13" screens */
@media (max-width: 1100px) {
  .users-layout {
    grid-template-columns: 1fr;
  }

  .filters-sidebar {
    position: relative;
    top: auto;
  }

  .users-table-toolbar {
    display: flex;
  }

  /* Default collapsed view: show only the essentials */
  .users-table:not(.users-table--expanded) .col-email,
  .users-table:not(.users-table--expanded) .col-credential {
    display: none;
  }

  /* When expanded on smaller screens, allow horizontal scrolling */
  .users-table.users-table--expanded table {
    min-width: 1120px;
  }
}

@media (max-width: 900px) {
  .users-table:not(.users-table--expanded) .col-created {
    display: none;
  }
}

@media (max-width: 820px) {
  .users-table:not(.users-table--expanded) .col-status {
    display: none;
  }
}

@media (max-width: 900px) {
  .page-header {
    flex-wrap: wrap;
    gap: 12px;
  }

  .header-actions {
    flex-wrap: wrap;
  }

  th, td {
    padding: 10px 6px;
  }

  .table-truncate {
    max-width: 180px;
  }

  .user-affiliations-agencies {
    max-width: 240px;
  }
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

.inline-availability-toggle {
  margin-left: 6px;
  vertical-align: middle;
}
.mini-switch {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 18px;
}
.mini-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.mini-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: #cbd5e1;
  border: 1px solid var(--border);
  border-radius: 999px;
  transition: .15s;
}
.mini-slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 2px;
  top: 1px;
  background-color: white;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.18);
  transition: .15s;
}
.mini-switch input:checked + .mini-slider {
  background-color: var(--primary);
}
.mini-switch input:checked + .mini-slider:before {
  transform: translateX(16px);
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

