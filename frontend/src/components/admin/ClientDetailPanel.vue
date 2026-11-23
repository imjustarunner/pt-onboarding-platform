<template>
  <ClientChartShell
    @contextmenu="followUpTask?.openContextMenu($event, client)"
    :full-page="props.fullPage"
    :header-collapsed="headerCollapsed"
    :clinical-branding="showClinicalChartSurfaces" :workspace-mode="clinicalWorkspaceMode"
    :tenant-id="selectedAgencyId || client.agency_id" :tenant-name="primaryAgencyDisplayName"
    :return-label="props.returnLabel || (props.schoolOrganizationId ? 'Back to school portal' : '')"
    @workspace-mode="changeClinicalWorkspaceMode"
    :tabs="tabs"
    :active-tab="chartHub"
    :subnav="chartSubnav"
    :active-sub="effectiveHubSub"
    :alert-items="overviewAlertItems"
    @close="handleClose"
    @update:active-tab="onHubChange"
    @update:active-sub="onHubSubChange"
    @alert-click="onOverviewAlertClick"
  >
    <template #quick-actions>
      <ClientFollowUpTask ref="followUpTask" :agency-id="selectedAgencyId || client.agency_id" />
      <ClientQuickActions :actions="profileQuickActions" @action="onProfileQuickAction" />
    </template>
    <template #header>
      <div class="modal-header cdp-header" :class="{ 'cdp-header--collapsed': headerCollapsed }">
        <div class="cdp-header-main">
          <div v-show="!headerCollapsed" class="cdp-avatar" :style="avatarColor" aria-hidden="true">
            {{ avatarText }}
          </div>
          <div class="cdp-header-info">
            <div class="cdp-header-row">
              <h2 class="cdp-title">
                <button
                  v-if="!headerCollapsed && !props.fullPage && props.client?.id"
                  type="button"
                  class="cdp-title-link"
                  title="Open full client profile"
                  @click="openFullClientRecord"
                >
                  <template v-if="canSeeClientFullName && client.full_name">
                    {{ client.full_name }}
                    <span class="cdp-title-initials">({{ client.initials || '—' }})</span>
                  </template>
                  <template v-else>{{ client.initials || '—' }}</template>
                </button>
                <template v-else-if="canSeeClientFullName && client.full_name">
                  {{ client.full_name }}
                  <span class="cdp-title-initials">({{ client.initials || '—' }})</span>
                </template>
                <template v-else>{{ client.initials || '—' }}</template>
              </h2>
              <span v-if="headerCollapsed" class="mono cdp-compact-id">ID {{ client.identifier_code || client.id }}</span>
              <div v-show="!headerCollapsed" class="cdp-identity-line">

                <span v-if="clientAgeLabel">Age {{ clientAgeLabel }}</span>
                <span v-if="client.identifier_code" class="mono">Client code {{ client.identifier_code }}</span>
                <span v-if="isBackofficeRole" class="mono">Record #{{ client.id }}</span>
                <span v-else-if="client.id" class="mono">ID {{ client.id }}</span>
                <span v-if="clientDobLabel">DOB {{ clientDobLabel }}</span>
                <span v-if="recordSexLabel">Sex {{ recordSexLabel }}</span>
                <span v-else-if="intakeSexLabel">Sex {{ intakeSexLabel }} · intake</span>
                <span v-if="guardianIntakeName">
                  {{ intakeContactLabel }}:
                  <RouterLink v-if="canManageGuardians && overviewGuardianAccount?.guardian_user_id" :to="guardianAccountPath(overviewGuardianAccount.guardian_user_id, route.params.organizationSlug)">{{ guardianIntakeName }}</RouterLink>
                  <template v-else>{{ guardianIntakeName }}</template>
                </span>
              </div>
              <div v-show="!headerCollapsed" class="cdp-tenant-line">
                <span
                  v-for="t in tenantMembershipPills"
                  :key="`tenant-${t.id}`"
                  class="cdp-pill cdp-pill--tenant"
                  :title="t.activeChart ? 'Agency membership (active chart context)' : 'Agency membership'"
                >
                  Agency · {{ t.name }}
                  <template v-if="t.activeChart"> · chart</template>
                </span>
                <span
                  v-for="p in programAffiliationPills"
                  :key="`prog-${p.id}`"
                  class="cdp-pill cdp-pill--affil"
                  :title="'Program / organization affiliation'"
                >
                  <template v-if="p.typeLabel">{{ p.typeLabel }} · </template>{{ p.name }}
                </span>
              </div>
              <div v-show="!headerCollapsed" class="cdp-meta-row">
                <button v-if="canEditAccount" type="button" class="cdp-pill cdp-status-edit" :class="statusPillClass" aria-label="Change client status" title="Change client status" @click="editHeaderStatus">
                  {{ isClientArchived ? 'Inactive' : displayStatusLabel }} ▾
                </button>
                <span v-else
                  class="cdp-pill"
                  :class="statusPillClass"
                  :title="isClientTerminated && client.termination_reason ? client.termination_reason : undefined"
                >
                  {{ isClientArchived ? 'Inactive' : displayStatusLabel }}
                </span>
                <ClientTypeEditor v-if="canReadChartTypes" :key="`${client.id}:${activeChartAgencyId}`"
                  :profile="chartTypes" :label="clientTypeLabel" :error="chartTypeError" :can-edit="canEditClientType"
                  :busy="savingChartTypes" @save="saveChartTypes" @reload="loadChartTypes" @manage="goChartSub" />
                <span v-else class="cdp-pill cdp-pill--type">{{ clientTypeLabel }}</span>
                <button v-if="chartTypes?.portalSetup && canViewGuardians" class="cdp-pill cdp-pill--type" type="button" @click="onHubChange('portal')">Auricwell portal</button>
                <span v-if="primaryInsuranceLabel" class="cdp-pill cdp-pill--success">
                  {{ primaryInsuranceLabel }}
                </span>
              </div>
              <ClientHeaderSummary v-if="!headerCollapsed" :key="`${client.id}:${activeChartAgencyId}`" :client="{...client,agency_id:activeChartAgencyId}" :provided-snapshot="overviewSnapshot" :dependent="showDependentFields" />
              <details
                v-if="isBackofficeRole && (switchableAgencies.length > 1 || clientAgenciesNote)"
                v-show="!headerCollapsed"
                class="cdp-admin-details"
              >
              <summary>Admin settings</summary>
              <div v-if="isBackofficeRole && (switchableAgencies.length > 1 || clientAgenciesNote)" class="cdp-inline-controls cdp-inline-controls--muted">
                <template v-if="switchableAgencies.length > 1">
                  <span class="cdp-inline-controls__label">Chart agency</span>
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
          <button type="button" class="cdp-header-toggle" :aria-expanded="!headerCollapsed" @click="headerCollapsed = !headerCollapsed">{{ headerCollapsed ? 'Expand header' : 'Collapse header' }}</button>
          <details v-if="!headerCollapsed" class="cdp-more-actions"><summary>More actions</summary><div>
            <router-link v-if="canViewMedicalRecord && isClinicalLikeClientType && router.hasRoute?.('AssistantHumanReviews')" :to="{path:'/assistant-reviews',query:{agencyId:selectedAgencyId || client.agency_id,sourceKind:'clinical_chart',sourceId:client.id}}">Review AI recommendations</router-link>
            <p v-if="canViewMedicalRecord && isClinicalLikeClientType">View saved assistant suggestions and record your decision.</p>
            <button v-if="canPostClientToExchange" type="button" class="btn btn-secondary btn-sm" @click="openPostToExchangeModal">Refer through Client Exchange</button>
          </div></details>
          <button
            v-if="!props.fullPage && props.client?.id"
            class="cdp-btn-primary cdp-open-full"
            type="button"
            @click="openFullClientRecord"
          >
            Open full record
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

        <p v-if="clientEmailError" role="alert" class="error">{{ clientEmailError }}</p>
        <section v-if="providerAssignmentOpen && canManageServiceEnrollments" ref="providerAssignmentSection" class="detail-section" aria-label="Assign client provider">
          <div class="cdp-overview-toolbar">
            <h3>Assign provider</h3>
            <button type="button" class="cdp-btn-soft" @click="providerAssignmentOpen = false">Close assignments</button>
          </div>
          <ClientServiceEnrollments :key="`${client.id}:${selectedAgencyId || client.agency_id}`" :client-id="client.id" :agency-id="selectedAgencyId || client.agency_id" :organizations="affiliationsForActiveAgency" start-assigning @loaded="onAgencyServicesLoaded(selectedAgencyId || client.agency_id, $event)" @updated="onAgencyServicesUpdated(selectedAgencyId || client.agency_id, $event)" />
        </section>

        <section v-if="chartHub==='schedule' && canScheduleClient" class="detail-section"><ClientSchedulePanel :key="`${client.id}:${activeChartAgencyId}`" :client="{...client,agency_id:activeChartAgencyId}" /></section>
        <section v-if="chartHub==='bring-up-to-date' && showRecordsImportTab" class="detail-section">
          <p v-if="!canFinishChartSetup || !recordsImportSetup" role="status">Loading this client’s saved import…</p>
          <ClientEhrBringUpToDatePanel v-else ref="recordsImportPanel" :key="`records-import-${client.id}`" embedded open :client-id="client.id" :agency-id="client.agency_id" :client-label="client.full_name || ''" :record-status="recordsImportSectionStatus" :only-sections="recordsImportSetup.recordsImportSelectedSections||null" @section-imported="onChartSetupUpdated" :personal-account-only="!showDependentFields && !clientIsMinor" review-intake-link @review-intake="goChartSub('intake-note')" @done="onRecordsImportDone" />
        </section>

        <div
          v-if="chartHub === 'overview' && effectiveHubSub !== 'skill-builders'"
          class="detail-section cdp-overview"
        >
          <p v-if="pendingAssignmentDraft" role="status">Assignment choices are saved as a draft and still need review. <button type="button" class="cdp-text-link" @click="openAssignmentDraft">Review saved assignments</button></p>
          <ClientOverviewHub :show-quick-actions="false" :key="`overview-${client.id}`"
            :client-id="client.id"
            :client="client"
            :can-edit="canEditAccount"
            :can-process-paper="paperProcessingAvailable"
            :can-send-secure-message="canOpenClientSecureMessage"
            @secure-message="openClientSecureMessage"
            :can-view-medical-record="canViewMedicalRecord"
            :can-view-private-chart="['super_admin', 'admin', 'support', 'provider', 'provider_plus'].includes(roleNorm)"
            :can-view-essentials="['super_admin', 'admin', 'billing', 'support', 'staff', 'provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant'].includes(roleNorm)"
            :glance-items="overviewGlanceItems"
            :status-label="isClientArchived ? 'Inactive' : displayStatusLabel"
            :program-label="overviewProgramLabel"
            :care-team-label="primaryProviderLabel"
            :care-team-meta="careTeamGlanceMeta"
            :session-count-label="sessionCountLabel"
            :last-session-label="lastSessionLabel"
            :alerts="overviewAlertItems"
            :guardian-name="showDependentFields ? overviewGuardianName : client.full_name" :linked-guardians="showDependentFields ? guardians : []" :guardian-loading="showDependentFields && guardiansLoading" :guardian-error="showDependentFields ? guardiansError : null"
            :contact-role="showDependentFields ? intakeContactLabel : 'Client contact'"
            :contact-email="showDependentFields ? overviewGuardianAccount?.email || guardianIntakeEmail : client.email"
            :contact-phone="showDependentFields ? (overviewGuardianAccount ? guardianPhone(overviewGuardianAccount) : guardianIntakePhone) : client.contact_phone || client.phone"
            :organization-name="chartOrganizationLabel(client.organization_name, client.organization_type) || schoolNames.join(' · ')"
            @edit="startEditOverview(true)"
            @assign-provider="openProviderAssignment"
            @upload="openDocumentUpload"
            @client-actions="openClientActions"
            @navigate="goChartSub"
            @alert-click="onOverviewAlertClick"
            @view-event="openLifecycleHistoryEvent"
            @open-document="openChartDocument"
          >
            <template #clinical-summary>
              <EnrollmentPreferencesSummary v-if="!['school_staff','client_guardian'].includes(roleNorm)" :preferences="enrollmentPreferences" />
              <section v-if="canViewMedicalRecord" class="cdp-care-section">
                <h3 class="cc-hub-section__title">Presenting problems &amp; diagnoses</h3>
                <p v-if="careSummaryLoading" class="muted">Loading clinical summary…</p>
                <p v-else-if="careSummaryError" class="error">{{ careSummaryError }}</p>
                <ClientExchangeSummary v-else-if="careSummary" :listing="careSummary" />
                <ClientExchangeFitEditor v-if="careSummary &amp;&amp; canPostClientToExchange" :key="clientChartClientId" :client-id="clientChartClientId" :agency-id="clientAgencyId" v-model="careSummary.preferences.matchingPreferences" />
              </section>
            </template>
          </ClientOverviewHub>
          <section v-if="canLaunchRecordUpdate || canTerminate" class="quick-actions"><h3>Quick Actions</h3><div class="actions-grid"><ClientRecordsUpdateLauncher v-if="canLaunchRecordUpdate" :client-id="client.id" :agency-id="client.agency_id" :account-access="canEditAccount" @started="onRecordsUpdateStarted" /><button v-if="canTerminate && !isClientArchived" type="button" class="btn btn-danger" @click="openTerminateModal">Terminate client</button></div></section>
          <p v-if="chartReceiptError && !showPanel('records')" class="error" role="alert">
            {{ chartReceiptError }}
            <a v-if="chartReceiptFallbackUrl" :href="chartReceiptFallbackUrl" target="_blank" rel="noopener">Open the enrollment receipt</a>
          </p>
          <ClientOperationalStatus v-if="roleNorm === 'support' && clientChartClientId" :client-id="clientChartClientId" />
          <ClientReminderTextConsent v-if="['support','admin','super_admin'].includes(roleNorm) && clientChartClientId" :key="clientChartClientId" :client-id="Number(clientChartClientId)" />
          <ClientPendingTasks v-if="clientChartClientId && !route.meta?.auricwellPreview" :agency-id="clientAgencyId" :client-id="clientChartClientId" :billing-enabled="canViewClientBillingImport" :paper-enabled="paperProcessingAvailable" :agency-slug="route.params.organizationSlug" :clinical-notes="canViewMedicalRecord ? clientTaskEncounters : []" @open-note="goChartSub('medical-record')" />
        </div>

        <div
          v-if="showPanel('records')"
          class="detail-section"
        >
          <p v-if="chartReceiptError" class="error" role="alert">
            {{ chartReceiptError }}
            <a v-if="chartReceiptFallbackUrl" :href="chartReceiptFallbackUrl" target="_blank" rel="noopener">Open the enrollment receipt</a>
          </p>
          <ClientRecordsOverview :key="`records-${client.id}`"
            :client-id="client.id"
            :client="client"
            :agency-id="client.agency_id || selectedAgencyId"
            :can-view-billing="(canViewClientBillingImport || learningBillingEnabledForClient)
              && !['provider', 'provider_plus'].includes(roleNorm)"
            :can-manage-school-roi="canManageSchoolRoi"
            :operational-only="!canViewMedicalRecord"
            :can-process-paper="paperProcessingAvailable"
            :packages-enabled="practitionerPackagesEnabledForClient"
            :phi-banner="['admin', 'super_admin', 'support', 'staff'].includes(roleNorm)"
            :unsigned-notes-count="unsignedNotesCount"
            :alerts="overviewAlertItems"
            @navigate="goChartSub"
            @navigate-secondary="goChartSub"
            @upload="openDocumentUpload"
            @client-actions="openClientActions"
            @open-document="openChartDocument"
            @alert-click="onOverviewAlertClick"
          />
        </div>

        <!-- Account profile (never stacked under Overview) -->
        <div
          v-if="chartHub === 'account' && (effectiveHubSub === 'profile' || !effectiveHubSub)"
          class="detail-section cdp-overview"
        >
          <div class="cdp-overview-layout">
            <div class="cdp-overview-main">
          <div class="cdp-overview-toolbar">
            <div>
              <h3 class="cdp-section-title">Account</h3>
              <p class="hint" style="margin: 4px 0 0;">
                Client profile, relationships, education, and account details in one place.
              </p>
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
            v-if="showSchoolGlance || isClinicalLikeClientType"
            class="cdp-school-profile-strip"
          >
            <div class="cdp-school-profile-item">
              <span class="cdp-school-profile-kicker">{{ showSchoolGlance ? 'School' : 'Organization' }}</span>
              <strong>{{ showSchoolGlance ? schoolGlanceLabel : savedOrganizationLabel }}</strong>
            </div>
            <template v-if="showSchoolGlance && !showSchoolStripAssignmentEditor">
              <div class="cdp-school-profile-item">
                <span class="cdp-school-profile-kicker">Assigned day</span>
                <strong>{{ assignedDayGlanceLabel }}</strong>
              </div>
            </template>
            <div v-if="showSchoolGlance" class="cdp-school-profile-item">
              <span class="cdp-school-profile-kicker">Grade</span>
              <template v-if="editingOverview && canEditAccount">
                <select v-model="overviewForm.grade" class="cdp-strip-input">
                  <option value="">—</option>
                  <option
                    v-for="o in overviewGradeSelectOptions"
                    :key="`${o.value}::${o.label}`"
                    :value="o.value"
                  >{{ o.label }}</option>
                </select>
              </template>
              <strong v-else>{{ formatGradeDisplay(client.grade) || '—' }}</strong>
            </div>
            <div v-if="showSchoolGlance" class="cdp-school-profile-item">
              <span class="cdp-school-profile-kicker">School year</span>
              <template v-if="editingOverview && canEditAccount">
                <input v-model="overviewForm.school_year" class="cdp-strip-input" placeholder="2025-2026" />
              </template>
              <strong v-else>{{ client.school_year || '—' }}</strong>
            </div>
            <template v-if="!showSchoolStripAssignmentEditor">
              <div class="cdp-school-profile-item">
                <span class="cdp-school-profile-kicker">{{ primaryRoleLabel }}</span>
                <button v-if="canManageServiceEnrollments && !showSchoolGlance" type="button" class="cdp-clinician-link" @click="openProviderAssignment">{{ primaryProviderLabel }}</button>
                <strong v-else>{{ primaryProviderLabel }}</strong>
              </div>
            </template>
            <div
              v-if="showSchoolStripAssignmentEditor"
              class="cdp-school-profile-item cdp-school-profile-item--assignment"
            >
              <SchoolClientAssignmentInline
                :organization-id="schoolOrganizationId"
                :client="client"
                :initial-provider-user-id="assignDayProviderUserId"
                @updated="onSchoolAssignmentUpdated"
              />
            </div>
            <div v-if="overviewProgramLabel" class="cdp-school-profile-item">
              <span class="cdp-school-profile-kicker">Program</span>
              <strong>{{ overviewProgramLabel }}</strong>
            </div>
            <div class="cdp-school-profile-item">
              <span class="cdp-school-profile-kicker">Insurance</span>
              <strong>{{ primaryInsuranceLabel || 'Not on file' }}</strong>
            </div>
            <div class="cdp-school-profile-item">
              <span class="cdp-school-profile-kicker">Status</span>
              <strong>{{ isClientArchived ? 'Inactive' : displayStatusLabel }}</strong>
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

          <div v-if="canViewMedicalRecord" class="cdp-care-section">
            <h3 class="cdp-section-title">Presenting problems &amp; diagnoses</h3>
            <p v-if="careSummaryLoading" class="muted">Loading clinical summary…</p>
            <p v-else-if="careSummaryError" class="error">{{ careSummaryError }}</p>
            <ClientExchangeSummary v-else-if="careSummary" :listing="careSummary" />
                <ClientExchangeFitEditor v-if="careSummary &amp;&amp; canPostClientToExchange" :key="clientChartClientId" :client-id="clientChartClientId" :agency-id="clientAgencyId" v-model="careSummary.preferences.matchingPreferences" />
          </div>

          <div class="cdp-care-section">
            <h3 class="cdp-section-title">Current care</h3>
            <div class="cdp-care-strip">
              <button type="button" class="cdp-care-chip">
                <span class="cdp-care-chip__title">Status</span>
                <span class="cdp-care-chip__body">{{ isClientArchived ? 'Inactive' : displayStatusLabel }}</span>
                <span class="cdp-care-chip__meta">{{ clientTypeLabel }}</span>
              </button>
              <button v-if="canViewMedicalRecord" type="button" class="cdp-care-chip" @click="goChartSub('clinical')">
                <span class="cdp-care-chip__title">Clinical</span>
                <span class="cdp-care-chip__body">{{ primaryDiagnosisLabel !== '—' ? primaryDiagnosisLabel : 'No diagnosis' }}</span>
                <span class="cdp-care-chip__meta">Open chart →</span>
              </button>
              <button v-if="canViewMedicalRecord" type="button" class="cdp-care-chip" @click="goChartSub('medical-record')">
                <span class="cdp-care-chip__title">Medical record</span>
                <span class="cdp-care-chip__body">{{ sessionCountLabel }} session{{ sessionCount !== 1 ? 's' : '' }}</span>
                <span class="cdp-care-chip__meta">Open record →</span>
              </button>
              <button type="button" class="cdp-care-chip" @click="goChartSub('phi')">
                <span class="cdp-care-chip__title">Documents</span>
                <span class="cdp-care-chip__body">Open chart documents</span>
                <span class="cdp-care-chip__meta">View →</span>
              </button>
                  <button
                    v-if="canViewClientBillingImport && !['provider', 'provider_plus'].includes(roleNorm)"
                    type="button"
                    class="cdp-care-chip"
                    @click="goChartSub('client-billing')"
                  >
                <span class="cdp-care-chip__title">Billing</span>
                <span class="cdp-care-chip__body">Imported balances</span>
                <span class="cdp-care-chip__meta">Open →</span>
              </button>
            </div>
          </div>

          <div class="cdp-contacts-section">
            <h3 class="cdp-section-title">{{ showDependentFields ? 'Contacts & relationships' : 'Care team' }}</h3>
            <div class="cdp-contacts-grid">
              <article v-if="showDependentFields" class="cdp-contact-card">
                <div class="cdp-contact-card__role">{{ intakeContactLabel }}</div>
                <div class="cdp-contact-card__name">{{ overviewGuardianName || (guardiansLoading ? 'Loading contact…' : 'No contact on file') }}</div>
                <div class="cdp-glance-meta">{{ overviewGuardianMeta || '—' }}</div>
              </article>
              <article class="cdp-contact-card">
                <div class="cdp-contact-card__role">{{ primaryRoleLabel }}</div>
                <button v-if="canManageServiceEnrollments && !showSchoolGlance" type="button" class="cdp-contact-card__name cdp-clinician-link" @click="openProviderAssignment">{{ primaryProviderLabel }}</button>
                <div v-else class="cdp-contact-card__name">{{ primaryProviderLabel }}</div>
                <div class="cdp-glance-meta">{{ chartOrganizationLabel(client.organization_name, client.organization_type) || '—' }}</div>
              </article>
              <article class="cdp-contact-card">
                <div class="cdp-contact-card__role">Organization</div>
                <div class="cdp-contact-card__name">{{ savedOrganizationLabel }}</div>
                <div class="cdp-glance-meta">{{ clientTypeLabel }}</div>
              </article>
            </div>
            <ClientReferralLinks v-if="client?.id && ['super_admin','admin','staff','support','provider','provider_plus'].includes(authStore.user?.role)" :client-id="client.id" :agency-id="client.agency_id" />
            <div v-if="client?.id" class="cdp-affiliated-wrap">
              <ClientAffiliatedContactsPanel
                mode="staff"
                :client-id="client.id"
                :client-initials="client.initials || ''"
                title="Appointment reminder contacts"
              />
            </div>
          </div>

          <div v-if="showPanel('account')" class="ov-sections ov-sections--account">

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
                      <select v-model="overviewForm.organization_id" class="inline-select" aria-label="Client organization">
                        <option :value="''">None</option>
                        <option v-if="client.organization_id && !overviewOrganizations.some(o=>Number(o.id)===Number(client.organization_id))" :value="String(client.organization_id)">{{ savedOrganizationLabel }}</option>
                        <option v-for="o in overviewOrganizations" :key="o.id" :value="String(o.id)">
                          {{ chartOrganizationLabel(o.name, o.organization_type) }}
                        </option>
                      </select>
                    </template>
                    <template v-else>{{ savedOrganizationLabel }}</template>
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
                        <option value="PUBLIC_INTAKE_LINK">Public Enrollment Link</option>
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
                <ClientContactEmail :key="client.id" :client-id="Number(client.id)" :agency-id="Number(client.agency_id)" :email="client.email || ''" :editable="canEditClientEmail" @saved="onClientEmailSaved" />
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
                      <select v-model="overviewForm.gender" class="inline-select" aria-label="Client sex">
                        <option value="">Prefer not to say</option>
                        <option v-if="overviewForm.gender && !sexSelectOptions.some(o=>o.value===overviewForm.gender)" :value="overviewForm.gender">{{ overviewForm.gender }}</option>
                        <option v-for="o in sexSelectOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                      </select>
                    </template>
                    <template v-else>{{ recordSexLabel || '-' }}</template>
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
                        <input v-address-autocomplete="{ model: overviewForm, fields: { street: 'address_street', city: 'address_city', state: 'address_state', postalCode: 'address_zip' }, locale: 'en', scopeKey: client.id }" autocomplete="street-address" v-model="overviewForm.address_street" class="inline-input" placeholder="Street address" style="grid-column: 1 / -1;" />
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
                      <select ref="statusSelectEl" v-model="overviewForm.client_status_id" class="inline-select" aria-label="Client status">
                        <option :value="''">—</option>
                        <option v-if="overviewForm.client_status_id && !overviewClientStatuses.some(s=>String(s.id)===String(overviewForm.client_status_id))" :value="overviewForm.client_status_id" disabled>{{client.client_status_label || 'Saved legacy status'}} (current)</option>
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
                      <ClientTerminationSummary v-if="isClientTerminated" :client="client" />
                    </template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Inactive</div>
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
                <ClientCareCoverageSummary compact v-if="roleNorm !== 'school_staff'" :client-id="client.id" />
                <button v-if="canViewClientBillingImport" type="button" class="btn btn-secondary" @click="setChartNav('account','billing-settings')">Open billing &amp; insurance settings</button>
                <div v-if="false" class="ov-row">
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
                      <div
                        v-if="client.primary_insurer_name"
                        class="hint"
                        style="margin-bottom: 6px;"
                      >
                        Carrier on file: <strong>{{ client.primary_insurer_name }}</strong>
                        <span v-if="client.insurance_member_id" class="muted"> · Member {{ client.insurance_member_id }}</span>
                      </div>
                      <select v-model="overviewForm.insurance_type_id" class="inline-select">
                        <option :value="''">—</option>
                        <option v-for="i in overviewInsuranceTypes" :key="i.id" :value="String(i.id)">{{ i.label }}</option>
                      </select>
                    </template>
                    <template v-else>
                      <span v-if="client.primary_insurer_name || client.insurance_type_label">
                        {{ client.primary_insurer_name || client.insurance_type_label }}
                        <span v-if="client.insurance_member_id" class="muted" style="font-size: 12px; margin-left: 4px;">Member {{ client.insurance_member_id }}</span>
                        <span
                          v-if="client.primary_insurer_name && client.insurance_type_label && client.insurance_type_label !== client.primary_insurer_name"
                          class="muted"
                          style="font-size: 12px; margin-left: 4px;"
                        >({{ client.insurance_type_label }})</span>
                      </span>
                      <span v-else>-</span>
                    </template>
                  </div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Insurance follow-up needed</div>
                  <div class="ov-row-value">
                    <label class="check-row" style="margin: 0;">
                      <input
                        type="checkbox"
                        :checked="!!newInsuranceNeededItem?.is_needed"
                        :disabled="!canEditPaperwork || docChecklistSaving || !newInsuranceNeededItem"
                        @change="onToggleDocNeeded(newInsuranceNeededItem, $event)"
                      />
                      <span class="muted" style="font-size: 12px;">
                        This can mean missing insurance-card images or updated policy details. Review the coverage already on file before requesting changes.
                      </span>
                    </label>
                  </div>
                </div>
                <div v-if="false" class="ov-row">
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
                  Edit on the <strong>Assignments</strong> tab (providers, office and service location defaults)
                </span>
              </header>
              <div class="ov-card-body">
                <div class="ov-row ov-row--block">
                  <div class="ov-row-label">Provider</div>
                  <div class="ov-row-value">
                    <div v-if="overviewProvidersLoading" class="muted">Loading…</div>
                    <button v-else-if="effectiveOverviewProviders.length === 0 && canManageServiceEnrollments && !showSchoolGlance" type="button" class="cdp-text-link" @click="openProviderAssignment">Not assigned — assign provider</button>
                    <div v-else-if="effectiveOverviewProviders.length === 0">Not assigned</div>
                    <div v-else class="provider-list">
                      <div v-for="p in effectiveOverviewProviders" :key="p.id" class="provider-row">
                        <div>
                          <strong>{{ p.provider_last_name }}, {{ p.provider_first_name }}</strong>
                          <span v-if="p.is_primary" class="badge badge-success" style="margin-left: 8px;">Primary</span>
                          <div v-if="p.organization_name" class="muted" style="margin-top: 2px;">
                            {{ chartOrganizationLabel(p.organization_name, p.organization_type) }}
                          </div>
                        </div>
                        <div v-if="showSchoolGlance" class="muted" style="white-space: nowrap;">
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
                <div v-if="showDependentFields" class="ov-row">
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
            <section v-if="showDependentFields && canViewGuardians" class="ov-card ov-card--guardian">
              <header class="ov-card-header">
                <h3>{{ intakeContactLabel }} contact</h3>
                <button
                  v-if="editingOverview && guardianIntakeProfile && !isSelfIntakeContact && !intakeGuardianAlreadyLinked && canManageGuardians"
                  type="button"
                  class="btn btn-primary btn-sm"
                  @click="openAddGuardian"
                >
                  Add guardian from enrollment info
                </button>
              </header>
              <div class="ov-card-body">
                <div class="ov-row">
                  <div class="ov-row-label">Name</div>
                  <div class="ov-row-value">{{ overviewGuardianName || '-' }}</div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Email</div>
                  <div class="ov-row-value">{{ overviewGuardianAccount?.email || guardianIntakeEmail || '-' }}</div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Phone</div>
                  <div class="ov-row-value">{{ overviewGuardianAccount?.phone || guardianIntakePhone || '-' }}</div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Relationship</div>
                  <div class="ov-row-value">{{ guardianIntakeRelationship || overviewLinkedGuardian?.relationship || '-' }}</div>
                </div>
                <div class="ov-row">
                  <div class="ov-row-label">Date of birth</div>
                  <div class="ov-row-value">{{ guardianIntakeDob ? formatDate(guardianIntakeDob) : '-' }}</div>
                </div>
                <ClientGuardianContactEditor
                  v-if="canEditAccount"
                  :client-id="Number(client.id)"
                  :profile="overviewGuardianContactProfile"
                  :guardian-user-id="overviewGuardianAccount?.guardian_user_id || null"
                  @saved="onGuardianContactSaved"
                />
              </div>
            </section>

            <!-- School ROI CTA (full width) -->
            <section v-if="showSchoolGlance && canManageSchoolRoi" class="ov-card ov-card--full ov-card--cta">
              <header class="ov-card-header">
                <h3>School ROI</h3>
              </header>
              <div class="ov-card-body">
                <div class="ov-cta-row">
                  <span class="hint" style="margin: 0;">
                    ROI date for affiliated school:
                    <strong>{{ schoolRoiStatusLabel }}</strong>
                  </span>
                  <button type="button" class="btn btn-secondary btn-sm" @click="goChartSub('school-roi')">
                    Manage staff access
                  </button>
                  <button type="button" class="btn btn-primary btn-sm" @click="goChartSub('school-roi')">
                    Request ROI update
                  </button>
                </div>
              </div>
            </section>

          </div>

          <div v-if="(canEditAccount && editingOverview) || (canTerminate && !editingOverview)" class="quick-actions">
            <h3>Quick Actions</h3>
            <div class="actions-grid"><ClientRecordsUpdateLauncher v-if="canLaunchRecordUpdate" :client-id="client.id" :agency-id="client.agency_id" :account-access="canEditAccount" @started="onRecordsUpdateStarted" />
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
                  Reopen enrollment
                </button>
              </template>
            </div>
          </div>
            </div>


          </div>
        </div>

        <ClientStatusEditor v-if="headerStatusOpen" :key="client.id" :client="client" @close="headerStatusOpen=false" @saved="onHeaderStatusSaved" />
        <ClientUpdateModal :clinical-mode="roleNorm === 'support' ? 'release' : ['admin','super_admin'].includes(roleNorm) ? 'full' : ''" :open="clientUpdateModalOpen" :client-id="client?.id" :agency-id="client?.agency_id" :client-name="client?.full_name || client?.initials || ''" :guardian-email="guardianIntakeEmail || ''" :guardian-name="guardianIntakeName || ''" @close="clientUpdateModalOpen = false" @sent="clientUpdateModalOpen = false" />
        <ClientRenewalPushModal
          :open="clientRenewalModalOpen"
          :client-id="client?.id"
          :agency-id="client?.agency_id"
          :roi-expires-at="client?.roi_expires_at"
          :disclosure-status="clientDisclosureStatus"
          :school-name="schoolNames.join(' · ')"
          :agency-name="clientRenewalAgencyLabel"
          :guardian-email="guardianIntakeEmail || ''"
          :client-initials="client?.initials || ''"
          @close="clientRenewalModalOpen = false"
          @sent="onClientRenewalSent"
        />

        <!-- Skill Builders program (skills clients — integrated groups/events; see docs/SKILL_BUILDERS_PROGRAM_AND_AFFILIATIONS.md) -->
        <div v-if="showPanel('skill-builders')" class="detail-section">
          <ClientSkillBuildersProgramTab :client="client" @program-updated="emit('updated', { keepOpen: true })" />
        </div>

        <div v-if="showPanel('school-years')" class="detail-section">
          <h3 style="margin-top: 0;">School years</h3>
          <ClientLifecycleHistoryPanel
            :client-id="client.id"
            @view-event="openLifecycleHistoryEvent"
          />
        </div>

        <!-- Compliance Checklist Tab -->
        <div v-if="showPanel('checklist')" class="detail-section">
          <h3 style="margin-top: 0;">Compliance Checklist</h3>
          <p class="hint" style="margin-top:-6px;">
            Operational tracking (non-clinical). Providers + admin/staff can update.
          </p>
          <p v-if="showFallContinuationChecklist" class="checklist-fall-banner">
            Returning client — this year's checklist is fall confirmation (continuation of services).
            Last year's parent contact and first service dates stay on file.
          </p>

          <div v-if="showLegacyChecklistFields" class="info-grid">
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

          <div v-if="showFallContinuationChecklist" class="continuation-checklist-section">
            <label class="continuation-checklist-label">Fall confirmation — Continuation of Services</label>
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
        <div v-if="showPanel('history')" class="detail-section">
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
        <div v-if="showPanel('access') || (chartHub === 'records' && effectiveHubSub === 'audit')" class="detail-section">
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
                    <td>{{ toPlainEnglish(e.action) || e.action }}</td>
                    <td>{{ e.ip_address || '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="hint" style="margin-top: 8px;">
                Tracks portal sign-ins, what was opened, and staff access to the profile and notes. Message text and document contents are not stored here.
              </div>
            </div>
          </div>
        </div>

        <!-- Notes running list (Records → Notes) -->
        <div v-if="showPanel('clinical-notes')" class="detail-section">
          <ClientClinicalNotesFeed
            ref="clinicalNotesFeedRef"
            :client-id="client.id"
            :agency-id="client.agency_id || selectedAgencyId"
            :client-type="effectiveClientType"
            :organization-slug="organizationSlugForLinks"
            @navigate="goChartSub"
            @review-updated="loadCareSummary"
          />
        </div>

        <!-- Clinical summary (Records → Clinical summary) -->
        <ClientClinicalTab
          v-if="showPanel('clinical')"
          :client="client"
          :billing-diagnoses="billingDiagnoses"
          :billing-diagnoses-loading="billingDiagnosesLoading"
          :billing-diagnoses-error="billingDiagnosesError"
          :is-super-admin="isSuperAdmin"
          :is-clinical-like-client-type="isClinicalLikeClientType"
          :is-backoffice-role="isBackofficeRole"
          :has-agency-access="hasAgencyAccess"
          :can-view-medical-record="canViewMedicalRecord"
          :force-learning-surface="false"
          @navigate="goChartSub"
        />

        <!-- Student summary (learning enrollment in active chart tenant context) -->
        <ClientClinicalTab
          v-if="showPanel('student-summary')"
          :client="client"
          :billing-diagnoses="billingDiagnoses"
          :billing-diagnoses-loading="billingDiagnosesLoading"
          :billing-diagnoses-error="billingDiagnosesError"
          :is-super-admin="isSuperAdmin"
          :is-clinical-like-client-type="isClinicalLikeClientType"
          :is-backoffice-role="isBackofficeRole"
          :has-agency-access="hasAgencyAccess"
          :can-view-medical-record="canViewMedicalRecord"
          :force-learning-surface="true"
          @navigate="goChartSub"
        />

        <!-- Billing import tab (financial — admin / support only) -->
        <div v-if="showPanel('client-billing') && canViewClientBillingImport && !['provider', 'provider_plus'].includes(roleNorm)" class="detail-section">
          <ClientPaymentFollowup :client-id="client.id" />
          <ClientBillingImportTab
            :agency-id="Number(props.client?.agency_id || 0) || null"
            :client-id="Number(props.client?.id || 0) || null"
            :client="client"
          />
        </div>

        <!-- Medical Record Tab (clinical clients only — chronological record) -->
        <div v-if="showPanel('medical-record') && canViewMedicalRecord" class="detail-section">
          <ClientMedicalRecordsTab ref="medicalRecordsRef"
            :agency-id="Number(selectedAgencyId || props.client?.agency_id || 0) || null"
            :client-id="Number(props.client?.id || 0) || null"
            :client="client"
            :initial-encounter-id="medicalRecordEncounterId"
            :can-view-missing-claim-flag="canViewMissingClaimFlag"
            @navigate="goChartSub" @open-document="openChartDocument" @encounter-change="onMedicalRecordEncounterChange"
          />
        </div>

        <!-- Demographics Tab -->
        <div v-if="showPanel('demographics')" class="detail-section chart-demographics">
          <ClientContactEmail ref="demographicsEmailEditor" :key="client.id" :client-id="Number(client.id)" :agency-id="Number(client.agency_id)" :email="client.email || ''" :editable="canEditClientEmail" @saved="onClientEmailSaved" />
          <GuardianDemographicReview v-if="showDependentFields && canEditAccount" :client-id="Number(client.id)" />
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
                    <button
                      v-if="row.key === 'sex' && row.missing && canEditAccount && intakeSexLabel"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="margin-left: 8px;"
                      :disabled="applyingIntakeSex"
                      @click="applyIntakeSexToRecord"
                    >
                      {{ applyingIntakeSex ? 'Applying…' : `Use intake (${intakeSexLabel})` }}
                    </button>
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
        <div v-if="showPanel('surveys')" class="detail-section">
          <ClientFeedbackTrends v-if="client?.id && !['school_staff','client_guardian'].includes(roleNorm)" :client-id="client.id" />
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

        <ClientBillingAccountSettings v-if="chartHub==='account' && effectiveHubSub==='billing-settings' && canViewClientBillingImport" :client-id="client.id" :agency-id="client.agency_id" :account-support="canSupportClientAccount" @manage-contacts="goChartSub('guardians')" />

        <!-- Learning Billing Tab -->
        <div v-if="showPanel('billing') && learningBillingEnabledForClient && !['provider', 'provider_plus'].includes(roleNorm)" class="detail-section">
          <GuardianBillingTab
            :agency-id="Number(props.client?.agency_id || 0) || null"
            :client-id="Number(props.client?.id || 0) || null"
          />
        </div>

        <!-- Practitioner Packages & Payments Tab -->
        <div v-if="showPanel('packages')" class="detail-section">
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

        <div v-if="showPanel('assessments') || showPanel('life-balance')" class="detail-section">
          <ClientAssessmentsTab
            :agency-id="Number(props.client?.agency_id || 0)"
            :client-id="Number(props.client?.id || 0)"
            :organization-slug="String(route.params?.organizationSlug || '')"
          />
        </div>

        <!-- Messages/Notes Tab -->
        <ClientMessagesTab
          v-if="showPanel('messages') && canSeeClientMessages"
          :client-id="Number(client.id)"
          :is-backoffice-role="isBackofficeRole"
        />

        <!-- Communications Tab -->
        <div v-if="showPanel('communications')" class="detail-section">
          <ClientCommunicationsTab
            :client-id="Number(props.client.id)"
            :key="`${client.id}:${activeChartAgencyId}:${communicationSchoolId}`"
            :organization-id="communicationSchoolId"
            :agency-id="activeChartAgencyId"
          />
        </div>

        <section v-if="chartHub === 'portal' && canViewGuardians && showSchoolGlance" class="detail-section cdp-school-portal" aria-label="School information and documents">
          <h3>School information</h3>
          <dl class="cdp-school-portal__facts">
            <div><dt>School</dt><dd>{{ schoolGlanceLabel }}</dd></div>
            <div><dt>Grade</dt><dd>{{ formatGradeDisplay(client.grade) || '—' }}</dd></div>
            <div><dt>School year</dt><dd>{{ client.school_year || '—' }}</dd></div>
            <div><dt>Assigned day</dt><dd>{{ assignedDayGlanceLabel }}</dd></div>
            <div><dt>School ROI</dt><dd>{{ schoolRoiStatusLabel }}</dd></div>
          </dl>
          <details v-if="canManageSchoolRoi" class="cdp-school-portal__documents">
            <summary>School ROI · Send a link and manage school access</summary>
            <ClientSchoolRoiAccessTab :key="`portal-roi-${client.id}`" :client="client" @updated="refreshClient" />
          </details>
          <details v-if="canManageSchoolRoi" class="cdp-school-portal__documents">
            <summary>School disclosure · View and send</summary>
            <ClientDisclosurePanel :key="`portal-disclosure-${client.id}`" :client-id="client.id" :client="client" @view-artifact="openChartDocument" />
          </details>
        </section>
        <ClientPortalOverview :portal-setup="chartTypes?.portalSetup" :can-edit-contact="canEditClientEmail" @edit-contact="goChartSub('demographics')" @account-updated="loadChartTypes" ref="portalOverviewRef"  :dependent="showDependentFields" :show-actions="false" v-if="chartHub==='portal' && canViewGuardians" :key="client.id" :client="client" :agency="{id:Number(selectedAgencyId||client.agency_id),name:primaryAgencyDisplayName}" :actor="authStore.user" @share-documents="goChartSub('documents')" @share-assessments="goChartSub('assessments')" @manage-access="showDependentFields ? goChartSub('guardians') : onHubChange('portal')" :personal-login-available="clientIsMinor" />

        <!-- Guardians Tab -->
        <div v-if="showDependentFields && showPanel('guardians')" class="detail-section">
          <h3>{{ isSelfIntakeContact ? 'Client (self)' : 'Guardians' }}</h3>
          <DependentPortalSharing :client-id="Number(client.id)" :agency-id="Number(selectedAgencyId || client.agency_id)" />
          <div class="phi-warning" style="margin-bottom: 12px;">
            <strong>Non-clinical portal access:</strong> Guardians can be given access to docs, links, and program materials.
          </div>

          <div v-if="!canViewGuardians" class="empty-state">
            <p v-if="agencyAccessLoading">Checking guardian access…</p>
            <template v-else-if="agencyAccessError"><p role="alert">{{ agencyAccessError }}</p><button type="button" class="btn btn-secondary" @click="fetchAccess">Retry access check</button></template>
            <p v-else>You don’t have permission to view guardians for this client.</p>
          </div>

          <div v-else>
            <div v-if="guardiansError" class="error" style="margin-bottom: 10px;">{{ guardiansError }}</div>
            <div style="display:flex; justify-content: space-between; align-items:center; gap: 12px; margin-bottom: 12px;">
              <div class="hint">
                <template v-if="canManageGuardians">
                  Add one or more guardian accounts (e.g., divorced guardians) with their own logins.
                  <p v-if="isSchoolClientType" style="margin:6px 0 0;">Adding a school guardian creates and links their account. Send a portal invitation when you are ready.</p>
                </template>
                <template v-else>
                  Guardians linked to this client (view only — ask an admin to add or edit).
                </template>
              </div>
              <button v-if="canManageGuardians" type="button" class="btn btn-secondary" @click="showPortalInvites = true">
                Invite linked guardians
              </button>
              <button
                v-if="canManageGuardians"
                type="button"
                class="btn btn-primary"
                @click="openAddGuardian"
              >
                Add Guardian
              </button>
            </div>

            <!-- Intake guardian placeholder (not yet a full account) -->
            <div
              v-if="canManageGuardians && guardianIntakeProfile && !isSelfIntakeContact && !intakeGuardianAlreadyLinked && !guardiansLoading"
              class="intake-guardian-placeholder"
            >
              <div class="intake-guardian-placeholder-header">
                <span class="intake-guardian-badge">From intake form</span>
              </div>
              <div class="intake-guardian-placeholder-body">
                <div class="intake-guardian-details">
                  <div class="intake-guardian-field">
                    <span class="intake-guardian-label">Name</span>
                    <span>{{ overviewGuardianName || '-' }}</span>
                  </div>
                  <div class="intake-guardian-field">
                    <span class="intake-guardian-label">Email</span>
                    <span>{{ overviewGuardianAccount?.email || guardianIntakeEmail || '-' }}</span>
                  </div>
                  <div class="intake-guardian-field">
                    <span class="intake-guardian-label">Phone</span>
                    <span>{{ overviewGuardianAccount?.phone || guardianIntakePhone || '-' }}</span>
                  </div>
                  <div class="intake-guardian-field">
                    <span class="intake-guardian-label">Relationship</span>
                    <span>{{ guardianIntakeRelationship || overviewLinkedGuardian?.relationship || '-' }}</span>
                  </div>
                </div>
                <div class="intake-guardian-actions">
                  <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="creatingIntakeGuardian || !guardianIntakeEmail"
                    @click="createGuardianFromIntake"
                  >
                    {{ creatingIntakeGuardian ? 'Preparing…' : 'Prepare guardian account' }}
                  </button>
                  <div class="hint">Verify the relationship in Portal before enabling access or sending an invitation.</div>
                </div>
              </div>
            </div>

            <div
              v-if="canManageGuardians && !clientIsMinor && !hasSelfGuardianLink && !guardiansLoading"
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

            <ClientPersonalPortalInvite v-if="canManageGuardians && clientIsMinor" :client-id="Number(client.id)" :agency-id="Number(selectedAgencyId || client.agency_id)" @updated="fetchGuardians" />

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
                    <th>Phone</th>
                    <th>Relationship title</th>
                    <th>Relationship access</th>
                    <th>Enrollment / record access</th>
                    <th class="right"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="g in guardians" :key="g.guardian_user_id">
                    <td><RouterLink :to="guardianAccountPath(g.guardian_user_id, route.params.organizationSlug)">{{ [g.first_name,g.last_name].filter(Boolean).join(' ') || 'Open guardian account' }}</RouterLink></td>
                    <td>{{ g.email }}<p v-if="g.permissions_json?.relationshipRevoked" class="hint">Marked as an incorrect relationship</p></td>
                    <td><a v-if="guardianPhone(g)" :href="`tel:${guardianPhone(g).replace(/[^+0-9]/g,'')}`">{{ guardianPhone(g) }}</a><span v-else>No phone on file</span></td>
                    <td style="min-width: 220px;">
                      <span v-if="guardianRowIsSelf(g)">Client (self)</span>
                      <input
                        v-else-if="canManageGuardians && !g.permissions_json?.relationshipRevoked"
                        v-model="g.relationship_title"
                        type="text"
                      />
                      <span v-else>{{ g.relationship_title || '—' }}</span>
                    </td>
                    <td>
                      <input
                        v-if="canManageGuardians && !g.permissions_json?.relationshipRevoked"
                        v-model="g.access_enabled"
                        type="checkbox"
                        :true-value="1"
                        :false-value="0"
                      />
                      <span v-else>{{ Number(g.access_enabled) === 1 ? 'Available' : 'Disabled' }}</span>
                      <span v-if="canManageGuardians" class="hint">{{ Number(g.access_enabled) === 1 ? 'Available' : 'Disabled' }}</span>
                    </td>
                    <td><strong>{{ guardianPortalStatus(g).label }}</strong><p class="hint">{{ guardianPortalStatus(g).detail }}</p></td>
                    <td class="right" style="white-space: nowrap;">
                      <ClientGuardianContactEditor v-if="canManageGuardians && !g.permissions_json?.relationshipRevoked" :client-id="Number(client.id)" :guardian-user-id="Number(g.guardian_user_id)" :profile="{firstName:g.first_name,lastName:g.last_name,email:g.email,phone:guardianPhone(g),relationship:g.relationship_title}" @saved="fetchGuardians" />
                      <button
                        v-if="canMessageGuardian && !g.permissions_json?.relationshipRevoked && !g.permissions_json?.pendingGuardianVerification"
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="messagingGuardianId === g.guardian_user_id"
                        @click="messageGuardian(g)"
                        style="margin-right: 8px;"
                      >
                        Message
                      </button>
                      <button
                        v-if="canManageGuardians && !g.permissions_json?.relationshipRevoked"
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="updatingGuardianId === g.guardian_user_id"
                        @click="updateGuardian(g)"
                      >
                        {{ updatingGuardianId === g.guardian_user_id ? 'Saving…' : 'Save' }}
                      </button>
                      <button
                        v-if="canManageGuardians && !g.permissions_json?.relationshipRevoked"
                        type="button"
                        class="btn btn-danger btn-sm"
                        :disabled="updatingGuardianId === g.guardian_user_id"
                        @click="removeGuardian(g)"
                        style="margin-left: 8px;"
                      >
                        Mark incorrect
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
                  Pre-filled from latest enrollment. Add a different guardian? Click <strong>Clear</strong> to start fresh.
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
                    I verified this person’s identity and authority for this client. Enable portal access.
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
                    {{ addingGuardian ? 'Creating…' : isSchoolClientType ? 'Create guardian account' : 'Create + Generate invite link' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <ClientPortalInviteDialog v-if="showPortalInvites && canManageGuardians" :key="client.id" :client-ids="[Number(client.id)]" :agency-id="Number(selectedAgencyId || client.agency_id)" :personal-login-available="clientIsMinor" :allow-linked-accounts="showDependentFields" @edit-contact="showPortalInvites=false;goChartSub('demographics')" @close="showPortalInvites = false" />

        <!-- Assignments Tab (backoffice only) -->
        <section v-if="showPanel('assignments') && reviewAssignmentDraft" class="detail-section"><button type="button" class="cdp-text-link" @click="closeAssignmentDraft">Back to account assignments</button><ClientUpdateAssignments ref="savedAssignmentPanel" :key="`saved-assignments-${client.id}`" :client-id="client.id" :agency-id="client.agency_id" @updated="loadPendingAssignmentDraft" /></section>
        <div v-if="showPanel('assignments') && !reviewAssignmentDraft" class="detail-section casg">
          <div class="casg-head">
            <div>
              <h3 class="casg-title">Assignments</h3>
              <p class="casg-subtitle">
                Each agency’s services and providers, scheduling defaults, and available school or program links.
              </p>
            </div>
            <div class="casg-stats">
              <span class="casg-stat"><strong>{{ (tenantMemberships || []).length }}</strong> Agenc{{ (tenantMemberships || []).length === 1 ? 'y' : 'ies' }}</span>
              <span v-if="hasAnyTenantCategory('school')" class="casg-stat"><strong>{{ schoolAffiliationCount }}</strong> School{{ schoolAffiliationCount === 1 ? '' : 's' }}</span>
              <span v-if="hasAnyTenantCategory('program')" class="casg-stat"><strong>{{ programAffiliationCount }}</strong> Program{{ programAffiliationCount === 1 ? '' : 's' }}</span>
              <span v-if="hasAnyTenantCategory('learning')" class="casg-stat"><strong>{{ learningAffiliationCount }}</strong> Learning</span>
              <span class="casg-stat"><strong>{{ serviceProviderCount }}</strong> Provider{{ serviceProviderCount === 1 ? '' : 's' }}</span>
            </div>
          </div>

          <div v-if="assignmentsError" class="error" style="text-align:left;">{{ assignmentsError }}</div>

          <div class="casg-grid">
            <section class="casg-card casg-tenant-hub">
              <header class="casg-card-head">
                <div>
                  <h4>Agency memberships</h4>
                  <p class="casg-card-hint">
                    Services, providers, and scheduling defaults for each agency.
                  </p>
                </div>
              </header>
              <div v-if="clientAgenciesNote" class="muted" style="margin-bottom: 10px;">{{ clientAgenciesNote }}</div>

              <div v-if="(tenantMemberships || []).length === 0" class="hint">No agency memberships found.</div>
              <div v-else class="casg-tenant-cards">
                <article
                  v-for="a in tenantMemberships"
                  :key="a.agency_id"
                  class="casg-tenant-card"
                  :class="{ 'casg-tenant-card--active': Number(a.agency_id) === Number(selectedAgencyId || client?.agency_id) }"
                >
                  <div class="casg-tenant-card__head">
                    <div class="casg-tenant-card__title-row">
                      <span class="casg-tenant-card__name">{{ a.agency_name || `Agency ${a.agency_id}` }}</span>
                      <span
                        class="casg-badge"
                        :class="Number(a.agency_id) === Number(selectedAgencyId || client?.agency_id) ? 'casg-badge--ok' : ''"
                      >
                        {{ Number(a.agency_id) === Number(selectedAgencyId || client?.agency_id) ? 'Active chart' : 'Member' }}
                      </span>
                      <span v-if="hasTenantCategory(a.agency_id, 'school')" class="casg-badge casg-badge--soft">Schools ({{ affiliationsForTenant(a.agency_id, 'school').length }})</span>
                      <span v-if="hasTenantCategory(a.agency_id, 'program')" class="casg-badge casg-badge--soft">Programs ({{ affiliationsForTenant(a.agency_id, 'program').length }})</span>
                      <span v-if="hasTenantCategory(a.agency_id, 'learning')" class="casg-badge casg-badge--soft">Learning ({{ affiliationsForTenant(a.agency_id, 'learning').length }})</span>
                    </div>
                    <div class="casg-tenant-card__actions">
                      <button
                        v-if="Number(a.agency_id) !== Number(selectedAgencyId || client?.agency_id)"
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="switchingAgency"
                        @click="selectedAgencyId = String(a.agency_id); onSwitchAgency(true)"
                      >
                        Use for chart
                      </button>
                      <button
                        v-if="Number(a.agency_id) !== Number(selectedAgencyId || client?.agency_id)"
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="switchingAgency"
                        :title="'Archive this agency membership'"
                        @click="archiveAgencyAffiliation(a.agency_id)"
                      >
                        Archive
                      </button>
                      <button
                        v-if="isSuperAdmin && Number(a.agency_id) !== Number(selectedAgencyId || client?.agency_id)"
                        type="button"
                        class="btn btn-danger btn-sm"
                        :disabled="switchingAgency"
                        title="Permanently remove agency membership (super admin)"
                        @click="removeAgencyAffiliationHard(a.agency_id)"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <ClientServiceEnrollments v-if="canManageServicesForTenant(a.agency_id) && !(providerAssignmentOpen && Number(a.agency_id) === Number(selectedAgencyId || client.agency_id))" :key="`${client.id}:${a.agency_id}`" :client-id="client.id" :agency-id="a.agency_id" :organizations="assignmentOrganizationsForTenant(a.agency_id)" @loaded="onAgencyServicesLoaded(a.agency_id, $event)" @updated="onAgencyServicesUpdated(a.agency_id, $event)" />

                  <div class="casg-tenant-section">
                    <h5 class="casg-tenant-section__title">Default office &amp; place of service</h5>
                    <p class="casg-card-hint" style="margin-bottom: 10px;">
                      Prefills scheduled sessions and billing claims for this agency.
                    </p>
                    <div v-if="tenantBookingDraftError(a.agency_id)" class="error" style="text-align:left; margin-bottom: 8px;">
                      {{ tenantBookingDraftError(a.agency_id) }}
                    </div>
                    <div class="casg-fields">
                      <label class="casg-field">
                        <span>Default office</span>
                        <select
                          class="filters-select"
                          :value="tenantBookingDraft(a.agency_id).officeId"
                          :disabled="savingTenantBookingAgencyId === Number(a.agency_id)"
                          @change="setTenantBookingDraft(a.agency_id, 'officeId', $event.target.value)"
                        >
                          <option value="">Not set</option>
                          <option
                            v-for="o in officeOptionsForTenant(a.agency_id)"
                            :key="`off-${a.agency_id}-${o.id}`"
                            :value="String(o.id)"
                          >
                            {{ o.name }}{{ o.street_address ? ` — ${o.street_address}` : '' }}
                          </option>
                        </select>
                      </label>
                      <label class="casg-field">
                        <span>Default place of service</span>
                        <select
                          class="filters-select"
                          :value="tenantBookingDraft(a.agency_id).pos"
                          :disabled="savingTenantBookingAgencyId === Number(a.agency_id)"
                          @change="setTenantBookingDraft(a.agency_id, 'pos', $event.target.value)"
                        >
                          <option value="">Not set</option>
                          <option v-for="p in PLACE_OF_SERVICE_OPTIONS" :key="`pos-${a.agency_id}-${p.code}`" :value="p.code">
                            {{ p.code }} — {{ p.label }}
                          </option>
                        </select>
                      </label>
                      <label class="casg-field">
                        <span>Default billing location</span>
                        <select
                          class="filters-select"
                          :value="tenantBookingDraft(a.agency_id).serviceLocationId"
                          :disabled="savingTenantBookingAgencyId === Number(a.agency_id)"
                          @change="setTenantBookingDraft(a.agency_id, 'serviceLocationId', $event.target.value)"
                        >
                          <option value="">Not set</option>
                          <option
                            v-for="loc in serviceLocationOptionsForTenant(a.agency_id)"
                            :key="`loc-${a.agency_id}-${loc.id}`"
                            :value="String(loc.id)"
                          >
                            {{ loc.displayLabel }}
                          </option>
                        </select>
                      </label>
                    </div>
                    <div class="casg-card-actions">
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="savingTenantBookingAgencyId === Number(a.agency_id) || !primaryServiceProviderForTenant(a.agency_id)"
                        @click="suggestDefaultsFromPrimaryProviderForTenant(a.agency_id)"
                      >
                        Use provider office
                      </button>
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        :disabled="savingTenantBookingAgencyId === Number(a.agency_id)"
                        @click="saveTenantBookingDefaults(a.agency_id)"
                      >
                        {{ savingTenantBookingAgencyId === Number(a.agency_id) ? 'Saving…' : 'Save defaults' }}
                      </button>
                      <span v-if="tenantBookingDraftHint(a.agency_id)" class="hint">{{ tenantBookingDraftHint(a.agency_id) }}</span>
                    </div>
                  </div>

                  <div v-if="hasTenantCategory(a.agency_id, 'school')" class="casg-tenant-section">
                    <h5 class="casg-tenant-section__title">Schools</h5>
                    <div v-if="affiliationsLoading" class="loading">Loading…</div>
                    <div v-else>
                      <div v-if="affiliationsForTenant(a.agency_id, 'school').length === 0" class="hint">No schools linked for this agency.</div>
                      <ul v-else class="casg-affil-list">
                        <li v-for="row in affiliationsForTenant(a.agency_id, 'school')" :key="`sch-${row.organization_id}`">
                          <div>
                            <strong>{{ chartOrganizationLabel(row.organization_name, row.organization_type) }}</strong>
                            <span v-if="row.is_primary" class="casg-badge casg-badge--ok" style="margin-left: 6px;">Primary</span>
                          </div>
                          <div class="casg-affil-actions">
                            <button
                              v-if="!row.is_primary"
                              type="button"
                              class="btn btn-secondary btn-sm"
                              :disabled="savingAffiliation"
                              @click="setPrimaryAffiliation(row.organization_id)"
                            >
                              Set primary
                            </button>
                            <button
                              v-if="!row.is_primary"
                              type="button"
                              class="btn btn-danger btn-sm"
                              :disabled="savingAffiliation"
                              @click="removeAffiliation(row.organization_id)"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      </ul>
                      <div class="casg-add-row">
                        <div style="min-width: 240px; flex: 1;">
                          <label class="filters-label">Add school</label>
                          <select
                            class="filters-select"
                            :value="tenantAddDraft(a.agency_id, 'school')"
                            @change="setTenantAddDraft(a.agency_id, 'school', $event.target.value)"
                          >
                            <option value="">Select…</option>
                            <option
                              v-for="o in availableOrgsForTenant(a.agency_id, 'school')"
                              :key="`add-sch-${o.id}`"
                              :value="String(o.id)"
                            >
                              {{ o.name }}
                            </option>
                          </select>
                        </div>
                        <label class="checkbox-label">
                          <input
                            type="checkbox"
                            :checked="!!tenantAddMakePrimary(a.agency_id, 'school')"
                            @change="setTenantAddMakePrimary(a.agency_id, 'school', $event.target.checked)"
                          />
                          Make primary
                        </label>
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          :disabled="savingAffiliation || !tenantAddDraft(a.agency_id, 'school')"
                          @click="addAffiliationForTenant(a.agency_id, 'school')"
                        >
                          Add school
                        </button>
                      </div>
                    </div>
                  </div>

                  <div v-if="hasTenantCategory(a.agency_id, 'program')" class="casg-tenant-section">
                    <h5 class="casg-tenant-section__title">Programs</h5>
                    <p class="casg-card-hint" style="margin-bottom: 8px;">
                      Current program enrollments for this agency.
                    </p>
                    <div v-if="affiliationsLoading" class="loading">Loading…</div>
                    <div v-else>
                      <div v-if="affiliationsForTenant(a.agency_id, 'program').length === 0" class="hint">No program enrollments. This client can receive agency services without a program.</div>
                      <ul v-else class="casg-affil-list">
                        <li v-for="row in affiliationsForTenant(a.agency_id, 'program')" :key="`prog-${row.organization_id}`">
                          <div>
                            <strong>{{ chartOrganizationLabel(row.organization_name, row.organization_type) }}</strong>
                            <span class="casg-badge" style="margin-left: 6px;">{{ affiliationDisplayType(row) }}</span>
                            <span v-if="row.is_primary" class="casg-badge casg-badge--ok" style="margin-left: 6px;">Primary</span>
                          </div>
                          <div class="casg-affil-actions">
                            <button
                              v-if="!row.is_primary"
                              type="button"
                              class="btn btn-secondary btn-sm"
                              :disabled="savingAffiliation"
                              @click="setPrimaryAffiliation(row.organization_id)"
                            >
                              Set primary
                            </button>
                            <button
                              v-if="!row.is_primary"
                              type="button"
                              class="btn btn-danger btn-sm"
                              :disabled="savingAffiliation"
                              @click="removeAffiliation(row.organization_id)"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      </ul>
                      <div class="casg-add-row">
                        <div style="min-width: 240px; flex: 1;">
                          <label class="filters-label">Add program</label>
                          <select
                            class="filters-select"
                            :value="tenantAddDraft(a.agency_id, 'program')"
                            @change="setTenantAddDraft(a.agency_id, 'program', $event.target.value)"
                          >
                            <option value="">Select…</option>
                            <option
                              v-for="o in availableOrgsForTenant(a.agency_id, 'program')"
                              :key="`add-prog-${o.id}`"
                              :value="String(o.id)"
                            >
                              {{ o.name }}
                            </option>
                          </select>
                        </div>
                        <label class="checkbox-label">
                          <input
                            type="checkbox"
                            :checked="!!tenantAddMakePrimary(a.agency_id, 'program')"
                            @change="setTenantAddMakePrimary(a.agency_id, 'program', $event.target.checked)"
                          />
                          Make primary
                        </label>
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          :disabled="savingAffiliation || !tenantAddDraft(a.agency_id, 'program')"
                          @click="addAffiliationForTenant(a.agency_id, 'program')"
                        >
                          Add program
                        </button>
                      </div>
                    </div>
                  </div>

                  <div v-if="hasTenantCategory(a.agency_id, 'learning')" class="casg-tenant-section">
                    <h5 class="casg-tenant-section__title">Learning</h5>
                    <div v-if="affiliationsLoading" class="loading">Loading…</div>
                    <div v-else>
                      <div v-if="affiliationsForTenant(a.agency_id, 'learning').length === 0" class="hint">No learning orgs linked for this agency.</div>
                      <ul v-else class="casg-affil-list">
                        <li v-for="row in affiliationsForTenant(a.agency_id, 'learning')" :key="`lrn-${row.organization_id}`">
                          <div>
                            <strong>{{ chartOrganizationLabel(row.organization_name, row.organization_type) }}</strong>
                            <span v-if="row.is_primary" class="casg-badge casg-badge--ok" style="margin-left: 6px;">Primary</span>
                          </div>
                          <div class="casg-affil-actions">
                            <button
                              v-if="!row.is_primary"
                              type="button"
                              class="btn btn-secondary btn-sm"
                              :disabled="savingAffiliation"
                              @click="setPrimaryAffiliation(row.organization_id)"
                            >
                              Set primary
                            </button>
                            <button
                              v-if="!row.is_primary"
                              type="button"
                              class="btn btn-danger btn-sm"
                              :disabled="savingAffiliation"
                              @click="removeAffiliation(row.organization_id)"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      </ul>
                      <div class="casg-add-row">
                        <div style="min-width: 240px; flex: 1;">
                          <label class="filters-label">Add learning</label>
                          <select
                            class="filters-select"
                            :value="tenantAddDraft(a.agency_id, 'learning')"
                            @change="setTenantAddDraft(a.agency_id, 'learning', $event.target.value)"
                          >
                            <option value="">Select…</option>
                            <option
                              v-for="o in availableOrgsForTenant(a.agency_id, 'learning')"
                              :key="`add-lrn-${o.id}`"
                              :value="String(o.id)"
                            >
                              {{ o.name }}
                            </option>
                          </select>
                        </div>
                        <label class="checkbox-label">
                          <input
                            type="checkbox"
                            :checked="!!tenantAddMakePrimary(a.agency_id, 'learning')"
                            @change="setTenantAddMakePrimary(a.agency_id, 'learning', $event.target.checked)"
                          />
                          Make primary
                        </label>
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          :disabled="savingAffiliation || !tenantAddDraft(a.agency_id, 'learning')"
                          @click="addAffiliationForTenant(a.agency_id, 'learning')"
                        >
                          Add learning
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              </div>

              <ProgramParticipation :client-id="Number(client.id)" :agency-id="activeChartAgencyId" :refresh-key="programHistoryRevision" />
              <div class="casg-add-row" style="margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 14px;">
                <div style="min-width: 280px; flex: 1;">
                  <label class="filters-label">Add agency membership</label>
                  <select v-model="addAgencyAffiliationId" class="filters-select">
                    <option value="">Select agency…</option>
                    <option v-for="opt in addableAgencyOptions" :key="opt.id" :value="String(opt.id)">{{ opt.name }}</option>
                  </select>
                </div>
                <label class="checkbox-label" style="min-width: 200px;">
                  <input v-model="addAgencyMakePrimary" type="checkbox" />
                  Use for chart after add
                </label>
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="switchingAgency || !addAgencyAffiliationId"
                  @click="addAgencyAffiliation"
                >
                  Add agency
                </button>
              </div>

              <div v-if="orphanAffiliations.length" class="casg-tenant-section" style="margin-top: 16px;">
                <h5 class="casg-tenant-section__title">Other affiliations</h5>
                <p class="casg-card-hint" style="margin-bottom: 8px;">
                  Linked orgs that are not currently affiliated under an agency membership above.
                </p>
                <ul class="casg-affil-list">
                  <li v-for="row in orphanAffiliations" :key="`orphan-${row.organization_id}`">
                    <div>
                      <strong>{{ chartOrganizationLabel(row.organization_name, row.organization_type) }}</strong>
                      <span class="casg-badge" style="margin-left: 6px;">{{ affiliationDisplayType(row) }}</span>
                      <span v-if="row.is_primary" class="casg-badge casg-badge--ok" style="margin-left: 6px;">Primary</span>
                    </div>
                    <div class="casg-affil-actions">
                      <button
                        v-if="!row.is_primary"
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="savingAffiliation"
                        @click="setPrimaryAffiliation(row.organization_id)"
                      >
                        Set primary
                      </button>
                      <button
                        v-if="!row.is_primary"
                        type="button"
                        class="btn btn-danger btn-sm"
                        :disabled="savingAffiliation"
                        @click="removeAffiliation(row.organization_id)"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                </ul>
              </div>
            </section>

            <section v-if="rosterAffiliations.length" class="casg-card">
              <header class="casg-card-head">
                <div>
                  <h4>School &amp; program roster</h4>
                  <p class="casg-card-hint">Manage the provider and day for each school or program roster here. Service providers are shown above.</p>
                </div>
              </header>
              <div style="display:flex; gap: 10px; flex-wrap: wrap; align-items:end; margin-bottom: 12px;">
                <div style="min-width: 280px; flex: 1;">
                  <label class="filters-label">Affiliation</label>
                  <select v-model="selectedAssignmentOrgId" class="filters-select">
                    <option value="">Select…</option>
                    <option v-for="a in rosterAffiliations" :key="a.organization_id" :value="String(a.organization_id)">
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
                          <ProviderSearchSelect v-model="editProviderUserId" :options="searchableProviderOptions" label="Provider for this affiliation" :disabled="savingProviderAssignment" />
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
                          <textarea
                            v-model="editProviderClientAlert"
                            rows="2"
                            maxlength="2000"
                            class="filters-select"
                            style="display:block; width:min(320px, 70vw); margin-top:8px; margin-left:auto;"
                            placeholder="Client Alert for the person receiving this client (optional)"
                            aria-label="Client Alert for this provider assignment"
                          />
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
                    <ProviderSearchSelect v-model="addProviderUserId" :options="searchableProviderOptions" label="Assign a provider for this affiliation" :disabled="savingProviderAssignment" />
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
                  <div class="filters-group" style="min-width: 280px; flex: 1 1 100%;">
                    <label class="filters-label" for="add-provider-client-alert">Client Alert <span class="hint">(optional, for the person receiving this client)</span></label>
                    <textarea
                      id="add-provider-client-alert"
                      v-model="addProviderClientAlert"
                      class="filters-select"
                      rows="3"
                      maxlength="2000"
                      placeholder="Example: no contact info, please inquire with the referral contact for contact info."
                    />
                  </div>
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
            </section>

            <section class="casg-card">
              <header class="casg-card-head">
                <div>
                  <h4>Event assignments</h4>
                  <p class="casg-card-hint">Event enrollments and group assignments by timeline.</p>
                </div>
              </header>
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
            </section>

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
        <div v-if="showPanel('school-roi')" class="detail-section">
          <ClientSchoolRoiAccessTab
            :client="props.client"
            @updated="refreshClient"
          />
        </div>

        <div v-if="showPanel('lifecycle')" class="detail-section">
          <ClientCareTimeline
            :client-id="client.id"
            :client="client"
            title="Lifecycle"
            hint="School fall/spring activity and office care milestones."
            @view-event="openLifecycleHistoryEvent"
          />
        </div>

        <div v-if="showPanel('intake-note')" class="detail-section">
          <ClientIntakeNotePanel
            :client-id="client.id"
            :client="client"
            :assigned-provider="Boolean(primaryProviderLabel && primaryProviderLabel !== 'Not assigned' && primaryProviderLabel !== '—')"
            :phi-banner="['admin', 'super_admin', 'support', 'staff'].includes(roleNorm)"
            @review-updated="loadCareSummary"
            @navigate="goChartSub"
          />
          <div class="cdp-intake-note-actions" style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="cdp-btn-soft" @click="goChartSub('notes')">
              Back to Notes list
            </button>
          </div>
        </div>

        <div v-if="showPanel('treatment-plans')" class="detail-section">
          <ClientTreatmentPlansPanel
            :client-id="client.id"
            :agency-id="selectedAgencyId || client.agency_id"
            :client-type="showClinicalChartSurfaces ? 'clinical' : effectiveClientType"
            :client="client"
            @navigate="goChartSub"
            @updated="loadCareSummary"
          />
        </div>

        <div v-if="showPanel('learning-plans')" class="detail-section">
          <ClientLearningOsPanel
            :client-id="client.id"
            :agency-id="selectedAgencyId || client.agency_id"
          />
        </div>

        <div v-if="showPanel('authorizations')" class="detail-section">
          <ClientAuthorizationsPanel
            :client-id="Number(client.id)"
            :client="client"
            @open-document="openChartDocument"
          />
        </div>

        <!-- Documentation Tab -->
        <ClientDocumentsTab :key="`documents-${client.id}`"
          v-if="showPanel('phi')"
          ref="documentsTabRef"
          :client-id="Number(client.id)"
          :client="client"
          :can-edit-paperwork="canEditPaperwork"
          :highlight-document-id="initialDocumentId"
          :pending-view-key="pendingChartViewKey"
          :open-paper-packet="openPaperPacket"
          @opened-view-key="pendingChartViewKey = ''"
          @client-actions="openClientActions"
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
            @click="goChartSub('account'); startEditOverview(true)"
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
      <ClientAlertDialog :client-id="client?.id" />
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

      <div v-if="clientActionsOpen && canEditPaperwork && client?.id" class="modal-overlay client-actions-overlay" @click.self="clientActionsOpen = false">
        <div class="client-actions-dialog" role="dialog" aria-modal="true" aria-label="Client actions">
          <ClientOnboardingChecklistPanel
            :key="client.id"
            :client-id="client.id"
            :client-label="client.full_name || client.initials || 'Client'"
            :client-meta="client"
            :can-edit-docs="canEditPaperwork"
            :initial-paper-action="clientActionsInitialAction"
            as-modal
            @close="clientActionsOpen = false"
            @updated="emit('updated', client)"
          />
        </div>
      </div>

      <AssignDayModal
        v-if="showAssignDayModal && schoolOrganizationId && client?.id"
        :organization-id="schoolOrganizationId"
        :client="client"
        :provider-user-id="assignDayProviderUserId"
        @close="showAssignDayModal = false"
        @updated="onSchoolAssignmentUpdated"
      />

      <LifecycleActionModal
        v-if="lifecycleHistoryModal.client && lifecycleHistoryModal.actionKey"
        :client="lifecycleHistoryModal.client"
        :action-key="lifecycleHistoryModal.actionKey"
        :action-label="lifecycleHistoryModal.label"
        :view-only="true"
        :school-year="lifecycleHistoryModal.schoolYear"
        @close="closeLifecycleHistoryModal"
      />
      <QuickChecklistModal
        v-if="lifecycleHistoryChecklistClient"
        :client="lifecycleHistoryChecklistClient"
        :view-only="true"
        @close="lifecycleHistoryChecklistClient = null"
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
import {serviceSettingName} from '../../utils/serviceLocationDisplay.js';
import ClientDisclosurePanel from './clientChart/ClientDisclosurePanel.vue';
import { guardianPortalStatus } from '../../utils/guardianPortalStatus.js';
import { useAgencyMemberships } from '../../composables/useAgencyMemberships.js';
import ClientBillingAccountSettings from '../billing/ClientBillingAccountSettings.vue';
import ClientOperationalStatus from '../clients/ClientOperationalStatus.vue';
import ClientPortalOverview from '../clients/ClientPortalOverview.vue';
import DependentPortalSharing from './DependentPortalSharing.vue';
import ClientServiceEnrollments from './ClientServiceEnrollments.vue';
import ClientContactEmail from '../clients/ClientContactEmail.vue';
import { resolveClientEmail, composeClientEmail } from '../../utils/clientEmailComposer';
import ClientTypeEditor from './clientChart/ClientTypeEditor.vue';
import { useClientChartTypes } from '../../composables/useClientChartTypes';
import { meaningfulProgram, chartOrganizationLabel } from '../../utils/clientRosterContext.js';
import ClientFeedbackTrends from '../kiosk/ClientFeedbackTrends.vue';
import ClientReferralLinks from '../clients/ClientReferralLinks.vue';
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, provide, defineAsyncComponent } from 'vue';
const ClientOnboardingChecklistPanel = defineAsyncComponent(() => import('../clients/ClientOnboardingChecklistPanel.vue'));
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import ProgramParticipation from '../ProgramParticipation.vue';
import api from '../../services/api';
import { openEnrollmentReceipt, openOperationalDocument } from '../../utils/openEnrollmentReceipt.js';
import { canAccessMedicalBilling, canAccessClientAccountSupport } from '../../config/medicalBillingAccess';
import ClientPendingTasks from '../billing/ClientPendingTasks.vue';
import {isPaperPacketClient} from '../../utils/paperPacketClient.js';
import ClientInsuranceEditor from '../billing/ClientInsuranceEditor.vue';
import ClientCareCoverageSummary from '../billing/ClientCareCoverageSummary.vue';
import ClientPaymentFollowup from '../billing/ClientPaymentFollowup.vue';
import ClientAccountSupport from '../billing/ClientAccountSupport.vue';
import ClientSchoolRoiAccessTab from './ClientSchoolRoiAccessTab.vue';
import ClientRenewalPushModal from './ClientRenewalPushModal.vue';
import ClientUpdateModal from './ClientUpdateModal.vue';
import ClientCommunicationsTab from './ClientCommunicationsTab.vue';
import GuardianBillingTab from '../guardian/GuardianBillingTab.vue';
import GuardianDemographicReview from './GuardianDemographicReview.vue';
import ClientGuardianContactEditor from './ClientGuardianContactEditor.vue';
import ClientReminderTextConsent from './ClientReminderTextConsent.vue';
import ClientPortalInviteDialog from '../clients/ClientPortalInviteDialog.vue';
import ClientPersonalPortalInvite from '../clients/ClientPersonalPortalInvite.vue';
import PractitionerClientPackagesTab from './PractitionerClientPackagesTab.vue';
import ClientAssessmentsTab from './ClientAssessmentsTab.vue';
import ClientMedicalRecordsTab from './ClientMedicalRecordsTab.vue';
import ClientBillingImportTab from './ClientBillingImportTab.vue';
import ClientChartShell from './clientChart/ClientChartShell.vue';
import ClientOverviewHub from './clientChart/ClientOverviewHub.vue';
import ClientRecordsUpdateLauncher from './clientChart/ClientRecordsUpdateLauncher.vue';
import ClientStatusEditor from './clientChart/ClientStatusEditor.vue';
import ClientQuickActions from './clientChart/ClientQuickActions.vue';
import ClientFollowUpTask from '../clients/ClientFollowUpTask.vue';
import ProviderSearchSelect from '../clients/ProviderSearchSelect.vue';
import { clientProfileActions } from '../../utils/clientProfileActions.js';
import ClientUpdateAssignments from './clientChart/ClientUpdateAssignments.vue';
import ClientSchedulePanel from './clientChart/ClientSchedulePanel.vue';
import ClientEhrBringUpToDatePanel from './clientChart/ClientEhrBringUpToDatePanel.vue';
import { formatAuditTimestamp, formatDate as formatCalendarDate } from '../../utils/formatDate';
import ClientTerminationSummary from './ClientTerminationSummary.vue';
import EnrollmentPreferencesSummary from './clientChart/EnrollmentPreferencesSummary.vue';
import ClientClinicalTab from './clientChart/ClientClinicalTab.vue';
import ClientClinicalNotesFeed from './clientChart/ClientClinicalNotesFeed.vue';
import ClientDocumentsTab from './clientChart/ClientDocumentsTab.vue';
import ClientMessagesTab from './clientChart/ClientMessagesTab.vue';
import ClientAlertDialog from '../clients/ClientAlertDialog.vue';
import { canSeeClientMessagesWindow } from '../../utils/clientAlertAccess';
import { useClientEncounters } from '../../composables/useClientEncounters.js';
import { useClientBillingDiagnoses } from '../../composables/useClientBillingDiagnoses.js';
import { useClientPaperwork } from '../../composables/useClientPaperwork.js';
import { isPractitionerOrgType } from '../../utils/practitionerVertical';
import { serviceLocationForOffice,billingServiceLocationOptions } from '../../utils/officeBillingDefaults';
import { toPlainEnglish } from '../../utils/auditActionRegistry.js';
import ClientSkillBuildersProgramTab from '../skillBuilders/ClientSkillBuildersProgramTab.vue';
import ClientAffiliatedContactsPanel from '../client/ClientAffiliatedContactsPanel.vue';
import { isSkillsClientFlag } from '../../utils/skillsClientFlag.js';
import {
  formatGradeDisplay,
  gradeSelectOptionsForModel,
  normalizeGradeForSave,
  normalizeGradeToStandard
} from '../../utils/clientGrade.js';
import { assignedDayDisplay } from '../../utils/schoolClientStatusDisplay.js';
import { isContinuationServicesSeason, isReturningSchoolClient } from '../../utils/clientOnboardingSummary.js';
import { schoolRoiSimpleStatus } from '../../utils/clientManagementVisuals.js';
import AssignDayModal from '../school/AssignDayModal.vue';
import SchoolClientAssignmentInline from '../school/SchoolClientAssignmentInline.vue';
import PostListingModal from '../clientExchange/PostListingModal.vue';
import { canSeeClientExchangeNav } from '../../utils/clientExchangeNav.js';
import { useClientDisplayMode } from '../../composables/useClientDisplayMode.js';
import ClientLifecycleHistoryPanel from '../admin/ClientLifecycleHistoryPanel.vue';
import LifecycleActionModal from '../school/LifecycleActionModal.vue';
import QuickChecklistModal from '../school/QuickChecklistModal.vue';
import {
  resolveChartTab,
  accountSubnav,
  lifecycleSubnav,
  recordsSubnav,
  panelVisible,
  chartNavTarget,
  LEGACY_TAB_ALIASES,
  RECORDS_SECONDARY_SUBS
} from '../../utils/clientChartHubs.js';
import ClientCareTimeline from './clientChart/ClientCareTimeline.vue';
import ClientIntakeNotePanel from './clientChart/ClientIntakeNotePanel.vue';
import ClientRecordsOverview from './clientChart/ClientRecordsOverview.vue';
import ClientExchangeFitEditor from '../clientExchange/ClientExchangeFitEditor.vue';
import ClientExchangeSummary from '../clientExchange/ClientExchangeSummary.vue';
import ClientTreatmentPlansPanel from './clientChart/ClientTreatmentPlansPanel.vue';
import ClientLearningOsPanel from './clientChart/ClientLearningOsPanel.vue';
import ClientAuthorizationsPanel from './clientChart/ClientAuthorizationsPanel.vue';
import { intakeContactIsSelf } from '../../utils/intakeContactRole.js';
import { linkedGuardianSummary } from '../../utils/linkedGuardianSummary.js';
import {useLinkedGuardianContact} from '../../composables/useLinkedGuardianContact.js';
import {guardianAccountPath} from '../../utils/guardianDirectory.js';
import ClientHeaderSummary from '../dashboard/ClientHeaderSummary.vue';

const props = defineProps({
  overviewSnapshot: {type:Object,default:null},
  returnLabel: { type: String, default: '' },
  client: {
    type: Object,
    required: true
  },
  initialTab: {
    type: String,
    default: ''
  },
  openPaperPacket: { type: Boolean, default: false },
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

const clinicalWorkspaceMode = ref('clinical');
function changeClinicalWorkspaceMode(mode) {
  // Keep the current pane mounted so switching the shell never discards an edit.
  clinicalWorkspaceMode.value = mode;
}
watch(() => props.client?.id, () => { clinicalWorkspaceMode.value = 'clinical'; });
const activeTab = ref('overview');
const hubSub = ref('');
const headerCollapsed = ref(false);
const pendingChartViewKey = ref('');
const documentsTabRef = ref(null);
const portalOverviewRef = ref(null);
const medicalRecordsRef = ref(null);
const clinicalNotesFeedRef = ref(null);
const chartHub = computed(() => resolveChartTab(activeTab.value).hub);
const chartSubnav = computed(() => {
  const hub = chartHub.value;
  if (hub === 'account') {
    return accountSubnav({
      isSchool: isSchoolClientType.value,
      canEditAccount: canEditAccount.value,
      canViewBilling: canViewClientBillingImport.value
    }).filter(item => item.id !== 'guardians' || showDependentFields.value);
  }
  if (hub === 'lifecycle') {
    return lifecycleSubnav({ isSchool: isSchoolClientType.value });
  }
  if (hub === 'records') {
    const clinicalRoleOk = [
      'provider',
      'provider_plus',
      'admin',
      'super_admin',
      'staff',
      'supervisor',
      'clinical_practice_assistant',
      'intern',
      'intern_plus'
    ].includes(roleNorm.value);
    if (roleNorm.value === 'support') {
      const items = [{ id: 'overview', label: 'Status' }];
      if (canViewClientBillingImport.value) items.push({ id: 'billing', label: 'Billing & claims' });
      items.push({ id: 'audit', label: 'Access log' });
      return items;
    }
    return recordsSubnav({
      canViewClinical: isClinicalLikeClientType.value && clinicalRoleOk,
      canViewMedicalRecord: canViewMedicalRecord.value,
      canViewBilling: (canViewClientBillingImport.value || learningBillingEnabledForClient.value)
        && !['provider', 'provider_plus'].includes(roleNorm.value),
      showLearningSurfaces: showLearningChartSurfaces.value,
      // School staff never get clinical chart surfaces even on School clients.
      showClinicalSurfaces: showClinicalChartSurfaces.value && clinicalRoleOk,
      isLearningBilling: learningBillingEnabledForClient.value && showLearningChartSurfaces.value
    });
  }
  if (hub === 'messages') {
    const items = [{ id: 'communications', label: 'Communications' }];
    if (!['school_staff', 'client_guardian', 'client'].includes(roleNorm.value)) {
      items.push({ id: 'messages', label: 'Contact documentation' });
    }
    return items;
  }
  if (hub === 'overview' && isSchoolClientType.value && isSkillsClientFlag(props.client?.skills)) {
    return [
      { id: 'home', label: 'At a glance' },
      { id: 'skill-builders', label: 'Events / groups' }
    ];
  }
  return [];
});
const SUPPORT_HIDDEN_PANELS = ['clinical-notes', 'clinical', 'medical-record', 'intake-note', 'treatment-plans', 'phi', 'surveys'];
const effectiveHubSub = computed(() => {
  const hub = chartHub.value;
  const navIds = new Set((chartSubnav.value || []).map((s) => s.id));
  const sub = String(hubSub.value || '').trim();
  // Overview must ignore leftover Account/Records subs so shells never stack.
  if (hub === 'overview') {
    if (sub === 'skill-builders' || sub === 'home') return sub;
    return navIds.has('home') ? 'home' : '';
  }
  const secondaryOk = (id) => hub === 'records' && RECORDS_SECONDARY_SUBS.includes(id)
    && !(roleNorm.value === 'support' && SUPPORT_HIDDEN_PANELS.includes(id));
  if (sub && (navIds.has(sub) || secondaryOk(sub))) {
    return sub;
  }
  const fromTab = resolveChartTab(activeTab.value).sub;
  if (fromTab && (navIds.has(fromTab) || secondaryOk(fromTab))) {
    return fromTab;
  }
  if (hub === 'account') return 'profile';
  if (hub === 'lifecycle') return 'timeline';
  if (hub === 'records') return 'overview';
  if (hub === 'messages') return 'communications';
  return '';
});
function showPanel(legacyId) {
  if (roleNorm.value === 'support' && SUPPORT_HIDDEN_PANELS.includes(legacyId)) return false;
  return panelVisible(legacyId, chartHub.value, effectiveHubSub.value);
}
function setChartNav(hubId, subId = '') {
  const hub = String(hubId || 'overview');
  let sub = String(subId || '').trim();
  if (hub === 'overview' && !sub && isSchoolClientType.value && isSkillsClientFlag(props.client?.skills)) {
    sub = 'home';
  }
  if (hub === 'records' && sub === 'billing' && canViewClientBillingImport.value) {
    activeTab.value = 'client-billing';
    hubSub.value = 'billing';
    return;
  }
  const target = chartNavTarget(hub, sub);
  activeTab.value = target.activeTab;
  hubSub.value = target.hubSub;
}
async function onHubChange(hubId) {
  if(hubId!==chartHub.value&&await saveClientWorkspaceDrafts()===false)return;
  if (hubId !== 'overview') clinicalWorkspaceMode.value = 'clinical';
  setChartNav(hubId, '');
}
async function onHubSubChange(subId) {
  if(await saveClientWorkspaceDrafts()===false)return;
  setChartNav(chartHub.value, subId);
}

async function goChartSub(subOrLegacy) {
  if(await saveClientWorkspaceDrafts()===false)return;
  const key = String(subOrLegacy || '');
  if (LEGACY_TAB_ALIASES[key]) {
    const resolved = resolveChartTab(key);
    // Re-clicking Notes while a note is open returns to the notes list.
    if (
      (key === 'notes' || key === 'clinical-notes')
      && (activeTab.value === 'clinical-notes' || resolved.sub === 'notes')
      && clinicalNotesFeedRef.value?.isWorkspaceOpen?.()
    ) {
      clinicalNotesFeedRef.value.closeWorkspace?.();
      return;
    }
    setChartNav(resolved.hub, resolved.sub || '');
    // Preserve precise legacy tab when secondary surfaces share a hub sub,
    // or when the subnav id differs from the panel legacy id (notes → clinical-notes).
    const preserveActiveTab = RECORDS_SECONDARY_SUBS.includes(resolved.sub)
      || key === 'phi'
      || key === 'documents'
      || key === 'intake-note'
      || key === 'medical-record'
      || key === 'clinical-notes'
      || key === 'clinical'
      || key === 'clinical-summary'
      || key === 'student-summary'
      || key === 'learning-plans'
      || key === 'notes';
    if (preserveActiveTab) {
      if (key === 'documents') activeTab.value = 'phi';
      else if (key === 'notes') activeTab.value = 'clinical-notes';
      else if (key === 'clinical-summary') activeTab.value = 'clinical';
      else activeTab.value = key;
      hubSub.value = resolved.sub || '';
    }
    return;
  }
  setChartNav(chartHub.value, key);
}

const chartReceiptError = ref('');
const chartReceiptFallbackUrl = ref('');
async function openChartDocument(viewKey) {
  const key = String(viewKey || '').trim();
  // Support cannot open the Documents tab, so receipts open directly from Records.
  if (key.startsWith('school-file-') || key.startsWith('receipt-') || /^signed-roi-\d+$/.test(key) || /^paper-\d+$/.test(key)) {
    chartReceiptError.value = '';
    chartReceiptFallbackUrl.value = '';
    const result = key.startsWith('school-file-') ? await openOperationalDocument(`/phi-documents/school-attachments/${Number(key.slice(12))}/view`) : key.startsWith('receipt-') ? await openEnrollmentReceipt(key.slice(8))
      : await openOperationalDocument(key.startsWith('signed-roi-')
        ? `/clients/${Number(props.client?.id)}/school-roi-documents/${Number(key.slice(11))}/view`
        : `/clients/${Number(props.client?.id)}/paper-packet-processing/documents/${Number(key.slice(6))}/view`);
    if (!result.ok) {
      chartReceiptError.value = result.error;
      chartReceiptFallbackUrl.value = result.fallbackUrl || '';
    }
    return;
  }
  pendingChartViewKey.value = key;
  setChartNav('records', 'documents');
  if (key) {
    queueMicrotask(() => {
      documentsTabRef.value?.openGalleryArtifact?.(key);
    });
  }
}
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
const canSeeClientMessages = computed(() => canSeeClientMessagesWindow(roleNorm.value));
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
const isSelfIntakeContact = computed(() => intakeContactIsSelf(props.client, guardians.value || []));
function guardianPhone(row) {
  if(row.phone)return String(row.phone);
  const email=String(guardianIntakeProfile.value?.email||'').trim().toLowerCase();
  return email && String(row.email||'').trim().toLowerCase()===email ? String(guardianIntakeProfile.value?.phone||'') : '';
}
function guardianRowIsSelf(row) {
  if (String(row?.relationship_type || '').trim().toLowerCase() === 'self') return true;
  if (!isSelfIntakeContact.value) return false;
  const email = String(row?.email || '').trim().toLowerCase();
  const profileEmail = String(guardianIntakeProfile.value?.email || '').trim().toLowerCase();
  if (email && email === profileEmail) return true;
  const rowName = `${row?.first_name || ''} ${row?.last_name || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
  return !!rowName && rowName === String(props.client?.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
const intakeContactLabel = computed(() => isSelfIntakeContact.value ? 'Client (self)' : 'Guardian');
const overviewGuardianAccount = computed(() => {
  const contacts=(guardians.value||[]).filter(g=>!guardianRowIsSelf(g) && !g.permissions_json?.relationshipRevoked);
  const email=String(guardianIntakeProfile.value?.email||'').trim().toLowerCase();
  return email ? contacts.find(g=>String(g.email||'').trim().toLowerCase()===email) || null : (contacts.length===1?contacts[0]:null);
});
const overviewGuardianContactProfile=computed(()=>overviewGuardianAccount.value ? {firstName:overviewGuardianAccount.value.first_name,lastName:overviewGuardianAccount.value.last_name,
 email:overviewGuardianAccount.value.email,phone:overviewGuardianAccount.value.phone || guardianIntakeProfile.value?.phone || '',relationship:overviewGuardianAccount.value.relationship_title} : guardianIntakeProfile.value);
const onGuardianContactSaved = async (profile) => {
  if(overviewGuardianAccount.value){await fetchGuardians();emit('updated',{keepOpen:true});return;}

  emit('updated', { keepOpen: true, client: { ...props.client, guardian_intake_profile: profile } });
};
const guardianIntakeName = computed(() => String(
  guardianIntakeProfile.value?.fullName
  || `${guardianIntakeProfile.value?.firstName || ''} ${guardianIntakeProfile.value?.lastName || ''}`
  || ''
).trim() || null);
const guardianIntakeEmail = computed(() => String(guardianIntakeProfile.value?.email || '').trim() || null);
const guardianIntakePhone = computed(() => String(guardianIntakeProfile.value?.phone || '').trim() || null);
const guardianIntakeRelationship = computed(() => isSelfIntakeContact.value ? 'Self' : String(guardianIntakeProfile.value?.relationship || '').trim() || null);
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
// Support staff and CPAs terminate from this panel; assigned providers also use roster Terminate.
const canTerminate = computed(() => {
  if (!hasAgencyAccess.value) return false;
  if (isClientTerminated.value) return false;
  const r = roleNorm.value;
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant'].includes(r);
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
const skillsValue = ref(false);
const editingOverview = ref(false);
const clientRenewalModalOpen = ref(false);
const clientActionsOpen = ref(false);
const clientActionsInitialAction = ref('');
function openClientActions(action = '') { clientActionsInitialAction.value = typeof action === 'string' ? action : ''; clientActionsOpen.value = true; }
const clientUpdateModalOpen = ref(false);
const clientDisclosureStatus = ref('');

const clientRenewalAgencyLabel = computed(() => {
  const agencyId = Number(props.client?.agency_id || selectedAgencyId.value || 0);
  const fromSwitchable = (switchableAgencies.value || []).find((a) => Number(a.id) === agencyId);
  if (fromSwitchable?.name) return fromSwitchable.name;
  const fromMine = (myAgencies.value || []).find((a) => Number(a.id) === agencyId);
  if (fromMine?.name) return fromMine.name;
  return 'ITSCO';
});

function onClientRenewalSent() {
  // keep modal open briefly so success message is visible
}

async function loadClientDisclosureStatus() {
  const id = Number(props.client?.id || 0);
  if (!id) {
    clientDisclosureStatus.value = '';
    return;
  }
  try {
    const res = await api.get(`/clients/${id}/disclosure`, { skipGlobalLoading: true });
    clientDisclosureStatus.value = String(res.data?.status || res.data?.disclosure?.status || '');
  } catch {
    clientDisclosureStatus.value = '';
  }
}
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
      api.get(`/agencies/${agencyId}/affiliated-organizations`, { skipGlobalLoading: true }),
      api.get('/client-settings/client-statuses', { params: { agencyId }, skipGlobalLoading: true }),
      api.get('/client-settings/insurance-types', { params: { agencyId }, skipGlobalLoading: true })
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

const primaryAgencyDisplayName = computed(() => {
  const activeId = Number(selectedAgencyId.value || props.client?.agency_id || 0);
  const fromAffil = (clientAgencyAffiliations.value || []).find(
    (a) => Number(a?.agency_id) === activeId
  );
  if (fromAffil?.agency_name) return String(fromAffil.agency_name).trim();
  const fromSwitch = (switchableAgencies.value || []).find((a) => Number(a.id) === activeId);
  if (fromSwitch?.name) return fromSwitch.name;
  const fromMine = (myAgencies.value || []).find((a) => Number(a.id) === activeId);
  if (fromMine?.name) return String(fromMine.name).trim();
  return activeId ? `Agency ${activeId}` : '—';
});

const tenantMembershipPills = computed(() => {
  const activeId = Number(selectedAgencyId.value || props.client?.agency_id || 0);
  const fromAffil = (tenantMemberships.value || [])
    .map((a) => ({
      id: Number(a?.agency_id),
      name: String(a?.agency_name || '').trim(),
      activeChart: Number(a?.agency_id) === activeId
    }))
    .filter((a) => a.id && a.name);
  if (fromAffil.length) return fromAffil;
  const name = primaryAgencyDisplayName.value;
  if (activeId && name && name !== '—') {
    return [{ id: activeId, name, activeChart: true }];
  }
  return [];
});

const programAffiliationPills = computed(() => {
  const seen = new Set();
  const out = [];
  const push = (id, name, typeRaw) => {
    const nid = Number(id || 0);
    const label = String(name || '').trim();
    if (!label || !meaningfulProgram(label, typeRaw)) return;
    const key = nid || label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const t = String(typeRaw || '').toLowerCase();
    const typeLabel = t === 'school'
      ? 'School'
      : t === 'learning'
        ? 'Learning'
        : t === 'program'
          ? 'Program'
          : t === 'clinical'
            ? ''
            : 'Program';
    out.push({ id: nid || key, name: label, typeLabel });
  };
  for (const a of affiliations.value || []) {
    push(a.organization_id, a.organization_name || a.name, a.organization_type);
  }
  push(
    props.client?.organization_id,
    props.client?.organization_name,
    props.client?.organization_type
  );
  return out;
});

const overviewProgramLabel = computed(() => programAffiliationPills.value.filter(program => program.typeLabel === 'Program').map(program => program.name).join(' · '));

const hasAgencyAccess = computed(() => {
  if (isSuperAdmin.value) return true;
  if (Number(props.schoolOrganizationId || 0) > 0 && isBackofficeRole.value) return true;
  const mine = new Set((myAgencies.value || []).map((a) => Number(a?.id)).filter(Boolean));
  if (mine.has(Number(props.client?.agency_id || 0))) return true;
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
const isSelfProviderRole = computed(() =>
  ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'].includes(roleNorm.value)
);
const viewerIsAssignedProvider = computed(() => {
  const me = Number(authStore.user?.id || 0);
  if (!me) return false;
  if (props.client?.user_is_assigned_provider) return true;
  if (Number(props.client?.provider_id) === me) return true;
  const ids = String(props.client?.provider_ids || '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.includes(me);
});
const assignDayProviderUserId = computed(() => {
  const me = Number(authStore.user?.id || 0);
  if (viewerIsAssignedProvider.value && me) return me;
  const fromIds = String(props.client?.provider_ids || '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .find((n) => Number.isFinite(n) && n > 0);
  if (fromIds) return fromIds;
  const legacy = Number(props.client?.provider_id || 0);
  return legacy > 0 ? legacy : null;
});
const canManageSchoolAssignments = computed(() => {
  if (!isSchoolPortalContext.value) return false;
  if (props.canManageSchoolAssignments) return true;
  if (isBackofficeRole.value) return true;
  return isSelfProviderRole.value && viewerIsAssignedProvider.value;
});
const showSchoolStripAssignmentEditor = computed(() => {
  if (!canManageSchoolAssignments.value || !schoolOrganizationId.value) return false;
  if (editingOverview.value) return true;
  const label = String(primaryProviderLabel.value || '').trim().toLowerCase();
  return !label || label === 'not assigned' || label === '—';
});
const showAssignDayModal = ref(false);
const lifecycleHistoryModal = ref({ client: null, actionKey: '', label: '', schoolYear: '' });
const lifecycleHistoryChecklistClient = ref(null);

function openLifecycleHistoryEvent(ev) {
  if (!ev?.actionKey) return;
  if (ev.actionKey === 'provider_intake') {
    lifecycleHistoryChecklistClient.value = props.client;
    return;
  }
  lifecycleHistoryModal.value = {
    client: props.client,
    actionKey: ev.actionKey,
    label: ev.title || 'View submission',
    schoolYear: ev.schoolYear || ''
  };
}

function closeLifecycleHistoryModal() {
  lifecycleHistoryModal.value = { client: null, actionKey: '', label: '', schoolYear: '' };
}

const canEditAccount = computed(() => isBackofficeRole.value && hasAgencyAccess.value);
const canScheduleClient=computed(()=>hasAgencyAccess.value&&['super_admin','admin','support','staff','clinical_practice_assistant','schedule_manager','provider','provider_plus','intern','intern_plus','supervisor','tutor','facilitator','qbha'].includes(roleNorm.value));
const canManageServiceEnrollments = computed(() => isBackofficeRole.value && hasAgencyAccess.value);
const canFinishChartSetup = computed(() => [
  'super_admin',
  'admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'supervisor',
  'clinical_practice_assistant'
].includes(roleNorm.value) && (hasAgencyAccess.value || viewerIsAssignedProvider.value));

const canOpenClientSecureMessage=computed(()=>!agencyAccessLoading.value&&!agencyAccessError.value&&!!Number(props.client?.id)&&!!Number(props.client?.agency_id||selectedAgencyId.value)&&['super_admin','admin','support','staff','clinical_practice_assistant','provider','provider_plus','supervisor'].includes(roleNorm.value)&&(hasAgencyAccess.value||viewerIsAssignedProvider.value));
function openClientSecureMessage(){
 if(!canOpenClientSecureMessage.value)return;
 const clientId=Number(props.client.id),agencyId=Number(props.client.agency_id||selectedAgencyId.value);
 const slug=String(route.params?.organizationSlug||'').trim();
 return router.push({path:slug?`/${slug}/messages`:'/messages',query:{view:'hub',channel:'secure',secureRecipient:'client',secureClientId:String(clientId),agencyId:String(agencyId)}});
}

const demographicsEmailEditor = ref(null), clientEmailError = ref('');
const canEditClientEmail = computed(() => ['super_admin','admin','support','staff'].includes(roleNorm.value) &&
  (isSuperAdmin.value || myAgencies.value.some(a => Number(a.id) === Number(props.client.agency_id))));
function onClientEmailSaved({clientId,email}) {
  if (Number(clientId) === Number(props.client.id)) emit('updated',{keepOpen:true,client:{...props.client,email}});
}
watch(() => props.client.id, () => {clientEmailError.value = '';});
async function openClientEmail() {
  const id = Number(props.client.id), agencyId = Number(props.client.agency_id);
  clientEmailError.value = '';
  if (!props.client.email && canEditClientEmail.value) {
    await goChartSub('demographics'); await nextTick(); await demographicsEmailEditor.value?.edit(); return;
  }
  try {
    const person = await resolveClientEmail(api,id,agencyId);
    if (id === Number(props.client.id) && agencyId === Number(props.client.agency_id)) composeClientEmail(router,person);
  } catch (e) {
    if (id === Number(props.client.id)) clientEmailError.value = e.response?.data?.error?.message || e.message;
  }
}

const clientDobLabel = computed(() => {
  const raw = props.client?.date_of_birth;
  if (!raw) return '';
  return formatDate(raw);
});

const sexSelectOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'intersex', label: 'Intersex' },
  { value: 'other', label: 'Other' }
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

const clientIsMinor = computed(() => clientAgeLabel.value !== '' && Number(clientAgeLabel.value) < 18);

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
  if (!showSchoolGlance.value && Object.hasOwn(servicesByAgency.value, String(activeChartAgencyId.value))) return 'Not assigned';
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
    if (rows.length > mineCount) return 'Note: client also has membership in another agency.';
    return '';
  }
  // User has no agency overlap; show which agency owns the client.
  const names = rows.map((r) => String(r?.agency_name || '').trim()).filter(Boolean);
  if (names.length) return `Note: client has agency membership elsewhere (${names.join(', ')}).`;
  return 'Note: client has agency membership elsewhere.';
});

const openFullClientRecord = async () => {
  if (!props.client?.id || await saveClientWorkspaceDrafts()===false) return;
  const orgSlug = String(route.params?.organizationSlug || '').trim();
  const tab = String(activeTab.value || 'overview');
  const path = orgSlug
    ? `/${orgSlug}/admin/clients/${props.client.id}`
    : `/admin/clients/${props.client.id}`;
  const query = tab && tab !== 'overview' ? { tab } : {};
  emit('close');
  router.push({ path, query }).catch(() => {
    window.location.assign(`${path}${query.tab ? `?tab=${encodeURIComponent(query.tab)}` : ''}`);
  });
};

async function openDocumentUpload(){if(paperProcessingAvailable.value){openClientActions('upload');return;}goChartSub('phi');await nextTick();documentsTabRef.value?.openUpload?.();}
const organizationSlugForLinks = computed(() => String(route.params?.organizationSlug || '').trim());

const addAgencyAffiliationId = ref('');
const addAgencyMakePrimary = ref(false);
const isAgencyOrgType = (o) => String(o?.organization_type || o?.organizationType || 'agency').toLowerCase() === 'agency';
const tenantMemberships = computed(() =>
  (clientAgencyAffiliations.value || []).filter((a) => {
    const t = String(a?.agency_organization_type || a?.organization_type || 'agency').toLowerCase();
    return t === 'agency' || !a?.agency_organization_type;
  })
);
const addableAgencyOptions = computed(() => {
  const existing = new Set((tenantMemberships.value || []).map((a) => Number(a?.agency_id)).filter(Boolean));
  return (myAgencies.value || []).filter(
    (a) => a && isAgencyOrgType(a) && !existing.has(Number(a.id))
  );
});

const affiliatedOrgsByAgencyId = ref({}); // { [agencyId]: org[] }
const tenantBookingDrafts = ref({}); // { [agencyId]: { officeId, pos, serviceLocationId, hint, error } }
const tenantOfficeOptionsByAgency = ref({});
const tenantServiceLocationOptionsByAgency = ref({});
const tenantAddDrafts = ref({}); // { [`${agencyId}:school`]: orgId }
const tenantAddMakePrimaryMap = ref({});
const savingTenantBookingAgencyId = ref(0);

function orgTypeBucket(t) {
  const n = String(t || '').toLowerCase();
  if (n === 'school') return 'school';
  if (n === 'learning') return 'learning';
  if (n === 'program') return 'program';
  return n || 'other';
}

function affiliationDisplayType(row) {
  const t = String(row?.organization_type || '').toLowerCase();
  if (t === 'clinical') return 'clinical organization';
  return t || '—';
}

function orgIdsForAgency(agencyId) {
  const list = affiliatedOrgsByAgencyId.value[String(agencyId)] || [];
  return new Set(list.map((o) => Number(o.id)).filter(Boolean));
}

function affiliationsForTenant(agencyId, bucket) {
  const ids = orgIdsForAgency(agencyId);
  return (affiliations.value || []).filter((row) => {
    const oid = Number(row?.organization_id);
    if (!oid || !ids.has(oid)) return false;
    return orgTypeBucket(row?.organization_type) === bucket && (bucket !== 'program' || meaningfulProgram(row.organization_name || row.name, row.organization_type));
  });
}

function hasTenantCategory(agencyId, bucket) {
  return (affiliatedOrgsByAgencyId.value[String(agencyId)] || []).some(org => orgTypeBucket(org.organization_type) === bucket)
    || affiliationsForTenant(agencyId, bucket).length > 0;
}
function hasAnyTenantCategory(bucket) {
  return tenantMemberships.value.some(agency => hasTenantCategory(agency.agency_id, bucket));
}
function assignmentOrganizationsForTenant(agencyId) {
  return ['school', 'program', 'learning'].flatMap(kind => affiliationsForTenant(agencyId, kind));
}
function canManageServicesForTenant(agencyId) {
  return isBackofficeRole.value && (isSuperAdmin.value || myAgencies.value.some(agency => Number(agency.id) === Number(agencyId)));
}

const orphanAffiliations = computed(() => {
  const covered = new Set();
  for (const a of tenantMemberships.value || []) {
    for (const id of orgIdsForAgency(a.agency_id)) covered.add(id);
  }
  return (affiliations.value || []).filter((row) => {
    const oid = Number(row?.organization_id);
    return oid && !covered.has(oid);
  });
});

function availableOrgsForTenant(agencyId, bucket) {
  const existing = new Set((affiliations.value || []).map((a) => Number(a?.organization_id)).filter(Boolean));
  const list = affiliatedOrgsByAgencyId.value[String(agencyId)] || [];
  return list.filter((o) => {
    const id = Number(o?.id);
    if (!id || existing.has(id)) return false;
    return orgTypeBucket(o?.organization_type) === bucket && (bucket !== 'program' || meaningfulProgram(o.name, o.organization_type));
  });
}

function tenantAddKey(agencyId, bucket) {
  return `${Number(agencyId)}:${bucket}`;
}
function tenantAddDraft(agencyId, bucket) {
  return tenantAddDrafts.value[tenantAddKey(agencyId, bucket)] || '';
}
function setTenantAddDraft(agencyId, bucket, value) {
  tenantAddDrafts.value = { ...tenantAddDrafts.value, [tenantAddKey(agencyId, bucket)]: value };
}
function tenantAddMakePrimary(agencyId, bucket) {
  return !!tenantAddMakePrimaryMap.value[tenantAddKey(agencyId, bucket)];
}
function setTenantAddMakePrimary(agencyId, bucket, checked) {
  tenantAddMakePrimaryMap.value = {
    ...tenantAddMakePrimaryMap.value,
    [tenantAddKey(agencyId, bucket)]: !!checked
  };
}

function ensureTenantBookingDraft(agencyId) {
  const key = String(agencyId);
  if (!tenantBookingDrafts.value[key]) {
    const row = (clientAgencyAffiliations.value || []).find((a) => Number(a.agency_id) === Number(agencyId));
    const isActiveChart = Number(agencyId) === Number(selectedAgencyId.value || props.client?.agency_id);
    tenantBookingDrafts.value = {
      ...tenantBookingDrafts.value,
      [key]: {
        officeId: row?.default_office_location_id
          ? String(row.default_office_location_id)
          : (isActiveChart && props.client?.default_office_location_id
            ? String(props.client.default_office_location_id)
            : ''),
        pos: row?.default_place_of_service
          ? String(row.default_place_of_service)
          : (isActiveChart && props.client?.default_place_of_service
            ? String(props.client.default_place_of_service)
            : ''),
        serviceLocationId: row?.default_service_location_id
          ? String(row.default_service_location_id)
          : (isActiveChart && props.client?.default_service_location_id
            ? String(props.client.default_service_location_id)
            : ''),
        hint: '',
        error: ''
      }
    };
  }
  return tenantBookingDrafts.value[key];
}
function tenantBookingDraft(agencyId) {
  return ensureTenantBookingDraft(agencyId);
}
function setTenantBookingDraft(agencyId, field, value) {
  const cur = { ...ensureTenantBookingDraft(agencyId), [field]: value, hint: '', error: '' };
  tenantBookingDrafts.value = { ...tenantBookingDrafts.value, [String(agencyId)]: cur };
}
function tenantBookingDraftHint(agencyId) {
  return ensureTenantBookingDraft(agencyId).hint || '';
}
function tenantBookingDraftError(agencyId) {
  return ensureTenantBookingDraft(agencyId).error || '';
}
function officesForAgency(offices, agencyId) {
  return (Array.isArray(offices) ? offices : []).filter(office =>
    (office.agencyIds || []).some(id => Number(id) === Number(agencyId))
    || Number(office.agency_id) === Number(agencyId)
  );
}
function officeOptionsForTenant(agencyId) {
  return tenantOfficeOptionsByAgency.value[String(agencyId)] || [];
}
function serviceLocationOptionsForTenant(agencyId) {
  return billingServiceLocationOptions(tenantServiceLocationOptionsByAgency.value[String(agencyId)] || [],tenantBookingDraft(agencyId).serviceLocationId);
}

async function loadTenantCatalog(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return;
  try {
    const [orgsRes, officesRes, locsRes] = await Promise.all([
      api.get(`/agencies/${aid}/affiliated-organizations`, { skipGlobalLoading: true }),
      api.get('/offices', { skipGlobalLoading: true }).catch(() => null),
      canAccessMedicalBilling(authStore.user, aid)
        ? api.get('/medical-billing/service-locations', { params: { agencyId: aid }, skipGlobalLoading: true }).catch(() => null)
        : Promise.resolve(null)
    ]);
    affiliatedOrgsByAgencyId.value = {
      ...affiliatedOrgsByAgencyId.value,
      [String(aid)]: Array.isArray(orgsRes?.data) ? orgsRes.data : []
    };
    const offices = Array.isArray(officesRes?.data) ? officesRes.data : (officesRes?.data?.locations || []);
    tenantOfficeOptionsByAgency.value = {
      ...tenantOfficeOptionsByAgency.value,
      [String(aid)]: officesForAgency(offices, aid)
    };
    const locs = locsRes?.data?.items || locsRes?.data?.locations || locsRes?.data?.serviceLocations || locsRes?.data || [];
    tenantServiceLocationOptionsByAgency.value = {
      ...tenantServiceLocationOptionsByAgency.value,
      [String(aid)]: Array.isArray(locs) ? locs : []
    };
  } catch {
    affiliatedOrgsByAgencyId.value = { ...affiliatedOrgsByAgencyId.value, [String(aid)]: [] };
  }
  ensureTenantBookingDraft(aid);
}

async function loadAllTenantCatalogs() {
  const ids = (tenantMemberships.value || []).map((a) => Number(a.agency_id)).filter(Boolean);
  await Promise.all(ids.map((id) => loadTenantCatalog(id)));
}

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
    await loadTenantCatalog(agencyId);
    if (makePrimary) {
      selectedAgencyId.value = String(agencyId);
    }
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to add agency affiliation');
  } finally {
    switchingAgency.value = false;
  }
};

const archiveAgencyAffiliation = async (agencyId) => {
  const id = Number(agencyId);
  if (!id) return;
  if (!window.confirm('Archive this agency membership? You can re-add it later.')) return;
  try {
    switchingAgency.value = true;
    await api.delete(`/clients/${props.client.id}/agency-affiliations/${id}`);
    await fetchClientAgencyAffiliations();
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to archive agency membership');
  } finally {
    switchingAgency.value = false;
  }
};

const removeAgencyAffiliationHard = async (agencyId) => {
  const id = Number(agencyId);
  if (!id) return;
  if (!window.confirm('Permanently remove this agency membership? This cannot be undone from archive.')) return;
  try {
    switchingAgency.value = true;
    await api.delete(`/clients/${props.client.id}/agency-affiliations/${id}`, { params: { hard: 1 } });
    await fetchClientAgencyAffiliations();
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to remove agency membership');
  } finally {
    switchingAgency.value = false;
  }
};

/** @deprecated use archiveAgencyAffiliation / removeAgencyAffiliationHard */
const removeAgencyAffiliation = archiveAgencyAffiliation;

const docStatusDetailsEl = ref(null);

// Multi-org + multi-provider assignments (backoffice only)
const affiliations = ref([]);
const programHistoryRevision = ref(0);
/** Affiliated orgs for the active chart tenant (used to gate learning surfaces). */
const chartAgencyAffiliatedOrgs = ref([]);

const activeChartAgencyId = computed(() => Number(selectedAgencyId.value || props.client?.agency_id) || null);
const canReadChartTypes = computed(() => ['admin','super_admin','support','staff','provider','provider_plus','clinical_practice_assistant','supervisor'].includes(roleNorm.value));
const {profile:chartTypes,error:chartTypeError,saving:savingChartTypes,load:loadChartTypes,save:saveChartTypes} =
  useClientChartTypes(() => [Number(props.client?.id), activeChartAgencyId.value, canReadChartTypes.value,
    authStore.user?.id, roleNorm.value, props.client?.email, props.client?.organization_id, props.client?.client_status_id, props.client?.status, props.client?.date_of_birth]);
const fallbackTypes = computed(() => {
  if (activeChartAgencyId.value !== Number(props.client?.agency_id)) return [];
  const org = props.client?.organization_type, legacy = props.client?.client_type;
  const types = new Set([org, legacy]);
  if (types.has('school')) types.add('clinical');
  return ['clinical','learning','school'].filter(type => types.has(type));
});
const activeTypes = computed(() => chartTypes.value?.types ?? fallbackTypes.value);
const primaryRoleLabel = computed(() => {
  if (activeTypes.value.includes('clinical') || activeTypes.value.includes('school')) return 'Primary clinician';
  return activeTypes.value.includes('learning') ? 'Primary learning provider' : 'Primary provider';
});
const effectiveClientType = computed(() => activeTypes.value.find(type => ['clinical','school','learning'].includes(type)) || activeTypes.value[0] || 'basic_nonclinical');
const clientTypeLabel = computed(() => activeTypes.value.map(type => type[0].toUpperCase() + type.slice(1)).join(' · ') || 'Unclassified');
const isSchoolClientType = computed(() => activeTypes.value.includes('school'));
const showClinicalChartSurfaces = computed(() => [...activeTypes.value,...(chartTypes.value?.historicalTypes || [])].some(type => ['clinical','school'].includes(type)));
const isClinicalLikeClientType = computed(() => showClinicalChartSurfaces.value || activeTypes.value.includes('learning'));

const clientLearningOrgIds = computed(() => {
  const ids = new Set();
  for (const a of affiliations.value || []) {
    if (String(a?.organization_type || '').toLowerCase() === 'learning') {
      const id = Number(a?.organization_id || 0);
      if (id) ids.add(id);
    }
  }
  if (String(props.client?.organization_type || '').toLowerCase() === 'learning') {
    const id = Number(props.client?.organization_id || 0);
    if (id) ids.add(id);
  }
  return [...ids];
});

const hasLearningProgramEnrollment = computed(() =>
  effectiveClientType.value === 'learning' || clientLearningOrgIds.value.length > 0
);



const activeTenantSponsorsClientLearning = computed(() => {
  if (!hasLearningProgramEnrollment.value) return false;
  // Learning-primary clients always see learning surfaces in their chart.
  if (effectiveClientType.value === 'learning') return true;

  const learningIds = new Set(clientLearningOrgIds.value);
  const sponsoredByAffil = (chartAgencyAffiliatedOrgs.value || []).some((o) => {
    const id = Number(o?.id || o?.organization_id || 0);
    const type = String(o?.organization_type || '').toLowerCase();
    if (id && learningIds.has(id)) return true;
    return type === 'learning' && id && learningIds.has(id);
  });
  if (sponsoredByAffil) return true;

  // Single-tenant membership: that tenant is the only chart context for this client.
  const tenantRows = clientAgencyAffiliations.value || [];
  const tenantCount = tenantRows.length || (props.client?.agency_id ? 1 : 0);
  if (tenantCount <= 1 && hasLearningProgramEnrollment.value) return true;

  // Active chart tenant agency itself typed as learning (from memberships / user agencies).
  const aid = activeChartAgencyId.value;
  const fromMine = (myAgencies.value || []).find((a) => Number(a?.id) === aid);
  const fromSwitch = (switchableAgencies.value || []).find((a) => Number(a?.id) === aid);
  const agencyType = String(
    fromMine?.organization_type || fromSwitch?.organization_type || props.client?.agency_organization_type || ''
  ).toLowerCase();
  if (agencyType === 'learning') return true;

  // Client’s learning org is the same id as the active chart agency (tenant = program).
  if (aid && learningIds.has(aid)) return true;

  return false;
});

/** Student summary / Learning plans — gated by active chart tenant sponsorship. */
const showLearningChartSurfaces = computed(() =>
  chartTypes.value ? [...activeTypes.value,...chartTypes.value.historicalTypes].includes('learning') : hasLearningProgramEnrollment.value && activeTenantSponsorsClientLearning.value
);

const showSchoolSpecificOverviewFields = computed(() => showSchoolGlance.value);
const displayStatusLabel = computed(() => {
  if (isClientArchived.value) return 'Archived';
  return props.client.client_status_label || String(props.client.client_status_key || props.client.status || '—')
    .toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
});
const schoolNames = computed(() => chartTypes.value?.schools ?? [...new Set([
  ...(props.client?.organization_type === 'school' ? [props.client.organization_name] : []),
  ...affiliationsForTenant(activeChartAgencyId.value,'school').map(row => row.organization_name)
].filter(Boolean))]);
const showDependentFields = computed(() => activeTypes.value.includes('dependent'));
const showSchoolGlance = computed(() => chartTypes.value ? activeTypes.value.includes('school') : schoolNames.value.length > 0 || String(props.client.client_type).toLowerCase() === 'school');
const communicationSchoolId = computed(() => {
  if (isSchoolPortalContext.value && schoolOrganizationId.value) return schoolOrganizationId.value;
  const schools = affiliationsForTenant(activeChartAgencyId.value,'school');
  const chosen = schools.find(row => Number(row.organization_id) === Number(selectedAssignmentOrgId.value))
    || schools.find(row => Number(row.is_primary) === 1) || (schools.length === 1 && schools[0]);
  if (chosen) return Number(chosen.organization_id);
  return props.client?.organization_type === 'school' && Number(props.client.agency_id) === activeChartAgencyId.value
    ? Number(props.client.organization_id) : 0;
});
const schoolGlanceLabel = computed(() => schoolNames.value.join(' · ') || 'Not on a school roster');
const assignedDayGlanceLabel = computed(() => {
  const days = String(careTeamGlanceMeta.value || '').trim();
  if (days && days.toLowerCase() !== 'unknown') return days;
  return assignedDayDisplay(props.client);
});
const organizationLabel = computed(() => props.client?.organization_type === 'school' ? 'School' : 'Organization');
const savedOrganizationLabel = computed(() => {
  const client = props.client;
  const org = overviewOrganizations.value.find(row => Number(row.id) === Number(client?.organization_id));
  const name = chartOrganizationLabel(client?.organization_name || org?.name, client?.organization_type || org?.organization_type);
  if (name || !client?.organization_id) return name || 'None';
  return Number(client.organization_id) === Number(client.agency_id) ? client.agency_name || `Agency #${client.agency_id}` : `Organization #${client.organization_id}`;
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
  () => (isSuperAdmin.value || myAgencies.value.some(a => Number(a.id) === Number(props.client?.agency_id))) && ['super_admin', 'admin', 'support'].includes(roleNorm.value)
);
const clientQualifiesForSchoolRoiTab = computed(() => showSchoolGlance.value);

const canManageSchoolRoi = computed(
  () => isBackofficeRole.value && hasAgencyAccess.value && clientQualifiesForSchoolRoiTab.value
);

const schoolRoiStatusLabel = computed(() => {
  if (props.client?.roi_expires_at === undefined) return 'Open staff access to review';
  const s = schoolRoiSimpleStatus(props.client?.roi_expires_at);
  if (s === 'active') return 'On file — review staff permissions';
  if (s === 'expired') return 'Expired';
  return 'No date on file';
});

const canSupportClientAccount = computed(() => canAccessClientAccountSupport(authStore.user, clientAgencyId.value, myAgencies.value));
const canViewClientBillingImport = computed(() => {
  if (!showClinicalChartSurfaces.value) return false;
  return canAccessMedicalBilling(authStore.user, clientAgencyId.value);
});

/** Missing-claim flag on medical record — billing staff / admin, not providers. */
const canViewMissingClaimFlag = computed(() => {
  if (!isClinicalLikeClientType.value) return false;
  return ['super_admin', 'admin', 'support', 'billing'].includes(roleNorm.value);
});

const canViewMedicalRecord = computed(() => {
  if (!showClinicalChartSurfaces.value) return false;
  return [
    'super_admin',
    'admin',
    'provider',
    'provider_plus',
    'supervisor',
    'clinical_practice_assistant'
  ].includes(roleNorm.value);
});

const clientAgencyId = computed(() => Number(props.client?.agency_id || 0) || null);
const clientChartClientId = computed(() => Number(props.client?.id || 0) || null);
const careSummary = ref(null);
const careSummaryLoading = ref(false);
const careSummaryError = ref('');
let careSummaryVersion = 0;
async function loadCareSummary() {
  const agencyId = activeChartAgencyId.value;
  const clientId = clientChartClientId.value;
  const enabled = canViewMedicalRecord.value;
  const version = ++careSummaryVersion;
  careSummaryError.value = '';
  if (!enabled || !agencyId || !clientId) {
    careSummary.value = null;
    careSummaryLoading.value = false;
    return;
  }
  careSummaryLoading.value = true;
  try {
    const { data } = await api.get(`/client-exchange/clients/${clientId}/summary`, { params: { agencyId }, skipGlobalLoading: true });
    if (version === careSummaryVersion) careSummary.value = data.summary;
  } catch (error) {
    if (version === careSummaryVersion) careSummaryError.value = error?.response?.data?.error?.message || 'Unable to load clinical summary';
  } finally {
    if (version === careSummaryVersion) careSummaryLoading.value = false;
  }
}
watch([activeChartAgencyId, clientChartClientId, canViewMedicalRecord, () => props.client?.updated_at], () => {
  careSummary.value = null;
  void loadCareSummary();
});
onMounted(loadCareSummary);



const showPostToExchangeModal = ref(false);
const postToExchangeClientLabel = computed(() => {
  const label = getClientLabel(props.client);
  const type = clientTypeLabel.value;
  return type ? `${label} — ${type}` : label;
});
const canPostClientToExchange = computed(() => {
  if (!canSeeClientExchangeNav(roleNorm.value)) return false;
  if (!['clinical', 'learning', 'school', 'basic_nonclinical'].includes(effectiveClientType.value)) return false;
  if (!hasAgencyAccess.value) return false;
  if (isClientArchived.value) return false;
  if (isBackofficeRole.value) return true;
  return viewerIsAssignedProvider.value;
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
  encounters: clientTaskEncounters,
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
  return `${row.note_status === 'planned' ? 'Scheduled' : 'Latest date'}: ${formatCalendarDate(row.service_date)}`;
});

const lastSessionMeta = computed(() => {
  const row = lastSession.value;
  if (!row) return canViewMedicalRecord.value ? 'No sessions imported' : '—';
  const code = row.service_code ? `CPT ${row.service_code}` : '';
  const pos = serviceSettingName(row.place_of_service);
  return [code, pos].filter(Boolean).join(' · ') || 'Imported session';
});

const sessionCountLabel = computed(() => {
  if (!canViewMedicalRecord.value || !isClinicalLikeClientType.value) return '—';
  return String(sessionCount.value || 0);
});

const overviewGlanceItems = computed(() => {
  const items = [];
  if (showSchoolGlance.value) {
    items.push({ label: 'School', value: schoolGlanceLabel.value || '—' });
    items.push({ label: 'Assigned day', value: assignedDayGlanceLabel.value || 'Not assigned' });
    items.push({ label: 'Grade', value: formatGradeDisplay(props.client?.grade) || '—' });
    if (props.client?.school_year) items.push({ label: 'School year', value: String(props.client.school_year) });
  }
  items.push({ label: primaryRoleLabel.value, value: primaryProviderLabel.value, assignable: canManageServiceEnrollments.value && !showSchoolGlance.value });
  if (overviewProgramLabel.value) items.push({ label: 'Program', value: overviewProgramLabel.value });
  items.push({ label: 'Insurance', value: primaryInsuranceLabel.value || 'Not on file' });
  items.push({ label: 'Status', value: isClientArchived.value ? 'Archived' : displayStatusLabel.value });
  return items;
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
  if (canViewMedicalRecord.value && showClinicalChartSurfaces.value && careSummary.value) {
    const summary = careSummary.value;
    if (summary.intakeReviewStatus !== 'complete') {
      items.push({id:'intake-incomplete', label: summary.intakeReviewStatus === 'draft' ? 'Intake needs finalizing' : 'Intake missing',
        tone:'warning', tab:'intake-note'});
    }
    if (!summary.treatmentPlanOnFile) items.push({id:'plan-incomplete',label:'Signed treatment plan needed',tone:'warning',tab:'treatment-plans'});
    if (summary.intakeDiagnosisPending) items.push({id:'dx-review',label:'Review intake diagnosis',tone:'info',tab:'intake-note'});
    if (summary.planDiagnosisPending) items.push({id:'plan-dx-review',label:'Review treatment plan diagnoses',tone:'info',tab:'treatment-plans'});
  }
  return items;
});

const canLaunchRecordUpdate=computed(()=>hasAgencyAccess.value&&['super_admin','admin','support','provider','provider_plus'].includes(roleNorm.value)&&!isClientArchived.value&&!isClientTerminated.value);
async function onRecordsUpdateStarted(progress){recordsImportSetup.value={...recordsImportSetup.value,requiresRecordImport:true,recordsImportStatus:'pending',recordsImportSelectedSections:progress.selectedSections};setChartNav('bring-up-to-date');emit('updated',{keepOpen:true});}
const recordsImportPanel=ref(null),savedAssignmentPanel=ref(null),pendingAssignmentDraft=ref(false),reviewAssignmentDraft=ref(false);
let assignmentDraftRequest=0;
async function loadPendingAssignmentDraft(){const id=Number(props.client?.id),own=++assignmentDraftRequest;if(!canEditAccount.value||!['super_admin','admin','support'].includes(roleNorm.value)){pendingAssignmentDraft.value=false;return;}try{const {data}=await api.get(`/clients/${id}/chart-import/drafts/assignments`,{skipGlobalLoading:true,headers:{'X-Agency-Id':String(props.client.agency_id)}});if(own===assignmentDraftRequest&&id===Number(props.client?.id))pendingAssignmentDraft.value=!!data?.draft?.value?.text;}catch{/* Draft details stay private if account access is unavailable. */}}
async function openAssignmentDraft(){reviewAssignmentDraft.value=true;await goChartSub('assignments');}
async function closeAssignmentDraft(){if(await savedAssignmentPanel.value?.saveWorkingDraft?.()===false)return;reviewAssignmentDraft.value=false;await loadPendingAssignmentDraft();}
async function saveClientWorkspaceDrafts(){if(portalOverviewRef.value?.prepareToLeave?.()===false || medicalRecordsRef.value?.prepareToLeave?.()===false)return false;if(await recordsImportPanel.value?.prepareLeave?.()===false)return false;if(await savedAssignmentPanel.value?.saveWorkingDraft?.()===false)return false;if(savedAssignmentPanel.value)pendingAssignmentDraft.value=savedAssignmentPanel.value.hasPendingDraft?.()===true;return true;}
watch([()=>props.client?.id,canEditAccount],()=>{pendingAssignmentDraft.value=false;reviewAssignmentDraft.value=false;void loadPendingAssignmentDraft();},{immediate:true});
const recordsImportSetup=ref(null);
const recordsImportHint=computed(()=>{
 try{const data=typeof props.client?.onboarding_docs_json==='string'?JSON.parse(props.client.onboarding_docs_json):props.client?.onboarding_docs_json;
  if(data?.recordsImport?.status==='complete')return false;
  return data?.recordsImport?.status==='pending'||props.client?.renewal_flags?.recordsImportPending===true||props.client?.renewalFlags?.recordsImportPending===true;
 }catch{return false;}
});
const showRecordsImportTab=computed(()=>['super_admin','admin','support','staff','provider','provider_plus','supervisor','clinical_practice_assistant'].includes(roleNorm.value) && (recordsImportSetup.value ? canFinishChartSetup.value && (recordsImportSetup.value.requiresRecordImport || recordsImportSetup.value.recordsImportStatus==='pending') && recordsImportSetup.value.recordsImportStatus!=='complete' && (recordsImportSetup.value.recordsImportStatus==='pending'||!recordsImportSetup.value.setupComplete) : recordsImportHint.value));
const recordsImportSectionStatus=computed(()=>({demographics:recordsImportSetup.value?.demographicsOnFile?'done':'missing',intake:recordsImportSetup.value?.intakeOnFile?'done':'missing',plan:recordsImportSetup.value?.planOnFile?'done':'missing'}));
let recordsImportLoad=0;
async function loadRecordsImportSetup(selectFirst=false){
 const cid=Number(props.client?.id),run=++recordsImportLoad;
 if(!cid||!canFinishChartSetup.value){recordsImportSetup.value=null;return;}
 try{const {data}=await api.get(`/clients/${cid}/chart-setup`,{skipGlobalLoading:true});if(run!==recordsImportLoad||cid!==Number(props.client?.id))return;recordsImportSetup.value=data;
 if(selectFirst&&activeTab.value==='overview'&&showRecordsImportTab.value&&(!props.initialTab||props.initialTab==='overview'))setChartNav('bring-up-to-date');
 }catch{if(run===recordsImportLoad)recordsImportSetup.value=null;}
}
watch([()=>Number(props.client?.id),canFinishChartSetup],()=>{recordsImportSetup.value=null;if(showRecordsImportTab.value&&activeTab.value==='overview'&&(!props.initialTab||props.initialTab==='overview'))setChartNav('bring-up-to-date');void loadRecordsImportSetup(true);},{immediate:true});
async function onRecordsImportDone(result){pendingAssignmentDraft.value=result?.assignmentDraftPending===true;recordsImportSetup.value={...recordsImportSetup.value,recordsImportStatus:'complete'};setChartNav('overview');emit('updated',{keepOpen:true,...(result?.client?{client:{...props.client,...result.client}}:{})});void loadRecordsImportSetup();await onChartSetupUpdated();}
const tabs = computed(() => ([
  ...(showRecordsImportTab.value?[{id:'bring-up-to-date',label:'Bring up to date',description:'Import records · Mark done'}]:[]),
  { id: 'overview', label: 'Overview', description: 'Summary · Quick actions' },
  ...(canScheduleClient.value?[{id:'schedule',label:'Schedule',description:'Provider calendar · Book a session'}]:[]),
  { id: 'account', label: 'Account', description: canEditAccount.value ? 'Profile · Assignments' : 'Profile · Relationships' },
  ...(canViewGuardians.value ? [{id:'portal',label:'Portal',description:'Access · Sharing · Activity'}] : []),
  { id: 'lifecycle', label: 'Lifecycle', description: 'Timeline · History' },
  { id: 'records', label: 'Records', description: 'Documents · Care records' },
  { id: 'messages', label: 'Messages', description: 'Communications · Contacts' }
]));

const affiliationsLoading = ref(false);
const assignmentsError = ref('');
const availableAffiliations = ref([]);
const addAffiliationOrgId = ref('');
const addAffiliationMakePrimary = ref(false);
const savingAffiliation = ref(false);

const PLACE_OF_SERVICE_OPTIONS = Object.freeze([
  { code: '02', label: 'Telehealth (other)' },
  { code: '03', label: 'School' },
  { code: '10', label: 'Telehealth provided in patient’s home' },
  { code: '11', label: 'Office' },
  { code: '12', label: "Patient's Residence" },
  { code: '49', label: 'Independent Clinic' },
  { code: '99', label: 'Other Place of Service' }
]);
const clientOfficeOptions = ref([]);
const clientServiceLocationOptions = ref([]);
const clientDefaultOfficeId = ref('');
const clientDefaultPos = ref('');
const clientDefaultServiceLocationId = ref('');
const savingClientBookingDefaults = ref(false);
const clientBookingDefaultsError = ref('');
const clientBookingDefaultsSavedHint = ref('');

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
const addProviderClientAlert = ref('');
const savingProviderAssignment = ref(false);
const editingProviderAssignmentId = ref(null);
const editProviderClientAlert = ref('');
const editProviderUserId = ref('');
const editProviderDay = ref('Unknown');

const weekdayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const providerOptionLabel = (p) => {
  const base = `${p?.last_name || ''}, ${p?.first_name || ''}`.replace(/^,\s*/, '').trim();
  const tags = providerClinicalFacets.value?.[String(p?.id)]?.summaryTags || [];
  if (!tags.length) return base;
  return `${base} — ${tags.slice(0, 4).join(', ')}`;
};

const searchableProviderOptions = computed(() => providerOptions.value.map(provider => ({ ...provider, name: providerOptionLabel(provider) })));
const affiliationsForActiveAgency = computed(() => {
  const agencyId = selectedAgencyId.value || props.client?.agency_id;
  return assignmentOrganizationsForTenant(agencyId);
});
const rosterAffiliations = computed(() => affiliations.value.filter(row => ['school', 'program', 'learning'].includes(orgTypeBucket(row.organization_type))));
const servicesByAgency = ref({});
function serviceProviderRows(services, agencyId) {
  const providers = new Map();
  for (const service of services || []) {
    if (Number(service.is_active) !== 1) continue;
    for (const provider of service.providers || [service]) {
      const id = Number(provider.provider_user_id);
      if (!id || providers.has(id)) continue;
      const [firstName, ...lastName] = String(provider.provider_name || '').trim().split(/\s+/);
      providers.set(id, { id: `service-${provider.service_id || service.id}`, agency_id: Number(agencyId), provider_user_id: id,
        provider_first_name: firstName, provider_last_name: lastName.join(' '), is_primary: providers.size === 0 });
    }
  }
  return [...providers.values()];
}
function primaryServiceProviderForTenant(agencyId) {
  const serviceProvider = serviceProviderRows(servicesByAgency.value[String(agencyId)], agencyId)[0];
  if (serviceProvider) return serviceProvider;
  if (showSchoolGlance.value && Number(agencyId) === Number(activeChartAgencyId.value)) return effectiveOverviewProviders.value[0] || null;
  return null;
}
const serviceProviderCount = computed(() => new Set(tenantMemberships.value.flatMap(agency =>
  serviceProviderRows(servicesByAgency.value[String(agency.agency_id)], agency.agency_id).map(row => row.provider_user_id)
)).size);
function onAgencyServicesLoaded(agencyId, payload) {
  servicesByAgency.value = { ...servicesByAgency.value, [String(agencyId)]: payload.services || [] };
}
async function onAgencyServicesUpdated(agencyId, payload) {
  onAgencyServicesLoaded(agencyId, payload);
  await Promise.all([onServiceEnrollmentUpdated(),loadChartTypes()]);
}
const followUpTask = ref(null);
const profileQuickActions = computed(() => [...clientProfileActions({
  hub: chartHub.value, sub: effectiveHubSub.value, canEdit: canEditAccount.value,canSchedule:canScheduleClient.value,
  canPortal: canViewGuardians.value, canInvite: canManageGuardians.value,
  canClinical: canViewMedicalRecord.value, canBilling: canViewClientBillingImport.value,
  canDocuments: roleNorm.value !== 'support',
  canPortalDocuments: ['support','admin','super_admin','provider','provider_plus','intern','intern_plus','supervisor','facilitator','qbha'].includes(roleNorm.value),
  canRequestUpdates: canEditAccount.value && ['super_admin', 'admin', 'support'].includes(roleNorm.value),
  canSecureMessage: canOpenClientSecureMessage.value, canEmail: canOpenClientSecureMessage.value, needsEmail: !props.client.email && canEditClientEmail.value,
  canUpload: canEditPaperwork.value && (paperProcessingAvailable.value || roleNorm.value !== 'support'),
  canProcessPaper: paperProcessingAvailable.value
}), { id: 'follow-up', label: 'Follow-up task', icon: 'calendar' }]);
function onProfileQuickAction(action) {
  if (action.id === 'follow-up') { followUpTask.value?.open(props.client); return; }
  if (action.id === 'email-client') return openClientEmail();
  if (action.id === 'secure-message') return openClientSecureMessage();
  if (action.id === 'upload') return openDocumentUpload();
  if (action.id === 'process-paper') return openClientActions('process');
  if (action.id === 'documents' && chartHub.value === 'portal') return portalOverviewRef.value?.openDocumentAssignments?.();
  if (action.id === 'edit') return startEditOverview(true);
  if (action.id === 'invite') { showPortalInvites.value = true; return; }
  if (action.id === 'updates') { clientUpdateModalOpen.value = true; return; }
  if (action.id === 'renewal') { clientRenewalModalOpen.value = true; return; }
  goChartSub(action.target);
}
async function onServiceEnrollmentUpdated() {
  await refreshOverviewProviders();
  emit('updated', { keepOpen: true });
}

const providerAssignmentOpen = ref(false);
const providerAssignmentSection = ref(null);
async function openProviderAssignment() {
  if (!canManageServiceEnrollments.value) return;
  providerAssignmentOpen.value = true;
  await nextTick();
  providerAssignmentSection.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

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
let overviewProviderRequest = 0;

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
  const agencyId = activeChartAgencyId.value;
  if (!showSchoolGlance.value && Object.hasOwn(servicesByAgency.value, String(agencyId))) return serviceProviderRows(servicesByAgency.value[String(agencyId)], agencyId);
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
  const request = ++overviewProviderRequest;
  const clientId = Number(props.client?.id);
  const agencyId = Number(selectedAgencyId.value || props.client?.agency_id);
  const isCurrent = () => request === overviewProviderRequest && clientId === Number(props.client?.id) && agencyId === Number(selectedAgencyId.value || props.client?.agency_id);
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
    const [r, serviceResponse] = await Promise.all([
      api.get(`/clients/${clientId}/provider-assignments`, { params, skipGlobalLoading: true }),
      canManageServiceEnrollments.value
        ? api.get(`/clients/${clientId}/service-enrollments`, { params: { agencyId }, skipGlobalLoading: true }).catch(() => null)
        : Promise.resolve(null)
    ]);
    // A late response from the prior client must not change this client's care team.
    if (!isCurrent()) return;
    if (serviceResponse) onAgencyServicesLoaded(agencyId, serviceResponse.data);
    const rows = Array.isArray(r.data) ? [...r.data] : [];
    for (const service of serviceResponse?.data?.services || []) {
      if (!Number(service.is_active)) continue;
      for (const provider of service.providers || [service]) {
        if (!Number(provider.provider_user_id) || rows.some(row => Number(row.provider_user_id) === Number(provider.provider_user_id))) continue;
        const [firstName, ...lastName] = String(provider.provider_name || '').split(' ');
        rows.push({ id: `service-${provider.service_id || service.id}`, provider_user_id: provider.provider_user_id,
          provider_first_name: firstName, provider_last_name: lastName.join(' '),
          organization_name: service.organization_name, organization_type: service.organization_type, is_primary: false });
      }
    }
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
    if (!isCurrent()) return;
    overviewProviders.value = providersFromClientSnapshot(props.client);
  } finally {
    if (isCurrent()) overviewProvidersLoading.value = false;
  }
};

const onSchoolAssignmentUpdated = async ({ clientId, providers: providerList } = {}) => {
  void loadChartTypes();
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
const enrollmentPreferences = ref(props.client?.intake_preferences_json || props.client?.intakePreferences || null);

const checklistClientIsReturning = computed(() => isReturningSchoolClient(props.client));
const showFallContinuationChecklist = computed(
  () => isContinuationServicesSeason() && checklistClientIsReturning.value
);
const showLegacyChecklistFields = computed(() => !showFallContinuationChecklist.value);
const showContinuationServicesChecklist = showFallContinuationChecklist;

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
const showPortalInvites = ref(false);
const addingGuardian = ref(false);
const creatingIntakeGuardian = ref(false);
const addGuardianForm = ref({
  email: '',
  firstName: '',
  lastName: '',
  relationshipTitle: 'Guardian',
  accessEnabled: false,
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

/** Assigned clinicians can view guardian links; admins manage them. */
const canViewGuardians = computed(() => {
  if (canManageGuardians.value) return true;
  const r = String(authStore.user?.role || '').toLowerCase();
  return ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant', 'supervisor'].includes(r);
});
const guardianContactLoader=useLinkedGuardianContact({clientId:computed(()=>props.client?.id),canView:canViewGuardians,guardians,loading:guardiansLoading,error:guardiansError,api});
const overviewLinkedGuardian = computed(() => linkedGuardianSummary(guardians.value, { canView: canViewGuardians.value }));
const overviewGuardianName = computed(() => (overviewGuardianAccount.value ? [overviewGuardianAccount.value.first_name,overviewGuardianAccount.value.last_name].filter(Boolean).join(' ') : '') || guardianIntakeName.value || overviewLinkedGuardian.value?.displayName || null);
const overviewGuardianMeta = computed(() => guardianIntakeEmail.value || guardianIntakePhone.value
  || [overviewLinkedGuardian.value?.contact, overviewLinkedGuardian.value?.additionalCount
    ? `${overviewLinkedGuardian.value.additionalCount} other linked guardian(s)` : ''].filter(Boolean).join(' · '));

const canEditPaperwork = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff'].includes(r) && hasAgencyAccess.value;
});

const paperProcessingAvailable=computed(()=>canEditPaperwork.value&&(isSchoolClientType.value||isPaperPacketClient(props.client)));

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

const addAffiliationForTenant = async (agencyId, bucket) => {
  if (!canEditAccount.value) return;
  const orgId = tenantAddDraft(agencyId, bucket) ? Number(tenantAddDraft(agencyId, bucket)) : null;
  if (!orgId) return;
  try {
    savingAffiliation.value = true;
    assignmentsError.value = '';
    await api.post(`/clients/${props.client.id}/affiliations`, {
      organization_id: orgId,
      is_primary: tenantAddMakePrimary(agencyId, bucket),
      agency_id: Number(agencyId)
    });
    setTenantAddDraft(agencyId, bucket, '');
    setTenantAddMakePrimary(agencyId, bucket, false);
    await Promise.all([fetchClientAffiliations(), loadChartTypes()]);
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to save affiliation';
  } finally {
    savingAffiliation.value = false;
  }
};

async function saveTenantBookingDefaults(agencyId) {
  const aid = Number(agencyId);
  if (!props.client?.id || !aid || savingTenantBookingAgencyId.value) return;
  savingTenantBookingAgencyId.value = aid;
  const draft = ensureTenantBookingDraft(aid);
  draft.error = '';
  draft.hint = '';
  try {
    const payload = {
      agency_id: aid,
      default_office_location_id: draft.officeId ? Number(draft.officeId) : null,
      default_place_of_service: draft.pos || null,
      default_service_location_id: draft.serviceLocationId ? Number(draft.serviceLocationId) : null
    };
    await api.post(`/clients/${props.client.id}/agency-affiliations`, payload);
    await fetchClientAgencyAffiliations();
    const savedDraft = ensureTenantBookingDraft(aid);
    savedDraft.hint = 'Saved.';
    tenantBookingDrafts.value = { ...tenantBookingDrafts.value, [String(aid)]: { ...savedDraft } };
    emit('updated', { keepOpen: true });
  } catch (e) {
    draft.error = e.response?.data?.error?.message || e.message || 'Failed to save booking defaults';
    tenantBookingDrafts.value = { ...tenantBookingDrafts.value, [String(aid)]: { ...draft } };
  } finally {
    savingTenantBookingAgencyId.value = 0;
  }
}

async function suggestDefaultsFromPrimaryProviderForTenant(agencyId) {
  const aid = Number(agencyId);
  const draft = ensureTenantBookingDraft(aid);
  const providerUserId = Number(primaryServiceProviderForTenant(aid)?.provider_user_id || 0);
  if (!providerUserId) {
    draft.error = 'Assign a primary provider first.';
    tenantBookingDrafts.value = { ...tenantBookingDrafts.value, [String(aid)]: { ...draft } };
    return;
  }
  draft.error = '';
  try {
    const res = await api.get(`/users/${providerUserId}/office-assignments`, { skipGlobalLoading: true });
    const list = Array.isArray(res?.data?.assigned) ? res.data.assigned : [];
    const primaryOffice = list.find((r) => r.is_primary || r.isPrimary)
      || list.find((r) => r.is_active !== false && r.isActive !== false)
      || list[0];
    const officeId = Number(
      primaryOffice?.office_location_id
      || primaryOffice?.officeLocationId
      || primaryOffice?.id
      || 0
    );
    if (!officeId) {
      draft.error = 'Primary provider has no office assignment.';
      tenantBookingDrafts.value = { ...tenantBookingDrafts.value, [String(aid)]: { ...draft } };
      return;
    }
    const office = officeOptionsForTenant(aid).find((o) => Number(o.physical_office_location_id || o.id) === officeId || Number(o.id) === officeId);
    if (!office) throw new Error('Configure this agency’s billing identity at the provider’s building before suggesting defaults.');
    const billingOfficeId = Number(office?.id || officeId);
    draft.officeId = String(billingOfficeId);
    const pos = String(
      office?.default_place_of_service || office?.defaultPlaceOfService || draft.pos || '11'
    ).trim();
    if (pos) draft.pos = pos;
    const matchingLoc = serviceLocationForOffice(serviceLocationOptionsForTenant(aid), billingOfficeId, pos);
    draft.serviceLocationId = matchingLoc?.id ? String(matchingLoc.id) : '';
    draft.hint = 'Suggested from provider office — click Save defaults to keep.';
    tenantBookingDrafts.value = { ...tenantBookingDrafts.value, [String(aid)]: { ...draft } };
  } catch (e) {
    draft.error = e.response?.data?.error?.message || e.message || 'Could not load provider office';
    tenantBookingDrafts.value = { ...tenantBookingDrafts.value, [String(aid)]: { ...draft } };
  }
}

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
  return formatAuditTimestamp(dateString);
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
  editingOverview.value && !!terminatedStatusId.value && overviewForm.value.client_status_id === terminatedStatusId.value
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
    const r = await api.get(`/clients/${props.client.id}/admin-note`, { skipGlobalLoading: true });
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
    await api.post(`/clients/${props.client.id}/reopen-enrollment`);
    emit('updated');
  } catch (err) {
    console.error('Failed to reopen enrollment:', err);
    alert(err.response?.data?.error?.message || 'Failed to reopen enrollment');
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

const overviewStatusIdAtEditStart = ref('');
const overviewFormAtEditStart=ref(null);

const hydrateOverviewForm = () => {
  overviewForm.value.full_name = String(props.client?.full_name || '');
  overviewForm.value.initials = String(props.client?.initials || '');
  overviewForm.value.organization_id = props.client?.organization_id ? String(props.client.organization_id) : '';
  overviewForm.value.client_status_id = props.client?.client_status_id ? String(props.client.client_status_id) : '';
  overviewForm.value.termination_reason = String(props.client?.termination_reason || '');
  overviewForm.value.submission_date = props.client?.submission_date ? String(props.client.submission_date).slice(0, 10) : '';
  overviewForm.value.insurance_type_id = props.client?.insurance_type_id ? String(props.client.insurance_type_id) : '';
  if (!overviewForm.value.insurance_type_id && props.client?.primary_insurer_name) {
    const carrier = String(props.client.primary_insurer_name).trim().toLowerCase();
    const types = overviewInsuranceTypes.value || [];
    const exact = types.find((t) => String(t.label || '').trim().toLowerCase() === carrier);
    const commercial = types.find((t) => /commercial/i.test(String(t.label || '')) || String(t.insurance_key || '') === 'commercial_other');
    const selfPay = types.find((t) => /self\s*pay/i.test(String(t.label || '')) || String(t.insurance_key || '') === 'self_pay');
    const pick = exact
      || (/\bself[-\s]?pay\b/.test(carrier) ? selfPay : null)
      || commercial
      || null;
    if (pick?.id) overviewForm.value.insurance_type_id = String(pick.id);
  }
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
  const sex=String(props.client?.gender || '').trim();
  overviewForm.value.gender = sexSelectOptions.find(o=>o.value===sex.toLowerCase()||o.label.toLowerCase()===sex.toLowerCase())?.value || sex;
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
  if (chartHub.value !== 'account' || effectiveHubSub.value !== 'profile') {
    setChartNav('account', 'profile');
  }
  editingOverview.value = true;
  profileDetailsPulseHint.value = false;
  hydrateOverviewForm();
  overviewStatusIdAtEditStart.value = overviewForm.value.client_status_id || '';
  overviewFormAtEditStart.value=JSON.parse(JSON.stringify(overviewForm.value));
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

const statusSelectEl=ref(null);
const headerStatusOpen=ref(false);
async function editHeaderStatus(){if(canEditAccount.value && await saveClientWorkspaceDrafts()!==false)headerStatusOpen.value=true;}
function onHeaderStatusSaved(client){headerStatusOpen.value=false;overviewForm.value.client_status_id=String(client.client_status_id||'');overviewStatusIdAtEditStart.value=overviewForm.value.client_status_id;emit('updated',{keepOpen:true,client});}
watch(()=>Number(props.client?.id),()=>headerStatusOpen.value=false);


const cancelEditOverview = () => {
  editingOverview.value = false;
  hydrateOverviewForm();
};

const jumpToEditDemographics = async () => {
  // Demographics fields live in the profile editor; 'demographics' is not a tab.
  setChartNav('account', 'profile');
  await startEditOverview(true);
};

const applyingIntakeSex = ref(false);
const applyIntakeSexToRecord = async () => {
  if (!canEditAccount.value || !props.client?.id || !intakeSexLabel.value) return;
  const raw = String(props.client?.recorded_sex || intakeRecordedSex() || '').trim();
  if (!raw) return;
  const matched = sexSelectOptions.find(
    (o) => o.value === raw.toLowerCase() || o.label.toLowerCase() === raw.toLowerCase()
  );
  const gender = matched?.value || raw.toLowerCase();
  try {
    applyingIntakeSex.value = true;
    await api.put(`/clients/${props.client.id}`, { gender });
    emit('updated', { keepOpen: true });
  } catch (e) {
    alert(e?.response?.data?.error?.message || e?.message || 'Could not apply intake sex.');
  } finally {
    applyingIntakeSex.value = false;
  }
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
      submission_date: overviewForm.value.submission_date ? String(overviewForm.value.submission_date) : null,
      insurance_type_id: overviewForm.value.insurance_type_id ? Number(overviewForm.value.insurance_type_id) : null,
      doc_date: overviewForm.value.doc_date ? String(overviewForm.value.doc_date) : null,
      school_year: String(overviewForm.value.school_year || '').trim() || null,
      grade: normalizeGradeForSave(overviewForm.value.grade),
      primary_client_language: String(overviewForm.value.primary_client_language || '').trim() || null,
      primary_parent_language: String(overviewForm.value.primary_parent_language || '').trim() || null,
      skills: !!overviewForm.value.skills,
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
    const statusChanged = String(overviewForm.value.client_status_id || '')
      !== String(overviewStatusIdAtEditStart.value || '');
    if (statusChanged) {
      payload.client_status_id = overviewForm.value.client_status_id
        ? Number(overviewForm.value.client_status_id)
        : null;
    }
    for(const key of Object.keys(payload))if(key!=='client_status_id'&&overviewFormAtEditStart.value&&JSON.stringify(overviewFormAtEditStart.value[key])===JSON.stringify(overviewForm.value[key]))delete payload[key];
    if(!Object.keys(payload).length){editingOverview.value=false;return;}
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

const fetchGuardians = () => Promise.all([guardianContactLoader.load(), loadChartTypes()]);

const openAddGuardian = () => {
  lastInviteLink.value = '';
  const gip = guardianIntakeProfile.value;
  const hasIntakeData = gip && (gip.email || gip.firstName || gip.lastName);
  addGuardianForm.value = {
    email: gip?.email || '',
    firstName: gip?.firstName || '',
    lastName: gip?.lastName || '',
    relationshipTitle: gip?.relationship || 'Guardian',
    accessEnabled: false,
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
    accessEnabled: false,
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
      relationshipVerified: addGuardianForm.value.accessEnabled === true,
      sendInvitation: false,
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
  if (!canManageGuardians.value || isSelfIntakeContact.value) return;
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
      accessEnabled: false,
      sendInvitation: false,
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
  if (!window.confirm('Mark this relationship as incorrect? This revokes this account’s access to this client and keeps an audit record.')) return;
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

const membershipAccess = useAgencyMemberships({ api, actorId: computed(() => authStore.user?.id), memberships: myAgencies });
const agencyAccessLoading = membershipAccess.loading;
const agencyAccessError = membershipAccess.error;
const fetchAccess = async () => {
  const clientId = Number(props.client?.id);
  if (await membershipAccess.load() && clientId === Number(props.client?.id)) {
    selectedAgencyId.value = props.client?.agency_id ? String(props.client.agency_id) : '';
  }
};

let clientAffiliationsGeneration = 0;
const fetchClientAgencyAffiliations = async () => {
  const generation = ++clientAffiliationsGeneration;
  const clientId = props.client.id;
  clientAgencyAffiliations.value = [];
  try {
    const r = await api.get(`/clients/${clientId}/agency-affiliations`, { skipGlobalLoading: true });
    if (generation !== clientAffiliationsGeneration || clientId !== props.client.id) return;
    clientAgencyAffiliations.value = Array.isArray(r.data) ? r.data : [];
    tenantBookingDrafts.value = {};
    await loadAllTenantCatalogs();
  } catch {
    if (generation !== clientAffiliationsGeneration || clientId !== props.client.id) return;
    clientAgencyAffiliations.value = [];
  }
};

const fetchAvailableAffiliations = async () => {
  if (!canEditAccount.value) return;
  // Prefer per-tenant catalogs; keep legacy flat list for chart agency as fallback.
  try {
    await loadAllTenantCatalogs();
    const agencyId = props.client?.agency_id;
    if (!agencyId) {
      availableAffiliations.value = [];
      return;
    }
    availableAffiliations.value = affiliatedOrgsByAgencyId.value[String(agencyId)] || [];
  } catch {
    availableAffiliations.value = [];
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

const fetchClientAffiliations = async () => {
  // Load for chart context (learning surfaces) even when the viewer cannot edit assignments.
  if (!props.client?.id) return;
  const clientId = Number(props.client.id);
  try {
    affiliationsLoading.value = true;
    if (canEditAccount.value) assignmentsError.value = '';
    const r = await api.get(`/clients/${clientId}/affiliations`, { params: { includeHistory: true }, skipGlobalLoading: true });
    if (clientId !== Number(props.client?.id)) return;
    const rows = Array.isArray(r.data) ? r.data : [];
    affiliations.value = rows.filter(row => Number(row.is_active) === 1);
    programHistoryRevision.value++;
    if (!rosterAffiliations.value.some(row => Number(row.organization_id) === Number(selectedAssignmentOrgId.value))) selectedAssignmentOrgId.value = '';
    if (canEditAccount.value && !selectedAssignmentOrgId.value) {
      const primary = rosterAffiliations.value.find((a) => a?.is_primary) || rosterAffiliations.value[0] || null;
      if (primary?.organization_id) selectedAssignmentOrgId.value = String(primary.organization_id);
    }
    if (canEditAccount.value) await refreshOverviewProviders();
  } catch (e) {
    if (clientId !== Number(props.client?.id)) return;
    if (canEditAccount.value) {
      assignmentsError.value = e.response?.data?.error?.message || 'Failed to load affiliations';
    }
    affiliations.value = [];
    if (canEditAccount.value) overviewProviders.value = [];
  } finally {
    if (clientId === Number(props.client?.id)) affiliationsLoading.value = false;
  }
};

const fetchChartAgencyAffiliatedOrgs = async () => {
  const agencyId = Number(activeChartAgencyId.value || 0);
  if (!agencyId) {
    chartAgencyAffiliatedOrgs.value = [];
    return;
  }
  try {
    const r = await api.get(`/agencies/${agencyId}/affiliated-organizations`, { skipGlobalLoading: true });
    chartAgencyAffiliatedOrgs.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    chartAgencyAffiliatedOrgs.value = [];
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
    await Promise.all([fetchClientAffiliations(), loadChartTypes()]);
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
    await Promise.all([fetchClientAffiliations(), loadChartTypes()]);
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
    await Promise.all([fetchClientAffiliations(), loadChartTypes()]);
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to remove affiliation';
  } finally {
    savingAffiliation.value = false;
  }
};

const providerScheduleForSelectedOrg = ref([]);
let providerOptionRequest = 0;
let providerAssignmentRequest = 0;

const fetchProviderOptions = async () => {
  const request = ++providerOptionRequest;
  if (!canEditAccount.value) return;
  const clientId = Number(props.client?.id);
  const orgId = selectedAssignmentOrgId.value ? Number(selectedAssignmentOrgId.value) : null;
  const activeAgencyId = Number(selectedAgencyId.value || props.client?.agency_id);
  const agencyId = orgIdsForAgency(activeAgencyId).has(orgId) ? activeAgencyId
    : Number((tenantMemberships.value || []).find(row => orgIdsForAgency(row.agency_id).has(orgId))?.agency_id || activeAgencyId);
  const isCurrent = () => request === providerOptionRequest && clientId === Number(props.client?.id) && orgId === Number(selectedAssignmentOrgId.value);
  providerOptions.value = [];
  providerClinicalFacets.value = {};
  if (!agencyId || !orgId) {
    providerScheduleForSelectedOrg.value = [];
    providerOptions.value = [];
    return;
  }
  try {
    // Pull provider_school_assignments for this org (day/time rows) AND
    // also allow providers affiliated with the org but not scheduled yet (rare; supports day='Unknown').
    const [sched, aff, eligibleResponse] = await Promise.all([
      api.get('/provider-scheduling/assignments', { params: { agencyId, schoolOrganizationId: orgId } }),
      api.get('/provider-scheduling/affiliated-providers', { params: { agencyId, schoolOrganizationId: orgId } }),
      api.get('/office-clients/providers', { params: { clientId, agencyIds: String(agencyId) }, skipGlobalLoading: true })
    ]);
    if (!isCurrent()) return;
    const eligibleIds = new Set((eligibleResponse.data?.providers || []).map(provider => Number(provider.id)));
    const rows = (Array.isArray(sched.data) ? sched.data : []).filter(row => eligibleIds.has(Number(row.provider_user_id)));
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
      if (!pid || !eligibleIds.has(pid)) continue;
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
        if (isCurrent()) providerClinicalFacets.value = facetRes.data?.facetsByUserId || {};
      } catch {
        if (isCurrent()) providerClinicalFacets.value = {};
      }
    } else {
      providerClinicalFacets.value = {};
    }
  } catch {
    if (!isCurrent()) return;
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
  editProviderClientAlert.value = '';
  editProviderUserId.value = pa?.provider_user_id ? String(pa.provider_user_id) : '';
  editProviderDay.value = pa?.service_day ? String(pa.service_day) : 'Unknown';
};

const cancelEditProviderAssignment = () => {
  editingProviderAssignmentId.value = null;
  editProviderClientAlert.value = '';
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
    const clientAlert = editProviderClientAlert.value.trim();
    await api.post(`/clients/${props.client.id}/provider-assignments`, {
      organization_id: orgId,
      provider_user_id: nextProviderUserId,
      service_day: nextDay,
      ...(pa?.is_primary ? { is_primary: true } : {}),
      ...(clientAlert ? { client_alert: clientAlert } : {})
    });
    editProviderClientAlert.value = '';

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

const schoolAffiliationCount = computed(
  () => (affiliations.value || []).filter((a) => String(a.organization_type || '').toLowerCase() === 'school').length
);
const programAffiliationCount = computed(
  () => (affiliations.value || []).filter((a) => {
    const t = String(a.organization_type || '').toLowerCase();
    return t === 'program';
  }).length
);
const learningAffiliationCount = computed(
  () => (affiliations.value || []).filter((a) => String(a.organization_type || '').toLowerCase() === 'learning').length
);
const canSuggestOfficeFromProvider = computed(() => !!primaryServiceProviderForTenant(activeChartAgencyId.value));

function syncClientBookingDefaultsFromClient() {
  const c = props.client || {};
  clientDefaultOfficeId.value = c.default_office_location_id ? String(c.default_office_location_id) : '';
  clientDefaultPos.value = c.default_place_of_service ? String(c.default_place_of_service) : '';
  clientDefaultServiceLocationId.value = c.default_service_location_id
    ? String(c.default_service_location_id)
    : '';
  clientBookingDefaultsSavedHint.value = '';
  clientBookingDefaultsError.value = '';
}

async function loadClientBookingDefaultsOptions() {
  const agencyId = Number(selectedAgencyId.value || props.client?.agency_id || 0);
  if (!agencyId) {
    clientOfficeOptions.value = [];
    clientServiceLocationOptions.value = [];
    return;
  }
  try {
    const [officesRes, locsRes] = await Promise.all([
      api.get('/offices', { skipGlobalLoading: true }),
      canAccessMedicalBilling(authStore.user, agencyId)
        ? api.get('/medical-billing/service-locations', { params: { agencyId }, skipGlobalLoading: true }).catch(() => null)
        : Promise.resolve(null)
    ]);
    clientOfficeOptions.value = officesForAgency(Array.isArray(officesRes?.data) ? officesRes.data : (officesRes?.data?.locations || []), agencyId);
    if (!Array.isArray(clientOfficeOptions.value)) clientOfficeOptions.value = [];
    const locs = locsRes?.data?.items || locsRes?.data?.locations || locsRes?.data?.serviceLocations || locsRes?.data || [];
    clientServiceLocationOptions.value = Array.isArray(locs) ? locs : [];
  } catch {
    clientOfficeOptions.value = [];
    clientServiceLocationOptions.value = [];
  }
}

async function saveClientBookingDefaults() {
  if (!props.client?.id || savingClientBookingDefaults.value) return;
  savingClientBookingDefaults.value = true;
  clientBookingDefaultsError.value = '';
  clientBookingDefaultsSavedHint.value = '';
  try {
    await api.put(`/clients/${props.client.id}`, {
      default_office_location_id: clientDefaultOfficeId.value ? Number(clientDefaultOfficeId.value) : null,
      default_place_of_service: clientDefaultPos.value || null,
      default_service_location_id: clientDefaultServiceLocationId.value
        ? Number(clientDefaultServiceLocationId.value)
        : null
    });
    await fetchClientAgencyAffiliations();
    clientBookingDefaultsSavedHint.value = 'Saved.';
    emit('updated', { keepOpen: true });
  } catch (e) {
    clientBookingDefaultsError.value =
      e.response?.data?.error?.message || e.message || 'Failed to save booking defaults';
  } finally {
    savingClientBookingDefaults.value = false;
  }
}

async function suggestDefaultsFromPrimaryProvider() {
  const providerUserId = Number(primaryServiceProviderForTenant(activeChartAgencyId.value)?.provider_user_id || 0);
  if (!providerUserId) {
    clientBookingDefaultsError.value = 'Assign a primary provider first.';
    return;
  }
  clientBookingDefaultsError.value = '';
  try {
    const res = await api.get(`/users/${providerUserId}/office-assignments`, { skipGlobalLoading: true });
    const list = Array.isArray(res?.data?.assigned) ? res.data.assigned : [];
    const primaryOffice = list.find((r) => r.is_primary || r.isPrimary)
      || list.find((r) => r.is_active !== false && r.isActive !== false)
      || list[0];
    const officeId = Number(
      primaryOffice?.office_location_id
      || primaryOffice?.officeLocationId
      || primaryOffice?.id
      || 0
    );
    if (!officeId) {
      clientBookingDefaultsError.value = 'Primary provider has no office assignment.';
      return;
    }
    clientDefaultOfficeId.value = String(officeId);
    const office = clientOfficeOptions.value.find((o) => Number(o.id) === officeId);
    const pos = String(
      office?.default_place_of_service || office?.defaultPlaceOfService || clientDefaultPos.value || '11'
    ).trim();
    if (pos) clientDefaultPos.value = pos;
    const matchingLoc = clientServiceLocationOptions.value.find((loc) => {
      const locPos = String(loc.placeOfService || loc.place_of_service || '');
      const billingOffice = Number(loc.billing_office_location_id || loc.billingOfficeLocationId || 0);
      return (billingOffice && billingOffice === officeId) || (locPos && locPos === pos);
    });
    if (matchingLoc?.id) clientDefaultServiceLocationId.value = String(matchingLoc.id);
    clientBookingDefaultsSavedHint.value = 'Suggested from provider office — click Save defaults to keep.';
  } catch (e) {
    clientBookingDefaultsError.value =
      e.response?.data?.error?.message || e.message || 'Could not load provider office';
  }
}

const reloadProviderAssignments = async () => {
  const request = ++providerAssignmentRequest;
  if (!canEditAccount.value) return;
  const clientId = Number(props.client?.id);
  const orgId = selectedAssignmentOrgId.value ? Number(selectedAssignmentOrgId.value) : null;
  if (!orgId) {
    providerAssignments.value = [];
    return;
  }
  const isCurrent = () => request === providerAssignmentRequest && clientId === Number(props.client?.id) && orgId === Number(selectedAssignmentOrgId.value);
  try {
    providerAssignmentsLoading.value = true;
    assignmentsError.value = '';
    const r = await api.get(`/clients/${clientId}/provider-assignments`, { params: { organizationId: orgId } });
    if (!isCurrent()) return;
    providerAssignments.value = Array.isArray(r.data) ? r.data : [];
    // Keep the Overview provider list in sync (across affiliations).
    await refreshOverviewProviders();
  } catch (e) {
    if (!isCurrent()) return;
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to load provider assignments';
    providerAssignments.value = [];
  } finally {
    if (isCurrent()) providerAssignmentsLoading.value = false;
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
    const clientAlert = addProviderClientAlert.value.trim();
    await api.post(`/clients/${props.client.id}/provider-assignments`, {
      organization_id: orgId,
      provider_user_id: providerUserId,
      service_day: day,
      is_primary: addProviderMakePrimary.value === true,
      ...(clientAlert ? { client_alert: clientAlert } : {})
    });
    addProviderUserId.value = '';
    addProviderDay.value = '';
    addProviderMakePrimary.value = true;
    addProviderClientAlert.value = '';
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


onBeforeRouteLeave(saveClientWorkspaceDrafts);
const handleClose = async () => {
  if(await saveClientWorkspaceDrafts()===false)return;
  emit('close');
};

const onOverviewAlertClick = (alert) => {
  if (alert?.tab) goChartSub(alert.tab);
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
  if (newTab !== 'medical-record' && newTab !== 'clinical-notes' && medicalRecordEncounterId.value) {
    medicalRecordEncounterId.value = null;
    emit('encounter-change', null);
  }
  if (newTab === 'history' && history.value.length === 0) {
    fetchHistory();
  } else if ((newTab === 'access' || newTab === 'audit') && accessLog.value.length === 0) {
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
    loadClientBookingDefaultsOptions();
    syncClientBookingDefaultsFromClient();
  } else if (newTab === 'phi') {
    fetchDocChecklist();
    loadPaperworkTabData();
  } else if (
    newTab === 'clinical'
    || newTab === 'clinical-notes'
    || newTab === 'student-summary'
    || newTab === 'learning-plans'
  ) {
    fetchBillingDiagnoses();
  } else if (newTab === 'phi' || newTab === 'account' || newTab === 'demographics') {
    fetchDemographics();
    if (newTab === 'account' || newTab === 'phi') fetchGuardians();
  } else if (newTab === 'demographics') {
    fetchDemographics();
  } else if (newTab === 'surveys' && clientSurveyResponses.value.length === 0) {
    fetchClientSurveyResponses();
  }
});

watch(chartHub, (hub) => {
  if (hub === 'account') {
    fetchDemographics();
    fetchGuardians();
  }
});


let chartContextSeq = 0;
async function onChartSetupUpdated(updated) {
  const id = Number(props.client?.id || 0);
  if (!id) return;
  void loadCareSummary();
  if (updated?.id) {
    emit('updated', { keepOpen: true, client: updated });
    return;
  }
  try {
    const refreshed = await api.get(`/clients/${id}`, { skipGlobalLoading: true });
    emit('updated', { keepOpen: true, client: refreshed.data });
  } catch {
    emit('updated', { keepOpen: true });
  }
}

function syncOpenClientForm() {
  selfGuardianEmail.value = String(props.client?.email || '').trim();
  skillsValue.value = isSkillsClientFlag(props.client?.skills);
  if (!editingOverview.value) hydrateOverviewForm();
  syncClientBookingDefaultsFromClient();
}

watch(() => Number(props.client?.id || 0), async (id, prev) => {
  const seq = ++chartContextSeq;
  if (!id) return;
  if (id !== prev) {
    headerCollapsed.value = false;
    providerAssignmentOpen.value = false;
    servicesByAgency.value = {};
    clientActionsOpen.value = false;
    overviewProviderRequest++;
    providerOptionRequest++;
    providerAssignmentRequest++;
    overviewProviders.value = [];
    providerAssignments.value = [];
    providerOptions.value = [];
    providerScheduleForSelectedOrg.value = [];
    providerClinicalFacets.value = {};
    selectedAssignmentOrgId.value = '';
    affiliations.value = [];
    clientAgencyAffiliations.value = [];
    selectedAgencyId.value = props.client?.agency_id ? String(props.client.agency_id) : '';
    addProviderUserId.value = '';
    addProviderDay.value = '';
    editingProviderAssignmentId.value = null;
    editingStatus.value = false;
    editingOverview.value = false;
    clientCodeDraft.value = '';
  }
  syncOpenClientForm();
  await Promise.all([
    loadOverviewOptions(),
    fetchDocChecklist(),
    fetchClientAgencyAffiliations(),
    fetchClientAffiliations(),
    fetchAccess(),
    fetchChartAgencyAffiliatedOrgs(),
    refreshOverviewProviders(),
    fetchAdminNote(),
    loadClientDisclosureStatus().catch(() => {})
  ]);
  if (seq !== chartContextSeq) return;
  if (activeTab.value === 'clinical' || activeTab.value === 'student-summary') {
    fetchBillingDiagnoses();
  }
}, { immediate: true });

watch(() => props.client, () => {
  if (!props.client?.id) return;
  syncOpenClientForm();
});

watch(activeChartAgencyId, () => {
  overviewProviders.value = [];
  refreshOverviewProviders();
  fetchChartAgencyAffiliatedOrgs();
});

watch(showLearningChartSurfaces, (show) => {
  if (show) return;
  const onLearningSurface = ['student-summary', 'learning-plans'].includes(String(activeTab.value || ''))
    || ['student-summary', 'learning-plans'].includes(String(hubSub.value || ''));
  if (!onLearningSurface) return;
  goChartSub(showClinicalChartSurfaces.value ? 'clinical' : 'overview');
});

watch(effectiveClientType, async (nextType, prevType) => {
  if (nextType === prevType) return;
  if (
    activeTab.value === 'clinical'
    || activeTab.value === 'student-summary'
    || ['clinical', 'learning'].includes(nextType)
  ) {
    await fetchBillingDiagnoses();
  }
  const hub = resolveChartTab(activeTab.value).hub;
  const allowedHubs = new Set((tabs.value || []).map((t) => t.id));
  if (!allowedHubs.has(hub)) {
    activeTab.value = 'overview';
    hubSub.value = '';
  }
});

const hydrateChecklist = async () => {
  const clientId = props.client.id;
  enrollmentPreferences.value = props.client?.intake_preferences_json || props.client?.intakePreferences || null;
  try {
    const r = await api.get(`/clients/${props.client.id}`);
    const c = r.data || {};
    if (Number(props.client.id) !== Number(clientId)) return;
    enrollmentPreferences.value = c.intake_preferences_json || c.intakePreferences || null;
    checklist.value.parentsContactedAt = c.parents_contacted_at ? String(c.parents_contacted_at).slice(0, 10) : '';
    checklist.value.parentsContactedSuccessful =
      c.parents_contacted_successful === null || c.parents_contacted_successful === undefined
        ? ''
        : (c.parents_contacted_successful ? 'true' : 'false');
    checklist.value.firstServiceAt = c.first_service_at ? String(c.first_service_at).slice(0, 10) : '';
    checklist.value.continuation = parseContSvcJson(c.continuation_services_json);
    await fetchChecklistAgencySchools();
    const who = c.checklist_updated_by_name || null;
    const when = c.checklist_updated_at ? formatAuditTimestamp(c.checklist_updated_at) : null;
    checklistAuditText.value = who && when ? `Last updated by ${who} on ${when}` : (when ? `Last updated on ${when}` : '');
  } catch {
    // ignore
  }
};

const saveChecklist = async () => {
  try {
    savingChecklist.value = true;
    const payload = {};
    if (showLegacyChecklistFields.value) {
      payload.parentsContactedAt = checklist.value.parentsContactedAt || null;
      payload.parentsContactedSuccessful =
        checklist.value.parentsContactedSuccessful === ''
          ? null
          : (checklist.value.parentsContactedSuccessful === 'true');
      payload.firstServiceAt = checklist.value.firstServiceAt || null;
    }
    if (showContinuationServicesChecklist.value) {
      const cont = contSvcPayload();
      if (!cont?.plan) {
        alert('Select a fall confirmation / continuation option.');
        return;
      }
      if (
        ['not_continue_school', 'unable_to_contact_parent', 'other'].includes(cont.plan)
        && !String(cont.privateComment || '').trim()
      ) {
        alert('A private comment for admin/support is required.');
        return;
      }
      payload.continuationServices = cont;
    }
    const r = await api.put(`/clients/${props.client.id}/compliance-checklist`, payload);
    const c = r.data || {};
    const who = c.checklist_updated_by_name || null;
    const when = c.checklist_updated_at ? formatAuditTimestamp(c.checklist_updated_at) : null;
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
      fields: withIntakeSex(clientIntake.filter(include))
    },
    {
      id: 'guardian_intake',
      title: 'Guardian (intake)',
      subtitle: 'Reported by the guardian',
      fields: showDependentFields.value ? guardianIntake.filter(include) : []
    }
  ];
});

function intakeRecordedSex() {
  const fields = (demoSections.value || []).flatMap((section) => section.fields || []);
  const match = fields.find((field) => /^(sex|gender|child_sex|child_gender|client_sex|client_gender)$/i.test(String(field?.key || '')) && String(field?.value || '').trim());
  return match ? String(match.value).trim() : '';
}

function chartSexLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({m:'Male',f:'Female',x:'X',u:'Unknown',unknown:'Unknown'})[key]
    || sexSelectOptions.find(option=>option.value===key)?.label || '';
}
const recordSexLabel = computed(() => chartSexLabel(props.client?.recorded_sex || props.client?.sex || props.client?.gender));
const intakeSexLabel = computed(() => chartSexLabel(intakeRecordedSex()));
function isIntakeSexField(field) {
  const key = String(field?.key || '').trim();
  const label = String(field?.label || '').trim();
  return /^(sex|gender|child_sex|child_gender|client_sex|client_gender)$/i.test(key)
    || /^(child\s+)?(sex|gender)$/i.test(label);
}
function withIntakeSex(fields) {
  const rest = fields.filter((field) => !isIntakeSexField(field));
  if (!intakeSexLabel.value) return rest.length === fields.length ? fields : rest;
  return [{ key: 'sex', label: 'Sex', value: intakeSexLabel.value }, ...rest];
}

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
      value: recordSexLabel.value,
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
    ...(showDependentFields.value ? [{
      key: 'primary_parent_language',
      label: 'Guardian Primary Language',
      value: String(c.primary_parent_language || guardianIntakeProfile.value?.primaryLanguage || '').trim(),
      important: false
    }] : []),
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
    { id: 'guardian_intake', title: 'Guardian (intake)', subtitle: 'Reported by the guardian', fields: showDependentFields.value ? guardianIntake.filter(include) : [] },
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

const printSurveyTrends = async () => {
  try { await api.post('/account-security/activity-protection/print', {}, { headers: { 'X-Account-Security': '1' } }); } catch (e) { clientSurveysError.value = e.response?.data?.error?.message || 'Print access needs review.'; return; }
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
  // Log that this profile was viewed (best-effort)
  if (props.client?.id) {
    api.post(`/clients/${props.client.id}/log-view`, {}, { skipGlobalLoading: true }).catch(() => {});
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
    await Promise.all([fetchClientAffiliations(), loadChartTypes()]);
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
      activeTab.value = 'phi';
      hubSub.value = 'documents';
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
      activeTab.value = 'medical-record';
      hubSub.value = 'medical-record';
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
    const resolved = resolveChartTab(desired);
    const allowedHubs = new Set((tabs.value || []).map((x) => x.id));
    if (!allowedHubs.has(resolved.hub) && desired !== 'skill-builders') return;
    // Do not fight an in-progress hub click: URL catch-up should not reopen another hub.
    if (chartHub.value === resolved.hub && effectiveHubSub.value === (resolved.sub || effectiveHubSub.value)) {
      if (resolved.sub) hubSub.value = resolved.sub;
      return;
    }
    setChartNav(resolved.hub, resolved.sub || '');
    if (desired === 'phi' || desired === 'documents') {
      activeTab.value = 'phi';
      hubSub.value = 'documents';
    } else if (
      RECORDS_SECONDARY_SUBS.includes(resolved.sub)
      || ['intake-note', 'medical-record', 'clinical-notes', 'clinical', 'clinical-summary', 'notes'].includes(desired)
    ) {
      if (desired === 'notes') activeTab.value = 'clinical-notes';
      else if (desired === 'clinical-summary') activeTab.value = 'clinical';
      else activeTab.value = desired;
      hubSub.value = resolved.sub;
    }
  },
  { immediate: true }
);

// Hub passes initial-tab="skill-builders" while the client row may load without `skills` first; apply when flag appears.
watch(
  () => isSkillsClientFlag(props.client?.skills),
  (on) => {
    const desired = String(props.initialTab || '').trim();
    if (desired !== 'skill-builders' || !on) return;
    activeTab.value = 'skill-builders';
    hubSub.value = 'skill-builders';
  },
  { immediate: true }
);

// If the tab set shrinks (e.g. skills cleared), avoid a blank panel.
watch(
  () => (tabs.value || []).map((t) => t.id).join(','),
  () => {
    const hub = resolveChartTab(activeTab.value).hub;
    const allowedHubs = new Set((tabs.value || []).map((t) => t.id));
    if (!allowedHubs.has(hub)) {
      activeTab.value = 'overview';
      hubSub.value = '';
    }
  }
);

watch(
  () => selectedAssignmentOrgId.value,
  async () => {
    addProviderUserId.value = '';
    addProviderDay.value = '';
    addProviderMakePrimary.value = true;
    editingProviderAssignmentId.value = null;
    providerAssignments.value = [];
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
  background: var(--bg-card, var(--bg));
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
  background: var(--bg-card, var(--bg));
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

.client-actions-overlay { z-index: 10001; padding: 16px; }
.client-actions-dialog { width: min(1760px, 100%); max-height: 96dvh; overflow: auto; border-radius: 12px; background: var(--bg-card, white); }
.client-actions-dialog :deep(.ob-panel--modal) { width: 100%; max-width: none; max-height: 96dvh; }

.modal-content.large {
  background: var(--bg-card, var(--bg));
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
.cdp-header-toggle {
  padding: 7px 10px;
  border: 1px solid var(--border, #d6e2ef);
  border-radius: 8px;
  background: #fff;
  color: var(--text-primary, #173c62);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.cdp-header-toggle:focus-visible { outline: 2px solid var(--primary, #166534); outline-offset: 2px; }
.cdp-compact-id { font-size: 12px; color: var(--text-secondary, #526d89); }
.modal-header.cdp-header.cdp-header--collapsed { padding-top: 8px; padding-bottom: 8px; }
.cdp-school-portal__facts { display: flex; flex-wrap: wrap; gap: 16px 28px; margin-bottom: 24px; }
.detail-section.cdp-school-portal { min-height: 0; margin-bottom: 24px; }
.cdp-school-portal__facts dt { font-size: 12px; color: var(--text-secondary, #526d89); }
.cdp-school-portal__facts dd { margin: 4px 0 0; font-weight: 600; }
.cdp-school-portal__documents { margin: 12px 0; border: 1px solid var(--border, #d6e2ef); border-radius: 10px; padding: 12px; background: #fff; }
.cdp-school-portal__documents > summary { cursor: pointer; font-weight: 600; }
.cdp-school-portal__documents[open] > summary { margin-bottom: 16px; }
.modal-header.cdp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(58, 76, 107, 0.10);
  background: #fff;
}

.cdp-header-main {
  align-self:flex-start;
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
  flex: 1 1 580px;
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
  flex:1 1 100%;
  margin: 0;
  font-family: var(--font-display, var(--font-header));
  font-size: 17px;
  line-height: 1.25;
  font-weight: 750;
  color: var(--secondary, #1D2633);
  letter-spacing: -0.01em;
  white-space: normal;
}
.cdp-title-link {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: var(--primary, #2e9a43);
  cursor: pointer;
  text-align: left;
}
.cdp-title-link:hover {
  text-decoration: underline;
}

.cdp-identity-line {
  flex-basis: 100%;
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
.cdp-status-edit{font:inherit;cursor:pointer}.cdp-status-edit:focus-visible{outline:2px solid #1d4f8a;outline-offset:3px}
.cdp-pill .mono { font-size: 11px; }

.cdp-pill__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--primary, #B80016);
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
  color: var(--primary, #B80016);
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
  flex: 0 1 auto;
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
  background: var(--primary, #B80016);
  border: 1px solid rgba(155, 115, 20, 0.35);
  color: #1D2633;
  box-shadow: 0 1px 2px rgba(29, 38, 51, 0.08);
  transition: background 0.12s ease, transform 0.12s ease, box-shadow 0.12s ease;
}
.cdp-btn-primary:hover,
.cdp-open-full:hover,
.cdp-btn-gold:hover {
  background: var(--primary-light, #D32D42);
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
  grid-template-columns: minmax(0, 1fr);
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
.cdp-clinician-link {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 3px;
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

.cdp-care-section {
  padding: clamp(16px, 2vw, 24px);
  border: 1px solid var(--border, #d8e3ed);
  border-radius: 12px;
  background: var(--bg-card, #fff);
}
.cdp-care-section,
.cdp-contacts-section {
  margin-bottom: 20px;
}
.cdp-affiliated-wrap {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
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
.cdp-school-profile-item--assignment {
  flex: 1 1 100%;
  min-width: min(100%, 420px);
}
.cdp-strip-input {
  min-width: 88px;
  max-width: 160px;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid var(--border, #d7e0d9);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  background: #fff;
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
  border-color: var(--primary, #B80016);
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

.casg-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 14px;
}
.casg-title {
  margin: 0 0 4px;
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
}
.casg-subtitle {
  margin: 0;
  font-size: 0.88rem;
  color: #64748b;
  max-width: 52rem;
  line-height: 1.4;
}
.casg-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.casg-stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #0f766e;
  font-size: 0.78rem;
  font-weight: 600;
}
.casg-stat strong { font-weight: 800; }
.casg-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.casg-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
}
.casg-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.casg-card-head h4 {
  margin: 0 0 4px;
  font-size: 0.98rem;
  font-weight: 800;
  color: #0f172a;
}
.casg-card-hint {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.4;
}
.casg-badge {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: capitalize;
}
.casg-badge--ok {
  background: #ccfbf1;
  color: #0f766e;
}
.casg-badge--soft {
  background: #ecfeff;
  color: #0e7490;
}
.casg-tenant-cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.casg-tenant-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 12px 14px;
}
.casg-tenant-card--active {
  border-color: #99f6e4;
  background: #f0fdfa;
}
.casg-tenant-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.casg-tenant-card__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.casg-tenant-card__name {
  font-weight: 800;
  font-size: 1rem;
  color: #0f172a;
}
.casg-tenant-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.casg-tenant-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}
.casg-tenant-section__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 0.9rem;
  font-weight: 800;
  color: #0f172a;
}
.casg-tenant-section__title span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #0f766e;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
}
.casg-affil-list {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.casg-affil-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.casg-affil-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.casg-add-row {
  display: flex;
  gap: 10px;
  align-items: end;
  margin-top: 12px;
  flex-wrap: wrap;
}
.casg-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.casg-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
}
.casg-card-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
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

.chart-demographics .ov-card { min-width: 0; }
.chart-demographics .ov-row { display: grid; grid-template-columns: minmax(7rem, 1fr) minmax(0, 2fr); align-items: baseline; gap: 8px 16px; }
.chart-demographics .ov-row-value { overflow-wrap: anywhere; }
@media (max-width: 680px) { .chart-demographics .ov-row { grid-template-columns: 1fr; } }
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
  border-left: 3px solid #B80016;
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
  background: transparent;
}
.cdp-page-body.client-chart .modal-header.cdp-header {
  border-radius: 0;
  border: none;
  border-bottom: 1px solid var(--border);
  box-shadow: none;
}
.cdp-page-body.client-chart .cc-tab-rail {
  border: none;
  border-bottom: 1px solid var(--border);
}
.cdp-page-body.client-chart .tab-content {
  border: none;
  border-radius: 0;
  box-shadow: none;
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
.checklist-fall-banner {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  color: #92400e;
  font-size: 13px;
  line-height: 1.45;
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
  accent-color: var(--primary, #B80016);
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

.cdp-header .cdp-header-row>.cdp-title {font-size:21px}
.cdp-header .cdp-header-actions {align-self:flex-start}
.cdp-header .cdp-header-info {display:flex;flex-wrap:wrap;align-items:center;column-gap:20px}
.cdp-header .cdp-header-row {flex-basis:100%}
.cdp-header .cdp-admin-details {margin-top:4px}
.cdp-header .cdp-identity-line>span {display:inline-flex;align-items:center;flex:0 0 auto}
.cdp-header .cdp-header-row {align-items:center;gap:8px 12px}
.cdp-header .cdp-tenant-line {display:flex;flex-wrap:wrap;gap:6px}
.cdp-header .cdp-meta-row {display:flex;flex-wrap:wrap;gap:6px}
.cdp-header .cdp-header-actions .cdp-open-full {padding:9px 14px;font-size:14px}
.cdp-header .cdp-header-actions {gap:8px}
.cdp-more-actions {position:relative;font-size:13px}
.cdp-more-actions summary {cursor:pointer;padding:8px}
.cdp-more-actions>div {position:absolute;right:0;top:100%;width:270px;padding:16px;border:1px solid #d6e2df;border-radius:10px;background:#fff;box-shadow:0 8px 28px #142e3529;z-index:20}
.cdp-more-actions p {font-size:12px;color:#64748b;margin:8px 0}
@media(max-width:750px){.cdp-header-actions{width:100%;justify-content:flex-start}.cdp-header-main{flex-basis:100%}}

</style>
