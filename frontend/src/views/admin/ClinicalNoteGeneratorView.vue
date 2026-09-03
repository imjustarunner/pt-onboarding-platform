<template>
  <div class="na-app" :class="{ 'na-app--embedded': isEmbedded }">
    <header v-if="!isEmbedded" class="na-topbar">
      <div class="na-brand">
        <span class="na-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <path d="M12 3c.8 2.4 2.2 4 4.2 5.2C14.2 9.4 12.8 11 12 13.4 11.2 11 9.8 9.4 7.8 8.2 9.8 7 11.2 5.4 12 3Z" fill="currentColor"/>
            <path d="M7 14.5c.5 1.5 1.4 2.5 2.7 3.3C8.4 18.6 7.5 19.6 7 21.1 6.5 19.6 5.6 18.6 4.3 17.8 5.6 17 6.5 16 7 14.5Z" fill="currentColor" opacity=".75"/>
            <path d="M17 14.5c.5 1.5 1.4 2.5 2.7 3.3-1.3.8-2.2 1.8-2.7 3.3-.5-1.5-1.4-2.5-2.7-3.3 1.3-.8 2.2-1.8 2.7-3.3Z" fill="currentColor" opacity=".55"/>
          </svg>
        </span>
        <div>
          <div class="na-brand-title">AI Note Aid</div>
          <div class="na-brand-sub">Note Assistant</div>
        </div>
      </div>
      <p class="na-tagline">Spend less time on notes. <em>More time with your clients.</em></p>
      <div class="na-topbar-actions">
      <button
        type="button"
        class="na-archive-btn"
        :class="{ 'na-archive-btn--pulse': libraryCollapsed }"
        @click="libraryCollapsed = !libraryCollapsed"
      >
        {{ libraryCollapsed ? 'Show library' : 'Hide library' }}
      </button>
      <button
        type="button"
        class="na-archive-btn"
        :class="{ 'na-archive-btn--pulse': workQueueCollapsed }"
        @click="workQueueCollapsed = !workQueueCollapsed"
      >
        {{ workQueueCollapsed ? 'Show queue' : 'Hide queue' }}
      </button>
      <button type="button" class="na-archive-btn" @click="focusArchivedShelf">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7h18v13H3zM3 7l2-3h14l2 3" />
        </svg>
        Archive
      </button>
      </div>
    </header>

    <div v-if="fromIndirectSession" class="na-indirect-banner" role="status">
      <span>
        You’re still clocked in on Log Time — Note Aid (Tools &amp; Aids → AI Tools) counts on that session.
        Use the clock chip or Back to Log Time when you’re done.
      </span>
      <button type="button" class="na-indirect-back" @click="returnToLogTime">
        Back to Log Time
      </button>
    </div>

    <div v-if="!canUseTool" class="na-shell na-shell--empty">
      <div class="na-empty-card">
        <strong>Not available</strong>
        <p>
          This tool is not enabled for your current organization.
          Ask an admin to enable <strong>Clinical Note Generator</strong> or <strong>Note Aid</strong> in Organization Settings.
        </p>
      </div>
    </div>

    <div
      v-else
      class="na-shell"
      :class="{
        'na-shell--library-collapsed': libraryCollapsed && !libraryExpanded,
        'na-shell--library-expanded': libraryExpanded && !libraryCollapsed,
        'na-shell--queue-collapsed': workQueueCollapsed || isEmbedded,
        'na-shell--note-focused': hasOpenNote && !isEmbedded,
        'na-shell--embedded': isEmbedded
      }"
    >
      <ClinicalNoteLibrarySidebar
        v-if="!isEmbedded"
        title="Note Library"
        :drafts="recentDrafts"
        :work-queue-items="workQueueItems"
        :signed-sessions="signedNoteSessions"
        :loading="recentLoading"
        :error="recentError"
        :selected-id="draftId"
        :selected-work-queue-id="activeWorkQueueItemId"
        v-model:tab="sidebarTab"
        v-model:search="draftSearch"
        v-model:group-by="libraryGroupBy"
        v-model:date-order="libraryDateOrder"
        v-model:connection-filter="libraryConnectionFilter"
        v-model:tenant-filter="libraryTenantFilter"
        v-model:collapsed="libraryCollapsed"
        v-model:expanded="libraryExpanded"
        :type-label="draftNoteTypeLabel"
        @new="startNewNote"
        @select="onLibrarySidebarSelect"
        @delete="onLibrarySidebarDelete"
      />

      <main
        v-show="!libraryExpanded || libraryCollapsed"
        class="na-main"
        :class="{ 'na-main--start': showStartPage, 'na-main--library': showAidPicker }"
      >
        <NoteAidIntakeDraftEditor
          v-if="showIntakeDraftEditor && effectiveClientId"
          :client-id="effectiveClientId"
          :intake-draft-id="intakeDraftEditorId"
          @close="closeIntakeDraftEditor"
          @open-plan="onIntakeEditorOpenPlan"
          @finalized="onIntakeDraftEditorFinalized"
        />

        <div v-show="!showIntakeDraftEditor">

        <div v-if="therapyContext && hasOpenNote" class="na-context-strip">
          <strong>Therapy Notes context</strong>
          <span v-if="therapyContext.therapySummary">{{ therapyContext.therapySummary }}</span>
          <span v-if="therapyContext.therapyCalendarLabel"> · {{ therapyContext.therapyCalendarLabel }}</span>
        </div>

        <div v-if="viewingChartNote && hasOpenNote" class="na-context-strip" :class="viewingChartNote.standalone ? 'na-context-strip--warn' : 'na-context-strip--soft'">
          <strong>{{ viewingChartNote.standalone ? 'Standalone note' : 'Chart note' }}</strong>
          <span v-if="viewingChartNote.standalone">
            — copy sections for Therapy Notes. Not linked to a scheduled session or claim.
          </span>
          <span v-else> — opened from the clinical chart (read-only copy).</span>
          <span v-if="viewingChartNote.title"> · {{ viewingChartNote.title }}</span>
        </div>

        <div v-if="hasOpenNote" class="na-context-strip na-context-strip--soft">
          <span><strong>Credential:</strong> {{ loadingContext ? 'Loading…' : (providerCredentialText || 'Not set') }}</span>
          <span><strong>Tier:</strong> {{ derivedTier }}</span>
          <span v-if="dateOfService"><strong>DOS:</strong> {{ dateOfService }}</span>
          <span v-if="currentDraftCreatedAt"><strong>Created:</strong> {{ formatCreatedDisplay(currentDraftCreatedAt) }}</span>
          <span v-if="lastSavedAt"><strong>Saved:</strong> {{ lastSavedAt }}</span>
          <span v-else-if="draftId" class="muted">Draft #{{ draftId }}</span>
          <button
            v-if="canDeleteCurrentDraft"
            type="button"
            class="na-link-btn na-link-btn--danger"
            :disabled="deletingCurrentDraft"
            @click="deleteCurrentDraft"
          >
            {{ deletingCurrentDraft ? 'Deleting…' : 'Delete draft' }}
          </button>
          <span v-if="approvalMessage" class="hint">{{ approvalMessage }}</span>
          <span v-if="approvalError" class="na-delete-err">{{ approvalError }}</span>
        </div>

        <NoteAidStartPage
          v-if="showStartPage"
          :has-next-in-progress="!!nextInProgressRow"
          :has-next-in-queue="!!nextInQueueItem"
          @create="beginCreateNote"
          @next-in-progress="openNextInProgress"
          @next-in-queue="openNextInQueue"
        />

        <NoteAidLibraryPanel
          v-else-if="showAidPicker"
          :categories="libraryCategories"
          :user-id="libraryUserId"
          @select="onLibrarySelect"
        >
          <template #before>
            <div class="na-aid-picker-head">
              <button type="button" class="na-link-btn" @click="cancelAidPicker">← Back</button>
              <strong>Choose a note tool</strong>
            </div>
          </template>
        </NoteAidLibraryPanel>

        <template v-else-if="hasOpenNote">
        <header class="na-workspace-head">
          <button type="button" class="na-workspace-close" @click="closeNoteWorkspace">← Close</button>
          <div class="na-workspace-title">
            <strong>{{ workspaceTitle }}</strong>
            <span v-if="signedNoteViewerId" class="na-finalized-badge">Finalized</span>
            <span v-else-if="draftId" class="na-draft-badge">Draft</span>
          </div>
          <div class="na-workspace-actions">
            <span v-if="lastSavedAt" class="na-autosave-hint">Saved {{ lastSavedAt }}</span>
          </div>
        </header>

        <NoteAidQuickSessionBar
          v-if="!isEmbedded && !showAidPicker"
          :client-label="noteSubjectLabel"
          :client-linked="!!effectiveClientId"
          v-model:date-of-service="dateOfService"
          :service-label="quickSessionServiceLabel"
          :service-code="actualServiceCode"
          :service-code-choices="quickSessionServiceCodeChoices"
          v-model:participants="sessionParticipants"
          v-model:participants-detail="sessionParticipantsDetail"
          v-model:duration-minutes="sessionDurationMinutes"
          v-model:start-time="sessionStartTimeLocal"
          v-model:end-time="sessionEndTimeLocal"
          :clinician-label="sessionClinicianLabel"
          :setup-complete="clientSetupComplete"
          :participants-flag="sessionParticipantsFlag"
          :attendees-required="familyAttendeesRequired"
          :editable="!chartNoteReadOnly"
          :finalized="!!signedNoteViewerId"
          :duration-hint="sessionDurationHint"
          @update:service-code="onQuickSessionServiceCode"
          @toggle-setup="showClientSetupDrawer = true"
        />

        <div class="na-aid-bar">
          <div class="na-aid-bar-copy">
            <span class="na-aid-kicker">{{ selectedCategoryLabel || 'Selected aid' }}</span>
            <strong>{{ selectedAid?.label || (outputObj?.meta?.source === 'session_recording' ? 'Session Recording' : 'Note aid') }}</strong>
            <p v-if="selectedAidGuidance">{{ selectedAidGuidance }}</p>
            <p v-if="forceAutoSelect" class="na-field-hint">
              Credential isn’t set — generation will use Code Decider until an admin records your license.
            </p>
            <div v-if="showCsNoteBuildPathway" class="na-pathway-toggle" role="group" aria-label="Note pathway">
              <button
                type="button"
                class="na-pathway-btn"
                :class="{ on: notePathway === 'standard' }"
                @click="notePathway = 'standard'"
              >
                {{ pathwayStandardLabel }}
              </button>
              <button
                type="button"
                class="na-pathway-btn"
                :class="{ on: notePathway === 'csNoteBuild' }"
                @click="notePathway = 'csNoteBuild'"
              >
                CSNoteBuild
              </button>
            </div>
            <label
              v-if="canUseManualSkipAi"
              class="na-skip-ai"
            >
              <input v-model="skipAiAid" type="checkbox" />
              Skip AI aid — write sections manually
            </label>
            <p v-else-if="manualWriteDisabledByProfile" class="na-field-hint">
              Manual-only writing is disabled on this profile — use Note Aid generate.
            </p>
          </div>
          <div class="na-aid-bar-actions">
            <button
              v-if="!chartNoteReadOnly"
              type="button"
              class="na-btn-outline"
              :disabled="savingDraftManual"
              @click="saveDraftNow"
            >
              {{ savingDraftManual ? 'Saving…' : 'Save Draft' }}
            </button>
            <button type="button" class="na-change-aid" @click="changeNoteAid">Change tool</button>
          </div>
        </div>

        <div v-if="noteAidAgencyNeedsChoice" class="na-tenant-choice">
          <label>
            This client belongs to more than one tenant you can access. Choose which tenant this note belongs to:
            <select
              class="na-select"
              :value="noteAidAgencyChoiceId == null ? '' : String(noteAidAgencyChoiceId)"
              @change="noteAidAgencyChoiceId = Number($event.target.value) || null"
            >
              <option value="">Select tenant…</option>
              <option
                v-for="aid in noteAidAgencyCandidates"
                :key="aid"
                :value="String(aid)"
              >
                {{ agencyLookup[aid] || `Tenant #${aid}` }}
              </option>
            </select>
          </label>
        </div>
        <p v-else-if="noteAidAgencyId && selectedClient" class="na-tenant-hint muted">
          Agency: {{ agencyLookup[noteAidAgencyId] || selectedClient.agency_name || `Agency #${noteAidAgencyId}` }}
        </p>

        <header v-if="false" class="na-wizard-head">
          <div>
            <h2 class="na-wizard-title">Create Note</h2>
            <div class="na-wizard-tags">
              <span class="na-wizard-tag">{{ selectedAid?.label || selectedCategoryLabel || 'Note aid' }}</span>
              <span class="na-wizard-tag na-wizard-tag--muted">{{ draftId ? 'Draft' : 'New' }}</span>
            </div>
          </div>
          <div class="na-wizard-actions">
            <button
              type="button"
              class="na-btn-outline"
              :disabled="savingDraftManual"
              @click="saveDraftNow"
            >
              {{ savingDraftManual ? 'Saving…' : 'Save Draft' }}
            </button>
            <button
              v-if="noteWizardStep === 1"
              type="button"
              class="na-generate"
              :disabled="!canContinueToWriteStep"
              @click="goToWriteStep"
            >
              Continue
              <span aria-hidden="true">›</span>
            </button>
            <button
              v-else
              type="button"
              class="na-btn-outline"
              @click="noteWizardStep = 1"
            >
              ← Back to Step 1
            </button>
          </div>
        </header>

        <nav v-if="false" class="na-wizard-steps" aria-label="Note creation steps">
          <button
            type="button"
            class="na-wizard-step"
            :class="{ active: noteWizardStep === 1, done: noteWizardStep > 1 }"
            @click="noteWizardStep = 1"
          >
            <span class="na-wizard-step-num">1</span>
            Session Details
          </button>
          <span class="na-wizard-steps-line" aria-hidden="true" />
          <button
            type="button"
            class="na-wizard-step"
            :class="{ active: noteWizardStep === 2 }"
            :disabled="!canContinueToWriteStep"
            @click="goToWriteStep"
          >
            <span class="na-wizard-step-num">2</span>
            Write Note
          </button>
        </nav>

        <!-- STEP 1: Session details + client (no note writing) -->
        <div v-if="false && noteWizardStep === 1 && !isEmbedded" class="na-wizard-step1">
          <NoteAidDocumentationQueue
            v-if="needsSessionPicker && progressEntryMode === 'appointment'"
            :agency-id="noteAidAgencyId || currentAgencyId"
            :client-id="selectedClientId"
            :active="needsSessionPicker"
            @select="onDocumentationQueueSelect"
            @continue-unlinked="continueUnlinkedProgress"
            @client-first="pickClientFirstProgress"
          />

          <div class="na-step1-grid">
            <div class="na-step1-main">
              <section class="na-card">
                <h3 class="na-card-title">Session details</h3>
                <div class="na-card-fields">
                  <label class="na-label" for="na-dos">Date of Service <em>*</em></label>
                  <input
                    id="na-dos"
                    ref="dateOfServiceInputEl"
                    v-model="dateOfService"
                    type="date"
                    class="na-input"
                  />
                  <div class="na-field-meta">
                    <span v-if="currentDraftCreatedAt" class="na-field-hint">
                      Created {{ formatCreatedDisplay(currentDraftCreatedAt) }}
                    </span>
                    <span v-else-if="draftAutosaveHint" class="na-field-hint">{{ draftAutosaveHint }}</span>
                  </div>

                  <template v-if="showBillingCodePicker">
                    <span class="na-field-hint">Note / billing code</span>
                    <select
                      v-model="selectedServiceCode"
                      class="na-input"
                      :disabled="autoSelectCode || forceAutoSelect"
                    >
                      <option value="">Use aid default</option>
                      <option
                        v-for="opt in noteTypeOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >{{ opt.label }}</option>
                      <option v-if="canUseOtherCode" value="__other__">Other (enter code)</option>
                    </select>
                    <input
                      v-if="selectedServiceCode === '__other__'"
                      v-model="otherServiceCode"
                      class="na-input"
                      placeholder="e.g., 90834"
                    />
                  </template>

                  <!-- Times / place only when linked to a scheduled event or clinical session -->
                  <template v-if="hasScheduledSessionContext">
                    <NoteAidSessionContextStrip
                      :visible="true"
                      :clinician-label="sessionClinicianLabel"
                      :patient-label="sessionPatientLabel"
                      :patient-dob="sessionPatientDob"
                      :date-time-label="sessionDateTimeLabel"
                      v-model:duration-minutes="sessionDurationMinutes"
                      :service-code="actualServiceCode"
                      :location-label="sessionLocationLabel"
                      v-model:participants="sessionParticipants"
                      :participants-flag="sessionParticipantsFlag"
                      :code-switch-banner="sessionCodeSwitchBanner"
                    />
                  </template>
                  <p v-else class="na-field-hint">
                    Start/end time and place of service appear when this note is linked to a scheduled appointment or billing session.
                  </p>

                  <label
                    v-if="showAutoSelectCodeOption"
                    class="na-check"
                  >
                    <input v-model="autoSelectCode" type="checkbox" :disabled="forceAutoSelect || selectedAidForcesAutoSelect" />
                    <span>Let AI choose the best code</span>
                  </label>
                  <div v-if="showProgramDropdown" class="na-options-block">
                    <span class="na-field-hint">Program (H2014 only)</span>
                    <select v-model="selectedProgramId" class="na-input">
                      <option value="">No program</option>
                      <option v-for="p in programs" :key="p.id" :value="String(p.id)">{{ formatProgramLabel(p) }}</option>
                    </select>
                  </div>
                </div>
              </section>

              <section class="na-card">
                <div class="na-card-head-row">
                  <h3 class="na-card-title">Client</h3>
                </div>
                <label v-if="!selectedClientId && progressEntryMode === 'unlinked'" class="na-label" for="na-initials">Client Initials</label>
                <input
                  v-if="!selectedClientId && progressEntryMode === 'unlinked'"
                  id="na-initials"
                  ref="initialsInputEl"
                  v-model="initials"
                  type="text"
                  class="na-input"
                  maxlength="16"
                  placeholder="e.g., A.M."
                />
                <p v-else-if="selectedClientId" class="na-field-hint">Client linked — initials come from the chart client, not manual entry.</p>
                <div
                  v-if="showInitialsCreateActions && !selectedClientId"
                  class="na-initials-match"
                >
                  <template v-if="initialsMatchSuggestions.length">
                    <p class="na-field-hint">Possible client match — link only if correct:</p>
                    <button
                      v-for="c in initialsMatchSuggestions"
                      :key="`${c.agencyId}-${c.id}`"
                      type="button"
                      class="na-initials-match-btn"
                      @click="onClientPicked(c)"
                    >
                      Link this note to <strong>{{ clientDisplayName(c) || c.initials }}</strong>
                      <em v-if="clientTenantLabel(c, agencyLookup)"> · {{ clientTenantLabel(c, agencyLookup) }}</em>?
                    </button>
                  </template>
                  <p v-else class="na-field-hint">
                    No existing client matched these initials.
                  </p>
                  <div class="na-initials-match-actions">
                    <button
                      v-if="initialsMatchSuggestions.length"
                      type="button"
                      class="na-link-btn na-link-btn--sm"
                      @click="initialsMatchDismissed = true; initialsMatchSuggestions = []"
                    >
                      Keep unlinked
                    </button>
                    <button type="button" class="na-link-btn na-link-btn--sm" @click="openCreateClientModal({ initials })">
                      Create client
                    </button>
                  </div>
                </div>
                <NoteAidClientPicker
                  v-model="selectedClientId"
                  :agency-id="noteAidAgencyId || currentAgencyId"
                  :selected-client="selectedClient"
                  :allow-clear="canClearLinkedClient"
                  :profile-href="clientProfileHref"
                  :search-all-tenants="true"
                  @select="onClientPicked"
                  @clear="onClientCleared"
                  @create-request="openCreateClientModal"
                />
                <p v-if="progressEntryMode === 'unlinked'" class="na-field-hint">
                  Unlinked note — date and initials only (not attached to a chart session).
                </p>
                <NoteAidClientContextPanel
                  v-if="effectiveClientId"
                  ref="clientContextPanelRef"
                  :client-id="effectiveClientId"
                  :client-name="selectedClient?.full_name || selectedClient?.name || ''"
                  :client-profile-href="clientProfileHref"
                  :demographics-on-file="demographicsOnFile"
                  :demographics-preview="demographicsPreviewRows"
                  :intake-on-file="intakeOnFile"
                  :plan-on-file="planOnFile"
                  :goals="activeTreatmentGoals"
                  :loading-plan="loadingClientPlan"
                  :plan-error="clientPlanError"
                  v-model:pasted-plan-text="pastedPlanText"
                  v-model:pasted-intake-text="pastedIntakeText"
                  v-model:pasted-demographics-text="pastedDemographicsText"
                  :loading-intake="loadingIntake"
                  :intake-error="intakeError"
                  :intake-summary="intakeSummary"
                  :primary-diagnosis="primaryChartDiagnosis"
                  :diagnoses="chartDiagnoses"
                  @open-updater="openTreatmentPlanUpdater"
                  @use-intake="useIntakeToInformPlan"
                  @open-chart-intake="openClientChartIntake"
                  @import-plan="openPlanImportReview"
                  @import-intake="showIntakeImportReview = true"
                  @import-demographics="showDemographicsImport = true"
                />
                <div v-if="canEditNoteSubject && draftId" class="na-subject-save-row">
                  <button
                    type="button"
                    class="na-btn-outline"
                    :disabled="savingDraftManual"
                    @click="saveNoteSubject"
                  >
                    {{ savingDraftManual ? 'Saving…' : 'Save client / initials' }}
                  </button>
                </div>
              </section>

              <section class="na-phi-banner na-phi-banner--compact" role="note">
                <strong>Privacy reminder</strong>
                <p>
                  Do not include PHI such as names, addresses, phone numbers, or dates of birth.
                  Use roles: client/patient, MOC, FOC, guardian, caregiver.
                </p>
              </section>
            </div>

            <aside class="na-step1-side">
              <section class="na-card">
                <h3 class="na-card-title">Before you write</h3>
                <ul class="na-checklist">
                  <li>
                    <span>Session details</span>
                    <em :class="dateOfService ? 'ok' : 'miss'">{{ dateOfService ? 'Complete' : 'Missing' }}</em>
                  </li>
                  <li>
                    <span>Client linked or initials</span>
                    <em :class="(effectiveClientId || initials) ? 'ok' : 'miss'">{{ (effectiveClientId || initials) ? 'Complete' : 'Missing' }}</em>
                  </li>
                  <li>
                    <span>Demographics</span>
                    <em :class="demographicsOnFile ? 'ok' : 'warn'">{{ demographicsOnFile ? 'Complete' : (effectiveClientId ? 'Missing' : '—') }}</em>
                  </li>
                  <li>
                    <button
                      type="button"
                      class="na-checklist-item"
                      :disabled="!effectiveClientId"
                      @click="showIntakeImportReview = true"
                    >
                      <span>Intake on file</span>
                      <em :class="intakeOnFile ? 'ok' : 'warn'">{{ intakeOnFile ? 'Complete' : (effectiveClientId ? 'Missing' : '—') }}</em>
                    </button>
                  </li>
                  <li>
                    <span>Diagnosis (from intake / plan)</span>
                    <em :class="primaryChartDiagnosis ? 'ok' : 'warn'">{{ primaryChartDiagnosis ? 'Complete' : (effectiveClientId ? 'Missing' : '—') }}</em>
                  </li>
                  <li>
                    <span>Treatment plan / goals</span>
                    <em :class="planOnFile ? 'ok' : 'warn'">{{ planOnFile ? 'Complete' : (effectiveClientId ? 'Missing' : '—') }}</em>
                  </li>
                </ul>
              </section>

              <section v-if="selectedClient || initials" class="na-card">
                <h3 class="na-card-title">Selected client snapshot</h3>
                <p class="na-snapshot-name">{{ noteSubjectLabel }}</p>
                <dl class="na-snapshot-dl">
                  <div>
                    <dt>Primary diagnosis</dt>
                    <dd>
                      <template v-if="primaryChartDiagnosis">
                        {{ primaryChartDiagnosis.icd10_code }} — {{ primaryChartDiagnosis.description || '' }}
                      </template>
                      <template v-else>—</template>
                    </dd>
                  </div>
                  <div>
                    <dt>Program / service</dt>
                    <dd>{{ selectedAid?.label || noteTypeDisplayLabel || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Date of service</dt>
                    <dd>{{ dateOfService || '—' }}</dd>
                  </div>
                </dl>
              </section>

              <section class="na-card na-card--cta">
                <h3 class="na-card-title">Next step: Write note</h3>
                <p class="na-field-hint">
                  Once session details and client info are confirmed, continue to the note-writing screen.
                </p>
                <button
                  type="button"
                  class="na-generate"
                  :disabled="!canContinueToWriteStep"
                  @click="goToWriteStep"
                >
                  Continue to write
                  <span aria-hidden="true">›</span>
                </button>
              </section>
            </aside>
          </div>
        </div>

        <!-- STEP 2: Write / generate -->
        <div class="na-wizard-step2">
          <aside class="na-write-overview">
            <div class="na-card na-card--tight">
              <div class="na-card-head-row">
                <h3 class="na-card-title">Session overview</h3>
                <button
                  v-if="!canEditNoteSubject"
                  type="button"
                  class="na-link-btn na-link-btn--sm"
                  @click="noteWizardStep = 1"
                >
                  Edit
                </button>
              </div>
              <template v-if="canEditNoteSubject">
                <div class="na-subject-edit">
                  <NoteAidClientPicker
                    v-model="selectedClientId"
                    :agency-id="noteAidAgencyId || currentAgencyId"
                    :selected-client="selectedClient"
                    :allow-clear="canClearLinkedClient"
                    :profile-href="clientProfileHref"
                    :search-all-tenants="true"
                    @select="onClientPicked"
                    @clear="onClientCleared"
                    @create-request="openCreateClientModal"
                  />
                  <label v-if="!selectedClientId" class="na-label na-label--compact" for="na-step2-initials">
                    Client initials
                    <input
                      id="na-step2-initials"
                      v-model="initials"
                      class="na-input"
                      maxlength="16"
                      placeholder="e.g., SB"
                    />
                  </label>
                  <p v-else class="na-field-hint">Chart client linked — initials come from the client record.</p>
                  <button
                    type="button"
                    class="na-btn-outline na-subject-save"
                    :disabled="savingDraftManual"
                    @click="saveNoteSubject"
                  >
                    {{ savingDraftManual ? 'Saving…' : 'Save client / initials' }}
                  </button>
                </div>
              </template>
              <dl v-else class="na-snapshot-dl">
                <div><dt>Client</dt><dd>{{ noteSubjectLabel }}</dd></div>
                <div><dt>Date</dt><dd>{{ dateOfService || '—' }}</dd></div>
                <div><dt>Service</dt><dd>{{ selectedAid?.label || noteTypeDisplayLabel || '—' }}</dd></div>
                <div v-if="hasScheduledSessionContext && sessionDurationMinutes"><dt>Duration</dt><dd>{{ sessionDurationMinutes }} min</dd></div>
              </dl>
              <dl v-if="canEditNoteSubject" class="na-snapshot-dl na-snapshot-dl--compact">
                <div><dt>Date</dt><dd>{{ dateOfService || '—' }}</dd></div>
                <div><dt>Service</dt><dd>{{ selectedAid?.label || noteTypeDisplayLabel || '—' }}</dd></div>
                <div v-if="hasScheduledSessionContext && sessionDurationMinutes"><dt>Duration</dt><dd>{{ sessionDurationMinutes }} min</dd></div>
              </dl>
            </div>
            <div class="na-phi-banner na-phi-banner--compact" role="note">
              <strong>Privacy</strong>
              <p>Use roles (client, MOC, FOC) — do not dictate names or other PHI.</p>
            </div>
          </aside>

          <div class="na-write-main">
        <NoteAidObjectiveRatings
          v-if="showObjectiveRatings && notePathway !== 'csNoteBuild' && !signedNoteViewerId"
          :goals="activeTreatmentGoals"
          :previous-ratings="chartObjectiveRatings"
          :disabled="generating"
          :date-of-service="dateOfService"
          :kiosk-share-enabled="!!Number(latestTreatmentPlan?.kiosk_share_enabled || 0)"
          :client-name="selectedClient?.full_name || 'the client'"
          @update:ratings="sessionObjectiveRatings = $event"
          @improved="onObjectiveImproved"
        />

        <NoteAidCsNoteBuildPanel
          v-if="useCsNoteBuildPathway"
          ref="csNoteBuildPanelRef"
          v-model="csNoteBuildState"
          :goals="activeTreatmentGoals"
          :proposed-interventions="csProposedInterventions"
          :is-telehealth="csIsTelehealth"
          :proposing-plan="csProposingPlan"
          :skip-mse="skipMentalStatusExam"
          @propose-plan="onCsProposePlan"
        />

        <div v-if="suggestUpdateTreatmentPlan" class="na-renew-banner" role="status">
          <span>{{ renewalSuggestReason || 'Consider updating the treatment plan based on progress.' }}</span>
          <button
            type="button"
            class="na-btn-outline"
            @click="openTreatmentPlanUpdater({ renewalReason: renewalSuggestReason, progressExcerpt: lastProgressNoteExcerpt })"
          >
            Update treatment plan
          </button>
        </div>

        <section v-if="!useCsNoteBuildPathway && !signedNoteViewerId" class="na-input-panel">
          <div v-if="phiNameHits.length" class="na-phi-warn" role="alert">
            <strong>Possible name detected:</strong>
            {{ phiNameHits.map((h) => h.token).join(', ') }}.
            Replace with a role (client, MOC, FOC, guardian) before sending to AI.
            <button type="button" class="na-link-btn na-link-btn--sm" @click="dismissPhiNameWarn = true">
              Dismiss for this edit
            </button>
          </div>
          <div class="na-input-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              :aria-selected="inputMode === 'type'"
              :class="{ active: inputMode === 'type' }"
              @click="inputMode = 'type'"
            >
              Type
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="inputMode === 'speak'"
              :class="{ active: inputMode === 'speak' }"
              @click="inputMode = 'speak'"
            >
              Speak
            </button>
          </div>

          <textarea
            v-if="inputMode === 'type'"
            v-model="inputText"
            class="na-textarea"
            rows="8"
            maxlength="12000"
            :placeholder="isTreatmentSummaryAid
              ? 'Optional: add participation, clinical impressions, and other pertinent information. Attendance, progress notes, and scaled objectives load from the client chart automatically.'
              : (selectedAidGuidance || 'Paste or type your session details here…')"
          />

          <template v-else>
            <div
              class="na-speak-stage"
              :class="{
                'na-speak-stage--live': recording,
                'na-speak-stage--captured': !recording && !!audioBlob
              }"
            >
              <canvas ref="speakVisualizerCanvasEl" class="na-speak-viz" aria-hidden="true" />
              <div class="na-speak-stage-overlay">
                <div v-if="recording" class="na-speak-live-head">
                  <span class="na-speak-rec-dot" aria-hidden="true" />
                  <span class="na-speak-timer">{{ speakRecordingTimeLabel }}</span>
                  <span class="na-speak-live-label">Listening</span>
                </div>
                <div v-else-if="audioBlob" class="na-speak-captured-head">
                  <span class="na-speak-captured-icon" aria-hidden="true">✓</span>
                  <span>Recording ready · {{ audioDurationLabel }}</span>
                </div>
                <div v-else class="na-speak-idle-hint-only">
                  <span>Use <strong>Record dictation</strong> below to start.</span>
                </div>
                <p v-if="recording && liveTranscript" class="na-speak-live-transcript">{{ liveTranscript }}</p>
                <p v-else-if="!recording && !audioBlob" class="na-speak-idle-hint">
                  Your voice appears as a live waveform while you speak.
                </p>
              </div>
            </div>

            <textarea
              v-model="inputText"
              class="na-textarea na-textarea--speak-transcript"
              rows="5"
              maxlength="12000"
              :placeholder="recording ? 'Live transcript builds here as you speak…' : 'Transcript appears here after recording or server transcription…'"
            />

            <div class="na-speak-tools">
              <div class="na-speak-actions">
                <button
                  class="na-speak-btn"
                  :class="{
                    'na-speak-btn--recording': recording,
                    'na-speak-btn--idle-pulse': !recording && !audioBlob && !recordingBusy
                  }"
                  type="button"
                  :disabled="recordingBusy"
                  @click="toggleRecording"
                >
                  {{ recording ? 'Stop recording' : 'Record dictation' }}
                </button>
                <button class="na-speak-btn" type="button" :disabled="!audioBlob || recording" @click="clearAudio">
                  Clear recording
                </button>
                <button class="na-speak-btn" type="button" :disabled="!canServerTranscribe" @click="transcribeAudioServer">
                  {{ serverTranscribing ? 'Transcribing…' : 'Transcribe (server)' }}
                </button>
              </div>
              <small class="hint">
                Speak to draft a note after the session (dictation). To record
                <em>during</em> a live session, use
                <router-link :to="orgTo('/admin/session-recording')">Session Recording</router-link>.
              </small>
              <small v-if="recording" class="hint">
                {{ transcribing ? 'Transcribing live.' : speechSupported ? 'Transcription starting…' : 'Transcription not supported in this browser.' }}
              </small>
              <small v-if="audioBlob" class="hint">
                Audio captured ({{ audioMimeType || 'unknown type' }}, {{ audioDurationLabel }})
              </small>
              <small v-if="serverTranscribeError" class="error">{{ serverTranscribeError }}</small>
            </div>
          </template>

          <div class="na-input-footer">
            <span class="na-char-count">{{ String(inputText || '').length }} / 12000</span>
            <label
              v-if="showInteractiveComplexityOption"
              class="na-toggle-row na-toggle-row--inline"
              title="Document interactive complexity factors when clinically supported (90785)"
            >
              <span>Interactive Complexity (90785)</span>
              <span class="na-switch" :class="{ on: includeInteractiveComplexity }">
                <input v-model="includeInteractiveComplexity" type="checkbox" @change="applyBillingRulesForCurrentSession({ announce: true })" />
                <span class="na-switch-thumb" />
              </span>
            </label>
            <label
              v-if="showAfterHours99051Option"
              class="na-toggle-row na-toggle-row--inline"
              title="99051 — session outside Mon–Fri 8am–5pm"
            >
              <span>After hours (99051)</span>
              <span class="na-switch" :class="{ on: includeAfterHours99051 }">
                <input v-model="includeAfterHours99051" type="checkbox" @change="applyBillingRulesForCurrentSession({ announce: true })" />
                <span class="na-switch-thumb" />
              </span>
            </label>
            <span
              v-for="addon in (billingAddons || []).filter((a) => a.code !== '90785' || includeInteractiveComplexity)"
              :key="addon.code"
              class="na-tag na-tag--accent"
              :title="addon.code === '90840' ? 'Crisis add-on from duration' : addon.code"
            >
              +{{ addon.code }}{{ addon.units > 1 ? ` ×${addon.units}` : '' }}
            </span>
            <button class="na-generate" type="button" :disabled="generateDisabled" @click="generateNote">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M12 2l1.2 6.3L19 12l-5.8 3.7L12 22l-1.2-6.3L5 12l5.8-3.7L12 2z"/>
              </svg>
              {{ generating ? 'Generating…' : 'Generate Note' }}
            </button>
          </div>
          <small v-if="generateBlockedReason && generateDisabled" class="hint na-generate-hint">{{ generateBlockedReason }}</small>
          <small v-if="serviceCodeChangedAfterGenerate && !signedNoteViewerId" class="hint na-generate-hint">
            Service code changed after the last generate — regenerate to replace the note with the new tool format before signing.
          </small>
          <small v-if="amendmentParentNoteId" class="hint na-generate-hint">
            Editing a signed note: regenerating and signing will save the new format as an addendum. If a claim was already submitted, mark it for resubmit after the addendum is signed.
          </small>
          <small v-if="billingRulesBanner" class="hint na-generate-hint">{{ billingRulesBanner }}</small>
          <small v-if="generateError" class="error">{{ generateError }}</small>
        </section>

        <section v-else class="na-input-panel na-input-panel--cs">
          <div class="na-input-footer">
            <span class="na-char-count">CSNoteBuild pathway</span>
            <label
              v-if="showInteractiveComplexityOption"
              class="na-toggle-row na-toggle-row--inline"
            >
              <span>Interactive Complexity (90785)</span>
              <span class="na-switch" :class="{ on: includeInteractiveComplexity }">
                <input v-model="includeInteractiveComplexity" type="checkbox" @change="applyBillingRulesForCurrentSession({ announce: true })" />
                <span class="na-switch-thumb" />
              </span>
            </label>
            <label
              v-if="showAfterHours99051Option"
              class="na-toggle-row na-toggle-row--inline"
            >
              <span>After hours (99051)</span>
              <span class="na-switch" :class="{ on: includeAfterHours99051 }">
                <input v-model="includeAfterHours99051" type="checkbox" @change="applyBillingRulesForCurrentSession({ announce: true })" />
                <span class="na-switch-thumb" />
              </span>
            </label>
            <button class="na-generate" type="button" :disabled="csGenerateDisabled" @click="generateNote">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M12 2l1.2 6.3L19 12l-5.8 3.7L12 22l-1.2-6.3L5 12l5.8-3.7L12 2z"/>
              </svg>
              {{ generating ? 'Generating…' : 'Generate Colorado note' }}
            </button>
          </div>
          <small v-if="generateError" class="error">{{ generateError }}</small>
        </section>

        <NoteAidStructuredChartPanel
          v-if="showStructuredChartPanel && !chartNoteReadOnly && !signedNoteViewerId"
          :diagnoses="structuredChartDiagnoses"
          :diagnosis-mode="chartDiagnosisMode"
          v-model:diagnostic-justification="chartDiagnosticJustification"
          v-model:mse="chartMentalStatus"
          v-model:risk="chartRiskAssessment"
          v-model:medications="chartMedications"
          :skip-mse="skipMentalStatusExam"
          :mse-skip-label="mseSkipLabel"
          @mse-all-normal="setMseAllNormal"
          @mse-all-not-assessed="setMseAllNotAssessed"
        />
          </div>
        </div>

        <!-- Keep output after either step when present (visible on write step) -->
        <template v-if="true">

        <section v-if="signedNoteViewerId" class="na-output na-output--signed-view">
          <div class="na-output-head">
            <div>
              <h2>Finalized note</h2>
              <span class="na-ready-badge na-ready-badge--signed">Signed · read only</span>
            </div>
            <button type="button" class="na-btn-outline" @click="beginAmendmentFromSignedNote">
              Create amendment
            </button>
          </div>
          <p class="na-field-hint">
            Original stays on file. An amendment saves a new signed copy linked to this note.
          </p>
          <p v-if="approvalError" class="na-delete-err">{{ approvalError }}</p>
          <ClinicalNoteDetailFetcher
            :note-id="signedNoteViewerId"
            :agency-id="signedNoteViewerAgencyId || noteAidAgencyId || currentAgencyId"
          />
        </section>

        <section v-else-if="displayPanels.length" class="na-output">
          <div class="na-output-head">
            <div>
              <h2>AI Generated Note</h2>
              <span class="na-ready-badge">Ready to Copy</span>
            </div>
            <button type="button" class="na-link-btn" @click="collapseAllSections = !collapseAllSections">
              {{ collapseAllSections ? 'Expand All' : 'Collapse All' }}
            </button>
          </div>

          <div class="na-output-meta">
            <span><strong>Client</strong> {{ initials || '—' }}</span>
            <span><strong>Date of Service</strong> {{ dateOfService || '—' }}</span>
            <span><strong>Created</strong> {{ currentDraftCreatedLabel }}</span>
          </div>
          <div class="na-tags">
            <span class="na-tag">{{ noteTypeDisplayLabel }}</span>
            <span v-if="includeInteractiveComplexity && showInteractiveComplexityOption" class="na-tag na-tag--accent">Interactive Complexity</span>
          </div>

          <div class="na-soap-list">
            <div v-for="panel in displayPanels" :key="panel.id" class="na-soap-card">
              <div class="na-soap-header">
                <button type="button" class="na-soap-title-btn" @click="togglePanelCollapsed(panel.id)">
                  <span class="na-soap-title">
                    <span v-if="panel.letter" class="na-soap-letter">{{ panel.letter }}</span>
                    {{ panel.title }}
                  </span>
                  <span class="na-chevron" :class="{ open: !isPanelCollapsed(panel.id) }">▾</span>
                </button>
                <span class="na-soap-actions">
                  <button
                    v-if="!chartNoteReadOnly"
                    type="button"
                    class="na-mini-btn"
                    @click="toggleSectionEdit(panel.id)"
                  >
                    {{ sectionEditing[panel.id] ? 'Done' : 'Edit' }}
                  </button>
                  <button
                    type="button"
                    class="na-mini-btn"
                    :disabled="!panelText(panel)"
                    @click="copySectionContent(panel)"
                  >
                    {{ copiedSectionId === panel.id ? 'Copied' : 'Copy' }}
                  </button>
                </span>
              </div>
              <div v-show="!isPanelCollapsed(panel.id)" class="na-soap-body">
                <textarea
                  v-if="sectionEditing[panel.id]"
                  v-model="sectionOverrides[panel.id]"
                  class="na-textarea"
                  rows="6"
                />
                <pre v-else>{{ panelText(panel) }}</pre>
              </div>
            </div>
          </div>

          <NoteAidTreatmentSummaryPanel
            v-if="treatmentSummaryNoteId && isTreatmentSummaryAid"
            :note-id="treatmentSummaryNoteId"
            :agency-id="noteAidAgencyId || currentAgencyId"
            :provider-signed-at="treatmentSummaryProviderSignedAt"
            :supervisor-signed-at="treatmentSummarySupervisorSignedAt"
          />

          <div v-if="!chartNoteReadOnly" class="field na-revision-field">
            <label class="na-revision-label" for="na-revision">
              Add additional content / make changes / update instructions
            </label>
            <textarea
              id="na-revision"
              v-model="revisionInstruction"
              class="na-textarea na-textarea--compact"
              rows="2"
              placeholder="Tell Note Aid what to add or revise while keeping the same transcript…"
            />
            <div class="na-revision-actions">
              <button
                type="button"
                class="na-btn-outline"
                :disabled="regenerateDisabled"
                @click="generateNote"
              >
                {{ regenerateButtonLabel }}
              </button>
              <small v-if="generateError" class="error">{{ generateError }}</small>
            </div>
          </div>

          <div v-if="canApproveToClinicalRecord && !chartNoteReadOnly" class="na-sign-attest">
            <p class="na-sign-attest-lead">
              <template v-if="isReviewOnlyAid">
                Completing Review saves this note to the client chart (not a billable event). Content is checked for required clinical text — never demographics or PHI fields.
              </template>
              <template v-else-if="isTreatmentSummaryAid">
                Saving writes the Treatment Summary to the client chart as a printable document (packet footer, no cover/version). Provider and clinical supervisor both sign.
              </template>
              <template v-else>
                Signing writes this note to the chart. Generating a draft does not sign.
              </template>
            </p>
            <label class="na-sign-check">
              <input v-model="attestAccurateAndComplete" type="checkbox" />
              I mark this note as accurate and complete{{ isReviewOnlyAid ? '' : ', and apply my signature' }}.
            </label>
            <label v-if="isReviewOnlyAid" class="na-sign-check">
              <input v-model="attestMedicallyNecessary" type="checkbox" />
              I confirm content Review is complete (clinical content only).
            </label>
            <label v-else-if="isTreatmentSummaryAid" class="na-sign-check">
              <input v-model="attestMedicallyNecessary" type="checkbox" />
              I confirm this Treatment Summary is accurate for print, digital share, and provider/supervisor signature.
            </label>
            <label v-else class="na-sign-check">
              <input v-model="attestMedicallyNecessary" type="checkbox" />
              I declare that this service was medically necessary.
            </label>
            <label
              v-if="nextInQueueItem || nextInProgressRow"
              class="na-sign-check"
            >
              <input v-model="signAndOpenNextInQueue" type="checkbox" />
              After {{ isReviewOnlyAid ? 'review' : 'signing' }}, open next in queue
            </label>
            <p v-if="sessionParticipantsHint && !participantsPresenceDismissed" class="na-sign-attest-warn">
              Note language may suggest others attended. Update <strong>Participants</strong> in session
              details (Step 1), or confirm client-only below if family was only discussed.
            </p>
            <label
              v-if="sessionParticipantsHint"
              class="na-sign-check na-sign-check--override"
            >
              <input v-model="participantsPresenceDismissed" type="checkbox" />
              Confirm client only — family or others discussed but not present in this session.
            </label>
            <p v-if="!canConfirmAndSign && !sessionParticipantsFlag" class="error">
              Complete required chart sections (including mental status when this is a scheduled session) before signing.
            </p>
          </div>

          <div class="na-output-actions">
            <button type="button" class="na-btn-primary" :disabled="!displayPanels.length" @click="copyFullNote">
              Copy Full Note
            </button>
            <button
              v-if="!chartNoteReadOnly"
              type="button"
              class="na-btn-outline"
              :disabled="!draftId || archivingDraft"
              @click="archiveCurrentDraft"
            >
              {{ archivingDraft ? 'Archiving…' : (isCurrentDraftArchived ? 'Unarchive' : 'Add to Archive') }}
            </button>
            <button
              v-if="canApproveToClinicalRecord"
              type="button"
              class="na-btn-outline"
              :disabled="!displayPanels.length || approvingNote || !canConfirmAndSign"
              @click="approveNoteOutput({ afterSign: signAndOpenNextInQueue ? 'queue' : 'close' })"
            >
              {{ approvingNote
                ? (isReviewOnlyAid || isTreatmentSummaryAid ? 'Saving…' : 'Signing…')
                : (attestAccurateAndComplete && attestMedicallyNecessary
                  ? (isReviewOnlyAid ? 'Complete review' : (isTreatmentSummaryAid ? 'Save document' : 'Sign'))
                  : (isReviewOnlyAid
                    ? 'Mark accurate, complete review'
                    : (isTreatmentSummaryAid
                      ? 'Confirm & save Treatment Summary'
                      : 'Mark accurate, medically necessary & sign'))) }}
            </button>
            <button
              v-if="canSaveTreatmentPlanToChart"
              type="button"
              class="na-btn-outline"
              :disabled="!displayPanels.length || savingTreatmentPlan"
              @click="saveTreatmentPlanToChart"
            >
              {{ savingTreatmentPlan ? 'Saving plan…' : 'Save treatment plan to chart' }}
            </button>
            <button
              type="button"
              class="na-btn-outline"
              :disabled="regenerateDisabled"
              @click="generateNote"
            >
              {{ regenerateButtonLabel }}
            </button>
          </div>
          <div class="na-feedback">
            <span v-if="copied" class="hint">Copied.</span>
            <span v-if="approvalMessage" class="hint">{{ approvalMessage }}</span>
            <span v-if="approvalError" class="error">{{ approvalError }}</span>
            <span v-if="archiveMessage" class="hint">{{ archiveMessage }}</span>
          </div>
          <div
            v-if="displayPanels.length && canApproveToClinicalRecord && (nextInProgressRow || nextInQueueItem)"
            class="na-next-nav"
          >
            <button
              v-if="nextInQueueItem"
              type="button"
              class="na-btn-outline na-next-nav-btn"
              :disabled="approvingNote || !canConfirmAndSign"
              @click="approveNoteOutput({ afterSign: 'queue' })"
            >
              {{ approvingNote ? 'Signing…' : 'Sign and open next in queue' }}
            </button>
            <button
              v-if="nextInProgressRow"
              type="button"
              class="na-btn-outline na-next-nav-btn"
              :disabled="approvingNote || !canConfirmAndSign"
              @click="approveNoteOutput({ afterSign: 'progress' })"
            >
              {{ approvingNote ? 'Signing…' : 'Sign and open next in progress' }}
            </button>
          </div>
          <p class="na-gen-summary">{{ generationLogicSummary }}</p>
        </section>

        <section v-else class="na-output na-output--empty">
          <h2>AI Generated Note</h2>
          <p>Your structured note will appear here after you generate.</p>
        </section>

        <ClinicalArtifactRetentionPanel
          v-if="canApproveToClinicalRecord"
          :agencyId="Number(currentAgencyId || 0)"
          :clientId="Number(retentionClientId || 0)"
          :officeEventId="Number(retentionOfficeEventId || 0)"
        />
        </template>
        </template>
        </div>
      </main>

      <NoteAidWorkQueuePanel
        v-if="canUseTool && !isEmbedded && !(libraryExpanded && !libraryCollapsed)"
        :items="workQueueItems"
        :active-id="activeWorkQueueItemId"
        :collapsed="workQueueCollapsed"
        :sort-by="workQueueSortBy"
        :sort-dir="workQueueSortDir"
        @add-todo="showTodoImportModal = true"
        @generate="generateNote"
        @next="advanceWorkQueue"
        @clear="clearWorkQueue"
        @select="activateWorkQueueItem"
        @delete="onWorkQueueDeleteDraft"
        @update:collapsed="workQueueCollapsed = $event"
        @update:sort-by="workQueueSortBy = $event"
        @update:sort-dir="workQueueSortDir = $event"
      />
    </div>

    <div
      v-if="canUseTool && hasOpenNote && !isEmbedded"
      class="na-fab-wrap"
      @keydown.escape="newNoteMenuOpen = false"
    >
      <div v-if="newNoteMenuOpen" class="na-fab-menu" role="menu" aria-label="Start a new note">
        <button type="button" role="menuitem" @click="startNewNoteSameDate">
          <strong>Same date</strong>
          <span>Keep date &amp; service — choose client initials</span>
        </button>
        <button type="button" role="menuitem" @click="startNewNoteSameClient">
          <strong>Same client</strong>
          <span>Keep client &amp; service — choose a new date</span>
        </button>
        <button type="button" role="menuitem" @click="startNewNoteDifferentService">
          <strong>Different service</strong>
          <span>Keep date &amp; client — pick a new note aid</span>
        </button>
      </div>
      <button
        type="button"
        class="na-fab"
        :aria-expanded="newNoteMenuOpen ? 'true' : 'false'"
        aria-haspopup="menu"
        :title="newNoteMenuOpen ? 'Close new note options' : 'Start new note'"
        @click="newNoteMenuOpen = !newNoteMenuOpen"
      >
        <span aria-hidden="true">{{ newNoteMenuOpen ? '×' : '+' }}</span>
        <span class="sr-only">{{ newNoteMenuOpen ? 'Close' : 'Start new note' }}</span>
      </button>
    </div>

    <NoteAidCreateClientModal
      :open="showCreateClientModal"
      :default-agency-id="createClientDefaults.agencyId"
      :default-initials="createClientDefaults.initials"
      :default-name="createClientDefaults.name"
      @close="showCreateClientModal = false"
      @created="onMinimalClientCreated"
    />
    <NoteAidClientSetupDrawer
      :open="showClientSetupDrawer"
      :client="selectedClient"
      :demographics-on-file="demographicsOnFile"
      :intake-on-file="intakeOnFile"
      :plan-on-file="planOnFile"
      :diagnosis-on-file="!!primaryChartDiagnosis"
      @close="showClientSetupDrawer = false"
      @skip="showClientSetupDrawer = false"
      @import-plan="showClientSetupDrawer = false; openPlanImportReview()"
      @import-intake="showClientSetupDrawer = false; showIntakeImportReview = true"
      @import-demographics="showClientSetupDrawer = false; showDemographicsImport = true"
    />
    <NoteAidTreatmentPlanImportReview
      v-if="effectiveClientId && chartAgencyIdForSave"
      :open="showPlanImportReview"
      :agency-id="chartAgencyIdForSave"
      :client-id="effectiveClientId"
      :initial-text="pastedPlanText"
      :plan-id="planDraftEditorId"
      :mode="planDraftEditorId || planDraftEditorMode === 'draft' ? 'draft' : 'import'"
      :initial-plan="planDraftInitialPlan"
      @close="closePlanDraftEditor"
      @saved="onPlanImportSaved"
    />
    <NoteAidIntakeImportReview
      v-if="effectiveClientId"
      :open="showIntakeImportReview"
      :client-id="effectiveClientId"
      :initial-text="pastedIntakeText"
      @close="showIntakeImportReview = false"
      @finalized="onIntakeImportFinalized"
    />
    <NoteAidDemographicsImportReview
      v-if="effectiveClientId"
      :open="showDemographicsImport"
      :client-id="effectiveClientId"
      :agency-id="Number(selectedClient?.agency_id || selectedClient?.agencyId || noteAidAgencyId || currentAgencyId || 0) || null"
      :initial-text="pastedDemographicsText"
      @close="showDemographicsImport = false"
      @saved="onDemographicsImported"
    />
    <NoteAidTodoListImportModal
      :open="showTodoImportModal"
      :default-agency-id="noteAidAgencyId || currentAgencyId"
      @close="showTodoImportModal = false"
      @built="onTodoListBuilt"
    />

    <NoteAidDiagnosisWriterModal
      :open="showDiagnosisWriterModal"
      :agency-id="noteAidAgencyId || currentAgencyId"
      @close="showDiagnosisWriterModal = false"
      @saved="onStandaloneDraftSaved"
    />
    <NoteAidTreatmentPlanStandaloneModal
      :open="showTreatmentPlanWriterModal"
      :agency-id="noteAidAgencyId || currentAgencyId"
      :clients="standaloneModalClients"
      @close="showTreatmentPlanWriterModal = false"
      @saved="onStandaloneDraftSaved"
      @applied="onStandalonePlanApplied"
    />

  </div>
</template>

<script setup>
import NoteAidStartPage from '../../components/clinical/NoteAidStartPage.vue';
import NoteAidQuickSessionBar from '../../components/clinical/NoteAidQuickSessionBar.vue';
import NoteAidClientPicker from '../../components/clinical/NoteAidClientPicker.vue';
import NoteAidObjectiveRatings from '../../components/clinical/NoteAidObjectiveRatings.vue';
import NoteAidClientContextPanel from '../../components/clinical/NoteAidClientContextPanel.vue';
import NoteAidCsNoteBuildPanel from '../../components/clinical/NoteAidCsNoteBuildPanel.vue';
import NoteAidCreateClientModal from '../../components/clinical/NoteAidCreateClientModal.vue';
import NoteAidClientSetupDrawer from '../../components/clinical/NoteAidClientSetupDrawer.vue';
import NoteAidDocumentationQueue from '../../components/clinical/NoteAidDocumentationQueue.vue';
import NoteAidTreatmentPlanImportReview from '../../components/clinical/NoteAidTreatmentPlanImportReview.vue';
import NoteAidIntakeImportReview from '../../components/clinical/NoteAidIntakeImportReview.vue';
import NoteAidIntakeDraftEditor from '../../components/clinical/NoteAidIntakeDraftEditor.vue';
import NoteAidDemographicsImportReview from '../../components/clinical/NoteAidDemographicsImportReview.vue';
import NoteAidWorkQueuePanel from '../../components/clinical/NoteAidWorkQueuePanel.vue';
import NoteAidTodoListImportModal from '../../components/clinical/NoteAidTodoListImportModal.vue';
import NoteAidDiagnosisWriterModal from '../../components/clinical/NoteAidDiagnosisWriterModal.vue';
import NoteAidTreatmentPlanStandaloneModal from '../../components/clinical/NoteAidTreatmentPlanStandaloneModal.vue';
import NoteAidSessionContextStrip from '../../components/clinical/NoteAidSessionContextStrip.vue';
import NoteAidStructuredChartPanel from '../../components/clinical/NoteAidStructuredChartPanel.vue';
import { loadWorkQueue, saveWorkQueue, clearAllWorkQueues, matchTodoClientFromSearchRows, namesLikelySamePerson } from '../../utils/noteAidWorkQueue.js';
import {
  DOC_STATUS,
  buildLeftLibraryRows,
  deriveWorkQueueDocStatus,
  draftMatchesWorkQueueItem,
  filterWorkQueueForRightPanel,
  normalizeDocStatus,
  sessionDedupeKey,
  sortWorkQueueItems
} from '../../utils/noteAidDocumentationStatus.js';
import {
  consumeNoteAidWorkQueueStash,
  scrubLegacyWorkQueueSessionStash,
  suggestPsychotherapyCodeForDuration,
  defaultDurationMinutesForServiceCode,
  participantsLikelyIncludeOthers,
  defaultMentalStatusExam,
  defaultRiskAssessment,
  defaultMedicationsBlock,
  taskToWorkQueueItem,
  MSE_DOMAINS
} from '../../utils/noteAidSessionQueue.js';
import {
  buildDisplaySections,
  extractSections,
  formatDraftListDate,
  formatDraftListTime,
  formatFullNoteCopy,
  todayIsoDate
} from '../../utils/noteAidUiHelpers';
import {
  activePlanGoals,
  buildObjectiveRatingsContextText,
  buildTreatmentPlanContextText,
  buildUpdaterPrefillDocument,
  buildIntakeInformedPlanText,
  buildTreatmentSummaryContextDocument,
  isTreatmentPlanOnFileForSetup,
  clientDisplayInitials,
  clientDisplayName,
  clientTenantLabel,
  initialsLikelyMatch,
  normalizeNoteAidClientRow,
  noteAidPrefersLearningSponsor,
  resolveNoteAidAgencyId
} from '../../utils/noteAidTreatmentHelpers.js';
import { toDateOfService } from '../../utils/noteAidLaunch.js';
import { ensureHourlySessionForNoteAid } from '../../utils/noteAidIndirectSession.js';
import {
  PHI_PRIVACY_BANNER,
  PHI_ROLE_HINTS,
  collectFrontendPhiNames,
  detectKnownNamesInText
} from '../../utils/noteAidPhiGuard.js';
import {
  createEmptyCsNoteBuildState,
  serializeCsNoteBuildForGenerate,
  csNoteBuildCompletionCount,
  csContactMinutes
} from '../../utils/csNoteBuild.js';
import {
  HIDDEN_NOTE_AID_CODES,
  NOTE_AID_CATEGORIES,
  NOTE_TYPE_CODE_GROUPS,
  RETIRED_NOTE_AID_IDS,
  aidAllowsInteractiveComplexity,
  aidAttachesToClientChart,
  aidAttachesQuestionnaires,
  aidDiagnosisMode,
  aidIsVisibleForTiers,
  aidKind,
  aidRequiresProviderSupervisorSign,
  aidSkipsMentalStatusExam,
  aidUsesContentReview,
  aidUsesFreeformCsPathway,
  findNoteAidById,
  findNoteAidByToolOrCode,
  isSocialDeterminantCode,
  mergeAgencyCatalogIntoCategories,
  orderNoteAidCategoriesForHcbs,
  resolveTreatmentPlanAidId
} from '../../config/noteAidWorkspace.js';
import {
  CRISIS_90839_SERVICE_DESCRIPTION,
  resolveNoteAidBillingCodes,
  shouldSuggest99051
} from '../../utils/noteAidBillingAddons.js';
import {
  DEFAULT_MEASUREMENT_METHOD,
  inferScaleDirection,
  isObjectiveScaleValid,
  parseScalePair
} from '../../utils/treatmentPlanDuration.js';
import { rememberRecentAid, loadNoteLibraryUiPrefs, saveNoteLibraryUiPrefs } from '../../utils/noteAidLibraryPrefs.js';
import { isClinicalChartEnabled, parseAgencyFeatureFlags } from '../../config/medicalBillingAccess.js';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import ClinicalArtifactRetentionPanel from '../../components/clinical/ClinicalArtifactRetentionPanel.vue';
import NoteAidLibraryPanel from '../../components/clinical/NoteAidLibraryPanel.vue';
import ClinicalNoteLibrarySidebar from '../../components/clinical/ClinicalNoteLibrarySidebar.vue';
import ClinicalNoteDetailFetcher from '../../components/clinical/ClinicalNoteDetailFetcher.vue';
import NoteAidTreatmentSummaryPanel from '../../components/clinical/NoteAidTreatmentSummaryPanel.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const props = defineProps({
  embedded: { type: Boolean, default: false },
  embedDraftId: { type: [Number, String], default: null },
  embedClinicalNoteId: { type: [Number, String], default: null },
  embedClientId: { type: [Number, String], default: null },
  embedAgencyId: { type: [Number, String], default: null }
});
const isEmbedded = computed(() => !!props.embedded);

const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

const fromIndirectSession = computed(() => {
  const v = String(route.query?.fromIndirectSession || route.query?.from_indirect_session || '').trim();
  return v === '1' || v.toLowerCase() === 'true';
});

function returnToLogTime() {
  router.push({ path: orgTo('/dashboard'), query: { tab: 'log_time' } }).catch(() => {});
}

const currentAgencyId = computed(() => agencyStore.currentAgency?.id || null);
const bookingContext = computed(() => {
  const officeEventId = Number(route.query?.officeEventId || route.query?.office_event_id || 0) || null;
  const clientId = Number(route.query?.clientId || route.query?.client_id || 0) || null;
  const clinicalSessionId = Number(route.query?.clinicalSessionId || route.query?.clinical_session_id || 0) || null;
  const noteType = String(route.query?.noteType || route.query?.note_type || 'PROGRESS_NOTE').trim() || 'PROGRESS_NOTE';
  const templateVersion = String(route.query?.templateVersion || route.query?.template_version || 'v1').trim() || 'v1';
  const serviceCode = String(route.query?.serviceCode || route.query?.service_code || '').trim().toUpperCase();
  return {
    officeEventId,
    clientId,
    clinicalSessionId,
    noteType,
    templateVersion,
    serviceCode
  };
});

/** Therapy Notes / ICS launch — no office booking; copy-only (no Approve to clinical record). */
const therapyContext = computed(() => {
  const src = String(route.query?.therapySource || route.query?.therapy_source || '').trim().toLowerCase();
  if (src !== 'therapy_notes') return null;
  return {
    therapyStartAt: String(route.query?.therapyStartAt || route.query?.therapy_start_at || '').trim(),
    therapyEndAt: String(route.query?.therapyEndAt || route.query?.therapy_end_at || '').trim(),
    therapySummary: String(route.query?.therapySummary || route.query?.therapy_summary || '').trim(),
    therapyCalendarLabel: String(route.query?.therapyCalendarLabel || route.query?.therapy_calendar_label || '').trim()
  };
});

const canApproveToClinicalRecord = computed(
  () => !chartNoteReadOnly.value && !!(
    bookingContext.value?.clientId
    || sessionOfficeEventId.value
    || sessionClinicalSessionId.value
    || effectiveClientId.value
  )
);
const retentionClientId = computed(
  () => Number(selectedClientId.value || bookingContext.value?.clientId || 0) || null
);
const effectiveClientId = computed(
  () => Number(selectedClientId.value || 0) || null
);
const activeTreatmentGoals = computed(() => activePlanGoals(latestTreatmentPlan.value));
const primaryChartDiagnosis = computed(() => {
  const plan = latestTreatmentPlan.value;
  const list = chartDiagnoses.value || [];
  const planDxId = Number(plan?.primary_diagnosis_id || plan?.primaryDiagnosisId || 0);
  const planJust = String(plan?.diagnostic_justification || plan?.diagnosticJustification || '').trim();
  if (planDxId) {
    const fromPlan = list.find((d) => Number(d?.id) === planDxId);
    if (fromPlan) {
      return {
        ...fromPlan,
        is_primary: 1,
        justification: planJust || fromPlan.justification || null
      };
    }
  }
  const primary = list.find((d) => d && Number(d.is_primary) === 1 && (d.is_active == null || Number(d.is_active) === 1));
  if (primary) {
    return {
      ...primary,
      justification: planJust || primary.justification || null
    };
  }
  return list.find((d) => d && (d.is_active == null || Number(d.is_active) === 1)) || null;
});

const chartPresentingProblem = computed(() => {
  const plan = latestTreatmentPlan.value;
  const raw = String(plan?.discharge_plan || plan?.dischargePlan || '').trim();
  if (!raw) return '';
  const m = raw.match(/Presenting Problem\n([\s\S]*?)(?=\n\n(?:Prescribed Frequency|Discharge Criteria)|$)/i);
  return m ? String(m[1] || '').trim() : '';
});

const phiExtraNames = computed(() =>
  collectFrontendPhiNames(selectedClient.value, clientGuardianNames.value)
);

const phiNameHits = computed(() => {
  if (dismissPhiNameWarn.value) return [];
  const text = [inputText.value, liveTranscript.value, revisionInstruction.value]
    .map((t) => String(t || ''))
    .join('\n');
  return detectKnownNamesInText(text, phiExtraNames.value);
});

const clientProfileHref = computed(() => {
  const cid = Number(effectiveClientId.value || 0);
  if (!cid) return '';
  const slug = agencyStore.currentAgency?.slug || agencyStore.currentAgency?.organization_slug || route.params?.organizationSlug;
  return slug ? `/${slug}/admin/clients/${cid}` : `/admin/clients/${cid}`;
});

const demographicsOnFile = computed(() => {
  const c = selectedClient.value;
  if (!c) return false;
  if (c.demographics_on_file === true || c.demographicsOnFile === true) return true;
  const enc = c.demographics_phi_enc ?? c.demographicsPhiEnc;
  if (enc && enc !== false && enc !== 'false' && enc !== 'null') return true;
  const hasDob = !!(c.date_of_birth || c.dateOfBirth);
  const hasContact = !!(c.contact_phone || c.email || c.address_street || c.addressStreet);
  return hasDob && hasContact;
});

const demographicsPreviewRows = computed(() => {
  const c = selectedClient.value;
  if (!c) return [];
  const rows = [];
  const name = clientDisplayName(c);
  if (name) rows.push({ label: 'Name', value: name });
  const dob = c.date_of_birth || c.dateOfBirth;
  if (dob) rows.push({ label: 'DOB', value: String(dob).slice(0, 10) });
  const phone = c.contact_phone || c.contactPhone;
  if (phone) rows.push({ label: 'Phone', value: phone });
  const email = c.email;
  if (email) rows.push({ label: 'Email', value: email });
  const city = [c.address_city || c.addressCity, c.address_state || c.addressState].filter(Boolean).join(', ');
  if (city) rows.push({ label: 'City', value: city });
  return rows;
});

const intakeOnFile = computed(() => {
  // Only a finalized intake note (or a completed import in this session) counts.
  // Copy-blocks / plan diagnoses must not hide the intake paste step.
  if (intakeImportedOnce.value) return true;
  return intakeDraftFinalized.value;
});

const planOnFile = computed(() =>
  isTreatmentPlanOnFileForSetup({
    planImportedOnce: planImportedOnce.value,
    latestPlan: latestTreatmentPlan.value,
    activeGoals: activeTreatmentGoals.value
  })
);
const showObjectiveRatings = computed(() => {
  if (!effectiveClientId.value || !activeTreatmentGoals.value.length) return false;
  const kind = aidKind(selectedAid.value);
  // Progress notes require ratings; also show before an aid is chosen so clinicians can rate first.
  return !selectedAid.value || kind === 'progress';
});
const retentionOfficeEventId = computed(() => Number(bookingContext.value?.officeEventId || 0) || null);
const launchIntent = computed(() => String(route.query?.launchIntent || route.query?.launch_intent || '').trim().toLowerCase());
const isRecordSessionIntent = computed(() => launchIntent.value === 'record_session' || launchIntent.value === 'record');

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
};
const isTruthyFlag = (v) => {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};
const clinicalNoteGeneratorEnabled = computed(() => {
  const flags = parseFeatureFlags(agencyStore.currentAgency?.feature_flags);
  if (flags?.noteAidEnabled === false && flags?.clinicalNoteGeneratorEnabled === false) return false;
  return true;
});
const canUseTool = computed(() => !!currentAgencyId.value && clinicalNoteGeneratorEnabled.value);

// Context (credential + eligible codes)
const loadingContext = ref(false);
const contextError = ref('');
const providerCredentialText = ref('');
const derivedTier = ref('unknown');
const hcbsCategory = ref(null);
const eligibleServiceCodes = ref(null); // array|null
const audioAgreementTemplates = ref([]);

// Programs (for H2014)
const programs = ref([]);
const selectedProgram = computed(() => {
  const id = String(selectedProgramId.value || '');
  return programs.value.find((p) => String(p?.id) === id) || null;
});
const isH2014ProgramName = (name) => {
  const s = String(name || '').toLowerCase();
  if (!s) return false;
  return s.includes('pcp') || s.includes('tpt') || s.includes('skill builder') || s.includes('skillbuilder') || s.includes('h2014');
};
const formatProgramLabel = (program) => {
  const name = program?.name || `Program #${program?.id}`;
  return isH2014ProgramName(name) ? `${name} (H2014)` : name;
};

// Form state
const selectedNoteCategory = ref('');
const selectedAidId = ref('');
const agencyNoteAidCatalog = ref({
  settings: [],
  assignments: [],
  customAids: [],
  peopleScopedCatalogIds: [],
  peopleScopedCustomIds: []
});
/** Must be declared before any computed that reads selectedAid / noteAidCategories (avoids TDZ white screen). */
const noteAidCategories = computed(() =>
  mergeAgencyCatalogIntoCategories(NOTE_AID_CATEGORIES, agencyNoteAidCatalog.value, derivedTier.value)
);
const selectedAid = computed(() => {
  const id = String(selectedAidId.value || '');
  if (!id) return null;
  const hit = findNoteAidById(id);
  if (hit?.aid) return hit.aid;
  for (const cat of noteAidCategories.value || []) {
    const aid = (cat.aids || []).find((a) => a.id === id);
    if (aid) return aid;
  }
  return null;
});
const selectedServiceCode = ref('');
const otherServiceCode = ref('');
const selectedProgramId = ref('');
const dateOfService = ref('');
const initials = ref('');
const selectedClientId = ref(null);
const selectedClient = ref(null);
const clientContextPanelRef = ref(null);
const selectedQueueAgencyId = ref(null);
const showProgressSessionPicker = ref(true);
const progressEntryMode = ref('appointment'); // appointment | client | unlinked
const showCreateClientModal = ref(false);
const showClientSetupDrawer = ref(false);
const showPlanImportReview = ref(false);
const showIntakeImportReview = ref(false);
const showIntakeDraftEditor = ref(false);
const intakeDraftEditorId = ref(null);
const planDraftEditorId = ref(null);
const planDraftEditorMode = ref('import');
const planDraftInitialPlan = ref(null);
const showDemographicsImport = ref(false);
const showTodoImportModal = ref(false);
const showDiagnosisWriterModal = ref(false);
const showTreatmentPlanWriterModal = ref(false);
const standaloneModalClients = computed(() => {
  if (selectedClient.value?.id) return [selectedClient.value];
  return [];
});

async function onStandaloneDraftSaved() {
  showDiagnosisWriterModal.value = false;
  showTreatmentPlanWriterModal.value = false;
  approvalMessage.value = 'Saved to In Progress.';
  await loadRecent();
  sidebarTab.value = DOC_STATUS.STARTED;
}

async function onStandalonePlanApplied() {
  showTreatmentPlanWriterModal.value = false;
  approvalMessage.value = 'Treatment plan applied to client.';
  if (effectiveClientId.value) await loadClientTreatmentPlan(effectiveClientId.value);
  await loadRecent();
}
const workQueueItems = ref([]);
const workQueueSortBy = ref('date');
const workQueueSortDir = ref('asc');
/** Session preference: after signing, open the next not-started queue item (default on). */
const signAndOpenNextInQueue = ref(true);
const skipAiAid = ref(false);
const noteAidAllowManualWrite = ref(true);
const noteAidAutosignAfterReview = ref(false);

const isReviewOnlyAid = computed(() => aidUsesContentReview(selectedAid.value));
const isClientChartAid = computed(() => aidAttachesToClientChart(selectedAid.value));
const isTreatmentSummaryAid = computed(() => aidRequiresProviderSupervisorSign(selectedAid.value));
const canUseManualSkipAi = computed(() => !!noteAidAllowManualWrite.value && !chartNoteReadOnly.value);
const manualWriteDisabledByProfile = computed(() => !noteAidAllowManualWrite.value);
const treatmentSummaryNoteId = ref(null);
const treatmentSummaryProviderSignedAt = ref(null);
const treatmentSummarySupervisorSignedAt = ref(null);
const chartSessions = ref([]);
const chartNotesMeta = ref([]);

async function loadNoteAidWriterPrefs() {
  const uid = Number(authStore.user?.id || 0);
  if (!uid) return;
  try {
    const resp = await api.get(`/users/${uid}/preferences`, { skipGlobalLoading: true });
    const data = resp?.data?.preferences || resp?.data || {};
    noteAidAllowManualWrite.value = data.note_aid_allow_manual_write !== 0
      && data.note_aid_allow_manual_write !== false
      && data.note_aid_allow_manual_write !== '0';
    noteAidAutosignAfterReview.value = !!(
      data.note_aid_autosign_after_review === true
      || data.note_aid_autosign_after_review === 1
      || data.note_aid_autosign_after_review === '1'
    );
    if (!noteAidAllowManualWrite.value) skipAiAid.value = false;
  } catch {
    // defaults
  }
}

function seedManualEmptySections() {
  const freeform = usesFreeformCsPathway.value || isReviewOnlyAid.value;
  const placeholder = 'Write this section…';
  const sections = freeform
    ? { Output: placeholder }
    : {
        Subjective: placeholder,
        Objective: placeholder,
        Interventions: placeholder,
        Plan: placeholder
      };
  outputObj.value = {
    sections,
    meta: {
      ...(outputObj.value?.meta || {}),
      toolId: selectedAid.value?.toolId || outputObj.value?.meta?.toolId || null,
      manualSections: true,
      model: null
    }
  };
  Object.keys(sectionOverrides).forEach((k) => delete sectionOverrides[k]);
  Object.keys(sections).forEach((title) => {
    sectionOverrides[title] = placeholder;
    sectionEditing[title] = true;
  });
}
const sessionOfficeEventId = ref(null);
const sessionClinicalSessionId = ref(null);
const sessionDurationMinutes = ref(null);
const sessionLocationLabel = ref('');
const sessionParticipants = ref('Client Only');
const sessionParticipantsDetail = ref('');
const sessionStartTimeLocal = ref('');
const sessionEndTimeLocal = ref('');
/** Clinician confirmed client-only despite a soft presence hint (no re-check until participants changes). */
const participantsPresenceDismissed = ref(false);

watch(sessionParticipants, (val) => {
  if (val !== 'Client Only') participantsPresenceDismissed.value = false;
  else if (!familyAttendeesRequired.value) sessionParticipantsDetail.value = '';
});

function normalizeParticipantsLabel(raw) {
  const v = String(raw || '').trim();
  if (!v) return 'Client Only';
  if (/^client\s*only$/i.test(v)) return 'Client Only';
  if (/others?\s*\(?\s*client\s+not\s+present/i.test(v) || /^collateral$/i.test(v)) {
    return 'Others (client not present)';
  }
  if (/client\s*(and|\+)\s*(others?|family|other)/i.test(v)) return 'Client and Others';
  return v;
}

function applyParticipantsDefaultForServiceCode(code) {
  const c = String(code || '').toUpperCase();
  if (c === '90847') {
    sessionParticipants.value = 'Client and Others';
  } else if (c === '90846') {
    sessionParticipants.value = 'Others (client not present)';
  }
}
const sessionPatientDob = ref('');
const sessionScheduledStart = ref(null);
const sessionScheduledEnd = ref(null);
const sessionCodeSwitchBanner = ref('');
const chartDiagnosticJustification = ref('');
const chartMentalStatus = ref(defaultMentalStatusExam());
const chartRiskAssessment = ref(defaultRiskAssessment());
const chartMedications = ref(defaultMedicationsBlock());
const createClientDefaults = reactive({ initials: '', name: '', agencyId: null });
const initialsMatchSuggestions = ref([]);
const initialsMatchDismissed = ref(false);
const initialsMatchSearched = ref(false);
let initialsMatchTimer = null;
const showInitialsCreateActions = computed(() => {
  const typed = String(initials.value || '').trim();
  return !selectedClientId.value
    && progressEntryMode.value === 'unlinked'
    && !initialsMatchDismissed.value
    && typed.length >= 2
    && initialsMatchSearched.value;
});
const latestTreatmentPlan = ref(null);
const chartDiagnoses = ref([]);
const clientGuardianNames = ref([]);
const dismissPhiNameWarn = ref(false);
const phiPrivacyBanner = PHI_PRIVACY_BANNER;
const phiRoleHints = PHI_ROLE_HINTS;
const chartObjectiveRatings = ref([]);
const lastProgressNoteExcerpt = ref('');
const loadingClientPlan = ref(false);
const clientPlanError = ref('');
const pastedPlanText = ref('');
const pastedIntakeText = ref('');
const pastedDemographicsText = ref('');
const intakeImportedOnce = ref(false);
const intakeDraftFinalized = ref(false);
const planImportedOnce = ref(false);
const savingDraftManual = ref(false);
const deletingCurrentDraft = ref(false);
const sessionObjectiveRatings = ref([]);
const suggestUpdateTreatmentPlan = ref(false);
const renewalSuggestReason = ref('');
const loadingIntake = ref(false);
const intakeError = ref('');
const intakeSummary = ref('');

/** Tenant context for the selected client (may differ from workspace agency). */
const clientAgencyMembershipIds = ref([]);
const learningSponsorAgencyIds = ref([]);
const noteAidAgencyChoiceId = ref(null);

const selectedAidCategoryId = computed(() => {
  const aidId = String(selectedAidId.value || '');
  if (!aidId) return '';
  for (const cat of noteAidCategories.value || []) {
    if ((cat.aids || []).some((a) => a.id === aidId)) return cat.id;
  }
  for (const cat of NOTE_AID_CATEGORIES || []) {
    if ((cat.aids || []).some((a) => a.id === aidId)) return cat.id;
  }
  return '';
});

const preferLearningSponsorForAid = computed(() =>
  noteAidPrefersLearningSponsor(findNoteAidById(selectedAidId.value), {
    categoryId: selectedAidCategoryId.value
  })
);

const providerAgencyIdsForNote = computed(() =>
  (agencyStore.userAgencies || []).map((a) => Number(a?.id || 0)).filter((n) => n > 0)
);

const noteAidAgencyResolution = computed(() =>
  resolveNoteAidAgencyId({
    clientAgencyId: selectedClient.value?.agency_id || selectedClient.value?.agencyId || null,
    clientAgencyIds: clientAgencyMembershipIds.value,
    providerAgencyIds: providerAgencyIdsForNote.value,
    preferredAgencyId: noteAidAgencyChoiceId.value
      || selectedQueueAgencyId.value
      || null,
    preferLearningSponsor: preferLearningSponsorForAid.value,
    learningSponsorAgencyIds: learningSponsorAgencyIds.value
  })
);

const noteAidAgencyNeedsChoice = computed(() => !!noteAidAgencyResolution.value?.needsChoice);
const noteAidAgencyCandidates = computed(() => noteAidAgencyResolution.value?.candidates || []);

const noteAidAgencyId = computed(() => {
  const resolved = noteAidAgencyResolution.value;
  if (resolved?.agencyId) return resolved.agencyId;
  if (!selectedClient.value) {
    return Number(selectedQueueAgencyId.value || currentAgencyId.value || 0) || null;
  }
  return null;
});

/** Tenant id for chart saves (plan import) — never null when client + workspace exist. */
const chartAgencyIdForSave = computed(() => {
  const resolved = Number(noteAidAgencyId.value || 0)
    || Number(selectedClient.value?.agency_id || selectedClient.value?.agencyId || 0)
    || Number(selectedQueueAgencyId.value || 0)
    || Number(currentAgencyId.value || 0);
  return resolved || null;
});

function chartAgencyCandidates() {
  return [...new Set(
    [
      Number(noteAidAgencyId.value || 0),
      Number(chartAgencyIdForSave.value || 0),
      Number(selectedQueueAgencyId.value || 0),
      Number(currentAgencyId.value || 0),
      Number(selectedClient.value?.agency_id || selectedClient.value?.agencyId || 0),
      ...(clientAgencyMembershipIds.value || [])
    ].filter((n) => Number.isInteger(n) && n > 0)
  )];
}

function scoreChartPlan(plan) {
  if (!plan) return -1;
  const goals = activePlanGoals(plan);
  const recency = Number(plan.id || 0);
  const imported = String(plan.source_tool_id || plan.sourceToolId || '') === 'note_aid_plan_import';
  const intakeAuto = /^Intake Treatment Plan/i.test(String(plan.title || ''));
  // Imported treatment plans always outrank intake auto-drafts for chart display.
  if (imported) return 50_000 + recency;
  if (intakeAuto) return recency;
  return goals.length ? 10_000 + recency : recency;
}
const agencyLookup = computed(() => {
  const map = {};
  for (const a of agencyStore.userAgencies || []) {
    const id = Number(a?.id || 0);
    if (id) map[id] = a.name || a.organization_name || `Tenant #${id}`;
  }
  return map;
});
const isProgressAid = computed(() => aidKind(selectedAid.value) === 'progress');
const usesFreeformCsPathway = computed(() => aidUsesFreeformCsPathway(selectedAid.value));
const pathwayStandardLabel = computed(() =>
  usesFreeformCsPathway.value ? 'Freeform' : 'SOAP / freeform'
);

const csNoteBuildAgencyEnabled = computed(() => {
  const flags = parseFeatureFlags(agencyStore.currentAgency?.feature_flags || agencyStore.currentAgency?.featureFlags);
  return isTruthyFlag(flags.csNoteBuildEnabled);
});

const showCsNoteBuildPathway = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (!(role === 'super_admin' || csNoteBuildAgencyEnabled.value)) return false;
  // H0023 / H0031 additional: Freeform + CSNoteBuild (never SOAP).
  if (usesFreeformCsPathway.value) return true;
  return isProgressAid.value;
});

const useCsNoteBuildPathway = computed(
  () => showCsNoteBuildPathway.value && notePathway.value === 'csNoteBuild'
);

const csIsTelehealth = computed(() => {
  const loc = String(sessionLocationLabel.value || '').toLowerCase();
  return /tele|video|virtual/.test(loc);
});

const csProposedInterventions = computed(() => {
  const fromGoals = [];
  for (const g of activeTreatmentGoals.value || []) {
    for (const o of g.objectives || []) {
      const t = String(o.objective_text || '').trim();
      if (t && t.length < 80) fromGoals.push(t);
    }
  }
  return fromGoals.slice(0, 8);
});

const csGenerateDisabled = computed(() => {
  if (generating.value || !canUseTool.value) return true;
  if (noteAidAgencyNeedsChoice.value && !noteAidAgencyId.value) return true;
  const goalIds = (activeTreatmentGoals.value || []).map((g) => g.id).filter(Boolean);
  const { complete } = csNoteBuildCompletionCount(csNoteBuildState.value, {
    isTelehealth: csIsTelehealth.value,
    goalIds,
    skipMse: skipMentalStatusExam.value
  });
  return !complete;
});

const activeWorkQueueItemId = ref(null);
const activeWorkQueueItem = computed(
  () => (workQueueItems.value || []).find((i) => i.id === activeWorkQueueItemId.value) || null
);
const showSessionContextStrip = computed(() =>
  !!(
    sessionOfficeEventId.value
    || bookingContext.value?.officeEventId
    || activeWorkQueueItem.value?.officeEventId
  )
);
/** Times / place of service only when linked to a scheduled event or clinical/billing session. */
const hasScheduledSessionContext = computed(() =>
  !!(
    showSessionContextStrip.value
    || bookingContext.value?.clinicalSessionId
    || sessionClinicalSessionId.value
    || canApproveToClinicalRecord.value
  )
);
const noteWizardStep = ref(1);
const canContinueToWriteStep = computed(() =>
  !!(String(dateOfService.value || '').trim() && (effectiveClientId.value || String(initials.value || '').trim()))
);
function goToWriteStep() {
  if (!canContinueToWriteStep.value) return;
  noteWizardStep.value = 2;
}
const skipMentalStatusExam = computed(() =>
  aidSkipsMentalStatusExam(selectedAid.value, actualServiceCode.value)
);
const chartDiagnosisMode = computed(() => aidDiagnosisMode(selectedAid.value));
const mseSkipLabel = computed(() => {
  const code = String(actualServiceCode.value || selectedAid.value?.serviceCode || '').toUpperCase();
  if (code === 'H0004') return 'Mental status exam is not used for H0004.';
  if (code === 'H0031') return 'Mental status exam is not used for H0031.';
  if (code === 'H0023') return 'Mental status exam is not used for H0023 outreach.';
  return 'Mental status exam skipped for this service.';
});
const structuredChartDiagnoses = computed(() => {
  const list = Array.isArray(chartDiagnoses.value) ? chartDiagnoses.value : [];
  const mode = chartDiagnosisMode.value;
  if (mode === 'none') return [];
  if (mode === 'zr_only') {
    return list.filter((d) => isSocialDeterminantCode(d?.icd10_code || d?.code || d?.icd10Code));
  }
  return list;
});
/** Chart MSE/risk only when a client is linked — never for sessionless tools or orphan drafts. */
const isSessionlessAid = computed(() => !!selectedAid.value?.sessionless || !!selectedAid.value?.standaloneModal);
const showStructuredChartPanel = computed(() => {
  if (isSessionlessAid.value) return false;
  // H0023 outreach: no chart MSE/dx strip (Colorado freeform note only).
  if (chartDiagnosisMode.value === 'none' && skipMentalStatusExam.value) return false;
  return !!effectiveClientId.value;
});
const familyAttendeesRequired = computed(() => {
  const code = String(actualServiceCode.value || '').toUpperCase();
  if (code !== '90846' && code !== '90847') return false;
  return sessionParticipants.value !== 'Client Only';
});
const quickSessionServiceCodeChoices = computed(() => {
  const aid = selectedAid.value;
  if (!aid) return [];
  if (aid.codeGroupId) {
    const g = NOTE_TYPE_GROUPS.find((x) => x.id === aid.codeGroupId);
    return Array.isArray(g?.codes) ? [...g.codes] : [];
  }
  const code = String(aid.serviceCode || '').trim().toUpperCase();
  return code ? [code] : [];
});
function onQuickSessionServiceCode(code) {
  const next = String(code || '').trim().toUpperCase();
  if (!next) return;
  selectedServiceCode.value = next;
  otherServiceCode.value = '';
  applyParticipantsDefaultForServiceCode(next);
  // Autoselect matching Note Aid when the clinician changes the service code.
  let hit = findNoteAidByToolOrCode({ serviceCode: next });
  if (hit?.aid && !aidIsEligible(hit.aid)) {
    hit = ['90832', '90834', '90837'].includes(next) ? findNoteAidById('psychotherapy') : null;
  }
  if (hit?.aid && aidIsEligible(hit.aid) && hit.aid.id !== selectedAidId.value) {
    selectedAidId.value = hit.aid.id;
    selectedNoteCategory.value = hit.category?.id || selectedNoteCategory.value;
    if (hit.aid.autoSelect) autoSelectCode.value = true;
  }
  if (lastGeneratedServiceCode.value && lastGeneratedServiceCode.value !== next) {
    serviceCodeChangedAfterGenerate.value = true;
  }
  applyBillingRulesForCurrentSession({ announce: true });
}
const sessionClinicianLabel = computed(() => {
  const u = authStore.user || {};
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  const cred = u.credentials || u.license_type || u.credential || '';
  if (name && cred) return `${name}, ${cred}`;
  return name || 'Clinician';
});
const sessionPatientLabel = computed(
  () =>
    selectedClient.value?.full_name
    || activeWorkQueueItem.value?.clientName
    || initials.value
    || 'Patient'
);
const sessionDateTimeLabel = computed(() => {
  const start = sessionScheduledStart.value || activeWorkQueueItem.value?.scheduledStart;
  const end = sessionScheduledEnd.value || activeWorkQueueItem.value?.scheduledEnd;
  if (!start) return dateOfService.value || '';
  try {
    const s = new Date(start);
    const e = end ? new Date(end) : null;
    const datePart = s.toLocaleDateString();
    const timePart = e
      ? `${s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–${e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${datePart} · ${timePart}`;
  } catch {
    return String(start);
  }
});
const sessionParticipantsHint = computed(() => {
  if (sessionParticipants.value !== 'Client Only') return false;
  const panelBlob = (displayPanels.value || []).map((p) => panelText(p)).join('\n').trim();
  const blob = panelBlob
    ? [panelBlob, revisionInstruction.value].filter(Boolean).join('\n')
    : [inputText.value, revisionInstruction.value].filter(Boolean).join('\n');
  return participantsLikelyIncludeOthers(blob);
});
const sessionParticipantsFlag = computed(
  () => sessionParticipantsHint.value && !participantsPresenceDismissed.value
);
const canConfirmAndSign = computed(() => {
  if (isClientChartAid.value) return true;
  if (sessionParticipantsFlag.value) return false;
  if (familyAttendeesRequired.value && !String(sessionParticipantsDetail.value || '').trim()) return false;
  const hasScheduledSession = !!(
    bookingContext.value?.officeEventId
    || sessionOfficeEventId.value
    || bookingContext.value?.clinicalSessionId
  );
  // Note-only (no calendar) generates can save without MSE; scheduled sessions still require it.
  if (!hasScheduledSession) return true;
  if (!skipMentalStatusExam.value) {
    const domains = chartMentalStatus.value?.domains || {};
    const hasAny = Object.keys(domains).length > 0;
    if (!hasAny && !chartMentalStatus.value?.allNormal && !chartMentalStatus.value?.allNotAssessed) {
      return false;
    }
  }
  return true;
});
const attestAccurateAndComplete = ref(false);
const attestMedicallyNecessary = ref(false);
const canSubmitSignature = computed(
  () => canConfirmAndSign.value
    && attestAccurateAndComplete.value
    && attestMedicallyNecessary.value
);
const needsSessionPicker = computed(() => {
  if (!isProgressAid.value) return false;
  if (!showProgressSessionPicker.value) return false;
  if (draftId.value) return false;
  if (activeWorkQueueItemId.value) return false;
  if (bookingContext.value?.clinicalSessionId || bookingContext.value?.officeEventId) return false;
  if (sessionOfficeEventId.value) return false;
  if (progressEntryMode.value === 'unlinked') return false;
  return true;
});

/** Client can be cleared only when the note is not tied to a booked session. */
const isNoteSessionLocked = computed(() => {
  if (sessionOfficeEventId.value || sessionClinicalSessionId.value) return true;
  if (bookingContext.value?.officeEventId || bookingContext.value?.clinicalSessionId) return true;
  const draftRow = (recentDrafts.value || []).find((d) => String(d.id) === String(draftId.value));
  if (draftRow?.office_event_id || draftRow?.clinical_session_id) return true;
  return false;
});

const canEditNoteSubject = computed(() => !isNoteSessionLocked.value);

const canClearLinkedClient = computed(() => canEditNoteSubject.value);

const noteSubjectLabel = computed(() => {
  if (selectedClient.value) return clientDisplayName(selectedClient.value);
  return String(initials.value || '').trim() || '—';
});

function resolveDraftClientIdForSave() {
  if (isNoteSessionLocked.value) {
    return Number(selectedClientId.value || bookingContext.value?.clientId || 0) || null;
  }
  return Number(selectedClientId.value || 0) || null;
}

/**
 * Trust the stored chart client. Compact codes like COLPRA do not match
 * display initials ("C. P."); treating that as an orphan unlinked the
 * client and autosaved the unlink onto the draft.
 */
function resolveDraftClientIdOnLoad(d) {
  return Number(d?.client_id || d?.clientId || 0) || null;
}

function syncRouteNoteClient(clientId) {
  const nextQuery = { ...route.query };
  const cid = Number(clientId || 0);
  if (cid) {
    nextQuery.clientId = String(cid);
    delete nextQuery.client_id;
  } else {
    delete nextQuery.clientId;
    delete nextQuery.client_id;
  }
  router.replace({ query: nextQuery }).catch(() => {});
}
const inputText = ref('');
const includeInteractiveComplexity = ref(false);
const notePathway = ref('standard'); // 'standard' | 'csNoteBuild'
const csNoteBuildState = ref(createEmptyCsNoteBuildState());
const csNoteBuildPanelRef = ref(null);
const csProposingPlan = ref(false);
const inputMode = ref('type'); // type | speak
const sidebarTab = ref('started'); // started | completed | signed
const draftSearch = ref('');
const libraryGroupBy = ref('status');
const libraryDateOrder = ref('newest');
const libraryConnectionFilter = ref('');
const libraryTenantFilter = ref('');
const libraryCollapsed = ref(true);
const workQueueCollapsed = ref(false);
const libraryExpanded = ref(false);

watch(libraryCollapsed, (collapsed) => {
  if (!collapsed && typeof window !== 'undefined' && window.innerWidth < 1400) {
    workQueueCollapsed.value = true;
  }
});

watch([libraryCollapsed, libraryExpanded], ([collapsed, expanded]) => {
  if (expanded && collapsed) {
    libraryCollapsed.value = false;
    return;
  }
  saveNoteLibraryUiPrefs(authStore.user?.id, {
    collapsed: libraryCollapsed.value,
    expanded: libraryExpanded.value
  });
});
const openDateGroups = ref({});
const collapseAllSections = ref(false);
const collapsedPanels = reactive({});
const archivingDraft = ref(false);
const archiveMessage = ref('');
const currentDraftArchivedAt = ref(null);
const currentDraftCreatedAt = ref(null);
const autoSelectCode = ref(false);
const forceAutoSelect = computed(() => String(derivedTier.value || '') === 'unknown');
const bookingPrefillApplied = ref(false);
const therapyPrefillApplied = ref(false);
const clientPresentInRecording = ref(true);
const clientConsentOnFile = ref('');
const clientConsentTaskId = ref(null);
const additionalParticipantPresent = ref(false);
const additionalParticipantConsentOnFile = ref('');
const additionalParticipantConsentTaskId = ref(null);
const selectedAudioAgreementTemplateId = ref('');
const recordingConsentError = ref('');
const downloadingAudioAgreementTemplate = ref(false);
const recordingPurpose = ref('dictation');
/** Session capture lives in Session Recording tool; Note Aid speak mode is dictation-only. */
const isSessionRecording = computed(() => false);
const recordSessionModalOpen = ref(false);
const recordSessionIntentHandled = ref(false);
const consentSessionLaunching = ref(false);
const consentSessionError = ref('');
const canLaunchConsentSession = computed(() =>
  !!String(selectedAudioAgreementTemplateId.value || '').trim() && !!currentAgencyId.value
);

// Draft state
const draftId = ref(null);
/** Chart clinical_notes row opened for read-only section copy. */
const viewingChartNote = ref(null);
/** Chart note id for read-only signed / chart copy view (independent of draft outputObj). */
const signedNoteViewerId = ref(null);
const signedNoteViewerAgencyId = ref(null);
const chartNoteReadOnly = computed(() => !!viewingChartNote.value || !!signedNoteViewerId.value);

function clearSignedNoteViewer() {
  signedNoteViewerId.value = null;
  signedNoteViewerAgencyId.value = null;
}

async function openSignedClinicalNote(noteId, { agencyId = null, preserveWorkQueueId = null } = {}) {
  const nid = Number(noteId || 0);
  if (!nid) return false;
  signedNoteViewerId.value = nid;
  signedNoteViewerAgencyId.value = Number(agencyId || 0) || null;
  noteWizardStep.value = 2;
  configExpanded.value = false;
  approvalError.value = '';
  await loadClinicalNoteIntoWorkspace(nid, { agencyId, preserveWorkQueueId });
  return true;
}
const lastSavedAt = ref('');
let autosaveTimer = null;
let autosaveBusy = false;
let workQueueActivateSeq = 0;
let clientHydrateSeq = 0;
let autosaveDebounceTimer = null;
let workspaceHydrateDepth = 0;
let persistClientUnlink = false;

function isWorkspaceHydrating() {
  return workspaceHydrateDepth > 0;
}

function beginWorkspaceHydration() {
  cancelPendingAutosave();
  workspaceHydrateDepth += 1;
}

function endWorkspaceHydration() {
  workspaceHydrateDepth = Math.max(0, workspaceHydrateDepth - 1);
  cancelPendingAutosave();
}

function scheduleAutosave(delayMs = 1500) {
  if (!canUseTool.value || isWorkspaceHydrating()) return;
  if (autosaveDebounceTimer) clearTimeout(autosaveDebounceTimer);
  const seq = workQueueActivateSeq;
  const saveDraftId = draftId.value;
  autosaveDebounceTimer = setTimeout(() => {
    autosaveDebounceTimer = null;
    if (isWorkspaceHydrating()) return;
    if (seq !== workQueueActivateSeq) return;
    if (saveDraftId && String(draftId.value || '') !== String(saveDraftId)) return;
    autosave();
  }, delayMs);
}

function cancelPendingAutosave() {
  if (autosaveDebounceTimer) {
    clearTimeout(autosaveDebounceTimer);
    autosaveDebounceTimer = null;
  }
}

function dropMissingDraftFromUi(goneId) {
  const gone = String(goneId || '');
  if (!gone) return;
  recentDrafts.value = (recentDrafts.value || []).filter((d) => String(d.id) !== gone);
  if (String(draftId.value || '') === gone) draftId.value = null;
  workQueueItems.value = (workQueueItems.value || []).map((row) =>
    String(row.draftId || '') === gone ? { ...row, draftId: null } : row
  );
  persistWorkQueue();
}

const looksEncryptedEnvelope = (raw) => {
  try {
    const parsed = JSON.parse(String(raw || ''));
    return !!(parsed && parsed._enc === true);
  } catch {
    return false;
  }
};

const unwrapDraftText = (raw) => {
  if (raw == null) return '';
  const s = String(raw);
  if (!looksEncryptedEnvelope(s)) return s;
  // Encrypted empty / failed-decrypt envelopes should never appear in the editor.
  try {
    const parsed = JSON.parse(s);
    if (!parsed?.ciphertext) return '';
  } catch {
    return '';
  }
  return '';
};

// Recording state
const recording = ref(false);
const recordingBusy = ref(false);
const audioBlob = ref(null);
const audioMimeType = ref('');
const audioDurationSeconds = ref(0);
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let speechRecognition = null;
const speechSupported = ref(false);
const transcribing = ref(false);
const liveTranscript = ref('');

const speakVisualizerCanvasEl = ref(null);
const recordingStartedAt = ref(null);
const speakRecordingSeconds = ref(0);
let audioAnalyser = null;
let audioAnalyserContext = null;
let visualizerRafId = 0;
let visualizerData = null;
let visualizerTick = 0;

const speakRecordingTimeLabel = computed(() => {
  const total = Math.max(0, speakRecordingSeconds.value);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
});

function stopVisualizerLoop() {
  if (visualizerRafId) {
    cancelAnimationFrame(visualizerRafId);
    visualizerRafId = 0;
  }
}

function stopSpeakAudioAnalyser() {
  recordingStartedAt.value = null;
  speakRecordingSeconds.value = 0;
  teardownSpeakAudioAnalyserOnly();
}

function teardownSpeakAudioAnalyserOnly() {
  try {
    if (audioAnalyserContext && audioAnalyserContext.state !== 'closed') {
      audioAnalyserContext.close();
    }
  } catch {
    // ignore
  }
  audioAnalyserContext = null;
  audioAnalyser = null;
  visualizerData = null;
}

function stopSpeakVisualizer() {
  stopVisualizerLoop();
  stopSpeakAudioAnalyser();
}

function resizeSpeakCanvas(canvas) {
  const host = canvas.parentElement;
  if (!host) return;
  const rect = host.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }
}

function drawSpeakVisualizer() {
  const canvas = speakVisualizerCanvasEl.value;
  if (!canvas) {
    visualizerRafId = 0;
    return;
  }
  if (inputMode.value !== 'speak' && !recording.value) {
    visualizerRafId = 0;
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    visualizerRafId = 0;
    return;
  }

  resizeSpeakCanvas(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w, h);

  if (recordingStartedAt.value) {
    speakRecordingSeconds.value = Math.floor((Date.now() - recordingStartedAt.value) / 1000);
  }

  const barCount = 42;
  const gap = 3 * dpr;
  const barWidth = Math.max(2 * dpr, (w - gap * (barCount - 1)) / barCount);
  visualizerTick += recording.value ? 0.12 : 0.05;

  if (recording.value && audioAnalyser && visualizerData) {
    audioAnalyser.getByteFrequencyData(visualizerData);
  }

  for (let i = 0; i < barCount; i += 1) {
    let amplitude = 0.1;
    if (recording.value && visualizerData) {
      const idx = Math.min(visualizerData.length - 1, Math.floor((i / barCount) * visualizerData.length));
      amplitude = Math.max(0.08, visualizerData[idx] / 255);
    } else {
      amplitude = 0.08 + 0.07 * Math.sin(visualizerTick + i * 0.32);
    }

    const barH = Math.max(6 * dpr, amplitude * h * 0.62);
    const x = i * (barWidth + gap);
    const y = (h - barH) / 2;
    const gradient = ctx.createLinearGradient(0, y, 0, y + barH);
    gradient.addColorStop(0, recording.value ? '#99f6e4' : '#a7f3d0');
    gradient.addColorStop(1, recording.value ? '#0f766e' : '#14b8a6');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, barWidth, barH, barWidth / 2);
    } else {
      ctx.rect(x, y, barWidth, barH);
    }
    ctx.fill();
  }

  visualizerRafId = requestAnimationFrame(drawSpeakVisualizer);
}

function startSpeakVisualizerIdle() {
  stopVisualizerLoop();
  if (inputMode.value !== 'speak') return;
  visualizerRafId = requestAnimationFrame(drawSpeakVisualizer);
}

function startSpeakVisualizer(stream) {
  teardownSpeakAudioAnalyserOnly();
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx && stream) {
      audioAnalyserContext = new AudioCtx();
      const source = audioAnalyserContext.createMediaStreamSource(stream);
      audioAnalyser = audioAnalyserContext.createAnalyser();
      audioAnalyser.fftSize = 128;
      audioAnalyser.smoothingTimeConstant = 0.78;
      visualizerData = new Uint8Array(audioAnalyser.frequencyBinCount);
      source.connect(audioAnalyser);
    }
  } catch {
    // Visualizer falls back to idle animation if analyser setup fails.
  }
  startSpeakVisualizerIdle();
}

// Output state
const generating = ref(false);
const generateError = ref('');
const outputObj = ref(null);
const copied = ref(false);
const copiedSectionId = ref('');
let copiedSectionTimer = null;
const revisionInstruction = ref('');
const newNoteMenuOpen = ref(false);
const configExpanded = ref(true); // kept for draft load compatibility; wizard uses noteWizardStep
const dateOfServiceInputEl = ref(null);
const initialsInputEl = ref(null);
const approvalMessage = ref('');
const approvalError = ref('');
const approvingNote = ref(false);
const savingTreatmentPlan = ref(false);
const medicalBillingFlags = computed(() => {
  const aid = Number(noteAidAgencyId.value || 0);
  const list = [
    ...(agencyStore.userAgencies || []),
    ...(agencyStore.agencies || [])
  ];
  const match = aid ? list.find((a) => Number(a?.id) === aid) : null;
  const agency = match || agencyStore.currentAgency;
  return parseAgencyFeatureFlags(agency?.feature_flags || agency?.featureFlags);
});
const serverTranscribing = ref(false);
const serverTranscribeError = ref('');
const SERVER_TRANSCRIBE_MIN_SECONDS = 75;

// Recent drafts (sidebar)
const showRecent = ref(true);
const recentLoading = ref(false);
const recentError = ref('');
const recentDrafts = ref([]);
const signedNoteSessions = ref([]);
const selectedDraftIds = ref([]);
const deletingDrafts = ref(false);

const STATIC_COMMON_CODES = [
  // QBHA
  'H0023',
  'H0025',
  'H2014',
  'H2015',
  'H2016',
  'H2017',
  'H2018',
  'H2021',
  'H2022',
  'S9454',
  '97535',
  // Bachelor+
  'H0004',
  'H0031',
  'H0032',
  'H2033',
  'T1017',
  // Common psychotherapy/intake codes in your agent set
  'H0002',
  '90791',
  '90832',
  '90834',
  '90837',
  '90839',
  '90846',
  '90847',
  // Supervision accrual codes used elsewhere in the system
  '99414',
  '99416'
];

const HIDDEN_ADDON_CODES = HIDDEN_NOTE_AID_CODES;
const NOTE_TYPE_GROUPS = NOTE_TYPE_CODE_GROUPS;

const includeAfterHours99051 = ref(false);
const billingAddons = ref([]);
const billingPrimaryUnits = ref(1);
const billingRulesBanner = ref('');
const serviceCodeChangedAfterGenerate = ref(false);
const lastGeneratedServiceCode = ref('');

function applyBillingRulesForCurrentSession({ announce = false } = {}) {
  const primary = String(actualServiceCode.value || selectedServiceCode.value || '').trim().toUpperCase();
  if (!primary || primary === '__OTHER__') return;
  const resolved = resolveNoteAidBillingCodes({
    primaryCode: primary,
    durationMinutes: sessionDurationMinutes.value,
    includeInteractiveComplexity: includeInteractiveComplexity.value,
    includeAfterHours99051: includeAfterHours99051.value,
    sessionStartAt: sessionScheduledStart.value || null
  });
  billingAddons.value = resolved.addons || [];
  billingPrimaryUnits.value = resolved.primaryUnits || 1;
  if (resolved.switchedFrom && resolved.primaryCode !== primary) {
    selectedServiceCode.value = resolved.primaryCode;
    otherServiceCode.value = '';
  }
  if (!resolved.allow90785 && includeInteractiveComplexity.value) {
    includeInteractiveComplexity.value = false;
  }
  if (shouldSuggest99051(sessionScheduledStart.value || null) && !includeAfterHours99051.value) {
    includeAfterHours99051.value = true;
    if (!billingAddons.value.some((a) => a.code === '99051')) {
      billingAddons.value = [...billingAddons.value, { code: '99051', units: 1 }];
    }
  }
  const warnings = (resolved.warnings || []).filter(Boolean);
  if (announce && warnings.length) {
    billingRulesBanner.value = warnings.join(' ');
    sessionCodeSwitchBanner.value = warnings[0] || sessionCodeSwitchBanner.value;
  } else if (!warnings.length) {
    billingRulesBanner.value = '';
  }
}

async function loadAgencyNoteAidCatalog() {
  const agencyId = Number(noteAidAgencyId.value || currentAgencyId.value || agencyStore.currentAgencyId || 0);
  if (!agencyId) {
    agencyNoteAidCatalog.value = {
      settings: [],
      assignments: [],
      customAids: [],
      peopleScopedCatalogIds: [],
      peopleScopedCustomIds: []
    };
    return;
  }
  try {
    const { data } = await api.get('/note-aid/catalog', {
      params: { agencyId },
      skipGlobalLoading: true
    });
    agencyNoteAidCatalog.value = {
      settings: data?.settings || [],
      assignments: data?.assignments || [],
      customAids: data?.customAids || [],
      peopleScopedCatalogIds: data?.peopleScopedCatalogIds || [],
      peopleScopedCustomIds: data?.peopleScopedCustomIds || []
    };
  } catch {
    // Catalog settings are optional; fall back to built-in defaults.
  }
}

const SERVICE_CODE_DESCRIPTIONS = {
  '90791': 'Psychiatric diagnostic intake/assessment.',
  '90832': 'Individual therapy, 16-37 minutes.',
  '90834': 'Individual therapy, 38-52 minutes.',
  '90837': 'Individual therapy, 53+ minutes.',
  '90839': 'Crisis psychotherapy.',
  '90846': 'Family therapy without client present.',
  '90847': 'Family/couples therapy with client present.',
  'H0002': 'Behavioral health screening/intake-type support.',
  'H0004': 'Individual counseling/therapy tied to plan goals.',
  'H0023': 'Behavioral health outreach and engagement.',
  'H0025': 'Behavioral health prevention education.',
  'H0031': 'Clinical assessment and treatment recommendations.',
  'H0032': 'Treatment/service plan development and updates.',
  'H2014': 'Skills training/development and community support.',
  'H2015': 'Comprehensive community support (children/adolescents).',
  'H2016': 'H2015 extended/day-format variant.',
  'H2017': 'Psychosocial rehab/add-on support (per policy/catalog).',
  'H2018': 'Psychosocial rehab extended support (per policy/catalog).',
  'H2021': 'Wrap-around/community-based support services.',
  'H2022': 'H2021 extended/day-format variant.',
  'H2033': 'Intensive home/family/community treatment.',
  'T1017': 'Case management and care coordination.',
  'S9454': 'Stress management education class.',
  '97535': 'Self-care/home-management training.',
  '99414': 'Supervision accrual/support code.',
  '99416': 'Supervision accrual/support code (extended).'
};

// Allow manual entry if a code isn't listed; backend still enforces eligibility.
const canUseOtherCode = computed(() => true);

const rawEligibleServiceCodes = computed(() => {
  const raw = eligibleServiceCodes.value;
  const list = Array.isArray(raw) ? raw : STATIC_COMMON_CODES;
  return Array.from(new Set(list.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))).sort();
});

/** @deprecated use noteTypeOptions — kept for any legacy references */
const serviceCodeOptions = computed(() => rawEligibleServiceCodes.value);

const serviceCodeDescription = (code) => SERVICE_CODE_DESCRIPTIONS[String(code || '').trim().toUpperCase()] || '';
const serviceCodeOptionLabel = (code) => {
  const normalized = String(code || '').trim().toUpperCase();
  const desc = serviceCodeDescription(normalized);
  return desc ? `${normalized} — ${desc}` : normalized;
};

const noteTypeOptions = computed(() => {
  const available = new Set(rawEligibleServiceCodes.value);
  const used = new Set();
  const options = [];

  for (const g of NOTE_TYPE_GROUPS) {
    const present = g.codes.filter((c) => available.has(c));
    if (!present.length) continue;
    present.forEach((c) => used.add(c));
    const primary = present.includes(g.primary) ? g.primary : present[0];
    options.push({
      value: g.id,
      label: g.label,
      codes: present,
      primary
    });
  }

  for (const code of rawEligibleServiceCodes.value) {
    if (used.has(code) || HIDDEN_ADDON_CODES.has(code)) continue;
    options.push({
      value: code,
      label: serviceCodeOptionLabel(code),
      codes: [code],
      primary: code
    });
  }
  return options;
});

const noteTypePrimaryCode = (selection) => {
  const v = String(selection || '').trim();
  if (!v || v === '__other__') return '';
  const opt = (noteTypeOptions.value || []).find((o) => o.value === v);
  if (opt?.primary) return opt.primary;
  const group = NOTE_TYPE_GROUPS.find((g) => g.id === v);
  if (group) return group.primary;
  return v.toUpperCase();
};

/** Declared before any watch/computed that reads it (avoids TDZ white screen). */
const actualServiceCode = computed(() => {
  if (selectedServiceCode.value === '__other__') return String(otherServiceCode.value || '').trim().toUpperCase();
  const fromPicker = noteTypePrimaryCode(selectedServiceCode.value);
  if (fromPicker) return fromPicker;
  const aidCode = String(selectedAid.value?.serviceCode || '').trim().toUpperCase();
  if (aidCode) return aidCode;
  if (selectedAid.value?.codeGroupId) {
    const g = NOTE_TYPE_GROUPS.find((x) => x.id === selectedAid.value.codeGroupId);
    if (g?.primary) return g.primary;
  }
  return '';
});

function aidIsEligible(aid) {
  if (!aid || RETIRED_NOTE_AID_IDS.has(aid.id)) return false;
  if (!aidIsVisibleForTiers(aid, derivedTier.value)) return false;
  const available = new Set(rawEligibleServiceCodes.value);
  const code = String(aid.serviceCode || '').toUpperCase();
  if (!code) return true;
  if (HIDDEN_ADDON_CODES.has(code)) return false;
  if (!Array.isArray(eligibleServiceCodes.value)) return true;
  if (!available.size) return true;
  if (available.has(code)) return true;
  if (aid.codeGroupId) {
    const g = NOTE_TYPE_GROUPS.find((x) => x.id === aid.codeGroupId);
    return !!(g && g.codes.some((c) => available.has(c)));
  }
  return true;
}

const aidsForSelectedCategory = computed(() => {
  const cat = noteAidCategories.value.find((c) => c.id === selectedNoteCategory.value);
  if (!cat) return [];
  return (cat.aids || []).filter((aid) => aidIsEligible(aid));
});

const selectedAidGuidance = computed(() => String(selectedAid.value?.guidance || '').trim());
const selectedAidForcesAutoSelect = computed(() => !!selectedAid.value?.autoSelect);
const selectedCategoryLabel = computed(() => {
  const cat = noteAidCategories.value.find((c) => c.id === selectedNoteCategory.value);
  return cat?.label || '';
});
/** Show aid library when user is picking a tool (create new or change tool). */
const showAidPicker = ref(false);
const amendmentParentNoteId = ref(null);

const hasOpenNote = computed(() => {
  if (isEmbedded.value) return true;
  return !!(
    draftId.value
    || String(selectedAidId.value || '').trim()
    || activeWorkQueueItemId.value
    || signedNoteViewerId.value
    || viewingChartNote.value
  );
});

const showStartPage = computed(() => !isEmbedded.value && !hasOpenNote.value && !showAidPicker.value);

/** @deprecated use showAidPicker */
const showLibraryPanel = computed(() => showAidPicker.value);
const clientSetupComplete = computed(() => {
  if (!effectiveClientId.value) return false;
  return demographicsOnFile.value && intakeOnFile.value && planOnFile.value && !!primaryChartDiagnosis.value;
});

const startPageClientLabel = computed(() => {
  if (selectedClient.value?.full_name || selectedClient.value?.name) {
    return selectedClient.value.full_name || selectedClient.value.name;
  }
  return 'none selected';
});

const workspaceTitle = computed(() =>
  selectedAid.value?.label
  || (outputObj.value?.meta?.source === 'session_recording' ? 'Session Recording' : 'Note')
);

const quickSessionServiceLabel = computed(() => {
  const code = actualServiceCode.value || '';
  const label = selectedAid.value?.label || noteTypeDisplayLabel.value || '';
  if (code && label) return `${code} — ${label}`;
  return code || label || '—';
});

const sessionDurationHint = computed(() => {
  if (chartNoteReadOnly.value) return '';
  const code = actualServiceCode.value || '';
  const def = defaultDurationMinutesForServiceCode(code);
  if (showSessionContextStrip.value || sessionScheduledStart.value || sessionScheduledEnd.value) {
    return `Confirm duration — most sessions do not last exactly the ${def}-minute code default. You can change duration and/or start–end times.`;
  }
  return `Default ${def} min${code ? ` for ${code}` : ''}. Start and end are optional when no appointment is linked.`;
});

function isoToLocalTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function applySessionTimingDefaults({ force = false } = {}) {
  const hasCalendar =
    !!(sessionScheduledStart.value || sessionScheduledEnd.value || showSessionContextStrip.value);
  if (sessionScheduledStart.value) {
    sessionStartTimeLocal.value = isoToLocalTime(sessionScheduledStart.value);
  }
  if (sessionScheduledEnd.value) {
    sessionEndTimeLocal.value = isoToLocalTime(sessionScheduledEnd.value);
  }
  if (sessionScheduledStart.value && sessionScheduledEnd.value) {
    try {
      const a = new Date(sessionScheduledStart.value);
      const b = new Date(sessionScheduledEnd.value);
      const mins = Math.round((b.getTime() - a.getTime()) / 60000);
      if (Number.isFinite(mins) && mins > 0) {
        sessionDurationMinutes.value = mins;
        return;
      }
    } catch {
      // fall through to code default
    }
  }
  if (force || sessionDurationMinutes.value == null || sessionDurationMinutes.value === '') {
    sessionDurationMinutes.value = defaultDurationMinutesForServiceCode(actualServiceCode.value);
  }
  if (!hasCalendar && force) {
    // Keep start/end optional for queue/todo notes without appointment times.
  }
}

function collapseSidebarsForNote() {
  libraryCollapsed.value = true;
  workQueueCollapsed.value = true;
  libraryExpanded.value = false;
}

watch(hasOpenNote, (open) => {
  if (open && !isEmbedded.value) {
    collapseSidebarsForNote();
    if (!signedNoteViewerId.value) noteWizardStep.value = 2;
    nextTick(() => applySessionTimingDefaults({ force: sessionDurationMinutes.value == null }));
  }
});

function beginCreateNote() {
  startNewNote();
  showAidPicker.value = true;
}

function cancelAidPicker() {
  showAidPicker.value = false;
}

async function closeNoteWorkspace() {
  if (draftId.value && !chartNoteReadOnly.value) {
    try { await autosave(); } catch { /* ignore */ }
  }
  cancelPendingAutosave();
  amendmentParentNoteId.value = null;
  draftId.value = null;
  viewingChartNote.value = null;
  clearSignedNoteViewer();
  selectedAidId.value = '';
  selectedNoteCategory.value = '';
  activeWorkQueueItemId.value = null;
  outputObj.value = null;
  inputText.value = '';
  revisionInstruction.value = '';
  approvalMessage.value = '';
  approvalError.value = '';
  archiveMessage.value = '';
  generateError.value = '';
  participantsPresenceDismissed.value = false;
  sessionParticipantsDetail.value = '';
  sessionStartTimeLocal.value = '';
  sessionEndTimeLocal.value = '';
  sessionDurationMinutes.value = null;
  attestAccurateAndComplete.value = false;
  attestMedicallyNecessary.value = false;
  showAidPicker.value = false;
  noteWizardStep.value = 1;
  sidebarTab.value = DOC_STATUS.STARTED;
  selectedClientId.value = null;
  selectedClient.value = null;
  resetClientClinicalContext();
  await clearDraftFromRouteQuery();
  syncRouteNoteClient(null);
}

const libraryUserId = computed(() => authStore.user?.id || null);

async function beginAmendmentFromSignedNote() {
  if (!signedNoteViewerId.value) return;
  amendmentParentNoteId.value = signedNoteViewerId.value;
  signedNoteViewerId.value = null;
  signedNoteViewerAgencyId.value = null;
  viewingChartNote.value = null;
  noteWizardStep.value = 2;
  collapseSidebarsForNote();
  approvalMessage.value = `Amendment draft — original note #${amendmentParentNoteId.value} stays on file. Save and sign to create the updated copy.`;
  await saveDraftNow();
}
const showInteractiveComplexityOption = computed(() => {
  if (!aidAllowsInteractiveComplexity(selectedAid.value)) return false;
  const code = String(actualServiceCode.value || '').toUpperCase();
  const resolved = resolveNoteAidBillingCodes({
    primaryCode: code,
    durationMinutes: sessionDurationMinutes.value,
    includeInteractiveComplexity: true,
    includeAfterHours99051: includeAfterHours99051.value,
    sessionStartAt: sessionScheduledStart.value || null
  });
  return !!resolved.allow90785;
});
const showAfterHours99051Option = computed(() => {
  const code = String(actualServiceCode.value || selectedServiceCode.value || '').toUpperCase();
  if (!code || HIDDEN_NOTE_AID_CODES.has(code)) return false;
  // Offer toggle whenever a billable progress/intake session is being documented.
  return !!selectedAid.value && aidKind(selectedAid.value) !== 'plan';
});
const libraryCategories = computed(() => {
  const filtered = (noteAidCategories.value || []).map((cat) => ({
    ...cat,
    aids: (cat.aids || []).filter((aid) => aidIsEligible(aid))
  })).filter((cat) => cat.aids.length);
  return orderNoteAidCategoriesForHcbs(filtered, hcbsCategory.value);
});
/** Explicit gem/tool from the Aid picker — this is how we reuse the working Gemini Gem prompts in-app. */
const selectedToolId = computed(() => {
  if (forceAutoSelect.value || selectedAidForcesAutoSelect.value || autoSelectCode.value) {
    return 'clinical_code_decider';
  }
  return String(selectedAid.value?.toolId || '').trim();
});

/** Tool id used to gate + run generation — falls back to billing code when aid metadata is thin. */
const resolveGenerateToolId = computed(() => {
  if (forceAutoSelect.value || selectedAidForcesAutoSelect.value || autoSelectCode.value) {
    return 'clinical_code_decider';
  }
  const fromAid = String(selectedAid.value?.toolId || '').trim();
  if (fromAid) return fromAid;
  const code = String(
    actualServiceCode.value || outputObj.value?.meta?.serviceCode || ''
  ).trim().toUpperCase();
  if (!code) return '';
  const hit = findNoteAidByToolOrCode({ serviceCode: code });
  return String(hit?.aid?.toolId || '').trim();
});
const showBillingCodePicker = computed(() => {
  if (forceAutoSelect.value) return false;
  if (selectedAidForcesAutoSelect.value) return false;
  if (selectedAid.value?.serviceCode || selectedAid.value?.codeGroupId) return true;
  // After Change tool (or thin draft metadata): billing code on Step 1 still resolves Generate.
  if (!selectedAid.value && (draftId.value || effectiveClientId.value)) return true;
  return false;
});
const showAutoSelectCodeOption = computed(() => {
  if (forceAutoSelect.value) return false;
  const cat = selectedNoteCategory.value;
  return cat === 'universal' || cat === 'psychotherapy' || cat === 'additional';
});

const resolveNoteTypeSelection = (raw) => {
  const v = String(raw || '').trim();
  if (!v || v === '__other__') return v;
  const upper = v.toUpperCase();
  const byId = NOTE_TYPE_GROUPS.find((g) => g.id === v);
  if (byId) return byId.id;
  const byCode = NOTE_TYPE_GROUPS.find((g) => g.codes.includes(upper));
  if (byCode) {
    const available = new Set(rawEligibleServiceCodes.value);
    if (byCode.codes.some((c) => available.has(c))) return byCode.id;
  }
  return upper;
};

watch(selectedNoteCategory, () => {
  const aids = aidsForSelectedCategory.value;
  if (selectedAidId.value && !aids.some((a) => a.id === selectedAidId.value)) {
    selectedAidId.value = '';
  }
});

watch(showInteractiveComplexityOption, (allowed) => {
  if (!allowed) includeInteractiveComplexity.value = false;
});

function onLibrarySelect({ aid, categoryId }) {
  selectedNoteCategory.value = categoryId || findNoteAidById(aid?.id)?.category?.id || '';
  if (aid?.standaloneModal === 'diagnosis') {
    selectedAidId.value = '';
    showAidPicker.value = false;
    showDiagnosisWriterModal.value = true;
    return;
  }
  if (aid?.standaloneModal === 'treatment_plan') {
    selectedAidId.value = '';
    showAidPicker.value = false;
    showTreatmentPlanWriterModal.value = true;
    return;
  }
  selectedAidId.value = aid?.id || '';
  showAidPicker.value = false;
  noteWizardStep.value = 2;
  collapseSidebarsForNote();
  nextTick(() => applySessionTimingDefaults({ force: sessionDurationMinutes.value == null }));
  if (draftId.value && (String(inputText.value || '').trim() || outputObj.value)) {
    noteWizardStep.value = 2;
  }
}

function changeNoteAid() {
  selectedAidId.value = '';
  selectedNoteCategory.value = '';
  showAidPicker.value = true;
  noteWizardStep.value = 1;
  approvalMessage.value = 'Choose a note tool from the library below.';
}

watch(selectedAidId, (aidId) => {
  const aid = selectedAid.value || findNoteAidById(aidId)?.aid;
  if (aidKind(aid) === 'progress' || aidUsesFreeformCsPathway(aid)) {
    const hasSession = !!(bookingContext.value?.clinicalSessionId || bookingContext.value?.officeEventId);
    const lockedByDraftOrQueue = !!(draftId.value || activeWorkQueueItemId.value);
    showProgressSessionPicker.value =
      !hasSession && progressEntryMode.value === 'appointment' && !lockedByDraftOrQueue;
  } else {
    showProgressSessionPicker.value = false;
  }
  if (!aid) return;
  if (aid.autoSelect) {
    autoSelectCode.value = true;
    selectedServiceCode.value = '';
    otherServiceCode.value = '';
    return;
  }
  // Leaving Code Decider (or switching gems): clear AI-choose unless still on a code-capable family.
  if (
    autoSelectCode.value
    && (selectedNoteCategory.value === 'universal'
      || selectedNoteCategory.value === 'psychotherapy'
      || selectedNoteCategory.value === 'additional')
  ) {
    // keep checkbox if user still wants it
  } else {
    autoSelectCode.value = false;
  }
  if (aid.serviceCode || aid.codeGroupId) {
    if (aid.codeGroupId) {
      const g = NOTE_TYPE_GROUPS.find((x) => x.id === aid.codeGroupId);
      selectedServiceCode.value = g?.primary || aid.serviceCode || '';
    } else {
      selectedServiceCode.value = aid.serviceCode;
    }
    otherServiceCode.value = '';
    applyParticipantsDefaultForServiceCode(selectedServiceCode.value);
  } else {
    selectedServiceCode.value = '';
    otherServiceCode.value = '';
  }
});

const formatTherapyRangeLine = (startRaw, endRaw) => {
  try {
    const a = startRaw ? new Date(startRaw) : null;
    const b = endRaw ? new Date(endRaw) : null;
    if (a && !Number.isNaN(a.getTime()) && b && !Number.isNaN(b.getTime())) {
      return `${a.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} – ${b.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
    }
    if (a && !Number.isNaN(a.getTime())) return a.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    // ignore
  }
  return '';
};

const applyTherapyContextPrefill = () => {
  if (therapyPrefillApplied.value) return;
  const t = therapyContext.value;
  if (!t) {
    therapyPrefillApplied.value = true;
    return;
  }
  const start = t.therapyStartAt;
  if (start) {
    try {
      const d = new Date(start);
      if (!Number.isNaN(d.getTime())) {
        dateOfService.value = d.toISOString().slice(0, 10);
      }
    } catch {
      // ignore
    }
  }
  const summary = t.therapySummary || '';
  if (summary) {
    const forTherapy = summary.match(/^([^\s]+)\s+for\s+therapy/i);
    const initialsMatch = forTherapy ? forTherapy[1] : summary.match(/^([A-Za-z]{2,8})\b/);
    if (initialsMatch && String(initialsMatch[1]).length <= 16) {
      initials.value = String(initialsMatch[1]).slice(0, 16);
    }
  }
  const rangeLine = formatTherapyRangeLine(t.therapyStartAt, t.therapyEndAt);
  const lines = [];
  if (summary) lines.push(`Therapy Notes session: ${summary}`);
  if (rangeLine) lines.push(`When: ${rangeLine}`);
  if (t.therapyCalendarLabel) lines.push(`Calendar: ${t.therapyCalendarLabel}`);
  if (lines.length && !String(inputText.value || '').trim()) {
    inputText.value = lines.join('\n');
  }
  therapyPrefillApplied.value = true;
  if (String(dateOfService.value || '').trim() && String(initials.value || '').trim()) {
    configExpanded.value = false;
    noteWizardStep.value = 2;
  }
};

const applyBookingContextPrefill = () => {
  if (bookingPrefillApplied.value) return;
  const prefilledCode = String(bookingContext.value?.serviceCode || '').trim().toUpperCase();
  if (!prefilledCode) {
    bookingPrefillApplied.value = true;
    return;
  }
  if (forceAutoSelect.value) return;
  if (HIDDEN_ADDON_CODES.has(prefilledCode)) {
    bookingPrefillApplied.value = true;
    return;
  }
  const resolved = resolveNoteTypeSelection(prefilledCode);
  const known = (noteTypeOptions.value || []).some((o) => o.value === resolved || o.codes.includes(prefilledCode));
  if (known) {
    selectedServiceCode.value = resolved;
    otherServiceCode.value = '';
  } else {
    selectedServiceCode.value = '__other__';
    otherServiceCode.value = prefilledCode;
  }
  autoSelectCode.value = false;
  bookingPrefillApplied.value = true;
};

const showProgramDropdown = computed(
  () => !!selectedAid.value?.needsProgram || actualServiceCode.value === 'H2014'
);
const requiresConsentTemplateSelection = computed(
  () => (
    (clientPresentInRecording.value && clientConsentOnFile.value === 'no')
      || (additionalParticipantPresent.value && additionalParticipantConsentOnFile.value === 'no')
  )
    && Array.isArray(audioAgreementTemplates.value)
    && audioAgreementTemplates.value.length > 0
);
const canServerTranscribe = computed(() => {
  if (!audioBlob.value) return false;
  if (recording.value || serverTranscribing.value) return false;
  if (Number(audioDurationSeconds.value || 0) < SERVER_TRANSCRIBE_MIN_SECONDS) return false;
  return true;
});
const serverTranscribeDisabledReason = computed(() => {
  if (!audioBlob.value) return 'Record audio first.';
  if (recording.value) return 'Stop recording before server transcription.';
  if (serverTranscribing.value) return 'Server transcription is in progress.';
  const secs = Number(audioDurationSeconds.value || 0);
  if (secs < SERVER_TRANSCRIBE_MIN_SECONDS) {
    return `Server transcription is enabled for longer clips (${SERVER_TRANSCRIBE_MIN_SECONDS}s+). Current clip: ${Math.max(0, Math.round(secs))}s.`;
  }
  return '';
});
const audioDurationLabel = computed(() => {
  const total = Math.max(0, Math.round(Number(audioDurationSeconds.value || 0)));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
});

watch(showProgramDropdown, (on) => {
  if (!on) selectedProgramId.value = '';
});
watch(inputMode, async (mode) => {
  stopSpeakVisualizer();
  if (mode === 'speak') {
    await nextTick();
    startSpeakVisualizerIdle();
  }
});
watch(autoSelectCode, (on) => {
  if (on) {
    selectedServiceCode.value = '';
    otherServiceCode.value = '';
    selectedProgramId.value = '';
  }
});
watch(forceAutoSelect, (on) => {
  if (on) {
    autoSelectCode.value = true;
    selectedServiceCode.value = '';
    otherServiceCode.value = '';
    selectedProgramId.value = '';
  }
});
watch(clientPresentInRecording, (on) => {
  if (!on) {
    clientConsentOnFile.value = '';
    clientConsentTaskId.value = null;
  }
});
watch(clientConsentOnFile, (v) => {
  if (v !== 'no') {
    clientConsentTaskId.value = null;
    return;
  }
  if (v === 'no' && canLaunchConsentSession.value && !clientConsentTaskId.value && !consentSessionLaunching.value) {
    launchConsentSigningSession('client');
  }
});
watch(additionalParticipantPresent, (on) => {
  if (!on) {
    additionalParticipantConsentOnFile.value = '';
    additionalParticipantConsentTaskId.value = null;
    selectedAudioAgreementTemplateId.value = '';
  }
});
watch(additionalParticipantConsentOnFile, (v) => {
  if (v !== 'no') {
    additionalParticipantConsentTaskId.value = null;
    return;
  }
  if (v === 'no' && canLaunchConsentSession.value && !additionalParticipantConsentTaskId.value && !consentSessionLaunching.value) {
    launchConsentSigningSession('additional');
  }
});
watch(selectedAudioAgreementTemplateId, () => {
  consentSessionError.value = '';
  clientConsentTaskId.value = null;
  additionalParticipantConsentTaskId.value = null;
  if (clientConsentOnFile.value === 'no' && canLaunchConsentSession.value && !consentSessionLaunching.value) {
    launchConsentSigningSession('client');
    return;
  }
  if (
    additionalParticipantPresent.value
    && additionalParticipantConsentOnFile.value === 'no'
    && canLaunchConsentSession.value
    && !consentSessionLaunching.value
  ) {
    launchConsentSigningSession('additional');
  }
});
watch(recordingPurpose, (mode) => {
  recordingConsentError.value = '';
  consentSessionError.value = '';
  if (mode !== 'session') {
    // Session-specific fields are irrelevant in dictation-only mode.
    clientPresentInRecording.value = true;
    clientConsentOnFile.value = '';
    clientConsentTaskId.value = null;
    additionalParticipantPresent.value = false;
    additionalParticipantConsentOnFile.value = '';
    additionalParticipantConsentTaskId.value = null;
    selectedAudioAgreementTemplateId.value = '';
  }
});

const eligibleCodesLabel = computed(() => {
  if (Array.isArray(eligibleServiceCodes.value)) return `${eligibleServiceCodes.value.length}`;
  if (String(derivedTier.value || '').toLowerCase() === 'intern_plus') return 'All codes (enter manually if not listed)';
  return '';
});

const generateDisabled = computed(() => {
  if (skipAiAid.value) return true;
  if (generating.value) return true;
  if (recording.value || recordingBusy.value) return true;
  if (noteAidAgencyNeedsChoice.value && !noteAidAgencyId.value) return true;
  if (familyAttendeesRequired.value && !String(sessionParticipantsDetail.value || '').trim()) return true;
  const hasText = !!String(inputText.value || '').trim();
  const hasAudio = !!audioBlob.value;
  // Treatment summary can generate from chart attendance/progress alone (+ optional clinician blurb).
  if (isTreatmentSummaryAid.value && effectiveClientId.value) {
    if (!forceAutoSelect.value && !resolveGenerateToolId.value) return true;
    return false;
  }
  if (!hasText && !hasAudio) return true;
  if (!forceAutoSelect.value && !resolveGenerateToolId.value) return true;
  return false;
});

const generateBlockedReason = computed(() => {
  if (skipAiAid.value) return 'Skip AI is on — write each section manually below.';
  if (generating.value) return 'Generating…';
  if (recording.value) return 'Stop recording before generating.';
  if (recordingBusy.value) return 'Finishing recording…';
  if (noteAidAgencyNeedsChoice.value && !noteAidAgencyId.value) {
    return 'Choose which agency this note belongs to (above).';
  }
  if (familyAttendeesRequired.value && !String(sessionParticipantsDetail.value || '').trim()) {
    return 'Name who attended (participants detail is required for family/couples codes).';
  }
  if (isTreatmentSummaryAid.value && !effectiveClientId.value) {
    return 'Link a client so attendance, progress, and scaled objectives can be loaded.';
  }
  if (isTreatmentSummaryAid.value && effectiveClientId.value) return '';
  const hasText = !!String(inputText.value || '').trim();
  const hasAudio = !!audioBlob.value;
  if (!hasText && !hasAudio) return 'Add session notes in the box above or record dictation.';
  if (!forceAutoSelect.value && !resolveGenerateToolId.value) {
    if (!selectedAidId.value) {
      return 'No note tool selected — use Change tool and pick an aid from the library, or set a billing code on Step 1.';
    }
    return 'Set a billing code on Step 1, or pick a note tool that matches this session.';
  }
  return '';
});

const getAudioBlobDurationSeconds = async (blob) => {
  if (!blob) return 0;
  return await new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const d = Number(audio.duration || 0);
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(d) && d > 0 ? d : 0);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      audio.src = url;
    } catch {
      resolve(0);
    }
  });
};

const compactCodeDeciderRationale = (raw, chosenCode) => {
  const text = String(raw || '').trim();
  if (!text) return '';
  const lines = text.split('\n');
  const isCodeHeader = (line) => /^code\s*:/i.test(String(line || '').trim());
  const normalizedChosen = String(chosenCode || '').trim().toUpperCase();
  const firstCodeIdx = lines.findIndex((line) => isCodeHeader(line));
  if (firstCodeIdx < 0) return text;

  // Preserve any brief leading context before code-by-code blocks.
  const preface = lines.slice(0, firstCodeIdx).join('\n').trim();

  const pickBlockFrom = (startIdx) => {
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i += 1) {
      if (isCodeHeader(lines[i])) {
        endIdx = i;
        break;
      }
    }
    return lines.slice(startIdx, endIdx).join('\n').trim();
  };

  let chosenBlock = '';
  if (normalizedChosen) {
    const chosenIdx = lines.findIndex((line) => {
      const m = String(line || '').match(/^code\s*:\s*([A-Za-z0-9_-]+)/i);
      return String(m?.[1] || '').toUpperCase() === normalizedChosen;
    });
    if (chosenIdx >= 0) chosenBlock = pickBlockFrom(chosenIdx);
  }
  if (!chosenBlock) chosenBlock = pickBlockFrom(firstCodeIdx);

  if (!preface) return chosenBlock || text;
  if (!chosenBlock) return preface;
  return `${preface}\n\n${chosenBlock}`.trim();
};

const sectionEntries = computed(() => {
  const sections = extractSections(outputObj.value);
  const toolId = String(outputObj.value?.meta?.toolId || '').trim().toLowerCase();
  const chosenCode = String(sections?.Code || '').trim();
  const entries = Object.entries(sections);
  if (toolId !== 'clinical_code_decider') return entries;
  return entries.map(([title, text]) => {
    if (!/rationale/i.test(String(title || ''))) return [title, text];
    const compacted = compactCodeDeciderRationale(text, chosenCode);
    return [title, compacted || text];
  });
});

const sectionOverrides = reactive({});
const sectionEditing = reactive({});

const mergedSectionEntries = computed(() =>
  sectionEntries.value.map(([title, base]) => {
    const text = Object.prototype.hasOwnProperty.call(sectionOverrides, title) ? sectionOverrides[title] : base;
    return [title, text];
  })
);

const displayPanels = computed(() => {
  const sections = Object.fromEntries(mergedSectionEntries.value || []);
  return buildDisplaySections(sections);
});

const canSaveTreatmentPlanToChart = computed(() => {
  if (!isClinicalChartEnabled(medicalBillingFlags.value)) return false;
  if (!effectiveClientId.value) return false;
  const panels = displayPanels.value || [];
  return panels.some((p) => p.isTreatmentPlan || /^Goal\s*\d+/i.test(p.id || ''));
});

const noteTypeDisplayLabel = computed(() => {
  const sel = String(selectedServiceCode.value || '').trim();
  if (sel && sel !== '__other__') {
    const opt = (noteTypeOptions.value || []).find((o) => o.value === sel);
    if (opt?.label) return opt.label;
  }
  const code = actualServiceCode.value || outputObj.value?.meta?.serviceCode || '';
  if (!code) return 'Progress Note';
  const group = NOTE_TYPE_GROUPS.find((g) => g.codes.includes(String(code).toUpperCase()));
  if (group) return group.label;
  return serviceCodeOptionLabel(code);
});

const isCurrentDraftArchived = computed(() => !!currentDraftArchivedAt.value);

const configReadyForCollapse = computed(() => {
  return !!(String(dateOfService.value || '').trim() && String(initials.value || '').trim());
});

const showConfigSummary = computed(() => configReadyForCollapse.value && !configExpanded.value);

const configOptionsSummary = computed(() => {
  const bits = [];
  if (includeInteractiveComplexity.value && showInteractiveComplexityOption.value) {
    bits.push('Interactive Complexity');
  }
  if (autoSelectCode.value || forceAutoSelect.value || selectedAidForcesAutoSelect.value) {
    bits.push('AI code');
  } else if (noteTypeDisplayLabel.value) {
    bits.push(noteTypeDisplayLabel.value);
  }
  return bits.length ? bits.join(' · ') : 'Options';
});

const hasRevisionAdditions = computed(() => !!String(revisionInstruction.value || '').trim());

const canRegenerateFromDraft = computed(() => {
  if (generating.value) return false;
  if (hasRevisionAdditions.value) return true;
  if (String(inputText.value || '').trim()) return true;
  if (audioBlob.value) return true;
  return !!outputObj.value;
});

const regenerateDisabled = computed(() => !canRegenerateFromDraft.value);

const regenerateButtonLabel = computed(() => {
  if (generating.value) return 'Regenerating…';
  if (amendmentParentNoteId.value) return 'Regenerate as addendum format';
  if (serviceCodeChangedAfterGenerate.value) return 'Regenerate with new service code format';
  if (hasRevisionAdditions.value) return 'Regenerate with new additions';
  return 'Regenerate note';
});

function isCurrentLibraryRow(row) {
  if (!row) return false;
  if (draftId.value && row.draftId && String(row.draftId) === String(draftId.value)) return true;
  if (activeWorkQueueItemId.value && row.workQueueId && String(row.workQueueId) === String(activeWorkQueueItemId.value)) {
    return true;
  }
  if (activeWorkQueueItemId.value && row.source === 'work_queue' && row.raw?.id === activeWorkQueueItemId.value) {
    return true;
  }
  return false;
}

const nextInProgressRow = computed(() => {
  const rows = buildLeftLibraryRows({
    drafts: recentDrafts.value,
    workQueueItems: workQueueItems.value
  }).filter(
    (r) => normalizeDocStatus(r.docStatus) === DOC_STATUS.STARTED && !isCurrentLibraryRow(r)
  );
  return rows[0] || null;
});

const sortedWorkQueueItems = computed(() =>
  sortWorkQueueItems(
    filterWorkQueueForRightPanel(workQueueItems.value),
    workQueueSortBy.value,
    workQueueSortDir.value
  )
);

const nextInQueueItem = computed(() =>
  sortedWorkQueueItems.value.find(
    (i) => deriveWorkQueueDocStatus(i) === DOC_STATUS.NOT_STARTED
      && i.id !== activeWorkQueueItemId.value
  ) || sortedWorkQueueItems.value.find(
    (i) => deriveWorkQueueDocStatus(i) === DOC_STATUS.NOT_STARTED
  ) || null
);

const filteredSidebarDrafts = computed(() => {
  const q = String(draftSearch.value || '').trim().toLowerCase();
  let list = Array.isArray(recentDrafts.value) ? recentDrafts.value : [];
  if (sidebarTab.value === 'active') {
    list = list.filter((d) => !d?.archived_at);
  } else {
    list = list.filter((d) => !!d?.archived_at);
  }
  if (!q) return list;
  return list.filter((d) => {
    const hay = [
      d?.initials,
      d?.service_code,
      d?.date_of_service,
      d?.id,
      d?.input_text
    ]
      .map((x) => String(x || '').toLowerCase())
      .join(' ');
    return hay.includes(q);
  });
});

const draftCreatedKey = (raw) => {
  try {
    if (!raw) return 'unknown';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return 'unknown';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return 'unknown';
  }
};

const draftCreatedDayLabel = (raw) => {
  try {
    if (!raw) return 'Unknown date';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return 'Unknown date';
    const today = todayIsoDate();
    const key = draftCreatedKey(raw);
    if (key === today) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = draftCreatedKey(yesterday.toISOString());
    if (key === yKey) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown date';
  }
};

const sidebarDateGroups = computed(() => {
  const map = new Map();
  for (const d of filteredSidebarDrafts.value) {
    const key = draftCreatedKey(d?.created_at);
    if (!map.has(key)) {
      const parts = formatDraftListDate(d?.created_at);
      map.set(key, {
        key,
        month: parts.month || '—',
        day: parts.day || '—',
        label: draftCreatedDayLabel(d?.created_at),
        sortKey: key === 'unknown' ? '0000-00-00' : key,
        drafts: []
      });
    }
    map.get(key).drafts.push(d);
  }
  return Array.from(map.values())
    .map((g) => ({
      ...g,
      drafts: [...g.drafts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }))
    .sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));
});

const currentDraftCreatedLabel = computed(() => {
  const raw = currentDraftCreatedAt.value || (draftId.value
    ? recentDrafts.value.find((d) => String(d.id) === String(draftId.value))?.created_at
    : null);
  if (raw) {
    try {
      return new Date(raw).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return String(raw).slice(0, 16);
    }
  }
  return 'Not saved yet';
});

const effectiveCreatedDate = computed(() => {
  const raw = currentDraftCreatedAt.value || (draftId.value
    ? recentDrafts.value.find((d) => String(d.id) === String(draftId.value))?.created_at
    : null);
  if (raw) {
    try {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    } catch {
      // fall through
    }
  }
  return todayIsoDate();
});

const isDateGroupOpen = (key) => {
  if (Object.prototype.hasOwnProperty.call(openDateGroups.value, key)) {
    return !!openDateGroups.value[key];
  }
  // Default: open today, or the group containing the selected draft, or the newest group.
  if (key === todayIsoDate()) return true;
  if (draftId.value) {
    const selected = recentDrafts.value.find((d) => String(d.id) === String(draftId.value));
    if (selected && draftCreatedKey(selected.created_at) === key) return true;
  }
  if (sidebarDateGroups.value[0]?.key === key) return true;
  return false;
};

const toggleDateGroup = (key) => {
  const next = { ...openDateGroups.value };
  next[key] = !isDateGroupOpen(key);
  openDateGroups.value = next;
};

const draftDateParts = (raw) => formatDraftListDate(raw);
const draftTimeLabel = (raw) => formatDraftListTime(raw);
const draftNoteTypeLabel = (d) => {
  const parsed = (() => {
    try {
      const raw = d?.output_json;
      if (!raw) return null;
      return typeof raw === 'object' ? raw : JSON.parse(raw);
    } catch {
      return null;
    }
  })();
  if (String(parsed?.meta?.source || '') === 'session_recording') return 'Session Recording';
  const code = String(d?.service_code || '').trim().toUpperCase();
  if (!code) return 'Progress Note';
  const group = NOTE_TYPE_GROUPS.find((g) => g.codes.includes(code));
  if (group) return group.label;
  return serviceCodeDescription(code) ? `${code} Note` : code;
};

watch(outputObj, () => {
  Object.keys(sectionOverrides).forEach((k) => delete sectionOverrides[k]);
  Object.keys(sectionEditing).forEach((k) => delete sectionEditing[k]);
  Object.keys(collapsedPanels).forEach((k) => delete collapsedPanels[k]);
  if (outputObj.value?.meta?.includeInteractiveComplexity != null) {
    includeInteractiveComplexity.value =
      !!outputObj.value.meta.includeInteractiveComplexity && aidAllowsInteractiveComplexity(selectedAid.value);
  }
});

const toggleSectionEdit = (title) => {
  const t = String(title || '');
  const next = !sectionEditing[t];
  sectionEditing[t] = next;
  if (next) {
    const panel = displayPanels.value.find((p) => p.id === t);
    const base = panel?.text ?? sectionEntries.value.find(([x]) => x === t)?.[1] ?? '';
    if (!Object.prototype.hasOwnProperty.call(sectionOverrides, t)) {
      sectionOverrides[t] = base;
    }
  }
};

const panelText = (panel) => {
  const id = panel?.id;
  if (id && Object.prototype.hasOwnProperty.call(sectionOverrides, id)) {
    return sectionOverrides[id];
  }
  return panel?.text || '';
};

const isPanelCollapsed = (id) => {
  if (collapseAllSections.value) return true;
  return !!collapsedPanels[id];
};

const togglePanelCollapsed = (id) => {
  collapsedPanels[id] = !collapsedPanels[id];
};

const generationLogicSummary = computed(() => {
  const meta = outputObj.value?.meta || {};
  const toolId = String(meta?.toolId || '').trim();
  const model = String(meta?.model || '').trim();
  const sections = extractSections(outputObj.value);
  const chosenCode = String(sections?.Code || '').trim();
  const base = toolId
    ? `Generator: ${toolId}`
    : 'Generator: not available yet';
  const codePart = chosenCode ? ` • Chosen code: ${chosenCode}` : '';
  const modelPart = model ? ` • Model: ${model}` : '';
  return `${base}${codePart}${modelPart}`;
});

const copyText = async (text) => {
  try {
    const t = String(text || '');
    if (!t) return;
    copied.value = false;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
    } else {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1500);
    return true;
  } catch {
    return false;
  }
};

/** Copy section body only (not the S/O/I/P title). */
const copySectionContent = async (panel) => {
  const ok = await copyText(panelText(panel));
  if (!ok) return;
  copiedSectionId.value = panel?.id || '';
  if (copiedSectionTimer) window.clearTimeout(copiedSectionTimer);
  copiedSectionTimer = window.setTimeout(() => {
    copiedSectionId.value = '';
    copiedSectionTimer = null;
  }, 1500);
};

const loadContext = async () => {
  try {
    if (!canUseTool.value) return;
    loadingContext.value = true;
    contextError.value = '';
    const res = await api.get('/clinical-notes/context', {
      params: { agencyId: currentAgencyId.value },
      skipGlobalLoading: true,
      timeout: 15000
    });
    providerCredentialText.value = String(res?.data?.providerCredentialText || '');
    derivedTier.value = String(res?.data?.derivedTier || 'unknown');
    hcbsCategory.value = res?.data?.hcbsCategory ?? null;
    eligibleServiceCodes.value = res?.data?.eligibleServiceCodes ?? null;
    audioAgreementTemplates.value = Array.isArray(res?.data?.audioAgreementTemplates) ? res.data.audioAgreementTemplates : [];
  } catch (e) {
    contextError.value = e.response?.data?.error?.message || 'Failed to load user context';
    providerCredentialText.value = '';
    derivedTier.value = 'unknown';
    hcbsCategory.value = null;
    eligibleServiceCodes.value = null;
    audioAgreementTemplates.value = [];
  } finally {
    loadingContext.value = false;
  }
};

const loadPrograms = async () => {
  try {
    if (!canUseTool.value) return;
    const res = await api.get('/clinical-notes/programs', {
      params: { agencyId: currentAgencyId.value },
      skipGlobalLoading: true,
      timeout: 15000
    });
    programs.value = Array.isArray(res?.data?.programs) ? res.data.programs : [];
  } catch {
    programs.value = [];
  }
};

const programLabel = (programId) => {
  if (!programId) return '—';
  const match = programs.value.find((p) => String(p?.id) === String(programId));
  return match?.name ? `${match.name} (#${match.id})` : `#${programId}`;
};

const autosave = async () => {
  if (!canUseTool.value || autosaveBusy || isWorkspaceHydrating()) return;
  const seq = workQueueActivateSeq;
  const targetDraftId = draftId.value;

  let rawInput = String(inputText.value || '');
  // Never persist ciphertext envelopes back into the form field.
  if (rawInput && looksEncryptedEnvelope(rawInput)) {
    rawInput = '';
    inputText.value = '';
  }

  const linkedClientId = resolveDraftClientIdForSave();
  const payload = {
    agencyId: noteAidAgencyId.value || currentAgencyId.value,
    preferLearningSponsor: preferLearningSponsorForAid.value,
    recordingPurpose: String(recordingPurpose.value || 'dictation'),
    serviceCode: autoSelectCode.value ? null : actualServiceCode.value || null,
    programId:
      showProgramDropdown.value && selectedProgram.value && !selectedProgram.value?.isCustom
        ? Number(selectedProgramId.value)
        : null,
    programLabel:
      showProgramDropdown.value && selectedProgram.value?.isCustom
        ? String(selectedProgram.value?.name || '').trim()
        : null,
    dateOfService: dateOfService.value ? String(dateOfService.value) : null,
    initials: initials.value ? String(initials.value) : null,
    officeEventId:
      Number(bookingContext.value?.officeEventId || sessionOfficeEventId.value || 0) || null,
    clinicalSessionId:
      Number(bookingContext.value?.clinicalSessionId || sessionClinicalSessionId.value || 0) || null
  };
  if (linkedClientId) {
    payload.clientId = linkedClientId;
    persistClientUnlink = false;
  } else if (persistClientUnlink) {
    payload.clientId = null;
    payload.unlinkClient = true;
    persistClientUnlink = false;
  }

  // Always persist typed or dictated session notes. On patch, omit when empty so we never wipe saved text.
  if (rawInput.trim()) {
    payload.inputText = rawInput;
  } else if (!targetDraftId) {
    payload.inputText = null;
  }

  // Create only after the clinician writes or dictates — client/initials/DOS
  // from a work-queue click must not spawn a new empty draft each time.
  const hasNoteBody = !!String(payload.inputText || '').trim();
  if (!targetDraftId && !hasNoteBody) return;
  if (seq !== workQueueActivateSeq) return;

  autosaveBusy = true;
  try {
    if (!targetDraftId) {
      const res = await api.post('/clinical-notes/drafts', payload, { skipGlobalLoading: true });
      if (seq !== workQueueActivateSeq || isWorkspaceHydrating()) return;
      const created = res?.data?.draft || null;
      draftId.value = created?.id || null;
      currentDraftCreatedAt.value = created?.created_at || new Date().toISOString();
      if (created?.id) {
        recentDrafts.value = [
          created,
          ...recentDrafts.value.filter((d) => String(d.id) !== String(created.id))
        ];
        const dayKey = draftCreatedKey(currentDraftCreatedAt.value);
        openDateGroups.value = { ...openDateGroups.value, [dayKey]: true };
        if (activeWorkQueueItemId.value) {
          workQueueItems.value = (workQueueItems.value || []).map((row) =>
            row.id === activeWorkQueueItemId.value ? { ...row, draftId: created.id } : row
          );
          persistWorkQueue();
        }
      }
    } else {
      if (String(draftId.value || '') !== String(targetDraftId)) return;
      await api.patch(`/clinical-notes/drafts/${targetDraftId}`, payload, { skipGlobalLoading: true });
      if (seq !== workQueueActivateSeq || String(draftId.value || '') !== String(targetDraftId)) return;
      recentDrafts.value = (recentDrafts.value || []).map((d) =>
        String(d.id) === String(targetDraftId)
          ? {
              ...d,
              date_of_service: payload.dateOfService || d.date_of_service,
              initials: payload.initials ?? d.initials,
              client_id: Object.prototype.hasOwnProperty.call(payload, 'clientId')
                ? payload.clientId
                : d.client_id,
              client_full_name: payload.clientId
                ? d.client_full_name
                : (Object.prototype.hasOwnProperty.call(payload, 'clientId') ? null : d.client_full_name),
              service_code: payload.serviceCode ?? d.service_code,
              input_text: payload.inputText !== undefined ? payload.inputText : d.input_text
            }
          : d
      );
    }
    lastSavedAt.value = new Date().toLocaleString();
  } catch (e) {
    const status = Number(e?.response?.status || 0);
    if (status === 404 && targetDraftId) {
      dropMissingDraftFromUi(targetDraftId);
    }
  } finally {
    autosaveBusy = false;
  }
};

async function saveDraftNow() {
  if (savingDraftManual.value || isWorkspaceHydrating()) return;
  savingDraftManual.value = true;
  approvalError.value = '';
  try {
    await autosave();
    if (draftId.value && lastSavedAt.value) {
      approvalMessage.value = `Draft saved (${lastSavedAt.value}).`;
    } else if (!draftId.value) {
      approvalMessage.value =
        'Add a client, initials, or note text, then Save — date of service alone won’t create a draft.';
    }
  } finally {
    savingDraftManual.value = false;
  }
}

function onDateOfServiceChanged() {
  // Persist DOS immediately when the clinician changes it (existing draft or enough context).
  saveDraftNow();
}

watch(dateOfService, (next, prev) => {
  if (prev === undefined) return;
  if (isWorkspaceHydrating()) return;
  if (String(next || '') === String(prev || '')) return;
  // Auto-persist DOS once a draft exists (Save still creates new drafts).
  if (!draftId.value) return;
  onDateOfServiceChanged();
});

function formatCreatedDisplay(raw) {
  try {
    if (!raw) return '—';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
    return d.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return String(raw || '—');
  }
}

const canDeleteCurrentDraft = computed(() => {
  if (!draftId.value) return false;
  // Note Aid drafts are never provider-signed clinical notes; signed session notes live elsewhere.
  const row = (recentDrafts.value || []).find((d) => String(d.id) === String(draftId.value));
  if (row?.provider_signed_at || row?.signed_at) return false;
  return true;
});

async function clearDraftFromRouteQuery() {
  if (isEmbedded.value) return;
  if (route.query?.draftId == null && route.query?.draft_id == null) return;
  const q = { ...route.query };
  delete q.draftId;
  delete q.draft_id;
  await router.replace({ query: q }).catch(() => {});
}

function agencyIdForDraftDelete(row = null) {
  return Number(
    row?.agency_id
    || row?.agencyId
    || selectedClient.value?.agency_id
    || selectedClient.value?.agencyId
    || noteAidAgencyId.value
    || currentAgencyId.value
    || 0
  ) || null;
}

async function deleteCurrentDraft() {
  if (!canDeleteCurrentDraft.value || deletingCurrentDraft.value) return;
  if (!window.confirm('Delete this draft note? This cannot be undone.')) return;
  deletingCurrentDraft.value = true;
  approvalError.value = '';
  try {
    const row = (recentDrafts.value || []).find((d) => String(d.id) === String(draftId.value));
    const res = await api.post(
      '/clinical-notes/drafts/delete',
      {
        agencyId: agencyIdForDraftDelete(row),
        draftIds: [Number(draftId.value)]
      },
      { skipGlobalLoading: true }
    );
    if (!Number(res?.data?.deletedCount || 0)) {
      approvalError.value = 'Draft was not deleted. Try again, or open it from the client chart.';
      return;
    }
    const id = draftId.value;
    if (autosaveDebounceTimer) {
      clearTimeout(autosaveDebounceTimer);
      autosaveDebounceTimer = null;
    }
    draftId.value = null;
    currentDraftCreatedAt.value = null;
    outputObj.value = null;
    inputText.value = '';
    recentDrafts.value = (recentDrafts.value || []).filter((d) => String(d.id) !== String(id));
    approvalMessage.value = 'Draft deleted.';
    await clearDraftFromRouteQuery();
    await loadRecent();
  } catch (e) {
    approvalError.value = e.response?.data?.error?.message || e.message || 'Failed to delete draft';
  } finally {
    deletingCurrentDraft.value = false;
  }
}

async function onLibrarySidebarDelete(row) {
  if (!row) return;
  if (row.source === 'work_queue') {
    const status = String(row.docStatus || '');
    if (status === 'signed') {
      approvalError.value = 'Signed notes cannot be deleted from Note Aid.';
      return;
    }
    if (!window.confirm('Remove this item from the work queue?')) return;
    workQueueItems.value = (workQueueItems.value || []).filter((i) => i.id !== row.workQueueId);
    if (activeWorkQueueItemId.value === row.workQueueId) activeWorkQueueItemId.value = null;
    persistWorkQueue();
    return;
  }
  const draftIdToDelete = row.draftId || row.raw?.id;
  if (!draftIdToDelete) return;
  if (row.docStatus === 'signed' || row.raw?.provider_signed_at) {
    approvalError.value = 'Signed notes cannot be deleted.';
    return;
  }
  if (!window.confirm('Delete this draft note? This cannot be undone.')) return;
  try {
    const res = await api.post(
      '/clinical-notes/drafts/delete',
      {
        agencyId: agencyIdForDraftDelete(row.raw),
        draftIds: [Number(draftIdToDelete)]
      },
      { skipGlobalLoading: true }
    );
    if (!Number(res?.data?.deletedCount || 0)) {
      approvalError.value = 'Draft was not deleted.';
      return;
    }
    if (String(draftId.value) === String(draftIdToDelete)) {
      if (autosaveDebounceTimer) {
        clearTimeout(autosaveDebounceTimer);
        autosaveDebounceTimer = null;
      }
      draftId.value = null;
      currentDraftCreatedAt.value = null;
      outputObj.value = null;
      inputText.value = '';
      await clearDraftFromRouteQuery();
    }
    await loadRecent();
    approvalMessage.value = 'Draft deleted.';
  } catch (e) {
    approvalError.value = e.response?.data?.error?.message || e.message || 'Failed to delete draft';
  }
}

const toggleRecording = async () => {
  if (recordingBusy.value) return;
  recordingConsentError.value = '';
  if (recording.value) {
    try {
      recordingBusy.value = true;
      mediaRecorder?.stop?.();
      stopTranscription();
      window.setTimeout(() => {
        if (recordingBusy.value && !recording.value) {
          recordingBusy.value = false;
        }
      }, 2500);
    } catch {
      recording.value = false;
      recordingBusy.value = false;
    }
    return;
  }

  try {
    if (isSessionRecording.value) {
      consentSessionError.value = '';
      if (clientPresentInRecording.value && !clientConsentOnFile.value) {
        recordingConsentError.value = 'Select whether client consent is already on file.';
        return;
      }
      if (clientPresentInRecording.value && clientConsentOnFile.value === 'no' && !clientConsentTaskId.value) {
        recordingConsentError.value = 'Launch and complete the client consent signing session before recording.';
        return;
      }
      if (clientPresentInRecording.value && clientConsentOnFile.value === 'no') {
        const clientDone = await isConsentTaskFinalized(clientConsentTaskId.value);
        if (!clientDone) {
          recordingConsentError.value = 'Client consent signing is not finalized yet.';
          openConsentSigningSession(clientConsentTaskId.value);
          return;
        }
      }
      if (additionalParticipantPresent.value && !additionalParticipantConsentOnFile.value) {
        recordingConsentError.value = 'Select whether additional-participant consent is already on file.';
        return;
      }
      if (
        additionalParticipantPresent.value
        && additionalParticipantConsentOnFile.value === 'no'
        && !additionalParticipantConsentTaskId.value
      ) {
        recordingConsentError.value = 'Launch and complete the additional-person signing session before recording.';
        return;
      }
      if (
        additionalParticipantPresent.value
        && additionalParticipantConsentOnFile.value === 'no'
      ) {
        const additionalDone = await isConsentTaskFinalized(additionalParticipantConsentTaskId.value);
        if (!additionalDone) {
          recordingConsentError.value = 'Additional-participant consent signing is not finalized yet.';
          openConsentSigningSession(additionalParticipantConsentTaskId.value);
          return;
        }
      }
      if (requiresConsentTemplateSelection.value && !String(selectedAudioAgreementTemplateId.value || '').trim()) {
        recordingConsentError.value = 'Select an audio recording agreement template for this session.';
        return;
      }
    }
    recordingBusy.value = true;
    audioChunks = [];
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(mediaStream);
    mediaRecorder = mr;
    audioMimeType.value = mr.mimeType || '';
    mr.ondataavailable = (e) => {
      if (e?.data && e.data.size > 0) audioChunks.push(e.data);
    };
    mr.onstop = () => {
      (async () => {
        try {
          const blob = new Blob(audioChunks, { type: mr.mimeType || 'audio/webm' });
          const hasTranscriptText = transcriptSource.value === 'audio' && !!String(inputText.value || '').trim();
          if (hasTranscriptText) {
            // Privacy-first: if we already have transcript text, don't retain local audio.
            audioBlob.value = null;
            audioDurationSeconds.value = 0;
          } else {
            audioBlob.value = blob.size > 0 ? blob : null;
            audioDurationSeconds.value = audioBlob.value ? await getAudioBlobDurationSeconds(audioBlob.value) : 0;
          }
        } catch {
          audioBlob.value = null;
          audioDurationSeconds.value = 0;
        }
        try {
          mediaStream?.getTracks?.().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        mediaStream = null;
        mediaRecorder = null;
        audioChunks = [];
        recording.value = false;
        recordingBusy.value = false;
        stopSpeakAudioAnalyser();
        stopTranscription();
        scheduleAutosave(400);
        if (inputMode.value === 'speak') {
          await nextTick();
          startSpeakVisualizerIdle();
        }
      })();
    };
    mr.onerror = () => {
      try {
        mediaStream?.getTracks?.().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      mediaStream = null;
      mediaRecorder = null;
      audioChunks = [];
      recording.value = false;
      recordingBusy.value = false;
      stopSpeakAudioAnalyser();
      stopTranscription();
      void nextTick().then(() => {
        if (inputMode.value === 'speak') startSpeakVisualizerIdle();
      });
    };
    mr.start();
    startTranscription();
    recording.value = true;
    recordingStartedAt.value = Date.now();
    speakRecordingSeconds.value = 0;
    recordingBusy.value = false;
    await nextTick();
    startSpeakVisualizer(mediaStream);
  } catch {
    recording.value = false;
    recordingBusy.value = false;
    stopSpeakVisualizer();
    stopTranscription();
  }
};

const clearAudio = () => {
  audioBlob.value = null;
  audioMimeType.value = '';
  audioDurationSeconds.value = 0;
};

const openRecordSessionModal = () => {
  recordSessionModalOpen.value = true;
  recordingPurpose.value = 'session';
  recordingConsentError.value = '';
};

const closeRecordSessionModal = () => {
  recordSessionModalOpen.value = false;
};

const startRecordingFromModal = async () => {
  recordingPurpose.value = 'session';
  await toggleRecording();
};

const transcribeAudioServer = async () => {
  if (!canServerTranscribe.value) return;
  if (!currentAgencyId.value) return;
  try {
    serverTranscribing.value = true;
    serverTranscribeError.value = '';
    const fd = new FormData();
    fd.append('agencyId', String(currentAgencyId.value));
    fd.append('recordingPurpose', String(recordingPurpose.value || 'dictation'));
    const name = `audio.${(audioBlob.value.type || '').includes('webm') ? 'webm' : 'blob'}`;
    fd.append('audio', audioBlob.value, name);
    const res = await api.post('/clinical-notes/transcribe', fd, { skipGlobalLoading: true });
    const transcript = String(res?.data?.transcriptText || '').trim();
    if (transcript) {
      appendTranscript(transcript);
      transcriptSource.value = 'audio';
      clearAudio();
    } else {
      serverTranscribeError.value = 'No transcript returned.';
    }
  } catch (e) {
    serverTranscribeError.value = e.response?.data?.error?.message || 'Failed to transcribe audio';
  } finally {
    serverTranscribing.value = false;
  }
};

const downloadAudioAgreementTemplate = async () => {
  const id = String(selectedAudioAgreementTemplateId.value || '').trim();
  if (!id) return;
  try {
    downloadingAudioAgreementTemplate.value = true;
    recordingConsentError.value = '';
    const resp = await api.get(`/document-templates/${id}/preview`, { responseType: 'blob' });
    const blob = resp?.data;
    if (!blob) throw new Error('No file returned');
    const selected = (audioAgreementTemplates.value || []).find((t) => String(t?.id) === id);
    const safeName = String(selected?.name || `audio-agreement-${id}`).replace(/[^a-zA-Z0-9._-]+/g, '_');
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (e) {
    recordingConsentError.value = e.response?.data?.error?.message || e.message || 'Failed to download agreement template';
  } finally {
    downloadingAudioAgreementTemplate.value = false;
  }
};

const openConsentSigningSession = (taskId) => {
  try {
    const id = Number(taskId || 0);
    if (!id) return;
    const url = orgTo(`/tasks/documents/${id}/sign`);
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    // ignore
  }
};

const launchConsentSigningSession = async (target) => {
  if (!canLaunchConsentSession.value) {
    consentSessionError.value = 'Select a consent/agreement template first.';
    return;
  }
  if (!currentAgencyId.value) return;
  const userId = Number(authStore.user?.id || 0);
  if (!userId) {
    consentSessionError.value = 'Could not determine current user for signing task.';
    return;
  }
  try {
    consentSessionLaunching.value = true;
    consentSessionError.value = '';
    const templateId = Number(selectedAudioAgreementTemplateId.value || 0);
    const selected = (audioAgreementTemplates.value || []).find((t) => Number(t?.id) === templateId);
    const consentLabel = target === 'additional' ? 'Additional-participant consent' : 'Client consent';
    const title = `${consentLabel} — ${selected?.name || 'Recording Agreement'}`;
    const payload = {
      agencyId: Number(currentAgencyId.value),
      templateId,
      title
    };
    const cid = retentionClientId.value;
    if (cid) payload.clientId = cid;
    const res = await api.post('/clinical-notes/consent-task', payload);
    const taskId = Number(res?.data?.id || 0) || null;
    if (!taskId) throw new Error('Task creation did not return an ID');
    if (target === 'additional') additionalParticipantConsentTaskId.value = taskId;
    else clientConsentTaskId.value = taskId;
    openConsentSigningSession(taskId);
  } catch (e) {
    consentSessionError.value = e.response?.data?.error?.message || e.message || 'Failed to launch consent signing session';
  } finally {
    consentSessionLaunching.value = false;
  }
};

const isConsentTaskFinalized = async (taskId) => {
  const id = Number(taskId || 0);
  if (!id) return false;
  try {
    const res = await api.get(`/document-signing/${id}`);
    return !!String(res?.data?.signedDocument?.signed_pdf_path || '').trim();
  } catch {
    return false;
  }
};

const transcriptSource = ref('');

const appendTranscript = (text) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return;
  const current = String(inputText.value || '');
  const combined = `${current}${current && !current.endsWith(' ') ? ' ' : ''}${trimmed}`.trim();
  inputText.value = combined.slice(0, 12000);
  scheduleAutosave(800);
};

const startTranscription = () => {
  liveTranscript.value = '';
  transcribing.value = false;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;
  try {
    speechRecognition = new SpeechRec();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = navigator?.language || 'en-US';
    speechRecognition.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        const transcript = String(res?.[0]?.transcript || '').trim();
        if (!transcript) continue;
        if (res.isFinal) finalText += `${transcript} `;
        else interim += `${transcript} `;
      }
      liveTranscript.value = interim.trim();
      if (finalText.trim()) {
        appendTranscript(finalText);
        transcriptSource.value = 'audio';
        liveTranscript.value = '';
      }
      if (String(inputText.value || '').length >= 11800) {
        stopTranscription();
      }
    };
    speechRecognition.onerror = () => {
      stopTranscription();
    };
    speechRecognition.onend = () => {
      transcribing.value = false;
    };
    speechRecognition.start();
    transcribing.value = true;
  } catch {
    stopTranscription();
  }
};

const stopTranscription = () => {
  if (String(liveTranscript.value || '').trim()) {
    appendTranscript(liveTranscript.value);
    transcriptSource.value = 'audio';
  }
  try {
    speechRecognition?.stop?.();
  } catch {
    // ignore
  }
  speechRecognition = null;
  transcribing.value = false;
  liveTranscript.value = '';
};

const generateNote = async () => {
  const isRevisionPass = !!outputObj.value && (
    !!String(revisionInstruction.value || '').trim()
    || !!String(inputText.value || '').trim()
    || !!audioBlob.value
  );
  if (useCsNoteBuildPathway.value) {
    if (csGenerateDisabled.value && !isRevisionPass) return;
  } else if (generateDisabled.value && !isRevisionPass) {
    return;
  }
  if (!canUseTool.value) return;

  if (noteAidAgencyNeedsChoice.value && !noteAidAgencyId.value) {
    generateError.value = 'Choose which tenant this note belongs to before generating.';
    return;
  }

  if (useCsNoteBuildPathway.value) {
    const serialized = serializeCsNoteBuildForGenerate(csNoteBuildState.value, {
      dateOfService: dateOfService.value,
      serviceCode: actualServiceCode.value,
      locationLabel: sessionLocationLabel.value,
      clientInitials: initials.value,
      isTelehealth: csIsTelehealth.value,
      skipMse: skipMentalStatusExam.value
    });
    inputText.value = serialized;
    const mins = csContactMinutes(csNoteBuildState.value.startTime, csNoteBuildState.value.endTime);
    if (mins != null) sessionDurationMinutes.value = mins;
    if (csNoteBuildState.value.participantsMode) {
      sessionParticipants.value = csNoteBuildState.value.participantsMode;
    }
  }

  const nameHits = detectKnownNamesInText(
    [inputText.value, liveTranscript.value, revisionInstruction.value].map((t) => String(t || '')).join('\n'),
    phiExtraNames.value
  );
  if (nameHits.length && !dismissPhiNameWarn.value) {
    const listed = nameHits.map((h) => h.token).join(', ');
    const proceed = window.confirm(
      `Possible client or caregiver name detected in your note text: ${listed}.\n\n` +
        'Protected health information (PHI) should not be typed or dictated. ' +
        'Replace names with roles such as client/patient, MOC (mother of client), FOC (father of client), or guardian.\n\n' +
        'Names are also scrubbed server-side before AI, but role language is preferred.\n\n' +
        'Click OK to generate anyway, or Cancel to edit the text first.'
    );
    if (!proceed) {
      generateError.value = `Replace detected name(s) (${listed}) with a role before generating.`;
      return;
    }
    dismissPhiNameWarn.value = true;
  }

  if (showObjectiveRatings.value && !useCsNoteBuildPathway.value && !isRevisionPass) {
    const needed = [];
    for (const g of activeTreatmentGoals.value) {
      for (const o of g.objectives || []) needed.push(String(o.id));
    }
    const rated = new Set(
      (sessionObjectiveRatings.value || [])
        .filter((r) => !r.raterKind || r.raterKind === 'clinician')
        .map((r) => String(r.objectiveId))
    );
    const missing = needed.filter((id) => !rated.has(id));
    if (missing.length) {
      generateError.value =
        'Rate each treatment objective (or choose Deferred / On hold / Not addressed) before generating.';
      return;
    }
  }

  try {
    generating.value = true;
    generateError.value = '';
    const completingQueueItemId = activeWorkQueueItemId.value;

    const fd = new FormData();
    fd.append('agencyId', String(noteAidAgencyId.value || currentAgencyId.value));
    if (preferLearningSponsorForAid.value) fd.append('preferLearningSponsor', '1');
    fd.append('recordingPurpose', String(recordingPurpose.value || 'dictation'));
    // Do NOT treat "no billing code" as auto-select — plans/termination/diagnosis use toolId only.
    const shouldAutoSelectCode =
      !!forceAutoSelect.value || !!selectedAidForcesAutoSelect.value || !!autoSelectCode.value;
    if (!shouldAutoSelectCode && actualServiceCode.value) {
      fd.append('serviceCode', actualServiceCode.value);
    }
    fd.append('autoSelectCode', String(shouldAutoSelectCode));
    if (!shouldAutoSelectCode && resolveGenerateToolId.value) {
      fd.append('toolId', useCsNoteBuildPathway.value ? 'clinical_cs_note_build' : String(resolveGenerateToolId.value));
    } else if (useCsNoteBuildPathway.value) {
      fd.append('toolId', 'clinical_cs_note_build');
    }
    if (selectedProgram.value?.isCustom && selectedProgram.value?.name) {
      fd.append('programLabel', String(selectedProgram.value.name));
    } else if (showProgramDropdown.value && selectedProgramId.value) {
      fd.append('programId', String(selectedProgramId.value));
    }
    if (transcriptSource.value) fd.append('transcriptSource', transcriptSource.value);
    if (dateOfService.value) fd.append('dateOfService', String(dateOfService.value));
    fd.append('dateWritten', String(effectiveCreatedDate.value));
    if (initials.value) fd.append('initials', String(initials.value));
    if (effectiveClientId.value) fd.append('clientId', String(effectiveClientId.value));
    const oeId = Number(bookingContext.value?.officeEventId || sessionOfficeEventId.value || 0);
    const csId = Number(bookingContext.value?.clinicalSessionId || sessionClinicalSessionId.value || 0);
    if (oeId) fd.append('officeEventId', String(oeId));
    if (csId) fd.append('clinicalSessionId', String(csId));
    const planBits = [];
    const planCtx = buildTreatmentPlanContextText(latestTreatmentPlan.value, pastedPlanText.value);
    if (planCtx) planBits.push(planCtx);
    const dxLines = (chartDiagnoses.value || [])
      .filter((d) => d && (d.is_active == null || Number(d.is_active) === 1))
      .map((d) => `${d.icd10_code || ''}: ${d.description || ''}`.trim())
      .filter(Boolean);
    if (dxLines.length) {
      planBits.push(`Diagnosis on file:\n${dxLines.map((l) => `- ${l}`).join('\n')}`);
    }

    // Treatment Summary: auto-assemble attendance + scale history + plan; clinician text is additional info.
    let treatmentSummaryAssembled = '';
    if (isTreatmentSummaryAid.value && effectiveClientId.value) {
      if (!chartSessions.value.length && !chartObjectiveRatings.value.length) {
        await loadClientTreatmentPlan(effectiveClientId.value);
      }
      const progressExcerpts = [];
      const signedProgress = (chartNotesMeta.value || [])
        .filter((n) => n?.provider_signed_at)
        .filter((n) => {
          const t = String(n.note_type || n.title || '').toLowerCase();
          return t.includes('progress') || /^90\d{3}/.test(String(n.session_service_code || n.service_code || ''));
        })
        .slice(0, 5);
      for (const n of signedProgress) {
        try {
          const nr = await api.get(`/medical-billing/notes/${n.id}`, {
            params: { agencyId: noteAidAgencyId.value || currentAgencyId.value },
            skipGlobalLoading: true
          });
          const sections = nr?.data?.note?.outputJson?.sections || {};
          const bits = Object.entries(sections)
            .map(([k, v]) => `${k}: ${String(v || '').trim()}`)
            .filter((line) => line.length > 12)
            .slice(0, 6);
          if (bits.length) {
            progressExcerpts.push(
              `Note #${n.id} (${n.session_service_code || n.service_code || n.note_type || 'progress'} · ${String(n.created_at || '').slice(0, 10)}):\n${bits.join('\n').slice(0, 1200)}`
            );
          }
        } catch {
          // best-effort excerpts
        }
      }
      treatmentSummaryAssembled = buildTreatmentSummaryContextDocument({
        sessions: chartSessions.value,
        notes: chartNotesMeta.value,
        latestPlan: latestTreatmentPlan.value,
        pastedPlanText: pastedPlanText.value,
        diagnoses: chartDiagnoses.value,
        objectiveRatings: chartObjectiveRatings.value,
        progressNoteExcerpts: progressExcerpts,
        clinicianAdditionalText: inputText.value,
        clientStatus: selectedClient.value?.status || selectedClient.value?.lifecycle_status || ''
      });
    }

    const participantsLine = sessionParticipantsDetail.value
      ? `${sessionParticipants.value || 'Client Only'} (${sessionParticipantsDetail.value})`
      : (sessionParticipants.value || 'Client Only');
    const sessionBits = [
      'Session documentation context (clinician-confirmed):',
      `Participants: ${participantsLine}`,
      sessionDurationMinutes.value != null ? `Duration minutes: ${sessionDurationMinutes.value}` : null,
      sessionStartTimeLocal.value ? `Start: ${sessionStartTimeLocal.value}` : null,
      sessionEndTimeLocal.value ? `End: ${sessionEndTimeLocal.value}` : null,
      actualServiceCode.value ? `Service code: ${actualServiceCode.value}` : null,
      sessionLocationLabel.value ? `Location: ${sessionLocationLabel.value}` : null
    ].filter(Boolean);
    if (!skipMentalStatusExam.value && chartMentalStatus.value) {
      sessionBits.push('Mental status exam recorded (structured).');
    }
    if (chartRiskAssessment.value?.patientDeniesAll) {
      sessionBits.push('Risk assessment: patient denies all areas of risk.');
    }
    planBits.push(sessionBits.join('\n'));
    if (planBits.length) {
      fd.append('treatmentPlanContext', planBits.join('\n\n').slice(0, 8000));
    }
    const ratingsCtx = buildObjectiveRatingsContextText(sessionObjectiveRatings.value);
    if (ratingsCtx) fd.append('objectiveRatingsContext', ratingsCtx);
    if (selectedAidId.value) rememberRecentAid(libraryUserId.value, selectedAidId.value);
    fd.append(
      'includeInteractiveComplexity',
      String(!!includeInteractiveComplexity.value && showInteractiveComplexityOption.value)
    );
    let generateInput = String(inputText.value || '').trim();
    if (treatmentSummaryAssembled) {
      generateInput = treatmentSummaryAssembled;
    } else if (!generateInput && outputObj.value) {
      const sections = Object.fromEntries(
        (displayPanels.value || []).map((p) => [p.id, panelText(p)])
      );
      generateInput = formatFullNoteCopy({
        sections,
        meta: outputObj.value?.meta || {},
        initials: initials.value,
        dateOfService: dateOfService.value,
        dateWritten: effectiveCreatedDate.value,
        noteTypeLabel: noteTypeDisplayLabel.value,
        includeInteractiveComplexity: includeInteractiveComplexity.value && showInteractiveComplexityOption.value
      });
    }
    if (selectedAid.value?.isCustom && (selectedAid.value.systemPrompt || selectedAid.value.trainingNotes)) {
      const customBits = [
        'Custom Note Aid training directions for this organization:',
        selectedAid.value.systemPrompt || '',
        selectedAid.value.trainingNotes || ''
      ].filter(Boolean).join('\n');
      generateInput = `${customBits}\n\n${generateInput}`.slice(0, 12000);
    }
    if (String(actualServiceCode.value || '').toUpperCase() === '90839') {
      generateInput = `${CRISIS_90839_SERVICE_DESCRIPTION}\n\n${generateInput}`.slice(0, 12000);
    }
    fd.append('inputText', generateInput);
    if (selectedAidId.value) fd.append('aidId', String(selectedAidId.value));
    if (String(revisionInstruction.value || '').trim()) {
      fd.append('revisionInstruction', String(revisionInstruction.value || '').trim());
    }
    if (draftId.value) fd.append('draftId', String(draftId.value));
    if (audioBlob.value) {
      const name = `audio.${(audioBlob.value.type || '').includes('webm') ? 'webm' : 'blob'}`;
      fd.append('audio', audioBlob.value, name);
    }

    const res = await api.post('/clinical-notes/generate', fd, { skipGlobalLoading: true });
    outputObj.value = res?.data?.outputJson || null;
    lastGeneratedServiceCode.value = String(actualServiceCode.value || '').toUpperCase();
    serviceCodeChangedAfterGenerate.value = false;
    if (amendmentParentNoteId.value) {
      approvalMessage.value =
        `Regenerated with the new format — signing will save this as an addendum to note #${amendmentParentNoteId.value}.`;
    }
    if (res?.data?.draftId) {
      draftId.value = res.data.draftId;
      if (!currentDraftCreatedAt.value) currentDraftCreatedAt.value = new Date().toISOString();
    }
    currentDraftArchivedAt.value = null;
    approvalMessage.value = '';
    archiveMessage.value = '';
    if (configReadyForCollapse.value) {
      configExpanded.value = false;
      noteWizardStep.value = 2;
    }

    // Capture a short progress-note excerpt for treatment-plan renewal suggestions.
    if (aidKind(selectedAid.value) === 'progress' && outputObj.value) {
      try {
        const sections = extractSections(outputObj.value) || {};
        const bits = ['Subjective', 'Objective', 'Assessment', 'Plan', 'Interventions']
          .map((k) => sections[k])
          .filter((t) => String(t || '').trim())
          .map((t) => String(t).trim());
        lastProgressNoteExcerpt.value = bits.join('\n\n').slice(0, 2500);
        // Soft suggest: progress notes may inform goal additions even without "improved".
        if (effectiveClientId.value && activeTreatmentGoals.value.length) {
          suggestUpdateTreatmentPlan.value =
            suggestUpdateTreatmentPlan.value ||
            (sessionObjectiveRatings.value || []).some((r) => r.progressLabel === 'improved');
        }
      } catch {
        // ignore excerpt parse failures
      }
    }

    await persistSessionObjectiveRatings();
    const needsSignature = !!(effectiveClientId.value && canApproveToClinicalRecord.value);
    if (completingQueueItemId) {
      if (needsSignature) {
        patchActiveWorkQueueStatus(DOC_STATUS.STARTED, {
          draftId: draftId.value || null
        }, completingQueueItemId);
      } else {
        markActiveWorkQueueItemCompleted(completingQueueItemId);
      }
    }
    await loadRecent();
  } catch (e) {
    const base = e.response?.data?.error?.message || 'Failed to generate note';
    const details = e.response?.data?.error?.details;
    generateError.value = details ? `${base} (${details})` : base;
  } finally {
    generating.value = false;
  }
};

async function onCsProposePlan(state) {
  csProposingPlan.value = true;
  try {
    const focus = String(state?.sessionFocus || '').trim();
    const interventions = [
      ...(state?.interventionsSelected || []),
      ...(String(state?.interventionsCustom || '').split(',').map((s) => s.trim()).filter(Boolean))
    ];
    const response = state?.clientResponse || '';
    const symptoms = (state?.symptomsSelected || []).join(', ');
    const affect = (state?.affectAreas || []).join(', ');
    const goalBits = Object.values(state?.goalProgress || {})
      .map((g) => `${g.goalText || 'Goal'}: ${g.rating || '—'}`)
      .join('; ');
    const draft = [
      focus ? `Continue work on ${focus.replace(/\.$/, '')}.` : 'Continue therapeutic focus from today’s session.',
      interventions.length ? `Reinforce ${interventions.slice(0, 3).join(', ')}.` : '',
      response ? `Monitor engagement (${response.toLowerCase()}).` : '',
      symptoms ? `Address ongoing clinical needs related to ${symptoms}.` : '',
      affect ? `Support functioning across ${affect}.` : '',
      goalBits ? `Treatment-plan focus: ${goalBits}.` : '',
      'Review progress next session and adjust interventions as indicated.'
    ].filter(Boolean).join(' ');
    csNoteBuildState.value = {
      ...csNoteBuildState.value,
      ...state,
      planProposed: draft,
      planEdited: csNoteBuildState.value.planEdited || draft
    };
    csNoteBuildPanelRef.value?.setProposedPlan?.(draft);
  } finally {
    csProposingPlan.value = false;
  }
}

watch(isProgressAid, (ok) => {
  if (!ok && !usesFreeformCsPathway.value) notePathway.value = 'standard';
});

watch(showCsNoteBuildPathway, (ok) => {
  if (!ok) notePathway.value = 'standard';
});

watch(usesFreeformCsPathway, (freeformCs) => {
  // Never leave a freeform_cs aid on a SOAP-labeled mental model — standard = Freeform.
  if (freeformCs && notePathway.value !== 'csNoteBuild') notePathway.value = 'standard';
});

watch(skipAiAid, (on) => {
  if (!on) return;
  if (!noteAidAllowManualWrite.value) {
    skipAiAid.value = false;
    return;
  }
  seedManualEmptySections();
});

watch(noteAidAllowManualWrite, (ok) => {
  if (!ok) skipAiAid.value = false;
});

watch(
  () => selectedAidId.value,
  () => {
    if (notePathway.value === 'soap') notePathway.value = 'standard';
  }
);

const buildApprovedPayloadText = () => {
  const sections = Object.fromEntries(mergedSectionEntries.value || []);
  if (!sections || Object.keys(sections).length === 0) return '';
  return JSON.stringify(
    {
      sections,
      meta: outputObj.value?.meta || {}
    },
    null,
    2
  );
};

const ensureClinicalSessionForApproval = async () => {
  const existingSessionId = Number(
    bookingContext.value?.clinicalSessionId || sessionClinicalSessionId.value || 0
  );
  if (existingSessionId) return existingSessionId;

  const agencyId = Number(noteAidAgencyId.value || currentAgencyId.value || 0);
  const officeEventId = Number(
    bookingContext.value?.officeEventId || sessionOfficeEventId.value || 0
  );
  const clientId = Number(
    bookingContext.value?.clientId || selectedClientId.value || effectiveClientId.value || 0
  );
  if (!agencyId || !clientId) {
    throw new Error('Link a client before saving this note to the clinical record.');
  }

  if (!officeEventId || isClientChartAid.value) {
    const res = await api.post('/clinical-data/sessions/bootstrap', {
      agencyId,
      clientId,
      noteOnly: true,
      serviceDate: dateOfService.value ? String(dateOfService.value).slice(0, 10) : null,
      serviceCode: isClientChartAid.value ? null : (actualServiceCode.value || null),
      noteType: isReviewOnlyAid.value
        ? 'TERMINATION'
        : (isTreatmentSummaryAid.value
          ? 'TREATMENT_SUMMARY'
          : (bookingContext.value?.noteType || 'PROGRESS_NOTE')),
      sourceTimezone: 'America/New_York'
    });
    const sessionId = Number(res?.data?.session?.id || 0) || null;
    if (!sessionId) throw new Error('Could not create a chart session for this note.');
    sessionClinicalSessionId.value = sessionId;
    return sessionId;
  }

  const res = await api.post('/clinical-data/sessions/bootstrap', {
    agencyId,
    clientId,
    officeEventId,
    sourceTimezone: 'America/New_York'
  });
  const sessionId = Number(res?.data?.session?.id || 0) || null;
  if (!sessionId) throw new Error('Could not resolve clinical session context.');
  sessionClinicalSessionId.value = sessionId;
  return sessionId;
};

const approveNoteOutput = async ({ silent = false, afterSign = 'queue' } = {}) => {
  if (silent) return;
  if (!mergedSectionEntries.value.length) return;
  if (approvingNote.value) return;
  if (!attestAccurateAndComplete.value || !attestMedicallyNecessary.value) {
    approvalError.value = isReviewOnlyAid.value
      ? 'Check both attestations (accurate & complete, and content review) before saving.'
      : 'Check both attestations (accurate & complete, and medically necessary) before signing.';
    return;
  }
  const hasScheduledSession = !!(
    bookingContext.value?.officeEventId
    || sessionOfficeEventId.value
    || bookingContext.value?.clinicalSessionId
  );
  if (hasScheduledSession && !isClientChartAid.value && !canConfirmAndSign.value) {
    approvalError.value = sessionParticipantsFlag.value
      ? 'Update Participants — session content suggests others were present.'
      : 'Complete required chart sections before signing.';
    return;
  }
  try {
    approvingNote.value = true;
    approvalError.value = '';
    approvalMessage.value = '';
    const sessionId = await ensureClinicalSessionForApproval();
    const approvedPayload = buildApprovedPayloadText();
    if (!approvedPayload) throw new Error('No approved note content available to persist.');
    const serviceCodeForMetadata = isClientChartAid.value ? null : (actualServiceCode.value || null);
    const noteType = isReviewOnlyAid.value
      ? 'TERMINATION'
      : (isTreatmentSummaryAid.value
        ? 'TREATMENT_SUMMARY'
        : (bookingContext.value?.noteType || 'PROGRESS_NOTE'));
    const dos = dateOfService.value ? String(dateOfService.value).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const title = isReviewOnlyAid.value
      ? `Termination note ${dos}`.trim()
      : (isTreatmentSummaryAid.value
        ? `Treatment Summary ${dos}`.trim()
        : `${String(noteType).replace(/_/g, ' ')} ${serviceCodeForMetadata ? `(${serviceCodeForMetadata}) ` : ''}${dos}`.trim());
    const structuredChart = {
      diagnosticJustification: chartDiagnosticJustification.value || null,
      mentalStatusExam: skipMentalStatusExam.value ? null : chartMentalStatus.value,
      riskAssessment: chartRiskAssessment.value,
      medications: chartMedications.value,
      participants: sessionParticipantsDetail.value
        ? `${sessionParticipants.value} (${sessionParticipantsDetail.value})`
        : sessionParticipants.value,
      participantsMode: sessionParticipants.value,
      participantsDetail: sessionParticipantsDetail.value || null,
      durationMinutes: sessionDurationMinutes.value,
      startTime: sessionStartTimeLocal.value || null,
      endTime: sessionEndTimeLocal.value || null,
      skippedMseReason: skipMentalStatusExam.value
        ? (String(actualServiceCode.value || selectedAid.value?.serviceCode || 'skipped').toUpperCase())
        : null
    };
    const manualSections = !!skipAiAid.value || !!outputObj.value?.meta?.manualSections;
    const createRes = await api.post(`/clinical-data/sessions/${sessionId}/notes`, {
      title,
      notePayload: approvedPayload,
      noteType,
      templateVersion: bookingContext.value?.templateVersion || 'v1',
      serviceCode: serviceCodeForMetadata,
      modifiers: (billingAddons.value || []).map((a) => a.code),
      officeEventId: isClientChartAid.value
        ? undefined
        : (bookingContext.value?.officeEventId || sessionOfficeEventId.value || undefined),
      source: (bookingContext.value?.officeEventId || sessionOfficeEventId.value) && !isClientChartAid.value
        ? 'note_aid_approval'
        : 'note_aid_note_only',
      primaryDiagnosisId: isClientChartAid.value ? null : (primaryChartDiagnosis.value?.id || null),
      diagnosticJustification: isClientChartAid.value
        ? null
        : (chartDiagnosticJustification.value || primaryChartDiagnosis.value?.justification || null),
      metadata: {
        generatedBy: 'clinical_note_generator',
        aiGenerated: !manualSections,
        manualSections,
        model: manualSections ? null : (outputObj.value?.meta?.model || null),
        toolId: outputObj.value?.meta?.toolId || selectedAid.value?.toolId || null,
        draftId: draftId.value || null,
        amendmentOfNoteId: amendmentParentNoteId.value || null,
        billingAddons: billingAddons.value || [],
        billingPrimaryUnits: billingPrimaryUnits.value || 1,
        includeAfterHours99051: !!includeAfterHours99051.value,
        questionnaireInstruments: Array.isArray(outputObj.value?.meta?.questionnaireInstruments)
          ? outputObj.value.meta.questionnaireInstruments
          : undefined,
        claimResubmittable: !!amendmentParentNoteId.value,
        approvedAt: new Date().toISOString(),
        primaryDiagnosisId: isClientChartAid.value ? null : (primaryChartDiagnosis.value?.id || null),
        dateOfService: dos,
        officeEventId: isClientChartAid.value
          ? null
          : (bookingContext.value?.officeEventId || sessionOfficeEventId.value || null),
        missingCalendarAttachment: isClientChartAid.value
          || !(bookingContext.value?.officeEventId || sessionOfficeEventId.value),
        documentationFlow: isReviewOnlyAid.value
          ? 'review'
          : (isTreatmentSummaryAid.value ? 'provider_supervisor_sign' : undefined),
        skipSupervisorCosign: isReviewOnlyAid.value || (!isTreatmentSummaryAid.value && noteAidAutosignAfterReview.value),
        requiresSupervisorCosign: isTreatmentSummaryAid.value
          || !(isReviewOnlyAid.value || noteAidAutosignAfterReview.value),
        autosignAfterReview: !isTreatmentSummaryAid.value && !!noteAidAutosignAfterReview.value,
        printableDocument: !!isTreatmentSummaryAid.value,
        attachMode: isClientChartAid.value ? 'client_chart' : undefined,
        structuredChart: isClientChartAid.value ? null : structuredChart,
        attestation: {
          accurateAndComplete: true,
          medicallyNecessary: !isReviewOnlyAid.value,
          contentReviewConfirmed: !!isReviewOnlyAid.value,
          attestedAt: new Date().toISOString()
        }
      }
    });

    const noteId = Number(createRes?.data?.note?.id || 0);
    const reviewStatus = createRes?.data?.note?.content_review_status || null;
    let reviewPassed = String(reviewStatus || '').toLowerCase() === 'passed';
    if (!reviewPassed && !manualSections && isReviewOnlyAid.value) reviewPassed = true;
    // Review-only without autosign: chart shows Review (no provider signature required).
    // Treatment summary: always provider-sign now; supervisor cosigns separately via panel / notes-to-sign.
    // Autosign after review / normal progress notes: apply provider signature.
    const shouldAutosign = noteId && (
      isReviewOnlyAid.value
        ? (noteAidAutosignAfterReview.value && reviewPassed)
        : true
    );
    if (shouldAutosign) {
      try {
        await api.post(
          `/medical-billing/notes/${noteId}/sign`,
          {
            accurateAndComplete: true,
            medicalNecessityAttested: !isReviewOnlyAid.value && !isTreatmentSummaryAid.value
          },
          { skipGlobalLoading: true }
        );
      } catch (signErr) {
        console.warn('[NoteAid] provider sign after approve failed', signErr?.message || signErr);
      }
    }

    if (isTreatmentSummaryAid.value && noteId) {
      treatmentSummaryNoteId.value = noteId;
      treatmentSummaryProviderSignedAt.value = shouldAutosign ? new Date().toISOString() : null;
      treatmentSummarySupervisorSignedAt.value = null;
    }

    inputText.value = '';
    transcriptSource.value = '';
    liveTranscript.value = '';
    clearAudio();
    revisionInstruction.value = '';
    attestAccurateAndComplete.value = false;
    attestMedicallyNecessary.value = false;
    const signedMsg = isReviewOnlyAid.value
      ? (shouldAutosign
        ? 'Review complete — note saved to client chart and signed.'
        : 'Review complete — note saved to client chart.')
      : (isTreatmentSummaryAid.value
        ? 'Treatment Summary saved. Download/print PDF, then complete provider and clinical supervisor signatures.'
        : 'Signed as medically necessary and saved to clinical records.');
    const nextQueue = nextInQueueItem.value;
    const nextProgress = nextInProgressRow.value;
    markActiveWorkQueueItemSigned();
    await loadRecent();

    const mode = afterSign === 'progress' || afterSign === 'queue' || afterSign === 'close'
      ? afterSign
      : (signAndOpenNextInQueue.value ? 'queue' : 'close');

    if (mode === 'progress' && nextProgress) {
      approvalMessage.value = signedMsg;
      await onLibrarySidebarSelect(nextProgress);
      sidebarTab.value = DOC_STATUS.STARTED;
    } else if (mode === 'queue' && nextQueue && !isTreatmentSummaryAid.value) {
      approvalMessage.value = signedMsg;
      await activateWorkQueueItem(nextQueue);
      sidebarTab.value = DOC_STATUS.STARTED;
    } else if (isTreatmentSummaryAid.value && treatmentSummaryNoteId.value) {
      approvalMessage.value = signedMsg;
      // Stay on document so print / share / sign panel remains available.
    } else {
      activeWorkQueueItemId.value = null;
      await closeNoteWorkspace();
      approvalMessage.value = signedMsg;
    }
  } catch (e) {
    approvalError.value = e.response?.data?.error?.message || e.message || 'Failed to persist approved note';
  } finally {
    approvingNote.value = false;
  }
};

const saveTreatmentPlanToChart = async () => {
  if (!canSaveTreatmentPlanToChart.value || savingTreatmentPlan.value) return;
  const clientId = Number(effectiveClientId.value || bookingContext.value?.clientId || route.query?.clientId || 0) || null;
  if (!clientId) {
    approvalError.value = 'Select an active client to save a treatment plan to the chart.';
    return;
  }
  try {
    savingTreatmentPlan.value = true;
    approvalError.value = '';
    approvalMessage.value = '';
    const panels = displayPanels.value || [];
    const goals = [];
    let current = null;
    let dischargePlan = null;
    for (const p of panels) {
      if (p.kind === 'goal' || /^Goal\s*\d+/i.test(p.id || '')) {
        current = {
          goalIndex: p.index || goals.length + 1,
          goalText: p.text || '',
          projectedCompletion: null,
          objectives: []
        };
        goals.push(current);
      } else if (current && (p.kind === 'objective' || /^Objective\s*\d+/i.test(p.id || ''))) {
        const objectiveText = p.text || '';
        const scales = parseScalePair(objectiveText);
        const scaleCurrent = scales.scaleCurrent;
        const scaleTarget = scales.scaleTarget;
        current.objectives.push({
          objectiveIndex: p.index || current.objectives.length + 1,
          objectiveText,
          scaleCurrent,
          scaleTarget,
          scaleDirection: inferScaleDirection(scaleCurrent, scaleTarget),
          measurementMethod: isObjectiveScaleValid(scaleCurrent, scaleTarget)
            ? DEFAULT_MEASUREMENT_METHOD
            : null
        });
      } else if (current && (p.kind === 'projected_time' || /^Projected/i.test(p.id || ''))) {
        current.projectedCompletion = p.text || '';
      } else if (p.kind === 'discharge' || /Discharge/i.test(p.id || '')) {
        dischargePlan = p.text || '';
      }
    }
    if (!goals.length) {
      throw new Error('No Goal/Objective panels found to save.');
    }
    const missingScale = goals.some((g) =>
      (g.objectives || []).some((o) => !isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget))
    );
    if (missingScale) {
      throw new Error(
        'Each objective needs a clear 1–10 current and target scale (same as treatment plan paste import) before saving to the chart.'
      );
    }
    await api.post('/medical-billing/treatment-plans', {
      agencyId: chartAgencyIdForSave.value || currentAgencyId.value,
      clientId,
      officeEventId: bookingContext.value?.officeEventId || null,
      clinicalSessionId: bookingContext.value?.clinicalSessionId || null,
      title: 'Treatment Plan',
      dischargePlan,
      sourceToolId: selectedToolId.value || outputObj.value?.meta?.toolId || null,
      primaryDiagnosisId: primaryChartDiagnosis.value?.id || null,
      diagnosticJustification: primaryChartDiagnosis.value?.justification || null,
      icd10Code: primaryChartDiagnosis.value?.icd10_code || null,
      diagnosisDescription: primaryChartDiagnosis.value?.description || null,
      goals
    });
    approvalMessage.value = 'Treatment plan saved to clinical chart (with primary diagnosis when on file).';
    await loadClientTreatmentPlan(clientId);
  } catch (e) {
    approvalError.value = e.response?.data?.error?.message || e.message || 'Failed to save treatment plan';
  } finally {
    savingTreatmentPlan.value = false;
  }
};

const formatDateTime = (raw) => {
  try {
    if (!raw) return '';
    return new Date(raw).toLocaleString();
  } catch {
    return String(raw || '');
  }
};

const loadRecent = async ({ retry = true } = {}) => {
  if (!canUseTool.value) return;
  try {
    recentLoading.value = true;
    recentError.value = '';
    const queueClientIds = [...new Set(
      [
        ...(workQueueItems.value || []).map((i) => Number(i.clientId || 0)),
        Number(selectedClientId.value || 0),
        Number(effectiveClientId.value || 0)
      ].filter((n) => n > 0)
    )];
    const res = await api.get('/clinical-notes/recent', {
      params: {
        agencyId: currentAgencyId.value,
        allAccessible: '1',
        days: 2555,
        archiveStatus: 'all',
        clientIds: queueClientIds.join(',')
      },
      skipGlobalLoading: true,
      timeout: 15000
    });
    recentDrafts.value = Array.isArray(res?.data?.drafts) ? res.data.drafts : [];
    signedNoteSessions.value = Array.isArray(res?.data?.signedSessions) ? res.data.signedSessions : [];
    selectedDraftIds.value = selectedDraftIds.value.filter((id) =>
      recentDrafts.value.some((d) => String(d.id) === String(id))
    );
    applySignedSessionsToQueue(signedNoteSessions.value);
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Failed to load recent drafts';
    const isConn = /connection lost|econnreset|protocol|timeout|network/i.test(String(msg));
    if (isConn && retry) {
      await new Promise((r) => window.setTimeout(r, 400));
      return loadRecent({ retry: false });
    }
    // Connection drops (Cloud SQL proxy / idle pool) should not block the workspace.
    if (isConn) {
      recentError.value = 'Draft list temporarily unavailable. You can still write and generate notes.';
    } else {
      recentError.value = msg;
    }
    recentDrafts.value = [];
    signedNoteSessions.value = [];
    selectedDraftIds.value = [];
  } finally {
    recentLoading.value = false;
  }
};

let bootstrapSeq = 0;
const bootstrapWorkspace = async ({ resetForm = false } = {}) => {
  if (!canUseTool.value) return;
  const seq = ++bootstrapSeq;
  if (resetForm) {
    providerCredentialText.value = '';
    derivedTier.value = 'unknown';
    hcbsCategory.value = null;
    eligibleServiceCodes.value = null;
    audioAgreementTemplates.value = [];
    programs.value = [];
    draftId.value = null;
    lastSavedAt.value = '';
    recentDrafts.value = [];
    recentError.value = '';
    contextError.value = '';
    generateError.value = '';
    revisionInstruction.value = '';
    approvalMessage.value = '';
    approvalError.value = '';
    recordingConsentError.value = '';
    consentSessionError.value = '';
    recordingPurpose.value = 'dictation';
    clientPresentInRecording.value = true;
    clientConsentOnFile.value = '';
    clientConsentTaskId.value = null;
    selectedAudioAgreementTemplateId.value = '';
    additionalParticipantPresent.value = false;
    additionalParticipantConsentOnFile.value = '';
    additionalParticipantConsentTaskId.value = null;
    downloadingAudioAgreementTemplate.value = false;
    audioDurationSeconds.value = 0;
    outputObj.value = null;
    bookingPrefillApplied.value = false;
    therapyPrefillApplied.value = false;
    recordSessionModalOpen.value = false;
    recordSessionIntentHandled.value = false;
    currentDraftArchivedAt.value = null;
    archiveMessage.value = '';
    includeInteractiveComplexity.value = false;
  }

  // Critical path in parallel; draft list is soft and must not block the form.
  await Promise.all([loadContext(), loadPrograms(), loadAgencyNoteAidCatalog()]);
  if (seq !== bootstrapSeq) return;
  applyBookingContextPrefill();
  applyTherapyContextPrefill();
  const bookingClientId = Number(bookingContext.value?.clientId || 0);
  if (bookingClientId && !selectedClientId.value) {
    selectedClientId.value = bookingClientId;
    selectedClient.value = { id: bookingClientId };
    await hydrateSelectedClient(bookingClientId);
    loadClientTreatmentPlan(bookingClientId);
    loadClientIntakeSummary(bookingClientId);
  }

  // Deep-link from client file: open updater with chart preload.
  const launchAid = String(route.query?.noteAid || route.query?.note_aid || '').trim();
  const launchIntentQ = String(route.query?.launchIntent || route.query?.launch_intent || '')
    .trim()
    .toLowerCase();
  if (launchIntentQ === 'intake_draft') {
    const qClient = Number(route.query?.clientId || route.query?.client_id || 0);
    const qDraft = Number(route.query?.intakeDraftId || route.query?.intake_draft_id || 0);
    if (qClient) {
      selectedClientId.value = qClient;
      selectedClient.value = { id: qClient };
      await hydrateSelectedClient(qClient);
      await loadClientTreatmentPlan(qClient);
      await loadClientIntakeSummary(qClient);
    }
    showIntakeDraftEditor.value = true;
    intakeDraftEditorId.value = qDraft || null;
  } else if (launchAid === 'psychotherapy_plan' || launchIntentQ === 'update_treatment_plan') {
    const qClient = Number(route.query?.clientId || route.query?.client_id || 0);
    const qPlanId = Number(route.query?.planId || route.query?.plan_id || 0);
    if (qClient) {
      selectedClientId.value = qClient;
      selectedClient.value = { id: qClient };
      await hydrateSelectedClient(qClient);
      await loadClientTreatmentPlan(qClient);
      await loadClientIntakeSummary(qClient);
    }
    if (qPlanId) {
      planDraftEditorId.value = qPlanId;
      planDraftEditorMode.value = 'draft';
      planDraftInitialPlan.value =
        Number(latestTreatmentPlan.value?.id) === qPlanId ? latestTreatmentPlan.value : null;
      showPlanImportReview.value = true;
    } else if (
      latestTreatmentPlan.value?.id
      && String(latestTreatmentPlan.value?.status || '').toLowerCase() === 'draft'
      && String(latestTreatmentPlan.value?.source_tool_id || latestTreatmentPlan.value?.sourceToolId || '')
        === 'intake_packet_bootstrap'
    ) {
      planDraftEditorId.value = latestTreatmentPlan.value.id;
      planDraftEditorMode.value = 'draft';
      planDraftInitialPlan.value = latestTreatmentPlan.value;
      showPlanImportReview.value = true;
    } else {
      await openTreatmentPlanUpdater({
        renewalReason:
          launchIntentQ === 'update_treatment_plan'
            ? 'Opened from client file — update treatment plan using chart diagnosis, goals, and ratings.'
            : ''
      });
    }
  }

  loadRecent();
};

const setSidebarTab = async (tab) => {
  sidebarTab.value = tab === 'archived' || tab === 'signed' ? DOC_STATUS.SIGNED : DOC_STATUS.STARTED;
  openDateGroups.value = {};
  await loadRecent();
};

const focusArchivedShelf = async () => {
  await setSidebarTab('archived');
};

const resetClientClinicalContext = () => {
  latestTreatmentPlan.value = null;
  chartDiagnoses.value = [];
  chartObjectiveRatings.value = [];
  chartDiagnosticJustification.value = '';
  chartMentalStatus.value = defaultMentalStatusExam();
  chartRiskAssessment.value = defaultRiskAssessment();
  chartMedications.value = defaultMedicationsBlock();
  clientGuardianNames.value = [];
  dismissPhiNameWarn.value = false;
  clientPlanError.value = '';
  pastedPlanText.value = '';
  pastedIntakeText.value = '';
  pastedDemographicsText.value = '';
  intakeImportedOnce.value = false;
  intakeDraftFinalized.value = false;
  planImportedOnce.value = false;
  sessionObjectiveRatings.value = [];
  suggestUpdateTreatmentPlan.value = false;
  renewalSuggestReason.value = '';
  lastProgressNoteExcerpt.value = '';
  intakeSummary.value = '';
  intakeError.value = '';
};

const loadClientTreatmentPlan = async (clientId) => {
  const cid = Number(clientId || 0);
  if (!cid) {
    latestTreatmentPlan.value = null;
    chartDiagnoses.value = [];
    chartObjectiveRatings.value = [];
    chartSessions.value = [];
    chartNotesMeta.value = [];
    return;
  }
  const agencies = chartAgencyCandidates();
  if (!agencies.length) {
    latestTreatmentPlan.value = null;
    chartDiagnoses.value = [];
    chartObjectiveRatings.value = [];
    chartSessions.value = [];
    chartNotesMeta.value = [];
    return;
  }
  loadingClientPlan.value = true;
  clientPlanError.value = '';
  try {
    let bestPlan = null;
    let bestScore = -1;
    let bestDiagnoses = [];
    let bestRatings = [];
    let bestSessions = [];
    let bestNotes = [];
    let lastError = null;

    for (const aid of agencies) {
      try {
        const res = await api.get(`/medical-billing/clients/${cid}/chart`, {
          params: { agencyId: aid },
          skipGlobalLoading: true
        });
        const plan = res?.data?.latestPlan || null;
        const score = scoreChartPlan(plan);
        if (score > bestScore) {
          bestScore = score;
          bestPlan = plan;
          bestDiagnoses = Array.isArray(res?.data?.diagnoses) ? res.data.diagnoses : [];
          bestRatings = Array.isArray(res?.data?.objectiveRatings)
            ? res.data.objectiveRatings
            : [];
          bestSessions = Array.isArray(res?.data?.sessions) ? res.data.sessions : [];
          bestNotes = Array.isArray(res?.data?.notes) ? res.data.notes : [];
        }
      } catch (e) {
        lastError = e;
      }
    }

    latestTreatmentPlan.value = bestPlan;
    chartDiagnoses.value = bestDiagnoses;
    chartObjectiveRatings.value = bestRatings;
    chartSessions.value = bestSessions;
    chartNotesMeta.value = bestNotes;
    // Prefer plan diagnostic justification over whatever intake last wrote on the dx row.
    const planJust = String(
      bestPlan?.diagnostic_justification || bestPlan?.diagnosticJustification || ''
    ).trim();
    if (planJust) {
      chartDiagnosticJustification.value = planJust;
    } else if (primaryChartDiagnosis.value?.justification) {
      chartDiagnosticJustification.value = String(primaryChartDiagnosis.value.justification);
    }
    if (!bestPlan && lastError) {
      clientPlanError.value =
        lastError.response?.data?.error?.message || lastError.message || 'Could not load treatment plan';
    }
  } catch (e) {
    latestTreatmentPlan.value = null;
    chartDiagnoses.value = [];
    chartObjectiveRatings.value = [];
    clientPlanError.value =
      e.response?.data?.error?.message || e.message || 'Could not load treatment plan';
  } finally {
    loadingClientPlan.value = false;
  }
};

const loadClientIntakeSummary = async (clientId) => {
  const cid = Number(clientId || 0);
  if (!cid) {
    intakeSummary.value = '';
    return;
  }
  loadingIntake.value = true;
  intakeError.value = '';
  try {
    const [blocksRes, draftRes] = await Promise.all([
      api.get(`/clients/${cid}/records-copy-blocks`, { skipGlobalLoading: true }).catch(() => null),
      api.get(`/clients/${cid}/intake-note`, { skipGlobalLoading: true }).catch(() => null)
    ]);
    const data = blocksRes?.data || {};
    // API returns { demographics, clinicalDeidentified, intakeNarrative } — not blocks[]
    if (data.clinicalDeidentified || data.intakeNarrative) {
      // Never put demographics PHI into the Note Aid intake preview / paste path.
      intakeSummary.value = [
        data.clinicalDeidentified ? `Clinical (de-identified)\n${data.clinicalDeidentified}` : '',
        data.intakeNarrative ? `Intake narrative\n${data.intakeNarrative}` : ''
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 6000);
    } else if (data.demographics && !(data.clinicalDeidentified || data.intakeNarrative)) {
      intakeSummary.value = '';
    } else {
      const blocks = data.blocks || (Array.isArray(data) ? data : []);
      if (Array.isArray(blocks) && blocks.length) {
        intakeSummary.value = blocks
          .map((b) => {
            const title = b.title || b.label || b.name || '';
            const text = b.text || b.content || b.body || '';
            return [title, text].filter(Boolean).join('\n');
          })
          .filter(Boolean)
          .join('\n\n')
          .slice(0, 6000);
      } else if (typeof data.text === 'string') {
        intakeSummary.value = data.text.slice(0, 6000);
      } else {
        intakeSummary.value = '';
      }
    }
    const draftStatus = String(draftRes?.data?.draft?.status || '').toLowerCase();
    intakeDraftFinalized.value = draftStatus === 'final' || !!draftRes?.data?.draft?.finalizedAt;
    if (intakeDraftFinalized.value) {
      intakeImportedOnce.value = true;
    }
  } catch (e) {
    intakeSummary.value = '';
    intakeError.value = e.response?.data?.error?.message || e.message || 'Could not load intake';
  } finally {
    loadingIntake.value = false;
  }
};

const onClientPicked = async (client) => {
  const normalized = normalizeNoteAidClientRow(client, agencyLookup.value) || client;
  selectedClient.value = normalized || null;
  selectedClientId.value = Number(normalized?.id || 0) || null;
  noteAidAgencyChoiceId.value = null;
  selectedQueueAgencyId.value = Number(normalized?.agency_id || normalized?.agencyId || 0) || null;
  initials.value = '';
  initialsMatchSuggestions.value = [];
  initialsMatchDismissed.value = true;
  dismissPhiNameWarn.value = false;
  resetClientClinicalContext();
  if (activeWorkQueueItemId.value && selectedClientId.value) {
    workQueueItems.value = (workQueueItems.value || []).map((row) =>
      row.id === activeWorkQueueItemId.value
        ? {
            ...row,
            clientId: selectedClientId.value,
            clientName: clientDisplayName(normalized) || row.clientName,
            agencyId: selectedQueueAgencyId.value || row.agencyId
          }
        : row
    );
    persistWorkQueue();
  }
  syncRouteNoteClient(selectedClientId.value);
  await hydrateSelectedClient(selectedClientId.value);
  await loadClientAgencyContext(selectedClientId.value);
  await Promise.all([
    loadClientTreatmentPlan(selectedClientId.value),
    loadClientIntakeSummary(selectedClientId.value),
    loadClientGuardianNames(selectedClientId.value)
  ]);
  scheduleAutosave(400);
};

async function loadClientGuardianNames(clientId) {
  const cid = Number(clientId || 0);
  clientGuardianNames.value = [];
  if (!cid) return;
  try {
    const r = await api.get(`/clients/${cid}/guardians`, { skipGlobalLoading: true });
    clientGuardianNames.value = Array.isArray(r.data) ? r.data : (r.data?.guardians || []);
  } catch {
    clientGuardianNames.value = [];
  }
}

async function loadClientAgencyContext(clientId) {
  const cid = Number(clientId || 0);
  clientAgencyMembershipIds.value = [];
  learningSponsorAgencyIds.value = [];
  if (!cid) return;

  const primary = Number(selectedClient.value?.agency_id || selectedClient.value?.agencyId || 0) || null;
  const memberships = primary ? [primary] : [];

  try {
    const r = await api.get(`/clients/${cid}/agency-affiliations`, { skipGlobalLoading: true });
    for (const row of Array.isArray(r.data) ? r.data : []) {
      const id = Number(row?.agency_id || 0);
      if (id) memberships.push(id);
    }
  } catch {
    // Providers may lack assignment edit access; primary agency is enough.
  }
  clientAgencyMembershipIds.value = [...new Set(memberships.filter(Boolean))];

  // Tenants that sponsor a learning org the client is affiliated with.
  const learningOrgIds = new Set();
  try {
    const aff = await api.get(`/clients/${cid}/affiliations`, { skipGlobalLoading: true });
    for (const row of Array.isArray(aff.data) ? aff.data : []) {
      if (String(row?.organization_type || '').toLowerCase() === 'learning') {
        const oid = Number(row?.organization_id || 0);
        if (oid) learningOrgIds.add(oid);
      }
    }
  } catch {
    // ignore
  }
  if (String(selectedClient.value?.organization_type || '').toLowerCase() === 'learning') {
    const oid = Number(selectedClient.value?.organization_id || 0);
    if (oid) learningOrgIds.add(oid);
  }

  const sponsors = new Set();
  for (const agencyId of clientAgencyMembershipIds.value) {
    try {
      const r = await api.get(`/agencies/${agencyId}/affiliated-organizations`, { skipGlobalLoading: true });
      const orgs = Array.isArray(r.data) ? r.data : [];
      const hit = orgs.some((o) => {
        const id = Number(o?.id || o?.organization_id || 0);
        const type = String(o?.organization_type || '').toLowerCase();
        return (id && learningOrgIds.has(id)) || (type === 'learning' && learningOrgIds.has(id));
      });
      if (hit || learningOrgIds.has(agencyId)) sponsors.add(agencyId);
    } catch {
      // ignore
    }
  }
  learningSponsorAgencyIds.value = [...sponsors];
}

async function hydrateSelectedClient(clientId) {
  const cid = Number(clientId || 0);
  if (!cid) return;
  const seq = ++clientHydrateSeq;
  try {
    const res = await api.get(`/clients/${cid}`, { skipGlobalLoading: true });
    if (seq !== clientHydrateSeq) return;
    const raw = res?.data?.client || res?.data;
    const row = normalizeNoteAidClientRow(raw, agencyLookup.value);
    if (row) {
      const enc = raw?.demographics_phi_enc || row.demographics_phi_enc;
      const onFile = raw?.demographics_on_file === true || raw?.demographicsOnFile === true;
      selectedClient.value = {
        ...row,
        demographics_on_file: onFile || !!enc,
        demographics_phi_enc: enc || (onFile ? { encrypted: true } : row.demographics_phi_enc || null),
        date_of_birth: row.date_of_birth || raw?.date_of_birth,
        contact_phone: row.contact_phone || raw?.contact_phone,
        email: row.email || raw?.email,
        address_street: row.address_street || raw?.address_street,
        address_city: row.address_city || raw?.address_city,
        address_state: row.address_state || raw?.address_state
      };
    }
  } catch {
    // keep partial row
  }
}

const onClientCleared = () => {
  selectedClient.value = null;
  selectedClientId.value = null;
  selectedQueueAgencyId.value = null;
  noteAidAgencyChoiceId.value = null;
  clientAgencyMembershipIds.value = [];
  learningSponsorAgencyIds.value = [];
  participantsPresenceDismissed.value = false;
  resetClientClinicalContext();
  syncRouteNoteClient(null);
  persistClientUnlink = true;
  scheduleAutosave(400);
};

async function saveNoteSubject() {
  await saveDraftNow();
  if (draftId.value && lastSavedAt.value) {
    approvalMessage.value = `Client / initials saved (${lastSavedAt.value}).`;
  }
}

const openCreateClientModal = (opts = {}) => {
  createClientDefaults.initials = String(opts.initials || initials.value || '').trim();
  createClientDefaults.name = String(opts.name || opts.query || '').trim();
  createClientDefaults.agencyId = Number(opts.agencyId || noteAidAgencyId.value || currentAgencyId.value || 0) || null;
  showCreateClientModal.value = true;
};

const onMinimalClientCreated = async (client) => {
  showCreateClientModal.value = false;
  await onClientPicked(client);
  showClientSetupDrawer.value = true;
};

const onDocumentationQueueSelect = async (row) => {
  if (!row) return;
  showProgressSessionPicker.value = false;
  progressEntryMode.value = 'appointment';
  selectedQueueAgencyId.value = Number(row.agencyId || 0) || null;
  dateOfService.value = row.dateOfService || dateOfService.value;
  if (row.serviceCode) selectedServiceCode.value = String(row.serviceCode).toUpperCase();
  if (row.clientInitials) initials.value = row.clientInitials;
  selectedClientId.value = Number(row.clientId || 0) || null;
  selectedClient.value = normalizeNoteAidClientRow(
    {
      id: row.clientId,
      agency_id: row.agencyId,
      agency_name: row.agencyName,
      full_name: row.clientName,
      initials: row.clientInitials
    },
    agencyLookup.value
  );
  // Keep URL/query in sync for approve-to-clinical-record
  const nextQuery = {
    ...route.query,
    clientId: String(row.clientId),
    clinicalSessionId: String(row.clinicalSessionId),
    dateOfService: row.dateOfService || undefined,
    serviceCode: row.serviceCode || undefined
  };
  if (row.officeEventId) nextQuery.officeEventId = String(row.officeEventId);
  router.replace({ query: nextQuery }).catch(() => {});
  resetClientClinicalContext();
  await Promise.all([
    loadClientTreatmentPlan(selectedClientId.value),
    loadClientIntakeSummary(selectedClientId.value)
  ]);
};

const continueUnlinkedProgress = () => {
  progressEntryMode.value = 'unlinked';
  showProgressSessionPicker.value = false;
};

const pickClientFirstProgress = () => {
  progressEntryMode.value = 'client';
  showProgressSessionPicker.value = false;
};

async function searchInitialsMatches() {
  const typed = String(initials.value || '').trim();
  if (
    selectedClientId.value
    || progressEntryMode.value !== 'unlinked'
    || initialsMatchDismissed.value
    || typed.length < 2
  ) {
    initialsMatchSuggestions.value = [];
    initialsMatchSearched.value = false;
    return;
  }
  try {
    const res = await api.get('/clients', {
      params: {
        search: typed,
        per_page: 12,
        page: 1,
        ...(Number(noteAidAgencyId.value || currentAgencyId.value || 0)
          ? { agency_id: Number(noteAidAgencyId.value || currentAgencyId.value) }
          : {})
      },
      skipGlobalLoading: true
    });
    const rows = Array.isArray(res?.data)
      ? res.data
      : res?.data?.clients || res?.data?.items || [];
    initialsMatchSuggestions.value = rows
      .map((r) => normalizeNoteAidClientRow(r, agencyLookup.value))
      .filter((c) => c && initialsLikelyMatch(typed, c))
      .slice(0, 5);
  } catch {
    initialsMatchSuggestions.value = [];
  } finally {
    initialsMatchSearched.value = true;
  }
}

watch(initials, () => {
  if (isWorkspaceHydrating()) return;
  initialsMatchDismissed.value = false;
  initialsMatchSearched.value = false;
  if (initialsMatchTimer) clearTimeout(initialsMatchTimer);
  initialsMatchTimer = setTimeout(searchInitialsMatches, 280);
  if (draftId.value && !selectedClientId.value) scheduleAutosave(800);
});

watch(selectedClientId, () => {
  if (isWorkspaceHydrating()) return;
  if (draftId.value) scheduleAutosave(800);
});

const onPlanImportSaved = async (plan) => {
  showPlanImportReview.value = false;
  planDraftEditorId.value = null;
  planDraftEditorMode.value = 'import';
  planDraftInitialPlan.value = null;
  pastedPlanText.value = '';
  planImportedOnce.value = true;
  if (effectiveClientId.value) await loadClientTreatmentPlan(effectiveClientId.value);
  approvalMessage.value = plan?.id
    ? (String(plan.status || '').toLowerCase() === 'draft'
      ? 'Treatment plan draft saved.'
      : 'Treatment plan saved to chart.')
    : 'Treatment plan import completed.';
};

const closePlanDraftEditor = () => {
  showPlanImportReview.value = false;
  planDraftEditorId.value = null;
  planDraftEditorMode.value = 'import';
  planDraftInitialPlan.value = null;
};

const openPlanImportReview = () => {
  planDraftEditorId.value = null;
  planDraftEditorMode.value = 'import';
  planDraftInitialPlan.value = null;
  showPlanImportReview.value = true;
};

const closeIntakeDraftEditor = () => {
  showIntakeDraftEditor.value = false;
  intakeDraftEditorId.value = null;
};

const onIntakeDraftEditorFinalized = async (payload) => {
  intakeImportedOnce.value = true;
  intakeDraftFinalized.value = true;
  if (payload?.treatmentPlan?.id) {
    planDraftInitialPlan.value = payload.treatmentPlan;
  }
  if (effectiveClientId.value) {
    await Promise.all([
      loadClientTreatmentPlan(effectiveClientId.value),
      loadClientIntakeSummary(effectiveClientId.value)
    ]);
  }
  clientContextPanelRef.value?.switchTab?.('goals');
  const draftId = Number(latestTreatmentPlan.value?.id || 0);
  const isDraft = String(latestTreatmentPlan.value?.status || '').toLowerCase() === 'draft';
  if (draftId && isDraft && !planImportedOnce.value) {
    planDraftEditorId.value = draftId;
    planDraftEditorMode.value = 'draft';
    planDraftInitialPlan.value = latestTreatmentPlan.value;
    showPlanImportReview.value = true;
  }
  approvalMessage.value = 'Intake note finalized.';
};

const onIntakeEditorOpenPlan = async ({ planId } = {}) => {
  showIntakeDraftEditor.value = false;
  const pid = Number(planId || latestTreatmentPlan.value?.id || 0);
  planDraftEditorId.value = pid || null;
  planDraftEditorMode.value = 'draft';
  planDraftInitialPlan.value =
    pid && Number(latestTreatmentPlan.value?.id) === pid ? latestTreatmentPlan.value : null;
  if (effectiveClientId.value) {
    await loadClientTreatmentPlan(effectiveClientId.value);
    if (pid && Number(latestTreatmentPlan.value?.id) === pid) {
      planDraftInitialPlan.value = latestTreatmentPlan.value;
    }
  }
  showPlanImportReview.value = true;
};

const onIntakeImportFinalized = async () => {
  showIntakeImportReview.value = false;
  pastedIntakeText.value = '';
  intakeImportedOnce.value = true;
  if (effectiveClientId.value) {
    await Promise.all([
      loadClientTreatmentPlan(effectiveClientId.value),
      loadClientIntakeSummary(effectiveClientId.value)
    ]);
  }
  clientContextPanelRef.value?.switchTab?.('goals');
  const draftId = Number(latestTreatmentPlan.value?.id || 0);
  const isDraft = String(latestTreatmentPlan.value?.status || '').toLowerCase() === 'draft';
  if (draftId && isDraft && !planImportedOnce.value) {
    planDraftEditorId.value = draftId;
    planDraftEditorMode.value = 'draft';
    planDraftInitialPlan.value = latestTreatmentPlan.value;
    showPlanImportReview.value = true;
  }
  approvalMessage.value = 'Intake note saved to chart.';
};

const onDemographicsImported = async () => {
  showDemographicsImport.value = false;
  pastedDemographicsText.value = '';
  await hydrateSelectedClient(effectiveClientId.value);
  // Force refresh even if name was already known
  try {
    const cid = Number(effectiveClientId.value || 0);
    if (cid) {
      const res = await api.get(`/clients/${cid}`, { skipGlobalLoading: true });
      const raw = res?.data?.client || res?.data;
      const row = normalizeNoteAidClientRow(raw, agencyLookup.value);
      if (row) {
        selectedClient.value = {
          ...row,
          demographics_on_file: true,
          demographics_phi_enc: raw?.demographics_phi_enc || { encrypted: true }
        };
      }
    }
  } catch {
    if (selectedClient.value) {
      selectedClient.value = {
        ...selectedClient.value,
        demographics_on_file: true,
        demographics_phi_enc: { encrypted: true }
      };
    }
  }
  approvalMessage.value = 'Demographics encrypted and saved to the client chart.';
  clientContextPanelRef.value?.switchTab?.('demographics');
};

function persistWorkQueue() {
  saveWorkQueue(authStore.user?.id, workQueueItems.value);
}

function queueItemSessionKey(item) {
  return sessionDedupeKey({
    officeEventId: item?.officeEventId,
    clinicalSessionId: item?.clinicalSessionId,
    clientId: item?.clientId,
    date: item?.date,
    date_of_service: item?.date,
    serviceCode: item?.serviceCode,
    service_code: item?.serviceCode
  });
}

/** Resolve chart clinical_notes.id for a signed library row or work-queue item. */
function resolveSignedClinicalNoteId(itemOrRow = {}) {
  const direct = Number(
    itemOrRow.clinicalNoteId
    || itemOrRow.noteId
    || itemOrRow.raw?.noteId
    || 0
  );
  if (direct) return direct;
  const rowId = String(itemOrRow.id || '');
  const signedRowMatch = rowId.match(/^signed_(\d+)$/);
  if (signedRowMatch) return Number(signedRowMatch[1]);
  const draftId = Number(itemOrRow.draftId || itemOrRow.raw?.draftId || 0);
  const sessions = signedNoteSessions.value || [];
  if (draftId) {
    const byDraft = sessions.find((s) => Number(s.draftId) === draftId);
    if (byDraft?.noteId) return Number(byDraft.noteId);
  }
  const key = queueItemSessionKey(itemOrRow)
    || sessionDedupeKey({
      officeEventId: itemOrRow.officeEventId || itemOrRow.raw?.officeEventId,
      clinicalSessionId: itemOrRow.clinicalSessionId || itemOrRow.raw?.clinicalSessionId,
      clientId: itemOrRow.clientId || itemOrRow.raw?.clientId,
      date_of_service: itemOrRow.date_of_service || itemOrRow.date || itemOrRow.raw?.dateOfService,
      service_code: itemOrRow.serviceCode || itemOrRow.service_code || itemOrRow.raw?.serviceCode
    });
  if (!key) return null;
  const hit = sessions.find((s) => sessionDedupeKey({
    officeEventId: s.officeEventId,
    clinicalSessionId: s.clinicalSessionId,
    clientId: s.clientId,
    date_of_service: s.dateOfService,
    service_code: s.serviceCode,
    draftId: s.draftId,
    noteId: s.noteId
  }) === key);
  return hit?.noteId ? Number(hit.noteId) : null;
}

function snapMissingDraftsOnQueue() {
  const live = new Set((recentDrafts.value || []).map((d) => String(d.id)));
  const activeId = activeWorkQueueItemId.value;
  workQueueItems.value = (workQueueItems.value || []).map((item) => {
    const status = deriveWorkQueueDocStatus(item);
    if (status === DOC_STATUS.SIGNED || status === DOC_STATUS.COMPLETED) return item;
    if (item.draftId && live.has(String(item.draftId))) return item;
    // Keep the ToDo you just opened — loadRecent runs before a draft exists.
    if (activeId && String(item.id) === String(activeId) && status === DOC_STATUS.STARTED) {
      return item;
    }
    if (!item.draftId && status === DOC_STATUS.NOT_STARTED) return item;
    return {
      ...item,
      draftId: null,
      status: DOC_STATUS.NOT_STARTED,
      docStatus: DOC_STATUS.NOT_STARTED
    };
  });
}

function applySignedSessionsToQueue(signedSessions = []) {
  const sessionByKey = new Map();
  const sessionByDraftId = new Map();
  for (const s of signedSessions || []) {
    if (s?.draftId) sessionByDraftId.set(Number(s.draftId), s);
    const k = sessionDedupeKey({
      officeEventId: s.officeEventId,
      clinicalSessionId: s.clinicalSessionId,
      clientId: s.clientId,
      date_of_service: s.dateOfService,
      service_code: s.serviceCode,
      draftId: s.draftId,
      noteId: s.noteId
    });
    if (k) sessionByKey.set(k, s);
  }
  if (sessionByKey.size || sessionByDraftId.size) {
    workQueueItems.value = (workQueueItems.value || []).map((item) => {
      const k = queueItemSessionKey(item);
      const byKey = k && sessionByKey.get(k);
      const byDraft = item.draftId && sessionByDraftId.get(Number(item.draftId));
      const match = byKey || byDraft;
      if (!match) return item;
      return {
        ...item,
        draftId: null,
        clinicalNoteId: match.noteId || item.clinicalNoteId || null,
        agencyId: match.agencyId || item.agencyId || null,
        status: DOC_STATUS.SIGNED,
        docStatus: DOC_STATUS.SIGNED,
        signedAt: item.signedAt || match.signedAt || new Date().toISOString()
      };
    });
  }
  snapMissingDraftsOnQueue();
  persistWorkQueue();
}

async function onWorkQueueDeleteDraft(item) {
  if (!item) return;
  const status = deriveWorkQueueDocStatus(item);
  if (status === DOC_STATUS.SIGNED) return;
  if (item.draftId) {
    if (!window.confirm('Delete this draft? The ToDo stays in the queue as not started.')) return;
    try {
      await api.post(
        '/clinical-notes/drafts/delete',
        {
          agencyId: agencyIdForDraftDelete(),
          draftIds: [Number(item.draftId)]
        },
        { skipGlobalLoading: true }
      );
    } catch (e) {
      approvalError.value = e.response?.data?.error?.message || 'Failed to delete draft';
      return;
    }
    if (String(draftId.value) === String(item.draftId)) {
      draftId.value = null;
      outputObj.value = null;
      inputText.value = '';
      await clearDraftFromRouteQuery();
    }
    await loadRecent();
  }
  workQueueItems.value = (workQueueItems.value || []).map((row) => {
    if (row.id !== item.id) return row;
    return {
      ...row,
      draftId: null,
      status: DOC_STATUS.NOT_STARTED,
      docStatus: DOC_STATUS.NOT_STARTED
    };
  });
  if (activeWorkQueueItemId.value === item.id) activeWorkQueueItemId.value = null;
  persistWorkQueue();
  approvalMessage.value = item.draftId ? 'Draft deleted. ToDo is waiting to be started.' : 'Reset to not started.';
}

function normalizeWorkQueueItemStatus(item) {
  if (!item) return item;
  const docStatus = deriveWorkQueueDocStatus(item);
  return { ...item, status: docStatus, docStatus };
}

function patchActiveWorkQueueStatus(status, extra = {}, itemId = null) {
  const id = itemId || activeWorkQueueItemId.value;
  if (!id) return;
  workQueueItems.value = (workQueueItems.value || []).map((item) =>
    item.id === id
      ? {
          ...item,
          status,
          docStatus: status,
          draftId: extra.draftId !== undefined ? extra.draftId : (draftId.value || item.draftId || null),
          updatedAt: new Date().toISOString(),
          ...extra
        }
      : item
  );
  persistWorkQueue();
}

function markActiveWorkQueueItemCompleted(itemId = null) {
  patchActiveWorkQueueStatus(DOC_STATUS.COMPLETED, {
    completedAt: new Date().toISOString()
  }, itemId);
}

function markActiveWorkQueueItemSigned() {
  patchActiveWorkQueueStatus(DOC_STATUS.SIGNED, {
    signedAt: new Date().toISOString()
  });
}

/** @deprecated use markActiveWorkQueueItemSigned */
function markActiveWorkQueueItemDone() {
  markActiveWorkQueueItemSigned();
}

function clearWorkQueue() {
  workQueueItems.value = [];
  activeWorkQueueItemId.value = null;
  persistWorkQueue();
}

function onTodoListBuilt({ items }) {
  showTodoImportModal.value = false;
  const incoming = (Array.isArray(items) ? items : []).map((i) => ({
    ...i,
    status: DOC_STATUS.NOT_STARTED,
    docStatus: DOC_STATUS.NOT_STARTED
  }));
  const existingKeys = new Set(
    (workQueueItems.value || []).map((i) => queueItemSessionKey(i)).filter(Boolean)
  );
  const appended = incoming.filter((i) => {
    const k = queueItemSessionKey(i);
    if (k && existingKeys.has(k)) return false;
    if (k) existingKeys.add(k);
    return true;
  });
  workQueueItems.value = [...(workQueueItems.value || []), ...appended];
  persistWorkQueue();
  api.post('/clinical-notes/audit', {
    agencyId: noteAidAgencyId.value || currentAgencyId.value,
    action: 'note_aid_todo_added',
    items: incoming.map((i) => ({
      clientId: i.clientId,
      agencyId: i.agencyId,
      date: i.date,
      serviceCode: i.serviceCode,
      clientName: i.clientName
    }))
  }, { skipGlobalLoading: true }).catch(() => {});
  if (!activeWorkQueueItemId.value) {
    const first = workQueueItems.value.find(
      (i) => deriveWorkQueueDocStatus(i) === DOC_STATUS.NOT_STARTED
    );
    if (first) activateWorkQueueItem(first);
  }
}

async function advanceWorkQueue() {
  const id = activeWorkQueueItemId.value;
  if (id) {
    const current = (workQueueItems.value || []).find((i) => i.id === id);
    const cur = current ? deriveWorkQueueDocStatus(current) : null;
    if (outputObj.value || cur === DOC_STATUS.COMPLETED || cur === DOC_STATUS.SIGNED) {
      markActiveWorkQueueItemCompleted();
    }
  }
  const next = sortedWorkQueueItems.value.find(
    (i) => i.id !== id && deriveWorkQueueDocStatus(i) === DOC_STATUS.NOT_STARTED
  );
  if (next) await activateWorkQueueItem(next);
  else activeWorkQueueItemId.value = null;
}

function advanceWorkQueueAfterSign() {
  markActiveWorkQueueItemSigned();
  activeWorkQueueItemId.value = null;
}

function openNextInProgress() {
  const row = nextInProgressRow.value;
  if (!row) return;
  onLibrarySidebarSelect(row);
  sidebarTab.value = DOC_STATUS.STARTED;
}

async function openNextInQueue() {
  const next = nextInQueueItem.value;
  if (!next) return;
  await activateWorkQueueItem(next);
  sidebarTab.value = DOC_STATUS.STARTED;
}

async function onLibrarySidebarSelect(row) {
  if (!row) return;
  libraryExpanded.value = false;
  collapseSidebarsForNote();
  showAidPicker.value = false;
  cancelPendingAutosave();
  if (row.source === 'work_queue' && row.raw) {
    await activateWorkQueueItem(row.raw);
    return;
  }
  const signedNoteId = resolveSignedClinicalNoteId(row);
  if (
    signedNoteId
    && (row.source === 'signed_note' || normalizeDocStatus(row.docStatus) === DOC_STATUS.SIGNED)
  ) {
    await openSignedClinicalNote(signedNoteId, {
      agencyId: Number(row.agency_id || row.raw?.agencyId || 0) || null,
      preserveWorkQueueId: row.workQueueId || null
    });
    sidebarTab.value = DOC_STATUS.SIGNED;
    return;
  }
  workQueueActivateSeq += 1;
  clientHydrateSeq += 1;
  const draft = row.raw || row;
  if (draft?.id && row.source !== 'work_queue') {
    loadDraftIntoWorkspace(draft, {
      expectedClientId: Number(row.clientId || draft.client_id || draft.clientId || 0) || null,
      preserveWorkQueueItemId: !!row.workQueueId
    });
    if (row.workQueueId) activeWorkQueueItemId.value = row.workQueueId;
    const st = row.docStatus || DOC_STATUS.STARTED;
    if (st === DOC_STATUS.SIGNED) sidebarTab.value = DOC_STATUS.SIGNED;
    else if (st === DOC_STATUS.COMPLETED) sidebarTab.value = DOC_STATUS.COMPLETED;
    else sidebarTab.value = DOC_STATUS.STARTED;
  }
}

async function activateWorkQueueItem(item) {
  if (!item) return;
  collapseSidebarsForNote();
  showAidPicker.value = false;
  beginWorkspaceHydration();
  try {
  cancelPendingAutosave();
  const seq = ++workQueueActivateSeq;
  clientHydrateSeq += 1;
  const incomingStatus = deriveWorkQueueDocStatus(item);
  const isFinished = incomingStatus === DOC_STATUS.SIGNED || incomingStatus === DOC_STATUS.COMPLETED;
  const preResolvedSignedNoteId =
    incomingStatus === DOC_STATUS.SIGNED ? resolveSignedClinicalNoteId(item) : null;
  if (preResolvedSignedNoteId) {
    signedNoteViewerId.value = preResolvedSignedNoteId;
    signedNoteViewerAgencyId.value = Number(item.agencyId || item.raw?.agencyId || 0) || null;
    noteWizardStep.value = 2;
    configExpanded.value = false;
  } else if (!isFinished) {
    clearSignedNoteViewer();
  }
  if (!isFinished) {
    workQueueItems.value = (workQueueItems.value || []).map((row) => {
      if (row.id === item.id) {
        return {
          ...row,
          status: DOC_STATUS.STARTED,
          docStatus: DOC_STATUS.STARTED,
          startedAt: row.startedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
      return row;
    });
  }
  activeWorkQueueItemId.value = item.id;
  sidebarTab.value = isFinished ? incomingStatus : DOC_STATUS.STARTED;
  persistWorkQueue();

  showProgressSessionPicker.value = false;
  progressEntryMode.value = item.officeEventId ? 'appointment' : 'client';
  dateOfService.value = item.date || todayIsoDate();
  sessionOfficeEventId.value = item.officeEventId || null;
  sessionClinicalSessionId.value = item.clinicalSessionId || null;
  sessionDurationMinutes.value = item.durationMinutes || null;
  sessionLocationLabel.value = item.locationLabel || '';
  sessionParticipants.value = normalizeParticipantsLabel(item.participantsSummary || 'Client Only');
  sessionParticipantsDetail.value = item.participantsDetail || '';
  sessionPatientDob.value = item.clientDob ? String(item.clientDob).slice(0, 10) : '';
  sessionScheduledStart.value = item.scheduledStart || null;
  sessionScheduledEnd.value = item.scheduledEnd || null;
  sessionCodeSwitchBanner.value = '';
  applySessionTimingDefaults({ force: sessionDurationMinutes.value == null });
  chartMentalStatus.value = defaultMentalStatusExam();
  chartRiskAssessment.value = defaultRiskAssessment();
  chartMedications.value = defaultMedicationsBlock();
  if (!preResolvedSignedNoteId) {
    draftId.value = null;
    outputObj.value = null;
  }
  inputText.value = '';
  let clientId = Number(item.clientId || 0) || null;
  if (clientId) {
    resetClientClinicalContext();
    selectedClientId.value = clientId;
    selectedClient.value = {
      id: clientId,
      full_name: item.clientName,
      agency_id: item.agencyId,
      initials: deriveInitialsFromNameSafe(item.clientName)
    };
    initials.value = deriveInitialsFromNameSafe(item.clientName);
    await hydrateSelectedClient(clientId);
    if (seq !== workQueueActivateSeq) return;
    if (
      item.clientName
      && selectedClient.value?.full_name
      && !namesLikelySamePerson(item.clientName, selectedClient.value.full_name)
    ) {
      const repaired = await resolveQueueClientByName(item);
      if (seq !== workQueueActivateSeq) return;
      if (repaired?.clientId) {
        clientId = repaired.clientId;
        item = { ...item, clientId, clientName: repaired.clientName || item.clientName };
        workQueueItems.value = (workQueueItems.value || []).map((row) =>
          row.id === item.id ? { ...row, clientId, clientName: item.clientName } : row
        );
        persistWorkQueue();
        selectedClientId.value = clientId;
        await hydrateSelectedClient(clientId);
        if (seq !== workQueueActivateSeq) return;
      }
    }
    if (selectedClient.value && item.clientName && !selectedClient.value.full_name) {
      selectedClient.value = { ...selectedClient.value, full_name: item.clientName };
    }
    await loadClientAgencyContext(clientId);
    if (seq !== workQueueActivateSeq) return;
    await Promise.all([
      loadClientTreatmentPlan(clientId),
      loadClientIntakeSummary(clientId),
      loadClientGuardianNames(clientId)
    ]);
    if (seq !== workQueueActivateSeq) return;
    chartDiagnosticJustification.value = primaryChartDiagnosis.value?.justification || '';
  } else {
    const repaired = await resolveQueueClientByName(item);
    if (seq !== workQueueActivateSeq) return;
    if (repaired?.clientId) {
      clientId = repaired.clientId;
      item = { ...item, clientId, clientName: repaired.clientName || item.clientName };
      workQueueItems.value = (workQueueItems.value || []).map((row) =>
        row.id === item.id ? { ...row, clientId, clientName: item.clientName } : row
      );
      persistWorkQueue();
      selectedClientId.value = clientId;
      selectedClient.value = {
        id: clientId,
        full_name: item.clientName,
        agency_id: item.agencyId
      };
      initials.value = deriveInitialsFromNameSafe(item.clientName);
      await hydrateSelectedClient(clientId);
      if (seq !== workQueueActivateSeq) return;
      await loadClientAgencyContext(clientId);
      if (seq !== workQueueActivateSeq) return;
      await Promise.all([
        loadClientTreatmentPlan(clientId),
        loadClientIntakeSummary(clientId),
        loadClientGuardianNames(clientId)
      ]);
      if (seq !== workQueueActivateSeq) return;
    } else {
      selectedClientId.value = null;
      selectedClient.value = null;
      resetClientClinicalContext();
      initials.value = deriveInitialsFromNameSafe(item.clientName || item.initials);
    }
  }

  if (item.noteKind === 'intake') {
    const hit = findNoteAidByToolOrCode({ serviceCode: item.serviceCode || '90791' });
    if (hit) {
      selectedNoteCategory.value = hit.category.id;
      selectedAidId.value = hit.aid.id;
    }
    selectedServiceCode.value = item.serviceCode || '90791';
  } else if (item.noteKind === 'treatment_plan') {
    const hit = findNoteAidByToolOrCode({ toolId: 'clinical_h0032_plan_development', serviceCode: 'H0032' });
    if (hit) {
      selectedNoteCategory.value = hit.category.id;
      selectedAidId.value = hit.aid.id;
    }
    showPlanImportReview.value = false;
  } else if (item.noteKind === 'termination') {
    const hit = findNoteAidById('termination')
      || findNoteAidByToolOrCode({ toolId: 'clinical_termination' });
    if (hit) {
      selectedNoteCategory.value = hit.category.id;
      selectedAidId.value = hit.aid.id;
    }
  } else {
    const code = item.serviceCode || '90837';
    const hit = findNoteAidByToolOrCode({ serviceCode: code });
    if (hit) {
      selectedNoteCategory.value = hit.category.id;
      selectedAidId.value = hit.aid.id;
    }
    selectedServiceCode.value = code;
  }

  syncWorkQueueRouteQuery(item);

  await loadRecent();
  if (seq !== workQueueActivateSeq) return;

  if (incomingStatus === DOC_STATUS.SIGNED) {
    const freshItem = (workQueueItems.value || []).find((r) => r.id === item.id) || item;
    const clinicalNoteId = resolveSignedClinicalNoteId(freshItem);
    if (clinicalNoteId) {
      await openSignedClinicalNote(clinicalNoteId, {
        agencyId: Number(freshItem.agencyId || item.agencyId || 0) || null,
        preserveWorkQueueId: item.id
      });
      if (seq !== workQueueActivateSeq) return;
      sidebarTab.value = DOC_STATUS.SIGNED;
      return;
    }
    approvalError.value = 'Could not open this signed note. Try again after the library refreshes.';
  }

  configExpanded.value = true;
  noteWizardStep.value = 1;
  if (!isFinished) sidebarTab.value = DOC_STATUS.STARTED;

  const reuse = findReusableLocalDraft(item);
  if (reuse) {
    await loadDraftIntoWorkspace(reuse, {
      preserveWorkQueueItemId: true,
      expectedClientId: clientId
    });
    if (seq !== workQueueActivateSeq) return;
    activeWorkQueueItemId.value = item.id;
    if (item.officeEventId) sessionOfficeEventId.value = item.officeEventId;
    if (item.clinicalSessionId) sessionClinicalSessionId.value = item.clinicalSessionId;
    if (item.date) dateOfService.value = String(item.date).slice(0, 10);
    progressEntryMode.value = item.officeEventId ? 'appointment' : 'client';
    workQueueItems.value = (workQueueItems.value || []).map((row) =>
      row.id === item.id ? { ...row, draftId: reuse.id } : row
    );
    persistWorkQueue();
    if (isFinished) sidebarTab.value = incomingStatus;
    return;
  }

  if (isFinished) {
    sidebarTab.value = incomingStatus;
    return;
  }

  await ensureWorkQueueDraft(item);
  if (seq !== workQueueActivateSeq) return;
  await loadRecent();
  } finally {
    endWorkspaceHydration();
  }
}

async function ensureWorkQueueDraft(item) {
  if (!item) return;
  if (item.draftId) {
    const linked = (recentDrafts.value || []).find((d) => String(d.id) === String(item.draftId));
    if (linked && draftMatchesWorkQueueItem(linked, item)) {
      draftId.value = linked.id;
      return;
    }
  }
  if (draftId.value) {
    const current = (recentDrafts.value || []).find((d) => String(d.id) === String(draftId.value));
    if (current && draftMatchesWorkQueueItem(current, item)) return;
    draftId.value = null;
  }
  const agencyId = Number(item.agencyId || noteAidAgencyId.value || currentAgencyId.value || 0);
  const clientId = Number(item.clientId || selectedClientId.value || 0) || null;
  if (!agencyId) return;
  try {
    const res = await api.post('/clinical-notes/drafts', {
      agencyId,
      clientId,
      officeEventId: Number(item.officeEventId || 0) || null,
      clinicalSessionId: Number(item.clinicalSessionId || 0) || null,
      dateOfService: item.date ? String(item.date).slice(0, 10) : dateOfService.value,
      serviceCode: item.serviceCode || null,
      initials: initials.value || deriveInitialsFromNameSafe(item.clientName),
      inputText: null
    }, { skipGlobalLoading: true });
    const created = res?.data?.draft || null;
    if (!created?.id) return;
    draftId.value = created.id;
    currentDraftCreatedAt.value = created.created_at || new Date().toISOString();
    recentDrafts.value = [
      created,
      ...(recentDrafts.value || []).filter((d) => String(d.id) !== String(created.id))
    ];
    workQueueItems.value = (workQueueItems.value || []).map((row) =>
      row.id === item.id ? { ...row, draftId: created.id } : row
    );
    persistWorkQueue();
  } catch {
    // Left library can still fill once the clinician types.
  }
}

function findReusableLocalDraft(item) {
  if (!item) return null;
  const list = recentDrafts.value || [];
  if (item.draftId) {
    const linked = list.find((d) => String(d.id) === String(item.draftId));
    if (linked && draftMatchesWorkQueueItem(linked, item)) return linked;
  }
  const key = sessionDedupeKey({
    officeEventId: item.officeEventId,
    clinicalSessionId: item.clinicalSessionId,
    clientId: item.clientId,
    date_of_service: item.date,
    service_code: item.serviceCode
  });
  if (!key) return null;
  return list.find((d) => sessionDedupeKey(d) === key && draftMatchesWorkQueueItem(d, item)) || null;
}

function syncWorkQueueRouteQuery(item) {
  const nextQuery = { ...route.query, launchIntent: 'work_queue' };
  delete nextQuery.draftId;
  delete nextQuery.draft_id;
  delete nextQuery.clinicalNoteId;
  delete nextQuery.clinical_note_id;
  delete nextQuery.officeEventId;
  delete nextQuery.office_event_id;
  delete nextQuery.clinicalSessionId;
  delete nextQuery.clinical_session_id;
  if (item?.clientId) {
    nextQuery.clientId = String(item.clientId);
    delete nextQuery.client_id;
  } else {
    delete nextQuery.clientId;
    delete nextQuery.client_id;
  }
  if (item?.officeEventId) nextQuery.officeEventId = String(item.officeEventId);
  if (item?.clinicalSessionId) nextQuery.clinicalSessionId = String(item.clinicalSessionId);
  if (item?.serviceCode) nextQuery.serviceCode = String(item.serviceCode);
  if (item?.date) nextQuery.dateOfService = String(item.date).slice(0, 10);
  router.replace({ query: nextQuery }).catch(() => {});
}

async function resolveQueueClientByName(item) {
  const name = String(item?.clientName || '').trim();
  const agencyId = Number(item?.agencyId || noteAidAgencyId.value || currentAgencyId.value || 0);
  if (!name || !agencyId) return null;
  try {
    const searchRes = await api.get('/clients', {
      params: { agency_id: agencyId, search: name, limit: 20 },
      skipGlobalLoading: true
    });
    const rows = searchRes?.data?.clients || searchRes?.data || [];
    const match = matchTodoClientFromSearchRows(name, rows);
    if (!match?.id) return null;
    return { clientId: Number(match.id), clientName: match.full_name || name };
  } catch {
    return null;
  }
}

function deriveInitialsFromNameSafe(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0].replace(/[^A-Za-z]/g, '');
    const b = parts[parts.length - 1].replace(/[^A-Za-z]/g, '');
    if (a.length >= 3 && b.length >= 3) return `${a.slice(0, 3)}${b.slice(0, 3)}`.toUpperCase();
    return `${a.charAt(0)}${b.charAt(0)}`.toUpperCase();
  }
  return String(name || 'TBD').replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() || 'TBD';
}

const onObjectiveImproved = () => {
  suggestUpdateTreatmentPlan.value = true;
  renewalSuggestReason.value =
    'One or more objectives reached the goal scale. Update the treatment plan (goals, objectives, diagnosis, and diagnostic justification).';
};

const openTreatmentPlanUpdater = async ({
  renewalReason = '',
  progressExcerpt = ''
} = {}) => {
  const planAidId = resolveTreatmentPlanAidId({
    noteAidId: selectedAidId.value,
    toolId: selectedToolId.value || selectedAid.value?.toolId,
    serviceCode: actualServiceCode.value,
    categoryId: selectedNoteCategory.value
  });
  const planHit = findNoteAidById(planAidId);
  selectedNoteCategory.value = planHit?.category?.id || 'psychotherapy';
  selectedAidId.value = planAidId;

  const cid = Number(effectiveClientId.value || 0);
  if (cid && !latestTreatmentPlan.value && !loadingClientPlan.value) {
    await loadClientTreatmentPlan(cid);
  }

  const reason =
    renewalReason ||
    renewalSuggestReason.value ||
    (suggestUpdateTreatmentPlan.value
      ? 'Objective(s) improved to goal — renew / update treatment plan.'
      : '');

  const excerpt =
    progressExcerpt ||
    lastProgressNoteExcerpt.value ||
    '';

  const prefill = buildUpdaterPrefillDocument({
    latestPlan: latestTreatmentPlan.value,
    pastedPlanText: pastedPlanText.value,
    diagnoses: chartDiagnoses.value,
    ratings: [
      ...chartObjectiveRatings.value.slice(0, 40),
      ...(sessionObjectiveRatings.value || []).map((r) => ({
        goal_text: r.goalText,
        objective_text: r.objectiveText,
        disposition: r.disposition,
        scale_value: r.scaleValue,
        scale_target: r.scaleTarget,
        progress_label: r.progressLabel
      }))
    ],
    progressNoteExcerpt: excerpt,
    renewalReason: reason
  });

  if (prefill) {
    inputText.value = prefill;
  }
  configExpanded.value = true;
};

const useIntakeToInformPlan = async () => {
  const intakeText = String(pastedIntakeText.value || intakeSummary.value || '').trim();
  const dxSource = (chartDiagnoses.value?.length ? chartDiagnoses.value : [])
    .concat(primaryChartDiagnosis.value ? [primaryChartDiagnosis.value] : []);
  pastedPlanText.value = buildIntakeInformedPlanText({
    intakeText,
    diagnoses: dxSource,
    diagnosticJustification:
      chartDiagnosticJustification.value
      || primaryChartDiagnosis.value?.justification
      || '',
    presentingProblem: chartPresentingProblem.value || ''
  });
  clientContextPanelRef.value?.switchTab?.('goals');
  await openTreatmentPlanUpdater({
    renewalReason: intakeText
      ? 'Build or update treatment plan from intake and chart diagnoses.'
      : 'Build treatment plan from chart diagnoses.'
  });
  openPlanImportReview();
};

const openClientChartIntake = () => {
  const cid = Number(effectiveClientId.value || 0);
  if (!cid) return;
  const slug = agencyStore.currentAgency?.slug || agencyStore.currentAgency?.organization_slug;
  const query = { tab: 'intake-note' };
  if (slug) router.push({ path: `/${slug}/admin/clients/${cid}`, query });
  else router.push({ path: `/admin/clients/${cid}`, query });
};

const persistSessionObjectiveRatings = async () => {
  const cid = Number(effectiveClientId.value || 0);
  const aid = Number(noteAidAgencyId.value || currentAgencyId.value || 0);
  const ratings = Array.isArray(sessionObjectiveRatings.value) ? sessionObjectiveRatings.value : [];
  if (!cid || !aid || !ratings.length) return;
  let anyImproved = false;
  for (const r of ratings) {
    try {
      const res = await api.post(
        `/medical-billing/objectives/${r.objectiveId}/ratings`,
        {
          agencyId: aid,
          clientId: cid,
          disposition: r.disposition || 'rated',
          scaleValue: r.scaleValue,
          scaleTarget: r.scaleTarget,
          previousScaleValue: r.previousScaleValue,
          raterKind: r.raterKind || 'clinician',
          raterLabel: r.raterLabel || null,
          draftId: draftId.value || null,
          dateOfService: dateOfService.value || null
        },
        { skipGlobalLoading: true }
      );
      if (res?.data?.suggestUpdateTreatmentPlan || res?.data?.progressLabel === 'improved') {
        anyImproved = true;
      }
    } catch {
      // Non-blocking: chart gate or offline should not fail note generate.
    }
  }
  if (anyImproved) {
    suggestUpdateTreatmentPlan.value = true;
    renewalSuggestReason.value =
      'One or more objectives reached the goal scale. Update goals, objectives, diagnosis, and diagnostic justification.';
    if (window.confirm('An objective reached its goal. Open the treatment plan updater with chart context?')) {
      await openTreatmentPlanUpdater({
        renewalReason: renewalSuggestReason.value,
        progressExcerpt: lastProgressNoteExcerpt.value
      });
    }
  }
};

const startNewNote = () => {
  draftId.value = null;
  viewingChartNote.value = null;
  clearSignedNoteViewer();
  currentDraftArchivedAt.value = null;
  currentDraftCreatedAt.value = null;
  lastSavedAt.value = '';
  selectedNoteCategory.value = '';
  selectedAidId.value = '';
  selectedServiceCode.value = '';
  otherServiceCode.value = '';
  selectedProgramId.value = '';
  autoSelectCode.value = false;
  dateOfService.value = todayIsoDate();
  initials.value = '';
  selectedClientId.value = null;
  selectedClient.value = null;
  resetClientClinicalContext();
  sessionParticipants.value = 'Client Only';
  sessionParticipantsDetail.value = '';
  inputText.value = '';
  includeInteractiveComplexity.value = false;
  inputMode.value = 'type';
  outputObj.value = null;
  revisionInstruction.value = '';
  clearAudio();
  transcriptSource.value = '';
  liveTranscript.value = '';
  approvalMessage.value = '';
  approvalError.value = '';
  archiveMessage.value = '';
  generateError.value = '';
  participantsPresenceDismissed.value = false;
  sidebarTab.value = DOC_STATUS.STARTED;
  openDateGroups.value = { [todayIsoDate()]: true };
  configExpanded.value = true;
  noteWizardStep.value = 1;
  newNoteMenuOpen.value = false;
  activeWorkQueueItemId.value = null;
  showProgressSessionPicker.value = true;
  progressEntryMode.value = 'appointment';
};

const clearGeneratedWorkspace = () => {
  draftId.value = null;
  currentDraftArchivedAt.value = null;
  currentDraftCreatedAt.value = null;
  lastSavedAt.value = '';
  inputText.value = '';
  outputObj.value = null;
  revisionInstruction.value = '';
  clearAudio();
  transcriptSource.value = '';
  liveTranscript.value = '';
  approvalMessage.value = '';
  approvalError.value = '';
  archiveMessage.value = '';
  generateError.value = '';
  inputMode.value = 'type';
  sidebarTab.value = DOC_STATUS.STARTED;
};

const focusConfigField = async (which) => {
  configExpanded.value = true;
  noteWizardStep.value = 1;
  await nextTick();
  const el = which === 'date' ? dateOfServiceInputEl.value : initialsInputEl.value;
  if (el && typeof el.focus === 'function') el.focus();
};

/** Keep date + service; user picks client initials. */
const startNewNoteSameDate = async () => {
  const keepDate = String(dateOfService.value || '').trim() || todayIsoDate();
  clearGeneratedWorkspace();
  dateOfService.value = keepDate;
  initials.value = '';
  selectedClientId.value = null;
  selectedClient.value = null;
  resetClientClinicalContext();
  sessionObjectiveRatings.value = [];
  newNoteMenuOpen.value = false;
  await focusConfigField('initials');
};

/** Keep client + service; user picks a new date. */
const startNewNoteSameClient = async () => {
  const keepInitials = String(initials.value || '').trim();
  const keepClientId = selectedClientId.value;
  const keepClient = selectedClient.value;
  clearGeneratedWorkspace();
  initials.value = keepInitials;
  selectedClientId.value = keepClientId;
  selectedClient.value = keepClient;
  dateOfService.value = '';
  sessionObjectiveRatings.value = [];
  newNoteMenuOpen.value = false;
  await focusConfigField('date');
};

/** Keep date + client; return to service / note-aid chooser. */
const startNewNoteDifferentService = () => {
  const keepDate = String(dateOfService.value || '').trim() || todayIsoDate();
  const keepInitials = String(initials.value || '').trim();
  clearGeneratedWorkspace();
  dateOfService.value = keepDate;
  initials.value = keepInitials;
  selectedAidId.value = '';
  selectedNoteCategory.value = '';
  selectedServiceCode.value = '';
  otherServiceCode.value = '';
  selectedProgramId.value = '';
  autoSelectCode.value = false;
  includeInteractiveComplexity.value = false;
  configExpanded.value = true;
  noteWizardStep.value = 1;
  newNoteMenuOpen.value = false;
};

const loadDraftIntoWorkspace = async (d, options = {}) => {
  if (!d) return;
  const preserveWorkQueue = !!options.preserveWorkQueueItemId;
  const expectedClientId = Number(options.expectedClientId || 0) || null;
  const draftStampClientId = Number(d.client_id || d.clientId || 0) || null;
  if (expectedClientId && draftStampClientId && expectedClientId !== draftStampClientId) {
    return;
  }
  beginWorkspaceHydration();
  try {
  viewingChartNote.value = null;
  clearSignedNoteViewer();
  draftId.value = d.id || null;
  sessionObjectiveRatings.value = [];
  noteAidAgencyChoiceId.value = null;
  currentDraftArchivedAt.value = d.archived_at || null;
  currentDraftCreatedAt.value = d.created_at || null;
  const draftCode = String(d.service_code || '').trim().toUpperCase();
  otherServiceCode.value = '';
  if (!draftCode) {
    selectedServiceCode.value = '';
  } else if (HIDDEN_ADDON_CODES.has(draftCode)) {
    selectedServiceCode.value = '__other__';
    otherServiceCode.value = draftCode;
  } else {
    const resolved = resolveNoteTypeSelection(draftCode);
    const known = (noteTypeOptions.value || []).some(
      (o) => o.value === resolved || o.codes.includes(draftCode)
    );
    if (known) {
      selectedServiceCode.value = resolved;
    } else {
      selectedServiceCode.value = '__other__';
      otherServiceCode.value = draftCode;
    }
  }
  selectedProgramId.value = d.program_id ? String(d.program_id) : '';
  inputText.value = unwrapDraftText(d.input_text);
  dateOfService.value = d.date_of_service ? String(d.date_of_service).slice(0, 10) : todayIsoDate();
  initials.value = d.initials || '';
  let draftClientId = expectedClientId || resolveDraftClientIdOnLoad(d);
  if (expectedClientId) draftClientId = expectedClientId;
  if (draftClientId) {
    selectedClientId.value = draftClientId;
    selectedClient.value = {
      ...(selectedClient.value && Number(selectedClient.value.id) === draftClientId ? selectedClient.value : {}),
      id: draftClientId,
      agency_id: d.client_agency_id || selectedClient.value?.agency_id || null,
      agency_name: d.agency_name || selectedClient.value?.agency_name || null,
      initials: d.initials || selectedClient.value?.initials || '',
      full_name: d.client_full_name || selectedClient.value?.full_name || null
    };
    await hydrateSelectedClient(draftClientId);
    syncRouteNoteClient(draftClientId);
    await loadClientAgencyContext(draftClientId);
    await Promise.all([
      loadClientTreatmentPlan(draftClientId),
      loadClientIntakeSummary(draftClientId)
    ]);
  } else {
    // Initials-only / unlinked draft — drop any client left from a prior note in this workspace.
    selectedClientId.value = null;
    selectedClient.value = null;
    clientAgencyMembershipIds.value = [];
    learningSponsorAgencyIds.value = [];
    resetClientClinicalContext();
    if (!expectedClientId) syncRouteNoteClient(null);
  }

  // Prefer client-owned tenant over a workspace-misattributed draft stamp.
  const draftAgency = Number(d.agency_id || d.agencyId || 0) || null;
  const clientPrimary = Number(selectedClient.value?.agency_id || selectedClient.value?.agencyId || 0) || null;
  const memberships = clientAgencyMembershipIds.value || [];
  if (draftAgency && memberships.includes(draftAgency)) {
    selectedQueueAgencyId.value = draftAgency;
  } else if (clientPrimary) {
    selectedQueueAgencyId.value = clientPrimary;
  } else {
    selectedQueueAgencyId.value = draftAgency;
  }

  inputText.value = unwrapDraftText(d.input_text);
  try {
    const raw = unwrapDraftText(d.output_json) || d.output_json;
    if (!raw) {
      outputObj.value = null;
    } else if (typeof raw === 'object') {
      outputObj.value = raw;
    } else if (looksEncryptedEnvelope(raw)) {
      outputObj.value = null;
    } else {
      outputObj.value = JSON.parse(raw);
    }
  } catch {
    outputObj.value = null;
  }
  const draftToolId = String(outputObj.value?.meta?.toolId || d.tool_id || '').trim();
  const aidHit = findNoteAidByToolOrCode({ toolId: draftToolId, serviceCode: draftCode });
  if (aidHit) {
    selectedNoteCategory.value = aidHit.category.id;
    selectedAidId.value = aidHit.aid.id;
    if (aidHit.aid.autoSelect) autoSelectCode.value = true;
  } else {
    const fallbackCode = draftCode
      || (String(d.note_kind || d.noteKind || '').includes('intake') ? '90791' : '90837');
    const fallback = findNoteAidByToolOrCode({ serviceCode: fallbackCode });
    if (fallback) {
      selectedNoteCategory.value = fallback.category.id;
      selectedAidId.value = fallback.aid.id;
    }
  }
  if (outputObj.value?.meta?.includeInteractiveComplexity != null) {
    includeInteractiveComplexity.value =
      !!outputObj.value.meta.includeInteractiveComplexity && aidAllowsInteractiveComplexity(aidHit?.aid || selectedAid.value);
  }
  const dayKey = draftCreatedKey(d.created_at);
  openDateGroups.value = { ...openDateGroups.value, [dayKey]: true };
  archiveMessage.value = '';
  configExpanded.value = !(
    String(dateOfService.value || '').trim() && String(initials.value || '').trim()
  );
  noteWizardStep.value = (outputObj.value || isEmbedded.value) ? 2 : 1;
  newNoteMenuOpen.value = false;
  if (!preserveWorkQueue) {
    showProgressSessionPicker.value = false;
    progressEntryMode.value = 'client';
    activeWorkQueueItemId.value = null;
  }
  applySessionTimingDefaults({ force: sessionDurationMinutes.value == null });
  } finally {
    await nextTick();
    endWorkspaceHydration();
  }
};

const loadClinicalNoteIntoWorkspace = async (
  noteId,
  { agencyId: preferredAgencyId = null, preserveWorkQueueId = null } = {}
) => {
  const nid = Number(noteId || 0);
  if (!nid) return;
  signedNoteViewerId.value = nid;
  if (preferredAgencyId) {
    signedNoteViewerAgencyId.value = Number(preferredAgencyId) || null;
  }
  noteWizardStep.value = 2;
  configExpanded.value = false;
  const agencyCandidates = [...new Set(
    [
      preferredAgencyId,
      noteAidAgencyId.value,
      selectedClient.value?.agency_id,
      selectedClient.value?.agencyId,
      currentAgencyId.value
    ].map((x) => Number(x || 0)).filter((n) => n > 0)
  )];
  try {
    let note = null;
    let lastErr = null;
    const attempts = agencyCandidates.length ? [...agencyCandidates, null] : [null];
    for (const aid of attempts) {
      try {
        const res = await api.get(`/medical-billing/notes/${nid}`, {
          params: aid ? { agencyId: aid } : undefined,
          skipGlobalLoading: true
        });
        note = res?.data?.note;
        if (note) break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!note) {
      throw lastErr || new Error('Clinical note not found.');
    }
    if (!signedNoteViewerAgencyId.value && note.agencyId) {
      signedNoteViewerAgencyId.value = Number(note.agencyId) || null;
    }
    viewingChartNote.value = {
      id: note.id,
      title: note.title || '',
      standalone: !!note.standalone,
      noteType: note.noteType || null
    };
    draftId.value = null;
    activeWorkQueueItemId.value = preserveWorkQueueId || null;
    currentDraftArchivedAt.value = null;
    currentDraftCreatedAt.value = note.createdAt || null;
    dateOfService.value = note.dateOfService
      ? String(note.dateOfService).slice(0, 10)
      : todayIsoDate();
    const cid = Number(note.clientId || 0) || null;
    if (cid) {
      selectedClientId.value = cid;
      selectedClient.value = { id: cid, initials: '' };
      await hydrateSelectedClient(cid);
    } else {
      selectedClientId.value = null;
      selectedClient.value = null;
      resetClientClinicalContext();
    }
    const code = String(note.serviceCode || '').trim().toUpperCase();
    otherServiceCode.value = '';
    if (!code) {
      selectedServiceCode.value = '';
    } else if (HIDDEN_ADDON_CODES.has(code)) {
      selectedServiceCode.value = '__other__';
      otherServiceCode.value = code;
    } else {
      const resolved = resolveNoteTypeSelection(code);
      const known = (noteTypeOptions.value || []).some(
        (o) => o.value === resolved || o.codes.includes(code)
      );
      if (known) selectedServiceCode.value = resolved;
      else {
        selectedServiceCode.value = '__other__';
        otherServiceCode.value = code;
      }
    }
    inputText.value = '';
    outputObj.value = note.outputJson && typeof note.outputJson === 'object'
      ? note.outputJson
      : (note.outputJson ? { sections: { Narrative: String(note.outputJson) }, meta: {} } : null);
    Object.keys(sectionOverrides).forEach((k) => delete sectionOverrides[k]);
    Object.keys(sectionEditing).forEach((k) => delete sectionEditing[k]);
    configExpanded.value = false;
    noteWizardStep.value = 2;
    newNoteMenuOpen.value = false;
    approvalMessage.value = '';
    approvalError.value = '';
  } catch (e) {
    viewingChartNote.value = null;
    // Keep signedNoteViewerId so ClinicalNoteDetailFetcher can still load / retry.
    approvalError.value =
      e.response?.data?.error?.message || e.message || 'Could not load clinical note.';
  }
};

const archiveCurrentDraft = async () => {
  if (!draftId.value || archivingDraft.value) return;
  const aid = Number(noteAidAgencyId.value || currentAgencyId.value || 0);
  if (!aid) return;
  const nextArchived = !isCurrentDraftArchived.value;
  try {
    archivingDraft.value = true;
    archiveMessage.value = '';
    const res = await api.post(
      `/clinical-notes/drafts/${draftId.value}/archive`,
      { agencyId: aid, archived: nextArchived },
      { skipGlobalLoading: true }
    );
    currentDraftArchivedAt.value = res?.data?.draft?.archived_at || (nextArchived ? new Date().toISOString() : null);
    archiveMessage.value = nextArchived
      ? 'Moved to Completed. Drafts auto-archive after 7 days and are retained up to 7 years.'
      : 'Restored to In progress.';
    if (nextArchived) sidebarTab.value = DOC_STATUS.COMPLETED;
    else sidebarTab.value = DOC_STATUS.STARTED;
    await loadRecent();
  } catch (e) {
    archiveMessage.value = e.response?.data?.error?.message || 'Failed to update archive status';
  } finally {
    archivingDraft.value = false;
  }
};

const copyFullNote = async () => {
  const sections = Object.fromEntries(
    displayPanels.value.map((p) => [p.id, panelText(p)])
  );
  const text = formatFullNoteCopy({
    sections,
    meta: outputObj.value?.meta || {},
    initials: initials.value,
    dateOfService: dateOfService.value,
    dateWritten: effectiveCreatedDate.value,
    noteTypeLabel: noteTypeDisplayLabel.value,
    includeInteractiveComplexity: includeInteractiveComplexity.value && showInteractiveComplexityOption.value
  });
  await copyText(text);
};

const toggleRecent = async () => {
  showRecent.value = !showRecent.value;
  if (showRecent.value) await loadRecent();
};

const allRecentSelected = computed(() => {
  if (!recentDrafts.value.length) return false;
  return recentDrafts.value.every((d) => selectedDraftIds.value.includes(String(d.id)));
});

const toggleDraftSelection = (draftId) => {
  const id = String(draftId);
  if (selectedDraftIds.value.includes(id)) {
    selectedDraftIds.value = selectedDraftIds.value.filter((v) => v !== id);
  } else {
    selectedDraftIds.value = [...selectedDraftIds.value, id];
  }
};

const toggleSelectAllRecent = () => {
  if (allRecentSelected.value) {
    selectedDraftIds.value = [];
  } else {
    selectedDraftIds.value = recentDrafts.value.map((d) => String(d.id));
  }
};

const deleteSelectedDrafts = async () => {
  if (!currentAgencyId.value || deletingDrafts.value) return;
  if (!selectedDraftIds.value.length) return;
  if (!window.confirm(`Delete ${selectedDraftIds.value.length} draft(s)? This cannot be undone.`)) return;
  try {
    deletingDrafts.value = true;
    await api.post('/clinical-notes/drafts/delete', {
      agencyId: currentAgencyId.value,
      draftIds: selectedDraftIds.value.map((id) => parseInt(id, 10))
    }, { skipGlobalLoading: true });
    await loadRecent();
    selectedDraftIds.value = [];
  } catch (e) {
    recentError.value = e.response?.data?.error?.message || 'Failed to delete drafts';
  } finally {
    deletingDrafts.value = false;
  }
};

const deleteAllRecentDrafts = async () => {
  if (!recentDrafts.value.length) return;
  selectedDraftIds.value = recentDrafts.value.map((d) => String(d.id));
  await deleteSelectedDrafts();
};

const draftSections = (draftRow) => {
  try {
    const raw = draftRow?.output_json;
    if (!raw) return [];
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Object.entries(extractSections(obj));
  } catch {
    return [];
  }
};

onMounted(async () => {
  speechSupported.value = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  // Scrub any pre-fix PHI left in browser storage from older Note Aid builds.
  scrubLegacyWorkQueueSessionStash();
  const libraryUi = loadNoteLibraryUiPrefs(authStore.user?.id);
  libraryCollapsed.value = libraryUi.collapsed;
  libraryExpanded.value = libraryUi.expanded;
  await loadNoteAidWriterPrefs();

  if (String(route.query?.noteAidReset || '') === '1') {
    clearAllWorkQueues(authStore.user?.id);
    workQueueItems.value = [];
    activeWorkQueueItemId.value = null;
    draftId.value = null;
    recentDrafts.value = [];
    selectedDraftIds.value = [];
    const nextQuery = { ...route.query };
    delete nextQuery.noteAidReset;
    router.replace({ query: nextQuery }).catch(() => {});
  }

  const queryDos = toDateOfService(route.query?.dateOfService || route.query?.date_of_service);
  if (queryDos) dateOfService.value = queryDos;
  else if (!dateOfService.value) dateOfService.value = todayIsoDate();
  if (String(route.query?.new || '') === '1' || String(route.query?.newNote || '') === '1') {
    startNewNote();
  }

  // Direct entry (bookmark / quick nav): hourly workers not clocked in get offered a Log Time start.
  // Launchers (Tools & Aids / nav) already prompt; skipPrompt when already linked to a session.
  if (!isEmbedded.value && !fromIndirectSession.value) {
    const { fromIndirectSession: linked } = await ensureHourlySessionForNoteAid();
    if (linked) {
      const nextQuery = { ...route.query, fromIndirectSession: '1', launchIntent: 'note' };
      router.replace({ query: nextQuery }).catch(() => {});
    }
  }

  if (typeof window !== 'undefined' && window.innerWidth < 1180) {
    workQueueCollapsed.value = true;
  }

  if (canUseTool.value) {
    await bootstrapWorkspace();
    if (isEmbedded.value) {
      const qAgency = Number(props.embedAgencyId || 0) || null;
      if (qAgency) selectedQueueAgencyId.value = qAgency;
      if (props.embedClinicalNoteId) {
        await loadClinicalNoteIntoWorkspace(props.embedClinicalNoteId);
      } else if (props.embedDraftId) {
        const hit = recentDrafts.value.find((d) => String(d.id) === String(props.embedDraftId));
        if (hit) await loadDraftIntoWorkspace(hit);
      }
      noteWizardStep.value = 2;
    } else {
      const stashed = consumeNoteAidWorkQueueStash();
      if (stashed?.length) {
        workQueueItems.value = stashed.map(normalizeWorkQueueItemStatus);
        persistWorkQueue();
      } else {
        workQueueItems.value = loadWorkQueue(authStore.user?.id).map(normalizeWorkQueueItemStatus);
      }
      const qAgency = Number(route.query?.agencyId || route.query?.agency_id || 0) || null;
      if (qAgency) selectedQueueAgencyId.value = qAgency;
      const qDraft = String(route.query?.draftId || route.query?.draft_id || '').trim();
      const qNote = String(route.query?.clinicalNoteId || route.query?.clinical_note_id || '').trim();
      if (qNote) {
        await loadClinicalNoteIntoWorkspace(qNote);
      } else if (qDraft && recentDrafts.value.length) {
        const hit = recentDrafts.value.find((d) => String(d.id) === qDraft);
        if (hit) loadDraftIntoWorkspace(hit);
      }
    }
  }

  autosaveTimer = window.setInterval(() => {
    if (!isWorkspaceHydrating()) autosave();
  }, 30_000);
});

watch(sessionDurationMinutes, (mins) => {
  if (!showSessionContextStrip.value) return;
  const current = String(actualServiceCode.value || '').toUpperCase();
  // Crisis / extended encounter rules take priority over standard psychotherapy bands.
  if (current === '90839' || current === '90837' || current === '90832' || current === '90834') {
    applyBillingRulesForCurrentSession({ announce: true });
    return;
  }
  const suggested = suggestPsychotherapyCodeForDuration(mins);
  if (!suggested) return;
  if (!['90832', '90834', '90837'].includes(current) && current) return;
  if (current === suggested) {
    sessionCodeSwitchBanner.value = '';
    return;
  }
  selectedServiceCode.value = suggested;
  sessionCodeSwitchBanner.value =
    `Duration ${mins} min is outside ${current || 'prior'} band — switched service code to ${suggested}.`;
  applyBillingRulesForCurrentSession({ announce: true });
});

watch(actualServiceCode, (code, prev) => {
  if (!code || code === prev) return;
  if (isWorkspaceHydrating()) return;
  const upper = String(code).toUpperCase();
  const prevUpper = String(prev || '').toUpperCase();
  // Only reset participants when entering / switching family codes — not on every duration-driven 9083x change.
  if (['90846', '90847'].includes(upper) && upper !== prevUpper) {
    applyParticipantsDefaultForServiceCode(code);
  }
  if (sessionScheduledStart.value && sessionScheduledEnd.value) return;
  if (sessionDurationMinutes.value == null || sessionDurationMinutes.value === '') {
    applySessionTimingDefaults({ force: true });
  }
});

function setMseAllNormal() {
  const domains = {};
  for (const d of MSE_DOMAINS) domains[d] = { status: 'normal', detail: '' };
  chartMentalStatus.value = { allNormal: true, allNotAssessed: false, domains };
}

function setMseAllNotAssessed() {
  const domains = {};
  for (const d of MSE_DOMAINS) domains[d] = { status: 'not_assessed', detail: '' };
  chartMentalStatus.value = { allNormal: false, allNotAssessed: true, domains };
}

async function openAllPendingSessionNotes() {
  try {
    const { data } = await api.get('/tasks', {
      params: { view: 'assigned', taskType: 'session_note', status: 'pending', limit: 100 },
      skipGlobalLoading: true
    });
    const tasks = Array.isArray(data) ? data : (Array.isArray(data?.tasks) ? data.tasks : []);
    const pending = tasks.filter(
      (t) =>
        String(t.task_type || '').toLowerCase() === 'session_note'
        && t.status !== 'completed'
        && t.status !== 'overridden'
    );
    const items = pending.map((t) => taskToWorkQueueItem(t));
    if (!items.length) {
      approvalMessage.value = 'No pending Notes tasks.';
      return;
    }
    workQueueItems.value = items;
    persistWorkQueue();
    await activateWorkQueueItem(items[0]);
  } catch (e) {
    approvalError.value = e.response?.data?.error?.message || e.message || 'Could not load pending Notes.';
  }
}

watch([serviceCodeOptions, forceAutoSelect, canUseTool], () => {
  if (!canUseTool.value) return;
  applyBookingContextPrefill();
  applyTherapyContextPrefill();
});

watch(() => route.query, () => {
  if (String(route.query?.launchIntent || '') === 'work_queue') {
    bookingPrefillApplied.value = false;
    applyBookingContextPrefill();
    return;
  }
  bookingPrefillApplied.value = false;
  therapyPrefillApplied.value = false;
  recordSessionIntentHandled.value = false;
  if (!canUseTool.value) return;
  applyBookingContextPrefill();
  applyTherapyContextPrefill();
  const qAgency = Number(route.query?.agencyId || route.query?.agency_id || 0) || null;
  if (qAgency) selectedQueueAgencyId.value = qAgency;
  const qNote = String(route.query?.clinicalNoteId || route.query?.clinical_note_id || '').trim();
  const qDraft = String(route.query?.draftId || route.query?.draft_id || '').trim();
  if (qNote) {
    loadClinicalNoteIntoWorkspace(qNote);
  } else {
    if (viewingChartNote.value) viewingChartNote.value = null;
    if (qDraft) {
      const hit = recentDrafts.value.find((d) => String(d.id) === qDraft);
      if (hit) loadDraftIntoWorkspace(hit);
    }
  }
}, { deep: true });

watch([canUseTool, isRecordSessionIntent], ([enabled, recordIntent]) => {
  if (!enabled || !recordIntent || recordSessionIntentHandled.value) return;
  recordSessionIntentHandled.value = true;
  const q = { ...route.query };
  delete q.launchIntent;
  router.replace({
    path: orgTo('/admin/session-recording'),
    query: q
  }).catch(() => {});
});

watch(currentAgencyId, async (next, prev) => {
  // Ignore initial assignment and null flickers during agency store refresh.
  if (!next || prev == null) return;
  if (String(next) === String(prev)) return;
  // Keep the open note; only refresh the multi-tenant library for the new workspace context.
  await loadRecent();
});

watch(clinicalNoteGeneratorEnabled, async (enabled, wasEnabled) => {
  // Only bootstrap when flipping from off → on (not on every flags object refresh).
  if (!enabled || wasEnabled) return;
  if (!currentAgencyId.value) return;
  await bootstrapWorkspace();
});

watch(inputText, () => {
  if (isWorkspaceHydrating()) return;
  scheduleAutosave(1500);
});

watch(
  [effectiveClientId, noteAidAgencyId, () => clientAgencyMembershipIds.value.join(',')],
  ([cid]) => {
    if (cid) loadClientTreatmentPlan(cid);
  }
);

onBeforeUnmount(() => {
  bootstrapSeq += 1;
  if (autosaveTimer) {
    window.clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
  if (autosaveDebounceTimer) {
    clearTimeout(autosaveDebounceTimer);
    autosaveDebounceTimer = null;
  }
  stopSpeakVisualizer();
  stopTranscription();
  try {
    mediaRecorder?.stop?.();
  } catch {
    // ignore
  }
  try {
    mediaStream?.getTracks?.().forEach((t) => t.stop());
  } catch {
    // ignore
  }
});
</script>

<style scoped>
.na-app {
  --na-teal: #0f766e;
  --na-teal-dark: #0d5f59;
  --na-teal-soft: #ccfbf1;
  --na-canvas: #f1f5f9;
  --na-border: #e2e8f0;
  --na-text: #0f172a;
  --na-muted: #64748b;
  width: 100%;
  max-width: none;
  min-height: calc(100vh - 64px);
  height: calc(100vh - 64px);
  margin: 0;
  background: linear-gradient(180deg, #eef7f5 0%, var(--na-canvas) 28%, #f8fafc 100%);
  color: var(--na-text);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.na-app--embedded {
  min-height: 520px;
  height: min(78vh, 860px);
  border-radius: 12px;
  overflow: auto;
}

.na-delete-err {
  color: #b91c1c;
  font-size: 0.82rem;
  font-weight: 600;
}

.na-topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid var(--na-border);
  backdrop-filter: blur(8px);
  position: relative;
  z-index: 2;
}

.na-topbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  grid-column: 3;
}

.na-brand {
  grid-column: 1;
  justify-self: start;
  display: flex;
  align-items: center;
  gap: 10px;
}

.na-tagline {
  margin: 0;
  text-align: center;
  color: var(--na-muted);
  font-size: 0.95rem;
  grid-column: 2;
  justify-self: center;
}

.na-indirect-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding: 10px 20px;
  background: #ecfdf5;
  border-bottom: 1px solid #bbf7d0;
  color: #14532d;
  font-size: 0.88rem;
  line-height: 1.4;
}
.na-indirect-back {
  border: 1px solid #166534;
  background: #fff;
  color: #14532d;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  white-space: nowrap;
}
.na-indirect-back:hover { background: #f0fdf4; }

.na-brand-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--na-teal-soft);
  color: var(--na-teal);
}

.na-brand-title {
  font-weight: 800;
  font-size: 1.05rem;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.na-brand-sub {
  font-size: 0.78rem;
  color: var(--na-muted);
}

.na-tagline em {
  font-style: italic;
  color: var(--na-teal-dark);
}

.na-archive-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #99f6e4;
  background: #f0fdfa;
  color: #0f766e;
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 600;
  cursor: pointer;
}

.na-archive-btn:hover {
  border-color: var(--na-teal);
  color: var(--na-teal-dark);
  background: #ccfbf1;
}

.na-archive-btn--pulse {
  animation: na-panel-pulse 2.2s ease-in-out infinite;
  border-color: #2dd4bf;
  background: linear-gradient(180deg, #ccfbf1 0%, #f0fdfa 100%);
  box-shadow: 0 0 0 0 rgba(13, 148, 136, 0.35);
}

@keyframes na-panel-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(13, 148, 136, 0.28);
    transform: translateY(0);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(13, 148, 136, 0);
    transform: translateY(-1px);
  }
}

.na-shell {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr) minmax(240px, 300px);
  gap: 0;
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.na-shell--library-collapsed {
  grid-template-columns: 56px minmax(0, 1fr) minmax(240px, 300px);
}

.na-shell--library-expanded {
  grid-template-columns: minmax(0, 1fr);
}

.na-shell--queue-collapsed {
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr) 56px;
}

.na-shell--library-collapsed.na-shell--queue-collapsed {
  grid-template-columns: 56px minmax(0, 1fr) 56px;
}

.na-shell--note-focused.na-shell--library-collapsed.na-shell--queue-collapsed {
  grid-template-columns: 56px minmax(0, 1fr) 56px;
}

.na-main--start {
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.na-workspace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.na-workspace-close {
  border: none;
  background: transparent;
  color: var(--na-teal-dark);
  font-weight: 700;
  cursor: pointer;
  padding: 6px 0;
}

.na-workspace-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.na-finalized-badge {
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
}

.na-draft-badge {
  background: #ccfbf1;
  color: #0f766e;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
}

.na-autosave-hint {
  font-size: 0.8rem;
  color: var(--na-muted);
}

.na-aid-picker-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.na-ready-badge--signed {
  background: #dbeafe;
  color: #1e40af;
}

.na-wizard-step2 {
  grid-template-columns: minmax(0, 1fr);
}

.na-write-overview {
  display: none;
}

.na-shell--embedded {
  grid-template-columns: minmax(0, 1fr);
}

.na-shell--empty {
  grid-template-columns: 1fr;
  padding: 24px;
}

.na-empty-card {
  max-width: 520px;
  margin: 40px auto;
  background: white;
  border: 1px solid var(--na-border);
  border-radius: 14px;
  padding: 24px;
}

.na-sidebar {
  background: white;
  border-right: 1px solid var(--na-border);
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 16px 14px;
}

.na-new-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  border: none;
  border-radius: 12px;
  background: var(--na-teal);
  color: white;
  font-weight: 700;
  padding: 12px 14px;
  cursor: pointer;
}

.na-new-note:hover {
  background: var(--na-teal-dark);
}

.na-side-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin: 14px 0 10px;
  background: #f8fafc;
  border-radius: 10px;
  padding: 4px;
}

.na-side-tabs button,
.na-input-tabs button {
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 8px 10px;
  font-weight: 600;
  color: var(--na-muted);
  cursor: pointer;
}

.na-side-tabs button.active,
.na-input-tabs button.active {
  background: white;
  color: var(--na-teal-dark);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

.na-search {
  width: 100%;
  border: 1px solid var(--na-border);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 0.9rem;
}

.na-date-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.na-date-group-header {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 16px;
  gap: 10px;
  align-items: center;
  text-align: left;
  border: 1px solid var(--na-border);
  background: white;
  border-radius: 12px;
  padding: 8px 10px;
  cursor: pointer;
  color: inherit;
  width: 100%;
  font: inherit;
}

.na-date-group-header:hover,
.na-date-group-header.open {
  border-color: #99f6e4;
  background: #f0fdfa;
}

.na-date-group-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.na-date-group-meta strong {
  font-size: 0.88rem;
}

.na-date-group-meta span {
  color: var(--na-muted);
  font-size: 0.75rem;
}

.na-date-group-notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 0 4px 12px;
  border-left: 2px solid #ccfbf1;
  margin-left: 22px;
}

.na-draft-list {
  flex: 1;
  overflow: auto;
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.na-draft-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px;
  gap: 10px;
  align-items: center;
  text-align: left;
  border: 1px solid transparent;
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
  color: inherit;
  width: 100%;
  font: inherit;
}

.na-draft-row:hover,
.na-draft-row.selected {
  border-color: #99f6e4;
  background: #f0fdfa;
}

.na-draft-date {
  background: white;
  border: 1px solid var(--na-border);
  border-radius: 10px;
  text-align: center;
  padding: 6px 4px;
  line-height: 1.1;
}

.na-draft-month {
  display: block;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--na-teal);
}

.na-draft-day {
  display: block;
  font-size: 1rem;
  font-weight: 800;
}

.na-draft-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.85rem;
}

.na-draft-top span,
.na-draft-dos,
.na-draft-type {
  color: var(--na-muted);
  font-size: 0.78rem;
}

.na-draft-type {
  font-weight: 600;
  color: #334155;
  margin-top: 2px;
}

.na-draft-chevron {
  color: #94a3b8;
  font-size: 1.2rem;
  transition: transform 0.15s ease;
}

.na-draft-chevron.open {
  transform: rotate(90deg);
}

.na-side-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-top: 12px;
  margin-top: 8px;
  border-top: 1px solid var(--na-border);
  font-size: 0.78rem;
  color: var(--na-muted);
}

.na-side-muted,
.na-side-error {
  font-size: 0.85rem;
  padding: 12px 4px;
}

.na-side-error,
.error {
  color: #b91c1c;
}

.na-side-error {
  font-size: 0.8rem;
  line-height: 1.35;
}

.na-main {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  padding: 18px 28px 40px;
  width: 100%;
  max-width: none;
}
.na-main--library {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.na-main--library :deep(.nal) {
  flex: 1;
  min-height: 0;
  height: auto;
}

.na-privacy {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 0.88rem;
  margin-bottom: 12px;
}

.na-context-strip {
  background: white;
  border: 1px solid var(--na-border);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  font-size: 0.86rem;
}

.na-context-strip--soft {
  color: var(--na-muted);
}

.na-context-strip--warn {
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 10px;
}

.na-aid-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  background: #fff;
  border: 1px solid var(--na-border);
  border-radius: 14px;
  padding: 14px 16px;
  margin-top: 4px;
}
.na-aid-kicker {
  display: block;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--na-teal-dark, #0f766e);
  margin-bottom: 2px;
}
.na-aid-bar-copy strong {
  font-size: 1.02rem;
  color: #0f172a;
}
.na-aid-bar-copy p {
  margin: 6px 0 0;
  font-size: 0.86rem;
  color: var(--na-muted);
  line-height: 1.4;
}
.na-aid-bar-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
  flex-shrink: 0;
}

.na-pathway-toggle {
  display: inline-flex;
  gap: 4px;
  margin-top: 10px;
  padding: 3px;
  background: #f1f5f9;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
}
.na-pathway-btn {
  border: none;
  background: transparent;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
}
.na-pathway-btn.on {
  background: #fff;
  color: #1d4ed8;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.na-skip-ai {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}
.na-skip-ai input {
  margin: 0;
}
.na-tenant-choice {
  margin: 10px 0 0;
  padding: 12px 14px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  border-radius: 12px;
  font-size: 0.9rem;
  color: #78350f;
}
.na-tenant-choice label {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.na-tenant-hint {
  margin: 8px 0 0;
  font-size: 0.82rem;
}
.na-change-aid {
  flex-shrink: 0;
  border: 1px solid var(--na-border);
  background: #f8fafc;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  color: #334155;
}
.na-change-aid:hover {
  background: #eef2ff;
}

.na-config {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 10px 0;
}

.na-wizard-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 0 12px;
}
.na-wizard-title {
  margin: 0 0 6px;
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
}
.na-wizard-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.na-wizard-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #0f766e;
  font-size: 0.75rem;
  font-weight: 600;
}
.na-wizard-tag--muted {
  background: #f1f5f9;
  color: #64748b;
}
.na-wizard-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.na-wizard-steps {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  padding: 0;
}
.na-wizard-step {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: #94a3b8;
  cursor: pointer;
}
.na-wizard-step.active {
  color: #0f766e;
}
.na-wizard-step.done {
  color: #334155;
}
.na-wizard-step:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.na-wizard-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 2px solid #cbd5e1;
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
}
.na-wizard-step.active .na-wizard-step-num {
  border-color: #0d9488;
  background: #0d9488;
  color: #fff;
}
.na-wizard-step.done .na-wizard-step-num {
  border-color: #0d9488;
  color: #0d9488;
}
.na-wizard-steps-line {
  flex: 0 0 36px;
  height: 2px;
  background: #e2e8f0;
}
.na-step1-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
  gap: 14px;
  align-items: start;
}
.na-step1-main,
.na-step1-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.na-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
}
.na-card--tight {
  padding: 12px 14px;
}
.na-card--cta {
  background: linear-gradient(180deg, #f0fdfa 0%, #fff 100%);
  border-color: #99f6e4;
}
.na-card-title {
  margin: 0 0 10px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}
.na-card-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.na-card-head-row .na-card-title {
  margin-bottom: 0;
}
.na-card-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.na-checklist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.na-checklist li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.86rem;
  color: #334155;
}
.na-checklist-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.na-checklist-item:disabled {
  cursor: default;
}
.na-checklist em {
  font-style: normal;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
}
.na-checklist em.ok {
  background: #ccfbf1;
  color: #0f766e;
}
.na-checklist em.warn {
  background: #ffedd5;
  color: #c2410c;
}
.na-checklist em.miss {
  background: #fee2e2;
  color: #b91c1c;
}
.na-snapshot-name {
  margin: 0 0 8px;
  font-size: 1rem;
  font-weight: 700;
  color: #0f766e;
}
.na-snapshot-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.na-snapshot-dl > div {
  display: grid;
  gap: 2px;
}
.na-snapshot-dl dt {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #94a3b8;
}
.na-snapshot-dl dd {
  margin: 0;
  font-size: 0.88rem;
  color: #1e293b;
}
.na-phi-banner--compact {
  margin: 0;
}
.na-wizard-step2 {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.na-write-overview {
  display: none !important;
}
.na-write-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 960px) {
  .na-step1-grid,
  .na-wizard-step2 {
    grid-template-columns: 1fr;
  }
}

.na-pick-aid-banner {
  margin: 0 0 12px;
  padding: 12px 14px;
  background: #ecfdf5;
  border: 1px solid #6ee7b7;
  border-radius: 12px;
  color: #065f46;
  font-size: 0.9rem;
}
.na-pick-aid-banner strong {
  display: block;
  margin-bottom: 4px;
}
.na-pick-aid-banner p {
  margin: 0;
  color: #047857;
  line-height: 1.45;
}

.na-library-client-bar {
  margin-bottom: 16px;
}

.na-renew-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 14px;
  padding: 10px 14px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 12px;
  color: #92400e;
  font-size: 0.9rem;
  font-weight: 600;
}

.na-dx-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
  margin: 0 0 14px;
  padding: 10px 14px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 12px;
  color: #065f46;
  font-size: 0.88rem;
}
.na-dx-banner--warn {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #9a3412;
}
.na-dx-banner .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
}
.na-dx-just {
  flex-basis: 100%;
  margin: 4px 0 0;
  white-space: pre-wrap;
  font-size: 0.8rem;
  color: #047857;
  font-weight: 500;
}

.na-config--summary {
  grid-template-columns: 1fr;
}

.na-config-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: white;
  border: 1px solid var(--na-border);
  border-radius: 10px;
  padding: 8px 12px;
}

.na-config-summary-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  min-width: 0;
}

.na-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--na-text);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.na-chip em {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--na-teal-soft);
  color: var(--na-teal-dark);
  font-style: normal;
  font-size: 0.7rem;
  font-weight: 800;
  flex-shrink: 0;
}

a.na-chip--link {
  color: var(--na-teal-dark);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.na-step {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 8px;
  background: white;
  border: 1px solid var(--na-border);
  border-radius: 10px;
  padding: 8px 10px;
}

.na-step-num {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--na-teal-soft);
  color: var(--na-teal-dark);
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.75rem;
  margin-top: 2px;
}

.na-step-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.na-step-head-row .na-label {
  margin-bottom: 0;
}

.na-label {
  display: block;
  font-weight: 700;
  font-size: 0.8rem;
  margin-bottom: 4px;
}

.na-options-block {
  margin-top: 6px;
}

.na-field-hint {
  display: block;
  font-size: 0.75rem;
  color: var(--na-muted);
  margin-bottom: 4px;
}

.na-initials-match {
  margin: 8px 0;
  padding: 10px;
  border: 1px solid #99f6e4;
  border-radius: 10px;
  background: #f0fdfa;
}
.na-initials-match-btn {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid #ccfbf1;
  background: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  margin: 6px 0;
  cursor: pointer;
  font: inherit;
}
.na-initials-match-btn:hover { border-color: #14b8a6; }
.na-initials-match-btn em {
  font-style: normal;
  color: #0f766e;
  font-weight: 600;
}
.na-initials-match-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.na-input,
.na-textarea {
  width: 100%;
  border: 1px solid var(--na-border);
  border-radius: 8px;
  padding: 7px 10px;
  font: inherit;
  background: white;
  color: var(--na-text);
}

.na-textarea {
  resize: vertical;
  min-height: 140px;
  line-height: 1.45;
}

.na-textarea--compact {
  min-height: 64px;
}

.na-revision-field {
  margin: 12px 0;
}

.na-revision-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.na-sign-attest {
  margin: 12px 0 8px;
  padding: 12px 14px;
  border: 1px solid #99f6e4;
  border-radius: 12px;
  background: #f0fdfa;
}

.na-sign-attest-lead {
  margin: 0 0 8px;
  font-size: 0.82rem;
  color: #0f766e;
  font-weight: 600;
}

.na-sign-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.85rem;
  color: #134e4a;
  margin: 6px 0;
}

.na-sign-check input {
  margin-top: 3px;
}

.na-sign-attest-warn {
  margin: 8px 0 4px;
  font-size: 0.82rem;
  color: #b45309;
  line-height: 1.4;
}

.na-sign-check--override {
  color: #0f766e;
  font-weight: 600;
}

.na-revision-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--na-text);
  margin-bottom: 6px;
  line-height: 1.35;
}

.na-speak-tools {
  margin-top: 10px;
}

.na-speak-stage {
  position: relative;
  min-height: 168px;
  border-radius: 14px;
  border: 1px solid #99f6e4;
  background: linear-gradient(165deg, #f0fdfa 0%, #ecfeff 45%, #ffffff 100%);
  overflow: hidden;
  margin-bottom: 10px;
}

.na-speak-stage--live {
  border-color: #2dd4bf;
  box-shadow: 0 0 0 1px rgba(15, 118, 110, 0.08), 0 10px 24px rgba(15, 118, 110, 0.12);
}

.na-speak-stage--captured {
  border-color: #5eead4;
}

.na-speak-viz {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  opacity: 0.9;
}

.na-speak-stage-overlay {
  position: relative;
  z-index: 1;
  min-height: 168px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px 16px 14px;
  text-align: center;
}

.na-speak-live-head,
.na-speak-captured-head {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(15, 118, 110, 0.18);
  color: #0f766e;
  font-size: 0.88rem;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(15, 118, 110, 0.08);
}

.na-speak-idle-hint-only {
  font-size: 0.88rem;
  font-weight: 600;
  color: #475569;
  max-width: 320px;
  line-height: 1.45;
}

.na-speak-idle-hint-only strong {
  color: #0f766e;
  font-weight: 700;
}

.na-speak-stage--live .na-speak-live-head {
  border-color: rgba(185, 28, 28, 0.25);
  color: #991b1b;
}

.na-speak-rec-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #dc2626;
  box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.45);
  animation: na-speak-pulse 1.4s ease-out infinite;
}

@keyframes na-speak-pulse {
  0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.45); }
  70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
  100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
}

.na-speak-timer {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.na-speak-live-label {
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
}

.na-speak-mic-icon {
  display: inline-flex;
  color: #0f766e;
}

.na-speak-captured-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ccfbf1;
  color: #0f766e;
  font-size: 0.78rem;
  font-weight: 800;
}

.na-speak-live-transcript {
  margin: 4px 0 0;
  max-width: 92%;
  font-size: 0.84rem;
  line-height: 1.45;
  color: #134e4a;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(15, 118, 110, 0.14);
  border-radius: 10px;
  padding: 8px 12px;
}

.na-speak-idle-hint {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
}

.na-textarea--speak-transcript {
  min-height: 120px;
}

.na-speak-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}

.na-speak-btn {
  border: 1.5px solid var(--na-teal);
  background: #fff;
  color: var(--na-teal-dark);
  border-radius: 999px;
  padding: 8px 14px;
  font: inherit;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
  line-height: 1.2;
}

.na-speak-btn:hover:not(:disabled) {
  background: var(--na-teal-soft);
}

.na-speak-btn--recording {
  background: #b91c1c;
  border-color: #b91c1c;
  color: #fff;
}

.na-speak-btn--recording:hover:not(:disabled) {
  background: #991b1b;
}

.na-speak-btn--idle-pulse {
  animation: na-speak-record-idle-pulse 1.8s ease-in-out infinite;
}

@keyframes na-speak-record-idle-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(15, 118, 110, 0.35);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(15, 118, 110, 0);
  }
}

.na-speak-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  color: #334155;
  border-color: #94a3b8;
  background: #f8fafc;
}

.na-date-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.na-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
}

.na-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-weight: 600;
  font-size: 0.85rem;
}

.na-toggle-row--inline {
  justify-content: flex-start;
  margin: 0;
  white-space: nowrap;
}

.na-phi-banner {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #99f6e4;
  background: #f0fdfa;
  font-size: 0.82rem;
  color: #115e59;
}
.na-phi-banner strong {
  display: block;
  margin-bottom: 4px;
  color: #0f766e;
}
.na-phi-banner p {
  margin: 0;
  line-height: 1.4;
}
.na-phi-roles {
  margin: 8px 0 0;
  padding-left: 18px;
  color: #0f766e;
}
.na-phi-warn {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.84rem;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.na-switch {
  position: relative;
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: #cbd5e1;
  display: inline-flex;
  align-items: center;
  padding: 3px;
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.na-switch.on {
  background: var(--na-teal);
}

.na-switch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.na-switch-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  transform: translateX(0);
  transition: transform 0.15s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

.na-switch.on .na-switch-thumb {
  transform: translateX(18px);
}

.na-input-panel,
.na-output {
  background: white;
  border: 1px solid var(--na-border);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
}

.na-input-tabs {
  display: inline-flex;
  gap: 4px;
  background: #f8fafc;
  border-radius: 10px;
  padding: 4px;
  margin-bottom: 10px;
}

.na-input-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.na-input-footer .na-char-count {
  margin-right: auto;
}

.na-char-count {
  color: var(--na-muted);
  font-size: 0.85rem;
}

.na-generate-hint {
  display: block;
  margin-top: 6px;
  color: #64748b;
  font-size: 0.82rem;
}

.na-generate,
.na-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 12px;
  background: var(--na-teal);
  color: white;
  font-weight: 700;
  padding: 11px 16px;
  cursor: pointer;
}

.na-generate:disabled,
.na-btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.na-generate:hover:not(:disabled),
.na-btn-primary:hover:not(:disabled) {
  background: var(--na-teal-dark);
}

.na-btn-outline {
  border: 1px solid var(--na-teal);
  background: white;
  color: var(--na-teal-dark);
  border-radius: 12px;
  font-weight: 700;
  padding: 11px 16px;
  cursor: pointer;
}

.na-btn-outline:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.na-link-btn {
  border: none;
  background: transparent;
  color: var(--na-teal-dark);
  font-weight: 600;
  cursor: pointer;
  padding: 8px 4px;
  flex-shrink: 0;
}

.na-link-btn--sm {
  padding: 2px 4px;
  font-size: 0.78rem;
}

.na-link-btn--danger {
  color: #b91c1c;
}

.na-field-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 6px;
}

.na-link-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.na-fab-wrap {
  position: fixed;
  right: 20px;
  bottom: 24px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}

.na-fab-wrap > * {
  pointer-events: auto;
}

.na-fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: var(--na-teal);
  color: #fff;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(15, 118, 110, 0.35);
  display: grid;
  place-items: center;
}

.na-fab:hover {
  background: var(--na-teal-dark);
}

.na-fab-menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 260px;
  max-width: min(340px, calc(100vw - 40px));
  padding: 8px;
  background: #fff;
  border: 1px solid var(--na-border);
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
}

.na-fab-menu button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  border: none;
  background: #f8fafc;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  font: inherit;
  color: var(--na-text);
}

.na-fab-menu button:hover {
  background: var(--na-teal-soft);
}

.na-fab-menu strong {
  font-size: 0.9rem;
  color: var(--na-teal-dark);
}

.na-fab-menu span {
  font-size: 0.75rem;
  color: var(--na-muted);
  line-height: 1.35;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.na-output-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.na-output-head h2,
.na-output--empty h2 {
  margin: 0 0 6px;
  font-size: 1.15rem;
}

.na-ready-badge {
  display: inline-block;
  background: var(--na-teal-soft);
  color: var(--na-teal-dark);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.75rem;
  font-weight: 700;
}

.na-output-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  margin: 12px 0 8px;
  color: var(--na-muted);
  font-size: 0.88rem;
}

.na-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.na-tag {
  background: #f1f5f9;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 700;
}

.na-tag--accent {
  background: var(--na-teal-soft);
  color: var(--na-teal-dark);
}

.na-soap-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.na-soap-card {
  border: 1px solid var(--na-border);
  border-radius: 12px;
  overflow: hidden;
}

.na-soap-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: #f8fafc;
}

.na-soap-title-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

.na-soap-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.na-soap-letter {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--na-teal);
  color: white;
  font-size: 0.75rem;
}

.na-soap-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.na-mini-btn {
  border: 1px solid var(--na-border);
  background: white;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.na-chevron {
  color: #94a3b8;
  transition: transform 0.15s ease;
}

.na-chevron.open {
  transform: rotate(180deg);
}

.na-soap-body {
  padding: 12px 14px 14px;
  border-top: 1px solid var(--na-border);
}

.na-soap-body pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  line-height: 1.5;
}

.na-output-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 8px;
}

.na-feedback {
  margin-top: 8px;
  min-height: 1.2em;
}

.na-next-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--na-border);
}

.na-next-nav-btn {
  font-weight: 700;
}

.na-subject-edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
}

.na-label--compact {
  margin: 0;
  font-size: 0.82rem;
}

.na-subject-save,
.na-subject-save-row {
  align-self: flex-start;
}

.na-subject-save-row {
  margin-top: 10px;
}

.na-snapshot-dl--compact {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--na-border);
}

.na-gen-summary {
  margin: 10px 0 0;
  color: var(--na-muted);
  font-size: 0.8rem;
}

.na-output--empty {
  color: var(--na-muted);
}

.na-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.consent-box {
  margin: 10px 0;
  padding: 10px 12px;
  border: 1px solid var(--na-border);
  border-radius: 10px;
  background: #f8fafc;
}

.consent-step {
  margin-top: 10px;
}

.consent-followup {
  margin-top: 8px;
  padding: 10px;
  border: 1px dashed var(--na-border);
  border-radius: 10px;
  background: white;
}

.purpose-toggle {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

.purpose-btn {
  border: 1px solid var(--na-border);
  background: white;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
  font-weight: 600;
}

.purpose-btn.active {
  border-color: var(--na-teal);
  background: var(--na-teal-soft);
  color: var(--na-teal-dark);
}

.hint {
  color: var(--na-muted);
  display: block;
  margin-top: 6px;
}

.btn {
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--na-border);
  background: white;
  color: var(--na-text);
}

.btn-primary,
.recording-now-btn {
  background: var(--na-teal);
  border-color: var(--na-teal);
  color: white;
}

.btn-secondary {
  background: white;
  color: var(--na-text);
  border-color: #94a3b8;
}

.btn-sm {
  padding: 6px 10px;
  font-size: 0.85rem;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.record-session-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 40;
  padding: 16px;
}

.record-session-modal {
  width: min(480px, 100%);
  background: white;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}

.recording-now-cta {
  width: 100%;
  padding: 14px;
  font-size: 1rem;
}

@media (max-width: 1200px) {
  .na-config {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1180px) {
  .na-shell:not(.na-shell--embedded):not(.na-shell--library-expanded) {
    grid-template-columns: 56px minmax(0, 1fr) 56px;
  }
  .na-shell:not(.na-shell--queue-collapsed):not(.na-shell--embedded):not(.na-shell--library-expanded) {
    grid-template-columns: 56px minmax(0, 1fr) minmax(200px, 240px);
  }
  .na-shell--queue-collapsed:not(.na-shell--embedded):not(.na-shell--library-expanded) {
    grid-template-columns: 56px minmax(0, 1fr) 56px;
  }
}

@media (max-width: 640px) {
  .na-topbar {
    grid-template-columns: 1fr;
    text-align: left;
  }
  .na-tagline {
    text-align: left;
  }
  .na-shell,
  .na-shell--library-collapsed {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: auto;
  }
  .na-shell--library-expanded {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr);
  }
  .na-main {
    min-height: 50vh;
    padding: 14px 16px 32px;
  }
  .na-config,
  .na-date-grid {
    grid-template-columns: 1fr;
  }
}
</style>

