<template>
  <div class="container">
    <div class="page-header">
      <div>
        <router-link to="/admin/users" class="back-link">← Back to Users</router-link>
        <div class="user-header-info">
          <div class="header-avatar">
            <img v-if="headerPhotoUrl" :src="headerPhotoUrl" alt="Profile photo" class="header-photo" />
            <div v-else class="header-photo-fallback" aria-hidden="true">{{ headerInitials }}</div>
          </div>
          <h1>{{ headerDisplayName }}</h1>
          <span 
            v-if="user" 
            :class="['status-badge-header', getStatusBadgeClass(user.status, user.is_active)]"
          >
            {{ getStatusLabel(user.status, user.is_active) }}
          </span>

          <!-- Global availability (providers) -->
          <div
            v-if="showGlobalAvailabilityInHeader"
            class="header-availability"
            :title="providerAcceptingNewClients ? 'OPEN (global)' : 'CLOSED (global)'"
          >
            <span class="header-availability-label">Global</span>
            <div class="toggle-switch toggle-switch-sm">
              <input
                type="checkbox"
                v-model="providerAcceptingNewClients"
                :disabled="!canToggleGlobalAvailability || updatingGlobalAvailability"
                @change="saveGlobalAvailability"
              />
              <span class="slider"></span>
            </div>
            <button type="button" class="header-availability-info" @click="showGlobalAvailabilityHint = !showGlobalAvailabilityHint">
              i
            </button>
            <div v-if="showGlobalAvailabilityHint" class="header-availability-hint">
              <strong>Reminder:</strong> Please ensure your schedule is open in the EHR system for the times that you are available via “Extra availability”.
            </div>
          </div>

          <button
            v-if="canRepairProviderSlots && activeTab === 'school_affiliation' && selectedSchoolAffiliationId"
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="repairingProviderSlots"
            @click="repairProviderSlots"
            :title="'Recalculate and repair stored slot availability for this school'"
          >
            {{ repairingProviderSlots ? 'Repairing…' : 'Repair slots' }}
          </button>
        </div>
        <p class="subtitle">{{ user?.email }}</p>

        <div v-if="canEditUser" style="margin-top: 10px;">
          <input
            ref="profilePhotoInput"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
            style="display:none;"
            @change="onAdminPhotoSelected"
          />
          <div style="display:flex; gap: 10px; align-items:center; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" type="button" @click="profilePhotoInput?.click()" :disabled="photoUploading">
              {{ photoUploading ? 'Uploading…' : 'Upload Profile Photo' }}
            </button>
            <div v-if="photoError" class="error" style="margin:0;">{{ photoError }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading user profile...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="profile-content">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          @click="selectTab(tab.id)"
          :class="['tab-button', { active: activeTab === tab.id }]"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Force full remount when switching tabs to avoid Vue patch edge-cases across radically different subtrees -->
      <div class="tab-content" :key="activeTab">
        <div v-if="activeTab === 'account'" class="tab-panel">
          <h2>Account Information</h2>
          <div class="account-layout">
            <div class="account-main">
              <form v-if="canEditUser" @submit.prevent="saveAccount" class="account-form">
                <div class="form-actions form-actions--sticky">
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
                  <label>Preferred Name (display only)</label>
                  <input v-model="accountForm.preferredName" type="text" :disabled="!isEditingAccount" />
                  <small class="form-help">
                    Shows up as <strong>First "Preferred" Last</strong> in headers/welcome, but is not used for payroll or legal records.
                  </small>
                </div>
                <div class="form-group">
                  <label>Login Email</label>
                  <input
                    v-model="accountForm.email"
                    type="email"
                    :disabled="!isEditingAccount || String(user?.email || '').toLowerCase() === 'superadmin@plottwistco.com'"
                  />
                  <small class="form-help">
                    This is the email the user logs in with. Changing it does <strong>not</strong> change their password — use “Send Reset Password Link” if needed.
                  </small>
                </div>
                <div class="form-group">
                  <label>Personal Email</label>
                  <input v-model="accountForm.personalEmail" type="email" :disabled="!isEditingAccount" />
                  <small class="form-help">
                    Contact email (not used for login).
                  </small>
                </div>
                <div class="form-group">
                  <label>Title</label>
                  <input v-model="accountForm.title" type="text" :disabled="!isEditingAccount" placeholder="e.g. Therapist" />
                </div>
                <div class="form-group">
                  <label>Service Focus</label>
                  <input v-model="accountForm.serviceFocus" type="text" :disabled="!isEditingAccount" placeholder="e.g. School-based, Trauma, Medicaid" />
                </div>
                <div class="form-group">
                  <label>Personal Phone Number</label>
                  <input v-model="accountForm.personalPhone" type="tel" :disabled="!isEditingAccount" />
                </div>
                <div class="form-group">
                  <label>Work Phone Number</label>
                  <input v-model="accountForm.workPhone" type="tel" :disabled="!isEditingAccount" />
                </div>
                <div class="form-group">
                  <label>Work Phone Extension</label>
                  <input v-model="accountForm.workPhoneExtension" type="text" :disabled="!isEditingAccount" />
                </div>
                <div class="form-group">
                  <label>System Phone Number (masked SMS)</label>
                  <input :value="systemPhoneNumberDisplay" type="tel" disabled />
                  <small class="form-help">
                    This is the system-assigned number used for masked texting. It can’t be edited here.
                  </small>
                </div>

                <div class="form-group form-group-full">
                  <div class="section-divider" style="margin: 8px 0 6px;">
                    <h3 style="margin: 0;">Home Address</h3>
                  </div>
                  <p class="hint" style="margin: 0 0 10px;">
                    Used for School Mileage auto-calculation.
                  </p>
                </div>

                <div class="form-group">
                  <label>Street</label>
                  <input v-model="accountForm.homeStreetAddress" type="text" placeholder="123 Main St" :disabled="!isEditingAccount" />
                </div>
                <div class="form-group">
                  <label>Apt / Unit</label>
                  <input v-model="accountForm.homeAddressLine2" type="text" placeholder="Apt 4B (optional)" :disabled="!isEditingAccount" />
                </div>
                <div class="form-group">
                  <label>City</label>
                  <input v-model="accountForm.homeCity" type="text" placeholder="City" :disabled="!isEditingAccount" />
                </div>
                <div class="form-group">
                  <label>State</label>
                  <input v-model="accountForm.homeState" type="text" placeholder="State" :disabled="!isEditingAccount" />
                </div>
                <div class="form-group">
                  <label>Postal Code</label>
                  <input v-model="accountForm.homePostalCode" type="text" placeholder="ZIP" :disabled="!isEditingAccount" />
                </div>

                <div class="form-group form-group-full">
                  <div class="section-divider" style="margin: 8px 0 6px;">
                    <h3 style="margin: 0;">Med Cancel (contract)</h3>
                  </div>
                  <p class="hint" style="margin: 0 0 10px;">
                    Controls whether the provider can submit “Missed Medicaid sessions (Med Cancel)”.
                  </p>
                </div>

                <div class="form-group form-group-full">
                  <label>Med Cancel schedule</label>
                  <select v-model="accountForm.medcancelRateSchedule" :disabled="!isEditingAccount">
                    <option value="none">Not eligible (None)</option>
                    <option value="low">Low schedule ($5 / $7.50 / $10)</option>
                    <option value="high">High schedule ($10 / $15 / $20)</option>
                  </select>
                  <small class="form-help">
                    If set to “Low” or “High”, the provider will see Med Cancel in Submit → In-School Claims.
                  </small>
                </div>

                <div class="form-group form-group-full">
                  <div class="section-divider" style="margin: 12px 0 6px;">
                    <h3 style="margin: 0;">Company Card (contract)</h3>
                  </div>
                  <p class="hint" style="margin: 0 0 10px;">
                    Enables the “Submit Expense (Company Card)” option in Submit for this user.
                  </p>
                </div>

                <div class="form-group form-group-full">
                  <label class="toggle-label">
                    <span>Company card enabled</span>
                    <div class="toggle-switch">
                      <input
                        id="company-card-toggle"
                        type="checkbox"
                        v-model="accountForm.companyCardEnabled"
                        :disabled="!isEditingAccount"
                      />
                      <span class="slider"></span>
                    </div>
                  </label>
                  <small class="form-help">
                    Only users with a company card should have this turned on.
                  </small>
                </div>

                <div class="form-group form-group-full">
                  <div class="section-divider" style="margin: 12px 0 6px;">
                    <h3 style="margin: 0;">Skill Builders (program)</h3>
                  </div>
                  <p class="hint" style="margin: 0 0 10px;">
                    If enabled, this provider must submit (or confirm) at least 6 hours/week via Submit → Additional Availability.
                  </p>
                </div>

                <div class="form-group form-group-full">
                  <label class="toggle-label">
                    <span>Skill Builder eligible</span>
                    <div class="toggle-switch">
                      <input
                        id="skill-builder-eligible-toggle"
                        type="checkbox"
                        v-model="accountForm.skillBuilderEligible"
                        :disabled="!isEditingAccount"
                      />
                      <span class="slider"></span>
                    </div>
                  </label>
                </div>

                <div v-if="accountForm.externalBusyIcsUrl" class="form-group form-group-full">
                  <label>Legacy external busy calendar (deprecated)</label>
                  <input v-model="accountForm.externalBusyIcsUrl" type="url" disabled />
                  <small class="form-help">
                    This legacy field is no longer used. Use “External calendars (ICS)” below.
                  </small>
                </div>

                <div v-if="canEditExternalBusyIcsUrl" class="form-group form-group-full">
                  <div class="section-divider" style="margin: 12px 0 6px;">
                    <h3 style="margin: 0;">External calendars (ICS)</h3>
                  </div>
                  <p class="hint" style="margin: 0 0 10px;">
                    Add one or more named calendars (e.g., “Bachelors EHR”). Each calendar can have multiple ICS feed URLs.
                  </p>

                  <div style="border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; background: white;">
                    <div style="font-weight: 900;">EHR calendar (paste URL only)</div>
                    <p class="hint" style="margin: 6px 0 10px;">
                      Paste this user’s personal ICS feed URL from the EHR. You don’t need to create or name a calendar — we save it under this user automatically.
                    </p>
                    <div class="muted small" style="margin: -6px 0 10px;">
                      If your EHR gives you a <strong>webcal://</strong> link, that’s OK — we’ll fetch it as <strong>https://</strong>.
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
                      Tip: pasting a new URL will automatically make it the only active EHR feed for this user.
                    </div>
                  </div>

                  <div v-if="externalCalendarsError" class="error" style="margin-top: 8px;">{{ externalCalendarsError }}</div>
                  <div v-if="externalCalendarsLoading" class="muted" style="margin-top: 8px;">Loading external calendars…</div>

                  <div v-else>
                    <div style="display:flex; gap: 8px; align-items: end; flex-wrap: wrap;">
                      <div style="flex: 1; min-width: 240px;">
                        <label class="lbl">New calendar label</label>
                        <input class="agency-select" v-model="newExternalCalendarLabel" placeholder="e.g. Bachelors EHR" />
                      </div>
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        @click="createExternalCalendar"
                        :disabled="externalCalendarsSaving || !newExternalCalendarLabel.trim()"
                      >
                        {{ externalCalendarsSaving ? 'Saving…' : 'Create calendar' }}
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" @click="loadExternalCalendars" :disabled="externalCalendarsSaving">
                        Refresh
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
                
                <div v-if="canToggleSupervisorPrivileges" class="form-group form-group-full">
                  <label class="toggle-label">
                    <span>Supervisor Privileges</span>
                    <div class="toggle-switch">
                      <input 
                        type="checkbox" 
                        v-model="accountForm.hasSupervisorPrivileges" 
                        :disabled="!isEditingAccount"
                        id="supervisor-privileges-toggle"
                      />
                      <span class="slider"></span>
                    </div>
                  </label>
                  <small class="form-help">Allows this user to be assigned as a supervisor while maintaining their primary role</small>
                  <small v-if="!isEditingAccount" class="form-help" style="display: block; margin-top: 4px;">Click “Edit” to modify this field</small>
                </div>
                <div class="form-group form-group-full">
                  <label>Role</label>
                  <select v-model="accountForm.role" :disabled="!isEditingAccount || !canChangeRole">
                    <option v-if="canAssignSuperAdmin" value="super_admin">Super Admin</option>
                    <option v-if="canAssignAdmin" value="admin">Admin</option>
                    <option v-if="canAssignSupport" value="support">Staff (Admin Tools)</option>
                    <option value="clinical_practice_assistant">Clinical Practice Assistant</option>
                    <option value="staff">Staff</option>
                    <option value="provider">Provider</option>
                    <option value="school_staff">School Staff</option>
                  </select>
                  <small v-if="!canChangeRole" class="form-help">You don't have permission to change roles</small>
                  <small v-else-if="!canAssignSuperAdmin && accountForm.role === 'super_admin'" class="form-help">Only super admins can assign the super admin role</small>
                  <small v-else-if="!canAssignAdmin && accountForm.role === 'admin'" class="form-help">Only super admins and admins can assign the admin role</small>
                  <small v-else-if="!canAssignSupport && accountForm.role === 'support'" class="form-help">Only super admins and admins can assign the staff role</small>
                </div>

                <div class="form-group form-group-full">
                  <label>Credential</label>
                  <input
                    v-model="accountForm.credential"
                    type="text"
                    placeholder="e.g., LCSW, LPC, Intern, CSW, etc."
                    :disabled="!isEditingAccount"
                  />
                  <small class="form-help">
                    Used for classification/display. This does not change permissions.
                  </small>
                </div>
                </div>
                
                <div class="form-actions">
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
              </form>
              <div v-else class="view-only-notice">
                <p><strong>View Only:</strong> Clinical Practice Assistants and Supervisors have view-only access to user profiles. Contact an administrator to make changes.</p>
              </div>
            </div>

            <div class="account-sidebar">
              <div class="agency-assignments-section">
                <h3>Agency Assignments</h3>
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
                              :title="`Show affiliated schools/programs (${(affiliatedOrgsByAgencyId[String(agency.id)] || []).length})`"
                            >
                              Schools
                              <span class="muted" style="font-weight: 700;">
                                ({{ (affiliatedOrgsByAgencyId[String(agency.id)] || []).length }})
                              </span>
                            </button>

                            <div v-if="isAffiliationsPopoverOpenFor(Number(agency.id))" class="affiliations-popover">
                              <div class="affiliations-popover-title">
                                Schools &amp; other orgs under {{ agency.name }}
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
                                      v-if="isSchoolOrProgramOrg(org)"
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
                          title="Optional per-organization login email alias. This email can be used to log into the same account under this organization."
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
                          v-if="canEditUser && canShowPrelicensedSupervision"
                          class="agency-item-row"
                          style="flex-wrap: wrap;"
                          title="Prelicensed supervision tracking is per-organization. Baseline hours are added to accrued payroll supervision hours (99414/99416). Pay for 99414/99416 is $0 until the user has already reached ≥50 individual and ≥100 total hours in prior pay periods."
                        >
                          <span class="muted" style="font-size: 12px; font-weight: 700;">Prelicensed</span>
                          <label class="muted" style="display:flex; align-items:center; gap: 6px;">
                            <input
                              type="checkbox"
                              :checked="isPrelicensedForAgency(agency)"
                              :disabled="updatingPrelicensedAgencyId === agency.id"
                              @change="savePrelicensedSettings(agency, { isPrelicensed: $event.target.checked })"
                            />
                            <span>{{ isPrelicensedForAgency(agency) ? 'On' : 'Off' }}</span>
                          </label>
                          <input
                            v-if="isPrelicensedForAgency(agency)"
                            type="date"
                            class="agency-select"
                            style="min-width: 155px;"
                            :value="prelicensedStartDateForAgency(agency)"
                            :disabled="updatingPrelicensedAgencyId === agency.id"
                            @change="savePrelicensedSettings(agency, { startDate: $event.target.value })"
                          />
                          <input
                            v-if="isPrelicensedForAgency(agency)"
                            type="number"
                            step="0.01"
                            min="0"
                            class="agency-select"
                            style="min-width: 130px;"
                            placeholder="Ind start"
                            :value="prelicensedStartIndHoursForAgency(agency)"
                            :disabled="updatingPrelicensedAgencyId === agency.id"
                            @change="savePrelicensedSettings(agency, { startIndividualHours: $event.target.value })"
                          />
                          <input
                            v-if="isPrelicensedForAgency(agency)"
                            type="number"
                            step="0.01"
                            min="0"
                            class="agency-select"
                            style="min-width: 130px;"
                            placeholder="Grp start"
                            :value="prelicensedStartGrpHoursForAgency(agency)"
                            :disabled="updatingPrelicensedAgencyId === agency.id"
                            @change="savePrelicensedSettings(agency, { startGroupHours: $event.target.value })"
                          />
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
                              v-if="isSchoolOrProgramOrg(org)"
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

              <div class="admin-tools-section">
                <h3>Admin Tools</h3>
                <div class="additional-account-info">
                  <div v-if="accountInfoLoading" class="loading">Loading account information...</div>
                  <div v-else-if="accountInfoError" class="error">{{ accountInfoError }}</div>
                  <div v-else>
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
              </div>
            </div>
          </div>
            
            <div class="section-divider">
              <h3>Status Management</h3>
            </div>
            
            <div class="password-status-layout">
              <div v-if="!canUsePasswordResetActions" class="reset-password-section">
                <h4>Password Access</h4>
                <p>This user’s organization requires Google sign-in. Password reset links and temporary passwords are disabled for this user.</p>
              </div>

              <template v-else>
                <!-- Reset Password Link (expires) -->
                <div class="reset-password-section">
                  <h4>Password Reset Link</h4>
                  <p>Generate a reset link (expires). The user will set a new password and continue.</p>
                  <button
                    @click="generateResetPasswordLink"
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="generatingResetLink"
                  >
                    {{ generatingResetLink ? 'Generating...' : 'Send Reset Password Link' }}
                  </button>
                </div>

                <!-- Temporary Password (first-login only) -->
                <div v-if="canUseTempPassword" class="reset-password-section">
                  <h4>Temporary Password</h4>
                  <p>Generate an expiring temporary password. Send the username + temporary password to the user. After login, they will be prompted to set a new password.</p>
                  <button
                    @click="generateTemporaryPasswordForUser"
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="generatingTempPassword"
                  >
                    {{ generatingTempPassword ? 'Generating...' : 'Generate Temporary Password' }}
                  </button>
                </div>
              </template>
              
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
                    v-if="(user.status === 'PENDING_SETUP' || user.status === 'ONBOARDING' || user.status === 'PREHIRE_OPEN' || user.status === 'PREHIRE_REVIEW' || user.status === 'pending' || user.status === 'active') && (authStore.user?.role === 'admin' || authStore.user?.role === 'super_admin' || authStore.user?.role === 'support') && authStore.user?.role !== 'clinical_practice_assistant' && !isSupervisor(authStore.user)"
                    @click="markComplete" 
                    class="btn btn-success btn-sm"
                    :disabled="updatingStatus"
                  >
                    {{ updatingStatus ? 'Processing...' : 'Mark Active' }}
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
        </div>

        <div v-if="activeTab === 'additional'" class="tab-panel">
          <h2>Additional</h2>

          <div class="section-divider">
            <h3>Supervisor Assignments</h3>
          </div>

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
                    <span v-if="supervisor.is_primary" class="primary-pill">Primary</span>
                  </span>
                  <small style="color: var(--text-secondary);">{{ supervisor.supervisor_email }}</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'provider_info'" class="tab-panel">
          <ProviderInfoTab :userId="userId" />

          <div class="section-divider" style="margin-top: 18px;">
            <h3>Agency (Bulk Import) Information</h3>
          </div>
          <UserInformationTab :userId="userId" />
        </div>

        <div v-if="activeTab === 'school_affiliation'" class="tab-panel">
          <h2>School Affiliation</h2>
          <p class="hint" style="margin-top: -6px;">
            Configure provider availability for schools/programs: global Open/Closed, per-school override, and day/hour slots.
          </p>

          <div v-if="schoolAffiliationsLoading" class="loading">Loading affiliations…</div>
          <div v-else-if="schoolAffiliationsError" class="error">{{ schoolAffiliationsError }}</div>
          <div v-else-if="schoolAffiliations.length === 0" class="empty-state">
            <p>No school/program affiliations found for this provider.</p>
          </div>
          <div v-else class="school-affiliation-panel">
            <div class="form-grid" style="grid-template-columns: minmax(240px, 1fr) minmax(240px, 1fr); gap: 12px;">
              <div class="form-group">
                <label>School / Program</label>
                <select v-model="selectedSchoolAffiliationId" :disabled="savingSchoolAffiliation">
                  <option value="">Select…</option>
                  <option v-for="o in schoolAffiliations" :key="o.id" :value="String(o.id)">
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

            <div v-if="selectedSchoolAffiliationId" style="margin-top: 14px;">
              <div class="form-group form-group-full">
                <label class="toggle-label">
                  <span>Open for this school even if globally closed</span>
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
                  When enabled, assignments can proceed for this school even if the provider is globally closed.
                </small>
              </div>

              <div class="card" style="margin-top: 12px;">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                  <h3 style="margin:0;">School bell schedule (reference)</h3>
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
                    <small class="form-help">Configured in the school’s Organization Settings → General.</small>
                  </div>
                </div>
              </div>

              <div class="card" style="margin-top: 12px;">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                  <h3 style="margin:0;">Provider School Info blurb</h3>
                  <button
                    class="btn btn-primary btn-sm"
                    type="button"
                    @click="saveProviderSchoolBlurb"
                    :disabled="!canEditUser || providerSchoolBlurbSaving || !selectedSchoolIsSchool"
                    :title="selectedSchoolIsSchool ? '' : 'This blurb is currently supported only for school organizations.'"
                  >
                    {{ providerSchoolBlurbSaving ? 'Saving…' : 'Save' }}
                  </button>
                </div>
                <div v-if="!selectedSchoolIsSchool" class="hint" style="margin-top: 8px;">
                  This blurb is currently supported only for <strong>school</strong> affiliations.
                </div>
                <div v-else-if="providerSchoolBlurbLoading" class="loading">Loading provider school info…</div>
                <div v-else-if="providerSchoolBlurbError" class="error">{{ providerSchoolBlurbError }}</div>
                <div v-else class="form-group form-group-full" style="margin-top: 10px;">
                  <label>Provider School Info blurb</label>
                  <textarea
                    v-model="providerSchoolBlurb"
                    rows="4"
                    placeholder="Short blurb shown in the school portal provider profile."
                    :disabled="!canEditUser || providerSchoolBlurbSaving"
                    style="width: 100%;"
                  />
                  <small class="form-help">
                    Shown in the school portal under “Provider info”. Keep this non-PHI.
                  </small>
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
            @update:weekStartYmd="(v) => { scheduleWeekStartYmd = v; }"
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
        />

        <UserAdminDocsTab
          v-if="activeTab === 'admin_docs'"
          :userId="userId"
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
            <small>This link expires (default: 48 hours).</small>
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
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { isSupervisor } from '../../utils/helpers.js';
import UserTrainingTab from '../../components/admin/UserTrainingTab.vue';
import UserDocumentsTab from '../../components/admin/UserDocumentsTab.vue';
import UserInformationTab from '../../components/admin/UserInformationTab.vue';
import ProviderInfoTab from '../../components/admin/ProviderInfoTab.vue';
import UserCommunicationsTab from '../../components/admin/UserCommunicationsTab.vue';
import UserAdminDocsTab from '../../components/admin/UserAdminDocsTab.vue';
import UserActivityLogTab from '../../components/admin/UserActivityLogTab.vue';
import UserPayrollTab from '../../components/admin/UserPayrollTab.vue';
import SupervisorAssignmentManager from '../../components/admin/SupervisorAssignmentManager.vue';
import MovePendingToActiveModal from '../../components/admin/MovePendingToActiveModal.vue';
import UserPreferencesHub from '../../components/UserPreferencesHub.vue';
import ScheduleAvailabilityGrid from '../../components/schedule/ScheduleAvailabilityGrid.vue';

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

const profilePhotoInput = ref(null);
const photoUploading = ref(false);
const photoError = ref('');

const uploadsBase = computed(() => {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return baseURL.replace('/api', '') || 'http://localhost:3000';
});

const headerPhotoUrl = computed(() => {
  const rel = user.value?.profile_photo_url || null;
  if (!rel) return null;
  return `${uploadsBase.value}${String(rel).startsWith('/') ? rel : `/${rel}`}`;
});

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
  // Keep School Affiliation gated below by the same flag, but always show Provider Info so admins
  // can view/edit imported profile fields for any user.
  return true;
});

const isViewingSchoolStaff = computed(() => {
  const r = String(user.value?.role || accountForm.value?.role || '').trim().toLowerCase();
  return r === 'school_staff';
});

const canViewSchoolAffiliation = computed(() => {
  const u = user.value;
  if (!u) return false;
  const role = String(u.role || '').toLowerCase();
  const hasProviderAccess =
    u.has_provider_access === true ||
    u.has_provider_access === 1 ||
    u.has_provider_access === '1' ||
    u.hasProviderAccess === true;
  return role === 'provider' || role === 'admin' || role === 'super_admin' || role === 'clinical_practice_assistant' || hasProviderAccess;
});

const supervisees = ref([]);
const supervisors = ref([]);
const superviseesLoading = ref(false);
const supervisorsLoading = ref(false);

const tabs = computed(() => {
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
    { id: 'account', label: 'Account' },
    { id: 'additional', label: 'Additional' },
    ...(canViewProviderInfo.value ? [{ id: 'provider_info', label: 'Provider Info' }] : []),
    ...(canViewSchoolAffiliation.value ? [{ id: 'school_affiliation', label: 'School Affiliation' }] : []),
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
  
  if (canViewActivityLog.value) {
    baseTabs.push({ id: 'activity', label: 'Activity Log' });
  }
  
  return baseTabs;
});

// If the current tab becomes unavailable (e.g., switching to a school_staff user), normalize back to Account.
watch(
  tabs,
  (t) => {
    const allowed = new Set((t || []).map((x) => x.id));
    if (!allowed.has(String(activeTab.value || ''))) activeTab.value = 'account';
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
  skillBuilderEligible: false,
  externalBusyIcsUrl: '',
  role: '',
  credential: '',
  hasSupervisorPrivileges: false,
  hasProviderAccess: false,
  hasStaffAccess: false
});

// School affiliation (provider scheduling / availability)
const schoolAffiliationsLoading = ref(false);
const schoolAffiliationsError = ref('');
const schoolAffiliations = ref([]);
const selectedSchoolAffiliationId = ref('');

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

// Provider school info blurb (per provider per school org)
const providerSchoolBlurb = ref('');
const providerSchoolBlurbLoading = ref(false);
const providerSchoolBlurbSaving = ref(false);
const providerSchoolBlurbError = ref('');

const showGlobalAvailabilityInHeader = computed(() => {
  const r = String(user.value?.role || accountForm.value?.role || '').trim().toLowerCase();
  const isProviderLike = r === 'provider' || r === 'intern' || r === 'facilitator' || r === 'supervisor';
  return !!user.value && isProviderLike;
});

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

const EHR_DEFAULT_CALENDAR_LABEL = 'EHR';

const ehrCalendar = computed(() => {
  const list = Array.isArray(externalCalendars.value) ? externalCalendars.value : [];
  return list.find((c) => String(c?.label || '').trim().toLowerCase() === EHR_DEFAULT_CALENDAR_LABEL.toLowerCase()) || null;
});

const syncEhrIcsFromCalendars = () => {
  const cal = ehrCalendar.value;
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
    // Keep the simple EHR ICS field in sync with loaded calendars.
    if (!ehrIcsSaving.value) syncEhrIcsFromCalendars();
  } catch (e) {
    externalCalendars.value = [];
    externalCalendarsError.value = e.response?.data?.error?.message || 'Failed to load external calendars';
    if (!ehrIcsSaving.value) ehrIcsUrl.value = '';
  } finally {
    externalCalendarsLoading.value = false;
  }
};

const saveEhrIcsUrl = async () => {
  if (!canEditExternalBusyIcsUrl.value) return;
  const url = String(ehrIcsUrl.value || '').trim();
  try {
    ehrIcsSaving.value = true;
    ehrIcsError.value = '';

    // Ensure calendars are loaded so we can find existing EHR feed(s).
    if (!externalCalendarsLoading.value && (!Array.isArray(externalCalendars.value) || externalCalendars.value.length === 0)) {
      await loadExternalCalendars();
    }

    let cal = ehrCalendar.value;
    let calendarId = Number(cal?.id || 0);

    if (!calendarId && url) {
      const created = await api.post(`/users/${userId.value}/external-calendars`, { label: EHR_DEFAULT_CALENDAR_LABEL });
      calendarId = Number(created.data?.calendar?.id || 0);
      await loadExternalCalendars();
      cal = ehrCalendar.value;
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
      // Blank URL means disable all feeds for the EHR calendar.
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
    const nextCal = ehrCalendar.value;
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
    if (!selectedSchoolAffiliationId.value && schoolAffiliations.value.length > 0) {
      selectedSchoolAffiliationId.value = String(schoolAffiliations.value[0].id);
    }
  } catch (e) {
    schoolAffiliationsError.value = e.response?.data?.error?.message || 'Failed to load affiliations';
    schoolAffiliations.value = [];
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

const loadProviderSchoolBlurb = async () => {
  if (!selectedSchoolAffiliationId.value) return;
  if (!selectedSchoolIsSchool.value) {
    providerSchoolBlurb.value = '';
    providerSchoolBlurbError.value = '';
    return;
  }
  try {
    providerSchoolBlurbLoading.value = true;
    providerSchoolBlurbError.value = '';
    const r = await api.get(`/school-portal/${selectedSchoolAffiliationId.value}/providers/${userId.value}/profile`);
    providerSchoolBlurb.value = String(r.data?.school_info_blurb || '');
  } catch (e) {
    providerSchoolBlurbError.value = e.response?.data?.error?.message || 'Failed to load provider school info';
    providerSchoolBlurb.value = '';
  } finally {
    providerSchoolBlurbLoading.value = false;
  }
};

const saveProviderSchoolBlurb = async () => {
  if (!selectedSchoolAffiliationId.value) return;
  if (!selectedSchoolIsSchool.value) return;
  try {
    providerSchoolBlurbSaving.value = true;
    providerSchoolBlurbError.value = '';
    await api.put(`/school-portal/${selectedSchoolAffiliationId.value}/providers/${userId.value}/profile`, {
      school_info_blurb: providerSchoolBlurb.value
    });
    await loadProviderSchoolBlurb();
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

// Provider credential (classification) stored in user_info_values (field_key: provider_credential)
const providerCredentialFieldId = ref(null);
const providerCredentialLoaded = ref(false);

const isEditingAccount = ref(false);

const startEditAccount = () => {
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
  const eligibleRoles = ['provider', 'admin', 'super_admin', 'clinical_practice_assistant'];
  return eligibleRoles.includes(role);
});

// Watch for role changes to reset supervisor privileges if role becomes ineligible
watch(() => accountForm.value.role, (newRole) => {
  const eligibleRoles = ['provider', 'admin', 'super_admin', 'clinical_practice_assistant'];
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

watch(activeTab, async (t) => {
  if (t === 'school_affiliation') {
    if (!canViewSchoolAffiliation.value) return;
    await loadSchoolAffiliations();
    await loadSchoolAssignments();
    await loadProviderSchoolBlurb();
  }
});

watch(selectedSchoolAffiliationId, async () => {
  await loadSchoolAssignments();
  await loadProviderSchoolBlurb();
});

const showTempPasswordModal = ref(false);
const generatingTempPassword = ref(false);
const temporaryPassword = ref('');
const temporaryPasswordExpiresAt = ref('');
const tempPasswordInput = ref(null);
const tempUsernameInput = ref(null);

const userAgencies = ref([]);
const availableAgencies = ref([]);
const selectedAgencyId = ref('');
const assigningAgency = ref(false);

const orgTypeFor = (org) => String(org?.organization_type || 'agency').toLowerCase();
const isAgencyOrg = (org) => orgTypeFor(org) === 'agency';
const isSchoolOrProgramOrg = (org) => !isAgencyOrg(org);

// Compact affiliations display on User Profile:
// - show agencies in the main list
// - show schools/programs/etc in a small hover/click popover per agency
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

const availabilityAgencyId = computed(() => {
  const ids = (selectedScheduleAgencyIds.value || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  return ids[0] || Number(scheduleAgencyId.value || 0) || null;
});

const loadProviderWeekAvailability = async () => {
  const aid = availabilityAgencyId.value;
  if (!aid) return;
  try {
    availabilityLoading.value = true;
    availabilityError.value = '';
    const r = await api.get(`/availability/providers/${Number(userId)}/week`, {
      params: {
        agencyId: aid,
        weekStart: scheduleWeekStartYmd.value,
        includeGoogleBusy: 'true',
        slotMinutes: 60
      }
    });
    providerWeekAvailability.value = r.data || null;
  } catch (e) {
    providerWeekAvailability.value = null;
    availabilityError.value = e.response?.data?.error?.message || 'Failed to load availability';
  } finally {
    availabilityLoading.value = false;
  }
};

watch([showAvailability, scheduleWeekStartYmd, availabilityAgencyId], () => {
  if (!showAvailability.value) return;
  void loadProviderWeekAvailability();
}, { immediate: false });

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
  hasLoggedIn: false,
  neverLoggedIn: true,
  ssoEnabled: false,
  ssoRequired: false
});
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

const canRepairProviderSlots = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  // Explicitly NOT for school_staff (and not for providers acting on themselves here).
  return r === 'super_admin' || r === 'admin' || r === 'staff';
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

const systemPhoneNumberDisplay = computed(() => {
  const raw = user.value?.system_phone_number;
  const str = String(raw || '').trim();
  return str ? str : '—';
});


const fetchUser = async () => {
  try {
    loading.value = true;
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
    
    accountForm.value = {
      firstName: user.value.first_name || accountForm.value?.firstName || '',
      lastName: user.value.last_name || accountForm.value?.lastName || '',
      preferredName: user.value.preferred_name || accountForm.value?.preferredName || '',
      email: user.value.email || accountForm.value?.email || '',
      personalEmail: user.value.personal_email || accountForm.value?.personalEmail || '',
      title: user.value.title ?? accountForm.value?.title ?? '',
      serviceFocus: user.value.service_focus ?? accountForm.value?.serviceFocus ?? '',
      phoneNumber: user.value.phone_number || accountForm.value?.phoneNumber || '',
      personalPhone: user.value.personal_phone || accountForm.value?.personalPhone || '',
      workPhone: user.value.work_phone || accountForm.value?.workPhone || '',
      workPhoneExtension: user.value.work_phone_extension || accountForm.value?.workPhoneExtension || '',
      medcancelRateSchedule: ['low', 'high', 'none'].includes(currentMedcancelRateSchedule) ? currentMedcancelRateSchedule : 'none',
      companyCardEnabled: currentCompanyCardEnabled,
      skillBuilderEligible: user.value.skill_builder_eligible === true || user.value.skill_builder_eligible === 1 || user.value.skill_builder_eligible === '1' || false,
      externalBusyIcsUrl: String(user.value.external_busy_ics_url || '').trim(),
      role: currentRole,
      hasSupervisorPrivileges: currentHasSupervisorPrivileges || String(currentRoleRaw || '').trim().toLowerCase() === 'supervisor',
      credential: accountForm.value?.credential || '',
      hasProviderAccess: user.value.has_provider_access === true || user.value.has_provider_access === 1 || user.value.has_provider_access === '1' || false,
      hasStaffAccess: user.value.has_staff_access === true || user.value.has_staff_access === 1 || user.value.has_staff_access === '1' || false
    };
    
    // Render the page as soon as the base user record is loaded.
    // All other sections have their own loading states (or are best-effort), so don't block the profile UI.
    loading.value = false;

    // Kick off secondary requests in parallel (non-blocking).
    void Promise.allSettled([
      fetchUserAgencies(),
      fetchAvailableAgencies(),
      fetchAccountInfo(),
      fetchProviderCredential(),
      loadExternalCalendars()
    ]);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load user';
    console.error('Error fetching user:', err);
  } finally {
    loading.value = false;
  }
};

const fetchProviderCredential = async () => {
  try {
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
    if (!e || !e.includes('@')) {
      alert('Please enter a valid email address for the login alias.');
      return;
    }
    savingAgencyAliasId.value = aId;
    await api.post(`/users/${userId.value}/login-email-alias`, { agencyId: aId, email: e });
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
const isPrelicensedForAgency = (agency) => {
  const v = agency?.supervision_is_prelicensed;
  return v === true || v === 1 || v === '1';
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
  activeTab.value = 'school_affiliation';
  await nextTick();
  await loadSchoolAffiliations();
  selectedSchoolAffiliationId.value = String(id);
  await loadSchoolAssignments();
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
  if (!isEditingAccount.value) return;
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
  
  try {
    saving.value = true;
    const updateData = {
      email: accountForm.value.email,
      firstName: accountForm.value.firstName,
      lastName: accountForm.value.lastName,
      preferredName: accountForm.value.preferredName,
      personalEmail: accountForm.value.personalEmail,
      title: accountForm.value.title,
      serviceFocus: accountForm.value.serviceFocus,
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
      skillBuilderEligible: Boolean(accountForm.value.skillBuilderEligible),
      role: accountForm.value.role
    };

    // External busy ICS URL: admins/super admins only
    if (canEditExternalBusyIcsUrl.value) {
      updateData.externalBusyIcsUrl = String(accountForm.value.externalBusyIcsUrl || '').trim() || null;
    }
    
    // Include supervisor privileges if user has eligible role
    // Always include it if the toggle is visible (even if false) to ensure it's saved
    if (canToggleSupervisorPrivileges.value) {
      updateData.hasSupervisorPrivileges = Boolean(accountForm.value.hasSupervisorPrivileges);
      console.log('Sending supervisor privileges toggle:', updateData.hasSupervisorPrivileges, 'for user role:', accountForm.value.role);
    } else {
      console.log('Cannot toggle supervisor privileges - user role:', accountForm.value.role, 'canToggle:', canToggleSupervisorPrivileges.value);
    }
    
    // Include permission attributes for cross-role capabilities
    const providerAccessEligibleRoles = ['staff', 'support', 'admin', 'super_admin', 'clinical_practice_assistant'];
    if (providerAccessEligibleRoles.includes(accountForm.value.role)) {
      updateData.hasProviderAccess = Boolean(accountForm.value.hasProviderAccess);
    }
    if (accountForm.value.role === 'provider') {
      updateData.hasStaffAccess = Boolean(accountForm.value.hasStaffAccess);
    }
    
    console.log('Update data being sent:', updateData);
    pendingAccountUpdate.value = updateData;
    const response = await api.put(`/users/${userId.value}`, updateData);

    // Save credential (user info field) if present
    if (providerCredentialFieldId.value) {
      try {
        const v = String(accountForm.value.credential || '').trim();
        await api.put(`/users/${userId.value}/user-info/${providerCredentialFieldId.value}`, { value: v || null });
      } catch (e) {
        console.error('Failed to save credential:', e);
      }
    }

    // Always fetch fresh user data to ensure all fields are up to date
    await fetchUser();
    isEditingAccount.value = false;
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
};

// Reset password link (token-based) — shown for non-SSO users; expires (48h)
const showResetPasswordLinkModal = ref(false);
const generatingResetLink = ref(false);
const resetPasswordLink = ref('');
const resetLinkInput = ref(null);

const generateResetPasswordLink = async () => {
  try {
    generatingResetLink.value = true;
    const response = await api.post(`/users/${userId.value}/send-reset-password-link`);
    resetPasswordLink.value = response.data.tokenLink || '';
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
    // New status lifecycle
    'PENDING_SETUP': 'Pending Setup',
    'PREHIRE_OPEN': 'Pre-Hire',
    'PREHIRE_REVIEW': 'Ready for Review',
    'ONBOARDING': 'Onboarding',
    'ACTIVE_EMPLOYEE': 'Active',
    'TERMINATED_PENDING': 'Terminated (Grace Period)',
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
    'PENDING_SETUP': 'badge-warning',
    'PREHIRE_OPEN': 'badge-warning',
    'PREHIRE_REVIEW': 'badge-primary',
    'ONBOARDING': 'badge-info',
    'ACTIVE_EMPLOYEE': 'badge-success',
    'TERMINATED_PENDING': 'badge-danger',
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

const tabIds = computed(() => (tabs.value || []).map((t) => t.id));

const selectTab = (tabId) => {
  const id = String(tabId || '').trim();
  if (!id) return;
  if (!tabIds.value.includes(id)) return;
  // IMPORTANT: do not mutate the route from inside a tab click handler.
  // Writing to the router during a component update can trigger Vue's internal patch crashes
  // (nextSibling/subTree/emitsOptions) when the route update races with VDOM patching.
  activeTab.value = id;
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

onMounted(() => {
  fetchUser();
  void Promise.allSettled([fetchSupervisees(), fetchSupervisors()]);
});
</script>

<style scoped>
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
  grid-template-columns: minmax(520px, 2fr) minmax(320px, 1fr);
  gap: 32px;
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

.form-actions--sticky {
  position: sticky;
  top: 78px; /* sits below the global top nav */
  z-index: 50;
  margin: 0 0 16px 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 24px rgba(0,0,0,0.10);
  backdrop-filter: blur(6px);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 780px) {
  .form-actions--sticky {
    top: 66px;
    justify-content: flex-start;
  }
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
</style>

