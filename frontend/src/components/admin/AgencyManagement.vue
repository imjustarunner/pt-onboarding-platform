<template>
  <div class="agency-management">
    <div class="section-header">
      <h2>Organization Management</h2>
      <button @click="showCreateModal = true" class="btn btn-primary">Create Organization</button>
    </div>
    
    <div v-if="loading" class="loading">Loading agencies...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-if="error && (showCreateModal || editingAgency)" class="error-modal">{{ error }}</div>
    
    <div v-else class="agencies-list">
      <div
        v-for="agency in agencies"
        :key="agency.id"
        class="agency-card"
      >
        <div class="agency-header">
          <div class="agency-header-content">
            <div v-if="(agency.logo_path || agency.logo_url) && !logoErrors[agency.id]" class="agency-logo">
              <img
                :src="getAgencyLogoUrl(agency)"
                :alt="`${agency.name} logo`"
                @error="(e) => handleLogoError(e, agency.id)"
                class="logo-img"
              />
            </div>
            <div class="agency-title-section">
              <h3>{{ agency.name }}</h3>
              <p class="agency-slug">{{ agency.slug }}</p>
            </div>
          </div>
          <span :class="['badge', agency.is_active ? 'badge-success' : 'badge-secondary']">
            {{ agency.is_active ? 'Active' : 'Inactive' }}
          </span>
        </div>
        
        <!-- Agency Login URL (if portal_url is set) -->
        <div v-if="agency.portal_url" class="agency-login-url">
          <strong>Login URL:</strong>
          <div class="login-url-container">
            <code class="login-url">{{ getAgencyLoginUrl(agency.portal_url) }}</code>
            <button 
              @click="copyLoginUrl(agency.portal_url)" 
              class="btn-copy-url"
              :title="copiedUrl === agency.portal_url ? 'Copied!' : 'Copy login URL'"
            >
              {{ copiedUrl === agency.portal_url ? '✓ Copied' : 'Copy' }}
            </button>
          </div>
          <small class="login-url-help">Share this link with users for agency-branded login</small>
        </div>
        
        <div v-if="agency.color_palette" class="agency-colors">
          <span
            v-for="(color, key) in getColorPalette(agency.color_palette)"
            :key="key"
            class="color-swatch"
            :style="{ backgroundColor: color }"
            :title="key"
          ></span>
        </div>
        
        <div class="agency-info-section">
          <div class="agency-admins" v-if="agencyAdmins[agency.id] && agencyAdmins[agency.id].length > 0">
            <strong>Admin Team:</strong>
            <div class="admin-tags">
              <span
                v-for="admin in agencyAdmins[agency.id]"
                :key="admin.id"
                class="admin-tag"
              >
                {{ admin.first_name }} {{ admin.last_name }}
                <button 
                  v-if="userRole === 'super_admin'"
                  @click="removeAdmin(agency.id, admin.id)" 
                  class="remove-admin"
                >×</button>
              </span>
            </div>
          </div>
          <div class="agency-support" v-if="agencySupport[agency.id] && agencySupport[agency.id].length > 0">
            <strong>Support Team:</strong>
            <div class="admin-tags">
              <span
                v-for="support in agencySupport[agency.id]"
                :key="support.id"
                class="admin-tag"
              >
                {{ support.first_name }} {{ support.last_name }}
                <button 
                  v-if="userRole === 'super_admin'"
                  @click="removeSupport(agency.id, support.id)" 
                  class="remove-admin"
                >×</button>
              </span>
            </div>
          </div>
        </div>
        
        <div class="agency-actions">
          <button @click="editAgency(agency)" class="btn btn-secondary btn-sm">Edit</button>
          <button
            v-if="isChildOrgRow(agency)"
            @click="openDuplicateModal(agency)"
            class="btn btn-secondary btn-sm"
          >
            Duplicate
          </button>
          <button
            v-if="(agency.organization_type || 'agency') === 'school'"
            @click="openSplashPreview(agency)"
            class="btn btn-info btn-sm"
          >
            Preview Splash Page
          </button>
          <router-link :to="`/admin/settings?tab=tracks&agencyId=${agency.id}`" class="btn btn-primary btn-sm">Training Focuses</router-link>
          <button
            v-if="userRole === 'super_admin'"
            @click="showAssignAdmin(agency)"
            class="btn btn-success btn-sm"
          >
            Assign Admin
          </button>
          <button
            v-if="userRole === 'super_admin'"
            @click="showAssignSupport(agency)"
            class="btn btn-support btn-sm"
          >
            Assign Support
          </button>
          <button
            v-if="userRole === 'super_admin' && !agency.is_archived"
            @click="archiveAgency(agency.id)"
            class="btn btn-warning btn-sm"
          >
            Archive
          </button>
          <button
            v-if="userRole === 'super_admin' && agency.is_archived"
            @click="restoreAgency(agency.id)"
            class="btn btn-success btn-sm"
          >
            Restore
          </button>
        </div>
      </div>
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
    
    <!-- Assign Support Modal -->
    <div v-if="showAssignSupportModal && selectedAgency" class="modal-overlay" @click="closeAssignSupportModal">
      <div class="modal-content" @click.stop>
        <h3>Assign Support to {{ selectedAgency.name }}</h3>
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
              {{ assigningSupport ? 'Assigning...' : 'Assign Support' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || editingAgency" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content large" @click.stop>
        <h3>{{ editingAgency ? 'Edit Organization' : 'Create Organization' }}</h3>
        <div v-if="error" class="error-modal">
          <strong>Error:</strong> {{ error }}
        </div>
        
        <!-- Tab Navigation -->
        <div class="modal-tabs">
          <button 
            type="button"
            :class="['tab-button', { active: activeTab === 'settings' }]"
            @click="activeTab = 'settings'"
          >
            Settings
          </button>
          <button 
            type="button"
            :class="['tab-button', { active: activeTab === 'icons' }]"
            @click="activeTab = 'icons'"
          >
            Customize Icons
          </button>
        </div>
        
        <form @submit.prevent="saveAgency">
          <!-- Settings Tab -->
          <div v-show="activeTab === 'settings'" class="tab-content">
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
          
          <!-- Theme Settings Section -->
          <div class="form-section-divider" style="margin-top: 24px; margin-bottom: 16px; padding-top: 24px; border-top: 2px solid var(--border);">
            <h4 style="margin: 0 0 16px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">Theme Settings</h4>
          </div>
          
          <div class="form-group">
            <label>Font Family</label>
            <select v-model="agencyForm.themeSettings.fontFamily">
              <option value="">Default (System Font)</option>
              <option value="'Inter', sans-serif">Inter</option>
              <option value="'Source Sans 3', sans-serif">Source Sans 3</option>
              <option value="'Montserrat', sans-serif">Montserrat</option>
              <option value="'Roboto', sans-serif">Roboto</option>
              <option value="'Open Sans', sans-serif">Open Sans</option>
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
            <label>
              <input v-model="agencyForm.isActive" type="checkbox" />
              Active
            </label>
          </div>
          
          <div v-if="editingAgency" class="form-group">
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
import { ref, onMounted, computed, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import IconSelector from './IconSelector.vue';
import DashboardPreviewModal from './DashboardPreviewModal.vue';
import IconTemplateModal from './IconTemplateModal.vue';
import SplashPagePreviewModal from './SplashPagePreviewModal.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const userRole = computed(() => authStore.user?.role);

const agencies = ref([]);
const availableUsers = ref([]);
const agencyAdmins = ref({});
const agencySupport = ref({});
const loading = ref(true);
const error = ref('');
const showCreateModal = ref(false);
const editingAgency = ref(null);
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
const logoInputMethod = ref('url'); // 'url' or 'upload'
const logoFileInput = ref(null);
const uploadingLogo = ref(false);
const customParamKeys = ref([]);
  const customParameters = ref({});
  const copiedUrl = ref(null); // Track which URL was copied
const activeTab = ref('settings'); // Tab navigation: 'settings' or 'icons'

// Icon templates (apply a full set of icons at once)
const iconTemplates = ref([]);
const selectedIconTemplateId = ref('');
const showIconTemplateModal = ref(false);
const savingIconTemplate = ref(false);
const iconTemplateError = ref('');

const ICON_TEMPLATE_FIELDS = [
  'iconId',
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
});

const affiliableAgencies = computed(() => {
  return (agencies.value || []).filter(a => String(a.organization_type || 'agency').toLowerCase() === 'agency');
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

const fetchAgencies = async () => {
  try {
    loading.value = true;
    const response = await api.get('/agencies');
    agencies.value = response.data;
    
    // Initialize support ref for all agencies
    agencies.value.forEach(agency => {
      if (!agencySupport.value[agency.id]) {
        agencySupport.value[agency.id] = [];
      }
    });
    
    // Fetch admins and support for each agency
    for (const agency of agencies.value) {
      await fetchAgencyAdmins(agency.id);
      await fetchAgencySupport(agency.id);
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load agencies';
  } finally {
    loading.value = false;
  }
};

const fetchAgencyAdmins = async (agencyId) => {
  try {
    // Get all users and filter for admins assigned to this agency
    const usersResponse = await api.get('/users');
    const allUsers = usersResponse.data;
    
    // Get users assigned to this agency
    const agencyUsers = [];
    for (const user of allUsers) {
      const agenciesResponse = await api.get(`/users/${user.id}/agencies`);
      const userAgencies = agenciesResponse.data;
      if (userAgencies.some(a => a.id === agencyId) && (user.role === 'admin' || user.role === 'super_admin')) {
        agencyUsers.push(user);
      }
    }
    
    agencyAdmins.value[agencyId] = agencyUsers;
  } catch (err) {
    console.error('Failed to load agency admins:', err);
    agencyAdmins.value[agencyId] = [];
  }
};

const fetchAgencySupport = async (agencyId) => {
  try {
    // Get all users and filter for support assigned to this agency
    const usersResponse = await api.get('/users');
    const allUsers = usersResponse.data;
    
    // Get users assigned to this agency with support role
    const agencyUsers = [];
    for (const user of allUsers) {
      try {
        // Only check users with support role to reduce API calls
        if (user.role === 'support') {
          const agenciesResponse = await api.get(`/users/${user.id}/agencies`);
          const userAgencies = agenciesResponse.data;
          if (userAgencies.some(a => a.id === agencyId)) {
            agencyUsers.push(user);
          }
        }
      } catch (err) {
        console.error(`Failed to get agencies for user ${user.id}:`, err);
        // Continue with next user
      }
    }
    
    agencySupport.value[agencyId] = agencyUsers;
    console.log(`Fetched ${agencyUsers.length} support members for agency ${agencyId}:`, agencyUsers);
  } catch (err) {
    console.error('Failed to load agency support:', err);
    agencySupport.value[agencyId] = [];
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
  if (availableUsers.value.length === 0) {
    fetchUsers();
  }
};

const showAssignSupport = (agency) => {
  selectedAgency.value = agency;
  showAssignSupportModal.value = true;
  if (availableUsers.value.length === 0) {
    fetchUsers();
  }
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

const editAgency = (agency) => {
  editingAgency.value = agency;
  const palette = getColorPalette(agency.color_palette);
  const terminology = agency.terminology_settings 
    ? (typeof agency.terminology_settings === 'string' 
        ? JSON.parse(agency.terminology_settings) 
        : agency.terminology_settings)
    : {};
  
  // Parse theme_settings if it exists
  const themeSettings = agency.theme_settings 
    ? (typeof agency.theme_settings === 'string' 
        ? JSON.parse(agency.theme_settings) 
        : agency.theme_settings)
    : {};
  
  // Parse custom parameters if they exist
  const customParams = agency.custom_parameters 
    ? (typeof agency.custom_parameters === 'string' 
        ? JSON.parse(agency.custom_parameters) 
        : agency.custom_parameters)
    : {};
  
  customParamKeys.value = Object.keys(customParams);
  customParameters.value = { ...customParams };
  
  // Set logo input method based on what's available
  if (agency.logo_path) {
    logoInputMethod.value = 'upload';
  } else if (agency.logo_url) {
    logoInputMethod.value = 'url';
  } else {
    logoInputMethod.value = 'url'; // Default to URL
  }
  
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
    portalUrl: agency.portal_url || '',
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
  // Path is already like "uploads/logos/logo-123.png", so just prepend base URL
  let iconPath = logoPath;
  if (iconPath.startsWith('/uploads/')) {
    iconPath = iconPath.substring('/uploads/'.length);
  } else if (iconPath.startsWith('/')) {
    iconPath = iconPath.substring(1);
  }
  return `${apiBase}/uploads/${iconPath}`;
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
      phoneExtension: agencyForm.value.phoneExtension?.trim() || null,
      portalUrl: agencyForm.value.portalUrl?.trim().toLowerCase() || null,
      ...(requiresAffiliatedAgency.value ? { affiliatedAgencyId: parseInt(agencyForm.value.affiliatedAgencyId, 10) } : {}),
      themeSettings: Object.keys(themeSettings).length > 0 ? themeSettings : null,
      customParameters: Object.keys(customParams).length > 0 ? customParams : null,
      // Notification icon fields
      statusExpiredIconId: agencyForm.value.statusExpiredIconId ?? null,
      tempPasswordExpiredIconId: agencyForm.value.tempPasswordExpiredIconId ?? null,
      taskOverdueIconId: agencyForm.value.taskOverdueIconId ?? null,
      onboardingCompletedIconId: agencyForm.value.onboardingCompletedIconId ?? null,
      invitationExpiredIconId: agencyForm.value.invitationExpiredIconId ?? null,
      firstLoginIconId: agencyForm.value.firstLoginIconId ?? null,
      firstLoginPendingIconId: agencyForm.value.firstLoginPendingIconId ?? null,
      passwordChangedIconId: agencyForm.value.passwordChangedIconId ?? null
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

const closeModal = () => {
  showCreateModal.value = false;
  editingAgency.value = null;
  activeTab.value = 'settings'; // Reset to settings tab
  customParamKeys.value = [];
  customParameters.value = {};
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
  await fetchAgencies();
  if (userRole.value === 'super_admin') {
    await fetchUsers();
  }
  await fetchIconTemplates();
});
</script>

<style scoped>
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

.agencies-list {
  display: grid;
  gap: 20px;
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
  max-width: 900px;
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
}

.tab-button {
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-bottom: -2px;
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

