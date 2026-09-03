<template>
  <div class="ssp">
    <header class="ssp-page-header">
      <div class="ssp-page-title">
        <h2>School Staff</h2>
        <p>Manage staff accounts linked to this school portal.</p>
      </div>
      <div class="ssp-page-actions">
        <button
          v-if="showCodesButton"
          class="ssp-btn ssp-btn-outline"
          type="button"
          :title="codesPrivacyHelp"
          @click="$emit('toggle-client-label-mode')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Zm8.94-2.06a9 9 0 0 0 .06-1.88 9 9 0 0 0-.06-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a8.06 8.06 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.36 2.54a8.06 8.06 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.6 7.44a.5.5 0 0 0 .12.64l2.03 1.58a9 9 0 0 0-.06 1.88c0 .64.02 1.27.06 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54A.5.5 0 0 0 10 22h4a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.13-.55 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58Z" fill="currentColor"/></svg>
          Show codes
        </button>
        <button
          v-if="showSchoolSwitcher"
          class="ssp-btn ssp-btn-outline"
          type="button"
          @click="$emit('open-school-switcher')"
        >
          Switch school
          <svg class="ssp-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z" fill="currentColor"/></svg>
        </button>
        <button
          v-if="canAdd"
          class="ssp-btn ssp-btn-primary"
          type="button"
          @click="scrollToAddForm"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          Add school staff
        </button>
        <router-link v-if="canManageTickets" class="ssp-btn ssp-btn-outline" :to="ticketsPath">
          Support tickets
        </router-link>
      </div>
    </header>

    <div v-if="error" class="ssp-alert ssp-alert-error">{{ error }}</div>
    <div v-if="success" class="ssp-alert ssp-alert-success">{{ success }}</div>

    <section v-if="schoolGroupEmail || currentUserStaff" class="ssp-admin-box ssp-subscription-box">
      <h3>Group email subscription</h3>
      <p class="ssp-role-help">
        Changing a subscription here updates delivery for the school group
        <strong>{{ schoolGroupEmail || 'email' }}</strong>.
        Staff stay in the portal and remain members of the group. Options match Google Groups:
        Each email, Digest, Abridged, or No email.
      </p>
      <label v-if="currentUserStaff && canChangeGroupSubscription(currentUserStaff)" class="ssp-field ssp-field-role">
        <span>Your subscription to {{ schoolGroupEmail || 'the school group' }}</span>
        <select
          class="ssp-select"
          :value="normalizeGroupSubscription(currentUserStaff.group_email_subscription)"
          :disabled="savingSubscriptionId === currentUserStaff.id"
          @change="changeGroupSubscription(currentUserStaff, $event.target.value)"
        >
          <option v-for="opt in GROUP_SUBSCRIPTION_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
    </section>

    <div class="ssp-toolbar">
      <div class="ssp-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search staff..."
          aria-label="Search staff"
        />
      </div>
      <div class="ssp-toolbar-actions">
        <div class="ssp-filter-wrap" v-click-outside="() => filterOpen = false">
          <button class="ssp-icon-btn" type="button" :class="{ active: roleFilter !== 'all' }" @click="filterOpen = !filterOpen">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Filter
          </button>
          <div v-if="filterOpen" class="ssp-filter-menu">
            <button
              v-for="opt in roleFilterOptions"
              :key="opt.value"
              type="button"
              :class="{ active: roleFilter === opt.value }"
              @click="setRoleFilter(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <button
          class="ssp-icon-btn"
          type="button"
          :class="{ active: viewMode === 'grid' }"
          title="Grid view"
          @click="viewMode = 'grid'"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" fill="currentColor"/><rect x="14" y="4" width="6" height="6" rx="1" fill="currentColor"/><rect x="4" y="14" width="6" height="6" rx="1" fill="currentColor"/><rect x="14" y="14" width="6" height="6" rx="1" fill="currentColor"/></svg>
        </button>
        <button
          class="ssp-icon-btn"
          type="button"
          :class="{ active: viewMode === 'list' }"
          title="List view"
          @click="viewMode = 'list'"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <button class="ssp-icon-btn" type="button" title="Refresh" :disabled="loading" @click="load">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </button>
      </div>
    </div>

    <div v-if="loading" class="ssp-empty">Loading staff…</div>
    <div v-else-if="filteredStaff.length === 0" class="ssp-empty">
      {{ staff.length === 0 ? 'No school staff users found.' : 'No staff match your search or filter.' }}
    </div>

    <div v-else :class="viewMode === 'grid' ? 'ssp-grid' : 'ssp-list'">
      <article v-for="(u, idx) in paginatedStaff" :key="u.id" class="ssp-card">
        <div class="ssp-card-head">
          <div
            class="ssp-avatar"
            :class="[avatarToneClass(idx), { 'has-photo': !!staffPhotoUrl(u) }]"
          >
            <img
              v-if="staffPhotoUrl(u)"
              :src="staffPhotoUrl(u)"
              :alt="`${displayName(u)} photo`"
              class="ssp-avatar-img"
              loading="lazy"
              @error="markPhotoFailed(u.id)"
            />
            <span v-else class="ssp-avatar-initials">{{ staffInitials(u) }}</span>
          </div>
          <div class="ssp-card-identity">
            <div class="ssp-name">{{ displayName(u) }}</div>
            <div class="ssp-badges">
              <span v-if="u.needs_activation" class="ssp-badge ssp-badge-pending">Needs activation</span>
              <span v-if="u.is_school_admin" class="ssp-badge ssp-badge-admin">School Admin</span>
              <span v-if="u.is_scheduler" class="ssp-badge ssp-badge-scheduler">Scheduler</span>
            </div>
          </div>
          <div class="ssp-menu-wrap" v-click-outside="() => closeMenu(u.id)">
            <button class="ssp-menu-btn" type="button" aria-label="More actions" @click="toggleMenu(u.id)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="18" r="1.5" fill="currentColor"/></svg>
            </button>
            <div v-if="openMenuId === u.id" class="ssp-menu">
              <button v-if="canActivate(u)" type="button" @click="menuAction(() => openActivate(u))">Activate account</button>
              <button v-if="canEdit" type="button" @click="menuAction(() => openEdit(u))">Edit</button>
              <button v-if="canToggleSchoolRoles(u)" type="button" @click="menuAction(() => openPermissions(u))">Permissions</button>
              <button v-if="u.id !== currentUserId" type="button" @click="menuAction(() => openMessage(u))">Message</button>
              <button v-if="canSendReset(u)" type="button" @click="menuAction(() => openResetPasswordModal(u))">Reset password</button>
              <button v-if="canRemove(u)" type="button" class="danger" @click="menuAction(() => removeUser(u))">Remove</button>
            </div>
          </div>
        </div>

        <div class="ssp-card-meta">
          <div>{{ u.email }}</div>
          <div>Last login: {{ u.last_login ? formatDate(u.last_login) : 'Never' }}</div>
          <div v-if="u.password_reset_expires_at" class="ssp-meta-sub">
            Reset link expires: {{ formatDate(u.password_reset_expires_at) }}
          </div>
          <div class="ssp-meta-sub">
            Group email ({{ schoolGroupEmail || u.school_group_email || 'school group' }}):
            {{ groupSubscriptionLabel(u.group_email_subscription) }}
          </div>
          <label v-if="canChangeGroupSubscription(u)" class="ssp-inline-sub">
            <span>Subscription</span>
            <select
              class="ssp-select ssp-select-compact"
              :value="normalizeGroupSubscription(u.group_email_subscription)"
              :disabled="savingSubscriptionId === u.id"
              @change="changeGroupSubscription(u, $event.target.value)"
            >
              <option v-for="opt in GROUP_SUBSCRIPTION_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
        </div>

        <div class="ssp-quick-actions">
          <button
            v-if="canActivate(u)"
            type="button"
            class="ssp-quick-btn ssp-quick-activate"
            title="Activate account"
            :disabled="activatingId === u.id"
            @click="openActivate(u)"
          >
            <span>{{ activatingId === u.id ? 'Activating…' : 'Activate' }}</span>
          </button>
          <button v-if="canEdit" type="button" class="ssp-quick-btn" title="Edit" @click="openEdit(u)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M13.5 6.5l3 3" stroke="currentColor" stroke-width="1.8"/></svg>
            <span>Edit</span>
          </button>
          <button
            v-if="canToggleSchoolRoles(u)"
            type="button"
            class="ssp-quick-btn"
            title="Permissions"
            @click="openPermissions(u)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 4v5c0 4.4-3 8.5-7 9-4-.5-7-4.6-7-9V7l7-4Z" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>
            <span>Permissions</span>
          </button>
          <button
            v-if="canToggleSchoolRoles(u)"
            type="button"
            class="ssp-quick-btn"
            title="Scheduler role"
            :disabled="settingSchedulerId === u.id"
            @click="toggleScheduler(u)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="1.8"/></svg>
            <span>{{ settingSchedulerId === u.id ? 'Saving…' : (u.is_scheduler ? 'Scheduler' : 'Schedule') }}</span>
          </button>
          <button
            v-if="u.id !== currentUserId"
            type="button"
            class="ssp-quick-btn"
            title="Message"
            @click="openMessage(u)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v10H8l-3 3V6Z" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>
            <span>Message</span>
          </button>
        </div>

        <div class="ssp-card-footer">
          <button
            v-if="canRemove(u)"
            type="button"
            class="ssp-footer-btn ssp-footer-danger"
            :disabled="removingId === u.id"
            @click="removeUser(u)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M7 7l1 12h8l1-12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>
            {{ removingId === u.id ? 'Removing…' : 'Remove' }}
          </button>
          <button
            v-if="canSendReset(u)"
            type="button"
            class="ssp-footer-btn"
            :class="{ 'ssp-footer-temp': hasVisibleTempPassword(u) }"
            :disabled="sendingResetId === u.id"
            :title="tempPasswordButtonTitle(u)"
            @click="onTempPasswordButtonClick(u)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>
            <span class="ssp-footer-temp-text">{{ tempPasswordButtonLabel(u) }}</span>
          </button>
          <button
            v-if="canRequest && !canRemove(u) && !canSendReset(u)"
            type="button"
            class="ssp-footer-btn"
            :disabled="submitting"
            @click="requestDeletionFor(u)"
          >
            Request deletion
          </button>
        </div>
      </article>
    </div>

    <nav v-if="totalPages > 1" class="ssp-pagination" aria-label="Staff pages">
      <button type="button" class="ssp-page-btn" :disabled="currentPage === 1" @click="currentPage -= 1">‹</button>
      <button
        v-for="page in totalPages"
        :key="page"
        type="button"
        class="ssp-page-btn"
        :class="{ active: currentPage === page }"
        @click="currentPage = page"
      >
        {{ page }}
      </button>
      <button type="button" class="ssp-page-btn" :disabled="currentPage === totalPages" @click="currentPage += 1">›</button>
    </nav>

    <section v-if="canAdd" ref="addFormRef" class="ssp-add-section">
      <h3>Add School Staff</h3>
      <div class="ssp-add-grid">
        <label class="ssp-field">
          <span>Name (optional)</span>
          <div class="ssp-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M5 20c1.2-3.5 4-5.5 7-5.5s5.8 2 7 5.5" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>
            <input v-model="addName" type="text" placeholder="e.g., Jane Doe" />
          </div>
        </label>
        <label class="ssp-field">
          <span>Email (required)</span>
          <div class="ssp-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M4 8l8 6 8-6" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>
            <input v-model="addEmail" type="email" placeholder="e.g., jane@school.org" />
          </div>
        </label>
        <label class="ssp-field">
          <span>Role/Title (optional)</span>
          <div class="ssp-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M8 7v10M16 7v10M6 17h4M14 17h4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>
            <input v-model="addRoleTitle" type="text" placeholder="e.g., Special Education Director" />
          </div>
        </label>
        <label class="ssp-field ssp-field-role">
          <span>Access role</span>
          <select v-model="addAccessRole" class="ssp-select">
            <option value="standard">Standard account</option>
            <option value="school_admin">School Admin</option>
            <option value="scheduler">Scheduler</option>
            <option value="school_admin_scheduler">School Admin + Scheduler</option>
          </select>
        </label>
        <label class="ssp-field ssp-field-role">
          <span>Group email subscription</span>
          <select v-model="addGroupEmailSubscription" class="ssp-select">
            <option v-for="opt in GROUP_SUBSCRIPTION_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
      </div>
      <p class="ssp-role-help">{{ addRoleHelperText }}</p>
      <p class="ssp-role-help">
        Subscription is for the school group
        <strong>{{ schoolGroupEmail || 'email' }}</strong>.
        Changing it does not remove this person from the portal.
      </p>
      <div class="ssp-add-actions">
        <button class="ssp-btn ssp-btn-primary" type="button" :disabled="adding" @click="addStaff">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          {{ adding ? 'Adding…' : 'Add staff' }}
        </button>
      </div>
      <div v-if="addSuccess" class="ssp-alert ssp-alert-success">{{ addSuccess }}</div>
    </section>

    <section v-if="isCurrentUserSchoolAdmin" class="ssp-admin-box">
      <h3>School Admin controls</h3>
      <button class="ssp-btn ssp-btn-outline" type="button" :disabled="forfeiting" @click="forfeitSchoolAdmin">
        {{ forfeiting ? 'Saving…' : 'Forfeit School Admin (me)' }}
      </button>
    </section>

    <section v-if="canRequest && !canAdd" class="ssp-admin-box">
      <h3>Request an additional account</h3>
      <div class="ssp-add-grid">
        <label class="ssp-field">
          <span>Name (optional)</span>
          <input v-model="requestName" class="ssp-plain-input" type="text" placeholder="e.g., Jane Doe" />
        </label>
        <label class="ssp-field">
          <span>Email (optional)</span>
          <input v-model="requestEmail" class="ssp-plain-input" type="email" placeholder="e.g., jane@school.org" />
        </label>
      </div>
      <button class="ssp-btn ssp-btn-primary" type="button" :disabled="submitting" @click="submitNewAccountRequest">
        {{ submitting ? 'Sending…' : 'Request additional login' }}
      </button>
    </section>

    <div v-if="showActivateModal" class="ssp-modal-overlay" @click.self="closeActivate">
      <div class="ssp-modal ssp-modal-wide" @click.stop>
        <div class="ssp-modal-head">
          <div>
            <strong>Activate account</strong>
            <p class="ssp-modal-sub">{{ activateTarget ? displayName(activateTarget) : '' }}</p>
          </div>
          <button class="ssp-btn ssp-btn-outline" type="button" @click="closeActivate">Close</button>
        </div>
        <div class="ssp-modal-body">
          <div v-if="error" class="ssp-alert ssp-alert-error">{{ error }}</div>
          <template v-if="!activateResult">
            <p class="ssp-reset-lead">
              This person is visible in the portal but cannot log in until you set their title/access and issue a temporary password.
            </p>
            <label class="ssp-field">
              <span>Title / role</span>
              <input v-model="activateForm.roleTitle" class="ssp-plain-input" type="text" placeholder="e.g. School social worker" />
            </label>
            <label class="ssp-check-row">
              <input v-model="activateForm.isSchoolAdmin" type="checkbox" />
              School Admin
            </label>
            <label class="ssp-check-row">
              <input v-model="activateForm.isScheduler" type="checkbox" />
              Scheduler
            </label>
            <p class="ssp-reset-lead">
              A random temporary password is recommended so client information stays protected.
            </p>
            <label v-if="canSetCustomTempPassword" class="ssp-check-row">
              <input v-model="useCustomTempPassword" type="checkbox" />
              Set a custom temporary password instead
            </label>
            <p v-if="canSetCustomTempPassword" class="ssp-role-help">
              Only use a custom password when the staff member cannot use the random one. Random passwords better protect client data.
            </p>
            <label v-if="canSetCustomTempPassword && useCustomTempPassword" class="ssp-field">
              <span>Custom temporary password</span>
              <input
                v-model="customTempPassword"
                class="ssp-plain-input"
                type="text"
                autocomplete="new-password"
                placeholder="At least 8 characters, include a letter"
              />
            </label>
            <div class="ssp-modal-actions">
              <button class="ssp-btn ssp-btn-outline" type="button" @click="closeActivate">Cancel</button>
              <button
                class="ssp-btn ssp-btn-primary"
                type="button"
                :disabled="activatingId === activateTarget?.id"
                @click="confirmActivate"
              >
                {{ activatingId === activateTarget?.id ? 'Activating…' : (useCustomTempPassword && canSetCustomTempPassword ? 'Activate & set temp password' : 'Activate & generate temp password') }}
              </button>
            </div>
          </template>
          <template v-else>
            <div class="ssp-reset-success">
              <p>Account activated. Copy the temporary password now.</p>
              <button type="button" class="ssp-temp-password-display" @click="copyTempPassword(activateTarget, activateResult.temporaryPassword)">
                <span class="ssp-temp-password-value">{{ activateResult.temporaryPassword }}</span>
                <span class="ssp-temp-password-meta">{{ formatTempPasswordExpiry(activateResult.expiresAt) }} · Click to copy</span>
              </button>
            </div>
            <div class="ssp-modal-actions">
              <button class="ssp-btn ssp-btn-primary" type="button" @click="closeActivate">Done</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-if="showResetModal" class="ssp-modal-overlay" @click.self="closeResetPasswordModal">
      <div class="ssp-modal ssp-modal-wide" @click.stop>
        <div class="ssp-modal-head">
          <div>
            <strong>Reset password</strong>
            <p class="ssp-modal-sub">{{ resetTarget ? displayName(resetTarget) : '' }}</p>
          </div>
          <button class="ssp-btn ssp-btn-outline" type="button" @click="closeResetPasswordModal">Close</button>
        </div>
        <div class="ssp-modal-body">
          <div v-if="error" class="ssp-alert ssp-alert-error">{{ error }}</div>
          <template v-if="!resetResult">
            <p class="ssp-reset-lead">
              This creates a <strong>temporary password</strong> for {{ resetTarget?.email || 'this staff member' }}.
              It replaces their current password immediately.
              A random password is recommended so client information stays protected.
            </p>
            <ol class="ssp-reset-steps">
              <li>{{ canSetCustomTempPassword && useCustomTempPassword ? 'Confirm below to set your custom temporary password.' : 'Confirm below to generate a random temporary password.' }}</li>
              <li>Share it privately with the staff member (in person, phone, or secure message).</li>
              <li>They sign in with their school email and the temporary password.</li>
              <li>On first login, they will be prompted to set a new permanent password, then a short portal tour.</li>
              <li>The temporary password expires in 48 hours.</li>
            </ol>
            <label v-if="canSetCustomTempPassword" class="ssp-check-row">
              <input v-model="useCustomTempPassword" type="checkbox" />
              Set a custom temporary password instead
            </label>
            <p v-if="canSetCustomTempPassword" class="ssp-role-help">
              Only use a custom password when the staff member cannot use the random one. Random passwords better protect client data.
            </p>
            <label v-if="canSetCustomTempPassword && useCustomTempPassword" class="ssp-field">
              <span>Custom temporary password</span>
              <input
                v-model="customTempPassword"
                class="ssp-plain-input"
                type="text"
                autocomplete="new-password"
                placeholder="At least 8 characters, include a letter"
              />
            </label>
            <div class="ssp-reset-link-actions">
              <p class="ssp-reset-lead">Or send a <strong>reset link</strong> instead — their current password stays in place until they use the link.</p>
              <div class="ssp-modal-actions ssp-modal-actions-wrap">
                <button class="ssp-btn ssp-btn-outline" type="button" :disabled="issuingResetLink" @click="copyResetLink">
                  {{ issuingResetLink === 'copy' ? 'Copying…' : 'Copy reset link' }}
                </button>
                <button class="ssp-btn ssp-btn-outline" type="button" :disabled="issuingResetLink || !resetTarget?.email" @click="emailResetLink">
                  {{ issuingResetLink === 'email' ? 'Sending…' : 'Email reset link' }}
                </button>
              </div>
              <p v-if="resetLinkCopied" class="ssp-role-help">Reset link copied. It expires in 48 hours.</p>
              <p v-if="resetLinkEmailed" class="ssp-role-help">Reset link emailed from ITSCO Technology Team.</p>
            </div>
            <div class="ssp-modal-actions">
              <button class="ssp-btn ssp-btn-outline" type="button" @click="closeResetPasswordModal">Cancel</button>
              <button class="ssp-btn ssp-btn-primary" type="button" :disabled="sendingResetId === resetTarget?.id" @click="confirmResetPassword">
                {{ sendingResetId === resetTarget?.id ? 'Saving…' : (useCustomTempPassword && canSetCustomTempPassword ? 'Set custom temporary password' : 'Generate temporary password') }}
              </button>
            </div>
          </template>
          <template v-else>
            <div class="ssp-reset-success">
              <p>Temporary password created. Copy it now — you will not be able to view it again after leaving this screen unless you generate a new one.</p>
              <button type="button" class="ssp-temp-password-display" @click="copyTempPassword(resetTarget)">
                <span class="ssp-temp-password-value">{{ resetResult.temporaryPassword }}</span>
                <span class="ssp-temp-password-meta">{{ formatTempPasswordExpiry(resetResult.expiresAt) }} · Click to copy</span>
              </button>
            </div>
            <ul class="ssp-reset-steps ssp-reset-steps-compact">
              <li v-for="(line, i) in resetResult.instructions" :key="i">{{ line }}</li>
            </ul>
            <div class="ssp-modal-actions">
              <button class="ssp-btn ssp-btn-primary" type="button" @click="closeResetPasswordModal">Done</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-if="showEditModal" class="ssp-modal-overlay" @click.self="closeEdit">
      <div class="ssp-modal" @click.stop>
        <div class="ssp-modal-head">
          <strong>Edit school staff</strong>
          <button class="ssp-btn ssp-btn-outline" type="button" @click="closeEdit">Close</button>
        </div>
        <div class="ssp-modal-body">
          <label class="ssp-field">
            <span>First name</span>
            <input v-model="editForm.firstName" class="ssp-plain-input" type="text" placeholder="First name" />
          </label>
          <label class="ssp-field">
            <span>Last name</span>
            <input v-model="editForm.lastName" class="ssp-plain-input" type="text" placeholder="Last name" />
          </label>
          <label class="ssp-field">
            <span>Email</span>
            <input v-model="editForm.email" class="ssp-plain-input" type="email" placeholder="Email" />
          </label>
          <label class="ssp-field">
            <span>Role/Title</span>
            <input v-model="editForm.roleTitle" class="ssp-plain-input" type="text" placeholder="e.g., Special Education Director" />
          </label>
          <label class="ssp-field">
            <span>Group email subscription</span>
            <select v-model="editForm.groupEmailSubscription" class="ssp-select">
              <option v-for="opt in GROUP_SUBSCRIPTION_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <p class="ssp-role-help">
              You are changing their subscription to
              <strong>{{ schoolGroupEmail || editTarget?.school_group_email || 'the school group' }}</strong>.
              They stay in the portal and the group.
            </p>
          </label>
          <div class="ssp-modal-actions">
            <button class="ssp-btn ssp-btn-primary" type="button" :disabled="savingEdit" @click="saveEdit">
              {{ savingEdit ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showPermissionsModal" class="ssp-modal-overlay" @click.self="closePermissions">
      <div class="ssp-modal" @click.stop>
        <div class="ssp-modal-head">
          <div>
            <strong>Permissions</strong>
            <p class="ssp-modal-sub">{{ permissionsTarget ? displayName(permissionsTarget) : '' }}</p>
          </div>
          <button class="ssp-btn ssp-btn-outline" type="button" @click="closePermissions">Close</button>
        </div>
        <div class="ssp-modal-body">
          <div class="ssp-perm-row">
            <div>
              <div class="ssp-perm-title">School Admin</div>
              <div class="ssp-perm-copy">Manage staff, resets, and role assignments for this school.</div>
            </div>
            <button
              class="ssp-btn ssp-btn-outline"
              type="button"
              :disabled="!permissionsTarget || settingPrimaryId === permissionsTarget.id"
              @click="toggleSchoolAdmin(permissionsTarget)"
            >
              {{ settingPrimaryId === permissionsTarget?.id ? 'Saving…' : (permissionsTarget?.is_school_admin ? 'Remove' : 'Assign') }}
            </button>
          </div>
          <div class="ssp-perm-row">
            <div>
              <div class="ssp-perm-title">Scheduler</div>
              <div class="ssp-perm-copy">Limited/own-only school access. Excluded from Smart School ROI lists.</div>
            </div>
            <button
              class="ssp-btn ssp-btn-outline"
              type="button"
              :disabled="!permissionsTarget || settingSchedulerId === permissionsTarget.id"
              @click="toggleScheduler(permissionsTarget)"
            >
              {{ settingSchedulerId === permissionsTarget?.id ? 'Saving…' : (permissionsTarget?.is_scheduler ? 'Remove' : 'Assign') }}
            </button>
          </div>
          <div v-if="permissionsTarget && canChangeGroupSubscription(permissionsTarget)" class="ssp-perm-row ssp-perm-row-stack">
            <div>
              <div class="ssp-perm-title">Group email subscription</div>
              <div class="ssp-perm-copy">
                Changing their subscription to
                <strong>{{ schoolGroupEmail || permissionsTarget.school_group_email || 'the school group' }}</strong>.
                They stay in the portal and the group.
              </div>
            </div>
            <select
              class="ssp-select"
              :value="normalizeGroupSubscription(permissionsTarget.group_email_subscription)"
              :disabled="savingSubscriptionId === permissionsTarget.id"
              @change="changeGroupSubscription(permissionsTarget, $event.target.value)"
            >
              <option v-for="opt in GROUP_SUBSCRIPTION_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';
import { toUploadsUrl } from '../../../utils/uploadsUrl';
import {
  canSetCustomSchoolStaffTempPassword,
  validateCustomSchoolStaffTempPassword
} from '../../../utils/schoolStaffTempPassword';
import {
  GROUP_SUBSCRIPTION_OPTIONS,
  groupSubscriptionLabel,
  normalizeGroupSubscription
} from '../../../utils/schoolGroupSubscription.js';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  schoolName: { type: String, default: '' },
  showCodesButton: { type: Boolean, default: false },
  showSchoolSwitcher: { type: Boolean, default: false },
  codesPrivacyHelp: { type: String, default: '' }
});

defineEmits(['toggle-client-label-mode', 'open-school-switcher']);

const PAGE_SIZE = 10;

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const currentUserId = computed(() => authStore.user?.id);

const isAgencyAdmin = computed(() =>
  ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(roleNorm.value)
);
const isCurrentUserSchoolAdmin = computed(() => {
  const uid = currentUserId.value;
  if (!uid) return false;
  return staff.value.some((s) => s.id === uid && s.is_school_admin);
});

const canRequest = computed(() => roleNorm.value === 'school_staff');
const canRemove = (u) =>
  isAgencyAdmin.value ||
  (roleNorm.value === 'school_staff' && isCurrentUserSchoolAdmin.value && u.id !== currentUserId.value);
const canSendReset = (u) =>
  (isAgencyAdmin.value || (roleNorm.value === 'school_staff' && isCurrentUserSchoolAdmin.value)) &&
  u.id !== currentUserId.value;
const canActivate = (u) =>
  !!u?.needs_activation &&
  (isAgencyAdmin.value || (roleNorm.value === 'school_staff' && isCurrentUserSchoolAdmin.value));
const canAdd = computed(
  () => isAgencyAdmin.value || (roleNorm.value === 'school_staff' && isCurrentUserSchoolAdmin.value)
);
const canEdit = computed(() => isAgencyAdmin.value || (roleNorm.value === 'school_staff' && isCurrentUserSchoolAdmin.value));
const canChangeGroupSubscription = (u) =>
  !!u?.id && (canEdit.value || Number(u.id) === Number(currentUserId.value));
const canToggleSchoolRoles = (u) => isAgencyAdmin.value || (roleNorm.value === 'school_staff' && isCurrentUserSchoolAdmin.value && u.id !== currentUserId.value);
const canManageTickets = computed(() =>
  ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(roleNorm.value)
);
const canSetCustomTempPassword = computed(() => canSetCustomSchoolStaffTempPassword(roleNorm.value));
const useCustomTempPassword = ref(false);
const customTempPassword = ref('');

const ticketsPath = computed(() => {
  const query = `schoolOrganizationId=${encodeURIComponent(props.schoolOrganizationId)}`;
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/tickets?${query}` : `/tickets?${query}`;
});

const staff = ref([]);
const schoolGroupEmail = ref('');
const currentUserStaff = computed(() => staff.value.find((s) => Number(s.id) === Number(currentUserId.value)) || null);
const loading = ref(false);
const error = ref('');
const removingId = ref(null);
const sendingResetId = ref(null);
const issuingResetLink = ref('');
const resetLinkCopied = ref(false);
const resetLinkEmailed = ref(false);

const submitting = ref(false);
const requestName = ref('');
const requestEmail = ref('');
const success = ref('');

const adding = ref(false);
const addName = ref('');
const addEmail = ref('');
const addRoleTitle = ref('');
const addAccessRole = ref('standard');
const addGroupEmailSubscription = ref('all_mail');
const addSuccess = ref('');
const addFormRef = ref(null);

const showEditModal = ref(false);
const editTarget = ref(null);
const editForm = ref({ firstName: '', lastName: '', email: '', roleTitle: '', groupEmailSubscription: 'all_mail' });
const savingEdit = ref(false);
const savingSubscriptionId = ref(null);
const settingPrimaryId = ref(null);
const settingSchedulerId = ref(null);
const forfeiting = ref(false);

const searchQuery = ref('');
const roleFilter = ref('all');
const filterOpen = ref(false);
const viewMode = ref('grid');
const currentPage = ref(1);
const openMenuId = ref(null);
const photoLoadFailed = ref({});

const showPermissionsModal = ref(false);
const permissionsTarget = ref(null);

const showResetModal = ref(false);
const resetTarget = ref(null);
const resetResult = ref(null);
const issuedTempPasswords = ref({});
const showActivateModal = ref(false);
const activateTarget = ref(null);
const activateResult = ref(null);
const activatingId = ref(null);
const activateForm = ref({
  roleTitle: '',
  isSchoolAdmin: false,
  isScheduler: false
});

const roleFilterOptions = [
  { value: 'all', label: 'All roles' },
  { value: 'school_admin', label: 'School Admin' },
  { value: 'scheduler', label: 'Scheduler' },
  { value: 'standard', label: 'Standard' }
];

const avatarTones = ['tone-green', 'tone-purple', 'tone-blue', 'tone-tan'];

const displayName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'School staff';

const staffInitials = (u) => {
  const first = String(u?.first_name || '').trim();
  const last = String(u?.last_name || '').trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  const email = String(u?.email || '').trim();
  return email ? email.slice(0, 2).toUpperCase() : 'SS';
};

const staffPhotoUrl = (u) => {
  if (!u?.id || photoLoadFailed.value[u.id]) return null;
  const raw = u.profile_photo_url || u.profile_photo_path || null;
  return toUploadsUrl(raw) || raw || null;
};

const markPhotoFailed = (userId) => {
  if (!userId) return;
  photoLoadFailed.value = { ...photoLoadFailed.value, [userId]: true };
};

const avatarToneClass = (idx) => avatarTones[idx % avatarTones.length];

const tempPasswordStorageKey = () => `sspTempPasswords:${props.schoolOrganizationId}`;

const loadIssuedTempPasswords = () => {
  try {
    const raw = window.sessionStorage.getItem(tempPasswordStorageKey());
    issuedTempPasswords.value = raw ? JSON.parse(raw) : {};
  } catch {
    issuedTempPasswords.value = {};
  }
  pruneExpiredTempPasswords();
};

const saveIssuedTempPasswords = () => {
  try {
    window.sessionStorage.setItem(tempPasswordStorageKey(), JSON.stringify(issuedTempPasswords.value));
  } catch {
    // ignore quota errors
  }
};

const pruneExpiredTempPasswords = () => {
  const now = Date.now();
  const next = {};
  for (const [userId, entry] of Object.entries(issuedTempPasswords.value || {})) {
    const expiresAt = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : 0;
    if (expiresAt > now) next[userId] = entry;
  }
  issuedTempPasswords.value = next;
  saveIssuedTempPasswords();
};

const storeIssuedTempPassword = (userId, temporaryPassword, expiresAt) => {
  if (!userId || !temporaryPassword) return;
  issuedTempPasswords.value = {
    ...issuedTempPasswords.value,
    [String(userId)]: { password: temporaryPassword, expiresAt }
  };
  saveIssuedTempPasswords();
};

const getIssuedTempPassword = (u) => {
  const entry = issuedTempPasswords.value?.[String(u?.id)];
  if (!entry?.password) return null;
  const expiresAt = entry.expiresAt ? new Date(entry.expiresAt).getTime() : 0;
  if (expiresAt && expiresAt <= Date.now()) return null;
  return entry;
};

const hasVisibleTempPassword = (u) => !!getIssuedTempPassword(u);

const formatTempPasswordExpiry = (expiresAt) => {
  if (!expiresAt) return 'Expires soon';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Expires in ${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `Expires in ${hours}h ${minutes}m`;
  return `Expires in ${minutes}m`;
};

const tempPasswordButtonLabel = (u) => {
  if (sendingResetId.value === u.id) return 'Generating…';
  const issued = getIssuedTempPassword(u);
  if (issued) return `${issued.password} · ${formatTempPasswordExpiry(issued.expiresAt)}`;
  if (u.has_active_temporary_password) {
    return `Temp active · ${formatTempPasswordExpiry(u.temporary_password_expires_at)}`;
  }
  return 'Reset Password';
};

const tempPasswordButtonTitle = (u) => {
  const issued = getIssuedTempPassword(u);
  if (issued) return 'Click to copy temporary password';
  if (u.has_active_temporary_password) return 'A temporary password is active. Click to generate a new one.';
  return 'Generate a temporary password for this staff member';
};

const onTempPasswordButtonClick = async (u) => {
  const issued = getIssuedTempPassword(u);
  if (issued) {
    await copyTempPassword(u, issued.password);
    return;
  }
  openResetPasswordModal(u);
};

const copyTempPassword = async (u, passwordOverride = null) => {
  const issued = passwordOverride || getIssuedTempPassword(u)?.password || resetResult.value?.temporaryPassword;
  if (!issued) return;
  try {
    await navigator.clipboard.writeText(issued);
    success.value = `Temporary password copied for ${displayName(u)}.`;
    setTimeout(() => { success.value = ''; }, 3500);
  } catch {
    success.value = `Temporary password: ${issued}`;
    setTimeout(() => { success.value = ''; }, 6000);
  }
};

const resetCustomTempPasswordFields = () => {
  useCustomTempPassword.value = false;
  customTempPassword.value = '';
};

const resolveCustomTempPasswordPayload = () => {
  if (!canSetCustomTempPassword.value || !useCustomTempPassword.value) return {};
  const validationError = validateCustomSchoolStaffTempPassword(customTempPassword.value);
  if (validationError) {
    error.value = validationError;
    return null;
  }
  return { temporaryPassword: String(customTempPassword.value || '').trim() };
};

const openResetPasswordModal = (u) => {
  resetTarget.value = u;
  resetResult.value = null;
  issuingResetLink.value = '';
  resetLinkCopied.value = false;
  resetLinkEmailed.value = false;
  resetCustomTempPasswordFields();
  showResetModal.value = true;
};

const closeResetPasswordModal = () => {
  showResetModal.value = false;
  resetTarget.value = null;
  resetResult.value = null;
  issuingResetLink.value = '';
  resetLinkCopied.value = false;
  resetLinkEmailed.value = false;
  resetCustomTempPasswordFields();
};

const issueResetLink = async ({ sendEmail = false } = {}) => {
  const u = resetTarget.value;
  const id = Number(u?.id);
  if (!id) return null;
  issuingResetLink.value = sendEmail ? 'email' : 'copy';
  error.value = '';
  resetLinkCopied.value = false;
  resetLinkEmailed.value = false;
  try {
    const r = await api.post(
      `/school-portal/${props.schoolOrganizationId}/school-staff/${id}/issue-reset-link`,
      { sendEmail }
    );
    return r.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create reset link';
    return null;
  } finally {
    issuingResetLink.value = '';
  }
};

const copyResetLink = async () => {
  const data = await issueResetLink({ sendEmail: false });
  const link = String(data?.tokenLink || '').trim();
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    resetLinkCopied.value = true;
    success.value = 'Password reset link copied.';
    setTimeout(() => { success.value = ''; }, 5000);
  } catch {
    error.value = 'Reset link created, but copying failed. Try again.';
  }
};

const emailResetLink = async () => {
  const data = await issueResetLink({ sendEmail: true });
  if (!data) return;
  if (data.emailSent) {
    resetLinkEmailed.value = true;
    success.value = data.message || 'Password reset link emailed.';
    setTimeout(() => { success.value = ''; }, 5000);
    return;
  }
  error.value = data.emailError || data.message || 'Reset link created but the email did not send.';
};

const openActivate = (u) => {
  activateTarget.value = u;
  activateResult.value = null;
  resetCustomTempPasswordFields();
  activateForm.value = {
    roleTitle: u?.role_title || '',
    isSchoolAdmin: !!u?.is_school_admin,
    isScheduler: !!u?.is_scheduler
  };
  showActivateModal.value = true;
};

const closeActivate = () => {
  showActivateModal.value = false;
  activateTarget.value = null;
  activateResult.value = null;
  resetCustomTempPasswordFields();
};

const confirmActivate = async () => {
  const u = activateTarget.value;
  const id = Number(u?.id);
  if (!id) return;
  try {
    activatingId.value = id;
    error.value = '';
    const passwordPayload = resolveCustomTempPasswordPayload();
    if (passwordPayload === null) return;
    const r = await api.post(`/school-portal/${props.schoolOrganizationId}/school-staff/${id}/activate`, {
      roleTitle: activateForm.value.roleTitle || null,
      isSchoolAdmin: activateForm.value.isSchoolAdmin === true,
      isScheduler: activateForm.value.isScheduler === true,
      ...passwordPayload
    });
    activateResult.value = {
      temporaryPassword: r.data?.temporaryPassword,
      expiresAt: r.data?.temporaryPasswordExpiresAt
    };
    if (r.data?.temporaryPassword) {
      storeIssuedTempPassword(id, r.data.temporaryPassword, r.data.temporaryPasswordExpiresAt);
    }
    await load();
    success.value = `Activated ${displayName(u)}. Share the temporary password privately.`;
    setTimeout(() => { success.value = ''; }, 5000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to activate account';
  } finally {
    activatingId.value = null;
  }
};

const confirmResetPassword = async () => {
  const u = resetTarget.value;
  const id = Number(u?.id);
  if (!id) return;
  try {
    sendingResetId.value = id;
    error.value = '';
    const passwordPayload = resolveCustomTempPasswordPayload();
    if (passwordPayload === null) return;
    const r = await api.post(
      `/school-portal/${props.schoolOrganizationId}/school-staff/${id}/send-reset-password`,
      passwordPayload
    );
    const temporaryPassword = r.data?.temporaryPassword;
    const expiresAt = r.data?.expiresAt;
    resetResult.value = {
      temporaryPassword,
      expiresAt,
      instructions: Array.isArray(r.data?.instructions) ? r.data.instructions : []
    };
    if (temporaryPassword) {
      storeIssuedTempPassword(id, temporaryPassword, expiresAt);
    }
    await load();
    success.value = 'Temporary password created. Share it privately with the staff member.';
    setTimeout(() => { success.value = ''; }, 5000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to reset password';
  } finally {
    sendingResetId.value = null;
  }
};

const filteredStaff = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return staff.value.filter((u) => {
    const name = displayName(u).toLowerCase();
    const email = String(u.email || '').toLowerCase();
    const matchesSearch = !q || name.includes(q) || email.includes(q);
    if (!matchesSearch) return false;

    if (roleFilter.value === 'school_admin') return !!u.is_school_admin;
    if (roleFilter.value === 'scheduler') return !!u.is_scheduler;
    if (roleFilter.value === 'standard') return !u.is_school_admin && !u.is_scheduler;
    return true;
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredStaff.value.length / PAGE_SIZE)));

const paginatedStaff = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredStaff.value.slice(start, start + PAGE_SIZE);
});

watch([searchQuery, roleFilter, filteredStaff], () => {
  currentPage.value = 1;
});

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages;
});

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString();
};

const setRoleFilter = (value) => {
  roleFilter.value = value;
  filterOpen.value = false;
};

const toggleMenu = (id) => {
  openMenuId.value = openMenuId.value === id ? null : id;
};

const closeMenu = (id) => {
  if (openMenuId.value === id) openMenuId.value = null;
};

const menuAction = (fn) => {
  openMenuId.value = null;
  fn();
};

const scrollToAddForm = () => {
  addFormRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const openMessage = async (u) => {
  const name = displayName(u);
  try {
    const aff = await api.get(`/school-portal/${props.schoolOrganizationId}/affiliation`);
    const parentAgencyId = aff.data?.active_agency_id ? Number(aff.data.active_agency_id) : null;
    if (!parentAgencyId) {
      error.value = 'No active agency affiliation found for this organization.';
      return;
    }
    router.push({
      path: route.path,
      query: {
        ...route.query,
        openChatWith: String(u.id),
        agencyId: String(parentAgencyId),
        organizationId: String(props.schoolOrganizationId),
        openChatWithName: name
      }
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to open chat';
  }
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    photoLoadFailed.value = {};
    const r = await api.get(`/school-portal/${props.schoolOrganizationId}/school-staff`);
    const data = r.data;
    if (Array.isArray(data)) {
      staff.value = data;
      schoolGroupEmail.value = data.find((s) => s.school_group_email)?.school_group_email || '';
    } else {
      staff.value = Array.isArray(data?.staff) ? data.staff : [];
      schoolGroupEmail.value = data?.schoolGroupEmail || staff.value.find((s) => s.school_group_email)?.school_group_email || '';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load school staff';
    staff.value = [];
    schoolGroupEmail.value = '';
  } finally {
    loading.value = false;
  }
};

const openEdit = (u) => {
  editTarget.value = u;
  editForm.value = {
    firstName: u.first_name || '',
    lastName: u.last_name || '',
    email: u.email || '',
    roleTitle: u.role_title || '',
    groupEmailSubscription: normalizeGroupSubscription(u.group_email_subscription)
  };
  showEditModal.value = true;
};

const closeEdit = () => {
  showEditModal.value = false;
  editTarget.value = null;
};

const openPermissions = (u) => {
  permissionsTarget.value = u;
  showPermissionsModal.value = true;
};

const closePermissions = () => {
  showPermissionsModal.value = false;
  permissionsTarget.value = null;
};

const changeGroupSubscription = async (u, subscription) => {
  if (!u?.id) return;
  const next = normalizeGroupSubscription(subscription);
  if (next === normalizeGroupSubscription(u.group_email_subscription)) return;
  try {
    savingSubscriptionId.value = u.id;
    error.value = '';
    const r = await api.patch(
      `/school-portal/${props.schoolOrganizationId}/school-staff/${u.id}/group-subscription`,
      { subscription: next }
    );
    const applied = r.data?.group_email_subscription || next;
    staff.value = staff.value.map((row) =>
      row.id === u.id ? { ...row, group_email_subscription: applied } : row
    );
    if (permissionsTarget.value?.id === u.id) {
      permissionsTarget.value = { ...permissionsTarget.value, group_email_subscription: applied };
    }
    if (r.data?.school_group_email) schoolGroupEmail.value = r.data.school_group_email;
    success.value = `Subscription for ${displayName(u)} set to ${groupSubscriptionLabel(applied)}.`;
    setTimeout(() => { success.value = ''; }, 3500);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update group email subscription';
  } finally {
    savingSubscriptionId.value = null;
  }
};

const saveEdit = async () => {
  const u = editTarget.value;
  if (!u?.id) return;
  const firstName = String(editForm.value.firstName || '').trim();
  const lastName = String(editForm.value.lastName || '').trim();
  const email = String(editForm.value.email || '').trim().toLowerCase();
  const roleTitle = String(editForm.value.roleTitle || '').trim();
  if (!email || !email.includes('@')) {
    error.value = 'Please enter a valid email address.';
    return;
  }
  try {
    savingEdit.value = true;
    error.value = '';
    await api.put(`/school-portal/${props.schoolOrganizationId}/school-staff/${u.id}`, {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email,
      roleTitle,
      isSchoolAdmin: !!u.is_school_admin,
      isScheduler: !!u.is_scheduler
    });
    if (canChangeGroupSubscription(u)) {
      const nextSub = normalizeGroupSubscription(editForm.value.groupEmailSubscription);
      if (nextSub !== normalizeGroupSubscription(u.group_email_subscription)) {
        await api.patch(`/school-portal/${props.schoolOrganizationId}/school-staff/${u.id}/group-subscription`, {
          subscription: nextSub
        });
      }
    }
    closeEdit();
    await load();
    success.value = 'Staff updated.';
    setTimeout(() => { success.value = ''; }, 3000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update staff';
  } finally {
    savingEdit.value = false;
  }
};

const toggleSchoolAdmin = async (u) => {
  if (!u?.id) return;
  const next = !u.is_school_admin;
  const label = displayName(u) || u.email || 'this user';
  const actionText = next
    ? `This will make ${label} a School Admin for this school. They will be able to add/edit school staff, reset passwords, remove access, and manage School Admin/Scheduler role assignments for this school.`
    : `This will remove School Admin access for ${label}. They will no longer be able to manage school staff or role assignments for this school unless another admin grants it again.`;
  if (!confirm(`${actionText}\n\nDo you want to continue?`)) return;
  try {
    settingPrimaryId.value = u.id;
    error.value = '';
    await api.patch(`/school-portal/${props.schoolOrganizationId}/school-staff/${u.id}/roles`, {
      isSchoolAdmin: next
    });
    await load();
    if (permissionsTarget.value?.id === u.id) {
      permissionsTarget.value = staff.value.find((s) => s.id === u.id) || null;
    }
    success.value = next ? 'School Admin assigned.' : 'School Admin removed.';
    setTimeout(() => { success.value = ''; }, 3000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update School Admin';
  } finally {
    settingPrimaryId.value = null;
  }
};

const toggleScheduler = async (u) => {
  if (!u?.id) return;
  const next = !u.is_scheduler;
  const label = displayName(u) || u.email || 'this user';
  const actionText = next
    ? `This will make ${label} a Scheduler for this school. Scheduler users get limited/own-only school access by default and will not appear in Smart School ROI assignment lists.`
    : `This will remove Scheduler from ${label}. They will return to standard school staff behavior unless other role flags are set.`;
  if (!confirm(`${actionText}\n\nDo you want to continue?`)) return;
  try {
    settingSchedulerId.value = u.id;
    error.value = '';
    await api.patch(`/school-portal/${props.schoolOrganizationId}/school-staff/${u.id}/roles`, {
      isScheduler: next
    });
    await load();
    if (permissionsTarget.value?.id === u.id) {
      permissionsTarget.value = staff.value.find((s) => s.id === u.id) || null;
    }
    success.value = next ? 'Scheduler assigned.' : 'Scheduler removed.';
    setTimeout(() => { success.value = ''; }, 3000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update Scheduler';
  } finally {
    settingSchedulerId.value = null;
  }
};

const forfeitSchoolAdmin = async () => {
  if (!confirm('Forfeit your School Admin access for this school?')) return;
  try {
    forfeiting.value = true;
    error.value = '';
    await api.post(`/school-portal/${props.schoolOrganizationId}/school-staff/forfeit-school-admin`);
    await load();
    success.value = 'You are no longer a School Admin for this school.';
    setTimeout(() => { success.value = ''; }, 3500);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to forfeit School Admin';
  } finally {
    forfeiting.value = false;
  }
};

const removeUser = async (u) => {
  const id = Number(u?.id);
  if (!id) return;
  if (!confirm(`Remove ${u.email || 'this user'} from ${props.schoolName || 'this school'}? This will revoke their access and remove them from the school contact list.`)) return;
  try {
    removingId.value = id;
    error.value = '';
    await api.delete(`/school-portal/${props.schoolOrganizationId}/school-staff/${id}`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to remove user';
  } finally {
    removingId.value = null;
  }
};

const addStaff = async () => {
  const email = addEmail.value.trim();
  if (!email || !email.includes('@')) {
    error.value = 'Please enter a valid email address.';
    return;
  }
  const roleFlags = roleFlagsFromAccessRole(addAccessRole.value);
  const selectedRoleLabel = roleLabelFromAccessRole(addAccessRole.value);
  const selectedRoleDescription = roleDescriptionFromAccessRole(addAccessRole.value);
  if (!confirm(`This will create a new school staff login as: ${selectedRoleLabel}.\n${selectedRoleDescription}\n\nContinue?`)) return;
  try {
    adding.value = true;
    error.value = '';
    addSuccess.value = '';
    await api.post(`/school-portal/${props.schoolOrganizationId}/school-staff`, {
      email,
      fullName: addName.value.trim() || undefined,
      roleTitle: addRoleTitle.value.trim() || undefined,
      isSchoolAdmin: roleFlags.isSchoolAdmin,
      isScheduler: roleFlags.isScheduler,
      groupEmailSubscription: addGroupEmailSubscription.value
    });
    addName.value = '';
    addEmail.value = '';
    addRoleTitle.value = '';
    addAccessRole.value = 'standard';
    addGroupEmailSubscription.value = 'all_mail';
    addSuccess.value = 'Staff added. They should appear in the list now; a setup email is being sent.';
    await load();
    if (error.value) {
      addSuccess.value = 'Staff added, but the roster could not be refreshed. Please reload the page.';
      error.value = '';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to add staff';
  } finally {
    adding.value = false;
  }
};

const submitTicket = async ({ subject, question }) => {
  await api.post('/support-tickets', {
    schoolOrganizationId: props.schoolOrganizationId,
    subject,
    question
  });
};

const submitNewAccountRequest = async () => {
  try {
    submitting.value = true;
    error.value = '';
    success.value = '';
    const name = requestName.value.trim();
    const email = requestEmail.value.trim();
    const subject = 'School staff request: additional account';
    const question = [
      `School: ${props.schoolName || props.schoolOrganizationId}`,
      '',
      'Request: additional login/account',
      name ? `Name: ${name}` : null,
      email ? `Email: ${email}` : null
    ].filter(Boolean).join('\n');
    await submitTicket({ subject, question });
    requestName.value = '';
    requestEmail.value = '';
    success.value = 'Request sent to agency staff.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit request';
  } finally {
    submitting.value = false;
  }
};

const requestDeletionFor = async (u) => {
  try {
    submitting.value = true;
    error.value = '';
    success.value = '';
    const subject = 'School staff request: delete user';
    const question = [
      `School: ${props.schoolName || props.schoolOrganizationId}`,
      '',
      'Request: delete/remove school staff user',
      `User ID: ${u.id}`,
      `Email: ${u.email || 'Unknown'}`,
      `Name: ${displayName(u) || 'Unknown'}`
    ].join('\n');
    await submitTicket({ subject, question });
    success.value = 'Deletion request sent to agency staff.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit deletion request';
  } finally {
    submitting.value = false;
  }
};

const roleFlagsFromAccessRole = (value) => {
  const role = String(value || 'standard').trim().toLowerCase();
  return {
    isSchoolAdmin: role === 'school_admin' || role === 'school_admin_scheduler',
    isScheduler: role === 'scheduler' || role === 'school_admin_scheduler'
  };
};

const roleLabelFromAccessRole = (value) => {
  const role = String(value || 'standard').trim().toLowerCase();
  if (role === 'school_admin') return 'School Admin';
  if (role === 'scheduler') return 'Scheduler';
  if (role === 'school_admin_scheduler') return 'School Admin + Scheduler';
  return 'Standard account';
};

const roleDescriptionFromAccessRole = (value) => {
  const role = String(value || 'standard').trim().toLowerCase();
  if (role === 'school_admin') {
    return 'They can manage school staff accounts and role assignments for this school.';
  }
  if (role === 'scheduler') {
    return 'They get limited/own-only school access and will not appear in Smart School ROI staff assignment lists.';
  }
  if (role === 'school_admin_scheduler') {
    return 'They can manage school staff for this school, and scheduler constraints (limited/own-only ROI behavior and Smart ROI exclusion) still apply.';
  }
  return 'This is a general school staff account (not School Admin and not Scheduler).';
};

const addRoleHelperText = computed(() => {
  const role = String(addAccessRole.value || 'standard').trim().toLowerCase();
  if (role === 'school_admin') {
    return 'Use School Admin if this user should manage staff, resets, and role assignments for this school.';
  }
  if (role === 'scheduler') {
    return 'Use Scheduler if this user should schedule only with limited/own-only ROI access and no Smart School ROI assignment visibility.';
  }
  if (role === 'school_admin_scheduler') {
    return 'Use this only when the person should both manage school staff and also operate under scheduler constraints.';
  }
  return 'Standard account is the default. If this user does not need ROI scheduling limits or School Admin permissions, keep Standard.';
});

onMounted(() => {
  loadIssuedTempPasswords();
  load();
});
</script>

<script>
export default {
  directives: {
    clickOutside: {
      mounted(el, binding) {
        el.__clickOutside__ = (event) => {
          if (!el.contains(event.target)) binding.value(event);
        };
        document.addEventListener('mousedown', el.__clickOutside__, true);
      },
      unmounted(el) {
        if (el.__clickOutside__) {
          document.removeEventListener('mousedown', el.__clickOutside__, true);
          el.__clickOutside__ = null;
        }
      }
    }
  }
};
</script>

<style scoped>
.ssp {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ssp-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.ssp-page-title h2 {
  margin: 0;
  font-size: 1.65rem;
  font-weight: 800;
  color: var(--text-primary, #111827);
}

.ssp-page-title p {
  margin: 4px 0 0;
  color: var(--text-secondary, #6b7280);
  font-size: 0.92rem;
}

.ssp-page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ssp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.88rem;
  font-weight: 700;
  border: 1px solid transparent;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}

.ssp-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.ssp-btn-primary {
  background: var(--primary, #14532d);
  color: #fff;
}

.ssp-btn-outline {
  background: #fff;
  color: var(--primary, #14532d);
  border-color: color-mix(in srgb, var(--primary, #14532d) 25%, #d1d5db);
}

.ssp-caret {
  width: 14px !important;
  height: 14px !important;
}

.ssp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.ssp-search {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: min(100%, 320px);
  flex: 1;
  max-width: 420px;
  padding: 0 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  min-height: 44px;
}

.ssp-search svg {
  width: 18px;
  height: 18px;
  color: #9ca3af;
  flex-shrink: 0;
}

.ssp-search input {
  border: 0;
  outline: none;
  width: 100%;
  font-size: 0.92rem;
  background: transparent;
  color: var(--text-primary, #111827);
}

.ssp-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ssp-icon-btn,
.ssp-filter-wrap .ssp-icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #374151;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
}

.ssp-icon-btn svg {
  width: 16px;
  height: 16px;
}

.ssp-icon-btn.active {
  border-color: color-mix(in srgb, var(--primary, #14532d) 35%, #d1d5db);
  color: var(--primary, #14532d);
  background: color-mix(in srgb, var(--primary, #14532d) 6%, #fff);
}

.ssp-filter-wrap {
  position: relative;
}

.ssp-filter-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 180px;
  padding: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
}

.ssp-filter-menu button {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.88rem;
  cursor: pointer;
}

.ssp-filter-menu button:hover,
.ssp-filter-menu button.active {
  background: color-mix(in srgb, var(--primary, #14532d) 8%, #fff);
  color: var(--primary, #14532d);
}

.ssp-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.ssp-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ssp-list .ssp-card {
  display: grid;
  grid-template-columns: minmax(220px, 1.2fr) minmax(180px, 1fr) auto auto;
  align-items: center;
  gap: 14px;
}

.ssp-list .ssp-card-head,
.ssp-list .ssp-card-meta,
.ssp-list .ssp-quick-actions,
.ssp-list .ssp-card-footer {
  margin: 0;
}

.ssp-list .ssp-quick-actions {
  justify-content: flex-end;
}

.ssp-list .ssp-card-footer {
  border-top: 0;
  padding-top: 0;
  justify-content: flex-end;
}

.ssp-card {
  border: 1px solid #e8edf2;
  border-radius: 16px;
  background: #fff;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.ssp-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ssp-avatar {
  width: 72px;
  height: 72px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  overflow: hidden;
  border: 2px solid transparent;
}

.ssp-avatar.has-photo {
  border-color: #e8edf2;
  background: #f8fafc;
}

.ssp-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ssp-avatar-initials {
  font-size: 1.45rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.02em;
}

.ssp-avatar.tone-green { background: #d9ead3; color: #1f4d2d; }
.ssp-avatar.tone-purple { background: #eadcf7; color: #5b2c88; }
.ssp-avatar.tone-blue { background: #dbeafe; color: #1d4ed8; }
.ssp-avatar.tone-tan { background: #f5e6d3; color: #8a5a2b; }

.ssp-avatar.has-photo.tone-green,
.ssp-avatar.has-photo.tone-purple,
.ssp-avatar.has-photo.tone-blue,
.ssp-avatar.has-photo.tone-tan {
  background: #f8fafc;
}

.ssp-card-identity {
  flex: 1;
  min-width: 0;
}

.ssp-name {
  font-size: 0.98rem;
  font-weight: 800;
  color: #111827;
  line-height: 1.2;
}

.ssp-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.ssp-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.ssp-badge-admin {
  background: #d9ead3;
  color: #1f4d2d;
}

.ssp-badge-pending {
  background: #fef3c7;
  color: #92400e;
}

.ssp-badge-scheduler {
  background: #eadcf7;
  color: #5b2c88;
}

.ssp-check-row {
  display: flex;
  gap: 0.45rem;
  align-items: center;
  margin: 0.4rem 0;
  font-size: 0.9rem;
}

.ssp-quick-activate {
  background: #fff7ed !important;
  border-color: #fdba74 !important;
  color: #9a3412 !important;
}

.ssp-menu-wrap {
  position: relative;
}

.ssp-menu-btn {
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  color: #6b7280;
  border-radius: 8px;
  cursor: pointer;
}

.ssp-menu-btn:hover {
  background: #f3f4f6;
}

.ssp-menu-btn svg {
  width: 18px;
  height: 18px;
}

.ssp-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 170px;
  padding: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
}

.ssp-menu button {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 0.86rem;
  cursor: pointer;
}

.ssp-menu button:hover {
  background: #f3f4f6;
}

.ssp-menu button.danger {
  color: #b91c1c;
}

.ssp-card-meta {
  font-size: 0.8rem;
  color: #6b7280;
  line-height: 1.45;
}

.ssp-meta-sub {
  margin-top: 2px;
  font-size: 0.74rem;
}

.ssp-quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ssp-quick-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 62px;
  padding: 8px;
  border: 1px solid #e8edf2;
  border-radius: 12px;
  background: #fff;
  color: #374151;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.ssp-quick-btn svg {
  width: 18px;
  height: 18px;
}

.ssp-quick-btn:hover {
  border-color: color-mix(in srgb, var(--primary, #14532d) 25%, #d1d5db);
  color: var(--primary, #14532d);
}

.ssp-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 4px;
  border-top: 1px solid #f1f5f9;
}

.ssp-footer-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: #111827;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 0;
}

.ssp-footer-btn svg {
  width: 16px;
  height: 16px;
}

.ssp-footer-danger {
  color: #b91c1c;
}

.ssp-footer-temp {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  max-width: 100%;
}

.ssp-footer-temp-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
  line-height: 1.35;
  text-align: left;
  word-break: break-all;
}

.ssp-reset-lead {
  margin: 0 0 12px;
  color: #374151;
  line-height: 1.5;
}

.ssp-reset-steps {
  margin: 0 0 16px;
  padding-left: 1.2rem;
  color: #4b5563;
  line-height: 1.55;
  font-size: 0.9rem;
}

.ssp-reset-steps-compact {
  margin-top: 14px;
}

.ssp-reset-success {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ssp-temp-password-display {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--primary, #14532d) 25%, #d1d5db);
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary, #14532d) 6%, #fff);
  cursor: pointer;
  text-align: left;
}

.ssp-temp-password-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1rem;
  font-weight: 800;
  color: #111827;
  word-break: break-all;
}

.ssp-temp-password-meta {
  font-size: 0.8rem;
  color: #6b7280;
}

.ssp-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.ssp-page-btn {
  min-width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #374151;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
}

.ssp-page-btn.active {
  background: var(--primary, #14532d);
  border-color: var(--primary, #14532d);
  color: #fff;
}

.ssp-page-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ssp-add-section,
.ssp-admin-box {
  border: 1px solid #e8edf2;
  border-radius: 16px;
  background: #fff;
  padding: 18px;
}

.ssp-add-section h3,
.ssp-admin-box h3 {
  margin: 0 0 14px;
  font-size: 1rem;
  font-weight: 800;
}

.ssp-add-grid {
  display: grid;
  grid-template-columns: 1.2fr 1.2fr 0.9fr;
  gap: 14px;
}

.ssp-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  color: #4b5563;
}

.ssp-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.ssp-input-wrap svg {
  width: 18px;
  height: 18px;
  color: #9ca3af;
  flex-shrink: 0;
}

.ssp-input-wrap input,
.ssp-plain-input,
.ssp-select {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text-primary, #111827);
  font-size: 0.92rem;
}

.ssp-plain-input,
.ssp-select {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.ssp-select-compact {
  min-height: 36px;
  margin-top: 6px;
}

.ssp-inline-sub {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 0.82rem;
  color: #4b5563;
}

.ssp-subscription-box .ssp-field {
  max-width: 360px;
}

.ssp-perm-row-stack {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.ssp-role-help {
  margin: 12px 0 0;
  color: #6b7280;
  font-size: 0.84rem;
  line-height: 1.45;
}

.ssp-add-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.ssp-alert {
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 0.9rem;
}

.ssp-alert-error {
  background: #fef2f2;
  color: #b91c1c;
}

.ssp-alert-success {
  background: #ecfdf5;
  color: #047857;
}

.ssp-empty {
  padding: 28px 12px;
  text-align: center;
  color: #6b7280;
}

.ssp-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 16px;
}

.ssp-modal {
  width: min(460px, 100%);
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}

.ssp-modal-wide {
  width: min(560px, 100%);
}

.ssp-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid #f1f5f9;
}

.ssp-modal-sub {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 0.84rem;
}

.ssp-modal-body {
  padding: 18px;
}

.ssp-modal-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.ssp-modal-actions-wrap {
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
}

.ssp-reset-link-actions {
  margin: 16px 0 8px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.ssp-perm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid #f1f5f9;
}

.ssp-perm-row:last-child {
  border-bottom: 0;
}

.ssp-perm-title {
  font-weight: 800;
  color: #111827;
}

.ssp-perm-copy {
  margin-top: 4px;
  color: #6b7280;
  font-size: 0.84rem;
  line-height: 1.4;
}

@media (max-width: 1400px) {
  .ssp-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .ssp-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ssp-add-grid {
    grid-template-columns: 1fr 1fr;
  }

  .ssp-field-role {
    grid-column: 1 / -1;
  }
}

@media (max-width: 820px) {
  .ssp-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ssp-list .ssp-card {
    grid-template-columns: 1fr;
  }

  .ssp-add-grid {
    grid-template-columns: 1fr;
  }

  .ssp-page-header {
    flex-direction: column;
  }

  .ssp-page-actions {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .ssp-grid {
    grid-template-columns: 1fr;
  }

  .ssp-quick-actions {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .ssp-quick-btn span {
    display: none;
  }
}
</style>
