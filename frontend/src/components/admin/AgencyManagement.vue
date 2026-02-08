<template>
  <div class="agency-management">
    <div
      class="master-detail"
      :class="{
        'nav-collapsed': navCollapsed && !embeddedSingleOrg,
        'no-selection': !showCreateModal && !editingAgency,
        embedded: embeddedSingleOrg
      }"
    >
      <aside v-if="!embeddedSingleOrg" class="nav-pane">
        <div class="section-header" :class="{ collapsed: navCollapsed }">
          <h2 v-if="!navCollapsed">Organization Management</h2>
          <div v-else class="section-header-collapsed-title">Orgs</div>

          <div class="section-header-actions">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              @click="toggleNavCollapsed"
              :title="navCollapsed ? 'Expand list' : 'Collapse to icons'"
            >
              {{ navCollapsed ? 'Expand' : 'Collapse' }}
            </button>
            <button v-if="!navCollapsed" @click="startCreateOrganization" class="btn btn-primary">Create</button>
          </div>
        </div>

        <div class="filters" v-if="!loading && !navCollapsed">
          <div class="filters-row">
            <div class="filters-group">
              <label class="filters-label">Search</label>
              <input v-model="searchQuery" class="filters-input" type="text" placeholder="Search by name or slug…" />
            </div>

            <div class="filters-group">
              <label class="filters-label">Agency</label>
              <select v-model="selectedAgencyFilterId" class="filters-select" @change="handleAgencyFilterChange">
                <option value="">All agencies</option>
                <option v-for="a in parentAgencies" :key="a.id" :value="String(a.id)">
                  {{ a.name }}
                </option>
              </select>
            </div>

            <div class="filters-group">
              <label class="filters-label">View</label>
              <select v-model="typeFilter" class="filters-select">
                <option value="agencies">Agencies</option>
                <option value="buildings">Buildings</option>
                <option value="schools">Schools</option>
                <option value="programs">Programs</option>
                <option value="learning">Learning</option>
                <option value="other">Other</option>
                <option value="organizations">All non-agency orgs</option>
              </select>
            </div>

            <div class="filters-group">
              <label class="filters-label">Sort</label>
              <select v-model="sortMode" class="filters-select">
                <option value="name_asc">Name (A→Z)</option>
                <option value="name_desc">Name (Z→A)</option>
                <option value="slug_asc">Slug (A→Z)</option>
                <option value="type_asc">Type</option>
                <option value="status_desc">Status (Active first)</option>
              </select>
            </div>

          </div>

          <div v-if="selectedAgencyFilterId" class="filters-hint">
            <strong>Agency selected:</strong> {{ selectedAgencyForList?.name || '—' }}
            <span v-if="String(typeFilter || '') === 'agencies'">• Showing agency + affiliated organizations.</span>
            <span v-else>• Showing affiliated organizations (filtered by view).</span>
            <button class="btn-link" type="button" @click="clearAgencyFilter">Clear</button>
          </div>
    </div>
    
    <div v-if="loading" class="loading">Loading agencies...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
        <div v-else class="org-list">
          <div v-if="loadingAffiliates && selectedAgencyFilterId" class="loading">Loading affiliated organizations…</div>
          <div v-else-if="organizationsToRender.length === 0" class="empty-state-inline">
            No organizations found for the current filters.
          </div>

          <div
            v-for="org in organizationsToRender"
            :key="org.__key || org.id"
            class="org-row"
            :class="{
              active: editingAgency?.id === org.id,
              child: isChildOrgRow(org),
              collapsed: navCollapsed,
              'selected-filter-agency': isSelectedAgencyFilterRow(org)
            }"
            role="button"
            tabindex="0"
            :style="{ borderLeftColor: getOrgAccentColor(org) }"
            @click="editAgency(org)"
            @keydown.enter.prevent="editAgency(org)"
            @keydown.space.prevent="editAgency(org)"
            :title="navCollapsed ? `${org.name} (${org.slug})` : ''"
          >
            <div class="org-main">
              <div class="org-identity">
                <div class="org-avatar" :style="{ borderColor: getOrgAccentColor(org) }">
                  <img
                    v-if="getOrgIconUrl(org) && !iconErrorsByOrgId[org.id]"
                    :src="getOrgIconUrl(org)"
                    :alt="`${org.name} icon`"
                    @error="(e) => handleIconError(e, org.id)"
                  />
                  <span v-else class="org-avatar-fallback">
                    {{ String(org.name || '?').trim().slice(0, 1).toUpperCase() }}
                  </span>
            </div>
                <div v-if="!navCollapsed" class="org-title">
                  <div class="org-name">{{ org.name }}</div>
                  <div v-if="!isChildOrgRow(org)" class="org-slug">{{ org.slug }}</div>
            </div>
          </div>
              <div v-if="!navCollapsed && !isChildOrgRow(org)" class="org-right">
                <div class="org-badges">
                  <span class="badge badge-type">{{ String(org.organization_type || 'agency').toLowerCase() }}</span>
                  <span :class="['badge', org.is_active ? 'badge-success' : 'badge-secondary']">
                    {{ org.is_active ? 'Active' : 'Inactive' }}
          </span>
        </div>
        
                <div class="org-actions">
                  <button
                    v-if="org.portal_url"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click.stop="copyLoginUrl(org.portal_url)"
                  >
                    Copy URL
                  </button>
                <button 
                  v-if="userRole === 'super_admin'"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click.stop="openDuplicateModal(org)"
                  >
                    Duplicate
                  </button>
                  <button
                    v-if="userRole === 'super_admin' && (String(org.organization_type || 'agency').toLowerCase() === 'agency' || String(org.organization_type || '').toLowerCase() === 'office' || org.__kind === 'building')"
                    type="button"
                    :class="['btn', org.is_active ? 'btn-danger' : 'btn-secondary', 'btn-sm']"
                    @click.stop="org.is_active ? archiveOrganization(org) : restoreOrganization(org)"
                  >
                    {{ org.is_active ? 'Archive' : 'Restore' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <section v-if="showCreateModal || editingAgency" class="detail-pane" ref="detailPaneRef">
        <div class="detail-content">
          <div v-if="error && (showCreateModal || editingAgency)" class="error-modal">{{ error }}</div>

          <div v-if="editingAgency" class="detail-summary" :style="{ borderLeftColor: getOrgAccentColor(editingAgency) }">
            <div class="detail-summary-main">
              <div class="detail-summary-avatar" :style="{ borderColor: getOrgAccentColor(editingAgency) }">
                <img
                  v-if="getOrgIconUrl(editingAgency) && !iconErrorsByOrgId[editingAgency.id]"
                  :src="getOrgIconUrl(editingAgency)"
                  :alt="`${editingAgency.name} icon`"
                  @error="(e) => handleIconError(e, editingAgency.id)"
                />
                <span v-else class="detail-summary-fallback">
                  {{ String(editingAgency.name || '?').trim().slice(0, 1).toUpperCase() }}
              </span>
            </div>
              <div class="detail-summary-text">
                <div class="detail-summary-name">{{ editingAgency.name }}</div>
                <div class="detail-summary-meta">
                  <span class="detail-summary-slug">{{ editingAgency.slug }}</span>
                  <span class="detail-summary-sep">•</span>
                  <span class="detail-summary-type">{{ String(editingAgency.organization_type || 'agency').toLowerCase() }}</span>
          </div>
              </div>
            </div>

            <div class="detail-summary-actions">
                <button 
                v-if="editingAgency.portal_url"
                type="button"
                class="btn btn-secondary btn-sm"
                @click.stop="copyLoginUrl(editingAgency.portal_url)"
              >
                Copy URL
              </button>
            </div>
          </div>

    <div v-if="showCreateModal || editingAgency" class="detail-editor">
      <div class="detail-editor-card">
        <h3>{{ editingAgency ? 'Edit Organization' : 'Create Organization' }}</h3>
        <div v-if="error" class="error-modal">
          <strong>Error:</strong> {{ error }}
        </div>
        
        <!-- Tab Navigation -->
        <div class="modal-tabs">
          <button type="button" :class="['tab-button', { active: activeTab === 'general' }]" @click="activeTab = 'general'">General</button>
          <button
            v-if="String(agencyForm.organizationType || 'agency').toLowerCase() !== 'office'"
            type="button"
            :class="['tab-button', { active: activeTab === 'branding' }]"
            @click="activeTab = 'branding'"
          >
            Branding
          </button>
          <button
            v-if="String(agencyForm.organizationType || 'agency').toLowerCase() === 'agency'"
            type="button"
            :class="['tab-button', { active: activeTab === 'features' }]"
            @click="activeTab = 'features'"
          >
            Features
          </button>
          <button
            v-if="String(agencyForm.organizationType || 'agency').toLowerCase() !== 'office' && String(agencyForm.organizationType || 'agency').toLowerCase() !== 'school'"
            type="button"
            :class="['tab-button', { active: activeTab === 'contact' }]"
            @click="activeTab = 'contact'"
          >
            Contact
          </button>
          <button
            v-if="String(agencyForm.organizationType || 'agency').toLowerCase() !== 'office'"
            type="button"
            :class="['tab-button', { active: activeTab === 'address' }]"
            @click="activeTab = 'address'"
          >
            Address
          </button>
          <button
            v-if="String(agencyForm.organizationType || 'agency').toLowerCase() === 'school'"
            type="button"
            :class="['tab-button', { active: activeTab === 'school_providers' }]"
            @click="activeTab = 'school_providers'"
          >
            Providers
          </button>
          <button
            v-if="String(agencyForm.organizationType || 'agency').toLowerCase() === 'school'"
            type="button"
            :class="['tab-button', { active: activeTab === 'school_staff' }]"
            @click="activeTab = 'school_staff'"
          >
            School Staff
          </button>
          <button
            v-if="editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            type="button"
            :class="['tab-button', { active: activeTab === 'sites' }]"
            @click="activeTab = 'sites'"
          >
            Sites
          </button>
          <button
            v-if="editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            type="button"
            :class="['tab-button', { active: activeTab === 'notifications' }]"
            @click="activeTab = 'notifications'"
          >
            Notifications
          </button>
          <button
            v-if="editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            type="button"
            :class="['tab-button', { active: activeTab === 'announcements' }]"
            @click="activeTab = 'announcements'"
          >
            Announcements
          </button>
          <button type="button" :class="['tab-button', { active: activeTab === 'theme' }]" @click="activeTab = 'theme'">Theme</button>
          <button type="button" :class="['tab-button', { active: activeTab === 'terminology' }]" @click="activeTab = 'terminology'">Terminology</button>
          <button type="button" :class="['tab-button', { active: activeTab === 'icons' }]" @click="activeTab = 'icons'">Icons</button>
          <button
            v-if="editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            type="button"
            :class="['tab-button', { active: activeTab === 'payroll' }]"
            @click="openPayrollTab"
          >
            Payroll
          </button>
        </div>
        
        <form @submit.prevent="saveAgency">
          <!-- Form-based tabs (all but Icons/Payroll) -->
          <div v-show="activeTab !== 'icons' && activeTab !== 'payroll'" class="tab-content">
          <div v-if="activeTab === 'general'" class="tab-section">
          <div v-if="editingAgency" class="org-general-header">
            <div class="org-general-title">
              <div class="org-name">{{ editingAgency.name }}</div>
              <div class="org-status-pills">
                <span v-if="editingAgency.is_archived" class="pill pill-warn">Archived</span>
                <span v-else-if="editingAgency.is_active === false" class="pill pill-warn">Inactive</span>
                <span v-else class="pill pill-ok">Active</span>
                <span v-if="editingAgency.portal_url" class="pill pill-muted mono">/{{ editingAgency.portal_url }}</span>
      </div>
    </div>
            <div class="org-general-actions">
              <button
                v-if="editingAgency.portal_url"
                type="button"
                class="btn btn-secondary btn-sm"
                @click.stop="copyLoginUrl(editingAgency.portal_url)"
              >
                Copy URL
              </button>
              <button
                v-if="userRole === 'super_admin'"
                type="button"
                class="btn btn-secondary btn-sm"
                @click.stop="openDuplicateModal(editingAgency)"
              >
                Duplicate
              </button>
              <button
                v-if="userRole === 'super_admin'"
                type="button"
                :class="['btn', editingAgency.is_active ? 'btn-danger' : 'btn-secondary', 'btn-sm']"
                @click.stop="editingAgency.is_active ? archiveOrganization(editingAgency) : restoreOrganization(editingAgency)"
              >
                {{ editingAgency.is_active ? 'Archive' : 'Restore' }}
              </button>
            </div>
          </div>
          <div class="form-group">
            <label>Organization Type *</label>
            <select v-model="agencyForm.organizationType" required :disabled="!!editingAgency">
              <option
                v-if="userRole === 'super_admin' || (editingAgency && (editingAgency.organization_type || 'agency') === 'agency')"
                value="agency"
              >
                Agency
              </option>
              <option value="school">School</option>
              <option value="program">Program</option>
              <option value="learning">Learning</option>
              <option v-if="canCreateOffice" value="office">Building</option>
            </select>
            <small v-if="!editingAgency && userRole !== 'super_admin'">Admins can create schools/programs/learning orgs. Only super admins can create agencies.</small>
            <small v-if="editingAgency">Organization type cannot be changed after creation</small>
          </div>

          <div v-if="requiresAffiliatedAgency" class="form-group">
            <label>{{ isOfficeType ? 'Agency *' : 'Affiliated Agency *' }}</label>
            <select v-model="agencyForm.affiliatedAgencyId" required :disabled="affiliatedAgencyLocked">
              <option value="" disabled>Select an agency</option>
              <option v-for="a in affiliableAgencies" :key="a.id" :value="String(a.id)">
                {{ a.name }}
              </option>
            </select>
            <small v-if="affiliatedAgencyLocked">This is auto-selected based on your admin access.</small>
          </div>

          <div v-if="requiresAffiliatedAgency && !isOfficeType" class="form-group pricing-box" :class="{ locked: affiliatedAgencyLocked }">
            <div class="pricing-title">Pricing impact (estimate)</div>
            <div class="pricing-row">
              <span class="pricing-label">Affiliated agency</span>
              <span class="pricing-value">{{ selectedAffiliatedAgency?.name || '—' }}</span>
      </div>
            <div class="pricing-row">
              <span class="pricing-label">Additional {{ agencyForm.organizationType }}</span>
              <span class="pricing-value">{{ formatMoneyCents(estimatedUnitPriceCents) }} / month</span>
    </div>
            <small class="pricing-note">Unit price estimate; actual billing depends on current plan usage and included counts.</small>
          </div>
          <template v-if="!isOfficeType">
            <div class="form-group">
              <label>Name *</label>
              <input v-model="agencyForm.name" type="text" required />
            </div>
            <div v-if="String(agencyForm.organizationType || '').toLowerCase() === 'school'" class="form-group">
              <label>Official name (display)</label>
              <input v-model="agencyForm.officialName" type="text" placeholder="e.g., Ashley Elementary" />
              <small>This is what displays on the School Portal header.</small>
            </div>
            <div class="form-group">
              <label>Slug *</label>
              <input v-model="agencyForm.slug" type="text" required pattern="[a-z0-9\\-]+" />
              <small>Lowercase letters, numbers, and hyphens only</small>
            </div>

            <div class="form-section-divider" style="margin-top: 18px; margin-bottom: 12px; padding-top: 18px; border-top: 1px solid var(--border);">
              <h4 style="margin: 0; font-size: 16px;">Intake Data Retention</h4>
              <p class="section-description" style="margin-top: 6px;">
                Overrides the platform default for this agency. Intake links can override this per link.
              </p>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Retention policy</label>
                <select v-model="agencyForm.intakeRetentionPolicy.mode">
                  <option value="inherit">Use platform default</option>
                  <option value="days">Delete after N days</option>
                  <option value="never">Never delete automatically</option>
                </select>
              </div>
              <div class="form-group" v-if="agencyForm.intakeRetentionPolicy.mode === 'days'">
                <label>Days to retain</label>
                <input v-model.number="agencyForm.intakeRetentionPolicy.days" type="number" min="1" max="3650" />
              </div>
            </div>

            <div class="form-section-divider" style="margin-top: 18px; margin-bottom: 12px; padding-top: 18px; border-top: 1px solid var(--border);">
              <h4 style="margin: 0; font-size: 16px;">Session Timeout</h4>
              <p class="section-description" style="margin-top: 6px;">
                Controls inactivity logout and presence heartbeat for this agency.
              </p>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Inactivity timeout (minutes)</label>
                <input v-model.number="agencyForm.sessionSettings.inactivityTimeoutMinutes" type="number" min="1" max="240" />
              </div>
              <div class="form-group">
                <label>Heartbeat interval (seconds)</label>
                <input v-model.number="agencyForm.sessionSettings.heartbeatIntervalSeconds" type="number" min="10" max="300" />
              </div>
            </div>
          </template>

          <template v-else>
          <div class="form-group">
              <label>Building name *</label>
              <input v-model="agencyForm.name" type="text" required placeholder="e.g., Downtown Office" />
              <small>This creates a building asset. You’ll manage rooms, room types, SVG map, and multi-agency links in Office → Settings.</small>
            </div>
            <div class="form-group">
              <label>Timezone</label>
              <select v-model="agencyForm.officeTimezone" class="select">
                <option v-for="tz in OFFICE_TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>SVG map URL (optional)</label>
              <input v-model="agencyForm.officeSvgUrl" type="text" placeholder="https://..." />
            </div>
            <div v-if="canAttachAdditionalOfficeAgencies" class="form-group">
              <label>Additional agencies to attach (optional)</label>
              <div class="add-agency-list">
                <div
                  v-for="(row, idx) in agencyForm.officeAdditionalAgencyIds"
                  :key="`office-add-${idx}`"
                  class="add-agency-row"
                >
                  <select v-model="agencyForm.officeAdditionalAgencyIds[idx]" class="select">
                    <option value="">Select an agency…</option>
              <option
                      v-for="a in affiliableAgencies"
                      :key="a.id"
                      :value="String(a.id)"
                      :disabled="String(a.id) === String(agencyForm.affiliatedAgencyId)"
                    >
                      {{ a.name }}
              </option>
            </select>
                  <button type="button" class="btn btn-secondary btn-sm" @click="removeOfficeAdditionalAgency(idx)">
                    Remove
                  </button>
          </div>

                <button type="button" class="btn btn-secondary btn-sm" @click="addOfficeAdditionalAgency">
                  Add another agency
            </button>
          </div>
              <small>The selected Agency above is always attached automatically.</small>
            </div>
          </template>

          <!-- School directory fields -->
          <div
            v-if="String(agencyForm.organizationType || '').toLowerCase() === 'school'"
            style="margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--border);"
          >
            <h4 style="margin: 0 0 10px 0; color: var(--text-primary); font-size: 16px; font-weight: 700;">
              School directory
            </h4>
            <small class="hint">These fields come from the school directory import and can be edited here.</small>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
              <div class="form-group">
                <label>District</label>
                <input v-model="agencyForm.schoolProfile.districtName" type="text" placeholder="e.g. District 12" />
              </div>
              <div class="form-group">
                <label>School Number</label>
                <input v-model="agencyForm.schoolProfile.schoolNumber" type="text" placeholder="e.g. 1234" />
              </div>
              <div class="form-group">
                <label>ITSCO Group Email</label>
                <input v-model="agencyForm.schoolProfile.itscoEmail" type="email" placeholder="group@example.org" />
      </div>
    </div>
    
            <div style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 12px; margin-top: 10px;">
              <div class="form-group">
                <label>Bell Schedule Start</label>
                <input v-model="agencyForm.schoolProfile.bellScheduleStartTime" type="time" />
        </div>
          <div class="form-group">
                <label>Bell Schedule End</label>
                <input v-model="agencyForm.schoolProfile.bellScheduleEndTime" type="time" />
          </div>
          <div class="form-group">
                <label>Notes</label>
                <textarea
                  v-model="agencyForm.schoolProfile.schoolDaysTimes"
                  rows="2"
                  placeholder="(migrated from Soft Schedule) Freeform notes…"
                ></textarea>
          </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 10px;">
            <div class="form-group">
                <label>Primary Contact Name</label>
                <input v-model="agencyForm.schoolProfile.primaryContactName" type="text" />
              </div>
              <div class="form-group">
                <label>Primary Contact Email</label>
                <input v-model="agencyForm.schoolProfile.primaryContactEmail" type="email" />
              </div>
              <div class="form-group">
                <label>Primary Contact Role</label>
                <input v-model="agencyForm.schoolProfile.primaryContactRole" type="text" />
              </div>
            </div>

            <div v-if="schoolContactsForEditor.length" style="margin-top: 10px;">
              <div style="font-weight: 700; font-size: 13px; margin-bottom: 6px;">Imported contacts</div>
              <div style="display: grid; gap: 8px;">
                <div
                  v-for="c in schoolContactsForEditor"
                  :key="c.id"
                  style="border: 1px solid var(--border); border-radius: 10px; padding: 10px; background: var(--card-bg);"
                >
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <strong v-if="c.full_name">{{ c.full_name }}</strong>
                    <span v-else style="color: var(--text-secondary);">(no name)</span>
                    <span v-if="c.is_primary" class="badge badge-success">Primary</span>
                    <span v-if="c.role_title" style="color: var(--text-secondary);">• {{ c.role_title }}</span>
                    <span v-if="c.email" style="color: var(--text-secondary);">• {{ c.email }}</span>
                  </div>
                  <div v-if="c.notes" style="margin-top: 4px; color: var(--text-secondary); font-size: 12px;">
                    {{ c.notes }}
                  </div>
                </div>
              </div>
              <small class="hint" style="display: block; margin-top: 6px;">
                Tip: edit these contacts in the <strong>School Staff</strong> tab (bulk import can still overwrite them later).
              </small>
            </div>
          </div>
          </div>

          <div v-if="activeTab === 'branding'" class="tab-section">
            <div class="form-group">
              <label>Organization Logo</label>
              <div class="logo-input-tabs">
                <button 
                  type="button"
                  :class="['tab-button-small', { active: logoInputMethod === 'url' }]"
                  @click="logoInputMethod = 'url'"
                >
                  URL
                </button>
                <button 
                  type="button"
                  :class="['tab-button-small', { active: logoInputMethod === 'upload' }]"
                  @click="logoInputMethod = 'upload'"
                >
                  Upload
                </button>
              </div>
              
              <!-- URL Input -->
              <div v-if="logoInputMethod === 'url'" class="logo-input-section">
              <input v-model="agencyForm.logoUrl" type="url" placeholder="https://example.com/logo.png" />
                <p class="form-help">Enter the full URL to your agency logo image (PNG, JPG, GIF, SVG, or WebP)</p>
                <div v-if="agencyForm.logoUrl" class="logo-preview">
                <img :src="agencyForm.logoUrl" alt="Logo preview" @error="handleLogoError" />
                <p v-if="logoError" class="logo-error">Failed to load logo. Please check the URL.</p>
                </div>
              </div>
              
              <!-- Upload Input -->
              <div v-if="logoInputMethod === 'upload'" class="logo-input-section">
                <input 
                  type="file" 
                  ref="logoFileInput"
                  @change="handleLogoFileSelect"
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
                  class="file-input"
                  style="display: none;"
                />
                <button 
                  type="button"
                  class="btn btn-primary"
                  @click="logoFileInput?.click()"
                  :disabled="uploadingLogo"
                >
                  {{ uploadingLogo ? 'Uploading...' : 'Choose Logo File' }}
                </button>
                <p class="form-help">Upload a logo file (PNG, JPG, GIF, SVG, or WebP - max 5MB)</p>
                <div v-if="uploadingLogo" class="upload-status">Uploading logo...</div>
                <div v-if="agencyForm.logoPath" class="logo-preview">
                  <img :src="getLogoUrlFromPath(agencyForm.logoPath)" alt="Logo preview" @error="handleLogoError" />
                  <p class="form-help">Logo uploaded successfully</p>
                </div>
              </div>
            </div>
          <div class="form-group">
            <label>Primary Color</label>
            <div class="color-input-group">
              <input 
                :value="agencyForm.primaryColor" 
                type="color" 
                @input="handleColorChange('primary', $event.target.value)"
                class="color-picker"
                title="Click to pick a color"
              />
              <input 
                v-model="agencyForm.primaryColor" 
                type="text" 
                placeholder="#0F172A"
                pattern="^#[0-9A-Fa-f]{6}$"
                class="color-text-input"
                @input="handleTextColorChange('primary', $event.target.value)"
              />
              <div class="color-preview" :style="{ backgroundColor: agencyForm.primaryColor }" :title="agencyForm.primaryColor"></div>
            </div>
          </div>
          <div class="form-group">
            <label>Secondary Color</label>
            <div class="color-input-group">
              <input 
                :value="agencyForm.secondaryColor" 
                type="color" 
                @input="handleColorChange('secondary', $event.target.value)"
                class="color-picker"
                title="Click to pick a color"
              />
              <input 
                v-model="agencyForm.secondaryColor" 
                type="text" 
                placeholder="#1E40AF"
                pattern="^#[0-9A-Fa-f]{6}$"
                class="color-text-input"
                @input="handleTextColorChange('secondary', $event.target.value)"
              />
              <div class="color-preview" :style="{ backgroundColor: agencyForm.secondaryColor }" :title="agencyForm.secondaryColor"></div>
            </div>
          </div>
          <div class="form-group">
            <label>Accent Color</label>
            <div class="color-input-group">
              <input 
                :value="agencyForm.accentColor" 
                type="color" 
                @input="handleColorChange('accent', $event.target.value)"
                class="color-picker"
                title="Click to pick a color"
              />
              <input 
                v-model="agencyForm.accentColor" 
                type="text" 
                placeholder="#F97316"
                pattern="^#[0-9A-Fa-f]{6}$"
                class="color-text-input"
                @input="handleTextColorChange('accent', $event.target.value)"
              />
              <div class="color-preview" :style="{ backgroundColor: agencyForm.accentColor }" :title="agencyForm.accentColor"></div>
            </div>
          </div>
          <!-- Portal Configuration Section -->
          <div class="form-section-divider" style="margin-top: 24px; margin-bottom: 16px; padding-top: 24px; border-top: 2px solid var(--border);">
            <h4 style="margin: 0 0 16px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Portal Configuration</h4>
          </div>
          
          <div class="form-group">
            <label>Portal URL (Subdomain)</label>
            <input 
              v-model="agencyForm.portalUrl" 
              type="text" 
              pattern="[a-z0-9\-]+" 
              placeholder="itsco"
            />
            <small>Lowercase letters, numbers, and hyphens only. This will be used for subdomain access (e.g., itsco.app.plottwistco.com)</small>
          </div>
          </div>

          <div
            v-if="String(agencyForm.organizationType || 'agency').toLowerCase() === 'agency'"
            class="form-group"
            style="padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-alt);"
          >
            <template v-if="activeTab === 'features'">
            <label style="margin-bottom: 8px; display: block;"><strong>Feature toggles (pricing / rollout)</strong></label>

            <div class="form-group" style="margin-top: 10px;">
              <label>Portal Variant</label>
              <select v-model="agencyForm.featureFlags.portalVariant">
                <option value="healthcare_provider">Healthcare (Providers)</option>
                <option value="employee">Employee (non-provider)</option>
              </select>
              <small class="hint">
                Controls which dashboard modules are shown. Use “Employee” for non-provider industries (hides provider-only surfaces like Submit + Snapshot).
              </small>
            </div>

            <div class="toggle-row" style="margin-top: 8px;">
              <span>Enable In‑School submissions</span>
              <ToggleSwitch v-model="agencyForm.featureFlags.inSchoolSubmissionsEnabled" compact />
            </div>
            <small class="hint">Controls School Mileage (and any other “In‑School Claims” modules).</small>

            <div class="toggle-row" style="margin-top: 10px;">
              <span>Enable Med Cancel</span>
              <ToggleSwitch v-model="agencyForm.featureFlags.medcancelEnabled" compact />
            </div>
            <small class="hint">Controls Med Cancel claim submissions and related notifications.</small>

            <div class="toggle-row" style="margin-top: 10px;">
              <span>Enable AI Provider Search (Gemini)</span>
              <ToggleSwitch v-model="agencyForm.featureFlags.aiProviderSearchEnabled" compact />
            </div>
            <small class="hint">Enables the “AI Generate Filters” box in Provider Directory. Requires GEMINI_API_KEY in backend.</small>

            <div class="toggle-row" style="margin-top: 10px;">
              <span>Enable Note Aid (Gemini tools)</span>
              <ToggleSwitch v-model="agencyForm.featureFlags.noteAidEnabled" compact />
            </div>
            <small class="hint">Enables the Note Aid page (AI note helpers). Requires GEMINI_API_KEY in backend.</small>

            <div class="toggle-row" style="margin-top: 10px;">
              <span>Enable Clinical Note Generator (agency-paid)</span>
              <ToggleSwitch v-model="agencyForm.featureFlags.clinicalNoteGeneratorEnabled" compact />
            </div>
            <small class="hint">Enables the Clinical Note Generator tool for this organization (providers see it on My Dashboard).</small>

            <div class="toggle-row" style="margin-top: 14px;">
              <span>Enable Google Workspace login rules</span>
              <ToggleSwitch v-model="agencyForm.featureFlags.googleSsoEnabled" compact />
            </div>
            <small class="hint">When enabled, selected roles must use Google sign-in for this organization (slug-based portal). School staff and client/guardian portals are not affected.</small>

            <div v-if="agencyForm.featureFlags.googleSsoEnabled" style="margin-top: 12px;">
              <label style="font-weight: 600; display: block; margin-bottom: 6px;">Roles required to use Google</label>
              <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
                <label style="display:flex; align-items:center; gap:8px;">
                  <input type="checkbox" value="staff" v-model="agencyForm.featureFlags.googleSsoRequiredRoles" />
                  <span>Staff</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px;">
                  <input type="checkbox" value="provider" v-model="agencyForm.featureFlags.googleSsoRequiredRoles" />
                  <span>Provider</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px;">
                  <input type="checkbox" value="admin" v-model="agencyForm.featureFlags.googleSsoRequiredRoles" />
                  <span>Admin</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px;">
                  <input type="checkbox" value="clinical_practice_assistant" v-model="agencyForm.featureFlags.googleSsoRequiredRoles" />
                  <span>Clinical Practice Assistant</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px;">
                  <input type="checkbox" value="super_admin" v-model="agencyForm.featureFlags.googleSsoRequiredRoles" />
                  <span>Super Admin</span>
                </label>
              </div>

              <div class="form-group" style="margin-top: 12px;">
                <label>Allowed Google domains</label>
                <textarea
                  :value="(agencyForm.featureFlags.googleSsoAllowedDomains || []).join('\\n')"
                  rows="3"
                  placeholder="itsco.health&#10;plottwistco.com"
                  @input="agencyForm.featureFlags.googleSsoAllowedDomains = String($event.target.value || '').split(/\\r?\\n|,/).map(s => s.trim().toLowerCase()).filter(Boolean)"
                ></textarea>
                <small class="hint">One per line (or comma-separated). Leave blank to allow any domain (not recommended).</small>
              </div>
            </div>
            </template>
          </div>

          <div class="form-group" style="margin-top: 16px;">
            <label>Workspace account provisioning</label>
            <ToggleSwitch v-model="agencyForm.featureFlags.workspaceProvisioningEnabled" compact />
            <small class="hint">Create Google Workspace accounts when pre-hire is completed.</small>
          </div>

          <div v-if="agencyForm.featureFlags.workspaceProvisioningEnabled" class="form-group" style="margin-top: 12px;">
            <label>Workspace email domain</label>
            <input
              v-model="agencyForm.featureFlags.workspaceEmailDomain"
              type="text"
              placeholder="example.com"
            />
            <small class="hint">Do not include the @ symbol.</small>
          </div>

          <div v-if="agencyForm.featureFlags.workspaceProvisioningEnabled" class="form-group">
            <label>Workspace email format</label>
            <select v-model="agencyForm.featureFlags.workspaceEmailFormat">
              <option value="">Select a format…</option>
              <option value="first">first@domain</option>
              <option value="first_initial_last">flast@domain</option>
              <option value="last_first_initial">lastf@domain</option>
            </select>
            <small class="hint">Format is based on the employee's first and last name.</small>
          </div>

          <div v-if="agencyForm.featureFlags.workspaceProvisioningEnabled" class="form-group">
            <label>Auto-provision Twilio number on pre-hire complete</label>
            <ToggleSwitch v-model="agencyForm.featureFlags.smsAutoProvisionOnPrehire" compact />
            <small class="hint">Requires SMS numbers enabled in the Texting Numbers module.</small>
          </div>
          
          <div v-if="activeTab === 'contact'" class="tab-section">
          <template v-if="String(agencyForm.organizationType || 'agency').toLowerCase() === 'school'">
            <div class="form-group">
              <label>Primary Contact</label>
              <input v-model="agencyForm.schoolProfile.primaryContactName" type="text" placeholder="Full name" />
            </div>
            <div class="form-group">
              <label>Title / Role (at school)</label>
              <input v-model="agencyForm.schoolProfile.primaryContactRole" type="text" placeholder="e.g. Social Worker" />
            </div>
            <div class="form-group">
              <label>Primary Contact Email</label>
              <input v-model="agencyForm.schoolProfile.primaryContactEmail" type="email" placeholder="name@school.org" />
            </div>
            <div class="form-group">
              <label>School Phone Number</label>
              <input v-model="agencyForm.phoneNumber" type="tel" placeholder="(555) 123-4567" />
              <small>Main phone number for this school</small>
            </div>
          </template>

          <template v-else>
          <div class="form-group">
            <label>Onboarding Team Email</label>
            <input 
              v-model="agencyForm.onboardingTeamEmail" 
              type="email" 
              placeholder="onboarding@agency.com"
            />
            <small>Email address for the onboarding team</small>
          </div>
          
          <div class="form-group">
            <label>Phone Number</label>
            <input 
              v-model="agencyForm.phoneNumber" 
              type="tel" 
              placeholder="(555) 123-4567"
            />
            <small>Phone number for the agency</small>
          </div>
          
          <div class="form-group">
            <label>Phone Extension</label>
            <input 
              v-model="agencyForm.phoneExtension" 
              type="text" 
              maxlength="10"
              placeholder="123"
            />
            <small>Optional phone extension</small>
            </div>
          </template>
          </div>

          <div v-if="activeTab === 'school_providers'" class="tab-section">
            <h4 style="margin: 0 0 8px 0;">Affiliated Providers</h4>
            <small class="hint">This tab will list providers affiliated with the school (coming next).</small>
          </div>

          <div v-if="activeTab === 'school_staff'" class="tab-section">
            <div class="form-section-divider" style="margin-top: 6px; margin-bottom: 12px; padding-top: 6px;">
              <h4 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 18px; font-weight: 700;">
                School Staff
              </h4>
              <small class="hint">
                Manage school directory contacts and portal login accounts (role: <code>school_staff</code>).
                This replaces the redundant Contact tab for schools.
              </small>
            </div>

            <div class="form-group" style="margin-top: 12px;">
              <label>Secondary Contact (string)</label>
              <textarea
                v-model="agencyForm.schoolProfile.secondaryContactText"
                rows="3"
                placeholder="Freeform: name, role, email, phone, notes…"
              ></textarea>
              <small class="hint">Freeform notes that don’t fit the structured contact rows below.</small>
            </div>

            <div class="form-section-divider" style="margin-top: 18px; margin-bottom: 10px; padding-top: 18px; border-top: 1px solid var(--border);">
              <h4 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 16px; font-weight: 700;">Contacts</h4>
              <small class="hint">Add, edit, delete. You can also create/revoke a portal user account from a contact.</small>
            </div>

            <div v-if="addSchoolContactError" class="error-modal">
              <strong>Error:</strong> {{ addSchoolContactError }}
            </div>

            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th style="width: 88px;">Primary</th>
                    <th>Name</th>
                    <th>Role/Title</th>
                    <th>Email</th>
                    <th>Notes</th>
                    <th style="width: 210px;">Account</th>
                    <th class="right" style="width: 240px;"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <label style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" v-model="newSchoolContact.isPrimary" :disabled="addingSchoolContact" />
                        <span>Primary</span>
                      </label>
                    </td>
                    <td><input v-model="newSchoolContact.fullName" type="text" placeholder="Full name" :disabled="addingSchoolContact" /></td>
                    <td><input v-model="newSchoolContact.roleTitle" type="text" placeholder="e.g. Counselor" :disabled="addingSchoolContact" /></td>
                    <td><input v-model="newSchoolContact.email" type="email" placeholder="name@school.org" :disabled="addingSchoolContact" /></td>
                    <td><input v-model="newSchoolContact.notes" type="text" placeholder="Optional notes" :disabled="addingSchoolContact" /></td>
                    <td style="color: var(--text-secondary); font-size: 12px;">—</td>
                    <td class="right">
                      <div class="contact-actions">
                        <button type="button" class="btn btn-primary btn-sm" @click="addSchoolContact" :disabled="addingSchoolContact || !editingAgency?.id">
                          {{ addingSchoolContact ? 'Adding…' : 'Add' }}
                        </button>
                      </div>
                    </td>
                  </tr>

                  <tr v-if="!schoolContactsForEditor.length">
                    <td colspan="7" style="color: var(--text-secondary); padding: 12px;">
                      No contacts yet.
                    </td>
                  </tr>

                  <tr v-for="c in schoolContactsForEditor" :key="c.id">
                    <template v-if="editingSchoolContactId === c.id">
                      <td>
                        <label style="display:flex; align-items:center; gap:8px;">
                          <input type="checkbox" v-model="schoolContactEdits[c.id].isPrimary" :disabled="savingSchoolContactId === c.id" />
                          <span>Primary</span>
                        </label>
                      </td>
                      <td><input v-model="schoolContactEdits[c.id].fullName" type="text" :disabled="savingSchoolContactId === c.id" /></td>
                      <td><input v-model="schoolContactEdits[c.id].roleTitle" type="text" :disabled="savingSchoolContactId === c.id" /></td>
                      <td><input v-model="schoolContactEdits[c.id].email" type="email" :disabled="savingSchoolContactId === c.id" /></td>
                      <td><input v-model="schoolContactEdits[c.id].notes" type="text" :disabled="savingSchoolContactId === c.id" /></td>
                      <td style="color: var(--text-secondary); font-size: 12px;">
                        <span v-if="schoolStaffUsersByEmail[String(schoolContactEdits[c.id].email || '').trim().toLowerCase()]">Has account</span>
                        <span v-else>—</span>
                      </td>
                      <td class="right">
                        <div class="contact-actions">
                          <button type="button" class="btn btn-primary btn-sm" @click="saveSchoolContact(c.id)" :disabled="savingSchoolContactId === c.id">
                            {{ savingSchoolContactId === c.id ? 'Saving…' : 'Save' }}
                          </button>
                          <button type="button" class="btn btn-secondary btn-sm" @click="cancelEditSchoolContact(c.id)" :disabled="savingSchoolContactId === c.id">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </template>
                    <template v-else>
                      <td>
                        <span v-if="c.is_primary" class="badge badge-success">Primary</span>
                        <span v-else style="color: var(--text-secondary); font-size: 12px;">—</span>
                      </td>
                      <td>
                        <strong v-if="c.full_name">{{ c.full_name }}</strong>
                        <span v-else style="color: var(--text-secondary);">(no name)</span>
                      </td>
                      <td style="color: var(--text-secondary);">{{ c.role_title || '—' }}</td>
                      <td style="color: var(--text-secondary);">{{ c.email || '—' }}</td>
                      <td style="color: var(--text-secondary);">{{ c.notes || '—' }}</td>
                      <td>
                        <template v-if="c.email && schoolStaffUsersByEmail[String(c.email || '').trim().toLowerCase()]">
                          <span style="display:inline-block; font-size: 12px; color: var(--text-secondary);">
                            Linked
                          </span>
                        </template>
                        <template v-else>
                          <span style="display:inline-block; font-size: 12px; color: var(--text-secondary);">No account</span>
                        </template>
                      </td>
                      <td class="right">
                        <div class="contact-actions">
                          <button type="button" class="btn btn-secondary btn-sm" @click="startEditSchoolContact(c)">
                            Edit
                          </button>
                          <button
                            v-if="c.email && !schoolStaffUsersByEmail[String(c.email || '').trim().toLowerCase()]"
                            type="button"
                            class="btn btn-primary btn-sm"
                            @click="createSchoolStaffUserForContact(c)"
                            :disabled="creatingSchoolStaffUserContactId === c.id"
                          >
                            {{ creatingSchoolStaffUserContactId === c.id ? 'Creating…' : 'Create user' }}
                          </button>
                          <button
                            v-else-if="c.email && schoolStaffUsersByEmail[String(c.email || '').trim().toLowerCase()]"
                            type="button"
                            class="btn btn-secondary btn-sm"
                            @click="revokeSchoolStaffAccess(schoolStaffUsersByEmail[String(c.email || '').trim().toLowerCase()])"
                            :disabled="revokingSchoolStaffUserId === schoolStaffUsersByEmail[String(c.email || '').trim().toLowerCase()].id"
                          >
                            {{ revokingSchoolStaffUserId === schoolStaffUsersByEmail[String(c.email || '').trim().toLowerCase()].id ? 'Revoking…' : 'Revoke access' }}
                          </button>
                          <button
                            type="button"
                            class="btn btn-danger btn-sm"
                            @click="deleteSchoolContact(c)"
                            :disabled="deletingSchoolContactId === c.id"
                          >
                            {{ deletingSchoolContactId === c.id ? 'Deleting…' : 'Delete' }}
                          </button>
                        </div>
                      </td>
                    </template>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="form-section-divider" style="margin-top: 18px; margin-bottom: 10px; padding-top: 18px; border-top: 1px solid var(--border);">
              <h4 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 16px; font-weight: 700;">School staff accounts</h4>
              <small class="hint">Accounts currently assigned to this school (role: <code>school_staff</code>).</small>
            </div>

            <div v-if="schoolStaffUsersError" class="error-modal">
              <strong>Error:</strong> {{ schoolStaffUsersError }}
            </div>
            <div v-if="schoolStaffUsersLoading" class="loading">Loading school staff accounts…</div>

            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th class="right"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!schoolStaffUsers.length">
                    <td colspan="4" style="color: var(--text-secondary); padding: 12px;">No school staff accounts assigned.</td>
                  </tr>
                  <tr v-for="u in schoolStaffUsers" :key="u.id">
                    <td>{{ [u.first_name, u.last_name].filter(Boolean).join(' ') || `User #${u.id}` }}</td>
                    <td style="color: var(--text-secondary);">{{ u.email || u.work_email || '—' }}</td>
                    <td style="color: var(--text-secondary);">{{ u.status || '—' }}</td>
                    <td class="right">
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        @click="revokeSchoolStaffAccess(u)"
                        :disabled="revokingSchoolStaffUserId === u.id"
                      >
                        {{ revokingSchoolStaffUserId === u.id ? 'Revoking…' : 'Revoke access' }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="activeTab === 'address'" class="tab-section">
          <div class="form-section-divider" style="margin-top: 18px; margin-bottom: 16px; padding-top: 18px; border-top: 2px solid var(--border);">
            <h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Address</h4>
            <small class="hint">Used for mileage calculations (schools use this as their school address).</small>
            <div
              v-if="editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
              class="hint"
              style="margin-top: 6px;"
            >
              Need office/site addresses for mileage? Manage them under the <button type="button" class="link-btn" @click="activeTab = 'sites'">Sites</button> tab.
            </div>
          </div>

          <div class="form-group">
            <label>Street Address</label>
            <input v-model="agencyForm.streetAddress" type="text" placeholder="123 Main St" />
          </div>
          <div class="form-group">
            <label>City</label>
            <input v-model="agencyForm.city" type="text" placeholder="City" />
          </div>
          <div class="form-group">
            <label>State</label>
            <input v-model="agencyForm.state" type="text" placeholder="State" />
          </div>
          <div class="form-group">
            <label>Postal Code</label>
            <input v-model="agencyForm.postalCode" type="text" placeholder="ZIP" />
          </div>
          </div>

          <div
            v-if="activeTab === 'sites' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-section-divider"
            style="margin-top: 18px; margin-bottom: 16px; padding-top: 18px; border-top: 2px solid var(--border);"
          >
            <h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Mileage Rates (Tier 1/2/3)</h4>
            <small class="hint">Per-mile reimbursement rates used for approving School Mileage submissions.</small>
          </div>

          <div
            v-if="activeTab === 'sites' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-group"
          >
            <div v-if="mileageRatesError" class="error-modal">
              <strong>Error:</strong> {{ mileageRatesError }}
            </div>

            <div class="filters-row" style="align-items: flex-end;">
              <div class="filters-group">
                <label class="filters-label">Tier 1 ($/mile)</label>
                <input v-model="mileageRatesDraft.tier1" class="filters-input" type="number" step="0.0001" min="0" :disabled="mileageRatesLoading || savingMileageRates" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Tier 2 ($/mile)</label>
                <input v-model="mileageRatesDraft.tier2" class="filters-input" type="number" step="0.0001" min="0" :disabled="mileageRatesLoading || savingMileageRates" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Tier 3 ($/mile)</label>
                <input v-model="mileageRatesDraft.tier3" class="filters-input" type="number" step="0.0001" min="0" :disabled="mileageRatesLoading || savingMileageRates" />
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadMileageRates" :disabled="mileageRatesLoading || !editingAgency?.id">
                  {{ mileageRatesLoading ? 'Loading…' : 'Reload' }}
                </button>
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-primary btn-sm" @click="saveMileageRates" :disabled="savingMileageRates || !editingAgency?.id">
                  {{ savingMileageRates ? 'Saving…' : 'Save rates' }}
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="activeTab === 'announcements' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="tab-section"
          >
            <div class="form-section-divider" style="margin-top: 6px; margin-bottom: 16px; padding-top: 6px;">
              <h4 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Agency announcements</h4>
              <small class="hint">Controls top-of-dashboard banners shown to users in this agency.</small>
            </div>

            <div v-if="announcementsError" class="error-modal">
              <strong>Error:</strong> {{ announcementsError }}
            </div>
            <div v-if="announcementsLoading" class="loading">Loading announcements…</div>

            <div v-else class="form-group" style="margin-top: 10px;">
              <div class="toggle-row" style="margin-top: 8px;">
                <span><strong>Birthday banner</strong> (shows on Dashboard for everyone in this agency)</span>
                <ToggleSwitch v-model="announcementsDraft.birthdayEnabled" />
              </div>
              <small class="hint" style="display:block; margin-top: 6px;">
                Uses Birthdate from employee info. Message template supports <code>{fullName}</code>.
              </small>

              <div class="form-group" style="margin-top: 12px;">
                <label>Birthday message template</label>
                <input
                  v-model="announcementsDraft.birthdayTemplate"
                  type="text"
                  :disabled="announcementsSaving"
                  placeholder="Happy Birthday, {fullName}"
                />
              </div>

              <div class="filters-row" style="align-items: flex-end; margin-top: 10px;">
                <div class="filters-group">
                  <button type="button" class="btn btn-secondary btn-sm" @click="loadAgencyAnnouncements" :disabled="announcementsLoading || announcementsSaving || !editingAgency?.id">
                    Reload
                  </button>
                </div>
                <div class="filters-group">
                  <button type="button" class="btn btn-primary btn-sm" @click="saveAgencyAnnouncements" :disabled="announcementsSaving || !editingAgency?.id">
                    {{ announcementsSaving ? 'Saving…' : 'Save announcements' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="form-section-divider" style="margin-top: 18px; margin-bottom: 12px; padding-top: 18px; border-top: 1px solid var(--border);">
              <h4 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Scheduled announcements</h4>
              <small class="hint">Time-limited banners (max 2 weeks). Use these for reminders and short-term notices.</small>
            </div>

            <div v-if="scheduledAnnouncementsError" class="error-modal">
              <strong>Error:</strong> {{ scheduledAnnouncementsError }}
            </div>
            <div v-if="scheduledAnnouncementsLoading" class="loading">Loading scheduled announcements…</div>

            <div v-else class="form-group" style="margin-top: 10px;">
              <div style="border: 1px solid var(--border); border-radius: 12px; padding: 12px; background: #fff;">
                <div style="font-weight: 600; margin-bottom: 10px;">
                  {{ scheduledDraft.id ? 'Edit scheduled announcement' : 'Create scheduled announcement' }}
                </div>
                <div class="filters-row" style="align-items: flex-end; flex-wrap: wrap;">
                  <div class="filters-group" style="min-width: 240px;">
                    <label class="filters-label">Title (optional)</label>
                    <input v-model="scheduledDraft.title" class="filters-input" type="text" maxlength="255" placeholder="e.g., Payroll due Friday" />
                  </div>
                  <div class="filters-group" style="min-width: 200px;">
                    <label class="filters-label">Starts</label>
                    <input v-model="scheduledDraft.startsAt" class="filters-input" type="datetime-local" />
                  </div>
                  <div class="filters-group" style="min-width: 200px;">
                    <label class="filters-label">Ends (max 2 weeks)</label>
                    <input v-model="scheduledDraft.endsAt" class="filters-input" type="datetime-local" />
                  </div>
                  <div class="filters-group" style="flex: 1 1 420px;">
                    <label class="filters-label">Message</label>
                    <textarea v-model="scheduledDraft.message" class="filters-input" rows="2" maxlength="1200" placeholder="Type announcement…"></textarea>
                  </div>
                </div>
                <div class="filters-row" style="align-items: center; margin-top: 10px;">
                  <div class="filters-group">
                    <button type="button" class="btn btn-primary btn-sm" @click="saveScheduledAnnouncement" :disabled="scheduledSubmitting || !scheduledCanSubmit">
                      {{ scheduledSubmitting ? 'Saving…' : (scheduledDraft.id ? 'Update announcement' : 'Post announcement') }}
                    </button>
                  </div>
                  <div class="filters-group" v-if="scheduledDraft.id">
                    <button type="button" class="btn btn-secondary btn-sm" @click="resetScheduledDraft" :disabled="scheduledSubmitting">
                      Cancel edit
                    </button>
                  </div>
                  <div class="filters-group">
                    <button type="button" class="btn btn-secondary btn-sm" @click="loadAgencyScheduledAnnouncements" :disabled="scheduledAnnouncementsLoading || scheduledSubmitting || !editingAgency?.id">
                      Refresh list
                    </button>
                  </div>
                  <div v-if="scheduledFormError" class="error-modal" style="padding: 6px 10px; margin: 0;">
                    <strong>Error:</strong> {{ scheduledFormError }}
                  </div>
                </div>
              </div>

              <div class="table-wrap" style="margin-top: 12px;">
                <table v-if="scheduledAnnouncements.length" class="table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Message</th>
                      <th>Starts</th>
                      <th>Ends</th>
                      <th>Status</th>
                      <th class="right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="a in scheduledAnnouncements" :key="`ann-${a.id}`">
                      <td>{{ a.title || 'Announcement' }}</td>
                      <td>{{ a.message }}</td>
                      <td>{{ formatAnnouncementDate(a.starts_at) }}</td>
                      <td>{{ formatAnnouncementDate(a.ends_at) }}</td>
                      <td>{{ scheduledStatusLabel(a) }}</td>
                      <td class="right">
                        <button type="button" class="btn btn-secondary btn-sm" @click="editScheduledAnnouncement(a)" :disabled="scheduledSubmitting">
                          Edit
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" style="margin-left: 6px;" @click="deleteScheduledAnnouncement(a)" :disabled="scheduledSubmitting">
                          Delete
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div v-else class="muted" style="padding: 8px 4px;">No scheduled announcements yet.</div>
              </div>
            </div>
          </div>

          <div
            v-if="activeTab === 'notifications' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-section-divider"
            style="margin-top: 18px; margin-bottom: 16px; padding-top: 18px; border-top: 2px solid var(--border);"
          >
            <h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Ticketing Notifications</h4>
            <small class="hint">Choose which org-types should generate support ticket notifications for this agency.</small>
          </div>

          <div
            v-if="activeTab === 'notifications' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-group"
          >
            <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px;">
              <label class="hint" style="display: inline-flex; align-items: center; gap: 8px;">
                <input type="checkbox" value="school" v-model="agencyForm.ticketingNotificationOrgTypes" />
                Schools
              </label>
              <label class="hint" style="display: inline-flex; align-items: center; gap: 8px;">
                <input type="checkbox" value="program" v-model="agencyForm.ticketingNotificationOrgTypes" />
                Programs
              </label>
              <label class="hint" style="display: inline-flex; align-items: center; gap: 8px;">
                <input type="checkbox" value="learning" v-model="agencyForm.ticketingNotificationOrgTypes" />
                Learning
              </label>
            </div>
            <small class="hint" style="display: block; margin-top: 8px;">
              These control which tickets appear as notifications (ticket list access stays in <strong>Support tickets</strong>).
            </small>
          </div>

          <div
            v-if="activeTab === 'notifications' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-section-divider"
            style="margin-top: 18px; margin-bottom: 16px; padding-top: 18px; border-top: 2px solid var(--border);"
          >
            <h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Tier System (Payroll)</h4>
            <small class="hint">Enable/disable tier calculations and set the weekly credits/hour thresholds for Tier 1/2/3.</small>
          </div>

          <div
            v-if="activeTab === 'notifications' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-group"
          >
            <div class="toggle-row">
              <ToggleSwitch v-model="agencyForm.tierSystemEnabled" />
              <span><strong>Enable tier system</strong> (shows Tier badge + tier credits in payroll)</span>
            </div>

            <div class="filters-row" style="align-items: flex-end; margin-top: 10px;">
              <div class="filters-group">
                <label class="filters-label">Tier 1 min (weekly credits/hours)</label>
                <input v-model="agencyForm.tierThresholds.tier1MinWeekly" class="filters-input" type="number" step="0.1" min="0" :disabled="!agencyForm.tierSystemEnabled" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Tier 2 min (weekly credits/hours)</label>
                <input v-model="agencyForm.tierThresholds.tier2MinWeekly" class="filters-input" type="number" step="0.1" min="0" :disabled="!agencyForm.tierSystemEnabled" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Tier 3 min (weekly credits/hours)</label>
                <input v-model="agencyForm.tierThresholds.tier3MinWeekly" class="filters-input" type="number" step="0.1" min="0" :disabled="!agencyForm.tierSystemEnabled" />
              </div>
            </div>
            <small class="hint" style="display: block; margin-top: 8px;">
              Example: if Tier 1 min is 6, then Tier 1 starts at 6 credits/hours per week.
            </small>
          </div>

          <div
            v-if="activeTab === 'sites' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-section-divider"
            style="margin-top: 18px; margin-bottom: 16px; padding-top: 18px; border-top: 2px solid var(--border);"
          >
            <h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Office locations (Sites)</h4>
            <small class="hint">Used for Buildings and School Mileage office selection.</small>
          </div>

          <div
            v-if="activeTab === 'sites' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-group"
          >
            <div v-if="officeLocationsError" class="error-modal">
              <strong>Error:</strong> {{ officeLocationsError }}
            </div>
            <div v-if="officeLocationsLoading" class="loading">Loading office locations…</div>

            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Timezone</th>
                    <th>Street</th>
                    <th>City</th>
                    <th>State</th>
                    <th>ZIP</th>
                    <th>Active</th>
                    <th class="right"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="l in officeLocations" :key="l.id">
                    <td><input v-model="getOfficeLocationEdit(l.id).name" type="text" /></td>
                    <td>
                      <select v-model="getOfficeLocationEdit(l.id).timezone">
                        <option v-for="tz in americaTimeZones" :key="tz" :value="tz">{{ tz }}</option>
                        <option value="">Other…</option>
                      </select>
                      <div v-if="!getOfficeLocationEdit(l.id).timezone" style="margin-top: 6px;">
                        <input v-model="getOfficeLocationEdit(l.id).timezoneCustom" type="text" placeholder="e.g., America/New_York" />
                      </div>
                    </td>
                    <td><input v-model="getOfficeLocationEdit(l.id).streetAddress" type="text" /></td>
                    <td><input v-model="getOfficeLocationEdit(l.id).city" type="text" /></td>
                    <td><input v-model="getOfficeLocationEdit(l.id).state" type="text" /></td>
                    <td><input v-model="getOfficeLocationEdit(l.id).postalCode" type="text" /></td>
                    <td><ToggleSwitch v-model="getOfficeLocationEdit(l.id).isActive" compact /></td>
                    <td class="right">
                      <button type="button" class="btn btn-secondary btn-sm" @click="saveOfficeLocation(l)" :disabled="savingOfficeLocationId === l.id">
                        {{ savingOfficeLocationId === l.id ? 'Saving…' : 'Save' }}
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!officeLocations.length">
                    <td colspan="8" class="empty-state-inline">No office locations yet.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="filters-row" style="align-items: flex-end; margin-top: 10px;">
              <div class="filters-group">
                <label class="filters-label">Name</label>
                <input v-model="newOfficeLocationName" class="filters-input" type="text" placeholder="e.g., Main Office" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Timezone</label>
                <select v-model="newOfficeLocationTimezone" class="filters-input">
                  <option v-for="tz in americaTimeZones" :key="tz" :value="tz">{{ tz }}</option>
                  <option value="">Other…</option>
                </select>
                <input
                  v-if="!newOfficeLocationTimezone"
                  v-model="newOfficeLocationTimezoneCustom"
                  class="filters-input"
                  type="text"
                  placeholder="e.g., America/New_York"
                  style="margin-top: 6px;"
                />
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-primary btn-sm" @click="createOfficeLocation" :disabled="creatingOfficeLocation || !newOfficeLocationName">
                  {{ creatingOfficeLocation ? 'Creating…' : 'Add' }}
                </button>
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadOfficeLocations" :disabled="officeLocationsLoading">
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="activeTab === 'notifications' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-section-divider"
            style="margin-top: 18px; margin-bottom: 16px; padding-top: 18px; border-top: 2px solid var(--border);"
          >
            <h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Agency Notification Defaults</h4>
            <small class="hint">Set defaults for all staff. Optionally lock preferences from being edited by staff.</small>
          </div>

          <div
            v-if="activeTab === 'notifications' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-group"
          >
            <div v-if="agencyNotificationError" class="error-modal">
              <strong>Error:</strong> {{ agencyNotificationError }}
            </div>
            <div class="filters-row" style="align-items: flex-end; margin-bottom: 10px;">
              <div class="filters-group">
                <label class="filters-label">Apply defaults to all staff</label>
                <select v-model="agencyNotificationDraft.enforceDefaults" class="filters-input">
                  <option :value="true">Yes (enforce)</option>
                  <option :value="false">No (new users only)</option>
                </select>
              </div>
              <div class="filters-group">
                <label class="filters-label">Staff can edit</label>
                <select v-model="agencyNotificationDraft.userEditable" class="filters-input">
                  <option :value="true">Yes</option>
                  <option :value="false">No</option>
                </select>
              </div>
              <div class="filters-group">
                <label class="filters-label">Bulk set</label>
                <div style="display: flex; gap: 6px; align-items: center;">
                  <button type="button" class="btn btn-secondary btn-sm" @click="setAllNotificationDefaults(true)">
                    Enable all
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="setAllNotificationDefaults(false)">
                    Disable all
                  </button>
                </div>
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadAgencyNotificationPreferences" :disabled="agencyNotificationLoading || !editingAgency?.id">
                  {{ agencyNotificationLoading ? 'Loading…' : 'Reload' }}
                </button>
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-primary btn-sm" @click="saveAgencyNotificationPreferences" :disabled="agencyNotificationSaving || !editingAgency?.id">
                  {{ agencyNotificationSaving ? 'Saving…' : 'Save defaults' }}
                </button>
              </div>
            </div>

            <div class="table-wrap" style="margin-bottom: 12px;">
              <table class="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Enabled by default</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="opt in notificationDefaultOptions" :key="opt.key">
                    <td>
                      <div><strong>{{ opt.label }}</strong></div>
                      <div class="hint" style="margin-top: 4px;">{{ opt.group }}</div>
                    </td>
                    <td>
                      <ToggleSwitch v-model="agencyNotificationDraft.defaults[opt.key]" compact :disabled="opt.locked === true" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div
            v-if="activeTab === 'notifications' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-section-divider"
            style="margin-top: 18px; margin-bottom: 16px; padding-top: 18px; border-top: 2px solid var(--border);"
          >
            <h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Program Reminders</h4>
            <small class="hint">Schedule recurring program reminders (in-app + optional SMS).</small>
          </div>

          <div
            v-if="activeTab === 'notifications' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-group"
          >
            <div v-if="programRemindersError" class="error-modal">
              <strong>Error:</strong> {{ programRemindersError }}
            </div>
            <div class="filters-row" style="align-items: flex-end; margin-bottom: 10px;">
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadProgramReminders" :disabled="programRemindersLoading || !editingAgency?.id">
                  {{ programRemindersLoading ? 'Loading…' : 'Reload' }}
                </button>
              </div>
            </div>

            <div v-if="programRemindersLoading" class="loading">Loading program reminders…</div>
            <div v-else class="table-wrap" style="margin-bottom: 12px;">
              <table class="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Schedule</th>
                    <th>Next Run</th>
                    <th>Channels</th>
                    <th class="right"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in programReminders" :key="r.id">
                    <td>
                      <div><strong>{{ r.title || 'Program reminder' }}</strong></div>
                      <div class="hint" style="margin-top: 4px;">{{ r.message }}</div>
                    </td>
                    <td>
                      <div class="hint">{{ formatProgramSchedule(r) }}</div>
                    </td>
                    <td class="hint">{{ formatProgramNextRun(r) }}</td>
                    <td class="hint">{{ r.channels?.sms ? 'In-app + SMS' : 'In-app only' }}</td>
                    <td class="right">
                      <button type="button" class="btn btn-secondary btn-sm" @click="deleteProgramReminder(r)">Delete</button>
                    </td>
                  </tr>
                  <tr v-if="!programReminders.length">
                    <td colspan="5" class="empty-state-inline">No reminders scheduled yet.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="card" style="padding: 12px;">
              <div class="filters-row">
                <div class="filters-group" style="flex: 1;">
                  <label class="filters-label">Title</label>
                  <input v-model="programReminderDraft.title" class="filters-input" type="text" placeholder="Program reminder" />
                </div>
                <div class="filters-group" style="flex: 2;">
                  <label class="filters-label">Message</label>
                  <input v-model="programReminderDraft.message" class="filters-input" type="text" placeholder="Reminder message" />
                </div>
                <div class="filters-group">
                  <label class="filters-label">SMS</label>
                  <select v-model="programReminderDraft.smsEnabled" class="filters-input">
                    <option :value="true">Enabled</option>
                    <option :value="false">In-app only</option>
                  </select>
                </div>
                <div class="filters-group">
                  <label class="filters-label">Schedule</label>
                  <select v-model="programReminderDraft.scheduleType" class="filters-input">
                    <option value="once">One-time</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div class="filters-group">
                  <label class="filters-label">Timezone</label>
                  <input v-model="programReminderDraft.timezone" class="filters-input" type="text" placeholder="America/New_York" />
                </div>
              </div>

              <div class="filters-row" style="align-items: flex-end; margin-top: 10px;">
                <div v-if="programReminderDraft.scheduleType === 'once'" class="filters-group" style="flex: 1;">
                  <label class="filters-label">Run At (local)</label>
                  <input v-model="programReminderDraft.runAt" class="filters-input" type="datetime-local" />
                </div>
                <div v-else class="filters-group" style="flex: 1;">
                  <label class="filters-label">Time (local)</label>
                  <input v-model="programReminderDraft.timeOfDay" class="filters-input" type="time" />
                </div>
                <div v-if="programReminderDraft.scheduleType === 'weekly'" class="filters-group" style="flex: 2;">
                  <label class="filters-label">Days</label>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    <label v-for="d in programReminderDays" :key="d.value" class="hint">
                      <input type="checkbox" :checked="programReminderDraft.daysOfWeek.includes(d.value)" @change="toggleProgramReminderDay(d.value)" />
                      {{ d.label }}
                    </label>
                  </div>
                </div>
                <div class="filters-group">
                  <button type="button" class="btn btn-primary btn-sm" @click="createProgramReminder" :disabled="programReminderSaving || !programReminderDraft.message">
                    {{ programReminderSaving ? 'Saving…' : 'Schedule reminder' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="activeTab === 'notifications' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-section-divider"
            style="margin-top: 18px; margin-bottom: 16px; padding-top: 18px; border-top: 2px solid var(--border);"
          >
            <h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Notification Triggers</h4>
            <small class="hint">Platform-level notification initiators. Default is ON; customize per agency.</small>
          </div>

          <div
            v-if="activeTab === 'notifications' && editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-group"
          >
            <div v-if="notificationTriggersError" class="error-modal">
              <strong>Error:</strong> {{ notificationTriggersError }}
            </div>
            <div class="filters-row" style="align-items: flex-end; margin-bottom: 10px;">
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadNotificationTriggers" :disabled="notificationTriggersLoading || !editingAgency?.id">
                  {{ notificationTriggersLoading ? 'Loading…' : 'Reload' }}
                </button>
              </div>
            </div>

            <div v-if="notificationTriggersLoading" class="loading">Loading notification triggers…</div>
            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Trigger</th>
                    <th>Enabled</th>
                    <th>Recipients</th>
                    <th>Channels</th>
                    <th class="right"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in notificationTriggers" :key="t.triggerKey">
                    <td style="min-width: 260px;">
                      <div><strong>{{ t.name }}</strong></div>
                      <div class="hint" style="margin-top: 4px;">{{ t.description }}</div>
                      <div class="hint" style="margin-top: 4px;"><code>{{ t.triggerKey }}</code></div>
                    </td>
                    <td>
                      <ToggleSwitch v-model="getTriggerEdit(t.triggerKey).enabled" compact />
                    </td>
                    <td>
                      <div class="hint"><ToggleSwitch v-model="getTriggerEdit(t.triggerKey).recipients.provider" label="Provider" compact /></div>
                      <div class="hint"><ToggleSwitch v-model="getTriggerEdit(t.triggerKey).recipients.supervisor" label="Supervisor" compact /></div>
                      <div class="hint"><ToggleSwitch v-model="getTriggerEdit(t.triggerKey).recipients.clinicalPracticeAssistant" label="Clinical Practice Assistant" compact /></div>
                      <div class="hint"><ToggleSwitch v-model="getTriggerEdit(t.triggerKey).recipients.admin" label="Admin" compact /></div>
                    </td>
                    <td>
                      <div class="hint"><ToggleSwitch :model-value="true" disabled label="Web app (in-app)" compact /></div>
                      <div class="hint"><ToggleSwitch v-model="getTriggerEdit(t.triggerKey).channels.sms" label="Text (SMS)" compact /></div>
                      <div class="hint"><ToggleSwitch :model-value="false" disabled label="Email (coming soon)" compact /></div>
                    </td>
                    <td class="right">
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        @click="saveNotificationTrigger(t)"
                        :disabled="savingNotificationTriggerKey === t.triggerKey || !editingAgency?.id"
                      >
                        {{ savingNotificationTriggerKey === t.triggerKey ? 'Saving…' : 'Save' }}
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!notificationTriggers.length">
                    <td colspan="5" class="empty-state-inline">No triggers found.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <!-- Theme Settings Section -->
          <div v-if="activeTab === 'theme'" class="tab-section">
          <div class="form-section-divider" style="margin-top: 24px; margin-bottom: 16px; padding-top: 24px; border-top: 2px solid var(--border);">
            <h4 style="margin: 0 0 16px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Theme Settings</h4>
          </div>
          
          <div class="form-group">
            <label>Font Family</label>
            <select v-model="agencyForm.themeSettings.fontFamily">
              <option value="">Default (System Font)</option>
              <option
                v-for="opt in themeFontOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <small>Font family for the portal theme</small>
          </div>
          
          <div class="form-group">
            <label>Login Background</label>
            <input 
              v-model="agencyForm.themeSettings.loginBackground" 
              type="text" 
              placeholder="linear-gradient(135deg, #C69A2B 0%, #D4B04A 100%) or URL to image"
            />
            <small>CSS gradient or image URL for login page background</small>
          </div>
          
          <div class="form-group">
            <ToggleSwitch v-model="agencyForm.isActive" label="Active" />
          </div>
          </div>
          
          <div v-if="activeTab === 'general' && editingAgency" class="form-group">
            <button 
              type="button" 
              @click="toggleAgencyStatus" 
              :class="['btn', agencyForm.isActive ? 'btn-warning' : 'btn-success']"
            >
              {{ agencyForm.isActive ? 'Deactivate Agency' : 'Activate Agency' }}
            </button>
            <small v-if="agencyForm.isActive" style="display: block; margin-top: 8px; color: var(--text-secondary);">
              Deactivating this agency will prevent new assignments and hide it from non-admin users.
            </small>
            <small v-else style="display: block; margin-top: 8px; color: var(--text-secondary);">
              Activating this agency will make it available for assignments and visible to users.
            </small>
          </div>
          
          <div v-if="activeTab === 'terminology'" class="tab-section">
          <div class="settings-section-divider">
            <h4>Agency Terminology Overrides</h4>
            <p class="section-description">
              Override platform-wide terminology for this agency. Leave blank to use platform defaults.
            </p>
          </div>
          
          <div class="terminology-grid">
            <div class="terminology-item">
            <label>People Operations Term</label>
            <input v-model="agencyForm.terminologySettings.peopleOpsTerm" type="text" placeholder="Leave blank for platform default" />
            <small>Platform default: "People Operations"</small>
          </div>
            <div class="terminology-item">
            <label>Training Modules Term</label>
            <input v-model="agencyForm.terminologySettings.trainingModulesTerm" type="text" placeholder="Leave blank for platform default" />
            <small>Platform default: "Training Modules"</small>
          </div>
            <div class="terminology-item">
            <label>Training Focus Term</label>
            <input v-model="agencyForm.terminologySettings.trainingFocusTerm" type="text" placeholder="Leave blank for platform default" />
            <small>Platform default: "Training Focus"</small>
          </div>
            <div class="terminology-item">
            <label>Onboarding Term</label>
            <input v-model="agencyForm.terminologySettings.onboardingTerm" type="text" placeholder="Leave blank for platform default" />
            <small>Platform default: "Onboarding"</small>
          </div>
            <div class="terminology-item">
            <label>Ongoing Development Term</label>
            <input v-model="agencyForm.terminologySettings.ongoingDevTerm" type="text" placeholder="Leave blank for platform default" />
            <small>Platform default: "Ongoing Development"</small>
            </div>
          </div>
          
          <!-- Custom Parameters for Email Templates -->
          <div class="form-group">
            <label>Custom Email Template Parameters</label>
            <p class="form-help"><span v-pre>Add custom parameters that can be used in email templates. These will be available as {{AGENCY_PARAMETER_NAME}} in templates.</span></p>
            <div v-for="(key, index) in customParamKeys" :key="`param-${index}-${key}`" class="custom-param-row">
              <input 
                :value="key" 
                type="text" 
                placeholder="Parameter name (e.g., department_name)"
                class="param-key-input"
                @input="updateCustomParameterKey(index, $event.target.value)"
              />
              <span class="param-separator">→</span>
              <input 
                :value="getCustomParameterValue(key)" 
                type="text" 
                placeholder="Value"
                class="param-value-input"
                @input="(e) => updateCustomParameterValue(key, e.target.value)"
              />
              <button 
                type="button" 
                @click="removeCustomParameter(key)" 
                class="btn btn-danger btn-sm"
              >
                Remove
              </button>
            </div>
            <button 
              type="button" 
              @click="addCustomParameter" 
              class="btn btn-secondary btn-sm"
              style="margin-top: 8px;"
            >
              + Add Parameter
            </button>
          </div>
          </div>
          </div>
          
          <!-- Customize Icons Tab -->
          <div v-show="activeTab === 'icons'" class="tab-content">
          <div class="settings-section-divider">
              <h4>Icon Templates</h4>
            <p class="section-description">
                Apply a saved icon set to this organization in one click, or save the current icon set as a template.
              </p>
            </div>

            <div class="icon-templates-row">
              <div class="form-group" style="margin: 0;">
                <label>Choose Template</label>
                <select v-model="selectedIconTemplateId" class="template-select">
                  <option value="">-- Select an icon template --</option>
                  <option v-for="t in iconTemplates" :key="t.id" :value="String(t.id)">
                    {{ t.name }}
                  </option>
                </select>
              </div>

              <div class="template-actions">
                <button type="button" class="btn btn-secondary" :disabled="!selectedIconTemplateId" @click="applySelectedIconTemplate">
                  Apply Template
                </button>
                <button type="button" class="btn btn-secondary" @click="clearIconsToPlatformDefaults">
                  Clear to Platform Defaults
                </button>
                <button type="button" class="btn btn-primary" @click="openSaveIconTemplateModal">
                  Save as Template
                </button>
              </div>
            </div>

            <div class="settings-section-divider">
              <h4>Organization Icon</h4>
              <p class="section-description">
                The main icon representing this organization.
            </p>
          </div>
          
          <div class="form-group">
              <label>Organization Icon</label>
              <IconSelector v-model="agencyForm.iconId" label="Select Organization Icon" :defaultAgencyId="editingAgency?.id || null" />
              <small>Main icon displayed for this organization</small>
            </div>

            <div class="settings-section-divider">
              <h4>Chat</h4>
              <p class="section-description">
                Icon used for the left-side chat button.
              </p>
          </div>
          
          <div class="form-group">
              <label>Chat Icon</label>
              <IconSelector v-model="agencyForm.chatIconId" :defaultAgencyId="editingAgency?.id || null" />
              <small>Overrides the platform chat icon for this organization</small>
            </div>
            
            <div class="settings-section-divider">
              <h4>Default Icons</h4>
              <p class="section-description">
                Set default icons for this organization. These override system-wide defaults. Individual items can still have their own icons.
              </p>
            </div>
            
            <div class="default-icons-grid">
              <div class="default-icon-item">
                <label>Training Focus Default Icon</label>
                <IconSelector v-model="agencyForm.trainingFocusDefaultIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Default icon for training focuses when no specific icon is assigned</small>
              </div>
              <div class="default-icon-item">
            <label>Module Default Icon</label>
                <IconSelector v-model="agencyForm.moduleDefaultIconId" :defaultAgencyId="editingAgency?.id || null" />
            <small>Default icon for modules when no specific icon is assigned</small>
          </div>
              <div class="default-icon-item">
            <label>User Default Icon</label>
                <IconSelector v-model="agencyForm.userDefaultIconId" :defaultAgencyId="editingAgency?.id || null" />
            <small>Default icon for users when no specific icon is assigned</small>
          </div>
              <div class="default-icon-item">
            <label>Document Default Icon</label>
                <IconSelector v-model="agencyForm.documentDefaultIconId" :defaultAgencyId="editingAgency?.id || null" />
            <small>Default icon for documents when no specific icon is assigned</small>
              </div>
          </div>
          
          <div class="settings-section-divider">
            <h4>Dashboard Action Icons</h4>
            <p class="section-description">
                Icons displayed on the dashboard quick action cards. These override platform defaults for this organization.
            </p>
          </div>
          
            <div class="dashboard-icons-grid">
              <div class="dashboard-icon-item">
                <label>Manage Organizations Icon</label>
                <IconSelector v-model="agencyForm.manageAgenciesIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the \"Manage Organizations\" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Notifications Icon</label>
                <IconSelector v-model="agencyForm.dashboardNotificationsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Notifications" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Communications Icon</label>
                <IconSelector v-model="agencyForm.dashboardCommunicationsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Communications" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Chats Icon</label>
                <IconSelector v-model="agencyForm.dashboardChatsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Chats" action card</small>
              </div>
              <div class="dashboard-icon-item">
            <label>Progress Dashboard Icon</label>
                <IconSelector v-model="agencyForm.progressDashboardIconId" :defaultAgencyId="editingAgency?.id || null" />
            <small>Icon for the "Progress Dashboard" action card</small>
          </div>
              <div class="dashboard-icon-item">
                <label>View All Progress Icon</label>
                <IconSelector v-model="agencyForm.viewAllProgressIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the \"View All Progress\" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Manage Clients Icon</label>
                <IconSelector v-model="agencyForm.manageClientsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Manage Clients" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>School Overview Icon</label>
                <IconSelector v-model="agencyForm.schoolOverviewIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "School Overview" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Agency Calendar Icon</label>
                <IconSelector v-model="agencyForm.externalCalendarAuditIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Agency Calendar" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Payroll Icon</label>
                <IconSelector v-model="agencyForm.dashboardPayrollIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Payroll" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Billing Icon</label>
                <IconSelector v-model="agencyForm.dashboardBillingIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Billing" action card</small>
              </div>
              <div class="dashboard-icon-item">
            <label>Manage Modules Icon</label>
                <IconSelector v-model="agencyForm.manageModulesIconId" :defaultAgencyId="editingAgency?.id || null" />
            <small>Icon for the "Manage Modules" action card</small>
          </div>
              <div class="dashboard-icon-item">
            <label>Manage Documents Icon</label>
                <IconSelector v-model="agencyForm.manageDocumentsIconId" :defaultAgencyId="editingAgency?.id || null" />
            <small>Icon for the "Manage Documents" action card</small>
          </div>
              <div class="dashboard-icon-item">
            <label>Manage Users Icon</label>
                <IconSelector v-model="agencyForm.manageUsersIconId" :defaultAgencyId="editingAgency?.id || null" />
            <small>Icon for the "Manage Users" action card</small>
          </div>
              <div class="dashboard-icon-item">
                <label>Platform Settings Icon</label>
                <IconSelector v-model="agencyForm.platformSettingsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the \"Platform Settings\" action card</small>
              </div>
              <div class="dashboard-icon-item">
            <label>Settings Icon</label>
                <IconSelector v-model="agencyForm.settingsIconId" :defaultAgencyId="editingAgency?.id || null" />
            <small>Icon for the "Settings" action card</small>
              </div>
          </div>
          
            <div class="settings-section-divider">
              <h4>My Dashboard Card Icons</h4>
              <p class="section-description">
                Icons displayed on the user-facing "My Dashboard" cards. These override platform defaults for this organization.
              </p>
            </div>

            <div class="dashboard-icons-grid">
              <div class="dashboard-icon-item">
                <label>Checklist Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardChecklistIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Checklist" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Training Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardTrainingIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Training" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Documents Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardDocumentsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Documents" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>My Schedule Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardMyScheduleIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "My Schedule" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Clients Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardClientsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Clients" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Tools &amp; Aids Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardClinicalNoteGeneratorIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Tools &amp; Aids" card (providers only; if enabled)</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Submit Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardSubmitIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Submit" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Payroll Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardPayrollIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Payroll" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>My Account Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardMyAccountIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "My Account" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>On-Demand Training Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardOnDemandTrainingIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "On-Demand Training" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Communications Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardCommunicationsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Communications" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Chats Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardChatsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Chats" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Notifications Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardNotificationsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Notifications" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Supervision Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardSupervisionIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Supervision" card (supervisors only)</small>
              </div>
            </div>

            <div v-if="String(agencyForm.organizationType || 'agency').toLowerCase() === 'agency'" class="settings-section-divider">
              <h4>School Portal Card Icons</h4>
              <p class="section-description">
                Icons displayed on the School Portal home cards (Providers, Days, Roster, Skills Groups, Contact Admin) for affiliated schools/programs. These override platform defaults.
              </p>
            </div>

            <div v-if="String(agencyForm.organizationType || 'agency').toLowerCase() === 'agency'" class="dashboard-icons-grid">
              <div class="dashboard-icon-item">
                <label>Providers Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalProvidersIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Providers" card in school portals</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Days Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalDaysIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Days" card in school portals</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Roster Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalRosterIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Roster" card in school portals</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Skills Groups Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalSkillsGroupsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Skills Groups" card in school portals</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Contact Admin Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalContactAdminIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Contact admin" card in school portals</small>
              </div>
              <div class="dashboard-icon-item">
                <label>School Staff Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalSchoolStaffIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "School staff" card in school portals</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Parent QR code Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalParentQrIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Parent QR code" card in school portals</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Parent fill + sign Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalParentSignIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Parent fill + sign" card in school portals</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Upload packet Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalUploadPacketIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Upload packet" card in school portals</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Documents Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalPublicDocumentsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Documents" card in school portals</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Announcements Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalAnnouncementsIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "Announcements" card in school portals</small>
              </div>
              <div class="dashboard-icon-item">
                <label>FAQ Card Icon</label>
                <IconSelector v-model="agencyForm.schoolPortalFaqIconId" :defaultAgencyId="editingAgency?.id || null" />
                <small>Icon for the "FAQ" card in school portals</small>
              </div>
            </div>
            
            <div class="settings-section-divider">
              <h4>Notification Icons</h4>
              <p class="section-description">
                Set custom icons for different notification types. These override platform defaults.
              </p>
            </div>
            
            <div class="notification-icons-grid">
              <div class="notification-icon-item">
                <label>Status Expired</label>
                <IconSelector v-model="agencyForm.statusExpiredIconId" :defaultAgencyId="editingAgency?.id || null" />
              </div>
              <div class="notification-icon-item">
                <label>Temp Password Expired</label>
                <IconSelector v-model="agencyForm.tempPasswordExpiredIconId" :defaultAgencyId="editingAgency?.id || null" />
              </div>
              <div class="notification-icon-item">
                <label>Task Overdue</label>
                <IconSelector v-model="agencyForm.taskOverdueIconId" :defaultAgencyId="editingAgency?.id || null" />
              </div>
              <div class="notification-icon-item">
                <label>Onboarding Completed</label>
                <IconSelector v-model="agencyForm.onboardingCompletedIconId" :defaultAgencyId="editingAgency?.id || null" />
              </div>
              <div class="notification-icon-item">
                <label>Invitation Expired</label>
                <IconSelector v-model="agencyForm.invitationExpiredIconId" :defaultAgencyId="editingAgency?.id || null" />
              </div>
              <div class="notification-icon-item">
                <label>First Login</label>
                <IconSelector v-model="agencyForm.firstLoginIconId" :defaultAgencyId="editingAgency?.id || null" />
              </div>
              <div class="notification-icon-item">
                <label>First Login (Pending)</label>
                <IconSelector v-model="agencyForm.firstLoginPendingIconId" :defaultAgencyId="editingAgency?.id || null" />
              </div>
              <div class="notification-icon-item">
                <label>Password Changed</label>
                <IconSelector v-model="agencyForm.passwordChangedIconId" :defaultAgencyId="editingAgency?.id || null" />
              </div>
              <div class="notification-icon-item">
                <label>Support Tickets</label>
                <IconSelector v-model="agencyForm.supportTicketCreatedIconId" :defaultAgencyId="editingAgency?.id || null" />
              </div>
            </div>
          </div>

          <!-- Payroll Tab (agency-only) -->
          <div v-show="activeTab === 'payroll'" class="tab-content">
            <div class="settings-section-divider">
              <h4>Med Cancel (Payroll)</h4>
              <p class="section-description">
                Configure the pay service code and per-missed-service rates for providers marked “Low” or “High”.
              </p>
            </div>

            <div v-if="medcancelPolicyError" class="error-modal">
              <strong>Error:</strong> {{ medcancelPolicyError }}
            </div>

            <div class="filters-row" style="align-items: flex-end;">
              <div class="filters-group" style="min-width: 240px;">
                <label class="filters-label">Display name (UI label)</label>
                <input v-model="medcancelPolicyDraft.displayName" class="filters-input" type="text" :disabled="medcancelPolicyLoading || medcancelPolicySaving" />
                <div class="filters-hint" style="margin-top: 6px;">
                  This is what users will see instead of “Med Cancel”.
                </div>
              </div>
              <div class="filters-group" style="min-width: 240px;">
                <label class="filters-label">Pay service code</label>
                <input v-model="medcancelPolicyDraft.serviceCode" class="filters-input" type="text" :disabled="medcancelPolicyLoading || medcancelPolicySaving" />
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadMedcancelPolicy" :disabled="medcancelPolicyLoading || !editingAgency?.id">
                  {{ medcancelPolicyLoading ? 'Loading…' : 'Reload' }}
                </button>
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-primary btn-sm" @click="saveMedcancelPolicy" :disabled="medcancelPolicySaving || !editingAgency?.id">
                  {{ medcancelPolicySaving ? 'Saving…' : 'Save Med Cancel policy' }}
                </button>
              </div>
            </div>

            <div class="filters-row" style="align-items: flex-end; margin-top: 10px;">
              <div class="filters-group" style="min-width: 260px;">
                <label class="filters-label">Add missed service code</label>
                <input v-model="newMedcancelMissedServiceCode" class="filters-input" type="text" placeholder="e.g., 90832" :disabled="medcancelPolicyLoading || medcancelPolicySaving" />
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="addMedcancelMissedServiceCode" :disabled="medcancelPolicyLoading || medcancelPolicySaving || !String(newMedcancelMissedServiceCode||'').trim()">
                  Add
                </button>
              </div>
            </div>

            <div class="table-wrap" style="margin-top: 10px;">
              <table class="table">
                <thead>
                  <tr>
                    <th>Missed service code</th>
                    <th class="right">Low ($)</th>
                    <th class="right">High ($)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="code in medcancelMissedServiceCodes" :key="code">
                    <td><strong>{{ code }}</strong></td>
                    <td class="right">
                      <input
                        v-model.number="medcancelPolicyDraft.schedules.low[code]"
                        type="number"
                        step="0.01"
                        min="0"
                        style="width: 140px;"
                        :disabled="medcancelPolicyLoading || medcancelPolicySaving"
                      />
                    </td>
                    <td class="right">
                      <input
                        v-model.number="medcancelPolicyDraft.schedules.high[code]"
                        type="number"
                        step="0.01"
                        min="0"
                        style="width: 140px;"
                        :disabled="medcancelPolicyLoading || medcancelPolicySaving"
                      />
                    </td>
                    <td class="right">
                      <button type="button" class="btn btn-danger btn-sm" @click="removeMedcancelMissedServiceCode(code)" :disabled="medcancelPolicyLoading || medcancelPolicySaving">
                        Remove
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!medcancelMissedServiceCodes.length">
                    <td colspan="4" class="muted">No missed service codes configured.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="settings-section-divider">
              <h4>Mileage Rates (Tier 1/2/3)</h4>
              <p class="section-description">
                Set per-mile reimbursement rates used for approving School Mileage submissions.
              </p>
            </div>

            <div v-if="mileageRatesError" class="error-modal">
              <strong>Error:</strong> {{ mileageRatesError }}
            </div>

            <div class="filters-row" style="align-items: flex-end;">
              <div class="filters-group">
                <label class="filters-label">Tier 1 ($/mile)</label>
                <input v-model="mileageRatesDraft.tier1" class="filters-input" type="number" step="0.0001" min="0" :disabled="mileageRatesLoading || savingMileageRates" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Tier 2 ($/mile)</label>
                <input v-model="mileageRatesDraft.tier2" class="filters-input" type="number" step="0.0001" min="0" :disabled="mileageRatesLoading || savingMileageRates" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Tier 3 ($/mile)</label>
                <input v-model="mileageRatesDraft.tier3" class="filters-input" type="number" step="0.0001" min="0" :disabled="mileageRatesLoading || savingMileageRates" />
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadMileageRates" :disabled="mileageRatesLoading || !editingAgency?.id">
                  {{ mileageRatesLoading ? 'Loading…' : 'Reload' }}
                </button>
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-primary btn-sm" @click="saveMileageRates" :disabled="savingMileageRates || !editingAgency?.id">
                  {{ savingMileageRates ? 'Saving…' : 'Save rates' }}
                </button>
              </div>
            </div>

            <div class="settings-section-divider" style="margin-top: 18px;">
              <h4>PTO Policy (Sick Leave + Training PTO)</h4>
              <p class="section-description">
                Configure PTO accrual, caps, and the default PTO pay rate used when PTO requests are approved.
              </p>
            </div>

            <div v-if="ptoPolicyError" class="error-modal">
              <strong>Error:</strong> {{ ptoPolicyError }}
            </div>

            <div class="filters-row" style="align-items: flex-end;">
              <div class="filters-group">
                <label class="filters-label">PTO enabled</label>
                <select v-model="ptoPolicyDraft.ptoEnabled" class="filters-select" :disabled="ptoPolicyLoading || savingPtoPolicy">
                  <option :value="true">Enabled</option>
                  <option :value="false">Disabled</option>
                </select>
              </div>
              <div class="filters-group">
                <label class="filters-label">Default PTO pay rate ($/hr)</label>
                <input v-model="ptoPolicyDraft.defaultPayRate" class="filters-input" type="number" step="0.01" min="0" :disabled="ptoPolicyLoading || savingPtoPolicy" />
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadPtoPolicy" :disabled="ptoPolicyLoading || !editingAgency?.id">
                  {{ ptoPolicyLoading ? 'Loading…' : 'Reload' }}
                </button>
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-primary btn-sm" @click="savePtoPolicy" :disabled="savingPtoPolicy || !editingAgency?.id">
                  {{ savingPtoPolicy ? 'Saving…' : 'Save PTO policy' }}
                </button>
              </div>
            </div>

            <div class="filters-row" style="align-items: flex-end; margin-top: 10px;">
              <div class="filters-group">
                <label class="filters-label">Sick accrual (hours per 30)</label>
                <input v-model="ptoPolicyDraft.sickAccrualPer30" class="filters-input" type="number" step="0.01" min="0" :disabled="ptoPolicyLoading || savingPtoPolicy" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Training PTO enabled</label>
                <select v-model="ptoPolicyDraft.trainingPtoEnabled" class="filters-select" :disabled="ptoPolicyLoading || savingPtoPolicy">
                  <option :value="true">Enabled</option>
                  <option :value="false">Disabled</option>
                </select>
              </div>
              <div class="filters-group">
                <label class="filters-label">Sick annual rollover cap (hours)</label>
                <input v-model="ptoPolicyDraft.sickAnnualRolloverCap" class="filters-input" type="number" step="0.01" min="0" :disabled="ptoPolicyLoading || savingPtoPolicy" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Sick max accrual (hours)</label>
                <input v-model="ptoPolicyDraft.sickAnnualMaxAccrual" class="filters-input" type="number" step="0.01" min="0" :disabled="ptoPolicyLoading || savingPtoPolicy" />
              </div>
            </div>

            <div class="filters-row" style="align-items: flex-end; margin-top: 10px;">
              <div class="filters-group">
                <label class="filters-label">Training accrual (hours per 30)</label>
              <input 
                  v-model="ptoPolicyDraft.trainingAccrualPer30"
                  class="filters-input"
                  type="number"
                  step="0.01"
                  min="0"
                  :disabled="ptoPolicyLoading || savingPtoPolicy || ptoPolicyDraft.trainingPtoEnabled !== true"
                />
              </div>
              <div class="filters-group">
                <label class="filters-label">Training max balance (hours)</label>
              <input 
                  v-model="ptoPolicyDraft.trainingMaxBalance"
                  class="filters-input"
                  type="number"
                  step="0.01"
                  min="0"
                  :disabled="ptoPolicyLoading || savingPtoPolicy || ptoPolicyDraft.trainingPtoEnabled !== true"
                />
              </div>
              <div class="filters-group">
                <label class="filters-label">Forfeit Training PTO on termination</label>
                <select v-model="ptoPolicyDraft.trainingForfeitOnTermination" class="filters-select" :disabled="ptoPolicyLoading || savingPtoPolicy || ptoPolicyDraft.trainingPtoEnabled !== true">
                  <option :value="true">Yes</option>
                  <option :value="false">No</option>
                </select>
              </div>
              <div class="filters-group">
                <label class="filters-label">Consecutive limit (hours)</label>
                <input v-model="ptoPolicyDraft.ptoConsecutiveUseLimitHours" class="filters-input" type="number" step="0.01" min="0" :disabled="ptoPolicyLoading || savingPtoPolicy" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Notice days</label>
                <input v-model="ptoPolicyDraft.ptoConsecutiveUseNoticeDays" class="filters-input" type="number" step="1" min="0" :disabled="ptoPolicyLoading || savingPtoPolicy" />
              </div>
            </div>

            <div class="settings-section-divider" style="margin-top: 18px;">
              <h4>Supervision Tracking (Pre-licensed)</h4>
              <p class="section-description">
                Enable supervision hour tracking for pre-licensed providers (based on their License Type/Number field), and configure the default schedule after 50 individual hours.
              </p>
            </div>

            <div v-if="supervisionError" class="error-modal">
              <strong>Error:</strong> {{ supervisionError }}
            </div>

            <div class="filters-row" style="align-items: flex-end;">
              <div class="filters-group">
                <label class="filters-label">Enabled</label>
                <select v-model="supervisionDraft.enabled" class="filters-select" :disabled="supervisionLoading || savingSupervision">
                  <option :value="true">Enabled</option>
                  <option :value="false">Disabled</option>
                </select>
              </div>
              <div class="filters-group">
                <label class="filters-label">Eligible credentials (comma-separated)</label>
                <input v-model="supervisionDraft.eligibleCredentialCodesCsv" class="filters-input" type="text" :disabled="supervisionLoading || savingSupervision" />
              </div>
            </div>

            <div class="filters-row" style="align-items: flex-end; margin-top: 10px;">
              <div class="filters-group">
                <label class="filters-label">After 50 individual hours: cadence (weeks)</label>
                <input v-model="supervisionDraft.after50CadenceWeeks" class="filters-input" type="number" step="1" min="1" :disabled="supervisionLoading || savingSupervision || supervisionDraft.enabled !== true" />
              </div>
              <div class="filters-group">
                <label class="filters-label">After 50 individual hours: minutes</label>
                <input v-model="supervisionDraft.after50Minutes" class="filters-input" type="number" step="5" min="5" :disabled="supervisionLoading || savingSupervision || supervisionDraft.enabled !== true" />
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadSupervisionPolicy" :disabled="supervisionLoading || !editingAgency?.id">
                  {{ supervisionLoading ? 'Loading…' : 'Reload' }}
                </button>
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-primary btn-sm" @click="saveSupervisionPolicy" :disabled="savingSupervision || !editingAgency?.id">
                  {{ savingSupervision ? 'Saving…' : 'Save supervision policy' }}
                </button>
              </div>
            </div>

            <div class="filters-hint" style="margin-top: 8px;">
              CSV import is done per pay period in Payroll → selected pay period → Supervision import. Columns: <code>email</code> (or <code>user_id</code>), <code>individual_hours</code>, <code>group_hours</code>.
            </div>

            <div class="settings-section-divider" style="margin-top: 18px;">
              <h4>Agency Holidays</h4>
              <p class="section-description">
                Configure explicit holiday dates and the holiday bonus policy (% of service pay for payable services on those dates).
              </p>
            </div>

            <div v-if="holidayPayPolicyError" class="error-modal">
              <strong>Error:</strong> {{ holidayPayPolicyError }}
            </div>
            <div v-if="agencyHolidaysError" class="error-modal" style="margin-top: 10px;">
              <strong>Error:</strong> {{ agencyHolidaysError }}
            </div>

            <div class="filters-row" style="align-items: flex-end;">
              <div class="filters-group" style="min-width: 220px;">
                <label class="filters-label">Holiday pay policy (%)</label>
                <input
                  v-model.number="holidayPayPolicyDraft.percentage"
                  class="filters-input"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  :disabled="holidayPayPolicyLoading || holidayPayPolicySaving"
                />
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadHolidayPayPolicy" :disabled="holidayPayPolicyLoading || !editingAgency?.id">
                  {{ holidayPayPolicyLoading ? 'Loading…' : 'Reload' }}
                </button>
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-primary btn-sm" @click="saveHolidayPayPolicy" :disabled="holidayPayPolicySaving || !editingAgency?.id">
                  {{ holidayPayPolicySaving ? 'Saving…' : 'Save holiday policy' }}
                </button>
              </div>
            </div>

            <div class="filters-row" style="align-items: flex-end; margin-top: 10px;">
              <div class="filters-group" style="min-width: 260px;">
                <label class="filters-label">Missing approval notification</label>
                <div class="filters-hint" style="margin-top: 6px;">
                  <ToggleSwitch v-model="holidayPayPolicyDraft.notifyMissingApproval" label="Enable notification if Holiday Bonus is assessed but not approved/rejected" compact />
                </div>
                <div class="filters-hint" style="margin-top: 6px;">
                  <ToggleSwitch v-model="holidayPayPolicyDraft.notifyStrictMessage" :disabled="holidayPayPolicyDraft.notifyMissingApproval !== true" label="Use strict handbook/remediation message" compact />
                </div>
              </div>
              <div class="filters-group" style="flex: 1 1 auto;">
                <div class="filters-hint">
                  Tip: Recipient roles and enable/disable can also be controlled via the Notification Triggers section.
                </div>
              </div>
            </div>

            <div class="filters-row" style="align-items: flex-end; margin-top: 10px;">
              <div class="filters-group" style="min-width: 220px;">
                <label class="filters-label">Holiday date</label>
                <input v-model="newHolidayDate" class="filters-input" type="date" :disabled="agencyHolidaysLoading || agencyHolidaysSaving" />
              </div>
              <div class="filters-group" style="min-width: 260px;">
                <label class="filters-label">Name</label>
                <input v-model="newHolidayName" class="filters-input" type="text" placeholder="e.g., New Year's Day" :disabled="agencyHolidaysLoading || agencyHolidaysSaving" />
              </div>
              <div class="filters-group">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="addAgencyHoliday"
                  :disabled="agencyHolidaysLoading || agencyHolidaysSaving || !String(newHolidayDate||'').trim() || !String(newHolidayName||'').trim()"
                >
                  Add
                </button>
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadAgencyHolidays" :disabled="agencyHolidaysLoading || !editingAgency?.id">
                  {{ agencyHolidaysLoading ? 'Loading…' : 'Reload holidays' }}
                </button>
              </div>
            </div>

            <div class="table-wrap" style="margin-top: 10px;">
              <table class="table">
                <thead>
                  <tr>
                    <th style="width: 160px;">Date</th>
                    <th>Name</th>
                    <th style="width: 140px;"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="h in (agencyHolidays || [])" :key="h.id || `${h.holiday_date}-${h.name}`">
                    <td><strong>{{ String(h.holiday_date || h.holidayDate || '').slice(0, 10) }}</strong></td>
                    <td>{{ h.name }}</td>
                    <td class="right">
                      <button type="button" class="btn btn-danger btn-sm" @click="removeAgencyHoliday(h)" :disabled="agencyHolidaysSaving">
                        Remove
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!(agencyHolidays || []).length">
                    <td colspan="3" class="muted">No holidays configured.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="settings-section-divider">
              <h4>Payroll Service Codes (Equivalencies)</h4>
              <p class="section-description">
                Edit how each service code converts units → hours and whether it counts for tier credits. This drives payroll calculations.
              </p>
            </div>

            <div class="settings-section-divider" style="margin-top: 18px;">
              <h4>Other rate titles (1/2/3)</h4>
              <p class="section-description">
                These labels appear on provider compensation screens for the “Other” hourly rate slots.
              </p>
            </div>

            <div v-if="otherRateTitlesError" class="error-modal">
              <strong>Error:</strong> {{ otherRateTitlesError }}
            </div>
            <div v-if="otherRateTitlesLoading" class="loading">Loading other rate titles…</div>
            <div v-else class="filters-row" style="align-items: flex-end;">
              <div class="filters-group">
                <label class="filters-label">Other 1 title</label>
                <input v-model="otherRateTitlesDraft.title1" class="filters-input" type="text" :disabled="otherRateTitlesSaving" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Other 2 title</label>
                <input v-model="otherRateTitlesDraft.title2" class="filters-input" type="text" :disabled="otherRateTitlesSaving" />
              </div>
              <div class="filters-group">
                <label class="filters-label">Other 3 title</label>
                <input v-model="otherRateTitlesDraft.title3" class="filters-input" type="text" :disabled="otherRateTitlesSaving" />
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadOtherRateTitles" :disabled="otherRateTitlesLoading || !editingAgency?.id">
                  Reload
                </button>
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-primary btn-sm" @click="saveOtherRateTitles" :disabled="otherRateTitlesSaving || !editingAgency?.id">
                  {{ otherRateTitlesSaving ? 'Saving…' : 'Save titles' }}
                </button>
              </div>
            </div>

            <div v-if="payrollRulesError" class="error-modal">
              <strong>Error:</strong> {{ payrollRulesError }}
            </div>
            <div v-if="payrollRulesLoading" class="loading">Loading payroll service codes…</div>

            <div v-if="!payrollRulesLoading" class="filters-row" style="align-items: flex-end; margin-top: 8px;">
              <div class="filters-group">
                <button type="button" class="btn btn-secondary btn-sm" @click="loadPayrollRules" :disabled="payrollRulesLoading || savingPayrollRule || !editingAgency?.id">
                  Reload
                </button>
              </div>
              <div class="filters-group">
              <button 
                type="button" 
                  class="btn btn-primary btn-sm"
                  @click="saveAllPayrollRules"
                  :disabled="savingPayrollRule || !dirtyPayrollRuleCodes.length"
              >
                  {{ savingPayrollRule ? 'Saving…' : `Save all (${dirtyPayrollRuleCodes.length})` }}
              </button>
            </div>
              <div class="filters-group" v-if="dirtyPayrollRuleCodes.length">
                <div class="filters-hint" style="margin-top: 0;">
                  <strong>Unsaved changes:</strong> {{ dirtyPayrollRuleCodes.slice(0, 12).join(', ') }}<span v-if="dirtyPayrollRuleCodes.length > 12">…</span>
                </div>
              </div>
            </div>

            <div v-if="!payrollRulesLoading" class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Service Code</th>
                    <th>Category (rate type)</th>
                    <th>Pay unit</th>
                    <th class="right">Pay Divisor</th>
                    <th class="right">Credit Value</th>
                    <th>Counts for Tier?</th>
                    <th>Other Slot</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in payrollRules" :key="r.service_code">
                    <td><strong>{{ r.service_code }}</strong></td>
                    <td>
                      <select v-model="r.category" @change="onPayrollRuleChanged(r)">
                        <option value="direct">direct</option>
                        <option value="indirect">indirect</option>
                        <option value="admin">admin</option>
                        <option value="meeting">meeting</option>
                        <option value="other">other</option>
                        <option value="tutoring">tutoring</option>
                        <option value="mileage">mileage</option>
                        <option value="bonus">bonus</option>
                        <option value="reimbursement">reimbursement</option>
                        <option value="other_pay">other_pay</option>
                      </select>
                    </td>
                    <td>
                      <select v-model="r.pay_rate_unit" @change="onPayrollRuleChanged(r)" title="Controls whether per-code rates pay by units or by computed pay-hours (units ÷ pay divisor).">
                        <option value="per_unit">per_unit</option>
                        <option value="per_hour">per_hour</option>
                      </select>
                    </td>
                    <td class="right">
                      <input v-model.number="r.pay_divisor" @change="onPayrollRuleChanged(r)" type="number" min="1" step="1" style="width: 110px;" />
                    </td>
                    <td class="right">
                      <input v-model.number="r.credit_value" @change="onPayrollRuleChanged(r)" type="number" min="0" step="0.00000000001" style="width: 140px;" />
                    </td>
                    <td>
                      <ToggleSwitch
                        :model-value="!!r.counts_for_tier"
                        compact
                        @update:modelValue="(v) => { r.counts_for_tier = v ? 1 : 0; onPayrollRuleChanged(r); }"
                      />
                    </td>
                    <td>
                      <select v-model.number="r.other_slot" @change="onPayrollRuleChanged(r)" :disabled="!(r.category === 'other' || r.category === 'tutoring')" title="Used only for 'other'/'tutoring' codes to pick which hourly 'Other Rate' slot (1/2/3) applies.">
                        <option :value="1">1</option>
                        <option :value="2">2</option>
                        <option :value="3">3</option>
                      </select>
                    </td>
                    <td class="right">
                      <div class="payroll-rule-actions">
            <button 
              type="button" 
              class="btn btn-secondary btn-sm"
                          @click="savePayrollRule(r)"
                          :disabled="savingPayrollRuleByCode[r.service_code] || !isPayrollRuleDirty(r)"
            >
                          Save
            </button>
                        <button
                          type="button"
                          class="btn btn-danger btn-sm"
                          @click="deletePayrollRule(r)"
                          :disabled="savingPayrollRule"
                        >
                          Delete
                        </button>
                        <span v-if="savingPayrollRuleByCode[r.service_code]" class="muted" style="margin-left: 8px;">Saving…</span>
                        <span v-else-if="isPayrollRuleDirty(r)" class="muted" style="margin-left: 8px;">Unsaved</span>
                        <span v-else-if="(payrollRuleSaveErrorByCode[r.service_code] || '').trim()" class="muted" style="margin-left: 8px;">
                          {{ payrollRuleSaveErrorByCode[r.service_code] }}
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!payrollRules.length">
                    <td colspan="9" class="empty-state-inline">No service code rules found.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="settings-section-divider" style="margin-top: 18px;">
              <h4>Add Service Code</h4>
            </div>
            <div class="filters-row" style="align-items: flex-end;">
              <div class="filters-group">
                <label class="filters-label">Service Code</label>
                <input v-model="newPayrollServiceCode" class="filters-input" type="text" placeholder="e.g., 90791" />
              </div>
              <div class="filters-group">
                <button type="button" class="btn btn-primary btn-sm" @click="addPayrollRule" :disabled="!newPayrollServiceCode || savingPayrollRule">
                  Add
                </button>
              </div>
            </div>
          </div>
          
          <div class="modal-actions">
            <button 
              v-if="editingAgency && userRole === 'super_admin' && (editingAgency.organization_type || 'agency') !== 'school'" 
              type="button" 
              @click="openPreviewModal(editingAgency.id)" 
              class="btn btn-info"
            >
              Preview Dashboard
            </button>
            <button
              v-if="editingAgency && isChildOrgRow(editingAgency)"
              type="button"
              class="btn btn-secondary"
              :disabled="applyingAffiliatedBranding"
              @click="applyAffiliatedAgencyBranding"
              title="Apply the affiliated agency’s branding and icon defaults"
            >
              {{ applyingAffiliatedBranding ? 'Applying…' : 'Apply Agency Branding' }}
            </button>
            <button 
              v-if="editingAgency && (editingAgency.organization_type || 'agency') === 'school'" 
              type="button" 
              @click="openSplashPreview(editingAgency)" 
              class="btn btn-info"
            >
              Preview Splash Page
            </button>
            <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
        </div>
      </section>
    </div>

    <div v-if="!showCreateModal && !editingAgency" class="empty-hint">
      Select an organization to edit settings. Use filters above the list to switch between Agencies and Organizations.
    </div>
    
    <!-- Assign Admin Modal -->
    <div v-if="showAssignAdminModal && selectedAgency" class="modal-overlay" @click="closeAssignAdminModal">
      <div class="modal-content" @click.stop>
        <h3>Assign Admin to {{ selectedAgency.name }}</h3>
        <form @submit.prevent="assignAdmin">
          <div class="form-group">
            <label>Select User *</label>
            <select v-model="selectedUserId" required>
              <option value="">Select a user</option>
              <option
                v-for="user in availableUsers"
                :key="user.id"
                :value="user.id"
                :disabled="agencyAdmins[selectedAgency.id]?.some(a => a.id === user.id)"
              >
                {{ user.first_name }} {{ user.last_name }} ({{ user.email }})
                <span v-if="user.role === 'super_admin'"> - Super Admin</span>
              </option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeAssignAdminModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="assigning">
              {{ assigning ? 'Assigning...' : 'Assign Admin' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Duplicate Organization Modal -->
    <div v-if="showDuplicateModal && duplicatingOrganization" class="modal-overlay" @click.self="closeDuplicateModal">
      <div class="modal-content" @click.stop>
        <h3>Duplicate {{ duplicatingOrganization.name }}</h3>
        <div v-if="duplicateError" class="error-modal">
          <strong>Error:</strong> {{ duplicateError }}
        </div>
        <form @submit.prevent="duplicateOrganization">
          <div class="form-group">
            <label>New Name *</label>
            <input v-model="duplicateForm.name" type="text" required />
          </div>
          <div class="form-group">
            <label>New Slug *</label>
            <input v-model="duplicateForm.slug" type="text" required pattern="[a-z0-9\\-]+" />
            <small>Lowercase letters, numbers, and hyphens only</small>
          </div>
          <div class="form-group">
            <label>Portal URL (optional)</label>
            <input v-model="duplicateForm.portalUrl" type="text" pattern="[a-z0-9\\-]+" placeholder="Defaults to slug" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="closeDuplicateModal" :disabled="duplicating">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="duplicating">
              {{ duplicating ? 'Duplicating…' : 'Duplicate' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Assign Staff Modal -->
    <div v-if="showAssignSupportModal && selectedAgency" class="modal-overlay" @click="closeAssignSupportModal">
      <div class="modal-content" @click.stop>
        <h3>Assign Staff to {{ selectedAgency.name }}</h3>
        <form @submit.prevent="assignSupport">
          <div class="form-group">
            <label>Select User *</label>
            <select v-model="selectedSupportUserId" required>
              <option value="">Select a user</option>
              <option
                v-for="user in availableUsers"
                :key="user.id"
                :value="user.id"
                :disabled="agencySupport[selectedAgency?.id]?.some(s => s.id === user.id) || false"
              >
                {{ user.first_name }} {{ user.last_name }} ({{ user.email }})
                <span v-if="user.role === 'super_admin'"> - Super Admin</span>
                <span v-else-if="user.role === 'admin'"> - Admin</span>
                <span v-else-if="user.role === 'support'"> - Support</span>
              </option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeAssignSupportModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="assigningSupport">
              {{ assigningSupport ? 'Assigning...' : 'Assign Staff' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Create/Edit Panel (rendered inline in the right pane) -->
    
    <!-- Dashboard Preview Modal -->
    <DashboardPreviewModal 
      v-if="showPreviewModal"
      :agency-id="previewAgencyId"
      :show="showPreviewModal"
      @close="closePreviewModal"
    />

    <SplashPagePreviewModal
      v-if="showSplashPreviewModal"
      :show="showSplashPreviewModal"
      :organization-slug="previewOrganizationSlug"
      :organization-id="previewOrganizationId"
      @close="closeSplashPreview"
    />

    <IconTemplateModal
      :show="showIconTemplateModal"
      :initial-icons="buildCurrentIconData()"
      :saving="savingIconTemplate"
      :error="iconTemplateError"
      @close="closeSaveIconTemplateModal"
      @save="saveIconTemplate"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import IconSelector from './IconSelector.vue';
import DashboardPreviewModal from './DashboardPreviewModal.vue';
import IconTemplateModal from './IconTemplateModal.vue';
import SplashPagePreviewModal from './SplashPagePreviewModal.vue';
import ToggleSwitch from '../ui/ToggleSwitch.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();
const userRole = computed(() => authStore.user?.role);

const props = defineProps({
  // Embedded single-organization mode (used by School Portal settings).
  // When set, the UI loads and opens ONLY this organization (no left list).
  embeddedOrgId: { type: [Number, String], default: null },
  embeddedTab: { type: String, default: 'general' } // 'general' | 'branding' | 'features' | ...
});

const embeddedSingleOrg = computed(() => {
  const id = parseInt(String(props.embeddedOrgId || ''), 10);
  return Number.isFinite(id) && id > 0;
});

const agencies = ref([]);
const buildings = ref([]); // office_locations (organization_type = 'office')
const searchQuery = ref('');
// Two-mode navigation filter:
// - agencies: show only agencies
// - organizations: show only non-agency orgs (schools/programs/learning)
const typeFilter = ref('agencies'); // agencies|buildings|schools|programs|learning|other|organizations
const sortMode = ref('name_asc'); // name_asc|name_desc|slug_asc|type_asc|status_desc
const selectedAgencyFilterId = ref(''); // superadmin: parent agency filter
const affiliatedOrganizations = ref([]); // /agencies/:id/affiliated-organizations results
const loadingAffiliates = ref(false);

const availableUsers = ref([]);
const agencyAdmins = ref({});
const agencySupport = ref({});
const loading = ref(true);
const error = ref('');
const showCreateModal = ref(false);
const editingAgency = ref(null);

// School org directory contacts (imported via bulk school upload; editable in the School Staff tab)
const schoolContactsForEditor = computed(() => {
  const list = editingAgency.value?.school_contacts;
  return Array.isArray(list) ? list : [];
});

const detailPaneRef = ref(null);

// Left nav collapse (icon rail) for maximum editor space
const navCollapsed = ref(false);
const toggleNavCollapsed = () => {
  // Expand should behave like "back to list" (no org selected)
  if (navCollapsed.value) {
    if ((showCreateModal.value || editingAgency.value) && !confirmDiscardUnsavedEdits()) return;
    navCollapsed.value = false;
    closeModal();
    return;
  }

  navCollapsed.value = true;
};

const originalAgencyFormSnapshot = ref('');
const isAgencyFormDirty = computed(() => {
  if (!showCreateModal.value && !editingAgency.value) return false;
  if (!originalAgencyFormSnapshot.value) return false;
  try {
    return JSON.stringify(agencyForm.value) !== originalAgencyFormSnapshot.value;
  } catch {
    return true;
  }
});

const confirmDiscardUnsavedEdits = () => {
  if (!isAgencyFormDirty.value) return true;
  return window.confirm('You have unsaved changes. Discard them and continue?');
};

const showAssignAdminModal = ref(false);
const showAssignSupportModal = ref(false);
const showPreviewModal = ref(false);
const previewAgencyId = ref(null);
const showSplashPreviewModal = ref(false);
const previewOrganizationSlug = ref('');
const previewOrganizationId = ref(null);
const showDuplicateModal = ref(false);
const duplicatingOrganization = ref(null);
const duplicating = ref(false);
const duplicateError = ref('');
const duplicateForm = ref({
  name: '',
  slug: '',
  portalUrl: ''
});
const applyingAffiliatedBranding = ref(false);
const selectedAgency = ref(null);
const selectedUserId = ref('');
const selectedSupportUserId = ref('');
const saving = ref(false);
const assigning = ref(false);
const assigningSupport = ref(false);
const logoError = ref(false);
const logoErrors = ref({}); // Track logo errors per agency
const iconErrorsByOrgId = ref({}); // Track main icon render errors per org row
const logoInputMethod = ref('url'); // 'url' or 'upload'
const logoFileInput = ref(null);
const uploadingLogo = ref(false);
const customParamKeys = ref([]);
  const customParameters = ref({});
  const copiedUrl = ref(null); // Track which URL was copied
const activeTab = ref('general'); // Tab navigation: general|branding|features|contact|address|sites|notifications|theme|terminology|icons|payroll

// Office creation is handled via Organization Type = Office in the General tab.

// Payroll service code rules editor (agency-only)
const payrollRulesLoading = ref(false);
const payrollRulesError = ref('');
const payrollRules = ref([]);
const savingPayrollRule = ref(false);
const savingPayrollRuleByCode = ref({}); // service_code -> boolean
const payrollRuleSaveErrorByCode = ref({}); // service_code -> string
const newPayrollServiceCode = ref('');
const payrollRulesBaselineByCode = ref({}); // service_code -> serialized canonical snapshot (for dirty detection)

const otherRateTitlesLoading = ref(false);
const otherRateTitlesSaving = ref(false);
const otherRateTitlesError = ref('');
const otherRateTitlesDraft = ref({ title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' });

const loadOtherRateTitles = async () => {
  if (!editingAgency.value?.id) return;
  try {
    otherRateTitlesLoading.value = true;
    otherRateTitlesError.value = '';
    const resp = await api.get('/payroll/other-rate-titles', { params: { agencyId: editingAgency.value.id } });
    otherRateTitlesDraft.value = {
      title1: resp.data?.title1 || 'Other 1',
      title2: resp.data?.title2 || 'Other 2',
      title3: resp.data?.title3 || 'Other 3'
    };
  } catch (e) {
    otherRateTitlesError.value = e.response?.data?.error?.message || e.message || 'Failed to load other rate titles';
  } finally {
    otherRateTitlesLoading.value = false;
  }
};

const saveOtherRateTitles = async () => {
  if (!editingAgency.value?.id) return;
  try {
    otherRateTitlesSaving.value = true;
    otherRateTitlesError.value = '';
    await api.put('/payroll/other-rate-titles', {
      agencyId: editingAgency.value.id,
      title1: otherRateTitlesDraft.value.title1,
      title2: otherRateTitlesDraft.value.title2,
      title3: otherRateTitlesDraft.value.title3
    });
  } catch (e) {
    otherRateTitlesError.value = e.response?.data?.error?.message || e.message || 'Failed to save other rate titles';
  } finally {
    otherRateTitlesSaving.value = false;
  }
};

// Mileage reimbursement rates (agency-only; Tier 1/2/3 $/mile)
const mileageRatesLoading = ref(false);
const savingMileageRates = ref(false);
const mileageRatesError = ref('');
const mileageRatesDraft = ref({ tier1: 0, tier2: 0, tier3: 0 });
const mileageRatesLoadedAgencyId = ref(null);

// Med Cancel policy (agency-only; rates + pay service code)
const medcancelPolicyLoading = ref(false);
const medcancelPolicySaving = ref(false);
const medcancelPolicyError = ref('');
const medcancelPolicyDraft = ref({
  displayName: 'Med Cancel',
  serviceCode: 'MEDCANCEL',
  schedules: {
    low: { '90832': 5, '90834': 7.5, '90837': 10 },
    high: { '90832': 10, '90834': 15, '90837': 20 }
  }
});
const newMedcancelMissedServiceCode = ref('');
const medcancelMissedServiceCodes = computed(() => {
  const pol = medcancelPolicyDraft.value || {};
  const low = pol?.schedules?.low && typeof pol.schedules.low === 'object' ? Object.keys(pol.schedules.low) : [];
  const high = pol?.schedules?.high && typeof pol.schedules.high === 'object' ? Object.keys(pol.schedules.high) : [];
  const all = new Set([...low, ...high].map((s) => String(s || '').trim()).filter(Boolean));
  return Array.from(all.values()).sort((a, b) => a.localeCompare(b));
});

// PTO policy (agency-only)
const ptoPolicyLoading = ref(false);
const savingPtoPolicy = ref(false);
const ptoPolicyError = ref('');
const ptoPolicyDraft = ref({
  ptoEnabled: true,
  defaultPayRate: 0,
  sickAccrualPer30: 1.0,
  trainingAccrualPer30: 0.25,
  trainingPtoEnabled: false,
  sickAnnualRolloverCap: 10,
  sickAnnualMaxAccrual: 65,
  trainingMaxBalance: 20,
  trainingForfeitOnTermination: true,
  ptoConsecutiveUseLimitHours: 15,
  ptoConsecutiveUseNoticeDays: 30
});

// Supervision tracking (agency-only)
const supervisionLoading = ref(false);
const savingSupervision = ref(false);
const supervisionError = ref('');
const supervisionDraft = ref({
  enabled: false,
  eligibleCredentialCodesCsv: 'LPCC,LMFT,MFTC,LSW,SWC',
  after50CadenceWeeks: 2,
  after50Minutes: 30
});

// Agency holidays + holiday pay policy (agency-only)
const agencyHolidaysLoading = ref(false);
const agencyHolidaysSaving = ref(false);
const agencyHolidaysError = ref('');
const agencyHolidays = ref([]);
const newHolidayDate = ref('');
const newHolidayName = ref('');

const holidayPayPolicyLoading = ref(false);
const holidayPayPolicySaving = ref(false);
const holidayPayPolicyError = ref('');
const holidayPayPolicyDraft = ref({
  percentage: 0,
  notifyMissingApproval: false,
  notifyStrictMessage: false
});

// Agency announcements (Dashboard banners)
const announcementsLoading = ref(false);
const announcementsSaving = ref(false);
const announcementsError = ref('');
const announcementsLoadedAgencyId = ref(null);
const announcementsDraft = ref({
  birthdayEnabled: false,
  birthdayTemplate: 'Happy Birthday, {fullName}'
});

// Scheduled announcements (time-limited banners)
const scheduledAnnouncementsLoading = ref(false);
const scheduledAnnouncementsError = ref('');
const scheduledAnnouncements = ref([]);
const scheduledAnnouncementsLoadedAgencyId = ref(null);
const scheduledSubmitting = ref(false);
const scheduledFormError = ref('');
const scheduledDraft = ref({
  id: null,
  title: '',
  message: '',
  startsAt: '',
  endsAt: ''
});

const toLocalInput = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const mm = pad(dt.getMonth() + 1);
  const dd = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const mi = pad(dt.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const resetScheduledDraft = () => {
  const now = new Date();
  const ends = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  scheduledDraft.value = {
    id: null,
    title: '',
    message: '',
    startsAt: toLocalInput(now),
    endsAt: toLocalInput(ends)
  };
  scheduledFormError.value = '';
};

resetScheduledDraft();

const scheduledCanSubmit = computed(() => {
  if (!editingAgency.value?.id) return false;
  if (!scheduledDraft.value.message.trim()) return false;
  if (!scheduledDraft.value.startsAt || !scheduledDraft.value.endsAt) return false;
  return true;
});

const loadAgencyAnnouncements = async () => {
  if (!editingAgency.value?.id) return;
  const agencyId = Number(editingAgency.value.id);
  if (!agencyId) return;
  try {
    announcementsLoading.value = true;
    announcementsError.value = '';
    const resp = await api.get(`/agencies/${agencyId}/announcements`);
    announcementsDraft.value = {
      birthdayEnabled: Boolean(resp.data?.birthdayEnabled),
      birthdayTemplate: resp.data?.birthdayTemplate || 'Happy Birthday, {fullName}'
    };
    announcementsLoadedAgencyId.value = agencyId;
  } catch (e) {
    announcementsError.value = e.response?.data?.error?.message || e.message || 'Failed to load announcements';
  } finally {
    announcementsLoading.value = false;
  }
};

const saveAgencyAnnouncements = async () => {
  if (!editingAgency.value?.id) return;
  const agencyId = Number(editingAgency.value.id);
  if (!agencyId) return;
  try {
    announcementsSaving.value = true;
    announcementsError.value = '';
    const payload = {
      birthdayEnabled: Boolean(announcementsDraft.value.birthdayEnabled),
      birthdayTemplate: String(announcementsDraft.value.birthdayTemplate || '').trim()
    };
    const resp = await api.put(`/agencies/${agencyId}/announcements`, payload);
    announcementsDraft.value = {
      birthdayEnabled: Boolean(resp.data?.birthdayEnabled),
      birthdayTemplate: resp.data?.birthdayTemplate || 'Happy Birthday, {fullName}'
    };
    announcementsLoadedAgencyId.value = agencyId;
  } catch (e) {
    announcementsError.value = e.response?.data?.error?.message || e.message || 'Failed to save announcements';
  } finally {
    announcementsSaving.value = false;
  }
};

const loadAgencyScheduledAnnouncements = async () => {
  if (!editingAgency.value?.id) return;
  const agencyId = Number(editingAgency.value.id);
  if (!agencyId) return;
  try {
    if (scheduledAnnouncementsLoadedAgencyId.value !== agencyId) {
      resetScheduledDraft();
    }
    scheduledAnnouncementsLoading.value = true;
    scheduledAnnouncementsError.value = '';
    const resp = await api.get(`/agencies/${agencyId}/announcements/list`);
    scheduledAnnouncements.value = Array.isArray(resp.data) ? resp.data : [];
    scheduledAnnouncementsLoadedAgencyId.value = agencyId;
  } catch (e) {
    scheduledAnnouncements.value = [];
    scheduledAnnouncementsError.value = e.response?.data?.error?.message || e.message || 'Failed to load scheduled announcements';
  } finally {
    scheduledAnnouncementsLoading.value = false;
  }
};

const saveScheduledAnnouncement = async () => {
  if (!scheduledCanSubmit.value || !editingAgency.value?.id) return;
  const agencyId = Number(editingAgency.value.id);
  if (!agencyId) return;
  try {
    scheduledSubmitting.value = true;
    scheduledFormError.value = '';
    const payload = {
      title: scheduledDraft.value.title?.trim() || null,
      message: scheduledDraft.value.message.trim(),
      starts_at: new Date(scheduledDraft.value.startsAt),
      ends_at: new Date(scheduledDraft.value.endsAt)
    };
    if (scheduledDraft.value.id) {
      await api.put(`/agencies/${agencyId}/announcements/${scheduledDraft.value.id}`, payload);
    } else {
      await api.post(`/agencies/${agencyId}/announcements`, payload);
    }
    await loadAgencyScheduledAnnouncements();
    resetScheduledDraft();
  } catch (e) {
    scheduledFormError.value = e.response?.data?.error?.message || e.message || 'Failed to save announcement';
  } finally {
    scheduledSubmitting.value = false;
  }
};

const editScheduledAnnouncement = (item) => {
  scheduledDraft.value = {
    id: item?.id || null,
    title: String(item?.title || ''),
    message: String(item?.message || ''),
    startsAt: toLocalInput(item?.starts_at),
    endsAt: toLocalInput(item?.ends_at)
  };
  scheduledFormError.value = '';
};

const deleteScheduledAnnouncement = async (item) => {
  const agencyId = Number(editingAgency.value?.id || 0);
  const announcementId = Number(item?.id || 0);
  if (!agencyId || !announcementId) return;
  if (!confirm('Delete this scheduled announcement?')) return;
  try {
    scheduledSubmitting.value = true;
    scheduledFormError.value = '';
    await api.delete(`/agencies/${agencyId}/announcements/${announcementId}`);
    await loadAgencyScheduledAnnouncements();
    if (scheduledDraft.value.id === announcementId) {
      resetScheduledDraft();
    }
  } catch (e) {
    scheduledFormError.value = e.response?.data?.error?.message || e.message || 'Failed to delete announcement';
  } finally {
    scheduledSubmitting.value = false;
  }
};

const formatAnnouncementDate = (value) => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString();
};

const scheduledStatusLabel = (item) => {
  const now = Date.now();
  const startsAt = new Date(item?.starts_at || 0).getTime();
  const endsAt = new Date(item?.ends_at || 0).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return 'Unknown';
  if (now < startsAt) return 'Scheduled';
  if (now > endsAt) return 'Ended';
  return 'Active';
};

// Office locations (sites) editor (agency-only)
const officeLocations = ref([]);
const officeLocationsLoading = ref(false);
const officeLocationsError = ref('');
const officeLocationsLoadedAgencyId = ref(null);
const officeLocationEdits = ref({});
const savingOfficeLocationId = ref(null);
const newOfficeLocationName = ref('');
const newOfficeLocationTimezone = ref('America/New_York');
const newOfficeLocationTimezoneCustom = ref('');
const creatingOfficeLocation = ref(false);

const getOfficeLocationEdit = (locationId) => {
  const id = Number(locationId);
  if (!id) {
    return {
  name: '',
      timezone: 'America/New_York',
      timezoneCustom: '',
      streetAddress: '',
      city: '',
      state: '',
      postalCode: '',
      isActive: true
    };
  }
  if (!officeLocationEdits.value[id]) {
    officeLocationEdits.value[id] = {
      name: '',
      timezone: 'America/New_York',
      timezoneCustom: '',
      streetAddress: '',
      city: '',
      state: '',
      postalCode: '',
      isActive: true
    };
  }
  return officeLocationEdits.value[id];
};

// Common, Americas-focused IANA time zones (keep list short & practical).
const americaTimeZones = [
  'America/New_York',    // ET
  'America/Chicago',     // CT
  'America/Denver',      // MT
  'America/Phoenix',     // AZ (no DST)
  'America/Los_Angeles', // PT
  'America/Anchorage',   // AK
  'Pacific/Honolulu'     // HI
];

// Notification triggers (agency-only; platform list with per-agency overrides)
const notificationTriggers = ref([]);
const notificationTriggersLoading = ref(false);
const notificationTriggersError = ref('');
const notificationTriggerEdits = ref({});
const savingNotificationTriggerKey = ref(null);

const agencyNotificationLoading = ref(false);
const agencyNotificationSaving = ref(false);
const agencyNotificationError = ref('');
const agencyNotificationDraft = ref({
  defaults: {
    messaging_new_inbound_client_text: false,
    messaging_support_safety_net_alerts: false,
    messaging_replies_to_my_messages: false,
    messaging_client_notes: false,
    school_portal_client_updates: false,
    school_portal_client_update_org_swaps: false,
    school_portal_client_comments: false,
    school_portal_client_messages: false,
    scheduling_room_booking_approved_denied: false,
    scheduling_schedule_changes: false,
    scheduling_room_release_requests: false,
    compliance_credential_expiration_reminders: false,
    compliance_access_restriction_warnings: false,
    compliance_payroll_document_availability: false,
    surveys_client_checked_in: false,
    surveys_survey_completed: false,
    system_emergency_broadcasts: true,
    system_org_announcements: false,
    program_reminders: false
  },
  userEditable: false,
  enforceDefaults: true
});

const notificationDefaultOptions = [
  { key: 'messaging_new_inbound_client_text', label: 'New inbound client text', group: 'Messaging' },
  { key: 'messaging_support_safety_net_alerts', label: 'Support safety net alerts', group: 'Messaging' },
  { key: 'messaging_replies_to_my_messages', label: 'Replies to my messages', group: 'Messaging' },
  { key: 'messaging_client_notes', label: 'Client notes & updates', group: 'Messaging' },
  { key: 'program_reminders', label: 'Program reminders', group: 'Programs' },
  { key: 'scheduling_room_booking_approved_denied', label: 'Room booking approved/denied', group: 'Scheduling' },
  { key: 'scheduling_schedule_changes', label: 'Schedule changes', group: 'Scheduling' },
  { key: 'scheduling_room_release_requests', label: 'Room release requests', group: 'Scheduling' },
  { key: 'compliance_credential_expiration_reminders', label: 'Credential expiration reminders', group: 'Compliance' },
  { key: 'compliance_access_restriction_warnings', label: 'Access restriction warnings', group: 'Compliance' },
  { key: 'compliance_payroll_document_availability', label: 'Payroll document availability', group: 'Compliance' },
  { key: 'surveys_client_checked_in', label: 'Client checked in', group: 'Surveys' },
  { key: 'surveys_survey_completed', label: 'Survey completed', group: 'Surveys' },
  { key: 'school_portal_client_updates', label: 'Client updates', group: 'School Portal' },
  { key: 'school_portal_client_update_org_swaps', label: 'Client org changes', group: 'School Portal' },
  { key: 'school_portal_client_comments', label: 'Client comments', group: 'School Portal' },
  { key: 'school_portal_client_messages', label: 'Client messages', group: 'School Portal' },
  { key: 'system_org_announcements', label: 'Org announcements', group: 'System' },
  { key: 'system_emergency_broadcasts', label: 'Emergency broadcasts (required)', group: 'System', locked: true }
];

const programReminders = ref([]);
const programRemindersLoading = ref(false);
const programRemindersError = ref('');
const programReminderSaving = ref(false);
const programReminderDraft = ref({
  title: 'Program reminder',
  message: '',
  scheduleType: 'once',
  runAt: '',
  timeOfDay: '09:00',
  daysOfWeek: [1, 3, 5],
  smsEnabled: true,
  timezone: 'UTC'
});
const programReminderDays = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 }
];

const getTriggerEdit = (triggerKey) => {
  const key = String(triggerKey || '').trim();
  if (!key) return { enabled: true, recipients: { provider: true, supervisor: true, clinicalPracticeAssistant: true, admin: true }, channels: { inApp: true, sms: true, email: false } };
  if (!notificationTriggerEdits.value[key]) {
    notificationTriggerEdits.value[key] = {
      enabled: true,
      recipients: { provider: true, supervisor: true, clinicalPracticeAssistant: true, admin: true },
      channels: { inApp: true, sms: true, email: false }
    };
  }
  return notificationTriggerEdits.value[key];
};

const loadNotificationTriggers = async () => {
  if (!editingAgency.value?.id) return;
  try {
    notificationTriggersLoading.value = true;
    notificationTriggersError.value = '';
    const resp = await api.get(`/agencies/${editingAgency.value.id}/notification-triggers`);
    const rows = resp.data || [];
    notificationTriggers.value = rows;

    const edits = {};
    for (const t of rows) {
      const k = String(t?.triggerKey || '').trim();
      if (!k) continue;
      const resolved = t?.resolved || {};
      edits[k] = {
        enabled: !!resolved.enabled,
        recipients: {
          provider: !!resolved?.recipients?.provider,
          supervisor: !!resolved?.recipients?.supervisor,
          clinicalPracticeAssistant: !!resolved?.recipients?.clinicalPracticeAssistant,
          admin: !!resolved?.recipients?.admin
        },
        channels: {
          inApp: true,
          sms: !!resolved?.channels?.sms,
          email: !!resolved?.channels?.email
        }
      };
    }
    notificationTriggerEdits.value = edits;
  } catch (e) {
    notificationTriggersError.value = e.response?.data?.error?.message || e.message || 'Failed to load notification triggers';
    notificationTriggers.value = [];
    notificationTriggerEdits.value = {};
  } finally {
    notificationTriggersLoading.value = false;
  }
  await loadAgencyNotificationPreferences();
  await loadProgramReminders();
};

const loadAgencyNotificationPreferences = async () => {
  if (!editingAgency.value?.id) return;
  try {
    agencyNotificationLoading.value = true;
    agencyNotificationError.value = '';
    const resp = await api.get(`/agencies/${editingAgency.value.id}/notification-preferences`);
    const data = resp.data || {};
    agencyNotificationDraft.value = {
      defaults: {
        ...agencyNotificationDraft.value.defaults,
        ...(data.defaults || {})
      },
      userEditable: data.userEditable !== false,
      enforceDefaults: data.enforceDefaults === true
    };
    // Always keep emergency broadcasts enabled
    agencyNotificationDraft.value.defaults.system_emergency_broadcasts = true;
  } catch (e) {
    agencyNotificationError.value = e.response?.data?.error?.message || e.message || 'Failed to load notification defaults';
  } finally {
    agencyNotificationLoading.value = false;
  }
};

const saveAgencyNotificationPreferences = async () => {
  if (!editingAgency.value?.id) return;
  try {
    agencyNotificationSaving.value = true;
    agencyNotificationError.value = '';
    const payload = {
      defaults: {
        ...agencyNotificationDraft.value.defaults,
        system_emergency_broadcasts: true
      },
      userEditable: agencyNotificationDraft.value.userEditable,
      enforceDefaults: agencyNotificationDraft.value.enforceDefaults
    };
    await api.put(`/agencies/${editingAgency.value.id}/notification-preferences`, payload);
    await loadAgencyNotificationPreferences();
  } catch (e) {
    agencyNotificationError.value = e.response?.data?.error?.message || e.message || 'Failed to save notification defaults';
  } finally {
    agencyNotificationSaving.value = false;
  }
};

const setAllNotificationDefaults = (enabled) => {
  const next = { ...agencyNotificationDraft.value.defaults };
  for (const opt of notificationDefaultOptions) {
    if (opt.locked) continue;
    next[opt.key] = !!enabled;
  }
  next.system_emergency_broadcasts = true;
  agencyNotificationDraft.value.defaults = next;
};

const saveNotificationTrigger = async (triggerRow) => {
  if (!editingAgency.value?.id) return;
  const triggerKey = String(triggerRow?.triggerKey || '').trim();
  if (!triggerKey) return;
  try {
    savingNotificationTriggerKey.value = triggerKey;
    notificationTriggersError.value = '';
    const edit = getTriggerEdit(triggerKey);
    await api.put(`/agencies/${editingAgency.value.id}/notification-triggers/${triggerKey}`, {
      enabled: !!edit.enabled,
      recipients: {
        provider: !!edit.recipients?.provider,
        supervisor: !!edit.recipients?.supervisor,
        clinicalPracticeAssistant: !!edit.recipients?.clinicalPracticeAssistant,
        admin: !!edit.recipients?.admin
      },
      channels: {
        inApp: true,
        sms: !!edit.channels?.sms,
        email: !!edit.channels?.email
      }
    });
    await loadNotificationTriggers();
  } catch (e) {
    notificationTriggersError.value = e.response?.data?.error?.message || e.message || 'Failed to save trigger settings';
  } finally {
    savingNotificationTriggerKey.value = null;
  }
};

const loadProgramReminders = async () => {
  if (!editingAgency.value?.id) return;
  programRemindersError.value = '';
  programRemindersLoading.value = true;
  try {
    const resp = await api.get(`/agencies/${editingAgency.value.id}/program-reminders`);
    programReminders.value = Array.isArray(resp.data) ? resp.data : [];
  } catch (e) {
    programRemindersError.value = e.response?.data?.error?.message || e.message || 'Failed to load program reminders';
    programReminders.value = [];
  } finally {
    programRemindersLoading.value = false;
  }
};

const toggleProgramReminderDay = (day) => {
  const set = new Set(programReminderDraft.value.daysOfWeek || []);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  programReminderDraft.value.daysOfWeek = Array.from(set).sort();
};

const createProgramReminder = async () => {
  if (!editingAgency.value?.id) return;
  try {
    programReminderSaving.value = true;
    programRemindersError.value = '';
    const scheduleType = programReminderDraft.value.scheduleType;
    const scheduleJson =
      scheduleType === 'once'
        ? { runAtLocal: programReminderDraft.value.runAt }
        : {
            timeOfDay: programReminderDraft.value.timeOfDay,
            daysOfWeek: scheduleType === 'weekly' ? programReminderDraft.value.daysOfWeek : undefined
          };
    await api.post(`/agencies/${editingAgency.value.id}/program-reminders`, {
      title: programReminderDraft.value.title,
      message: programReminderDraft.value.message,
      scheduleType,
      scheduleJson,
      timezone: programReminderDraft.value.timezone || 'UTC',
      channels: { sms: programReminderDraft.value.smsEnabled }
    });
    programReminderDraft.value.message = '';
    await loadProgramReminders();
  } catch (e) {
    programRemindersError.value = e.response?.data?.error?.message || e.message || 'Failed to create reminder';
  } finally {
    programReminderSaving.value = false;
  }
};

const deleteProgramReminder = async (reminder) => {
  if (!editingAgency.value?.id || !reminder?.id) return;
  try {
    await api.delete(`/agencies/${editingAgency.value.id}/program-reminders/${reminder.id}`);
    await loadProgramReminders();
  } catch (e) {
    programRemindersError.value = e.response?.data?.error?.message || e.message || 'Failed to delete reminder';
  }
};

const formatProgramSchedule = (reminder) => {
  const type = reminder?.scheduleType || reminder?.schedule_type || '';
  const cfg = reminder?.scheduleJson || reminder?.schedule_json || {};
  const tz = reminder?.timezone || 'UTC';
  if (type === 'once') return `Once · ${cfg.runAtLocal || cfg.run_at_local || cfg.runAt || cfg.run_at || '—'} ${tz}`;
  if (type === 'daily') return `Daily · ${cfg.timeOfDay || cfg.time_of_day || '—'} ${tz}`;
  if (type === 'weekly') {
    const days = Array.isArray(cfg.daysOfWeek || cfg.days_of_week) ? (cfg.daysOfWeek || cfg.days_of_week) : [];
    const labels = programReminderDays.filter((d) => days.includes(d.value)).map((d) => d.label).join(', ');
    return `Weekly · ${cfg.timeOfDay || cfg.time_of_day || '—'} ${tz} · ${labels || '—'}`;
  }
  return '—';
};

const formatProgramNextRun = (reminder) => {
  const v = reminder?.nextRunAt || reminder?.next_run_at;
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
};

const openPayrollTab = async () => {
  activeTab.value = 'payroll';
  await loadMileageRates();
  await loadMedcancelPolicy();
  await loadPtoPolicy();
  await loadSupervisionPolicy();
  await loadHolidayPayPolicy();
  await loadAgencyHolidays();
  await loadPayrollRules();
  await loadOtherRateTitles();
  await loadOfficeLocations();
};

const loadHolidayPayPolicy = async () => {
  if (!editingAgency.value?.id) return;
  try {
    holidayPayPolicyLoading.value = true;
    holidayPayPolicyError.value = '';
    const resp = await api.get('/payroll/holiday-pay-policy', { params: { agencyId: editingAgency.value.id } });
    const pol = resp.data?.policy || {};
    holidayPayPolicyDraft.value = {
      percentage: Number(pol?.percentage || 0),
      notifyMissingApproval: Boolean(pol?.notifyMissingApproval),
      notifyStrictMessage: Boolean(pol?.notifyStrictMessage)
    };
  } catch (e) {
    holidayPayPolicyError.value = e.response?.data?.error?.message || e.message || 'Failed to load holiday pay policy';
  } finally {
    holidayPayPolicyLoading.value = false;
  }
};

const saveHolidayPayPolicy = async () => {
  if (!editingAgency.value?.id) return;
  try {
    holidayPayPolicySaving.value = true;
    holidayPayPolicyError.value = '';
    const payload = {
      agencyId: editingAgency.value.id,
      policy: {
        percentage: Number(holidayPayPolicyDraft.value.percentage || 0),
        notifyMissingApproval: Boolean(holidayPayPolicyDraft.value.notifyMissingApproval),
        notifyStrictMessage: Boolean(holidayPayPolicyDraft.value.notifyStrictMessage)
      }
    };
    const resp = await api.put('/payroll/holiday-pay-policy', payload);
    const pol = resp.data?.policy || payload.policy;
    holidayPayPolicyDraft.value = {
      percentage: Number(pol?.percentage || 0),
      notifyMissingApproval: Boolean(pol?.notifyMissingApproval),
      notifyStrictMessage: Boolean(pol?.notifyStrictMessage)
    };
  } catch (e) {
    holidayPayPolicyError.value = e.response?.data?.error?.message || e.message || 'Failed to save holiday pay policy';
  } finally {
    holidayPayPolicySaving.value = false;
  }
};

const loadAgencyHolidays = async () => {
  if (!editingAgency.value?.id) return;
  try {
    agencyHolidaysLoading.value = true;
    agencyHolidaysError.value = '';
    const resp = await api.get('/payroll/holidays', { params: { agencyId: editingAgency.value.id } });
    agencyHolidays.value = resp.data?.holidays || [];
  } catch (e) {
    agencyHolidaysError.value = e.response?.data?.error?.message || e.message || 'Failed to load holidays';
    agencyHolidays.value = [];
  } finally {
    agencyHolidaysLoading.value = false;
  }
};

const addAgencyHoliday = async () => {
  if (!editingAgency.value?.id) return;
  const date = String(newHolidayDate.value || '').trim().slice(0, 10);
  const name = String(newHolidayName.value || '').trim();
  if (!date || !name) return;
  try {
    agencyHolidaysSaving.value = true;
    agencyHolidaysError.value = '';
    await api.post('/payroll/holidays', { agencyId: editingAgency.value.id, holidayDate: date, name });
    newHolidayDate.value = '';
    newHolidayName.value = '';
    await loadAgencyHolidays();
  } catch (e) {
    agencyHolidaysError.value = e.response?.data?.error?.message || e.message || 'Failed to add holiday';
  } finally {
    agencyHolidaysSaving.value = false;
  }
};

const removeAgencyHoliday = async (h) => {
  if (!editingAgency.value?.id) return;
  const id = Number(h?.id || 0);
  if (!id) return;
  const ok = window.confirm('Remove this holiday?');
  if (!ok) return;
  try {
    agencyHolidaysSaving.value = true;
    agencyHolidaysError.value = '';
    await api.delete(`/payroll/holidays/${id}`);
    await loadAgencyHolidays();
  } catch (e) {
    agencyHolidaysError.value = e.response?.data?.error?.message || e.message || 'Failed to remove holiday';
  } finally {
    agencyHolidaysSaving.value = false;
  }
};

const loadMedcancelPolicy = async () => {
  if (!editingAgency.value?.id) return;
  try {
    medcancelPolicyLoading.value = true;
    medcancelPolicyError.value = '';
    const resp = await api.get('/payroll/medcancel-policy', { params: { agencyId: editingAgency.value.id } });
    const pol = resp.data?.policy || {};
    medcancelPolicyDraft.value = {
      displayName: String(pol?.displayName || 'Med Cancel').trim() || 'Med Cancel',
      serviceCode: String(pol?.serviceCode || 'MEDCANCEL').trim().toUpperCase() || 'MEDCANCEL',
      schedules: {
        low: (pol?.schedules?.low && typeof pol.schedules.low === 'object') ? pol.schedules.low : {},
        high: (pol?.schedules?.high && typeof pol.schedules.high === 'object') ? pol.schedules.high : {}
      }
    };
  } catch (e) {
    medcancelPolicyError.value = e.response?.data?.error?.message || e.message || 'Failed to load Med Cancel policy';
  } finally {
    medcancelPolicyLoading.value = false;
  }
};

const addMedcancelMissedServiceCode = () => {
  const code = String(newMedcancelMissedServiceCode.value || '').trim();
  if (!code) return;
  const next = JSON.parse(JSON.stringify(medcancelPolicyDraft.value || {}));
  if (!next.schedules) next.schedules = { low: {}, high: {} };
  if (!next.schedules.low) next.schedules.low = {};
  if (!next.schedules.high) next.schedules.high = {};
  if (next.schedules.low[code] === undefined) next.schedules.low[code] = 0;
  if (next.schedules.high[code] === undefined) next.schedules.high[code] = 0;
  medcancelPolicyDraft.value = next;
  newMedcancelMissedServiceCode.value = '';
};

const removeMedcancelMissedServiceCode = (code) => {
  const k = String(code || '').trim();
  if (!k) return;
  const next = JSON.parse(JSON.stringify(medcancelPolicyDraft.value || {}));
  if (next?.schedules?.low) delete next.schedules.low[k];
  if (next?.schedules?.high) delete next.schedules.high[k];
  medcancelPolicyDraft.value = next;
};

const saveMedcancelPolicy = async () => {
  if (!editingAgency.value?.id) return;
  try {
    medcancelPolicySaving.value = true;
    medcancelPolicyError.value = '';
    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10000 : 0;
    };
    const pol = medcancelPolicyDraft.value || {};
    const low = pol?.schedules?.low && typeof pol.schedules.low === 'object' ? pol.schedules.low : {};
    const high = pol?.schedules?.high && typeof pol.schedules.high === 'object' ? pol.schedules.high : {};
    const normalizeMap = (m) => {
      const out = {};
      for (const [k, v] of Object.entries(m || {})) {
        const code = String(k || '').trim();
        if (!code) continue;
        out[code] = toNum(v);
      }
      return out;
    };
    await api.put('/payroll/medcancel-policy', {
      agencyId: editingAgency.value.id,
      policy: {
        displayName: String(pol?.displayName || 'Med Cancel').trim() || 'Med Cancel',
        serviceCode: String(pol?.serviceCode || 'MEDCANCEL').trim().toUpperCase() || 'MEDCANCEL',
        schedules: {
          low: normalizeMap(low),
          high: normalizeMap(high)
        }
      }
    });
    await loadMedcancelPolicy();
  } catch (e) {
    medcancelPolicyError.value = e.response?.data?.error?.message || e.message || 'Failed to save Med Cancel policy';
  } finally {
    medcancelPolicySaving.value = false;
  }
};

const loadSupervisionPolicy = async () => {
  if (!editingAgency.value?.id) return;
  try {
    supervisionLoading.value = true;
    supervisionError.value = '';
    const resp = await api.get('/payroll/supervision-policy', { params: { agencyId: editingAgency.value.id } });
    const pol = resp.data?.policy || {};
    supervisionDraft.value = {
      enabled: pol.enabled === true,
      eligibleCredentialCodesCsv: Array.isArray(pol.eligibleCredentialCodes) ? pol.eligibleCredentialCodes.join(',') : 'LPCC,LMFT,MFTC,LSW,SWC',
      after50CadenceWeeks: Number(pol?.after50Individual?.cadenceWeeks ?? 2),
      after50Minutes: Number(pol?.after50Individual?.minutes ?? 30)
    };
  } catch (e) {
    supervisionError.value = e.response?.data?.error?.message || e.message || 'Failed to load supervision policy';
  } finally {
    supervisionLoading.value = false;
  }
};

const saveSupervisionPolicy = async () => {
  if (!editingAgency.value?.id) return;
  try {
    savingSupervision.value = true;
    supervisionError.value = '';
    const codes = String(supervisionDraft.value.eligibleCredentialCodesCsv || '')
      .split(',')
      .map((s) => String(s || '').trim().toUpperCase())
      .filter(Boolean);
    await api.put('/payroll/supervision-policy', {
      agencyId: editingAgency.value.id,
      enabled: supervisionDraft.value.enabled === true,
      policy: {
        eligibleCredentialCodes: codes,
        after50Individual: {
          cadenceWeeks: Number(supervisionDraft.value.after50CadenceWeeks || 2),
          minutes: Number(supervisionDraft.value.after50Minutes || 30)
        }
      }
    });
    await loadSupervisionPolicy();
  } catch (e) {
    supervisionError.value = e.response?.data?.error?.message || e.message || 'Failed to save supervision policy';
  } finally {
    savingSupervision.value = false;
  }
};

const loadPtoPolicy = async () => {
  if (!editingAgency.value?.id) return;
  try {
    ptoPolicyLoading.value = true;
    ptoPolicyError.value = '';
    const resp = await api.get('/payroll/pto-policy', { params: { agencyId: editingAgency.value.id } });
    const policy = resp.data?.policy || {};
    ptoPolicyDraft.value = {
      ptoEnabled: resp.data?.policy?.ptoEnabled !== false && resp.data?.ptoEnabled !== false,
      defaultPayRate: Number(resp.data?.defaultPayRate || 0),
      sickAccrualPer30: Number(policy.sickAccrualPer30 ?? 1.0),
      trainingAccrualPer30: Number(policy.trainingAccrualPer30 ?? 0.25),
      trainingPtoEnabled: policy.trainingPtoEnabled === true,
      sickAnnualRolloverCap: Number(policy.sickAnnualRolloverCap ?? 10),
      sickAnnualMaxAccrual: Number(policy.sickAnnualMaxAccrual ?? 65),
      trainingMaxBalance: Number(policy.trainingMaxBalance ?? 20),
      trainingForfeitOnTermination: policy.trainingForfeitOnTermination !== false,
      ptoConsecutiveUseLimitHours: Number(policy.ptoConsecutiveUseLimitHours ?? 15),
      ptoConsecutiveUseNoticeDays: Number(policy.ptoConsecutiveUseNoticeDays ?? 30)
    };
  } catch (e) {
    ptoPolicyError.value = e.response?.data?.error?.message || e.message || 'Failed to load PTO policy';
  } finally {
    ptoPolicyLoading.value = false;
  }
};

const savePtoPolicy = async () => {
  if (!editingAgency.value?.id) return;
  try {
    savingPtoPolicy.value = true;
    ptoPolicyError.value = '';
    await api.put('/payroll/pto-policy', {
      agencyId: editingAgency.value.id,
      ptoEnabled: ptoPolicyDraft.value.ptoEnabled !== false,
      defaultPayRate: Number(ptoPolicyDraft.value.defaultPayRate || 0),
      policy: {
        sickAccrualPer30: Number(ptoPolicyDraft.value.sickAccrualPer30 || 0),
        trainingAccrualPer30: Number(ptoPolicyDraft.value.trainingAccrualPer30 || 0),
        trainingPtoEnabled: ptoPolicyDraft.value.trainingPtoEnabled === true,
        sickAnnualRolloverCap: Number(ptoPolicyDraft.value.sickAnnualRolloverCap || 0),
        sickAnnualMaxAccrual: Number(ptoPolicyDraft.value.sickAnnualMaxAccrual || 0),
        trainingMaxBalance: Number(ptoPolicyDraft.value.trainingMaxBalance || 0),
        trainingForfeitOnTermination: ptoPolicyDraft.value.trainingForfeitOnTermination !== false,
        ptoConsecutiveUseLimitHours: Number(ptoPolicyDraft.value.ptoConsecutiveUseLimitHours || 0),
        ptoConsecutiveUseNoticeDays: Number(ptoPolicyDraft.value.ptoConsecutiveUseNoticeDays || 0),
        ptoEnabled: ptoPolicyDraft.value.ptoEnabled !== false
      }
    });
    await loadPtoPolicy();
  } catch (e) {
    ptoPolicyError.value = e.response?.data?.error?.message || e.message || 'Failed to save PTO policy';
  } finally {
    savingPtoPolicy.value = false;
  }
};

const loadMileageRates = async () => {
  if (!editingAgency.value?.id) return;
  try {
    mileageRatesLoading.value = true;
    mileageRatesError.value = '';
    const resp = await api.get('/payroll/mileage-rates', { params: { agencyId: editingAgency.value.id } });
    const rates = resp.data?.rates || [];
    const byTier = new Map((rates || []).map((r) => [Number(r.tierLevel), Number(r.ratePerMile || 0)]));
    mileageRatesDraft.value = {
      tier1: byTier.get(1) || 0,
      tier2: byTier.get(2) || 0,
      tier3: byTier.get(3) || 0
    };
    mileageRatesLoadedAgencyId.value = Number(editingAgency.value.id) || null;
  } catch (e) {
    mileageRatesError.value = e.response?.data?.error?.message || e.message || 'Failed to load mileage rates';
  } finally {
    mileageRatesLoading.value = false;
  }
};

const saveMileageRates = async () => {
  if (!editingAgency.value?.id) return;
  try {
    savingMileageRates.value = true;
    mileageRatesError.value = '';
    const t1 = Number(mileageRatesDraft.value.tier1 || 0);
    const t2 = Number(mileageRatesDraft.value.tier2 || 0);
    const t3 = Number(mileageRatesDraft.value.tier3 || 0);
    await api.put('/payroll/mileage-rates', {
      rates: [
        { tierLevel: 1, ratePerMile: t1 },
        { tierLevel: 2, ratePerMile: t2 },
        { tierLevel: 3, ratePerMile: t3 }
      ]
    }, { params: { agencyId: editingAgency.value.id } });
    await loadMileageRates();
  } catch (e) {
    mileageRatesError.value = e.response?.data?.error?.message || e.message || 'Failed to save mileage rates';
  } finally {
    savingMileageRates.value = false;
  }
};

const loadOfficeLocations = async () => {
  if (!editingAgency.value?.id) return;
  try {
    officeLocationsLoading.value = true;
    officeLocationsError.value = '';
    const resp = await api.get('/payroll/office-locations', {
      params: { agencyId: editingAgency.value.id, includeInactive: true }
    });
    const rows = resp.data || [];
    const nextEdits = { ...(officeLocationEdits.value || {}) };
    for (const l of rows) {
      const tz = String(l.timezone || '').trim();
      const tzKnown = tz && americaTimeZones.includes(tz);
      nextEdits[l.id] = {
        name: l.name || '',
        timezone: tzKnown ? tz : (tz ? '' : 'America/New_York'),
        timezoneCustom: tzKnown ? '' : (tz || ''),
        streetAddress: l.street_address || '',
        city: l.city || '',
        state: l.state || '',
        postalCode: l.postal_code || '',
        isActive: !!l.is_active
      };
    }
    // Set edits first, then rows, to avoid a render race where rows exist but edits don't.
    officeLocationEdits.value = nextEdits;
    officeLocations.value = rows;
    officeLocationsLoadedAgencyId.value = Number(editingAgency.value.id) || null;
  } catch (e) {
    officeLocationsError.value = e.response?.data?.error?.message || e.message || 'Failed to load office locations';
    officeLocations.value = [];
  } finally {
    officeLocationsLoading.value = false;
  }
};

const createOfficeLocation = async () => {
  if (!editingAgency.value?.id) return;
  if (!newOfficeLocationName.value) return;
  try {
    creatingOfficeLocation.value = true;
    officeLocationsError.value = '';
    const tz = String(newOfficeLocationTimezone.value || '').trim() || String(newOfficeLocationTimezoneCustom.value || '').trim() || 'America/New_York';
    await api.post('/payroll/office-locations', {
      name: newOfficeLocationName.value,
      timezone: tz
    }, { params: { agencyId: editingAgency.value.id } });
    newOfficeLocationName.value = '';
    newOfficeLocationTimezone.value = 'America/New_York';
    newOfficeLocationTimezoneCustom.value = '';
    await loadOfficeLocations();
  } catch (e) {
    officeLocationsError.value = e.response?.data?.error?.message || e.message || 'Failed to create office location';
  } finally {
    creatingOfficeLocation.value = false;
  }
};

const saveOfficeLocation = async (loc) => {
  if (!editingAgency.value?.id) return;
  if (!loc?.id) return;
  const draft = officeLocationEdits.value?.[loc.id];
  if (!draft) return;
  try {
    savingOfficeLocationId.value = loc.id;
    officeLocationsError.value = '';
    const tz = String(draft.timezone || '').trim() || String(draft.timezoneCustom || '').trim() || 'America/New_York';
    await api.patch(`/payroll/office-locations/${loc.id}`, {
      name: draft.name,
      timezone: tz,
      streetAddress: draft.streetAddress,
      city: draft.city,
      state: draft.state,
      postalCode: draft.postalCode,
      isActive: !!draft.isActive
    }, { params: { agencyId: editingAgency.value.id } });
    await loadOfficeLocations();
  } catch (e) {
    officeLocationsError.value = e.response?.data?.error?.message || e.message || 'Failed to save office location';
  } finally {
    savingOfficeLocationId.value = null;
  }
};

const loadPayrollRules = async () => {
  if (!editingAgency.value?.id) return;
  payrollRulesError.value = '';
  try {
    payrollRulesLoading.value = true;
    const resp = await api.get('/payroll/service-code-rules', { params: { agencyId: editingAgency.value.id } });
    const rows = resp.data || [];
    // Normalize numeric + checkbox types for v-model usage
    const normalized = rows.map((r) => ({
      ...r,
      category: r.category || 'direct',
      pay_rate_unit: r.pay_rate_unit || 'per_unit',
      other_slot: Number(r.other_slot || 1),
      duration_minutes: r.duration_minutes ?? '',
      pay_divisor: r.pay_divisor ?? 1,
      credit_value: r.credit_value ?? 0,
      counts_for_tier: r.counts_for_tier === 0 ? false : true
    }));
    payrollRules.value = normalized;
    // Baseline snapshot for dirty detection.
    const nextBase = {};
    for (const rr of normalized) {
      const code = String(rr?.service_code || '').trim();
      if (!code) continue;
      nextBase[code] = serializePayrollRule(rr);
    }
    payrollRulesBaselineByCode.value = nextBase;
  } catch (e) {
    payrollRulesError.value = e.response?.data?.error?.message || e.message || 'Failed to load payroll service codes';
    payrollRules.value = [];
    payrollRulesBaselineByCode.value = {};
  } finally {
    payrollRulesLoading.value = false;
  }
};

const serializePayrollRule = (row) => {
  const code = String(row?.service_code || '').trim();
  return JSON.stringify({
    service_code: code,
    category: String(row?.category || 'direct').trim().toLowerCase(),
    pay_rate_unit: String(row?.pay_rate_unit || 'per_unit').trim().toLowerCase(),
    pay_divisor: Number(row?.pay_divisor ?? 1),
    credit_value: Number(row?.credit_value ?? 0),
    counts_for_tier: row?.counts_for_tier ? 1 : 0,
    other_slot: Number(row?.other_slot ?? 1)
  });
};

const isPayrollRuleDirty = (row) => {
  const code = String(row?.service_code || '').trim();
  if (!code) return false;
  const base = payrollRulesBaselineByCode.value?.[code] || null;
  if (!base) return true;
  return base !== serializePayrollRule(row);
};

const dirtyPayrollRuleCodes = computed(() => {
  const out = [];
  for (const r of payrollRules.value || []) {
    const code = String(r?.service_code || '').trim();
    if (!code) continue;
    if (isPayrollRuleDirty(r)) out.push(code);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
});

const onPayrollRuleChanged = (row) => {
  if (!row) return;
  // Mirror backend normalization so UI doesn't "snap back" on reload.
  const cat = String(row.category || 'direct').trim().toLowerCase();
  row.category = cat || 'direct';
  if (!(cat === 'other' || cat === 'tutoring')) {
    row.other_slot = 1;
  } else {
    const slot = Number(row.other_slot || 1);
    row.other_slot = ([1, 2, 3].includes(slot) ? slot : 1);
  }
};

const savePayrollRule = async (row) => {
  if (!editingAgency.value?.id || !row?.service_code) return;
  const code = String(row.service_code || '').trim();
  if (!code) return;
  try {
    savingPayrollRule.value = true;
    savingPayrollRuleByCode.value = { ...(savingPayrollRuleByCode.value || {}), [code]: true };
    payrollRuleSaveErrorByCode.value = { ...(payrollRuleSaveErrorByCode.value || {}), [code]: '' };
    payrollRulesError.value = '';
    onPayrollRuleChanged(row);
    await api.post('/payroll/service-code-rules', {
      agencyId: editingAgency.value.id,
      serviceCode: code,
      category: row.category,
      otherSlot: row.other_slot,
      payRateUnit: row.pay_rate_unit || 'per_unit',
      // Duration is intentionally hidden/not used for now (credits drive hours).
      durationMinutes: null,
      countsForTier: row.counts_for_tier ? 1 : 0,
      payDivisor: row.pay_divisor,
      creditValue: row.credit_value
    });
    // Update baseline snapshot so the UI doesn't look "unsaved" after a successful save.
    payrollRulesBaselineByCode.value = { ...(payrollRulesBaselineByCode.value || {}), [code]: serializePayrollRule(row) };
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Failed to save service code rule';
    payrollRulesError.value = msg;
    payrollRuleSaveErrorByCode.value = { ...(payrollRuleSaveErrorByCode.value || {}), [code]: msg };
  } finally {
    savingPayrollRule.value = false;
    savingPayrollRuleByCode.value = { ...(savingPayrollRuleByCode.value || {}), [code]: false };
  }
};

const saveAllPayrollRules = async () => {
  if (!editingAgency.value?.id) return;
  const dirtyRows = (payrollRules.value || []).filter((r) => isPayrollRuleDirty(r));
  if (!dirtyRows.length) return;
  // Save sequentially so the UI state is deterministic and errors are attributable.
  for (const r of dirtyRows) {
    await savePayrollRule(r);
  }
  // Final reload so the table always matches DB canonical state.
  await loadPayrollRules();
};

const deletePayrollRule = async (row) => {
  if (!editingAgency.value?.id || !row?.service_code) return;
  const code = String(row.service_code || '').trim();
  if (!code) return;
  if (!window.confirm(`Delete service code rule "${code}"?`)) return;
  try {
    savingPayrollRule.value = true;
    payrollRulesError.value = '';
    await api.delete('/payroll/service-code-rules', { params: { agencyId: editingAgency.value.id, serviceCode: code } });
    payrollRules.value = (payrollRules.value || []).filter((r) => String(r.service_code || '').trim().toUpperCase() !== code.toUpperCase());
  } catch (e) {
    payrollRulesError.value = e.response?.data?.error?.message || e.message || 'Failed to delete service code rule';
  } finally {
    savingPayrollRule.value = false;
  }
};

const addPayrollRule = async () => {
  const code = String(newPayrollServiceCode.value || '').trim();
  if (!editingAgency.value?.id || !code) return;
  const exists = (payrollRules.value || []).some((r) => String(r.service_code || '').trim().toUpperCase() === code.toUpperCase());
  if (exists) {
    newPayrollServiceCode.value = '';
    return;
  }
  const row = {
    agency_id: editingAgency.value.id,
    service_code: code,
    category: 'direct',
    pay_rate_unit: 'per_unit',
    other_slot: 1,
    duration_minutes: '',
    pay_divisor: 1,
    credit_value: 0,
    counts_for_tier: true
  };
  payrollRules.value = [...payrollRules.value, row].sort((a, b) => String(a.service_code || '').localeCompare(String(b.service_code || '')));
  newPayrollServiceCode.value = '';
  await savePayrollRule(row);
};

// Icon templates (apply a full set of icons at once)
const iconTemplates = ref([]);
const selectedIconTemplateId = ref('');
const showIconTemplateModal = ref(false);
const savingIconTemplate = ref(false);
const iconTemplateError = ref('');

const ICON_TEMPLATE_FIELDS = [
  'iconId',
  'chatIconId',
  'trainingFocusDefaultIconId',
  'moduleDefaultIconId',
  'userDefaultIconId',
  'documentDefaultIconId',
  'manageAgenciesIconId',
  'dashboardNotificationsIconId',
  'dashboardCommunicationsIconId',
  'dashboardChatsIconId',
  'progressDashboardIconId',
  'viewAllProgressIconId',
  'manageClientsIconId',
  'schoolOverviewIconId',
  'externalCalendarAuditIconId',
  'dashboardPayrollIconId',
  'dashboardBillingIconId',
  'manageModulesIconId',
  'manageDocumentsIconId',
  'manageUsersIconId',
  'platformSettingsIconId',
  'settingsIconId',
  'myDashboardChecklistIconId',
  'myDashboardTrainingIconId',
  'myDashboardDocumentsIconId',
  'myDashboardMyScheduleIconId',
  'myDashboardClientsIconId',
  'myDashboardClinicalNoteGeneratorIconId',
  'myDashboardSubmitIconId',
  'myDashboardPayrollIconId',
  'myDashboardMyAccountIconId',
  'myDashboardOnDemandTrainingIconId',
  'myDashboardCommunicationsIconId',
  'myDashboardChatsIconId',
  'myDashboardNotificationsIconId',
  'myDashboardSupervisionIconId',
  'schoolPortalProvidersIconId',
  'schoolPortalDaysIconId',
  'schoolPortalRosterIconId',
  'schoolPortalSkillsGroupsIconId',
  'schoolPortalContactAdminIconId',
  'schoolPortalFaqIconId',
  'schoolPortalSchoolStaffIconId',
  'schoolPortalParentQrIconId',
  'schoolPortalParentSignIconId',
  'schoolPortalUploadPacketIconId',
  'schoolPortalPublicDocumentsIconId',
  'schoolPortalAnnouncementsIconId',
  'statusExpiredIconId',
  'tempPasswordExpiredIconId',
  'taskOverdueIconId',
  'onboardingCompletedIconId',
  'invitationExpiredIconId',
  'firstLoginIconId',
  'firstLoginPendingIconId',
  'passwordChangedIconId'
];

const defaultAgencyForm = () => ({
  organizationType: userRole.value === 'super_admin' ? 'agency' : 'school',
  affiliatedAgencyId: '',
  name: '',
  officialName: '',
  slug: '',
  // Office-only (when organizationType === 'office')
  officeTimezone: 'America/New_York',
  officeSvgUrl: '',
  officeAdditionalAgencyIds: [],
  logoUrl: '',
  logoPath: '',
  primaryColor: '#0f172a',
  secondaryColor: '#1e40af',
  accentColor: '#f97316',
  iconId: null,
  chatIconId: null,
  isActive: true,
  trainingFocusDefaultIconId: null,
  moduleDefaultIconId: null,
  userDefaultIconId: null,
  documentDefaultIconId: null,
  manageAgenciesIconId: null,
  dashboardNotificationsIconId: null,
  dashboardCommunicationsIconId: null,
  dashboardChatsIconId: null,
  progressDashboardIconId: null,
  viewAllProgressIconId: null,
  manageClientsIconId: null,
  schoolOverviewIconId: null,
  externalCalendarAuditIconId: null,
  dashboardPayrollIconId: null,
  dashboardBillingIconId: null,
  manageModulesIconId: null,
  manageDocumentsIconId: null,
  manageUsersIconId: null,
  platformSettingsIconId: null,
  settingsIconId: null,
  myDashboardChecklistIconId: null,
  myDashboardTrainingIconId: null,
  myDashboardDocumentsIconId: null,
  myDashboardSubmitIconId: null,
  myDashboardPayrollIconId: null,
  myDashboardMyAccountIconId: null,
  myDashboardMyScheduleIconId: null,
  myDashboardClientsIconId: null,
  myDashboardClinicalNoteGeneratorIconId: null,
  myDashboardOnDemandTrainingIconId: null,
  myDashboardCommunicationsIconId: null,
  myDashboardChatsIconId: null,
  myDashboardNotificationsIconId: null,
  myDashboardSupervisionIconId: null,
  schoolPortalProvidersIconId: null,
  schoolPortalDaysIconId: null,
  schoolPortalRosterIconId: null,
  schoolPortalSkillsGroupsIconId: null,
  schoolPortalContactAdminIconId: null,
  schoolPortalFaqIconId: null,
  schoolPortalSchoolStaffIconId: null,
  schoolPortalParentQrIconId: null,
  schoolPortalParentSignIconId: null,
  schoolPortalUploadPacketIconId: null,
  schoolPortalPublicDocumentsIconId: null,
  schoolPortalAnnouncementsIconId: null,
  onboardingTeamEmail: '',
  phoneNumber: '',
  phoneExtension: '',
  // School-only directory enrichment fields (stored in school_profiles)
  schoolProfile: {
    districtName: '',
    schoolNumber: '',
    itscoEmail: '',
    schoolDaysTimes: '',
    bellScheduleStartTime: '',
    bellScheduleEndTime: '',
    primaryContactName: '',
    primaryContactEmail: '',
    primaryContactRole: '',
    secondaryContactText: ''
  },
  streetAddress: '',
  city: '',
  state: '',
  postalCode: '',
  portalUrl: '',
  tierSystemEnabled: true,
  tierThresholds: {
    tier1MinWeekly: 6,
    tier2MinWeekly: 13,
    tier3MinWeekly: 25
  },
  themeSettings: {
    fontFamily: '',
    loginBackground: ''
  },
  terminologySettings: {
    peopleOpsTerm: '',
    trainingModulesTerm: '',
    trainingFocusTerm: '',
    onboardingTerm: '',
    ongoingDevTerm: ''
  },
  intakeRetentionPolicy: {
    mode: 'inherit',
    days: 14
  },
  sessionSettings: {
    inactivityTimeoutMinutes: 8,
    heartbeatIntervalSeconds: 30
  },
  featureFlags: {
    // Controls dashboard module set + certain provider-only surfaces
    portalVariant: 'healthcare_provider',
    // Defaults are "enabled" to preserve existing behavior until an admin turns them off.
    inSchoolSubmissionsEnabled: true,
    medcancelEnabled: true,
    // Default OFF until explicitly enabled (requires GEMINI_API_KEY in backend).
    aiProviderSearchEnabled: false,

    // Default OFF until explicitly enabled (requires GEMINI_API_KEY in backend).
    noteAidEnabled: false,

    // Default OFF until explicitly enabled (agency-paid)
    clinicalNoteGeneratorEnabled: false,

    // Google Workspace SSO gate (off by default)
    googleSsoEnabled: false,
    googleSsoRequiredRoles: ['staff', 'admin', 'provider', 'clinical_practice_assistant'],
    googleSsoAllowedDomains: [],

    // Workspace provisioning (off by default)
    workspaceProvisioningEnabled: false,
    workspaceEmailDomain: '',
    workspaceEmailFormat: '',

    // SMS auto-provisioning for pre-hire
    smsAutoProvisionOnPrehire: false
  },
  // Notification icon fields
  statusExpiredIconId: null,
  tempPasswordExpiredIconId: null,
  taskOverdueIconId: null,
  onboardingCompletedIconId: null,
  invitationExpiredIconId: null,
  firstLoginIconId: null,
  firstLoginPendingIconId: null,
  passwordChangedIconId: null,
  supportTicketCreatedIconId: null,

  // Ticketing notification scope (agency-only; defaults to all child org types)
  ticketingNotificationOrgTypes: ['school', 'program', 'learning']
});

const agencyForm = ref(defaultAgencyForm());

// -------------------------
// School Staff (contacts + accounts)
// -------------------------
const isSchoolOrg = computed(() => String(agencyForm.value.organizationType || 'agency').toLowerCase() === 'school');

const schoolStaffUsers = ref([]);
const schoolStaffUsersLoading = ref(false);
const schoolStaffUsersError = ref('');

const loadSchoolStaffUsers = async () => {
  if (!editingAgency.value?.id || !isSchoolOrg.value) {
    schoolStaffUsers.value = [];
    return;
  }
  try {
    schoolStaffUsersLoading.value = true;
    schoolStaffUsersError.value = '';
    const res = await api.get(`/agencies/${editingAgency.value.id}/school-staff/users`, { params: { _ts: Date.now() } });
    schoolStaffUsers.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    schoolStaffUsers.value = [];
    schoolStaffUsersError.value = e.response?.data?.error?.message || 'Failed to load school staff users';
  } finally {
    schoolStaffUsersLoading.value = false;
  }
};

const schoolStaffUsersByEmail = computed(() => {
  const map = {};
  for (const u of schoolStaffUsers.value || []) {
    const email = String(u?.email || u?.work_email || '').trim().toLowerCase();
    if (email) map[email] = u;
  }
  return map;
});

const reloadSchoolContacts = async () => {
  if (!editingAgency.value?.id) return;
  try {
    const resp = await api.get(`/agencies/${editingAgency.value.id}`, { params: { _ts: Date.now() } });
    if (editingAgency.value && resp?.data) {
      editingAgency.value.school_contacts = Array.isArray(resp.data?.school_contacts) ? resp.data.school_contacts : [];
    }
  } catch {
    // best effort
  }
};

const newSchoolContact = ref({
  fullName: '',
  roleTitle: '',
  email: '',
  notes: '',
  isPrimary: false
});
const addingSchoolContact = ref(false);
const addSchoolContactError = ref('');

const addSchoolContact = async () => {
  if (!editingAgency.value?.id) return;
  const pendingEmail = String(newSchoolContact.value.email || '').trim().toLowerCase();
  const pendingName = String(newSchoolContact.value.fullName || '').trim();
  try {
    addingSchoolContact.value = true;
    addSchoolContactError.value = '';
    await api.post(`/agencies/${editingAgency.value.id}/school-contacts`, {
      fullName: String(newSchoolContact.value.fullName || '').trim(),
      roleTitle: String(newSchoolContact.value.roleTitle || '').trim(),
      email: String(newSchoolContact.value.email || '').trim(),
      notes: String(newSchoolContact.value.notes || '').trim(),
      isPrimary: newSchoolContact.value.isPrimary === true
    });
    newSchoolContact.value = { fullName: '', roleTitle: '', email: '', notes: '', isPrimary: false };
    await reloadSchoolContacts();
  } catch (e) {
    addSchoolContactError.value = e.response?.data?.error?.message || 'Failed to add contact';
    // If the backend returns an error but the contact still appears (rare but observed),
    // refresh and treat it as success to avoid confusing the user.
    await reloadSchoolContacts();
    const list = Array.isArray(editingAgency.value?.school_contacts) ? editingAgency.value.school_contacts : [];
    const exists = list.some((c) => {
      const ce = String(c?.email || '').trim().toLowerCase();
      const cn = String(c?.full_name || '').trim();
      if (pendingEmail && ce && ce === pendingEmail) return true;
      if (pendingName && cn && cn === pendingName) return true;
      return false;
    });
    if (exists) {
      addSchoolContactError.value = '';
      newSchoolContact.value = { fullName: '', roleTitle: '', email: '', notes: '', isPrimary: false };
    }
  } finally {
    addingSchoolContact.value = false;
  }
};

const editingSchoolContactId = ref(null);
const schoolContactEdits = ref({}); // contactId -> draft
const savingSchoolContactId = ref(null);
const deletingSchoolContactId = ref(null);
const creatingSchoolStaffUserContactId = ref(null);
const revokingSchoolStaffUserId = ref(null);

const startEditSchoolContact = (c) => {
  if (!c?.id) return;
  editingSchoolContactId.value = c.id;
  schoolContactEdits.value[c.id] = {
    fullName: c.full_name || '',
    roleTitle: c.role_title || '',
    email: c.email || '',
    notes: c.notes || '',
    isPrimary: !!c.is_primary
  };
};

const cancelEditSchoolContact = (contactId) => {
  const id = contactId ?? editingSchoolContactId.value;
  if (!id) return;
  try {
    delete schoolContactEdits.value[id];
  } catch {
    schoolContactEdits.value[id] = undefined;
  }
  if (editingSchoolContactId.value === id) editingSchoolContactId.value = null;
};

const saveSchoolContact = async (contactId) => {
  if (!editingAgency.value?.id || !contactId) return;
  const draft = schoolContactEdits.value?.[contactId];
  if (!draft) return;
  try {
    savingSchoolContactId.value = contactId;
    await api.put(`/agencies/${editingAgency.value.id}/school-contacts/${contactId}`, {
      fullName: String(draft.fullName || '').trim(),
      roleTitle: String(draft.roleTitle || '').trim(),
      email: String(draft.email || '').trim(),
      notes: String(draft.notes || '').trim(),
      isPrimary: draft.isPrimary === true
    });
    await reloadSchoolContacts();
    await loadSchoolStaffUsers(); // email may have changed
    cancelEditSchoolContact(contactId);
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to save contact');
  } finally {
    savingSchoolContactId.value = null;
  }
};

const deleteSchoolContact = async (c) => {
  if (!editingAgency.value?.id || !c?.id) return;
  const label = (c.full_name || c.email || `Contact #${c.id}`);
  const ok = window.confirm(`Are you sure you want to delete "${label}" from this school? This cannot be undone.`);
  if (!ok) return;

  try {
    deletingSchoolContactId.value = c.id;
    await api.delete(`/agencies/${editingAgency.value.id}/school-contacts/${c.id}`);
    await reloadSchoolContacts();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to delete contact');
  } finally {
    deletingSchoolContactId.value = null;
  }
};

const createSchoolStaffUserForContact = async (c) => {
  if (!editingAgency.value?.id || !c?.id) return;
  if (!c?.email) {
    alert('This contact needs an email to create a user account.');
    return;
  }
  try {
    creatingSchoolStaffUserContactId.value = c.id;
    const res = await api.post(`/agencies/${editingAgency.value.id}/school-contacts/${c.id}/create-user`);
    const setupLink = res?.data?.setupLink || '';
    if (setupLink) {
      try {
        await navigator.clipboard.writeText(setupLink);
        alert('School staff user created. Setup link copied to clipboard.');
      } catch {
        alert(`School staff user created. Setup link:\n\n${setupLink}`);
      }
    } else {
      alert('School staff user created.');
    }
    await loadSchoolStaffUsers();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to create user account');
  } finally {
    creatingSchoolStaffUserContactId.value = null;
  }
};

const revokeSchoolStaffAccess = async (u) => {
  if (!editingAgency.value?.id || !u?.id) return;
  const label = `${u.first_name || ''} ${u.last_name || ''}`.trim() || (u.email || `User #${u.id}`);
  const ok = window.confirm(`Revoke portal access for "${label}" on this school?`);
  if (!ok) return;

  try {
    revokingSchoolStaffUserId.value = u.id;
    await api.post(`/agencies/${editingAgency.value.id}/school-staff/users/${u.id}/revoke-access`);
    await loadSchoolStaffUsers();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to revoke access');
  } finally {
    revokingSchoolStaffUserId.value = null;
  }
};

// If a school org somehow lands on the old Contact tab, redirect.
watch(
  () => agencyForm.value.organizationType,
  () => {
    if (isSchoolOrg.value && activeTab.value === 'contact') activeTab.value = 'school_staff';
  },
  { immediate: true }
);

// Load accounts when the School Staff tab is opened.
watch([editingAgency, activeTab], () => {
  if (editingAgency.value?.id && isSchoolOrg.value && activeTab.value === 'school_staff') {
    loadSchoolStaffUsers();
  }
});

const availableFontFamilies = ref([]);
const loadingFontFamilies = ref(false);

const buildFontCssValue = (familyName) => {
  const fam = String(familyName || '').trim();
  if (!fam) return '';
  // Store a CSS-ready font-family value (matches existing persisted shape)
  return `'${fam}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
};

const labelFromFontCssValue = (v) => {
  const s = String(v || '').trim();
  if (!s) return '';
  // "'Family Name', ..." -> Family Name
  const m = s.match(/^['"]([^'"]+)['"]/);
  if (m?.[1]) return m[1];
  // Family Name, ...
  return s.split(',')[0].trim();
};

const themeFontOptions = computed(() => {
  const opts = (availableFontFamilies.value || []).map((fam) => ({
    label: fam,
    value: buildFontCssValue(fam)
  }));

  // Preserve legacy/custom values so the current selection doesn't disappear.
  const current = agencyForm.value?.themeSettings?.fontFamily || '';
  if (current && !opts.some((o) => o.value === current)) {
    opts.unshift({
      label: `${labelFromFontCssValue(current)} (current)`,
      value: current
    });
  }
  return opts;
});

const fetchFontFamiliesForOrg = async (orgId) => {
  try {
    loadingFontFamilies.value = true;
    const params = {};
    if (orgId) params.agencyId = orgId;
    const res = await api.get('/fonts/families', { params });
    availableFontFamilies.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    availableFontFamilies.value = [];
  } finally {
    loadingFontFamilies.value = false;
  }
};

const normalizeText = (v) => String(v || '').trim().toLowerCase();

const sortByNameAsc = (list) => {
  return [...(list || [])].sort((a, b) => normalizeText(a?.name).localeCompare(normalizeText(b?.name)));
};

// In embedded mode, `agencies` may only contain the selected school/program,
// so we keep a separate list of parent agencies to populate affiliation pickers.
const parentAgenciesOverride = ref(null); // array | null

const parentAgencies = computed(() => {
  const src = Array.isArray(parentAgenciesOverride.value) ? parentAgenciesOverride.value : (agencies.value || []);
  return sortByNameAsc((src || []).filter(a => String(a.organization_type || 'agency').toLowerCase() === 'agency'));
});

const affiliableAgencies = computed(() => parentAgencies.value);

const selectedAgencyForList = computed(() => {
  const id = selectedAgencyFilterId.value ? parseInt(selectedAgencyFilterId.value, 10) : null;
  if (!id) return null;
  return parentAgencies.value.find((a) => a.id === id) || null;
});

const selectedAgencyIdForList = computed(() => {
  const id = selectedAgencyFilterId.value ? parseInt(selectedAgencyFilterId.value, 10) : null;
  return Number.isFinite(id) && id ? id : null;
});

const affiliatesForSelectedAgency = computed(() => {
  const agencyId = selectedAgencyIdForList.value;
  if (!agencyId) return [];
  const list = Array.isArray(affiliatedOrganizations.value) ? affiliatedOrganizations.value : [];
  return list
    .filter((o) => o && o.id && o.id !== agencyId)
    .filter((o) => String(o?.organization_type || 'agency').toLowerCase() !== 'agency');
});

const isSelectedAgencyFilterRow = (org) => {
  const agencyId = selectedAgencyIdForList.value;
  if (!agencyId) return false;
  if (!org?.id) return false;
  if (String(org?.organization_type || 'agency').toLowerCase() !== 'agency') return false;
  return org.id === agencyId;
};

const applyFilters = (list) => {
  const q = normalizeText(searchQuery.value);
  return (list || []).filter((o) => {
    if (!q) return true;
    const hay = `${normalizeText(o?.name)} ${normalizeText(o?.slug)} ${normalizeText(o?.portal_url)}`;
    return hay.includes(q);
  });
};

const sortOrganizations = (list) => {
  const mode = sortMode.value;
  const sorted = [...(list || [])];
  const typeRank = (t) => {
    const v = String(t || 'agency').toLowerCase();
    if (v === 'agency') return 0;
    // "office" is our Building organization type
    if (v === 'office') return 1;
    if (v === 'school') return 2;
    if (v === 'program') return 3;
    if (v === 'learning') return 4;
    return 9;
  };
  sorted.sort((a, b) => {
    if (mode === 'status_desc') {
      const av = a?.is_active ? 1 : 0;
      const bv = b?.is_active ? 1 : 0;
      if (av !== bv) return bv - av;
      return normalizeText(a?.name).localeCompare(normalizeText(b?.name));
    }
    if (mode === 'type_asc') {
      const ar = typeRank(a?.organization_type);
      const br = typeRank(b?.organization_type);
      if (ar !== br) return ar - br;
      return normalizeText(a?.name).localeCompare(normalizeText(b?.name));
    }
    if (mode === 'slug_asc') {
      return normalizeText(a?.slug).localeCompare(normalizeText(b?.slug));
    }
    if (mode === 'name_desc') {
      return normalizeText(b?.name).localeCompare(normalizeText(a?.name));
    }
    // name_asc default
    return normalizeText(a?.name).localeCompare(normalizeText(b?.name));
  });
  return sorted;
};

const organizationsToRender = computed(() => {
  const view = String(typeFilter.value || 'agencies').toLowerCase();
  const selectedAgencyId = selectedAgencyIdForList.value;

  if (view === 'agencies') {
    // If an agency is selected, pin it at the top and show its affiliated orgs below as full rows.
    if (!selectedAgencyId) {
      return sortOrganizations(applyFilters(parentAgencies.value));
    }
    const pinned = selectedAgencyForList.value ? [selectedAgencyForList.value] : [];
    const children = sortOrganizations(applyFilters(affiliatesForSelectedAgency.value));
    return [...pinned, ...children];
  }

  const base = selectedAgencyId ? (affiliatedOrganizations.value || []) : (agencies.value || []);
  const buildingsBase = selectedAgencyId ? (buildingsForSelectedAgency.value || []) : (buildings.value || []);
  const typeOf = (o) => String(o?.organization_type || 'agency').toLowerCase();

  if (view === 'buildings') {
    return sortOrganizations(applyFilters(buildingsBase));
  }
  if (view === 'schools') {
    return sortOrganizations(applyFilters((base || []).filter((o) => typeOf(o) === 'school')));
  }
  if (view === 'programs') {
    return sortOrganizations(applyFilters((base || []).filter((o) => typeOf(o) === 'program')));
  }
  if (view === 'learning') {
    return sortOrganizations(applyFilters((base || []).filter((o) => typeOf(o) === 'learning')));
  }
  if (view === 'other') {
    return sortOrganizations(
      applyFilters((base || []).filter((o) => !['agency', 'office', 'school', 'program', 'learning'].includes(typeOf(o))))
    );
  }

  // organizations view (all non-agency)
  const nonAgencies = (base || []).filter((o) => typeOf(o) !== 'agency');
  return sortOrganizations(applyFilters([...(nonAgencies || []), ...(buildingsBase || [])]));
});

const isOfficeType = computed(() => String(agencyForm.value.organizationType || '').toLowerCase() === 'office');

const OFFICE_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu'
];

const canCreateOffice = computed(() => {
  const r = String(userRole.value || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'clinical_practice_assistant' || r === 'staff';
});

const canAttachAdditionalOfficeAgencies = computed(() => {
  // Only super_admin or an admin who has multiple agency memberships.
  if (String(userRole.value || '').toLowerCase() === 'super_admin') return true;
  if (String(userRole.value || '').toLowerCase() !== 'admin') return false;
  return (affiliableAgencies.value || []).length > 1;
});

const addOfficeAdditionalAgency = () => {
  if (!Array.isArray(agencyForm.value.officeAdditionalAgencyIds)) {
    agencyForm.value.officeAdditionalAgencyIds = [];
  }
  agencyForm.value.officeAdditionalAgencyIds.push('');
};

const removeOfficeAdditionalAgency = (idx) => {
  const arr = agencyForm.value.officeAdditionalAgencyIds;
  if (!Array.isArray(arr)) return;
  arr.splice(idx, 1);
};

const requiresAffiliatedAgency = computed(() => {
  const t = String(agencyForm.value.organizationType || 'agency').toLowerCase();
  return ['school', 'program', 'learning', 'office'].includes(t);
});

const affiliatedAgencyLocked = computed(() => {
  if (!requiresAffiliatedAgency.value) return true;
  if (editingAgency.value) return userRole.value !== 'super_admin';
  return userRole.value !== 'super_admin' && affiliableAgencies.value.length === 1;
});

const selectedAffiliatedAgency = computed(() => {
  const id = parseInt(agencyForm.value.affiliatedAgencyId, 10);
  return affiliableAgencies.value.find(a => a.id === id) || null;
});

const PRICING_UNIT_CENTS = {
  school: 2500,
  program: 1000,
  learning: 1000
};

const estimatedUnitPriceCents = computed(() => {
  const t = String(agencyForm.value.organizationType || '').toLowerCase();
  return PRICING_UNIT_CENTS[t] || 0;
});

const formatMoneyCents = (cents) => {
  const n = Number(cents || 0);
  return `$${(n / 100).toFixed(2)}`;
};

const fetchIconTemplates = async () => {
  try {
    const response = await api.get('/icon-templates', { params: { scope: 'agency' } });
    iconTemplates.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch icon templates:', err);
    iconTemplates.value = [];
  }
};

const openSplashPreview = (organization) => {
  if (!organization) return;
  previewOrganizationSlug.value = organization.slug || organization.portal_url || '';
  previewOrganizationId.value = organization.id || null;
  showSplashPreviewModal.value = true;
};

const closeSplashPreview = () => {
  showSplashPreviewModal.value = false;
  previewOrganizationSlug.value = '';
  previewOrganizationId.value = null;
};

const clearIconTemplateSelection = () => {
  selectedIconTemplateId.value = '';
};

const applySelectedIconTemplate = () => {
  const templateId = parseInt(selectedIconTemplateId.value, 10);
  const template = iconTemplates.value.find(t => t.id === templateId);
  if (!template) return;

  const data = template.icon_data || {};
  ICON_TEMPLATE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      agencyForm.value[field] = data[field];
    }
  });
};

const clearIconsToPlatformDefaults = () => {
  ICON_TEMPLATE_FIELDS.forEach((field) => {
    agencyForm.value[field] = null;
  });
  clearIconTemplateSelection();
};

const openSaveIconTemplateModal = () => {
  iconTemplateError.value = '';
  showIconTemplateModal.value = true;
};

const closeSaveIconTemplateModal = () => {
  showIconTemplateModal.value = false;
  iconTemplateError.value = '';
};

const buildCurrentIconData = () => {
  const iconData = {};
  ICON_TEMPLATE_FIELDS.forEach((field) => {
    iconData[field] = agencyForm.value[field] ?? null;
  });
  return iconData;
};

const saveIconTemplate = async ({ name, description, iconData }) => {
  try {
    savingIconTemplate.value = true;
    iconTemplateError.value = '';

    // By default, create a global agency template (super-admin use case).
    // If backend forbids global creation for non-super-admins, we fall back to agency-scoped creation.
    let payload = {
      name,
      description,
      scope: 'agency',
      agencyId: null,
      isShared: true,
      iconData
    };

    try {
      const created = await api.post('/icon-templates', payload);
      await fetchIconTemplates();
      selectedIconTemplateId.value = String(created.data.id);
      showIconTemplateModal.value = false;
      return;
    } catch (err) {
      const message = err.response?.data?.error?.message || '';
      // Fall back to agency-scoped template if global is not allowed for this user.
      if (message.toLowerCase().includes('global') && editingAgency.value?.id) {
        payload = { ...payload, agencyId: editingAgency.value.id, isShared: false };
        const created = await api.post('/icon-templates', payload);
        await fetchIconTemplates();
        selectedIconTemplateId.value = String(created.data.id);
        showIconTemplateModal.value = false;
        return;
      }
      throw err;
        }
      } catch (err) {
    console.error('Failed to save icon template:', err);
    iconTemplateError.value = err.response?.data?.error?.message || 'Failed to save icon template';
  } finally {
    savingIconTemplate.value = false;
  }
};

const clearAgencyFilter = () => {
  selectedAgencyFilterId.value = '';
  affiliatedOrganizations.value = [];
  // Return list to default "all agencies" mode
  typeFilter.value = 'agencies';
};

watch(
  () => typeFilter.value,
  async (next) => {
    const view = String(next || '').toLowerCase();
    if (view === 'organizations' && selectedAgencyFilterId.value) {
      await loadAffiliatedForSelectedAgency();
    }
  }
);

const buildAgencyTeamMapsFromUsers = (allUsers) => {
  const adminsByAgency = {};
  const supportByAgency = {};
  const parseAgencyIds = (u) => {
    if (Array.isArray(u?.agencyIds)) return u.agencyIds.map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x));
    const raw = u?.agency_ids ?? u?.agencyIds ?? '';
    if (typeof raw === 'string') return raw.split(',').map((x) => parseInt(String(x || '').trim(), 10)).filter((x) => Number.isFinite(x));
    return [];
  };

  for (const u of allUsers || []) {
    const ids = parseAgencyIds(u);
    if (!ids.length) continue;
    for (const id of ids) {
      if (u.role === 'admin' || u.role === 'super_admin') {
        if (!adminsByAgency[id]) adminsByAgency[id] = [];
        adminsByAgency[id].push(u);
      }
      if (u.role === 'support') {
        if (!supportByAgency[id]) supportByAgency[id] = [];
        supportByAgency[id].push(u);
      }
    }
  }

  agencyAdmins.value = adminsByAgency;
  agencySupport.value = supportByAgency;
};

const loadAffiliatedForSelectedAgency = async () => {
  if (!selectedAgencyFilterId.value) {
    affiliatedOrganizations.value = [];
    return;
  }
  const agencyId = parseInt(selectedAgencyFilterId.value, 10);
  if (!agencyId) return;

  try {
    loadingAffiliates.value = true;
    error.value = '';
    const res = await api.get(`/agencies/${agencyId}/affiliated-organizations`);
    affiliatedOrganizations.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    affiliatedOrganizations.value = [];
    error.value = e.response?.data?.error?.message || 'Failed to load affiliated organizations';
  } finally {
    loadingAffiliates.value = false;
  }
};

const handleAgencyFilterChange = async () => {
  if (!selectedAgencyFilterId.value) {
    affiliatedOrganizations.value = [];
    return;
  }
  // Ensure the list is expanded so affiliates are visible.
  navCollapsed.value = false;
  await loadAffiliatedForSelectedAgency();
};

const normalizeBuildingAsOrg = (b) => {
  const id = Number(b?.id);
  return {
    ...b,
    id,
    __kind: 'building',
    __key: `building:${id}`,
    organization_type: 'office',
    // This UI expects a slug for display/search; buildings don't have a true slug.
    slug: b?.slug ? String(b.slug) : `building-${id}`,
    portal_url: null
  };
};

const buildingsForSelectedAgency = computed(() => {
  const selectedAgencyId = selectedAgencyIdForList.value;
  const list = buildings.value || [];
  if (!selectedAgencyId) return list;
  // Best-effort filter using legacy office_locations.agency_id as the "primary" agency.
  return list.filter((b) => Number(b?.agency_id) === Number(selectedAgencyId));
});

const fetchAgencies = async () => {
  try {
    loading.value = true;
    const [agenciesRes, usersRes, buildingsRes] = await Promise.all([api.get('/agencies'), api.get('/users'), api.get('/offices')]);
    agencies.value = agenciesRes.data || [];
    const allUsers = usersRes.data || [];
    availableUsers.value = allUsers;
    buildings.value = (buildingsRes.data || []).map(normalizeBuildingAsOrg);
    
    // Initialize support ref for all agencies
    agencies.value.forEach(agency => {
      if (!agencySupport.value[agency.id]) {
        agencySupport.value[agency.id] = [];
      }
    });

    buildAgencyTeamMapsFromUsers(allUsers);

    // If a parent agency is selected (either view), refresh affiliated orgs too.
    if (selectedAgencyFilterId.value) {
      await loadAffiliatedForSelectedAgency();
    }

    // Optional: restore selection from URL (?orgId=123)
    const orgId = route.query?.orgId;
    if (orgId && orgId !== 'create' && !showCreateModal.value && !editingAgency.value) {
      const id = parseInt(String(orgId), 10);
      if (!Number.isNaN(id)) {
        const match = agencies.value.find((a) => a.id === id);
        if (match) editAgency(match);
      }
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load agencies';
  } finally {
    loading.value = false;
  }
};

const fetchUsers = async () => {
  try {
    const response = await api.get('/users');
    availableUsers.value = response.data;
  } catch (err) {
    console.error('Failed to load users:', err);
  }
};

const showAssignAdmin = (agency) => {
  selectedAgency.value = agency;
  showAssignAdminModal.value = true;
  if (availableUsers.value.length === 0) fetchUsers();
};

const showAssignSupport = (agency) => {
  selectedAgency.value = agency;
  showAssignSupportModal.value = true;
  if (availableUsers.value.length === 0) fetchUsers();
};

const assignAdmin = async () => {
  if (!selectedAgency.value || !selectedUserId.value) return;
  
  try {
    assigning.value = true;
    await api.post('/users/assign/agency', {
      userId: parseInt(selectedUserId.value),
      agencyId: selectedAgency.value.id
    });
    
    // Update user role to admin if not already
    const user = availableUsers.value.find(u => u.id === parseInt(selectedUserId.value));
    if (user && user.role !== 'admin' && user.role !== 'super_admin') {
      await api.put(`/users/${user.id}`, { role: 'admin' });
    }
    
    await fetchAgencyAdmins(selectedAgency.value.id);
    closeAssignAdminModal();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to assign admin';
  } finally {
    assigning.value = false;
  }
};

const assignSupport = async () => {
  if (!selectedAgency.value || !selectedSupportUserId.value) return;
  
  try {
    assigningSupport.value = true;
    error.value = '';
    
    const user = availableUsers.value.find(u => u.id === parseInt(selectedSupportUserId.value));
    if (!user) {
      error.value = 'User not found';
      return;
    }
    
    // First assign to agency
    await api.post('/users/assign/agency', {
      userId: parseInt(selectedSupportUserId.value),
      agencyId: selectedAgency.value.id
    });
    
    // Update user role to support if not already support or super_admin
    // Note: We allow converting from admin to support, but only if they're not super_admin
    if (user.role !== 'support' && user.role !== 'super_admin') {
      try {
        const updateResponse = await api.put(`/users/${user.id}`, { role: 'support' });
        console.log('User role updated to support:', updateResponse.data);
      } catch (roleErr) {
        console.error('Failed to update user role to support:', roleErr);
        const roleErrorMsg = roleErr.response?.data?.error?.message || roleErr.message || 'Unknown error';
        // Don't fail the assignment if role update fails - user is already assigned to agency
        // Just show a warning
        console.warn(`User assigned to agency, but role update failed: ${roleErrorMsg}`);
        // Only show alert if it's not a validation error (which might be expected)
        if (!roleErrorMsg.includes('validation') && !roleErrorMsg.includes('Invalid')) {
          alert(`User assigned to agency, but role update failed: ${roleErrorMsg}. The user may need their role updated manually.`);
        }
      }
    } else if (user.role === 'super_admin') {
      console.log('User is super_admin, skipping role update');
    }
    
    // Refresh both admins and support in case role changed
    await fetchAgencyAdmins(selectedAgency.value.id);
    await fetchAgencySupport(selectedAgency.value.id);
    closeAssignSupportModal();
  } catch (err) {
    console.error('Assign support error:', err);
    const errorMsg = err.response?.data?.error?.message || 'Failed to assign support';
    error.value = errorMsg;
    alert(errorMsg);
  } finally {
    assigningSupport.value = false;
  }
};

const removeAdmin = async (agencyId, userId) => {
  if (!confirm('Remove admin access for this agency?')) return;
  
  try {
    await api.post('/users/remove/agency', {
      userId: userId,
      agencyId: agencyId
    });
    await fetchAgencyAdmins(agencyId);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to remove admin';
  }
};

const removeSupport = async (agencyId, userId) => {
  if (!confirm('Remove support access for this agency?')) return;
  
  try {
    await api.post('/users/remove/agency', {
      userId: userId,
      agencyId: agencyId
    });
    await fetchAgencySupport(agencyId);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to remove support';
  }
};

const closeAssignAdminModal = () => {
  showAssignAdminModal.value = false;
  selectedAgency.value = null;
  selectedUserId.value = '';
};

const closeAssignSupportModal = () => {
  showAssignSupportModal.value = false;
  selectedAgency.value = null;
  selectedSupportUserId.value = '';
};

const handleColorChange = (colorType, value) => {
  // Ensure color value is properly formatted (always uppercase hex)
  const formattedValue = value.toUpperCase();
  if (colorType === 'primary') {
    agencyForm.value.primaryColor = formattedValue;
  } else if (colorType === 'secondary') {
    agencyForm.value.secondaryColor = formattedValue;
  } else if (colorType === 'accent') {
    agencyForm.value.accentColor = formattedValue;
  }
};

const handleTextColorChange = (colorType, value) => {
  // Validate and format hex color from text input
  let formattedValue = value.trim();
  
  // If it doesn't start with #, add it
  if (formattedValue && !formattedValue.startsWith('#')) {
    formattedValue = '#' + formattedValue;
  }
  
  // Validate hex format (basic check)
  if (formattedValue && /^#[0-9A-Fa-f]{6}$/.test(formattedValue)) {
    formattedValue = formattedValue.toUpperCase();
    if (colorType === 'primary') {
      agencyForm.value.primaryColor = formattedValue;
    } else if (colorType === 'secondary') {
      agencyForm.value.secondaryColor = formattedValue;
    } else if (colorType === 'accent') {
      agencyForm.value.accentColor = formattedValue;
    }
  }
};

const safeJsonObject = (value, fallback = {}) => {
  if (value === null || value === undefined) return fallback;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
};

const normalizeOrganizationType = (value, fallback = 'agency') => {
  const t = String(value ?? '').trim().toLowerCase();
  return t || fallback;
};

const looksLikeUploadsPath = (value) => {
  const s = String(value || '').trim();
  if (!s) return false;
  // Common legacy patterns: '/uploads/x.png', 'uploads/x.png'
  return s.startsWith('/uploads/') || s.startsWith('uploads/');
};

const normalizeUploadsPath = (value) => {
  const s = String(value || '').trim();
  if (!s) return '';
  if (s.startsWith('/uploads/')) return s;
  if (s.startsWith('uploads/')) return `/${s}`;
  return s;
};

const isAbsoluteHttpUrl = (value) => {
  const s = String(value || '').trim();
  return s.startsWith('http://') || s.startsWith('https://');
};

const editAgency = async (agency) => {
  // Buildings (office_locations) are managed in the Buildings module, not in this agency editor.
  const orgTypeEarly = String(agency?.organization_type || agency?.organizationType || '').toLowerCase();
  if (agency?.__kind === 'building' || orgTypeEarly === 'office') {
    const officeId = agency?.id;
    if (officeId) {
      router.push({ path: '/buildings/settings', query: { officeId: String(officeId) } });
    } else {
      router.push({ path: '/buildings/settings' });
    }
    return;
  }

  if ((showCreateModal.value || (editingAgency.value && editingAgency.value.id !== agency.id)) && !confirmDiscardUnsavedEdits()) {
    return;
  }

  showCreateModal.value = false;
  // For school orgs, always fetch full details (cache-busted) so school_profile + school_contacts
  // are available and up-to-date.
  try {
    const orgType = String(agency?.organization_type || agency?.organizationType || agencyForm.value?.organizationType || 'agency').toLowerCase();
    if (orgType === 'school' && agency?.id) {
      const resp = await api.get(`/agencies/${agency.id}`, { params: { _ts: Date.now() } });
      agency = resp?.data || agency;
    }
  } catch {
    // best effort; fall back to provided object
  }

  editingAgency.value = agency;
  // If selecting a parent agency, treat it as the "affiliation context" for the list and show its affiliated orgs below.
  if (String(agency?.organization_type || 'agency').toLowerCase() === 'agency') {
    selectedAgencyFilterId.value = String(agency.id);
    // Best effort: load affiliates immediately so list updates without needing a second dropdown.
    loadAffiliatedForSelectedAgency();
    // Ensure the list is expanded so the affiliates are visible.
    navCollapsed.value = false;
  }
  const palette = getColorPalette(agency.color_palette);
  const terminology = safeJsonObject(agency.terminology_settings, {});
  
  // Parse theme_settings if it exists
  const themeSettings = safeJsonObject(agency.theme_settings, {});

  const retentionPolicyRaw = safeJsonObject(agency.intake_retention_policy_json, {});
  const retentionMode = ['inherit', 'days', 'never'].includes(String(retentionPolicyRaw.mode || '').toLowerCase())
    ? String(retentionPolicyRaw.mode || 'inherit').toLowerCase()
    : 'inherit';
  const retentionDays = Number.isFinite(Number(retentionPolicyRaw.days))
    ? Number(retentionPolicyRaw.days)
    : 14;

  const sessionSettingsRaw = safeJsonObject(agency.session_settings_json, {});
  const sessionInactivityMinutes = Number.isFinite(Number(sessionSettingsRaw.inactivityTimeoutMinutes))
    ? Number(sessionSettingsRaw.inactivityTimeoutMinutes)
    : 8;
  const sessionHeartbeatSeconds = Number.isFinite(Number(sessionSettingsRaw.heartbeatIntervalSeconds))
    ? Number(sessionSettingsRaw.heartbeatIntervalSeconds)
    : 30;
  
  // Parse custom parameters if they exist
  const customParams = safeJsonObject(agency.custom_parameters, {});

  // Parse feature flags if they exist
  const featureFlags = agency.feature_flags
    ? (typeof agency.feature_flags === 'string'
        ? (() => { try { return JSON.parse(agency.feature_flags); } catch { return {}; } })()
        : agency.feature_flags)
    : {};
  
  customParamKeys.value = Object.keys(customParams || {});
  customParameters.value = { ...(customParams || {}) };
  
  // Set logo input method based on what's available
  if (agency.logo_path) {
    logoInputMethod.value = 'upload';
  } else if (agency.logo_url && looksLikeUploadsPath(agency.logo_url)) {
    // Legacy data: some orgs stored uploaded asset paths in logo_url (ex: '/uploads/foo.png').
    // Backend validators require logoUrl to be an absolute URL, so treat this as logoPath.
    logoInputMethod.value = 'upload';
    agency.logo_path = normalizeUploadsPath(agency.logo_url);
    agency.logo_url = null;
  } else if (agency.logo_url) {
    logoInputMethod.value = 'url';
  } else {
    logoInputMethod.value = 'url'; // Default to URL
  }
  
  const tierThresholds = (() => {
    const raw = agency.tier_thresholds_json ?? null;
    if (!raw) return { tier1MinWeekly: 6, tier2MinWeekly: 13, tier3MinWeekly: 25 };
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return {
        tier1MinWeekly: Number(obj?.tier1MinWeekly ?? 6),
        tier2MinWeekly: Number(obj?.tier2MinWeekly ?? 13),
        tier3MinWeekly: Number(obj?.tier3MinWeekly ?? 25)
      };
    } catch {
      return { tier1MinWeekly: 6, tier2MinWeekly: 13, tier3MinWeekly: 25 };
    }
  })();
  
  agencyForm.value = {
    organizationType: normalizeOrganizationType(agency.organization_type || agency.organizationType, 'agency'),
    affiliatedAgencyId: '',
    name: agency.name,
    officialName: agency.official_name || '',
    slug: agency.slug,
    officeTimezone: 'America/New_York',
    officeSvgUrl: '',
    officeAdditionalAgencyIds: [],
    logoUrl: agency.logo_url || '',
    logoPath: agency.logo_path || '',
    primaryColor: palette.primary || '#0f172a',
    secondaryColor: palette.secondary || '#1e40af',
    accentColor: palette.accent || '#f97316',
    iconId: agency.icon_id || null,
    chatIconId: agency.chat_icon_id ?? null,
    // Backend stores is_active as TINYINT(1) in many envs; validator expects boolean.
    isActive: (agency.is_active === 1 || agency.is_active === true || String(agency.is_active || '').toLowerCase() === 'true'),
    trainingFocusDefaultIconId: agency.training_focus_default_icon_id ?? null,
    moduleDefaultIconId: agency.module_default_icon_id ?? null,
    userDefaultIconId: agency.user_default_icon_id ?? null,
    documentDefaultIconId: agency.document_default_icon_id ?? null,
    manageAgenciesIconId: agency.manage_agencies_icon_id ?? null,
    dashboardNotificationsIconId: agency.dashboard_notifications_icon_id ?? null,
    dashboardCommunicationsIconId: agency.dashboard_communications_icon_id ?? null,
    dashboardChatsIconId: agency.dashboard_chats_icon_id ?? null,
    progressDashboardIconId: agency.progress_dashboard_icon_id ?? null,
    viewAllProgressIconId: agency.view_all_progress_icon_id ?? null,
    manageClientsIconId: agency.manage_clients_icon_id ?? null,
    schoolOverviewIconId: agency.school_overview_icon_id ?? null,
    externalCalendarAuditIconId: agency.external_calendar_audit_icon_id ?? null,
    dashboardPayrollIconId: agency.dashboard_payroll_icon_id ?? null,
    dashboardBillingIconId: agency.dashboard_billing_icon_id ?? null,
    manageModulesIconId: agency.manage_modules_icon_id ?? null,
    manageDocumentsIconId: agency.manage_documents_icon_id ?? null,
    manageUsersIconId: agency.manage_users_icon_id ?? null,
    platformSettingsIconId: agency.platform_settings_icon_id ?? null,
    settingsIconId: agency.settings_icon_id ?? null,
    myDashboardChecklistIconId: agency.my_dashboard_checklist_icon_id ?? null,
    myDashboardTrainingIconId: agency.my_dashboard_training_icon_id ?? null,
    myDashboardDocumentsIconId: agency.my_dashboard_documents_icon_id ?? null,
    myDashboardMyAccountIconId: agency.my_dashboard_my_account_icon_id ?? null,
    myDashboardMyScheduleIconId: agency.my_dashboard_my_schedule_icon_id ?? null,
    myDashboardClientsIconId: agency.my_dashboard_clients_icon_id ?? null,
    myDashboardClinicalNoteGeneratorIconId: agency.my_dashboard_clinical_note_generator_icon_id ?? null,
    myDashboardOnDemandTrainingIconId: agency.my_dashboard_on_demand_training_icon_id ?? null,
    myDashboardPayrollIconId: agency.my_dashboard_payroll_icon_id ?? null,
    myDashboardSubmitIconId: agency.my_dashboard_submit_icon_id ?? null,
    myDashboardCommunicationsIconId: agency.my_dashboard_communications_icon_id ?? null,
    myDashboardChatsIconId: agency.my_dashboard_chats_icon_id ?? null,
    myDashboardNotificationsIconId: agency.my_dashboard_notifications_icon_id ?? null,
    myDashboardSupervisionIconId: agency.my_dashboard_supervision_icon_id ?? null,
    schoolPortalProvidersIconId: agency.school_portal_providers_icon_id ?? null,
    schoolPortalDaysIconId: agency.school_portal_days_icon_id ?? null,
    schoolPortalRosterIconId: agency.school_portal_roster_icon_id ?? null,
    schoolPortalSkillsGroupsIconId: agency.school_portal_skills_groups_icon_id ?? null,
    schoolPortalContactAdminIconId: agency.school_portal_contact_admin_icon_id ?? null,
    schoolPortalFaqIconId: agency.school_portal_faq_icon_id ?? null,
    schoolPortalSchoolStaffIconId: agency.school_portal_school_staff_icon_id ?? null,
    schoolPortalParentQrIconId: agency.school_portal_parent_qr_icon_id ?? null,
    schoolPortalParentSignIconId: agency.school_portal_parent_sign_icon_id ?? null,
    schoolPortalUploadPacketIconId: agency.school_portal_upload_packet_icon_id ?? null,
    schoolPortalPublicDocumentsIconId: agency.school_portal_public_documents_icon_id ?? null,
    schoolPortalAnnouncementsIconId: agency.school_portal_announcements_icon_id ?? null,
    onboardingTeamEmail: agency.onboarding_team_email || '',
    phoneNumber: agency.phone_number || '',
    phoneExtension: agency.phone_extension || '',
    schoolProfile: {
      districtName: agency?.school_profile?.district_name || '',
      schoolNumber: agency?.school_profile?.school_number || '',
      itscoEmail: agency?.school_profile?.itsco_email || '',
      schoolDaysTimes: agency?.school_profile?.school_days_times || '',
      bellScheduleStartTime: agency?.school_profile?.bell_schedule_start_time ? String(agency.school_profile.bell_schedule_start_time).slice(0, 5) : '',
      bellScheduleEndTime: agency?.school_profile?.bell_schedule_end_time ? String(agency.school_profile.bell_schedule_end_time).slice(0, 5) : '',
      primaryContactName: agency?.school_profile?.primary_contact_name || '',
      primaryContactEmail: agency?.school_profile?.primary_contact_email || '',
      primaryContactRole: agency?.school_profile?.primary_contact_role || '',
      secondaryContactText: agency?.school_profile?.secondary_contact_text || ''
    },
    streetAddress: agency.street_address || '',
    city: agency.city || '',
    state: agency.state || '',
    postalCode: agency.postal_code || '',
    portalUrl: agency.portal_url || '',
    tierSystemEnabled: (agency.tier_system_enabled === 1 || agency.tier_system_enabled === true || String(agency.tier_system_enabled || '').toLowerCase() === 'true'),
    tierThresholds,
    themeSettings: {
      fontFamily: themeSettings.fontFamily || '',
      loginBackground: themeSettings.loginBackground || ''
    },
    terminologySettings: {
      peopleOpsTerm: terminology.peopleOpsTerm || '',
      trainingModulesTerm: terminology.trainingModulesTerm || '',
      trainingFocusTerm: terminology.trainingFocusTerm || '',
      onboardingTerm: terminology.onboardingTerm || '',
      ongoingDevTerm: terminology.ongoingDevTerm || ''
    },
    intakeRetentionPolicy: {
      mode: retentionMode,
      days: retentionDays
    },
    sessionSettings: {
      inactivityTimeoutMinutes: sessionInactivityMinutes,
      heartbeatIntervalSeconds: sessionHeartbeatSeconds
    },
    featureFlags: {
      portalVariant: String(featureFlags.portalVariant || 'healthcare_provider'),
      inSchoolSubmissionsEnabled: featureFlags.inSchoolSubmissionsEnabled !== false,
      medcancelEnabled: featureFlags.medcancelEnabled !== false,
      aiProviderSearchEnabled: featureFlags.aiProviderSearchEnabled === true,
      noteAidEnabled: featureFlags.noteAidEnabled === true,
      clinicalNoteGeneratorEnabled: featureFlags.clinicalNoteGeneratorEnabled === true,

      googleSsoEnabled: featureFlags.googleSsoEnabled === true,
      googleSsoRequiredRoles: Array.isArray(featureFlags.googleSsoRequiredRoles)
        ? featureFlags.googleSsoRequiredRoles
        : ['staff', 'admin', 'provider', 'clinical_practice_assistant'],
      googleSsoAllowedDomains: Array.isArray(featureFlags.googleSsoAllowedDomains)
        ? featureFlags.googleSsoAllowedDomains
        : [],

      workspaceProvisioningEnabled: featureFlags.workspaceProvisioningEnabled === true,
      workspaceEmailDomain: String(featureFlags.workspaceEmailDomain || ''),
      workspaceEmailFormat: String(featureFlags.workspaceEmailFormat || ''),
      smsAutoProvisionOnPrehire: featureFlags.smsAutoProvisionOnPrehire === true
    },
    // Notification icon fields
    statusExpiredIconId: agency.status_expired_icon_id ?? null,
    tempPasswordExpiredIconId: agency.temp_password_expired_icon_id ?? null,
    taskOverdueIconId: agency.task_overdue_icon_id ?? null,
    onboardingCompletedIconId: agency.onboarding_completed_icon_id ?? null,
    invitationExpiredIconId: agency.invitation_expired_icon_id ?? null,
    firstLoginIconId: agency.first_login_icon_id ?? null,
    firstLoginPendingIconId: agency.first_login_pending_icon_id ?? null,
    passwordChangedIconId: agency.password_changed_icon_id ?? null,
    supportTicketCreatedIconId: agency.support_ticket_created_icon_id ?? null,
    ticketingNotificationOrgTypes: (() => {
      const raw = agency.ticketing_notification_org_types_json ?? null;
      let parsed = raw;
      if (typeof raw === 'string' && raw.trim()) {
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
      }
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
      }
      return ['school', 'program', 'learning'];
    })()
  };

  // Load available uploaded font families for this org (includes platform + org fonts)
  fetchFontFamiliesForOrg(agency?.id || null);

  // Load sites for agencies in the main Settings tab (not Payroll tab).
  if (String(agency?.organization_type || 'agency').toLowerCase() === 'agency') {
    loadNotificationTriggers();
    // Load announcements so the tab is instantly ready when clicked.
    loadAgencyAnnouncements();
    loadAgencyScheduledAnnouncements();
  }

  // Reset lazy-loaded tab caches when switching agencies.
  mileageRatesLoadedAgencyId.value = null;
  officeLocationsLoadedAgencyId.value = null;
  mileageRatesError.value = '';
  officeLocationsError.value = '';
  mileageRatesDraft.value = { tier1: 0, tier2: 0, tier3: 0 };
  officeLocations.value = [];
  officeLocationEdits.value = {};

  // If you're already on the Sites tab, load immediately (watch won't fire).
  if (String(activeTab.value || '') === 'sites' && String(agency?.organization_type || 'agency').toLowerCase() === 'agency') {
    loadOfficeLocations();
    loadMileageRates();
  }

  // Helpful on smaller screens where the detail pane stacks below the list:
  // bring the editor into view so you don't have to scroll to find it.
  await nextTick();
  try {
    detailPaneRef.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  } catch {
    // ignore
  }
};

watch(
  () => activeTab.value,
  (next) => {
    if (String(next || '') !== 'announcements') return;
    if (!editingAgency.value?.id) return;
    if (String(editingAgency.value.organization_type || 'agency').toLowerCase() !== 'agency') return;
    const agencyId = Number(editingAgency.value.id);
    if (!agencyId) return;
    if (announcementsLoadedAgencyId.value !== agencyId) {
      loadAgencyAnnouncements();
    }
    if (scheduledAnnouncementsLoadedAgencyId.value !== agencyId) {
      loadAgencyScheduledAnnouncements();
    }
  }
);

watch(
  () => activeTab.value,
  (next) => {
    if (String(next || '') !== 'sites') return;
    if (!editingAgency.value?.id) return;
    if (String(editingAgency.value.organization_type || 'agency').toLowerCase() !== 'agency') return;
    const agencyId = Number(editingAgency.value.id);
    if (!agencyId) return;

    // Load sites data lazily so it doesn't run on every tab.
    if (!officeLocationsLoading.value && officeLocationsLoadedAgencyId.value !== agencyId) {
      loadOfficeLocations();
    }
    if (!mileageRatesLoading.value && mileageRatesLoadedAgencyId.value !== agencyId) {
      loadMileageRates();
    }
  }
);

const applyAffiliatedAgencyBranding = async () => {
  if (!editingAgency.value) return;
  try {
    applyingAffiliatedBranding.value = true;
    error.value = '';
    await api.post(`/organizations/${editingAgency.value.id}/apply-affiliated-agency-branding`);
    // Refresh organization data in-place so the editor reflects new branding
    const refreshed = await api.get(`/agencies/${editingAgency.value.id}`);
    editAgency(refreshed.data);
    await fetchAgencies();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to apply affiliated agency branding';
  } finally {
    applyingAffiliatedBranding.value = false;
  }
};

const getColorPalette = (palette) => {
  if (!palette) return {};
  return typeof palette === 'string' ? JSON.parse(palette) : palette;
};

const getOrgAccentColor = (org) => {
  try {
    const p = getColorPalette(org?.color_palette);
    return p?.primary || p?.accent || 'var(--primary)';
  } catch {
    return 'var(--primary)';
  }
};

const handleLogoError = (event, agencyId = null) => {
  if (agencyId) {
    logoErrors.value[agencyId] = true;
  } else {
    logoError.value = true;
  }
  // Hide broken image
  if (event && event.target) {
    event.target.style.display = 'none';
  }
};

watch(() => agencyForm.value.logoUrl, () => {
  logoError.value = false;
  // Clear logoPath when URL is entered
  if (agencyForm.value.logoUrl && logoInputMethod.value === 'url') {
    agencyForm.value.logoPath = '';
  }
});

watch(() => agencyForm.value.logoPath, () => {
  // Clear logoUrl when path is set
  if (agencyForm.value.logoPath && logoInputMethod.value === 'upload') {
    agencyForm.value.logoUrl = '';
  }
});

// If switching to Office, keep the UI on General (Office-only fields live there).
watch(
  () => String(agencyForm.value.organizationType || '').toLowerCase(),
  (t) => {
    if (t === 'office') {
      activeTab.value = 'general';
      // Ensure defaults for the office flow.
      if (!agencyForm.value.officeTimezone) agencyForm.value.officeTimezone = 'America/New_York';
      if (!Array.isArray(agencyForm.value.officeAdditionalAgencyIds)) agencyForm.value.officeAdditionalAgencyIds = [];
    }
  }
);

const handleLogoFileSelect = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'Logo file must be 5MB or smaller';
    return;
  }
  
  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    error.value = 'Invalid file type. Please upload a PNG, JPG, GIF, SVG, or WebP image.';
    return;
  }
  
  uploadingLogo.value = true;
  error.value = '';
  
  try {
    const formData = new FormData();
    formData.append('logo', file);
    
    // Don't set Content-Type header - let the API interceptor handle it for FormData
    // This ensures cookies are sent properly for authentication
    const response = await api.post('/logos/upload', formData);
    
    if (response.data.success) {
      agencyForm.value.logoPath = response.data.path;
      agencyForm.value.logoUrl = ''; // Clear URL when using upload
      logoInputMethod.value = 'upload'; // Switch to upload tab
      logoError.value = false;
    }
  } catch (err) {
    console.error('Error uploading logo:', err);
    error.value = err.response?.data?.error?.message || 'Failed to upload logo. Please try again.';
  } finally {
    uploadingLogo.value = false;
  }
};

const getLogoUrlFromPath = (logoPath) => {
  if (!logoPath) return null;
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
  // Accept any of:
  // - "uploads/logos/..."
  // - "/uploads/logos/..."
  // - "logos/..."
  // Normalize to "/uploads/logos/..."
  let p = String(logoPath || '').trim();
  if (p.startsWith('/')) p = p.substring(1);
  if (p.startsWith('uploads/')) p = p.substring('uploads/'.length);
  return `${apiBase}/uploads/${p}`;
};

const getAgencyLogoUrl = (agency) => {
  // Priority 1: logo_path (uploaded file)
  if (agency.logo_path) {
    return getLogoUrlFromPath(agency.logo_path);
  }
  // Priority 2: logo_url (external URL)
  if (agency.logo_url) {
    return agency.logo_url;
  }
  return null;
};

// Icons (used for org list + compact header)
const iconsById = ref({}); // { [iconId]: icon }
const loadIconsIndex = async () => {
  try {
    const res = await api.get('/icons', {
      params: {
        includePlatform: 'true',
        sortBy: 'name',
        sortOrder: 'asc'
      }
    });
    const list = Array.isArray(res.data) ? res.data : [];
    const idx = {};
    for (const icon of list) {
      if (!icon?.id) continue;
      idx[icon.id] = icon;
    }
    iconsById.value = idx;
  } catch {
    iconsById.value = {};
  }
};

const getAbsoluteUploadsUrl = (maybeRelativeUrl) => {
  if (!maybeRelativeUrl) return '';
  const u = String(maybeRelativeUrl || '').trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;

  // uploads are served from root (not under /api)
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
  const cleanUrl = u.startsWith('/') ? u : `/${u}`;
  return `${apiBase}${cleanUrl}`;
};

const getIconUrlFromIcon = (icon) => {
  if (!icon) return '';
  let iconUrl = icon.url;
  if (!iconUrl && icon.file_path) {
    let fp = String(icon.file_path || '').trim();
    if (fp.startsWith('/')) fp = fp.slice(1);
    if (fp.startsWith('uploads/')) fp = fp.substring('uploads/'.length);
    iconUrl = `/uploads/${fp}`;
  }
  return getAbsoluteUploadsUrl(iconUrl);
};

const getOrgIconUrl = (org) => {
  const iconId = org?.icon_id || org?.iconId || null;
  if (!iconId) return null;
  const icon = iconsById.value?.[iconId];
  if (!icon) return null;
  const url = getIconUrlFromIcon(icon);
  return url || null;
};

const handleIconError = (_e, orgId) => {
  iconErrorsByOrgId.value = { ...iconErrorsByOrgId.value, [orgId]: true };
};

const toggleAgencyStatus = () => {
  agencyForm.value.isActive = !agencyForm.value.isActive;
};

const isChildOrgRow = (org) => {
  const t = String(org?.organization_type || 'agency').toLowerCase();
  return ['school', 'program', 'learning'].includes(t);
};

const openDuplicateModal = (org) => {
  duplicatingOrganization.value = org;
  duplicateError.value = '';
  showDuplicateModal.value = true;
  const baseSlug = String(org.slug || '').trim() || 'organization';
  duplicateForm.value = {
    name: `${org.name} (Copy)`,
    slug: `${baseSlug}-copy`,
    portalUrl: ''
  };

  originalAgencyFormSnapshot.value = JSON.stringify(agencyForm.value);
  try {
    router.replace({ query: { ...route.query, orgId: String(agency.id) } });
  } catch {
    // ignore
  }
};

const closeDuplicateModal = () => {
  showDuplicateModal.value = false;
  duplicatingOrganization.value = null;
  duplicating.value = false;
  duplicateError.value = '';
};

const duplicateOrganization = async () => {
  if (!duplicatingOrganization.value) return;
  try {
    duplicating.value = true;
    duplicateError.value = '';

    const name = String(duplicateForm.value.name || '').trim();
    const slug = String(duplicateForm.value.slug || '').trim().toLowerCase();
    const portalUrl = String(duplicateForm.value.portalUrl || '').trim().toLowerCase();

    if (!name) throw new Error('Name is required');
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error('Slug must be lowercase alphanumeric with hyphens only');
    if (portalUrl && !/^[a-z0-9-]+$/.test(portalUrl)) throw new Error('Portal URL must be lowercase alphanumeric with hyphens only');

    await api.post(`/organizations/${duplicatingOrganization.value.id}/duplicate`, {
      name,
      slug,
      portalUrl: portalUrl || null
    });

    closeDuplicateModal();
    await fetchAgencies();
  } catch (e) {
    duplicateError.value = e.response?.data?.error?.message || e.message || 'Failed to duplicate organization';
  } finally {
    duplicating.value = false;
  }
};

const saveAgency = async () => {
  try {
    saving.value = true;
    error.value = ''; // Clear previous errors
    const wasEditingExisting = !!editingAgency.value;

    const orgType = String(agencyForm.value.organizationType || 'agency').toLowerCase();
    if (orgType === 'office') {
      // Office is an agency-owned asset, created via /api/offices
      if (!agencyForm.value.name || !agencyForm.value.name.trim()) {
        error.value = 'Office name is required';
        saving.value = false;
        return;
      }
      const aid = parseInt(agencyForm.value.affiliatedAgencyId, 10);
      if (!aid) {
        error.value = 'Agency is required';
        saving.value = false;
        return;
      }
      const officeName = agencyForm.value.name.trim();
      const timezone = String(agencyForm.value.officeTimezone || 'America/New_York').trim() || 'America/New_York';
      const svgUrl = String(agencyForm.value.officeSvgUrl || '').trim();

      try {
        const resp = await api.post('/offices', {
          agencyId: aid,
          name: officeName,
          timezone,
          svgUrl: svgUrl || null
        });
        const created = resp.data;

        // Super admin can attach multiple agencies immediately
        if (userRole.value === 'super_admin' && created?.id) {
          const ids = Array.isArray(agencyForm.value.officeAdditionalAgencyIds) ? agencyForm.value.officeAdditionalAgencyIds : [];
          const extra = ids
            .map((x) => parseInt(x, 10))
            .filter((n) => Number.isFinite(n) && n > 0)
            .filter((n) => n !== aid);
          for (const x of extra) {
            try {
              await api.post(`/offices/${created.id}/agencies`, { agencyId: x });
            } catch {
              // ignore per-agency attach failures
            }
          }
        }

        // Keep embedded/single-org editors open; office creation isn't used in embedded mode.
        closeModal();
        await fetchAgencies();

        // Route to Office settings to finish setup (rooms, types, SVG map, agencies, questionnaires)
        try {
          router.push({ path: '/office/settings', query: { officeId: String(created?.id || '') } });
        } catch {
          // ignore
        }
        return;
      } catch (e) {
        error.value = e.response?.data?.error?.message || 'Failed to create office';
        saving.value = false;
        return;
      }
    }
    
    // Validate required fields
    if (!agencyForm.value.name || !agencyForm.value.name.trim()) {
      error.value = 'Agency name is required';
      saving.value = false;
      return;
    }
    
    if (!agencyForm.value.slug || !agencyForm.value.slug.trim()) {
      error.value = 'Slug is required';
      saving.value = false;
      return;
    }
    
    // Validate and format slug
    let slug = agencyForm.value.slug.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      error.value = 'Slug must contain only lowercase letters, numbers, and hyphens';
      saving.value = false;
      return;
    }
    
    // Validate logo URL if provided
    // Validate logo URL if provided
    if (logoInputMethod.value === 'url' && agencyForm.value.logoUrl && agencyForm.value.logoUrl.trim()) {
      try {
        new URL(agencyForm.value.logoUrl.trim());
      } catch (e) {
        error.value = 'Logo URL must be a valid URL';
        saving.value = false;
        return;
      }
    }
    
    // Ensure color values are properly formatted (must be valid hex)
    const validateColor = (color) => {
      if (!color) return '#000000';
      let hex = color.trim();
      if (!hex.startsWith('#')) {
        hex = '#' + hex;
      }
      // If it's a 3-digit hex, expand to 6
      if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
        hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
      }
      return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : '#000000';
    };
    
    const clampNumber = (raw, min, max, fallback) => {
      const num = Number(raw);
      if (!Number.isFinite(num)) return fallback;
      return Math.min(max, Math.max(min, num));
    };

    const colorPalette = {
      primary: validateColor(agencyForm.value.primaryColor),
      secondary: validateColor(agencyForm.value.secondaryColor),
      accent: validateColor(agencyForm.value.accentColor)
    };
    
    // Build terminology settings object, only including non-empty values
    const terminologySettings = {};
    if (agencyForm.value.terminologySettings.peopleOpsTerm?.trim()) {
      terminologySettings.peopleOpsTerm = agencyForm.value.terminologySettings.peopleOpsTerm.trim();
    }
    if (agencyForm.value.terminologySettings.trainingModulesTerm?.trim()) {
      terminologySettings.trainingModulesTerm = agencyForm.value.terminologySettings.trainingModulesTerm.trim();
    }
    if (agencyForm.value.terminologySettings.trainingFocusTerm?.trim()) {
      terminologySettings.trainingFocusTerm = agencyForm.value.terminologySettings.trainingFocusTerm.trim();
    }
    if (agencyForm.value.terminologySettings.onboardingTerm?.trim()) {
      terminologySettings.onboardingTerm = agencyForm.value.terminologySettings.onboardingTerm.trim();
    }
    if (agencyForm.value.terminologySettings.ongoingDevTerm?.trim()) {
      terminologySettings.ongoingDevTerm = agencyForm.value.terminologySettings.ongoingDevTerm.trim();
    }
    
    // Build theme settings object
    const themeSettings = {};
    if (agencyForm.value.themeSettings?.fontFamily) {
      themeSettings.fontFamily = agencyForm.value.themeSettings.fontFamily;
    }
    if (agencyForm.value.themeSettings?.loginBackground) {
      themeSettings.loginBackground = agencyForm.value.themeSettings.loginBackground;
    }

    const retentionPolicyRaw = agencyForm.value.intakeRetentionPolicy || null;
    const retentionPolicy =
      retentionPolicyRaw && typeof retentionPolicyRaw === 'object'
        ? {
            mode: ['inherit', 'days', 'never'].includes(String(retentionPolicyRaw.mode || '').toLowerCase())
              ? String(retentionPolicyRaw.mode || 'inherit').toLowerCase()
              : 'inherit',
            days: Number.isFinite(Number(retentionPolicyRaw.days)) ? Number(retentionPolicyRaw.days) : 14
          }
        : null;

    const sessionSettingsRaw = agencyForm.value.sessionSettings || null;
    const sessionSettings =
      sessionSettingsRaw && typeof sessionSettingsRaw === 'object'
        ? {
            inactivityTimeoutMinutes: clampNumber(
              sessionSettingsRaw.inactivityTimeoutMinutes,
              1,
              240,
              8
            ),
            heartbeatIntervalSeconds: clampNumber(
              sessionSettingsRaw.heartbeatIntervalSeconds,
              10,
              300,
              30
            )
          }
        : null;
    
    // Build custom parameters object
    const customParams = {};
    customParamKeys.value.forEach(key => {
      if (key && key.trim() && customParameters.value[key]) {
        customParams[key.trim()] = customParameters.value[key];
      }
    });

    const normalizedOrganizationType = normalizeOrganizationType(agencyForm.value.organizationType, 'agency');
    
    // Some legacy orgs stored an uploads path inside logoUrl (ex: '/uploads/x.png').
    // If we send that through as logoUrl, backend validation fails. Preserve the logo by
    // converting uploads-like URLs into logoPath automatically.
    const rawLogoUrl = String(agencyForm.value.logoUrl || '').trim();
    const shouldTreatLogoUrlAsPath = rawLogoUrl && !isAbsoluteHttpUrl(rawLogoUrl) && looksLikeUploadsPath(rawLogoUrl);
    const logoUrlToSend =
      logoInputMethod.value === 'url'
        ? (shouldTreatLogoUrlAsPath ? null : (rawLogoUrl || null))
        : null;
    const logoPathToSend =
      logoInputMethod.value === 'upload'
        ? (agencyForm.value.logoPath || null)
        : (shouldTreatLogoUrlAsPath ? normalizeUploadsPath(rawLogoUrl) : null);

    const normalizeNullableText = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      const trimmed = s.trim();
      if (!trimmed) return null;
      const lower = trimmed.toLowerCase();
      if (lower === 'undefined' || lower === 'null') return null;
      return trimmed;
    };

    const normalizePhoneNumber = (v) => {
      const base = normalizeNullableText(v);
      if (!base) return null;
      // Normalize common Unicode "smart" dashes (ex: U+2011) to ASCII hyphen.
      const normalized = base.replace(/[‐‑‒–—−]/g, '-').replace(/\u00A0/g, ' ');
      // Strip any hidden/unexpected characters from copy/paste (keep phone-safe chars)
      const sanitized = normalized.replace(/[^\d\s\(\)\-\+\.]/g, '');
      const digits = sanitized.replace(/\D/g, '');
      if (!digits) return null;
      return sanitized.trim() || null;
    };

    const data = {
      organizationType: normalizedOrganizationType,
      name: agencyForm.value.name.trim(),
      officialName: agencyForm.value.officialName?.trim() || null,
      slug: slug,
      // Clear one when using the other (like platform branding)
      logoUrl: logoUrlToSend,
      logoPath: logoPathToSend,
      colorPalette: colorPalette,
      terminologySettings: Object.keys(terminologySettings).length > 0 ? terminologySettings : null,
      intakeRetentionPolicy: retentionPolicy,
      sessionSettings,
      iconId: agencyForm.value.iconId ?? null,
      chatIconId: agencyForm.value.chatIconId ?? null,
      isActive: agencyForm.value.isActive !== undefined ? agencyForm.value.isActive : true,
      trainingFocusDefaultIconId: agencyForm.value.trainingFocusDefaultIconId ?? null,
      moduleDefaultIconId: agencyForm.value.moduleDefaultIconId ?? null,
      userDefaultIconId: agencyForm.value.userDefaultIconId ?? null,
      documentDefaultIconId: agencyForm.value.documentDefaultIconId ?? null,
      manageAgenciesIconId: agencyForm.value.manageAgenciesIconId ?? null,
      dashboardNotificationsIconId: agencyForm.value.dashboardNotificationsIconId ?? null,
      dashboardCommunicationsIconId: agencyForm.value.dashboardCommunicationsIconId ?? null,
      dashboardChatsIconId: agencyForm.value.dashboardChatsIconId ?? null,
      progressDashboardIconId: agencyForm.value.progressDashboardIconId ?? null,
      viewAllProgressIconId: agencyForm.value.viewAllProgressIconId ?? null,
      manageClientsIconId: agencyForm.value.manageClientsIconId ?? null,
      schoolOverviewIconId: agencyForm.value.schoolOverviewIconId ?? null,
      externalCalendarAuditIconId: agencyForm.value.externalCalendarAuditIconId ?? null,
      dashboardPayrollIconId: agencyForm.value.dashboardPayrollIconId ?? null,
      dashboardBillingIconId: agencyForm.value.dashboardBillingIconId ?? null,
      manageModulesIconId: agencyForm.value.manageModulesIconId ?? null,
      manageDocumentsIconId: agencyForm.value.manageDocumentsIconId ?? null,
      manageUsersIconId: agencyForm.value.manageUsersIconId ?? null,
      platformSettingsIconId: agencyForm.value.platformSettingsIconId ?? null,
      settingsIconId: agencyForm.value.settingsIconId ?? null,
      myDashboardChecklistIconId: agencyForm.value.myDashboardChecklistIconId ?? null,
      myDashboardTrainingIconId: agencyForm.value.myDashboardTrainingIconId ?? null,
      myDashboardDocumentsIconId: agencyForm.value.myDashboardDocumentsIconId ?? null,
      myDashboardMyAccountIconId: agencyForm.value.myDashboardMyAccountIconId ?? null,
      myDashboardMyScheduleIconId: agencyForm.value.myDashboardMyScheduleIconId ?? null,
      myDashboardClientsIconId: agencyForm.value.myDashboardClientsIconId ?? null,
      myDashboardClinicalNoteGeneratorIconId: agencyForm.value.myDashboardClinicalNoteGeneratorIconId ?? null,
      myDashboardOnDemandTrainingIconId: agencyForm.value.myDashboardOnDemandTrainingIconId ?? null,
      myDashboardPayrollIconId: agencyForm.value.myDashboardPayrollIconId ?? null,
      myDashboardSubmitIconId: agencyForm.value.myDashboardSubmitIconId ?? null,
      myDashboardCommunicationsIconId: agencyForm.value.myDashboardCommunicationsIconId ?? null,
      myDashboardChatsIconId: agencyForm.value.myDashboardChatsIconId ?? null,
      myDashboardNotificationsIconId: agencyForm.value.myDashboardNotificationsIconId ?? null,
      myDashboardSupervisionIconId: agencyForm.value.myDashboardSupervisionIconId ?? null,
      schoolPortalProvidersIconId: agencyForm.value.schoolPortalProvidersIconId ?? null,
      schoolPortalDaysIconId: agencyForm.value.schoolPortalDaysIconId ?? null,
      schoolPortalRosterIconId: agencyForm.value.schoolPortalRosterIconId ?? null,
      schoolPortalSkillsGroupsIconId: agencyForm.value.schoolPortalSkillsGroupsIconId ?? null,
      schoolPortalContactAdminIconId: agencyForm.value.schoolPortalContactAdminIconId ?? null,
      schoolPortalFaqIconId: agencyForm.value.schoolPortalFaqIconId ?? null,
      schoolPortalSchoolStaffIconId: agencyForm.value.schoolPortalSchoolStaffIconId ?? null,
      schoolPortalParentQrIconId: agencyForm.value.schoolPortalParentQrIconId ?? null,
      schoolPortalParentSignIconId: agencyForm.value.schoolPortalParentSignIconId ?? null,
      schoolPortalUploadPacketIconId: agencyForm.value.schoolPortalUploadPacketIconId ?? null,
      schoolPortalPublicDocumentsIconId: agencyForm.value.schoolPortalPublicDocumentsIconId ?? null,
      schoolPortalAnnouncementsIconId: agencyForm.value.schoolPortalAnnouncementsIconId ?? null,
      onboardingTeamEmail: normalizeNullableText(agencyForm.value.onboardingTeamEmail),
      phoneNumber: normalizePhoneNumber(agencyForm.value.phoneNumber),
      // Schools don't use extensions (per directory requirements)
      phoneExtension:
        String(agencyForm.value.organizationType || '').toLowerCase() === 'school'
          ? null
          : normalizeNullableText(agencyForm.value.phoneExtension),
      streetAddress: agencyForm.value.streetAddress?.trim() || null,
      city: agencyForm.value.city?.trim() || null,
      state: agencyForm.value.state?.trim() || null,
      postalCode: agencyForm.value.postalCode?.trim() || null,
      portalUrl: agencyForm.value.portalUrl?.trim().toLowerCase() || null,
      tierSystemEnabled: !!agencyForm.value.tierSystemEnabled,
      tierThresholds: {
        tier1MinWeekly: Number(agencyForm.value.tierThresholds?.tier1MinWeekly ?? 6),
        tier2MinWeekly: Number(agencyForm.value.tierThresholds?.tier2MinWeekly ?? 13),
        tier3MinWeekly: Number(agencyForm.value.tierThresholds?.tier3MinWeekly ?? 25)
      },
      // Only include affiliation in payload when it is allowed/meaningful:
      // - Creating child orgs: required (admins can set at creation time)
      // - Editing existing orgs: only super_admin can re-affiliate (backend enforces)
      ...(requiresAffiliatedAgency.value
        ? (() => {
            const raw = parseInt(agencyForm.value.affiliatedAgencyId, 10);
            const ok = Number.isFinite(raw) && raw > 0;
            if (!ok) return {};
            if (editingAgency.value && userRole.value !== 'super_admin') return {};
            return { affiliatedAgencyId: raw };
          })()
        : {}),
      themeSettings: Object.keys(themeSettings).length > 0 ? themeSettings : null,
      customParameters: Object.keys(customParams).length > 0 ? customParams : null,
      featureFlags:
        String(agencyForm.value.organizationType || 'agency').toLowerCase() === 'agency'
          ? (agencyForm.value.featureFlags || null)
          : null,
      // Notification icon fields
      statusExpiredIconId: agencyForm.value.statusExpiredIconId ?? null,
      tempPasswordExpiredIconId: agencyForm.value.tempPasswordExpiredIconId ?? null,
      taskOverdueIconId: agencyForm.value.taskOverdueIconId ?? null,
      onboardingCompletedIconId: agencyForm.value.onboardingCompletedIconId ?? null,
      invitationExpiredIconId: agencyForm.value.invitationExpiredIconId ?? null,
      firstLoginIconId: agencyForm.value.firstLoginIconId ?? null,
      firstLoginPendingIconId: agencyForm.value.firstLoginPendingIconId ?? null,
      passwordChangedIconId: agencyForm.value.passwordChangedIconId ?? null,
      supportTicketCreatedIconId: agencyForm.value.supportTicketCreatedIconId ?? null,
      ticketingNotificationOrgTypes: Array.isArray(agencyForm.value.ticketingNotificationOrgTypes)
        ? agencyForm.value.ticketingNotificationOrgTypes.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean)
        : null,
      schoolProfile:
        String(agencyForm.value.organizationType || '').toLowerCase() === 'school'
          ? {
              districtName: agencyForm.value.schoolProfile?.districtName?.trim() || null,
              schoolNumber: agencyForm.value.schoolProfile?.schoolNumber?.trim() || null,
              itscoEmail: agencyForm.value.schoolProfile?.itscoEmail?.trim() || null,
              schoolDaysTimes: agencyForm.value.schoolProfile?.schoolDaysTimes?.trim() || null,
              bellScheduleStartTime: agencyForm.value.schoolProfile?.bellScheduleStartTime?.trim() || null,
              bellScheduleEndTime: agencyForm.value.schoolProfile?.bellScheduleEndTime?.trim() || null,
              primaryContactName: agencyForm.value.schoolProfile?.primaryContactName?.trim() || null,
              primaryContactEmail: agencyForm.value.schoolProfile?.primaryContactEmail?.trim() || null,
              primaryContactRole: agencyForm.value.schoolProfile?.primaryContactRole?.trim() || null,
              secondaryContactText: agencyForm.value.schoolProfile?.secondaryContactText?.trim() || null
            }
          : null
    };
    
    console.log('Saving agency with data:', JSON.stringify(data, null, 2));
    
    let updatedAgency;
    if (editingAgency.value) {
      const response = await api.put(`/agencies/${editingAgency.value.id}`, data);
      updatedAgency = response.data;
      
      // Update currentAgency if it's the one we just updated
      if (agencyStore.currentAgency?.id === updatedAgency.id) {
        agencyStore.setCurrentAgency(updatedAgency);
      }
      
      // Also update in the agencies array
      const agencyIndex = agencyStore.agencies.findIndex(a => a.id === updatedAgency.id);
      if (agencyIndex !== -1) {
        agencyStore.agencies[agencyIndex] = updatedAgency;
      }
      
      // Update userAgencies if it exists there
      const userAgencyIndex = agencyStore.userAgencies.findIndex(a => a.id === updatedAgency.id);
      if (userAgencyIndex !== -1) {
        agencyStore.userAgencies[userAgencyIndex] = updatedAgency;
      }
    } else {
      const response = await api.post('/agencies', data);
      updatedAgency = response.data;
    }

    // IMPORTANT: In embedded single-org contexts (School Portal settings / embedded org editor),
    // saving should not "exit" the editor. Keep the modal/editor open so users can continue.
    //
    // ALSO: For normal (non-embedded) edits, do NOT bounce the user back to the org picker.
    // If they clicked "Save" while editing a school, keep them on the same org after save.
    if (!wasEditingExisting && !embeddedSingleOrg.value) {
      // Creating new orgs can still close the modal.
    closeModal();
    }

    // Mark current form as the new baseline (no unsaved-changes prompt).
    originalAgencyFormSnapshot.value = JSON.stringify(agencyForm.value);
    // Keep editor state pointing at the updated agency record.
    if (updatedAgency) {
      editingAgency.value = updatedAgency;
    }

    await fetchAgencies();
  } catch (err) {
    console.error('Agency save error:', err);
    console.error('Error response:', err.response);
    console.error('Error response data:', err.response?.data);
    
    // Log the full error structure
    if (err.response?.data) {
      console.error('Full error response data:', JSON.stringify(err.response.data, null, 2));
      console.error('Error object keys:', Object.keys(err.response.data));
      if (err.response.data.error) {
        console.error('Error.error keys:', Object.keys(err.response.data.error));
        console.error('Error.error.errors:', err.response.data.error.errors);
        console.error('Error.error.details:', err.response.data.error.details);
        console.error('Error.error.message:', err.response.data.error.message);
      }
    }
    
    // Extract detailed error message
    let errorMessage = 'Failed to save agency';
    const errorData = err.response?.data?.error;
    
    if (errorData) {
      if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (errorData.details) {
        // Prefer express-validator "details" when present; it's more actionable than the generic message.
        errorMessage = `Validation failed: ${errorData.details}`;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
        // Validation errors from express-validator
        const validationErrors = errorData.errors.map(e => {
          const param = e.param || e.path || 'unknown';
          const msg = e.msg || e.message || JSON.stringify(e);
          return `${param}: ${msg}`;
        }).join(', ');
        errorMessage = `Validation failed: ${validationErrors}`;
      } else {
        // Try to stringify the whole error object
        errorMessage = `Validation failed: ${JSON.stringify(errorData)}`;
      }
    } else if (err.response?.data) {
      errorMessage = `Error: ${JSON.stringify(err.response.data)}`;
    }
    
    error.value = errorMessage;
    alert(`Failed to save agency:\n\n${errorMessage}`);
  } finally {
    saving.value = false;
  }
};

const archiveOrganization = async (org) => {
  const orgType = String(org?.organization_type || 'agency').toLowerCase();
  const label = orgType === 'office' || org?.__kind === 'building' ? 'building' : 'agency';
  if (!confirm(`Are you sure you want to archive this ${label}? Archived items will be hidden from most views but can be restored later.`)) {
    return;
  }
  
  try {
    if (orgType === 'office' || org?.__kind === 'building') {
      await api.post(`/offices/${org.id}/archive`);
    } else {
      await api.post(`/agencies/${org.id}/archive`);
    }
    await fetchAgencies();
  } catch (err) {
    error.value = err.response?.data?.error?.message || `Failed to archive ${label}`;
    alert(error.value);
  }
};

const restoreOrganization = async (org) => {
  const orgType = String(org?.organization_type || 'agency').toLowerCase();
  const label = orgType === 'office' || org?.__kind === 'building' ? 'building' : 'agency';
  if (!confirm(`Are you sure you want to restore this ${label}?`)) {
    return;
  }
  
  try {
    if (orgType === 'office' || org?.__kind === 'building') {
      await api.post(`/offices/${org.id}/restore`);
    } else {
      await api.post(`/agencies/${org.id}/restore`);
    }
    await fetchAgencies();
  } catch (err) {
    error.value = err.response?.data?.error?.message || `Failed to restore ${label}`;
    alert(error.value);
  }
};

const updateCustomParameterKey = (index, newKey) => {
  const oldKey = customParamKeys.value[index];
  if (newKey && newKey.trim()) {
    const trimmedKey = newKey.trim();
    // Update the key in the array
    customParamKeys.value.splice(index, 1, trimmedKey);
    // Update the value reference if it exists
    if (oldKey && customParameters.value[oldKey] !== undefined) {
      const value = customParameters.value[oldKey];
      delete customParameters.value[oldKey];
      customParameters.value[trimmedKey] = value;
    } else if (!customParameters.value[trimmedKey]) {
      // Initialize empty value if key is new
      customParameters.value[trimmedKey] = '';
    }
  } else {
    // Remove if empty
    if (oldKey && customParameters.value[oldKey] !== undefined) {
      delete customParameters.value[oldKey];
    }
    customParamKeys.value.splice(index, 1);
  }
};

const removeCustomParameter = (key) => {
  const index = customParamKeys.value.indexOf(key);
  if (index !== -1) {
    customParamKeys.value.splice(index, 1);
  }
  if (customParameters.value[key]) {
    delete customParameters.value[key];
  }
};

const getCustomParameterValue = (key) => {
  return customParameters.value[key] || '';
};

const updateCustomParameterValue = (key, value) => {
  if (key) {
    customParameters.value[key] = value || '';
  }
};

const addCustomParameter = () => {
  const newKey = `param_${Date.now()}`;
  customParamKeys.value.push(newKey);
  customParameters.value[newKey] = '';
};

const openPreviewModal = (agencyId) => {
  previewAgencyId.value = agencyId;
  showPreviewModal.value = true;
};

const closePreviewModal = () => {
  showPreviewModal.value = false;
  previewAgencyId.value = null;
};

const startCreateOrganization = () => {
  if (!confirmDiscardUnsavedEdits()) return;

  // Reset editor state, then enter create mode.
  closeModal();
  showCreateModal.value = true;
  originalAgencyFormSnapshot.value = JSON.stringify(agencyForm.value);

  try {
    router.replace({ query: { ...route.query, orgId: 'create' } });
  } catch {
    // ignore
  }
};

const closeModal = () => {
  showCreateModal.value = false;
  editingAgency.value = null;
  activeTab.value = 'general'; // Reset to first tab
  // Reset list context too (back to "all agencies")
  selectedAgencyFilterId.value = '';
  affiliatedOrganizations.value = [];
  announcementsLoading.value = false;
  announcementsSaving.value = false;
  announcementsError.value = '';
  announcementsLoadedAgencyId.value = null;
  announcementsDraft.value = { birthdayEnabled: false, birthdayTemplate: 'Happy Birthday, {fullName}' };
  scheduledAnnouncementsLoading.value = false;
  scheduledAnnouncementsError.value = '';
  scheduledAnnouncements.value = [];
  scheduledAnnouncementsLoadedAgencyId.value = null;
  scheduledSubmitting.value = false;
  scheduledFormError.value = '';
  resetScheduledDraft();
  notificationTriggers.value = [];
  notificationTriggerEdits.value = {};
  notificationTriggersError.value = '';
  notificationTriggersLoading.value = false;
  savingNotificationTriggerKey.value = null;
  customParamKeys.value = [];
  customParameters.value = {};
  parentAgenciesOverride.value = null;
  originalAgencyFormSnapshot.value = '';

  try {
    const q = { ...route.query };
    delete q.orgId;
    router.replace({ query: q });
  } catch {
    // ignore
  }
  agencyForm.value = defaultAgencyForm();
};

watch(showCreateModal, (isOpen) => {
  if (!isOpen) return;
  if (editingAgency.value) return;
  // Ensure admins default to an allowed org type (no agency creation)
  agencyForm.value.organizationType = userRole.value === 'super_admin' ? 'agency' : 'school';
  agencyForm.value.affiliatedAgencyId = '';
  // For a new org (no id yet), show platform font families (if any)
  fetchFontFamiliesForOrg(null);
});

// Keep affiliated agency selection in sync with role + org type.
watch([requiresAffiliatedAgency, affiliableAgencies, userRole, editingAgency], async () => {
  if (!requiresAffiliatedAgency.value) {
    agencyForm.value.affiliatedAgencyId = '';
    return;
  }

  // Editing: load current affiliation (super admin only).
  if (editingAgency.value) {
    if (userRole.value === 'super_admin') {
      try {
        const res = await api.get(`/organizations/${editingAgency.value.id}/affiliation`);
        if (res.data?.affiliatedAgencyId) {
          agencyForm.value.affiliatedAgencyId = String(res.data.affiliatedAgencyId);
        }
      } catch (e) {
        // best effort
      }
    }
    // Fallbacks (embedded mode / non-super-admin):
    // - If backend included affiliation metadata, use it.
    // - Otherwise, if the user only has one parent agency, lock to it.
    if (!agencyForm.value.affiliatedAgencyId) {
      const meta = editingAgency.value?.affiliated_agency_id || editingAgency.value?.affiliatedAgencyId || null;
      if (meta) {
        agencyForm.value.affiliatedAgencyId = String(meta);
      } else if (userRole.value !== 'super_admin' && affiliableAgencies.value.length === 1) {
        agencyForm.value.affiliatedAgencyId = String(affiliableAgencies.value[0].id);
      }
    }
    return;
  }

  // Creating: auto-select for single-agency admins.
  if (userRole.value !== 'super_admin' && affiliableAgencies.value.length === 1) {
    agencyForm.value.affiliatedAgencyId = String(affiliableAgencies.value[0].id);
  }
}, { immediate: true });

// Get agency login URL
const getAgencyLoginUrl = (portalUrl) => {
  if (!portalUrl) return '';
  const baseUrl = window.location.origin;
  return `${baseUrl}/${portalUrl}/login`;
};

// Copy login URL to clipboard
const copyLoginUrl = async (portalUrl) => {
  const url = getAgencyLoginUrl(portalUrl);
  try {
    await navigator.clipboard.writeText(url);
    copiedUrl.value = portalUrl;
    // Reset after 2 seconds
    setTimeout(() => {
      copiedUrl.value = null;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy URL:', err);
    // Fallback: select text
    const textArea = document.createElement('textarea');
    textArea.value = url;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      copiedUrl.value = portalUrl;
      setTimeout(() => {
        copiedUrl.value = null;
      }, 2000);
    } catch (fallbackErr) {
      console.error('Fallback copy failed:', fallbackErr);
    }
    document.body.removeChild(textArea);
  }
};

onMounted(async () => {
  const iconsPromise = loadIconsIndex();
  if (embeddedSingleOrg.value) {
    try {
      loading.value = true;
      error.value = '';
      const id = parseInt(String(props.embeddedOrgId || ''), 10);
      const resp = await api.get(`/agencies/${id}`);
      agencies.value = resp.data ? [resp.data] : [];
      buildings.value = [];
      availableUsers.value = [];
      affiliatedOrganizations.value = [];
      // Populate parent agencies so affiliation dropdown isn't empty.
      try {
        const parentRes = await api.get('/agencies', { params: { _ts: Date.now() } });
        const list = Array.isArray(parentRes.data) ? parentRes.data : [];
        parentAgenciesOverride.value = list.filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
      } catch {
        parentAgenciesOverride.value = [];
      }
      showCreateModal.value = false;
      if (agencies.value[0]) {
        editAgency(agencies.value[0]);
      }
      if (props.embeddedTab) activeTab.value = String(props.embeddedTab);
      navCollapsed.value = false;
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to load organization';
      agencies.value = [];
      parentAgenciesOverride.value = [];
    } finally {
      loading.value = false;
    }
  } else {
  await fetchAgencies();
  }
  if (userRole.value === 'super_admin') {
    await fetchUsers();
  }
  await fetchIconTemplates();
  await iconsPromise;
});
</script>

<style scoped>
.link-btn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  color: var(--primary);
  font-weight: 800;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}

.link-btn:hover {
  opacity: 0.9;
}

.master-detail {
  display: grid;
  grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.master-detail.embedded {
  grid-template-columns: 1fr;
}

.master-detail.no-selection {
  grid-template-columns: 1fr;
}

.master-detail.nav-collapsed {
  grid-template-columns: 88px minmax(0, 1fr);
}

.org-general-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.04);
  margin-bottom: 12px;
}
.org-general-title .org-name {
  font-size: 18px;
  font-weight: 900;
  color: var(--text-primary);
}
.org-status-pills {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 12px;
  font-weight: 800;
  color: var(--text);
  background: white;
}
.pill-ok {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.10);
}
.pill-warn {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.12);
}
.pill-muted {
  color: var(--text-secondary);
  background: rgba(148, 163, 184, 0.12);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.org-general-actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.org-general-actions .btn,
.detail-summary-actions .btn {
  width: auto;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.nav-pane {
  position: sticky;
  top: 12px;
  align-self: start;
  min-width: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-header.collapsed {
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.section-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-header.collapsed .section-header-actions {
  width: 100%;
  justify-content: center;
}

.section-header.collapsed .section-header-actions .btn {
  width: 100%;
  max-width: 100%;
}

.section-header-collapsed-title {
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 12px;
  color: var(--text-secondary);
}

.section-header.collapsed .section-header-collapsed-title {
  width: 100%;
  text-align: center;
}

.detail-pane {
  min-height: 500px;
  min-width: 0;
}

.detail-content {
  max-width: 100%;
}

.detail-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-left: 4px solid var(--primary);
  border-radius: 12px;
  background: var(--bg);
  margin-bottom: 12px;
}

.detail-summary-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.detail-summary-avatar {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: 0 0 auto;
  background: var(--bg-alt);
}

.detail-summary-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-summary-fallback {
  font-weight: 800;
  color: var(--text);
}

.detail-summary-text {
  min-width: 0;
}

.detail-summary-name {
  font-weight: 800;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-summary-meta {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-summary-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.detail-empty {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  color: var(--text);
}

.detail-empty-title {
  font-weight: 800;
  margin: 0;
  color: var(--text);
}

.detail-empty-subtitle {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.35;
}

.empty-hint {
  margin-top: 12px;
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--bg);
  color: var(--text-secondary);
  font-size: 13px;
}

.org-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.org-row {
  width: 100%;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: white;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.15s;
  border-left: 4px solid var(--primary);
}

.org-row.collapsed {
  padding: 10px;
  align-items: center;
}

.org-row.collapsed .org-main {
  width: 100%;
  display: flex;
  justify-content: center;
}

.org-row.collapsed .org-identity {
  width: 100%;
  justify-content: center;
}

.org-row:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
}

.org-row.active {
  border-color: var(--accent);
}

.org-row.selected-filter-agency {
  background: rgba(15, 23, 42, 0.03);
}

.org-row.child {
  background: var(--bg-alt);
}

.org-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.org-avatar {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.org-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.org-avatar-fallback {
  font-weight: 800;
  color: var(--text-primary);
}

.org-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.org-title {
  min-width: 0;
}

.org-name {
  font-weight: 800;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.org-slug {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.org-badges {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
}

.org-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: 0 0 auto;
  min-width: 0;
}

.org-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: nowrap;
  align-items: center;
}

.org-actions .btn {
  padding: 6px 10px;
  font-size: 12px;
  width: auto;
  flex: 0 0 auto;
  white-space: nowrap;
}

.contact-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.contact-actions .btn {
  white-space: nowrap;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.detail-editor {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  width: 100%;
  max-width: 100%;
}

.detail-editor-card {
  padding: 20px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.detail-editor-card h3 {
  margin-top: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.section-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.filters {
  margin-bottom: 18px;
  padding: 14px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
}

.filters-row {
  display: grid;
  grid-template-columns: 1.3fr 0.7fr 0.9fr 1.1fr;
  gap: 12px;
  align-items: end;
}

.filters-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.filters-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.filters-input,
.filters-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
}

.filters-hint {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-link {
  background: transparent;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-weight: 800;
  padding: 0;
}

.btn-link:hover {
  text-decoration: underline;
}

.empty-state-inline {
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  color: var(--text-secondary);
}

.badge-row {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.badge.badge-type {
  background: rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(15, 23, 42, 0.12);
  color: var(--text-secondary);
}

.badge.badge-type::first-letter {
  text-transform: uppercase;
}

.agencies-list {
  display: grid;
  gap: 20px;
}

@media (max-width: 1100px) {
  .master-detail {
    grid-template-columns: 1fr;
  }
  .nav-pane {
    position: static;
  }
  .filters-row {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 1400px) and (pointer: coarse) {
  .master-detail {
    grid-template-columns: 1fr;
  }
  .nav-pane {
    position: static;
  }
}

.pricing-box {
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 10px;
  padding: 12px;
}

.pricing-box.locked {
  opacity: 0.85;
}

.pricing-title {
  font-weight: 800;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.pricing-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
}

.pricing-label {
  color: var(--text-secondary);
}

.pricing-value {
  font-weight: 700;
  color: var(--text-primary);
}

.pricing-note {
  display: block;
  margin-top: 6px;
  color: var(--text-secondary);
}

.agency-card {
  background: var(--bg-alt);
  padding: 24px;
  border-radius: 12px;
  border: 2px solid var(--border);
  transition: all 0.2s;
}

.agency-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
}

.agency-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 16px;
}

.agency-header-content {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.agency-logo {
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 8px;
  border: 2px solid var(--border);
  padding: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.agency-logo .logo-img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.agency-title-section {
  flex: 1;
  min-width: 0;
}

.agency-header h3 {
  margin: 0 0 4px;
  color: var(--text-primary);
  font-weight: 700;
}

.agency-slug {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}

.agency-colors {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.color-swatch {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 2px solid var(--border);
  cursor: pointer;
}

.agency-info-section {
  margin: 16px 0;
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.agency-admins,
.agency-support {
  font-size: 14px;
  margin-bottom: 16px;
}

.agency-admins:last-child,
.agency-support:last-child {
  margin-bottom: 0;
}

.agency-admins strong,
.agency-support strong {
  color: var(--text-primary);
  display: block;
  margin-bottom: 8px;
}

.admin-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-alt);
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
}

.remove-admin {
  background: none;
  border: none;
  color: var(--error);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-admin:hover {
  color: #dc2626;
}

.agency-actions {
  display: flex;
  gap: 8px;
  padding-top: 16px;
  border-top: 2px solid var(--border);
  flex-wrap: nowrap;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
}

.agency-actions::-webkit-scrollbar {
  height: 6px;
}

.agency-actions::-webkit-scrollbar-track {
  background: transparent;
}

.agency-actions::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.agency-actions::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.agency-actions .btn,
.agency-actions a {
  white-space: nowrap;
  flex-shrink: 0;
  width: auto;
  min-width: auto;
  padding: 6px 12px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.modal-content.large {
  max-width: 1100px;
}

.payroll-rule-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.error-modal {
  background: #fee2e2;
  color: #991b1b;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid #fca5a5;
  font-size: 14px;
}

.modal-content h3 {
  margin-top: 0;
  margin-bottom: 24px;
  color: var(--text-primary);
}

.color-input-group {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.color-picker {
  width: 80px !important;
  height: 50px !important;
  min-width: 80px;
  min-height: 50px;
  border: 2px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  padding: 2px;
  background: white;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  flex-shrink: 0;
}

.color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
  border: none;
}

.color-picker::-webkit-color-swatch {
  border: none;
  border-radius: 6px;
  width: 100%;
  height: 100%;
}

.color-picker::-moz-color-swatch {
  border: none;
  border-radius: 6px;
  width: 100%;
  height: 100%;
}

.color-text-input {
  flex: 1;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-family: monospace;
  font-size: 14px;
  min-width: 0;
}

.color-preview {
  width: 50px;
  height: 50px;
  min-width: 50px;
  min-height: 50px;
  border: 2px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  flex-shrink: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.settings-section-divider {
  margin: 32px 0 24px 0;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.settings-section-divider h4 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
}

.section-description {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 0 0 16px 0;
  line-height: 1.5;
}

.logo-preview-inline {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-alt, #f8fafc);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.logo-preview-inline img {
  max-width: 200px;
  max-height: 100px;
  border: 1px solid var(--border);
  border-radius: 4px;
  display: block;
}

.logo-input-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.tab-button-small {
  padding: 6px 16px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.tab-button-small:hover {
  background: var(--border);
  color: var(--text-primary);
}

.tab-button-small.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.logo-input-section {
  margin-top: 8px;
}

.logo-preview {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-alt, #f8fafc);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.logo-preview img {
  max-width: 200px;
  max-height: 100px;
  border: 1px solid var(--border);
  border-radius: 4px;
  display: block;
}

.upload-status {
  margin-top: 8px;
  padding: 8px;
  background: #e3f2fd;
  border-radius: 4px;
  font-size: 13px;
  color: #1976d2;
}

.file-input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.upload-status {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-alt);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.logo-error {
  color: var(--error);
  font-size: 12px;
  margin-top: 8px;
}

.form-help {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  margin-bottom: 0;
}

.agency-login-url {
  margin: 16px 0;
  padding: 12px;
  background: var(--bg, #f8fafc);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.agency-login-url strong {
  display: block;
  margin-bottom: 8px;
  color: var(--text-primary);
  font-size: 13px;
}

.login-url-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.login-url {
  flex: 1;
  padding: 8px 12px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
}

.btn-copy-url {
  padding: 8px 16px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition: background 0.2s;
}

.btn-copy-url:hover {
  background: var(--primary-dark, #3a8c5f);
}

.btn-copy-url:active {
  transform: scale(0.98);
}

.login-url-help {
  display: block;
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  font-style: italic;
}

.btn-support {
  background-color: #6c757d;
  color: white;
  border: none;
}

.btn-support:hover {
  background-color: #5a6268;
  color: white;
}

.btn-support:focus {
  background-color: #5a6268;
  color: white;
  box-shadow: 0 0 0 0.2rem rgba(108, 117, 125, 0.5);
}

.notification-icons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.notification-icon-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-icon-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.icon-templates-row {
  display: flex;
  gap: 16px;
  align-items: end;
  flex-wrap: wrap;
  margin-top: 12px;
  margin-bottom: 18px;
}

.template-select {
  min-width: 320px;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: white;
  color: var(--text-primary);
}

.template-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.terminology-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.terminology-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.terminology-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.terminology-item input {
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.default-icons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.default-icon-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.default-icon-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.dashboard-icons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.dashboard-icon-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dashboard-icon-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.modal-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0;
  max-width: 100%;
  overflow-x: auto;
  flex-wrap: wrap;
  align-items: flex-end;
  box-sizing: border-box;
}

.tab-button {
  padding: 10px 14px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-bottom: -2px;
  white-space: nowrap;
}

.tab-button:hover {
  color: var(--text-primary);
  background: var(--bg-alt);
}

.tab-button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 600;
}

.tab-content {
  min-height: 400px;
}
</style>

