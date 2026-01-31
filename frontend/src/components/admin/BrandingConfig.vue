<template>
  <div class="branding-config">
    <div class="section-header">
      <h2>Branding Configuration</h2>
      <p v-if="authStore.user?.role === 'super_admin'" class="section-description">
        Configure platform-wide branding settings. Agencies can override these settings.
      </p>
      <p v-else class="section-description">
        Configure your agency's branding. These settings override the platform defaults.
      </p>
    </div>

    <!-- Platform Branding (Super Admin Only) -->
    <div v-if="authStore.user?.role === 'super_admin'" class="platform-branding-section">
      <div class="branding-selector">
        <label for="branding-scope-selector">Configure Branding For:</label>
        <select 
          id="branding-scope-selector"
          v-model="selectedBrandingScope" 
          class="form-select"
          @change="onBrandingScopeChange"
        >
          <option value="platform">Platform (Default)</option>
          <option 
            v-for="agency in agencyStore.agencies" 
            :key="agency.id" 
            :value="`agency-${agency.id}`"
          >
            {{ agency.name }}
          </option>
        </select>
        <small v-if="selectedBrandingScope === 'platform'">
          Platform settings apply to all agencies unless overridden.
        </small>
        <small v-else>
          Agency-specific settings override platform defaults for this agency.
        </small>
      </div>

      <!-- Platform Branding Form -->
      <div v-if="selectedBrandingScope === 'platform'">
        <h3>Platform Branding</h3>
        <p class="section-description">
          Configure platform-wide branding settings that apply to all agencies. Individual agencies can override these settings.
        </p>
        <form @submit.prevent="savePlatformBranding" class="platform-form">
        <div class="form-group">
          <label>Tagline</label>
          <select v-model="platformForm.tagline" class="form-select">
            <option value="The gold standard for behavioral health workflows.">
              The gold standard for behavioral health workflows.
            </option>
            <option value="Care, clearly connected.">
              Care, clearly connected.
            </option>
            <option value="Set the standard of care.">
              Set the standard of care.
            </option>
            <option value="Clarity in every step of care.">
              Clarity in every step of care.
            </option>
          </select>
        </div>
        <div class="colors-grid">
          <div class="color-input-item">
            <label>Primary Color (Auric Gold)</label>
            <div class="color-input-group">
              <label class="color-swatch-label" :for="'primaryColorInput'">
                <div class="color-swatch" :style="{ backgroundColor: platformForm.primaryColor }"></div>
              </label>
              <input :id="'primaryColorInput'" v-model="platformForm.primaryColor" type="color" class="color-picker" />
              <input v-model="platformForm.primaryColor" type="text" class="color-hex" placeholder="#C69A2B" />
            </div>
          </div>
          <div class="color-input-item">
            <label>Secondary Color (Deep Ink)</label>
            <div class="color-input-group">
              <label class="color-swatch-label" :for="'secondaryColorInput'">
                <div class="color-swatch" :style="{ backgroundColor: platformForm.secondaryColor }"></div>
              </label>
              <input :id="'secondaryColorInput'" v-model="platformForm.secondaryColor" type="color" class="color-picker" />
              <input v-model="platformForm.secondaryColor" type="text" class="color-hex" placeholder="#1D2633" />
            </div>
          </div>
          <div class="color-input-item">
            <label>Accent Color (Slate Blue)</label>
            <div class="color-input-group">
              <label class="color-swatch-label" :for="'accentColorInput'">
                <div class="color-swatch" :style="{ backgroundColor: platformForm.accentColor }"></div>
              </label>
              <input :id="'accentColorInput'" v-model="platformForm.accentColor" type="color" class="color-picker" />
              <input v-model="platformForm.accentColor" type="text" class="color-hex" placeholder="#3A4C6B" />
            </div>
          </div>
          <div class="color-input-item">
            <label>Success Color (Calm Teal)</label>
            <div class="color-input-group">
              <label class="color-swatch-label" :for="'successColorInput'">
                <div class="color-swatch" :style="{ backgroundColor: platformForm.successColor }"></div>
              </label>
              <input :id="'successColorInput'" v-model="platformForm.successColor" type="color" class="color-picker" />
              <input v-model="platformForm.successColor" type="text" class="color-hex" placeholder="#2F8F83" />
            </div>
          </div>
          <div class="color-input-item">
            <label>Error Color</label>
            <div class="color-input-group">
              <label class="color-swatch-label" :for="'errorColorInput'">
                <div class="color-swatch" :style="{ backgroundColor: platformForm.errorColor }"></div>
              </label>
              <input :id="'errorColorInput'" v-model="platformForm.errorColor" type="color" class="color-picker" />
              <input v-model="platformForm.errorColor" type="text" class="color-hex" placeholder="#CC3D3D" />
            </div>
          </div>
          <div class="color-input-item">
            <label>Warning Color</label>
            <div class="color-input-group">
              <label class="color-swatch-label" :for="'warningColorInput'">
                <div class="color-swatch" :style="{ backgroundColor: platformForm.warningColor }"></div>
              </label>
              <input :id="'warningColorInput'" v-model="platformForm.warningColor" type="color" class="color-picker" />
              <input v-model="platformForm.warningColor" type="text" class="color-hex" placeholder="#E6A700" />
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>People Operations Term</label>
          <input v-model="platformForm.peopleOpsTerm" type="text" placeholder="People Operations" />
          <small>This term appears in the navigation bar (e.g., "Human Resources", "People Operations")</small>
        </div>
        
        <div class="form-section-divider">
          <h4>Platform Organization</h4>
          <p class="section-description">Configure the platform organization name and logo that appears in "Powered by" footers on agency login pages.</p>
        </div>
        
        <div class="form-group">
          <label>Organization Name</label>
          <input v-model="platformForm.organizationName" type="text" placeholder="Enter platform organization name" />
          <small>This name appears in "Powered by" footer on agency login pages and throughout the platform</small>
        </div>
        <div class="form-group">
          <label>Organization Logo</label>
          <div class="logo-input-tabs">
            <button 
              type="button"
              :class="['tab-button-small', { active: platformLogoInputMethod === 'url' }]"
              @click="platformLogoInputMethod = 'url'"
            >
              URL
            </button>
            <button 
              type="button"
              :class="['tab-button-small', { active: platformLogoInputMethod === 'upload' }]"
              @click="platformLogoInputMethod = 'upload'"
            >
              Upload
            </button>
          </div>
          
          <!-- URL Input -->
          <div v-if="platformLogoInputMethod === 'url'" class="logo-input-section">
            <input v-model="platformForm.organizationLogoUrl" type="url" placeholder="https://example.com/logo.png" />
            <p class="form-help">Enter the full URL to your platform organization logo image (PNG, JPG, or SVG)</p>
            <div v-if="platformForm.organizationLogoUrl" class="logo-preview">
              <img :src="platformForm.organizationLogoUrl" alt="Logo preview" @error="handleLogoError" />
              <p v-if="logoError" class="logo-error">Failed to load logo. Please check the URL.</p>
            </div>
          </div>
          
          <!-- Upload Input -->
          <div v-if="platformLogoInputMethod === 'upload'" class="logo-input-section">
            <input 
              type="file" 
              ref="platformLogoFileInput"
              @change="handlePlatformLogoFileSelect"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
              class="file-input"
              style="display: none;"
            />
            <button 
              type="button"
              class="btn btn-primary"
              @click="platformLogoFileInput?.click()"
              :disabled="uploadingPlatformLogo"
            >
              {{ uploadingPlatformLogo ? 'Uploading...' : 'Choose Logo File' }}
            </button>
            <p class="form-help">Upload a logo file (PNG, JPG, GIF, SVG, or WebP - max 5MB)</p>
            <div v-if="uploadingPlatformLogo" class="upload-status">Uploading logo...</div>
            <div v-if="platformForm.organizationLogoPath" class="logo-preview">
              <img :src="getLogoUrlFromPath(platformForm.organizationLogoPath)" alt="Logo preview" @error="handleLogoError" />
              <p class="form-help">Logo uploaded successfully</p>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Organization Logo Icon (Alternative)</label>
          <div class="icon-selector-wrapper">
            <IconSelector v-model="platformForm.organizationLogoIconId" />
            <button
              v-if="platformForm.organizationLogoIconId"
              type="button"
              class="btn btn-sm btn-danger"
              @click="platformForm.organizationLogoIconId = null"
            >
              Clear
            </button>
          </div>
          <small>Alternative: Select an icon from the Icon Library if you prefer to use an icon instead of a logo URL.</small>
        </div>
        <div class="form-section-divider">
          <h4>Fonts</h4>
          <p class="section-description">Configure default fonts for the platform.</p>
        </div>
        <div class="fonts-grid">
          <div class="font-input-item">
            <label>Body Font</label>
            <FontSelector 
              v-model="platformForm.bodyFontId" 
              placeholder="Select body font..."
              font-type="body"
            />
            <small>Font used for body text and paragraphs</small>
          </div>
          <div class="font-input-item">
            <label>Numeric Font</label>
            <FontSelector 
              v-model="platformForm.numericFontId" 
              placeholder="Select numeric font..."
              font-type="numeric"
            />
            <small>Font used for numbers and data</small>
          </div>
          <div class="font-input-item">
            <label>Display Font</label>
            <FontSelector 
              v-model="platformForm.displayFontId" 
              placeholder="Select display font..."
              font-type="display"
            />
            <small>Font used for large display text</small>
          </div>
        </div>
        
        <div class="form-section-divider">
          <h4>Default Icons</h4>
          <p class="section-description">Set default icons that will be used when individual items don't have their own icon assigned.</p>
        </div>
        
        <div class="icons-table">
          <div class="icon-row">
            <div class="icon-label">Training Focus Default Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.trainingFocusDefaultIconId" />
              <button 
                v-if="platformForm.trainingFocusDefaultIconId" 
                @click="platformForm.trainingFocusDefaultIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Default icon for training focuses when no specific icon is assigned</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Module Default Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.moduleDefaultIconId" />
              <button 
                v-if="platformForm.moduleDefaultIconId" 
                @click="platformForm.moduleDefaultIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Default icon for modules when no specific icon is assigned</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">User Default Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.userDefaultIconId" />
              <button 
                v-if="platformForm.userDefaultIconId" 
                @click="platformForm.userDefaultIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Default icon for users when no specific icon is assigned</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Document Default Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.documentDefaultIconId" />
              <button 
                v-if="platformForm.documentDefaultIconId" 
                @click="platformForm.documentDefaultIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Default icon for documents when no specific icon is assigned</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Master Brand Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.masterBrandIconId" />
              <button 
                v-if="platformForm.masterBrandIconId" 
                @click="platformForm.masterBrandIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Master brand icon displayed on documents when viewing all agencies</div>
          </div>
        </div>
        
        <div class="section-divider"></div>
        <h3>Dashboard Action Icons</h3>
        <p class="section-description">Icons displayed on the dashboard quick action cards</p>
        
        <div class="icons-table">
          <div class="icon-row">
            <div class="icon-label">Progress Dashboard Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.progressDashboardIconId" />
              <button
                v-if="platformForm.progressDashboardIconId"
                @click="platformForm.progressDashboardIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Progress Dashboard" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Manage Agencies Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.manageAgenciesIconId" />
              <button 
                v-if="platformForm.manageAgenciesIconId" 
                @click="platformForm.manageAgenciesIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Manage Agencies" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Manage Clients Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.manageClientsIconId" />
              <button
                v-if="platformForm.manageClientsIconId"
                @click="platformForm.manageClientsIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Manage Clients" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">School Overview Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.schoolOverviewIconId" />
              <button
                v-if="platformForm.schoolOverviewIconId"
                @click="platformForm.schoolOverviewIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "School Overview" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Program Overview Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.schoolOverviewIconId" />
              <button
                v-if="platformForm.schoolOverviewIconId"
                @click="platformForm.schoolOverviewIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Program Overview" action card (uses the same icon field as School Overview)</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Provider Availability Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.companyProfileIconId" />
              <button
                v-if="platformForm.companyProfileIconId"
                @click="platformForm.companyProfileIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Provider Availability" action card (uses the Company Profile icon field)</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Executive Report Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.viewAllProgressIconId" />
              <button
                v-if="platformForm.viewAllProgressIconId"
                @click="platformForm.viewAllProgressIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Executive Report" action card (uses the View All Progress icon field)</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Manage Modules Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.manageModulesIconId" />
              <button 
                v-if="platformForm.manageModulesIconId" 
                @click="platformForm.manageModulesIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Manage Modules" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Manage Documents Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.manageDocumentsIconId" />
              <button 
                v-if="platformForm.manageDocumentsIconId" 
                @click="platformForm.manageDocumentsIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Manage Documents" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Manage Users Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.manageUsersIconId" />
              <button 
                v-if="platformForm.manageUsersIconId" 
                @click="platformForm.manageUsersIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Manage Users" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Settings Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.settingsIconId" />
              <button
                v-if="platformForm.settingsIconId"
                @click="platformForm.settingsIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Settings" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Platform Settings Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.platformSettingsIconId" />
              <button 
                v-if="platformForm.platformSettingsIconId" 
                @click="platformForm.platformSettingsIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Platform Settings" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">View All Progress Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.viewAllProgressIconId" />
              <button 
                v-if="platformForm.viewAllProgressIconId" 
                @click="platformForm.viewAllProgressIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "View All Progress" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Notifications Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.dashboardNotificationsIconId" />
              <button
                v-if="platformForm.dashboardNotificationsIconId"
                @click="platformForm.dashboardNotificationsIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Notifications" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Communications Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.dashboardCommunicationsIconId" />
              <button
                v-if="platformForm.dashboardCommunicationsIconId"
                @click="platformForm.dashboardCommunicationsIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Communications" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Chats Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.dashboardChatsIconId" />
              <button
                v-if="platformForm.dashboardChatsIconId"
                @click="platformForm.dashboardChatsIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Chats" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Payroll Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.dashboardPayrollIconId" />
              <button
                v-if="platformForm.dashboardPayrollIconId"
                @click="platformForm.dashboardPayrollIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Payroll" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Billing Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.dashboardBillingIconId" />
              <button
                v-if="platformForm.dashboardBillingIconId"
                @click="platformForm.dashboardBillingIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Billing" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">All Agencies Notifications Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.allAgenciesNotificationsIconId" />
              <button 
                v-if="platformForm.allAgenciesNotificationsIconId" 
                @click="platformForm.allAgenciesNotificationsIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "All Agencies" notification card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Agency Calendar Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.externalCalendarAuditIconId" />
              <button
                v-if="platformForm.externalCalendarAuditIconId"
                @click="platformForm.externalCalendarAuditIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Agency Calendar" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Skill Builders Availability Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.skillBuildersAvailabilityIconId" />
              <button
                v-if="platformForm.skillBuildersAvailabilityIconId"
                @click="platformForm.skillBuildersAvailabilityIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Skill Builders Availability" action card</div>
          </div>
        </div>

        <div class="section-divider"></div>
        <h3>Settings Navigation Icons</h3>
        <p class="section-description">
          Icons shown in the Settings sidebar navigation (replaces emojis). Agencies can override these per agency.
        </p>

        <div class="icons-table">
          <div class="icon-row">
            <div class="icon-label">Company Profile</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.companyProfileIconId" />
              <button
                v-if="platformForm.companyProfileIconId"
                @click="platformForm.companyProfileIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Company Profile settings</div>
          </div>

          <div class="icon-row">
            <div class="icon-label">Platform &amp; Security</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.platformSettingsIconId" />
              <button
                v-if="platformForm.platformSettingsIconId"
                @click="platformForm.platformSettingsIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Platform &amp; Security settings</div>
          </div>

          <div class="icon-row">
            <div class="icon-label">Team &amp; Roles</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.teamRolesIconId" />
              <button
                v-if="platformForm.teamRolesIconId"
                @click="platformForm.teamRolesIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Team &amp; Roles settings</div>
          </div>

          <div class="icon-row">
            <div class="icon-label">Billing</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.billingIconId" />
              <button
                v-if="platformForm.billingIconId"
                @click="platformForm.billingIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Billing settings</div>
          </div>

          <div class="icon-row">
            <div class="icon-label">Packages</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.packagesIconId" />
              <button
                v-if="platformForm.packagesIconId"
                @click="platformForm.packagesIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Packages settings</div>
          </div>

          <div class="icon-row">
            <div class="icon-label">Checklist Items</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.checklistItemsIconId" />
              <button
                v-if="platformForm.checklistItemsIconId"
                @click="platformForm.checklistItemsIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Checklist Items settings</div>
          </div>

          <div class="icon-row">
            <div class="icon-label">Field Definitions</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.fieldDefinitionsIconId" />
              <button
                v-if="platformForm.fieldDefinitionsIconId"
                @click="platformForm.fieldDefinitionsIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Field Definitions settings</div>
          </div>

          <div class="icon-row">
            <div class="icon-label">Branding &amp; Templates</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.brandingTemplatesIconId" />
              <button
                v-if="platformForm.brandingTemplatesIconId"
                @click="platformForm.brandingTemplatesIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Branding &amp; Templates settings</div>
          </div>

          <div class="icon-row">
            <div class="icon-label">Assets (Icons/Fonts)</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.assetsIconId" />
              <button
                v-if="platformForm.assetsIconId"
                @click="platformForm.assetsIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Assets settings</div>
          </div>

          <div class="icon-row">
            <div class="icon-label">Communications</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.communicationsIconId" />
              <button
                v-if="platformForm.communicationsIconId"
                @click="platformForm.communicationsIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Communications settings</div>
          </div>

          <div class="icon-row">
            <div class="icon-label">Integrations</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.integrationsIconId" />
              <button
                v-if="platformForm.integrationsIconId"
                @click="platformForm.integrationsIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Integrations settings</div>
          </div>

          <div class="icon-row">
            <div class="icon-label">Archive</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="platformForm.archiveIconId" />
              <button
                v-if="platformForm.archiveIconId"
                @click="platformForm.archiveIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for Archive settings</div>
          </div>
        </div>
        
        <div
          v-if="authStore.user?.role === 'super_admin' && selectedBrandingScope === 'platform' && templateState && !templateState.platform?.defaultTemplate"
          style="margin: 12px 0; padding: 10px 12px; background: #fff7ed; border: 1px solid #fdba74; border-radius: 10px; color: #7c2d12;"
        >
          <strong>Platform default template required.</strong>
          Create or select a template, then click <strong>Set as Default</strong> so it’s always clear which template the platform is using.
        </div>

        <div class="form-actions">
          <div class="template-actions">
            <select v-model="selectedTemplateToApply" @change="applySelectedTemplate" class="form-select" style="max-width: 300px;">
              <option value="">Apply Template...</option>
              <option v-for="template in availableTemplates" :key="template.id" :value="template.id">
                {{ template.name }}
              </option>
            </select>
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="!selectedTemplateToApply"
              @click="setSelectedTemplateAsDefault"
              title="Set the selected template as the default for this scope"
            >
              Set as Default
            </button>
            <button type="button" @click="saveAsTemplate" class="btn btn-secondary">
              Save as Template
            </button>
          </div>
          <div
            v-if="templateState"
            class="current-template-indicator"
            style="margin: 8px 0; padding: 10px 12px; background: #f8fafc; border-left: 3px solid #0ea5e9; border-radius: 6px;"
          >
            <div>
              <strong>Effective Template:</strong>
              <span style="font-weight: 800;">{{ templateState.effectiveTemplate?.name || '—' }}</span>
            </div>
            <div style="margin-top: 4px; color: var(--text-secondary); font-size: 13px;">
              <strong>Default:</strong> {{ templateState.platform?.defaultTemplate?.name || '—' }}
              <span style="margin: 0 6px;">•</span>
              <strong>Current:</strong> {{ templateState.platform?.currentTemplate?.name || '—' }}
            </div>
            <button 
              type="button" 
              @click="clearAppliedTemplate" 
              class="btn btn-sm btn-link" 
              style="margin-left: 8px; padding: 0; text-decoration: underline;"
              title="Clear applied template"
            >
              Clear
            </button>
          </div>
          <button type="submit" class="btn btn-primary" :disabled="savingPlatform">
            {{ savingPlatform ? 'Saving...' : 'Save Platform Branding' }}
          </button>
          <div class="platform-backup-restore" style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);">
            <h4 style="margin-bottom: 12px;">Backup &amp; Restore</h4>
            <p class="section-description" style="margin-bottom: 12px;">
              Download the entire platform branding (including all icons) as a JSON file, or restore from a previously downloaded file in case you lose your settings.
            </p>
            <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
              <button type="button" class="btn btn-secondary" :disabled="downloadingTemplate" @click="downloadPlatformTemplate">
                {{ downloadingTemplate ? 'Preparing...' : 'Download platform template' }}
              </button>
              <button type="button" class="btn btn-secondary" :disabled="restoringTemplate" @click="platformRestoreFileInputRef?.click()">
                {{ restoringTemplate ? 'Restoring...' : 'Restore from file' }}
              </button>
              <input
                ref="platformRestoreFileInputRef"
                type="file"
                accept=".json,application/json"
                style="display: none"
                @change="onPlatformRestoreFileSelected"
              />
            </div>
          </div>
        </div>
      </form>
      
      <div class="info-box">
        <h4>Editing Agency Branding</h4>
        <p>To edit individual agency branding (logo, colors), go to the <strong>Agencies</strong> tab and click "Edit" on the agency you want to modify.</p>
      </div>
      </div>

      <!-- Agency Branding Form (for Super Admin) -->
      <div v-else-if="selectedBrandingScope.startsWith('agency-')">
        <h3>Agency Branding: {{ selectedAgency?.name }}</h3>
        <p class="section-description">
          Configure agency-specific branding settings. These override the platform defaults for this agency.
        </p>
        <form @submit.prevent="saveAgencyBrandingForSuperAdmin" class="platform-form">
          <div class="form-group">
            <label>Logo URL</label>
            <input v-model="agencyBrandingForm.logoUrl" type="url" placeholder="https://example.com/logo.png" />
            <p class="form-help">Enter the full URL to your agency logo image (PNG, JPG, or SVG)</p>
          </div>
          
          <div class="colors-grid">
            <div class="color-input-item">
              <label>Primary Color</label>
              <div class="color-input-group">
                <label class="color-swatch-label" :for="'agencyPrimaryColorInput'">
                  <div class="color-swatch" :style="{ backgroundColor: agencyBrandingForm.primaryColor }"></div>
                </label>
                <input :id="'agencyPrimaryColorInput'" v-model="agencyBrandingForm.primaryColor" type="color" class="color-picker" />
                <input v-model="agencyBrandingForm.primaryColor" type="text" class="color-hex" placeholder="#0f172a" />
              </div>
            </div>
            
            <div class="color-input-item">
              <label>Secondary Color</label>
              <div class="color-input-group">
                <label class="color-swatch-label" :for="'agencySecondaryColorInput'">
                  <div class="color-swatch" :style="{ backgroundColor: agencyBrandingForm.secondaryColor }"></div>
                </label>
                <input :id="'agencySecondaryColorInput'" v-model="agencyBrandingForm.secondaryColor" type="color" class="color-picker" />
                <input v-model="agencyBrandingForm.secondaryColor" type="text" class="color-hex" placeholder="#1e40af" />
              </div>
            </div>
            
            <div class="color-input-item">
              <label>Accent Color</label>
              <div class="color-input-group">
                <label class="color-swatch-label" :for="'agencyAccentColorInput'">
                  <div class="color-swatch" :style="{ backgroundColor: agencyBrandingForm.accentColor }"></div>
                </label>
                <input :id="'agencyAccentColorInput'" v-model="agencyBrandingForm.accentColor" type="color" class="color-picker" />
                <input v-model="agencyBrandingForm.accentColor" type="text" class="color-hex" placeholder="#f97316" />
              </div>
            </div>
          </div>

          <div class="section-divider"></div>
          <h4>Certificate Template</h4>
          <p class="section-description">Configure a Google Docs template to be used as the background for certificates generated for this agency.</p>
          
          <div class="form-group">
            <label>Certificate Template URL (Google Docs)</label>
            <input 
              v-model="agencyBrandingForm.certificateTemplateUrl" 
              type="url" 
              placeholder="https://docs.google.com/document/d/..." 
              class="form-input"
            />
            <p class="form-help">
              Enter the share URL of a Google Doc to use as the certificate template. 
              The document should be shared with "Anyone with the link" permission. 
              The system will overlay the user's name, completion date, and module/training focus information on top of your template.
            </p>
            <small class="form-help-text">
              Example: https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit
            </small>
          </div>

          <div class="section-divider"></div>
          <h4>Default Icons</h4>
          <p class="section-description">Set default icons for this agency</p>
          
          <div class="icons-table">
            <div class="icon-row">
              <div class="icon-label">Master Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.masterIconId" />
                <button 
                  v-if="agencyBrandingForm.masterIconId" 
                  @click="agencyBrandingForm.masterIconId = null" 
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
              <div class="icon-description">Master icon for this agency, used for branding and document display</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Training Focus Default Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.trainingFocusDefaultIconId" />
                <button 
                  v-if="agencyBrandingForm.trainingFocusDefaultIconId" 
                  @click="agencyBrandingForm.trainingFocusDefaultIconId = null" 
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
              <div class="icon-description">Default icon for training focuses when no specific icon is assigned</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Module Default Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.moduleDefaultIconId" />
                <button 
                  v-if="agencyBrandingForm.moduleDefaultIconId" 
                  @click="agencyBrandingForm.moduleDefaultIconId = null" 
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
              <div class="icon-description">Default icon for modules when no specific icon is assigned</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">User Default Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.userDefaultIconId" />
                <button 
                  v-if="agencyBrandingForm.userDefaultIconId" 
                  @click="agencyBrandingForm.userDefaultIconId = null" 
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
              <div class="icon-description">Default icon for users when no specific icon is assigned</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Document Default Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.documentDefaultIconId" />
                <button 
                  v-if="agencyBrandingForm.documentDefaultIconId" 
                  @click="agencyBrandingForm.documentDefaultIconId = null" 
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
              <div class="icon-description">Default icon for documents when no specific icon is assigned</div>
            </div>
          </div>

          <div class="section-divider"></div>
          <h4>Dashboard Action Icons</h4>
          <p class="section-description">Icons displayed on the dashboard quick action cards (overrides platform defaults)</p>
          
          <div class="icons-table">
            <div class="icon-row">
              <div class="icon-label">Progress Dashboard Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.progressDashboardIconId" />
                <button 
                  v-if="agencyBrandingForm.progressDashboardIconId" 
                  @click="agencyBrandingForm.progressDashboardIconId = null" 
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
              <div class="icon-description">Icon for the "Progress Dashboard" action card</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Manage Modules Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.manageModulesIconId" />
                <button 
                  v-if="agencyBrandingForm.manageModulesIconId" 
                  @click="agencyBrandingForm.manageModulesIconId = null" 
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
              <div class="icon-description">Icon for the "Manage Modules" action card</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Manage Documents Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.manageDocumentsIconId" />
                <button 
                  v-if="agencyBrandingForm.manageDocumentsIconId" 
                  @click="agencyBrandingForm.manageDocumentsIconId = null" 
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
              <div class="icon-description">Icon for the "Manage Documents" action card</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Manage Users Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.manageUsersIconId" />
                <button 
                  v-if="agencyBrandingForm.manageUsersIconId" 
                  @click="agencyBrandingForm.manageUsersIconId = null" 
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
              <div class="icon-description">Icon for the "Manage Users" action card</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Settings Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.settingsIconId" />
                <button 
                  v-if="agencyBrandingForm.settingsIconId" 
                  @click="agencyBrandingForm.settingsIconId = null" 
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
              <div class="icon-description">Icon for the "Settings" action card</div>
            </div>
            <div class="icon-row">
            <div class="icon-label">Agency Calendar Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.externalCalendarAuditIconId" />
                <button
                  v-if="agencyBrandingForm.externalCalendarAuditIconId"
                  @click="agencyBrandingForm.externalCalendarAuditIconId = null"
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
            <div class="icon-description">Icon for the "Agency Calendar" action card</div>
            </div>
          <div class="icon-row">
            <div class="icon-label">Skill Builders Availability Icon</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.skillBuildersAvailabilityIconId" />
                <button
                  v-if="agencyBrandingForm.skillBuildersAvailabilityIconId"
                  @click="agencyBrandingForm.skillBuildersAvailabilityIconId = null"
                  class="btn btn-sm btn-danger"
                  type="button"
                  title="Remove icon"
                >
                  Clear
                </button>
              </div>
            <div class="icon-description">Icon for the "Skill Builders Availability" action card</div>
          </div>
          </div>

          <div class="section-divider"></div>
          <h4>Settings Navigation Icons</h4>
          <p class="section-description">Icons shown in the Settings sidebar navigation (overrides platform defaults).</p>

          <div class="icons-table">
            <div class="icon-row">
              <div class="icon-label">Company Profile</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.companyProfileIconId" />
                <button v-if="agencyBrandingForm.companyProfileIconId" @click="agencyBrandingForm.companyProfileIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Platform &amp; Security</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.platformSettingsIconId" />
                <button v-if="agencyBrandingForm.platformSettingsIconId" @click="agencyBrandingForm.platformSettingsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Team &amp; Roles</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.teamRolesIconId" />
                <button v-if="agencyBrandingForm.teamRolesIconId" @click="agencyBrandingForm.teamRolesIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Billing</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.billingIconId" />
                <button v-if="agencyBrandingForm.billingIconId" @click="agencyBrandingForm.billingIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Packages</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.packagesIconId" />
                <button v-if="agencyBrandingForm.packagesIconId" @click="agencyBrandingForm.packagesIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Checklist Items</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.checklistItemsIconId" />
                <button v-if="agencyBrandingForm.checklistItemsIconId" @click="agencyBrandingForm.checklistItemsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Field Definitions</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.fieldDefinitionsIconId" />
                <button v-if="agencyBrandingForm.fieldDefinitionsIconId" @click="agencyBrandingForm.fieldDefinitionsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Branding &amp; Templates</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.brandingTemplatesIconId" />
                <button v-if="agencyBrandingForm.brandingTemplatesIconId" @click="agencyBrandingForm.brandingTemplatesIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Assets (Icons/Fonts)</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.assetsIconId" />
                <button v-if="agencyBrandingForm.assetsIconId" @click="agencyBrandingForm.assetsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Communications</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.communicationsIconId" />
                <button v-if="agencyBrandingForm.communicationsIconId" @click="agencyBrandingForm.communicationsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Integrations</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.integrationsIconId" />
                <button v-if="agencyBrandingForm.integrationsIconId" @click="agencyBrandingForm.integrationsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
            <div class="icon-row">
              <div class="icon-label">Archive</div>
              <div class="icon-selector-cell">
                <IconSelector v-model="agencyBrandingForm.archiveIconId" />
                <button v-if="agencyBrandingForm.archiveIconId" @click="agencyBrandingForm.archiveIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
              </div>
              <div class="icon-description">Settings sidebar icon</div>
            </div>
          </div>
          
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="savingAgency">
              {{ savingAgency ? 'Saving...' : 'Save Agency Branding' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Agency Branding (Regular Admin Only) -->
    <div v-else class="branding-preview">
      <h3>Your Agency Branding</h3>
      <div v-if="currentAgency" class="preview-card">
        <div class="preview-header" :style="{ backgroundColor: primaryColor, color: 'white' }">
          <h4>{{ currentAgency.name }}</h4>
        </div>
        <div class="preview-content">
          <div class="color-preview">
            <div class="color-box" :style="{ backgroundColor: primaryColor }">
              <span>Primary</span>
            </div>
            <div class="color-box" :style="{ backgroundColor: secondaryColor }">
              <span>Secondary</span>
            </div>
            <div class="color-box" :style="{ backgroundColor: accentColor }">
              <span>Accent</span>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="no-agency">No agency assigned</p>
    </div>
    
    <!-- Agency Branding (Regular Admin) -->
    <div v-if="authStore.user?.role !== 'super_admin' && userAgencies.length > 1" class="agency-selector">
      <label for="agency-selector">Configure Branding For:</label>
      <select 
        id="agency-selector"
        v-model="selectedAgencyForAdmin" 
        class="form-select"
        @change="onAdminAgencyChange"
      >
        <option 
          v-for="agency in userAgencies" 
          :key="agency.id" 
          :value="agency.id"
        >
          {{ agency.name }}
        </option>
      </select>
      <small>Select which agency's branding you want to configure.</small>
    </div>

    <div v-if="currentAgency && authStore.user?.role !== 'super_admin'" class="branding-form">
      <h3>Update Your Agency Branding{{ userAgencies.length > 1 ? `: ${currentAgency.name}` : '' }}</h3>
      <p class="section-description">These settings override the platform defaults for your agency.</p>
      <form @submit.prevent="saveBranding">
        <div class="form-group">
          <label>Logo URL</label>
          <input v-model="brandingForm.logoUrl" type="url" placeholder="https://example.com/logo.png" />
          <p class="form-help">Enter the full URL to your agency logo image (PNG, JPG, or SVG)</p>
          <div v-if="brandingForm.logoUrl" class="logo-preview">
            <img :src="brandingForm.logoUrl" alt="Logo preview" @error="handleLogoError" />
            <p v-if="logoError" class="logo-error">Failed to load logo. Please check the URL.</p>
          </div>
        </div>
        <div class="colors-grid">
          <div class="color-input-item">
            <label>Primary Color</label>
            <div class="color-input-group">
              <label class="color-swatch-label" for="agencyPrimaryColorInput">
                <div class="color-swatch" :style="{ backgroundColor: brandingForm.primaryColor }"></div>
              </label>
              <input id="agencyPrimaryColorInput" v-model="brandingForm.primaryColor" type="color" class="color-picker" />
              <input v-model="brandingForm.primaryColor" type="text" class="color-hex" placeholder="#0f172a" />
            </div>
          </div>
          <div class="color-input-item">
            <label>Secondary Color</label>
            <div class="color-input-group">
              <label class="color-swatch-label" for="agencySecondaryColorInput">
                <div class="color-swatch" :style="{ backgroundColor: brandingForm.secondaryColor }"></div>
              </label>
              <input id="agencySecondaryColorInput" v-model="brandingForm.secondaryColor" type="color" class="color-picker" />
              <input v-model="brandingForm.secondaryColor" type="text" class="color-hex" placeholder="#1e40af" />
            </div>
          </div>
          <div class="color-input-item">
            <label>Accent Color</label>
            <div class="color-input-group">
              <label class="color-swatch-label" for="agencyAccentColorInput">
                <div class="color-swatch" :style="{ backgroundColor: brandingForm.accentColor }"></div>
              </label>
              <input id="agencyAccentColorInput" v-model="brandingForm.accentColor" type="color" class="color-picker" />
              <input v-model="brandingForm.accentColor" type="text" class="color-hex" placeholder="#f97316" />
            </div>
          </div>
        </div>

        <div class="section-divider"></div>
        <h4>Certificate Template</h4>
        <p class="section-description">Configure a Google Docs template to be used as the background for certificates generated for this agency.</p>
        
        <div class="form-group">
          <label>Certificate Template URL (Google Docs)</label>
          <input 
            v-model="brandingForm.certificateTemplateUrl" 
            type="url" 
            placeholder="https://docs.google.com/document/d/..." 
            class="form-input"
          />
          <p class="form-help">
            Enter the share URL of a Google Doc to use as the certificate template. 
            The document should be shared with "Anyone with the link" permission. 
            The system will overlay the user's name, completion date, and module/training focus information on top of your template.
          </p>
          <small class="form-help-text">
            Example: https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit
          </small>
        </div>

        <div class="section-divider"></div>
        <h4>Default Icons</h4>
        <p class="section-description">Set default icons for this agency</p>
        
        <div class="icons-table">
          <div class="icon-row">
            <div class="icon-label">Training Focus Default Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.trainingFocusDefaultIconId" />
              <button 
                v-if="brandingForm.trainingFocusDefaultIconId" 
                @click="brandingForm.trainingFocusDefaultIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Default icon for training focuses when no specific icon is assigned</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Module Default Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.moduleDefaultIconId" />
              <button 
                v-if="brandingForm.moduleDefaultIconId" 
                @click="brandingForm.moduleDefaultIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Default icon for modules when no specific icon is assigned</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">User Default Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.userDefaultIconId" />
              <button 
                v-if="brandingForm.userDefaultIconId" 
                @click="brandingForm.userDefaultIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Default icon for users when no specific icon is assigned</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Document Default Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.documentDefaultIconId" />
              <button 
                v-if="brandingForm.documentDefaultIconId" 
                @click="brandingForm.documentDefaultIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Default icon for documents when no specific icon is assigned</div>
          </div>
        </div>

        <div class="section-divider"></div>
        <h4>Dashboard Action Icons</h4>
        <p class="section-description">Icons displayed on the dashboard quick action cards (overrides platform defaults)</p>
        
        <div class="icons-table">
          <div class="icon-row">
            <div class="icon-label">Progress Dashboard Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.progressDashboardIconId" />
              <button 
                v-if="brandingForm.progressDashboardIconId" 
                @click="brandingForm.progressDashboardIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Progress Dashboard" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Manage Modules Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.manageModulesIconId" />
              <button 
                v-if="brandingForm.manageModulesIconId" 
                @click="brandingForm.manageModulesIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Manage Modules" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Manage Documents Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.manageDocumentsIconId" />
              <button 
                v-if="brandingForm.manageDocumentsIconId" 
                @click="brandingForm.manageDocumentsIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Manage Documents" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Manage Users Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.manageUsersIconId" />
              <button 
                v-if="brandingForm.manageUsersIconId" 
                @click="brandingForm.manageUsersIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Manage Users" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Settings Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.settingsIconId" />
              <button 
                v-if="brandingForm.settingsIconId" 
                @click="brandingForm.settingsIconId = null" 
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Settings" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Agency Calendar Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.externalCalendarAuditIconId" />
              <button
                v-if="brandingForm.externalCalendarAuditIconId"
                @click="brandingForm.externalCalendarAuditIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Agency Calendar" action card</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Skill Builders Availability Icon</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.skillBuildersAvailabilityIconId" />
              <button
                v-if="brandingForm.skillBuildersAvailabilityIconId"
                @click="brandingForm.skillBuildersAvailabilityIconId = null"
                class="btn btn-sm btn-danger"
                type="button"
                title="Remove icon"
              >
                Clear
              </button>
            </div>
            <div class="icon-description">Icon for the "Skill Builders Availability" action card</div>
          </div>
        </div>

        <div class="section-divider"></div>
        <h4>Settings Navigation Icons</h4>
        <p class="section-description">Icons shown in the Settings sidebar navigation (overrides platform defaults).</p>

        <div class="icons-table">
          <div class="icon-row">
            <div class="icon-label">Company Profile</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.companyProfileIconId" />
              <button v-if="brandingForm.companyProfileIconId" @click="brandingForm.companyProfileIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Platform &amp; Security</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.platformSettingsIconId" />
              <button v-if="brandingForm.platformSettingsIconId" @click="brandingForm.platformSettingsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Team &amp; Roles</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.teamRolesIconId" />
              <button v-if="brandingForm.teamRolesIconId" @click="brandingForm.teamRolesIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Billing</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.billingIconId" />
              <button v-if="brandingForm.billingIconId" @click="brandingForm.billingIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Packages</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.packagesIconId" />
              <button v-if="brandingForm.packagesIconId" @click="brandingForm.packagesIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Checklist Items</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.checklistItemsIconId" />
              <button v-if="brandingForm.checklistItemsIconId" @click="brandingForm.checklistItemsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Field Definitions</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.fieldDefinitionsIconId" />
              <button v-if="brandingForm.fieldDefinitionsIconId" @click="brandingForm.fieldDefinitionsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Branding &amp; Templates</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.brandingTemplatesIconId" />
              <button v-if="brandingForm.brandingTemplatesIconId" @click="brandingForm.brandingTemplatesIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Assets (Icons/Fonts)</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.assetsIconId" />
              <button v-if="brandingForm.assetsIconId" @click="brandingForm.assetsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Communications</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.communicationsIconId" />
              <button v-if="brandingForm.communicationsIconId" @click="brandingForm.communicationsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Integrations</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.integrationsIconId" />
              <button v-if="brandingForm.integrationsIconId" @click="brandingForm.integrationsIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
          <div class="icon-row">
            <div class="icon-label">Archive</div>
            <div class="icon-selector-cell">
              <IconSelector v-model="brandingForm.archiveIconId" />
              <button v-if="brandingForm.archiveIconId" @click="brandingForm.archiveIconId = null" class="btn btn-sm btn-danger" type="button">Clear</button>
            </div>
            <div class="icon-description">Settings sidebar icon</div>
          </div>
        </div>
        
        <div class="form-actions">
          <div class="template-actions">
            <select v-model="selectedTemplateToApply" @change="applySelectedTemplate" class="form-select" style="max-width: 300px;">
              <option value="">Apply Template...</option>
              <option v-for="template in availableTemplates" :key="template.id" :value="template.id">
                {{ template.name }}
              </option>
            </select>
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="!selectedTemplateToApply"
              @click="setSelectedTemplateAsDefault"
              title="Set the selected template as the default for this scope"
            >
              Set as Default
            </button>
            <button type="button" @click="saveAsTemplate" class="btn btn-secondary">
              Save as Template
            </button>
          </div>
          <div
            v-if="templateState"
            class="current-template-indicator"
            style="margin: 8px 0; padding: 10px 12px; background: #f8fafc; border-left: 3px solid #0ea5e9; border-radius: 6px;"
          >
            <div>
              <strong>Effective Template:</strong>
              <span style="font-weight: 800;">{{ templateState.effectiveTemplate?.name || '—' }}</span>
            </div>
            <div style="margin-top: 4px; color: var(--text-secondary); font-size: 13px;">
              <strong>Agency default:</strong> {{ templateState.agency?.defaultTemplate?.name || '—' }}
              <span style="margin: 0 6px;">•</span>
              <strong>Agency current:</strong> {{ templateState.agency?.currentTemplate?.name || '—' }}
              <span style="margin: 0 6px;">•</span>
              <strong>Platform current:</strong> {{ templateState.platform?.currentTemplate?.name || '—' }}
              <span style="margin: 0 6px;">•</span>
              <strong>Platform default:</strong> {{ templateState.platform?.defaultTemplate?.name || '—' }}
            </div>
            <button
              type="button"
              @click="clearAppliedTemplate"
              class="btn btn-sm btn-link"
              style="margin-left: 8px; padding: 0; text-decoration: underline;"
              title="Clear current template selection"
            >
              Clear current
            </button>
          </div>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save Branding' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Save as Template Modal -->
    <div v-if="showSaveTemplateModal" class="modal-overlay" @click="showSaveTemplateModal = false">
      <div class="modal-content large-modal" @click.stop>
        <h3>Save Current Branding as Template</h3>
        <form @submit.prevent="createTemplateFromCurrent">
          <div class="form-group">
            <label>Template Name *</label>
            <input v-model="saveTemplateForm.name" type="text" required />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="saveTemplateForm.description" rows="2"></textarea>
          </div>
          <div v-if="authStore.user?.role === 'super_admin' && selectedBrandingScope === 'platform'" class="form-group">
            <label>
              <input v-model="saveTemplateForm.isShared" type="checkbox" />
              Share with agencies
            </label>
            <small>Allow agencies to use this template</small>
          </div>

          <div class="form-group">
            <label>Include in Template:</label>
            <div class="include-fields">
              <div class="field-group">
                <label>
                  <input v-model="saveTemplateForm.includeFields.colors" type="checkbox" />
                  <strong>Colors</strong>
                </label>
                <div v-if="saveTemplateForm.includeFields.colors" class="nested-fields">
                  <label><input v-model="saveTemplateForm.includeFields.primaryColor" type="checkbox" /> Primary</label>
                  <label><input v-model="saveTemplateForm.includeFields.secondaryColor" type="checkbox" /> Secondary</label>
                  <label><input v-model="saveTemplateForm.includeFields.accentColor" type="checkbox" /> Accent</label>
                  <label><input v-model="saveTemplateForm.includeFields.successColor" type="checkbox" /> Success</label>
                  <label><input v-model="saveTemplateForm.includeFields.errorColor" type="checkbox" /> Error</label>
                  <label><input v-model="saveTemplateForm.includeFields.warningColor" type="checkbox" /> Warning</label>
                  <label><input v-model="saveTemplateForm.includeFields.backgroundColor" type="checkbox" /> Background</label>
                </div>
              </div>
              <div class="field-group">
                <label>
                  <input v-model="saveTemplateForm.includeFields.fonts" type="checkbox" />
                  <strong>Fonts</strong>
                </label>
                <div v-if="saveTemplateForm.includeFields.fonts" class="nested-fields">
                  <label><input v-model="saveTemplateForm.includeFields.headerFont" type="checkbox" /> Header</label>
                  <label><input v-model="saveTemplateForm.includeFields.bodyFont" type="checkbox" /> Body</label>
                  <label><input v-model="saveTemplateForm.includeFields.numericFont" type="checkbox" /> Numeric</label>
                  <label><input v-model="saveTemplateForm.includeFields.displayFont" type="checkbox" /> Display</label>
                </div>
              </div>
              <div class="field-group">
                <label>
                  <input v-model="saveTemplateForm.includeFields.icons" type="checkbox" />
                  <strong>Icons</strong>
                </label>
                <div v-if="saveTemplateForm.includeFields.icons" class="nested-fields">
                  <label><input v-model="saveTemplateForm.includeFields.manageAgenciesIcon" type="checkbox" /> Manage Agencies</label>
                  <label><input v-model="saveTemplateForm.includeFields.manageModulesIcon" type="checkbox" /> Manage Modules</label>
                  <label><input v-model="saveTemplateForm.includeFields.manageDocumentsIcon" type="checkbox" /> Manage Documents</label>
                  <label><input v-model="saveTemplateForm.includeFields.manageUsersIcon" type="checkbox" /> Manage Users</label>
                  <label><input v-model="saveTemplateForm.includeFields.platformSettingsIcon" type="checkbox" /> Platform Settings</label>
                  <label><input v-model="saveTemplateForm.includeFields.viewAllProgressIcon" type="checkbox" /> View All Progress</label>
                  <label><input v-model="saveTemplateForm.includeFields.progressDashboardIcon" type="checkbox" /> Progress Dashboard</label>
                  <label><input v-model="saveTemplateForm.includeFields.settingsIcon" type="checkbox" /> Settings</label>
                  <label><input v-model="saveTemplateForm.includeFields.masterBrandIcon" type="checkbox" /> Master Brand</label>
                  <label><input v-model="saveTemplateForm.includeFields.allAgenciesNotificationsIcon" type="checkbox" /> All Agencies Notifications</label>
                </div>
              </div>
              <div class="field-group">
                <label>
                  <input v-model="saveTemplateForm.includeFields.tagline" type="checkbox" />
                  <strong>Tagline</strong>
                </label>
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <div v-if="error" class="error-message" style="margin: 16px 0; padding: 12px; background: #fee; border: 1px solid #dc3545; border-radius: 6px; color: #dc3545;">
              {{ error }}
            </div>
            <button type="button" @click="showSaveTemplateModal = false" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="savingTemplate">
              {{ savingTemplate ? 'Creating...' : 'Create Template' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onActivated } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import IconSelector from './IconSelector.vue';
import FontSelector from '../FontSelector.vue';
import { useRouter } from 'vue-router';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const router = useRouter();

const availableTemplates = ref([]);
const selectedTemplateToApply = ref('');
const currentlyAppliedTemplate = ref(null); // Track which template is currently applied
const templateState = ref(null); // { platform, agency, effectiveTemplate }

const savingPlatform = ref(false);
const savingAgency = ref(false);
const downloadingTemplate = ref(false);
const restoringTemplate = ref(false);
const platformRestoreFileInputRef = ref(null);
const selectedBrandingScope = ref('platform');
const selectedAgencyForAdmin = ref(null);
const userAgencies = computed(() => agencyStore.userAgencies.length > 0 ? agencyStore.userAgencies : (agencyStore.agencies.length > 0 ? agencyStore.agencies : []));

const platformForm = ref({
  tagline: 'The gold standard for behavioral health workflows.',
  primaryColor: '#C69A2B',
  secondaryColor: '#1D2633',
  accentColor: '#3A4C6B',
  successColor: '#2F8F83',
  backgroundColor: '#F3F6FA',
  errorColor: '#CC3D3D',
  warningColor: '#E6A700',
  headerFont: 'Inter',
  bodyFont: 'Source Sans 3',
  numericFont: 'IBM Plex Mono',
  displayFont: 'Montserrat',
  peopleOpsTerm: 'People Operations',
  trainingFocusDefaultIconId: null,
  moduleDefaultIconId: null,
  userDefaultIconId: null,
  documentDefaultIconId: null,
  masterBrandIconId: null,
  // Dashboard action icons (platform defaults)
  progressDashboardIconId: null,
  manageAgenciesIconId: null,
  manageClientsIconId: null,
  schoolOverviewIconId: null,
  manageModulesIconId: null,
  manageDocumentsIconId: null,
  manageUsersIconId: null,
  settingsIconId: null,
  platformSettingsIconId: null,
  viewAllProgressIconId: null,
  dashboardNotificationsIconId: null,
  dashboardCommunicationsIconId: null,
  dashboardChatsIconId: null,
  dashboardPayrollIconId: null,
  dashboardBillingIconId: null,
      allAgenciesNotificationsIconId: null,
      externalCalendarAuditIconId: null,
      skillBuildersAvailabilityIconId: null,
      organizationName: null,
      organizationLogoIconId: null,
      organizationLogoUrl: null,
      organizationLogoPath: null,

  // Settings sidebar navigation icon defaults (replaces emojis)
  companyProfileIconId: null,
  teamRolesIconId: null,
  billingIconId: null,
  packagesIconId: null,
  checklistItemsIconId: null,
  fieldDefinitionsIconId: null,
  brandingTemplatesIconId: null,
  assetsIconId: null,
  communicationsIconId: null,
  integrationsIconId: null,
  archiveIconId: null
    });

const agencyBrandingForm = ref({
  logoUrl: '',
  primaryColor: '#0f172a',
  secondaryColor: '#1e40af',
  accentColor: '#f97316',
  certificateTemplateUrl: '',
  masterIconId: null,
  trainingFocusDefaultIconId: null,
  moduleDefaultIconId: null,
  userDefaultIconId: null,
  documentDefaultIconId: null,
  progressDashboardIconId: null,
  manageClientsIconId: null,
  manageModulesIconId: null,
  manageDocumentsIconId: null,
  manageUsersIconId: null,
  settingsIconId: null,
  platformSettingsIconId: null,
  externalCalendarAuditIconId: null,
  skillBuildersAvailabilityIconId: null,
  dashboardNotificationsIconId: null,
  dashboardCommunicationsIconId: null,
  dashboardChatsIconId: null,
  dashboardPayrollIconId: null,
  dashboardBillingIconId: null,

  // Settings sidebar navigation icon overrides (agency-level)
  companyProfileIconId: null,
  teamRolesIconId: null,
  billingIconId: null,
  packagesIconId: null,
  checklistItemsIconId: null,
  fieldDefinitionsIconId: null,
  brandingTemplatesIconId: null,
  assetsIconId: null,
  communicationsIconId: null,
  integrationsIconId: null,
  archiveIconId: null
});

const selectedAgency = computed(() => {
  if (selectedBrandingScope.value.startsWith('agency-')) {
    const agencyId = parseInt(selectedBrandingScope.value.replace('agency-', ''));
    return agencyStore.agencies.find(a => a.id === agencyId);
  }
  return null;
});

const saving = ref(false);
const error = ref('');
const logoError = ref(false);
const platformLogoFileInput = ref(null);
const uploadingPlatformLogo = ref(false);
const platformLogoInputMethod = ref('url'); // 'url' or 'upload'

const currentAgency = computed(() => agencyStore.currentAgency);

const brandingForm = ref({
  logoUrl: '',
  primaryColor: '#0f172a',
  secondaryColor: '#1e40af',
  accentColor: '#f97316',
  certificateTemplateUrl: '',
  trainingFocusDefaultIconId: null,
  moduleDefaultIconId: null,
  userDefaultIconId: null,
  documentDefaultIconId: null,
  progressDashboardIconId: null,
  manageClientsIconId: null,
  manageModulesIconId: null,
  manageDocumentsIconId: null,
  manageUsersIconId: null,
  settingsIconId: null,
  platformSettingsIconId: null,
  externalCalendarAuditIconId: null,
  skillBuildersAvailabilityIconId: null,
  dashboardNotificationsIconId: null,
  dashboardCommunicationsIconId: null,
  dashboardChatsIconId: null,
  dashboardPayrollIconId: null,
  dashboardBillingIconId: null,

  // Settings sidebar navigation icon overrides (agency-level)
  companyProfileIconId: null,
  teamRolesIconId: null,
  billingIconId: null,
  packagesIconId: null,
  checklistItemsIconId: null,
  fieldDefinitionsIconId: null,
  brandingTemplatesIconId: null,
  assetsIconId: null,
  communicationsIconId: null,
  integrationsIconId: null,
  archiveIconId: null
});

const primaryColor = computed(() => {
  if (currentAgency.value?.color_palette) {
    const palette = typeof currentAgency.value.color_palette === 'string'
      ? JSON.parse(currentAgency.value.color_palette)
      : currentAgency.value.color_palette;
    return palette.primary || brandingForm.value.primaryColor;
  }
  return brandingForm.value.primaryColor;
});

const secondaryColor = computed(() => {
  if (currentAgency.value?.color_palette) {
    const palette = typeof currentAgency.value.color_palette === 'string'
      ? JSON.parse(currentAgency.value.color_palette)
      : currentAgency.value.color_palette;
    return palette.secondary || brandingForm.value.secondaryColor;
  }
  return brandingForm.value.secondaryColor;
});

const accentColor = computed(() => {
  if (currentAgency.value?.color_palette) {
    const palette = typeof currentAgency.value.color_palette === 'string'
      ? JSON.parse(currentAgency.value.color_palette)
      : currentAgency.value.color_palette;
    return palette.accent || brandingForm.value.accentColor;
  }
  return brandingForm.value.accentColor;
});

watch(currentAgency, async (agency) => {
  if (agency) {
    // Fetch fresh agency data to ensure we have all fields including icon IDs
    try {
      const response = await api.get(`/agencies/${agency.id}`);
      const freshAgency = response.data;
      const palette = freshAgency.color_palette
        ? (typeof freshAgency.color_palette === 'string' ? JSON.parse(freshAgency.color_palette) : freshAgency.color_palette)
        : {};
      brandingForm.value = {
        logoUrl: freshAgency.logo_url || '',
        primaryColor: palette.primary || '#0f172a',
        secondaryColor: palette.secondary || '#1e40af',
        accentColor: palette.accent || '#f97316',
        certificateTemplateUrl: freshAgency.certificate_template_url || '',
        masterIconId: freshAgency.icon_id ?? null,
        trainingFocusDefaultIconId: freshAgency.training_focus_default_icon_id ?? null,
        moduleDefaultIconId: freshAgency.module_default_icon_id ?? null,
        userDefaultIconId: freshAgency.user_default_icon_id ?? null,
        documentDefaultIconId: freshAgency.document_default_icon_id ?? null,
        progressDashboardIconId: freshAgency.progress_dashboard_icon_id ?? null,
        manageModulesIconId: freshAgency.manage_modules_icon_id ?? null,
        manageDocumentsIconId: freshAgency.manage_documents_icon_id ?? null,
        manageUsersIconId: freshAgency.manage_users_icon_id ?? null,
        settingsIconId: freshAgency.settings_icon_id ?? null,
        platformSettingsIconId: freshAgency.platform_settings_icon_id ?? null,
        externalCalendarAuditIconId: freshAgency.external_calendar_audit_icon_id ?? null,
        skillBuildersAvailabilityIconId: freshAgency.skill_builders_availability_icon_id ?? null,

        companyProfileIconId: freshAgency.company_profile_icon_id ?? null,
        teamRolesIconId: freshAgency.team_roles_icon_id ?? null,
        billingIconId: freshAgency.billing_icon_id ?? null,
        packagesIconId: freshAgency.packages_icon_id ?? null,
        checklistItemsIconId: freshAgency.checklist_items_icon_id ?? null,
        fieldDefinitionsIconId: freshAgency.field_definitions_icon_id ?? null,
        brandingTemplatesIconId: freshAgency.branding_templates_icon_id ?? null,
        assetsIconId: freshAgency.assets_icon_id ?? null,
        communicationsIconId: freshAgency.communications_icon_id ?? null,
        integrationsIconId: freshAgency.integrations_icon_id ?? null,
        archiveIconId: freshAgency.archive_icon_id ?? null
      };
    } catch (err) {
      console.error('Failed to fetch fresh agency data:', err);
      // Fallback to using the agency data we have
      const palette = agency.color_palette
        ? (typeof agency.color_palette === 'string' ? JSON.parse(agency.color_palette) : agency.color_palette)
        : {};
      brandingForm.value = {
        logoUrl: agency.logo_url || '',
        primaryColor: palette.primary || '#0f172a',
        secondaryColor: palette.secondary || '#1e40af',
        accentColor: palette.accent || '#f97316',
        certificateTemplateUrl: agency.certificate_template_url || '',
        masterIconId: agency.icon_id ?? null,
        trainingFocusDefaultIconId: agency.training_focus_default_icon_id ?? null,
        moduleDefaultIconId: agency.module_default_icon_id ?? null,
        userDefaultIconId: agency.user_default_icon_id ?? null,
        documentDefaultIconId: agency.document_default_icon_id ?? null,
        progressDashboardIconId: agency.progress_dashboard_icon_id ?? null,
        manageClientsIconId: agency.manage_clients_icon_id ?? null,
        manageModulesIconId: agency.manage_modules_icon_id ?? null,
        manageDocumentsIconId: agency.manage_documents_icon_id ?? null,
        manageUsersIconId: agency.manage_users_icon_id ?? null,
        settingsIconId: agency.settings_icon_id ?? null,
        platformSettingsIconId: agency.platform_settings_icon_id ?? null,
        dashboardNotificationsIconId: agency.dashboard_notifications_icon_id ?? null,
        dashboardCommunicationsIconId: agency.dashboard_communications_icon_id ?? null,
        dashboardChatsIconId: agency.dashboard_chats_icon_id ?? null,
        dashboardPayrollIconId: agency.dashboard_payroll_icon_id ?? null,
        dashboardBillingIconId: agency.dashboard_billing_icon_id ?? null,

        companyProfileIconId: agency.company_profile_icon_id ?? null,
        teamRolesIconId: agency.team_roles_icon_id ?? null,
        billingIconId: agency.billing_icon_id ?? null,
        packagesIconId: agency.packages_icon_id ?? null,
        checklistItemsIconId: agency.checklist_items_icon_id ?? null,
        fieldDefinitionsIconId: agency.field_definitions_icon_id ?? null,
        brandingTemplatesIconId: agency.branding_templates_icon_id ?? null,
        assetsIconId: agency.assets_icon_id ?? null,
        communicationsIconId: agency.communications_icon_id ?? null,
        integrationsIconId: agency.integrations_icon_id ?? null,
        archiveIconId: agency.archive_icon_id ?? null
      };
    }
  }
}, { immediate: true });

const onBrandingScopeChange = async () => {
  if (selectedBrandingScope.value.startsWith('agency-')) {
    const agencyId = parseInt(selectedBrandingScope.value.replace('agency-', ''));
    try {
      const response = await api.get(`/agencies/${agencyId}`);
      const freshAgency = response.data;
      const palette = freshAgency.color_palette
        ? (typeof freshAgency.color_palette === 'string' ? JSON.parse(freshAgency.color_palette) : freshAgency.color_palette)
        : {};
      agencyBrandingForm.value = {
        logoUrl: freshAgency.logo_url || '',
        primaryColor: palette.primary || '#0f172a',
        secondaryColor: palette.secondary || '#1e40af',
        accentColor: palette.accent || '#f97316',
        certificateTemplateUrl: freshAgency.certificate_template_url || '',
        trainingFocusDefaultIconId: freshAgency.training_focus_default_icon_id ?? null,
        moduleDefaultIconId: freshAgency.module_default_icon_id ?? null,
        userDefaultIconId: freshAgency.user_default_icon_id ?? null,
        documentDefaultIconId: freshAgency.document_default_icon_id ?? null,
        progressDashboardIconId: freshAgency.progress_dashboard_icon_id ?? null,
        manageClientsIconId: freshAgency.manage_clients_icon_id ?? null,
        manageModulesIconId: freshAgency.manage_modules_icon_id ?? null,
        manageDocumentsIconId: freshAgency.manage_documents_icon_id ?? null,
        manageUsersIconId: freshAgency.manage_users_icon_id ?? null,
        settingsIconId: freshAgency.settings_icon_id ?? null,
        platformSettingsIconId: freshAgency.platform_settings_icon_id ?? null,
        externalCalendarAuditIconId: freshAgency.external_calendar_audit_icon_id ?? null,
        skillBuildersAvailabilityIconId: freshAgency.skill_builders_availability_icon_id ?? null,
        dashboardNotificationsIconId: freshAgency.dashboard_notifications_icon_id ?? null,
        dashboardCommunicationsIconId: freshAgency.dashboard_communications_icon_id ?? null,
        dashboardChatsIconId: freshAgency.dashboard_chats_icon_id ?? null,
        dashboardPayrollIconId: freshAgency.dashboard_payroll_icon_id ?? null,
        dashboardBillingIconId: freshAgency.dashboard_billing_icon_id ?? null,

        companyProfileIconId: freshAgency.company_profile_icon_id ?? null,
        teamRolesIconId: freshAgency.team_roles_icon_id ?? null,
        billingIconId: freshAgency.billing_icon_id ?? null,
        packagesIconId: freshAgency.packages_icon_id ?? null,
        checklistItemsIconId: freshAgency.checklist_items_icon_id ?? null,
        fieldDefinitionsIconId: freshAgency.field_definitions_icon_id ?? null,
        brandingTemplatesIconId: freshAgency.branding_templates_icon_id ?? null,
        assetsIconId: freshAgency.assets_icon_id ?? null,
        communicationsIconId: freshAgency.communications_icon_id ?? null,
        integrationsIconId: freshAgency.integrations_icon_id ?? null,
        archiveIconId: freshAgency.archive_icon_id ?? null
      };
    } catch (err) {
      console.error('Failed to fetch agency data:', err);
    }
  }
};

// Watch for changes to selectedBrandingScope to automatically load agency data
watch(selectedBrandingScope, async (newScope) => {
  // Clear applied template when scope changes (templates are scope-specific)
  currentlyAppliedTemplate.value = null;
  selectedTemplateToApply.value = '';
  
  await fetchAvailableTemplates();
  if (newScope.startsWith('agency-')) {
    await onBrandingScopeChange();
  }
}, { immediate: false });

const onAdminAgencyChange = async () => {
  if (selectedAgencyForAdmin.value) {
    try {
      const response = await api.get(`/agencies/${selectedAgencyForAdmin.value}`);
      const agency = response.data;
      agencyStore.setCurrentAgency(agency);
      // The watch on currentAgency will handle updating brandingForm
    } catch (err) {
      console.error('Failed to fetch agency:', err);
    }
  }
};

const saveAgencyBrandingForSuperAdmin = async () => {
  if (!selectedAgency.value) return;
  
  try {
    savingAgency.value = true;
    const requestData = {
      logoUrl: agencyBrandingForm.value.logoUrl?.trim() || null,
      colorPalette: {
        primary: agencyBrandingForm.value.primaryColor,
        secondary: agencyBrandingForm.value.secondaryColor,
        accent: agencyBrandingForm.value.accentColor
      },
      certificateTemplateUrl: agencyBrandingForm.value.certificateTemplateUrl?.trim() || null,
      iconId: agencyBrandingForm.value.masterIconId ?? null,
      trainingFocusDefaultIconId: agencyBrandingForm.value.trainingFocusDefaultIconId ?? null,
      moduleDefaultIconId: agencyBrandingForm.value.moduleDefaultIconId ?? null,
      userDefaultIconId: agencyBrandingForm.value.userDefaultIconId ?? null,
      documentDefaultIconId: agencyBrandingForm.value.documentDefaultIconId ?? null,
      progressDashboardIconId: agencyBrandingForm.value.progressDashboardIconId ?? null,
      manageClientsIconId: agencyBrandingForm.value.manageClientsIconId ?? null,
      manageModulesIconId: agencyBrandingForm.value.manageModulesIconId ?? null,
      manageDocumentsIconId: agencyBrandingForm.value.manageDocumentsIconId ?? null,
      manageUsersIconId: agencyBrandingForm.value.manageUsersIconId ?? null,
      settingsIconId: agencyBrandingForm.value.settingsIconId ?? null,
      platformSettingsIconId: agencyBrandingForm.value.platformSettingsIconId ?? null,
      externalCalendarAuditIconId: agencyBrandingForm.value.externalCalendarAuditIconId ?? null,
      skillBuildersAvailabilityIconId: agencyBrandingForm.value.skillBuildersAvailabilityIconId ?? null,
      dashboardNotificationsIconId: agencyBrandingForm.value.dashboardNotificationsIconId ?? null,
      dashboardCommunicationsIconId: agencyBrandingForm.value.dashboardCommunicationsIconId ?? null,
      dashboardChatsIconId: agencyBrandingForm.value.dashboardChatsIconId ?? null,
      dashboardPayrollIconId: agencyBrandingForm.value.dashboardPayrollIconId ?? null,
      dashboardBillingIconId: agencyBrandingForm.value.dashboardBillingIconId ?? null,

      // Settings sidebar navigation icon overrides
      companyProfileIconId: agencyBrandingForm.value.companyProfileIconId ?? null,
      teamRolesIconId: agencyBrandingForm.value.teamRolesIconId ?? null,
      billingIconId: agencyBrandingForm.value.billingIconId ?? null,
      packagesIconId: agencyBrandingForm.value.packagesIconId ?? null,
      checklistItemsIconId: agencyBrandingForm.value.checklistItemsIconId ?? null,
      fieldDefinitionsIconId: agencyBrandingForm.value.fieldDefinitionsIconId ?? null,
      brandingTemplatesIconId: agencyBrandingForm.value.brandingTemplatesIconId ?? null,
      assetsIconId: agencyBrandingForm.value.assetsIconId ?? null,
      communicationsIconId: agencyBrandingForm.value.communicationsIconId ?? null,
      integrationsIconId: agencyBrandingForm.value.integrationsIconId ?? null,
      archiveIconId: agencyBrandingForm.value.archiveIconId ?? null
    };
    
    console.log('Saving agency branding:', requestData);
    
    const response = await api.put(`/agencies/${selectedAgency.value.id}`, requestData);
    
    await agencyStore.fetchAgencies();
    
    // Update selected agency in the store if it's the one we just updated
    if (selectedAgency.value && selectedAgency.value.id === response.data.id) {
      try {
        const freshResponse = await api.get(`/agencies/${response.data.id}`);
        const freshAgency = freshResponse.data;
        const agencyIndex = agencyStore.agencies.findIndex(a => a.id === freshAgency.id);
        if (agencyIndex !== -1) {
          agencyStore.agencies[agencyIndex] = freshAgency;
        }
        // Update the form with fresh data
        const palette = freshAgency.color_palette
          ? (typeof freshAgency.color_palette === 'string' ? JSON.parse(freshAgency.color_palette) : freshAgency.color_palette)
          : {};
        agencyBrandingForm.value = {
          logoUrl: freshAgency.logo_url || '',
          primaryColor: palette.primary || '#0f172a',
          secondaryColor: palette.secondary || '#1e40af',
          accentColor: palette.accent || '#f97316',
          certificateTemplateUrl: freshAgency.certificate_template_url || '',
          masterIconId: freshAgency.icon_id ?? null,
          trainingFocusDefaultIconId: freshAgency.training_focus_default_icon_id ?? null,
          moduleDefaultIconId: freshAgency.module_default_icon_id ?? null,
          userDefaultIconId: freshAgency.user_default_icon_id ?? null,
          documentDefaultIconId: freshAgency.document_default_icon_id ?? null,
          progressDashboardIconId: freshAgency.progress_dashboard_icon_id ?? null,
          manageClientsIconId: freshAgency.manage_clients_icon_id ?? null,
          manageModulesIconId: freshAgency.manage_modules_icon_id ?? null,
          manageDocumentsIconId: freshAgency.manage_documents_icon_id ?? null,
          manageUsersIconId: freshAgency.manage_users_icon_id ?? null,
          settingsIconId: freshAgency.settings_icon_id ?? null,
          platformSettingsIconId: freshAgency.platform_settings_icon_id ?? null,
          externalCalendarAuditIconId: freshAgency.external_calendar_audit_icon_id ?? null,
          skillBuildersAvailabilityIconId: freshAgency.skill_builders_availability_icon_id ?? null,
          dashboardNotificationsIconId: freshAgency.dashboard_notifications_icon_id ?? null,
          dashboardCommunicationsIconId: freshAgency.dashboard_communications_icon_id ?? null,
          dashboardChatsIconId: freshAgency.dashboard_chats_icon_id ?? null,
          dashboardPayrollIconId: freshAgency.dashboard_payroll_icon_id ?? null,
          dashboardBillingIconId: freshAgency.dashboard_billing_icon_id ?? null,

          companyProfileIconId: freshAgency.company_profile_icon_id ?? null,
          teamRolesIconId: freshAgency.team_roles_icon_id ?? null,
          billingIconId: freshAgency.billing_icon_id ?? null,
          packagesIconId: freshAgency.packages_icon_id ?? null,
          checklistItemsIconId: freshAgency.checklist_items_icon_id ?? null,
          fieldDefinitionsIconId: freshAgency.field_definitions_icon_id ?? null,
          brandingTemplatesIconId: freshAgency.branding_templates_icon_id ?? null,
          assetsIconId: freshAgency.assets_icon_id ?? null,
          communicationsIconId: freshAgency.communications_icon_id ?? null,
          integrationsIconId: freshAgency.integrations_icon_id ?? null,
          archiveIconId: freshAgency.archive_icon_id ?? null
        };
      } catch (err) {
        console.error('Failed to refresh agency data:', err);
      }
    }
    
    alert('Agency branding updated successfully');
  } catch (err) {
    console.error('Error saving agency branding:', err);
    console.error('Error response:', err.response?.data);
    const errorMessage = err.response?.data?.error?.details || 
                         err.response?.data?.error?.message || 
                         'Failed to save agency branding';
    error.value = errorMessage;
    alert(`Error: ${errorMessage}`);
  } finally {
    savingAgency.value = false;
  }
};

const saveBranding = async () => {
  if (!currentAgency.value) return;
  
  try {
    saving.value = true;
    const response = await api.put(`/agencies/${currentAgency.value.id}`, {
      logoUrl: brandingForm.value.logoUrl,
      colorPalette: {
        primary: brandingForm.value.primaryColor,
        secondary: brandingForm.value.secondaryColor,
        accent: brandingForm.value.accentColor
      },
      certificateTemplateUrl: brandingForm.value.certificateTemplateUrl || null,
      trainingFocusDefaultIconId: brandingForm.value.trainingFocusDefaultIconId ?? null,
      moduleDefaultIconId: brandingForm.value.moduleDefaultIconId ?? null,
      userDefaultIconId: brandingForm.value.userDefaultIconId ?? null,
      documentDefaultIconId: brandingForm.value.documentDefaultIconId ?? null,
      progressDashboardIconId: brandingForm.value.progressDashboardIconId ?? null,
      manageClientsIconId: brandingForm.value.manageClientsIconId ?? null,
      manageModulesIconId: brandingForm.value.manageModulesIconId ?? null,
      manageDocumentsIconId: brandingForm.value.manageDocumentsIconId ?? null,
      manageUsersIconId: brandingForm.value.manageUsersIconId ?? null,
      settingsIconId: brandingForm.value.settingsIconId ?? null,
      platformSettingsIconId: brandingForm.value.platformSettingsIconId ?? null,
      externalCalendarAuditIconId: brandingForm.value.externalCalendarAuditIconId ?? null,
      skillBuildersAvailabilityIconId: brandingForm.value.skillBuildersAvailabilityIconId ?? null,
      dashboardNotificationsIconId: brandingForm.value.dashboardNotificationsIconId ?? null,
      dashboardCommunicationsIconId: brandingForm.value.dashboardCommunicationsIconId ?? null,
      dashboardChatsIconId: brandingForm.value.dashboardChatsIconId ?? null,
      dashboardPayrollIconId: brandingForm.value.dashboardPayrollIconId ?? null,
      dashboardBillingIconId: brandingForm.value.dashboardBillingIconId ?? null,

      // Settings sidebar navigation icon overrides
      companyProfileIconId: brandingForm.value.companyProfileIconId ?? null,
      teamRolesIconId: brandingForm.value.teamRolesIconId ?? null,
      billingIconId: brandingForm.value.billingIconId ?? null,
      packagesIconId: brandingForm.value.packagesIconId ?? null,
      checklistItemsIconId: brandingForm.value.checklistItemsIconId ?? null,
      fieldDefinitionsIconId: brandingForm.value.fieldDefinitionsIconId ?? null,
      brandingTemplatesIconId: brandingForm.value.brandingTemplatesIconId ?? null,
      assetsIconId: brandingForm.value.assetsIconId ?? null,
      communicationsIconId: brandingForm.value.communicationsIconId ?? null,
      integrationsIconId: brandingForm.value.integrationsIconId ?? null,
      archiveIconId: brandingForm.value.archiveIconId ?? null
    });
    
    // Refresh agency data
    await agencyStore.fetchAgencies();
    
    // Update currentAgency if it's the one we just updated
    const updatedAgency = response.data;
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
    
    alert('Branding updated successfully');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save branding';
  } finally {
    saving.value = false;
  }
};

const handleLogoError = () => {
  logoError.value = true;
};

const handlePlatformLogoFileSelect = async (event) => {
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
  
  uploadingPlatformLogo.value = true;
  error.value = '';
  
  try {
    const formData = new FormData();
    formData.append('logo', file);
    
    // Don't set Content-Type header - let the API interceptor handle it for FormData
    // This ensures cookies are sent properly for authentication
    const response = await api.post('/logos/upload', formData);
    
    if (response.data.success) {
      platformForm.value.organizationLogoPath = response.data.path;
      platformForm.value.organizationLogoUrl = ''; // Clear URL when using upload
      logoError.value = false;
    }
  } catch (err) {
    console.error('Error uploading logo:', err);
    error.value = err.response?.data?.error?.message || 'Failed to upload logo. Please try again.';
  } finally {
    uploadingPlatformLogo.value = false;
  }
};

const getLogoUrlFromPath = (logoPath) => {
  if (!logoPath) return null;
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
  // Accept "uploads/logos/..." or "/uploads/logos/..." or "logos/..."
  // Normalize to "/uploads/logos/..."
  let p = String(logoPath || '').trim();
  if (p.startsWith('/')) p = p.substring(1);
  if (p.startsWith('uploads/')) p = p.substring('uploads/'.length);
  return `${apiBase}/uploads/${p}`;
};

watch(() => brandingForm.value.logoUrl, () => {
  logoError.value = false;
});

const fetchAvailableTemplates = async () => {
  try {
    const params = {};
    if (authStore.user?.role === 'super_admin') {
      params.scope = selectedBrandingScope.value === 'platform' ? 'platform' : 'agency';
      if (selectedBrandingScope.value.startsWith('agency-')) {
        params.agencyId = parseInt(selectedBrandingScope.value.replace('agency-', ''));
      }
    } else if (authStore.user?.role === 'admin') {
      params.scope = 'agency';
      params.agencyId = authStore.user.agency_id;
      params.includeShared = 'true';
    }
    const response = await api.get('/branding-templates', { params });
    availableTemplates.value = response.data || [];
    
    // Load persisted template state (default/current/effective) for the selected scope
    await fetchTemplateState();
  } catch (err) {
    console.error('Failed to load templates:', err);
    availableTemplates.value = [];
  }
};

const getTemplateStateTarget = () => {
  if (authStore.user?.role === 'admin') {
    return { targetScope: 'agency', targetAgencyId: authStore.user?.agency_id || null };
  }
  if (authStore.user?.role === 'super_admin') {
    if (selectedBrandingScope.value.startsWith('agency-')) {
      return {
        targetScope: 'agency',
        targetAgencyId: parseInt(selectedBrandingScope.value.replace('agency-', ''), 10)
      };
    }
    return { targetScope: 'platform', targetAgencyId: null };
  }
  return { targetScope: 'platform', targetAgencyId: null };
};

const fetchTemplateState = async () => {
  try {
    const { targetScope, targetAgencyId } = getTemplateStateTarget();
    const res = await api.get('/branding-templates/state', { params: { targetScope, targetAgencyId } });
    templateState.value = res.data || null;

    const current =
      targetScope === 'platform'
        ? templateState.value?.platform?.currentTemplate
        : templateState.value?.agency?.currentTemplate;
    currentlyAppliedTemplate.value = current || null;
  } catch (e) {
    templateState.value = null;
    currentlyAppliedTemplate.value = null;
  }
};

const detectCurrentlyAppliedTemplate = async () => {
  if (selectedBrandingScope.value !== 'platform' || !availableTemplates.value.length) {
    return;
  }
  
  try {
    // Get current platform branding
    const currentBranding = brandingStore.platformBranding;
    if (!currentBranding) {
      return;
    }
    
    // Compare current branding with each template to find a match
    for (const template of availableTemplates.value) {
      if (template.scope !== 'platform') continue;
      
      const templateData = template.template_data || {};
      let matches = 0;
      let totalFields = 0;
      
      // Check colors
      if (templateData.primary_color !== undefined) {
        totalFields++;
        if (templateData.primary_color === currentBranding.primary_color) matches++;
      }
      if (templateData.secondary_color !== undefined) {
        totalFields++;
        if (templateData.secondary_color === currentBranding.secondary_color) matches++;
      }
      if (templateData.accent_color !== undefined) {
        totalFields++;
        if (templateData.accent_color === currentBranding.accent_color) matches++;
      }
      if (templateData.success_color !== undefined) {
        totalFields++;
        if (templateData.success_color === currentBranding.success_color) matches++;
      }
      if (templateData.error_color !== undefined) {
        totalFields++;
        if (templateData.error_color === currentBranding.error_color) matches++;
      }
      if (templateData.warning_color !== undefined) {
        totalFields++;
        if (templateData.warning_color === currentBranding.warning_color) matches++;
      }
      if (templateData.background_color !== undefined) {
        totalFields++;
        if (templateData.background_color === currentBranding.background_color) matches++;
      }
      
      // Check fonts
      if (templateData.header_font_id !== undefined) {
        totalFields++;
        if (templateData.header_font_id === currentBranding.header_font_id) matches++;
      } else if (templateData.header_font !== undefined) {
        totalFields++;
        if (templateData.header_font === currentBranding.header_font) matches++;
      }
      
      if (templateData.body_font_id !== undefined) {
        totalFields++;
        if (templateData.body_font_id === currentBranding.body_font_id) matches++;
      } else if (templateData.body_font !== undefined) {
        totalFields++;
        if (templateData.body_font === currentBranding.body_font) matches++;
      }
      
      // Check icons
      if (templateData.manage_agencies_icon_id !== undefined) {
        totalFields++;
        if (templateData.manage_agencies_icon_id === currentBranding.manage_agencies_icon_id) matches++;
      }
      if (templateData.manage_modules_icon_id !== undefined) {
        totalFields++;
        if (templateData.manage_modules_icon_id === currentBranding.manage_modules_icon_id) matches++;
      }
      if (templateData.manage_documents_icon_id !== undefined) {
        totalFields++;
        if (templateData.manage_documents_icon_id === currentBranding.manage_documents_icon_id) matches++;
      }
      if (templateData.manage_users_icon_id !== undefined) {
        totalFields++;
        if (templateData.manage_users_icon_id === currentBranding.manage_users_icon_id) matches++;
      }
      if (templateData.platform_settings_icon_id !== undefined) {
        totalFields++;
        if (templateData.platform_settings_icon_id === currentBranding.platform_settings_icon_id) matches++;
      }
      if (templateData.view_all_progress_icon_id !== undefined) {
        totalFields++;
        if (templateData.view_all_progress_icon_id === currentBranding.view_all_progress_icon_id) matches++;
      }
      if (templateData.progress_dashboard_icon_id !== undefined) {
        totalFields++;
        if (templateData.progress_dashboard_icon_id === currentBranding.progress_dashboard_icon_id) matches++;
      }
      if (templateData.settings_icon_id !== undefined) {
        totalFields++;
        if (templateData.settings_icon_id === currentBranding.settings_icon_id) matches++;
      }
      if (templateData.master_brand_icon_id !== undefined) {
        totalFields++;
        if (templateData.master_brand_icon_id === currentBranding.master_brand_icon_id) matches++;
      }
      if (templateData.all_agencies_notifications_icon_id !== undefined) {
        totalFields++;
        if (templateData.all_agencies_notifications_icon_id === currentBranding.all_agencies_notifications_icon_id) matches++;
      }
      
      // Check tagline
      if (templateData.tagline !== undefined) {
        totalFields++;
        if (templateData.tagline === currentBranding.tagline) matches++;
      }
      
      // If all fields in the template match the current branding, this is likely the applied template
      // We require at least 3 fields to match and 100% match rate to avoid false positives
      if (totalFields >= 3 && matches === totalFields) {
        currentlyAppliedTemplate.value = template;
        console.log(`Detected currently applied template: ${template.name} (${matches}/${totalFields} fields match)`);
        return;
      }
    }
    
    // If no template matches, clear the currently applied template
    if (currentlyAppliedTemplate.value) {
      console.log('No template matches current branding - clearing applied template');
      currentlyAppliedTemplate.value = null;
    }
  } catch (err) {
    console.error('Error detecting currently applied template:', err);
  }
};

const applySelectedTemplate = async (event) => {
  const templateId = event.target.value;
  if (!templateId) {
    currentlyAppliedTemplate.value = null; // Clear if no template selected
    return;
  }

  try {
    const template = availableTemplates.value.find(t => t.id === parseInt(templateId));
    if (!template) return;

    const targetScope = selectedBrandingScope.value === 'platform' ? 'platform' : 'agency';
    const targetAgencyId = selectedBrandingScope.value.startsWith('agency-') 
      ? parseInt(selectedBrandingScope.value.replace('agency-', ''))
      : (authStore.user?.role === 'admin' ? authStore.user.agency_id : null);

    const response = await api.post(`/branding-templates/${templateId}/apply`, {
      targetScope,
      targetAgencyId
    });

    // Track the currently applied template
    currentlyAppliedTemplate.value = template;
    
    alert('Template applied successfully!');
    
    // Reload branding data and refresh templates list
    await fetchAvailableTemplates();
    await fetchTemplateState();
    
    if (targetScope === 'platform') {
      // Force refresh platform branding
      await brandingStore.fetchPlatformBranding();
      if (brandingStore.platformBranding) {
        // Update form with fresh data from store
        platformForm.value = {
          tagline: brandingStore.platformBranding.tagline || '',
          primaryColor: brandingStore.platformBranding.primary_color || '',
          secondaryColor: brandingStore.platformBranding.secondary_color || '',
          accentColor: brandingStore.platformBranding.accent_color || '',
          successColor: brandingStore.platformBranding.success_color || '',
          backgroundColor: brandingStore.platformBranding.background_color || '',
          errorColor: brandingStore.platformBranding.error_color || '',
          warningColor: brandingStore.platformBranding.warning_color || '',
          headerFont: brandingStore.platformBranding.header_font || '',
          bodyFont: brandingStore.platformBranding.body_font || '',
          numericFont: brandingStore.platformBranding.numeric_font || '',
          displayFont: brandingStore.platformBranding.display_font || '',
          headerFontId: brandingStore.platformBranding.header_font_id ?? null,
          bodyFontId: brandingStore.platformBranding.body_font_id ?? null,
          numericFontId: brandingStore.platformBranding.numeric_font_id ?? null,
          displayFontId: brandingStore.platformBranding.display_font_id ?? null,
          peopleOpsTerm: brandingStore.platformBranding.people_ops_term || '',
          trainingFocusDefaultIconId: brandingStore.platformBranding.training_focus_default_icon_id ?? null,
          moduleDefaultIconId: brandingStore.platformBranding.module_default_icon_id ?? null,
          userDefaultIconId: brandingStore.platformBranding.user_default_icon_id ?? null,
          documentDefaultIconId: brandingStore.platformBranding.document_default_icon_id ?? null,
          masterBrandIconId: brandingStore.platformBranding.master_brand_icon_id ?? null,
          progressDashboardIconId: brandingStore.platformBranding.progress_dashboard_icon_id ?? null,
          manageAgenciesIconId: brandingStore.platformBranding.manage_agencies_icon_id ?? null,
          manageClientsIconId: brandingStore.platformBranding.manage_clients_icon_id ?? null,
          schoolOverviewIconId: brandingStore.platformBranding.school_overview_icon_id ?? null,
          manageModulesIconId: brandingStore.platformBranding.manage_modules_icon_id ?? null,
          manageDocumentsIconId: brandingStore.platformBranding.manage_documents_icon_id ?? null,
          manageUsersIconId: brandingStore.platformBranding.manage_users_icon_id ?? null,
          platformSettingsIconId: brandingStore.platformBranding.platform_settings_icon_id ?? null,
          viewAllProgressIconId: brandingStore.platformBranding.view_all_progress_icon_id ?? null,
          allAgenciesNotificationsIconId: brandingStore.platformBranding.all_agencies_notifications_icon_id ?? null,
        externalCalendarAuditIconId: brandingStore.platformBranding.external_calendar_audit_icon_id ?? null,
          skillBuildersAvailabilityIconId: brandingStore.platformBranding.skill_builders_availability_icon_id ?? null,
          settingsIconId: brandingStore.platformBranding.settings_icon_id ?? null,
          dashboardNotificationsIconId: brandingStore.platformBranding.dashboard_notifications_icon_id ?? null,
          dashboardCommunicationsIconId: brandingStore.platformBranding.dashboard_communications_icon_id ?? null,
          dashboardChatsIconId: brandingStore.platformBranding.dashboard_chats_icon_id ?? null,
          dashboardPayrollIconId: brandingStore.platformBranding.dashboard_payroll_icon_id ?? null,
          dashboardBillingIconId: brandingStore.platformBranding.dashboard_billing_icon_id ?? null,
          organizationName: brandingStore.platformBranding.organization_name ?? null,
          organizationLogoIconId: brandingStore.platformBranding.organization_logo_icon_id ?? null,
          organizationLogoUrl: brandingStore.platformBranding.organization_logo_url ?? null,
          organizationLogoPath: brandingStore.platformBranding.organization_logo_path ?? null,

          companyProfileIconId: brandingStore.platformBranding.company_profile_icon_id ?? null,
          teamRolesIconId: brandingStore.platformBranding.team_roles_icon_id ?? null,
          billingIconId: brandingStore.platformBranding.billing_icon_id ?? null,
          packagesIconId: brandingStore.platformBranding.packages_icon_id ?? null,
          checklistItemsIconId: brandingStore.platformBranding.checklist_items_icon_id ?? null,
          fieldDefinitionsIconId: brandingStore.platformBranding.field_definitions_icon_id ?? null,
          brandingTemplatesIconId: brandingStore.platformBranding.branding_templates_icon_id ?? null,
          assetsIconId: brandingStore.platformBranding.assets_icon_id ?? null,
          communicationsIconId: brandingStore.platformBranding.communications_icon_id ?? null,
          integrationsIconId: brandingStore.platformBranding.integrations_icon_id ?? null,
          archiveIconId: brandingStore.platformBranding.archive_icon_id ?? null
        };
        
        // Set logo input method based on what's available
        if (platformForm.value.organizationLogoPath) {
          platformLogoInputMethod.value = 'upload';
        } else if (platformForm.value.organizationLogoUrl) {
          platformLogoInputMethod.value = 'url';
        }
      }
      // Force a page reload to ensure all components see the updated branding
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else {
      // For agency templates, refresh agency data
      await agencyStore.fetchAgencies();
      if (targetAgencyId) {
        const agency = agencyStore.agencies.find(a => a.id === targetAgencyId);
        if (agency) {
          const palette = agency.color_palette
            ? (typeof agency.color_palette === 'string' ? JSON.parse(agency.color_palette) : agency.color_palette)
            : {};
          if (selectedBrandingScope.value.startsWith('agency-') && parseInt(selectedBrandingScope.value.replace('agency-', '')) === targetAgencyId) {
            agencyBrandingForm.value = {
              logoUrl: agency.logo_url || '',
              primaryColor: palette.primary || '#0f172a',
              secondaryColor: palette.secondary || '#1e40af',
              accentColor: palette.accent || '#f97316',
              certificateTemplateUrl: agency.certificate_template_url || '',
              masterIconId: agency.icon_id ?? null,
              trainingFocusDefaultIconId: agency.training_focus_default_icon_id ?? null,
              userDefaultIconId: agency.user_default_icon_id ?? null,
              documentDefaultIconId: agency.document_default_icon_id ?? null,
              progressDashboardIconId: agency.progress_dashboard_icon_id ?? null,
              manageModulesIconId: agency.manage_modules_icon_id ?? null,
              manageDocumentsIconId: agency.manage_documents_icon_id ?? null,
              manageUsersIconId: agency.manage_users_icon_id ?? null,
              settingsIconId: agency.settings_icon_id ?? null,
              platformSettingsIconId: agency.platform_settings_icon_id ?? null,
              externalCalendarAuditIconId: agency.external_calendar_audit_icon_id ?? null,
              skillBuildersAvailabilityIconId: agency.skill_builders_availability_icon_id ?? null,

              companyProfileIconId: agency.company_profile_icon_id ?? null,
              teamRolesIconId: agency.team_roles_icon_id ?? null,
              billingIconId: agency.billing_icon_id ?? null,
              packagesIconId: agency.packages_icon_id ?? null,
              checklistItemsIconId: agency.checklist_items_icon_id ?? null,
              fieldDefinitionsIconId: agency.field_definitions_icon_id ?? null,
              brandingTemplatesIconId: agency.branding_templates_icon_id ?? null,
              assetsIconId: agency.assets_icon_id ?? null,
              communicationsIconId: agency.communications_icon_id ?? null,
              integrationsIconId: agency.integrations_icon_id ?? null,
              archiveIconId: agency.archive_icon_id ?? null
            };
          } else if (currentAgency.value?.id === targetAgencyId) {
            brandingForm.value = {
              logoUrl: agency.logo_url || '',
              primaryColor: palette.primary || '#0f172a',
              secondaryColor: palette.secondary || '#1e40af',
              accentColor: palette.accent || '#f97316',
              certificateTemplateUrl: agency.certificate_template_url || '',
              masterIconId: agency.icon_id ?? null,
              trainingFocusDefaultIconId: agency.training_focus_default_icon_id ?? null,
              moduleDefaultIconId: agency.module_default_icon_id ?? null,
              userDefaultIconId: agency.user_default_icon_id ?? null,
              documentDefaultIconId: agency.document_default_icon_id ?? null,
              progressDashboardIconId: agency.progress_dashboard_icon_id ?? null,
              manageModulesIconId: agency.manage_modules_icon_id ?? null,
              manageDocumentsIconId: agency.manage_documents_icon_id ?? null,
              manageUsersIconId: agency.manage_users_icon_id ?? null,
              settingsIconId: agency.settings_icon_id ?? null,
              platformSettingsIconId: agency.platform_settings_icon_id ?? null,
              externalCalendarAuditIconId: agency.external_calendar_audit_icon_id ?? null,
              skillBuildersAvailabilityIconId: agency.skill_builders_availability_icon_id ?? null,

              companyProfileIconId: agency.company_profile_icon_id ?? null,
              teamRolesIconId: agency.team_roles_icon_id ?? null,
              billingIconId: agency.billing_icon_id ?? null,
              packagesIconId: agency.packages_icon_id ?? null,
              checklistItemsIconId: agency.checklist_items_icon_id ?? null,
              fieldDefinitionsIconId: agency.field_definitions_icon_id ?? null,
              brandingTemplatesIconId: agency.branding_templates_icon_id ?? null,
              assetsIconId: agency.assets_icon_id ?? null,
              communicationsIconId: agency.communications_icon_id ?? null,
              integrationsIconId: agency.integrations_icon_id ?? null,
              archiveIconId: agency.archive_icon_id ?? null
            };
          }
        }
      }
    }

    selectedTemplateToApply.value = '';
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to apply template');
    selectedTemplateToApply.value = '';
    currentlyAppliedTemplate.value = null; // Clear on error
  }
};

const clearAppliedTemplate = async () => {
  if (!confirm('Clear the currently active template selection? (This does not delete templates.)')) return;
  try {
    const { targetScope, targetAgencyId } = getTemplateStateTarget();
    await api.post('/branding-templates/clear-current', { targetScope, targetAgencyId });
    selectedTemplateToApply.value = '';
    await fetchTemplateState();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to clear current template');
  }
};

const setSelectedTemplateAsDefault = async () => {
  const templateId = selectedTemplateToApply.value ? parseInt(selectedTemplateToApply.value, 10) : null;
  if (!templateId) return;
  try {
    const { targetScope, targetAgencyId } = getTemplateStateTarget();
    await api.post(`/branding-templates/${templateId}/set-default`, { targetScope, targetAgencyId });
    await fetchTemplateState();
    alert('Default template set.');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to set default template');
  }
};

const showSaveTemplateModal = ref(false);
const saveTemplateForm = ref({
  name: '',
  description: '',
  isShared: false,
  includeFields: {
    colors: true,
    primaryColor: true,
    secondaryColor: true,
    accentColor: true,
    successColor: true,
    errorColor: true,
    warningColor: true,
    backgroundColor: true,
    fonts: false,
    headerFont: true,
    bodyFont: true,
    numericFont: true,
    displayFont: true,
    icons: false,
    manageAgenciesIcon: true,
    manageModulesIcon: true,
    manageDocumentsIcon: true,
    manageUsersIcon: true,
    platformSettingsIcon: true,
    viewAllProgressIcon: true,
    progressDashboardIcon: true,
    settingsIcon: true,
    masterBrandIcon: true,
    allAgenciesNotificationsIcon: true,
    tagline: false,
    terminology: false
  }
});
const savingTemplate = ref(false);

const saveAsTemplate = () => {
  // Determine scope based on current view
  if (authStore.user?.role === 'super_admin' && selectedBrandingScope.value === 'platform') {
    saveTemplateForm.value.name = `Platform Template - ${new Date().toLocaleDateString()}`;
  } else if (authStore.user?.role === 'super_admin' && selectedBrandingScope.value.startsWith('agency-')) {
    const agencyId = parseInt(selectedBrandingScope.value.replace('agency-', ''));
    const agency = agencyStore.agencies.find(a => a.id === agencyId);
    saveTemplateForm.value.name = agency ? `${agency.name} Template - ${new Date().toLocaleDateString()}` : `Agency Template - ${new Date().toLocaleDateString()}`;
  } else if (authStore.user?.role === 'admin') {
    saveTemplateForm.value.name = currentAgency.value ? `${currentAgency.value.name} Template - ${new Date().toLocaleDateString()}` : `Agency Template - ${new Date().toLocaleDateString()}`;
  }
  showSaveTemplateModal.value = true;
};

const createTemplateFromCurrent = async () => {
  try {
    savingTemplate.value = true;
    error.value = '';

    // Validate required fields
    if (!saveTemplateForm.value.name || !saveTemplateForm.value.name.trim()) {
      error.value = 'Template name is required';
      alert('Template name is required');
      savingTemplate.value = false;
      return;
    }

    const scope = (authStore.user?.role === 'super_admin' && selectedBrandingScope.value === 'platform') ? 'platform' : 'agency';
    const agencyId = scope === 'agency' 
      ? (selectedBrandingScope.value.startsWith('agency-') 
          ? parseInt(selectedBrandingScope.value.replace('agency-', ''))
          : (authStore.user?.role === 'admin' ? authStore.user.agency_id : null))
      : null;

    const templateData = {
      name: saveTemplateForm.value.name.trim(),
      description: saveTemplateForm.value.description?.trim() || null,
      scope,
      agencyId,
      isShared: scope === 'platform' ? saveTemplateForm.value.isShared : false,
      includeFields: saveTemplateForm.value.includeFields
    };

    console.log('Creating template from current branding with data:', templateData);

    const response = await api.post('/branding-templates', templateData);
    console.log('Template created:', response.data);
    
    alert('Template created successfully!');
    showSaveTemplateModal.value = false;

    // If no default template is set yet for this scope, make this template the default (and current if empty).
    try {
      const newId = response.data?.id;
      if (newId) {
        await fetchTemplateState();
        const { targetScope, targetAgencyId } = getTemplateStateTarget();
        const hasDefault =
          targetScope === 'platform'
            ? !!templateState.value?.platform?.defaultTemplate
            : !!templateState.value?.agency?.defaultTemplate;
        if (!hasDefault) {
          await api.post(`/branding-templates/${newId}/set-default`, { targetScope, targetAgencyId });
          await fetchTemplateState();
        }
      }
    } catch {
      // best effort
    }
    
    // Reset form
    saveTemplateForm.value = {
      name: '',
      description: '',
      isShared: false,
      includeFields: {
        colors: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        successColor: true,
        errorColor: true,
        warningColor: true,
        backgroundColor: true,
        fonts: false,
        headerFont: true,
        bodyFont: true,
        numericFont: true,
        displayFont: true,
        icons: false,
        manageAgenciesIcon: true,
        manageModulesIcon: true,
        manageDocumentsIcon: true,
        manageUsersIcon: true,
        platformSettingsIcon: true,
        viewAllProgressIcon: true,
        progressDashboardIcon: true,
        settingsIcon: true,
        masterBrandIcon: true,
        allAgenciesNotificationsIcon: true,
        tagline: false,
        terminology: false
      }
    };
    
    // Refresh templates list
    await fetchAvailableTemplates();
  } catch (err) {
    console.error('Error creating template:', err);
    console.error('Error response:', err.response);
    console.error('Error response data:', err.response?.data);
    const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to create template';
    error.value = errorMessage;
    alert(`Failed to create template: ${errorMessage}`);
    alert(error.value);
  } finally {
    savingTemplate.value = false;
  }
};

const downloadPlatformTemplate = async () => {
  try {
    downloadingTemplate.value = true;
    const response = await api.get('/platform-branding');
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `platform-branding-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error downloading platform template:', err);
    alert(err?.response?.data?.error?.message || 'Failed to download platform template');
  } finally {
    downloadingTemplate.value = false;
  }
};

const onPlatformRestoreFileSelected = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = '';
  try {
    restoringTemplate.value = true;
    const text = await file.text();
    const data = JSON.parse(text);
    await api.post('/platform-branding/restore', data);
    await brandingStore.fetchPlatformBranding(true);
    if (brandingStore.platformBranding) {
      platformForm.value.progressDashboardIconId = brandingStore.platformBranding.progress_dashboard_icon_id ?? null;
      platformForm.value.settingsIconId = brandingStore.platformBranding.settings_icon_id ?? null;
      platformForm.value.dashboardNotificationsIconId = brandingStore.platformBranding.dashboard_notifications_icon_id ?? null;
      platformForm.value.dashboardCommunicationsIconId = brandingStore.platformBranding.dashboard_communications_icon_id ?? null;
      platformForm.value.dashboardChatsIconId = brandingStore.platformBranding.dashboard_chats_icon_id ?? null;
      platformForm.value.dashboardPayrollIconId = brandingStore.platformBranding.dashboard_payroll_icon_id ?? null;
      platformForm.value.dashboardBillingIconId = brandingStore.platformBranding.dashboard_billing_icon_id ?? null;
      platformForm.value.manageAgenciesIconId = brandingStore.platformBranding.manage_agencies_icon_id ?? null;
      platformForm.value.manageClientsIconId = brandingStore.platformBranding.manage_clients_icon_id ?? null;
      platformForm.value.schoolOverviewIconId = brandingStore.platformBranding.school_overview_icon_id ?? null;
      platformForm.value.manageModulesIconId = brandingStore.platformBranding.manage_modules_icon_id ?? null;
      platformForm.value.manageDocumentsIconId = brandingStore.platformBranding.manage_documents_icon_id ?? null;
      platformForm.value.manageUsersIconId = brandingStore.platformBranding.manage_users_icon_id ?? null;
      platformForm.value.platformSettingsIconId = brandingStore.platformBranding.platform_settings_icon_id ?? null;
      platformForm.value.viewAllProgressIconId = brandingStore.platformBranding.view_all_progress_icon_id ?? null;
      platformForm.value.allAgenciesNotificationsIconId = brandingStore.platformBranding.all_agencies_notifications_icon_id ?? null;
      platformForm.value.externalCalendarAuditIconId = brandingStore.platformBranding.external_calendar_audit_icon_id ?? null;
      platformForm.value.skillBuildersAvailabilityIconId = brandingStore.platformBranding.skill_builders_availability_icon_id ?? null;
      platformForm.value.tagline = brandingStore.platformBranding.tagline ?? platformForm.value.tagline;
      platformForm.value.primaryColor = brandingStore.platformBranding.primary_color ?? platformForm.value.primaryColor;
      platformForm.value.secondaryColor = brandingStore.platformBranding.secondary_color ?? platformForm.value.secondaryColor;
      platformForm.value.accentColor = brandingStore.platformBranding.accent_color ?? platformForm.value.accentColor;
      platformForm.value.successColor = brandingStore.platformBranding.success_color ?? platformForm.value.successColor;
      platformForm.value.backgroundColor = brandingStore.platformBranding.background_color ?? platformForm.value.backgroundColor;
      platformForm.value.errorColor = brandingStore.platformBranding.error_color ?? platformForm.value.errorColor;
      platformForm.value.warningColor = brandingStore.platformBranding.warning_color ?? platformForm.value.warningColor;
      platformForm.value.peopleOpsTerm = brandingStore.platformBranding.people_ops_term ?? platformForm.value.peopleOpsTerm;
    }
    alert('Platform branding restored successfully');
  } catch (err) {
    console.error('Error restoring platform template:', err);
    alert(err?.response?.data?.error?.message || 'Failed to restore platform template. Make sure the file is a valid platform branding backup.');
  } finally {
    restoringTemplate.value = false;
  }
};

const savePlatformBranding = async () => {
  try {
    savingPlatform.value = true;
    error.value = '';
    
    // Include all required fields that the backend expects
    const brandingData = {
      tagline: platformForm.value.tagline || 'The gold standard for behavioral health workflows.',
      primaryColor: platformForm.value.primaryColor || '#C69A2B',
      secondaryColor: platformForm.value.secondaryColor || '#1D2633',
      accentColor: platformForm.value.accentColor || '#3A4C6B',
      successColor: platformForm.value.successColor || '#2F8F83',
      backgroundColor: platformForm.value.backgroundColor || '#F3F6FA',
      errorColor: platformForm.value.errorColor || '#CC3D3D',
      warningColor: platformForm.value.warningColor || '#E6A700',
      headerFont: platformForm.value.headerFont || 'Inter',
      bodyFont: platformForm.value.bodyFont || 'Source Sans 3',
      numericFont: platformForm.value.numericFont || 'IBM Plex Mono',
      displayFont: platformForm.value.displayFont || 'Montserrat',
      headerFontId: platformForm.value.headerFontId ?? null,
      bodyFontId: platformForm.value.bodyFontId ?? null,
      numericFontId: platformForm.value.numericFontId ?? null,
      displayFontId: platformForm.value.displayFontId ?? null,
      peopleOpsTerm: platformForm.value.peopleOpsTerm?.trim() || null,
      trainingFocusDefaultIconId: platformForm.value.trainingFocusDefaultIconId ?? null,
      moduleDefaultIconId: platformForm.value.moduleDefaultIconId ?? null,
      userDefaultIconId: platformForm.value.userDefaultIconId ?? null,
      documentDefaultIconId: platformForm.value.documentDefaultIconId ?? null,
      masterBrandIconId: platformForm.value.masterBrandIconId ?? null,
      progressDashboardIconId: platformForm.value.progressDashboardIconId ?? null,
      manageAgenciesIconId: platformForm.value.manageAgenciesIconId ?? null,
      manageClientsIconId: platformForm.value.manageClientsIconId ?? null,
      schoolOverviewIconId: platformForm.value.schoolOverviewIconId ?? null,
      manageModulesIconId: platformForm.value.manageModulesIconId ?? null,
      manageDocumentsIconId: platformForm.value.manageDocumentsIconId ?? null,
      manageUsersIconId: platformForm.value.manageUsersIconId ?? null,
      platformSettingsIconId: platformForm.value.platformSettingsIconId ?? null,
      viewAllProgressIconId: platformForm.value.viewAllProgressIconId ?? null,
      settingsIconId: platformForm.value.settingsIconId ?? null,
      dashboardNotificationsIconId: platformForm.value.dashboardNotificationsIconId ?? null,
      dashboardCommunicationsIconId: platformForm.value.dashboardCommunicationsIconId ?? null,
      dashboardChatsIconId: platformForm.value.dashboardChatsIconId ?? null,
      dashboardPayrollIconId: platformForm.value.dashboardPayrollIconId ?? null,
      dashboardBillingIconId: platformForm.value.dashboardBillingIconId ?? null,
      allAgenciesNotificationsIconId: platformForm.value.allAgenciesNotificationsIconId ?? null,
      externalCalendarAuditIconId: platformForm.value.externalCalendarAuditIconId ?? null,
      skillBuildersAvailabilityIconId: platformForm.value.skillBuildersAvailabilityIconId ?? null,
      organizationName: platformForm.value.organizationName?.trim() || null,
      organizationLogoIconId: platformForm.value.organizationLogoIconId ?? null,
      organizationLogoUrl: platformLogoInputMethod.value === 'url' ? (platformForm.value.organizationLogoUrl?.trim() || null) : null,
      organizationLogoPath: platformLogoInputMethod.value === 'upload' ? (platformForm.value.organizationLogoPath || null) : null,

      // Settings sidebar navigation icon defaults
      companyProfileIconId: platformForm.value.companyProfileIconId ?? null,
      teamRolesIconId: platformForm.value.teamRolesIconId ?? null,
      billingIconId: platformForm.value.billingIconId ?? null,
      packagesIconId: platformForm.value.packagesIconId ?? null,
      checklistItemsIconId: platformForm.value.checklistItemsIconId ?? null,
      fieldDefinitionsIconId: platformForm.value.fieldDefinitionsIconId ?? null,
      brandingTemplatesIconId: platformForm.value.brandingTemplatesIconId ?? null,
      assetsIconId: platformForm.value.assetsIconId ?? null,
      communicationsIconId: platformForm.value.communicationsIconId ?? null,
      integrationsIconId: platformForm.value.integrationsIconId ?? null,
      archiveIconId: platformForm.value.archiveIconId ?? null
    };
    
    const response = await api.put('/platform-branding', brandingData);
    // Immediately update local store from the server response, then force-refresh with cache-busting.
    // This avoids stale platformBranding state and ensures icon prefetch runs for *_icon_id fallbacks.
    await brandingStore.setPlatformBrandingFromResponse(response.data);
    await brandingStore.fetchPlatformBranding(true);
    
    // If a template is currently applied, update it with the new branding values
    if (currentlyAppliedTemplate.value && selectedBrandingScope.value === 'platform') {
      let includeFields = null; // Declare outside try block for error logging
      try {
        // Extract includeFields from the template's template_data
        const templateData = currentlyAppliedTemplate.value.template_data || {};
        
        // Helper to check if a property exists (handles null/undefined values)
        const hasProperty = (obj, prop) => obj != null && Object.prototype.hasOwnProperty.call(obj, prop);
        
        includeFields = {
          colors: !!(templateData.primary_color || templateData.secondary_color || templateData.accent_color || 
                     templateData.success_color || templateData.error_color || templateData.warning_color || 
                     templateData.background_color),
          primaryColor: hasProperty(templateData, 'primary_color'),
          secondaryColor: hasProperty(templateData, 'secondary_color'),
          accentColor: hasProperty(templateData, 'accent_color'),
          successColor: hasProperty(templateData, 'success_color'),
          errorColor: hasProperty(templateData, 'error_color'),
          warningColor: hasProperty(templateData, 'warning_color'),
          backgroundColor: hasProperty(templateData, 'background_color'),
    // Fonts will be reloaded automatically via fetchPlatformBranding
          fonts: !!(templateData.header_font_id || templateData.header_font || templateData.body_font_id || 
                    templateData.body_font || templateData.numeric_font_id || templateData.numeric_font || 
                    templateData.display_font_id || templateData.display_font),
          headerFont: hasProperty(templateData, 'header_font_id') || hasProperty(templateData, 'header_font'),
          bodyFont: hasProperty(templateData, 'body_font_id') || hasProperty(templateData, 'body_font'),
          numericFont: hasProperty(templateData, 'numeric_font_id') || hasProperty(templateData, 'numeric_font'),
          displayFont: hasProperty(templateData, 'display_font_id') || hasProperty(templateData, 'display_font'),
          // Check if icons were included - if any icon field exists in template_data (even if null), icons were included
          icons: !!(hasProperty(templateData, 'manage_agencies_icon_id') || 
                    hasProperty(templateData, 'manage_modules_icon_id') || 
                    hasProperty(templateData, 'manage_documents_icon_id') || 
                    hasProperty(templateData, 'manage_users_icon_id') || 
                    hasProperty(templateData, 'platform_settings_icon_id') || 
                    hasProperty(templateData, 'view_all_progress_icon_id') || 
                    hasProperty(templateData, 'progress_dashboard_icon_id') || 
                    hasProperty(templateData, 'settings_icon_id') || 
                    hasProperty(templateData, 'master_brand_icon_id') || 
                    hasProperty(templateData, 'all_agencies_notifications_icon_id')),
          // For individual icons, check if the field exists in template_data (not just if it has a value)
          manageAgenciesIcon: hasProperty(templateData, 'manage_agencies_icon_id'),
          manageModulesIcon: hasProperty(templateData, 'manage_modules_icon_id'),
          manageDocumentsIcon: hasProperty(templateData, 'manage_documents_icon_id'),
          manageUsersIcon: hasProperty(templateData, 'manage_users_icon_id'),
          platformSettingsIcon: hasProperty(templateData, 'platform_settings_icon_id'),
          viewAllProgressIcon: hasProperty(templateData, 'view_all_progress_icon_id'),
          progressDashboardIcon: hasProperty(templateData, 'progress_dashboard_icon_id'),
          settingsIcon: hasProperty(templateData, 'settings_icon_id'),
          masterBrandIcon: hasProperty(templateData, 'master_brand_icon_id'),
          allAgenciesNotificationsIcon: hasProperty(templateData, 'all_agencies_notifications_icon_id'),
          tagline: hasProperty(templateData, 'tagline'),
          terminology: hasProperty(templateData, 'people_ops_term')
        };
        
        // Update the template with the new branding data using the same includeFields
        console.log('Updating template with includeFields:', includeFields);
        const updatePayload = {
          name: currentlyAppliedTemplate.value.name?.trim() || '',
          description: currentlyAppliedTemplate.value.description?.trim() || null,
          scope: currentlyAppliedTemplate.value.scope,
          isShared: Boolean(currentlyAppliedTemplate.value.is_shared),
          includeFields
        };
        console.log('Update payload:', JSON.stringify(updatePayload, null, 2));
        const updateResponse = await api.put(`/branding-templates/${currentlyAppliedTemplate.value.id}`, updatePayload);
        
        // Refresh the template list to get updated template
        await fetchAvailableTemplates();
        const updatedTemplate = availableTemplates.value.find(t => t.id === currentlyAppliedTemplate.value.id);
        if (updatedTemplate) {
          currentlyAppliedTemplate.value = updatedTemplate;
        }
      } catch (err) {
        console.error('Failed to update template:', err);
        console.error('Error response:', JSON.stringify(err.response?.data, null, 2));
        console.error('Error message:', err.response?.data?.error?.message);
        console.error('Validation errors:', err.response?.data?.error?.errors);
        if (includeFields) {
          console.error('IncludeFields sent:', JSON.stringify(includeFields, null, 2));
        }
        // Don't show error to user - template update is secondary to branding save
      }
    }
    
    alert('Platform branding saved' + (currentlyAppliedTemplate.value ? ` and template "${currentlyAppliedTemplate.value.name}" updated` : '') + '!');
    
    // Update the form with the response data to ensure icon IDs are set correctly
    console.log('💾 Saving platform branding with data:', {
      trainingFocusDefaultIconId: platformForm.value.trainingFocusDefaultIconId,
      moduleDefaultIconId: platformForm.value.moduleDefaultIconId,
      userDefaultIconId: platformForm.value.userDefaultIconId,
      documentDefaultIconId: platformForm.value.documentDefaultIconId,
      masterBrandIconId: platformForm.value.masterBrandIconId,
      manageAgenciesIconId: platformForm.value.manageAgenciesIconId,
      manageModulesIconId: platformForm.value.manageModulesIconId,
      manageDocumentsIconId: platformForm.value.manageDocumentsIconId,
      manageUsersIconId: platformForm.value.manageUsersIconId,
      platformSettingsIconId: platformForm.value.platformSettingsIconId,
      viewAllProgressIconId: platformForm.value.viewAllProgressIconId
    });
    console.log('Response data keys:', Object.keys(response.data || {}));
    console.log('Response dashboard icon IDs:', {
      manage_agencies: response.data?.manage_agencies_icon_id,
      manage_modules: response.data?.manage_modules_icon_id,
      manage_documents: response.data?.manage_documents_icon_id,
      manage_users: response.data?.manage_users_icon_id,
      platform_settings: response.data?.platform_settings_icon_id,
      view_all_progress: response.data?.view_all_progress_icon_id
    });
    console.log('Response dashboard icon paths:', {
      manage_agencies: response.data?.manage_agencies_icon_path,
      manage_modules: response.data?.manage_modules_icon_path,
      manage_documents: response.data?.manage_documents_icon_path,
      manage_users: response.data?.manage_users_icon_path,
      platform_settings: response.data?.platform_settings_icon_path,
      view_all_progress: response.data?.view_all_progress_icon_path
    });
    
    if (response.data) {
      // Use nullish coalescing (??) instead of || to preserve 0 and false values
      platformForm.value.trainingFocusDefaultIconId = response.data.training_focus_default_icon_id ?? platformForm.value.trainingFocusDefaultIconId ?? null;
      platformForm.value.moduleDefaultIconId = response.data.module_default_icon_id ?? platformForm.value.moduleDefaultIconId ?? null;
      platformForm.value.userDefaultIconId = response.data.user_default_icon_id ?? platformForm.value.userDefaultIconId ?? null;
      platformForm.value.documentDefaultIconId = response.data.document_default_icon_id ?? platformForm.value.documentDefaultIconId ?? null;
      platformForm.value.masterBrandIconId = response.data.master_brand_icon_id ?? platformForm.value.masterBrandIconId ?? null;
      platformForm.value.progressDashboardIconId = response.data.progress_dashboard_icon_id ?? platformForm.value.progressDashboardIconId ?? null;
      platformForm.value.manageAgenciesIconId = response.data.manage_agencies_icon_id ?? platformForm.value.manageAgenciesIconId ?? null;
      platformForm.value.manageClientsIconId = response.data.manage_clients_icon_id ?? platformForm.value.manageClientsIconId ?? null;
      platformForm.value.schoolOverviewIconId = response.data.school_overview_icon_id ?? platformForm.value.schoolOverviewIconId ?? null;
      platformForm.value.manageModulesIconId = response.data.manage_modules_icon_id ?? platformForm.value.manageModulesIconId ?? null;
      platformForm.value.manageDocumentsIconId = response.data.manage_documents_icon_id ?? platformForm.value.manageDocumentsIconId ?? null;
      platformForm.value.manageUsersIconId = response.data.manage_users_icon_id ?? platformForm.value.manageUsersIconId ?? null;
      platformForm.value.settingsIconId = response.data.settings_icon_id ?? platformForm.value.settingsIconId ?? null;
      platformForm.value.platformSettingsIconId = response.data.platform_settings_icon_id ?? platformForm.value.platformSettingsIconId ?? null;
      platformForm.value.viewAllProgressIconId = response.data.view_all_progress_icon_id ?? platformForm.value.viewAllProgressIconId ?? null;
      platformForm.value.dashboardNotificationsIconId = response.data.dashboard_notifications_icon_id ?? platformForm.value.dashboardNotificationsIconId ?? null;
      platformForm.value.dashboardCommunicationsIconId = response.data.dashboard_communications_icon_id ?? platformForm.value.dashboardCommunicationsIconId ?? null;
      platformForm.value.dashboardChatsIconId = response.data.dashboard_chats_icon_id ?? platformForm.value.dashboardChatsIconId ?? null;
      platformForm.value.dashboardPayrollIconId = response.data.dashboard_payroll_icon_id ?? platformForm.value.dashboardPayrollIconId ?? null;
      platformForm.value.dashboardBillingIconId = response.data.dashboard_billing_icon_id ?? platformForm.value.dashboardBillingIconId ?? null;
      platformForm.value.allAgenciesNotificationsIconId = response.data.all_agencies_notifications_icon_id ?? platformForm.value.allAgenciesNotificationsIconId ?? null;
      platformForm.value.externalCalendarAuditIconId = response.data.external_calendar_audit_icon_id ?? platformForm.value.externalCalendarAuditIconId ?? null;
      platformForm.value.organizationName = response.data.organization_name ?? platformForm.value.organizationName ?? null;
      platformForm.value.organizationLogoIconId = response.data.organization_logo_icon_id ?? platformForm.value.organizationLogoIconId ?? null;
      platformForm.value.organizationLogoUrl = response.data.organization_logo_url ?? platformForm.value.organizationLogoUrl ?? null;
      platformForm.value.organizationLogoPath = response.data.organization_logo_path ?? platformForm.value.organizationLogoPath ?? null;

      // Update other fields
      platformForm.value.tagline = response.data.tagline ?? platformForm.value.tagline;
      platformForm.value.primaryColor = response.data.primary_color ?? platformForm.value.primaryColor;
      platformForm.value.secondaryColor = response.data.secondary_color ?? platformForm.value.secondaryColor;
      platformForm.value.accentColor = response.data.accent_color ?? platformForm.value.accentColor;
      platformForm.value.successColor = response.data.success_color ?? platformForm.value.successColor;
      platformForm.value.backgroundColor = response.data.background_color ?? platformForm.value.backgroundColor;
      platformForm.value.errorColor = response.data.error_color ?? platformForm.value.errorColor;
      platformForm.value.warningColor = response.data.warning_color ?? platformForm.value.warningColor;
      platformForm.value.headerFont = response.data.header_font ?? platformForm.value.headerFont;
      platformForm.value.bodyFont = response.data.body_font ?? platformForm.value.bodyFont;
      platformForm.value.numericFont = response.data.numeric_font ?? platformForm.value.numericFont;
      platformForm.value.displayFont = response.data.display_font ?? platformForm.value.displayFont;
      platformForm.value.headerFontId = response.data.header_font_id ?? null;
      platformForm.value.bodyFontId = response.data.body_font_id ?? null;
      platformForm.value.numericFontId = response.data.numeric_font_id ?? null;
      platformForm.value.displayFontId = response.data.display_font_id ?? null;
      platformForm.value.peopleOpsTerm = response.data.people_ops_term ?? platformForm.value.peopleOpsTerm;
    } else if (brandingStore.platformBranding) {
      // Fallback to store data if response doesn't have it
      platformForm.value.trainingFocusDefaultIconId = brandingStore.platformBranding.training_focus_default_icon_id ?? null;
      platformForm.value.moduleDefaultIconId = brandingStore.platformBranding.module_default_icon_id ?? null;
      platformForm.value.userDefaultIconId = brandingStore.platformBranding.user_default_icon_id ?? null;
      platformForm.value.documentDefaultIconId = brandingStore.platformBranding.document_default_icon_id ?? null;
      platformForm.value.masterBrandIconId = brandingStore.platformBranding.master_brand_icon_id ?? null;
      platformForm.value.manageAgenciesIconId = brandingStore.platformBranding.manage_agencies_icon_id ?? null;
      platformForm.value.manageClientsIconId = brandingStore.platformBranding.manage_clients_icon_id ?? null;
      platformForm.value.schoolOverviewIconId = brandingStore.platformBranding.school_overview_icon_id ?? null;
      platformForm.value.manageModulesIconId = brandingStore.platformBranding.manage_modules_icon_id ?? null;
      platformForm.value.manageDocumentsIconId = brandingStore.platformBranding.manage_documents_icon_id ?? null;
      platformForm.value.manageUsersIconId = brandingStore.platformBranding.manage_users_icon_id ?? null;
      platformForm.value.platformSettingsIconId = brandingStore.platformBranding.platform_settings_icon_id ?? null;
      platformForm.value.viewAllProgressIconId = brandingStore.platformBranding.view_all_progress_icon_id ?? null;
      platformForm.value.allAgenciesNotificationsIconId = brandingStore.platformBranding.all_agencies_notifications_icon_id ?? null;
      platformForm.value.organizationName = brandingStore.platformBranding.organization_name ?? null;
      platformForm.value.organizationLogoIconId = brandingStore.platformBranding.organization_logo_icon_id ?? null;
      platformForm.value.organizationLogoUrl = brandingStore.platformBranding.organization_logo_url ?? null;
      platformForm.value.organizationLogoPath = brandingStore.platformBranding.organization_logo_path ?? null;
    }
    
    console.log('Platform branding saved. Updated form icon IDs:', {
      trainingFocus: platformForm.value.trainingFocusDefaultIconId,
      module: platformForm.value.moduleDefaultIconId,
      user: platformForm.value.userDefaultIconId,
      document: platformForm.value.documentDefaultIconId,
      masterBrand: platformForm.value.masterBrandIconId,
      platformSettings: platformForm.value.platformSettingsIconId
    });
    
    alert('Platform branding updated successfully');
  } catch (err) {
    console.error('Error saving platform branding:', err);
    const errorMessage = err.response?.data?.error?.message || err.response?.data?.error?.errors?.[0]?.msg || 'Failed to save platform branding';
    error.value = errorMessage;
    alert(errorMessage);
  } finally {
    savingPlatform.value = false;
  }
};

// Watch for platform branding changes to detect template matches
watch(() => brandingStore.platformBranding, async () => {
  if (selectedBrandingScope.value === 'platform' && availableTemplates.value.length > 0) {
    await detectCurrentlyAppliedTemplate();
  }
}, { deep: true });

onMounted(async () => {
  await fetchAvailableTemplates();
  await agencyStore.fetchAgencies();
  if (authStore.user?.role === 'super_admin') {
    await brandingStore.fetchPlatformBranding();
    if (brandingStore.platformBranding) {
      platformForm.value = {
        ...platformForm.value,
        tagline: brandingStore.platformBranding.tagline || platformForm.value.tagline,
        primaryColor: brandingStore.platformBranding.primary_color || platformForm.value.primaryColor,
        secondaryColor: brandingStore.platformBranding.secondary_color || platformForm.value.secondaryColor,
        accentColor: brandingStore.platformBranding.accent_color || platformForm.value.accentColor,
        successColor: brandingStore.platformBranding.success_color || platformForm.value.successColor,
        backgroundColor: brandingStore.platformBranding.background_color || platformForm.value.backgroundColor,
        errorColor: brandingStore.platformBranding.error_color || platformForm.value.errorColor,
        warningColor: brandingStore.platformBranding.warning_color || platformForm.value.warningColor,
        headerFont: brandingStore.platformBranding.header_font || platformForm.value.headerFont,
        bodyFont: brandingStore.platformBranding.body_font || platformForm.value.bodyFont,
        numericFont: brandingStore.platformBranding.numeric_font || platformForm.value.numericFont,
        displayFont: brandingStore.platformBranding.display_font || platformForm.value.displayFont,
        headerFontId: brandingStore.platformBranding.header_font_id ?? null,
        bodyFontId: brandingStore.platformBranding.body_font_id ?? null,
        numericFontId: brandingStore.platformBranding.numeric_font_id ?? null,
        displayFontId: brandingStore.platformBranding.display_font_id ?? null,
        peopleOpsTerm: brandingStore.platformBranding.people_ops_term || platformForm.value.peopleOpsTerm,
        trainingFocusDefaultIconId: brandingStore.platformBranding.training_focus_default_icon_id ?? null,
        moduleDefaultIconId: brandingStore.platformBranding.module_default_icon_id ?? null,
        userDefaultIconId: brandingStore.platformBranding.user_default_icon_id ?? null,
        documentDefaultIconId: brandingStore.platformBranding.document_default_icon_id ?? null,
        masterBrandIconId: brandingStore.platformBranding.master_brand_icon_id ?? null,
        progressDashboardIconId: brandingStore.platformBranding.progress_dashboard_icon_id ?? null,
        manageAgenciesIconId: brandingStore.platformBranding.manage_agencies_icon_id ?? null,
        manageClientsIconId: brandingStore.platformBranding.manage_clients_icon_id ?? null,
        schoolOverviewIconId: brandingStore.platformBranding.school_overview_icon_id ?? null,
        manageModulesIconId: brandingStore.platformBranding.manage_modules_icon_id ?? null,
        manageDocumentsIconId: brandingStore.platformBranding.manage_documents_icon_id ?? null,
        manageUsersIconId: brandingStore.platformBranding.manage_users_icon_id ?? null,
        platformSettingsIconId: brandingStore.platformBranding.platform_settings_icon_id ?? null,
        viewAllProgressIconId: brandingStore.platformBranding.view_all_progress_icon_id ?? null,
        settingsIconId: brandingStore.platformBranding.settings_icon_id ?? null,
        dashboardNotificationsIconId: brandingStore.platformBranding.dashboard_notifications_icon_id ?? null,
        dashboardCommunicationsIconId: brandingStore.platformBranding.dashboard_communications_icon_id ?? null,
        dashboardChatsIconId: brandingStore.platformBranding.dashboard_chats_icon_id ?? null,
        dashboardPayrollIconId: brandingStore.platformBranding.dashboard_payroll_icon_id ?? null,
        dashboardBillingIconId: brandingStore.platformBranding.dashboard_billing_icon_id ?? null,
        allAgenciesNotificationsIconId: brandingStore.platformBranding.all_agencies_notifications_icon_id ?? null,
        externalCalendarAuditIconId: brandingStore.platformBranding.external_calendar_audit_icon_id ?? null,
        skillBuildersAvailabilityIconId: brandingStore.platformBranding.skill_builders_availability_icon_id ?? null,

        organizationName: brandingStore.platformBranding.organization_name ?? null,
        organizationLogoIconId: brandingStore.platformBranding.organization_logo_icon_id ?? null,
        organizationLogoUrl: brandingStore.platformBranding.organization_logo_url ?? null,
        organizationLogoPath: brandingStore.platformBranding.organization_logo_path ?? null,

        companyProfileIconId: brandingStore.platformBranding.company_profile_icon_id ?? null,
        teamRolesIconId: brandingStore.platformBranding.team_roles_icon_id ?? null,
        billingIconId: brandingStore.platformBranding.billing_icon_id ?? null,
        packagesIconId: brandingStore.platformBranding.packages_icon_id ?? null,
        checklistItemsIconId: brandingStore.platformBranding.checklist_items_icon_id ?? null,
        fieldDefinitionsIconId: brandingStore.platformBranding.field_definitions_icon_id ?? null,
        brandingTemplatesIconId: brandingStore.platformBranding.branding_templates_icon_id ?? null,
        assetsIconId: brandingStore.platformBranding.assets_icon_id ?? null,
        communicationsIconId: brandingStore.platformBranding.communications_icon_id ?? null,
        integrationsIconId: brandingStore.platformBranding.integrations_icon_id ?? null,
        archiveIconId: brandingStore.platformBranding.archive_icon_id ?? null
      };
      
      // After loading branding, detect which template is currently applied
      await detectCurrentlyAppliedTemplate();
    }
  }
});

// Refresh form when component becomes active (user navigates back)
onActivated(async () => {
  if (authStore.user?.role === 'super_admin') {
    await brandingStore.fetchPlatformBranding();
    await fetchAvailableTemplates();
    if (brandingStore.platformBranding) {
      // Update icon IDs from store
      platformForm.value.platformSettingsIconId = brandingStore.platformBranding.platform_settings_icon_id ?? null;
      platformForm.value.manageAgenciesIconId = brandingStore.platformBranding.manage_agencies_icon_id ?? null;
      platformForm.value.manageModulesIconId = brandingStore.platformBranding.manage_modules_icon_id ?? null;
      platformForm.value.manageDocumentsIconId = brandingStore.platformBranding.manage_documents_icon_id ?? null;
      platformForm.value.manageUsersIconId = brandingStore.platformBranding.manage_users_icon_id ?? null;
      platformForm.value.viewAllProgressIconId = brandingStore.platformBranding.view_all_progress_icon_id ?? null;
      platformForm.value.allAgenciesNotificationsIconId = brandingStore.platformBranding.all_agencies_notifications_icon_id ?? null;
      platformForm.value.organizationName = brandingStore.platformBranding.organization_name ?? null;
      platformForm.value.organizationLogoIconId = brandingStore.platformBranding.organization_logo_icon_id ?? null;
      platformForm.value.organizationLogoUrl = brandingStore.platformBranding.organization_logo_url ?? null;
      platformForm.value.organizationLogoPath = brandingStore.platformBranding.organization_logo_path ?? null;
      
      // Set logo input method based on what's available
      if (platformForm.value.organizationLogoPath) {
        platformLogoInputMethod.value = 'upload';
      } else if (platformForm.value.organizationLogoUrl) {
        platformLogoInputMethod.value = 'url';
      }
      
      if (selectedBrandingScope.value === 'platform') {
        await detectCurrentlyAppliedTemplate();
      }
      platformForm.value.trainingFocusDefaultIconId = brandingStore.platformBranding.training_focus_default_icon_id ?? null;
      platformForm.value.moduleDefaultIconId = brandingStore.platformBranding.module_default_icon_id ?? null;
      platformForm.value.userDefaultIconId = brandingStore.platformBranding.user_default_icon_id ?? null;
      platformForm.value.documentDefaultIconId = brandingStore.platformBranding.document_default_icon_id ?? null;
      platformForm.value.masterBrandIconId = brandingStore.platformBranding.master_brand_icon_id ?? null;
    }
  }
});
</script>

<style scoped>
.section-header {
  margin-bottom: 24px;
}

.section-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.branding-preview {
  margin-bottom: 32px;
}

.branding-preview h3 {
  margin-bottom: 16px;
  color: var(--text-primary);
}

.preview-card {
  background: white;
  border-radius: 12px;
  border: 2px solid var(--border);
  overflow: hidden;
}

.preview-header {
  padding: 20px;
}

.preview-header h4 {
  margin: 0;
  color: white;
}

.preview-content {
  padding: 24px;
}

.color-preview {
  display: flex;
  gap: 16px;
}

.color-box {
  flex: 1;
  height: 80px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0,0,0,0.2);
  border: 2px solid var(--border);
}

.no-agency {
  color: var(--text-secondary);
  padding: 40px;
  text-align: center;
  background: var(--bg-alt);
  border-radius: 12px;
}

.platform-branding-section {
  background: var(--bg-alt);
  padding: 24px;
  border-radius: 12px;
  border: 2px solid var(--border);
  margin-bottom: 32px;
}

.platform-branding-section h3 {
  margin-bottom: 20px;
  color: var(--text-primary);
}

.platform-form .form-group {
  margin-bottom: 20px;
}

.platform-form .form-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 15px;
  font-family: var(--font-body);
  background: white;
  color: var(--text-primary);
}

.platform-form .form-select option {
  color: var(--text-primary);
  background: white;
}

.branding-form {
  background: var(--bg-alt);
  padding: 24px;
  border-radius: 12px;
  border: 2px solid var(--border);
}

.branding-form h3 {
  margin-bottom: 20px;
  color: var(--text-primary);
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

.logo-preview {
  margin-top: 12px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 2px solid var(--border);
}

.logo-preview img {
  max-width: 200px;
  max-height: 100px;
  object-fit: contain;
}

.section-divider {
  margin: 32px 0 24px 0;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.section-divider h3 {
  margin-bottom: 8px;
  color: var(--text-primary);
}

.section-description {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 20px;
}

.form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.template-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.include-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nested-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 24px;
  margin-top: 8px;
}

.nested-fields label {
  font-weight: normal;
  font-size: 14px;
}

.large-modal {
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
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

.modal-content {
  background: white;
  border-radius: 8px;
  padding: 24px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
}

.include-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nested-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 24px;
  margin-top: 8px;
}

.nested-fields label {
  font-weight: normal;
  font-size: 14px;
}

.large-modal {
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
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

.modal-content {
  background: white;
  border-radius: 8px;
  padding: 24px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
}

.colors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.color-input-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.color-input-item label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.color-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-swatch-label {
  cursor: pointer;
  flex-shrink: 0;
}

.color-swatch {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: 2px solid var(--border);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.color-swatch-label:hover .color-swatch {
  transform: scale(1.05);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.color-picker {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.color-hex {
  flex: 1;
  padding: 6px 10px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  font-family: var(--font-numeric);
  min-width: 0;
  max-width: 100px;
}

.info-box {
  margin-top: 32px;
  padding: 20px;
  background: var(--bg-alt);
  border: 2px solid var(--border);
  border-radius: 8px;
  border-left: 4px solid var(--primary);
}

.info-box h4 {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-size: 16px;
}

.info-box p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.branding-selector,
.agency-selector {
  margin-bottom: 24px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.branding-selector label,
.agency-selector label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.branding-selector select,
.agency-selector select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: white;
  font-size: 14px;
  margin-bottom: 8px;
}

.branding-selector small,
.agency-selector small {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 4px;
}

.icons-table {
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
  margin-bottom: 20px;
}

.icon-row {
  display: grid;
  grid-template-columns: 180px 250px 1fr;
  gap: 12px;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  transition: background-color 0.2s;
}

.icon-row:last-child {
  border-bottom: none;
}

.icon-row:hover {
  background: var(--bg-alt);
}

.icon-label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
  white-space: nowrap;
}

.icon-selector-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-shrink: 0;
}

.icon-selector-cell :deep(.icon-selector) {
  gap: 0;
  flex-direction: row;
}

.icon-selector-cell :deep(.icon-selector-content) {
  gap: 8px;
  flex-wrap: nowrap;
}

.icon-selector-cell :deep(.selected-icon-preview) {
  padding: 4px;
  min-height: 32px;
  height: 32px;
  width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 4px;
  flex-shrink: 0;
}

.icon-selector-cell :deep(.icon-placeholder) {
  padding: 4px;
  min-height: 32px;
  height: 32px;
  width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-alt);
  border: 2px dashed var(--border);
  border-radius: 4px;
  flex-shrink: 0;
}

.icon-selector-cell :deep(.icon-preview-img) {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.icon-selector-cell :deep(.icon-name),
.icon-selector-cell :deep(.icon-placeholder-text),
.icon-selector-cell :deep(.icon-placeholder-icon),
.icon-selector-cell :deep(.btn-remove-icon) {
  display: none;
}

.icon-selector-cell :deep(.btn-sm) {
  padding: 4px 10px;
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
  width: auto;
  min-width: auto;
  flex: 0 0 auto;
}

.icon-description {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.3;
}

.fonts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.font-input-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.font-input-item label {
  font-weight: 600;
  color: var(--text-primary);
}

.font-input-item small {
  color: var(--text-secondary);
  font-size: 12px;
}
</style>

