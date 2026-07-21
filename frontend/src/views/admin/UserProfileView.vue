<template>
  <div class="container">
    <div class="page-header">
      <router-link :to="backToUsersList" class="back-link" data-tour="user-profile-back">{{ backLinkLabel }}</router-link>

      <!-- Enhanced employee profile header -->
      <div v-if="!isViewingGuardian && !isSscMemberProfileMode && !isViewingSchoolStaff && user" class="ph-wrap" data-tour="user-profile-header">

        <div class="ph-photo-col">
          <div class="header-avatar ph-avatar">
            <img v-if="headerPhotoUrl" :src="headerPhotoUrl" alt="Profile photo" class="header-photo" />
            <div v-else class="header-photo-fallback" aria-hidden="true">{{ headerInitials }}</div>
          </div>
          <input ref="profilePhotoInput" type="file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp" style="display:none;" @change="onAdminPhotoSelected" data-tour="user-profile-photo-upload" />
          <button v-if="canEditUser" class="ph-upload-btn" type="button" @click="profilePhotoInput?.click()" :disabled="photoUploading">
            <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>
            {{ photoUploading ? 'Uploading…' : 'Upload New Photo' }}
          </button>
          <div v-if="photoError" class="ph-photo-err">{{ photoError }}</div>
        </div>

        <div class="ph-info-col">
          <div class="ph-name-row">
            <h1 class="ph-name" data-tour="user-profile-title">{{ headerDisplayName }}</h1>
            <span :class="['status-badge-header', getStatusBadgeClass(user.status, user.is_active)]">
              {{ getStatusLabel(user.status, user.is_active) }}
            </span>
            <span v-if="isOnLeave" class="status-badge-header status-badge-header--leave" :title="leaveOfAbsenceLabel">{{ leaveBadgeText }}</span>
            <button v-if="showLeaveOfAbsenceButton" type="button" class="btn btn-secondary btn-sm" @click="showLeaveOfAbsenceModal = true">
              {{ leaveOfAbsence?.departureDate ? 'Edit leave of absence' : 'Record leave of absence' }}
            </button>
            <div v-if="showGlobalAvailabilityInHeader" class="header-availability" :title="providerAcceptingNewClients ? 'OPEN (global)' : 'CLOSED (global)'" data-tour="user-profile-global-availability">
              <span class="header-availability-label">Global</span>
              <div class="toggle-switch toggle-switch-sm">
                <input type="checkbox" v-model="providerAcceptingNewClients" :disabled="!canToggleGlobalAvailability || updatingGlobalAvailability" @change="saveGlobalAvailability" />
                <span class="slider"></span>
              </div>
              <button type="button" class="header-availability-info" @click="showGlobalAvailabilityHint = !showGlobalAvailabilityHint">i</button>
              <div v-if="showGlobalAvailabilityHint" class="header-availability-hint">
                <strong>Reminder:</strong> Please ensure your schedule is open in Therapy Notes for the times that you are available via “Extra availability”.
              </div>
            </div>
            <button v-if="canRepairProviderSlots && isAffiliationTabActive && selectedSchoolAffiliationId" type="button" class="btn btn-secondary btn-sm" :disabled="repairingProviderSlots" @click="repairProviderSlots" title="Recalculate and repair stored slot availability for this affiliation">
              {{ repairingProviderSlots ? 'Repairing…' : 'Repair slots' }}
            </button>
          </div>

          <div v-if="user.title" class="ph-subtitle-role">{{ user.title }}</div>

          <div class="ph-contact-row">
            <span v-if="user.email" class="ph-contact-chip">
              <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
              {{ user.email }}
            </span>
            <span v-if="headerPhone" class="ph-contact-chip">
              <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>
              {{ headerPhone }}
            </span>
            <span v-if="headerLocation" class="ph-contact-chip">
              <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
              {{ headerLocation }}
            </span>
          </div>

          <div v-if="headerAcceptedInsurances.length" class="ph-accepted-insurance">
            <AcceptedInsuranceBadges :items="headerAcceptedInsurances" label="Insurance accepted" />
          </div>

          <div class="ph-metrics-bar">
            <div v-if="headerEmployeeId" class="ph-metric">
              <div class="ph-ml">Employee ID</div>
              <div class="ph-mv">{{ headerEmployeeId }}</div>
            </div>
            <div v-if="headerHireDate" class="ph-metric">
              <div class="ph-ml">Hire Date</div>
              <div class="ph-mv">{{ fmtHeaderDate(headerHireDate) }}</div>
            </div>
            <div v-if="headerStartDate" class="ph-metric">
              <div class="ph-ml">Start Date</div>
              <div class="ph-mv">{{ fmtHeaderDate(headerStartDate) }}</div>
            </div>
            <div v-if="headerManagerName" class="ph-metric">
              <div class="ph-ml">Manager</div>
              <div class="ph-mv">{{ headerManagerName }}</div>
            </div>
            <div v-if="headerSupervisorName" class="ph-metric">
              <div class="ph-ml">Supervisor</div>
              <div class="ph-mv">{{ headerSupervisorName }}</div>
            </div>
          </div>

          <div class="ph-search-wrap" data-tour="user-profile-search">
            <input
              v-model="profileSearchQuery"
              type="search"
              class="ph-search-input"
              placeholder="Search profile sections…"
              autocomplete="off"
              @focus="profileSearchOpen = true"
              @keydown.down.prevent="profileSearchMove(1)"
              @keydown.up.prevent="profileSearchMove(-1)"
              @keydown.enter.prevent="profileSearchSelectHighlighted"
              @keydown.esc="closeProfileSearch"
            />
            <div
              v-if="profileSearchOpen && profileSearchResults.length"
              class="ph-search-dropdown"
              role="listbox"
            >
              <button
                v-for="(hit, idx) in profileSearchResults"
                :key="hit.id"
                type="button"
                class="ph-search-option"
                :class="{ on: idx === profileSearchHighlight }"
                role="option"
                @mousedown.prevent="jumpToProfileSection(hit)"
              >
                <span class="ph-search-option-label">{{ hit.label }}</span>
                <span class="ph-search-option-tab">{{ hit.tabLabel }}</span>
              </button>
            </div>
            <p v-else-if="profileSearchOpen && profileSearchQuery.trim() && !profileSearchResults.length" class="ph-search-empty">
              No matching sections
            </p>
          </div>
        </div>

        <div v-if="user.status || headerServiceFocus || headerLanguages" class="ph-panel-col">
          <div class="ph-panel-item">
            <div class="ph-pl">Employee Status</div>
            <div :class="['ph-pv', user.is_active ? 'ph-pv--active' : '']">
              {{ getStatusLabel(user.status, user.is_active) }}
            </div>
          </div>
          <div v-if="headerServiceFocus" class="ph-panel-item">
            <div class="ph-pl">Service Focus</div>
            <div class="ph-pv">{{ headerServiceFocus }}</div>
          </div>
          <div v-if="headerLanguages" class="ph-panel-item">
            <div class="ph-pl">Languages</div>
            <div class="ph-pv">{{ headerLanguages }}</div>
          </div>
        </div>
      </div>

      <!-- Fallback compact header (guardian / SSC / school staff) -->
      <div v-else>
        <div class="user-header-info" data-tour="user-profile-header">
          <div class="header-avatar">
            <img v-if="headerPhotoUrl" :src="headerPhotoUrl" alt="Profile photo" class="header-photo" />
            <div v-else class="header-photo-fallback" aria-hidden="true">{{ headerInitials }}</div>
          </div>
          <h1 data-tour="user-profile-title">{{ headerDisplayName }}</h1>
          <span
            v-if="isSscMemberProfileMode && memberCaptainMeta.everTeamCaptain"
            class="sstc-captain-badge sstc-captain-badge--legacy"
            :title="`Team captain in ${memberCaptainMeta.captainTeamCount} season${memberCaptainMeta.captainTeamCount === 1 ? '' : 's'}`"
          >C</span>
          <span v-if="user" :class="['status-badge-header', getStatusBadgeClass(user.status, user.is_active)]">
            {{ getStatusLabel(user.status, user.is_active) }}
          </span>
          <span v-if="!isSscMemberProfileMode && !isViewingGuardian && isOnLeave" class="status-badge-header status-badge-header--leave" :title="leaveOfAbsenceLabel">{{ leaveBadgeText }}</span>
          <button v-if="!isSscMemberProfileMode && !isViewingGuardian && showLeaveOfAbsenceButton" type="button" class="btn btn-secondary btn-sm" @click="showLeaveOfAbsenceModal = true">
            {{ leaveOfAbsence?.departureDate ? 'Edit leave of absence' : 'Record leave of absence' }}
          </button>
          <div v-if="showGlobalAvailabilityInHeader" class="header-availability" :title="providerAcceptingNewClients ? 'OPEN (global)' : 'CLOSED (global)'" data-tour="user-profile-global-availability">
            <span class="header-availability-label">Global</span>
            <div class="toggle-switch toggle-switch-sm">
              <input type="checkbox" v-model="providerAcceptingNewClients" :disabled="!canToggleGlobalAvailability || updatingGlobalAvailability" @change="saveGlobalAvailability" />
              <span class="slider"></span>
            </div>
            <button type="button" class="header-availability-info" @click="showGlobalAvailabilityHint = !showGlobalAvailabilityHint">i</button>
            <div v-if="showGlobalAvailabilityHint" class="header-availability-hint"><strong>Reminder:</strong> Please ensure your schedule is open in Therapy Notes for the times that you are available via “Extra availability”.</div>
          </div>
          <button v-if="canRepairProviderSlots && isAffiliationTabActive && selectedSchoolAffiliationId" type="button" class="btn btn-secondary btn-sm" :disabled="repairingProviderSlots" @click="repairProviderSlots">{{ repairingProviderSlots ? 'Repairing…' : 'Repair slots' }}</button>
        </div>
        <p class="subtitle">{{ user?.email }}</p>
        <div v-if="canEditUser" style="margin-top: 10px;" data-tour="user-profile-photo-upload">
          <input ref="profilePhotoInput" type="file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp" style="display:none;" @change="onAdminPhotoSelected" />
          <button class="btn btn-secondary btn-sm" type="button" @click="profilePhotoInput?.click()" :disabled="photoUploading">{{ photoUploading ? 'Uploading…' : 'Upload Profile Photo' }}</button>
          <div v-if="photoError" class="error" style="margin:0;">{{ photoError }}</div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading user profile...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="profile-content">
      <div
        v-if="!isViewingGuardian && !isSscMemberProfileMode && !isViewingSchoolStaff"
        class="ph-search-wrap ph-search-wrap--tabs"
        data-tour="user-profile-search-tabs"
      >
        <input
          v-model="profileSearchQuery"
          type="search"
          class="ph-search-input"
          placeholder="Search profile sections (equipment, licenses, payroll…)"
          autocomplete="off"
          @focus="profileSearchOpen = true"
          @keydown.down.prevent="profileSearchMove(1)"
          @keydown.up.prevent="profileSearchMove(-1)"
          @keydown.enter.prevent="profileSearchSelectHighlighted"
          @keydown.esc="closeProfileSearch"
        />
        <div
          v-if="profileSearchOpen && profileSearchResults.length"
          class="ph-search-dropdown"
          role="listbox"
        >
          <button
            v-for="(hit, idx) in profileSearchResults"
            :key="hit.id"
            type="button"
            class="ph-search-option"
            :class="{ on: idx === profileSearchHighlight }"
            role="option"
            @mousedown.prevent="jumpToProfileSection(hit)"
          >
            <span class="ph-search-option-label">{{ hit.label }}</span>
            <span class="ph-search-option-tab">{{ hit.tabLabel }}</span>
          </button>
        </div>
        <p v-else-if="profileSearchOpen && profileSearchQuery.trim() && !profileSearchResults.length" class="ph-search-empty">
          No matching sections
        </p>
      </div>

      <div class="profile-tabs" data-tour="user-profile-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          @click="selectTab(tab.id)"
          :class="['profile-tab', { 'profile-tab--active': activeTab === tab.id }]"
          :aria-selected="activeTab === tab.id ? 'true' : 'false'"
          data-tour="user-profile-tab"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Force full remount when switching tabs to avoid Vue patch edge-cases across radically different subtrees -->
      <div
        class="tab-content"
        :class="{ 'tab-content--flush': activeTab === 'overview' || activeTab === 'account' || activeTab === 'benefits' || activeTab === 'provider_info' }"
        :key="activeTab"
        data-tour="user-profile-tab-content"
      >

        <!-- Overview tab (employee profiles only) -->
        <UserOverviewTab
          v-if="activeTab === 'overview' && !isViewingGuardian && !isSscMemberProfileMode && !isViewingSchoolStaff && user"
          :userId="userId"
          :user="user"
          :canEditUser="canEditUser"
          :canViewLifecycleTab="canViewLifecycleTab"
          :canViewCredentialingTab="canViewCredentialingTab"
          :canManageAssignments="canManageAssignments"
          :canViewActivityLog="canViewActivityLog"
          :canViewPayroll="canViewPayroll"
          :agencyId="agencyStore.currentAgency?.id"
          :preloadedOverview="overview"
          :preloadedOverviewLoading="overviewLoading"
          @navigate="selectTab"
          @perms-saved="onOverviewPermsSaved"
          @job-saved="onOverviewJobSaved"
        />

        <UserBenefitsTab
          v-if="activeTab === 'benefits' && !isViewingGuardian && !isSscMemberProfileMode && !isViewingSchoolStaff && user"
          :userId="userId"
          :user="user"
          :canEditUser="canEditUser"
          :canViewPayroll="canViewPayroll"
          :agencyId="agencyStore.currentAgency?.id"
          :isHourlyWorker="!!accountForm?.isHourlyWorker"
          @navigate="selectTab"
          @updated="onBenefitsUpdated"
        />

        <div v-if="activeTab === 'account'" class="tab-panel">
          <h2 v-if="isViewingGuardian || isSscMemberProfileMode">Account Information</h2>

          <!-- Guardian-specific info banner -->
          <div v-if="isViewingGuardian" style="background: #e8f4f8; border: 1px solid #b3d9ea; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; display: flex; align-items: flex-start; gap: 10px;">
            <span style="font-size: 20px; line-height: 1;">👤</span>
            <div>
              <strong>Guardian / Client Portal Account</strong>
              <p style="margin: 4px 0 0; font-size: 13px; color: #444;">
                This is a guardian (non-employee) portal account. They can access their client portal to view billing, waivers, and program information for their linked clients.
                This account does not go through the hiring workflow and has no payroll or contract settings.
              </p>
            </div>
          </div>

          <!-- Guardian insurance (from linked client intakes) -->
          <div v-if="isViewingGuardian" class="card" style="padding: 16px; margin-bottom: 18px;">
            <h3 style="margin: 0 0 6px;">Insurance</h3>
            <p class="hint" style="margin-top: 0;">
              Insurance details collected during each linked client's intake.
            </p>

            <div v-if="guardianLinkedClientsLoading" class="loading">Loading insurance…</div>
            <div v-else-if="guardianLinkedClientsError" class="error">{{ guardianLinkedClientsError }}</div>
            <div v-else-if="guardianLinkedClients.length === 0" class="empty-state">
              <p>No linked clients — no insurance to show.</p>
            </div>
            <div v-else>
              <div
                v-for="client in guardianLinkedClients"
                :key="`ins-client-${client.client_id}`"
                class="card"
                style="padding: 14px; margin-top: 12px; background: var(--bg-alt, #f8fafc);"
              >
                <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <strong>
                    <a href="" @click.prevent="openLinkedClient(client.client_id)" style="text-decoration: none;">
                      {{ client.full_name || client.initials || `Client ${client.client_id}` }}
                    </a>
                  </strong>
                  <span class="muted" style="font-size: 13px;">{{ client.organization_name || '—' }}</span>
                </div>

                <div v-if="guardianCommPrefsLoading[client.client_id]" class="muted" style="font-size: 13px;">Loading…</div>
                <div v-else>
                  <div v-if="(guardianInsuranceByClient[client.client_id] || []).length">
                    <div
                      v-for="f in guardianInsuranceByClient[client.client_id]"
                      :key="String(f.key || f.label)"
                      class="comm-pref-row"
                    >
                      <span class="comm-pref-label">{{ f.label }}</span>
                      <span class="comm-pref-value">
                        <button
                          v-if="isInsuranceCardField(f)"
                          type="button"
                          class="btn btn-secondary btn-sm"
                          @click="viewInsuranceCard(client.client_id, insuranceSlotFromFieldKey(f.key))"
                        >
                          View
                        </button>
                        <span v-else>{{ f.value || '—' }}</span>
                      </span>
                    </div>
                  </div>
                  <div v-else class="muted" style="font-size: 13px;">
                    No insurance information on file for this client.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="isSscMemberProfileMode" class="account-layout">
            <div class="account-main">
              <form v-if="canEditUser" @submit.prevent="saveAccount" class="account-form">
                <div class="form-actions-bar form-actions-bar--top">
                  <button v-if="!isEditingAccount" type="button" class="btn btn-secondary" @click="startEditAccount">
                    Edit
                  </button>
                  <button v-else type="submit" class="btn btn-primary" :disabled="saving">
                    {{ saving ? 'Saving...' : 'Save Changes' }}
                  </button>
                  <button v-if="isEditingAccount" type="button" class="btn btn-secondary" :disabled="saving" @click="cancelEditAccount">
                    Cancel
                  </button>
                </div>
                <div class="form-grid">
                  <div class="form-group">
                    <label>First Name</label>
                    <input v-model="accountForm.firstName" type="text" :disabled="!isEditingAccount" />
                  </div>
                  <div class="form-group">
                    <label>Last Name</label>
                    <input v-model="accountForm.lastName" type="text" :disabled="!isEditingAccount" />
                  </div>
                  <div class="form-group">
                    <label>Login Email</label>
                    <input v-model="accountForm.email" type="email" :disabled="!isEditingAccount" />
                  </div>
                  <div class="form-group">
                    <label>Phone</label>
                    <input v-model="accountForm.personalPhone" type="tel" :disabled="!isEditingAccount" />
                  </div>
                  <div v-if="canManageClubMemberRoles" class="form-group form-group-full">
                    <label>Club account role</label>
                    <select v-model="accountForm.role" :disabled="!isEditingAccount" class="agency-select">
                      <option value="member">Member</option>
                      <option value="assistant_manager">Assistant manager</option>
                    </select>
                    <small class="form-help">
                      <strong>Member</strong> is the default (season participation, workouts).
                      <strong>Assistant manager</strong> can approve applications and use club manager tools.
                      Season <strong>team captain</strong> is set per season on the Season History tab (not a global account role).
                    </small>
                  </div>
                  <div v-else class="form-group form-group-full">
                    <label>Club account role</label>
                    <input :value="sscClubRoleReadOnlyLabel" type="text" disabled />
                  </div>
                </div>
                <div v-if="isEditingAccount" class="form-actions-bar form-actions-bar--bottom">
                  <button type="submit" class="btn btn-primary" :disabled="saving">
                    {{ saving ? 'Saving...' : 'Save Changes' }}
                  </button>
                  <button type="button" class="btn btn-secondary" :disabled="saving" @click="cancelEditAccount">
                    Cancel
                  </button>
                </div>
              </form>
              <div v-else class="view-only-message">
                <p><strong>View Only:</strong> You do not have permission to edit this member profile.</p>
              </div>

              <div class="section-divider" style="margin-top: 18px;">
                <h3>Registration Details</h3>
              </div>
              <div v-if="memberSeasonHistoryLoading" class="loading">Loading registration details...</div>
              <div v-else-if="memberSeasonHistoryError" class="error">{{ memberSeasonHistoryError }}</div>
              <div v-else class="form-grid">
                <div class="form-group">
                  <label>Phone (from application)</label>
                  <input :value="memberRegistrationPhoneDisplay" type="text" disabled />
                </div>
                <div class="form-group">
                  <label>Gender</label>
                  <input :value="memberRegistrationGenderDisplay" type="text" disabled />
                </div>
                <div class="form-group">
                  <label>Date of Birth</label>
                  <input :value="memberRegistrationDobDisplay" type="text" disabled />
                </div>
                <div class="form-group">
                  <label>Weight</label>
                  <input :value="memberRegistrationWeightDisplay" type="text" disabled />
                </div>
                <div class="form-group">
                  <label>Height</label>
                  <input :value="memberRegistrationHeightDisplay" type="text" disabled />
                </div>
                <div class="form-group">
                  <label>Timezone</label>
                  <input :value="memberRegistrationProfile.timezone || 'Not provided'" type="text" disabled />
                </div>
                <div class="form-group">
                  <label>Current Training Load</label>
                  <input :value="memberRegistrationWeeklyLoadDisplay" type="text" disabled />
                </div>
                <div class="form-group">
                  <label>Waiver</label>
                  <input :value="memberRegistrationWaiverDisplay" type="text" disabled />
                </div>
                <div class="form-group form-group-full" v-if="memberRegistrationProfile.heardAboutClub">
                  <label>How They Heard About The Club</label>
                  <textarea :value="memberRegistrationProfile.heardAboutClub" rows="2" disabled />
                </div>
                <div class="form-group form-group-full" v-if="memberRegistrationProfile.runningFitnessBackground">
                  <label>Running &amp; Fitness Background</label>
                  <textarea :value="memberRegistrationProfile.runningFitnessBackground" rows="4" disabled />
                </div>
                <div class="form-group form-group-full" v-if="memberRegistrationProfile.currentFitnessActivities">
                  <label>Current Running &amp; Fitness Activities</label>
                  <textarea :value="memberRegistrationProfile.currentFitnessActivities" rows="4" disabled />
                </div>
                <div class="form-group form-group-full" v-if="memberRegistrationCustomFieldsList.length">
                  <label>Application Custom Fields</label>
                  <div class="texting-number-display">
                    <span v-for="item in memberRegistrationCustomFieldsList" :key="item.key" class="badge badge-info" style="margin-right: 8px; margin-bottom: 6px;">
                      {{ item.key }}: {{ item.value }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="section-divider" style="margin-top: 18px;">
                <h3>Integrations</h3>
              </div>
              <div class="form-grid">
                <div class="form-group form-group-full">
                  <label>Strava</label>
                  <input value="Strava — coming soon (pending)" type="text" disabled />
                  <small class="form-help">
                    Member Strava status is not shown here. Eligible accounts connect under My account → Fitness integrations when enabled.
                  </small>
                </div>
              </div>
            </div>
          </div>

          <UserAccountDashboard v-else>
            <template #view-only>
              <div v-if="!canEditUser" class="view-only-notice">
                <p><strong>View Only:</strong> Clinical Practice Assistants and Supervisors have view-only access to user profiles. Contact an administrator to make changes.</p>
              </div>
            </template>

            <template #feature-access>
              <AccountDashboardCard section-id="feature-access" title="Feature Access" subtitle="Per-user entitlements and billing." :can-edit="false">
              <div v-if="!isViewingGuardian && canManageFeatureAccess && perUserFeatureAccessRows.length > 0" class="feature-access-section">
                <p class="feature-access-help">
                  Per-user entitlements driven by the platform feature catalog. Toggling here writes a
                  billing event for the user's primary tenant; charges are pro-rated to the day.
                </p>
                <div v-if="featureAccessError" class="error">{{ featureAccessError }}</div>
                <div class="feature-access-grid">
                  <div
                    v-for="row in perUserFeatureAccessRows"
                    :key="`fa-${row.key}`"
                    class="feature-access-row"
                  >
                    <div class="feature-access-meta">
                      <div class="feature-access-label">{{ row.label }}</div>
                      <div class="feature-access-desc">{{ row.description }}</div>
                      <div class="feature-access-price">
                        <span v-if="row.userMonthlyCents > 0">
                          ${{ (row.userMonthlyCents / 100).toFixed(2) }} / user / mo
                        </span>
                        <span v-if="row.minProrationDays > 0" class="muted">
                          · min {{ row.minProrationDays }}d charge
                        </span>
                      </div>
                    </div>
                    <label class="compact-toggle">
                      <span class="compact-title">Entitled</span>
                      <div class="toggle-switch toggle-switch-sm">
                        <input
                          type="checkbox"
                          :checked="!!row.enabled"
                          :disabled="!!row.saving || !canManageFeatureAccess"
                          @change="onToggleFeatureAccess(row, $event.target.checked)"
                        />
                        <span class="slider"></span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
              </AccountDashboardCard>
            </template>

            <template #agency-assignments>
              <AccountDashboardCard section-id="agency-assignments" title="Agency Assignments" :can-edit="canEditUser">
              <div class="agency-assignments-section">
                <div class="agency-assignments">
                  <div v-if="affiliatedAgencies.length === 0" class="no-agencies">
                    <p>No agencies assigned</p>
                  </div>
                  <div v-else class="agencies-list">
                    <div v-for="agency in affiliatedAgencies" :key="agency.id" class="agency-item">
                      <div class="agency-item-left">
                        <div class="agency-item-row">
                          <span class="agency-name">{{ agency.name }}</span>

                          <div
                            v-if="(affiliatedOrgsByAgencyId[String(agency.id)] || []).length > 0"
                            class="affiliations-details-wrap"
                            @mouseenter="openAffiliationsPopover(Number(agency.id))"
                            @mouseleave="closeAffiliationsPopover(Number(agency.id))"
                          >
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm affiliations-details-trigger"
                              @click.prevent="toggleAffiliationsPopover(Number(agency.id))"
                              :aria-expanded="isAffiliationsPopoverOpenFor(Number(agency.id)) ? 'true' : 'false'"
                              :title="`Show affiliated orgs (${(affiliatedOrgsByAgencyId[String(agency.id)] || []).length})`"
                            >
                              Schools
                              <span class="muted" style="font-weight: 700;">
                                ({{ (affiliatedOrgsByAgencyId[String(agency.id)] || []).length }})
                              </span>
                            </button>

                            <div v-if="isAffiliationsPopoverOpenFor(Number(agency.id))" class="affiliations-popover">
                              <div class="affiliations-popover-title">
                                Affiliated orgs under {{ agency.name }}
                              </div>
                              <div
                                v-for="org in (affiliatedOrgsByAgencyId[String(agency.id)] || [])"
                                :key="org.id"
                                class="affiliations-popover-item"
                              >
                                <div class="affiliations-popover-item-left">
                                  <div class="affiliations-popover-item-name">
                                    {{ org.name }}
                                    <span v-if="org.organization_type" class="muted" style="font-size: 11px; font-weight: 800;">
                                      ({{ org.organization_type }})
                                    </span>
                                  </div>
                                  <div class="affiliations-popover-item-actions">
                                    <button
                                      v-if="isAffiliationOrg(org)"
                                      class="btn btn-secondary btn-sm"
                                      type="button"
                                      @click="openSchoolSchedulingFromAgencyRow(org)"
                                    >
                                      Days &amp; slots
                                    </button>
                                    <button
                                      v-if="canEditUser"
                                      class="btn btn-danger btn-sm"
                                      type="button"
                                      @click="removeAgency(org.id)"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              </div>
                              <div class="muted" style="font-size: 12px; margin-top: 8px;">
                                Tip: hover to peek, click to pin open.
                              </div>
                            </div>
                          </div>
                        </div>

                        <div
                          v-if="canEditUser"
                          class="agency-item-row"
                          title="Optional per-organization login email alias. Leave empty to use the primary login email above."
                        >
                          <span class="muted" style="font-size: 12px; font-weight: 700;">Login Email</span>
                          <input
                            class="agency-select"
                            style="min-width: 240px;"
                            :value="aliasForAgency(agency.id)"
                            :disabled="savingAgencyAliasId === agency.id"
                            placeholder="alias@domain.com"
                            @change="saveAliasForAgency(agency.id, $event.target.value)"
                          />
                        </div>

                        <div
                          v-if="canEditUser && canShowH0032Mode"
                          class="agency-item-row"
                          title="H0032 mode is per-organization. Cat1 Hour means H0032 rows require manual minutes entry and will appear in Payroll → Raw Import → Process H0032. Cat2 Flat means H0032 defaults to 30 minutes and will not appear in that queue."
                        >
                          <span class="muted" style="font-size: 12px; font-weight: 700;">H0032</span>
                          <select
                            :value="h0032ModeForAgency(agency)"
                            class="agency-select"
                            style="min-width: 170px;"
                            :disabled="updatingH0032AgencyId === agency.id"
                            @change="setH0032Mode(agency.id, $event.target.value)"
                          >
                            <option value="cat1_hour">Cat1 Hour (manual minutes)</option>
                            <option value="cat2_flat">Cat2 Flat (auto 30 min)</option>
                          </select>
                        </div>

                        <div
                          v-if="canShowPrelicensedSupervision"
                          class="agency-item-row"
                          style="flex-wrap: wrap;"
                          title="Prelicensed supervision tracking is per-organization. Manual start date is informational; baseline hours are added to accrued payroll supervision hours (99414/99416). Pay for 99414/99416 is $0 until the user has already reached ≥50 individual and ≥100 total hours in prior pay periods."
                        >
                          <span class="muted" style="font-size: 12px; font-weight: 700;">Prelicensed</span>
                          <label class="muted" style="display:flex; align-items:center; gap: 6px;">
                            <input
                              type="checkbox"
                              :checked="isPrelicensedForAgency(agency)"
                              :disabled="!canEditUser || updatingPrelicensedAgencyId === agency.id || !isEditingPrelicensedForAgency(agency)"
                              @change="savePrelicensedSettings(agency, { isPrelicensed: $event.target.checked })"
                            />
                            <span>{{ isPrelicensedForAgency(agency) ? 'On' : 'Off' }}</span>
                          </label>
                          <button
                            v-if="canEditUser"
                            type="button"
                            class="btn btn-secondary btn-sm"
                            :disabled="updatingPrelicensedAgencyId === agency.id"
                            @click="togglePrelicensedEdit(agency.id)"
                          >
                            {{ isEditingPrelicensedForAgency(agency) ? 'Done' : 'Edit' }}
                          </button>
                          <div
                            v-if="isPrelicensedForAgency(agency)"
                            class="prelicensed-field"
                          >
                            <input
                              type="date"
                              class="agency-select"
                              style="min-width: 155px;"
                              :value="prelicensedStartDateForAgency(agency)"
                              :disabled="!canEditUser || updatingPrelicensedAgencyId === agency.id || !isEditingPrelicensedForAgency(agency)"
                              @change="savePrelicensedSettings(agency, { startDate: $event.target.value })"
                            />
                            <span class="prelicensed-caption">Manual start date</span>
                          </div>
                          <div v-if="isPrelicensedForAgency(agency)" class="prelicensed-hours">
                            <div class="prelicensed-field">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                class="agency-select"
                                style="min-width: 130px;"
                                placeholder="0.00"
                                :value="prelicensedStartIndHoursForAgency(agency)"
                                :disabled="!canEditUser || updatingPrelicensedAgencyId === agency.id || !isEditingPrelicensedForAgency(agency)"
                                @change="savePrelicensedSettings(agency, { startIndividualHours: $event.target.value })"
                              />
                              <span class="prelicensed-caption">sindividaul</span>
                            </div>
                            <div class="prelicensed-field">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                class="agency-select"
                                style="min-width: 130px;"
                                placeholder="0.00"
                                :value="prelicensedStartGrpHoursForAgency(agency)"
                                :disabled="!canEditUser || updatingPrelicensedAgencyId === agency.id || !isEditingPrelicensedForAgency(agency)"
                                @change="savePrelicensedSettings(agency, { startGroupHours: $event.target.value })"
                              />
                              <span class="prelicensed-caption">group</span>
                            </div>
                            <div class="prelicensed-hours-caption">supervision hours</div>
                          </div>
                        </div>
                      </div>

                      <button v-if="canEditUser" @click="removeAgency(agency.id)" class="btn btn-danger btn-sm">Remove</button>
                    </div>
                  </div>

                  <div
                    v-if="(unaffiliatedOrgs || []).length > 0"
                    class="unaffiliated-orgs-row"
                    @mouseenter="openAffiliationsPopover(0)"
                    @mouseleave="closeAffiliationsPopover(0)"
                  >
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm affiliations-details-trigger"
                      @click.prevent="toggleAffiliationsPopover(0)"
                      :aria-expanded="isAffiliationsPopoverOpenFor(0) ? 'true' : 'false'"
                      title="Organizations not linked to an agency"
                    >
                      Other affiliations
                      <span class="muted" style="font-weight: 700;">({{ (unaffiliatedOrgs || []).length }})</span>
                    </button>
                    <div v-if="isAffiliationsPopoverOpenFor(0)" class="affiliations-popover affiliations-popover--below">
                      <div class="affiliations-popover-title">Other affiliations</div>
                      <div v-for="org in (unaffiliatedOrgs || [])" :key="org.id" class="affiliations-popover-item">
                        <div class="affiliations-popover-item-left">
                          <div class="affiliations-popover-item-name">
                            {{ org.name }}
                            <span v-if="org.organization_type" class="muted" style="font-size: 11px; font-weight: 800;">
                              ({{ org.organization_type }})
                            </span>
                          </div>
                          <div class="affiliations-popover-item-actions">
                            <button
                              v-if="isAffiliationOrg(org)"
                              class="btn btn-secondary btn-sm"
                              type="button"
                              @click="openSchoolSchedulingFromAgencyRow(org)"
                            >
                              Days &amp; slots
                            </button>
                            <button
                              v-if="canEditUser"
                              class="btn btn-danger btn-sm"
                              type="button"
                              @click="removeAgency(org.id)"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div v-if="canEditUser" class="add-agency-section">
                    <select v-model="selectedAgencyId" class="agency-select">
                      <option value="">Select an organization...</option>
                      <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
                        {{ agency.name }}
                        <span v-if="agency.organization_type">({{ agency.organization_type }})</span>
                      </option>
                    </select>
                    <input
                      v-if="selectedAgencyAllowsAlias"
                      v-model="newAgencyLoginEmail"
                      class="agency-select"
                      style="min-width: 260px;"
                      placeholder="Optional login email alias (agencies only)"
                      :disabled="!selectedAgencyId || assigningAgency"
                    />
                    <button @click="addAgency" class="btn btn-primary btn-sm" :disabled="!selectedAgencyId || assigningAgency">
                      {{ assigningAgency ? 'Assigning...' : 'Assign' }}
                    </button>
                  </div>
                  <div v-else class="muted" style="font-size: 12px;">
                    Only admins can change agency assignments.
                  </div>
                </div>
              </div>
              </AccountDashboardCard>
            </template>

            <template #public-profile>
              <AccountDashboardCard
                v-if="isProviderLikeUser"
                section-id="public-profile"
                title="Public Provider Profile"
                subtitle="Agency Finder card details visible to the public."
                :can-edit="canEditUser"
                :editing="false"
              >
                <template #actions>
                  <button
                    class="btn btn-primary btn-sm"
                    type="button"
                    :disabled="!canEditUser || providerPublicProfileSaving || !selectedProviderProfileAgencyId"
                    @click="saveProviderPublicProfile"
                  >
                    {{ providerPublicProfileSaving ? 'Saving…' : 'Save' }}
                  </button>
                </template>
                <div v-if="providerPublicProfileLoading" class="loading">Loading provider public profile…</div>
                <div v-else-if="providerPublicProfileError" class="error">{{ providerPublicProfileError }}</div>
                <div v-else class="form-grid" style="margin-top: 0;">
                  <div class="form-group form-group-full">
                    <label>Public provider blurb (view-only for providers)</label>
                    <textarea
                      v-model="providerPublicBlurb"
                      rows="4"
                      placeholder="Shown on public Find a Provider card details."
                      :disabled="!canEditUser || providerPublicProfileSaving"
                      style="width: 100%;"
                    />
                  </div>
                  <div class="form-group form-group-full">
                    <label>Insurances shown on profile</label>
                    <AcceptedInsuranceBadges
                      v-if="headerAcceptedInsurances.length"
                      :items="headerAcceptedInsurances"
                      :show-label="false"
                    />
                    <small v-else class="form-help">No credentialing insurances yet. Supervisees inherit billing supervisor insurances when assigned.</small>
                    <div style="margin-top: 8px;">
                      <label style="font-size: 12px; font-weight: 400; color: var(--text-secondary);">Edit CSV (comma separated)</label>
                      <input
                        v-model="providerPublicInsurancesCsv"
                        type="text"
                        placeholder="Medicaid, Self Pay, Tricare"
                        :disabled="!canEditUser || providerPublicProfileSaving"
                      />
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Provider self-pay override (USD)</label>
                    <input
                      v-model.number="providerSelfPayRateUsd"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Leave blank to use agency default"
                      :disabled="!canEditUser || providerPublicProfileSaving"
                    />
                  </div>
                  <div class="form-group">
                    <label>Provider self-pay note</label>
                    <input
                      v-model="providerSelfPayRateNote"
                      type="text"
                      placeholder="Optional note shown publicly"
                      :disabled="!canEditUser || providerPublicProfileSaving"
                    />
                  </div>
                  <div class="form-group">
                    <label>Agency default self-pay (USD)</label>
                    <input
                      v-model.number="agencyDefaultSelfPayRateUsd"
                      type="number"
                      min="0"
                      step="0.01"
                      :disabled="!canEditUser || providerPublicProfileSaving"
                    />
                  </div>
                  <div class="form-group form-group-full">
                    <label>Agency finder intro blurb</label>
                    <textarea
                      v-model="agencyFinderIntroBlurb"
                      rows="3"
                      placeholder="Intro paragraph shown above provider cards."
                      :disabled="!canEditUser || providerPublicProfileSaving"
                      style="width: 100%;"
                    />
                    <small class="form-help">
                      Active agency: {{ selectedProviderProfileAgencyName || 'Select/assign an agency first' }}
                    </small>
                  </div>
                </div>
              </AccountDashboardCard>

              <AccountDashboardCard
                section-id="admin-tools"
                title="Admin Tools"
                :can-edit="false"
              >
                <div v-if="accountInfoLoading" class="loading">Loading account information...</div>
                <div v-else-if="accountInfoError" class="error">{{ accountInfoError }}</div>
                <div v-else-if="!isViewingGuardian" class="download-section">
                  <p class="download-description">
                    Download a complete package of all completed items for this user, including signed documents,
                    certificates, completion confirmations, and quiz scores.
                  </p>
                  <button
                    @click="downloadCompletionPackage"
                    class="btn btn-primary btn-sm"
                    :disabled="downloadingPackage"
                  >
                    {{ downloadingPackage ? 'Generating...' : 'Download Completion Package' }}
                  </button>
                </div>
              </AccountDashboardCard>
            </template>

            <template #workspace-security>
              <AccountDashboardCard section-id="workspace-security" title="Workspace & Security" :can-edit="false">
            <div class="password-status-layout">
              <div v-if="accountInfo.ssoPolicyRequired" class="reset-password-section">
                <h4>Workspace Sign-in Policy</h4>
                <p v-if="accountInfo.ssoRequired">
                  Workspace login is enforced for this user by agency and role.
                </p>
                <p v-else>
                  Admin password override is enabled for this user. Password reset and temporary password actions are allowed.
                </p>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="savingSsoPasswordOverride"
                  @click="toggleSsoPasswordOverride(!accountInfo.ssoPasswordOverride)"
                >
                  {{
                    savingSsoPasswordOverride
                      ? 'Saving...'
                      : (accountInfo.ssoPasswordOverride ? 'Re-enable Workspace-only sign-in' : 'Enable password login override')
                  }}
                </button>
              </div>

              <div v-if="!canUsePasswordResetActions" class="reset-password-section">
                <h4>Password Access</h4>
                <p>This user’s organization requires Google sign-in. Password reset links and temporary passwords are disabled for this user.</p>
              </div>

              <template v-else>
                <!-- Reset Password Link (expires) - only for non-pending users; pending users use Direct Login Link in Account Info -->
                <div v-if="!isPendingForReset" class="reset-password-section">
                  <h4>Password Reset Link</h4>
                  <p>Generate a reset link (expires). The user will set a new password and continue.</p>
                  <!-- Current reset link state (when we have a reset token from getAccountInfo) -->
                  <div v-if="accountInfo.passwordlessTokenPurpose === 'reset' && accountInfo.passwordlessLoginLink" class="passwordless-link-section" style="margin-top: 12px; padding: 16px; background: var(--bg-alt); border-radius: 8px; border: 1px solid var(--border);">
                    <div v-if="accountInfo.passwordlessTokenExpiresAt" style="margin-bottom: 12px; padding: 10px; background: var(--bg); border-radius: 6px; border: 1px solid var(--border);">
                      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <div>
                          <strong>Link Status:</strong>
                          <span :style="{ color: accountInfo.passwordlessTokenIsExpired ? '#dc3545' : '#28a745', marginLeft: '8px' }">
                            {{ accountInfo.passwordlessTokenIsExpired ? 'Expired' : 'Valid' }}
                          </span>
                        </div>
                        <div style="text-align: right;">
                          <div><strong>Expires:</strong> {{ formatTokenExpiration(accountInfo.passwordlessTokenExpiresAt) }}</div>
                          <div v-if="!accountInfo.passwordlessTokenIsExpired && accountInfo.passwordlessTokenExpiresInHours != null" style="font-size: 12px; color: #666;">
                            ({{ formatTimeUntilExpiry(accountInfo.passwordlessTokenExpiresInHours) }})
                          </div>
                        </div>
                      </div>
                    </div>
                    <div v-if="accountInfo.resetLinkSentAt || accountInfo.resetLinkSentByEmail" style="font-size: 13px; color: #555; margin-bottom: 8px;">
                      <span v-if="accountInfo.resetLinkSentByEmail">Sent by {{ accountInfo.resetLinkSentByEmail }}</span>
                      <span v-if="accountInfo.resetLinkSentAt"> on {{ formatTokenExpiration(accountInfo.resetLinkSentAt) }}</span>
                    </div>
                    <div v-if="accountInfo.resetLinkUsedAt" style="font-size: 13px; color: #555; margin-bottom: 8px;">
                      Used on {{ formatTokenExpiration(accountInfo.resetLinkUsedAt) }}
                    </div>
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                      <input
                        type="text"
                        :value="accountInfo.passwordlessLoginLink"
                        readonly
                        style="flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; font-family: monospace; background: var(--bg); cursor: text;"
                        @click="$event.target.select()"
                      />
                      <button type="button" class="btn btn-primary btn-sm" @click="copyCurrentResetLink">Copy Link</button>
                      <button type="button" class="btn btn-secondary btn-sm" @click="openResetLinkModalFromAccountInfo">Open in modal</button>
                    </div>
                    <p v-if="!accountInfo.passwordlessTokenIsExpired" style="font-size: 12px; color: #666; margin-bottom: 10px;">
                      A valid link is active until {{ formatTokenExpiration(accountInfo.passwordlessTokenExpiresAt) }}. Send a new link to invalidate this one.
                    </p>
                  </div>
                  <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <button
                      @click="generateResetPasswordLink(false)"
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="generatingResetLink"
                    >
                      {{ generatingResetLink ? 'Generating...' : 'Send Reset Password Link' }}
                    </button>
                    <button
                      v-if="accountInfo.passwordlessTokenPurpose === 'reset' && accountInfo.passwordlessLoginLink && !accountInfo.passwordlessTokenIsExpired"
                      @click="generateResetPasswordLink(true)"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="generatingResetLink"
                    >
                      {{ generatingResetLink ? 'Generating...' : 'Send new link (invalidate current)' }}
                    </button>
                  </div>
                </div>

                <!-- Temporary Password (first-login only) -->
                <div v-if="canUseTempPassword" class="reset-password-section">
                  <h4>Temporary Password</h4>
                  <p>Generate an expiring temporary password. Send the username + temporary password to the user. After login, they will be prompted to set a new password.</p>
                  <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <button
                      @click="generateTemporaryPasswordForUser"
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="generatingTempPassword || settingCustomTempPassword"
                    >
                      {{ generatingTempPassword ? 'Generating...' : 'Generate Temporary Password' }}
                    </button>
                    <span class="muted">or</span>
                    <input
                      v-model="customTempPasswordInput"
                      type="text"
                      placeholder="Custom password (min 8 chars)"
                      class="form-control form-control-sm"
                      style="max-width: 220px;"
                      :disabled="generatingTempPassword || settingCustomTempPassword"
                    />
                    <button
                      @click="setCustomTemporaryPasswordForUser"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="!customTempPasswordInput?.trim() || customTempPasswordInput?.trim().length < 8 || generatingTempPassword || settingCustomTempPassword"
                    >
                      {{ settingCustomTempPassword ? 'Setting...' : 'Set Custom Temporary Password' }}
                    </button>
                  </div>
                </div>
              </template>
            </div>
              </AccountDashboardCard>
            </template>

            <template #status-management>
              <AccountDashboardCard section-id="status-management" title="Status Management" :can-edit="false">
              <div class="status-management">
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

                <!-- Manual status change: admin/super_admin/support only -->
                <div
                  v-if="canChangeStatusManually"
                  class="status-change-dropdown"
                  style="margin: 1rem 0;"
                >
                  <label for="status-select">Change status:</label>
                  <select
                    id="status-select"
                    :value="user.status"
                    class="form-control form-control-sm"
                    style="max-width: 240px; display: inline-block; margin-left: 8px;"
                    :disabled="updatingStatus"
                    @change="onStatusChange"
                  >
                    <option :value="user.status" disabled>{{ getStatusLabel(user.status, user.is_active) }} (current)</option>
                    <option
                      v-for="s in availableStatusesForChange"
                      :key="s"
                      :value="s"
                    >
                      {{ getStatusLabel(s, true) }}
                    </option>
                  </select>
                  <p v-if="statusChangeError" class="error" style="margin-top: 6px;">{{ statusChangeError }}</p>
                </div>
                
                <div class="status-actions">
                  <!-- For PREHIRE_REVIEW users: Show "Promote to Onboarding" button -->
                  <button 
                    v-if="(user.status === 'PREHIRE_REVIEW' || user.status === 'ready_for_review') && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support') && authStore.user?.role !== 'clinical_practice_assistant'"
                    @click="promoteToOnboarding" 
                    class="btn btn-primary btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Processing...' : 'Promote to Onboarding' }}
                  </button>
                  
                  <!-- Legacy: For ready_for_review users: Show "Mark as Reviewed and Activate" button -->
                  <button 
                    v-if="user.status === 'ready_for_review' && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support') && authStore.user?.role !== 'clinical_practice_assistant'"
                    @click="handleMarkAsReviewedAndActivate" 
                    class="btn btn-primary btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Processing...' : 'Mark as Reviewed and Activate' }}
                  </button>
                  
                  <!-- Admins can mark ONBOARDING users as ACTIVE_EMPLOYEE -->
                  <button 
                    v-if="(user.status === 'PENDING_SETUP' || user.status === 'ONBOARDING' || user.status === 'PREHIRE_OPEN' || user.status === 'PREHIRE_REVIEW' || user.status === 'pending' || user.status === 'active') && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support') && authStore.user?.role !== 'clinical_practice_assistant'"
                    @click="markComplete" 
                    class="btn btn-success btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Processing...' : 'Mark Active' }}
                  </button>
                  
                  <!-- Mark Terminated: Only for ACTIVE_EMPLOYEE users -->
                  <button 
                    v-if="(user.status === 'ACTIVE_EMPLOYEE' || user.status === 'active') && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support' || authStore.user?.role === 'staff' || (authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)))"
                    @click="markTerminated" 
                    class="btn btn-danger btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Updating...' : 'Mark Terminated' }}
                  </button>
                  
                  <!-- Mark inactive: standard offboard (removes org/school links; keeps record) -->
                  <button
                    v-if="user.status !== 'ARCHIVED' && user.status !== 'INACTIVE_EMPLOYEE' && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support') && authStore.user?.role !== 'clinical_practice_assistant'"
                    type="button"
                    @click="markStaffInactive"
                    class="btn btn-warning btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Working...' : 'Mark inactive' }}
                  </button>

                  <!-- Archive: super admin only (hard lifecycle; managed in Archive settings) -->
                  <button
                    v-if="user.status !== 'ARCHIVED' && user.status !== 'INACTIVE_EMPLOYEE' && authStore.user?.role === 'super_admin'"
                    @click="archiveUser"
                    class="btn btn-outline-warning btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Archiving...' : 'Archive' }}
                  </button>

                  <!-- Reactivate from inactive -->
                  <button
                    v-if="user.status === 'INACTIVE_EMPLOYEE' && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support' || authStore.user?.role === 'staff' || (authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)))"
                    @click="markActive"
                    class="btn btn-secondary btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Updating...' : 'Reactivate' }}
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
              </AccountDashboardCard>
            </template>

            <template #supervisor-assignments>
              <AccountDashboardCard v-if="showAdditionalAccountSections" section-id="supervisor-assignments" title="Supervisor Assignments" :can-edit="false">
                <div v-if="canManageAssignments" class="supervisor-assignments-section">
                  <SupervisorAssignmentManager
                    :supervisor-id="(user && (isSupervisor(user) || user.role === 'clinical_practice_assistant')) ? userId : null"
                    :supervisee-id="(user && !((isSupervisor(user) || user.role === 'clinical_practice_assistant'))) ? userId : null"
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
                  <div v-else class="assignments-info">
                    <h4>Assigned Supervisors</h4>
                    <div v-if="supervisorsLoading" class="loading">Loading supervisors...</div>
                    <div v-else-if="supervisors.length === 0" class="empty-state">
                      <p>No supervisors assigned.</p>
                    </div>
                    <div v-else class="supervisors-list">
                      <div v-for="supervisor in supervisors" :key="supervisor.id" class="supervisor-item">
                        <span>
                          {{ supervisor.supervisor_first_name }} {{ supervisor.supervisor_last_name }}
                          <span class="supervisor-type-pill">{{ supervisorTypeLabel(supervisor.supervisor_type) }}</span>
                          <span v-if="supervisor.is_primary" class="primary-pill">Primary</span>
                        </span>
                        <small style="color: var(--text-secondary);">{{ supervisor.supervisor_email }}</small>
                      </div>
                    </div>
                  </div>
                </div>
              </AccountDashboardCard>
            </template>

            <template #building-offices>
              <AccountDashboardCard v-if="canManageAssignments && showAdditionalAccountSections" section-id="building-offices" title="Assigned Building Offices" subtitle="Office links for scheduling and school mileage mapping." :can-edit="canEditUser">
                <div v-if="officeAssignmentsLoading" class="loading">Loading office assignments…</div>
                <div v-else-if="officeAssignmentsError" class="error">{{ officeAssignmentsError }}</div>
                <template v-else>
                  <div v-if="!officeAssignmentsDraft.length" class="empty-state">
                    <p>No building office assignments yet.</p>
                  </div>
                  <div v-else class="table-wrap">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Office</th>
                          <th>Address</th>
                          <th>Active</th>
                          <th>Primary</th>
                          <th v-if="canEditUser">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, idx) in officeAssignmentsDraft" :key="`off-assign-${idx}`">
                          <td>
                            <select
                              v-model.number="row.officeLocationId"
                              :disabled="!canEditUser || savingOfficeAssignments"
                              @change="syncOfficeRowDetails(row)"
                            >
                              <option :value="0" disabled>Select office…</option>
                              <option
                                v-for="opt in officeOptionsForRow(idx)"
                                :key="`office-opt-${idx}-${opt.id}`"
                                :value="Number(opt.id)"
                              >
                                {{ opt.name }}
                              </option>
                            </select>
                          </td>
                          <td><span class="muted">{{ officeAddressForRow(row) || '—' }}</span></td>
                          <td>
                            <input type="checkbox" v-model="row.isActive" :disabled="!canEditUser || savingOfficeAssignments" @change="normalizeOfficePrimary()" />
                          </td>
                          <td>
                            <input
                              type="radio"
                              name="primary-office-assignment"
                              :checked="row.isPrimary"
                              :disabled="!canEditUser || savingOfficeAssignments || !row.isActive"
                              @change="setPrimaryOfficeAssignment(idx)"
                            />
                          </td>
                          <td v-if="canEditUser">
                            <button class="btn btn-danger btn-sm" type="button" :disabled="savingOfficeAssignments" @click="removeOfficeAssignmentRow(idx)">Remove</button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-if="canEditUser" style="margin-top: 10px; display:flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-secondary btn-sm" type="button" :disabled="savingOfficeAssignments" @click="addOfficeAssignmentRow">Add office</button>
                    <button class="btn btn-primary btn-sm" type="button" :disabled="savingOfficeAssignments" @click="saveOfficeAssignments">
                      {{ savingOfficeAssignments ? 'Saving…' : 'Save office assignments' }}
                    </button>
                  </div>
                </template>
              </AccountDashboardCard>
            </template>

            <template #external-calendars-modal>
                <div v-if="showExternalCalendarsModal" class="modal-overlay" @click.self="closeExternalCalendarsModal">
                  <div class="modal-content" style="max-width: 980px;">
                    <div style="display:flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                      <h3 style="margin: 0;">External calendars (ICS)</h3>
                      <div style="display:flex; gap: 8px; align-items:center;">
                        <button type="button" class="btn btn-secondary btn-sm" @click="loadExternalCalendars" :disabled="externalCalendarsSaving">
                          Refresh
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" @click="closeExternalCalendarsModal">
                          Close
                        </button>
                      </div>
                    </div>
                    <p class="hint" style="margin: 8px 0 14px;">
                      Add one or more named calendars (e.g., “Therapy Notes”). Each calendar can have multiple ICS feed URLs.
                    </p>

                    <div style="border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; background: var(--bg);">
                      <div style="font-weight: 900;">Therapy Notes calendar (paste URL only)</div>
                      <p class="hint" style="margin: 6px 0 10px;">
                        Paste this user’s personal ICS feed URL from Therapy Notes. You don’t need to create or name a calendar — we save it under this user automatically.
                      </p>
                      <div class="muted small" style="margin: -6px 0 10px;">
                        If Therapy Notes gives you a <strong>webcal://</strong> link, that’s OK — we’ll fetch it as <strong>https://</strong>.
                      </div>
                      <div style="display:flex; gap: 8px; align-items: end; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 260px;">
                          <label class="lbl">ICS URL</label>
                          <input
                            class="agency-select"
                            v-model="ehrIcsUrl"
                            type="url"
                            placeholder="https://…/calendar.ics"
                            :disabled="ehrIcsSaving || externalCalendarsSaving"
                          />
                        </div>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          @click="saveEhrIcsUrl"
                          :disabled="ehrIcsSaving || externalCalendarsSaving"
                        >
                          {{ ehrIcsSaving ? 'Saving…' : 'Save' }}
                        </button>
                      </div>
                      <div v-if="ehrIcsError" class="error" style="margin-top: 8px;">{{ ehrIcsError }}</div>
                      <div class="muted small" style="margin-top: 8px;">
                        Tip: pasting a new URL will automatically make it the only active Therapy Notes feed for this user.
                      </div>
                    </div>

                    <div v-if="externalCalendarsError" class="error" style="margin-top: 12px;">{{ externalCalendarsError }}</div>
                    <div v-if="externalCalendarsLoading" class="muted" style="margin-top: 12px;">Loading external calendars…</div>

                    <div v-else style="margin-top: 12px;">
                      <div style="display:flex; gap: 8px; align-items: end; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 240px;">
                          <label class="lbl">New calendar label</label>
                          <input class="agency-select" v-model="newExternalCalendarLabel" placeholder="e.g. Therapy Notes" />
                        </div>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          @click="createExternalCalendar"
                          :disabled="externalCalendarsSaving || !newExternalCalendarLabel.trim()"
                        >
                          {{ externalCalendarsSaving ? 'Saving…' : 'Create calendar' }}
                        </button>
                      </div>

                      <div v-if="externalCalendars.length === 0" class="muted" style="margin-top: 10px;">
                        No external calendars yet.
                      </div>

                      <div v-else style="margin-top: 10px; display:flex; flex-direction: column; gap: 10px;">
                        <div v-for="c in externalCalendars" :key="`ec-${c.id}`" style="border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; background: var(--bg-alt);">
                          <div style="display:flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <div style="display:flex; align-items: end; gap: 8px; flex-wrap: wrap;">
                              <div style="min-width: 240px;">
                                <label class="lbl">Calendar label</label>
                                <input
                                  class="agency-select"
                                  :value="editExternalCalendarLabelById[c.id] ?? c.label"
                                  :disabled="externalCalendarsSaving"
                                  @input="editExternalCalendarLabelById = { ...(editExternalCalendarLabelById || {}), [c.id]: $event.target.value }"
                                />
                              </div>
                              <button
                                type="button"
                                class="btn btn-secondary btn-sm"
                                :disabled="externalCalendarsSaving"
                                @click="saveExternalCalendarLabel(c)"
                              >
                                Save label
                              </button>
                            </div>
                            <label class="toggle-label" style="margin:0;">
                              <span style="font-size: 12px;">Active</span>
                              <div class="toggle-switch">
                                <input
                                  type="checkbox"
                                  :checked="!!c.isActive"
                                  :disabled="externalCalendarsSaving"
                                  @change="toggleExternalCalendar(c, $event.target.checked)"
                                />
                                <span class="slider"></span>
                              </div>
                            </label>
                          </div>

                          <div class="muted" style="margin-top: 6px;">Feeds</div>
                          <div v-if="(c.feeds || []).length === 0" class="muted" style="margin-top: 4px;">No feeds yet.</div>
                          <div v-else style="margin-top: 6px; display:flex; flex-direction: column; gap: 6px;">
                            <div
                              v-for="f in c.feeds"
                              :key="`ecf-${f.id}`"
                              style="display:flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;"
                            >
                              <div class="muted" style="max-width: 100%; overflow: hidden; text-overflow: ellipsis;">
                                {{ f.icsUrl }}
                              </div>
                              <label class="toggle-label" style="margin:0;">
                                <span style="font-size: 12px;">Active</span>
                                <div class="toggle-switch">
                                  <input
                                    type="checkbox"
                                    :checked="!!f.isActive"
                                    :disabled="externalCalendarsSaving"
                                    @change="toggleExternalFeed(c, f, $event.target.checked)"
                                  />
                                  <span class="slider"></span>
                                </div>
                              </label>
                            </div>
                          </div>

                          <div style="display:flex; gap: 8px; align-items: end; margin-top: 10px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 260px;">
                              <label class="lbl">Add ICS URL</label>
                              <input
                                class="agency-select"
                                v-model="newExternalFeedUrlByCalendarId[c.id]"
                                placeholder="https://…/calendar.ics"
                                :disabled="externalCalendarsSaving"
                              />
                            </div>
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              @click="addExternalFeed(c)"
                              :disabled="externalCalendarsSaving || !String(newExternalFeedUrlByCalendarId[c.id] || '').trim()"
                            >
                              Add feed
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            </template>
          </UserAccountDashboard>
        </div>

        <div v-if="activeTab === 'linked_clients'" class="tab-panel">
          <h2>Linked Clients</h2>
          <p class="hint" style="margin-top: -6px;">
            Manage which clients this guardian can access and sign for.
          </p>

          <div class="card" style="padding: 12px; margin-bottom: 14px;">
            <h4 style="margin: 0 0 10px;">Link this guardian to a client</h4>
            <div class="form-grid" style="grid-template-columns: 1fr 220px 160px auto; gap: 10px;">
              <div class="form-group">
                <label>Search clients</label>
                <input
                  v-model.trim="guardianClientQuery"
                  type="text"
                  placeholder="Type client name..."
                  @keydown.enter.prevent="searchGuardianClients"
                />
              </div>
              <div class="form-group">
                <label>Select client</label>
                <select v-model="guardianSelectedClientId">
                  <option value="" disabled>Select…</option>
                  <option v-for="c in guardianClientOptions" :key="c.id" :value="String(c.id)">
                    {{ c.full_name || c.initials || `Client ${c.id}` }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>Relationship</label>
                <select v-model="guardianLinkRelationshipType">
                  <option value="guardian">Guardian</option>
                  <option value="self">Self</option>
                  <option value="proxy">Proxy</option>
                </select>
              </div>
              <div class="form-group" style="justify-content: flex-end;">
                <label>&nbsp;</label>
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="guardianSearchLoading || guardianLinkSaving || !guardianSelectedClientId"
                  @click="linkGuardianToClient"
                >
                  {{ guardianLinkSaving ? 'Linking…' : 'Link client' }}
                </button>
              </div>
            </div>
            <div v-if="guardianSearchLoading" class="muted" style="margin-top: 8px;">Searching…</div>
            <div v-if="guardianLinkError" class="error" style="margin-top: 8px;">{{ guardianLinkError }}</div>
          </div>

          <div v-if="guardianLinkedClientsLoading" class="loading">Loading linked clients…</div>
          <div v-else-if="guardianLinkedClientsError" class="error">{{ guardianLinkedClientsError }}</div>
          <div v-else-if="guardianLinkedClients.length === 0" class="empty-state">
            <p>No linked clients yet.</p>
          </div>
          <div v-else class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Organization</th>
                  <th>Relationship</th>
                  <th>Enabled</th>
                  <th class="right"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in guardianLinkedClients" :key="`guardian-client-${row.client_id}`">
                  <td>
                    <a href="" @click.prevent="openLinkedClient(row.client_id)">
                      {{ row.full_name || row.initials || `Client ${row.client_id}` }}
                    </a>
                  </td>
                  <td>{{ row.organization_name || '—' }}</td>
                  <td style="min-width: 220px;">
                    <div style="display:flex; gap: 8px;">
                      <select v-model="row.relationship_type">
                        <option value="guardian">Guardian</option>
                        <option value="self">Self</option>
                        <option value="proxy">Proxy</option>
                      </select>
                      <input v-model.trim="row.relationship_title" type="text" placeholder="Relationship title" />
                    </div>
                  </td>
                  <td>
                    <input v-model="row.access_enabled" type="checkbox" :true-value="1" :false-value="0" />
                  </td>
                  <td class="right" style="white-space: nowrap;">
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="guardianLinkSaving"
                      @click="saveGuardianClientLink(row)"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      class="btn btn-danger btn-sm"
                      :disabled="guardianLinkSaving"
                      style="margin-left: 8px;"
                      @click="removeGuardianClientLink(row)"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Guardian: Assignments tab -->
        <div v-if="activeTab === 'assignments' && isViewingGuardian" class="tab-panel">
          <h2>Assignments</h2>
          <p class="hint" style="margin-top: -6px;">
            Programs and organizations this guardian's linked clients are enrolled in.
          </p>
          <div v-if="guardianLinkedClientsLoading" class="loading">Loading assignments…</div>
          <div v-else-if="guardianLinkedClientsError" class="error">{{ guardianLinkedClientsError }}</div>
          <div v-else-if="guardianLinkedClients.length === 0" class="empty-state">
            <p>No linked clients — no assignments to show.</p>
          </div>
          <div v-else class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Organization</th>
                  <th>Agency</th>
                  <th>Status</th>
                  <th>Relationship</th>
                  <th>Portal Access</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in guardianLinkedClients" :key="`assign-${row.client_id}`">
                  <td>
                    <a href="" @click.prevent="openLinkedClient(row.client_id)">
                      {{ row.full_name || row.initials || `Client ${row.client_id}` }}
                    </a>
                  </td>
                  <td>{{ row.organization_name || '—' }}</td>
                  <td>{{ row.agency_name || '—' }}</td>
                  <td>
                    <span :class="['badge', row.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary']">
                      {{ row.status || '—' }}
                    </span>
                  </td>
                  <td>{{ row.relationship_title || row.relationship_type || '—' }}</td>
                  <td>
                    <span :class="row.access_enabled ? 'badge badge-success' : 'badge badge-secondary'">
                      {{ row.access_enabled ? 'Enabled' : 'Disabled' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Guardian: Events tab -->
        <div v-if="activeTab === 'events' && isViewingGuardian" class="tab-panel">
          <h2>Events</h2>
          <p class="hint" style="margin-top: -6px;">
            Company events that this guardian's linked clients are enrolled in.
          </p>
          <div v-if="guardianEventsLoading" class="loading">Loading events…</div>
          <div v-else-if="guardianEventsError" class="error">{{ guardianEventsError }}</div>
          <div v-else-if="guardianEvents.length === 0" class="empty-state">
            <p>No event enrollments found for this guardian's clients.</p>
          </div>
          <div v-else class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Client</th>
                  <th>Agency</th>
                  <th>Program</th>
                  <th>Type</th>
                  <th>Start Date</th>
                  <th>Enrolled</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in guardianEvents" :key="`event-${idx}`">
                  <td>{{ row.title || `Event ${row.company_event_id}` }}</td>
                  <td>{{ row.full_name || row.initials || `Client ${row.client_id}` }}</td>
                  <td>{{ row.agency_name || '—' }}</td>
                  <td>{{ row.program_name || '—' }}</td>
                  <td>{{ row.event_type || '—' }}</td>
                  <td>{{ row.starts_at ? new Date(row.starts_at).toLocaleDateString() : '—' }}</td>
                  <td>{{ row.enrolled_at ? new Date(row.enrolled_at).toLocaleDateString() : '—' }}</td>
                  <td>
                    <span :class="row.is_active ? 'badge badge-success' : 'badge badge-secondary'">
                      {{ row.is_active ? 'Yes' : 'No' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="activeTab === 'season_history'" class="tab-panel">
          <h2>Season History</h2>
          <p class="hint" style="margin-top: -6px;">
            Past season participation and AI-generated performance summary for captain planning.
          </p>

          <div v-if="memberSeasonHistoryLoading" class="loading">Loading season history...</div>
          <div v-else-if="memberSeasonHistoryError" class="error">{{ memberSeasonHistoryError }}</div>
          <template v-else>
            <div v-if="memberCaptainMeta.everTeamCaptain" class="ssc-captain-legacy-banner">
              <span class="ssc-captain-badge ssc-captain-badge--legacy ssc-captain-badge--inline">C</span>
              <span>
                Team captain in <strong>{{ memberCaptainMeta.captainTeamCount }}</strong> season{{
                  memberCaptainMeta.captainTeamCount === 1 ? '' : 's'
                }}
                — badge also shows on their profile header.
              </span>
            </div>
            <div class="card" style="padding: 14px; margin-bottom: 14px;">
              <h4 style="margin: 0 0 8px;">AI Performance Summary</h4>
              <p style="margin: 0; white-space: pre-wrap;">{{ memberSeasonAiSummary || 'No summary available yet.' }}</p>
            </div>

            <div class="form-grid" style="margin-bottom: 12px;">
              <div class="form-group">
                <label>Total Seasons</label>
                <input :value="memberSeasonHistory.seasonCount || 0" type="text" disabled />
              </div>
              <div class="form-group">
                <label>Total Miles</label>
                <input :value="memberSeasonHistory?.totals?.totalMiles ?? 0" type="text" disabled />
              </div>
              <div class="form-group">
                <label>Total Points</label>
                <input :value="memberSeasonHistory?.totals?.totalPoints ?? 0" type="text" disabled />
              </div>
              <div class="form-group">
                <label>Total Workouts</label>
                <input :value="memberSeasonHistory?.totals?.totalWorkouts ?? 0" type="text" disabled />
              </div>
            </div>

            <div v-if="!memberSeasonHistorySeasons.length" class="empty-state">
              <p>No season participation found yet.</p>
            </div>
            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Season / captain</th>
                    <th>Team</th>
                    <th>Status</th>
                    <th>Miles</th>
                    <th>Points</th>
                    <th>Workouts</th>
                    <th>Best Pace</th>
                    <th>Longest Run</th>
                    <th v-if="showSeasonCaptainColumn">Team captain</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="season in memberSeasonHistorySeasons" :key="season.classId">
                    <td>
                      <div class="ssc-season-cell">
                        <span class="ssc-season-title">{{ season.className }}</span>
                        <span
                          v-if="season.isTeamCaptain"
                          class="ssc-captain-badge ssc-captain-badge--season"
                          title="Team captain this season"
                        >C</span>
                      </div>
                    </td>
                    <td>{{ season.teamName || '—' }}</td>
                    <td>{{ season.classStatus || '—' }}</td>
                    <td>{{ season.totalMiles }}</td>
                    <td>{{ season.totalPoints }}</td>
                    <td>{{ season.workoutCount }}</td>
                    <td>{{ season.bestRunPaceMinPerMile != null ? `${season.bestRunPaceMinPerMile} min/mi` : '—' }}</td>
                    <td>{{ season.longestRunMiles || 0 }} mi</td>
                    <td v-if="showSeasonCaptainColumn">
                      <template v-if="!season.teamId">—</template>
                      <template v-else-if="canManageClubMemberRoles">
                        <label class="checkbox-inline" style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                          <input
                            type="checkbox"
                            :checked="!!season.isTeamCaptain"
                            :disabled="seasonCaptainTogglingKey === `${season.classId}-${season.teamId}`"
                            @change="toggleSeasonTeamCaptain(season, $event)"
                          />
                          <span>{{ season.isTeamCaptain ? 'Captain' : 'Not captain' }}</span>
                        </label>
                      </template>
                      <template v-else>{{ season.isTeamCaptain ? 'Yes' : 'No' }}</template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>

        <div v-if="activeTab === 'provider_info'" class="tab-panel">
          <ClinicalInformationTab :user-id="userId" />
        </div>

        <div v-if="activeTab === 'credentialing'" class="tab-panel">
          <CredentialingTab :userId="userId" />
        </div>

        <div v-if="activeTab === 'affiliations'" class="tab-panel">
          <h2>Affiliations</h2>
          <div class="affiliation-subtabs">
            <button
              v-for="sec in AFFILIATION_SECTION_IDS"
              :key="sec"
              type="button"
              :class="['affiliation-subtab', { active: activeAffiliationSection === sec }]"
              @click="selectAffiliationSection(sec)"
            >
              {{ AFFILIATION_TAB_CONFIG[sec].singleLabel }}
            </button>
          </div>
          <p class="hint" style="margin-top: 8px;">
            Configure provider availability for {{ activeAffiliationSingleLabel.toLowerCase() }} affiliations: global Open/Closed, per-affiliation override, and day/hour slots.
          </p>

          <div v-if="schoolAffiliationsLoading" class="loading">Loading affiliations…</div>
          <div v-else-if="schoolAffiliationsError" class="error">{{ schoolAffiliationsError }}</div>
          <div v-else-if="affiliationsForActiveTab.length === 0" class="empty-state">
            <p>No {{ activeAffiliationPluralLabel.toLowerCase() }} affiliations found for this provider.</p>
          </div>
          <div v-else class="school-affiliation-panel">
            <div class="form-grid" style="grid-template-columns: minmax(240px, 1fr) minmax(240px, 1fr); gap: 12px;">
              <div class="form-group">
                <label>{{ activeAffiliationSingleLabel }}</label>
                <select v-model="selectedSchoolAffiliationId" :disabled="savingSchoolAffiliation">
                  <option value="">Select…</option>
                  <option v-for="o in affiliationsForActiveTab" :key="o.id" :value="String(o.id)">
                    {{ o.name }} <span v-if="o.organization_type">({{ o.organization_type }})</span>
                  </option>
                </select>
                <div style="margin-top: 8px; display:flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                  <a
                    class="btn btn-secondary btn-sm"
                    :class="{ disabled: !providerSchoolPortalHref }"
                    :href="providerSchoolPortalHref || undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-disabled="!providerSchoolPortalHref"
                    :title="providerSchoolPortalHref ? 'Open this provider inside the school portal (new tab)' : 'This affiliation has no slug (cannot deep-link)'"
                    @click="(e) => { if (!providerSchoolPortalHref) e.preventDefault(); }"
                  >
                    Open in School Portal
                  </a>
                  <span class="hint" style="margin: 0;" v-if="selectedSchoolAffiliationSlug">
                    Jumps to the provider’s school profile for faster editing.
                  </span>
                </div>
              </div>
              <div class="form-group">
                <label class="toggle-label">
                  <span>Global accepting new clients</span>
                  <div class="toggle-switch">
                    <input
                      type="checkbox"
                      v-model="providerAcceptingNewClients"
                      :disabled="!canEditUser || savingSchoolAffiliation"
                    />
                    <span class="slider"></span>
                  </div>
                </label>
                <small class="form-help">
                  If turned off, this provider is closed everywhere unless a school override is enabled.
                </small>
              </div>
            </div>

            <!-- Provider School Info blurb: one per provider, shared across all schools -->
            <div v-if="affiliationsForActiveTab.length > 0" class="card" style="margin-top: 12px;">
              <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; cursor: pointer;" @click="providerSchoolBlurbExpanded = !providerSchoolBlurbExpanded">
                <div style="display:flex; align-items:center; gap: 8px;">
                  <span class="collapse-icon" :class="{ expanded: providerSchoolBlurbExpanded }">▸</span>
                  <h3 style="margin:0;">Provider School Info blurb</h3>
                </div>
                <div style="display:flex; align-items:center; gap: 8px;" @click.stop>
                  <button
                    v-if="providerSchoolBlurbExpanded"
                    class="btn btn-primary btn-sm"
                    type="button"
                    @click="saveProviderSchoolBlurb"
                    :disabled="!canEditUser || providerSchoolBlurbSaving"
                  >
                    {{ providerSchoolBlurbSaving ? 'Saving…' : 'Save' }}
                  </button>
                </div>
              </div>
              <div v-show="providerSchoolBlurbExpanded" class="card-body">
                <div v-if="providerSchoolBlurbError" class="error">{{ providerSchoolBlurbError }}</div>
                <div class="form-group form-group-full" style="margin-top: 10px;">
                  <label>Provider School Info blurb</label>
                  <textarea
                    v-model="providerSchoolBlurb"
                    rows="4"
                    placeholder="Short blurb shown in the school portal provider profile."
                    :disabled="!canEditUser || providerSchoolBlurbSaving"
                    style="width: 100%;"
                  />
                  <small class="form-help">
                    Shown in the school portal under “Provider info” for all schools. Keep this non-PHI.
                  </small>
                </div>
              </div>
            </div>

            <div v-if="selectedSchoolAffiliationId" style="margin-top: 14px;">
              <div class="form-group form-group-full">
                <label class="toggle-label">
                  <span>Open for this {{ activeAffiliationSingleLabel.toLowerCase() }} even if globally closed</span>
                  <div class="toggle-switch">
                    <input
                      type="checkbox"
                      v-model="schoolOverrideOpen"
                      :disabled="!canEditUser || savingSchoolAffiliation"
                    />
                    <span class="slider"></span>
                  </div>
                </label>
                <small class="form-help">
                  When enabled, assignments can proceed for this {{ activeAffiliationSingleLabel.toLowerCase() }} even if the provider is globally closed.
                </small>
              </div>

              <div class="card" style="margin-top: 12px;">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                  <h3 style="margin:0;">Affiliation schedule (reference)</h3>
                </div>
                <div v-if="schoolAssignmentsLoading" class="loading">Loading bell schedule…</div>
                <div v-else class="form-grid" style="grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr); gap: 12px; margin-top: 10px;">
                  <div class="form-group">
                    <label>Start</label>
                    <input :value="selectedSchoolBellScheduleStartDisplay" type="text" disabled />
                  </div>
                  <div class="form-group">
                    <label>End</label>
                    <input :value="selectedSchoolBellScheduleEndDisplay" type="text" disabled />
                  </div>
                  <div class="form-group form-group-full">
                    <label>Notes</label>
                    <textarea :value="selectedSchoolBellScheduleNotesDisplay" rows="3" disabled style="width: 100%;" />
                    <small class="form-help">Configured in the organization's settings.</small>
                  </div>
                </div>
              </div>


              <div class="card" style="margin-top: 12px;">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                  <h3 style="margin:0;">Days & slots</h3>
                  <div style="display:flex; gap: 8px; align-items:center; flex-wrap: wrap;">
                    <button
                      v-if="canRepairProviderSlots"
                      class="btn btn-secondary btn-sm"
                      type="button"
                      @click="repairProviderSlots"
                      :disabled="repairingProviderSlots"
                      title="Recalculate and repair stored slot availability for this school"
                    >
                      {{ repairingProviderSlots ? 'Repairing…' : 'Repair slots' }}
                    </button>
                    <button class="btn btn-primary btn-sm" @click="saveSchoolAffiliation" :disabled="!canEditUser || savingSchoolAffiliation">
                      {{ savingSchoolAffiliation ? 'Saving…' : 'Save' }}
                    </button>
                  </div>
                </div>

                <div v-if="schoolAssignmentsLoading" class="loading">Loading schedule…</div>
                <div v-else-if="schoolAssignmentsError" class="error">{{ schoolAssignmentsError }}</div>
                <div v-else class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Active</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Total slots</th>
                        <th>Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="d in schoolDayEdits" :key="d.dayOfWeek">
                        <td>{{ d.dayOfWeek }}</td>
                        <td><input type="checkbox" v-model="d.isActive" :disabled="!canEditUser || savingSchoolAffiliation" /></td>
                        <td><input type="time" v-model="d.startTime" :disabled="!canEditUser || savingSchoolAffiliation" /></td>
                        <td><input type="time" v-model="d.endTime" :disabled="!canEditUser || savingSchoolAffiliation" /></td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            v-model.number="d.slotsTotal"
                            :disabled="!canEditUser || savingSchoolAffiliation"
                            @input="d.slotsAuto = false"
                            style="max-width: 110px;"
                          />
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            style="margin-left: 6px;"
                            :disabled="!canEditUser || savingSchoolAffiliation"
                            @click="applyAutoSlots(d)"
                            title="Auto (1 per hour)"
                          >
                            Auto
                          </button>
                        </td>
                        <td>{{ d.slotsAvailableDisplay }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'schedule_availability'" class="tab-panel">
          <h2>Schedule & Availability</h2>
          <p class="hint" style="margin-top: -6px;">
            Weekly view (Mon–Sun, 7am–9pm). Shows pending requests, school assigned hours, office schedule states, and optional busy overlays.
          </p>

          <ScheduleAvailabilityGrid
            :user-id="Number(userId)"
            :agency-ids="selectedScheduleAgencyIds"
            :agency-label-by-id="scheduleAgencyLabelById"
            :week-start-ymd="scheduleWeekStartYmd"
            @update:weekStartYmd="onScheduleWeekStartYmdUpdate"
            :availability-overlay="showAvailability ? providerWeekAvailability : null"
            mode="admin"
          />

          <details class="card" style="margin-top: 10px; padding: 10px 12px;">
            <summary style="cursor: pointer; list-style: none; display:flex; align-items:center; justify-content: space-between; gap: 10px;">
              <div style="font-size: 13px; font-weight: 800; color: var(--text-secondary);">
                Show availability
              </div>
              <div class="muted" style="font-size: 12px;">
                Virtual vs office
              </div>
            </summary>

            <div style="display:flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 10px;">
              <label class="sched-toggle" style="display:flex; align-items:center; gap: 8px;">
                <input type="checkbox" v-model="showAvailability" />
                <span>Highlight availability</span>
              </label>
              <div class="muted" style="font-size: 12px;">
                Virtual (green) • Office (blue). Computed per selected agency (first).
              </div>
            </div>

            <div v-if="showAvailability" style="margin-top: 10px;">
              <div v-if="availabilityLoading" class="muted">Loading availability…</div>
              <div v-else-if="availabilityError" class="error" style="margin-top: 6px;">{{ availabilityError }}</div>
              <div v-else-if="availabilityByDay.length" class="availability-list">
                <div v-for="d in availabilityByDay" :key="`av-${d.day}`" class="availability-day">
                  <div class="availability-day-title">{{ d.day }}</div>
                  <div class="availability-lines">
                    <div v-if="d.virtual.length" class="availability-line">
                      <span class="pill pill-virtual">Virtual</span>
                      <span class="muted">{{ d.virtual.join(', ') }}</span>
                    </div>
                    <div v-if="d.officeGroups.length" class="availability-line" style="flex-direction: column; align-items: flex-start;">
                      <div
                        v-for="g in d.officeGroups"
                        :key="`off-${d.day}-${g.label}`"
                        class="availability-line"
                        style="padding: 0; border: none; width: 100%;"
                      >
                        <span class="pill pill-office">Office</span>
                        <span class="muted">
                          <strong style="color: var(--text-primary);">{{ g.label }}</strong>
                          <span v-if="g.ranges.length"> — {{ g.ranges.join(', ') }}</span>
                        </span>
                      </div>
                    </div>
                    <div v-if="!d.virtual.length && !d.officeGroups.length" class="muted">—</div>
                  </div>
                </div>
              </div>
            </div>
          </details>

          <details
            v-if="affiliatedAgencies.length"
            class="card"
            style="margin-top: 10px; padding: 10px 12px;"
          >
            <summary style="cursor: pointer; list-style: none; display:flex; align-items:center; justify-content: space-between; gap: 10px;">
              <div style="font-size: 13px; font-weight: 800; color: var(--text-secondary);">
                Affiliated agencies
                <span style="font-weight: 700;">
                  ({{ selectedScheduleAgencyIds.length || 0 }}/{{ affiliatedAgencies.length }})
                </span>
              </div>
              <div class="muted" style="font-size: 12px;">Filter</div>
            </summary>

            <div style="display:flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm" type="button" @click="selectAllScheduleAgencies">All</button>
              <button class="btn btn-secondary btn-sm" type="button" @click="clearScheduleAgencies">None</button>
              <div class="muted" style="font-size: 12px;">
                Overlaps are expected when the user works across multiple companies.
              </div>
            </div>

            <div style="display:flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
              <label
                v-for="a in affiliatedAgencies"
                :key="`sched-agency-${a.id}`"
                class="sched-toggle"
                style="display:flex; align-items:center; gap: 6px; font-size: 13px;"
              >
                <input type="checkbox" v-model="selectedScheduleAgencyIds" :value="Number(a.id)" />
                <span>{{ a.name }}</span>
              </label>
            </div>
          </details>
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
          :user-display-name="userDisplayNameForDocs"
          :user-role-label="userRoleLabelForDocs"
        />

        <UserAdminDocsTab
          v-if="activeTab === 'admin_docs'"
          :userId="userId"
        />

        <UserCommunicationsTab
          v-if="activeTab === 'communications'"
          :userId="userId"
          :userAgencies="userAgencies"
          :preferred-club-agency-id="isSscMemberProfileMode ? selectedClubIdForMemberProfile : null"
          :viewOnly="!canEditUser"
        />

        <UserActivityLogTab
          v-if="activeTab === 'activity'"
          :userId="userId"
        />

        <!-- Guardian: Communication Preferences (replaces full staff preferences hub) -->
        <div v-if="activeTab === 'preferences' && isViewingGuardian" class="tab-panel">
          <h2>Communication Preferences</h2>
          <p class="section-description" style="margin-top: -6px;">
            Guardian-level delivery settings below control how notifications are sent to this guardian account. Intake answers per linked client are shown for reference.
          </p>

          <!-- Guardian-level delivery preferences (drives notifications) -->
          <div class="card" style="padding: 16px; margin-bottom: 14px;">
            <h3 style="margin: 0 0 6px;">Notification delivery (guardian account)</h3>
            <p class="hint" style="margin-top: 0;">
              Notifications are delivered to the guardian user (not the client). These settings apply across all linked clients.
            </p>

            <div v-if="guardianDeliveryPrefsLoading" class="loading">Loading delivery settings…</div>
            <div v-else>
              <div v-if="guardianDeliveryPrefsError" class="error" style="margin-bottom: 10px;">{{ guardianDeliveryPrefsError }}</div>

              <div class="comm-pref-row">
                <span class="comm-pref-label">In-app notifications</span>
                <span class="comm-pref-value"><strong>Required</strong></span>
              </div>
              <div class="comm-pref-row">
                <span class="comm-pref-label">Email notifications</span>
                <span class="comm-pref-value">
                  <label class="field checkbox" style="margin: 0;">
                    <input type="checkbox" v-model="guardianDeliveryPrefs.email_enabled" :disabled="!canEditUser || guardianDeliveryPrefsSaving" />
                    Enabled
                  </label>
                </span>
              </div>
              <div class="comm-pref-row">
                <span class="comm-pref-label">SMS / text notifications</span>
                <span class="comm-pref-value">
                  <label class="field checkbox" style="margin: 0;">
                    <input type="checkbox" v-model="guardianDeliveryPrefs.sms_enabled" :disabled="!canEditUser || guardianDeliveryPrefsSaving" />
                    Enabled
                  </label>
                </span>
              </div>

              <div style="display:flex; gap: 10px; align-items:center; margin-top: 12px; flex-wrap: wrap;">
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="!canEditUser || guardianDeliveryPrefsSaving"
                  @click="saveGuardianDeliveryPrefs"
                >
                  {{ guardianDeliveryPrefsSaving ? 'Saving…' : 'Save delivery settings' }}
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="!canEditUser || guardianDeliveryPrefsSaving || guardianLinkedClientsLoading || guardianLinkedClients.length === 0"
                  @click="applyGuardianDeliveryPrefsFromIntake"
                  title="Use the latest intake communication preferences to set delivery toggles"
                >
                  Use intake answers
                </button>
                <span v-if="!guardianDeliveryPrefsExists" class="muted" style="font-size: 13px;">
                  No saved guardian preferences yet — defaults shown until saved.
                </span>
              </div>
            </div>
          </div>

          <div v-if="guardianLinkedClientsLoading" class="loading">Loading preferences…</div>
          <div v-else-if="guardianLinkedClients.length === 0" class="empty-state">
            <p>No linked clients — no communication preferences to display.</p>
          </div>
          <div v-else>
            <div
              v-for="client in guardianLinkedClients"
              :key="`pref-client-${client.client_id}`"
              class="card"
              style="padding: 16px; margin-bottom: 14px;"
            >
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div>
                  <strong>
                    <a href="" @click.prevent="openLinkedClient(client.client_id)" style="text-decoration: none;">
                      {{ client.full_name || client.initials || `Client ${client.client_id}` }}
                    </a>
                  </strong>
                  <span class="muted" style="margin-left: 8px; font-size: 13px;">{{ client.organization_name }}</span>
                </div>
              </div>

              <div v-if="guardianCommPrefs[client.client_id]">
                <div
                  v-for="pref in guardianCommPrefs[client.client_id]"
                  :key="pref.key"
                  class="comm-pref-row"
                >
                  <span class="comm-pref-label">{{ pref.label }}</span>
                  <span class="comm-pref-value">{{ pref.value || '—' }}</span>
                </div>
              </div>
              <div v-else-if="guardianCommPrefsLoading[client.client_id]" class="muted" style="font-size: 13px;">
                Loading…
              </div>
              <div v-else class="muted" style="font-size: 13px;">
                No communication preferences on record for this client.
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'preferences' && !isViewingGuardian" class="tab-panel">
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
          :user="user"
          @dual-rate-contract-switched="onDualRateContractSwitched"
        />

        <UserDepartmentTab
          v-if="activeTab === 'departments'"
          :userId="userId"
          :userAgencies="affiliatedAgencies"
          :userRole="accountForm?.role || user?.role"
        />

        <UserSupervisionTab
          v-if="activeTab === 'supervision'"
          :userId="userId"
          :agency-id="agencyStore.currentAgency?.id"
        />

        <UserLifecycleTab
          v-if="activeTab === 'lifecycle'"
          :userId="userId"
          :viewOnly="!canEditUser"
          :user="user"
          :agency-id="agencyStore.currentAgency?.id"
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

    <!-- Leave of Absence Modal -->
    <LeaveOfAbsenceModal
      :show="showLeaveOfAbsenceModal && !isSscMemberProfileMode && !isViewingGuardian"
      :userId="userId"
      :user="user"
      @close="showLeaveOfAbsenceModal = false"
      @saved="loadLeaveOfAbsence"
    />

    <!-- Temporary Password Modal -->
    <div v-if="showTempPasswordModal" class="modal-overlay" @click="closeTempPasswordModal">
      <div class="modal-content credentials-modal" @click.stop>
        <h2>Temporary Password</h2>
        <p class="credentials-description">Copy the username + temporary password to send to the user.</p>
        
        <div class="credentials-section">
          <div class="credential-item">
            <label>Username:</label>
            <div class="credential-value">
              <input 
                type="text" 
                :value="user?.username || user?.email || ''"
                readonly 
                class="credential-input" 
                ref="tempUsernameInput"
              />
              <button @click="copyTempUsername" class="btn-copy">Copy</button>
            </div>
          </div>
          <div class="credential-item">
            <label>Temporary Password:</label>
            <div class="credential-value">
              <input
                type="text"
                :value="temporaryPassword"
                readonly
                class="credential-input"
                ref="tempPasswordInput"
              />
              <button @click="copyTempPassword" class="btn-copy">Copy</button>
            </div>
            <small v-if="temporaryPasswordExpiresAt">Expires: {{ formatDate(temporaryPasswordExpiresAt) }}</small>
            <small v-else>This temporary password expires. The user will be prompted to set a new password after login.</small>
          </div>
        </div>
        
        <div class="credentials-actions">
          <button 
            @click="copyTempPassword" 
            class="btn btn-primary"
            :disabled="!temporaryPassword"
          >
            Copy Password
          </button>
          <button @click="closeTempPasswordModal" class="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>

    <!-- Reset Password Link Modal -->
    <div v-if="showResetPasswordLinkModal" class="modal-overlay" @click="closeResetPasswordLinkModal">
      <div class="modal-content credentials-modal" @click.stop>
        <h2>Reset Password Link</h2>
        <p class="credentials-description">Copy this link to send to the user. It expires automatically.</p>
        <p v-if="resetLinkReused" class="text-muted" style="font-size: 13px; margin-bottom: 12px;">
          This link was already sent; it expires at {{ resetLinkExpiresAt ? formatTokenExpiration(resetLinkExpiresAt) : '—' }}.
        </p>

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
            <small v-if="resetLinkExpiresAt">Expires: {{ formatTokenExpiration(resetLinkExpiresAt) }}</small>
            <small v-else-if="resetLinkExpiresInHours != null">Expires in {{ resetLinkExpiresInHours }} hours.</small>
            <small v-else>This link expires (default: 48 hours).</small>
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
            type="button"
            class="btn btn-primary"
            :disabled="!resetPasswordLink || sendingResetEmail"
            @click="sendResetLinkEmail"
          >
            {{ sendingResetEmail ? 'Sending...' : 'Send email to user' }}
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

    <!-- Billing acknowledgement modal (admin overage gate) -->
    <div v-if="showBillingAckModal" class="modal-overlay" @click="closeBillingAckModal">
      <div class="modal-content" @click.stop style="max-width: 720px;">
        <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px;">
          <h2 style="margin:0;">Billing acknowledgement required</h2>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeBillingAckModal">Close</button>
        </div>
        <div class="muted" style="margin-top: 8px;">
          Promoting this user to <strong>Admin</strong> increases billing beyond included limits for one or more agencies.
        </div>

        <div v-if="billingImpact?.impacts?.length" style="margin-top: 14px;">
          <div
            v-for="imp in billingImpact.impacts"
            :key="imp.agencyId"
            style="border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: var(--bg, #fff); margin-bottom: 10px;"
          >
            <div style="display:flex; justify-content: space-between; gap: 10px; align-items: baseline;">
              <div style="font-weight: 700;">{{ imp.agencyName || `Agency ${imp.agencyId}` }}</div>
              <div style="font-weight: 800;">+{{ formatMoneyCents(imp.deltaMonthlyCents || 0) }}/mo</div>
            </div>
            <div class="muted" style="margin-top: 4px;">
              Included admins: <strong>{{ imp.includedAdmins }}</strong> • Current: <strong>{{ imp.currentAdmins }}</strong> • After: <strong>{{ imp.newAdmins }}</strong>
            </div>
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 14px;">
          <button type="button" class="btn btn-secondary" @click="openBillingSettings">
            Open Billing Settings
          </button>
          <button type="button" class="btn btn-secondary" @click="closeBillingAckModal">
            Cancel
          </button>
          <button type="button" class="btn btn-primary" @click="acknowledgeBillingAndSave" :disabled="saving">
            {{ saving ? 'Saving…' : 'Acknowledge & Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick, provide } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { canAccessSkillBuildersSchoolProgramSurfaces } from '../../utils/skillBuildersSchoolProgramAccess.js';
import { isSupervisor } from '../../utils/helpers.js';
import { supervisorTypeLabel, hasClinicalSupervisorInLists } from '../../constants/supervisorTypes.js';
import { isFullyLicensedCredentialText } from '../../utils/credentialNormalization.js';
import { VALID_EMPLOYEE_STATUSES, RESTRICTED_ROLE_STATUSES } from '../../utils/statusUtils.js';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { useProfileOverview } from '../../composables/useProfileOverview.js';
import UserOverviewTab from '../../components/admin/UserOverviewTab.vue';
import AcceptedInsuranceBadges from '../../components/admin/AcceptedInsuranceBadges.vue';
import UserTrainingTab from '../../components/admin/UserTrainingTab.vue';
import UserDocumentsTab from '../../components/admin/UserDocumentsTab.vue';
import ClinicalInformationTab from '../../components/admin/clinical/ClinicalInformationTab.vue';
import UserAccountDashboard from '../../components/admin/account/UserAccountDashboard.vue';
import AccountDashboardCard from '../../components/admin/account/AccountDashboardCard.vue';
import { USER_ACCOUNT_CONTEXT_KEY } from '../../composables/userAccountContext.js';
import CredentialingTab from '../../components/admin/CredentialingTab.vue';
import UserCommunicationsTab from '../../components/admin/UserCommunicationsTab.vue';
import UserAdminDocsTab from '../../components/admin/UserAdminDocsTab.vue';
import UserActivityLogTab from '../../components/admin/UserActivityLogTab.vue';
import UserPayrollTab from '../../components/admin/UserPayrollTab.vue';
import UserDepartmentTab from '../../components/admin/UserDepartmentTab.vue';
import UserSupervisionTab from '../../components/admin/UserSupervisionTab.vue';
import UserLifecycleTab from '../../components/admin/UserLifecycleTab.vue';
import UserBenefitsTab from '../../components/admin/UserBenefitsTab.vue';
import { filterProfileSearchTargets } from '../../navigation/profileSearchCatalog.js';
import SupervisorAssignmentManager from '../../components/admin/SupervisorAssignmentManager.vue';
import MovePendingToActiveModal from '../../components/admin/MovePendingToActiveModal.vue';
import LeaveOfAbsenceModal from '../../components/admin/LeaveOfAbsenceModal.vue';
import UserPreferencesHub from '../../components/UserPreferencesHub.vue';
import ScheduleAvailabilityGrid from '../../components/schedule/ScheduleAvailabilityGrid.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const userId = computed(() => parseInt(route.params.userId));

const { overview, overviewLoading, overviewError, refreshOverview } = useProfileOverview(
  userId,
  computed(() => agencyStore.currentAgency?.id)
);
provide('refreshProfileOverview', refreshOverview);

const userDisplayNameForDocs = computed(() => {
  const u = user.value;
  if (!u) return '';
  const preferred = String(u.preferred_name || '').trim();
  const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  return preferred || full || u.email || '';
});

const userRoleLabelForDocs = computed(() => {
  const role = String(user.value?.role || '').trim();
  if (!role) return '';
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
});

const canShowSkillBuildersSchoolProgramUserFields = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  if (r === 'super_admin') return true;
  const agency = agencyStore.currentAgency?.value || agencyStore.currentAgency || {};
  const pb = brandingStore.platformBranding || {};
  return canAccessSkillBuildersSchoolProgramSurfaces({
    userRole: authStore.user?.role,
    agencyFeatureFlags: agency.feature_flags ?? agency.featureFlags,
    platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson:
      agency.tenant_available_agency_features_json ?? agency.tenantAvailableAgencyFeaturesJson
  });
});

const backToUsersList = computed(() => {
  const raw = route.query?.returnTo;
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s.startsWith('/') && !s.startsWith('//')) {
    return s;
  }
  const org = String(route.params.organizationSlug || '').trim();
  if (org) return `/${org}/admin/users`;
  return '/admin/users';
});

const backLinkLabel = computed(() => (route.query?.returnTo ? '← Back' : '← Back to Users'));

const loading = ref(true);
const error = ref('');
const user = ref(null);
/** Target user's agencies (declared early for SSC club id resolution on member profiles). */
const userAgencies = ref([]);
const LEGACY_AFFILIATION_TAB_IDS = ['school_affiliation', 'program_affiliation', 'learning_affiliation'];

function resolveInitialProfileTab() {
  let raw = String(route.query.tab || '').trim();
  const sectionFromQuery = String(route.query.section || '').trim();
  if (raw === 'additional') raw = 'account';
  if (LEGACY_AFFILIATION_TAB_IDS.includes(raw)) {
    return {
      tab: 'affiliations',
      affiliationSection: raw,
      section: sectionFromQuery,
    };
  }
  return {
    tab: raw || 'overview',
    affiliationSection: 'school_affiliation',
    section: sectionFromQuery,
  };
}

const _initialProfileTab = resolveInitialProfileTab();
const activeAffiliationSection = ref(_initialProfileTab.affiliationSection);
// Initialize activeTab from query parameter or default to 'overview' (employee profiles)
const activeTab = ref(_initialProfileTab.tab);
const pendingProfileSection = ref(_initialProfileTab.section || '');
const profileSearchQuery = ref('');
const profileSearchOpen = ref(false);
const profileSearchHighlight = ref(0);
const saving = ref(false);
const memberSeasonHistoryLoading = ref(false);
const memberSeasonHistoryError = ref('');
const memberSeasonHistory = ref({ seasonCount: 0, totals: {}, seasons: [] });
const memberClubRole = ref('member');
/** From season-history API: distinct teams where user was team captain in this club. */
const memberCaptainMeta = ref({ everTeamCaptain: false, captainTeamCount: 0 });
const memberRegistrationProfile = ref({ customFields: {} });
const memberSeasonAiSummary = ref('');
const seasonCaptainTogglingKey = ref('');
const guardianLinkedClients = ref([]);
const guardianLinkedClientsLoading = ref(false);
const guardianLinkedClientsError = ref('');
const guardianClientQuery = ref('');
const guardianClientOptions = ref([]);
const guardianSelectedClientId = ref('');
const guardianSearchLoading = ref(false);
const guardianLinkSaving = ref(false);
const guardianLinkError = ref('');
const guardianLinkRelationshipType = ref('guardian');

// Guardian events
const guardianEvents = ref([]);
const guardianEventsLoading = ref(false);
const guardianEventsError = ref('');

// Guardian communication prefs (keyed by client_id)
const guardianCommPrefs = ref({});
const guardianCommPrefsLoading = ref({});

// Guardian insurance info (keyed by client_id)
const guardianInsuranceByClient = ref({});

// Guardian delivery preferences (user_preferences) — drives notification delivery for guardian accounts
const guardianDeliveryPrefs = ref({
  email_enabled: true,
  sms_enabled: false,
  in_app_enabled: true,
});
const guardianDeliveryPrefsLoading = ref(false);
const guardianDeliveryPrefsSaving = ref(false);
const guardianDeliveryPrefsError = ref('');
const guardianDeliveryPrefsExists = ref(false);
let guardianDeliveryPrefsAutoSynced = false;

const insuranceSlotFromFieldKey = (key) => {
  const m = String(key || '').match(/^insurance__(primary|secondary)_(front|back)_url$/i);
  return m ? `${m[1].toLowerCase()}_${m[2].toLowerCase()}` : null;
};

const isInsuranceCardField = (field) => {
  const slot = insuranceSlotFromFieldKey(field?.key);
  return !!slot && String(field?.value || '').trim().toLowerCase().startsWith('gs://');
};

const viewInsuranceCard = async (clientId, slot) => {
  const cid = Number(clientId || 0);
  if (!cid || !slot) return;
  try {
    const r = await api.get(`/clients/${cid}/insurance-card`, {
      params: { slot },
      responseType: 'blob'
    });
    const contentType = r?.headers?.['content-type'] || 'application/octet-stream';
    const blob = new Blob([r.data], { type: contentType });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    // Best-effort: fall back to copying the raw stored path
    console.error('[guardian insurance] view failed', e?.response?.data?.error?.message || e?.message || e);
  }
};

const profilePhotoInput = ref(null);
const photoUploading = ref(false);
const photoError = ref('');

const headerPhotoUrl = computed(() =>
  toUploadsUrl(user.value?.profile_photo_url || user.value?.profile_photo_path || null)
);

const headerInitials = computed(() => {
  const f = String(user.value?.first_name || '').trim();
  const l = String(user.value?.last_name || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || 'U';
});

const headerDisplayName = computed(() => {
  const first = String(user.value?.first_name || '').trim();
  const last = String(user.value?.last_name || '').trim();
  const preferred = String(user.value?.preferred_name || '').trim();
  if (first && preferred && last) return `${first} "${preferred}" ${last}`;
  if (first && preferred) return `${first} "${preferred}"`;
  if (first && last) return `${first} ${last}`;
  return first || last || 'User';
});

const headerPhone = computed(() =>
  accountForm.value?.phoneNumber ||
  user.value?.phone_number ||
  overview.value?.accountInfo?.phoneNumber || ''
);
const headerLocation = computed(() => {
  const city = accountForm.value?.homeCity || overview.value?.accountInfo?.homeCity || '';
  const state = accountForm.value?.homeState || overview.value?.accountInfo?.homeState || '';
  return [city, state].filter(Boolean).join(', ');
});
const headerEmployeeId = computed(() => {
  const id = user.value?.employee_id || overview.value?.user?.employee_id;
  if (id) return String(id).startsWith('EMP') ? id : `EMP-${String(id).padStart(4, '0')}`;
  const uid = user.value?.id;
  return uid ? `EMP-${String(uid).padStart(4, '0')}` : '';
});
const headerHireDate = computed(() =>
  user.value?.hire_date || overview.value?.user?.hire_date || ''
);
const headerStartDate = computed(() =>
  accountForm.value?.providerStartDate ||
  user.value?.provider_start_date ||
  user.value?.start_date ||
  overview.value?.user?.start_date ||
  overview.value?.lifecycle?.summary?.startDate || ''
);
const headerServiceFocus = computed(() =>
  accountForm.value?.serviceFocus ||
  user.value?.service_focus ||
  overview.value?.accountInfo?.serviceFocus || ''
);
const headerLanguages = computed(() =>
  accountForm.value?.languagesSpoken ||
  user.value?.languages_spoken ||
  overview.value?.accountInfo?.languagesSpoken || ''
);
const headerAcceptedInsurances = computed(() => {
  const rows = overview.value?.acceptedInsurances;
  return Array.isArray(rows) ? rows : [];
});
const fmtHeaderDate = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const headerManagerName = computed(() => {
  const u = user.value;
  const ou = overview.value?.user;
  if (u?.manager_first_name && u?.manager_last_name) return `${u.manager_first_name} ${u.manager_last_name}`;
  if (ou?.manager_first_name && ou?.manager_last_name) return `${ou.manager_first_name} ${ou.manager_last_name}`;
  return u?.manager_name || ou?.manager_name || '';
});

const headerSupervisorName = computed(() => {
  const svs = overview.value?.supervisors || supervisors.value || [];
  const clinical = svs.filter((s) => !s.supervisor_type || s.supervisor_type === 'clinical');
  const primary = clinical.find((s) => s.is_primary) || clinical[0] || svs.find((s) => s.is_primary) || svs[0];
  if (!primary) return '';
  return `${primary.supervisor_first_name || ''} ${primary.supervisor_last_name || ''}`.trim();
});

const onAdminPhotoSelected = async (event) => {
  try {
    photoError.value = '';
    const file = event?.target?.files?.[0] || null;
    if (!file) return;
    if (!userId.value) return;

    const formData = new FormData();
    formData.append('photo', file);

    photoUploading.value = true;
    await api.post(`/users/${userId.value}/profile-photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    await fetchUser();
  } catch (e) {
    photoError.value = e.response?.data?.error?.message || 'Failed to upload photo';
  } finally {
    photoUploading.value = false;
    try {
      if (profilePhotoInput.value) profilePhotoInput.value.value = '';
    } catch {
      // ignore
    }
  }
};

// Billing acknowledgement gate when promoting to Admin beyond included limits
const showBillingAckModal = ref(false);
const billingImpact = ref(null); // { code, impacts: [...] }
const pendingAccountUpdate = ref(null);

const formatMoneyCents = (cents) => {
  const n = Number(cents || 0);
  return `$${(n / 100).toFixed(2)}`;
};

const closeBillingAckModal = () => {
  showBillingAckModal.value = false;
  billingImpact.value = null;
};

const openBillingSettings = () => {
  const agencyId = billingImpact.value?.impacts?.[0]?.agencyId;
  const suffix = agencyId ? `&agencyId=${encodeURIComponent(String(agencyId))}` : '';
  router.push(`/admin/settings?category=general&item=billing${suffix}`);
  closeBillingAckModal();
};

const canViewActivityLog = computed(() => {
  const user = authStore.user;
  if (!user) return false;
  return (
    isSupervisor(user) ||
    user.role === 'clinical_practice_assistant' ||
    user.role === 'provider_plus' ||
    user.role === 'admin' ||
    user.role === 'super_admin' ||
    user.role === 'support'
  );
});

const canManageAssignments = computed(() => {
  const role = authStore.user?.role;
  return role === 'admin' || role === 'super_admin' || role === 'support';
});

const showAdditionalAccountSections = computed(() => {
  return !isViewingGuardian.value && !isSscMemberProfileMode.value && !isViewingSchoolStaff.value;
});

const triggerPhotoUpload = () => {
  try {
    profilePhotoInput.value?.click();
  } catch {
    // ignore
  }
};

const canViewPayroll = computed(() => {
  const role = authStore.user?.role;
  return role === 'admin' || role === 'super_admin' || role === 'support';
});

const canViewLifecycleTab = computed(() => {
  const u = authStore.user;
  if (!u) return false;
  const role = String(u.role || '');
  // Backoffice admins and clinical practice assistants always see it
  if (
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'support' ||
    role === 'clinical_practice_assistant'
  ) {
    return true;
  }
  // Staff/hiring-capable users with People Ops or hiring feature enabled
  const caps = u.capabilities || {};
  const canHire = caps.canManageHiring || u.has_hiring_access === 1 || u.has_hiring_access === '1' || u.has_hiring_access === true;
  if (!canHire) return false;
  const flags = parseFeatureFlags(agencyStore.currentAgency?.feature_flags);
  return !!(flags?.peopleOpsEnabled || flags?.hiringEnabled);
});

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const canViewDepartmentsTab = computed(() => {
  const flags = parseFeatureFlags(agencyStore.currentAgency?.feature_flags);
  return !!flags?.budgetManagementEnabled;
});

const canViewAdminDocsTab = computed(() => {
  const u = authStore.user;
  if (!u) return false;
  const role = String(u.role || '').toLowerCase();
  const hasStaffAccess = u.has_staff_access === true || u.has_staff_access === 1 || u.has_staff_access === '1' || u.hasStaffAccess === true;
  return (
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'support' ||
    role === 'staff' ||
    hasStaffAccess ||
    isSupervisor(u) ||
    role === 'clinical_practice_assistant'
  );
});

const canViewProviderInfo = computed(() => {
  const u = user.value;
  if (!u) return false;
  // First principles: profile fields/forms apply to all employee types, not just providers.
  // Profile fields/forms apply to all employee types; tab is labeled Clinical Information in the nav.
  return true;
});

const canViewCredentialingTab = computed(() => {
  const u = authStore.user;
  const role = String(u?.role || '').toLowerCase();
  const hasCapability = u?.capabilities?.canManageCredentialing === true;
  const hasRoleFallback = ['super_admin', 'admin', 'support', 'staff'].includes(role);
  if (!hasCapability && !hasRoleFallback) return false;
  const target = user.value;
  if (!target) return false;
  const targetRole = String(target.role || '').toLowerCase();
  const providerLikeRoles = ['provider', 'provider_plus', 'clinical_practice_assistant', 'super_admin', 'admin'];
  if (!providerLikeRoles.includes(targetRole)) return false;
  const credentialText = [
    target.credential,
    accountForm.value?.credential,
    licenseCredentialSummary.value?.typeNumber
  ].map((v) => String(v || '').trim()).find(Boolean) || '';
  return isFullyLicensedCredentialText(credentialText);
});

const isViewingSchoolStaff = computed(() => {
  // IMPORTANT: Do not read accountForm here (it is declared later in this file).
  // The bundler may hoist this computed above accountForm initialization, causing a TDZ crash.
  const r = String(user.value?.role || '').trim().toLowerCase();
  return r === 'school_staff';
});

const isViewingGuardian = computed(() => {
  const r = String(user.value?.role || '').trim().toLowerCase();
  return r === 'client_guardian';
});

const isSscSstcTenant = computed(() => {
  const routeSlug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  const agencySlug = String(agencyStore.currentAgency?.slug || '').trim().toLowerCase();
  return routeSlug === 'ssc' || routeSlug === 'sstc' || agencySlug === 'ssc' || agencySlug === 'sstc';
});

const isSscMemberProfileMode = computed(() => {
  return isSscSstcTenant.value && !isViewingGuardian.value;
});

const selectedClubIdForMemberProfile = computed(() => {
  const q = Number(route.query?.clubId || 0);
  if (Number.isFinite(q) && q > 0) return q;

  const cur = agencyStore.currentAgency;
  if (cur?.id) {
    const t = String(cur.organization_type || cur.organizationType || '').toLowerCase();
    if (t === 'affiliation') {
      const id = Number(cur.id);
      if (Number.isFinite(id) && id > 0) return id;
    }
  }

  const rows = Array.isArray(userAgencies.value) ? userAgencies.value : [];
  for (const a of rows) {
    const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
    if (t === 'affiliation') {
      const id = Number(a?.id);
      if (Number.isFinite(id) && id > 0) return id;
    }
  }
  return null;
});

const memberRegistrationCustomFieldsList = computed(() => {
  const fields = memberRegistrationProfile.value?.customFields;
  if (!fields || typeof fields !== 'object') return [];
  return Object.entries(fields)
    .map(([key, value]) => ({ key: String(key || '').trim(), value: String(value ?? '').trim() }))
    .filter((item) => item.key && item.value);
});

const memberRegistrationPhoneDisplay = computed(() => {
  const p = String(memberRegistrationProfile.value?.phone || '').trim();
  return p || 'Not provided';
});

const memberRegistrationGenderDisplay = computed(() => {
  const g = String(memberRegistrationProfile.value?.gender || '').trim();
  if (!g) return 'Not provided';
  if (g.includes('_')) return g.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return g.charAt(0).toUpperCase() + g.slice(1).toLowerCase();
});

const memberRegistrationDobDisplay = computed(() => {
  const raw = memberRegistrationProfile.value?.dateOfBirth;
  if (!raw) return 'Not provided';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  return s || 'Not provided';
});

const memberRegistrationWeightDisplay = computed(() => {
  const w = memberRegistrationProfile.value?.weightLbs;
  if (w == null || w === '') return 'Not provided';
  const n = Number(w);
  if (!Number.isFinite(n)) return 'Not provided';
  return `${Number.isInteger(n) ? n : n.toFixed(1)} lbs`;
});

const memberRegistrationHeightDisplay = computed(() => {
  const inches = memberRegistrationProfile.value?.heightInches;
  if (inches == null || inches === '') return 'Not provided';
  const n = Number(inches);
  if (!Number.isFinite(n) || n <= 0) return 'Not provided';
  const ft = Math.floor(n / 12);
  const ins = Math.round(n % 12);
  return `${ft}'${ins}"`;
});

const memberRegistrationWeeklyLoadDisplay = computed(() => {
  const miles = memberRegistrationProfile.value?.averageMilesPerWeek;
  const hours = memberRegistrationProfile.value?.averageHoursPerWeek;
  const parts = [];
  if (miles != null && miles !== '') {
    const n = Number(miles);
    if (Number.isFinite(n)) parts.push(`${Number.isInteger(n) ? n : n.toFixed(1)} mi/week`);
  }
  if (hours != null && hours !== '') {
    const n = Number(hours);
    if (Number.isFinite(n)) parts.push(`${Number.isInteger(n) ? n : n.toFixed(1)} hr/week`);
  }
  return parts.length ? parts.join(' • ') : 'Not provided';
});

const memberRegistrationWaiverDisplay = computed(() => {
  const signedName = String(memberRegistrationProfile.value?.waiverSignatureName || '').trim();
  const signedAt = memberRegistrationProfile.value?.waiverAgreedAt;
  let signedAtDisplay = '';
  if (signedAt) {
    const s = String(signedAt).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!Number.isNaN(d.getTime())) {
        signedAtDisplay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }
  }
  if (signedName && signedAtDisplay) return `Signed by ${signedName} on ${signedAtDisplay}`;
  if (signedName) return `Signed by ${signedName}`;
  if (signedAtDisplay) return `Signed on ${signedAtDisplay}`;
  return 'Not provided';
});

const memberSeasonHistorySeasons = computed(() => {
  return Array.isArray(memberSeasonHistory.value?.seasons) ? memberSeasonHistory.value.seasons : [];
});

const normalizeSscClubAccountRole = (raw) => {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'assistant_manager' || value === 'provider_plus') return 'assistant_manager';
  return 'member';
};

const loadMemberSeasonHistory = async () => {
  if (!isSscMemberProfileMode.value || !userId.value) return;
  const clubId = selectedClubIdForMemberProfile.value;
  if (!clubId) return;
  memberSeasonHistoryLoading.value = true;
  memberSeasonHistoryError.value = '';
  try {
    const response = await api.get(`/summit-stats/clubs/${clubId}/members/${userId.value}/season-history`);
    const payload = response?.data || {};
    const profile = payload?.registrationProfile || {};
    memberRegistrationProfile.value = {
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      email: profile.email || '',
      phone: profile.phone || '',
      gender: profile.gender || '',
      dateOfBirth: profile.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : '',
      weightLbs: profile.weightLbs != null ? Number(profile.weightLbs) : null,
      heightInches: profile.heightInches != null ? Number(profile.heightInches) : null,
      timezone: profile.timezone || '',
      heardAboutClub: profile.heardAboutClub || '',
      runningFitnessBackground: profile.runningFitnessBackground || '',
      averageMilesPerWeek: profile.averageMilesPerWeek != null ? Number(profile.averageMilesPerWeek) : null,
      averageHoursPerWeek: profile.averageHoursPerWeek != null ? Number(profile.averageHoursPerWeek) : null,
      currentFitnessActivities: profile.currentFitnessActivities || '',
      waiverSignatureName: profile.waiverSignatureName || '',
      waiverAgreedAt: profile.waiverAgreedAt || '',
      customFields: profile.customFields && typeof profile.customFields === 'object' ? profile.customFields : {}
    };
    memberSeasonHistory.value = payload?.seasonHistory && typeof payload.seasonHistory === 'object'
      ? payload.seasonHistory
      : { seasonCount: 0, totals: {}, seasons: [] };
    memberClubRole.value = String(payload?.member?.clubRole || 'member').trim().toLowerCase() || 'member';
    if (isSscMemberProfileMode.value) {
      accountForm.value.role = normalizeSscClubAccountRole(memberClubRole.value);
    }
    memberSeasonAiSummary.value = String(payload?.aiSummary || '').trim();
    memberCaptainMeta.value = {
      everTeamCaptain: !!payload?.everTeamCaptain,
      captainTeamCount: Math.max(0, Number(payload?.captainTeamCount || 0))
    };
  } catch (e) {
    memberSeasonHistoryError.value = e.response?.data?.error?.message || 'Failed to load season history';
    memberSeasonHistory.value = { seasonCount: 0, totals: {}, seasons: [] };
    memberClubRole.value = 'member';
    memberSeasonAiSummary.value = '';
    memberCaptainMeta.value = { everTeamCaptain: false, captainTeamCount: 0 };
  } finally {
    memberSeasonHistoryLoading.value = false;
  }
};

const toggleSeasonTeamCaptain = async (season, evt) => {
  const clubId = selectedClubIdForMemberProfile.value;
  if (!clubId || !userId.value || !season?.teamId || !season?.classId) return;
  const assign = !!evt?.target?.checked;
  const key = `${season.classId}-${season.teamId}`;
  seasonCaptainTogglingKey.value = key;
  try {
    await api.put(`/summit-stats/clubs/${clubId}/members/${userId.value}/team-captain`, {
      learningClassId: season.classId,
      teamId: season.teamId,
      assign
    });
    await loadMemberSeasonHistory();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Could not update team captain');
    await loadMemberSeasonHistory();
  } finally {
    seasonCaptainTogglingKey.value = '';
  }
};

const loadGuardianLinkedClients = async () => {
  if (!userId.value || !isViewingGuardian.value) return;
  guardianLinkedClientsLoading.value = true;
  guardianLinkedClientsError.value = '';
  try {
    const response = await api.get(`/users/${userId.value}/guardian-clients`);
    guardianLinkedClients.value = Array.isArray(response?.data)
      ? response.data.map((row) => ({
        ...row,
        relationship_type: String(row?.relationship_type || 'guardian').toLowerCase(),
        relationship_title: String(row?.relationship_title || '').trim(),
        access_enabled: row?.access_enabled === 1 || row?.access_enabled === true ? 1 : 0
      }))
      : [];
  } catch (e) {
    guardianLinkedClientsError.value = e.response?.data?.error?.message || 'Failed to load linked clients';
    guardianLinkedClients.value = [];
  } finally {
    guardianLinkedClientsLoading.value = false;
  }
};

const loadGuardianEvents = async () => {
  if (!userId.value || !isViewingGuardian.value) return;
  guardianEventsLoading.value = true;
  guardianEventsError.value = '';
  try {
    const response = await api.get(`/users/${userId.value}/guardian-events`);
    guardianEvents.value = Array.isArray(response?.data) ? response.data : [];
  } catch (e) {
    guardianEventsError.value = e?.response?.data?.error?.message || 'Failed to load events';
    guardianEvents.value = [];
  } finally {
    guardianEventsLoading.value = false;
  }
};

const loadGuardianCommPrefsForClient = async (clientId) => {
  if (!clientId || guardianCommPrefs.value[clientId] !== undefined) return;
  guardianCommPrefsLoading.value = { ...guardianCommPrefsLoading.value, [clientId]: true };
  try {
    const response = await api.get(`/clients/${clientId}/clinical-responses`);
    const data = response?.data || {};
    // Pull from the structured intakeCommunicationPreferences section
    const rawFields = Array.isArray(data?.intakeCommunicationPreferences?.fields)
      ? data.intakeCommunicationPreferences.fields
      : [];
    const commFields = rawFields.map((f) => ({
      key: String(f?.key || ''),
      label: String(f?.label || f?.key || ''),
      value: String(f?.value ?? '—')
    }));
    guardianCommPrefs.value = { ...guardianCommPrefs.value, [clientId]: commFields };

    // Pull insurance fields from the clinical sections payload
    const sections = Array.isArray(data?.sections) ? data.sections : [];
    const insuranceSection = sections.find((s) => String(s?.title || '').toLowerCase() === 'insurance information');
    const insuranceFields = Array.isArray(insuranceSection?.fields) ? insuranceSection.fields : [];
    guardianInsuranceByClient.value = { ...guardianInsuranceByClient.value, [clientId]: insuranceFields };
  } catch {
    guardianCommPrefs.value = { ...guardianCommPrefs.value, [clientId]: [] };
    guardianInsuranceByClient.value = { ...guardianInsuranceByClient.value, [clientId]: [] };
  } finally {
    guardianCommPrefsLoading.value = { ...guardianCommPrefsLoading.value, [clientId]: false };
  }
};

const loadGuardianDeliveryPrefs = async () => {
  if (!userId.value || !isViewingGuardian.value) return;
  guardianDeliveryPrefsLoading.value = true;
  guardianDeliveryPrefsError.value = '';
  try {
    const r = await api.get(`/users/${userId.value}/preferences`);
    const data = r?.data || {};
    guardianDeliveryPrefsExists.value = !!(data?.user_id || data?.userId);
    guardianDeliveryPrefs.value = {
      email_enabled: data?.email_enabled !== false,
      sms_enabled: data?.sms_enabled === true,
      in_app_enabled: true,
    };
  } catch (e) {
    guardianDeliveryPrefsError.value = e.response?.data?.error?.message || 'Failed to load delivery settings';
  } finally {
    guardianDeliveryPrefsLoading.value = false;
  }
};

const saveGuardianDeliveryPrefs = async () => {
  if (!userId.value || !isViewingGuardian.value) return;
  if (!canEditUser.value) return;
  guardianDeliveryPrefsSaving.value = true;
  guardianDeliveryPrefsError.value = '';
  try {
    await api.put(`/users/${userId.value}/preferences`, {
      email_enabled: guardianDeliveryPrefs.value.email_enabled === true,
      sms_enabled: guardianDeliveryPrefs.value.sms_enabled === true,
      in_app_enabled: true,
    });
    guardianDeliveryPrefsExists.value = true;
  } catch (e) {
    guardianDeliveryPrefsError.value = e.response?.data?.error?.message || 'Failed to save delivery settings';
  } finally {
    guardianDeliveryPrefsSaving.value = false;
  }
};

const parseYesNoLike = (raw) => {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'yes' || s === 'true' || s === '1') return true;
  if (s === 'no' || s === 'false' || s === '0') return false;
  // Common structured variants from intake comm prefs
  if (s === 'scheduling_only' || s === 'scheduling only' || s === 'schedulingonly') return true;
  if (s.startsWith('yes_')) return true;
  if (s.startsWith('no_')) return false;
  return null;
};

const deriveGuardianDeliveryPrefsFromIntake = () => {
  const byClient = guardianCommPrefs.value || {};
  const all = [];
  for (const cid of Object.keys(byClient)) {
    const rows = byClient[cid];
    if (Array.isArray(rows)) all.push(...rows);
  }
  if (!all.length) return null;

  const pick = (predicate) => {
    for (const f of all) {
      if (!f) continue;
      if (predicate(f)) {
        const v = parseYesNoLike(f.value);
        if (v !== null) return v;
      }
    }
    return null;
  };

  const email = pick((f) => String(f.key || '').toLowerCase().includes('emailpreference') || /\bemail\b/i.test(String(f.label || '')));
  const sms = pick((f) => String(f.key || '').toLowerCase().includes('smspreference') || /\b(sms|text)\b/i.test(String(f.label || '')));

  if (email === null && sms === null) return null;
  return {
    email_enabled: email === null ? guardianDeliveryPrefs.value.email_enabled : email,
    sms_enabled: sms === null ? guardianDeliveryPrefs.value.sms_enabled : sms,
  };
};

const applyGuardianDeliveryPrefsFromIntake = async () => {
  const next = deriveGuardianDeliveryPrefsFromIntake();
  if (!next) return;
  guardianDeliveryPrefs.value = { ...guardianDeliveryPrefs.value, ...next, in_app_enabled: true };
  // Save immediately (admin intent)
  await saveGuardianDeliveryPrefs();
};

const maybeAutoSyncGuardianDeliveryPrefsFromIntake = async () => {
  if (!isViewingGuardian.value) return;
  if (guardianDeliveryPrefsExists.value) return;
  if (guardianDeliveryPrefsAutoSynced) return;
  const next = deriveGuardianDeliveryPrefsFromIntake();
  if (!next) return;
  guardianDeliveryPrefsAutoSynced = true;
  guardianDeliveryPrefs.value = { ...guardianDeliveryPrefs.value, ...next, in_app_enabled: true };
  await saveGuardianDeliveryPrefs();
};

const searchGuardianClients = async () => {
  const q = String(guardianClientQuery.value || '').trim();
  if (!q) {
    guardianClientOptions.value = [];
    guardianSelectedClientId.value = '';
    return;
  }
  guardianSearchLoading.value = true;
  guardianLinkError.value = '';
  try {
    const response = await api.get('/clients', {
      params: {
        search: q,
        includeArchived: false,
        paginate: false
      }
    });
    const payload = response?.data || [];
    const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
    guardianClientOptions.value = rows.slice(0, 25);
    if (!guardianClientOptions.value.find((c) => String(c.id) === String(guardianSelectedClientId.value))) {
      guardianSelectedClientId.value = guardianClientOptions.value.length ? String(guardianClientOptions.value[0].id) : '';
    }
  } catch (e) {
    guardianLinkError.value = e.response?.data?.error?.message || 'Failed to search clients';
  } finally {
    guardianSearchLoading.value = false;
  }
};

const linkGuardianToClient = async () => {
  const clientId = parseInt(String(guardianSelectedClientId.value || ''), 10);
  if (!clientId || !userId.value) return;
  const email = String(user.value?.email || '').trim();
  if (!email) {
    guardianLinkError.value = 'Guardian account is missing an email. Add an email on the Account tab first.';
    return;
  }
  guardianLinkSaving.value = true;
  guardianLinkError.value = '';
  try {
    const relType = String(guardianLinkRelationshipType.value || 'guardian').toLowerCase();
    const relationshipTitle = relType === 'self' ? 'Self' : relType === 'proxy' ? 'Proxy' : 'Guardian';
    await api.post(`/clients/${clientId}/guardians`, {
      email,
      firstName: String(user.value?.first_name || '').trim(),
      lastName: String(user.value?.last_name || '').trim(),
      relationshipType: relType,
      relationshipTitle,
      accessEnabled: true
    });
    await loadGuardianLinkedClients();
  } catch (e) {
    guardianLinkError.value = e.response?.data?.error?.message || 'Failed to link guardian to client';
  } finally {
    guardianLinkSaving.value = false;
  }
};

const saveGuardianClientLink = async (row) => {
  if (!row?.client_id || !userId.value) return;
  guardianLinkSaving.value = true;
  guardianLinkError.value = '';
  try {
    const relType = String(row.relationship_type || 'guardian').toLowerCase();
    await api.patch(`/clients/${row.client_id}/guardians/${userId.value}`, {
      relationshipType: relType,
      relationshipTitle: String(row.relationship_title || (relType === 'self' ? 'Self' : relType === 'proxy' ? 'Proxy' : 'Guardian')).trim(),
      accessEnabled: row.access_enabled === 1 || row.access_enabled === true
    });
    await loadGuardianLinkedClients();
  } catch (e) {
    guardianLinkError.value = e.response?.data?.error?.message || 'Failed to update guardian-client link';
  } finally {
    guardianLinkSaving.value = false;
  }
};

const removeGuardianClientLink = async (row) => {
  if (!row?.client_id || !userId.value) return;
  if (!confirm('Remove this client link from the guardian account?')) return;
  guardianLinkSaving.value = true;
  guardianLinkError.value = '';
  try {
    await api.delete(`/clients/${row.client_id}/guardians/${userId.value}`);
    await loadGuardianLinkedClients();
  } catch (e) {
    guardianLinkError.value = e.response?.data?.error?.message || 'Failed to remove guardian-client link';
  } finally {
    guardianLinkSaving.value = false;
  }
};

const openLinkedClient = (clientId) => {
  const cid = parseInt(String(clientId || ''), 10);
  if (!cid) return;
  const orgSlug = String(route.params.organizationSlug || '').trim();
  if (orgSlug) {
    router.push(`/${orgSlug}/admin/clients/${cid}`);
    return;
  }
  router.push(`/admin/clients/${cid}`);
};

const canViewSchoolAffiliation = computed(() => {
  const u = user.value;
  if (!u) return false;
  const role = String(u.role || '').toLowerCase();
  const hasProviderAccess =
    u.has_provider_access === true ||
    u.has_provider_access === 1 ||
    u.has_provider_access === '1' ||
    u.hasProviderAccess === true;
  const providerLikeRoles = ['provider', 'provider_plus', 'intern', 'intern_plus', 'admin', 'super_admin', 'clinical_practice_assistant'];
  return providerLikeRoles.includes(role) || hasProviderAccess;
});

const AFFILIATION_TAB_CONFIG = Object.freeze({
  school_affiliation: { type: 'school', label: 'School Affiliation', singleLabel: 'School', pluralLabel: 'Schools' },
  program_affiliation: { type: 'program', label: 'Program Affiliation', singleLabel: 'Program', pluralLabel: 'Programs' },
  learning_affiliation: { type: 'learning', label: 'Learning Affiliation', singleLabel: 'Learning Organization', pluralLabel: 'Learning Organizations' }
});

const AFFILIATION_SECTION_IDS = Object.freeze(Object.keys(AFFILIATION_TAB_CONFIG));

const isAffiliationSectionId = (sectionId) => Object.prototype.hasOwnProperty.call(AFFILIATION_TAB_CONFIG, String(sectionId || ''));
const isLegacyAffiliationTabId = (tabId) => isAffiliationSectionId(tabId);

const isAffiliationTabActive = computed(() => activeTab.value === 'affiliations');
const activeAffiliationConfig = computed(() => AFFILIATION_TAB_CONFIG[String(activeAffiliationSection.value)] || null);
const activeAffiliationOrgType = computed(() => String(activeAffiliationConfig.value?.type || ''));
const activeAffiliationTabLabel = computed(() => String(activeAffiliationConfig.value?.label || 'Affiliation'));
const activeAffiliationSingleLabel = computed(() => String(activeAffiliationConfig.value?.singleLabel || 'Affiliation'));
const activeAffiliationPluralLabel = computed(() => String(activeAffiliationConfig.value?.pluralLabel || 'Affiliations'));

const supervisees = ref([]);
const supervisors = ref([]);
const superviseesLoading = ref(false);
const supervisorsLoading = ref(false);

// Role assignment permissions
const canEditUser = computed(() => {
  const user = authStore.user;
  if (!user) return false;
  // Admin/support/staff keep full edit access even with supervisor privileges (supervisor is always additive).
  if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'support' || user.role === 'staff') return true;
  // CPAs and supervisor-only users have view-only access
  return !isSupervisor(user) && user.role !== 'clinical_practice_assistant';
});

const tabs = computed(() => {
  // Guardian accounts are portal-only (non-employee): show only basic account info.
  if (isViewingGuardian.value) {
    return [
      { id: 'account', label: 'Account' },
      { id: 'linked_clients', label: 'Linked Clients' },
      { id: 'assignments', label: 'Assignments' },
      { id: 'events', label: 'Events' },
      { id: 'communications', label: 'Communications' },
      { id: 'preferences', label: 'Preferences' },
      ...(canViewActivityLog.value ? [{ id: 'activity', label: 'Activity Log' }] : [])
    ];
  }

  if (isSscMemberProfileMode.value) {
    return [
      { id: 'account', label: 'Account' },
      { id: 'season_history', label: 'Season History' },
      ...(canEditUser.value ? [{ id: 'communications', label: 'Communications' }] : []),
      ...(canViewActivityLog.value ? [{ id: 'activity', label: 'Activity Log' }] : [])
    ];
  }

  // School staff accounts should be simple (no provider workflow / availability / payroll / etc).
  if (isViewingSchoolStaff.value) {
    const schoolStaffTabs = [
      { id: 'account', label: 'Account' },
      { id: 'training', label: 'Training' },
      { id: 'documents', label: 'Documents' },
      { id: 'communications', label: 'Communications' },
      ...(canViewAdminDocsTab.value ? [{ id: 'admin_docs', label: 'Admin Documentation' }] : []),
      { id: 'preferences', label: 'Preferences' },
      ...(canViewActivityLog.value ? [{ id: 'activity', label: 'Activity Log' }] : [])
    ];
    return schoolStaffTabs;
  }

  const baseTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'account', label: 'Account' },
    { id: 'benefits', label: 'Benefits' },
    ...(canViewLifecycleTab.value ? [{ id: 'lifecycle', label: 'Lifecycle' }] : []),
    ...(canViewProviderInfo.value ? [{ id: 'provider_info', label: 'Clinical Information' }] : []),
    ...(canViewCredentialingTab.value ? [{ id: 'credentialing', label: 'Credentialing' }] : []),
    ...(canViewSchoolAffiliation.value
      ? [{ id: 'affiliations', label: 'Affiliations' }]
      : []),
    ...(canViewProviderInfo.value ? [{ id: 'schedule_availability', label: 'Schedule & Availability' }] : []),
    { id: 'training', label: 'Training' },
    { id: 'documents', label: 'Documents' },
    { id: 'communications', label: 'Communications' },
    ...(canViewAdminDocsTab.value ? [{ id: 'admin_docs', label: 'Admin Documentation' }] : []),
    { id: 'preferences', label: 'Preferences' }
  ];

  if (canViewPayroll.value) {
    baseTabs.push({ id: 'payroll', label: 'Payroll' });
  }
  if (canViewPayroll.value && canViewDepartmentsTab.value) {
    baseTabs.push({ id: 'departments', label: 'Departments' });
  }

  if (canViewPayroll.value || canViewProviderInfo.value) {
    baseTabs.push({ id: 'supervision', label: 'Supervision' });
  }

  if (canViewActivityLog.value) {
    baseTabs.push({ id: 'activity', label: 'Activity Log' });
  }
  
  return baseTabs;
});

// If the current tab becomes unavailable (e.g., switching to a school_staff user), normalize to first tab.
watch(
  tabs,
  (t) => {
    const allowed = new Set((t || []).map((x) => x.id));
    const cur = String(activeTab.value || '');
    if (isLegacyAffiliationTabId(cur)) {
      activeAffiliationSection.value = cur;
      activeTab.value = 'affiliations';
      return;
    }
    if (!allowed.has(cur)) {
      activeTab.value = (t || [])[0]?.id || 'account';
    }
  },
  { immediate: true }
);

const accountForm = ref({
  firstName: '',
  lastName: '',
  preferredName: '',
  email: '',
  personalEmail: '',
  title: '',
  serviceFocus: '',
  languagesSpoken: '',
  phoneNumber: '',
  personalPhone: '',
  workPhone: '',
  workPhoneExtension: '',
  homeStreetAddress: '',
  homeAddressLine2: '',
  homeCity: '',
  homeState: '',
  homePostalCode: '',
  medcancelRateSchedule: 'none',
  companyCardEnabled: false,
  companyCarSubmitAccess: false,
  companyCarManageAccess: false,
  skillBuilderEligible: false,
  hasSkillBuilderCoordinatorAccess: false,
  externalBusyIcsUrl: '',
  role: '',
  credential: '',
  hasSupervisorPrivileges: false,
  hasProviderAccess: false,
  hasStaffAccess: false,
  hasPayrollAccess: false,
  hasBillingAccess: false,
  isMarketingContact: false,
  hasCredentialingAccess: false,
  isHourlyWorker: false,
  hasHiringAccess: false,
  hasMedicalRecordsReleaseAccess: false,
  hasGamesAccess: false,
  providerStartDate: ''
});

/** Values for <input type="date"> must be yyyy-MM-dd; API may send Date objects or strings that stringify badly. */
const toDateInputValue = (raw) => {
  if (raw === null || raw === undefined) return '';
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return '';
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const dt = new Date(t);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }
  return '';
};

const forcingSkillBuilderConfirm = ref(false);

const canEditSkillBuilderCoordinatorAccess = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'support';
});

const canRequireSkillBuilderConfirmNextLogin = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'support' || r === 'staff';
});

// School affiliation (provider scheduling / availability)
const schoolAffiliationsLoading = ref(false);
const schoolAffiliationsError = ref('');
const schoolAffiliations = ref([]);
const selectedSchoolAffiliationId = ref('');
const affiliationsForActiveTab = computed(() => {
  const type = activeAffiliationOrgType.value;
  const list = Array.isArray(schoolAffiliations.value) ? schoolAffiliations.value : [];
  if (!type) return [];
  return list.filter((o) => String(o?.organization_type || '').toLowerCase() === type);
});

const ensureSelectedAffiliationForActiveTab = () => {
  if (!isAffiliationTabActive.value) return;
  const list = affiliationsForActiveTab.value || [];
  if (list.length === 0) {
    selectedSchoolAffiliationId.value = '';
    return;
  }
  const selectedId = Number(selectedSchoolAffiliationId.value || 0);
  const existsInTab = list.some((o) => Number(o?.id) === selectedId);
  if (!existsInTab) selectedSchoolAffiliationId.value = String(list[0].id);
};

const selectedSchoolAffiliation = computed(() => {
  const id = Number(selectedSchoolAffiliationId.value || 0);
  const list = Array.isArray(schoolAffiliations.value) ? schoolAffiliations.value : [];
  return list.find((o) => Number(o?.id) === id) || null;
});
const selectedSchoolAffiliationSlug = computed(() => {
  const slug = String(selectedSchoolAffiliation.value?.slug || '').trim();
  return slug || '';
});

const providerSchoolPortalHref = computed(() => {
  const slug = selectedSchoolAffiliationSlug.value;
  const pid = Number(userId.value || 0);
  if (!slug || !pid) return '';
  // Use router.resolve so this respects the app's base URL if configured.
  return router.resolve({ path: `/${slug}/providers/${pid}` }).href;
});
const selectedSchoolIsSchool = computed(() => {
  const t = String(selectedSchoolAffiliation.value?.organization_type || '').toLowerCase();
  return t === 'school';
});

const providerAcceptingNewClients = ref(true);
const updatingGlobalAvailability = ref(false);
const showGlobalAvailabilityHint = ref(false);

// Provider school info blurb (one per provider, shared across all schools)
const providerSchoolBlurb = ref('');
const providerSchoolBlurbExpanded = ref(false);
const providerSchoolBlurbSaving = ref(false);
const providerSchoolBlurbError = ref('');

const showGlobalAvailabilityInHeader = computed(() => {
  if (isSscMemberProfileMode.value) return false;
  const r = String(user.value?.role || accountForm.value?.role || '').trim().toLowerCase();
  const isProviderLike = r === 'provider' || r === 'intern' || r === 'facilitator' || r === 'supervisor';
  return !!user.value && isProviderLike;
});

const showLeaveOfAbsenceModal = ref(false);
const leaveOfAbsence = ref(null);
const showLeaveOfAbsenceButton = computed(() => {
  return !!user.value && canEditUser.value && (isProviderLikeUser.value || canViewProviderInfo.value);
});
const isOnLeave = computed(() => {
  const loa = leaveOfAbsence.value;
  if (!loa?.departureDate || !loa?.returnDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return loa.departureDate <= today && loa.returnDate >= today;
});
const leaveOfAbsenceLabel = computed(() => {
  const loa = leaveOfAbsence.value;
  if (!loa) return '';
  const parts = [];
  if (loa.leaveType) parts.push(loa.leaveType.charAt(0).toUpperCase() + loa.leaveType.slice(1));
  if (loa.departureDate) parts.push(`from ${loa.departureDate}`);
  if (loa.returnDate) parts.push(`until ${loa.returnDate}`);
  return parts.join(' ');
});
const leaveBadgeText = computed(() => {
  const loa = leaveOfAbsence.value;
  if (!loa?.returnDate) return 'On leave';
  const formatted = formatLeaveReturnDate(loa.returnDate);
  const typeLabel = loa.leaveType === 'maternity' ? 'Maternity leave' : loa.leaveType === 'paternity' ? 'Paternity leave' : loa.leaveType === 'medical' ? 'Medical leave' : null;
  if (typeLabel) return `${typeLabel} until ${formatted}`;
  return `On leave until ${formatted}`;
});
const formatLeaveReturnDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d;
  }
};

const canToggleGlobalAvailability = computed(() => {
  const current = authStore.user;
  if (!current) return false;
  const currentRole = String(current.role || '').toLowerCase();
  const isAdminLike = currentRole === 'super_admin' || currentRole === 'admin' || currentRole === 'support';
  const isSelf = parseInt(current.id || 0, 10) === parseInt(userId.value || 0, 10);
  return isAdminLike || isSelf;
});

const canEditExternalBusyIcsUrl = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
});

const ehrIcsUrl = ref('');
const ehrIcsSaving = ref(false);
const ehrIcsError = ref('');

const externalCalendarsLoading = ref(false);
const externalCalendarsError = ref('');
const externalCalendarsSaving = ref(false);
const externalCalendars = ref([]);
const newExternalCalendarLabel = ref('');
const newExternalFeedUrlByCalendarId = ref({});
const editExternalCalendarLabelById = ref({});
const showExternalCalendarsModal = ref(false);

const THERAPY_NOTES_DEFAULT_CALENDAR_LABEL = 'Therapy Notes';

const therapyNotesCalendar = computed(() => {
  const list = Array.isArray(externalCalendars.value) ? externalCalendars.value : [];
  return list.find((c) => String(c?.label || '').trim().toLowerCase() === THERAPY_NOTES_DEFAULT_CALENDAR_LABEL.toLowerCase()) || null;
});

const syncEhrIcsFromCalendars = () => {
  const cal = therapyNotesCalendar.value;
  if (!cal) {
    ehrIcsUrl.value = '';
    return;
  }
  const feeds = Array.isArray(cal.feeds) ? cal.feeds : [];
  const activeFeed = feeds.find((f) => !!f?.isActive) || feeds[0] || null;
  ehrIcsUrl.value = String(activeFeed?.icsUrl || '').trim();
};

const loadExternalCalendars = async () => {
  if (!canEditExternalBusyIcsUrl.value) return;
  try {
    externalCalendarsLoading.value = true;
    externalCalendarsError.value = '';
    const r = await api.get(`/users/${userId.value}/external-calendars`);
    externalCalendars.value = Array.isArray(r.data?.calendars) ? r.data.calendars : [];
    // Keep the simple Therapy Notes ICS field in sync with loaded calendars.
    if (!ehrIcsSaving.value) syncEhrIcsFromCalendars();
  } catch (e) {
    externalCalendars.value = [];
    externalCalendarsError.value = e.response?.data?.error?.message || 'Failed to load external calendars';
    if (!ehrIcsSaving.value) ehrIcsUrl.value = '';
  } finally {
    externalCalendarsLoading.value = false;
  }
};

const openExternalCalendarsModal = async () => {
  showExternalCalendarsModal.value = true;
  // Load calendars (if allowed). Keeps modal content fresh.
  try {
    await loadExternalCalendars();
  } catch {
    // loadExternalCalendars already sets an error message
  }
};

const closeExternalCalendarsModal = () => {
  showExternalCalendarsModal.value = false;
};

const saveEhrIcsUrl = async () => {
  if (!canEditExternalBusyIcsUrl.value) return;
  const url = String(ehrIcsUrl.value || '').trim();
  try {
    ehrIcsSaving.value = true;
    ehrIcsError.value = '';

    // Ensure calendars are loaded so we can find existing Therapy Notes feed(s).
    if (!externalCalendarsLoading.value && (!Array.isArray(externalCalendars.value) || externalCalendars.value.length === 0)) {
      await loadExternalCalendars();
    }

    let cal = therapyNotesCalendar.value;
    let calendarId = Number(cal?.id || 0);

    if (!calendarId && url) {
      const created = await api.post(`/users/${userId.value}/external-calendars`, { label: THERAPY_NOTES_DEFAULT_CALENDAR_LABEL });
      calendarId = Number(created.data?.calendar?.id || 0);
      await loadExternalCalendars();
      cal = therapyNotesCalendar.value;
      calendarId = Number(cal?.id || calendarId || 0);
    }

    if (!calendarId) {
      // Nothing to do (e.g. blank URL and no calendar exists)
      return;
    }

    // Always keep the calendar active if a URL is provided.
    if (url) {
      await api.patch(`/users/${userId.value}/external-calendars/${calendarId}`, { isActive: true });
    }

    const feeds = Array.isArray(cal?.feeds) ? cal.feeds : [];

    if (!url) {
      // Blank URL means disable all feeds for the Therapy Notes calendar.
      for (const f of feeds) {
        const feedId = Number(f?.id || 0);
        if (!feedId) continue;
        if (f?.isActive) {
          await api.patch(`/users/${userId.value}/external-calendars/${calendarId}/feeds/${feedId}`, { isActive: false });
        }
      }
      await loadExternalCalendars();
      return;
    }

    // If this exact URL already exists, enable it and disable others.
    const existingSame = feeds.find((f) => String(f?.icsUrl || '').trim() === url) || null;
    if (existingSame?.id) {
      const keepId = Number(existingSame.id);
      if (!existingSame.isActive) {
        await api.patch(`/users/${userId.value}/external-calendars/${calendarId}/feeds/${keepId}`, { isActive: true });
      }
      for (const f of feeds) {
        const feedId = Number(f?.id || 0);
        if (!feedId || feedId === keepId) continue;
        if (f?.isActive) {
          await api.patch(`/users/${userId.value}/external-calendars/${calendarId}/feeds/${feedId}`, { isActive: false });
        }
      }
      await loadExternalCalendars();
      return;
    }

    // Otherwise create a new feed for this URL, then disable all others.
    const added = await api.post(`/users/${userId.value}/external-calendars/${calendarId}/feeds`, { icsUrl: url });
    const newFeedId = Number(added.data?.feed?.id || 0);

    // Refresh so we have the latest feed list, then deactivate all but the new one.
    await loadExternalCalendars();
    const nextCal = therapyNotesCalendar.value;
    const nextFeeds = Array.isArray(nextCal?.feeds) ? nextCal.feeds : [];
    for (const f of nextFeeds) {
      const feedId = Number(f?.id || 0);
      if (!feedId || (newFeedId && feedId === newFeedId)) continue;
      if (f?.isActive) {
        await api.patch(`/users/${userId.value}/external-calendars/${calendarId}/feeds/${feedId}`, { isActive: false });
      }
    }
    await loadExternalCalendars();
  } catch (e) {
    ehrIcsError.value = e.response?.data?.error?.message || 'Failed to save ICS URL';
  } finally {
    ehrIcsSaving.value = false;
  }
};

const createExternalCalendar = async () => {
  if (!canEditExternalBusyIcsUrl.value) return;
  const label = String(newExternalCalendarLabel.value || '').trim();
  if (!label) return;
  try {
    externalCalendarsSaving.value = true;
    externalCalendarsError.value = '';
    await api.post(`/users/${userId.value}/external-calendars`, { label });
    newExternalCalendarLabel.value = '';
    await loadExternalCalendars();
  } catch (e) {
    externalCalendarsError.value = e.response?.data?.error?.message || 'Failed to create calendar';
  } finally {
    externalCalendarsSaving.value = false;
  }
};

const addExternalFeed = async (calendar) => {
  if (!canEditExternalBusyIcsUrl.value) return;
  const calendarId = Number(calendar?.id || 0);
  if (!calendarId) return;
  const url = String(newExternalFeedUrlByCalendarId.value?.[calendarId] || '').trim();
  if (!url) return;
  try {
    externalCalendarsSaving.value = true;
    externalCalendarsError.value = '';
    await api.post(`/users/${userId.value}/external-calendars/${calendarId}/feeds`, { icsUrl: url });
    newExternalFeedUrlByCalendarId.value = { ...(newExternalFeedUrlByCalendarId.value || {}), [calendarId]: '' };
    await loadExternalCalendars();
  } catch (e) {
    externalCalendarsError.value = e.response?.data?.error?.message || 'Failed to add feed';
  } finally {
    externalCalendarsSaving.value = false;
  }
};

const toggleExternalCalendar = async (calendar, enabled) => {
  if (!canEditExternalBusyIcsUrl.value) return;
  const calendarId = Number(calendar?.id || 0);
  if (!calendarId) return;
  try {
    externalCalendarsSaving.value = true;
    externalCalendarsError.value = '';
    await api.patch(`/users/${userId.value}/external-calendars/${calendarId}`, { isActive: !!enabled });
    await loadExternalCalendars();
  } catch (e) {
    externalCalendarsError.value = e.response?.data?.error?.message || 'Failed to update calendar';
  } finally {
    externalCalendarsSaving.value = false;
  }
};

const saveExternalCalendarLabel = async (calendar) => {
  if (!canEditExternalBusyIcsUrl.value) return;
  const calendarId = Number(calendar?.id || 0);
  if (!calendarId) return;
  const label = String(editExternalCalendarLabelById.value?.[calendarId] ?? calendar?.label ?? '').trim();
  if (!label) return;
  try {
    externalCalendarsSaving.value = true;
    externalCalendarsError.value = '';
    await api.patch(`/users/${userId.value}/external-calendars/${calendarId}`, { label });
    await loadExternalCalendars();
  } catch (e) {
    externalCalendarsError.value = e.response?.data?.error?.message || 'Failed to update calendar label';
  } finally {
    externalCalendarsSaving.value = false;
  }
};

const toggleExternalFeed = async (calendar, feed, enabled) => {
  if (!canEditExternalBusyIcsUrl.value) return;
  const calendarId = Number(calendar?.id || 0);
  const feedId = Number(feed?.id || 0);
  if (!calendarId || !feedId) return;
  try {
    externalCalendarsSaving.value = true;
    externalCalendarsError.value = '';
    await api.patch(`/users/${userId.value}/external-calendars/${calendarId}/feeds/${feedId}`, { isActive: !!enabled });
    await loadExternalCalendars();
  } catch (e) {
    externalCalendarsError.value = e.response?.data?.error?.message || 'Failed to update feed';
  } finally {
    externalCalendarsSaving.value = false;
  }
};

const saveGlobalAvailability = async () => {
  try {
    if (!canToggleGlobalAvailability.value) return;
    updatingGlobalAvailability.value = true;
    await api.put(`/users/${userId.value}`, { providerAcceptingNewClients: Boolean(providerAcceptingNewClients.value) });
    await fetchUser();
    // If the user is toggling themselves, refresh the auth store so navbar reflects it.
    try {
      if (parseInt(authStore.user?.id || 0, 10) === parseInt(userId.value || 0, 10)) {
        await authStore.refreshUser();
      }
    } catch {
      // ignore
    }
    showGlobalAvailabilityHint.value = true;
    window.setTimeout(() => { showGlobalAvailabilityHint.value = false; }, 8000);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update global availability');
    // revert from server
    await fetchUser();
  } finally {
    updatingGlobalAvailability.value = false;
  }
};

const schoolAssignmentsLoading = ref(false);
const schoolAssignmentsError = ref('');
const savingSchoolAffiliation = ref(false);
const schoolOverrideOpen = ref(false);
const repairingProviderSlots = ref(false);

const selectedSchoolBellSchedule = ref({ startTime: null, endTime: null, notes: null });
const fmtTime = (v) => {
  const s = String(v || '').trim();
  if (!s) return '—';
  return s.length >= 5 ? s.slice(0, 5) : s;
};
const selectedSchoolBellScheduleStartDisplay = computed(() => fmtTime(selectedSchoolBellSchedule.value?.startTime));
const selectedSchoolBellScheduleEndDisplay = computed(() => fmtTime(selectedSchoolBellSchedule.value?.endTime));
const selectedSchoolBellScheduleNotesDisplay = computed(() => {
  const n = String(selectedSchoolBellSchedule.value?.notes || '').trim();
  return n || '—';
});

const schoolDayEdits = ref([
  { dayOfWeek: 'Monday', isActive: true, startTime: '', endTime: '', slotsTotal: 0, slotsAuto: true, slotsAvailableDisplay: '—' },
  { dayOfWeek: 'Tuesday', isActive: true, startTime: '', endTime: '', slotsTotal: 0, slotsAuto: true, slotsAvailableDisplay: '—' },
  { dayOfWeek: 'Wednesday', isActive: true, startTime: '', endTime: '', slotsTotal: 0, slotsAuto: true, slotsAvailableDisplay: '—' },
  { dayOfWeek: 'Thursday', isActive: true, startTime: '', endTime: '', slotsTotal: 0, slotsAuto: true, slotsAvailableDisplay: '—' },
  { dayOfWeek: 'Friday', isActive: true, startTime: '', endTime: '', slotsTotal: 0, slotsAuto: true, slotsAvailableDisplay: '—' }
]);

const calcAutoSlots = (start, end) => {
  const s = String(start || '').slice(0, 5);
  const e = String(end || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(e)) return 0;
  const [sh, sm] = s.split(':').map((n) => parseInt(n, 10));
  const [eh, em] = e.split(':').map((n) => parseInt(n, 10));
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (!Number.isFinite(mins) || mins <= 0) return 0;
  return Math.ceil(mins / 60);
};

const applyAutoSlots = (d) => {
  d.slotsTotal = calcAutoSlots(d.startTime, d.endTime);
  d.slotsAuto = true;
};

const loadSchoolAffiliations = async () => {
  try {
    schoolAffiliationsLoading.value = true;
    schoolAffiliationsError.value = '';
    const r = await api.get('/provider-self/affiliations', { params: { providerUserId: userId.value } });
    schoolAffiliations.value = r.data?.affiliations || [];
    ensureSelectedAffiliationForActiveTab();
  } catch (e) {
    schoolAffiliationsError.value = e.response?.data?.error?.message || 'Failed to load affiliations';
    schoolAffiliations.value = [];
    selectedSchoolAffiliationId.value = '';
  } finally {
    schoolAffiliationsLoading.value = false;
  }
};

const loadSchoolAssignments = async () => {
  if (!selectedSchoolAffiliationId.value) return;
  try {
    schoolAssignmentsLoading.value = true;
    schoolAssignmentsError.value = '';
    const r = await api.get(`/provider-self/affiliations/${selectedSchoolAffiliationId.value}/assignments`, {
      params: { providerUserId: userId.value }
    });
    const assignments = r.data?.assignments || [];
    const override = r.data?.schoolAcceptingNewClientsOverride;
    schoolOverrideOpen.value = override === true;
    selectedSchoolBellSchedule.value = r.data?.schoolBellSchedule || { startTime: null, endTime: null, notes: null };

    const byDay = new Map(assignments.map((a) => [String(a.day_of_week), a]));
    schoolDayEdits.value = (schoolDayEdits.value || []).map((d) => {
      const a = byDay.get(d.dayOfWeek);
      const start = a?.start_time ? String(a.start_time).slice(0, 5) : '';
      const end = a?.end_time ? String(a.end_time).slice(0, 5) : '';
      const autoSlots = calcAutoSlots(start, end);
      const slotsTotal = a?.slots_total !== undefined && a?.slots_total !== null ? Number(a.slots_total) : autoSlots;
      // Prefer calculated availability when present (matches School Portal display).
      const slotsAvail =
        a?.slots_available_calculated !== undefined && a?.slots_available_calculated !== null
          ? Number(a.slots_available_calculated)
          : (a?.slots_available !== undefined && a?.slots_available !== null ? Number(a.slots_available) : null);
      return {
        ...d,
        isActive: a ? Boolean(a.is_active) : false,
        startTime: start,
        endTime: end,
        slotsTotal: Number.isFinite(slotsTotal) ? slotsTotal : 0,
        slotsAuto: slotsTotal === autoSlots,
        slotsAvailableDisplay: slotsAvail === null ? '—' : String(slotsAvail)
      };
    });
  } catch (e) {
    schoolAssignmentsError.value = e.response?.data?.error?.message || 'Failed to load school assignments';
    selectedSchoolBellSchedule.value = { startTime: null, endTime: null, notes: null };
  } finally {
    schoolAssignmentsLoading.value = false;
  }
};

const repairProviderSlots = async () => {
  if (!canRepairProviderSlots.value) return;
  if (!selectedSchoolAffiliationId.value) return;
  try {
    repairingProviderSlots.value = true;
    schoolAssignmentsError.value = '';
    // IMPORTANT: Express's JSON parser (strict mode) rejects JSON primitives like `null`,
    // returning 400 with "Unexpected token n in JSON at position 0". Send an object body instead.
    await api.post(`/provider-self/affiliations/${selectedSchoolAffiliationId.value}/repair-slots`, {}, {
      params: { providerUserId: userId.value }
    });
    await loadSchoolAssignments();
  } catch (e) {
    schoolAssignmentsError.value = e.response?.data?.error?.message || 'Failed to repair slots';
  } finally {
    repairingProviderSlots.value = false;
  }
};

const syncProviderSchoolBlurbFromUser = () => {
  providerSchoolBlurb.value = String(user.value?.provider_school_info_blurb || '');
};

const saveProviderSchoolBlurb = async () => {
  if (!userId.value) return;
  try {
    providerSchoolBlurbSaving.value = true;
    providerSchoolBlurbError.value = '';
    await api.put(`/users/${userId.value}`, {
      providerSchoolInfoBlurb: providerSchoolBlurb.value || null
    });
    await fetchUser();
    syncProviderSchoolBlurbFromUser();
  } catch (e) {
    providerSchoolBlurbError.value = e.response?.data?.error?.message || 'Failed to save provider school info';
  } finally {
    providerSchoolBlurbSaving.value = false;
  }
};

const saveSchoolAffiliation = async () => {
  if (!selectedSchoolAffiliationId.value) return;
  try {
    savingSchoolAffiliation.value = true;

    // Save global open/closed flag via users endpoint.
    await api.put(`/users/${userId.value}`, {
      providerAcceptingNewClients: Boolean(providerAcceptingNewClients.value)
    });

    const days = (schoolDayEdits.value || []).map((d) => {
      const next = { ...d };
      if (next.slotsAuto) {
        next.slotsTotal = calcAutoSlots(next.startTime, next.endTime);
      }
      return {
        dayOfWeek: next.dayOfWeek,
        isActive: Boolean(next.isActive),
        startTime: next.startTime || null,
        endTime: next.endTime || null,
        slotsTotal: Number(next.slotsTotal || 0)
      };
    });

    await api.put(
      `/provider-self/affiliations/${selectedSchoolAffiliationId.value}/assignments`,
      {
        schoolAcceptingNewClientsOverride: schoolOverrideOpen.value ? true : null,
        days
      },
      { params: { providerUserId: userId.value } }
    );

    await fetchUser();
    await loadSchoolAssignments();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to save school affiliation');
  } finally {
    savingSchoolAffiliation.value = false;
  }
};

// Provider credential source of truth is users.credential.
// Keep a legacy field id fallback while older environments migrate.
const providerCredentialFieldId = ref(null);
const providerCredentialLoaded = ref(false);

const licenseCredentialSummary = ref({
  hasDetails: false,
  typeNumber: '',
  issuedDate: '',
  expirationDate: '',
  uploadUrl: '',
  uploadedAt: ''
});

const LICENSE_INFO_FIELD_KEYS = {
  typeNumber: ['provider_credential_license_type_number', 'license_type_number'],
  issuedDate: ['provider_credential_license_issued_date', 'license_issued', 'license_issued_date'],
  expirationDate: ['provider_credential_license_expiration_date', 'license_expires', 'license_expiration_date'],
  upload: ['license_upload']
};

const pickUserInfoFieldValue = (rows, keys) => {
  const list = Array.isArray(rows) ? rows : [];
  for (const key of keys || []) {
    const hit = list.find((f) => String(f?.field_key || '').toLowerCase() === String(key).toLowerCase());
    const val = hit?.value;
    if (val !== null && val !== undefined && String(val).trim()) return String(val).trim();
  }
  return '';
};

const formatLicenseDisplayDate = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const isFullyLicensedForCredentialing = computed(() => {
  const credentialText = [
    accountForm.value?.credential,
    user.value?.credential,
    licenseCredentialSummary.value?.typeNumber
  ].map((v) => String(v || '').trim()).find(Boolean) || '';
  if (!isFullyLicensedCredentialText(credentialText)) return false;
  const supervisorLists = [supervisors.value, accountInfo.value?.supervisors, overview.value?.supervisors];
  return !hasClinicalSupervisorInLists(supervisorLists);
});

const fetchLicenseCredentialSummary = async () => {
  try {
    const res = await api.get(`/users/${userId.value}/user-info`, { skipGlobalLoading: true });
    const rows = Array.isArray(res.data) ? res.data : [];
    const typeNumber = pickUserInfoFieldValue(rows, LICENSE_INFO_FIELD_KEYS.typeNumber);
    const issuedDate = formatLicenseDisplayDate(pickUserInfoFieldValue(rows, LICENSE_INFO_FIELD_KEYS.issuedDate));
    const expirationDate = formatLicenseDisplayDate(pickUserInfoFieldValue(rows, LICENSE_INFO_FIELD_KEYS.expirationDate));
    const uploadRaw = pickUserInfoFieldValue(rows, LICENSE_INFO_FIELD_KEYS.upload);
    const uploadUrl = uploadRaw ? toUploadsUrl(uploadRaw) : '';
    licenseCredentialSummary.value = {
      hasDetails: !!(typeNumber || issuedDate || expirationDate || uploadUrl),
      typeNumber,
      issuedDate,
      expirationDate,
      uploadUrl: uploadUrl || '',
      uploadedAt: uploadUrl ? 'On file' : ''
    };
  } catch {
    licenseCredentialSummary.value = { hasDetails: false, typeNumber: '', issuedDate: '', expirationDate: '', uploadUrl: '', uploadedAt: '' };
  }
};

const isEditingAccount = ref(false);

const startEditAccount = () => {
  if (isSscMemberProfileMode.value) {
    accountForm.value.role = normalizeSscClubAccountRole(memberClubRole.value || accountForm.value.role || user.value?.role);
  }
  isEditingAccount.value = true;
};

const cancelEditAccount = async () => {
  isEditingAccount.value = false;
  // Restore values from server (source of truth)
  await fetchUser();
};

const canToggleSupervisorPrivileges = computed(() => {
  const role = user.value?.role || accountForm.value?.role;
  if (!role) {
    return false;
  }
  // Supervisors are represented by this boolean; "provider + supervisor privileges" is the preferred model.
  const eligibleRoles = ['provider', 'admin', 'super_admin', 'clinical_practice_assistant', 'provider_plus'];
  return eligibleRoles.includes(role);
});

const containsAnyCredentialToken = (raw, tokens) => {
  const upper = String(raw ?? '').trim().toUpperCase();
  return (tokens || []).some((t) => upper.includes(String(t || '').toUpperCase()));
};

const isBachelorsCredentialText = (raw) => {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower.includes('bachelor')) return true;
  if (/\bba\b/i.test(s)) return true;
  if (/\bbs\b/i.test(s)) return true;
  if (/\bb\.a\.\b/i.test(lower)) return true;
  if (/\bb\.s\.\b/i.test(lower)) return true;
  return false;
};

const credentialTierPreview = computed(() => {
  const role = String(accountForm.value?.role || '').trim().toLowerCase();
  const credentialText = String(accountForm.value?.credential || '').trim();

  if (role === 'intern') return 'intern_plus';
  if (role === 'qbha' || role === 'clinical_practice_assistant') return 'qbha';

  if (containsAnyCredentialToken(credentialText, ['QBHA', 'QUALIFIED BEHAVIORAL HEALTH ASSISTANT'])) return 'qbha';
  if (containsAnyCredentialToken(credentialText, [
    'INTERN',
    'UNLICENSED',
    'PRE-LICENSED',
    'PRELICENSED',
    'LPCC',
    'LSW',
    'SWC',
    'MFTC',
    'LAC',
    'EDD',
    'PHD',
    'PSYD',
    'LMFT',
    'LPC',
    'LCSW',
    'MFT',
    'LICENSED'
  ])) {
    return 'intern_plus';
  }
  if (isBachelorsCredentialText(credentialText)) return 'bachelors';
  return 'unknown';
});

const credentialTierPreviewLabel = computed(() => {
  const tier = String(credentialTierPreview.value || 'unknown');
  if (tier === 'intern_plus') return 'Intern+ (intern/unlicensed/licensed)';
  if (tier === 'bachelors') return 'Bachelors';
  if (tier === 'qbha') return 'QBHA';
  return 'Unknown (defaults to QBHA-safe rules where applicable)';
});

// Payroll access toggle: show for everyone except super_admin (super_admin always has payroll).
const showPayrollAccessToggle = computed(() => {
  const role = String(user.value?.role || accountForm.value?.role || '').trim().toLowerCase();
  return role && role !== 'super_admin';
});
const showBillingAccessToggle = computed(() => {
  const role = String(user.value?.role || accountForm.value?.role || '').trim().toLowerCase();
  // Grant medical billing to a support/staff subset (payroll-style). Admins already have access.
  return ['support', 'staff'].includes(role);
});
/** Marketing contact: typically support (or staff) who should receive event marketing photos. */
const showMarketingContactToggle = computed(() => {
  const role = String(user.value?.role || accountForm.value?.role || '').trim().toLowerCase();
  return ['support', 'staff', 'admin', 'assistant_admin'].includes(role);
});
const showCredentialingAccessToggle = computed(() => {
  const role = String(user.value?.role || accountForm.value?.role || '').trim().toLowerCase();
  return role && role !== 'super_admin';
});

// Watch for role changes to reset supervisor privileges if role becomes ineligible
watch(() => accountForm.value.role, (newRole) => {
  const eligibleRoles = ['provider', 'admin', 'super_admin', 'clinical_practice_assistant', 'provider_plus'];
  if (!eligibleRoles.includes(newRole)) {
    accountForm.value.hasSupervisorPrivileges = false;
  }
  // Reset permission attributes when role changes
  // Allow "admin but also provider" via hasProviderAccess.
  const providerAccessEligibleRoles = ['staff', 'support', 'admin', 'super_admin', 'clinical_practice_assistant', 'provider'];
  if (!providerAccessEligibleRoles.includes(newRole)) {
    accountForm.value.hasProviderAccess = false;
  }
  if (newRole !== 'provider') {
    accountForm.value.hasStaffAccess = false;
  }
});

watch([activeTab, isViewingGuardian], async ([t, viewingGuardian]) => {
  // NOTE: On initial mount, `activeTab` is already set (often "account"), but `user` isn't loaded yet.
  // This watch includes `isViewingGuardian` so we still load linked clients/insurance once the target
  // profile resolves as a guardian account.
  if (t === 'account' && viewingGuardian) {
    if (guardianLinkedClients.value.length === 0) await loadGuardianLinkedClients();
    // Load insurance + communication prefs from linked client intakes
    for (const client of guardianLinkedClients.value) {
      loadGuardianCommPrefsForClient(client.client_id);
    }
    // Delivery settings are guardian-level (user_preferences)
    await loadGuardianDeliveryPrefs();
    return;
  }
  if (t === 'linked_clients' && viewingGuardian) {
    await loadGuardianLinkedClients();
    return;
  }
  if ((t === 'assignments' || t === 'preferences') && viewingGuardian) {
    if (guardianLinkedClients.value.length === 0) await loadGuardianLinkedClients();
    if (t === 'preferences') {
      await loadGuardianDeliveryPrefs();
      for (const client of guardianLinkedClients.value) {
        loadGuardianCommPrefsForClient(client.client_id);
      }
    }
    return;
  }
  if (t === 'events' && viewingGuardian) {
    await loadGuardianEvents();
    return;
  }
  if (t === 'season_history' && isSscMemberProfileMode.value) {
    await loadMemberSeasonHistory();
    return;
  }
  if (t === 'affiliations') {
    if (!canViewSchoolAffiliation.value) return;
    await loadSchoolAffiliations();
    ensureSelectedAffiliationForActiveTab();
    await loadSchoolAssignments();
    syncProviderSchoolBlurbFromUser();
  }
}, { immediate: true });

watch(activeAffiliationSection, async () => {
  if (activeTab.value !== 'affiliations') return;
  ensureSelectedAffiliationForActiveTab();
  await loadSchoolAssignments();
});

watch([isSscMemberProfileMode, selectedClubIdForMemberProfile], async ([enabled, clubId]) => {
  if (!enabled || !clubId || !userId.value) return;
  await loadMemberSeasonHistory();
});

watch(guardianLinkedClients, (clients) => {
  if (activeTab.value === 'preferences' && isViewingGuardian.value) {
    for (const client of clients) {
      loadGuardianCommPrefsForClient(client.client_id);
    }
  }
});

watch(guardianCommPrefs, () => {
  if (isViewingGuardian.value) {
    void maybeAutoSyncGuardianDeliveryPrefsFromIntake();
  }
}, { deep: true });

let guardianClientSearchTimer = null;
watch(guardianClientQuery, (q) => {
  if (guardianClientSearchTimer) clearTimeout(guardianClientSearchTimer);
  const next = String(q || '').trim();
  if (!next || next.length < 2) {
    guardianClientOptions.value = [];
    guardianSelectedClientId.value = '';
    return;
  }
  guardianClientSearchTimer = setTimeout(() => {
    void searchGuardianClients();
  }, 250);
});

watch(selectedSchoolAffiliationId, async () => {
  await loadSchoolAssignments();
});

const showTempPasswordModal = ref(false);
const generatingTempPassword = ref(false);
const settingCustomTempPassword = ref(false);
const customTempPasswordInput = ref('');
const temporaryPassword = ref('');
const temporaryPasswordExpiresAt = ref('');
const tempPasswordInput = ref(null);
const tempUsernameInput = ref(null);

const availableAgencies = ref([]);
const selectedAgencyId = ref('');
const assigningAgency = ref(false);
const officeAssignmentsLoading = ref(false);
const officeAssignmentsError = ref('');
const savingOfficeAssignments = ref(false);
const officeAssignmentOptions = ref([]);
const officeAssignmentsDraft = ref([]);
const providerPublicProfileLoading = ref(false);
const providerPublicProfileSaving = ref(false);
const providerPublicProfileError = ref('');
const providerPublicBlurb = ref('');
const providerPublicInsurancesCsv = ref('');
const providerSelfPayRateUsd = ref(null);
const providerSelfPayRateNote = ref('');
const agencyDefaultSelfPayRateUsd = ref(null);
const agencyFinderIntroBlurb = ref('');

const isProviderLikeUser = computed(() => {
  // Prefer account form role while editing — user.value.role stays stale until save + fetchUser().
  const role = String(accountForm.value?.role || user.value?.role || '').toLowerCase();
  return (
    role === 'provider' ||
    role === 'supervisor' ||
    role === 'intern' ||
    role === 'facilitator' ||
    role === 'provider_plus' ||
    !!accountForm.value?.hasProviderAccess
  );
});

const selectedProviderProfileAgency = computed(() => {
  const agencies = Array.isArray(userAgencies.value) ? userAgencies.value : [];
  const agencyOrg = agencies.find((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
  if (agencyOrg?.id) return agencyOrg;
  if (agencies?.[0]?.id) return agencies[0];
  return null;
});
const selectedProviderProfileAgencyId = computed(() => Number(selectedProviderProfileAgency.value?.id || 0) || null);
const selectedProviderProfileAgencyName = computed(() => String(selectedProviderProfileAgency.value?.name || '').trim());

watch(selectedProviderProfileAgencyId, async () => {
  await loadProviderPublicProfile();
});

const orgTypeFor = (org) => String(org?.organization_type || 'agency').toLowerCase();
const isAgencyOrg = (org) => orgTypeFor(org) === 'agency';
const isAffiliationOrg = (org) => !isAgencyOrg(org);

// Compact affiliations display on User Profile:
// - show agencies in the main list
// - show school/program/learning orgs in a small hover/click popover per agency
const hoverAffiliationsPopoverAgencyId = ref(null);
const pinnedAffiliationsPopoverAgencyId = ref(null);
const isAffiliationsPopoverOpenFor = (agencyId) => {
  const id = Number(agencyId);
  return hoverAffiliationsPopoverAgencyId.value === id || pinnedAffiliationsPopoverAgencyId.value === id;
};
const openAffiliationsPopover = (agencyId) => {
  const id = Number(agencyId);
  // If a popover is pinned to another agency, don't open a hover popover for a different row.
  if (pinnedAffiliationsPopoverAgencyId.value !== null && pinnedAffiliationsPopoverAgencyId.value !== id) return;
  hoverAffiliationsPopoverAgencyId.value = id;
};
const closeAffiliationsPopover = (agencyId) => {
  const id = Number(agencyId);
  if (hoverAffiliationsPopoverAgencyId.value === id) hoverAffiliationsPopoverAgencyId.value = null;
};
const toggleAffiliationsPopover = (agencyId) => {
  const id = Number(agencyId);
  if (pinnedAffiliationsPopoverAgencyId.value === id) {
    pinnedAffiliationsPopoverAgencyId.value = null;
  } else {
    pinnedAffiliationsPopoverAgencyId.value = id;
    hoverAffiliationsPopoverAgencyId.value = id;
  }
};

// Schedule view requires an agency context.
// In admin settings flows, `agencyStore.currentAgency` may be unset; fall back to:
// - explicit route query agencyId
// - the first agency-type org the target user belongs to
const scheduleAgencyId = computed(() => {
  const fromRoute = parseInt(String(route.query?.agencyId || ''), 10);
  if (Number.isFinite(fromRoute) && fromRoute > 0) return fromRoute;

  const current = Number(agencyStore.currentAgency?.id || 0);
  if (Number.isFinite(current) && current > 0) return current;

  const firstAgency = (userAgencies.value || []).find((a) => isAgencyOrg(a));
  const fallback = Number(firstAgency?.id || 0);
  if (Number.isFinite(fallback) && fallback > 0) return fallback;

  return 0;
});

// =============================================================================
// Feature access (per-user entitlements driven by perUserBillable catalog)
// =============================================================================
const featureCatalogState = ref({ catalog: {}, loaded: false });
const perUserFeatureAccessRows = ref([]);
const featureAccessError = ref('');

const canManageFeatureAccess = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'admin';
});

const primaryFeatureAgencyId = computed(() => {
  const list = (userAgencies.value || []).filter((a) => isAgencyOrg(a));
  return list.length ? Number(list[0].id) : 0;
});

async function loadFeatureCatalogOnce() {
  if (featureCatalogState.value.loaded) return featureCatalogState.value.catalog;
  try {
    const res = await api.get('/billing/pricing/default');
    const cat = res.data?.pricing?.featureCatalog || res.data?.featureCatalog || {};
    featureCatalogState.value = { catalog: cat, loaded: true };
    return cat;
  } catch {
    featureCatalogState.value = { catalog: {}, loaded: true };
    return {};
  }
}

async function loadFeatureAccessRows() {
  featureAccessError.value = '';
  if (isViewingGuardian.value || !canManageFeatureAccess.value || !userId.value || !primaryFeatureAgencyId.value) {
    perUserFeatureAccessRows.value = [];
    return;
  }
  try {
    const catalog = await loadFeatureCatalogOnce();
    const features = Object.values(catalog).filter((f) => f && f.perUserBillable === true);
    if (!features.length) { perUserFeatureAccessRows.value = []; return; }
    const res = await api.get(`/billing/${primaryFeatureAgencyId.value}/features`, {
      params: { userId: userId.value }
    });
    const userFeatureMap = res.data?.userFeatures || {};
    perUserFeatureAccessRows.value = features.map((f) => ({
      key: f.key,
      label: f.label || f.key,
      description: f.description || '',
      userMonthlyCents: Number(f.userMonthlyCents || 0),
      minProrationDays: Number(f.minProrationDays || 0),
      enabled: !!userFeatureMap?.[f.key]?.enabled,
      saving: false
    }));
  } catch (e) {
    featureAccessError.value = e?.response?.data?.error?.message || 'Failed to load feature access';
    perUserFeatureAccessRows.value = [];
  }
}

async function onToggleFeatureAccess(row, enabled) {
  if (!primaryFeatureAgencyId.value || !userId.value) return;
  row.saving = true;
  featureAccessError.value = '';
  try {
    await api.post(`/billing/${primaryFeatureAgencyId.value}/features/users/${userId.value}`, {
      featureKey: row.key,
      enabled: !!enabled
    });
    row.enabled = !!enabled;
    if (row.key === 'gamesPlatformEnabled' && accountForm.value) {
      accountForm.value.hasGamesAccess = !!enabled;
    }
  } catch (e) {
    featureAccessError.value = e?.response?.data?.error?.message || 'Failed to update entitlement';
  } finally {
    row.saving = false;
  }
}

watch([userId, primaryFeatureAgencyId, canManageFeatureAccess], () => {
  loadFeatureAccessRows();
}, { immediate: true });

// Schedule & Availability: allow filtering by affiliated agencies (agency-type orgs).
const affiliatedAgencies = computed(() => (userAgencies.value || []).filter((a) => isAgencyOrg(a)));
const affiliatedOrgsByAgencyId = computed(() => {
  const out = {};
  for (const org of userAgencies.value || []) {
    if (!org || isAgencyOrg(org)) continue;
    const raw = Number(org.affiliated_agency_id || 0);
    const key = (Number.isFinite(raw) && raw > 0) ? String(raw) : '0';
    if (!out[key]) out[key] = [];
    out[key].push(org);
  }
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }
  return out;
});
const unaffiliatedOrgs = computed(() => affiliatedOrgsByAgencyId.value?.['0'] || []);
const scheduleAgencyLabelById = computed(() => {
  const out = {};
  for (const a of affiliatedAgencies.value || []) {
    const id = Number(a?.id || 0);
    if (!id) continue;
    out[id] = a?.name || `Agency ${id}`;
  }
  return out;
});
const selectedScheduleAgencyIds = ref([]);
const selectAllScheduleAgencies = () => {
  selectedScheduleAgencyIds.value = (affiliatedAgencies.value || [])
    .map((a) => Number(a.id))
    .filter((n) => Number.isFinite(n) && n > 0);
};
const clearScheduleAgencies = () => {
  selectedScheduleAgencyIds.value = [];
};

const scheduleWeekStartYmd = ref(new Date().toISOString().slice(0, 10));
const showAvailability = ref(false);
const availabilityLoading = ref(false);
const availabilityError = ref('');
const providerWeekAvailability = ref(null);
const availabilityLastLoadedKey = ref('');
const availabilityInFlightKey = ref('');
let availabilityRequestSeq = 0;

const availabilityAgencyId = computed(() => {
  const ids = (selectedScheduleAgencyIds.value || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  return ids[0] || Number(scheduleAgencyId.value || 0) || null;
});

const normalizeWeekStartYmd = (raw) => {
  const s = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const onScheduleWeekStartYmdUpdate = (nextValue) => {
  const next = normalizeWeekStartYmd(nextValue);
  if (!next) return;
  if (next === scheduleWeekStartYmd.value) return;
  scheduleWeekStartYmd.value = next;
};

const loadProviderWeekAvailability = async ({ force = false } = {}) => {
  const aid = availabilityAgencyId.value;
  if (!aid) return;
  const week = normalizeWeekStartYmd(scheduleWeekStartYmd.value) || String(scheduleWeekStartYmd.value || '').slice(0, 10);
  const requestKey = `${Number(userId.value || 0)}|${aid}|${week}`;
  if (!force) {
    if (availabilityInFlightKey.value === requestKey) return;
    if (availabilityLastLoadedKey.value === requestKey) return;
  }
  availabilityInFlightKey.value = requestKey;
  const requestSeq = ++availabilityRequestSeq;
  try {
    availabilityLoading.value = true;
    availabilityError.value = '';
    const r = await api.get(`/availability/providers/${Number(userId.value)}/week`, {
      params: {
        agencyId: aid,
        weekStart: week,
        includeGoogleBusy: 'true',
        slotMinutes: 60
      }
    });
    if (requestSeq !== availabilityRequestSeq) return;
    providerWeekAvailability.value = r.data || null;
    availabilityLastLoadedKey.value = requestKey;
  } catch (e) {
    if (requestSeq !== availabilityRequestSeq) return;
    providerWeekAvailability.value = null;
    availabilityError.value = e.response?.data?.error?.message || 'Failed to load availability';
  } finally {
    if (requestSeq === availabilityRequestSeq) {
      availabilityInFlightKey.value = '';
      availabilityLoading.value = false;
    }
  }
};

watch([showAvailability, scheduleWeekStartYmd, availabilityAgencyId], () => {
  if (!showAvailability.value) return;
  void loadProviderWeekAvailability();
}, { immediate: false });

watch(showAvailability, (next) => {
  if (!next) return;
  // Allow explicit refresh when toggled back on.
  availabilityLastLoadedKey.value = '';
  void loadProviderWeekAvailability({ force: true });
});

const availabilityByDay = computed(() => {
  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const a = providerWeekAvailability.value;
  const out = DAY_ORDER.map((day) => ({ day, virtual: [], officeGroups: [] }));
  if (!a) return out;

  const toLocalHHMM = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };
  const dayNameFor = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const map = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return map[d.getDay()] || null;
  };
  const addRanges = (slots, targetKey) => {
    const byDay = new Map();
    for (const s of slots || []) {
      const day = dayNameFor(s.startAt);
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(s);
    }
    for (const [day, list] of byDay.entries()) {
      list.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
      const ranges = [];
      let curStart = null;
      let curEnd = null;
      for (const s of list) {
        const st = String(s.startAt);
        const en = String(s.endAt);
        if (!curStart) {
          curStart = st; curEnd = en;
          continue;
        }
        if (st === curEnd) {
          curEnd = en;
        } else {
          ranges.push(`${toLocalHHMM(curStart)}–${toLocalHHMM(curEnd)}`);
          curStart = st; curEnd = en;
        }
      }
      if (curStart) ranges.push(`${toLocalHHMM(curStart)}–${toLocalHHMM(curEnd)}`);
      const row = out.find((x) => x.day === day);
      if (row) row[targetKey] = ranges;
    }
  };

  const addOfficeGroups = (slots) => {
    // Group by (building, room) so the list can show "Building — Room: ranges"
    const byDay = new Map();
    for (const s of slots || []) {
      const day = dayNameFor(s.startAt);
      if (!day) continue;
      const building = String(s.buildingName || '').trim();
      const room = String(s.roomLabel || '').trim();
      const label = building && room ? `${building} — ${room}` : (room || building || 'Office');
      const key = `${label}`;
      if (!byDay.has(day)) byDay.set(day, new Map());
      const m = byDay.get(day);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(s);
    }

    for (const [day, groupMap] of byDay.entries()) {
      const row = out.find((x) => x.day === day);
      if (!row) continue;
      const groups = [];
      for (const [label, list] of groupMap.entries()) {
        list.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
        const ranges = [];
        let curStart = null;
        let curEnd = null;
        for (const s of list) {
          const st = String(s.startAt);
          const en = String(s.endAt);
          if (!curStart) {
            curStart = st;
            curEnd = en;
            continue;
          }
          if (st === curEnd) {
            curEnd = en;
          } else {
            ranges.push(`${toLocalHHMM(curStart)}–${toLocalHHMM(curEnd)}`);
            curStart = st;
            curEnd = en;
          }
        }
        if (curStart) ranges.push(`${toLocalHHMM(curStart)}–${toLocalHHMM(curEnd)}`);
        groups.push({ label, ranges });
      }
      groups.sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
      row.officeGroups = groups;
    }
  };

  addRanges(a.virtualSlots || [], 'virtual');
  addOfficeGroups(a.inPersonSlots || []);
  return out;
});

// Per-organization login email alias (stored in user_login_emails)
const newAgencyLoginEmail = ref('');
const loginEmailAliasesDetailed = ref([]);
const savingAgencyAliasId = ref(null);

const selectedAgencyOption = computed(() => {
  const id = Number(selectedAgencyId.value || 0);
  if (!id) return null;
  return (availableAgencies.value || []).find((a) => Number(a?.id) === id) || null;
});
const selectedAgencyAllowsAlias = computed(() => isAgencyOrg(selectedAgencyOption.value));

const accountInfo = ref({
  loginEmail: '',
  personalEmail: '',
  phoneNumber: '',
  personalPhone: '',
  workPhone: '',
  workPhoneExtension: '',
  supervisors: [],
  status: null,
  passwordlessLoginLink: null,
  passwordlessTokenExpiresAt: null,
  passwordlessTokenExpiresInHours: null,
  passwordlessTokenIsExpired: false,
  passwordlessTokenPurpose: null,
  resetLinkSentAt: null,
  resetLinkSentByEmail: null,
  resetLinkUsedAt: null,
  hasLoggedIn: false,
  neverLoggedIn: true,
  ssoEnabled: false,
  ssoPolicyRequired: false,
  ssoPasswordOverride: false,
  ssoRequired: false
});
const accountInfoLoading = ref(false);
const accountInfoError = ref('');
const savingSsoPasswordOverride = ref(false);
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

const canRepairProviderSlots = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  // Explicitly NOT for school_staff (and not for providers acting on themselves here).
  return r === 'super_admin' || r === 'admin' || r === 'staff';
});

const canChangeRole = computed(() => {
  const currentUserRole = authStore.user?.role;
  return currentUserRole === 'super_admin' || currentUserRole === 'admin' || currentUserRole === 'support';
});

/** SSC: club manager, program manager, assistant manager, or backoffice — member vs assistant manager + season team captain. */
const canManageClubMemberRoles = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return (
    canEditUser.value &&
    ['admin', 'super_admin', 'support', 'staff', 'provider_plus', 'club_manager'].includes(r)
  );
});

const sscClubRoleReadOnlyLabel = computed(() => {
  const rawRole = String(memberClubRole.value || accountForm.value.role || user.value?.role || '').toLowerCase();
  if (rawRole === 'manager' || rawRole === 'club_manager') return 'Manager';
  return rawRole === 'assistant_manager' || rawRole === 'provider_plus' ? 'Assistant manager' : 'Member';
});

const showSeasonCaptainColumn = computed(() => {
  if (canManageClubMemberRoles.value) return true;
  const seasons = memberSeasonHistory.value?.seasons;
  return Array.isArray(seasons) && seasons.some((s) => s.isTeamCaptain);
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

const canAssignAssistantAdmin = computed(() => {
  const currentUserRole = authStore.user?.role;
  return currentUserRole === 'super_admin' || currentUserRole === 'admin';
});

const systemPhoneNumberDisplay = computed(() => {
  const raw = user.value?.system_phone_number;
  const str = String(raw || '').trim();
  return str ? str : '—';
});

const textingNumbersLoading = ref(false);
const assignedTextingNumbers = ref([]);
const canManageTexting = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'admin' || role === 'support' || role === 'super_admin' || role === 'clinical_practice_assistant';
});
const textingSettingsLink = computed(() => {
  const slug = route.params?.organizationSlug;
  const base = slug ? `/${slug}/admin/settings` : '/admin/settings';
  return `${base}?category=system&item=sms-numbers`;
});
const fetchAssignedTextingNumbers = async () => {
  if (!userId.value || isSscMemberProfileMode.value) return;
  try {
    textingNumbersLoading.value = true;
    const r = await api.get(`/sms-numbers/user/${userId.value}/assigned`);
    assignedTextingNumbers.value = Array.isArray(r.data?.numbers) ? r.data.numbers : [];
  } catch {
    assignedTextingNumbers.value = [];
  } finally {
    textingNumbersLoading.value = false;
  }
};


const onDualRateContractSwitched = async (payload) => {
  // Refresh profile so is_hourly_worker / hourly_dual_rate_enabled reflect the switch.
  if (payload?.user) {
    user.value = {
      ...(user.value || {}),
      ...payload.user,
      is_hourly_worker: payload.user.is_hourly_worker,
      hourly_dual_rate_enabled: payload.user.hourly_dual_rate_enabled
    };
  }
  try {
    await fetchUser();
  } catch {
    /* best-effort */
  }
};

const fetchUser = async () => {
  if (!Number.isFinite(userId.value) || userId.value <= 0) {
    error.value = 'Invalid user id';
    loading.value = false;
    user.value = null;
    return;
  }
  try {
    loading.value = true;
    userAgencies.value = [];
    const response = await api.get(`/users/${userId.value}`);
    user.value = response.data;

    // Archived users should not be accessible via the main user profile route.
    // They are managed in Settings → Archive Management.
    if (String(user.value?.status || '').toUpperCase() === 'ARCHIVED') {
      const orgSlug = route?.params?.organizationSlug;
      const path = orgSlug ? `/${orgSlug}/admin/settings` : '/admin/settings';
      await router.replace({ path, query: { category: 'system', item: 'archive' } });
      return;
    }

    // Provider open/closed flag (best-effort; defaults to open if missing)
    if (user.value?.provider_accepting_new_clients !== undefined && user.value?.provider_accepting_new_clients !== null) {
      providerAcceptingNewClients.value = Boolean(user.value.provider_accepting_new_clients);
    } else {
      providerAcceptingNewClients.value = true;
    }
    
    // Preserve the current form values if user data is missing to prevent toggles/settings from disappearing
    const normalizeRole = (r) => {
      const v = String(r || '').trim().toLowerCase();
      if (!v) return '';
      if (v === 'intern' || v === 'facilitator') return 'provider';
      if (v === 'supervisor') return 'provider';
      return v;
    };

    const currentRoleRaw = user.value?.role || accountForm.value?.role || '';
    const currentRole = normalizeRole(currentRoleRaw);
    const currentHasSupervisorPrivileges = user.value?.has_supervisor_privileges !== undefined 
      ? (user.value.has_supervisor_privileges === true || user.value.has_supervisor_privileges === 1 || user.value.has_supervisor_privileges === '1')
      : accountForm.value?.hasSupervisorPrivileges || false;
    const currentMedcancelRateSchedule = String(
      user.value?.medcancel_rate_schedule ??
      user.value?.medcancelRateSchedule ??
      accountForm.value?.medcancelRateSchedule ??
      'none'
    ).toLowerCase();
    const currentCompanyCardEnabled =
      user.value?.company_card_enabled !== undefined
        ? (user.value.company_card_enabled === true || user.value.company_card_enabled === 1 || user.value.company_card_enabled === '1')
        : (user.value?.companyCardEnabled !== undefined ? Boolean(user.value.companyCardEnabled) : (accountForm.value?.companyCardEnabled || false));
    const currentCompanyCarSubmitAccess =
      user.value?.company_car_submit_access !== undefined
        ? (user.value.company_car_submit_access === true || user.value.company_car_submit_access === 1 || user.value.company_car_submit_access === '1')
        : (user.value?.companyCarSubmitAccess !== undefined ? Boolean(user.value.companyCarSubmitAccess) : (accountForm.value?.companyCarSubmitAccess || false));
    const currentCompanyCarManageAccess =
      user.value?.company_car_manage_access !== undefined
        ? (user.value.company_car_manage_access === true || user.value.company_car_manage_access === 1 || user.value.company_car_manage_access === '1')
        : (user.value?.companyCarManageAccess !== undefined ? Boolean(user.value.companyCarManageAccess) : (accountForm.value?.companyCarManageAccess || false));

    accountForm.value = {
      firstName: user.value.first_name || accountForm.value?.firstName || '',
      lastName: user.value.last_name || accountForm.value?.lastName || '',
      preferredName: user.value.preferred_name || accountForm.value?.preferredName || '',
      email: user.value.email || accountForm.value?.email || '',
      personalEmail: user.value.personal_email || accountForm.value?.personalEmail || '',
      title: user.value.title ?? accountForm.value?.title ?? '',
      serviceFocus: user.value.service_focus ?? accountForm.value?.serviceFocus ?? '',
      languagesSpoken: user.value.languages_spoken ?? accountForm.value?.languagesSpoken ?? '',
      phoneNumber: user.value.phone_number || accountForm.value?.phoneNumber || '',
      personalPhone: user.value.personal_phone || accountForm.value?.personalPhone || '',
      workPhone: user.value.work_phone || accountForm.value?.workPhone || '',
      workPhoneExtension: user.value.work_phone_extension || accountForm.value?.workPhoneExtension || '',
      medcancelRateSchedule: ['low', 'high', 'none'].includes(currentMedcancelRateSchedule) ? currentMedcancelRateSchedule : 'none',
      companyCardEnabled: currentCompanyCardEnabled,
      companyCarSubmitAccess: currentCompanyCarSubmitAccess,
      companyCarManageAccess: currentCompanyCarManageAccess,
      skillBuilderEligible: user.value.skill_builder_eligible === true || user.value.skill_builder_eligible === 1 || user.value.skill_builder_eligible === '1' || false,
      hasSkillBuilderCoordinatorAccess:
        user.value.has_skill_builder_coordinator_access === true ||
        user.value.has_skill_builder_coordinator_access === 1 ||
        user.value.has_skill_builder_coordinator_access === '1' ||
        false,
      externalBusyIcsUrl: String(user.value.external_busy_ics_url || '').trim(),
      role: currentRole,
      hasSupervisorPrivileges: currentHasSupervisorPrivileges || String(currentRoleRaw || '').trim().toLowerCase() === 'supervisor',
      credential: user.value.credential ?? accountForm.value?.credential ?? '',
      hasProviderAccess: user.value.has_provider_access === true || user.value.has_provider_access === 1 || user.value.has_provider_access === '1' || false,
      hasStaffAccess: user.value.has_staff_access === true || user.value.has_staff_access === 1 || user.value.has_staff_access === '1' || false,
      hasPayrollAccess: accountInfo.value?.hasPayrollAccess === true || accountForm.value?.hasPayrollAccess || false,
      hasBillingAccess: accountInfo.value?.hasBillingAccess === true || accountForm.value?.hasBillingAccess || false,
      isMarketingContact: accountInfo.value?.isMarketingContact === true || accountForm.value?.isMarketingContact || false,
      hasCredentialingAccess: accountInfo.value?.hasCredentialingAccess === true || accountForm.value?.hasCredentialingAccess || false,
      isHourlyWorker: user.value?.is_hourly_worker === true || user.value?.is_hourly_worker === 1 || user.value?.is_hourly_worker === '1' || accountForm.value?.isHourlyWorker || false,
      hasHiringAccess: user.value?.has_hiring_access === true || user.value?.has_hiring_access === 1 || user.value?.has_hiring_access === '1' || accountForm.value?.hasHiringAccess || false,
      hasMedicalRecordsReleaseAccess: user.value?.has_medical_records_release_access === true || user.value?.has_medical_records_release_access === 1 || user.value?.has_medical_records_release_access === '1' || accountForm.value?.hasMedicalRecordsReleaseAccess || false,
      hasGamesAccess: user.value?.has_games_access === true || user.value?.has_games_access === 1 || user.value?.has_games_access === '1' || accountForm.value?.hasGamesAccess || false,
      providerStartDate:
        toDateInputValue(user.value.provider_start_date) ||
        toDateInputValue(accountForm.value?.providerStartDate) ||
        ''
    };
    
    // Render the page as soon as the base user record is loaded.
    // All other sections have their own loading states (or are best-effort), so don't block the profile UI.
    loading.value = false;

    // Kick off secondary requests in parallel (non-blocking).
    if (isSscMemberProfileMode.value) {
      void loadMemberSeasonHistory();
    } else {
      void Promise.allSettled([
        fetchUserAgencies().then(() => loadProviderPublicProfile()),
        fetchAvailableAgencies(),
        fetchAccountInfo(),
        fetchProviderCredential(),
        fetchLicenseCredentialSummary(),
        loadExternalCalendars(),
        loadOfficeAssignments(),
        loadLeaveOfAbsence(),
        fetchAssignedTextingNumbers()
      ]);
    }

    if (isViewingGuardian.value && activeTab.value === 'linked_clients') {
      void loadGuardianLinkedClients();
    }
    if (isSscMemberProfileMode.value) {
      leaveOfAbsence.value = null;
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load user';
    console.error('Error fetching user:', err);
  } finally {
    loading.value = false;
  }
};

const fetchProviderCredential = async () => {
  try {
    // Primary source is users.credential from /users/:id.
    const existing = String(accountForm.value?.credential || '').trim();
    if (existing) {
      providerCredentialLoaded.value = true;
      return;
    }

    // Backward-compatible fallback for environments still storing this in user_info_values.
    const res = await api.get(`/users/${userId.value}/user-info`);
    const rows = Array.isArray(res.data) ? res.data : [];
    const field = rows.find((f) => String(f?.field_key || '').toLowerCase() === 'provider_credential')
      || rows.find((f) => String(f?.field_label || '').toLowerCase() === 'credential');
    if (!field) {
      providerCredentialFieldId.value = null;
      providerCredentialLoaded.value = true;
      return;
    }
    providerCredentialFieldId.value = field.id;
    accountForm.value.credential = field.value || '';
    providerCredentialLoaded.value = true;
  } catch {
    // non-blocking
    providerCredentialLoaded.value = true;
  }
};

const fetchAccountInfo = async () => {
  try {
    accountInfoLoading.value = true;
    const response = await api.get(`/users/${userId.value}/account-info`);
    accountInfo.value = response.data;

    // Keep the admin account form in sync with home address from account-info endpoint.
    // This avoids relying on /users/:id returning home_* columns in older deployments.
    accountForm.value.homeStreetAddress = response.data?.homeStreetAddress || accountForm.value.homeStreetAddress || '';
    accountForm.value.homeAddressLine2 = response.data?.homeAddressLine2 || accountForm.value.homeAddressLine2 || '';
    accountForm.value.homeCity = response.data?.homeCity || accountForm.value.homeCity || '';
    accountForm.value.homeState = response.data?.homeState || accountForm.value.homeState || '';
    accountForm.value.homePostalCode = response.data?.homePostalCode || accountForm.value.homePostalCode || '';

    // Backfill personal email (some imports stored it in user_info_values instead of users.personal_email).
    if (!accountForm.value.personalEmail) {
      accountForm.value.personalEmail = response.data?.personalEmail || '';
    }
    // Backfill preferred name (account-info endpoint is authoritative for display fields)
    if (!accountForm.value.preferredName) {
      accountForm.value.preferredName = response.data?.preferredName || '';
    }
    if (response.data?.languagesSpoken !== undefined) {
      accountForm.value.languagesSpoken = response.data.languagesSpoken ?? '';
    }
    // Contracts & flags: payroll, hourly worker, hiring access (from account-info)
    if (response.data?.hasPayrollAccess !== undefined) {
      accountForm.value.hasPayrollAccess = Boolean(response.data.hasPayrollAccess);
    }
    if (response.data?.hasBillingAccess !== undefined) {
      accountForm.value.hasBillingAccess = Boolean(response.data.hasBillingAccess);
    }
    if (response.data?.isMarketingContact !== undefined) {
      accountForm.value.isMarketingContact = Boolean(response.data.isMarketingContact);
    }
    if (response.data?.hasCredentialingAccess !== undefined) {
      accountForm.value.hasCredentialingAccess = Boolean(response.data.hasCredentialingAccess);
    }
    if (response.data?.isHourlyWorker !== undefined) {
      accountForm.value.isHourlyWorker = Boolean(response.data.isHourlyWorker);
    }
    if (response.data?.hasHiringAccess !== undefined) {
      accountForm.value.hasHiringAccess = Boolean(response.data.hasHiringAccess);
    }
    if (response.data?.hasMedicalRecordsReleaseAccess !== undefined) {
      accountForm.value.hasMedicalRecordsReleaseAccess = Boolean(response.data.hasMedicalRecordsReleaseAccess);
    }
    if (response.data?.providerStartDate !== undefined && response.data?.providerStartDate !== null) {
      accountForm.value.providerStartDate = toDateInputValue(response.data.providerStartDate);
    } else if (response.data?.providerStartDate === null) {
      accountForm.value.providerStartDate = '';
    }
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

const toggleSsoPasswordOverride = async (enabled) => {
  const nextState = Boolean(enabled);
  const prompt = nextState
    ? 'Enable password-login override for this user? This allows reset links and temporary passwords even when Workspace sign-in policy applies.'
    : 'Disable password-login override and re-enforce Workspace-only sign-in for this user?';
  if (!confirm(prompt)) return;

  try {
    savingSsoPasswordOverride.value = true;
    await api.post(`/users/${userId.value}/sso-password-override`, { override: nextState });
    await fetchAccountInfo();
    alert(
      nextState
        ? 'Password-login override enabled for this user.'
        : 'Workspace-only sign-in re-enabled for this user.'
    );
  } catch (err) {
    const msg = err.response?.data?.error?.message || 'Failed to update Workspace sign-in override';
    alert(msg);
  } finally {
    savingSsoPasswordOverride.value = false;
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
  if (isSscMemberProfileMode.value) {
    userAgencies.value = [];
    loginEmailAliasesDetailed.value = [];
    return;
  }
  try {
    const response = await api.get(`/users/${userId.value}/agencies`);
    userAgencies.value = response.data || [];

    // Default schedule filter to all affiliated agencies (best-effort).
    // If this user has no agency orgs, fall back to scheduleAgencyId when available.
    if (!selectedScheduleAgencyIds.value || selectedScheduleAgencyIds.value.length === 0) {
      const ids = (userAgencies.value || [])
        .filter((a) => isAgencyOrg(a))
        .map((a) => Number(a.id))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length) {
        selectedScheduleAgencyIds.value = ids;
      } else if (scheduleAgencyId.value) {
        selectedScheduleAgencyIds.value = [Number(scheduleAgencyId.value)];
      }
    }

    // Best-effort: load alias list (includes agency_id)
    try {
      const r = await api.get(`/users/${userId.value}/login-email-aliases`);
      loginEmailAliasesDetailed.value = r.data?.loginEmailAliasesDetailed || [];
    } catch {
      loginEmailAliasesDetailed.value = [];
    }
  } catch (err) {
    console.error('Failed to load user agencies:', err);
    userAgencies.value = [];
  }
};

const loadProviderPublicProfile = async () => {
  if (!isProviderLikeUser.value) return;
  const agencyId = selectedProviderProfileAgencyId.value;
  if (!agencyId) return;
  try {
    providerPublicProfileLoading.value = true;
    providerPublicProfileError.value = '';
    const { data } = await api.get(`/users/${userId.value}/provider-public-profile`, {
      params: { agencyId }
    });
    const profile = data?.profile || {};
    const defaults = data?.agencyDefaults || {};
    providerPublicBlurb.value = String(profile.publicBlurb || '');
    providerPublicInsurancesCsv.value = Array.isArray(profile.insurances) ? profile.insurances.join(', ') : '';
    providerSelfPayRateUsd.value = profile.selfPayRateCents === null || profile.selfPayRateCents === undefined
      ? null
      : Number(profile.selfPayRateCents) / 100;
    providerSelfPayRateNote.value = String(profile.selfPayRateNote || '');
    agencyDefaultSelfPayRateUsd.value = defaults.defaultSelfPayRateCents === null || defaults.defaultSelfPayRateCents === undefined
      ? null
      : Number(defaults.defaultSelfPayRateCents) / 100;
    agencyFinderIntroBlurb.value = String(defaults.finderIntroBlurb || '');
  } catch (e) {
    providerPublicProfileError.value = e.response?.data?.error?.message || 'Failed to load provider public profile';
  } finally {
    providerPublicProfileLoading.value = false;
  }
};

const loadLeaveOfAbsence = async () => {
  if (!userId.value) return;
  try {
    const { data } = await api.get(`/users/${userId.value}/leave-of-absence`);
    leaveOfAbsence.value = {
      leaveType: data.leaveType || null,
      departureDate: data.departureDate || null,
      returnDate: data.returnDate || null
    };
  } catch {
    leaveOfAbsence.value = null;
  }
};

const saveProviderPublicProfile = async () => {
  const agencyId = selectedProviderProfileAgencyId.value;
  if (!agencyId) return;
  try {
    providerPublicProfileSaving.value = true;
    providerPublicProfileError.value = '';
    const insurances = String(providerPublicInsurancesCsv.value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const selfPayRateCents = providerSelfPayRateUsd.value === null || providerSelfPayRateUsd.value === undefined || providerSelfPayRateUsd.value === ''
      ? null
      : Math.round(Number(providerSelfPayRateUsd.value) * 100);
    const agencyDefaultSelfPayRateCents = agencyDefaultSelfPayRateUsd.value === null || agencyDefaultSelfPayRateUsd.value === undefined || agencyDefaultSelfPayRateUsd.value === ''
      ? null
      : Math.round(Number(agencyDefaultSelfPayRateUsd.value) * 100);

    await api.put(`/users/${userId.value}/provider-public-profile`, {
      agencyId,
      publicBlurb: providerPublicBlurb.value,
      insurances,
      selfPayRateCents,
      selfPayRateNote: providerSelfPayRateNote.value
    });
    await api.put(`/users/agency-provider-portal/${agencyId}`, {
      finderIntroBlurb: agencyFinderIntroBlurb.value,
      defaultSelfPayRateCents: agencyDefaultSelfPayRateCents
    });
    await loadProviderPublicProfile();
  } catch (e) {
    providerPublicProfileError.value = e.response?.data?.error?.message || 'Failed to save provider public profile settings';
  } finally {
    providerPublicProfileSaving.value = false;
  }
};

const normalizeOfficePrimary = () => {
  const rows = Array.isArray(officeAssignmentsDraft.value) ? officeAssignmentsDraft.value : [];
  const active = rows.filter((r) => Number(r?.officeLocationId || 0) > 0 && r?.isActive);
  if (!active.length) {
    rows.forEach((r) => { r.isPrimary = false; });
    return;
  }
  const currentPrimary = active.find((r) => r?.isPrimary);
  const chosenId = Number(currentPrimary?.officeLocationId || active[0].officeLocationId);
  rows.forEach((r) => {
    const id = Number(r?.officeLocationId || 0);
    r.isPrimary = r.isActive && id === chosenId;
  });
};

const setPrimaryOfficeAssignment = (idx) => {
  const rows = Array.isArray(officeAssignmentsDraft.value) ? officeAssignmentsDraft.value : [];
  const target = rows[idx];
  if (!target) return;
  target.isActive = true;
  const selectedId = Number(target.officeLocationId || 0);
  rows.forEach((r) => {
    r.isPrimary = r.isActive && Number(r.officeLocationId || 0) === selectedId;
  });
};

const officeOptionsForRow = (idx) => {
  const selectedByOthers = new Set(
    (officeAssignmentsDraft.value || [])
      .map((r, i) => (i === idx ? null : Number(r?.officeLocationId || 0)))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
  return (officeAssignmentOptions.value || []).filter((opt) => {
    const id = Number(opt?.id || 0);
    const self = Number(officeAssignmentsDraft.value?.[idx]?.officeLocationId || 0);
    if (!id) return false;
    if (id === self) return true;
    return !selectedByOthers.has(id);
  });
};

const syncOfficeRowDetails = (row) => {
  const id = Number(row?.officeLocationId || 0);
  if (!id) return;
  const match = (officeAssignmentOptions.value || []).find((o) => Number(o?.id) === id);
  if (match) row.addressLine = match.addressLine || '';
  normalizeOfficePrimary();
};

const officeAddressForRow = (row) => {
  const id = Number(row?.officeLocationId || 0);
  const match = (officeAssignmentOptions.value || []).find((o) => Number(o?.id) === id);
  return String(match?.addressLine || row?.addressLine || '').trim();
};

const addOfficeAssignmentRow = () => {
  const rows = Array.isArray(officeAssignmentsDraft.value) ? officeAssignmentsDraft.value : [];
  const selected = new Set(rows.map((r) => Number(r?.officeLocationId || 0)).filter((n) => n > 0));
  const next = (officeAssignmentOptions.value || []).find((o) => !selected.has(Number(o?.id || 0))) || null;
  rows.push({
    officeLocationId: Number(next?.id || 0),
    isActive: true,
    isPrimary: false,
    addressLine: next?.addressLine || ''
  });
  officeAssignmentsDraft.value = rows;
  normalizeOfficePrimary();
};

const removeOfficeAssignmentRow = (idx) => {
  const rows = Array.isArray(officeAssignmentsDraft.value) ? officeAssignmentsDraft.value.slice() : [];
  rows.splice(idx, 1);
  officeAssignmentsDraft.value = rows;
  normalizeOfficePrimary();
};

const loadOfficeAssignments = async () => {
  if (!canManageAssignments.value) {
    officeAssignmentOptions.value = [];
    officeAssignmentsDraft.value = [];
    officeAssignmentsError.value = '';
    return;
  }
  try {
    officeAssignmentsLoading.value = true;
    officeAssignmentsError.value = '';
    const r = await api.get(`/users/${userId.value}/office-assignments`);
    const payload = r.data || {};
    officeAssignmentOptions.value = Array.isArray(payload.options) ? payload.options : [];
    const assigned = Array.isArray(payload.assigned) ? payload.assigned : [];
    officeAssignmentsDraft.value = assigned.map((a) => ({
      officeLocationId: Number(a?.id || 0),
      isActive: a?.isActive === undefined ? true : Boolean(a.isActive),
      isPrimary: Boolean(a?.isPrimary),
      addressLine: String(a?.addressLine || '')
    }));
    normalizeOfficePrimary();
  } catch (err) {
    officeAssignmentOptions.value = [];
    officeAssignmentsDraft.value = [];
    officeAssignmentsError.value = err.response?.data?.error?.message || 'Failed to load office assignments';
  } finally {
    officeAssignmentsLoading.value = false;
  }
};

const saveOfficeAssignments = async () => {
  try {
    savingOfficeAssignments.value = true;
    officeAssignmentsError.value = '';
    normalizeOfficePrimary();
    const assignments = (officeAssignmentsDraft.value || [])
      .map((r) => ({
        officeLocationId: Number(r?.officeLocationId || 0),
        isActive: Boolean(r?.isActive),
        isPrimary: Boolean(r?.isPrimary)
      }))
      .filter((r) => Number.isInteger(r.officeLocationId) && r.officeLocationId > 0);
    const r = await api.put(`/users/${userId.value}/office-assignments`, { assignments });
    const assigned = Array.isArray(r.data?.assigned) ? r.data.assigned : [];
    officeAssignmentsDraft.value = assigned.map((a) => ({
      officeLocationId: Number(a?.id || 0),
      isActive: a?.isActive === undefined ? true : Boolean(a.isActive),
      isPrimary: Boolean(a?.isPrimary),
      addressLine: String(a?.addressLine || '')
    }));
    normalizeOfficePrimary();
  } catch (err) {
    officeAssignmentsError.value = err.response?.data?.error?.message || 'Failed to save office assignments';
  } finally {
    savingOfficeAssignments.value = false;
  }
};

const aliasForAgency = (agencyId) => {
  const aId = parseInt(agencyId, 10);
  const row = (loginEmailAliasesDetailed.value || []).find((x) => parseInt(x.agency_id || 0, 10) === aId);
  return row?.email || '';
};

const saveAliasForAgency = async (agencyId, email) => {
  try {
    const aId = parseInt(agencyId, 10);
    if (!aId) return;
    const e = String(email || '').trim().toLowerCase();
    savingAgencyAliasId.value = aId;
    if (!e || !e.includes('@')) {
      // Clear/remove the alias — user will use primary login email for this agency
      await api.delete(`/users/${userId.value}/login-email-alias`, { data: { agencyId: aId } });
    } else {
      await api.post(`/users/${userId.value}/login-email-alias`, { agencyId: aId, email: e });
    }
    await fetchUserAgencies();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to save login email alias');
  } finally {
    savingAgencyAliasId.value = null;
  }
};

const isProviderLikeRole = computed(() => {
  const r = String(user.value?.role || '').trim().toLowerCase();
  return r === 'provider' || r === 'intern' || r === 'facilitator';
});

const canShowH0032Mode = computed(() => {
  const u = user.value;
  if (!u) return false;
  const r = String(u.role || '').trim().toLowerCase();
  const hasProviderAccess =
    u.has_provider_access === true ||
    u.has_provider_access === 1 ||
    u.has_provider_access === '1' ||
    u.hasProviderAccess === true;
  // Treat admins (and explicit provider-access users) the same as providers for H0032 pay mode selection.
  return isProviderLikeRole.value || r === 'admin' || hasProviderAccess;
});

const canShowPrelicensedSupervision = computed(() => {
  const r = String(user.value?.role || '').trim().toLowerCase();
  return isProviderLikeRole.value || r === 'admin';
});

const updatingH0032AgencyId = ref(null);
const h0032ModeForAgency = (agency) => {
  const v = agency?.h0032_requires_manual_minutes;
  const on = (v === true || v === 1 || v === '1');
  return on ? 'cat1_hour' : 'cat2_flat';
};

const setH0032Mode = async (agencyId, mode) => {
  try {
    if (!agencyId) return;
    updatingH0032AgencyId.value = agencyId;
    await api.put(`/users/${userId.value}/h0032-mode`, { agencyId, mode });
    await fetchUserAgencies();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update H0032 mode');
  } finally {
    updatingH0032AgencyId.value = null;
  }
};

const updatingPrelicensedAgencyId = ref(null);
const editingPrelicensedAgencyIds = ref({});
const isPrelicensedForAgency = (agency) => {
  const v = agency?.supervision_is_prelicensed;
  return v === true || v === 1 || v === '1';
};
const isEditingPrelicensedForAgency = (agency) => {
  const agencyId = agency?.id;
  if (!agencyId) return false;
  return !!editingPrelicensedAgencyIds.value?.[agencyId];
};
const togglePrelicensedEdit = (agencyId) => {
  if (!agencyId) return;
  const current = { ...(editingPrelicensedAgencyIds.value || {}) };
  if (current[agencyId]) {
    delete current[agencyId];
  } else {
    current[agencyId] = true;
  }
  editingPrelicensedAgencyIds.value = current;
};
const prelicensedStartDateForAgency = (agency) => String(agency?.supervision_start_date || '').slice(0, 10);
const prelicensedStartIndHoursForAgency = (agency) => (agency?.supervision_start_individual_hours ?? 0);
const prelicensedStartGrpHoursForAgency = (agency) => (agency?.supervision_start_group_hours ?? 0);

const savePrelicensedSettings = async (agency, patch) => {
  try {
    const agencyId = agency?.id;
    if (!agencyId) return;
    updatingPrelicensedAgencyId.value = agencyId;

    const nextIs = (patch?.isPrelicensed !== undefined) ? !!patch.isPrelicensed : isPrelicensedForAgency(agency);
    const nextStartDate = (patch?.startDate !== undefined) ? (patch.startDate ? String(patch.startDate).slice(0, 10) : null) : prelicensedStartDateForAgency(agency) || null;
    const nextInd = (patch?.startIndividualHours !== undefined) ? Number(patch.startIndividualHours || 0) : Number(prelicensedStartIndHoursForAgency(agency) || 0);
    const nextGrp = (patch?.startGroupHours !== undefined) ? Number(patch.startGroupHours || 0) : Number(prelicensedStartGrpHoursForAgency(agency) || 0);

    await api.put(`/users/${userId.value}/supervision-prelicensed`, {
      agencyId,
      isPrelicensed: nextIs,
      startDate: nextIs ? nextStartDate : null,
      startIndividualHours: nextIs ? nextInd : 0,
      startGroupHours: nextIs ? nextGrp : 0
    });
    await fetchUserAgencies();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update prelicensed supervision settings');
  } finally {
    updatingPrelicensedAgencyId.value = null;
  }
};

const fetchAvailableAgencies = async () => {
  if (isSscMemberProfileMode.value) {
    availableAgencies.value = [];
    return;
  }
  try {
    if (authStore.user?.role === 'super_admin') {
      await agencyStore.fetchAgencies();
      availableAgencies.value = agencyStore.agencies || [];
    } else {
      await agencyStore.fetchUserAgencies();
      availableAgencies.value = agencyStore.userAgencies || [];
    }

    // Expand options with affiliated orgs for each parent agency the admin can access.
    const base = availableAgencies.value || [];
    const parents = base.filter((a) => String(a.organization_type || 'agency').toLowerCase() === 'agency');
    const affLists = await Promise.all(
      parents.map(async (a) => {
        try {
          const r = await api.get(`/agencies/${a.id}/affiliated-organizations`);
          return r.data || [];
        } catch (e) {
          return [];
        }
      })
    );
    const merged = [...base, ...affLists.flat()];
    const byId = new Map();
    for (const org of merged) {
      if (!org?.id) continue;
      if (!byId.has(org.id)) byId.set(org.id, org);
    }
    availableAgencies.value = Array.from(byId.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
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

    // Optional: set per-org login email alias immediately.
    if (selectedAgencyAllowsAlias.value && newAgencyLoginEmail.value && String(newAgencyLoginEmail.value).includes('@')) {
      try {
        await api.post(`/users/${userId.value}/login-email-alias`, {
          agencyId: parseInt(selectedAgencyId.value),
          email: String(newAgencyLoginEmail.value).trim().toLowerCase()
        });
      } catch (e) {
        alert(e.response?.data?.error?.message || 'Agency assigned, but failed to set login email alias.');
      }
    }
    await fetchUserAgencies();
    selectedAgencyId.value = '';
    newAgencyLoginEmail.value = '';
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to assign agency';
    alert(error.value);
  } finally {
    assigningAgency.value = false;
  }
};

const openSchoolSchedulingFromAgencyRow = async (org) => {
  const id = Number(org?.id || 0);
  if (!id) return;
  const orgType = String(org?.organization_type || '').toLowerCase();
  if (orgType === 'program') activeAffiliationSection.value = 'program_affiliation';
  else if (orgType === 'learning') activeAffiliationSection.value = 'learning_affiliation';
  else activeAffiliationSection.value = 'school_affiliation';
  activeTab.value = 'affiliations';
  await nextTick();
  await loadSchoolAffiliations();
  selectedSchoolAffiliationId.value = String(id);
  await loadSchoolAssignments();
};

const selectAffiliationSection = (sectionId) => {
  if (!isAffiliationSectionId(sectionId)) return;
  activeAffiliationSection.value = sectionId;
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

const saveAccount = async (options = {}) => {
  if (!options.fromDashboard && !isEditingAccount.value) return;

  if (isSscMemberProfileMode.value) {
    const clubId = selectedClubIdForMemberProfile.value;
    if (!clubId) {
      alert('Missing club context.');
      return;
    }
    try {
      saving.value = true;
      const r = String(accountForm.value.role || '').toLowerCase();
      const role = (r === 'provider_plus' || r === 'assistant_manager') ? 'assistant_manager' : 'member';
      await api.put(`/summit-stats/clubs/${clubId}/members/${userId.value}/profile`, {
        firstName: accountForm.value.firstName,
        lastName: accountForm.value.lastName,
        email: accountForm.value.email,
        personalPhone: accountForm.value.personalPhone || null,
        role
      });
      await fetchUser();
      if (parseInt(authStore.user?.id || 0, 10) === parseInt(userId.value || 0, 10)) {
        try {
          await authStore.refreshUser();
        } catch {
          /* ignore */
        }
      }
      isEditingAccount.value = false;
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to save changes');
    } finally {
      saving.value = false;
    }
    return;
  }

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
    error.value = 'Only super admins and admins can assign the staff role';
    alert(error.value);
    return;
  }
  if (accountForm.value.role === 'assistant_admin' && !canAssignAssistantAdmin.value) {
    error.value = 'Only super admins and admins can assign the assistant admin role';
    alert(error.value);
    return;
  }
  
  try {
    saving.value = true;
    let credentialSaveWarning = '';
    const credentialText = String(accountForm.value.credential || '').trim();
    const updateData = {
      email: accountForm.value.email,
      firstName: accountForm.value.firstName,
      lastName: accountForm.value.lastName,
      preferredName: accountForm.value.preferredName,
      personalEmail: accountForm.value.personalEmail,
      title: accountForm.value.title,
      serviceFocus: accountForm.value.serviceFocus,
      languagesSpoken: accountForm.value.languagesSpoken,
      phoneNumber: accountForm.value.phoneNumber,
      personalPhone: accountForm.value.personalPhone,
      workPhone: accountForm.value.workPhone,
      workPhoneExtension: accountForm.value.workPhoneExtension,
      homeStreetAddress: accountForm.value.homeStreetAddress,
      homeAddressLine2: accountForm.value.homeAddressLine2,
      homeCity: accountForm.value.homeCity,
      homeState: accountForm.value.homeState,
      homePostalCode: accountForm.value.homePostalCode,
      medcancelRateSchedule: String(accountForm.value.medcancelRateSchedule || 'none').toLowerCase(),
      companyCardEnabled: Boolean(accountForm.value.companyCardEnabled),
      companyCarSubmitAccess: Boolean(accountForm.value.companyCarSubmitAccess),
      companyCarManageAccess: Boolean(accountForm.value.companyCarManageAccess),
      skillBuilderEligible: Boolean(accountForm.value.skillBuilderEligible),
      hasPayrollAccess: Boolean(accountForm.value.hasPayrollAccess),
      hasBillingAccess: Boolean(accountForm.value.hasBillingAccess),
      isMarketingContact: Boolean(accountForm.value.isMarketingContact),
      hasCredentialingAccess: Boolean(accountForm.value.hasCredentialingAccess),
      isHourlyWorker: Boolean(accountForm.value.isHourlyWorker),
      hasHiringAccess: Boolean(accountForm.value.hasHiringAccess),
      hasMedicalRecordsReleaseAccess: Boolean(accountForm.value.hasMedicalRecordsReleaseAccess),
      hasGamesAccess: Boolean(accountForm.value.hasGamesAccess),
      credential: credentialText || null,
      role: accountForm.value.role
    };
    let payloadToSave = updateData;

    if (canEditSkillBuilderCoordinatorAccess.value && !isSscMemberProfileMode.value) {
      payloadToSave.hasSkillBuilderCoordinatorAccess = Boolean(accountForm.value.hasSkillBuilderCoordinatorAccess);
    }

    // External busy ICS URL: admins/super admins only
    if (canEditExternalBusyIcsUrl.value && !isSscMemberProfileMode.value) {
      payloadToSave.externalBusyIcsUrl = String(accountForm.value.externalBusyIcsUrl || '').trim() || null;
    }
    
    // Include supervisor privileges if user has eligible role
    // Always include it if the toggle is visible (even if false) to ensure it's saved
    if (canToggleSupervisorPrivileges.value && !isSscMemberProfileMode.value) {
      payloadToSave.hasSupervisorPrivileges = Boolean(accountForm.value.hasSupervisorPrivileges);
      console.log('Sending supervisor privileges toggle:', payloadToSave.hasSupervisorPrivileges, 'for user role:', accountForm.value.role);
    } else {
      console.log('Cannot toggle supervisor privileges - user role:', accountForm.value.role, 'canToggle:', canToggleSupervisorPrivileges.value);
    }
    
    // Include permission attributes for cross-role capabilities
    const providerAccessEligibleRoles = ['staff', 'support', 'admin', 'super_admin', 'clinical_practice_assistant'];
    if (!isSscMemberProfileMode.value && providerAccessEligibleRoles.includes(accountForm.value.role)) {
      payloadToSave.hasProviderAccess = Boolean(accountForm.value.hasProviderAccess);
    }
    if (!isSscMemberProfileMode.value && accountForm.value.role === 'provider') {
      payloadToSave.hasStaffAccess = Boolean(accountForm.value.hasStaffAccess);
    }

    if (isProviderLikeUser.value && !isSscMemberProfileMode.value) {
      const sd = toDateInputValue(accountForm.value.providerStartDate);
      payloadToSave.providerStartDate = sd || null;
    }

    console.log('Update data being sent:', payloadToSave);
    pendingAccountUpdate.value = payloadToSave;
    const response = await api.put(`/users/${userId.value}`, payloadToSave);
    const backendWarnings = Array.isArray(response?.data?.warnings)
      ? response.data.warnings.map((w) => String(w || '').trim()).filter(Boolean)
      : [];

    // Backward-compatible fallback:
    // if backend response does not include users.credential yet, persist via legacy user-info.
    const backendSupportsCredentialColumn = Object.prototype.hasOwnProperty.call(response?.data || {}, 'credential');
    if (!backendSupportsCredentialColumn && providerCredentialFieldId.value) {
      try {
        await api.put(`/users/${userId.value}/user-info/${providerCredentialFieldId.value}`, { value: credentialText || null });
      } catch (e) {
        credentialSaveWarning = e?.response?.data?.error?.message || 'Failed to save credential field.';
        console.error('Failed to save credential:', e);
      }
    } else if (!backendSupportsCredentialColumn && credentialText) {
      credentialSaveWarning = 'Credential column is not available in this environment, so the credential value could not be saved.';
    }

    // Always fetch fresh user data to ensure all fields are up to date
    await fetchUser();
    // If editing own profile, refresh auth store so Dashboard/nav reflect new flags (e.g. company car access)
    if (parseInt(authStore.user?.id || 0, 10) === parseInt(userId.value || 0, 10)) {
      try {
        await authStore.refreshUser();
      } catch {
        // ignore
      }
    }
    isEditingAccount.value = false;
    void refreshOverview();
    if (credentialSaveWarning || backendWarnings.length > 0) {
      const parts = [];
      if (credentialSaveWarning) {
        parts.push(`Credential update did not save: ${credentialSaveWarning}`);
      }
      if (backendWarnings.length > 0) {
        parts.push(`Additional notes:\n- ${backendWarnings.join('\n- ')}`);
      }
      alert(`Account updated with warnings:\n\n${parts.join('\n\n')}`);
    }
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    if (status === 409 && data?.billingImpact?.code === 'ADMIN_OVERAGE') {
      billingImpact.value = data.billingImpact;
      showBillingAckModal.value = true;
      return;
    }
    error.value = data?.error?.message || 'Failed to save changes';
    alert(error.value);
  } finally {
    saving.value = false;
  }
};

const requireSkillBuilderConfirmNextLogin = async () => {
  if (!canRequireSkillBuilderConfirmNextLogin.value) return;
  if (!userId.value) return;
  if (!confirm('Require this user to confirm Skill Builder availability on their next login?')) return;
  try {
    forcingSkillBuilderConfirm.value = true;
    await api.post(`/users/${userId.value}/skill-builder/require-confirm-next-login`);
    alert('Queued: user will be required to confirm Skill Builder availability on next login.');
    await fetchUser();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to require Skill Builder confirm next login';
    alert(error.value);
  } finally {
    forcingSkillBuilderConfirm.value = false;
  }
};

const acknowledgeBillingAndSave = async () => {
  if (!pendingAccountUpdate.value) return;
  try {
    saving.value = true;
    const payload = { ...pendingAccountUpdate.value, billingAcknowledged: true };
    await api.put(`/users/${userId.value}`, payload);
    await fetchUser();
    isEditingAccount.value = false;
    closeBillingAckModal();
  } catch (err) {
    const msg = err?.response?.data?.error?.message || 'Failed to save changes';
    alert(msg);
  } finally {
    saving.value = false;
  }
};

const generateTemporaryPasswordForUser = async () => {
  try {
    generatingTempPassword.value = true;
    const response = await api.post(`/users/${userId.value}/generate-temporary-password`, { expiresInHours: 48 });
    temporaryPassword.value = response.data.temporaryPassword || '';
    temporaryPasswordExpiresAt.value = response.data.expiresAt || '';
    showTempPasswordModal.value = true;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to generate temporary password';
    alert(error.value);
  } finally {
    generatingTempPassword.value = false;
  }
};

const setCustomTemporaryPasswordForUser = async () => {
  const password = customTempPasswordInput.value?.trim();
  if (!password || password.length < 8) return;
  try {
    settingCustomTempPassword.value = true;
    const response = await api.post(`/users/${userId.value}/set-temporary-password`, {
      temporaryPassword: password,
      expiresInHours: 48
    });
    temporaryPassword.value = response.data.temporaryPassword || '';
    temporaryPasswordExpiresAt.value = response.data.expiresAt || '';
    showTempPasswordModal.value = true;
    customTempPasswordInput.value = '';
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to set temporary password';
    alert(error.value);
  } finally {
    settingCustomTempPassword.value = false;
  }
};

const copyTempPassword = async () => {
  if (tempPasswordInput.value) {
    tempPasswordInput.value.select();
  }
  try {
    await navigator.clipboard.writeText(String(temporaryPassword.value || ''));
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

const copyTempUsername = async () => {
  if (tempUsernameInput.value) {
    tempUsernameInput.value.select();
  }
  try {
    await navigator.clipboard.writeText(String(user.value?.username || user.value?.email || ''));
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

const closeTempPasswordModal = () => {
  showTempPasswordModal.value = false;
  temporaryPassword.value = '';
  temporaryPasswordExpiresAt.value = '';
  customTempPasswordInput.value = '';
};

// Reset password link (token-based) — shown for non-SSO users; expires (48h)
const showResetPasswordLinkModal = ref(false);
const generatingResetLink = ref(false);
const sendingResetEmail = ref(false);
const resetPasswordLink = ref('');
const resetLinkInput = ref(null);
const resetLinkExpiresAt = ref(null);
const resetLinkExpiresInHours = ref(null);
const resetLinkReused = ref(false);

const generateResetPasswordLink = async (forceNew = false) => {
  try {
    generatingResetLink.value = true;
    const response = await api.post(`/users/${userId.value}/send-reset-password-link`, {
      forceNew: !!forceNew
    });
    resetPasswordLink.value = response.data.tokenLink || '';
    resetLinkExpiresAt.value = response.data.expiresAt || null;
    resetLinkExpiresInHours.value = response.data.expiresInHours ?? null;
    resetLinkReused.value = !!response.data.reused;
    showResetPasswordLinkModal.value = true;
    await fetchAccountInfo();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to generate reset password link';
    alert(error.value);
  } finally {
    generatingResetLink.value = false;
  }
};

const copyCurrentResetLink = () => {
  const link = accountInfo.value?.passwordlessLoginLink;
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => {
    alert('Link copied to clipboard.');
  }).catch((err) => {
    console.error('Failed to copy:', err);
  });
};

const openResetLinkModalFromAccountInfo = () => {
  resetPasswordLink.value = accountInfo.value?.passwordlessLoginLink || '';
  resetLinkExpiresAt.value = accountInfo.value?.passwordlessTokenExpiresAt || null;
  resetLinkExpiresInHours.value = accountInfo.value?.passwordlessTokenExpiresInHours ?? null;
  resetLinkReused.value = false;
  showResetPasswordLinkModal.value = true;
};

const sendResetLinkEmail = async () => {
  try {
    sendingResetEmail.value = true;
    const response = await api.post(`/users/${userId.value}/send-reset-password-link`, {
      sendEmail: true,
      forceNew: false
    });
    resetPasswordLink.value = response.data.tokenLink || resetPasswordLink.value;
    resetLinkExpiresAt.value = response.data.expiresAt || resetLinkExpiresAt.value;
    resetLinkExpiresInHours.value = response.data.expiresInHours ?? resetLinkExpiresInHours.value;
    resetLinkReused.value = !!response.data.reused;
    if (response.data.emailSent) {
      alert('Email sent to user.');
    } else {
      alert('Could not send email (no email address on file or send failed).');
    }
    await fetchAccountInfo();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to send email';
    alert(error.value);
  } finally {
    sendingResetEmail.value = false;
  }
};

const copyResetLink = async () => {
  if (resetLinkInput.value) {
    resetLinkInput.value.select();
  }
  try {
    await navigator.clipboard.writeText(String(resetPasswordLink.value || ''));
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

const closeResetPasswordLinkModal = () => {
  showResetPasswordLinkModal.value = false;
  resetPasswordLink.value = '';
  resetLinkExpiresAt.value = null;
  resetLinkExpiresInHours.value = null;
  resetLinkReused.value = false;
};

const isTargetActive = computed(() => {
  const status = String(user.value?.status || '').toUpperCase();
  const isActiveStatus = status === 'ACTIVE_EMPLOYEE' || status === 'ACTIVE';
  const isActiveFlag = user.value?.is_active === undefined || user.value?.is_active === null
    ? true
    : (user.value?.is_active === true || user.value?.is_active === 1 || user.value?.is_active === '1');
  return isActiveStatus && isActiveFlag;
});

const ssoRequiredForTarget = computed(() => accountInfo.value?.ssoRequired === true);
const targetHasLoggedIn = computed(() => accountInfo.value?.hasLoggedIn === true);

// Your requested rule:
// - Active user + never logged in => show BOTH reset link + temp password
// - If Google SSO is required for this user => turn this area off
const canUsePasswordResetActions = computed(() => !ssoRequiredForTarget.value);
const canUseTempPassword = computed(() => isTargetActive.value && !targetHasLoggedIn.value && !ssoRequiredForTarget.value);
const isPendingForReset = computed(() => {
  const s = String(user.value?.status || '').toLowerCase();
  return s === 'pending' || s === 'pending_setup';
});

const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
};

const updatingStatus = ref(false);
const downloadingDocument = ref(false);
const statusChangeError = ref('');

const canChangeStatusManually = computed(() => {
  const role = authStore.user?.role;
  return role === 'admin' || role === 'super_admin' || role === 'support';
});

const availableStatusesForChange = computed(() => {
  const u = user.value;
  if (!u) return [];
  const roleNorm = String(u.role || '').toLowerCase();
  const statuses = ['school_staff', 'client_guardian'].includes(roleNorm) ? RESTRICTED_ROLE_STATUSES : VALID_EMPLOYEE_STATUSES;
  const current = String(u.status || '').toUpperCase();
  const actorIsSuper = String(authStore.user?.role || '').toLowerCase() === 'super_admin';
  return statuses.filter((s) => {
    if (s === current) return false;
    if (s === 'INACTIVE_EMPLOYEE') return false;
    if (s === 'ARCHIVED' && !actorIsSuper) return false;
    return true;
  });
});


const getStatusLabel = (status, isActive = true) => {
  if (!isActive) {
    return 'Inactive';
  }
  const labels = {
    // New status lifecycle
    'PROSPECTIVE': 'Prospective (Applicant)',
    'PENDING_SETUP': 'Pending Setup',
    'PREHIRE_OPEN': 'Pre-Hire',
    'PREHIRE_REVIEW': 'Ready for Review',
    'ONBOARDING': 'Onboarding',
    'ACTIVE_EMPLOYEE': 'Active',
    'TERMINATED_PENDING': 'Terminated (Grace Period)',
    'INACTIVE_EMPLOYEE': 'Inactive (offboarded)',
    'ARCHIVED': 'Archived',

    // Legacy statuses (backward compatibility)
    'pending': 'Pre-Hire (Legacy)',
    'ready_for_review': 'Ready for Review (Legacy)',
    'active': 'Active (Legacy)',
    'completed': 'Completed (Legacy)',
    'terminated': 'Terminated (Legacy)'
  };
  return labels[status] || String(status || 'Unknown');
};

const getStatusBadgeClass = (status, isActive = true) => {
  if (!isActive) {
    return 'badge-secondary';
  }
  const classes = {
    // New status lifecycle
    'PROSPECTIVE': 'badge-info',
    'PENDING_SETUP': 'badge-warning',
    'PREHIRE_OPEN': 'badge-warning',
    'PREHIRE_REVIEW': 'badge-primary',
    'ONBOARDING': 'badge-info',
    'ACTIVE_EMPLOYEE': 'badge-success',
    'TERMINATED_PENDING': 'badge-danger',
    'INACTIVE_EMPLOYEE': 'badge-secondary',
    'ARCHIVED': 'badge-secondary',

    // Legacy statuses
    'pending': 'badge-warning',
    'ready_for_review': 'badge-primary',
    'active': 'badge-success',
    'completed': 'badge-info',
    'terminated': 'badge-danger'
  };
  return classes[status] || 'badge-secondary';
};

provide(USER_ACCOUNT_CONTEXT_KEY, {
  user,
  userId,
  agencyId: scheduleAgencyId,
  userAgencies: affiliatedAgencies,
  currentAgency: computed(() => agencyStore.currentAgency),
  accountForm,
  saving,
  canEditUser,
  overview,
  overviewLoading,
  headerDisplayName,
  headerPhotoUrl,
  headerManagerName,
  headerSupervisorName,
  photoUploading,
  triggerPhotoUpload,
  saveAccount: () => saveAccount({ fromDashboard: true }),
  cancelEditAccount,
  navigate: (tabId) => { activeTab.value = tabId; },
  getStatusLabel,
  api,
  canChangeRole,
  canAssignSuperAdmin,
  canAssignAdmin,
  canAssignSupport,
  canAssignAssistantAdmin,
  showPayrollAccessToggle,
  showBillingAccessToggle,
  showMarketingContactToggle,
  showCredentialingAccessToggle,
  canToggleSupervisorPrivileges,
  canEditSkillBuilderCoordinatorAccess,
  canShowSkillBuildersSchoolProgramUserFields,
  openExternalCalendarsModal,
  isFullyLicensedForCredentialing,
  licenseCredentialSummary,
  refreshLicenseCredentialSummary: fetchLicenseCredentialSummary
});

const markComplete = async () => {
  if (!confirm('Mark this user as Active? (This does not change their password. Use “Send Reset Password Link” if they need to set one.)')) {
    return;
  }

  try {
    updatingStatus.value = true;
    await api.post(`/users/${userId.value}/mark-complete`);
    await fetchUser();
    alert('User marked as Active.');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to mark user as Active';
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
  const st = String(user.value?.status || '').toUpperCase();
  const msg =
    st === 'INACTIVE_EMPLOYEE'
      ? 'Reactivate this user? They will be able to sign in again; you will need to re-assign agencies and schools.'
      : 'Are you sure you want to reactivate this user? This will restore their access immediately.';
  if (!confirm(msg)) {
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

const markStaffInactive = async () => {
  const name = `${user.value?.first_name || ''} ${user.value?.last_name || ''}`.trim() || 'this user';
  if (
    !confirm(
      `Mark ${name} inactive?\n\nThey will be signed out, removed from all agencies/schools and related schedules, and their account will stay on file for history. You can reactivate them later and re-assign organizations.`
    )
  ) {
    return;
  }
  try {
    updatingStatus.value = true;
    await api.post(`/users/${userId.value}/set-inactive`);
    alert('User marked inactive. Re-assign agencies/schools when they return.');
    await fetchUser();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to mark user inactive';
    alert(error.value);
  } finally {
    updatingStatus.value = false;
  }
};

const archiveUser = async () => {
  if (!confirm(`Are you sure you want to archive "${user.value?.first_name} ${user.value?.last_name}"? This is for super-admin testing and full archive workflow.`)) {
    return;
  }

  try {
    updatingStatus.value = true;
    await api.post(`/users/${userId.value}/archive`);
    alert('User archived successfully');
    router.push(backToUsersList.value);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to archive user';
    alert(error.value);
  } finally {
    updatingStatus.value = false;
  }
};

const onStatusChange = async (event) => {
  const newStatus = event?.target?.value;
  if (!newStatus || newStatus === user.value?.status) return;

  const currentStatus = String(user.value?.status || '').toUpperCase();
  const requiresConfirmation = (
    (currentStatus === 'ACTIVE_EMPLOYEE' || currentStatus === 'active') && newStatus === 'PROSPECTIVE'
  ) || (
    (currentStatus === 'ACTIVE_EMPLOYEE' || currentStatus === 'active') && newStatus === 'ARCHIVED'
  );

  if (requiresConfirmation && !confirm(`Are you sure you want to move this user from ${getStatusLabel(currentStatus, true)} to ${getStatusLabel(newStatus, true)}? This is a significant status change.`)) {
    event.target.value = user.value?.status; // Reset select
    return;
  }

  try {
    statusChangeError.value = '';
    updatingStatus.value = true;
    await api.put(`/users/${userId.value}/status`, { status: newStatus });
    await fetchUser();
    alert('Status updated successfully.');
  } catch (err) {
    statusChangeError.value = err.response?.data?.error?.message || 'Failed to update status';
    alert(statusChangeError.value);
    event.target.value = user.value?.status; // Reset select on error
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

const tabIds = computed(() => (tabs.value || []).map((t) => t.id));

/** Jump targets for in-profile search (tab + optional DOM section id). */
const profileSearchResults = computed(() => {
  const q = String(profileSearchQuery.value || '').trim();
  if (!q) return [];
  const tabLabelById = Object.fromEntries((tabs.value || []).map((t) => [t.id, t.label]));
  return filterProfileSearchTargets(q, tabIds.value).map((t) => ({
    ...t,
    tabLabel: tabLabelById[t.tabId] || t.tabId,
  }));
});

watch(profileSearchResults, () => {
  profileSearchHighlight.value = 0;
});

function closeProfileSearch() {
  profileSearchOpen.value = false;
  profileSearchHighlight.value = 0;
}

function profileSearchMove(delta) {
  const n = profileSearchResults.value.length;
  if (!n) return;
  profileSearchOpen.value = true;
  profileSearchHighlight.value = (profileSearchHighlight.value + delta + n) % n;
}

function profileSearchSelectHighlighted() {
  const hit = profileSearchResults.value[profileSearchHighlight.value];
  if (hit) jumpToProfileSection(hit);
}

function jumpToProfileSection(hit) {
  if (!hit) return;
  profileSearchQuery.value = '';
  closeProfileSearch();
  selectTab(hit.tabId, hit.sectionId || '', hit.clinicalSubTab || '');
}

const selectTab = (tabId, sectionId = '', clinicalSubTab = '') => {
  const id = String(tabId || '').trim();
  if (!id) return;
  if (!tabIds.value.includes(id)) return;
  // IMPORTANT: do not mutate the route from inside a tab click handler.
  // Writing to the router during a component update can trigger Vue's internal patch crashes
  // (nextSibling/subTree/emitsOptions) when the route update races with VDOM patching.
  activeTab.value = id;

  const clinical = String(clinicalSubTab || '').trim();
  if (clinical && id === 'provider_info') {
    nextTick(() => {
      const fire = () =>
        window.dispatchEvent(new CustomEvent('pt-clinical-subtab', { detail: { subTab: clinical } }));
      fire();
      setTimeout(fire, 150);
      setTimeout(fire, 450);
    });
  }

  // Optionally scroll to a specific section within the newly activated tab.
  const anchor = String(sectionId || '').trim();
  if (!anchor) return;

  // Tabs like Lifecycle fetch async data before section anchors exist — retry longer.
  const maxAttempts = 50; // ~8s with backoff below
  const tryScroll = (attempt = 0) => {
    const el = document.getElementById(anchor);
    if (el) {
      // Double rAF: wait for layout after async tab content swaps in.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.classList.add('profile-section-flash');
          setTimeout(() => el.classList.remove('profile-section-flash'), 1600);
        });
      });
      return;
    }
    if (attempt < maxAttempts) {
      const delay = attempt < 15 ? 80 : 160;
      setTimeout(() => tryScroll(attempt + 1), delay);
    }
  };
  nextTick(() => tryScroll());
};

const onProfileJumpEvent = (event) => {
  const tabId = String(event?.detail?.tabId || '').trim();
  const sectionId = String(event?.detail?.sectionId || '').trim();
  const clinicalSubTab = String(event?.detail?.clinicalSubTab || '').trim();
  if (!tabId) return;
  selectTab(tabId, sectionId, clinicalSubTab);
};

// Honor ?tab=&section= when assistant (or links) update the query while already on this profile.
watch(
  () => [route.query.tab, route.query.section],
  ([tab, section], [prevTab, prevSection]) => {
    const nextTab = String(tab || '').trim();
    const nextSection = String(section || '').trim();
    if (!nextTab && !nextSection) return;
    if (String(prevTab || '') === nextTab && String(prevSection || '') === nextSection) return;
    if (nextTab && tabIds.value.includes(nextTab)) {
      selectTab(nextTab, nextSection);
    } else if (nextSection) {
      selectTab(activeTab.value, nextSection);
    }
  }
);

/** Keep Overview + Account tab in sync after Job & Employment Details save. */
const onOverviewJobSaved = async (payload = {}) => {
  if (!payload || typeof payload !== 'object') return;
  if (user.value) {
    const next = { ...user.value };
    if ('title' in payload) next.title = payload.title;
    if ('department' in payload) next.department = payload.department;
    if ('employmentType' in payload) {
      next.employment_type = payload.employmentType;
      next.employmentType = payload.employmentType;
    }
    if ('workLocation' in payload) next.work_location = payload.workLocation;
    user.value = next;
  }
  if (accountForm.value && 'title' in payload) {
    accountForm.value.title = payload.title || '';
  }
  try {
    await fetchUser();
  } catch {
    // local merge above is enough if reload fails
  }
};

/** Keep Account tab permission checkboxes in sync after Overview quick-save. */
const onOverviewPermsSaved = (perms = {}) => {
  if (!perms || typeof perms !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(perms, 'hasCredentialingAccess')) {
    accountForm.value.hasCredentialingAccess = Boolean(perms.hasCredentialingAccess);
  }
  if (Object.prototype.hasOwnProperty.call(perms, 'hasPayrollAccess')) {
    accountForm.value.hasPayrollAccess = Boolean(perms.hasPayrollAccess);
  }
  if (Object.prototype.hasOwnProperty.call(perms, 'hasBillingAccess')) {
    accountForm.value.hasBillingAccess = Boolean(perms.hasBillingAccess);
  }
  if (Object.prototype.hasOwnProperty.call(perms, 'isMarketingContact')) {
    accountForm.value.isMarketingContact = Boolean(perms.isMarketingContact);
  }
  if (accountInfo.value) {
    accountInfo.value = { ...accountInfo.value, ...perms };
  }
  void fetchAccountInfo();
};

/** Refresh user after Benefits tab save (employment type, medcancel, notes). */
const onBenefitsUpdated = async (payload = {}) => {
  if (payload?.medcancelRateSchedule !== undefined) {
    accountForm.value.medcancelRateSchedule = String(payload.medcancelRateSchedule || 'none');
  }
  if (user.value && payload?.employmentType !== undefined) {
    user.value = { ...user.value, employment_type: payload.employmentType };
  }
  if (user.value && payload?.benefitsNotes !== undefined) {
    user.value = { ...user.value, benefits_notes: payload.benefitsNotes };
  }
  if (user.value && payload?.benefitsEligibilityOverrides !== undefined) {
    user.value = {
      ...user.value,
      benefits_eligibility_overrides_json: payload.benefitsEligibilityOverrides
    };
  }
  if (user.value && payload?.medcancelRateSchedule !== undefined) {
    user.value = {
      ...user.value,
      medcancel_rate_schedule: payload.medcancelRateSchedule,
      medcancelRateSchedule: payload.medcancelRateSchedule
    };
  }
  try {
    await fetchUser();
  } catch {
    // local merge above is enough if reload fails
  }
  void refreshOverview?.();
};

// Ensure activeTab is always valid for the currently computed tabs.
watch(tabIds, (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return;
  if (!ids.includes(activeTab.value)) {
    activeTab.value = ids[0];
  }
}, { immediate: true });

// NOTE: We intentionally do not sync `activeTab` to the URL query to avoid router/VDOM race conditions.

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
  if (!user.value || !['staff', 'provider'].includes(user.value.role)) {
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

watch(
  () => route.params.userId,
  () => {
    const id = parseInt(String(route.params.userId || ''), 10);
    if (!Number.isFinite(id) || id <= 0) return;
    fetchUser();
  },
  { immediate: true }
);

const onProfileSearchDocClick = (e) => {
  const wraps = document.querySelectorAll('[data-tour="user-profile-search"], [data-tour="user-profile-search-tabs"]');
  for (const wrap of wraps) {
    if (wrap.contains(e.target)) return;
  }
  closeProfileSearch();
};

onMounted(() => {
  void Promise.allSettled([fetchSupervisees(), fetchSupervisors()]);
  if (pendingProfileSection.value) {
    const section = pendingProfileSection.value;
    pendingProfileSection.value = '';
    nextTick(() => selectTab(activeTab.value, section));
  }
  document.addEventListener('click', onProfileSearchDocClick);
  window.addEventListener('pt-profile-jump', onProfileJumpEvent);
});

onUnmounted(() => {
  document.removeEventListener('click', onProfileSearchDocClick);
  window.removeEventListener('pt-profile-jump', onProfileJumpEvent);
});
</script>

<style scoped>
.texting-number-display {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.texting-number-display .muted { color: var(--text-secondary); }
.texting-number-display .link-inline { font-size: 13px; }

.collapse-icon {
  display: inline-block;
  transition: transform 0.2s;
  font-size: 12px;
  color: var(--text-secondary);
}
.collapse-icon.expanded {
  transform: rotate(90deg);
}

.primary-pill {
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  color: #065f46;
  border: 1px solid rgba(16, 185, 129, 0.28);
  background: rgba(16, 185, 129, 0.12);
}
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

.header-avatar {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--bg);
  overflow: hidden;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.header-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.header-photo-fallback {
  font-weight: 900;
  color: var(--text-primary);
}

/* ─── Enhanced profile header ─────────────────────────────────────────────── */
.ph-wrap {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr) auto;
  gap: 24px;
  align-items: start;
  padding: 20px 0 8px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  margin-bottom: 4px;
}

.ph-photo-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 168px;
  flex-shrink: 0;
}

.ph-photo-col .ph-avatar {
  width: 168px;
  height: 168px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ph-photo-col .header-photo-fallback {
  font-size: 42px;
}

.ph-upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #6b7280;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}
.ph-upload-btn:hover { color: var(--primary, #059669); }
.ph-upload-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.ph-photo-err { font-size: 11px; color: #dc2626; text-align: center; }

.ph-info-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.ph-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ph-name {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #111827);
  white-space: nowrap;
}
.ph-subtitle-role {
  font-size: 13.5px;
  color: var(--text-secondary, #6b7280);
  margin: 0;
}
.ph-contact-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.ph-contact-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: #374151;
}
.ph-contact-chip svg { flex-shrink: 0; opacity: 0.6; }

.ph-accepted-insurance {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafafa;
}

.ph-metrics-bar {
  display: flex;
  align-items: flex-start;
  gap: 0;
  margin-top: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  overflow: hidden;
}
.ph-metric {
  flex: 1;
  padding: 8px 14px;
  border-right: 1px solid #e5e7eb;
  min-width: 0;
}
.ph-metric:last-child { border-right: none; }
.ph-ml {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #9ca3af;
  margin-bottom: 3px;
  white-space: nowrap;
}
.ph-mv {
  font-size: 13.5px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ph-search-wrap {
  position: relative;
  margin-top: 12px;
  max-width: 420px;
}
.ph-search-wrap--tabs {
  margin: 0 0 12px;
  max-width: 520px;
}
.ph-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  color: #111827;
}
.ph-search-input:focus {
  outline: none;
  border-color: #0f766e;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.15);
}
.ph-search-dropdown {
  position: absolute;
  z-index: 40;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
  overflow: hidden;
}
.ph-search-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: #fff;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
}
.ph-search-option:hover,
.ph-search-option.on {
  background: #f0fdfa;
}
.ph-search-option-label { font-weight: 600; color: #111827; }
.ph-search-option-tab {
  font-size: 12px;
  color: #6b7280;
  flex-shrink: 0;
}
.ph-search-empty {
  margin: 6px 0 0;
  font-size: 13px;
  color: #9ca3af;
}

.ph-panel-col {
  width: 190px;
  flex-shrink: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 14px 16px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ph-panel-item { display: flex; flex-direction: column; gap: 3px; }
.ph-pl {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #9ca3af;
}
.ph-pv { font-size: 13px; color: #374151; line-height: 1.4; }
.ph-pv--active { color: var(--primary, #059669); font-weight: 600; }

@media (max-width: 900px) {
  .ph-wrap { grid-template-columns: 168px minmax(0, 1fr); }
  .ph-panel-col { display: none; }
}
@media (max-width: 640px) {
  .ph-wrap { grid-template-columns: 1fr; }
  .ph-photo-col { flex-direction: row; align-items: center; width: auto; }
  .ph-metrics-bar { flex-wrap: wrap; }
}

.prelicensed-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prelicensed-caption {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
}

.prelicensed-hours {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
}

.prelicensed-hours-caption {
  width: 100%;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
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
.status-badge-header--leave {
  background: var(--warning-bg, #fef3c7);
  color: var(--warning-fg, #92400e);
}

.header-availability {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  position: relative;
}
.header-availability-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  letter-spacing: 0.2px;
  text-transform: uppercase;
}
.toggle-switch-sm {
  transform: scale(0.85);
  transform-origin: left center;
}
.header-availability-info {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 16px;
  padding: 0;
  cursor: pointer;
}
.header-availability-hint {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  width: min(420px, 80vw);
  background: white;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-primary);
  z-index: 10;
}

.subtitle {
  color: var(--text-secondary);
  margin: 0;
}

.tabs,
.profile-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  padding: 5px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow-x: auto;
  flex-wrap: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}

/* Brief highlight when profile search scrolls to a section */
:deep(.profile-section-flash) {
  animation: profile-section-flash 1.5s ease;
}
@keyframes profile-section-flash {
  0% { box-shadow: 0 0 0 0 rgba(15, 118, 110, 0.45); }
  30% { box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.28); background-color: rgba(240, 253, 250, 0.9); }
  100% { box-shadow: 0 0 0 0 rgba(15, 118, 110, 0); }
}

.tab-button,
.profile-tab {
  padding: 9px 16px;
  background: transparent;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #64748b;
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.2;
}

.tab-button:hover,
.profile-tab:hover {
  color: #334155;
  background: rgba(255, 255, 255, 0.55);
}

.tab-button.active,
.profile-tab--active {
  color: #2e5d50;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04);
}

.tab-button.active:hover,
.profile-tab--active:hover {
  color: #244a40;
  background: #fff;
}

.affiliation-subtabs {
  display: flex;
  gap: 6px;
  margin-top: -12px;
  margin-bottom: 4px;
  border-bottom: 1px solid #eef2f7;
  padding-bottom: 0;
}

.affiliation-subtab {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.affiliation-subtab:hover {
  color: #2e5d50;
}

.affiliation-subtab.active {
  color: #2e5d50;
  border-bottom-color: #2e5d50;
}

.tab-content {
  background: white;
  border-radius: 14px;
  padding: 28px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
  border: 1px solid #eef2f7;
}

.tab-content--flush {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  border-radius: 0;
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

.comm-pref-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border, #e5e7eb);
  font-size: 14px;
}

.comm-pref-row:last-child {
  border-bottom: none;
}

.comm-pref-label {
  min-width: 220px;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
}

.comm-pref-value {
  font-weight: 500;
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
  grid-template-columns: minmax(520px, 2fr) minmax(320px, 1fr);
  margin-top: 10px;
  gap: 24px;
  align-items: start;
}

.account-main {
  min-width: 0;
}

.account-sidebar {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.account-flags-section {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: white;
}

.account-flags-section h3 {
  margin-top: 0;
  margin-bottom: 10px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.2px;
}

.compact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.compact-row:last-child {
  border-bottom: none;
}

.compact-meta {
  min-width: 0;
}

.compact-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.compact-help {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.25;
}

.compact-select {
  width: 140px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  background: white;
}

.compact-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.compact-toggle:last-of-type {
  border-bottom: none;
}

.toggle-switch-sm {
  width: 42px;
  height: 20px;
}

.toggle-switch-sm .slider {
  border-radius: 20px;
}

.toggle-switch-sm .slider:before {
  width: 14px;
  height: 14px;
  left: 3px;
  bottom: 3px;
}

.toggle-switch-sm input:checked + .slider:before {
  transform: translateX(22px);
}

.admin-tools-section h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--text-primary);
  font-size: 18px;
}

@media (max-width: 980px) {
  .account-layout {
    grid-template-columns: 1fr;
  }
}

.account-form {
  max-width: 100%;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.form-grid .form-group label {
  margin-bottom: 4px;
  font-size: 12px;
}

.form-grid .form-group input,
.form-grid .form-group select,
.form-grid .form-group textarea {
  padding: 7px 9px;
  font-size: 13px;
}

@media (min-width: 1200px) {
  .form-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
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
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.form-group textarea {
  resize: vertical;
  min-height: 84px;
  line-height: 1.45;
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

.form-actions-bar {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin: 0 0 12px 0;
}

.form-actions-bar--bottom {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
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

.ssc-status-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 18px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  font-size: 13.5px;
  color: #0c4a6e;
  margin: 18px 0 8px;
  line-height: 1.5;
}
.ssc-status-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }

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

.feature-access-section {
  max-width: 100%;
  margin-bottom: 24px;
  padding: 16px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: var(--surface-elevated, #f9fafb);
}
.feature-access-section h3 {
  margin: 0 0 6px 0;
  font-size: 16px;
  color: var(--text-primary, #111827);
}
.feature-access-help {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}
.feature-access-grid {
  display: grid;
  gap: 10px;
}
.feature-access-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
}
.feature-access-meta { min-width: 0; flex: 1 1 auto; }
.feature-access-label { font-weight: 600; font-size: 14px; }
.feature-access-desc { font-size: 12px; color: var(--text-secondary, #6b7280); }
.feature-access-price { font-size: 12px; color: var(--text-secondary, #6b7280); margin-top: 2px; }
.feature-access-price .muted { opacity: 0.8; }

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

.agency-item-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.agency-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
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

.affiliations-details-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.affiliations-details-trigger {
  padding: 3px 8px;
}

.affiliations-popover {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 6px;
  min-width: 360px;
  max-width: 520px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.15);
  z-index: 50;
}

.affiliations-popover--below {
  position: relative;
  top: auto;
  left: auto;
  margin-top: 10px;
}

.affiliations-popover-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.affiliations-popover-item {
  padding: 8px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.affiliations-popover-item:first-of-type {
  border-top: none;
  padding-top: 0;
}

.affiliations-popover-item-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.affiliations-popover-item-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.2;
}

.affiliations-popover-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.unaffiliated-orgs-row {
  margin-top: 6px;
  position: relative;
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

/* Summit club: team captain badges */
.user-header-info .ssc-captain-badge--legacy {
  margin-left: 6px;
  vertical-align: middle;
}
.ssc-captain-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 0.85rem;
  line-height: 1;
  border-radius: 10px;
  user-select: none;
}
.ssc-captain-badge--legacy {
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.35rem;
  color: #fff;
  background: linear-gradient(135deg, #b45309 0%, #f59e0b 45%, #fbbf24 100%);
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.45);
  letter-spacing: -0.02em;
}
.ssc-captain-badge--season {
  min-width: 1.75rem;
  height: 1.75rem;
  margin-left: 8px;
  font-size: 1.1rem;
  color: #fff;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%);
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 12px rgba(124, 58, 237, 0.45);
}
.ssc-captain-badge--inline {
  margin-right: 10px;
  flex-shrink: 0;
}
.ssc-captain-legacy-banner {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  margin-bottom: 14px;
  border-radius: 12px;
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.12), rgba(124, 58, 237, 0.08));
  border: 1px solid rgba(245, 158, 11, 0.35);
  font-size: 0.88rem;
  color: var(--text-primary, #0f172a);
}
.ssc-season-cell {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.ssc-season-title {
  font-weight: 600;
}
</style>
