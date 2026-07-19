<template>
  <div class="acct-dashboard">
    <div class="acct-layout">
      <!-- ── Sidebar ─────────────────────────────────────────────── -->
      <aside class="acct-sidebar">
        <div class="acct-profile">
          <div class="acct-avatar-wrap">
            <img v-if="photoUrl" :src="photoUrl" alt="" class="acct-avatar" />
            <div v-else class="acct-avatar acct-avatar--placeholder">{{ initials }}</div>
          </div>
          <div class="acct-profile-name">{{ displayName }}</div>
          <div class="acct-profile-meta">{{ roleLabel }}</div>
          <div v-if="credentialLabel" class="acct-profile-meta">{{ credentialLabel }}</div>
          <span :class="['acct-status-pill', statusPillClass]">{{ statusLabel }}</span>
          <button
            v-if="canEditUser"
            type="button"
            class="acct-upload-btn"
            :disabled="photoUploading"
            @click="ctx.triggerPhotoUpload?.()"
          >
            {{ photoUploading ? 'Uploading…' : 'Upload Photo' }}
          </button>
        </div>

        <nav class="acct-nav">
          <button
            v-for="item in navItems"
            :key="item.id"
            type="button"
            class="acct-nav-item"
            :class="{ 'acct-nav-item--active': activeNav === item.id }"
            @click="scrollToSection(item.id)"
          >
            {{ item.label }}
          </button>
        </nav>

        <div class="acct-sidebar-block">
          <div class="acct-sidebar-block-title">Quick Actions</div>
          <button type="button" class="acct-qa" @click="scrollToSection('account-info')">Edit Profile</button>
          <button type="button" class="acct-qa" @click="scrollToSection('workspace-security')">Reset Password</button>
          <button type="button" class="acct-qa" @click="ctx.navigate?.('payroll')">Log Time Manually</button>
          <button type="button" class="acct-qa" @click="ctx.navigate?.('documents')">Upload Document</button>
          <button type="button" class="acct-qa" @click="ctx.navigate?.('communications')">Send Message</button>
        </div>

        <div v-if="completionPct != null" class="acct-completion">
          <div class="acct-completion-head">
            <span>Profile completion</span>
            <strong>{{ completionPct }}%</strong>
          </div>
          <div class="acct-completion-bar">
            <div class="acct-completion-fill" :style="{ width: `${completionPct}%` }" />
          </div>
        </div>
      </aside>

      <!-- ── Main ────────────────────────────────────────────────── -->
      <main class="acct-main">
        <slot name="view-only" />

        <!-- Summary row -->
        <div class="acct-summary-row">
          <div class="acct-summary-card">
            <div class="acct-summary-label">Account Snapshot</div>
            <dl class="acct-summary-dl">
              <div><dt>Employee ID</dt><dd>{{ employeeId }}</dd></div>
              <div><dt>Hire Date</dt><dd>{{ fmtDate(hireDate) }}</dd></div>
              <div><dt>Manager</dt><dd>{{ managerName || '—' }}</dd></div>
              <div><dt>Supervisor</dt><dd>{{ supervisorName || '—' }}</dd></div>
            </dl>
          </div>

          <div class="acct-summary-card">
            <div class="acct-summary-label">Status Overview</div>
            <dl class="acct-summary-dl">
              <div>
                <dt>Employee Status</dt>
                <dd><span :class="['acct-status-pill', 'acct-status-pill--sm', statusPillClass]">{{ statusLabel }}</span></dd>
              </div>
              <div><dt>Active Since</dt><dd>{{ fmtDate(activeSince) }}</dd></div>
              <div><dt>Offboarding</dt><dd>{{ offboardingStatus }}</dd></div>
            </dl>
          </div>

          <div class="acct-summary-card acct-summary-card--clinical">
            <div class="acct-summary-head">
              <div class="acct-summary-label">Clinical Snapshot</div>
              <button type="button" class="acct-link-btn" @click="ctx.navigate?.('provider_info')">
                View Clinical Information
              </button>
            </div>
            <dl class="acct-summary-dl">
              <div><dt>Primary Modality</dt><dd>{{ clinicalSnapshot.primaryModality || '—' }}</dd></div>
              <div><dt>Population Focus</dt><dd>{{ clinicalSnapshot.populationFocus || '—' }}</dd></div>
              <div><dt>Age Range</dt><dd>{{ clinicalSnapshot.ageRange || '—' }}</dd></div>
              <div><dt>Session Length</dt><dd>{{ clinicalSnapshot.sessionLength || '—' }}</dd></div>
              <div><dt>Typical Caseload</dt><dd>{{ clinicalSnapshot.caseload || '—' }}</dd></div>
            </dl>
          </div>
        </div>

        <!-- Cards -->
        <div class="acct-cards">
          <!-- Account Information -->
          <AccountDashboardCard
            section-id="account-info"
            title="Account Information"
            :can-edit="canEditUser"
            :editing="isEditing('account-info')"
            :saving="saving"
            @edit="startEdit('account-info')"
            @save="saveCard"
            @cancel="cancelEdit"
          >
            <div class="acct-field-grid">
              <template v-if="!isEditing('account-info')">
                <div class="acct-field"><span class="acct-field-label">First Name</span><span class="acct-field-value">{{ form.firstName || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Last Name</span><span class="acct-field-value">{{ form.lastName || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Preferred Name</span><span class="acct-field-value">{{ form.preferredName || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Login Email</span><span class="acct-field-value">{{ form.email || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Personal Email</span><span class="acct-field-value">{{ form.personalEmail || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Title</span><span class="acct-field-value">{{ form.title || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Service Focus</span><span class="acct-field-value">{{ form.serviceFocus || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Languages Spoken</span><span class="acct-field-value">{{ form.languagesSpoken || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Personal Phone</span><span class="acct-field-value">{{ form.personalPhone || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Work Phone</span><span class="acct-field-value">{{ form.workPhone || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Extension</span><span class="acct-field-value">{{ form.workPhoneExtension || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Role</span><span class="acct-field-value">{{ roleLabel }}</span></div>
                <div v-if="isProviderRole" class="acct-field acct-field--full">
                  <span class="acct-field-label">Practice categories</span>
                  <span class="acct-field-value">{{ practiceCategoriesDisplay }}</span>
                </div>
              </template>
              <template v-else>
                <div class="acct-field acct-field--edit"><label>First Name</label><input v-model="form.firstName" type="text" /></div>
                <div class="acct-field acct-field--edit"><label>Last Name</label><input v-model="form.lastName" type="text" /></div>
                <div class="acct-field acct-field--edit"><label>Preferred Name</label><input v-model="form.preferredName" type="text" /></div>
                <div class="acct-field acct-field--edit"><label>Login Email</label><input v-model="form.email" type="email" /></div>
                <div class="acct-field acct-field--edit"><label>Personal Email</label><input v-model="form.personalEmail" type="email" /></div>
                <div class="acct-field acct-field--edit"><label>Title</label><input v-model="form.title" type="text" /></div>
                <div class="acct-field acct-field--edit"><label>Service Focus</label><input v-model="form.serviceFocus" type="text" /></div>
                <div class="acct-field acct-field--edit"><label>Languages Spoken</label><input v-model="form.languagesSpoken" type="text" /></div>
                <div class="acct-field acct-field--edit"><label>Personal Phone</label><input v-model="form.personalPhone" type="tel" /></div>
                <div class="acct-field acct-field--edit"><label>Work Phone</label><input v-model="form.workPhone" type="tel" /></div>
                <div class="acct-field acct-field--edit"><label>Extension</label><input v-model="form.workPhoneExtension" type="text" /></div>
                <div class="acct-field acct-field--edit acct-field--full">
                  <label>Role</label>
                  <select v-model="form.role" :disabled="!unwrap(ctx.canChangeRole)">
                    <option v-if="unwrap(ctx.canAssignSuperAdmin)" value="super_admin">Super Admin</option>
                    <option v-if="unwrap(ctx.canAssignAdmin)" value="admin">Admin</option>
                    <option v-if="unwrap(ctx.canAssignSupport)" value="support">Staff (Admin Tools)</option>
                    <option v-if="unwrap(ctx.canAssignAssistantAdmin)" value="assistant_admin">Assistant Admin</option>
                    <option value="clinical_practice_assistant">Clinical Practice Assistant</option>
                    <option value="provider_plus">Provider Plus</option>
                    <option value="staff">Staff</option>
                    <option value="provider">Provider</option>
                    <option value="school_staff">School Staff</option>
                    <option value="client_guardian">Guardian (Client Portal)</option>
                  </select>
                  <p
                    v-if="isProviderRole && !practiceCategoryOptions.length && practiceCategoryAgencyId"
                    class="acct-field-hint"
                  >
                    {{ practiceCategoriesEmptyHint }}
                  </p>
                </div>
                <div
                  v-if="isProviderRole && (practiceCategoryAgencyOptions.length > 1 || practiceCategoryAgencyId)"
                  class="acct-field acct-field--edit acct-field--full"
                >
                  <label v-if="practiceCategoryAgencyOptions.length > 1">Practice categories for</label>
                  <label v-else>Practice categories</label>
                  <select
                    v-if="practiceCategoryAgencyOptions.length > 1"
                    v-model.number="practiceCategoryAgencyId"
                    class="acct-practice-agency-select"
                    @change="loadPracticeCategories"
                  >
                    <option
                      v-for="org in practiceCategoryAgencyOptions"
                      :key="org.id"
                      :value="org.id"
                    >
                      {{ org.name || org.slug || `Agency ${org.id}` }}
                    </option>
                  </select>
                </div>
                <div
                  v-if="isProviderRole && practiceCategoryOptions.length"
                  class="acct-field acct-field--edit acct-field--full"
                >
                  <label>Practice categories</label>
                  <p v-if="practiceCategoryAgencyOptions.length <= 1" class="acct-field-hint acct-field-hint--tight">
                    For {{ practiceCategoryAgencyName }} — choose what this provider delivers.
                  </p>
                  <div class="acct-practice-cats">
                    <label
                      v-for="opt in practiceCategoryOptions"
                      :key="opt.code"
                      class="acct-practice-cat"
                    >
                      <input
                        type="checkbox"
                        :checked="selectedPracticeCategories.includes(opt.code)"
                        :disabled="practiceCategoriesSaving"
                        @change="togglePracticeCategory(opt.code, $event.target.checked)"
                      />
                      <span>{{ opt.label }}</span>
                    </label>
                  </div>
                  <p v-if="practiceCategoriesError" class="acct-field-error">{{ practiceCategoriesError }}</p>
                  <p v-else-if="practiceCategoriesSaved" class="acct-field-ok">Practice categories saved.</p>
                </div>
              </template>
            </div>
            <div v-if="!isEditing('account-info') && canEditUser" class="acct-field acct-field--full" style="margin-top: 4px;">
              <button type="button" class="acct-link-btn" @click="ctx.openExternalCalendarsModal?.()">
                Manage external calendars (ICS)
              </button>
            </div>
          </AccountDashboardCard>

          <!-- Professional Details -->
          <AccountDashboardCard
            section-id="professional-details"
            title="Professional Details"
            subtitle="Education and experience from the clinical profile."
            :can-edit="false"
          >
            <div class="acct-field-grid">
              <div class="acct-field acct-field--full">
                <span class="acct-field-label">Education</span>
                <span class="acct-field-value acct-field-value--block">{{ professionalDetails.education || '—' }}</span>
              </div>
              <div class="acct-field acct-field--full">
                <span class="acct-field-label">Work Experience</span>
                <span class="acct-field-value acct-field-value--block">{{ professionalDetails.workExperience || '—' }}</span>
              </div>
              <div class="acct-field">
                <span class="acct-field-label">Additional Certifications</span>
                <span class="acct-field-value">{{ professionalDetails.certifications || '—' }}</span>
              </div>
              <div class="acct-field">
                <span class="acct-field-label">Years of Experience</span>
                <span class="acct-field-value">{{ professionalDetails.yearsExperience || '—' }}</span>
              </div>
            </div>
            <button type="button" class="acct-link-btn" style="margin-top: 12px;" @click="ctx.navigate?.('provider_info')">
              Edit in Clinical Profile
            </button>
          </AccountDashboardCard>

          <!-- Home Address -->
          <AccountDashboardCard
            section-id="home-address"
            title="Home Address"
            subtitle="Used for School Mileage auto-calculation."
            :can-edit="canEditUser"
            :editing="isEditing('home-address')"
            :saving="saving"
            @edit="startEdit('home-address')"
            @save="saveCard"
            @cancel="cancelEdit"
          >
            <div class="acct-field-grid">
              <template v-if="!isEditing('home-address')">
                <div class="acct-field acct-field--full"><span class="acct-field-label">Street</span><span class="acct-field-value">{{ form.homeStreetAddress || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Apt / Unit</span><span class="acct-field-value">{{ form.homeAddressLine2 || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">City</span><span class="acct-field-value">{{ form.homeCity || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">State</span><span class="acct-field-value">{{ form.homeState || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Postal Code</span><span class="acct-field-value">{{ form.homePostalCode || '—' }}</span></div>
              </template>
              <template v-else>
                <div class="acct-field acct-field--edit acct-field--full"><label>Street</label><input v-model="form.homeStreetAddress" type="text" /></div>
                <div class="acct-field acct-field--edit"><label>Apt / Unit</label><input v-model="form.homeAddressLine2" type="text" /></div>
                <div class="acct-field acct-field--edit"><label>City</label><input v-model="form.homeCity" type="text" /></div>
                <div class="acct-field acct-field--edit"><label>State</label><input v-model="form.homeState" type="text" /></div>
                <div class="acct-field acct-field--edit"><label>Postal Code</label><input v-model="form.homePostalCode" type="text" /></div>
              </template>
            </div>
          </AccountDashboardCard>

          <!-- Licenses -->
          <AccountDashboardCard
            section-id="licenses"
            title="Licenses & Certifications"
            :can-edit="canEditUser"
            :editing="isEditing('licenses')"
            :saving="saving || licenseUploading"
            @edit="startEdit('licenses')"
            @save="saveCard"
            @cancel="cancelEdit"
          >
            <div v-if="license.hasDetails" class="acct-license-active">
              <div class="acct-license-active-head">
                <strong>Active License</strong>
                <span v-if="isFullyLicensed" class="acct-license-eligible-badge">Insurance credentialing eligible</span>
              </div>
              <dl class="acct-field-grid">
                <div class="acct-field"><span class="acct-field-label">License Type & Number</span><span class="acct-field-value">{{ license.typeNumber || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Date Issued</span><span class="acct-field-value">{{ license.issuedDate || '—' }}</span></div>
                <div class="acct-field"><span class="acct-field-label">Expiration</span><span class="acct-field-value">{{ license.expirationDate || '—' }}</span></div>
              </dl>
            </div>
            <div v-else class="acct-empty">
              No practicing license on file yet.
              <span v-if="isFullyLicensed" class="acct-license-eligible-badge" style="display:block; margin-top: 4px;">Credential marks as insurance credentialing eligible</span>
            </div>

            <div class="acct-license-upload-row">
              <div class="acct-license-upload-status">
                <template v-if="license.uploadUrl">
                  <a :href="license.uploadUrl" target="_blank" rel="noopener" class="acct-link-btn">View license PDF</a>
                  <span v-if="license.uploadedAt" class="acct-license-uploaded-at">Uploaded {{ license.uploadedAt }}</span>
                </template>
                <span v-else class="acct-license-missing">No license PDF uploaded</span>
              </div>
              <div v-if="canEditUser" class="acct-license-upload-actions">
                <input
                  ref="licenseFileInput"
                  type="file"
                  accept=".pdf,application/pdf"
                  style="display:none"
                  @change="onLicenseFileSelected"
                />
                <button
                  type="button"
                  class="acct-btn acct-btn--primary"
                  :disabled="licenseUploading"
                  @click="licenseFileInput?.click()"
                >
                  {{ licenseUploading ? 'Uploading…' : (license.uploadUrl ? 'Replace PDF' : 'Upload license PDF') }}
                </button>
              </div>
            </div>
            <p v-if="licenseUploadError" class="acct-license-upload-error">{{ licenseUploadError }}</p>
            <p v-if="licenseUploadSuccess" class="acct-license-upload-success">{{ licenseUploadSuccess }}</p>

            <div v-if="isEditing('licenses')" class="acct-field acct-field--edit acct-field--full" style="margin-top: 12px;">
              <label>Credential (display)</label>
              <input v-model="form.credential" type="text" placeholder="e.g. LPCC, LCSW" />
            </div>
            <div v-else-if="form.credential" class="acct-field" style="margin-top: 12px;">
              <span class="acct-field-label">Credential</span>
              <span class="acct-field-value">{{ form.credential }}</span>
            </div>
          </AccountDashboardCard>

          <!-- Compensation Level -->
          <AccountDashboardCard
            section-id="compensation-level"
            title="Compensation Level"
            subtitle="Categorize this provider for payroll. Select Bypass to preserve their existing rates."
            :can-edit="false"
          >
            <template #actions>
              <button type="button" class="acct-btn acct-btn--ghost" @click="loadCompLevel" :disabled="compLoading">
                {{ compLoading ? 'Loading…' : 'Refresh' }}
              </button>
            </template>

            <div v-if="compError" class="comp-error">{{ compError }}</div>
            <div v-if="compSuccess" class="comp-success">Saved.</div>

            <div v-if="compLoading && !compAssignment" class="comp-muted">Loading…</div>

            <!-- Current state badge -->
            <div v-if="compAssignment" class="comp-badge-row">
              <span class="comp-badge-cat">{{ compCategoryLabel(compAssignment.category) }}</span>
              <span class="comp-badge-sep">/</span>
              <span v-if="compAssignment.bypass" class="comp-badge-bypass">Bypass</span>
              <span v-else class="comp-badge-level">
                Level {{ compAssignment.level }}
                <em v-if="compAssignment.label" class="comp-badge-name">— {{ compAssignment.label }}</em>
              </span>
            </div>
            <div v-else-if="!compLoading" class="comp-muted">Not yet assigned — defaulting to Bypass.</div>

            <!-- Assignment form -->
            <div class="comp-form-row">
              <div class="comp-field">
                <label class="comp-label">Category</label>
                <select v-model.number="compDraft.category" class="comp-select">
                  <option :value="null">Select category…</option>
                  <option v-for="(cat, key) in COMP_CATEGORIES" :key="key" :value="Number(key)">
                    {{ compCategoryLabel(Number(key)) }} — {{ cat.description }}
                  </option>
                </select>
              </div>
              <div class="comp-field" v-if="compDraft.category">
                <label class="comp-label">Level</label>
                <select v-model="compDraft.levelKey" class="comp-select">
                  <option value="bypass">Bypass — Keep existing rates</option>
                  <option v-for="n in 5" :key="n" :value="String(n)">Compensation Level {{ n }}</option>
                </select>
              </div>
              <button
                v-if="compDraft.category"
                type="button"
                class="acct-btn acct-btn--primary comp-save-btn"
                :disabled="compSaving"
                @click="saveCompLevel"
              >
                {{ compSaving ? 'Saving…' : 'Save Assignment' }}
              </button>
            </div>
            <p v-if="compDraft.levelKey !== 'bypass' && compDraft.category" class="comp-hint">
              Rates for this level are applied from the Payroll tab.
            </p>
          </AccountDashboardCard>

          <!-- Service & Availability -->
          <AccountDashboardCard
            section-id="service-availability"
            title="Service & Availability Settings"
            subtitle="Clinical service settings and caseload preferences."
            :can-edit="false"
          >
            <div class="acct-field-grid">
              <div class="acct-field"><span class="acct-field-label">Service Settings</span><span class="acct-field-value">{{ serviceAvailability.settings || '—' }}</span></div>
              <div class="acct-field"><span class="acct-field-label">Session Length</span><span class="acct-field-value">{{ serviceAvailability.sessionLength || '—' }}</span></div>
              <div class="acct-field"><span class="acct-field-label">Typical Caseload</span><span class="acct-field-value">{{ serviceAvailability.caseload || '—' }}</span></div>
              <div class="acct-field"><span class="acct-field-label">School Days Preference</span><span class="acct-field-value">{{ serviceAvailability.schoolDays || '—' }}</span></div>
            </div>
            <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px;">
              <button type="button" class="acct-link-btn" @click="ctx.navigate?.('provider_info')">
                Edit clinical settings
              </button>
              <button type="button" class="acct-link-btn" @click="ctx.navigate?.('schedule_availability')">
                Open Schedule & Availability
              </button>
            </div>
          </AccountDashboardCard>

          <!-- Employment dates -->
          <AccountDashboardCard
            section-id="employment-dates"
            title="Employment & Key Dates"
            :can-edit="false"
          >
            <div class="acct-timeline">
              <div v-for="row in employmentRows" :key="row.label" class="acct-timeline-row">
                <span class="acct-timeline-label">{{ row.label }}</span>
                <span class="acct-timeline-value">{{ row.value }}</span>
              </div>
            </div>
            <button type="button" class="acct-link-btn" style="margin-top: 12px;" @click="ctx.navigate?.('lifecycle')">
              Open Lifecycle tab for full timeline
            </button>
          </AccountDashboardCard>

          <!-- Access & Permissions -->
          <AccountDashboardCard
            section-id="access-permissions"
            title="Access & Permissions"
            subtitle="System access, contracts, and operational flags. Benefits / Med Cancel live on the Benefits tab."
            :can-edit="canEditUser"
            :editing="isEditing('access-permissions')"
            :saving="saving"
            @edit="startEdit('access-permissions')"
            @save="saveCard"
            @cancel="cancelEdit"
          >
            <div class="acct-perm-groups">
              <div v-for="group in permissionGroups" :key="group.id" class="acct-perm-group">
                <div class="acct-perm-group-title">{{ group.label }}</div>
                <div class="acct-perm-list">
                  <label
                    v-for="item in group.items"
                    :key="item.key"
                    class="acct-perm-row"
                    :title="item.title"
                  >
                    <span>{{ item.label }}</span>
                    <template v-if="item.type === 'select'">
                      <select
                        v-model="form[item.key]"
                        class="acct-perm-select"
                        :disabled="!isEditing('access-permissions')"
                      >
                        <option v-for="opt in item.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                      </select>
                    </template>
                    <template v-else>
                      <input
                        type="checkbox"
                        v-model="form[item.key]"
                        :disabled="!isEditing('access-permissions') || item.disabled"
                      />
                    </template>
                  </label>
                </div>
              </div>
            </div>
          </AccountDashboardCard>

          <!-- Feature Access slot -->
          <div id="feature-access">
            <slot name="feature-access" :editing-card="editingCard" />
          </div>

          <!-- Supervisor Assignments slot -->
          <div id="supervisor-assignments">
            <slot name="supervisor-assignments" />
          </div>

          <!-- Agency Assignments slot -->
          <div id="agency-assignments">
            <slot name="agency-assignments" />
          </div>

          <!-- Building offices slot -->
          <div id="building-offices">
            <slot name="building-offices" />
          </div>

          <!-- Status Management slot -->
          <div id="status-management">
            <slot name="status-management" />
          </div>

          <!-- Workspace & Security slot -->
          <div id="workspace-security">
            <slot name="workspace-security" />
          </div>

          <!-- Public profile + admin tools slot -->
          <div id="public-profile">
            <slot name="public-profile" />
          </div>

          <!-- Admin notes slot -->
          <div id="admin-notes">
            <slot name="admin-notes" />
          </div>
        </div>

        <slot name="external-calendars-modal" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue';
import AccountDashboardCard from './AccountDashboardCard.vue';
import { USER_ACCOUNT_CONTEXT_KEY } from '../../../composables/userAccountContext.js';
import { formatSnapshotValue, formatClinicalFieldValue, findFieldByKeys } from '../../../utils/clinicalFieldDisplay.js';

const PRACTICE_CATEGORY_LABELS = {
  mental_health: 'Mental health',
  tutoring: 'Tutoring',
  coaching: 'Coaching',
  consulting: 'Consulting'
};

const ctx = inject(USER_ACCOUNT_CONTEXT_KEY, {});

const unwrap = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);

const editingCard = ref(null);
const clinicalFields = ref([]);
const activeNav = ref('account-info');
const licenseFileInput = ref(null);
const licenseUploading = ref(false);
const licenseUploadError = ref('');
const licenseUploadSuccess = ref('');

const form = computed(() => unwrap(ctx.accountForm) || {});
const user = computed(() => unwrap(ctx.user) || {});
const overview = computed(() => unwrap(ctx.overview) || null);
const canEditUser = computed(() => !!unwrap(ctx.canEditUser));
const saving = computed(() => !!unwrap(ctx.saving));
const isFullyLicensed = computed(() => !!unwrap(ctx.isFullyLicensedForCredentialing));
const licenseSummaryFromCtx = computed(() => unwrap(ctx.licenseCredentialSummary) || null);
const userId = computed(() => Number(unwrap(ctx.userId) || user.value?.id || 0) || 0);
const api = computed(() => ctx.api);

const license = computed(() => {
  const fromCtx = licenseSummaryFromCtx.value;
  const typeField = findFieldByKeys(fieldByKey.value, ['license_type_number', 'provider_credential_license_type_number']);
  const issuedField = findFieldByKeys(fieldByKey.value, ['license_issued', 'provider_credential_license_issued_date']);
  const expiresField = findFieldByKeys(fieldByKey.value, ['license_expires', 'provider_credential_license_expiration_date']);
  const typeNumber = fromCtx?.typeNumber || typeField?.value || form.value.credential || '';
  const issuedDate = fromCtx?.issuedDate || issuedField?.value || '';
  const expirationDate = fromCtx?.expirationDate || expiresField?.value || '';
  const uploadUrl = fromCtx?.uploadUrl || '';
  return {
    hasDetails: !!(typeNumber || issuedDate || expirationDate || uploadUrl || fromCtx?.hasDetails),
    typeNumber: String(typeNumber || ''),
    issuedDate: String(issuedDate || ''),
    expirationDate: String(expirationDate || ''),
    uploadUrl: String(uploadUrl || ''),
    uploadedAt: String(fromCtx?.uploadedAt || ''),
  };
});

const photoUploading = computed(() => !!unwrap(ctx.photoUploading));
const displayName = computed(() => unwrap(ctx.headerDisplayName) || 'User');
const photoUrl = computed(() => unwrap(ctx.headerPhotoUrl) || '');
const managerName = computed(() => unwrap(ctx.headerManagerName) || '');
const supervisorName = computed(() => unwrap(ctx.headerSupervisorName) || '');

const initials = computed(() => {
  const f = String(user.value?.first_name || '').trim()[0] || '';
  const l = String(user.value?.last_name || '').trim()[0] || '';
  return (f + l).toUpperCase() || '?';
});

const roleLabel = computed(() => {
  const r = String(form.value.role || user.value?.role || '').replace(/_/g, ' ');
  return r ? r.replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
});

const agencyId = computed(() => Number(unwrap(ctx.agencyId) || 0) || 0);
const userAgencies = computed(() => {
  const raw = unwrap(ctx.userAgencies);
  return Array.isArray(raw) ? raw : [];
});
const practiceCategoryAgencyId = ref(0);
const practiceCategoryAgencyOptions = computed(() => {
  const options = userAgencies.value.filter((org) => Number(org?.id || 0) > 0);
  const current = unwrap(ctx.currentAgency);
  const currentId = Number(current?.id || agencyId.value || 0);
  if (currentId && !options.some((org) => Number(org.id) === currentId)) {
    return [{ id: currentId, name: current?.name, slug: current?.slug }, ...options];
  }
  return options;
});
const practiceCategoryAgencyName = computed(() => {
  const id = Number(practiceCategoryAgencyId.value || 0);
  const row = practiceCategoryAgencyOptions.value.find((org) => Number(org.id) === id);
  return row?.name || row?.slug || (id ? `Agency ${id}` : '');
});
const practiceCategoriesEmptyHint = computed(() => {
  const name = practiceCategoryAgencyName.value || 'this tenant';
  return `No practice categories are enabled for ${name}. Turn on Mental health / Tutoring / Coaching / Consulting under Settings → Booking & service types for that tenant, then save.`;
});

function resolvePracticeCategoryAgencyId() {
  const options = practiceCategoryAgencyOptions.value;
  const preferred = Number(agencyId.value || 0);
  if (preferred && options.some((org) => Number(org.id) === preferred)) return preferred;
  const current = Number(practiceCategoryAgencyId.value || 0);
  if (current && options.some((org) => Number(org.id) === current)) return current;
  return Number(options[0]?.id || preferred || 0) || 0;
}
const isProviderRole = computed(() => {
  const r = String(form.value.role || user.value?.role || '').trim().toLowerCase();
  return r === 'provider' || r === 'provider_plus';
});

const selectedPracticeCategories = ref([]);
const allowedPracticeCategories = ref([]);
const practiceCategoriesSaving = ref(false);
const practiceCategoriesError = ref('');
const practiceCategoriesSaved = ref(false);

const practiceCategoryOptions = computed(() =>
  (allowedPracticeCategories.value || []).map((code) => ({
    code,
    label: PRACTICE_CATEGORY_LABELS[code] || code.replace(/_/g, ' ')
  }))
);

const practiceCategoriesDisplay = computed(() =>
  (selectedPracticeCategories.value || [])
    .map((c) => PRACTICE_CATEGORY_LABELS[c] || c)
    .join(', ') || '—'
);

async function loadPracticeCategories() {
  practiceCategoriesError.value = '';
  practiceCategoriesSaved.value = false;
  const uid = userId.value;
  practiceCategoryAgencyId.value = resolvePracticeCategoryAgencyId();
  const aid = Number(practiceCategoryAgencyId.value || 0);
  if (!uid || !aid || !api.value || !isProviderRole.value) {
    selectedPracticeCategories.value = [];
    allowedPracticeCategories.value = [];
    return;
  }
  try {
    const res = await api.value.get(`/users/${uid}/agencies/${aid}/practice-categories`, {
      skipGlobalLoading: true
    });
    selectedPracticeCategories.value = Array.isArray(res?.data?.categories) ? [...res.data.categories] : [];
    allowedPracticeCategories.value = Array.isArray(res?.data?.allowedCategories)
      ? [...res.data.allowedCategories]
      : [];
  } catch (e) {
    selectedPracticeCategories.value = [];
    allowedPracticeCategories.value = [];
    practiceCategoriesError.value = e?.response?.data?.error?.message || 'Could not load practice categories';
  }
}

async function persistPracticeCategories(next) {
  const uid = userId.value;
  const aid = Number(practiceCategoryAgencyId.value || resolvePracticeCategoryAgencyId() || 0);
  if (!uid || !aid || !api.value) return;
  practiceCategoriesSaving.value = true;
  practiceCategoriesError.value = '';
  practiceCategoriesSaved.value = false;
  try {
    const res = await api.value.put(
      `/users/${uid}/agencies/${aid}/practice-categories`,
      { categories: next },
      { skipGlobalLoading: true }
    );
    selectedPracticeCategories.value = Array.isArray(res?.data?.categories) ? [...res.data.categories] : [...next];
    if (Array.isArray(res?.data?.allowedCategories)) {
      allowedPracticeCategories.value = [...res.data.allowedCategories];
    }
    practiceCategoriesSaved.value = true;
  } catch (e) {
    practiceCategoriesError.value = e?.response?.data?.error?.message || 'Could not save practice categories';
    await loadPracticeCategories();
  } finally {
    practiceCategoriesSaving.value = false;
  }
}

function togglePracticeCategory(code, checked) {
  const set = new Set(selectedPracticeCategories.value);
  if (checked) set.add(code);
  else set.delete(code);
  const next = Array.from(set);
  selectedPracticeCategories.value = next;
  persistPracticeCategories(next);
}

const credentialLabel = computed(() => form.value.credential || user.value?.credential || '');

const statusLabel = computed(() => ctx.getStatusLabel?.(user.value?.status, user.value?.is_active) || user.value?.status || '—');
const statusPillClass = computed(() => {
  const s = String(user.value?.status || '').toLowerCase();
  if (s.includes('active') || user.value?.is_active) return 'acct-status-pill--active';
  if (s.includes('inactive') || s.includes('terminated')) return 'acct-status-pill--inactive';
  return 'acct-status-pill--neutral';
});

const employeeId = computed(() => user.value?.employee_id || user.value?.id || '—');
const hireDate = computed(() => user.value?.hire_date || overview.value?.lifecycle?.summary?.hireDate || overview.value?.user?.hire_date);
const activeSince = computed(() => user.value?.start_date || overview.value?.lifecycle?.summary?.startDate || hireDate.value);
const offboardingStatus = computed(() => overview.value?.lifecycle?.summary?.offboardingStatus || 'N/A');

const fieldByKey = computed(() => {
  const map = new Map();
  for (const f of clinicalFields.value || []) {
    const k = String(f?.field_key || '').trim();
    if (k && !map.has(k)) map.set(k, f);
  }
  return map;
});

const fieldDisplay = (keys) => {
  const f = findFieldByKeys(fieldByKey.value, keys);
  if (!f) return '';
  const v = formatClinicalFieldValue(f);
  if (Array.isArray(v)) return v.join(', ');
  return String(v || '').trim();
};

const clinicalSnapshot = computed(() => ({
  primaryModality: formatSnapshotValue(fieldByKey.value, { fieldKeys: ['provider_primary_modality', 'modality', 'treatment_prefs_max15'] }),
  populationFocus: formatSnapshotValue(fieldByKey.value, { fieldKeys: ['groups', 'mental_health', 'specialties_general'] }),
  ageRange: formatSnapshotValue(fieldByKey.value, { fieldKeys: ['age_specialty', 'provider_marketing_age_specialty'] }),
  sessionLength: formatSnapshotValue(fieldByKey.value, { fieldKeys: ['provider_session_length'] }),
  caseload: formatSnapshotValue(fieldByKey.value, { fieldKeys: ['provider_typical_caseload'] })
}));

const professionalDetails = computed(() => ({
  education: fieldDisplay(['education_history', 'education_level']),
  workExperience: fieldDisplay(['work_exp_general']),
  certifications: formatSnapshotValue(fieldByKey.value, { fieldKeys: ['certs_general'] }),
  yearsExperience: fieldDisplay(['teaching_experience_years_levels'])
}));

const serviceAvailability = computed(() => ({
  settings: formatSnapshotValue(fieldByKey.value, { fieldKeys: ['outside_school_availability', 'school_days_preference', 'psych_today_outside_school_interest'] }),
  sessionLength: clinicalSnapshot.value.sessionLength,
  caseload: clinicalSnapshot.value.caseload,
  schoolDays: fieldDisplay(['school_days_preference'])
}));

const employmentRows = computed(() => {
  const dates = overview.value?.lifecycle?.dates || {};
  const fmt = (k) => fmtDate(dates[k] || user.value?.[k]);
  return [
    { label: 'Hire Date', value: fmtDate(hireDate.value) },
    { label: 'Start Date', value: fmt('start_date') || fmtDate(activeSince.value) },
    { label: 'First Client Date', value: fmt('first_client_date') },
    { label: 'Offer Accepted', value: fmt('offer_accepted_date') },
    { label: 'Orientation / TherapyNotes Login', value: fmt('orientation_date') },
    { label: 'First Payroll Submission', value: fmt('first_payroll_submission_date') },
    { label: 'Work Anniversary', value: fmt('work_anniversary_date') },
    { label: 'Termination Date', value: fmtDate(user.value?.terminated_at) },
    { label: 'Date of Birth', value: fmtDate(user.value?.date_of_birth) }
  ].filter((r) => r.value && r.value !== '—');
});

const permissionGroups = computed(() => {
  const groups = [
    {
      id: 'contracts',
      label: 'Contracts & Operations',
      items: [
        // Med Cancel moved to Benefits tab (tier / benefits eligibility)
        { key: 'companyCardEnabled', label: 'Company card', type: 'checkbox' },
        { key: 'companyCarSubmitAccess', label: 'Company car submit', type: 'checkbox' },
        { key: 'companyCarManageAccess', label: 'Company car manage', type: 'checkbox' },
        { key: 'isHourlyWorker', label: 'Hourly worker', type: 'checkbox' }
      ]
    },
    {
      id: 'system',
      label: 'System Access',
      items: [
        ...(unwrap(ctx.showPayrollAccessToggle) ? [{ key: 'hasPayrollAccess', label: 'Payroll access', type: 'checkbox' }] : []),
        ...(unwrap(ctx.showCredentialingAccessToggle) ? [{ key: 'hasCredentialingAccess', label: 'Credentialing access', type: 'checkbox' }] : []),
        { key: 'hasHiringAccess', label: 'Hiring process access', type: 'checkbox' },
        { key: 'hasMedicalRecordsReleaseAccess', label: 'Medical records release', type: 'checkbox' },
        ...(unwrap(ctx.canToggleSupervisorPrivileges) ? [{ key: 'hasSupervisorPrivileges', label: 'Supervisor privileges', type: 'checkbox' }] : [])
      ]
    },
    {
      id: 'programs',
      label: 'Programs',
      items: [
        ...(unwrap(ctx.canEditSkillBuilderCoordinatorAccess) ? [{ key: 'hasSkillBuilderCoordinatorAccess', label: 'Program coordinator', type: 'checkbox' }] : []),
        ...(unwrap(ctx.canShowSkillBuildersSchoolProgramUserFields) ? [{ key: 'skillBuilderEligible', label: 'Skill Development Program', type: 'checkbox' }] : []),
        { key: 'hasGamesAccess', label: 'Games access', type: 'checkbox' }
      ]
    }
  ];
  return groups.filter((g) => g.items.length > 0);
});

const navItems = computed(() => [
  { id: 'account-info', label: 'Account Information' },
  { id: 'professional-details', label: 'Professional Details' },
  { id: 'home-address', label: 'Home Address' },
  { id: 'licenses', label: 'Licenses & Certifications' },
  { id: 'compensation-level', label: 'Compensation Level' },
  { id: 'service-availability', label: 'Service & Availability' },
  { id: 'supervisor-assignments', label: 'Supervisor Assignments' },
  { id: 'agency-assignments', label: 'Agency Assignments' },
  { id: 'employment-dates', label: 'Employment & Dates' },
  { id: 'access-permissions', label: 'Access & Permissions' },
  { id: 'feature-access', label: 'Feature Access' },
  { id: 'status-management', label: 'Status Management' },
  { id: 'workspace-security', label: 'Workspace & Security' },
  { id: 'public-profile', label: 'Public Provider Profile' }
]);

const completionPct = computed(() => {
  const checks = [
    form.value.firstName,
    form.value.lastName,
    form.value.email,
    form.value.title,
    license.value?.typeNumber,
    supervisorName.value,
    form.value.homeStreetAddress
  ];
  const done = checks.filter((v) => String(v || '').trim()).length;
  return Math.round((done / checks.length) * 100);
});

const fmtDate = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const isEditing = (id) => editingCard.value === id;
const startEdit = (id) => { editingCard.value = id; };
const cancelEdit = async () => {
  editingCard.value = null;
  await ctx.cancelEditAccount?.();
};
const saveCard = async () => {
  await ctx.saveAccount?.();
  editingCard.value = null;
};

const scrollToSection = (id) => {
  activeNav.value = id;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const loadClinicalFields = async () => {
  const uid = ctx.userId?.value ?? ctx.userId;
  if (!uid || !ctx.api) return;
  try {
    const res = await ctx.api.get(`/users/${uid}/user-info`, {
      params: { assignedOrHasValueOnly: true },
      skipGlobalLoading: true,
    });
    clinicalFields.value = res.data || [];
  } catch {
    clinicalFields.value = [];
  }
};

async function onLicenseFileSelected(event) {
  const file = event?.target?.files?.[0] || null;
  if (event?.target) event.target.value = '';
  if (!file || !canEditUser.value || !userId.value || !api.value) return;

  licenseUploading.value = true;
  licenseUploadError.value = '';
  licenseUploadSuccess.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('documentType', 'license');
    fd.append('userId', String(userId.value));
    fd.append('notes', 'Uploaded from Account profile');
    await api.value.post('/user-compliance-documents', fd, { skipGlobalLoading: true });
    if (typeof ctx.refreshLicenseCredentialSummary === 'function') {
      await ctx.refreshLicenseCredentialSummary();
    }
    await loadClinicalFields();
    licenseUploadSuccess.value = 'License PDF uploaded.';
    setTimeout(() => { licenseUploadSuccess.value = ''; }, 2500);
  } catch (e) {
    licenseUploadError.value = e?.response?.data?.error?.message || e.message || 'Upload failed';
  } finally {
    licenseUploading.value = false;
  }
}

onMounted(loadClinicalFields);
watch(() => ctx.userId?.value ?? ctx.userId, loadClinicalFields);
watch(
  [userId, agencyId, isProviderRole, userAgencies],
  () => { loadPracticeCategories(); },
  { immediate: true }
);

// ── Compensation Level ────────────────────────────────────────────────────────
const COMP_CATEGORIES = {
  1: { label: 'Category 1', description: 'Bachelors, Interns, QBHA & Peer Professionals' },
  2: { label: 'Category 2', description: 'Pre-licensed & Unlicensed Masters Level' },
  3: { label: 'Category 3', description: 'Licensed Professionals' }
};

const compAssignment = ref(null);
const compAllLevels  = ref([]);
const compCatLabels  = ref({});
const compLoading    = ref(false);
const compSaving     = ref(false);
const compError      = ref('');
const compSuccess    = ref(false);
const compDraft      = ref({ category: null, levelKey: 'bypass' });

const compCategoryLabel = (cat) => {
  if (!cat) return '';
  return compCatLabels.value[cat] || COMP_CATEGORIES[cat]?.label || `Category ${cat}`;
};

const loadCompLevel = async () => {
  const uid = ctx.userId?.value ?? ctx.userId;
  const aid = ctx.agencyId?.value ?? ctx.agencyId;
  if (!uid || !aid || !ctx.api) return;
  compLoading.value = true;
  compError.value = '';
  try {
    const [assignRes, defsRes] = await Promise.all([
      ctx.api.get(`/payroll/users/${uid}/compensation-level`, { params: { agencyId: aid }, skipGlobalLoading: true }),
      ctx.api.get('/payroll/compensation-levels', { params: { agencyId: aid }, skipGlobalLoading: true })
    ]);
    compAssignment.value = assignRes.data?.assignment || null;
    compAllLevels.value  = defsRes.data?.levels || [];
    // Build category label map
    const labels = {};
    (defsRes.data?.categoryLabels || []).forEach((cl) => {
      if (cl.label) labels[cl.category] = cl.label;
    });
    compCatLabels.value = labels;
    // Seed draft from current assignment (or default to bypass)
    if (compAssignment.value) {
      compDraft.value = {
        category: compAssignment.value.category,
        levelKey: compAssignment.value.bypass ? 'bypass' : String(compAssignment.value.level ?? 'bypass')
      };
    } else {
      compDraft.value = { category: null, levelKey: 'bypass' };
    }
  } catch (e) {
    compError.value = e.response?.data?.error?.message || 'Failed to load compensation level';
  } finally {
    compLoading.value = false;
  }
};

const saveCompLevel = async () => {
  const uid = ctx.userId?.value ?? ctx.userId;
  const aid = ctx.agencyId?.value ?? ctx.agencyId;
  if (!uid || !aid || !compDraft.value.category) return;
  compSaving.value = true;
  compError.value = '';
  compSuccess.value = false;
  const bypass = compDraft.value.levelKey === 'bypass';
  const level  = bypass ? null : parseInt(compDraft.value.levelKey, 10);
  try {
    const res = await ctx.api.post(`/payroll/users/${uid}/compensation-level`, {
      agencyId: aid,
      category: compDraft.value.category,
      level,
      bypass,
      applyRates: false
    });
    compAssignment.value = res.data?.assignment || null;
    compSuccess.value = true;
    setTimeout(() => { compSuccess.value = false; }, 3000);
  } catch (e) {
    compError.value = e.response?.data?.error?.message || 'Failed to save assignment';
  } finally {
    compSaving.value = false;
  }
};

const compUserId = computed(() => ctx.userId?.value ?? ctx.userId);
const compAgencyId = computed(() => ctx.agencyId?.value ?? ctx.agencyId);

watch([compUserId, compAgencyId], ([uid, aid]) => {
  if (uid && aid) loadCompLevel();
}, { immediate: true });
</script>

<style scoped>
/* ── Compensation Level card ─────────────────────────── */
.comp-muted    { font-size: 13px; color: #64748b; margin-bottom: 10px; }
.comp-error    { font-size: 13px; color: #dc2626; background: #fef2f2; border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; }
.comp-success  { font-size: 13px; color: #065f46; background: #d1fae5; border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; }
.comp-hint     { font-size: 12px; color: #94a3b8; margin: 6px 0 0; }

.comp-badge-row  { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
.comp-badge-cat  { background: #e0e7ff; color: #3730a3; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; }
.comp-badge-sep  { color: #94a3b8; font-size: 14px; }
.comp-badge-level { font-size: 13px; font-weight: 600; color: #0f172a; }
.comp-badge-bypass { background: #f1f5f9; color: #475569; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; }
.comp-badge-name  { font-weight: 400; color: #64748b; }

.comp-form-row { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.comp-field    { display: flex; flex-direction: column; gap: 4px; min-width: 180px; flex: 1; }
.comp-label    { font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: .04em; }
.comp-select   { border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; font-size: 13px; color: #0f172a; background: #f8fafc; outline: none; }
.comp-select:focus { border-color: #2e5d50; background: #fff; }
.comp-save-btn { flex-shrink: 0; align-self: flex-end; }

.acct-dashboard {
  --acct-green: #2e5d50;
  --acct-bg: #f3f4f6;
  --acct-text: #0f172a;
  --acct-muted: #64748b;
  background: var(--acct-bg);
  margin: -8px -12px 0;
  padding: 16px 12px 24px;
  border-radius: 12px;
}

.acct-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.acct-sidebar {
  position: sticky;
  top: 12px;
  background: #fff;
  border-radius: 14px;
  padding: 18px 14px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

.acct-profile {
  text-align: center;
  padding-bottom: 14px;
  border-bottom: 1px solid #eef2f7;
}

.acct-avatar-wrap { display: flex; justify-content: center; margin-bottom: 10px; }
.acct-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  object-fit: cover;
  background: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--acct-green);
  font-size: 24px;
}
.acct-profile-name { font-weight: 700; font-size: 15px; color: var(--acct-text); }
.acct-profile-meta { font-size: 12px; color: var(--acct-muted); margin-top: 2px; }

.acct-status-pill {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.acct-status-pill--sm { font-size: 10px; padding: 3px 8px; }
.acct-status-pill--active { background: #dcfce7; color: #166534; }
.acct-status-pill--inactive { background: #fee2e2; color: #991b1b; }
.acct-status-pill--neutral { background: #f1f5f9; color: #475569; }

.acct-upload-btn {
  margin-top: 10px;
  width: 100%;
  border: 1px solid #dbeafe;
  background: #f8fafc;
  color: #334155;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.acct-nav { display: flex; flex-direction: column; gap: 2px; padding: 12px 0; }
.acct-nav-item {
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
}
.acct-nav-item:hover { background: #f8fafc; }
.acct-nav-item--active { background: #ecfdf5; color: var(--acct-green); font-weight: 600; }

.acct-sidebar-block { padding-top: 8px; border-top: 1px solid #eef2f7; }
.acct-sidebar-block-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--acct-muted); margin-bottom: 8px; }
.acct-qa {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
}
.acct-qa:hover { background: #f8fafc; }

.acct-completion { margin-top: 14px; padding-top: 12px; border-top: 1px solid #eef2f7; }
.acct-completion-head { display: flex; justify-content: space-between; font-size: 12px; color: var(--acct-muted); margin-bottom: 6px; }
.acct-completion-bar { height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
.acct-completion-fill { height: 100%; background: var(--acct-green); border-radius: 999px; }

.acct-main { min-width: 0; }

.acct-summary-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.acct-summary-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}
.acct-summary-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.acct-summary-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--acct-muted); margin-bottom: 10px; }
.acct-summary-dl { display: grid; gap: 8px; margin: 0; }
.acct-summary-dl div { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: baseline; }
.acct-summary-dl dt { margin: 0; font-size: 12px; color: var(--acct-muted); }
.acct-summary-dl dd { margin: 0; font-size: 13px; font-weight: 600; color: var(--acct-text); text-align: right; }

.acct-cards { display: flex; flex-direction: column; gap: 14px; }

.acct-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 20px;
}
.acct-field--full { grid-column: 1 / -1; }
.acct-field-label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--acct-muted); margin-bottom: 4px; }
.acct-field-value { font-size: 14px; color: var(--acct-text); word-break: break-word; }
.acct-field-value--block { display: block; white-space: pre-wrap; line-height: 1.45; }
.acct-field--edit label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 4px; }
.acct-field-hint { margin: 6px 0 0; font-size: 12px; color: #64748b; line-height: 1.4; }
.acct-field-hint--tight { margin: 0 0 8px; }
.acct-practice-agency-select {
  width: 100%;
  margin-top: 4px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
}
.acct-field-error { margin: 6px 0 0; font-size: 12px; color: #b91c1c; }
.acct-field-ok { margin: 6px 0 0; font-size: 12px; color: #166534; }
.acct-practice-cats { display: flex; flex-wrap: wrap; gap: 10px 16px; margin-top: 4px; }
.acct-practice-cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
}
.acct-practice-cat input { margin: 0; }
.acct-field--edit input,
.acct-field--edit select {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
}

.acct-license-active {
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  padding: 14px 16px;
}
.acct-license-active-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.acct-license-eligible-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
  white-space: nowrap;
}
.acct-license-upload-row {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}
.acct-license-upload-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.acct-license-missing {
  font-size: 13px;
  color: #b45309;
  font-weight: 600;
}
.acct-license-uploaded-at {
  font-size: 12px;
  color: var(--acct-muted, #6b7280);
}
.acct-license-upload-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.acct-license-upload-error {
  margin: 8px 0 0;
  color: #b91c1c;
  font-size: 13px;
}
.acct-license-upload-success {
  margin: 8px 0 0;
  color: #047857;
  font-size: 13px;
}

.acct-timeline { display: flex; flex-direction: column; gap: 8px; }
.acct-timeline-row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
.acct-timeline-label { color: var(--acct-muted); }
.acct-timeline-value { font-weight: 600; color: var(--acct-text); }

.acct-perm-groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.acct-perm-group-title { font-size: 12px; font-weight: 700; color: var(--acct-green); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.03em; }
.acct-perm-list { display: flex; flex-direction: column; gap: 8px; }
.acct-perm-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 13px; padding: 8px 10px; background: #f8fafc; border-radius: 8px; }
.acct-perm-select { border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px; font-size: 12px; }

.acct-link-btn {
  border: none;
  background: transparent;
  color: var(--acct-green);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.acct-empty { color: var(--acct-muted); font-size: 13px; }

:deep(.feature-access-section),
:deep(.agency-assignments-section),
:deep(.admin-tools-section),
:deep(.status-management) {
  margin: 0;
}

:deep(.feature-access-section h3),
:deep(.agency-assignments-section h3),
:deep(.admin-tools-section h3) {
  display: none;
}

@media (max-width: 1100px) {
  .acct-layout { grid-template-columns: 1fr; }
  .acct-sidebar { position: static; }
  .acct-summary-row { grid-template-columns: 1fr; }
  .acct-field-grid, .acct-perm-groups { grid-template-columns: 1fr; }
}
</style>
