<template>
  <div class="container">
    <div class="page-header">
      <h1>Account Information</h1>
    </div>
    
    <div v-if="loading" class="loading">Loading account information...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="account-info-content">
      <!-- Profile Photo -->
      <div class="info-section">
        <div class="section-header">
          <h2 style="margin: 0;">Profile Photo</h2>
        </div>
        <div class="profile-photo-row">
          <div class="photo-preview">
            <img
              v-if="profilePhotoUrl"
              :src="profilePhotoUrl"
              alt="Profile photo"
              class="photo-img"
            />
            <div v-else class="photo-fallback" aria-hidden="true">{{ initials }}</div>
          </div>
          <div class="photo-actions">
            <template v-if="canManageProfilePhoto">
              <input
                ref="photoInput"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                style="display:none;"
                @change="onPhotoSelected"
              />
              <button class="btn btn-secondary btn-large" @click="photoInput?.click()" :disabled="photoUploading || !userId">
                {{ photoUploading ? 'Uploading…' : 'Upload Photo' }}
              </button>
              <div class="hint" style="margin-top: 6px;">
                {{ isSsc ? 'Shown on your club profile and team pages.' : 'Used across the app (school portal provider cards, chat, and profile headers).' }}
              </div>
              <div v-if="photoError" class="error" style="margin-top: 10px;">{{ photoError }}</div>
            </template>
            <template v-else>
              <div class="hint">
                Profile photos are managed by an administrator.
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Photo Album (SSC self-service) -->
      <div v-if="isSsc" class="info-section">
        <div class="section-header">
          <h2 style="margin:0;">My Photos</h2>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="hint" style="margin:0;">Photos tagged to workouts automatically appear here.</span>
            <input
              ref="albumUploadInput"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              style="display:none;"
              @change="onAlbumFileSelected"
            />
            <button
              class="btn btn-secondary btn-compact"
              :disabled="albumUploading || !userId"
              @click="albumUploadInput?.click()"
            >
              {{ albumUploading ? 'Uploading…' : '+ Add Photo' }}
            </button>
          </div>
        </div>
        <div v-if="albumError" class="error" style="margin-top:8px;">{{ albumError }}</div>
        <div v-if="albumLoading" class="hint" style="margin-top:10px;">Loading photos…</div>
        <div v-else-if="albumPhotos.length === 0" class="hint" style="margin-top:10px;">
          No photos yet. Upload a photo or tag a workout to get started.
        </div>
        <div v-else class="photo-album-grid">
          <div
            v-for="photo in albumPhotos"
            :key="photo.id"
            class="album-item"
            :class="{ 'album-item--profile': photo.isProfile, 'album-item--flagged': photo.isFlagged }"
          >
            <img
              :src="photo.url"
              :alt="photo.caption || 'Photo'"
              class="album-img"
            />
            <div class="album-item-overlay">
              <div class="album-source-badge">
                <span v-if="photo.isProfile" class="badge-profile">Profile ✓</span>
                <span v-if="photo.isFlagged" class="badge-flagged">Flagged</span>
                <span v-if="photo.source === 'workout_screenshot'" class="badge-source">Workout</span>
                <span v-if="photo.source === 'workout_media'" class="badge-source">Workout</span>
              </div>
              <div class="album-item-actions">
                <button
                  v-if="!photo.isProfile"
                  class="btn btn-sm btn-primary"
                  title="Set as profile photo"
                  @click="setAsProfileFromAlbum(photo)"
                >Set Profile</button>
                <button
                  class="btn btn-sm btn-danger"
                  title="Remove photo"
                  @click="deleteAlbumPhoto(photo)"
                >✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Personal Information Section -->
      <div class="info-section">
        <h2>Personal Information</h2>

        <!-- ── SSC: fully editable personal info form ────────────────── -->
        <div v-if="isSsc" class="card compact-card">
          <div class="section-header">
            <h3 style="margin:0;">Your Details</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button
                v-if="!editingPersonalInfo"
                class="btn btn-secondary btn-compact"
                type="button"
                @click="startEditPersonalInfo"
              >Edit</button>
              <button
                v-else
                class="btn btn-primary btn-compact"
                type="button"
                :disabled="savingPersonalInfo"
                @click="savePersonalInfo"
              >{{ savingPersonalInfo ? 'Saving…' : 'Save' }}</button>
              <button
                v-if="editingPersonalInfo"
                class="btn btn-secondary btn-compact"
                type="button"
                :disabled="savingPersonalInfo"
                @click="cancelEditPersonalInfo"
              >Cancel</button>
            </div>
          </div>
          <div v-if="personalInfoError" class="error" style="margin-top:10px;">{{ personalInfoError }}</div>
          <div class="fields-grid" style="margin-top:14px;">
            <!-- Email (read-only — login email changes require admin) -->
            <div class="field-item">
              <label>Login Email</label>
              <input :value="accountInfo.loginEmail" type="email" disabled title="Contact an admin to change your login email." />
              <small class="hint" style="margin-top:4px;">Contact an admin to change your login email.</small>
            </div>
            <!-- Username (separate from email; can be phone or handle) -->
            <div class="field-item">
              <label>Username</label>
              <input
                v-model="personalInfoForm.username"
                type="text"
                :disabled="!editingPersonalInfo"
                placeholder="e.g. trackrunna24, you@example.com, or 555-867-5309"
              />
              <small class="hint" style="margin-top:4px;">Can be a handle, email, or phone number — used as a login shortcut.</small>
            </div>
            <!-- Phone number (primary — used for phone login) -->
            <div class="field-item">
              <label>Phone Number</label>
              <input
                v-model="personalInfoForm.phoneNumber"
                type="tel"
                :disabled="!editingPersonalInfo"
                placeholder="e.g. 555-867-5309"
              />
            </div>
            <!-- Preferred Name -->
            <div class="field-item">
              <label>Preferred Name</label>
              <input
                v-model="personalInfoForm.preferredName"
                type="text"
                :disabled="!editingPersonalInfo"
                placeholder="e.g. Katie"
              />
            </div>
            <!-- Title -->
            <div class="field-item">
              <label>Title</label>
              <input
                v-model="personalInfoForm.title"
                type="text"
                :disabled="!editingPersonalInfo"
                placeholder="e.g. Captain, Coach"
              />
            </div>
          </div>
        </div>

        <!-- ── Non-SSC: existing read-only grid ──────────────────────── -->
        <div v-else class="info-grid">
          <div class="info-item">
            <label>Login Email:</label>
            <span>{{ accountInfo.loginEmail }}</span>
          </div>
          <div class="info-item">
            <label>Preferred Name:</label>
            <span>{{ accountInfo.preferredName || 'Not provided' }}</span>
          </div>
          <div class="info-item">
            <label>Title:</label>
            <span>{{ accountInfo.title || 'Not provided' }}</span>
          </div>
          <div class="info-item">
            <label>Service Focus:</label>
            <span>{{ accountInfo.serviceFocus || 'Not provided' }}</span>
          </div>
          <div class="info-item">
            <label>Personal Email:</label>
            <span>{{ accountInfo.personalEmail || 'Not provided' }}</span>
          </div>
          <div class="info-item">
            <label>Personal Phone Number:</label>
            <span>{{ accountInfo.phoneNumber || accountInfo.personalPhone || 'Not provided' }}</span>
          </div>
          <div class="info-item">
            <label>Work Phone Number:</label>
            <span>{{ accountInfo.workPhone ? (accountInfo.workPhone + (accountInfo.workPhoneExtension ? ' ext. ' + accountInfo.workPhoneExtension : '')) : 'Not provided' }}</span>
          </div>
        </div>

        <div class="card compact-card" :class="{ 'security-sso-locked': accountInfo.ssoRequired }" style="margin-top: 16px;">
          <div class="section-header">
            <h3 style="margin: 0;">Security</h3>
            <button
              class="btn btn-secondary btn-compact"
              :disabled="accountInfo.ssoRequired"
              @click="router.push('/change-password')"
            >
              Change Password
            </button>
          </div>
          <div v-if="accountInfo.ssoRequired" class="hint security-sso-note" style="margin-top: 6px;">
            Password changes are disabled. This account must use Workspace login based on agency and role policy.
          </div>
          <div v-else class="hint" style="margin-top: 6px;">
            You can change your password at any time.
          </div>
        </div>

        <!-- ── SSC: Activity Profile (weight / height) ───────────────── -->
        <div v-if="isSsc" class="card compact-card" style="margin-top: 16px;">
          <div class="section-header">
            <h3 style="margin:0;">Activity Profile <span style="font-size:12px;font-weight:400;color:var(--text-secondary);">Optional — used for division recognition (Clydesdale, Athena, age categories)</span></h3>
            <div style="display:flex;gap:8px;">
              <button v-if="!editingActivityProfile" class="btn btn-secondary btn-compact" type="button" @click="editingActivityProfile = true">Edit</button>
              <button v-else class="btn btn-primary btn-compact" type="button" :disabled="savingActivityProfile" @click="saveActivityProfile">{{ savingActivityProfile ? 'Saving…' : 'Save' }}</button>
              <button v-if="editingActivityProfile" class="btn btn-secondary btn-compact" type="button" :disabled="savingActivityProfile" @click="cancelEditActivityProfile">Cancel</button>
            </div>
          </div>
          <div v-if="activityProfileError" class="error" style="margin-top:8px;">{{ activityProfileError }}</div>
          <div class="fields-grid" style="margin-top:14px;">
            <div class="field-item">
              <label>Weight (lbs) <span class="hint" style="font-weight:400;">optional</span></label>
              <input v-model.number="activityProfileForm.weightLbs" type="number" min="60" max="600" step="0.1" :disabled="!editingActivityProfile" placeholder="e.g. 185" />
            </div>
            <div class="field-item">
              <label>Height <span class="hint" style="font-weight:400;">optional</span></label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input v-model.number="activityProfileForm.heightFt" type="number" min="3" max="8" step="1" :disabled="!editingActivityProfile" placeholder="ft" style="width:64px;" />
                <span style="font-size:13px;color:var(--text-secondary);">ft</span>
                <input v-model.number="activityProfileForm.heightIn" type="number" min="0" max="11" step="1" :disabled="!editingActivityProfile" placeholder="in" style="width:64px;" />
                <span style="font-size:13px;color:var(--text-secondary);">in</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ── SSC: Club custom field values ────────────────────────── -->
        <div v-if="isSsc && memberCustomFields.length" class="card compact-card" style="margin-top: 16px;">
          <div class="section-header">
            <h3 style="margin:0;">Club Profile Fields <span style="font-size:12px;font-weight:400;color:var(--text-secondary);">Custom attributes defined by your club</span></h3>
            <div style="display:flex;gap:8px;">
              <button v-if="!editingCustomFields" class="btn btn-secondary btn-compact" type="button" @click="editingCustomFields = true">Edit</button>
              <button v-else class="btn btn-primary btn-compact" type="button" :disabled="savingCustomFields" @click="saveCustomFieldValues">{{ savingCustomFields ? 'Saving…' : 'Save' }}</button>
              <button v-if="editingCustomFields" class="btn btn-secondary btn-compact" type="button" :disabled="savingCustomFields" @click="editingCustomFields = false">Cancel</button>
            </div>
          </div>
          <div v-if="customFieldsError" class="error" style="margin-top:8px;">{{ customFieldsError }}</div>
          <div class="fields-grid" style="margin-top:14px;">
            <div v-for="f in memberCustomFields" :key="f.field_definition_id || f.id" class="field-item">
              <label>{{ f.label }}<template v-if="f.unit_label"> ({{ f.unit_label }})</template></label>
              <input
                v-if="f.field_type === 'number'"
                v-model.number="customFieldDraft[f.field_definition_id]"
                type="number"
                :disabled="!editingCustomFields"
                :placeholder="`Enter ${f.label}`"
              />
              <input
                v-else-if="f.field_type === 'date'"
                v-model="customFieldDraft[f.field_definition_id]"
                type="date"
                :disabled="!editingCustomFields"
              />
              <input
                v-else
                v-model="customFieldDraft[f.field_definition_id]"
                type="text"
                :disabled="!editingCustomFields"
                :placeholder="`Enter ${f.label}`"
                maxlength="256"
              />
            </div>
          </div>
        </div>

        <div v-if="isSsc" class="card compact-card" style="margin-top: 16px;">
          <div class="section-header">
            <h3 style="margin: 0;">Fitness Integrations</h3>
          </div>
          <div class="hint" style="margin-top: 6px; margin-bottom: 10px;">
            Connect Strava to import workouts into your season activity.
          </div>
          <div>
            <div v-if="stravaStatus?.connected">
              <div>Connected as <strong>{{ stravaStatus.username || 'Strava athlete' }}</strong></div>
              <div v-if="stravaStatus.connectedAt" class="hint" style="margin-top: 4px; margin-bottom: 8px;">
                Connected {{ formatStravaDate(stravaStatus.connectedAt) }}
              </div>
              <button type="button" class="btn btn-secondary btn-compact" :disabled="stravaDisconnecting" @click="disconnectStrava">
                {{ stravaDisconnecting ? 'Disconnecting...' : 'Disconnect Strava' }}
              </button>
            </div>
            <div v-else>
              <div v-if="!stravaStatus?.stravaConfigured" class="hint" style="margin-bottom: 8px;">
                Strava integration is not configured. Contact your Program Manager.
              </div>
              <a v-else :href="stravaConnectUrl" class="btn btn-primary btn-compact">Connect Strava</a>
            </div>
          </div>
        </div>

        <!-- ── Timezone preference (SSC members) ─────────────────────── -->
        <div v-if="isSsc" class="card compact-card" style="margin-top: 16px;">
          <div class="section-header">
            <h3 style="margin: 0;">My Timezone</h3>
          </div>
          <div class="hint" style="margin-top: 6px; margin-bottom: 12px;">
            Set your local timezone so season deadlines and countdowns display in your local time.
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <select v-model="userTimezone" style="max-width:420px;">
              <option value="">— Use club default —</option>
              <optgroup v-for="grp in TIMEZONE_GROUPS" :key="grp.label" :label="grp.label">
                <option v-for="tz in grp.zones" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
              </optgroup>
            </select>
            <div style="display:flex;gap:8px;align-items:center;">
              <button type="button" class="btn btn-primary btn-compact" :disabled="savingTimezone" @click="saveUserTimezone">
                {{ savingTimezone ? 'Saving…' : 'Save Timezone' }}
              </button>
              <button type="button" class="btn btn-secondary btn-compact" @click="detectAndFillTimezone">
                Detect my timezone
              </button>
              <span v-if="timezoneSaved" style="color:var(--success,#16a34a);font-size:13px;">Saved!</span>
            </div>
            <div v-if="timezoneError" class="error">{{ timezoneError }}</div>
          </div>
        </div>

        <!-- ── Invite a Friend / Referral Link (SSC members) ─────────── -->
        <div v-if="isSsc" class="card compact-card" style="margin-top: 16px;">
          <div class="section-header">
            <h3 style="margin: 0;">Invite a Friend</h3>
          </div>
          <div class="hint" style="margin-top: 6px; margin-bottom: 12px;">
            Share your personal link — you'll get credit each time someone joins via it.
          </div>
          <div v-if="referralLoading" class="hint">Loading…</div>
          <div v-else-if="referralLink" style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <input
                :value="referralLink"
                readonly
                style="flex:1;min-width:0;padding:7px 10px;border:1px solid var(--border,#e2e8f0);border-radius:7px;font-size:13px;background:var(--surface-2,#f1f5f9);color:var(--text,#0f172a);"
              />
              <button type="button" class="btn btn-primary btn-compact" @click="copyReferralLink">
                {{ referralCopied ? '✓ Copied!' : 'Copy Link' }}
              </button>
            </div>
            <div v-if="referralCredits > 0" style="font-size:13px;color:var(--text-secondary,#64748b);">
              🎉 <strong>{{ referralCredits }} {{ referralCredits === 1 ? 'person has' : 'people have' }}</strong> joined via your link.
            </div>
          </div>
          <div v-else class="hint">
            Your referral link could not be loaded. Make sure you are a club member.
          </div>
        </div>

        <!-- SSC: preferred name is inside the editable "Your Details" card above -->
        <div v-if="!isSsc" class="card compact-card" style="margin-top: 16px;">
          <div class="section-header">
            <h3 style="margin: 0;">Preferred Name (display only)</h3>
            <button class="btn btn-primary btn-compact" @click="savePreferredName" :disabled="savingPreferredName">
              {{ savingPreferredName ? 'Saving...' : 'Save Preferred Name' }}
            </button>
          </div>
          <div class="hint" style="margin-top: 6px;">
            Shown as <strong>First "Preferred" Last</strong> in headers/welcome. Not used for payroll or legal records.
          </div>
          <div v-if="preferredNameError" class="error" style="margin-top: 10px;">{{ preferredNameError }}</div>
          <div class="fields-grid" style="margin-top: 12px;">
            <div class="field-item">
              <label>Preferred name</label>
              <input v-model="preferredNameForm" type="text" placeholder="e.g., Katie" />
            </div>
          </div>
        </div>

        <div class="card compact-card" style="margin-top: 16px;">
          <div class="section-header">
            <h3 style="margin: 0;">Home Address</h3>
            <div style="display:flex; gap: 10px; flex-wrap: wrap;">
              <button
                v-if="!editingHomeAddress"
                class="btn btn-secondary btn-compact"
                type="button"
                @click="startEditingHomeAddress"
              >
                Edit
              </button>
              <button
                v-else
                class="btn btn-primary btn-compact"
                type="button"
                @click="saveHomeAddress"
                :disabled="savingHomeAddress"
              >
                {{ savingHomeAddress ? 'Saving...' : 'Save' }}
              </button>
              <button
                v-if="editingHomeAddress"
                class="btn btn-secondary btn-compact"
                type="button"
                @click="cancelEditingHomeAddress"
                :disabled="savingHomeAddress"
              >
                Cancel
              </button>
            </div>
          </div>
          <div class="hint" style="margin-top: 6px;">
            Used for School Mileage auto-calculation.
          </div>
          <div v-if="homeAddressError" class="error" style="margin-top: 10px;">{{ homeAddressError }}</div>
          <div class="fields-grid" style="margin-top: 12px;">
            <div class="field-item">
              <label>Street</label>
              <input v-model="homeAddressForm.street" :disabled="!editingHomeAddress" type="text" placeholder="123 Main St" />
            </div>
            <div class="field-item">
              <label>Apt / Unit</label>
              <input v-model="homeAddressForm.line2" :disabled="!editingHomeAddress" type="text" placeholder="Apt 4B (optional)" />
            </div>
            <div class="field-item">
              <label>City</label>
              <input v-model="homeAddressForm.city" :disabled="!editingHomeAddress" type="text" placeholder="City" />
            </div>
            <div class="field-item">
              <label>State</label>
              <input v-model="homeAddressForm.state" :disabled="!editingHomeAddress" type="text" placeholder="State" />
            </div>
            <div class="field-item">
              <label>Postal code</label>
              <input v-model="homeAddressForm.postalCode" :disabled="!editingHomeAddress" type="text" placeholder="ZIP" />
            </div>
          </div>
        </div>

        <div v-if="!isSsc" class="card compact-card" style="margin-top: 16px;">
          <div class="section-header">
            <h3 style="margin: 0;">Assigned Building Office(s)</h3>
          </div>
          <div class="hint" style="margin-top: 6px;">
            These building addresses are used by School Mileage mapping.
          </div>
          <div v-if="assignedOfficesError" class="error" style="margin-top: 10px;">{{ assignedOfficesError }}</div>
          <div v-else-if="assignedOfficesLoading" class="loading" style="margin-top: 10px;">Loading assigned offices…</div>
          <div v-else-if="!assignedOffices.length" class="hint" style="margin-top: 10px;">
            No assigned building office is linked yet.
          </div>
          <div v-else class="fields-grid" style="margin-top: 12px;">
            <div v-for="o in assignedOffices" :key="`assigned-office-${o.id}`" class="field-item">
              <label>{{ o.name || `Office #${o.id}` }}<span v-if="o.isPrimary" class="required-asterisk" style="margin-left: 6px;">Primary</span></label>
              <div class="hint">{{ o.addressLine || 'Address not configured' }}</div>
            </div>
          </div>
        </div>

        <div v-if="isProviderLike" class="card compact-card" style="margin-top: 16px;">
          <div class="section-header">
            <h3 style="margin: 0;">Public Provider Profile (Read Only)</h3>
          </div>
          <div class="hint" style="margin-top: 6px;">
            This is what clients see in the external Find a Provider page. Admin updates these settings.
          </div>
          <div v-if="providerPublicProfileLoading" class="loading" style="margin-top: 10px;">Loading profile…</div>
          <div v-else-if="providerPublicProfileError" class="error" style="margin-top: 10px;">{{ providerPublicProfileError }}</div>
          <div v-else class="fields-grid" style="margin-top: 12px;">
            <div class="field-item field-item-full">
              <label>Public blurb</label>
              <div class="hint">{{ providerPublicProfile.publicBlurb || 'No public blurb added yet.' }}</div>
            </div>
            <div class="field-item">
              <label>Self-pay rate</label>
              <div class="hint">
                {{ providerPublicProfile.selfPayRateLabel || providerPublicProfile.agencyDefaultSelfPayRateLabel || 'Not set' }}
              </div>
            </div>
            <div class="field-item">
              <label>Insurance accepted</label>
              <div class="hint">{{ providerPublicProfile.insurancesLabel || 'Not listed yet' }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Profile Information (filled via assigned onboarding/profile modules) – hidden for clubs -->
      <div v-if="!isClubContext" class="info-section">
        <div class="section-header">
          <h2 style="margin: 0;">Profile Information</h2>
          <div style="display:flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-large" @click="$router.push('/dashboard?tab=training')">
              Go to My Training
            </button>
            <label class="toggle" style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" v-model="showEmptyMyFields" />
              <span style="font-size: 13px; color: var(--text-secondary);">Show empty assigned fields</span>
            </label>
            <button class="btn btn-primary btn-large" @click="saveMyUserInfo" :disabled="savingUserInfo || userInfoLoading">
              {{ savingUserInfo ? 'Saving…' : 'Save Profile Info' }}
            </button>
          </div>
        </div>
        <div class="hint" style="margin-top: 6px;">
          This is your editable profile data (saved to the database). You can update it throughout the year; forms/modules just provide a structured way to collect it.
        </div>

        <div v-if="userInfoLoading" class="loading" style="margin-top: 12px;">Loading profile fields…</div>
        <div v-else-if="userInfoError" class="error" style="margin-top: 12px;">{{ userInfoError }}</div>

        <div v-else style="margin-top: 12px;">
          <div v-if="myCategoryOptions.length > 1" class="category-tabs">
            <button
              v-for="cat in myCategoryOptions"
              :key="cat.key"
              @click="activeMyCategoryKey = cat.key"
              :class="['category-tab', { active: activeMyCategoryKey === cat.key }]"
            >
              {{ cat.label }}
            </button>
          </div>

          <div v-if="myRenderableFields.length === 0" class="empty-state" style="margin-top: 10px;">
            No profile fields found yet. Ask an admin to assign you a profile form module (or run “Sync Forms (Spec)”).
          </div>

          <div v-else class="fields-grid" style="margin-top: 12px;">
            <div v-for="field in myRenderableFields" :key="field.id" class="field-item">
              <label :for="`my-field-${field.id}`">
                {{ field.field_label }}
                <span v-if="field.is_required" class="required-asterisk">*</span>
              </label>

              <div v-if="isStaffManagedField(field)" class="hint" style="margin: 2px 0 6px 0;">
                This section is managed by staff. You can view it here.
              </div>
              <div v-else-if="isFieldReadOnlyForCurrentUser(field)" class="hint" style="margin: 2px 0 6px 0;">
                This field is managed by admin staff. You can view it here.
              </div>

              <div v-if="fileValueUrl(myUserInfoValues[field.id])" style="margin-bottom: 6px;">
                <a :href="fileValueUrl(myUserInfoValues[field.id])" target="_blank" rel="noopener noreferrer">View uploaded file</a>
              </div>

              <input
                v-if="field.field_type === 'text' || field.field_type === 'email' || field.field_type === 'phone'"
                :id="`my-field-${field.id}`"
                :type="field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'"
                v-model="myUserInfoValues[field.id]"
                :required="field.is_required"
                :disabled="isFieldReadOnlyForCurrentUser(field)"
              />

              <input
                v-else-if="field.field_type === 'number'"
                :id="`my-field-${field.id}`"
                type="number"
                v-model="myUserInfoValues[field.id]"
                :required="field.is_required"
                :disabled="isFieldReadOnlyForCurrentUser(field)"
              />

              <input
                v-else-if="field.field_type === 'date'"
                :id="`my-field-${field.id}`"
                type="date"
                v-model="myUserInfoValues[field.id]"
                :required="field.is_required"
                :disabled="isFieldReadOnlyForCurrentUser(field)"
              />

              <textarea
                v-else-if="field.field_type === 'textarea'"
                :id="`my-field-${field.id}`"
                v-model="myUserInfoValues[field.id]"
                rows="3"
                :required="field.is_required"
                :disabled="isFieldReadOnlyForCurrentUser(field)"
              />

              <select
                v-else-if="field.field_type === 'select'"
                :id="`my-field-${field.id}`"
                v-model="myUserInfoValues[field.id]"
                :required="field.is_required"
                :disabled="isFieldReadOnlyForCurrentUser(field)"
              >
                <option value="">Select…</option>
                <option v-for="opt in (field.options || [])" :key="opt" :value="opt">{{ opt }}</option>
              </select>

              <div v-else-if="field.field_type === 'multi_select'" class="multi-select-options">
                <label v-for="opt in (field.options || [])" :key="opt" class="checkbox-option">
                  <input
                    type="checkbox"
                    :checked="normalizeMultiSelectValue(myUserInfoValues[field.id]).includes(opt)"
                    @change="toggleMyMultiSelect(field.id, opt)"
                    :disabled="isFieldReadOnlyForCurrentUser(field)"
                  />
                  {{ opt }}
                </label>
              </div>

              <select
                v-else-if="field.field_type === 'boolean'"
                :id="`my-field-${field.id}`"
                v-model="myUserInfoValues[field.id]"
                :required="field.is_required"
                :disabled="isFieldReadOnlyForCurrentUser(field)"
              >
                <option value="">Select…</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>

              <input
                v-else
                :id="`my-field-${field.id}`"
                v-model="myUserInfoValues[field.id]"
                type="text"
                :disabled="isFieldReadOnlyForCurrentUser(field)"
              />
            </div>
          </div>
        </div>
      </div>
      
      <!-- Supervisor Information Section -->
      <div v-if="accountInfo.supervisors && accountInfo.supervisors.length > 0" class="info-section">
        <h2>Supervisor Information</h2>
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
      <div v-if="accountInfo.status === 'pending' && accountInfo.passwordlessLoginLink" class="info-section">
        <h2>Direct Login Link</h2>
        <div class="passwordless-link-section">
          <p class="link-description">
            Use this link to access your account. You will be asked to verify your last name when you click the link.
          </p>
          
          <!-- Token Status -->
          <div v-if="accountInfo.passwordlessTokenExpiresAt" class="token-status">
            <div class="token-status-row">
              <div>
                <strong>Link Status:</strong>
                <span :class="accountInfo.passwordlessTokenIsExpired ? 'status-expired' : 'status-valid'">
                  {{ accountInfo.passwordlessTokenIsExpired ? '❌ Expired' : '✅ Valid' }}
                </span>
              </div>
              <div class="token-expiry-info">
                <div><strong>Expires:</strong> {{ formatTokenExpiration(accountInfo.passwordlessTokenExpiresAt) }}</div>
                <div v-if="!accountInfo.passwordlessTokenIsExpired && accountInfo.passwordlessTokenExpiresInHours" class="time-until-expiry">
                  ({{ formatTimeUntilExpiry(accountInfo.passwordlessTokenExpiresInHours) }})
                </div>
              </div>
            </div>
          </div>
          
          <div class="link-container">
            <input 
              type="text" 
              :value="accountInfo.passwordlessLoginLink" 
              readonly 
              class="link-input"
              @click="$event.target.select()"
            />
            <button 
              @click="copyLink" 
              class="btn btn-primary btn-large"
            >
              Copy Link
            </button>
          </div>
          <div class="link-actions">
            <button 
              @click="showResetModal = true" 
              class="btn btn-secondary btn-large"
              :disabled="resettingToken"
            >
              {{ resettingToken ? 'Resetting...' : 'Reset Link (New Token)' }}
            </button>
            <div v-if="showResetModal" class="reset-modal-inline">
              <label>Expires in:</label>
              <input 
                type="number" 
                v-model="tokenExpirationDays" 
                min="1" 
                max="30"
                class="expiration-input"
              />
              <span>days</span>
              <button @click="confirmResetToken" class="btn btn-success btn-large" :disabled="resettingToken">
                Confirm
              </button>
              <button @click="showResetModal = false" class="btn btn-secondary btn-large">
                Cancel
              </button>
            </div>
          </div>
          <small class="link-help">Click the link above to select it, or use the copy button. Use "Reset Link" to generate a new token with custom expiration.</small>
        </div>
      </div>
      
      <!-- Progress & Time Section – hidden for clubs -->
      <div v-if="!isClubContext" class="info-section">
        <h2>Onboarding Progress</h2>
        <div class="info-grid">
          <div class="info-item progress-item">
            <label>Total Progress:</label>
            <span class="progress-value">{{ accountInfo.totalProgress ?? 0 }} incomplete items</span>
            <p class="progress-description">Total of all assigned and currently active (not complete) items</p>
          </div>
          <div class="info-item time-item">
            <label>Total Onboarding Time:</label>
            <span class="time-value">{{ accountInfo.totalOnboardingTime?.formatted ?? '0m' }}</span>
            <p class="time-description">Calculated from training focus and module participation</p>
          </div>
        </div>
      </div>
      
      <!-- Download Section – hidden for clubs -->
      <div v-if="!isClubContext" class="info-section">
        <h2>Download Completion Package</h2>
        <div class="download-section">
          <p class="download-description">
            Download a complete package of all your completed items, including signed documents, certificates, 
            completion confirmations, and quiz scores.
          </p>
          <button 
            @click="downloadCompletionPackage" 
            class="btn btn-primary btn-large"
            :disabled="downloading"
          >
            {{ downloading ? 'Generating Package...' : 'Download Completion Package' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '../services/api';
import { TIMEZONE_GROUPS, detectLocalTimezone } from '../utils/timezones.js';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { toUploadsUrl } from '../utils/uploadsUrl';
import { useSummitStatsChallengeChrome } from '../composables/useSummitStatsChallengeChrome';

const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const isClubContext = computed(() => {
  const t = String(agencyStore.currentAgency?.organization_type || agencyStore.currentAgency?.organizationType || '').toLowerCase();
  return t === 'affiliation';
});
const isSsc = useSummitStatsChallengeChrome();
const userId = computed(() => authStore.user?.id);
const profilePhotoUrl = computed(() => {
  // `GET /users/me` returns `profile_photo_url` which is typically a backend-relative `/uploads/...` path.
  // Always convert to absolute backend URL so it works in production where frontend and backend are on different origins.
  const raw =
    authStore.user?.profile_photo_url ||
    authStore.user?.profile_photo_path ||
    authStore.user?.profilePhotoUrl ||
    null;
  return toUploadsUrl(raw);
});
const canManageProfilePhoto = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (['admin', 'super_admin', 'staff', 'provider_plus'].includes(role)) return true;
  // SSC members can upload their own profile photo
  return !!isSsc.value;
});
const initials = computed(() => {
  const f = String(authStore.user?.firstName || '').trim();
  const l = String(authStore.user?.lastName || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || 'U';
});

const photoInput = ref(null);
const photoUploading = ref(false);
const photoError = ref('');

const onPhotoSelected = async (event) => {
  try {
    photoError.value = '';
    const file = event?.target?.files?.[0] || null;
    if (!file) return;
    if (!userId.value) {
      photoError.value = 'User not loaded.';
      return;
    }

    const formData = new FormData();
    formData.append('photo', file);

    photoUploading.value = true;
    await api.post(`/users/${userId.value}/profile-photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    await authStore.refreshUser();
    await loadPhotoAlbum();
  } catch (e) {
    photoError.value = e.response?.data?.error?.message || 'Failed to upload photo';
  } finally {
    photoUploading.value = false;
    try {
      if (photoInput.value) photoInput.value.value = '';
    } catch {
      // ignore
    }
  }
};

// ── Photo album ──────────────────────────────────────────────
const albumPhotos = ref([]);
const albumLoading = ref(false);
const albumError = ref('');
const albumUploadInput = ref(null);
const albumUploading = ref(false);

const loadPhotoAlbum = async () => {
  if (!userId.value) return;
  albumLoading.value = true;
  try {
    const { data } = await api.get(`/users/${userId.value}/photos`);
    albumPhotos.value = data.photos || [];
  } catch {
    // non-fatal
  } finally {
    albumLoading.value = false;
  }
};

const onAlbumFileSelected = async (event) => {
  const file = event?.target?.files?.[0];
  if (!file || !userId.value) return;
  albumUploading.value = true;
  albumError.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    await api.post(`/users/${userId.value}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    await loadPhotoAlbum();
  } catch (e) {
    albumError.value = e.response?.data?.error?.message || 'Upload failed';
  } finally {
    albumUploading.value = false;
    try { if (albumUploadInput.value) albumUploadInput.value.value = ''; } catch { /* */ }
  }
};

const setAsProfileFromAlbum = async (photo) => {
  if (!userId.value) return;
  try {
    await api.put(`/users/${userId.value}/photos/${photo.id}/set-profile`);
    await authStore.refreshUser();
    await loadPhotoAlbum();
  } catch (e) {
    albumError.value = e.response?.data?.error?.message || 'Failed to set profile photo';
  }
};

const deleteAlbumPhoto = async (photo) => {
  if (!userId.value) return;
  if (!confirm('Remove this photo from your album?')) return;
  try {
    await api.delete(`/users/${userId.value}/photos/${photo.id}`);
    await loadPhotoAlbum();
    await authStore.refreshUser();
  } catch (e) {
    albumError.value = e.response?.data?.error?.message || 'Failed to delete photo';
  }
};

const loading = ref(true);
const error = ref('');
const accountInfo = ref({ 
  loginEmail: '', 
  username: '',
  preferredName: '',
  title: '',
  serviceFocus: '',
  personalEmail: '', 
  phoneNumber: '', 
  personalPhone: '',
  workPhone: '',
  workPhoneExtension: '',
  supervisors: [],
  totalProgress: 0,
  totalOnboardingTime: { formatted: '0m' },
  status: null,
  passwordlessLoginLink: null,
  passwordlessTokenExpiresAt: null,
  passwordlessTokenExpiresInHours: null,
  passwordlessTokenIsExpired: false
});
const downloading = ref(false);
const resettingToken = ref(false);
const showResetModal = ref(false);
const tokenExpirationDays = ref(7);

const preferredNameForm = ref('');
const savingPreferredName = ref(false);
const preferredNameError = ref('');

// SSC editable personal info
const editingPersonalInfo = ref(false);
const savingPersonalInfo = ref(false);
const personalInfoError = ref('');
const personalInfoForm = ref({ username: '', phoneNumber: '', preferredName: '', title: '' });
const stravaStatus = ref(null);
const stravaDisconnecting = ref(false);
const stravaConnectUrl = computed(() => {
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '') || window.location.origin;
  return `${base}/api/strava/connect`;
});
const formatStravaDate = (d) =>
  (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

// SSC activity profile (weight / height)
const editingActivityProfile = ref(false);
const savingActivityProfile = ref(false);
const activityProfileError = ref('');
const activityProfileForm = ref({ weightLbs: null, heightFt: null, heightIn: null });

const cancelEditActivityProfile = () => {
  editingActivityProfile.value = false;
  activityProfileError.value = '';
};

// SSC member custom field values
const memberCustomFields = ref([]);
const customFieldDraft = ref({});
const editingCustomFields = ref(false);
const savingCustomFields = ref(false);
const customFieldsError = ref('');

// ── User timezone preference ────────────────────────────────
const userTimezone      = ref('');
const savingTimezone    = ref(false);
const timezoneError     = ref('');
const timezoneSaved     = ref(false);

const loadUserTimezone = async () => {
  try {
    const { data } = await api.get('/summit-stats/users/me/timezone');
    userTimezone.value = data?.timezone || '';
  } catch { /* non-fatal */ }
};

const detectAndFillTimezone = () => {
  if (!userTimezone.value) userTimezone.value = detectLocalTimezone();
};

const saveUserTimezone = async () => {
  savingTimezone.value = true;
  timezoneError.value = '';
  timezoneSaved.value = false;
  try {
    await api.put('/summit-stats/users/me/timezone', { timezone: userTimezone.value || null });
    timezoneSaved.value = true;
    setTimeout(() => { timezoneSaved.value = false; }, 3000);
  } catch (e) {
    timezoneError.value = e?.response?.data?.error?.message || 'Failed to save timezone';
  } finally {
    savingTimezone.value = false;
  }
};

// ── Member referral link ─────────────────────────────────────
const referralLink    = ref('');
const referralCode    = ref('');
const referralCredits = ref(0);
const referralLoading = ref(false);
const referralCopied  = ref(false);

const loadReferralLink = async () => {
  const clubId = accountInfo.value?.organizationId ?? accountInfo.value?.agencyId ?? null;
  if (!clubId) return;
  referralLoading.value = true;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${clubId}/my-referral-link`);
    referralLink.value    = data?.joinUrl || '';
    referralCode.value    = data?.referralCode || '';
    referralCredits.value = data?.creditCount || 0;
  } catch { /* non-fatal */ } finally {
    referralLoading.value = false;
  }
};

const copyReferralLink = async () => {
  if (!referralLink.value) return;
  try {
    await navigator.clipboard.writeText(referralLink.value);
    referralCopied.value = true;
    setTimeout(() => { referralCopied.value = false; }, 2500);
  } catch { /* fallback */ }
};

const loadMemberCustomFields = async () => {
  try {
    const clubId = accountInfo.value?.organizationId ?? accountInfo.value?.agencyId ?? null;
    const classId = accountInfo.value?.challengeClassId ?? accountInfo.value?.learningClassId ?? null;
    if (!clubId || !userId.value) return;
    const { data } = await api.get(
      `/summit-stats/clubs/${clubId}/seasons/${classId || 0}/participants/${userId.value}/custom-values`,
      { skipGlobalLoading: true, skipAuthRedirect: true }
    );
    memberCustomFields.value = Array.isArray(data?.values) ? data.values : [];
    const draft = {};
    for (const f of memberCustomFields.value) {
      draft[f.field_definition_id] = f.value_number ?? f.value_text ?? f.value_date ?? null;
    }
    customFieldDraft.value = draft;
  } catch {
    memberCustomFields.value = [];
  }
};

const saveCustomFieldValues = async () => {
  const clubId = accountInfo.value?.organizationId ?? accountInfo.value?.agencyId ?? null;
  const classId = accountInfo.value?.challengeClassId ?? accountInfo.value?.learningClassId ?? null;
  if (!clubId || !userId.value) return;
  savingCustomFields.value = true;
  customFieldsError.value = '';
  try {
    for (const f of memberCustomFields.value) {
      const val = customFieldDraft.value[f.field_definition_id];
      if (val == null || val === '') continue;
      await api.put(
        `/summit-stats/clubs/${clubId}/seasons/${classId || 0}/participants/${userId.value}/custom-values/${f.field_definition_id}`,
        { value: val },
        { skipGlobalLoading: true }
      );
    }
    editingCustomFields.value = false;
  } catch (e) {
    customFieldsError.value = e?.response?.data?.error?.message || 'Failed to save custom fields';
  } finally {
    savingCustomFields.value = false;
  }
};

const saveActivityProfile = async () => {
  savingActivityProfile.value = true;
  activityProfileError.value = '';
  try {
    const classId = accountInfo.value?.challengeClassId ?? accountInfo.value?.learningClassId ?? null;
    if (!classId || !userId.value) throw new Error('No active season found for this profile.');
    const wt = activityProfileForm.value.weightLbs > 0 ? activityProfileForm.value.weightLbs : null;
    const ft = Number(activityProfileForm.value.heightFt) || 0;
    const inches = Number(activityProfileForm.value.heightIn) || 0;
    const totalInches = ft > 0 || inches > 0 ? ft * 12 + inches : null;
    await api.put(
      `/learning-program-classes/${classId}/participants/${userId.value}/profile`,
      { weightLbs: wt, heightInches: totalInches },
      { skipGlobalLoading: true }
    );
    editingActivityProfile.value = false;
  } catch (e) {
    activityProfileError.value = e?.response?.data?.error?.message || e?.message || 'Failed to save activity profile';
  } finally {
    savingActivityProfile.value = false;
  }
};

const startEditPersonalInfo = () => {
  personalInfoForm.value = {
    username: accountInfo.value.username || '',
    phoneNumber: accountInfo.value.phoneNumber || accountInfo.value.personalPhone || '',
    preferredName: accountInfo.value.preferredName || '',
    title: accountInfo.value.title || ''
  };
  personalInfoError.value = '';
  editingPersonalInfo.value = true;
};

const cancelEditPersonalInfo = () => {
  editingPersonalInfo.value = false;
  personalInfoError.value = '';
};

const savePersonalInfo = async () => {
  savingPersonalInfo.value = true;
  personalInfoError.value = '';
  try {
    const payload = {
      username: personalInfoForm.value.username.trim() || null,
      phoneNumber: personalInfoForm.value.phoneNumber.trim() || null,
      preferredName: personalInfoForm.value.preferredName.trim() || null,
      title: personalInfoForm.value.title.trim() || null
    };
    await api.put(`/users/${userId.value}`, payload);
    await fetchAccountInfo();
    try { await authStore.refreshUser(); } catch { /* non-blocking */ }
    editingPersonalInfo.value = false;
  } catch (e) {
    personalInfoError.value = e?.response?.data?.error?.message || 'Failed to save. Please try again.';
  } finally {
    savingPersonalInfo.value = false;
  }
};

const fetchStravaStatus = async () => {
  if (!userId.value) return;
  try {
    const r = await api.get('/strava/status', { skipGlobalLoading: true });
    stravaStatus.value = r.data || null;
  } catch {
    stravaStatus.value = null;
  }
};

const disconnectStrava = async () => {
  try {
    stravaDisconnecting.value = true;
    await api.delete('/strava/disconnect');
    stravaStatus.value = { ...stravaStatus.value, connected: false, username: null, connectedAt: null };
  } catch (e) {
    personalInfoError.value = e?.response?.data?.error?.message || 'Failed to disconnect Strava';
  } finally {
    stravaDisconnecting.value = false;
  }
};

// User Info (profile fields saved by Custom Input Modules)
const userInfoLoading = ref(false);
const userInfoError = ref('');
const myUserInfoFields = ref([]);
const myUserInfoCategories = ref([]);
const myUserInfoValues = ref({});
const savingUserInfo = ref(false);
const activeMyCategoryKey = ref('__all');
const showEmptyMyFields = ref(false);

const savingHomeAddress = ref(false);
const editingHomeAddress = ref(false);
const savedHomeAddressSnapshot = ref(null);
const homeAddressError = ref('');
const homeAddressForm = ref({
  street: '',
  line2: '',
  city: '',
  state: '',
  postalCode: ''
});
const assignedOfficesLoading = ref(false);
const assignedOfficesError = ref('');
const assignedOffices = ref([]);
const providerPublicProfileLoading = ref(false);
const providerPublicProfileError = ref('');
const providerPublicProfile = ref({
  publicBlurb: '',
  selfPayRateLabel: '',
  agencyDefaultSelfPayRateLabel: '',
  insurancesLabel: ''
});
const isProviderLike = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'provider' || role === 'supervisor' || !!authStore.user?.has_provider_access || !!authStore.user?.hasProviderAccess;
});

const normalizeMultiSelectValue = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
};

const toggleMyMultiSelect = (fieldId, option) => {
  const current = normalizeMultiSelectValue(myUserInfoValues.value[fieldId]);
  const exists = current.includes(option);
  const next = exists ? current.filter((x) => x !== option) : [...current, option];
  myUserInfoValues.value[fieldId] = next;
};

const fileValueUrl = (raw) => {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (v.startsWith('/uploads/')) return v;
  if (v.startsWith('uploads/')) return `/uploads/${v.substring('uploads/'.length)}`;
  return '';
};

// The backend endpoint `/users/:id/user-info?assignedOrHasValueOnly=true` already filters out
// irrelevant fields. So the UI should render whatever it receives, even if categories haven't
// been synced yet (category_key may be null).
const myVisibleFields = computed(() => {
  const all = myUserInfoFields.value || [];
  if (showEmptyMyFields.value) return all;
  return all.filter((f) => f?.hasValue);
});

const isStaffManagedField = (field) => {
  return String(field?.category_key || '') === 'gear_tracking';
};

const isAdminOrSuperAdmin = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
});

const normalizeFieldToken = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const restrictedCredentialingFieldKeys = new Set([
  'date_of_birth',
  'birthdate',
  'provider_birthdate',
  'provider_credential_license_type_number',
  'license_type_number',
  'license_number',
  'provider_credential_license_issued_date',
  'license_issued',
  'provider_credential_license_expiration_date',
  'license_expires',
  'provider_identity_npi_number',
  'npi_number',
  'provider_identity_taxonomy_code',
  'taxonomy_code',
  'provider_credential_caqh_provider_id',
  'caqh_provider_id',
  'medicaid_provider_type',
  'provider_credential_medicaid_location_id',
  'medicaid_location_id',
  'medicaid_effective_date',
  'provider_credential_medicaid_revalidation_date',
  'medicaid_revalidation',
  'medicare_number',
  'provider_credential',
  'tax_id',
  'zipcode',
  'zip_code'
]);

const restrictedCredentialingLabelPatterns = [
  'birthdate',
  'dateofbirth',
  'licensenumber',
  'licensetypenumber',
  'datelicensed',
  'datelicenseissued',
  'datelicenseexpires',
  'npinumber',
  'taxonomycode',
  'caqhproviderid',
  'medicaidprovidertype',
  'medicaidlocationid',
  'medicaideffectivedate',
  'medicaidrevalidationdate',
  'medicarenumber',
  'credential',
  'taxid',
  'zipcode',
  'postalcode'
];

const isRestrictedCredentialingField = (field) => {
  const fieldKey = String(field?.field_key || '').trim().toLowerCase();
  if (restrictedCredentialingFieldKeys.has(fieldKey)) return true;
  const labelToken = normalizeFieldToken(field?.field_label);
  return restrictedCredentialingLabelPatterns.some((pattern) => labelToken.includes(pattern));
};

const shouldHideFieldForCurrentUser = (field) => {
  if (isAdminOrSuperAdmin.value) return false;
  const fieldKey = String(field?.field_key || '').trim().toLowerCase();
  const labelToken = normalizeFieldToken(field?.field_label);
  return fieldKey === 'npi_id' || labelToken === 'npiid';
};

const isFieldReadOnlyForCurrentUser = (field) => {
  if (isStaffManagedField(field)) return true;
  if (isAdminOrSuperAdmin.value) return false;
  return isRestrictedCredentialingField(field);
};

const myCategoryOptions = computed(() => {
  const byKey = new Map((myUserInfoCategories.value || []).map((c) => [c.category_key, c]));
  const keysFromFields = new Set((myVisibleFields.value || []).map((f) => f.category_key || '__uncategorized'));

  const options = [
    { key: '__all', label: 'All' },
    ...Array.from(keysFromFields)
      .filter((k) => k !== '__all')
      .map((k) => {
        if (k === '__uncategorized') return { key: k, label: 'Uncategorized', order: 999999 };
        const c = byKey.get(k);
        return { key: k, label: c?.category_label || k, order: c?.order_index ?? 0 };
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.label).localeCompare(String(b.label)))
  ];

  return options;
});

const filteredMyFields = computed(() => {
  if (activeMyCategoryKey.value === '__all') return myVisibleFields.value;
  if (activeMyCategoryKey.value === '__uncategorized') {
    return myVisibleFields.value.filter((f) => !f.category_key);
  }
  return myVisibleFields.value.filter((f) => f.category_key === activeMyCategoryKey.value);
});

const myRenderableFields = computed(() => {
  return filteredMyFields.value.filter((field) => !shouldHideFieldForCurrentUser(field));
});

const fetchMyUserInfo = async () => {
  try {
    userInfoLoading.value = true;
    userInfoError.value = '';
    const [fieldsRes, catsRes] = await Promise.all([
      api.get(`/users/${userId.value}/user-info`, { params: { assignedOrHasValueOnly: true } }),
      api.get('/user-info-categories')
    ]);
    myUserInfoFields.value = fieldsRes.data || [];
    myUserInfoCategories.value = catsRes.data || [];

    const valuesMap = {};
    myUserInfoFields.value.forEach((field) => {
      if (field.field_type === 'multi_select') {
        valuesMap[field.id] = normalizeMultiSelectValue(field.value);
      } else {
        valuesMap[field.id] = field.value || '';
      }
    });
    myUserInfoValues.value = valuesMap;
  } catch (err) {
    userInfoError.value = err.response?.data?.error?.message || 'Failed to load profile information';
  } finally {
    userInfoLoading.value = false;
  }
};

const saveMyUserInfo = async () => {
  try {
    savingUserInfo.value = true;
    userInfoError.value = '';

    const values = Object.keys(myUserInfoValues.value).map((fieldId) => ({
      fieldDefinitionId: parseInt(fieldId),
      value: Array.isArray(myUserInfoValues.value[fieldId]) ? JSON.stringify(myUserInfoValues.value[fieldId]) : (myUserInfoValues.value[fieldId] || null)
    }));

    await api.post(`/users/${userId.value}/user-info`, { values });
    await fetchMyUserInfo();
    alert('Profile information saved successfully!');
  } catch (err) {
    userInfoError.value = err.response?.data?.error?.message || 'Failed to save profile information';
    alert(userInfoError.value);
  } finally {
    savingUserInfo.value = false;
  }
};

const fetchAssignedOffices = async () => {
  try {
    assignedOfficesLoading.value = true;
    assignedOfficesError.value = '';
    const resp = await api.get('/payroll/me/assigned-offices');
    assignedOffices.value = Array.isArray(resp.data) ? resp.data : [];
  } catch (err) {
    assignedOffices.value = [];
    assignedOfficesError.value = err.response?.data?.error?.message || 'Failed to load assigned building offices';
  } finally {
    assignedOfficesLoading.value = false;
  }
};

const fetchProviderPublicProfile = async () => {
  if (!userId.value || !isProviderLike.value) return;
  try {
    providerPublicProfileLoading.value = true;
    providerPublicProfileError.value = '';
    const agenciesResp = await api.get(`/users/${userId.value}/agencies`);
    const agencies = Array.isArray(agenciesResp.data) ? agenciesResp.data : [];
    const agency = agencies.find((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency') || agencies[0] || null;
    const agencyId = Number(agency?.id || 0);
    if (!agencyId) {
      providerPublicProfile.value = {
        publicBlurb: '',
        selfPayRateLabel: '',
        agencyDefaultSelfPayRateLabel: '',
        insurancesLabel: ''
      };
      return;
    }
    const { data } = await api.get(`/users/${userId.value}/provider-public-profile`, {
      params: { agencyId }
    });
    const profile = data?.profile || {};
    const defaults = data?.agencyDefaults || {};
    const insurances = Array.isArray(profile.insurances) ? profile.insurances : [];
    providerPublicProfile.value = {
      publicBlurb: String(profile.publicBlurb || '').trim(),
      selfPayRateLabel: profile.selfPayRateCents !== null && profile.selfPayRateCents !== undefined
        ? `$${(Number(profile.selfPayRateCents) / 100).toFixed(2)}`
        : '',
      agencyDefaultSelfPayRateLabel: defaults.defaultSelfPayRateCents !== null && defaults.defaultSelfPayRateCents !== undefined
        ? `$${(Number(defaults.defaultSelfPayRateCents) / 100).toFixed(2)}`
        : '',
      insurancesLabel: insurances.map((x) => String(x || '').trim()).filter(Boolean).join(', ')
    };
  } catch (err) {
    providerPublicProfileError.value = err.response?.data?.error?.message || 'Failed to load public provider profile';
  } finally {
    providerPublicProfileLoading.value = false;
  }
};

const copyLink = () => {
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

const resetToken = async () => {
  showResetModal.value = true;
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
    
    showResetModal.value = false;
    alert('Passwordless login link reset successfully! The new link is now displayed above.');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to reset passwordless token';
    alert(error.value);
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

const fetchAccountInfo = async () => {
  try {
    loading.value = true;
    const response = await api.get(`/users/${userId.value}/account-info`);
    accountInfo.value = response.data;
    preferredNameForm.value = response.data?.preferredName || '';
    // Seed SSC personal-info form with current values (stays hidden until user clicks Edit)
    personalInfoForm.value = {
      username: response.data?.username || '',
      phoneNumber: response.data?.phoneNumber || response.data?.personalPhone || '',
      preferredName: response.data?.preferredName || '',
      title: response.data?.title || ''
    };
    homeAddressForm.value = {
      street: response.data?.homeStreetAddress || '',
      line2: response.data?.homeAddressLine2 || '',
      city: response.data?.homeCity || '',
      state: response.data?.homeState || '',
      postalCode: response.data?.homePostalCode || ''
    };
    savedHomeAddressSnapshot.value = { ...homeAddressForm.value };
    editingHomeAddress.value = false;
    // Load SSC-specific data when applicable
    if (isSsc.value) {
      loadMemberCustomFields().catch(() => {});
      loadPhotoAlbum().catch(() => {});
      loadUserTimezone().catch(() => {});
      loadReferralLink().catch(() => {});
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load account information';
  } finally {
    loading.value = false;
  }
};

const startEditingHomeAddress = () => {
  editingHomeAddress.value = true;
  homeAddressError.value = '';
  if (!savedHomeAddressSnapshot.value) {
    savedHomeAddressSnapshot.value = { ...homeAddressForm.value };
  }
};

const cancelEditingHomeAddress = () => {
  editingHomeAddress.value = false;
  homeAddressError.value = '';
  if (savedHomeAddressSnapshot.value) {
    homeAddressForm.value = { ...savedHomeAddressSnapshot.value };
  }
};

const savePreferredName = async () => {
  try {
    if (!userId.value) return;
    savingPreferredName.value = true;
    preferredNameError.value = '';
    await api.put(`/users/${userId.value}`, { preferredName: preferredNameForm.value });
    await fetchAccountInfo();
    try {
      await authStore.refreshUser();
    } catch {
      // non-blocking
    }
    alert('Preferred name saved successfully!');
  } catch (err) {
    preferredNameError.value = err.response?.data?.error?.message || 'Failed to save preferred name';
    alert(preferredNameError.value);
  } finally {
    savingPreferredName.value = false;
  }
};

const saveHomeAddress = async () => {
  try {
    savingHomeAddress.value = true;
    homeAddressError.value = '';
    await api.put('/payroll/me/home-address', {
      homeStreetAddress: homeAddressForm.value.street,
      homeAddressLine2: homeAddressForm.value.line2,
      homeCity: homeAddressForm.value.city,
      homeState: homeAddressForm.value.state,
      homePostalCode: homeAddressForm.value.postalCode
    });
    await fetchAccountInfo();
    savedHomeAddressSnapshot.value = { ...homeAddressForm.value };
    editingHomeAddress.value = false;
    alert('Home address saved successfully!');
  } catch (err) {
    homeAddressError.value = err.response?.data?.error?.message || 'Failed to save home address';
    alert(homeAddressError.value);
  } finally {
    savingHomeAddress.value = false;
  }
};

const downloadCompletionPackage = async () => {
  try {
    downloading.value = true;
    const response = await api.get(`/users/${userId.value}/completion-package`, {
      responseType: 'blob'
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `completion-package-${Date.now()}.zip`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to download completion package';
    alert(error.value);
  } finally {
    downloading.value = false;
  }
};


onMounted(() => {
  if (userId.value) {
    fetchAccountInfo();
    fetchStravaStatus();
    fetchMyUserInfo();
    fetchAssignedOffices();
    fetchProviderPublicProfile();
  }
});
</script>

<style scoped>
.profile-photo-row {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
}

.photo-preview {
  width: 86px;
  height: 86px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: var(--bg);
  overflow: hidden;
  display: grid;
  place-items: center;
}

.photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-fallback {
  font-weight: 900;
  font-size: 26px;
  color: var(--text-primary);
}

.photo-actions {
  min-width: 260px;
}

.page-header {
  margin-bottom: 32px;
}

.page-header h1 {
  margin: 0;
  color: var(--text-primary);
}

.account-info-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
}

.info-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.info-section:last-child {
  border-bottom: none;
}

.info-section h2 {
  margin: 0 0 20px 0;
  color: var(--text-primary);
  font-size: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.compact-card {
  padding: 12px 14px !important;
}

.compact-card .section-header {
  margin-bottom: 10px;
  gap: 12px;
}

.compact-card h3 {
  font-size: 16px;
}

.compact-card .hint {
  font-size: 12px;
  line-height: 1.4;
}

.security-sso-locked {
  opacity: 0.7;
}

.security-sso-note {
  color: #4b5563;
  font-weight: 600;
}

.btn-compact {
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 700;
}

.compact-card .fields-grid {
  gap: 12px;
}

.compact-card .field-item input,
.compact-card .field-item select,
.compact-card .field-item textarea {
  padding: 8px 10px;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 18px 0;
}

.category-tab {
  border: 1px solid var(--border);
  background: white;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
}

.category-tab.active {
  background: #e3f2fd;
  border-color: #90caf9;
  color: #1e3a8a;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-item-full {
  grid-column: 1 / -1;
}

.field-item label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}

.required-asterisk {
  color: #dc3545;
  margin-left: 4px;
}

.agency-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #374151;
  font-size: 12px;
  font-weight: 600;
}

.field-item input,
.field-item select,
.field-item textarea {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.checkbox-label {
  font-weight: 600;
  color: var(--text-secondary);
}

.multi-select {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  background: #fafbfc;
}

.multi-select-option {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
  color: var(--text-primary);
}

.download-section {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  text-align: center;
}

.download-description {
  margin: 0 0 20px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.btn-large {
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 600;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.info-item {
  padding: 12px;
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
  font-size: 14px;
}

.progress-item .progress-value,
.time-item .time-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--primary);
  margin-top: 4px;
}

.progress-description,
.time-description {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  font-style: italic;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.passwordless-link-section {
  padding: 20px;
  background: #e7f3ff;
  border-radius: 8px;
  border: 1px solid var(--primary, #007bff);
}

.link-description {
  margin: 0 0 15px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.link-container {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.link-input {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  font-family: monospace;
  background: white;
  cursor: text;
}

.link-input:focus {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.link-help {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  font-style: italic;
}

.link-actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.token-status {
  margin-bottom: 15px;
  padding: 10px;
  background: white;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.token-status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.token-expiry-info {
  text-align: right;
  font-size: 14px;
}

.time-until-expiry {
  font-size: 12px;
  color: #666;
}

.status-valid {
  color: #28a745;
  margin-left: 8px;
  font-weight: 600;
}

.status-expired {
  color: #dc3545;
  margin-left: 8px;
  font-weight: 600;
}

.reset-modal-inline {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: 10px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.reset-modal-inline label {
  font-size: 12px;
  font-weight: 500;
}

.expiration-input {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.supervisors-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.supervisor-item {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.supervisor-name {
  margin-bottom: 8px;
  font-size: 16px;
  color: var(--text-primary);
}

.supervisor-agency {
  color: var(--text-secondary);
  font-weight: normal;
  font-size: 14px;
}

.supervisor-contact {
  margin-top: 4px;
  font-size: 14px;
  color: var(--text-secondary);
}

@media (max-width: 860px) {
  .container {
    padding-left: 10px;
    padding-right: 10px;
  }

  .page-header {
    margin-bottom: 14px;
  }

  .page-header h1 {
    font-size: 1.75rem;
    line-height: 1.1;
  }

  .account-info-content {
    padding: 14px;
    border-radius: 10px;
  }

  .info-section {
    margin-bottom: 20px;
    padding-bottom: 14px;
  }

  .info-section h2 {
    margin-bottom: 12px;
    font-size: 1.55rem;
    line-height: 1.1;
  }

  .section-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .profile-photo-row {
    align-items: flex-start;
    gap: 10px;
  }

  .photo-preview {
    width: 72px;
    height: 72px;
    border-radius: 14px;
  }

  .photo-actions {
    min-width: 0;
    width: 100%;
  }

  .btn-large {
    width: 100%;
    padding: 11px 14px;
    font-size: 14px;
  }

  .fields-grid,
  .info-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .field-item input,
  .field-item select,
  .field-item textarea {
    font-size: 16px;
  }
}

/* ── Photo album ────────────────────────────────────────── */
.photo-album-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.album-item {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  aspect-ratio: 1 / 1;
  background: #f0f0f0;
  border: 2px solid transparent;
  transition: border-color 0.15s;
}

.album-item--profile {
  border-color: #4a6cf7;
}

.album-item--flagged {
  border-color: #e63946;
  opacity: 0.75;
}

.album-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.album-item-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}

.album-item:hover .album-item-overlay {
  opacity: 1;
}

.album-source-badge {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.badge-profile {
  background: #4a6cf7;
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 99px;
  font-weight: 600;
}

.badge-flagged {
  background: #e63946;
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 99px;
  font-weight: 600;
}

.badge-source {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 99px;
}

.album-item-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: 600;
}

.btn-danger {
  background: #e63946;
  color: #fff;
}

.btn-danger:hover {
  background: #c1121f;
}
</style>

