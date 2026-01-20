<template>
  <div class="agency-management">
    <div class="master-detail" :class="{ 'nav-collapsed': navCollapsed, 'no-selection': !showCreateModal && !editingAgency }">
      <aside class="nav-pane">
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
                <option value="organizations">Organizations</option>
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
            <span v-if="String(typeFilter || '') === 'organizations'">• Showing affiliated organizations.</span>
            <span v-else>• Showing agency + affiliated organizations.</span>
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
            :key="org.id"
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
                  <div class="org-slug">{{ org.slug }}</div>
                </div>
              </div>
              <div v-if="!navCollapsed" class="org-right">
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
                    v-if="userRole === 'super_admin' && String(org.organization_type || 'agency').toLowerCase() === 'agency'"
                    type="button"
                    :class="['btn', org.is_active ? 'btn-danger' : 'btn-secondary', 'btn-sm']"
                    @click.stop="org.is_active ? archiveAgency(org.id) : restoreAgency(org.id)"
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
          <button type="button" :class="['tab-button', { active: activeTab === 'branding' }]" @click="activeTab = 'branding'">Branding</button>
          <button
            v-if="String(agencyForm.organizationType || 'agency').toLowerCase() === 'agency'"
            type="button"
            :class="['tab-button', { active: activeTab === 'features' }]"
            @click="activeTab = 'features'"
          >
            Features
          </button>
          <button type="button" :class="['tab-button', { active: activeTab === 'contact' }]" @click="activeTab = 'contact'">Contact</button>
          <button type="button" :class="['tab-button', { active: activeTab === 'address' }]" @click="activeTab = 'address'">Address</button>
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
            v-if="String(agencyForm.organizationType || 'agency').toLowerCase() === 'school'"
            type="button"
            :class="['tab-button', { active: activeTab === 'school_soft_schedule' }]"
            @click="activeTab = 'school_soft_schedule'"
          >
            Soft Schedule
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
            </select>
            <small v-if="!editingAgency && userRole !== 'super_admin'">Admins can create schools/programs/learning orgs. Only super admins can create agencies.</small>
            <small v-if="editingAgency">Organization type cannot be changed after creation</small>
          </div>

          <div v-if="requiresAffiliatedAgency" class="form-group">
            <label>Affiliated Agency *</label>
            <select v-model="agencyForm.affiliatedAgencyId" required :disabled="affiliatedAgencyLocked">
              <option value="" disabled>Select an agency</option>
              <option v-for="a in affiliableAgencies" :key="a.id" :value="String(a.id)">
                {{ a.name }}
              </option>
            </select>
            <small v-if="affiliatedAgencyLocked">This is auto-selected based on your admin access.</small>
          </div>

          <div v-if="requiresAffiliatedAgency" class="form-group pricing-box" :class="{ locked: affiliatedAgencyLocked }">
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
          <div class="form-group">
            <label>Name *</label>
            <input v-model="agencyForm.name" type="text" required />
          </div>
          <div class="form-group">
            <label>Slug *</label>
            <input v-model="agencyForm.slug" type="text" required pattern="[a-z0-9\-]+" />
            <small>Lowercase letters, numbers, and hyphens only</small>
          </div>

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
              <div class="form-group">
                <label>School Days/Times</label>
                <input v-model="agencyForm.schoolProfile.schoolDaysTimes" type="text" placeholder="Mon/Wed 8–12" />
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
                Contacts are currently read-only here; re-run the import to update them.
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
            </template>
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
            <div class="form-group">
              <label>Secondary Contact (string)</label>
              <textarea
                v-model="agencyForm.schoolProfile.secondaryContactText"
                rows="2"
                placeholder="Freeform: name, role, email, phone, notes…"
              ></textarea>
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
            <h4 style="margin: 0 0 8px 0;">Affiliated School Staff</h4>
            <small class="hint">This tab will list school staff accounts eligible for login (coming next).</small>

            <div v-if="schoolContactsForEditor.length" style="margin-top: 12px;">
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
            </div>
          </div>

          <div v-if="activeTab === 'school_soft_schedule'" class="tab-section">
            <h4 style="margin: 0 0 8px 0;">School Soft Schedule</h4>
            <small class="hint">Lightweight schedule notes (not the full scheduler).</small>

            <div class="form-group" style="margin-top: 10px;">
              <label>School Days/Times</label>
              <input v-model="agencyForm.schoolProfile.schoolDaysTimes" type="text" placeholder="Mon/Wed 8–12" />
            </div>
          </div>

          <div v-if="activeTab === 'address'" class="tab-section">
          <div class="form-section-divider" style="margin-top: 18px; margin-bottom: 16px; padding-top: 18px; border-top: 2px solid var(--border);">
            <h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Address</h4>
            <small class="hint">Used for mileage calculations (schools use this as their school address).</small>
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
            v-if="editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
            class="form-section-divider"
            style="margin-top: 18px; margin-bottom: 16px; padding-top: 18px; border-top: 2px solid var(--border);"
          >
            <h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Sites / Office Locations</h4>
            <small class="hint">Manage multiple site addresses for this agency (used for School Mileage office selection).</small>
          </div>

          <div
            v-if="editingAgency && String(editingAgency.organization_type || 'agency').toLowerCase() === 'agency'"
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
                      <div class="hint"><ToggleSwitch :model-value="false" disabled label="Text (SMS) (coming soon)" compact /></div>
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
              <IconSelector v-model="agencyForm.iconId" label="Select Organization Icon" />
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
              <IconSelector v-model="agencyForm.chatIconId" />
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
                <IconSelector v-model="agencyForm.trainingFocusDefaultIconId" />
                <small>Default icon for training focuses when no specific icon is assigned</small>
              </div>
              <div class="default-icon-item">
                <label>Module Default Icon</label>
                <IconSelector v-model="agencyForm.moduleDefaultIconId" />
                <small>Default icon for modules when no specific icon is assigned</small>
              </div>
              <div class="default-icon-item">
                <label>User Default Icon</label>
                <IconSelector v-model="agencyForm.userDefaultIconId" />
                <small>Default icon for users when no specific icon is assigned</small>
              </div>
              <div class="default-icon-item">
                <label>Document Default Icon</label>
                <IconSelector v-model="agencyForm.documentDefaultIconId" />
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
                <label>Progress Dashboard Icon</label>
                <IconSelector v-model="agencyForm.progressDashboardIconId" />
                <small>Icon for the "Progress Dashboard" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Manage Modules Icon</label>
                <IconSelector v-model="agencyForm.manageModulesIconId" />
                <small>Icon for the "Manage Modules" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Manage Documents Icon</label>
                <IconSelector v-model="agencyForm.manageDocumentsIconId" />
                <small>Icon for the "Manage Documents" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Manage Users Icon</label>
                <IconSelector v-model="agencyForm.manageUsersIconId" />
                <small>Icon for the "Manage Users" action card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Settings Icon</label>
                <IconSelector v-model="agencyForm.settingsIconId" />
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
                <IconSelector v-model="agencyForm.myDashboardChecklistIconId" />
                <small>Icon for the "Checklist" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Training Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardTrainingIconId" />
                <small>Icon for the "Training" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>Documents Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardDocumentsIconId" />
                <small>Icon for the "Documents" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>My Account Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardMyAccountIconId" />
                <small>Icon for the "My Account" card</small>
              </div>
              <div class="dashboard-icon-item">
                <label>On-Demand Training Card Icon</label>
                <IconSelector v-model="agencyForm.myDashboardOnDemandTrainingIconId" />
                <small>Icon for the "On-Demand Training" card</small>
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
                <IconSelector v-model="agencyForm.statusExpiredIconId" />
              </div>
              <div class="notification-icon-item">
                <label>Temp Password Expired</label>
                <IconSelector v-model="agencyForm.tempPasswordExpiredIconId" />
              </div>
              <div class="notification-icon-item">
                <label>Task Overdue</label>
                <IconSelector v-model="agencyForm.taskOverdueIconId" />
              </div>
              <div class="notification-icon-item">
                <label>Onboarding Completed</label>
                <IconSelector v-model="agencyForm.onboardingCompletedIconId" />
              </div>
              <div class="notification-icon-item">
                <label>Invitation Expired</label>
                <IconSelector v-model="agencyForm.invitationExpiredIconId" />
              </div>
              <div class="notification-icon-item">
                <label>First Login</label>
                <IconSelector v-model="agencyForm.firstLoginIconId" />
              </div>
              <div class="notification-icon-item">
                <label>First Login (Pending)</label>
                <IconSelector v-model="agencyForm.firstLoginPendingIconId" />
              </div>
              <div class="notification-icon-item">
                <label>Password Changed</label>
                <IconSelector v-model="agencyForm.passwordChangedIconId" />
              </div>
            </div>
          </div>

          <!-- Payroll Tab (agency-only) -->
          <div v-show="activeTab === 'payroll'" class="tab-content">
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

            <div v-else class="table-wrap">
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
                      <select v-model="r.category">
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
                      <select v-model="r.pay_rate_unit" title="Controls whether per-code rates pay by units or by computed pay-hours (units ÷ pay divisor).">
                        <option value="per_unit">per_unit</option>
                        <option value="per_hour">per_hour</option>
                      </select>
                    </td>
                    <td class="right">
                      <input v-model="r.pay_divisor" type="number" min="1" step="1" style="width: 110px;" />
                    </td>
                    <td class="right">
                      <input v-model="r.credit_value" type="number" min="0" step="0.00000000001" style="width: 140px;" />
                    </td>
                    <td>
                      <ToggleSwitch
                        :model-value="!!r.counts_for_tier"
                        compact
                        @update:modelValue="(v) => (r.counts_for_tier = v ? 1 : 0)"
                      />
                    </td>
                    <td>
                      <select v-model="r.other_slot" :disabled="!(r.category === 'other' || r.category === 'tutoring')" title="Used only for 'other'/'tutoring' codes to pick which hourly 'Other Rate' slot (1/2/3) applies.">
                        <option :value="1">1</option>
                        <option :value="2">2</option>
                        <option :value="3">3</option>
                      </select>
                    </td>
                    <td class="right">
                      <div class="payroll-rule-actions">
                        <button type="button" class="btn btn-secondary btn-sm" @click="savePayrollRule(r)" :disabled="savingPayrollRule">
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

const agencies = ref([]);
const searchQuery = ref('');
// Two-mode navigation filter:
// - agencies: show only agencies
// - organizations: show only non-agency orgs (schools/programs/learning)
const typeFilter = ref('agencies'); // agencies|organizations
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

// School org directory contacts (read-only in this UI; imported via bulk school upload)
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

// Payroll service code rules editor (agency-only)
const payrollRulesLoading = ref(false);
const payrollRulesError = ref('');
const payrollRules = ref([]);
const savingPayrollRule = ref(false);
const newPayrollServiceCode = ref('');

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

// Office locations (sites) editor (agency-only)
const officeLocations = ref([]);
const officeLocationsLoading = ref(false);
const officeLocationsError = ref('');
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

const getTriggerEdit = (triggerKey) => {
  const key = String(triggerKey || '').trim();
  if (!key) return { enabled: true, recipients: { provider: true, supervisor: true, clinicalPracticeAssistant: true, admin: true }, channels: { inApp: true, sms: false, email: false } };
  if (!notificationTriggerEdits.value[key]) {
    notificationTriggerEdits.value[key] = {
      enabled: true,
      recipients: { provider: true, supervisor: true, clinicalPracticeAssistant: true, admin: true },
      channels: { inApp: true, sms: false, email: false }
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
          sms: false,
          email: false
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
        sms: false,
        email: false
      }
    });
    await loadNotificationTriggers();
  } catch (e) {
    notificationTriggersError.value = e.response?.data?.error?.message || e.message || 'Failed to save trigger settings';
  } finally {
    savingNotificationTriggerKey.value = null;
  }
};

const openPayrollTab = async () => {
  activeTab.value = 'payroll';
  await loadMileageRates();
  await loadPtoPolicy();
  await loadSupervisionPolicy();
  await loadPayrollRules();
  await loadOtherRateTitles();
  await loadOfficeLocations();
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
    payrollRules.value = rows.map((r) => ({
      ...r,
      category: r.category || 'direct',
      pay_rate_unit: r.pay_rate_unit || 'per_unit',
      other_slot: Number(r.other_slot || 1),
      duration_minutes: r.duration_minutes ?? '',
      pay_divisor: r.pay_divisor ?? 1,
      credit_value: r.credit_value ?? 0,
      counts_for_tier: r.counts_for_tier === 0 ? false : true
    }));
  } catch (e) {
    payrollRulesError.value = e.response?.data?.error?.message || e.message || 'Failed to load payroll service codes';
    payrollRules.value = [];
  } finally {
    payrollRulesLoading.value = false;
  }
};

const savePayrollRule = async (row) => {
  if (!editingAgency.value?.id || !row?.service_code) return;
  try {
    savingPayrollRule.value = true;
    payrollRulesError.value = '';
    await api.post('/payroll/service-code-rules', {
      agencyId: editingAgency.value.id,
      serviceCode: row.service_code,
      category: row.category,
      otherSlot: row.other_slot,
      payRateUnit: row.pay_rate_unit || 'per_unit',
      // Duration is intentionally hidden/not used for now (credits drive hours).
      durationMinutes: null,
      countsForTier: row.counts_for_tier ? 1 : 0,
      payDivisor: row.pay_divisor,
      creditValue: row.credit_value
    });
  } catch (e) {
    payrollRulesError.value = e.response?.data?.error?.message || e.message || 'Failed to save service code rule';
  } finally {
    savingPayrollRule.value = false;
  }
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
  'progressDashboardIconId',
  'manageModulesIconId',
  'manageDocumentsIconId',
  'manageUsersIconId',
  'settingsIconId',
  'myDashboardChecklistIconId',
  'myDashboardTrainingIconId',
  'myDashboardDocumentsIconId',
  'myDashboardMyAccountIconId',
  'myDashboardOnDemandTrainingIconId',
  'statusExpiredIconId',
  'tempPasswordExpiredIconId',
  'taskOverdueIconId',
  'onboardingCompletedIconId',
  'invitationExpiredIconId',
  'firstLoginIconId',
  'firstLoginPendingIconId',
  'passwordChangedIconId'
];

const agencyForm = ref({
  organizationType: userRole.value === 'super_admin' ? 'agency' : 'school',
  affiliatedAgencyId: '',
  name: '',
  slug: '',
  logoUrl: '',
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
  progressDashboardIconId: null,
  manageModulesIconId: null,
  manageDocumentsIconId: null,
  manageUsersIconId: null,
  settingsIconId: null,
  myDashboardChecklistIconId: null,
  myDashboardTrainingIconId: null,
  myDashboardDocumentsIconId: null,
  myDashboardMyAccountIconId: null,
  myDashboardOnDemandTrainingIconId: null,
  onboardingTeamEmail: '',
  phoneNumber: '',
  phoneExtension: '',
  // School-only directory enrichment fields (stored in school_profiles)
  schoolProfile: {
    districtName: '',
    schoolNumber: '',
    itscoEmail: '',
    schoolDaysTimes: '',
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
  featureFlags: {
    // Defaults are "enabled" to preserve existing behavior until an admin turns them off.
    inSchoolSubmissionsEnabled: true,
    medcancelEnabled: true,
    // Default OFF until explicitly enabled (requires GEMINI_API_KEY in backend).
    aiProviderSearchEnabled: false
  },
  // Notification icon fields
  statusExpiredIconId: null,
  tempPasswordExpiredIconId: null,
  taskOverdueIconId: null,
  onboardingCompletedIconId: null,
  invitationExpiredIconId: null,
  firstLoginIconId: null,
  firstLoginPendingIconId: null,
  passwordChangedIconId: null
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

const parentAgencies = computed(() => {
  return sortByNameAsc((agencies.value || []).filter(a => String(a.organization_type || 'agency').toLowerCase() === 'agency'));
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
    if (v === 'school') return 1;
    if (v === 'program') return 2;
    if (v === 'learning') return 3;
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

  // organizations view
  const base = selectedAgencyId ? (affiliatedOrganizations.value || []) : (agencies.value || []);
  const nonAgencies = (base || []).filter((o) => String(o?.organization_type || 'agency').toLowerCase() !== 'agency');
  return sortOrganizations(applyFilters(nonAgencies));
});

const requiresAffiliatedAgency = computed(() => {
  const t = String(agencyForm.value.organizationType || 'agency').toLowerCase();
  return ['school', 'program', 'learning'].includes(t);
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

const fetchAgencies = async () => {
  try {
    loading.value = true;
    const [agenciesRes, usersRes] = await Promise.all([api.get('/agencies'), api.get('/users')]);
    agencies.value = agenciesRes.data || [];
    const allUsers = usersRes.data || [];
    availableUsers.value = allUsers;
    
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

const editAgency = async (agency) => {
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
    organizationType: agency.organization_type || 'agency',
    affiliatedAgencyId: '',
    name: agency.name,
    slug: agency.slug,
    logoUrl: agency.logo_url || '',
    logoPath: agency.logo_path || '',
    primaryColor: palette.primary || '#0f172a',
    secondaryColor: palette.secondary || '#1e40af',
    accentColor: palette.accent || '#f97316',
    iconId: agency.icon_id || null,
    chatIconId: agency.chat_icon_id ?? null,
    isActive: agency.is_active,
    trainingFocusDefaultIconId: agency.training_focus_default_icon_id ?? null,
    moduleDefaultIconId: agency.module_default_icon_id ?? null,
    userDefaultIconId: agency.user_default_icon_id ?? null,
    documentDefaultIconId: agency.document_default_icon_id ?? null,
    progressDashboardIconId: agency.progress_dashboard_icon_id ?? null,
    manageModulesIconId: agency.manage_modules_icon_id ?? null,
    manageDocumentsIconId: agency.manage_documents_icon_id ?? null,
    manageUsersIconId: agency.manage_users_icon_id ?? null,
    settingsIconId: agency.settings_icon_id ?? null,
    myDashboardChecklistIconId: agency.my_dashboard_checklist_icon_id ?? null,
    myDashboardTrainingIconId: agency.my_dashboard_training_icon_id ?? null,
    myDashboardDocumentsIconId: agency.my_dashboard_documents_icon_id ?? null,
    myDashboardMyAccountIconId: agency.my_dashboard_my_account_icon_id ?? null,
    myDashboardOnDemandTrainingIconId: agency.my_dashboard_on_demand_training_icon_id ?? null,
    onboardingTeamEmail: agency.onboarding_team_email || '',
    phoneNumber: agency.phone_number || '',
    phoneExtension: agency.phone_extension || '',
    schoolProfile: {
      districtName: agency?.school_profile?.district_name || '',
      schoolNumber: agency?.school_profile?.school_number || '',
      itscoEmail: agency?.school_profile?.itsco_email || '',
      schoolDaysTimes: agency?.school_profile?.school_days_times || '',
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
    featureFlags: {
      inSchoolSubmissionsEnabled: featureFlags.inSchoolSubmissionsEnabled !== false,
      medcancelEnabled: featureFlags.medcancelEnabled !== false,
      aiProviderSearchEnabled: featureFlags.aiProviderSearchEnabled === true
    },
    // Notification icon fields
    statusExpiredIconId: agency.status_expired_icon_id ?? null,
    tempPasswordExpiredIconId: agency.temp_password_expired_icon_id ?? null,
    taskOverdueIconId: agency.task_overdue_icon_id ?? null,
    onboardingCompletedIconId: agency.onboarding_completed_icon_id ?? null,
    invitationExpiredIconId: agency.invitation_expired_icon_id ?? null,
    firstLoginIconId: agency.first_login_icon_id ?? null,
    firstLoginPendingIconId: agency.first_login_pending_icon_id ?? null,
    passwordChangedIconId: agency.password_changed_icon_id ?? null
  };

  // Load available uploaded font families for this org (includes platform + org fonts)
  fetchFontFamiliesForOrg(agency?.id || null);

  // Load sites for agencies in the main Settings tab (not Payroll tab).
  if (String(agency?.organization_type || 'agency').toLowerCase() === 'agency') {
    loadOfficeLocations();
    loadMileageRates();
    loadNotificationTriggers();
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
    
    // Build custom parameters object
    const customParams = {};
    customParamKeys.value.forEach(key => {
      if (key && key.trim() && customParameters.value[key]) {
        customParams[key.trim()] = customParameters.value[key];
      }
    });
    
    const data = {
      organizationType: agencyForm.value.organizationType || 'agency',
      name: agencyForm.value.name.trim(),
      slug: slug,
      // Clear one when using the other (like platform branding)
      logoUrl: logoInputMethod.value === 'url' ? (agencyForm.value.logoUrl?.trim() || null) : null,
      logoPath: logoInputMethod.value === 'upload' ? (agencyForm.value.logoPath || null) : null,
      colorPalette: colorPalette,
      terminologySettings: Object.keys(terminologySettings).length > 0 ? terminologySettings : null,
      iconId: agencyForm.value.iconId ?? null,
      chatIconId: agencyForm.value.chatIconId ?? null,
      isActive: agencyForm.value.isActive !== undefined ? agencyForm.value.isActive : true,
      trainingFocusDefaultIconId: agencyForm.value.trainingFocusDefaultIconId ?? null,
      moduleDefaultIconId: agencyForm.value.moduleDefaultIconId ?? null,
      userDefaultIconId: agencyForm.value.userDefaultIconId ?? null,
      documentDefaultIconId: agencyForm.value.documentDefaultIconId ?? null,
      progressDashboardIconId: agencyForm.value.progressDashboardIconId ?? null,
      manageModulesIconId: agencyForm.value.manageModulesIconId ?? null,
      manageDocumentsIconId: agencyForm.value.manageDocumentsIconId ?? null,
      manageUsersIconId: agencyForm.value.manageUsersIconId ?? null,
      settingsIconId: agencyForm.value.settingsIconId ?? null,
      myDashboardChecklistIconId: agencyForm.value.myDashboardChecklistIconId ?? null,
      myDashboardTrainingIconId: agencyForm.value.myDashboardTrainingIconId ?? null,
      myDashboardDocumentsIconId: agencyForm.value.myDashboardDocumentsIconId ?? null,
      myDashboardMyAccountIconId: agencyForm.value.myDashboardMyAccountIconId ?? null,
      myDashboardOnDemandTrainingIconId: agencyForm.value.myDashboardOnDemandTrainingIconId ?? null,
      onboardingTeamEmail: agencyForm.value.onboardingTeamEmail?.trim() || null,
      phoneNumber: agencyForm.value.phoneNumber?.trim() || null,
      // Schools don't use extensions (per directory requirements)
      phoneExtension:
        String(agencyForm.value.organizationType || '').toLowerCase() === 'school'
          ? null
          : (agencyForm.value.phoneExtension?.trim() || null),
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
      ...(requiresAffiliatedAgency.value ? { affiliatedAgencyId: parseInt(agencyForm.value.affiliatedAgencyId, 10) } : {}),
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
      schoolProfile:
        String(agencyForm.value.organizationType || '').toLowerCase() === 'school'
          ? {
              districtName: agencyForm.value.schoolProfile?.districtName?.trim() || null,
              schoolNumber: agencyForm.value.schoolProfile?.schoolNumber?.trim() || null,
              itscoEmail: agencyForm.value.schoolProfile?.itscoEmail?.trim() || null,
              schoolDaysTimes: agencyForm.value.schoolProfile?.schoolDaysTimes?.trim() || null,
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
      await api.post('/agencies', data);
    }
    
    closeModal();
    fetchAgencies();
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
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.details) {
        errorMessage = `Validation failed: ${errorData.details}`;
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

const archiveAgency = async (agencyId) => {
  if (!confirm('Are you sure you want to archive this agency? Archived agencies will be hidden from most views but can be restored later.')) {
    return;
  }
  
  try {
    await api.post(`/agencies/${agencyId}/archive`);
    await fetchAgencies();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to archive agency';
    alert(error.value);
  }
};

const restoreAgency = async (agencyId) => {
  if (!confirm('Are you sure you want to restore this agency?')) {
    return;
  }
  
  try {
    await api.post(`/agencies/${agencyId}/restore`);
    await fetchAgencies();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to restore agency';
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
  notificationTriggers.value = [];
  notificationTriggerEdits.value = {};
  notificationTriggersError.value = '';
  notificationTriggersLoading.value = false;
  savingNotificationTriggerKey.value = null;
  customParamKeys.value = [];
  customParameters.value = {};
  originalAgencyFormSnapshot.value = '';

  try {
    const q = { ...route.query };
    delete q.orgId;
    router.replace({ query: q });
  } catch {
    // ignore
  }
  agencyForm.value = {
    organizationType: userRole.value === 'super_admin' ? 'agency' : 'school',
    affiliatedAgencyId: '',
    name: '',
    slug: '',
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
    progressDashboardIconId: null,
    manageModulesIconId: null,
    manageDocumentsIconId: null,
    manageUsersIconId: null,
    settingsIconId: null,
    myDashboardChecklistIconId: null,
    myDashboardTrainingIconId: null,
    myDashboardDocumentsIconId: null,
    myDashboardMyAccountIconId: null,
    myDashboardOnDemandTrainingIconId: null,
    onboardingTeamEmail: '',
    phoneNumber: '',
    phoneExtension: '',
    portalUrl: '',
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
    // Notification icon fields
    statusExpiredIconId: null,
    tempPasswordExpiredIconId: null,
    taskOverdueIconId: null,
    onboardingCompletedIconId: null,
    invitationExpiredIconId: null,
    firstLoginIconId: null,
    firstLoginPendingIconId: null,
    passwordChangedIconId: null
  };
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
  await fetchAgencies();
  if (userRole.value === 'super_admin') {
    await fetchUsers();
  }
  await fetchIconTemplates();
  await iconsPromise;
});
</script>

<style scoped>
.master-detail {
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 18px;
  align-items: start;
}

.master-detail.no-selection {
  grid-template-columns: 1fr;
}

.master-detail.nav-collapsed {
  grid-template-columns: 88px 1fr;
}

.nav-pane {
  position: sticky;
  top: 12px;
  align-self: start;
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

