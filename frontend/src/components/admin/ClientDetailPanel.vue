<template>
  <ClientChartShell
    :full-page="props.fullPage"
    :tabs="tabs"
    :active-tab="activeTab"
    :alert-items="overviewAlertItems"
    @close="handleClose"
    @update:active-tab="activeTab = $event"
    @alert-click="onOverviewAlertClick"
  >
    <template #header>
      <div class="modal-header cdp-header">
        <div class="cdp-header-main">
          <div class="cdp-avatar" :style="avatarColor" aria-hidden="true">
            {{ avatarText }}
          </div>
          <div class="cdp-header-info">
            <div class="cdp-header-row">
              <h2 class="cdp-title">
                <template v-if="canSeeClientFullName && client.full_name">
                  {{ client.full_name }}
                  <span class="cdp-title-initials">({{ client.initials || '—' }})</span>
                </template>
                <template v-else>{{ client.initials || '—' }}</template>
              </h2>
              <div class="cdp-identity-line">
                <span v-if="client.initials">Initials {{ client.initials }}</span>
                <span v-if="clientAgeLabel">Age {{ clientAgeLabel }}</span>
                <span v-if="client.identifier_code" class="mono">ID {{ client.identifier_code }}</span>
                <span v-else-if="client.id" class="mono">ID {{ client.id }}</span>
                <span v-if="clientDobLabel">DOB {{ clientDobLabel }}</span>
                <span v-if="guardianIntakeName">Guardian: {{ guardianIntakeName }}</span>
              </div>
              <div class="cdp-meta-row">
                <span
                  class="cdp-pill"
                  :class="statusPillClass"
                  :title="isClientTerminated && client.termination_reason ? client.termination_reason : undefined"
                >
                  {{ isClientArchived ? 'Archived' : displayStatusLabel }}
                </span>
                <span class="cdp-pill cdp-pill--type" :class="{ 'is-editable': canEditClientType }">
                  <span class="cdp-pill__dot"></span>
                  {{ clientTypeLabel }}
                  <button
                    v-if="canEditClientType"
                    type="button"
                    class="cdp-pill-edit-btn"
                    title="Change client type"
                    aria-label="Change client type"
                    @click="openAdminSettings"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                </span>
                <span v-if="client.organization_name" class="cdp-pill cdp-pill--org">
                  {{ client.organization_name }}
                </span>
                <span v-if="primaryInsuranceLabel" class="cdp-pill cdp-pill--success">
                  {{ primaryInsuranceLabel }}
                </span>
              </div>
              <details
                v-if="canEditClientType || (isBackofficeRole && (switchableAgencies.length > 1 || clientAgenciesNote))"
                ref="adminDetailsEl"
                class="cdp-admin-details"
              >
              <summary>{{ canEditClientType ? 'Client type & admin settings' : 'Admin settings' }}</summary>
              <div v-if="canEditClientType" class="cdp-inline-controls">
                <span class="cdp-inline-controls__label">Client type</span>
                <select ref="clientTypeSelectEl" v-model="clientTypeDraft" class="inline-select cdp-inline-select" :disabled="savingClientType">
                  <option v-for="opt in clientTypeOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <button
                  type="button"
                  class="btn btn-sm cdp-btn-ink"
                  :disabled="savingClientType || !clientTypeDraft || clientTypeDraft === effectiveClientType"
                  @click="saveClientType"
                >
                  {{ savingClientType ? 'Saving…' : 'Save type' }}
                </button>
              </div>
              <div v-if="isBackofficeRole && (switchableAgencies.length > 1 || clientAgenciesNote)" class="cdp-inline-controls cdp-inline-controls--muted">
                <template v-if="switchableAgencies.length > 1">
                  <span class="cdp-inline-controls__label">Agency</span>
                  <select
                    v-model="selectedAgencyId"
                    class="inline-select cdp-inline-select"
                    :disabled="switchingAgency"
                    @change="onSwitchAgency(true)"
                  >
                    <option v-for="a in switchableAgencies" :key="a.id" :value="String(a.id)">
                      {{ a.name }}
                    </option>
                  </select>
                  <span v-if="switchingAgency" class="muted">Switching…</span>
                </template>
                <template v-else-if="clientAgenciesNote">
                  <span class="muted">{{ clientAgenciesNote }}</span>
                </template>
              </div>
              </details>
            </div>
          </div>
        </div>

        <div class="cdp-header-actions">
          <button
            v-if="!props.fullPage && props.client?.id"
            class="cdp-btn-primary cdp-open-full"
            type="button"
            @click="openFullClientRecord"
          >
            Open full client record
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
          <div v-if="hasClientNavigation" class="cdp-nav-pill">
            <button class="cdp-nav-btn" type="button" :disabled="!canNavigatePrevious" @click="requestNavigate('previous')" aria-label="Previous client">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span class="cdp-nav-pill__label">{{ currentClientPositionLabel }}</span>
            <button class="cdp-nav-btn" type="button" :disabled="!canNavigateNext" @click="requestNavigate('next')" aria-label="Next client">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          </div>
          <button v-if="!props.fullPage" @click="handleClose" class="btn-close" aria-label="Close">×</button>
        </div>
      </div>
    </template>

        <!-- Overview Tab -->
        <div v-if="activeTab === 'overview'" class="detail-section cdp-overview">
          <div class="cdp-overview-layout">
            <div class="cdp-overview-main">
          <div class="cdp-overview-toolbar">
            <div>
              <h3 class="cdp-section-title">At a glance</h3>
            </div>
            <div v-if="canEditAccount" class="form-actions" style="margin: 0;">
              <button v-if="!editingOverview" class="cdp-btn-soft" type="button" @click="startEditOverview(true)">
                Edit client
              </button>
              <template v-else>
                <button class="cdp-btn-primary" type="button" @click="saveOverview" :disabled="savingOverview">
                  {{ savingOverview ? 'Saving…' : 'Save' }}
                </button>
                <button class="cdp-btn-soft" type="button" @click="cancelEditOverview" :disabled="savingOverview">
                  Cancel
                </button>
              </template>
            </div>
          </div>

          <div
            v-if="showSchoolGlance"
            class="cdp-school-profile-strip"
          >
            <div class="cdp-school-profile-item">
              <span class="cdp-school-profile-kicker">School</span>
              <strong>{{ schoolGlanceLabel }}</strong>
            </div>
            <div class="cdp-school-profile-item">
              <span class="cdp-school-profile-kicker">Assigned day</span>
              <strong>{{ assignedDayGlanceLabel }}</strong>
            </div>
            <div class="cdp-school-profile-item">
              <span class="cdp-school-profile-kicker">Grade</span>
              <strong>{{ formatGradeDisplay(client.grade) || '—' }}</strong>
            </div>
            <div class="cdp-school-profile-item">
              <span class="cdp-school-profile-kicker">School year</span>
              <strong>{{ client.school_year || '—' }}</strong>
            </div>
            <div
              v-if="canViewAdminNote"
              class="cdp-school-profile-item cdp-school-profile-item--note admin-note-row"
              :class="{ 'is-popover-open': adminNotePopoverOpen }"
            >
              <span class="cdp-school-profile-kicker">Admin note</span>
              <div
                ref="adminNoteStripTriggerEl"
                class="admin-note-trigger"
                @mouseenter="openAdminNotePopover"
                @mouseleave="closeAdminNotePopoverSoon"
              >
                <span v-if="adminNoteLoading" class="muted">Loading…</span>
                <span v-else-if="adminNoteMessage">
                  <span class="admin-note-indicator" title="Admin note available">✓</span>
                  <span class="muted">Hover to view/edit</span>
                </span>
                <span v-else class="muted">Hover to add</span>
              </div>
            </div>
          </div>

          <div class="cdp-profile-rows">
            <div v-if="showSchoolGlance" class="cdp-profile-row">
              <span class="cdp-profile-dt">School</span>
              <span class="cdp-profile-dd">{{ schoolGlanceLabel }}</span>
            </div>
            <div v-if="showSchoolGlance" class="cdp-profile-row">
              <span class="cdp-profile-dt">Assigned day</span>
              <span class="cdp-profile-dd">{{ assignedDayGlanceLabel }}</span>
            </div>
            <div class="cdp-profile-row">
              <span class="cdp-profile-dt">Primary clinician</span>
              <span class="cdp-profile-dd">
                {{ primaryProviderLabel }}
                <span v-if="client.organization_name" class="cdp-profile-meta">{{ client.organization_name }}</span>
              </span>
            </div>
            <div class="cdp-profile-row">
              <span class="cdp-profile-dt">Program</span>
              <span class="cdp-profile-dd">{{ clientTypeLabel }}</span>
            </div>
            <div class="cdp-profile-row">
              <span class="cdp-profile-dt">Primary diagnosis</span>
              <span class="cdp-profile-dd">
                <span class="mono">{{ primaryDiagnosisLabel }}</span>
                <button v-if="canViewMedicalRecord" type="button" class="cdp-text-link" @click="activeTab = 'clinical'">View clinical →</button>
              </span>
            </div>
            <div class="cdp-profile-row">
              <span class="cdp-profile-dt">Since</span>
              <span class="cdp-profile-dd">
                {{ client.referral_date ? formatDate(client.referral_date) : (client.submission_date ? formatDate(client.submission_date) : '—') }}
                <span v-if="client.source" class="cdp-profile-meta">{{ client.source }}</span>
              </span>
            </div>
            <div class="cdp-profile-row">
              <span class="cdp-profile-dt">Insurance</span>
              <span class="cdp-profile-dd">
                {{ primaryInsuranceLabel || 'Not on file' }}
                <span v-if="client.insurance_type_label" class="cdp-profile-meta">{{ client.insurance_type_label }}</span>
              </span>
            </div>
            <div class="cdp-profile-row">
              <span class="cdp-profile-dt">Last session</span>
              <span class="cdp-profile-dd">
                {{ lastSessionLabel }}
                <span v-if="lastSessionMeta" class="cdp-profile-meta">{{ lastSessionMeta }}</span>
              </span>
            </div>
            <div class="cdp-profile-row">
              <span class="cdp-profile-dt">Sessions on file</span>
              <span class="cdp-profile-dd">
                {{ sessionCountLabel }}
                <button v-if="canViewMedicalRecord && sessionCount" type="button" class="cdp-text-link" @click="activeTab = 'medical-record'">View record →</button>
              </span>
            </div>
            <div class="cdp-profile-row">
              <span class="cdp-profile-dt">Care team</span>
              <span class="cdp-profile-dd">
                {{ careTeamGlanceSummary }}
                <span v-if="careTeamGlanceMeta" class="cdp-profile-meta">{{ careTeamGlanceMeta }}</span>
                <button v-if="canManageSchoolAssignments" type="button" class="cdp-text-link" @click="showAssignDayModal = true">Update →</button>
                <button v-else-if="canEditAccount" type="button" class="cdp-text-link" @click="activeTab = 'assignments'">Manage →</button>
              </span>
            </div>
          </div>

          <div class="cdp-care-section">
            <h3 class="cdp-section-title">Current care</h3>
            <div class="cdp-care-strip">
              <button type="button" class="cdp-care-chip">
                <span class="cdp-care-chip__title">Status</span>
                <span class="cdp-care-chip__body">{{ isClientArchived ? 'Archived' : displayStatusLabel }}</span>
                <span class="cdp-care-chip__meta">{{ clientTypeLabel }}</span>
              </button>
              <button v-if="canViewMedicalRecord" type="button" class="cdp-care-chip" @click="activeTab = 'clinical'">
                <span class="cdp-care-chip__title">Clinical</span>
                <span class="cdp-care-chip__body">{{ primaryDiagnosisLabel !== '—' ? primaryDiagnosisLabel : 'No diagnosis' }}</span>
                <span class="cdp-care-chip__meta">Open chart →</span>
              </button>
              <button v-if="canViewMedicalRecord" type="button" class="cdp-care-chip" @click="activeTab = 'medical-record'">
                <span class="cdp-care-chip__title">Medical record</span>
                <span class="cdp-care-chip__body">{{ sessionCountLabel }} session{{ sessionCount !== 1 ? 's' : '' }}</span>
                <span class="cdp-care-chip__meta">Open record →</span>
              </button>
              <button type="button" class="cdp-care-chip" @click="activeTab = 'phi'">
                <span class="cdp-care-chip__title">Documents</span>
                <span class="cdp-care-chip__body">{{ formatDocumentStatus(client.document_status) }}</span>
                <span class="cdp-care-chip__meta">View →</span>
              </button>
              <button v-if="canViewClientBillingImport" type="button" class="cdp-care-chip" @click="activeTab = 'client-billing'">
                <span class="cdp-care-chip__title">Billing</span>
                <span class="cdp-care-chip__body">Imported balances</span>
                <span class="cdp-care-chip__meta">Open →</span>
              </button>
            </div>
          </div>

          <div
            v-if="intakeSafetyStaffBanners.length"
            class="phi-warning"
            style="margin-bottom: 14px;"
          >
            <div
              v-for="b in intakeSafetyStaffBanners"
              :key="b.key"
              style="margin-bottom: 12px;"
            >
              <div style="font-weight: 800;">{{ b.title }}</div>
              <div v-if="b.notes" class="muted small" style="margin-top: 6px; white-space: pre-wrap;">
                {{ b.notes }}
              </div>
            </div>
            <div class="muted small" style="margin-top: 8px;">
              Staff-only intake flags — do not share with guardians or schools unless policy allows.
            </div>
          </div>

          <div class="cdp-contacts-section">
            <h3 class="cdp-section-title">Contacts &amp; relationships</h3>
            <div class="cdp-contacts-grid">
              <article class="cdp-contact-card">
                <div class="cdp-contact-card__role">Guardian</div>
                <div class="cdp-contact-card__name">{{ guardianIntakeName || 'No contact on file' }}</div>
                <div class="cdp-glance-meta">{{ guardianIntakeEmail || guardianIntakePhone || '—' }}</div>
              </article>
              <article class="cdp-contact-card">
                <div class="cdp-contact-card__role">Primary clinician</div>
                <div class="cdp-contact-card__name">{{ primaryProviderLabel }}</div>
                <div class="cdp-glance-meta">{{ client.organization_name || '—' }}</div>
              </article>
              <article class="cdp-contact-card">
                <div class="cdp-contact-card__role">Organization</div>
                <div class="cdp-contact-card__name">{{ client.organization_name || '—' }}</div>
                <div class="cdp-glance-meta">{{ clientTypeLabel }}</div>
              </article>
            </div>
          </div>

          <details
            ref="profileDetailsEl"
            class="cdp-profile-details"
            :class="{
              'is-flagged': editHighlightActive,
              'cdp-profile-details--hint': profileDetailsPulseHint
            }"
            :open="schoolProfileDetailsOpen || undefined"
            @toggle="onProfileDetailsToggle"
          >
            <summary>
              <span class="cdp-profile-details__title">
                Profile details
                <span v-if="profileDetailsPulseHint" class="cdp-profile-details__badge">Click to expand</span>
              </span>
              <span class="cdp-profile-details__hint">Identity, demographics, status, education, languages</span>
            </summary>
          <div class="ov-sections">

            <!-- Identity & Profile -->
            <section class="ov-card">
              <header class="ov-card-header">
                <h3>Identity &amp; Profile</h3>
              </header>
              <div class="ov-card-body">
                <!-- Full name – editable for clinical/learning clients -->
                <div v-if="isClinicalLikeClientType && canSeeClientFullName" class="ov-row">
                  <div class="ov-row-label">Full Name</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <input v-model="overviewForm.full_name" class="inline-input" placeholder="First Last" />
                    </template>
                    <template v-else>
                      <span v-if="client.full_name">{{ client.full_name }}</span>
                      <span v-else class="muted">Not set</span>
                    </template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Initials</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <input v-model="overviewForm.initials" class="inline-input" placeholder="MesJuv" />
                    </template>
                    <template v-else>{{ client.initials }}</template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Client Code</div>
                  <div class="ov-row-value">
                    <template v-if="clientCodeIsValid">
                      <span class="mono">{{ client.identifier_code }}</span>
                    </template>
                    <template v-else>
                      <span class="muted">Missing</span>
                      <template v-if="canManageClientCode">
                        <div style="display:flex; gap: 8px; align-items:center; margin-top: 6px; flex-wrap: wrap;">
                          <input
                            v-model="clientCodeDraft"
                            class="inline-input"
                            style="width: 140px;"
                            inputmode="numeric"
                            placeholder="6-digit code"
                            maxlength="6"
                          />
                          <button class="btn btn-secondary btn-sm" type="button" @click="generateClientCode" :disabled="clientCodeSaving">
                            Generate
                          </button>
                          <button
                            class="btn btn-primary btn-sm"
                            type="button"
                            @click="saveClientCode"
                            :disabled="clientCodeSaving || !clientCodeDraftValid"
                          >
                            {{ clientCodeSaving ? 'Saving…' : 'Save' }}
                          </button>
                        </div>
                        <div class="hint" style="margin-top: 4px;">
                          Once set, the code is permanent and cannot be edited.
                        </div>
                      </template>
                    </template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">{{ organizationLabel }}</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <select v-model="overviewForm.organization_id" class="inline-select">
                        <option :value="''">—</option>
                        <option v-for="o in overviewOrganizations" :key="o.id" :value="String(o.id)">
                          {{ o.name }}
                        </option>
                      </select>
                    </template>
                    <template v-else>{{ client.organization_name || '-' }}</template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Source</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <select v-model="overviewForm.source" class="inline-select">
                        <option value="">—</option>
                        <option value="BULK_IMPORT">Bulk Import</option>
                        <option value="SCHOOL_UPLOAD">School Upload</option>
                        <option value="SCHOOL_UPLOAD_INTERNAL">Packet Upload (Internal)</option>
                        <option value="PUBLIC_INTAKE_LINK">Public Intake Link</option>
                        <option value="DIGITAL_FORM">Digital Form</option>
                        <option value="ADMIN_CREATED">Admin Created</option>
                      </select>
                    </template>
                    <template v-else>{{ formatSource(client.source) }}</template>
                  </div>
                </div>
              </div>
            </section>

            <!-- Demographics -->
            <section class="ov-card">
              <header class="ov-card-header">
                <h3>Demographics</h3>
                <span class="muted" style="font-size: 12px;">Also shown on the Demographics tab</span>
              </header>
              <div class="ov-card-body">
                <div class="ov-row">
                  <div class="ov-row-label">Date of Birth</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <input v-model="overviewForm.date_of_birth" type="date" class="inline-input" />
                    </template>
                    <template v-else>{{ clientDobLabel || '-' }}</template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Sex</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <select v-model="overviewForm.gender" class="inline-select">
                        <option value="">Prefer not to say</option>
                        <option v-for="o in sexSelectOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                      </select>
                    </template>
                    <template v-else>{{ formatDemoLookupValue(client.gender, sexSelectOptions) || '-' }}</template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Race / Ethnicity</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <select v-model="overviewForm.ethnicity" class="inline-select">
                        <option value="">Prefer not to say</option>
                        <option v-for="o in ethnicitySelectOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                      </select>
                    </template>
                    <template v-else>{{ formatDemoLookupValue(client.ethnicity, ethnicitySelectOptions) || '-' }}</template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Preferred Language</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <select v-model="overviewForm.preferred_language" class="inline-select">
                        <option value="">—</option>
                        <option v-for="o in languageSelectOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                      </select>
                    </template>
                    <template v-else>{{ formatDemoLookupValue(client.preferred_language, languageSelectOptions) || '-' }}</template>
                  </div>
                </div>
                <div class="ov-row ov-row--block">
                  <div class="ov-row-label">Address</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <div class="address-grid">
                        <input v-model="overviewForm.address_street" class="inline-input" placeholder="Street address" style="grid-column: 1 / -1;" />
                        <input v-model="overviewForm.address_apt" class="inline-input" placeholder="Apt / unit (optional)" />
                        <input v-model="overviewForm.address_city" class="inline-input" placeholder="City" />
                        <input v-model="overviewForm.address_state" class="inline-input" placeholder="State" />
                        <input v-model="overviewForm.address_zip" class="inline-input" placeholder="Zip code" />
                      </div>
                    </template>
                    <template v-else>
                      <span v-if="clientAddressLine">{{ clientAddressLine }}</span>
                      <span v-else class="muted">Not set</span>
                    </template>
                  </div>
                </div>
              </div>
            </section>

            <!-- Status & Activity -->
            <section class="ov-card">
              <header class="ov-card-header">
                <h3>Status &amp; Activity</h3>
              </header>
              <div class="ov-card-body">
                <div class="ov-row">
                  <div class="ov-row-label">Client Status</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <select v-model="overviewForm.client_status_id" class="inline-select">
                        <option :value="''">—</option>
                        <option v-for="s in overviewClientStatuses" :key="s.id" :value="String(s.id)">{{ s.label }}</option>
                      </select>
                      <div v-if="isTerminatedStatusSelected" class="termination-reason-field" style="margin-top: 10px;">
                        <label class="required">Termination reason (required)</label>
                        <textarea
                          v-model="overviewForm.termination_reason"
                          rows="3"
                          placeholder="Explain why this client was terminated…"
                          class="inline-input"
                          style="width: 100%; margin-top: 4px;"
                        />
                      </div>
                    </template>
                    <template v-else>
                      <span
                        :title="isClientTerminated && client.termination_reason ? client.termination_reason : undefined"
                        :class="{ 'status-hoverable': isClientTerminated && client.termination_reason }"
                      >
                        {{ displayStatusLabel }}
                      </span>
                      <div v-if="isClientTerminated && client.termination_reason" class="hint" style="margin-top: 6px;">
                        <strong>Termination reason:</strong> {{ client.termination_reason }}
                      </div>
                    </template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Archived</div>
                  <div class="ov-row-value">{{ isClientArchived ? 'Yes' : 'No' }}</div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Submission Date</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <input v-model="overviewForm.submission_date" type="date" class="inline-input" />
                    </template>
                    <template v-else>{{ formatDate(client.submission_date) }}</template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Referral Date</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <input v-model="overviewForm.referral_date" type="date" class="inline-input" />
                    </template>
                    <template v-else>{{ formatDate(client.referral_date) }}</template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Last Activity</div>
                  <div class="ov-row-value">{{ formatDate(client.last_activity_at) || '-' }}</div>
                </div>
                <div
                  v-if="canViewAdminNote"
                  class="ov-row admin-note-row"
                  :class="{ 'is-popover-open': adminNotePopoverOpen }"
                >
                  <div class="ov-row-label">Admin Note</div>
                  <div
                    ref="adminNoteTriggerEl"
                    class="ov-row-value admin-note-trigger"
                    @mouseenter="openAdminNotePopover"
                    @mouseleave="closeAdminNotePopoverSoon"
                  >
                    <span v-if="adminNoteLoading" class="muted">Loading…</span>
                    <span v-else-if="adminNoteMessage">
                      <span class="admin-note-indicator" title="Admin note available">✓</span>
                      <span class="muted" style="margin-left: 8px;">Hover to view/edit</span>
                    </span>
                    <span v-else class="muted">Hover to add</span>
                  </div>

                  <Teleport to="body">
                    <div
                      v-if="adminNotePopoverOpen"
                      class="admin-note-popover admin-note-popover--floating"
                      :style="adminNotePopoverStyle"
                      @mouseenter="cancelCloseAdminNotePopover"
                      @mouseleave="closeAdminNotePopoverSoon"
                    >
                      <div class="muted" style="font-size: 12px; margin-bottom: 6px; font-weight: 800;">Internal (admin only)</div>
                      <textarea v-model="adminNoteDraft" class="admin-note-textarea" rows="5" placeholder="Add an internal admin note…" />
                      <div style="display:flex; gap: 8px; justify-content: flex-end; margin-top: 8px;">
                        <button class="btn btn-secondary btn-sm" type="button" @click="closeAdminNotePopoverNow" :disabled="adminNoteSaving">
                          Close
                        </button>
                        <button
                          class="btn btn-primary btn-sm"
                          type="button"
                          @click="saveAdminNote"
                          :disabled="adminNoteSaving || !String(adminNoteDraft || '').trim()"
                        >
                          {{ adminNoteSaving ? 'Saving…' : 'Save' }}
                        </button>
                      </div>
                    </div>
                  </Teleport>
                </div>
              </div>
            </section>

            <!-- Documents & Insurance -->
            <section class="ov-card">
              <header class="ov-card-header">
                <h3>Documents &amp; Insurance</h3>
              </header>
              <div class="ov-card-body">
                <div class="ov-row">
                  <div class="ov-row-label">Ongoing paperwork</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <details ref="docStatusDetailsEl" class="doc-dropdown">
                        <summary class="inline-select" style="list-style:none; cursor:pointer;">
                          {{ documentStatusSummaryText || (client.paperwork_status_label || '—') }}
                        </summary>
                        <div style="margin-top: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-alt);">
                          <div class="hint" style="margin-bottom: 8px;">
                            Select the items that are <strong>Needed</strong>. When none are needed, status becomes <strong>Completed</strong>.
                          </div>

                          <div v-if="docChecklistAvailable">
                            <div class="check-row" style="margin-bottom: 6px;">
                              <label class="check-left">
                                <input type="checkbox" :checked="docIsCompleted" disabled />
                                <span class="check-label"><strong>Completed</strong></span>
                              </label>
                              <div class="check-right">
                                <span v-if="docIsCompleted" class="badge badge-success">Yes</span>
                                <span v-else class="badge badge-secondary">No</span>
                                <button
                                  v-if="canEditPaperwork && !docIsCompleted"
                                  type="button"
                                  class="btn btn-secondary btn-sm"
                                  :disabled="docChecklistSaving"
                                  @click="onMarkDocsCompletedFromOverview"
                                  style="margin-left: 10px;"
                                >
                                  Mark completed
                                </button>
                              </div>
                            </div>

                            <div v-for="it in docNeededOptions" :key="String(it.status_key || it.paperwork_status_id)" class="check-row">
                              <label class="check-left">
                                <input
                                  type="checkbox"
                                  :disabled="!canEditPaperwork || docChecklistSaving"
                                  :checked="!!it.is_needed"
                                  @change="onToggleDocNeeded(it, $event)"
                                />
                                <span class="check-label">{{ it.label }}</span>
                              </label>
                              <div class="check-right">
                                <span v-if="it.is_needed" class="badge badge-warning">Needed</span>
                                <span v-else class="badge badge-secondary">Received</span>
                              </div>
                            </div>
                          </div>

                          <div v-else class="muted">
                            Document Status checklist is not available yet (missing migration).
                          </div>
                        </div>
                      </details>
                    </template>
                    <template v-else>
                      <span v-if="documentStatusSummaryText" class="doc-status-pill">{{ documentStatusSummaryText }}</span>
                      <span v-else>{{ client.paperwork_status_label || '-' }}</span>
                    </template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Doc Date</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <input v-model="overviewForm.doc_date" type="date" class="inline-input" />
                    </template>
                    <template v-else>{{ formatDate(client.doc_date) }}</template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Insurance</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <select v-model="overviewForm.insurance_type_id" class="inline-select">
                        <option :value="''">—</option>
                        <option v-for="i in overviewInsuranceTypes" :key="i.id" :value="String(i.id)">{{ i.label }}</option>
                      </select>
                    </template>
                    <template v-else>
                      <span v-if="client.primary_insurer_name">
                        {{ client.primary_insurer_name }}
                        <span v-if="client.insurance_type_label && client.insurance_type_label !== client.primary_insurer_name" class="muted" style="font-size: 12px; margin-left: 4px;">({{ client.insurance_type_label }})</span>
                      </span>
                      <span v-else>{{ client.insurance_type_label || '-' }}</span>
                    </template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">New insurance needed</div>
                  <div class="ov-row-value">
                    <label class="check-row" style="margin: 0;">
                      <input
                        type="checkbox"
                        :checked="!!newInsuranceNeededItem?.is_needed"
                        :disabled="!canEditPaperwork || docChecklistSaving || !newInsuranceNeededItem"
                        @change="onToggleDocNeeded(newInsuranceNeededItem, $event)"
                      />
                      <span class="muted" style="font-size: 12px;">
                        Post-readiness flag — acquire updated insurance for this client
                      </span>
                    </label>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Upload status (legacy)</div>
                  <div class="ov-row-value">
                    <span class="muted">{{ formatDocumentStatus(client.document_status) }}</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- Care Team -->
            <section class="ov-card">
              <header class="ov-card-header">
                <h3>Care Team</h3>
                <span class="muted" style="font-size: 12px;">
                  Edit on the <strong>Assignments</strong> tab
                </span>
              </header>
              <div class="ov-card-body">
                <div class="ov-row ov-row--block">
                  <div class="ov-row-label">Provider</div>
                  <div class="ov-row-value">
                    <div v-if="overviewProvidersLoading" class="muted">Loading…</div>
                    <div v-else-if="effectiveOverviewProviders.length === 0">Not assigned</div>
                    <div v-else class="provider-list">
                      <div v-for="p in effectiveOverviewProviders" :key="p.id" class="provider-row">
                        <div>
                          <strong>{{ p.provider_last_name }}, {{ p.provider_first_name }}</strong>
                          <span v-if="p.is_primary" class="badge badge-success" style="margin-left: 8px;">Primary</span>
                          <div v-if="p.organization_name" class="muted" style="margin-top: 2px;">
                            {{ p.organization_name }}
                          </div>
                        </div>
                        <div class="muted" style="white-space: nowrap;">
                          {{ p.service_day || 'Unknown' }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- Education -->
            <section class="ov-card">
              <header class="ov-card-header">
                <h3>Education</h3>
              </header>
              <div class="ov-card-body">
                <div v-if="showSchoolSpecificOverviewFields" class="ov-row">
                  <div class="ov-row-label">School Year</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <input v-model="overviewForm.school_year" class="inline-input" placeholder="2025-2026" />
                    </template>
                    <template v-else>{{ client.school_year || '-' }}</template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Grade</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <select v-model="overviewForm.grade" class="inline-input">
                        <option value="">—</option>
                        <option
                          v-for="o in overviewGradeSelectOptions"
                          :key="`${o.value}::${o.label}`"
                          :value="o.value"
                        >{{ o.label }}</option>
                      </select>
                    </template>
                    <template v-else>{{ formatGradeDisplay(client.grade) }}</template>
                  </div>
                </div>
                <div v-if="showSchoolSpecificOverviewFields" class="ov-row">
                  <div class="ov-row-label">Skills client</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <label style="display:flex; align-items:center; gap: 8px;">
                        <input type="checkbox" v-model="overviewForm.skills" />
                        <span>{{ overviewForm.skills ? 'Yes' : 'No' }}</span>
                      </label>
                    </template>
                    <template v-else>{{ isSkillsClientFlag(client.skills) ? 'Yes' : 'No' }}</template>
                  </div>
                </div>
              </div>
            </section>

            <!-- Languages -->
            <section class="ov-card">
              <header class="ov-card-header">
                <h3>Languages</h3>
              </header>
              <div class="ov-card-body">
                <div class="ov-row">
                  <div class="ov-row-label">Client primary language</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <input v-model="overviewForm.primary_client_language" class="inline-input" placeholder="e.g., English" />
                    </template>
                    <template v-else>{{ client.primary_client_language || '-' }}</template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Guardian primary language</div>
                  <div class="ov-row-value">
                    <template v-if="editingOverview">
                      <input v-model="overviewForm.primary_parent_language" class="inline-input" placeholder="e.g., Spanish" />
                    </template>
                    <template v-else>{{ client.primary_parent_language || guardianIntakeProfile?.primaryLanguage || '-' }}</template>
                  </div>
                </div>
              </div>
            </section>

            <!-- Guardian (latest intake) -->
            <section class="ov-card ov-card--guardian">
              <header class="ov-card-header">
                <h3>Guardian (latest intake)</h3>
                <button
                  v-if="editingOverview && guardianIntakeProfile && !intakeGuardianAlreadyLinked && canManageGuardians"
                  type="button"
                  class="btn btn-primary btn-sm"
                  @click="openAddGuardian"
                >
                  Add guardian from intake info
                </button>
              </header>
              <div class="ov-card-body">
                <div class="ov-row">
                  <div class="ov-row-label">Name</div>
                  <div class="ov-row-value">{{ guardianIntakeName || '-' }}</div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Email</div>
                  <div class="ov-row-value">{{ guardianIntakeEmail || '-' }}</div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Phone</div>
                  <div class="ov-row-value">{{ guardianIntakePhone || '-' }}</div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Relationship</div>
                  <div class="ov-row-value">{{ guardianIntakeRelationship || '-' }}</div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Date of birth</div>
                  <div class="ov-row-value">{{ guardianIntakeDob ? formatDate(guardianIntakeDob) : '-' }}</div>
                </div>
              </div>
            </section>

            <!-- School ROI CTA (full width) -->
            <section v-if="canManageSchoolRoi" class="ov-card ov-card--full ov-card--cta">
              <header class="ov-card-header">
                <h3>School ROI</h3>
              </header>
              <div class="ov-card-body">
                <div class="ov-cta-row">
                  <button type="button" class="btn btn-secondary btn-sm" @click="activeTab = 'school-roi'">
                    Open School ROI Access
                  </button>
                  <span class="hint" style="margin: 0;">
                    Send signing links, notify guardians, and manage school-staff portal access for this client’s school.
                  </span>
                </div>
              </div>
            </section>

          </div>

          <div v-if="(canEditAccount && editingOverview) || (canTerminate && !editingOverview)" class="quick-actions">
            <h3>Quick Actions</h3>
            <div class="actions-grid">
              <button
                v-if="canTerminate && !isClientArchived"
                class="btn btn-danger"
                type="button"
                @click="openTerminateModal"
              >
                Terminate client
              </button>
              <template v-else-if="canEditAccount && editingOverview">
                <button
                  v-if="!isClientArchived"
                  class="btn btn-danger"
                  type="button"
                  @click="archiveClient"
                >
                  Archive client
                </button>
                <button
                  v-else
                  class="btn btn-secondary"
                  type="button"
                  @click="unarchiveClient"
                >
                  Unarchive client
                </button>
              </template>
            </div>
          </div>
          </details>
            </div>

            <aside class="cdp-overview-aside">
              <section class="cdp-aside-card">
                <h4>Quick actions</h4>
                <div class="cdp-aside-actions">
                  <button
                    v-if="!props.fullPage && props.client?.id"
                    type="button"
                    class="cdp-btn-primary"
                    @click="openFullClientRecord"
                  >
                    Open full client record
                  </button>
                  <button
                    v-if="canViewMedicalRecord"
                    type="button"
                    class="cdp-btn-soft"
                    @click="activeTab = 'medical-record'"
                  >
                    Start / view note
                  </button>
                  <button type="button" class="cdp-btn-soft" @click="activeTab = 'messages'">
                    Send secure message
                  </button>
                  <button type="button" class="cdp-btn-soft" @click="activeTab = 'phi'">
                    Upload document
                  </button>
                  <button
                    v-if="canPostClientToExchange"
                    type="button"
                    class="cdp-btn-soft"
                    @click="openPostToExchangeModal"
                  >
                    Post client to exchange
                  </button>
                  <button
                    v-if="isClinicalLikeClientType"
                    type="button"
                    class="cdp-btn-soft"
                    @click="activeTab = 'clinical'"
                  >
                    Clinical chart
                  </button>
                  <button
                    v-if="canViewClientBillingImport"
                    type="button"
                    class="cdp-btn-soft"
                    @click="activeTab = 'client-billing'"
                  >
                    Billing
                  </button>
                </div>
              </section>

              <section class="cdp-aside-card">
                <h4>Today</h4>
                <div class="cdp-aside-timeline">
                  <div class="cdp-aside-timeline__item">
                    <strong>Status</strong>
                    <span>{{ isClientArchived ? 'Archived' : displayStatusLabel }}</span>
                  </div>
                  <div class="cdp-aside-timeline__item">
                    <strong>Clinician</strong>
                    <span>{{ primaryProviderLabel }}</span>
                  </div>
                </div>
              </section>

              <section class="cdp-aside-card">
                <h4>Upcoming</h4>
                <div class="cdp-aside-timeline">
                  <button
                    v-for="alert in overviewAlertItems.slice(0, 3)"
                    :key="`side-${alert.id}`"
                    type="button"
                    class="cdp-aside-timeline__item cdp-aside-timeline__item--btn"
                    @click="alert.tab ? (activeTab = alert.tab) : undefined"
                  >
                    <strong>{{ alert.label }}</strong>
                  </button>
                  <div v-if="!overviewAlertItems.length" class="cdp-glance-meta">No upcoming items flagged.</div>
                </div>
              </section>
            </aside>
          </div>
        </div>

        <!-- Skill Builders program (skills clients — integrated groups/events; see docs/SKILL_BUILDERS_PROGRAM_AND_AFFILIATIONS.md) -->
        <div v-if="activeTab === 'skill-builders'" class="detail-section">
          <ClientSkillBuildersProgramTab :client="client" @program-updated="emit('updated', { keepOpen: true })" />
        </div>

        <!-- Compliance Checklist Tab -->
        <div v-if="activeTab === 'checklist'" class="detail-section">
          <h3 style="margin-top: 0;">Compliance Checklist</h3>
          <p class="hint" style="margin-top:-6px;">
            Operational tracking (non-clinical). Providers + admin/staff can update.
          </p>

          <div class="info-grid">
            <div class="info-item">
              <label>Parents Contacted</label>
              <div class="info-value">
                <input type="date" v-model="checklist.parentsContactedAt" class="inline-input" />
              </div>
            </div>
            <div class="info-item">
              <label>Contact Successful?</label>
              <div class="info-value">
                <select v-model="checklist.parentsContactedSuccessful" class="inline-select">
                  <option :value="''">—</option>
                  <option :value="'true'">Successful</option>
                  <option :value="'false'">Unsuccessful</option>
                </select>
              </div>
            </div>
            <div class="info-item">
              <label>First Date of Service</label>
              <div class="info-value">
                <input type="date" v-model="checklist.firstServiceAt" class="inline-input" />
                <p class="hint" style="margin-top: 6px; font-size: 12px;">
                  Do not list the date of first service unless the appointment has actually occurred, as this will mark the client as current.
                </p>
              </div>
            </div>
          </div>

          <div v-if="showContinuationServicesChecklist" class="continuation-checklist-section">
            <label class="continuation-checklist-label">Continuation of Services</label>
            <select v-model="checklist.continuation.plan" class="inline-select">
              <option value="">—</option>
              <option value="continue_school">Continuing Services</option>
              <option value="not_continue_school">Not Continuing Services</option>
              <option value="unable_to_contact_parent">Not able to contact parent</option>
              <option value="other">Other</option>
            </select>

            <div v-if="checklist.continuation.plan === 'continue_school'" class="cont-nested">
              <div class="cont-choice-row">
                <label class="cont-choice-card">
                  <input v-model="checklist.continuation.schoolChoice" type="radio" value="current_school" />
                  <span class="cont-choice-card-label">Current school</span>
                </label>
                <label class="cont-choice-card">
                  <input v-model="checklist.continuation.schoolChoice" type="radio" value="new_school" />
                  <span class="cont-choice-card-label">New school</span>
                </label>
              </div>

              <div v-if="checklist.continuation.schoolChoice === 'current_school'" class="cont-nested">
                <label class="cont-choice-card">
                  <input v-model="checklist.continuation.currentSchoolAction" type="radio" value="continuing_with_me" />
                  <span class="cont-choice-card-label">Continuing with me</span>
                </label>
                <label class="cont-choice-card">
                  <input v-model="checklist.continuation.currentSchoolAction" type="radio" value="requesting_transfer" />
                  <span class="cont-choice-card-label">Requesting transfer</span>
                </label>
              </div>

              <div v-if="checklist.continuation.schoolChoice === 'new_school'" class="cont-nested">
                <label style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">New school</label>
                <select v-model="checklist.continuation.newSchoolOrganizationId" class="inline-select">
                  <option value="">Select affiliated school…</option>
                  <option
                    v-for="school in checklistAgencySchools"
                    :key="school.school_organization_id"
                    :value="String(school.school_organization_id)"
                  >
                    {{ school.school_name }}
                  </option>
                </select>
                <input
                  v-if="!checklist.continuation.newSchoolOrganizationId"
                  v-model="checklist.continuation.newSchoolName"
                  class="inline-input"
                  type="text"
                  placeholder="Type school if not listed"
                />
                <div v-if="checklist.continuation.newSchoolOrganizationId" class="cont-nested">
                  <label class="cont-choice-card">
                    <input v-model="checklist.continuation.newSchoolAction" type="radio" value="continue_at_new_school_if_possible" />
                    <span class="cont-choice-card-label">I would like to continue to see them at their new school if possible</span>
                  </label>
                  <label class="cont-choice-card">
                    <input v-model="checklist.continuation.newSchoolAction" type="radio" value="pursue_in_office_support" />
                    <span class="cont-choice-card-label">I will pursue in-office support at the client's request</span>
                  </label>
                </div>
              </div>
            </div>

            <div
              v-if="['not_continue_school', 'unable_to_contact_parent', 'other'].includes(checklist.continuation.plan)"
              class="cont-nested"
            >
              <label style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">
                Private comment (admin / support only)
              </label>
              <textarea
                v-model="checklist.continuation.privateComment"
                class="inline-input"
                rows="3"
                placeholder="Required"
              />
              <label class="cont-choice-card">
                <input v-model="checklist.continuation.supportFollowUp" type="checkbox" />
                <span class="cont-choice-card-label">Request support follow-up</span>
              </label>
              <label class="cont-choice-card">
                <input v-model="checklist.continuation.removeFromAssignment" type="checkbox" />
                <span class="cont-choice-card-label">Remove provider assignment</span>
              </label>
              <template v-if="checklist.continuation.plan === 'not_continue_school'">
                <p class="hint">Terminates the client and removes them from caseload.</p>
              </template>
              <template v-else>
                <label style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">
                  Recommend termination?
                </label>
                <select v-model="checklist.continuation.recommendTerminate" class="inline-select">
                  <option value="">—</option>
                  <option value="false">No — flag Fall Readiness</option>
                  <option value="true">Yes — terminate</option>
                </select>
              </template>
            </div>
          </div>

          <div class="form-actions" style="margin-top: 12px;">
            <button class="btn btn-primary" @click="saveChecklist" :disabled="savingChecklist">
              {{ savingChecklist ? 'Saving…' : 'Save Checklist' }}
            </button>
            <span v-if="checklistAuditText" class="hint" style="margin-left: 10px;">
              {{ checklistAuditText }}
            </span>
          </div>
        </div>

        <!-- Status History Tab -->
        <div v-if="activeTab === 'history'" class="detail-section">
          <div v-if="historyLoading" class="loading">Loading history...</div>
          <div v-else-if="historyError" class="error">{{ historyError }}</div>
          <div v-else-if="history.length === 0" class="empty-state">
            <p>No history recorded yet.</p>
          </div>
          <div v-else class="history-timeline">
            <div
              v-for="entry in history"
              :key="entry.id"
              class="history-item"
            >
              <div class="history-time">{{ formatDateTime(entry.changed_at) }}</div>
              <div class="history-content">
                <div class="history-field">
                  <strong>{{ formatFieldName(entry.field_changed) }}</strong>
                </div>
                <div class="history-change">
                  <span v-if="entry.from_value" class="from-value">{{ entry.from_value }}</span>
                  <span class="arrow">→</span>
                  <span class="to-value">{{ entry.to_value }}</span>
                </div>
                <div v-if="entry.changed_by_name" class="history-author">
                  Changed by: {{ entry.changed_by_name }}
                </div>
                <div v-if="entry.note" class="history-note">
                  Note: {{ entry.note }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Access Log Tab -->
        <div v-if="activeTab === 'access'" class="detail-section">
          <div v-if="!canViewAccessLog" class="empty-state">
            <p>You don’t have permission to view access logs.</p>
          </div>
          <div v-else>
            <div v-if="accessLoading" class="loading">Loading access log…</div>
            <div v-else-if="accessError" class="error">{{ accessError }}</div>
            <div v-else-if="accessLog.length === 0" class="empty-state">
              <p>No access events recorded yet.</p>
            </div>
            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in accessLog" :key="e.id">
                    <td>{{ formatDateTime(e.created_at) }}</td>
                    <td>{{ formatAccessUser(e) }}</td>
                    <td>{{ e.user_role || '—' }}</td>
                    <td>{{ e.action }}</td>
                    <td>{{ e.ip_address || '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="hint" style="margin-top: 8px;">
                Tracks access to client profile + notes (best-effort).
              </div>
            </div>
          </div>
        </div>

        <!-- Clinical Tab (provider/admin only) -->
        <ClientClinicalTab
          v-if="activeTab === 'clinical'"
          :client="client"
          :billing-diagnoses="billingDiagnoses"
          :billing-diagnoses-loading="billingDiagnosesLoading"
          :billing-diagnoses-error="billingDiagnosesError"
          :is-super-admin="isSuperAdmin"
          :is-clinical-like-client-type="isClinicalLikeClientType"
          :is-backoffice-role="isBackofficeRole"
          :has-agency-access="hasAgencyAccess"
          :can-view-medical-record="canViewMedicalRecord"
          @navigate="activeTab = $event"
        />

        <!-- Billing import tab (financial — admin / support only) -->
        <div v-if="activeTab === 'client-billing'" class="detail-section">
          <ClientBillingImportTab
            :agency-id="Number(props.client?.agency_id || 0) || null"
            :client-id="Number(props.client?.id || 0) || null"
            :client="client"
          />
        </div>

        <!-- Medical Record Tab (clinical notes on imported sessions) -->
        <div v-if="activeTab === 'medical-record'" class="detail-section">
          <ClientMedicalRecordsTab
            :agency-id="Number(props.client?.agency_id || 0) || null"
            :client-id="Number(props.client?.id || 0) || null"
            :initial-encounter-id="medicalRecordEncounterId"
            @encounter-change="onMedicalRecordEncounterChange"
          />
        </div>

        <!-- Demographics Tab -->
        <div v-if="activeTab === 'demographics'" class="detail-section">
          <div class="tab-meta-bar">
            <div class="muted" style="font-size: 13px;">
              Core demographics from the client record
              <template v-if="demoCapturedAt">
                · Latest intake {{ new Date(demoCapturedAt).toLocaleDateString() }}
              </template>
            </div>
            <button v-if="canEditAccount" type="button" class="btn btn-primary btn-sm" @click="jumpToEditDemographics">
              Edit demographics
            </button>
          </div>

          <div v-if="demoLoading" class="loading">Loading demographics…</div>
          <div v-else-if="demoError" class="error">{{ demoError }}</div>
          <div v-else class="ov-sections">
            <section class="ov-card ov-card--demo-client">
              <header class="ov-card-header">
                <h3>Demographics</h3>
                <span class="muted" style="font-size: 12px;">From the client record</span>
              </header>
              <div class="ov-card-body">
                <div
                  v-for="row in clientDemoDisplayRows"
                  :key="row.key"
                  class="ov-row"
                  :class="{ 'ov-row--missing': row.missing && canEditAccount }"
                >
                  <div class="ov-row-label">
                    {{ row.label }}
                    <span v-if="row.missing && canEditAccount" class="demo-missing-chip">Not set</span>
                  </div>
                  <div class="ov-row-value" :class="{ muted: row.missing }">
                    {{ row.display }}
                  </div>
                </div>
              </div>
            </section>

            <section
              v-for="group in demoSupplementalSections"
              v-show="group.fields.length"
              :key="group.id"
              class="ov-card"
              :class="demoGroupCardClass(group)"
            >
              <header class="ov-card-header">
                <h3>{{ group.title }}</h3>
                <span v-if="group.subtitle" class="muted" style="font-size: 12px;">{{ group.subtitle }}</span>
              </header>
              <div class="ov-card-body">
                <div
                  v-for="f in group.fields"
                  :key="`${group.id}-${f.key}`"
                  class="ov-row"
                  :class="{ 'is-duplicate': !!f.duplicateOf }"
                >
                  <div class="ov-row-label">
                    {{ prettyDemoLabel(f) }}
                    <span v-if="f.duplicateOf" class="demo-dup-chip" :title="`Also present in ${f.duplicateOf}`">dup</span>
                  </div>
                  <div class="ov-row-value" style="white-space: pre-wrap;">{{ f.value }}</div>
                </div>
              </div>
            </section>

            <div
              v-if="!clientDemoHasAnyData && !demoSupplementalSections.some((g) => g.fields.length)"
              class="empty-state"
              style="margin-top: 8px;"
            >
              <p class="muted">No additional intake demographics on file yet.</p>
              <button v-if="canEditAccount" type="button" class="btn btn-secondary btn-sm" style="margin-top: 8px;" @click="jumpToEditDemographics">
                Enter demographics
              </button>
            </div>

            <div v-if="demoHasDuplicates" class="demo-dup-toggle-wrap">
              <label class="demo-toggle">
                <input type="checkbox" v-model="showDemoDuplicates" />
                Show duplicate intake fields ({{ demoDuplicateCount }})
              </label>
            </div>
          </div>
        </div>

        <!-- Surveys Tab -->
        <div v-if="activeTab === 'surveys'" class="detail-section">
          <div class="form-actions" style="margin-top: 0; justify-content: space-between;">
            <h3 style="margin:0;">Survey responses</h3>
            <button class="btn btn-secondary btn-sm" type="button" @click="printSurveyTrends">Print trend</button>
          </div>
          <div v-if="clientSurveysLoading" class="loading">Loading survey responses…</div>
          <div v-else-if="clientSurveysError" class="error">{{ clientSurveysError }}</div>
          <div v-else-if="!clientSurveyResponses.length" class="empty-state">
            <p>No client survey responses yet.</p>
          </div>
          <div v-else>
            <div v-if="clientScoreSeries.length" class="chart-block">
              <h4 class="clinical-section-title" style="margin-top:0;">Total score trend</h4>
              <svg viewBox="0 0 100 30" preserveAspectRatio="none" class="sparkline">
                <polyline
                  fill="none"
                  stroke="#2563eb"
                  stroke-width="1.5"
                  :points="clientSurveySparklinePoints"
                />
              </svg>
              <div class="muted small">Min: {{ clientScoreMin }} · Max: {{ clientScoreMax }}</div>
            </div>
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Survey</th>
                    <th>Total score</th>
                    <th>Category scores</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in clientSurveyResponses" :key="row.id">
                    <td>{{ formatDateTime(row.submitted_at || row.created_at) }}</td>
                    <td>{{ row.survey_title || `Survey ${row.survey_id}` }}</td>
                    <td>{{ row.total_score ?? '-' }}</td>
                    <td>{{ formatCategoryScores(row.category_scores_json) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Learning Billing Tab -->
        <div v-if="activeTab === 'billing'" class="detail-section">
          <GuardianBillingTab
            :agency-id="Number(props.client?.agency_id || 0) || null"
            :client-id="Number(props.client?.id || 0) || null"
          />
        </div>

        <!-- Practitioner Packages & Payments Tab -->
        <div v-if="activeTab === 'packages'" class="detail-section">
          <PractitionerClientPackagesTab
            :agency-id="Number(props.client?.agency_id || 0)"
            :client-id="Number(props.client?.id || 0)"
            :focus-payment-id="routePaymentFocus"
            :focus-entitlement-id="routeEntitlementFocus"
            @reup="onPractitionerReup"
            @send-packet="onPractitionerSendPacket"
            @pay-per-session="onPractitionerPayPerSession"
          />
        </div>

        <div v-if="activeTab === 'assessments' || activeTab === 'life-balance'" class="detail-section">
          <ClientAssessmentsTab
            :agency-id="Number(props.client?.agency_id || 0)"
            :client-id="Number(props.client?.id || 0)"
            :organization-slug="String(route.params?.organizationSlug || '')"
          />
        </div>

        <!-- Messages/Notes Tab -->
        <ClientMessagesTab
          v-if="activeTab === 'messages'"
          :client-id="Number(client.id)"
          :is-backoffice-role="isBackofficeRole"
        />

        <!-- Communications Tab -->
        <div v-if="activeTab === 'communications'" class="detail-section">
          <ClientCommunicationsTab :client-id="Number(props.client.id)" />
        </div>

        <!-- Guardians Tab -->
        <div v-if="activeTab === 'guardians'" class="detail-section">
          <div class="phi-warning" style="margin-bottom: 12px;">
            <strong>Non-clinical portal access:</strong> Guardians can be given access to docs, links, and program materials.
          </div>

          <div v-if="!canManageGuardians" class="empty-state">
            <p>You don’t have permission to manage guardians for this client.</p>
          </div>

          <div v-else>
            <div v-if="guardiansError" class="error" style="margin-bottom: 10px;">{{ guardiansError }}</div>
            <div style="display:flex; justify-content: space-between; align-items:center; gap: 12px; margin-bottom: 12px;">
              <div class="hint">Add one or more guardian accounts (e.g., divorced guardians) with their own logins.</div>
              <button type="button" class="btn btn-primary" @click="openAddGuardian">Add Guardian</button>
            </div>

            <!-- Intake guardian placeholder (not yet a full account) -->
            <div
              v-if="guardianIntakeProfile && !intakeGuardianAlreadyLinked && !guardiansLoading"
              class="intake-guardian-placeholder"
            >
              <div class="intake-guardian-placeholder-header">
                <span class="intake-guardian-badge">From intake form</span>
              </div>
              <div class="intake-guardian-placeholder-body">
                <div class="intake-guardian-details">
                  <div class="intake-guardian-field">
                    <span class="intake-guardian-label">Name</span>
                    <span>{{ guardianIntakeName || '-' }}</span>
                  </div>
                  <div class="intake-guardian-field">
                    <span class="intake-guardian-label">Email</span>
                    <span>{{ guardianIntakeEmail || '-' }}</span>
                  </div>
                  <div class="intake-guardian-field">
                    <span class="intake-guardian-label">Phone</span>
                    <span>{{ guardianIntakePhone || '-' }}</span>
                  </div>
                  <div class="intake-guardian-field">
                    <span class="intake-guardian-label">Relationship</span>
                    <span>{{ guardianIntakeRelationship || '-' }}</span>
                  </div>
                </div>
                <div class="intake-guardian-actions">
                  <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="creatingIntakeGuardian || !guardianIntakeEmail"
                    @click="createGuardianFromIntake"
                  >
                    {{ creatingIntakeGuardian ? 'Creating…' : 'Create Account' }}
                  </button>
                  <div class="hint" style="margin-top: 6px; text-align: center;">Creates login &amp; generates invite link</div>
                </div>
              </div>
            </div>

            <div
              v-if="!hasSelfGuardianLink && !guardiansLoading"
              class="intake-guardian-placeholder"
              style="margin-top: 10px;"
            >
              <div class="intake-guardian-placeholder-header">
                <span class="intake-guardian-badge">Self-access portal account</span>
              </div>
              <div class="intake-guardian-placeholder-body">
                <div class="intake-guardian-details">
                  <div class="intake-guardian-field">
                    <span class="intake-guardian-label">Client</span>
                    <span>{{ props.client?.full_name || props.client?.initials || `Client ${props.client?.id}` }}</span>
                  </div>
                  <div class="intake-guardian-field">
                    <span class="intake-guardian-label">Email for login</span>
                    <input
                      v-model.trim="selfGuardianEmail"
                      type="email"
                      placeholder="client@email.com"
                      style="min-width: 260px;"
                    />
                  </div>
                </div>
                <div class="intake-guardian-actions">
                  <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="creatingSelfGuardian || !selfGuardianEmail"
                    @click="createSelfAccessGuardian"
                  >
                    {{ creatingSelfGuardian ? 'Creating…' : 'Create self-access account' }}
                  </button>
                  <div class="hint" style="margin-top: 6px; text-align: center;">
                    Creates a guardian login tied to this same client as <strong>Self</strong>.
                  </div>
                </div>
              </div>
            </div>

            <div v-if="guardiansLoading" class="loading">Loading guardians…</div>
            <div v-else-if="(guardians || []).length === 0 && (!guardianIntakeProfile || intakeGuardianAlreadyLinked)" class="empty-state">
              <p>No guardians yet.</p>
            </div>
            <div v-else-if="(guardians || []).length > 0" class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Relationship title</th>
                    <th>Enabled</th>
                    <th class="right"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="g in guardians" :key="g.guardian_user_id">
                    <td>{{ g.first_name }} {{ g.last_name }}</td>
                    <td>{{ g.email }}</td>
                    <td style="min-width: 220px;">
                      <input v-model="g.relationship_title" type="text" />
                    </td>
                    <td>
                      <input v-model="g.access_enabled" type="checkbox" :true-value="1" :false-value="0" />
                    </td>
                    <td class="right" style="white-space: nowrap;">
                      <button
                        v-if="canMessageGuardian"
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="messagingGuardianId === g.guardian_user_id"
                        @click="messageGuardian(g)"
                        style="margin-right: 8px;"
                      >
                        Message
                      </button>
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="updatingGuardianId === g.guardian_user_id"
                        @click="updateGuardian(g)"
                      >
                        {{ updatingGuardianId === g.guardian_user_id ? 'Saving…' : 'Save' }}
                      </button>
                      <button
                        type="button"
                        class="btn btn-danger btn-sm"
                        :disabled="updatingGuardianId === g.guardian_user_id"
                        @click="removeGuardian(g)"
                        style="margin-left: 8px;"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="lastInviteLink" class="phi-warning" style="margin-top: 12px;">
              <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px;">
                <div>
                  <strong>Invite link generated</strong>
                  <div class="hint">Send this to the guardian to set access (expires in 48 hours).</div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" @click="copyText(lastInviteLink)">Copy link</button>
              </div>
              <div style="margin-top: 8px;">
                <input :value="lastInviteLink" readonly style="width:100%; font-family: monospace; font-size: 12px;" @click="$event.target.select()" />
              </div>
            </div>
          </div>

          <!-- Add Guardian Modal -->
          <div v-if="showAddGuardianModal" class="modal-overlay add-guardian-modal-overlay" @click.self="closeAddGuardian">
            <div class="modal-content add-guardian-modal" @click.stop style="max-width: 560px;">
              <div class="modal-header" style="padding: 18px 20px;">
                <h3 style="margin:0;">Add guardian access</h3>
                <button class="btn-close" @click="closeAddGuardian">×</button>
              </div>
              <div class="add-guardian-modal-body">
                <div
                  v-if="addGuardianFormPrefilledFromIntake"
                  class="add-guardian-intake-hint"
                >
                  Pre-filled from latest intake. Add a different guardian? Click <strong>Clear</strong> to start fresh.
                </div>
                <div class="form-group">
                  <label>Email *</label>
                  <input v-model="addGuardianForm.email" type="email" placeholder="guardian@email.com" />
                </div>
                <div class="filters-row">
                  <div class="filters-group" style="flex:1;">
                    <label class="filters-label">First name *</label>
                    <input v-model="addGuardianForm.firstName" class="filters-input" type="text" />
                  </div>
                  <div class="filters-group" style="flex:1;">
                    <label class="filters-label">Last name *</label>
                    <input v-model="addGuardianForm.lastName" class="filters-input" type="text" />
                  </div>
                </div>
                <div class="form-group">
                  <label>Relationship title</label>
                  <input v-model="addGuardianForm.relationshipTitle" type="text" placeholder="e.g., Mom, Dad, Guardian" />
                </div>
                <div class="form-group">
                  <label class="checkbox-label">
                    <input v-model="addGuardianForm.accessEnabled" type="checkbox" />
                    Enabled
                  </label>
                </div>
                <div class="form-section-divider" style="margin-top: 14px; margin-bottom: 10px;">
                  <h4 style="margin:0;">Permissions</h4>
                </div>
                <div class="filters-row" style="flex-wrap: wrap;">
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewDocs" type="checkbox" />
                    Can view docs
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canSignDocs" type="checkbox" />
                    Can sign docs
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewLinks" type="checkbox" />
                    Can view links
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewProgramMaterials" type="checkbox" />
                    Can view program materials
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewProgress" type="checkbox" />
                    Can view progress
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canMessage" type="checkbox" />
                    Can message (rare)
                  </label>
                </div>

                <div class="add-guardian-modal-actions">
                  <button
                    v-if="addGuardianFormPrefilledFromIntake"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="clearAddGuardianForm"
                    :disabled="addingGuardian"
                  >
                    Clear
                  </button>
                  <div style="flex:1;" />
                  <button type="button" class="btn btn-secondary" @click="closeAddGuardian" :disabled="addingGuardian">Cancel</button>
                  <button type="button" class="btn btn-primary" @click="addGuardian" :disabled="addingGuardian">
                    {{ addingGuardian ? 'Creating…' : 'Create + Generate invite link' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Assignments Tab (backoffice only) -->
        <div v-if="activeTab === 'assignments'" class="detail-section">
          <div class="form-section-divider" style="margin-top: 0; margin-bottom: 10px;">
            <h3 style="margin:0;">Client assignments</h3>
            <div class="hint">Manage multi-agency affiliations, multi-org affiliations, and scoped provider assignments.</div>
          </div>

          <div v-if="assignmentsError" class="error" style="text-align:left;">{{ assignmentsError }}</div>

          <div class="grid" style="display:grid; grid-template-columns: 1fr; gap: 16px;">
            <div class="card" style="border: 1px solid var(--border); border-radius: 12px; padding: 14px;">
              <h4 style="margin:0 0 10px;">Manage multi-agency affiliations</h4>
              <div class="hint" style="margin-bottom: 10px;">
                If a user has access to multiple agencies for a client, you can switch the client’s primary agency from the header dropdown.
              </div>
              <div v-if="clientAgenciesNote" class="muted" style="margin-bottom: 10px;">{{ clientAgenciesNote }}</div>

              <div v-if="(clientAgencyAffiliations || []).length === 0" class="hint">No agency affiliations found.</div>
              <div v-else class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Agency</th>
                      <th>Primary</th>
                      <th class="right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="a in clientAgencyAffiliations" :key="a.agency_id">
                      <td>{{ a.agency_name || `Agency ${a.agency_id}` }}</td>
                      <td>{{ a.is_primary ? 'Yes' : 'No' }}</td>
                      <td class="right" style="white-space: nowrap;">
                        <button
                          v-if="!a.is_primary"
                          type="button"
                          class="btn btn-secondary btn-sm"
                          :disabled="switchingAgency"
                          @click="selectedAgencyId = String(a.agency_id); onSwitchAgency(true)"
                        >
                          Set primary
                        </button>
                        <button
                          v-if="!a.is_primary"
                          type="button"
                          class="btn btn-danger btn-sm"
                          :disabled="switchingAgency"
                          @click="removeAgencyAffiliation(a.agency_id)"
                          style="margin-left: 8px;"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style="display:flex; gap: 10px; align-items:end; margin-top: 12px; flex-wrap: wrap;">
                <div style="min-width: 280px; flex: 1;">
                  <label class="filters-label">Add agency affiliation</label>
                  <select v-model="addAgencyAffiliationId" class="filters-select">
                    <option value="">Select…</option>
                    <option v-for="a in addableAgencyOptions" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
                  </select>
                </div>
                <label class="checkbox-label" style="min-width: 200px;">
                  <input v-model="addAgencyMakePrimary" type="checkbox" />
                  Set as primary
                </label>
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="switchingAgency || !addAgencyAffiliationId"
                  @click="addAgencyAffiliation"
                >
                  Add
                </button>
              </div>
            </div>

            <div class="card" style="border: 1px solid var(--border); border-radius: 12px; padding: 14px;">
              <h4 style="margin:0 0 10px;">Multi manage multi-org affiliations (school/program)</h4>
              <div v-if="affiliationsLoading" class="loading">Loading…</div>
              <div v-else>
                <div v-if="affiliations.length === 0" class="hint">No affiliations yet.</div>
                <div v-else class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Type</th>
                        <th>Primary</th>
                        <th class="right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="a in affiliations" :key="a.organization_id">
                        <td>{{ a.organization_name }}</td>
                        <td>{{ a.organization_type || '—' }}</td>
                        <td>{{ a.is_primary ? 'Yes' : 'No' }}</td>
                        <td class="right" style="white-space: nowrap;">
                          <button
                            v-if="!a.is_primary"
                            type="button"
                            class="btn btn-secondary btn-sm"
                            :disabled="savingAffiliation"
                            @click="setPrimaryAffiliation(a.organization_id)"
                          >
                            Set primary
                          </button>
                          <button
                            v-if="!a.is_primary"
                            type="button"
                            class="btn btn-danger btn-sm"
                            :disabled="savingAffiliation"
                            @click="removeAffiliation(a.organization_id)"
                            style="margin-left: 8px;"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style="display:flex; gap: 10px; align-items:end; margin-top: 12px; flex-wrap: wrap;">
                  <div style="min-width: 280px; flex: 1;">
                    <label class="filters-label">Add affiliation</label>
                    <select v-model="addAffiliationOrgId" class="filters-select">
                      <option value="">Select…</option>
                      <option v-for="o in availableAffiliationOptions" :key="o.id" :value="String(o.id)">
                        {{ o.name }} <span v-if="o.organization_type">({{ o.organization_type }})</span>
                      </option>
                    </select>
                  </div>
                  <label class="checkbox-label" style="min-width: 200px;">
                    <input v-model="addAffiliationMakePrimary" type="checkbox" />
                    Make primary
                  </label>
                  <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="savingAffiliation || !addAffiliationOrgId"
                    @click="addAffiliation"
                  >
                    {{ savingAffiliation ? 'Saving…' : 'Add' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="card" style="border: 1px solid var(--border); border-radius: 12px; padding: 14px;">
              <h4 style="margin:0 0 10px;">Scoped provider assignments (per affiliation)</h4>
              <div style="display:flex; gap: 10px; flex-wrap: wrap; align-items:end; margin-bottom: 12px;">
                <div style="min-width: 280px; flex: 1;">
                  <label class="filters-label">Affiliation</label>
                  <select v-model="selectedAssignmentOrgId" class="filters-select">
                    <option value="">Select…</option>
                    <option v-for="a in affiliations" :key="a.organization_id" :value="String(a.organization_id)">
                      {{ a.organization_name }}
                    </option>
                  </select>
                </div>
                <button type="button" class="btn btn-secondary" :disabled="!selectedAssignmentOrgId" @click="reloadProviderAssignments">
                  Refresh
                </button>
              </div>

              <div v-if="providerAssignmentsLoading" class="loading">Loading…</div>
              <div v-else-if="providerAssignments.length === 0" class="hint">No providers assigned for this affiliation.</div>
              <div v-else class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Day</th>
                      <th class="right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="pa in providerAssignments" :key="pa.id">
                      <td>
                        <template v-if="Number(editingProviderAssignmentId) === Number(pa.id)">
                          <select v-model="editProviderUserId" class="inline-select" style="min-width: 220px;">
                            <option value="">Select…</option>
                            <option v-for="p in providerOptions" :key="p.id" :value="String(p.id)">
                              {{ providerOptionLabel(p) }}
                            </option>
                          </select>
                        </template>
                        <template v-else>
                          {{ pa.provider_last_name }}, {{ pa.provider_first_name }}
                          <span v-if="pa.is_primary" class="badge badge-success" style="margin-left: 8px;">Primary</span>
                        </template>
                      </td>
                      <td>
                        <template v-if="Number(editingProviderAssignmentId) === Number(pa.id)">
                          <select v-model="editProviderDay" class="inline-select" style="min-width: 180px;">
                            <option value="Unknown">Unknown</option>
                            <option v-for="d in weekdayOptions" :key="d" :value="d">{{ d }}</option>
                          </select>
                        </template>
                        <template v-else>{{ pa.service_day || 'Unknown' }}</template>
                      </td>
                      <td class="right">
                        <template v-if="Number(editingProviderAssignmentId) === Number(pa.id)">
                          <button
                            class="btn btn-primary btn-sm"
                            type="button"
                            :disabled="savingProviderAssignment || !editProviderUserId || !editProviderDay"
                            @click="saveEditProviderAssignment(pa)"
                            style="margin-right: 8px;"
                          >
                            Save
                          </button>
                          <button class="btn btn-secondary btn-sm" type="button" :disabled="savingProviderAssignment" @click="cancelEditProviderAssignment">
                            Cancel
                          </button>
                        </template>
                        <template v-else>
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            :disabled="savingProviderAssignment"
                            @click="startEditProviderAssignment(pa)"
                            style="margin-right: 8px;"
                          >
                            Edit
                          </button>
                          <button
                            v-if="!pa.is_primary"
                            class="btn btn-secondary btn-sm"
                            type="button"
                            :disabled="savingProviderAssignment"
                            @click="makePrimaryProvider(pa)"
                            style="margin-right: 8px;"
                          >
                            Make primary
                          </button>
                          <button class="btn btn-danger btn-sm" type="button" :disabled="savingProviderAssignment" @click="removeProviderAssignment(pa)">
                            Remove
                          </button>
                        </template>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-if="selectedAssignmentOrgId" style="margin-top: 12px;">
                <div class="filters-row" style="flex-wrap: wrap;">
                  <div class="filters-group" style="min-width: 260px; flex: 1;">
                    <label class="filters-label">Provider</label>
                    <select v-model="addProviderUserId" class="filters-select">
                      <option value="">Select…</option>
                      <option v-for="p in providerOptions" :key="p.id" :value="String(p.id)">
                        {{ providerOptionLabel(p) }}
                      </option>
                    </select>
                    <div v-if="selectedAddProviderFacets?.summaryTags?.length" class="hint" style="margin-top: 6px;">
                      Clinical fit: {{ selectedAddProviderFacets.summaryTags.join(' · ') }}
                    </div>
                  </div>
                  <div class="filters-group" style="min-width: 200px;">
                    <label class="filters-label">Day</label>
                    <select v-model="addProviderDay" class="filters-select">
                      <option value="">Select…</option>
                      <option v-for="d in availableProviderDaysForSelectedOrg" :key="d" :value="d">{{ d }}</option>
                    </select>
                  </div>
                  <label class="checkbox-label" style="min-width: 180px;">
                    <input v-model="addProviderMakePrimary" type="checkbox" />
                    Make primary
                  </label>
                  <div class="actions" style="align-self: end;">
                    <button
                      type="button"
                      class="btn btn-primary"
                      :disabled="savingProviderAssignment || !addProviderUserId || !addProviderDay"
                      @click="addProviderAssignment"
                    >
                      {{ savingProviderAssignment ? 'Saving…' : 'Assign provider' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="card" style="border: 1px solid var(--border); border-radius: 12px; padding: 14px;">
              <h4 style="margin:0 0 10px;">Event assignments</h4>
              <div class="hint" style="margin-bottom: 10px;">
                Shows this client’s event enrollments and group assignments by timeline.
              </div>
              <div v-if="eventAssignmentsLoading" class="loading">Loading…</div>
              <div v-else-if="eventAssignmentsError" class="error" style="text-align:left;">{{ eventAssignmentsError }}</div>
              <div v-else>
                <div v-if="eventAssignmentsCurrentOrUpcoming.length > 0" style="margin-bottom: 12px;">
                  <div class="muted" style="font-weight: 800; margin-bottom: 6px;">Current &amp; upcoming</div>
                  <div class="table-wrap">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Event / group</th>
                          <th>Organization</th>
                          <th>Dates</th>
                          <th>Provider active</th>
                          <th v-if="canEditAccount">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="ev in eventAssignmentsCurrentOrUpcoming" :key="`cur-${eventAssignmentRowKey(ev)}`">
                          <td>{{ eventAssignmentTitle(ev) }}</td>
                          <td>{{ eventAssignmentOrgLabel(ev) }}</td>
                          <td>{{ eventAssignmentDateRange(ev) }}</td>
                          <td>{{ ev.active_for_providers ? 'Yes' : 'No' }}</td>
                          <td v-if="canEditAccount">
                            <button
                              v-if="ev.company_event_id"
                              type="button"
                              class="btn btn-secondary btn-xs"
                              @click="openSwitchRegistration(ev)"
                            >
                              Switch registration
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div v-if="eventAssignmentsPast.length > 0">
                  <div class="muted" style="font-weight: 800; margin-bottom: 6px;">Past</div>
                  <div class="table-wrap">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Event / group</th>
                          <th>Organization</th>
                          <th>Dates</th>
                          <th>Provider active</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="ev in eventAssignmentsPast" :key="`past-${eventAssignmentRowKey(ev)}`">
                          <td>{{ eventAssignmentTitle(ev) }}</td>
                          <td>{{ eventAssignmentOrgLabel(ev) }}</td>
                          <td>{{ eventAssignmentDateRange(ev) }}</td>
                          <td>{{ ev.active_for_providers ? 'Yes' : 'No' }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div
                  v-if="eventAssignmentsCurrentOrUpcoming.length === 0 && eventAssignmentsPast.length === 0"
                  class="hint"
                >
                  No event assignments found for this client.
                </div>
              </div>
            </div>

            <div v-if="switchRegistrationOpen" class="modal-overlay" style="z-index: 10001;" @click.self="closeSwitchRegistration">
              <div class="modal-card" style="max-width: 520px; padding: 18px;" @click.stop>
                <h4 style="margin: 0 0 8px;">Switch registration</h4>
                <p class="hint" style="margin: 0 0 14px;">
                  Move this client from
                  <strong>{{ switchRegistrationSourceTitle }}</strong>
                  to another event or program in this agency. Intake and workflow progress can be kept when applicable.
                </p>
                <div v-if="switchRegistrationLoading" class="hint">Loading available events…</div>
                <div v-else-if="switchRegistrationError" class="error" style="text-align:left;">{{ switchRegistrationError }}</div>
                <template v-else>
                  <label for="switch-reg-target" style="display:block; font-size:12px; font-weight:700; margin-bottom:6px;">New event</label>
                  <select
                    id="switch-reg-target"
                    v-model="switchRegistrationTargetId"
                    class="input"
                    style="width: 100%; margin-bottom: 12px;"
                  >
                    <option value="">Select an event…</option>
                    <template v-for="group in switchRegistrationGroupedOptions" :key="`sw-grp-${group.programName}`">
                      <optgroup :label="group.programName">
                        <option
                          v-for="opt in group.events"
                          :key="`sw-${opt.id}`"
                          :value="String(opt.id)"
                        >
                          {{ switchRegistrationOptionLabel(opt) }}
                        </option>
                      </optgroup>
                    </template>
                  </select>
                  <label class="check-left" style="display:flex; align-items:center; gap:8px; margin-bottom: 14px;">
                    <input v-model="switchRegistrationPreserveWorkflow" type="checkbox" />
                    <span>Keep intake &amp; workflow progress</span>
                  </label>
                  <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary btn-sm" :disabled="switchRegistrationSaving" @click="closeSwitchRegistration">
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="switchRegistrationSaving || !switchRegistrationTargetId"
                      @click="submitSwitchRegistration"
                    >
                      {{ switchRegistrationSaving ? 'Switching…' : 'Switch registration' }}
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- School ROI Access Tab -->
        <div v-if="activeTab === 'school-roi'" class="detail-section">
          <ClientSchoolRoiAccessTab
            :client="props.client"
            @updated="refreshClient"
          />
        </div>

        <!-- Documentation Tab -->
        <ClientDocumentsTab
          v-if="activeTab === 'phi'"
          :client-id="Number(client.id)"
          :client="client"
          :can-edit-paperwork="canEditPaperwork"
          :highlight-document-id="initialDocumentId"
        />

    <template v-if="!props.fullPage" #footer>
      <footer class="cdp-footer">
        <div class="cdp-footer-left">
          <button
            v-if="canTerminate && !isClientArchived"
            type="button"
            class="cdp-footer-link cdp-footer-link--danger"
            @click="openTerminateModal"
          >
            Terminate client
          </button>
          <button
            v-if="canEditAccount && !isClientArchived"
            type="button"
            class="cdp-footer-link"
            @click="activeTab = 'overview'; startEditOverview(true)"
          >
            Edit profile
          </button>
        </div>
        <div class="cdp-footer-right">
          <button type="button" class="cdp-btn-ghost" @click="handleClose">Close</button>
          <button
            v-if="props.client?.id"
            type="button"
            class="cdp-btn-primary"
            @click="openFullClientRecord"
          >
            Open full client record
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        </div>
      </footer>
    </template>

    <template #modals>
      <!-- Terminate client modal -->
      <div v-if="terminateModalOpen" class="modal-overlay" style="z-index: 10000;" @click.self="closeTerminateModal">
        <div class="modal-content" style="max-width: 480px;" @click.stop>
          <div class="modal-header">
            <h3 style="margin: 0;">Terminate client</h3>
            <button type="button" class="btn-close" @click="closeTerminateModal">×</button>
          </div>
          <p class="hint" style="margin-top: 0;">A termination reason is required. This will move the client to Terminated status and notify support staff.</p>
          <label class="required">Termination reason</label>
          <textarea
            v-model="terminateReasonDraft"
            rows="4"
            placeholder="Explain why this client was terminated…"
            class="inline-input"
            style="width: 100%; margin-top: 6px; margin-bottom: 8px;"
          />
          <div class="form-actions" style="justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn btn-secondary" @click="closeTerminateModal">Cancel</button>
            <button type="button" class="btn btn-danger" @click="terminateClient" :disabled="terminateSaving || !String(terminateReasonDraft || '').trim()">
              {{ terminateSaving ? 'Terminating…' : 'Terminate client' }}
            </button>
          </div>
        </div>
      </div>

      <AssignDayModal
        v-if="showAssignDayModal && schoolOrganizationId && client?.id"
        :organization-id="schoolOrganizationId"
        :client="client"
        @close="showAssignDayModal = false"
        @updated="onSchoolAssignmentUpdated"
      />

      <PostListingModal
        v-if="showPostToExchangeModal && clientAgencyId && client?.id"
        :agency-id="clientAgencyId"
        :is-backoffice="isBackofficeRole"
        :preset-client-id="Number(client.id)"
        :lock-client="true"
        :preset-client-label="postToExchangeClientLabel"
        @close="showPostToExchangeModal = false"
        @posted="onPostedToExchange"
      />
    </template>
  </ClientChartShell>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, provide } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import ClientSchoolRoiAccessTab from './ClientSchoolRoiAccessTab.vue';
import ClientCommunicationsTab from './ClientCommunicationsTab.vue';
import GuardianBillingTab from '../guardian/GuardianBillingTab.vue';
import PractitionerClientPackagesTab from './PractitionerClientPackagesTab.vue';
import ClientAssessmentsTab from './ClientAssessmentsTab.vue';
import ClientMedicalRecordsTab from './ClientMedicalRecordsTab.vue';
import ClientBillingImportTab from './ClientBillingImportTab.vue';
import ClientChartShell from './clientChart/ClientChartShell.vue';
import ClientClinicalTab from './clientChart/ClientClinicalTab.vue';
import ClientDocumentsTab from './clientChart/ClientDocumentsTab.vue';
import ClientMessagesTab from './clientChart/ClientMessagesTab.vue';
import { useClientEncounters } from '../../composables/useClientEncounters.js';
import { useClientBillingDiagnoses } from '../../composables/useClientBillingDiagnoses.js';
import { useClientPaperwork } from '../../composables/useClientPaperwork.js';
import { isPractitionerOrgType } from '../../utils/practitionerVertical';
import ClientSkillBuildersProgramTab from '../skillBuilders/ClientSkillBuildersProgramTab.vue';
import { isSkillsClientFlag } from '../../utils/skillsClientFlag.js';
import {
  formatGradeDisplay,
  gradeSelectOptionsForModel,
  normalizeGradeForSave,
  normalizeGradeToStandard
} from '../../utils/clientGrade.js';
import AssignDayModal from '../school/AssignDayModal.vue';
import PostListingModal from '../clientExchange/PostListingModal.vue';
import { canSeeClientExchangeNav } from '../../utils/clientExchangeNav.js';
import { useClientDisplayMode } from '../../composables/useClientDisplayMode.js';
import { assignedDayDisplay, displaySchoolClientStatusLabel } from '../../utils/schoolClientStatusDisplay.js';

const props = defineProps({
  client: {
    type: Object,
    required: true
  },
  initialTab: {
    type: String,
    default: ''
  },
  initialDocumentId: {
    type: Number,
    default: null
  },
  initialEncounterId: {
    type: Number,
    default: null
  },
  currentClientIndex: {
    type: Number,
    default: -1
  },
  navigationCount: {
    type: Number,
    default: 0
  },
  /** When true, renders as a full-page view instead of a modal overlay. */
  fullPage: {
    type: Boolean,
    default: false
  },
  /** School portal context: scopes assignments and opens school profile fields by default. */
  schoolOrganizationId: {
    type: [Number, String],
    default: null
  },
  /** School portal: allow day/assignment updates from overview (Assign day modal). */
  canManageSchoolAssignments: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'updated', 'navigate', 'tab-change', 'encounter-change']);

const authStore = useAuthStore();
const { getClientLabel } = useClientDisplayMode();
const route = useRoute();
const router = useRouter();

const routePaymentFocus = computed(() => Number(route.query.paymentId || 0) || null);
const routeEntitlementFocus = computed(() => Number(route.query.entitlementId || 0) || null);

const onPractitionerReup = () => {
  window.dispatchEvent(new CustomEvent('practitioner-client-reup', {
    detail: { clientId: Number(props.client?.id || 0), agencyId: Number(props.client?.agency_id || 0) }
  }));
  // Coaches re-up by sending another packet with the same package subset from the dashboard
  alert('To re-up: open Send packet on the coach dashboard and offer the same package again.');
};
const onPractitionerSendPacket = () => {
  alert('Open the coach dashboard → Send packet to offer a new package subset.');
};
const onPractitionerPayPerSession = () => {
  alert('Send a packet that includes a pay-per-session package, or book sessions with PER_SESSION payment mode.');
};

const activeTab = ref('overview');
const medicalRecordEncounterId = ref(null);

function onMedicalRecordEncounterChange(encounterId) {
  const n = Number(encounterId || 0);
  medicalRecordEncounterId.value = n > 0 ? n : null;
  emit('encounter-change', medicalRecordEncounterId.value);
}
const hasClientNavigation = computed(() => Number(props.navigationCount || 0) > 1 && Number(props.currentClientIndex || -1) >= 0);
const canNavigatePrevious = computed(() => Number(props.currentClientIndex || -1) > 0);
const canNavigateNext = computed(() => {
  const idx = Number(props.currentClientIndex || -1);
  const count = Number(props.navigationCount || 0);
  return idx >= 0 && idx < count - 1;
});
const currentClientPositionLabel = computed(() => {
  const idx = Number(props.currentClientIndex || -1);
  const count = Number(props.navigationCount || 0);
  if (idx < 0 || count <= 0) return '';
  return `${idx + 1} of ${count}`;
});
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const isSuperAdmin = computed(() => roleNorm.value === 'super_admin');
const isBackofficeRole = computed(() => ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm.value));

/** Intake-captured safety / support flags (eloping, extra assistance) — staff-facing only. */
const intakeSafetyStaffBanners = computed(() => {
  if (roleNorm.value === 'school_staff') return [];
  if (!isBackofficeRole.value && roleNorm.value !== 'supervisor') return [];
  const c = props.client || {};
  const yn = (v) => v === true || v === 1 || v === '1';
  const out = [];
  if (yn(c.eloping_flag)) {
    out.push({
      key: 'eloping',
      title: 'Eloping risk — staff only',
      notes: String(c.eloping_notes || '').trim() || null
    });
  }
  if (yn(c.extra_assistance_flag)) {
    out.push({
      key: 'extra_assistance',
      title: 'Extra assistance requested — staff only',
      notes: String(c.extra_assistance_notes || '').trim() || null
    });
  }
  return out;
});
const guardianIntakeProfile = computed(() => {
  if (roleNorm.value === 'school_staff') return null;
  return props.client?.guardian_intake_profile || null;
});
const guardianIntakeName = computed(() => String(
  guardianIntakeProfile.value?.fullName
  || `${guardianIntakeProfile.value?.firstName || ''} ${guardianIntakeProfile.value?.lastName || ''}`
  || ''
).trim() || null);
const guardianIntakeEmail = computed(() => String(guardianIntakeProfile.value?.email || '').trim() || null);
const guardianIntakePhone = computed(() => String(guardianIntakeProfile.value?.phone || '').trim() || null);
const guardianIntakeRelationship = computed(() => String(guardianIntakeProfile.value?.relationship || '').trim() || null);
const guardianIntakeDob = computed(() => String(guardianIntakeProfile.value?.dateOfBirth || '').trim() || null);
const intakeGuardianAlreadyLinked = computed(() => {
  const intakeEmail = guardianIntakeEmail.value;
  if (!intakeEmail) return true;
  return (guardians.value || []).some(
    (g) => String(g.email || '').trim().toLowerCase() === intakeEmail.toLowerCase()
  );
});
const canViewAdminNote = computed(() => ['super_admin', 'admin', 'support'].includes(roleNorm.value));
const canManageClientCode = computed(() => isBackofficeRole.value || roleNorm.value === 'supervisor');
// Providers terminate via "Mark as Terminated" in roster only; support staff use this panel
const canTerminate = computed(() => {
  if (!hasAgencyAccess.value) return false;
  if (isClientTerminated.value) return false;
  const r = roleNorm.value;
  return ['super_admin', 'admin', 'support', 'staff'].includes(r);
});
const learningBillingEnabledForClient = computed(() => {
  const orgType = String(props.client?.organization_type || '').toLowerCase();
  if (orgType !== 'learning') return false;
  const raw = props.client?.organization_feature_flags;
  const flags = typeof raw === 'string'
    ? (() => {
      try { return JSON.parse(raw); } catch { return {}; }
    })()
    : (raw || {});
  return flags.learningProgramBillingEnabled === true;
});

const practitionerPackagesEnabledForClient = computed(() => {
  const orgType = String(
    props.client?.organization_type
    || props.client?.agency_organization_type
    || ''
  ).toLowerCase();
  return isPractitionerOrgType(orgType);
});

// Overview tab state
const editingStatus = ref(false);
const statusValue = ref(null);
const availableProviders = ref([]); // used by other tabs (e.g., assignments) and legacy helpers
const skillsValue = ref(false);
const editingOverview = ref(false);
const savingOverview = ref(false);
const overviewForm = ref({
  full_name: '',
  initials: '',
  organization_id: '',
  client_status_id: '',
  termination_reason: '',
  submission_date: '',
  insurance_type_id: '',
  doc_date: '',
  school_year: '',
  grade: '',
  skills: false,
  referral_date: '',
  primary_client_language: '',
  primary_parent_language: '',
  source: '',
  date_of_birth: '',
  gender: '',
  ethnicity: '',
  preferred_language: '',
  address_street: '',
  address_apt: '',
  address_city: '',
  address_state: '',
  address_zip: ''
});

const overviewGradeSelectOptions = computed(() => gradeSelectOptionsForModel(overviewForm.value.grade));

// Overview edit dropdowns
const overviewOrganizations = ref([]);
const overviewClientStatuses = ref([]);
const overviewInsuranceTypes = ref([]);

const loadOverviewOptions = async () => {
  if (!canEditAccount.value) return;
  const agencyId = Number(props.client?.agency_id);
  if (!agencyId) return;
  try {
    const [orgResp, statusResp, insResp] = await Promise.all([
      api.get(`/agencies/${agencyId}/affiliated-organizations`),
      api.get('/client-settings/client-statuses', { params: { agencyId } }),
      api.get('/client-settings/insurance-types', { params: { agencyId } })
    ]);
    overviewOrganizations.value = (orgResp.data || [])
      .filter((o) => ['school', 'program', 'learning', 'clinical'].includes(String(o?.organization_type || '').toLowerCase()))
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    overviewClientStatuses.value = (statusResp.data || []).filter((s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true));
    overviewInsuranceTypes.value = (insResp.data || []).filter((s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true));
  } catch {
    // best-effort; keep existing lists
  }
};

// History tab state
const history = ref([]);
const historyLoading = ref(false);
const historyError = ref('');

// Access log tab state
const accessLog = ref([]);
const accessLoading = ref(false);
const accessError = ref('');

const myAgencies = ref([]);

// Multi-agency (client may be affiliated with multiple agencies)
const clientAgencyAffiliations = ref([]);
const selectedAgencyId = ref('');
const switchingAgency = ref(false);

const switchableAgencies = computed(() => {
  if (isSuperAdmin.value) {
    return (clientAgencyAffiliations.value || [])
      .map((a) => ({
        id: Number(a?.agency_id),
        name: String(a?.agency_name || '').trim()
      }))
      .filter((a) => a.id && a.name);
  }
  const mine = new Set((myAgencies.value || []).map((a) => Number(a?.id)).filter(Boolean));
  const fromClient = (clientAgencyAffiliations.value || []).map((a) => ({
    id: Number(a?.agency_id),
    name: String(a?.agency_name || '').trim()
  })).filter((a) => a.id && a.name);

  // If the table isn't migrated yet, fall back to user's agencies for the client's current agency_id.
  if (!fromClient.length && props.client?.agency_id) {
    const match = (myAgencies.value || []).find((a) => Number(a?.id) === Number(props.client.agency_id)) || null;
    if (match?.id) return [{ id: Number(match.id), name: String(match.name || `Agency ${match.id}`) }];
  }

  return fromClient.filter((a) => mine.has(a.id));
});

const hasAgencyAccess = computed(() => {
  if (isSuperAdmin.value) return true;
  if (Number(props.schoolOrganizationId || 0) > 0 && isBackofficeRole.value) return true;
  const mine = new Set((myAgencies.value || []).map((a) => Number(a?.id)).filter(Boolean));
  const clientOrgId = Number(props.client?.organization_id || 0);
  if (clientOrgId && mine.has(clientOrgId)) return true;
  const clientAgencyIds = (clientAgencyAffiliations.value || []).map((a) => Number(a?.agency_id)).filter(Boolean);
  if (clientAgencyIds.length > 0) {
    return clientAgencyIds.some((id) => mine.has(id));
  }
  return mine.has(Number(props.client?.agency_id || 0));
});

const isSchoolPortalContext = computed(() => Number(props.schoolOrganizationId || 0) > 0);
const schoolOrganizationId = computed(() => Number(props.schoolOrganizationId || 0) || null);
const schoolProfileDetailsOpen = computed(() => editingOverview.value || isSchoolPortalContext.value);
const canManageSchoolAssignments = computed(
  () => props.canManageSchoolAssignments && isSchoolPortalContext.value
);
const showAssignDayModal = ref(false);

const canEditAccount = computed(() => isBackofficeRole.value && hasAgencyAccess.value);

const clientDobLabel = computed(() => {
  const raw = props.client?.date_of_birth;
  if (!raw) return '';
  return formatDate(raw);
});

const sexSelectOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'other', label: 'Other / self-describe' }
];
const ethnicitySelectOptions = [
  { value: 'american_indian', label: 'American Indian or Alaska Native' },
  { value: 'asian', label: 'Asian' },
  { value: 'black', label: 'Black or African American' },
  { value: 'hispanic', label: 'Hispanic or Latino' },
  { value: 'nhpi', label: 'Native Hawaiian or Other Pacific Islander' },
  { value: 'white', label: 'White' },
  { value: 'two_or_more', label: 'Two or more races' },
  { value: 'other', label: 'Other / self-describe' }
];
const languageSelectOptions = [
  { value: 'english', label: 'English' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'french', label: 'French' },
  { value: 'mandarin', label: 'Mandarin' },
  { value: 'arabic', label: 'Arabic' },
  { value: 'other', label: 'Other' }
];
// Existing values may be free-text from older intakes/imports that don't match the
// standard option value keys above — fall back to showing the raw stored value.
const formatDemoLookupValue = (raw, options) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  const match = options.find((o) => o.value === value.toLowerCase());
  return match ? match.label : value;
};

const clientAddressLine = computed(() => {
  const c = props.client || {};
  const line1 = [c.address_street, c.address_apt].filter((v) => String(v || '').trim()).join(' ');
  const line2 = [c.address_city, c.address_state].filter((v) => String(v || '').trim()).join(', ');
  return [line1, [line2, c.address_zip].filter((v) => String(v || '').trim()).join(' ')]
    .filter((v) => String(v || '').trim())
    .join(' · ');
});

const clientAgeLabel = computed(() => {
  const raw = props.client?.date_of_birth;
  if (!raw) return '';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? String(age) : '';
});

const primaryInsuranceLabel = computed(() => {
  const name = String(props.client?.primary_insurer_name || props.client?.insurance_type_label || '').trim();
  return name || '';
});

const primaryProviderLabel = computed(() => {
  const primary = (effectiveOverviewProviders.value || []).find((p) => p?.is_primary) || (effectiveOverviewProviders.value || [])[0];
  if (primary) {
    const last = String(primary.provider_last_name || '').trim();
    const first = String(primary.provider_first_name || '').trim();
    if (last || first) return `${last}${last && first ? ', ' : ''}${first}`;
  }
  return String(props.client?.provider_name || '').trim() || 'Not assigned';
});

const clientAgenciesNote = computed(() => {
  // If user isn't affiliated with the client’s agency (or the client is multi-agency),
  // show a small note to indicate other agency affiliation may exist.
  const rows = Array.isArray(clientAgencyAffiliations.value) ? clientAgencyAffiliations.value : [];
  if (!rows.length) return '';
  const mine = new Set((myAgencies.value || []).map((a) => Number(a?.id)).filter(Boolean));
  const clientAgencyIds = rows.map((r) => Number(r?.agency_id)).filter(Boolean);
  const mineCount = clientAgencyIds.filter((id) => mine.has(id)).length;
  if (mineCount > 0) {
    if (rows.length > mineCount) return 'Note: client is also affiliated with another agency.';
    return '';
  }
  // User has no agency overlap; show which agency owns the client.
  const names = rows.map((r) => String(r?.agency_name || '').trim()).filter(Boolean);
  if (names.length) return `Note: client is affiliated with another agency (${names.join(', ')}).`;
  return 'Note: client is affiliated with another agency.';
});

const openFullClientRecord = () => {
  if (!props.client?.id) return;
  const orgSlug = String(route.params?.organizationSlug || '').trim();
  const tab = String(activeTab.value || 'overview');
  const path = orgSlug
    ? `/${orgSlug}/admin/clients/${props.client.id}`
    : `/admin/clients/${props.client.id}`;
  const query = tab && tab !== 'overview' ? { tab } : {};
  // Navigate to the dedicated full-page profile; keep current tab in the query.
  router.push({ path, query }).catch(() => {
    window.location.assign(`${path}${query.tab ? `?tab=${encodeURIComponent(query.tab)}` : ''}`);
  });
};

const addAgencyAffiliationId = ref('');
const addAgencyMakePrimary = ref(false);
const addableAgencyOptions = computed(() => {
  const existing = new Set((clientAgencyAffiliations.value || []).map((a) => Number(a?.agency_id)).filter(Boolean));
  return (myAgencies.value || []).filter((a) => a && !existing.has(Number(a.id)));
});

const addAgencyAffiliation = async () => {
  const agencyId = addAgencyAffiliationId.value ? Number(addAgencyAffiliationId.value) : null;
  if (!agencyId) return;
  const makePrimary = !!addAgencyMakePrimary.value;
  try {
    switchingAgency.value = true;
    await api.post(`/clients/${props.client.id}/agency-affiliations`, { agency_id: agencyId, is_primary: makePrimary });
    addAgencyAffiliationId.value = '';
    addAgencyMakePrimary.value = false;
    await fetchClientAgencyAffiliations();
    if (makePrimary) {
      // If we made it primary, props.client will be refreshed by parent; keep local selection consistent.
      selectedAgencyId.value = String(agencyId);
    }
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to add agency affiliation');
  } finally {
    switchingAgency.value = false;
  }
};

const removeAgencyAffiliation = async (agencyId) => {
  const id = Number(agencyId);
  if (!id) return;
  if (!window.confirm('Remove this agency affiliation?')) return;
  try {
    switchingAgency.value = true;
    await api.delete(`/clients/${props.client.id}/agency-affiliations/${id}`);
    await fetchClientAgencyAffiliations();
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to remove agency affiliation');
  } finally {
    switchingAgency.value = false;
  }
};

const docStatusDetailsEl = ref(null);

// Multi-org + multi-provider assignments (backoffice only)
const affiliations = ref([]);

const SCHOOL_LIKE_ORG_TYPES = new Set(['school', 'program', 'learning']);
const isSchoolLikeOrgType = (t) => SCHOOL_LIKE_ORG_TYPES.has(String(t || '').trim().toLowerCase());

const CLIENT_TYPE_ORDER = ['basic_nonclinical', 'school', 'learning', 'clinical'];
const CLIENT_TYPE_LABELS = {
  basic_nonclinical: 'Basic (Non-Clinical)',
  school: 'School',
  learning: 'Learning/Program',
  clinical: 'Clinical'
};
const normalizeClientType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return CLIENT_TYPE_ORDER.includes(normalized) ? normalized : '';
};

const explicitClientType = computed(() => normalizeClientType(props.client?.client_type));
const hasExplicitClientType = computed(() => !!explicitClientType.value);
const fallbackClientTypeFromOrg = computed(() => {
  const orgType = String(props.client?.organization_type || '').trim().toLowerCase();
  if (orgType === 'school') return 'school';
  if (orgType === 'learning') return 'learning';
  if (orgType === 'program' || orgType === 'clinical') return 'clinical';
  if (isSchoolLikeOrgType(orgType)) return 'school';
  return 'basic_nonclinical';
});
const effectiveClientType = computed(() => explicitClientType.value || fallbackClientTypeFromOrg.value);
const clientTypeLabel = computed(() => CLIENT_TYPE_LABELS[effectiveClientType.value] || effectiveClientType.value || 'Unknown');
const isSchoolClientType = computed(() => effectiveClientType.value === 'school');
const isClinicalLikeClientType = computed(() => ['clinical', 'learning'].includes(effectiveClientType.value));
const showSchoolSpecificOverviewFields = computed(() => isSchoolClientType.value);
const displayStatusLabel = computed(() => {
  if (isClientArchived.value) return 'Archived';
  return displaySchoolClientStatusLabel(props.client);
});
const showSchoolGlance = computed(() =>
  isSchoolClientType.value
  || isSchoolPortalContext.value
  || !!Number(props.client?.organization_id)
  || !!String(props.client?.organization_name || '').trim()
  || !!String(props.client?.service_day || '').trim()
);
const schoolGlanceLabel = computed(() => {
  const fromAssignments = [...new Set(
    (effectiveOverviewProviders.value || [])
      .map((p) => String(p.organization_name || '').trim())
      .filter(Boolean)
  )];
  if (fromAssignments.length) return fromAssignments.join(' · ');
  return String(props.client?.organization_name || '').trim() || 'Not on a school roster';
});
const assignedDayGlanceLabel = computed(() => {
  const days = String(careTeamGlanceMeta.value || '').trim();
  if (days && days.toLowerCase() !== 'unknown') return days;
  return assignedDayDisplay(props.client);
});
const organizationLabel = computed(() => (isSchoolClientType.value ? 'School' : 'Organization'));
const clientTypeOptions = computed(() => {
  const all = CLIENT_TYPE_ORDER.map((value) => ({
    value,
    label: CLIENT_TYPE_LABELS[value] || value
  }));
  if (isSuperAdmin.value) return all;
  const currentIndex = CLIENT_TYPE_ORDER.indexOf(effectiveClientType.value);
  if (currentIndex < 0) return all;
  return all.filter((opt) => CLIENT_TYPE_ORDER.indexOf(opt.value) >= currentIndex);
});

const canSeeClientFullName = computed(() => {
  // Backoffice roles only see full name. School staff and other portal roles stay on initials/code.
  return ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm.value);
});

const avatarText = computed(() => {
  const initials = String(props.client?.initials || '').trim();
  if (!initials) return '?';
  const letters = initials.replace(/[^A-Za-z0-9]/g, '');
  if (!letters) return initials.slice(0, 2).toUpperCase();
  if (letters.length === 1) return letters.toUpperCase();
  return (letters[0] + letters[letters.length > 3 ? 3 : 1]).toUpperCase();
});

const avatarColor = computed(() => {
  const seed = String(props.client?.identifier_code || props.client?.initials || props.client?.id || 'x');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue}, 65%, 52%) 0%, hsl(${(hue + 28) % 360}, 70%, 42%) 100%)`,
    boxShadow: `0 6px 18px -8px hsla(${hue}, 70%, 35%, 0.55)`
  };
});

const statusPillClass = computed(() => {
  if (isClientArchived.value) return 'cdp-pill--archived';
  if (isClientTerminated.value) return 'cdp-pill--terminated';
  const label = String(props.client?.client_status_label || '').toLowerCase();
  if (!label) return 'cdp-pill--neutral';
  if (label.includes('active') || label.includes('enrolled')) return 'cdp-pill--success';
  if (label.includes('packet') || label.includes('intake') || label.includes('pending')) return 'cdp-pill--info';
  if (label.includes('hold') || label.includes('wait')) return 'cdp-pill--warning';
  return 'cdp-pill--neutral';
});
const canEditClientType = computed(
  () => hasAgencyAccess.value && (isSuperAdmin.value || roleNorm.value === 'admin')
);
const clientTypeDraft = ref('basic_nonclinical');
const savingClientType = ref(false);
const adminDetailsEl = ref(null);
const clientTypeSelectEl = ref(null);

const openAdminSettings = async () => {
  const el = adminDetailsEl.value;
  if (el) el.open = true;
  await nextTick();
  clientTypeSelectEl.value?.focus();
};

const isSchoolClientByPrimaryOrg = computed(() => isSchoolLikeOrgType(props.client?.organization_type));

const clientHasSchoolLikeOrgAffiliation = computed(() =>
  (affiliations.value || []).some((a) => isSchoolLikeOrgType(a?.organization_type))
);

const clientQualifiesForSchoolRoiTab = computed(
  // Strict rule: school ROI for school-type clients.
  // Legacy fallback: if type is missing, allow school-like org affiliation.
  () => isSchoolClientType.value || (!hasExplicitClientType.value && (isSchoolClientByPrimaryOrg.value || clientHasSchoolLikeOrgAffiliation.value))
);

const canManageSchoolRoi = computed(
  () => isBackofficeRole.value && hasAgencyAccess.value && clientQualifiesForSchoolRoiTab.value
);

const canViewClientBillingImport = computed(() => {
  if (!isClinicalLikeClientType.value) return false;
  return ['super_admin', 'admin', 'support'].includes(roleNorm.value);
});

const canViewMedicalRecord = computed(() => {
  if (!isClinicalLikeClientType.value) return false;
  return [
    'super_admin',
    'admin',
    'support',
    'provider',
    'provider_plus',
    'supervisor',
    'clinical_practice_assistant'
  ].includes(roleNorm.value);
});

const clientAgencyId = computed(() => Number(props.client?.agency_id || 0) || null);
const clientChartClientId = computed(() => Number(props.client?.id || 0) || null);

const showPostToExchangeModal = ref(false);
const postToExchangeClientLabel = computed(() => {
  const label = getClientLabel(props.client);
  const type = clientTypeLabel.value;
  return type ? `${label} — ${type}` : label;
});
const canPostClientToExchange = computed(() => {
  if (!canSeeClientExchangeNav(roleNorm.value)) return false;
  if (!isClinicalLikeClientType.value) return false;
  if (!hasAgencyAccess.value) return false;
  if (isClientArchived.value) return false;
  if (isBackofficeRole.value) return true;
  const providerId = Number(props.client?.provider_id || 0);
  return providerId > 0 && providerId === Number(authStore.user?.id || 0);
});

function openPostToExchangeModal() {
  showPostToExchangeModal.value = true;
}

function onPostedToExchange() {
  showPostToExchangeModal.value = false;
  emit('updated', { keepOpen: true });
}

const {
  diagnoses: billingDiagnoses,
  loading: billingDiagnosesLoading,
  error: billingDiagnosesError,
  load: fetchBillingDiagnoses,
  primaryDiagnosisLabel
} = useClientBillingDiagnoses(clientAgencyId, clientChartClientId, isClinicalLikeClientType);

const {
  lastSession,
  sessionCount,
  unsignedNotesCount
} = useClientEncounters(clientAgencyId, clientChartClientId, {
  medicalOnly: true,
  enabled: computed(() => isClinicalLikeClientType.value && canViewMedicalRecord.value)
});

const lastSessionLabel = computed(() => {
  const row = lastSession.value;
  if (!row?.service_date) return '—';
  const d = new Date(row.service_date);
  if (!Number.isFinite(d.getTime())) return String(row.service_date);
  return d.toLocaleDateString();
});

const lastSessionMeta = computed(() => {
  const row = lastSession.value;
  if (!row) return canViewMedicalRecord.value ? 'No sessions imported' : '—';
  const code = row.service_code ? `CPT ${row.service_code}` : '';
  const pos = row.place_of_service === '03' ? 'In school' : row.place_of_service ? `POS ${row.place_of_service}` : '';
  return [code, pos].filter(Boolean).join(' · ') || 'Imported session';
});

const sessionCountLabel = computed(() => {
  if (!canViewMedicalRecord.value || !isClinicalLikeClientType.value) return '—';
  return String(sessionCount.value || 0);
});

const overviewAlertItems = computed(() => {
  const items = [];
  for (const b of intakeSafetyStaffBanners.value || []) {
    items.push({
      id: `safety-${b.key}`,
      label: b.title || 'Safety flag',
      tone: 'danger',
      tab: 'clinical'
    });
  }
  if (isClientTerminated.value) {
    items.push({ id: 'terminated', label: 'Client terminated', tone: 'danger', tab: 'overview' });
  }
  if (!clientCodeIsValid.value && canManageClientCode.value) {
    items.push({ id: 'missing-code', label: 'Client code missing', tone: 'warning', tab: 'overview' });
  }
  if (unsignedNotesCount.value > 0) {
    const n = unsignedNotesCount.value;
    items.push({
      id: 'unsigned-notes',
      label: `${n} unsigned note${n === 1 ? '' : 's'}`,
      tone: 'warning',
      tab: 'medical-record'
    });
  }
  if (canViewMedicalRecord.value && isClinicalLikeClientType.value && !billingDiagnoses.value.length && !billingDiagnosesLoading.value) {
    items.push({ id: 'no-dx', label: 'No billing diagnoses on file', tone: 'info', tab: 'clinical' });
  }
  return items.slice(0, 6);
});

const tabs = computed(() => {
  const base = [{ id: 'overview', label: 'Overview' }];
  if (isSchoolClientType.value && isSkillsClientFlag(props.client?.skills)) {
    base.push({ id: 'skill-builders', label: 'Events / groups' });
  }
  if (isSchoolClientType.value) {
    base.push({ id: 'checklist', label: 'Checklist' });
  }
  base.push(
    { id: 'history', label: 'Status History' },
    { id: 'access', label: 'Access Log' },
    { id: 'messages', label: 'Messages / Notes' },
    { id: 'communications', label: 'Communications' },
    { id: 'guardians', label: 'Guardians' },
    { id: 'phi', label: 'Documents' }
  );
  if (learningBillingEnabledForClient.value) {
    const idx = base.findIndex((t) => t.id === 'messages');
    base.splice(idx < 0 ? base.length : idx, 0, { id: 'billing', label: 'Billing' });
  }
  if (practitionerPackagesEnabledForClient.value) {
    const idx = base.findIndex((t) => t.id === 'messages');
    base.splice(idx < 0 ? base.length : idx, 0, { id: 'packages', label: 'Packages' });
  }
  if (canEditAccount.value) {
    const idx = base.findIndex((t) => t.id === 'phi');
    base.splice(idx < 0 ? base.length : idx, 0, { id: 'assignments', label: 'Assignments' });
  }
  if (canManageSchoolRoi.value) {
    const roiIdx = base.findIndex((t) => t.id === 'phi');
    base.splice(roiIdx < 0 ? base.length : roiIdx, 0, { id: 'school-roi', label: 'School ROI Access' });
  }
  // Clinical tab: intake / profile clinical fields
  if (
    isClinicalLikeClientType.value
    && ['provider', 'provider_plus', 'admin', 'super_admin', 'support', 'staff'].includes(roleNorm.value)
  ) {
    const clinicalIdx = base.findIndex((t) => t.id === 'messages');
    base.splice(clinicalIdx < 0 ? base.length : clinicalIdx, 0, { id: 'clinical', label: 'Clinical' });
  }
  if (canViewMedicalRecord.value) {
    const anchor = base.findIndex((t) => t.id === 'clinical');
    const insertAt = anchor >= 0 ? anchor + 1 : base.findIndex((t) => t.id === 'messages');
    base.splice(insertAt < 0 ? base.length : insertAt, 0, { id: 'medical-record', label: 'Medical Record' });
  }
  if (canViewClientBillingImport.value) {
    const anchor = base.findIndex((t) => t.id === 'medical-record');
    const insertAt = anchor >= 0 ? anchor + 1 : base.findIndex((t) => t.id === 'clinical');
    base.splice(insertAt < 0 ? base.length : insertAt, 0, {
      id: 'client-billing',
      label: learningBillingEnabledForClient.value ? 'Billing (import)' : 'Billing'
    });
  }
  // Demographics tab: visible to admin/support roles and providers
  if (['super_admin', 'admin', 'support', 'staff', 'provider', 'provider_plus'].includes(roleNorm.value)) {
    const demoIdx = base.findIndex((t) => t.id === 'clinical');
    base.splice(demoIdx < 0 ? base.length : demoIdx, 0, { id: 'demographics', label: 'Demographics' });
  }
  if (['super_admin', 'admin', 'support', 'staff'].includes(roleNorm.value)) {
    const surveysIdx = base.findIndex((t) => t.id === 'messages');
    base.splice(surveysIdx < 0 ? base.length : surveysIdx, 0, { id: 'surveys', label: 'Surveys' });
  }
  if (['super_admin', 'admin', 'support', 'staff', 'provider', 'provider_plus', 'supervisor'].includes(roleNorm.value)) {
    const idx = base.findIndex((t) => t.id === 'messages');
    base.splice(idx < 0 ? base.length : idx, 0, { id: 'assessments', label: 'Assessments' });
  }
  return base;
});

const affiliationsLoading = ref(false);
const assignmentsError = ref('');
const availableAffiliations = ref([]);
const addAffiliationOrgId = ref('');
const addAffiliationMakePrimary = ref(false);
const savingAffiliation = ref(false);

const selectedAssignmentOrgId = ref('');
const providerAssignments = ref([]);
const providerAssignmentsLoading = ref(false);
const eventAssignments = ref([]);
const eventAssignmentsLoading = ref(false);
const eventAssignmentsError = ref('');
const switchRegistrationOpen = ref(false);
const switchRegistrationLoading = ref(false);
const switchRegistrationSaving = ref(false);
const switchRegistrationError = ref('');
const switchRegistrationSourceEventId = ref(0);
const switchRegistrationSourceTitle = ref('');
const switchRegistrationSourceProgramId = ref(null);
const switchRegistrationTargetId = ref('');
const switchRegistrationPreserveWorkflow = ref(true);
const switchRegistrationOptions = ref([]);

const switchRegistrationGroupedOptions = computed(() => {
  const groups = new Map();
  for (const opt of switchRegistrationOptions.value || []) {
    const label = String(opt?.programName || '').trim() || 'Other programs';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(opt);
  }
  return [...groups.entries()].map(([programName, events]) => ({ programName, events }));
});
const providerOptions = ref([]);
const providerClinicalFacets = ref({});
const addProviderUserId = ref('');
const addProviderDay = ref('');
const addProviderMakePrimary = ref(true);
const savingProviderAssignment = ref(false);
const editingProviderAssignmentId = ref(null);
const editProviderUserId = ref('');
const editProviderDay = ref('Unknown');

const weekdayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const providerOptionLabel = (p) => {
  const base = `${p?.last_name || ''}, ${p?.first_name || ''}`.replace(/^,\s*/, '').trim();
  const tags = providerClinicalFacets.value?.[String(p?.id)]?.summaryTags || [];
  if (!tags.length) return base;
  return `${base} — ${tags.slice(0, 4).join(', ')}`;
};

const selectedAddProviderFacets = computed(() => {
  const id = addProviderUserId.value ? String(addProviderUserId.value) : '';
  return id ? (providerClinicalFacets.value?.[id] || null) : null;
});

const eventAssignmentsCurrentOrUpcoming = computed(() =>
  (eventAssignments.value || []).filter((ev) => String(ev?.timeframe || '').toLowerCase() !== 'past')
);
const eventAssignmentsPast = computed(() =>
  (eventAssignments.value || []).filter((ev) => String(ev?.timeframe || '').toLowerCase() === 'past')
);

// Overview: show all (primary + secondary) providers across affiliations.
const overviewProviders = ref([]);
const overviewProvidersLoading = ref(false);

function providersFromClientSnapshot(client) {
  if (!client) return [];
  const raw = String(client.provider_day_pairs || '').trim();
  if (raw) {
    const byProvider = new Map();
    for (const part of raw.split('|')) {
      const bits = String(part || '').split(':');
      if (bits.length < 2) continue;
      const pid = parseInt(bits[0], 10);
      if (!pid) continue;
      const day = String(bits[bits.length - 1] || '').trim() || null;
      const nameParts = bits.slice(1, -1).join(':').trim();
      const tokens = nameParts.split(/\s+/).filter(Boolean);
      const first = tokens[0] || '';
      const last = tokens.slice(1).join(' ') || '';
      const key = `${pid}:${day || ''}`;
      if (!byProvider.has(key)) {
        byProvider.set(key, {
          id: `snap-${key}`,
          provider_user_id: pid,
          provider_first_name: first,
          provider_last_name: last,
          service_day: day,
          is_primary: false
        });
      }
    }
    const list = Array.from(byProvider.values());
    if (list.length) {
      list[0].is_primary = true;
      return list;
    }
  }
  const pname = String(client.provider_name || '').trim();
  if (pname) {
    const tokens = pname.split(/\s+/);
    return [{
      id: 'snap-legacy',
      provider_user_id: client.provider_id || null,
      provider_first_name: tokens[0] || pname,
      provider_last_name: tokens.slice(1).join(' ') || '',
      service_day: client.service_day || null,
      is_primary: true
    }];
  }
  return [];
}

const effectiveOverviewProviders = computed(() => {
  if ((overviewProviders.value || []).length) return overviewProviders.value;
  return providersFromClientSnapshot(props.client);
});

const careTeamGlanceSummary = computed(() => {
  const rows = effectiveOverviewProviders.value || [];
  if (!rows.length) return 'Not assigned';
  const labels = rows.map((p) => {
    const last = String(p.provider_last_name || '').trim();
    const first = String(p.provider_first_name || '').trim();
    if (last || first) return `${last}${last && first ? ', ' : ''}${first}`;
    return 'Provider';
  });
  return [...new Set(labels)].join(' · ');
});

const careTeamGlanceMeta = computed(() => {
  const rows = effectiveOverviewProviders.value || [];
  if (!rows.length) return '';
  const days = [...new Set(rows.map((p) => String(p.service_day || '').trim()).filter(Boolean))];
  return days.length ? days.join(', ') : '';
});

const refreshOverviewProviders = async () => {
  const clientId = Number(props.client?.id);
  if (!clientId) {
    overviewProviders.value = [];
    overviewProvidersLoading.value = false;
    return;
  }
  if (!isBackofficeRole.value) {
    overviewProviders.value = providersFromClientSnapshot(props.client);
    overviewProvidersLoading.value = false;
    return;
  }
  try {
    overviewProvidersLoading.value = true;
    const params = {};
    const orgId = Number(props.schoolOrganizationId || props.client?.organization_id || 0);
    if (orgId > 0) params.organizationId = orgId;
    const r = await api.get(`/clients/${clientId}/provider-assignments`, { params });
    const rows = Array.isArray(r.data) ? r.data : [];
    overviewProviders.value = rows.length
      ? rows.sort((a, b) => {
          const org = String(a?.organization_name || '').localeCompare(String(b?.organization_name || ''));
          if (org !== 0) return org;
          const ap = a?.is_primary ? 1 : 0;
          const bp = b?.is_primary ? 1 : 0;
          if (ap !== bp) return bp - ap;
          const ln = String(a?.provider_last_name || '').localeCompare(String(b?.provider_last_name || ''));
          if (ln !== 0) return ln;
          const fn = String(a?.provider_first_name || '').localeCompare(String(b?.provider_first_name || ''));
          if (fn !== 0) return fn;
          return String(a?.service_day || '').localeCompare(String(b?.service_day || ''));
        })
      : providersFromClientSnapshot(props.client);
  } catch {
    overviewProviders.value = providersFromClientSnapshot(props.client);
  } finally {
    overviewProvidersLoading.value = false;
  }
};

const onSchoolAssignmentUpdated = async ({ clientId, providers: providerList } = {}) => {
  showAssignDayModal.value = false;
  const list = Array.isArray(providerList) ? providerList : [];
  const pairs = list
    .map((p) => {
      const pid = Number(p.provider_user_id || 0);
      if (!pid) return null;
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || `Provider ${pid}`;
      const days = Array.isArray(p.assigned_days) ? p.assigned_days : [];
      if (!days.length) return `${pid}:${name}:`;
      return days.map((d) => `${pid}:${name}:${d}`).join('|');
    })
    .filter(Boolean)
    .join('|');
  const providerName = list
    .map((p) => [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || `Provider ${p.provider_user_id}`)
    .filter(Boolean)
    .join(', ');
  const uniqueDays = [...new Set(list.flatMap((p) => (Array.isArray(p.assigned_days) ? p.assigned_days : [])).filter(Boolean))];

  if (props.client?.id) {
    const merged = {
      ...props.client,
      provider_day_pairs: pairs || props.client.provider_day_pairs || null,
      provider_name: providerName || props.client.provider_name || null,
      service_day: uniqueDays.length ? uniqueDays.join(', ') : props.client.service_day || null
    };
    emit('updated', { keepOpen: true, client: merged });
  } else if (clientId) {
    try {
      const r = await api.get(`/clients/${clientId}`);
      emit('updated', { keepOpen: true, client: r.data });
    } catch {
      /* ignore */
    }
  }
  await refreshOverviewProviders();
};

// Compliance checklist
const savingChecklist = ref(false);
const checklistAuditText = ref('');

const isContinuationServicesSeason = (value = new Date()) => {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(d.getTime())) return false;
  const start = new Date(d.getFullYear(), 4, 1);
  const end = new Date(d.getFullYear(), 8, 1);
  return d.getTime() >= start.getTime() && d.getTime() < end.getTime();
};
const showContinuationServicesChecklist = computed(() => isContinuationServicesSeason());

const emptyContSvc = () => ({
  plan: '',
  schoolChoice: '',
  currentSchoolAction: '',
  newSchoolOrganizationId: '',
  newSchoolName: '',
  newSchoolAction: '',
  privateComment: '',
  supportFollowUp: false,
  removeFromAssignment: false,
  recommendTerminate: ''
});

const checklist = ref({
  parentsContactedAt: '',
  parentsContactedSuccessful: '',
  firstServiceAt: '',
  continuation: emptyContSvc()
});
const checklistAgencySchools = ref([]);

const fetchChecklistAgencySchools = async () => {
  if (!showContinuationServicesChecklist.value) return;
  const agencyId = Number(props.client?.agency_id || 0);
  if (!agencyId) return;
  try {
    const r = await api.get(`/agencies/${agencyId}/schools`, { skipGlobalLoading: true });
    checklistAgencySchools.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    checklistAgencySchools.value = [];
  }
};

const parseContSvcJson = (raw) => {
  if (!raw) return emptyContSvc();
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return emptyContSvc(); }
  }
  if (!data || typeof data !== 'object') return emptyContSvc();
  const recommend =
    data.recommendTerminate === true || data.recommendTerminate === 'true' || data.recommendTerminate === 1
      ? 'true'
      : data.recommendTerminate === false || data.recommendTerminate === 'false' || data.recommendTerminate === 0
        ? 'false'
        : data.unableToContactRecommendation === 'recommend_terminate'
          ? 'true'
          : data.unableToContactRecommendation === 'recommend_continue'
            ? 'false'
            : '';
  return {
    ...emptyContSvc(),
    plan: String(data.plan || ''),
    schoolChoice: String(data.schoolChoice || ''),
    currentSchoolAction: String(data.currentSchoolAction || ''),
    newSchoolOrganizationId: data.newSchoolOrganizationId ? String(data.newSchoolOrganizationId) : '',
    newSchoolName: String(data.newSchoolName || ''),
    newSchoolAction: String(data.newSchoolAction || ''),
    privateComment: String(data.privateComment || data.comment || ''),
    supportFollowUp: data.supportFollowUp === true || data.supportFollowUp === 1 || data.supportFollowUp === 'true',
    removeFromAssignment:
      data.removeFromAssignment === true || data.removeFromAssignment === 1 || data.removeFromAssignment === 'true',
    recommendTerminate: recommend
  };
};

const contSvcPayload = () => {
  const c = checklist.value.continuation || emptyContSvc();
  if (!showContinuationServicesChecklist.value || !c.plan) return null;
  const payload = { plan: c.plan };
  if (c.plan === 'continue_school') {
    payload.schoolChoice = c.schoolChoice || '';
    if (c.schoolChoice === 'current_school') {
      payload.currentSchoolAction = c.currentSchoolAction || '';
    } else if (c.schoolChoice === 'new_school') {
      payload.newSchoolOrganizationId = c.newSchoolOrganizationId ? Number(c.newSchoolOrganizationId) : null;
      payload.newSchoolName = c.newSchoolOrganizationId ? null : (String(c.newSchoolName || '').trim() || null);
      if (c.newSchoolOrganizationId) payload.newSchoolAction = c.newSchoolAction || '';
    }
  } else {
    payload.privateComment = String(c.privateComment || '').trim();
    payload.supportFollowUp = !!c.supportFollowUp;
    payload.removeFromAssignment = !!c.removeFromAssignment;
    payload.recommendTerminate = c.plan === 'not_continue_school' ? true : c.recommendTerminate === 'true';
  }
  return payload;
};

watch(
  () => checklist.value.continuation.plan,
  (plan) => {
    if (plan !== 'continue_school') {
      checklist.value.continuation.schoolChoice = '';
      checklist.value.continuation.currentSchoolAction = '';
      checklist.value.continuation.newSchoolOrganizationId = '';
      checklist.value.continuation.newSchoolName = '';
      checklist.value.continuation.newSchoolAction = '';
    }
    if (!['not_continue_school', 'unable_to_contact_parent', 'other'].includes(plan)) {
      checklist.value.continuation.privateComment = '';
      checklist.value.continuation.supportFollowUp = false;
      checklist.value.continuation.removeFromAssignment = false;
      checklist.value.continuation.recommendTerminate = '';
    }
  }
);
watch(
  () => checklist.value.continuation.schoolChoice,
  (choice) => {
    if (choice !== 'current_school') checklist.value.continuation.currentSchoolAction = '';
    if (choice !== 'new_school') {
      checklist.value.continuation.newSchoolOrganizationId = '';
      checklist.value.continuation.newSchoolName = '';
      checklist.value.continuation.newSchoolAction = '';
    }
  }
);
watch(
  () => checklist.value.continuation.newSchoolOrganizationId,
  (schoolId) => {
    if (schoolId) checklist.value.continuation.newSchoolName = '';
    if (!schoolId) checklist.value.continuation.newSchoolAction = '';
  }
);

// Guardians tab state (non-clinical portal access)
const guardiansLoading = ref(false);
const guardiansError = ref('');
const guardians = ref([]);
const messagingGuardianId = ref(null);
const canMessageGuardian = computed(() =>
  ['provider', 'provider_plus', 'admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'supervisor'].includes(
    String(roleNorm.value || '')
  )
);

const messageGuardian = (g) => {
  const guardianUserId = Number(g?.guardian_user_id || 0);
  if (!guardianUserId) return;
  const agencyIdForChat =
    Number(props.client?.agency_id || selectedAgencyId.value || 0) || null;
  const name = [g.first_name, g.last_name].filter(Boolean).join(' ') || 'Guardian';
  messagingGuardianId.value = guardianUserId;
  try {
    router.push({
      path: route.path,
      query: {
        ...route.query,
        openChatWith: String(guardianUserId),
        ...(agencyIdForChat ? { agencyId: String(agencyIdForChat) } : {}),
        openChatWithName: name
      }
    });
  } finally {
    messagingGuardianId.value = null;
  }
};
const showAddGuardianModal = ref(false);
const addingGuardian = ref(false);
const creatingIntakeGuardian = ref(false);
const addGuardianForm = ref({
  email: '',
  firstName: '',
  lastName: '',
  relationshipTitle: 'Guardian',
  accessEnabled: true,
  permissions: {
    canViewDocs: true,
    canSignDocs: true,
    canViewLinks: true,
    canViewProgramMaterials: true,
    canViewProgress: true,
    canMessage: false
  }
});
const lastInviteLink = ref('');
const updatingGuardianId = ref(null);
const creatingSelfGuardian = ref(false);
const selfGuardianEmail = ref('');
const addGuardianPrefilledFromIntake = ref(false);

const addGuardianFormPrefilledFromIntake = computed(() => addGuardianPrefilledFromIntake.value);
const hasSelfGuardianLink = computed(() =>
  (guardians.value || []).some((g) => String(g?.relationship_type || '').trim().toLowerCase() === 'self')
);

const canManageGuardians = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support'].includes(r) && hasAgencyAccess.value;
});

const canEditPaperwork = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff'].includes(r) && hasAgencyAccess.value;
});

const clientPaperwork = useClientPaperwork(
  computed(() => props.client),
  canEditPaperwork,
  (payload) => emit('updated', payload)
);
provide('clientPaperwork', clientPaperwork);

const {
  docChecklistItems,
  docChecklistLoading,
  docChecklistSaving,
  docChecklistError,
  docChecklistAvailable,
  docIsCompleted,
  docNeededOptions,
  documentStatusSummaryText,
  onToggleDocNeeded,
  onToggleDocCompleted,
  markAllDocsCompleted,
  fetchDocChecklist,
  loadTabData: loadPaperworkTabData
} = clientPaperwork;

const newInsuranceNeededItem = computed(() =>
  (docChecklistItems.value || []).find((x) => String(x?.status_key || '').toLowerCase() === 'new_insurance') || null
);

const onMarkDocsCompletedFromOverview = async () => {
  if (!canEditPaperwork.value) return;
  const updated = await markAllDocsCompleted();
  if (updated && docStatusDetailsEl.value) {
    try {
      docStatusDetailsEl.value.open = false;
    } catch {
      // ignore
    }
  }
};

const selectedOverviewPaperworkStatusKey = computed(() => {
  return '';
});

const availableAffiliationOptions = computed(() => {
  const existing = new Set((affiliations.value || []).map((a) => Number(a?.organization_id)).filter(Boolean));
  return (availableAffiliations.value || []).filter((o) => {
    const id = Number(o?.id);
    const t = String(o?.organization_type || 'agency').toLowerCase();
    if (!id) return false;
    if (t === 'agency') return false;
    return !existing.has(id);
  });
});

const canCreateInternalNotes = computed(() => {
  return hasAgencyAccess.value;
});

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = parseDateForDisplay(dateString);
  return date.toLocaleDateString();
};

const parseDateForDisplay = (dateValue) => {
  if (!dateValue) return new Date(0);
  const s = String(dateValue);
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    return new Date(y, m, d);
  }
  return new Date(s);
};

const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString();
};

const formatDocumentStatus = (status) => {
  const statusMap = {
    'NONE': 'None',
    'UPLOADED': 'Uploaded',
    'PACKET': 'Packet',
    'APPROVED': 'Approved',
    'REJECTED': 'Rejected'
  };
  return statusMap[status] || status;
};

const formatSource = (source) => {
  const sourceMap = {
    'BULK_IMPORT': 'Bulk Import',
    'SCHOOL_UPLOAD': 'School Upload',
    'SCHOOL_UPLOAD_INTERNAL': 'Packet Upload (Internal)',
    'PUBLIC_INTAKE_LINK': 'Public Intake Link',
    'DIGITAL_FORM': 'Digital Form',
    'ADMIN_CREATED': 'Admin Created'
  };
  return sourceMap[source] || source;
};

const formatFieldName = (field) => {
  const fieldMap = {
    'status': 'Status',
    'provider_id': 'Provider',
    'created': 'Created',
    'bulk_import_update': 'Bulk Import Update'
  };
  return fieldMap[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const isClientArchived = computed(() => String(props.client?.status || '').toUpperCase() === 'ARCHIVED');
const isClientTerminated = computed(() => {
  const key = String(props.client?.client_status_key || '').toLowerCase();
  const label = String(props.client?.client_status_label || '').toLowerCase();
  return key === 'terminated' || label.includes('terminated');
});
const terminatedStatusId = computed(() => {
  const s = (overviewClientStatuses.value || []).find((x) => String(x?.status_key || x?.statusKey || '').toLowerCase() === 'terminated');
  return s ? String(s.id) : '';
});
const isTerminatedStatusSelected = computed(() =>
  editingOverview.value && overviewForm.value.client_status_id === terminatedStatusId.value
);

// Client identifier code (6-digit, permanent)
const clientCodeIsValid = computed(() => /^\d{6}$/.test(String(props.client?.identifier_code || '').trim()));
const clientCodeDraft = ref('');
const clientCodeSaving = ref(false);
const clientCodeDraftValid = computed(() => /^\d{6}$/.test(String(clientCodeDraft.value || '').trim()));

const refreshClient = async () => {
  try {
    const r = await api.get(`/clients/${props.client.id}`);
    emit('updated', { keepOpen: true, client: r.data || null });
  } catch {
    // ignore
  }
};

const saveClientType = async () => {
  if (!canEditClientType.value || !props.client?.id) return;
  const nextType = normalizeClientType(clientTypeDraft.value);
  if (!nextType || nextType === effectiveClientType.value) return;
  try {
    savingClientType.value = true;
    const payload = {
      client_type: nextType,
      reason: isSuperAdmin.value
        ? `Super admin changed client type to ${nextType}`
        : `Admin changed client type to ${nextType}`
    };
    if (isSuperAdmin.value) {
      payload.allow_downgrade_override = true;
    }
    await api.post(`/clients/${props.client.id}/client-type`, payload);
    const refreshed = await api.get(`/clients/${props.client.id}`);
    emit('updated', { keepOpen: true, client: refreshed.data || null });
    if (['clinical', 'learning'].includes(nextType)) {
      activeTab.value = 'clinical';
      await fetchBillingDiagnoses();
    }
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to update client type');
    clientTypeDraft.value = effectiveClientType.value || 'basic_nonclinical';
  } finally {
    savingClientType.value = false;
  }
};

const generateClientCode = async () => {
  if (!canManageClientCode.value || !props.client?.id) return;
  try {
    clientCodeSaving.value = true;
    await api.put(`/clients/${props.client.id}`, { generate_identifier_code: true });
    await refreshClient();
    clientCodeDraft.value = '';
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to generate code');
  } finally {
    clientCodeSaving.value = false;
  }
};

const saveClientCode = async () => {
  if (!canManageClientCode.value || !props.client?.id) return;
  const code = String(clientCodeDraft.value || '').trim();
  if (!/^\d{6}$/.test(code)) return;
  try {
    clientCodeSaving.value = true;
    await api.put(`/clients/${props.client.id}`, { identifier_code: code });
    await refreshClient();
    clientCodeDraft.value = '';
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to save code');
  } finally {
    clientCodeSaving.value = false;
  }
};

// Admin Note (single internal note shown on Overview)
const adminNoteLoading = ref(false);
const adminNoteSaving = ref(false);
const adminNoteMessage = ref('');
const adminNoteDraft = ref('');
const adminNotePopoverOpen = ref(false);
let adminNoteCloseTimer = null;
// Prevent the hover popover from immediately re-opening right after a save
// (common if the mouse is still positioned over the trigger element).
const adminNoteSuppressOpenUntil = ref(0);
// Position-tracking for the teleported popover so it escapes overflow/transform
// stacking contexts created by parent cards/scroll containers.
const adminNoteTriggerEl = ref(null);
const adminNoteStripTriggerEl = ref(null);
const adminNotePopoverPos = ref({ top: 0, left: 0, width: 520 });
const adminNotePopoverStyle = computed(() => {
  const { top, left, width } = adminNotePopoverPos.value || {};
  return {
    position: 'fixed',
    top: `${Math.max(8, Math.round(top || 0))}px`,
    left: `${Math.max(8, Math.round(left || 0))}px`,
    width: `${width || 520}px`,
    zIndex: 2000
  };
});

const recomputeAdminNotePopoverPos = () => {
  const el = adminNoteStripTriggerEl.value || adminNoteTriggerEl.value;
  if (!el || typeof el.getBoundingClientRect !== 'function') return;
  const rect = el.getBoundingClientRect();
  const desiredWidth = Math.min(520, Math.max(280, window.innerWidth - 24));
  // Prefer placing below the trigger; clamp to viewport edges with 8px margin.
  let left = rect.left;
  if (left + desiredWidth > window.innerWidth - 8) {
    left = window.innerWidth - desiredWidth - 8;
  }
  const top = rect.bottom + 8;
  adminNotePopoverPos.value = { top, left, width: desiredWidth };
};

let adminNotePosListenersAttached = false;
const attachAdminNotePosListeners = () => {
  if (adminNotePosListenersAttached) return;
  window.addEventListener('scroll', recomputeAdminNotePopoverPos, true);
  window.addEventListener('resize', recomputeAdminNotePopoverPos);
  adminNotePosListenersAttached = true;
};
const detachAdminNotePosListeners = () => {
  if (!adminNotePosListenersAttached) return;
  window.removeEventListener('scroll', recomputeAdminNotePopoverPos, true);
  window.removeEventListener('resize', recomputeAdminNotePopoverPos);
  adminNotePosListenersAttached = false;
};
watch(adminNotePopoverOpen, async (open) => {
  if (open) {
    await nextTick();
    recomputeAdminNotePopoverPos();
    attachAdminNotePosListeners();
  } else {
    detachAdminNotePosListeners();
  }
});
onBeforeUnmount(() => {
  detachAdminNotePosListeners();
});

const fetchAdminNote = async () => {
  if (!canViewAdminNote.value || !props.client?.id) return;
  try {
    adminNoteLoading.value = true;
    const r = await api.get(`/clients/${props.client.id}/admin-note`);
    adminNoteMessage.value = String(r.data?.note?.message || '').trim();
    adminNoteDraft.value = adminNoteMessage.value;
  } catch {
    adminNoteMessage.value = '';
    adminNoteDraft.value = '';
  } finally {
    adminNoteLoading.value = false;
  }
};

const openAdminNotePopover = () => {
  if (!canViewAdminNote.value) return;
  if (Date.now() < Number(adminNoteSuppressOpenUntil.value || 0)) return;
  if (adminNoteCloseTimer) clearTimeout(adminNoteCloseTimer);
  adminNotePopoverOpen.value = true;
  if (!adminNoteMessage.value && !adminNoteDraft.value) {
    // Ensure draft is initialized (best-effort).
    adminNoteDraft.value = '';
  }
};

const closeAdminNotePopoverSoon = () => {
  if (adminNoteCloseTimer) clearTimeout(adminNoteCloseTimer);
  adminNoteCloseTimer = setTimeout(() => {
    adminNotePopoverOpen.value = false;
  }, 250);
};

const cancelCloseAdminNotePopover = () => {
  if (adminNoteCloseTimer) clearTimeout(adminNoteCloseTimer);
};

const closeAdminNotePopoverNow = () => {
  if (adminNoteCloseTimer) clearTimeout(adminNoteCloseTimer);
  adminNotePopoverOpen.value = false;
};

const saveAdminNote = async () => {
  if (!canViewAdminNote.value || !props.client?.id) return;
  const msg = String(adminNoteDraft.value || '').trim();
  if (!msg) return;
  try {
    adminNoteSaving.value = true;
    await api.put(`/clients/${props.client.id}/admin-note`, { message: msg });
    adminNoteMessage.value = msg;
    // After a successful save, close any open admin-note UI.
    adminNoteSuppressOpenUntil.value = Date.now() + 800;
    adminNotePopoverOpen.value = false;
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to save admin note');
  } finally {
    adminNoteSaving.value = false;
  }
};

const archiveClient = async () => {
  if (!canEditAccount.value) return;
  if (!confirm('Archive this client?')) return;
  try {
    await api.put(`/clients/${props.client.id}/status`, { status: 'ARCHIVED' });
    emit('updated');
  } catch (err) {
    console.error('Failed to archive client:', err);
    alert(err.response?.data?.error?.message || 'Failed to archive client');
  }
};

const unarchiveClient = async () => {
  if (!canEditAccount.value) return;
  try {
    await api.post(`/clients/${props.client.id}/unarchive`);
    emit('updated');
  } catch (err) {
    console.error('Failed to unarchive client:', err);
    alert(err.response?.data?.error?.message || 'Failed to unarchive client');
  }
};

const terminateModalOpen = ref(false);
const terminateReasonDraft = ref('');
const terminateSaving = ref(false);
const openTerminateModal = () => {
  if (!canTerminate.value) return;
  terminateReasonDraft.value = '';
  terminateModalOpen.value = true;
};
const closeTerminateModal = () => {
  terminateModalOpen.value = false;
  terminateReasonDraft.value = '';
};
const terminateClient = async () => {
  if (!canTerminate.value || !props.client?.id) return;
  const reason = String(terminateReasonDraft.value || '').trim();
  if (!reason) {
    alert('A termination reason is required.');
    return;
  }
  try {
    terminateSaving.value = true;
    await api.post(`/clients/${props.client.id}/terminate`, { termination_reason: reason });
    closeTerminateModal();
    emit('updated');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to terminate client');
  } finally {
    terminateSaving.value = false;
  }
};

const saveSkills = async () => {
  if (!canEditAccount.value) return;
  try {
    await api.put(`/clients/${props.client.id}`, { skills: !!skillsValue.value });
    // Refresh client payload so UI stays consistent without closing the panel.
    let refreshed = null;
    try {
      const r = await api.get(`/clients/${props.client.id}`);
      refreshed = r.data || null;
    } catch {
      // ignore
    }
    emit('updated', { keepOpen: true, client: refreshed });
  } catch (err) {
    console.error('Failed to update skills flag:', err);
    alert(err.response?.data?.error?.message || 'Failed to update skills flag');
    skillsValue.value = isSkillsClientFlag(props.client?.skills);
  }
};

const hydrateOverviewForm = () => {
  overviewForm.value.full_name = String(props.client?.full_name || '');
  overviewForm.value.initials = String(props.client?.initials || '');
  overviewForm.value.organization_id = props.client?.organization_id ? String(props.client.organization_id) : '';
  overviewForm.value.client_status_id = props.client?.client_status_id ? String(props.client.client_status_id) : '';
  overviewForm.value.termination_reason = String(props.client?.termination_reason || '');
  overviewForm.value.submission_date = props.client?.submission_date ? String(props.client.submission_date).slice(0, 10) : '';
  overviewForm.value.insurance_type_id = props.client?.insurance_type_id ? String(props.client.insurance_type_id) : '';
  overviewForm.value.doc_date = props.client?.doc_date ? String(props.client.doc_date).slice(0, 10) : '';
  overviewForm.value.school_year = String(props.client?.school_year || '');
  overviewForm.value.grade = (() => {
    const raw = String(props.client?.grade || '').trim();
    if (!raw) return '';
    return normalizeGradeToStandard(raw) || raw;
  })();
  overviewForm.value.primary_client_language = String(props.client?.primary_client_language || '');
  // Backward-compatible fallback: older intakes stored guardian language only
  // on the guardian intake profile (encrypted JSON) and not in
  // clients.primary_parent_language.
  overviewForm.value.primary_parent_language = String(
    props.client?.primary_parent_language
    || guardianIntakeProfile.value?.primaryLanguage
    || ''
  );
  overviewForm.value.skills = isSkillsClientFlag(props.client?.skills);
  overviewForm.value.referral_date = props.client?.referral_date ? String(props.client.referral_date).slice(0, 10) : '';
  overviewForm.value.source = String(props.client?.source || '');
  overviewForm.value.date_of_birth = props.client?.date_of_birth ? String(props.client.date_of_birth).slice(0, 10) : '';
  overviewForm.value.gender = String(props.client?.gender || '');
  overviewForm.value.ethnicity = String(props.client?.ethnicity || '');
  overviewForm.value.preferred_language = String(props.client?.preferred_language || '');
  overviewForm.value.address_street = String(props.client?.address_street || '');
  overviewForm.value.address_apt = String(props.client?.address_apt || '');
  overviewForm.value.address_city = String(props.client?.address_city || '');
  overviewForm.value.address_state = String(props.client?.address_state || '');
  overviewForm.value.address_zip = String(props.client?.address_zip || '');
};

const profileDetailsEl = ref(null);
const editHighlightActive = ref(false);
const profileDetailsPulseHint = ref(true);

const onProfileDetailsToggle = (e) => {
  if (e?.target?.open) profileDetailsPulseHint.value = false;
};

const startEditOverview = async (scrollToFields = false) => {
  editingOverview.value = true;
  profileDetailsPulseHint.value = false;
  hydrateOverviewForm();
  loadOverviewOptions();
  fetchDocChecklist();
  if (scrollToFields) {
    await nextTick();
    const el = profileDetailsEl.value;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    editHighlightActive.value = true;
    setTimeout(() => { editHighlightActive.value = false; }, 1600);
  }
};

const cancelEditOverview = () => {
  editingOverview.value = false;
  hydrateOverviewForm();
};

const jumpToEditDemographics = async () => {
  activeTab.value = 'overview';
  await startEditOverview(true);
};

const saveOverview = async () => {
  if (!canEditAccount.value) return;
  if (isTerminatedStatusSelected.value) {
    const reason = String(overviewForm.value.termination_reason || '').trim();
    if (!reason) {
      alert('A termination reason is required when moving a client to Terminated status.');
      return;
    }
  }
  try {
    savingOverview.value = true;
    const payload = {
      full_name: isClinicalLikeClientType.value ? (String(overviewForm.value.full_name || '').trim() || null) : undefined,
      initials: String(overviewForm.value.initials || '').trim() || null,
      organization_id: overviewForm.value.organization_id ? Number(overviewForm.value.organization_id) : null,
      client_status_id: overviewForm.value.client_status_id ? Number(overviewForm.value.client_status_id) : null,
      submission_date: overviewForm.value.submission_date ? String(overviewForm.value.submission_date) : null,
      insurance_type_id: overviewForm.value.insurance_type_id ? Number(overviewForm.value.insurance_type_id) : null,
      doc_date: overviewForm.value.doc_date ? String(overviewForm.value.doc_date) : null,
      school_year: isSchoolClientType.value ? (String(overviewForm.value.school_year || '').trim() || null) : null,
      grade: normalizeGradeForSave(overviewForm.value.grade),
      primary_client_language: String(overviewForm.value.primary_client_language || '').trim() || null,
      primary_parent_language: String(overviewForm.value.primary_parent_language || '').trim() || null,
      skills: isSchoolClientType.value ? !!overviewForm.value.skills : false,
      referral_date: overviewForm.value.referral_date ? String(overviewForm.value.referral_date) : null,
      source: String(overviewForm.value.source || '').trim() || null,
      date_of_birth: overviewForm.value.date_of_birth ? String(overviewForm.value.date_of_birth) : null,
      gender: String(overviewForm.value.gender || '').trim() || null,
      ethnicity: String(overviewForm.value.ethnicity || '').trim() || null,
      preferred_language: String(overviewForm.value.preferred_language || '').trim() || null,
      address_street: String(overviewForm.value.address_street || '').trim() || null,
      address_apt: String(overviewForm.value.address_apt || '').trim() || null,
      address_city: String(overviewForm.value.address_city || '').trim() || null,
      address_state: String(overviewForm.value.address_state || '').trim() || null,
      address_zip: String(overviewForm.value.address_zip || '').trim() || null
    };
    if (isTerminatedStatusSelected.value) {
      payload.termination_reason = String(overviewForm.value.termination_reason || '').trim();
    }
    await api.put(`/clients/${props.client.id}`, payload);
    const refreshed = (await api.get(`/clients/${props.client.id}`)).data || null;
    emit('updated', { keepOpen: true, client: refreshed });
    editingOverview.value = false;
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update client');
  } finally {
    savingOverview.value = false;
  }
};

const fetchHistory = async () => {
  try {
    historyLoading.value = true;
    historyError.value = '';
    const response = await api.get(`/clients/${props.client.id}/history`);
    history.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch history:', err);
    historyError.value = err.response?.data?.error?.message || 'Failed to load history';
  } finally {
    historyLoading.value = false;
  }
};

const fetchGuardians = async () => {
  if (!canManageGuardians.value) return;
  try {
    guardiansLoading.value = true;
    guardiansError.value = '';
    const resp = await api.get(`/clients/${props.client.id}/guardians`);
    guardians.value = resp.data || [];
  } catch (err) {
    guardiansError.value = err.response?.data?.error?.message || 'Failed to load guardians';
    guardians.value = [];
  } finally {
    guardiansLoading.value = false;
  }
};

const openAddGuardian = () => {
  lastInviteLink.value = '';
  const gip = guardianIntakeProfile.value;
  const hasIntakeData = gip && (gip.email || gip.firstName || gip.lastName);
  addGuardianForm.value = {
    email: gip?.email || '',
    firstName: gip?.firstName || '',
    lastName: gip?.lastName || '',
    relationshipTitle: gip?.relationship || 'Guardian',
    accessEnabled: true,
    permissions: {
      canViewDocs: true,
      canSignDocs: true,
      canViewLinks: true,
      canViewProgramMaterials: true,
      canViewProgress: true,
      canMessage: false
    }
  };
  addGuardianPrefilledFromIntake.value = !!hasIntakeData;
  showAddGuardianModal.value = true;
};

const clearAddGuardianForm = () => {
  addGuardianForm.value = {
    email: '',
    firstName: '',
    lastName: '',
    relationshipTitle: 'Guardian',
    accessEnabled: true,
    permissions: {
      canViewDocs: true,
      canSignDocs: true,
      canViewLinks: true,
      canViewProgramMaterials: true,
      canViewProgress: true,
      canMessage: false
    }
  };
  addGuardianPrefilledFromIntake.value = false;
};

const closeAddGuardian = () => {
  showAddGuardianModal.value = false;
};

const copyText = async (text) => {
  const t = String(text || '').trim();
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
};

const addGuardian = async () => {
  if (!canManageGuardians.value) return;
  const email = String(addGuardianForm.value.email || '').trim();
  const firstName = String(addGuardianForm.value.firstName || '').trim();
  const lastName = String(addGuardianForm.value.lastName || '').trim();
  if (!email || !firstName || !lastName) return;
  try {
    addingGuardian.value = true;
    guardiansError.value = '';
    const resp = await api.post(`/clients/${props.client.id}/guardians`, {
      email,
      firstName,
      lastName,
      relationshipTitle: String(addGuardianForm.value.relationshipTitle || 'Guardian').trim() || 'Guardian',
      accessEnabled: addGuardianForm.value.accessEnabled !== false,
      permissionsJson: addGuardianForm.value.permissions
    });
    lastInviteLink.value = resp.data?.passwordlessTokenLink || '';
    await fetchGuardians();
  } catch (err) {
    guardiansError.value = err.response?.data?.error?.message || 'Failed to add guardian';
  } finally {
    addingGuardian.value = false;
  }
};

const createGuardianFromIntake = async () => {
  if (!canManageGuardians.value) return;
  const gip = guardianIntakeProfile.value;
  if (!gip?.email || !gip?.firstName) return;
  try {
    creatingIntakeGuardian.value = true;
    guardiansError.value = '';
    const resp = await api.post(`/clients/${props.client.id}/guardians`, {
      email: gip.email,
      firstName: gip.firstName,
      lastName: gip.lastName || '',
      relationshipTitle: gip.relationship || 'Guardian',
      accessEnabled: true,
      permissionsJson: {
        canViewDocs: true,
        canSignDocs: true,
        canViewLinks: true,
        canViewProgramMaterials: true,
        canViewProgress: true,
        canMessage: false
      }
    });
    lastInviteLink.value = resp.data?.passwordlessTokenLink || '';
    await fetchGuardians();
  } catch (err) {
    guardiansError.value = err.response?.data?.error?.message || 'Failed to create guardian from intake';
  } finally {
    creatingIntakeGuardian.value = false;
  }
};

const createSelfAccessGuardian = async () => {
  if (!canManageGuardians.value || hasSelfGuardianLink.value) return;
  const email = String(selfGuardianEmail.value || '').trim();
  if (!email) return;

  const fullName = String(props.client?.full_name || '').trim();
  let firstName = String(props.client?.first_name || '').trim();
  let lastName = String(props.client?.last_name || '').trim();
  if (!firstName && fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      firstName = parts[0];
      lastName = 'Client';
    } else if (parts.length > 1) {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }
  }
  if (!firstName) firstName = 'Client';
  if (!lastName) lastName = 'Self';

  try {
    creatingSelfGuardian.value = true;
    guardiansError.value = '';
    const resp = await api.post(`/clients/${props.client.id}/guardians`, {
      email,
      firstName,
      lastName,
      relationshipType: 'self',
      relationshipTitle: 'Self',
      accessEnabled: true,
      permissionsJson: {
        canViewDocs: true,
        canSignDocs: true,
        canViewLinks: true,
        canViewProgramMaterials: true,
        canViewProgress: true,
        canMessage: false
      }
    });
    lastInviteLink.value = resp.data?.passwordlessTokenLink || '';
    await fetchGuardians();
  } catch (err) {
    guardiansError.value = err.response?.data?.error?.message || 'Failed to create self-access guardian account';
  } finally {
    creatingSelfGuardian.value = false;
  }
};

const updateGuardian = async (g) => {
  if (!canManageGuardians.value) return;
  const id = Number(g?.guardian_user_id);
  if (!id) return;
  try {
    updatingGuardianId.value = id;
    await api.patch(`/clients/${props.client.id}/guardians/${id}`, {
      relationshipTitle: String(g.relationship_title || 'Guardian').trim() || 'Guardian',
      accessEnabled: g.access_enabled === 1 || g.access_enabled === true
    });
    await fetchGuardians();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update guardian');
  } finally {
    updatingGuardianId.value = null;
  }
};

const removeGuardian = async (g) => {
  if (!canManageGuardians.value) return;
  const id = Number(g?.guardian_user_id);
  if (!id) return;
  if (!window.confirm('Remove this guardian’s access to this client?')) return;
  try {
    updatingGuardianId.value = id;
    await api.delete(`/clients/${props.client.id}/guardians/${id}`);
    await fetchGuardians();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to remove guardian');
  } finally {
    updatingGuardianId.value = null;
  }
};

const fetchAccess = async () => {
  try {
    const response = await api.get('/users/me/agencies');
    const agencies = response.data || [];
    myAgencies.value = Array.isArray(agencies) ? agencies : [];
    // Keep selected agency synced to client's primary agency.
    selectedAgencyId.value = props.client?.agency_id ? String(props.client.agency_id) : '';
  } catch {
    myAgencies.value = [];
  }
};

const fetchClientAgencyAffiliations = async () => {
  try {
    const r = await api.get(`/clients/${props.client.id}/agency-affiliations`);
    clientAgencyAffiliations.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    clientAgencyAffiliations.value = [];
  }
};

const onSwitchAgency = async (userInitiated = false) => {
  if (!userInitiated) return;
  const agencyId = selectedAgencyId.value ? Number(selectedAgencyId.value) : null;
  if (!agencyId || agencyId === Number(props.client?.agency_id)) return;
  try {
    switchingAgency.value = true;
    await api.post(`/clients/${props.client.id}/agency-affiliations`, { agency_id: agencyId, is_primary: true });
    const refreshed = await api.get(`/clients/${props.client.id}`);
    emit('updated', { keepOpen: true, client: refreshed.data });
    await fetchAccess();
    await fetchClientAgencyAffiliations();
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to switch agency');
    selectedAgencyId.value = props.client?.agency_id ? String(props.client.agency_id) : '';
  } finally {
    switchingAgency.value = false;
  }
};

watch([hasAgencyAccess, activeTab], async ([has, tab]) => {
  if (!has) return;
  if (tab !== 'phi') return;
  await loadPaperworkTabData();
});

const fetchAvailableAffiliations = async () => {
  if (!canEditAccount.value) return;
  try {
    const agencyId = props.client?.agency_id;
    if (!agencyId) {
      availableAffiliations.value = [];
      return;
    }
    const r = await api.get(`/agencies/${agencyId}/affiliated-organizations`);
    availableAffiliations.value = r.data || [];
  } catch {
    availableAffiliations.value = [];
  }
};

const fetchClientAffiliations = async () => {
  if (!canEditAccount.value) return;
  try {
    affiliationsLoading.value = true;
    assignmentsError.value = '';
    const r = await api.get(`/clients/${props.client.id}/affiliations`);
    affiliations.value = r.data || [];
    if (!selectedAssignmentOrgId.value) {
      const primary = (affiliations.value || []).find((a) => a?.is_primary) || affiliations.value?.[0] || null;
      if (primary?.organization_id) selectedAssignmentOrgId.value = String(primary.organization_id);
    }
    // Keep the Overview provider list in sync with affiliations.
    await refreshOverviewProviders();
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to load affiliations';
    affiliations.value = [];
    overviewProviders.value = [];
  } finally {
    affiliationsLoading.value = false;
  }
};

const addAffiliation = async () => {
  if (!canEditAccount.value) return;
  const orgId = addAffiliationOrgId.value ? Number(addAffiliationOrgId.value) : null;
  if (!orgId) return;
  try {
    savingAffiliation.value = true;
    assignmentsError.value = '';
    await api.post(`/clients/${props.client.id}/affiliations`, { organization_id: orgId, is_primary: addAffiliationMakePrimary.value });
    addAffiliationOrgId.value = '';
    addAffiliationMakePrimary.value = false;
    await fetchClientAffiliations();
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to save affiliation';
  } finally {
    savingAffiliation.value = false;
  }
};

const setPrimaryAffiliation = async (orgId) => {
  if (!canEditAccount.value) return;
  const id = Number(orgId);
  if (!id) return;
  try {
    savingAffiliation.value = true;
    assignmentsError.value = '';
    await api.post(`/clients/${props.client.id}/affiliations`, { organization_id: id, is_primary: true });
    await fetchClientAffiliations();
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to set primary';
  } finally {
    savingAffiliation.value = false;
  }
};

const removeAffiliation = async (orgId) => {
  if (!canEditAccount.value) return;
  const id = Number(orgId);
  if (!id) return;
  if (!window.confirm('Remove this affiliation? This will also remove any provider assignments for it.')) return;
  try {
    savingAffiliation.value = true;
    assignmentsError.value = '';
    await api.delete(`/clients/${props.client.id}/affiliations/${id}`);
    if (String(selectedAssignmentOrgId.value) === String(id)) selectedAssignmentOrgId.value = '';
    await fetchClientAffiliations();
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to remove affiliation';
  } finally {
    savingAffiliation.value = false;
  }
};

const providerScheduleForSelectedOrg = ref([]);

const fetchProviderOptions = async () => {
  if (!canEditAccount.value) return;
  const agencyId = Number(props.client?.agency_id);
  const orgId = selectedAssignmentOrgId.value ? Number(selectedAssignmentOrgId.value) : null;
  if (!agencyId || !orgId) {
    providerScheduleForSelectedOrg.value = [];
    providerOptions.value = [];
    return;
  }
  try {
    // Pull provider_school_assignments for this org (day/time rows) AND
    // also allow providers affiliated with the org but not scheduled yet (rare; supports day='Unknown').
    const [sched, aff] = await Promise.all([
      api.get('/provider-scheduling/assignments', { params: { agencyId, schoolOrganizationId: orgId } }),
      api.get('/provider-scheduling/affiliated-providers', { params: { agencyId, schoolOrganizationId: orgId } })
    ]);
    const rows = Array.isArray(sched.data) ? sched.data : [];
    providerScheduleForSelectedOrg.value = rows;

    const byProvider = new Map();
    for (const row of rows) {
      const pid = Number(row?.provider_user_id);
      if (!pid) continue;
      if (!byProvider.has(pid)) {
        byProvider.set(pid, {
          id: pid,
          first_name: row?.provider_first_name || '',
          last_name: row?.provider_last_name || ''
        });
      }
    }

    const affRows = Array.isArray(aff.data) ? aff.data : [];
    for (const p of affRows) {
      const pid = Number(p?.id);
      if (!pid) continue;
      if (!byProvider.has(pid)) {
        byProvider.set(pid, {
          id: pid,
          first_name: p?.first_name || '',
          last_name: p?.last_name || ''
        });
      }
    }
    providerOptions.value = Array.from(byProvider.values()).sort((a, b) =>
      String(a?.last_name || '').localeCompare(String(b?.last_name || '')) ||
      String(a?.first_name || '').localeCompare(String(b?.first_name || ''))
    );

    const userIds = providerOptions.value.map((p) => p.id).filter(Boolean);
    if (userIds.length) {
      try {
        const facetRes = await api.get('/provider-search/clinical-facets', {
          params: { agencyId, userIds: userIds.join(',') }
        });
        providerClinicalFacets.value = facetRes.data?.facetsByUserId || {};
      } catch {
        providerClinicalFacets.value = {};
      }
    } else {
      providerClinicalFacets.value = {};
    }
  } catch {
    providerScheduleForSelectedOrg.value = [];
    providerOptions.value = [];
    providerClinicalFacets.value = {};
  }
};

const availableProviderDaysForSelectedOrg = computed(() => {
  const providerId = addProviderUserId.value ? Number(addProviderUserId.value) : null;
  const orgId = selectedAssignmentOrgId.value ? Number(selectedAssignmentOrgId.value) : null;
  const out = [];
  // Unknown is always allowed.
  out.push('Unknown');
  if (!providerId || !orgId) return out;
  const rows = (providerScheduleForSelectedOrg.value || []).filter((r) => {
    return (
      Number(r?.provider_user_id) === providerId &&
      Number(r?.school_organization_id) === orgId &&
      (r?.is_active === 1 || r?.is_active === true)
    );
  });
  const days = new Set();
  for (const r of rows) {
    const day = String(r?.day_of_week || '').trim();
    const available = Number(r?.slots_available ?? 0);
    if (!day) continue;
    if (available <= 0) continue;
    days.add(day);
  }
  // Keep weekday ordering
  for (const d of weekdayOptions) {
    if (days.has(d)) out.push(d);
  }
  return out;
});

const startEditProviderAssignment = (pa) => {
  const id = Number(pa?.id);
  if (!id) return;
  editingProviderAssignmentId.value = id;
  editProviderUserId.value = pa?.provider_user_id ? String(pa.provider_user_id) : '';
  editProviderDay.value = pa?.service_day ? String(pa.service_day) : 'Unknown';
};

const cancelEditProviderAssignment = () => {
  editingProviderAssignmentId.value = null;
  editProviderUserId.value = '';
  editProviderDay.value = 'Unknown';
};

const saveEditProviderAssignment = async (pa) => {
  if (!canEditAccount.value) return;
  const assignmentId = Number(pa?.id);
  const orgId = Number(pa?.organization_id);
  const oldProviderUserId = Number(pa?.provider_user_id);
  const nextProviderUserId = editProviderUserId.value ? Number(editProviderUserId.value) : null;
  const nextDay = String(editProviderDay.value || '').trim();
  if (!assignmentId || !orgId || !nextProviderUserId || !nextDay) return;

  const providerChanged = !!(oldProviderUserId && nextProviderUserId && oldProviderUserId !== nextProviderUserId);
  try {
    savingProviderAssignment.value = true;
    assignmentsError.value = '';

    // Upsert the "new" assignment (this also supports changing the day for the same provider).
    // If the row was primary, carry primary status to the updated/new provider.
    await api.post(`/clients/${props.client.id}/provider-assignments`, {
      organization_id: orgId,
      provider_user_id: nextProviderUserId,
      service_day: nextDay,
      ...(pa?.is_primary ? { is_primary: true } : {})
    });

    // If they switched providers, remove the old assignment row (so it becomes a true edit, not "add another").
    if (providerChanged) {
      await api.delete(`/clients/${props.client.id}/provider-assignments/${assignmentId}`);
    }

    await reloadProviderAssignments();
    await refreshOverviewProviders();
    cancelEditProviderAssignment();
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to update assignment';
  } finally {
    savingProviderAssignment.value = false;
  }
};

const reloadProviderAssignments = async () => {
  if (!canEditAccount.value) return;
  const orgId = selectedAssignmentOrgId.value ? Number(selectedAssignmentOrgId.value) : null;
  if (!orgId) {
    providerAssignments.value = [];
    return;
  }
  try {
    providerAssignmentsLoading.value = true;
    assignmentsError.value = '';
    const r = await api.get(`/clients/${props.client.id}/provider-assignments`, { params: { organizationId: orgId } });
    providerAssignments.value = r.data || [];
    // Keep the Overview provider list in sync (across affiliations).
    await refreshOverviewProviders();
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to load provider assignments';
    providerAssignments.value = [];
  } finally {
    providerAssignmentsLoading.value = false;
  }
};

const fetchEventAssignments = async () => {
  if (!canEditAccount.value) return;
  try {
    eventAssignmentsLoading.value = true;
    eventAssignmentsError.value = '';
    const r = await api.get(`/clients/${props.client.id}/event-assignments`);
    eventAssignments.value = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    eventAssignmentsError.value = e.response?.data?.error?.message || 'Failed to load event assignments';
    eventAssignments.value = [];
  } finally {
    eventAssignmentsLoading.value = false;
  }
};

const eventAssignmentRowKey = (ev) => `${ev?.company_event_id || 'none'}-${ev?.skills_group_id || 'none'}`;
const eventAssignmentTitle = (ev) => String(ev?.company_event_title || ev?.skills_group_name || '—');
const eventAssignmentOrgLabel = (ev) => {
  const name = String(ev?.organization_name || '').trim();
  const type = String(ev?.organization_type || '').trim();
  if (!name && !type) return '—';
  if (name && type) return `${name} (${type})`;
  return name || type;
};
const eventAssignmentDateRange = (ev) => {
  const a = ev?.starts_at ? new Date(ev.starts_at) : null;
  const b = ev?.ends_at ? new Date(ev.ends_at) : null;
  const validA = a && Number.isFinite(a.getTime());
  const validB = b && Number.isFinite(b.getTime());
  if (!validA && !validB) return '—';
  const f = (d) => d.toLocaleDateString();
  if (validA && validB) return `${f(a)} - ${f(b)}`;
  if (validA) return f(a);
  return f(b);
};

function switchRegistrationOptionLabel(opt) {
  const title = String(opt?.title || `Event ${opt?.id || ''}`).trim();
  const a = opt?.startsAt ? new Date(opt.startsAt) : null;
  const b = opt?.endsAt ? new Date(opt.endsAt) : null;
  const validA = a && Number.isFinite(a.getTime());
  const validB = b && Number.isFinite(b.getTime());
  let datePart = '';
  if (validA && validB) {
    datePart = `${a.toLocaleDateString()} – ${b.toLocaleDateString()}`;
  } else if (validA) {
    datePart = a.toLocaleDateString();
  }
  return datePart ? `${title} (${datePart})` : title;
}

function closeSwitchRegistration() {
  switchRegistrationOpen.value = false;
  switchRegistrationLoading.value = false;
  switchRegistrationSaving.value = false;
  switchRegistrationError.value = '';
  switchRegistrationSourceEventId.value = 0;
  switchRegistrationSourceTitle.value = '';
  switchRegistrationSourceProgramId.value = null;
  switchRegistrationTargetId.value = '';
  switchRegistrationPreserveWorkflow.value = true;
  switchRegistrationOptions.value = [];
}

async function openSwitchRegistration(ev) {
  if (!canEditAccount.value) return;
  const fromId = Number(ev?.company_event_id || 0);
  if (!fromId) return;
  const agencyId = Number(props.client?.agency_id || 0);
  if (!agencyId) {
    switchRegistrationError.value = 'Missing agency for this client';
    switchRegistrationOpen.value = true;
    return;
  }
  switchRegistrationSourceEventId.value = fromId;
  switchRegistrationSourceTitle.value = eventAssignmentTitle(ev);
  switchRegistrationSourceProgramId.value = Number(ev?.organization_id || 0) || null;
  switchRegistrationTargetId.value = '';
  switchRegistrationPreserveWorkflow.value = true;
  switchRegistrationOptions.value = [];
  switchRegistrationError.value = '';
  switchRegistrationOpen.value = true;
  switchRegistrationLoading.value = true;
  try {
    const r = await api.get(`/clients/${props.client.id}/event-registration-switch-options`, {
      params: { agencyId, fromCompanyEventId: fromId },
      skipGlobalLoading: true
    });
    switchRegistrationSourceProgramId.value =
      Number(r.data?.fromEvent?.organizationId || switchRegistrationSourceProgramId.value || 0) || null;
    switchRegistrationOptions.value = Array.isArray(r.data?.events) ? r.data.events : [];
    if (!switchRegistrationOptions.value.length) {
      switchRegistrationError.value = 'No other events found in this agency.';
    }
  } catch (e) {
    switchRegistrationError.value = e.response?.data?.error?.message || 'Failed to load events';
  } finally {
    switchRegistrationLoading.value = false;
  }
}

async function submitSwitchRegistration() {
  if (!canEditAccount.value) return;
  const fromId = Number(switchRegistrationSourceEventId.value || 0);
  const toId = Number(switchRegistrationTargetId.value || 0);
  const agencyId = Number(props.client?.agency_id || 0);
  if (!fromId || !toId || !agencyId) return;
  const target = switchRegistrationOptions.value.find((o) => Number(o.id) === toId);
  const targetTitle = target ? String(target.title || '').trim() : `event ${toId}`;
  const crossProgram =
    switchRegistrationSourceProgramId.value &&
    target?.organizationId &&
    Number(switchRegistrationSourceProgramId.value) !== Number(target.organizationId);
  const programNote =
    crossProgram && target?.programName
      ? `\n\nThis also moves them to the "${target.programName}" program.`
      : crossProgram
        ? '\n\nThis also moves them to a different program.'
        : '';
  const ok = window.confirm(
    `Move this client from "${switchRegistrationSourceTitle.value}" to "${targetTitle}"?${programNote}`
  );
  if (!ok) return;
  switchRegistrationSaving.value = true;
  switchRegistrationError.value = '';
  try {
    await api.post(`/clients/${props.client.id}/switch-event-registration`, {
      agencyId,
      fromCompanyEventId: fromId,
      toCompanyEventId: toId,
      preserveWorkflow: switchRegistrationPreserveWorkflow.value
    });
    closeSwitchRegistration();
    await fetchEventAssignments();
    emit('updated', { keepOpen: true });
  } catch (e) {
    switchRegistrationError.value = e.response?.data?.error?.message || 'Failed to switch registration';
  } finally {
    switchRegistrationSaving.value = false;
  }
}

const addProviderAssignment = async () => {
  if (!canEditAccount.value) return;
  const orgId = selectedAssignmentOrgId.value ? Number(selectedAssignmentOrgId.value) : null;
  const providerUserId = addProviderUserId.value ? Number(addProviderUserId.value) : null;
  const day = String(addProviderDay.value || '').trim();
  if (!orgId || !providerUserId || !day) return;

  const existingOtherDaySameProvider = (providerAssignments.value || []).some(
    (pa) =>
      Number(pa?.organization_id) === orgId &&
      Number(pa?.provider_user_id) === providerUserId &&
      String(pa?.service_day || '').trim() &&
      String(pa.service_day).trim() !== day
  );
  if (existingOtherDaySameProvider) {
    const ok = window.confirm(
      'This client already has a different weekday with this provider at this school. Adding another weekday uses an additional slot when the provider has capacity configured for that day.\n\nContinue?'
    );
    if (!ok) return;
  }

  try {
    savingProviderAssignment.value = true;
    assignmentsError.value = '';
    await api.post(`/clients/${props.client.id}/provider-assignments`, {
      organization_id: orgId,
      provider_user_id: providerUserId,
      service_day: day,
      is_primary: addProviderMakePrimary.value === true
    });
    addProviderUserId.value = '';
    addProviderDay.value = '';
    addProviderMakePrimary.value = true;
    await reloadProviderAssignments();
    await refreshOverviewProviders();
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to assign provider';
  } finally {
    savingProviderAssignment.value = false;
  }
};

const removeProviderAssignment = async (pa) => {
  if (!canEditAccount.value) return;
  const id = Number(pa?.id);
  if (!id) return;
  if (!window.confirm('Remove this provider assignment?')) return;
  try {
    savingProviderAssignment.value = true;
    assignmentsError.value = '';
    await api.delete(`/clients/${props.client.id}/provider-assignments/${id}`);
    await reloadProviderAssignments();
    await refreshOverviewProviders();
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to remove assignment';
  } finally {
    savingProviderAssignment.value = false;
  }
};

const makePrimaryProvider = async (pa) => {
  if (!canEditAccount.value) return;
  const orgId = Number(pa?.organization_id);
  const providerUserId = Number(pa?.provider_user_id);
  const serviceDay = pa?.service_day ? String(pa.service_day) : 'Unknown';
  if (!orgId || !providerUserId) return;
  try {
    savingProviderAssignment.value = true;
    assignmentsError.value = '';
    await api.post(`/clients/${props.client.id}/provider-assignments`, {
      organization_id: orgId,
      provider_user_id: providerUserId,
      service_day: serviceDay || 'Unknown',
      is_primary: true
    });
    await reloadProviderAssignments();
    await refreshOverviewProviders();
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to set primary provider';
  } finally {
    savingProviderAssignment.value = false;
  }
};

const fetchProviders = async () => {
  try {
    const response = await api.get('/users');
    const allUsers = response.data || [];
    availableProviders.value = allUsers.filter(u => 
      ['provider', 'supervisor', 'admin'].includes(u.role?.toLowerCase())
    );
  } catch (err) {
    console.error('Failed to fetch providers:', err);
  }
};

const handleClose = () => {
  emit('close');
};

const onOverviewAlertClick = (alert) => {
  if (alert?.tab) activeTab.value = alert.tab;
};

const requestNavigate = (direction) => {
  const dir = String(direction || '').toLowerCase();
  if (dir === 'previous' && !canNavigatePrevious.value) return;
  if (dir === 'next' && !canNavigateNext.value) return;
  emit('navigate', {
    direction: dir,
    clientId: Number(props.client?.id || 0) || null,
    tab: String(activeTab.value || 'overview')
  });
};

watch(() => activeTab.value, (newTab) => {
  emit('tab-change', newTab);
  if (newTab !== 'medical-record' && medicalRecordEncounterId.value) {
    medicalRecordEncounterId.value = null;
    emit('encounter-change', null);
  }
  if (newTab === 'history' && history.value.length === 0) {
    fetchHistory();
  } else if (newTab === 'access' && accessLog.value.length === 0) {
    fetchAccessLog();
  } else if (newTab === 'checklist') {
    hydrateChecklist();
  } else if (newTab === 'guardians' && guardians.value.length === 0) {
    fetchGuardians();
  } else if (newTab === 'assignments') {
    fetchAvailableAffiliations();
    fetchClientAffiliations();
    fetchProviderOptions();
    reloadProviderAssignments();
    fetchEventAssignments();
  } else if (newTab === 'phi') {
    fetchDocChecklist();
    loadPaperworkTabData();
  } else if (newTab === 'clinical') {
    fetchBillingDiagnoses();
  } else if (newTab === 'demographics') {
    fetchDemographics();
  } else if (newTab === 'surveys' && clientSurveyResponses.value.length === 0) {
    fetchClientSurveyResponses();
  }
});

watch(() => props.client, async () => {
  // Reset editing states when client changes
  editingStatus.value = false;
  selfGuardianEmail.value = String(props.client?.email || '').trim();
  skillsValue.value = isSkillsClientFlag(props.client?.skills);
  clientTypeDraft.value = effectiveClientType.value || 'basic_nonclinical';
  clientCodeDraft.value = '';
  if (!editingOverview.value) {
    hydrateOverviewForm();
  }
  loadOverviewOptions();
  fetchDocChecklist();
  await fetchClientAgencyAffiliations();
  if (canEditAccount.value) {
    await fetchClientAffiliations();
  }
  await fetchAccess();
  await refreshOverviewProviders();
  await fetchAdminNote();
  if (activeTab.value === 'clinical') {
    fetchBillingDiagnoses();
  }
}, { deep: true, immediate: true });

watch(effectiveClientType, async (nextType, prevType) => {
  if (nextType === prevType) return;
  if (activeTab.value === 'clinical' || ['clinical', 'learning'].includes(nextType)) {
    await fetchBillingDiagnoses();
  }
  const allowed = new Set((tabs.value || []).map((t) => t.id));
  if (!allowed.has(activeTab.value)) activeTab.value = 'overview';
});

const hydrateChecklist = async () => {
  try {
    const r = await api.get(`/clients/${props.client.id}`);
    const c = r.data || {};
    checklist.value.parentsContactedAt = c.parents_contacted_at ? String(c.parents_contacted_at).slice(0, 10) : '';
    checklist.value.parentsContactedSuccessful =
      c.parents_contacted_successful === null || c.parents_contacted_successful === undefined
        ? ''
        : (c.parents_contacted_successful ? 'true' : 'false');
    checklist.value.firstServiceAt = c.first_service_at ? String(c.first_service_at).slice(0, 10) : '';
    checklist.value.continuation = parseContSvcJson(c.continuation_services_json);
    await fetchChecklistAgencySchools();
    const who = c.checklist_updated_by_name || null;
    const when = c.checklist_updated_at ? new Date(c.checklist_updated_at).toLocaleString() : null;
    checklistAuditText.value = who && when ? `Last updated by ${who} on ${when}` : (when ? `Last updated on ${when}` : '');
  } catch {
    // ignore
  }
};

const saveChecklist = async () => {
  try {
    savingChecklist.value = true;
    const payload = {
      parentsContactedAt: checklist.value.parentsContactedAt || null,
      parentsContactedSuccessful: checklist.value.parentsContactedSuccessful === '' ? null : (checklist.value.parentsContactedSuccessful === 'true'),
      firstServiceAt: checklist.value.firstServiceAt || null
    };
    if (showContinuationServicesChecklist.value) payload.continuationServices = contSvcPayload();
    const r = await api.put(`/clients/${props.client.id}/compliance-checklist`, payload);
    const c = r.data || {};
    const who = c.checklist_updated_by_name || null;
    const when = c.checklist_updated_at ? new Date(c.checklist_updated_at).toLocaleString() : null;
    checklistAuditText.value = who && when ? `Last updated by ${who} on ${when}` : (when ? `Last updated on ${when}` : '');
    emit('updated');
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to save checklist');
  } finally {
    savingChecklist.value = false;
  }
};

const canViewAccessLog = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff';
});

const formatAccessUser = (e) => {
  const name = `${e.user_first_name || ''} ${e.user_last_name || ''}`.trim();
  return name || e.user_email || `User ${e.user_id}`;
};

const fetchAccessLog = async () => {
  if (!canViewAccessLog.value) return;
  try {
    accessLoading.value = true;
    accessError.value = '';
    const r = await api.get(`/clients/${props.client.id}/access-log`);
    accessLog.value = r.data || [];
  } catch (e) {
    accessError.value = e.response?.data?.error?.message || 'Failed to load access log';
  } finally {
    accessLoading.value = false;
  }
};

// Demographics tab
const demoProfileFields = ref([]);
const demoIntakeFields = ref([]);
const demoSections = ref([]); // Structured: [{id, title, source, fields:[{key,label,value,duplicateOf,...}]}]
const demoCapturedAt = ref(null);
const demoLoading = ref(false);
const demoError = ref('');
const showDemoDuplicates = ref(false);

// Render intake supplement groups on the Demographics tab (core record fields
// are shown separately in clientDemoDisplayRows).
const demoSupplementalSections = computed(() => {
  const include = (f) => (showDemoDuplicates.value ? true : !f.duplicateOf);
  const clientIntake = (demoSections.value.find((s) => s.id === 'client_intake')?.fields) || [];
  const guardianIntake = (demoSections.value.find((s) => s.id === 'guardian_intake')?.fields) || [];
  return [
    {
      id: 'client_intake',
      title: 'Client (intake)',
      subtitle: 'From the latest submitted intake form',
      fields: clientIntake.filter(include)
    },
    {
      id: 'guardian_intake',
      title: 'Guardian (intake)',
      subtitle: 'Reported by the guardian',
      fields: guardianIntake.filter(include)
    }
  ];
});

const clientDemoDisplayRows = computed(() => {
  const c = props.client || {};
  const rows = [
    {
      key: 'date_of_birth',
      label: 'Date of Birth',
      value: clientDobLabel.value,
      important: true
    },
    {
      key: 'age',
      label: 'Age',
      value: clientAgeLabel.value ? `${clientAgeLabel.value} years` : '',
      important: false
    },
    {
      key: 'sex',
      label: 'Sex',
      value: formatDemoLookupValue(c.gender, sexSelectOptions),
      important: true
    },
    {
      key: 'ethnicity',
      label: 'Race / Ethnicity',
      value: formatDemoLookupValue(c.ethnicity, ethnicitySelectOptions),
      important: false
    },
    {
      key: 'preferred_language',
      label: 'Preferred Language',
      value: formatDemoLookupValue(c.preferred_language, languageSelectOptions),
      important: false
    },
    {
      key: 'primary_client_language',
      label: 'Client Primary Language',
      value: String(c.primary_client_language || '').trim(),
      important: false
    },
    {
      key: 'primary_parent_language',
      label: 'Guardian Primary Language',
      value: String(c.primary_parent_language || guardianIntakeProfile.value?.primaryLanguage || '').trim(),
      important: false
    },
    {
      key: 'contact_phone',
      label: 'Phone',
      value: String(c.contact_phone || '').trim(),
      important: false
    },
    {
      key: 'address',
      label: 'Address',
      value: clientAddressLine.value,
      important: false
    }
  ];
  return rows.map((row) => {
    const hasValue = !!String(row.value || '').trim();
    return {
      ...row,
      missing: !hasValue && row.important,
      display: hasValue ? row.value : 'Not set'
    };
  });
});

const clientDemoHasAnyData = computed(() =>
  clientDemoDisplayRows.value.some((row) => String(row.value || '').trim())
);

// Legacy grouped view — kept for duplicate counting.
const demoGroupedSections = computed(() => {
  const include = (f) => (showDemoDuplicates.value ? true : !f.duplicateOf);
  const profileAll = (demoSections.value.find((s) => s.id === 'profile')?.fields) || demoProfileFields.value;
  const clientIntake = (demoSections.value.find((s) => s.id === 'client_intake')?.fields) || [];
  const guardianIntake = (demoSections.value.find((s) => s.id === 'guardian_intake')?.fields) || [];

  const ADDRESS_KEYS = new Set([
    'address_street', 'address_apt', 'address_city', 'address_state', 'address_zip',
    'contact_phone'
  ]);
  const profileIdentity = profileAll.filter((f) => !ADDRESS_KEYS.has(f.key)).filter(include);
  const profileAddress = profileAll.filter((f) => ADDRESS_KEYS.has(f.key)).filter(include);

  return [
    { id: 'profile', title: 'Profile', subtitle: 'From the client record', fields: profileIdentity },
    { id: 'client_intake', title: 'Client (intake)', subtitle: 'From the latest submitted intake form', fields: clientIntake.filter(include) },
    { id: 'guardian_intake', title: 'Guardian (intake)', subtitle: 'Reported by the guardian', fields: guardianIntake.filter(include) },
    { id: 'address', title: 'Address & Contact', subtitle: 'Profile address and phone', fields: profileAddress },
  ];
});

const demoTotalCount = computed(() => {
  const profileAll = (demoSections.value.find((s) => s.id === 'profile')?.fields) || demoProfileFields.value;
  const clientIntake = (demoSections.value.find((s) => s.id === 'client_intake')?.fields) || [];
  const guardianIntake = (demoSections.value.find((s) => s.id === 'guardian_intake')?.fields) || [];
  return profileAll.length + clientIntake.length + guardianIntake.length;
});

const demoVisibleCount = computed(() =>
  demoGroupedSections.value.reduce((acc, g) => acc + g.fields.length, 0)
);

const demoDuplicateCount = computed(() => {
  const profileAll = (demoSections.value.find((s) => s.id === 'profile')?.fields) || demoProfileFields.value;
  const clientIntake = (demoSections.value.find((s) => s.id === 'client_intake')?.fields) || [];
  const guardianIntake = (demoSections.value.find((s) => s.id === 'guardian_intake')?.fields) || [];
  return [...profileAll, ...clientIntake, ...guardianIntake].filter((f) => f.duplicateOf).length;
});

const demoHasDuplicates = computed(() => demoDuplicateCount.value > 0);

// Friendly labels for the most common intake field keys. The backend can
// fall through to using the raw key as a label when an intake form was
// authored without a `label`, so the UI defensively maps known keys here.
// Anything not in this map gets a generic snake_case → Title Case humanizer.
const FRIENDLY_DEMO_LABELS = {
  client_first: 'First Name',
  client_last: 'Last Name',
  client_dob: 'Date of Birth',
  client_sex: 'Sex',
  client_grade: 'Grade',
  client_school: 'School',
  client_street: 'Street Address',
  client_apt: 'Apt / Unit',
  client_city: 'City',
  client_state: 'State',
  client_zip: 'Zip Code',
  client_email: 'Email',
  client_phone: 'Phone',
  client_address: 'Street Address',
  guardian_first: 'First Name',
  guardian_last: 'Last Name',
  guardian_address: 'Street Address',
  guardian_apt: 'Apt / Unit',
  guardian_city: 'City',
  guardian_state: 'State',
  guardian_zip: 'Zip Code',
  guardian_phone: 'Phone',
  guardian_email: 'Email',
  guardian_email_pref: 'Email',
  guardian_phone_pref: 'Phone',
  guardian_relationship: 'Relationship',
  emergency_contact: 'Emergency Contact',
  additional_guardian: 'Additional Guardian',
  contact_phone: 'Phone',
  address_street: 'Street Address',
  address_apt: 'Apt / Unit',
  address_city: 'City',
  address_state: 'State',
  address_zip: 'Zip Code',
  gender: 'Sex'
};

// Convert a raw snake/camel-case key into a readable title-case label.
const humanizeDemoKey = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  // Strip leading client_ / guardian_ scope so the key shows the field, not
  // the scope (the card already groups by client vs guardian).
  const stripped = s.replace(/^(client|guardian)_/i, '');
  return stripped
    // camelCase → camel Case
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // snake/kebab to spaces
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const prettyDemoLabel = (field) => {
  if (!field) return '';
  const key = String(field.key || '').trim();
  let label = String(field.label || '').trim();
  if (label.toLowerCase() === 'gender') label = 'Sex';
  // Treat the label as "raw" if it's empty, equal to the key, or all
  // lowercase snake_case (the typical fallback shape).
  const looksRaw = !label
    || label.toLowerCase() === key.toLowerCase()
    || /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/.test(label);
  if (!looksRaw) return label;
  return FRIENDLY_DEMO_LABELS[key] || humanizeDemoKey(key || label);
};

// Visual variant per demographic group so Profile / Client / Guardian / Address
// read as distinct cards in the grid.
const DEMO_GROUP_CARD_VARIANT = {
  profile: 'ov-card--demo-profile',
  client_intake: 'ov-card--demo-client',
  guardian_intake: 'ov-card--demo-guardian',
  address: 'ov-card--demo-address'
};
const demoGroupCardClass = (group) =>
  DEMO_GROUP_CARD_VARIANT[group?.id] || '';

const fetchDemographics = async () => {
  if (!props.client?.id) return;
  try {
    demoLoading.value = true;
    demoError.value = '';
    const r = await api.get(`/clients/${props.client.id}/demographics`);
    demoProfileFields.value = r.data?.profileFields || [];
    demoIntakeFields.value = r.data?.intakeDemoFields || [];
    demoSections.value = Array.isArray(r.data?.sections) ? r.data.sections : [];
    demoCapturedAt.value = r.data?.capturedAt || null;
  } catch (e) {
    demoError.value = e.response?.data?.error?.message || 'Failed to load demographics';
  } finally {
    demoLoading.value = false;
  }
};

// Survey responses tab
const clientSurveyResponses = ref([]);
const clientSurveysLoading = ref(false);
const clientSurveysError = ref('');
const clientScoreSeries = computed(() =>
  (clientSurveyResponses.value || [])
    .map((r) => Number(r.total_score))
    .filter((n) => Number.isFinite(n))
);
const clientScoreMin = computed(() => (clientScoreSeries.value.length ? Math.min(...clientScoreSeries.value) : 0));
const clientScoreMax = computed(() => (clientScoreSeries.value.length ? Math.max(...clientScoreSeries.value) : 0));
const clientSurveySparklinePoints = computed(() => {
  const data = clientScoreSeries.value;
  if (!data.length) return '';
  if (data.length === 1) return '0,15 100,15';
  const min = clientScoreMin.value;
  const max = clientScoreMax.value;
  const span = max - min || 1;
  return data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 30 - (((v - min) / span) * 28 + 1);
    return `${x},${y}`;
  }).join(' ');
});

const formatCategoryScores = (raw) => {
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return '-'; }
  }
  if (!raw || typeof raw !== 'object') return '-';
  const parts = Object.entries(raw)
    .filter(([k]) => String(k || '').trim())
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(', ') : '-';
};

const printSurveyTrends = () => {
  if (typeof window !== 'undefined') window.print();
};

const fetchClientSurveyResponses = async () => {
  if (!props.client?.id) return;
  try {
    clientSurveysLoading.value = true;
    clientSurveysError.value = '';
    const r = await api.get(`/surveys/client/${props.client.id}/responses`);
    clientSurveyResponses.value = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    clientSurveysError.value = e.response?.data?.error?.message || 'Failed to load survey responses';
  } finally {
    clientSurveysLoading.value = false;
  }
};

onMounted(async () => {
  if (isSchoolPortalContext.value) {
    profileDetailsPulseHint.value = false;
  }
  if (isBackofficeRole.value) {
    await fetchProviders();
  }
  // Fire fetchAccess without awaiting — it only populates the agency-switcher dropdown
  // which is only visible in edit mode; no need to block the overview render.
  fetchAccess().catch(() => {});
  await refreshOverviewProviders();
  await fetchAdminNote();
  if (isClinicalLikeClientType.value) {
    fetchBillingDiagnoses();
  }
  // Log that this profile was viewed (best-effort)
  if (props.client?.id) {
    api.post(`/clients/${props.client.id}/log-view`).catch(() => {});
  }
  if (activeTab.value === 'history') {
    await fetchHistory();
  } else if (activeTab.value === 'access') {
    await fetchAccessLog();
  } else if (activeTab.value === 'checklist') {
    await hydrateChecklist();
  } else if (activeTab.value === 'guardians') {
    await fetchGuardians();
  } else if (activeTab.value === 'assignments') {
    await fetchAvailableAffiliations();
    await fetchClientAffiliations();
    await fetchProviderOptions();
    await reloadProviderAssignments();
    await fetchEventAssignments();
  } else if (activeTab.value === 'phi') {
    await loadPaperworkTabData();
  } else if (activeTab.value === 'demographics') {
    await fetchDemographics();
  } else if (activeTab.value === 'surveys') {
    await fetchClientSurveyResponses();
  }
});

watch(
  () => props.initialDocumentId,
  (id) => {
    const n = Number(id || 0);
    if (n > 0) {
      const allowed = new Set((tabs.value || []).map((x) => x.id));
      if (allowed.has('phi')) activeTab.value = 'phi';
    }
  },
  { immediate: true }
);

watch(
  () => props.initialEncounterId,
  (id) => {
    const n = Number(id || 0);
    medicalRecordEncounterId.value = n > 0 ? n : null;
    if (n > 0) {
      const allowed = new Set((tabs.value || []).map((x) => x.id));
      if (allowed.has('medical-record')) activeTab.value = 'medical-record';
    }
  },
  { immediate: true }
);

// Open to a requested initial tab (e.g., ?tab=checklist)
watch(
  () => props.initialTab,
  (t) => {
    const desired = String(t || '').trim();
    if (!desired) return;
    const allowed = new Set((tabs.value || []).map((x) => x.id));
    if (allowed.has(desired)) activeTab.value = desired;
  },
  { immediate: true }
);

// Hub passes initial-tab="skill-builders" while the client row may load without `skills` first; apply when flag appears.
watch(
  () => isSkillsClientFlag(props.client?.skills),
  (on) => {
    const desired = String(props.initialTab || '').trim();
    if (desired !== 'skill-builders' || !on) return;
    const allowed = new Set((tabs.value || []).map((x) => x.id));
    if (allowed.has('skill-builders')) activeTab.value = 'skill-builders';
  },
  { immediate: true }
);

// If the tab set shrinks (e.g. skills cleared), avoid a blank panel.
watch(
  () => (tabs.value || []).map((t) => t.id).join(','),
  () => {
    const allowed = new Set((tabs.value || []).map((t) => t.id));
    if (!allowed.has(activeTab.value)) activeTab.value = 'overview';
  }
);

watch(
  () => selectedAssignmentOrgId.value,
  async () => {
    addProviderUserId.value = '';
    addProviderDay.value = '';
    addProviderMakePrimary.value = true;
    await reloadProviderAssignments();
    await fetchProviderOptions();
  }
);

watch(
  () => addProviderUserId.value,
  () => {
    // Reset day when provider changes so only valid days can be selected.
    addProviderDay.value = '';
  }
);
</script>

<style scoped>
@import '../../styles/client-chart.css';

.modal-content.large {
  width: min(1280px, 97vw);
}

.admin-note-item {
  position: relative;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.admin-note-trigger {
  position: relative;
  display: inline-block;
}

.admin-note-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 40;
  width: min(520px, 70vw);
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 10px 12px;
}

/* When teleported to <body>, the popover uses fixed positioning supplied
   inline by the component, escapes overflow/transform stacking contexts,
   and renders above sibling cards. */
.admin-note-popover--floating {
  width: min(520px, 92vw);
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 32px -10px rgba(15, 23, 42, 0.25), 0 4px 12px -4px rgba(15, 23, 42, 0.12);
  padding: 12px 14px;
}

.admin-note-textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg);
  resize: vertical;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content.large {
  background: #fff;
  border-radius: 18px;
  width: min(1280px, 97vw);
  max-width: min(1280px, 97vw);
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  box-shadow:
    0 28px 64px -24px rgba(29, 38, 51, 0.42),
    0 10px 24px -12px rgba(29, 38, 51, 0.18);
  overflow: hidden;
  border: 1px solid rgba(58, 76, 107, 0.12);
}

/* ───────────── Clinical chart shell (soft SaaS + PlotTwist accents) ───────────── */
.modal-header.cdp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px 16px;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(58, 76, 107, 0.10);
  background: #fff;
}

.cdp-header-main {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.cdp-avatar {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family: var(--font-display, var(--font-header));
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.4px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.18);
  user-select: none;
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 3px rgba(58, 76, 107, 0.16),
    0 4px 10px -6px rgba(29, 38, 51, 0.3);
}

.cdp-header-info {
  min-width: 0;
  flex: 1;
}

.cdp-header-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  min-width: 0;
}

.cdp-title {
  margin: 0;
  font-family: var(--font-display, var(--font-header));
  font-size: 17px;
  line-height: 1.25;
  font-weight: 750;
  color: var(--secondary, #1D2633);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.cdp-identity-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  font-weight: 500;
}
.cdp-identity-line > span:not(:last-child)::after {
  content: '·';
  margin-left: 10px;
  color: rgba(58, 76, 107, 0.35);
}

.cdp-title-initials {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0;
  margin-left: 4px;
  vertical-align: baseline;
}

.cdp-meta-row {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.cdp-submeta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.cdp-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15px;
  background: #fff;
  color: var(--secondary, #1D2633);
  border: 1px solid rgba(58, 76, 107, 0.18);
  white-space: nowrap;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 1px 2px rgba(29, 38, 51, 0.05);
}

.cdp-pill svg { flex: 0 0 auto; opacity: 0.75; }
.cdp-pill .mono { font-size: 11px; }

.cdp-pill__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--primary, #C69A2B);
  box-shadow: 0 0 0 3px rgba(198, 154, 43, 0.22);
}

.cdp-pill--type {
  background: rgba(198, 154, 43, 0.14);
  border-color: rgba(198, 154, 43, 0.42);
  color: #6b4d10;
}
.cdp-pill--type.is-editable {
  padding-right: 4px;
}
.cdp-pill-edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 2px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(198, 154, 43, 0.28);
  color: #6b4d10;
  cursor: pointer;
  flex: 0 0 auto;
}
.cdp-pill-edit-btn:hover {
  background: rgba(198, 154, 43, 0.5);
}

.cdp-pill--success {
  background: rgba(47, 143, 131, 0.12);
  border-color: rgba(47, 143, 131, 0.35);
  color: #1f6b62;
}
.cdp-pill--success .cdp-pill__dot {
  background: var(--success, #2F8F83);
  box-shadow: 0 0 0 3px rgba(47, 143, 131, 0.22);
}

.cdp-pill--info {
  background: rgba(58, 76, 107, 0.10);
  border-color: rgba(58, 76, 107, 0.28);
  color: var(--accent, #3A4C6B);
}
.cdp-pill--warning {
  background: rgba(230, 167, 0, 0.14);
  border-color: rgba(230, 167, 0, 0.4);
  color: #8a5b00;
}
.cdp-pill--terminated {
  background: rgba(204, 61, 61, 0.10);
  border-color: rgba(204, 61, 61, 0.35);
  color: #9a1f1f;
}
.cdp-pill--archived { background: #eef2f6; border-color: #d5dde7; color: #475569; }
.cdp-pill--neutral { background: #f3f6fa; border-color: #dbe3ee; color: #475569; }
.cdp-pill--org {
  background: rgba(58, 76, 107, 0.10);
  border-color: rgba(58, 76, 107, 0.28);
  color: var(--accent, #3A4C6B);
}
.cdp-pill--code {
  background: rgba(198, 154, 43, 0.08);
  border-color: rgba(198, 154, 43, 0.25);
  color: #8a5b12;
}

.cdp-admin-details {
  margin: 0;
  border: none;
  padding: 0;
  flex: 0 0 auto;
}
.cdp-admin-details > summary {
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: var(--accent, #3A4C6B);
  list-style: none;
  user-select: none;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid rgba(58, 76, 107, 0.28);
}
.cdp-admin-details > summary:hover {
  background: rgba(58, 76, 107, 0.08);
}
.cdp-admin-details > summary::-webkit-details-marker { display: none; }
.cdp-admin-details > summary::after {
  content: '▾';
  color: var(--primary, #C69A2B);
}
.cdp-admin-details[open] > summary::after { content: ' ▴'; }
.cdp-admin-details[open] {
  position: relative;
}
.cdp-admin-details[open] .cdp-inline-controls,
.cdp-admin-details[open] .cdp-inline-controls--muted {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 280px;
  margin-top: 0;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px -8px rgba(15, 23, 42, 0.22);
}

.cdp-submeta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 1px 1px rgba(15, 23, 42, 0.03);
}

.cdp-submeta--code {
  color: #8a5b12;
  background: rgba(198, 154, 43, 0.10);
  border-color: rgba(198, 154, 43, 0.18);
}

.cdp-inline-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
  padding-top: 0;
  border-top: none;
}
.cdp-inline-controls--muted { margin-top: 8px; }

.cdp-inline-controls__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.cdp-inline-select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  color: var(--text-primary);
}

.cdp-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.cdp-nav-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.cdp-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}
.cdp-nav-btn:hover:not(:disabled) {
  background: var(--bg-alt);
  color: var(--text-primary);
}
.cdp-nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.cdp-nav-pill__label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  padding: 0 6px;
}

.cdp-soft-button {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(247, 248, 250, 0.95) 100%);
  border-color: rgba(226, 232, 240, 0.95);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.cdp-soft-button:hover {
  background: linear-gradient(180deg, #ffffff 0%, #f6f8fb 100%);
  border-color: rgba(198, 154, 43, 0.32);
}

.cdp-btn-primary,
.cdp-open-full,
.cdp-btn-gold {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  background: var(--primary, #C69A2B);
  border: 1px solid rgba(155, 115, 20, 0.35);
  color: #1D2633;
  box-shadow: 0 1px 2px rgba(29, 38, 51, 0.08);
  transition: background 0.12s ease, transform 0.12s ease, box-shadow 0.12s ease;
}
.cdp-btn-primary:hover,
.cdp-open-full:hover,
.cdp-btn-gold:hover {
  background: var(--primary-light, #D4B04A);
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(198, 154, 43, 0.28);
}
.cdp-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.cdp-btn-soft {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  background: #fff;
  border: 1px solid rgba(58, 76, 107, 0.16);
  color: var(--secondary, #1D2633);
  box-shadow: 0 1px 1px rgba(29, 38, 51, 0.03);
  transition: background 0.12s ease, border-color 0.12s ease;
}
.cdp-btn-soft:hover {
  background: #F7F9FC;
  border-color: rgba(58, 76, 107, 0.28);
}
.cdp-overview-toolbar .cdp-btn-soft,
.cdp-overview-toolbar .cdp-btn-primary {
  width: auto;
}

.cdp-btn-ink {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-weight: 700;
  background: var(--secondary, #1D2633) !important;
  border: 1px solid rgba(29, 38, 51, 0.85) !important;
  color: #fff !important;
  box-shadow: 0 1px 3px rgba(29, 38, 51, 0.22);
}
.cdp-btn-ink:hover:not(:disabled) {
  background: var(--accent, #3A4C6B) !important;
  border-color: var(--accent, #3A4C6B) !important;
}
.cdp-btn-ink:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cdp-alert-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 22px 10px 26px;
  border-bottom: 1px solid rgba(58, 76, 107, 0.08);
  background: #F7F9FC;
}

.cdp-alert-chip {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  background: #fff;
  color: var(--secondary, #1D2633);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.cdp-alert-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(29, 38, 51, 0.08);
}
.cdp-alert-chip--warning {
  background: rgba(230, 167, 0, 0.12);
  border-color: rgba(230, 167, 0, 0.45);
  color: #8a5b00;
}
.cdp-alert-chip--danger {
  background: rgba(204, 61, 61, 0.10);
  border-color: rgba(204, 61, 61, 0.38);
  color: #9a1f1f;
}
.cdp-alert-chip--info {
  background: rgba(58, 76, 107, 0.10);
  border-color: rgba(58, 76, 107, 0.32);
  color: var(--accent, #3A4C6B);
}
.cdp-alert-chip--accent {
  background: rgba(198, 154, 43, 0.14);
  border-color: rgba(198, 154, 43, 0.45);
  color: #6b4d10;
}

.cdp-overview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 268px;
  gap: 18px;
  align-items: start;
}
.cdp-overview-main { min-width: 0; }
.cdp-overview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}
.cdp-section-title {
  margin: 0 0 2px;
  font-family: var(--font-display, var(--font-header));
  font-size: 17px;
  font-weight: 800;
  color: var(--secondary, #1D2633);
  letter-spacing: -0.01em;
}
.cdp-section-sub {
  margin: 0;
  font-size: 12.5px;
  color: var(--accent, #3A4C6B);
}
/* Compact profile rows (replaces cdp-glance-grid cards) */
.cdp-profile-rows {
  border: 1px solid rgba(58, 76, 107, 0.10);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 20px;
  background: #fff;
}
.cdp-profile-row {
  display: grid;
  grid-template-columns: 148px 1fr;
  border-bottom: 1px solid rgba(58, 76, 107, 0.06);
}
.cdp-profile-row:last-child {
  border-bottom: none;
}
.cdp-profile-dt {
  padding: 9px 14px;
  background: #f8fafc;
  border-right: 1px solid rgba(58, 76, 107, 0.06);
  font-size: 11.5px;
  font-weight: 650;
  color: #64748b;
  letter-spacing: 0.01em;
  display: flex;
  align-items: center;
}
.cdp-profile-dd {
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--secondary, #1d2633);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cdp-profile-meta {
  font-size: 11.5px;
  color: #64748b;
  font-weight: 400;
}
/* Keep glance-meta for legacy use elsewhere */
.cdp-glance-meta {
  font-size: 12px;
  color: #64748b;
  line-height: 1.35;
}
.cdp-text-link {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  margin-top: 4px;
  color: var(--accent, #3A4C6B);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}
.cdp-text-link:hover {
  color: var(--secondary, #1D2633);
  text-decoration: underline;
}

.cdp-care-section,
.cdp-contacts-section {
  margin-bottom: 20px;
}
/* Care strip — compact horizontal row of clickable chips */
.cdp-care-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.cdp-care-chip {
  display: flex;
  flex-direction: column;
  padding: 8px 14px;
  background: #f8fafc;
  border: 1px solid rgba(58, 76, 107, 0.10);
  border-radius: 9px;
  cursor: pointer;
  gap: 2px;
  text-align: left;
  min-width: 110px;
  transition: background 0.15s, border-color 0.15s;
}
.cdp-care-chip:hover {
  background: #f0f9ff;
  border-color: rgba(58, 76, 107, 0.22);
}
.cdp-care-chip__title {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 750;
  color: #94a3b8;
  letter-spacing: 0.05em;
}
.cdp-care-chip__body {
  font-size: 13px;
  font-weight: 650;
  color: var(--secondary, #1d2633);
  line-height: 1.3;
}
.cdp-care-chip__meta {
  font-size: 11px;
  color: #94a3b8;
}
/* Keep contact card for legacy use */
.cdp-contact-card {
  background: #fff;
  border: 1px solid rgba(58, 76, 107, 0.10);
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 1px 2px rgba(29, 38, 51, 0.03);
}
.cdp-contact-card__role {
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 6px;
}
.cdp-contact-card__name {
  font-size: 14px;
  font-weight: 700;
  color: var(--secondary, #1D2633);
  line-height: 1.35;
  margin-bottom: 4px;
}
.cdp-contacts-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 10px;
}

.cdp-school-profile-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: flex-start;
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(58, 76, 107, 0.1);
  background: rgba(247, 249, 252, 0.9);
}
.cdp-school-profile-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 88px;
}
.cdp-school-profile-item--note {
  flex: 1 1 180px;
}
.cdp-school-profile-kicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(29, 38, 51, 0.55);
}
.cdp-profile-details {
  margin: 8px 0 4px;
  border: 1px solid rgba(58, 76, 107, 0.10);
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
  scroll-margin-top: 16px;
  transition: box-shadow 0.3s, border-color 0.3s;
}
.cdp-profile-details.is-flagged {
  border-color: var(--primary, #C69A2B);
  box-shadow: 0 0 0 3px rgba(198, 154, 43, 0.28);
  animation: cdp-profile-flag-pulse 1.6s ease-out;
}
.cdp-profile-details--hint:not([open]) {
  animation: cdp-profile-hint-pulse 2.8s ease-in-out infinite;
  border-color: rgba(198, 154, 43, 0.38);
}
.cdp-profile-details--hint:not([open]) > summary {
  background: linear-gradient(90deg, rgba(198, 154, 43, 0.08), rgba(255, 255, 255, 0));
}
@keyframes cdp-profile-flag-pulse {
  0% { box-shadow: 0 0 0 6px rgba(198, 154, 43, 0.32); }
  100% { box-shadow: 0 0 0 3px rgba(198, 154, 43, 0.28); }
}
@keyframes cdp-profile-hint-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(198, 154, 43, 0); border-color: rgba(198, 154, 43, 0.28); }
  50% { box-shadow: 0 0 0 6px rgba(198, 154, 43, 0.2); border-color: rgba(198, 154, 43, 0.62); }
}
.cdp-profile-details > summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
  list-style: none;
  font-size: 13px;
  font-weight: 750;
  color: var(--secondary, #1D2633);
  user-select: none;
}
.cdp-profile-details__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cdp-profile-details__badge {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 999px;
  padding: 2px 8px;
  animation: cdp-profile-badge-blink 2.8s ease-in-out infinite;
}
@keyframes cdp-profile-badge-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.cdp-profile-details > summary::-webkit-details-marker { display: none; }
.cdp-profile-details > summary::after {
  content: '▾';
  color: #94a3b8;
  font-weight: 600;
}
.cdp-profile-details[open] > summary {
  border-bottom: 1px solid rgba(58, 76, 107, 0.08);
}
.cdp-profile-details[open] > summary::after { content: '▴'; }
.cdp-profile-details__hint {
  margin-left: auto;
  margin-right: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
}
.cdp-profile-details .ov-sections {
  padding: 14px;
  margin-bottom: 0;
}

.ov-row--missing {
  background: rgba(254, 243, 199, 0.35);
  border-radius: 8px;
  margin: 0 -6px;
  padding-left: 6px;
  padding-right: 6px;
}
.demo-missing-chip {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #b45309;
  background: #fef3c7;
  border-radius: 999px;
  padding: 1px 6px;
  vertical-align: middle;
}
.demo-dup-toggle-wrap {
  margin-top: 12px;
}

.cdp-overview-aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: 0;
}
.cdp-aside-card {
  background: #fff;
  border: 1px solid rgba(58, 76, 107, 0.10);
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 1px 2px rgba(29, 38, 51, 0.03);
}
.cdp-aside-card h4 {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
}
.cdp-aside-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cdp-aside-actions .cdp-btn-primary { width: 100%; }
.cdp-aside-timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cdp-aside-timeline__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #F7F9FC;
  border: 1px solid transparent;
  text-align: left;
}
.cdp-aside-timeline__item strong {
  font-size: 12px;
  font-weight: 700;
  color: var(--secondary, #1D2633);
}
.cdp-aside-timeline__item span {
  font-size: 12px;
  color: #64748b;
}
.cdp-aside-timeline__item--btn {
  appearance: none;
  cursor: pointer;
  font: inherit;
}
.cdp-aside-timeline__item--btn:hover {
  border-color: rgba(58, 76, 107, 0.16);
  background: #fff;
}
.cdp-aside-contact + .cdp-aside-contact {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(58, 76, 107, 0.10);
}
.cdp-aside-contact strong {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-bottom: 2px;
}

.cdp-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 22px 12px 26px;
  border-top: 1px solid rgba(58, 76, 107, 0.10);
  background: #fff;
}
.cdp-footer-left,
.cdp-footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cdp-footer-right .cdp-btn-primary,
.cdp-footer-right .cdp-btn-ghost {
  width: auto;
}
.cdp-btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  background: #fff;
  border: 1px solid rgba(58, 76, 107, 0.22);
  color: var(--secondary, #1D2633);
}
.cdp-btn-ghost:hover {
  border-color: rgba(58, 76, 107, 0.35);
  background: #F7F9FC;
}
.cdp-footer-link {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  font-size: 13px;
  font-weight: 750;
  color: var(--accent, #3A4C6B);
  cursor: pointer;
}
.cdp-footer-link:hover { color: var(--secondary, #1D2633); }
.cdp-footer-link--danger { color: var(--error, #CC3D3D); }

.btn-close {
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid transparent;
  font-size: 22px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.15s ease;
}

.btn-close:hover {
  color: var(--text-primary);
  background: rgba(15, 23, 42, 0.08);
}

/* ───────────── Tab navigation (full-page shell overrides) ───────────── */
.cdp-page-body.client-chart .cc-tab-rail {
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 22px 26px;
  background: #F7F9FC;
}

@media (max-width: 1100px) {
  .cdp-overview-layout { grid-template-columns: 1fr; }
  .cdp-overview-aside { position: static; }
  .cdp-profile-row { grid-template-columns: 130px 1fr; }
  .cdp-contacts-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 980px) {
  .modal-header.cdp-header {
    padding: 10px 14px;
    gap: 10px;
    flex-wrap: wrap;
  }
  .cdp-header-actions { justify-content: flex-end; flex: 1 1 auto; }
  .cdp-avatar { width: 40px; height: 40px; font-size: 14px; border-radius: 10px; }
  .cdp-title { font-size: 18px; }
  .tab-content {
    padding: 18px 16px;
  }
  .cdp-profile-row { grid-template-columns: 110px 1fr; }
  .cdp-contacts-grid { grid-template-columns: 1fr; }
  .cdp-footer { padding: 12px 16px; }
}

.detail-section-docs {
  padding-top: 16px;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-size: 14px;
}

.table th {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  background: var(--bg-alt);
}

.table td.right,
.table th.right {
  text-align: right;
}

.table input[type="text"],
.table input[type="email"],
.table input[type="url"],
.table input[type="password"],
.table input[type="number"],
.table input[type="date"],
.table input[type="time"],
.table input[type="tel"],
.table input[type="search"],
.table input,
.form-group input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.form-group > label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.hint {
  font-size: 13px;
  color: var(--text-secondary);
}

.muted {
  color: var(--text-secondary);
  font-size: 13px;
}

.provider-list {
  display: grid;
  gap: 6px;
  margin-top: 2px;
}
.provider-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.detail-section {
  min-height: 400px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.school-roi-overview-cta {
  grid-column: 1 / -1;
}

/* ---------------------------------------------------------------
   Overview tab: grouped section cards (Identity, Status, Documents,
   Care Team, Education, Languages, Guardian, School ROI). Replaces
   the old "one card per field" layout to reduce visual noise and
   group related questions (esp. guardian) into a single card.
   --------------------------------------------------------------- */
.ov-sections {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
  align-items: start;
}

.ov-card {
  background: #fff;
  border: 1px solid rgba(58, 76, 107, 0.10);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ov-card--full {
  grid-column: 1 / -1;
}

.ov-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  background: #F7F9FC;
  border-bottom: 1px solid rgba(58, 76, 107, 0.08);
}

.ov-card-header h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ov-card-body {
  padding: 6px 16px 12px;
}

.ov-row {
  display: grid;
  grid-template-columns: minmax(180px, 44%) 1fr;
  gap: 18px;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid rgba(241, 245, 249, 0.95);
}

.ov-row:last-child {
  border-bottom: none;
}

.ov-row--block {
  grid-template-columns: 1fr;
  gap: 6px;
}

.address-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.ov-row-label {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.45px;
  line-height: 1.4;
  padding-top: 2px;
  /* Long machine-style keys (REGISTRATIONSELECTIONIDSBYSTEP, etc.) were
     overflowing into the value column. Allow them to wrap so the label
     and value remain clearly separated at any width. */
  word-break: break-word;
  overflow-wrap: anywhere;
  min-width: 0;
}

.ov-row-value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
  line-height: 1.45;
  word-break: break-word;
  min-width: 0;
}

.ov-row.admin-note-row.is-popover-open {
  position: relative;
  z-index: 50;
}

.ov-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 6px 0 4px;
}

.ov-card--guardian .ov-card-header {
  background: #F7F9FC;
  border-bottom-color: rgba(58, 76, 107, 0.08);
}

.ov-card--guardian {
  border-color: rgba(58, 76, 107, 0.10);
}

.ov-card--cta .ov-card-body {
  padding-top: 12px;
}

@media (max-width: 640px) {
  .ov-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}

/* Shared meta bar for tab headers (Clinical / Demographics) */
.tab-meta-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  margin-bottom: 16px;
}
.tab-meta-bar-spacer { flex: 1 1 auto; }

/* Per-section accent colors so each card in Clinical/Demographics gets a
   recognizable hue without breaking the unified card grid. The color shows
   on the card's top border and header background. */
.ov-card--demo-profile     { border-top-color: rgba(198, 154, 43, 0.45); }
.ov-card--demo-client      { border-top-color: rgba(45, 130, 95, 0.45); }
.ov-card--demo-client .ov-card-header { background: linear-gradient(180deg, #f1faf5 0%, #fff 100%); }
.ov-card--demo-guardian    { border-top-color: rgba(89, 116, 188, 0.55); }
.ov-card--demo-guardian .ov-card-header { background: linear-gradient(180deg, #f6f9ff 0%, #fff 100%); }
.ov-card--demo-address     { border-top-color: rgba(168, 86, 196, 0.45); }
.ov-card--demo-address .ov-card-header { background: linear-gradient(180deg, #faf3fc 0%, #fff 100%); }

.ov-card--clinical-psc        { border-top-color: rgba(220, 90, 90, 0.55); }
.ov-card--clinical-psc .ov-card-header { background: linear-gradient(180deg, #fdf3f3 0%, #fff 100%); }
.ov-card--clinical-questions  { border-top-color: rgba(45, 130, 95, 0.55); }
.ov-card--clinical-questions .ov-card-header { background: linear-gradient(180deg, #f1faf5 0%, #fff 100%); }
.ov-card--clinical-trauma     { border-top-color: rgba(189, 92, 39, 0.55); }
.ov-card--clinical-trauma .ov-card-header { background: linear-gradient(180deg, #fdf6ee 0%, #fff 100%); }
.ov-card--clinical-goals      { border-top-color: rgba(89, 116, 188, 0.55); }
.ov-card--clinical-goals .ov-card-header { background: linear-gradient(180deg, #f6f9ff 0%, #fff 100%); }
.ov-card--clinical-notes      { border-top-color: rgba(168, 86, 196, 0.45); }
.ov-card--clinical-notes .ov-card-header { background: linear-gradient(180deg, #faf3fc 0%, #fff 100%); }
.billing-diagnosis-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.billing-diagnosis-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
}
.billing-diagnosis-item .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.ov-card--clinical-other      { border-top-color: rgba(100, 116, 139, 0.45); }

/* Duplicate-row treatment inside demographics cards. */
.ov-row.is-duplicate {
  background: #fbf7ee;
  border-radius: 8px;
  padding-left: 8px;
  padding-right: 8px;
}
.ov-row.is-duplicate .ov-row-label {
  color: #8a5b12;
  opacity: 0.85;
}

/* ─── PSC-17 score summary ────────────────────────────────────────────── */
.psc-summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 6px 0 4px;
}

.psc-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: linear-gradient(180deg, #fff 0%, #fdf6f6 100%);
  border: 1px solid #f1d8d8;
}
.psc-total-label {
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: #8a5b12;
}
.psc-total-value {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  margin-top: 4px;
}
.psc-out-of {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
}

.psc-flag {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  font-size: 13px;
  font-weight: 800;
  padding: 8px 12px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.psc-flag--elevated {
  background: #fdecec;
  color: #b42318;
  border: 1px solid #f5b8b3;
}
.psc-flag--normal {
  background: #ecfdf3;
  color: #027a48;
  border: 1px solid #b6e7c8;
}
.psc-flag-cutoff {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.4px;
  opacity: 0.85;
  text-transform: none;
}

.psc-subscale-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.psc-subscale {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.psc-subscale.is-elevated {
  border-color: #f3b9b3;
  background: #fff8f8;
}
.psc-subscale.is-normal {
  border-color: #c8ead7;
  background: #f7fefa;
}
.psc-subscale-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.psc-subscale-name {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-primary);
}
.psc-subscale-flag {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 2px 7px;
  border-radius: 999px;
}
.psc-subscale.is-elevated .psc-subscale-flag {
  background: #fdecec;
  color: #b42318;
}
.psc-subscale.is-normal .psc-subscale-flag {
  background: #ecfdf3;
  color: #027a48;
}
.psc-subscale-score {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.psc-subscale-cutoff {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
}
.psc-subscale-bar {
  width: 100%;
  height: 6px;
  background: #f1f5f9;
  border-radius: 999px;
  overflow: hidden;
}
.psc-subscale-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #34a853 0%, #fbbc05 60%, #ea4335 100%);
  border-radius: 999px;
  transition: width 0.25s ease;
}

.psc-warning { padding: 0 4px; }

.psc-interpretation {
  background: #fffaf0;
  border: 1px solid #f1e3c2;
  border-left: 3px solid #c69a2b;
  border-radius: 10px;
  padding: 12px 14px;
}
.psc-interpretation-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 800;
  color: #8a5b12;
  margin-bottom: 6px;
}
.psc-interpretation-body {
  font-size: 14px;
  color: var(--text-primary);
  margin: 0 0 6px;
  line-height: 1.5;
}
.psc-interpretation-disclaimer {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  margin: 0;
  line-height: 1.45;
  font-style: italic;
}

/* PSC items expand button */
.psc-expand-btn {
  margin-top: 10px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.psc-expand-btn:hover {
  background: #fdf6e9;
  border-color: rgba(198, 154, 43, 0.45);
}
.psc-expand-caret {
  display: inline-block;
  transition: transform 0.2s ease;
}
.psc-expand-caret.is-open { transform: rotate(180deg); }

.psc-items {
  margin-top: 8px;
  padding: 4px 0;
  border-top: 1px dashed rgba(226, 232, 240, 0.85);
}
.psc-item-row {
  align-items: center;
}
.psc-item-num {
  display: inline-block;
  min-width: 22px;
  margin-right: 8px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 800;
  color: #8a5b12;
  background: #fdf6e9;
  border-radius: 6px;
  text-align: center;
}
.psc-item-value {
  font-weight: 700;
}
.psc-item-sub {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
}
.psc-item-row.is-often .psc-item-value { color: #b42318; }
.psc-item-row.is-sometimes .psc-item-value { color: #b54708; }
.psc-item-row.is-never .psc-item-value { color: #027a48; }
.psc-item-row.is-unscored .psc-item-value { color: var(--text-secondary, #64748b); font-style: italic; }

.info-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid rgba(58, 76, 107, 0.10);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  position: relative;
  min-height: 82px;
}

.info-item:hover {
  border-color: rgba(58, 76, 107, 0.22);
  box-shadow: 0 6px 16px -14px rgba(15, 23, 42, 0.22);
}

/* Don't lift the admin-note card while its popover is open — the lift
   creates a new stacking context that can interact poorly with neighbors,
   and we want the floating popover to feel anchored. */
.info-item.admin-note-item.is-popover-open,
.info-item.admin-note-item.is-popover-open:hover {
  transform: none;
  z-index: 50;
}

.info-item label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.55px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.info-item label::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 10px;
  border-radius: 2px;
  background: rgba(58, 76, 107, 0.35);
  flex: 0 0 auto;
}

.info-value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
  line-height: 1.45;
  word-break: break-word;
}

.info-value .muted {
  font-style: italic;
  font-size: 13.5px;
}

/* Make the school-roi cta card span full row gracefully */
.school-roi-overview-cta {
  background: linear-gradient(135deg, rgba(198, 154, 43, 0.06) 0%, rgba(58, 76, 107, 0.05) 100%);
  border-color: rgba(198, 154, 43, 0.22);
}

.editable-field {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
  display: inline-block;
}

.editable-field:hover {
  background: var(--bg-alt);
}

.edit-hint {
  font-size: 11px;
  color: var(--text-secondary);
  font-style: italic;
  margin-left: 8px;
}

.inline-select {
  padding: 6px 10px;
  border: 2px solid var(--primary);
  border-radius: 4px;
  font-size: 14px;
  background: white;
  min-width: 200px;
}

.doc-status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.doc-none {
  background: #e2e3e5;
  color: #383d41;
}

.doc-uploaded {
  background: #fff3cd;
  color: #856404;
}

.doc-approved {
  background: #d4edda;
  color: #155724;
}

.doc-rejected {
  background: #f8d7da;
  color: #721c24;
}

.quick-actions {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.quick-actions h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.actions-grid {
  display: flex;
  gap: 12px;
}

.status-select {
  min-width: 180px;
}

.history-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.history-item {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
  border-left: 3px solid var(--primary);
}

.history-time {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 150px;
}

.history-content {
  flex: 1;
}

.history-field {
  margin-bottom: 8px;
  color: var(--text-primary);
}

.history-change {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.from-value {
  color: var(--text-secondary);
  text-decoration: line-through;
}

.arrow {
  color: var(--primary);
  font-weight: 600;
}

.to-value {
  color: var(--text-primary);
  font-weight: 500;
}

.history-author {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.history-note {
  font-size: 13px;
  color: var(--text-primary);
  margin-top: 8px;
  padding: 8px;
  background: white;
  border-radius: 4px;
  font-style: italic;
}

.messages-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.phi-warning {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #7c2d12;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.message-item {
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.message-item.internal-note {
  border-left: 3px solid var(--primary);
}

.daily-note-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  font-size: 13px;
}
.daily-note-initials {
  font-weight: 700;
  color: var(--primary);
  flex-shrink: 0;
}
.daily-note-message {
  flex: 1;
}
.daily-note-time {
  color: var(--text-secondary);
  font-size: 12px;
  flex-shrink: 0;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}

.message-author {
  font-weight: 600;
  color: var(--text-primary);
}

.message-date {
  color: var(--text-secondary);
  font-size: 12px;
}

.category-badge {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 12px;
}

.internal-badge {
  padding: 2px 8px;
  background: var(--primary);
  color: white;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.doc-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(99, 102, 241, 0.12);
  color: var(--primary);
}

.check-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.check-row:last-child {
  border-bottom: none;
}
.check-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 240px;
}
.check-label {
  font-weight: 600;
}
.check-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid rgba(0,0,0,0.08);
}
.badge-success {
  background: rgba(22, 163, 74, 0.12);
  color: #166534;
}
.badge-warning {
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
}
.badge-secondary {
  background: rgba(100, 116, 139, 0.12);
  color: #334155;
}

.message-content {
  color: var(--text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
}

.add-message-form {
  padding: 20px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.add-message-form h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.message-input {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 12px;
}

.message-options {
  margin-bottom: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}

.add-guardian-modal-overlay {
  z-index: 10000;
}
.add-guardian-modal {
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}
.add-guardian-modal-body {
  padding: 18px 20px;
}
.add-guardian-intake-hint {
  font-size: 13px;
  color: var(--text-secondary);
  background: #f0f7ff;
  border: 1px solid #c8e1ff;
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 16px;
}
.add-guardian-modal-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
}

.intake-guardian-placeholder {
  border: 1px dashed var(--border-color, #c4cdd5);
  border-radius: 8px;
  margin-bottom: 14px;
  background: #fefef6;
}
.intake-guardian-placeholder-header {
  padding: 8px 14px;
  border-bottom: 1px dashed var(--border-color, #c4cdd5);
}
.intake-guardian-badge {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .4px;
  color: #8b6914;
  background: #fdf4d9;
  padding: 2px 8px;
  border-radius: 4px;
}
.intake-guardian-placeholder-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px;
  gap: 18px;
}
.intake-guardian-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}
.intake-guardian-field {
  display: flex;
  flex-direction: column;
  min-width: 140px;
}
.intake-guardian-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .3px;
  color: var(--text-secondary, #6b7785);
  margin-bottom: 2px;
}
.intake-guardian-actions {
  flex-shrink: 0;
}
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.error {
  text-align: center;
  padding: 20px;
  color: #c33;
  background: #fee;
  border-radius: 6px;
}

.clinical-section-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary, #64748b);
  margin: 0 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.clinical-section-subtitle {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--primary, #2d6a4f);
  margin: 0 0 8px;
}

.clinical-field-list {
  display: grid;
  gap: 10px;
}
.clinical-field-row {
  padding: 10px 14px;
  background: #f8f9fb;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.clinical-field-label {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  margin-bottom: 4px;
}
.clinical-field-value {
  font-size: 14px;
  color: var(--text-primary, #1e293b);
  white-space: pre-wrap;
}

.demo-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  margin-bottom: 16px;
}
.demo-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  user-select: none;
}
.demo-toggle input { margin: 0; }
.demo-section {
  margin-bottom: 24px;
}
.demo-section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.clinical-field-row.is-duplicate {
  border-style: dashed;
  background: #fbf7ee;
}
.demo-dup-chip {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  margin-left: 6px;
  border-radius: 999px;
  background: rgba(198, 154, 43, 0.15);
  color: #9a6b00;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  vertical-align: middle;
}
.chart-block {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 12px;
}
.sparkline {
  width: 100%;
  height: 90px;
  background: #f8fafc;
  border-radius: 6px;
}

/* Full-page (non-modal) mode */
.cdp-page-shell {
  width: 100%;
  min-height: 100%;
  background: var(--bg-page, #f4f6fb);
  padding: 16px 0 56px;
}
.cdp-page-body {
  max-width: none;
  width: 100%;
  margin: 0;
  padding: 0 24px;
  background: transparent;
  display: flex;
  flex-direction: column;
}
/* When rendered in full-page mode, give the panel modal-like card chrome */
.cdp-page-body.client-chart .modal-header.cdp-header,
.cdp-page-body.client-chart .cc-tab-rail,
.cdp-page-body.client-chart .cc-alert-bar,
.cdp-page-body.client-chart .tab-content {
  background: #ffffff;
}
.cdp-page-body.client-chart .modal-header.cdp-header {
  border-radius: 16px 16px 0 0;
  border: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02);
}
.cdp-page-body.client-chart .cc-tab-rail {
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.cdp-page-body.client-chart .tab-content {
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 16px 16px;
  box-shadow: 0 12px 30px -18px rgba(15, 23, 42, 0.18);
}
@media (max-width: 980px) {
  .cdp-page-body.client-chart { padding: 0 12px; }
}
.continuation-checklist-section {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt, #f8fafc);
  display: grid;
  gap: 10px;
}
.continuation-checklist-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}
.cont-nested {
  display: grid;
  gap: 8px;
}
.cont-choice-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.continuation-checklist-section label.cont-choice-card {
  display: flex !important;
  flex-direction: row !important;
  align-items: flex-start;
  gap: 10px;
  margin: 0 !important;
  margin-bottom: 0 !important;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  color: #1d2633;
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
}
.cont-choice-card-label {
  flex: 1;
  min-width: 0;
  color: #1d2633;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
}
.continuation-checklist-section label.cont-choice-card input[type='radio'] {
  width: 18px !important;
  min-width: 18px !important;
  height: 18px !important;
  margin: 1px 0 0 !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  flex: 0 0 18px;
  align-self: flex-start;
  accent-color: var(--primary, #c69a2b);
}
.cont-sub-prompt {
  margin-top: 10px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  box-shadow: var(--shadow);
}
.cont-sub-prompt h4 {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 700;
  color: #1d2633;
}
.cont-sub-prompt-lead {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
}
@media (max-width: 640px) {
  .cont-choice-row { grid-template-columns: 1fr; }
}
</style>
