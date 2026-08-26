<template>
  <div class="na-app">
    <header class="na-topbar">
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
          <div class="na-brand-sub">Clinical Note Assistant</div>
        </div>
      </div>
      <p class="na-tagline">Spend less time on notes. <em>More time with your clients.</em></p>
      <button type="button" class="na-archive-btn" @click="focusArchivedShelf">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7h18v13H3zM3 7l2-3h14l2 3" />
        </svg>
        Archive
      </button>
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
        'na-shell--library-expanded': libraryExpanded && !libraryCollapsed
      }"
    >
      <ClinicalNoteLibrarySidebar
        title="Note Library"
        :drafts="recentDrafts"
        :work-queue-items="workQueueItems"
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
        :class="{ 'na-main--library': showLibraryPanel }"
      >
        <div class="na-privacy">
          <strong>Privacy notice:</strong>
          Drafts are auto-archived after 7 days and retained up to 7 years. Copy into your EHR when needed.
        </div>

        <div v-if="therapyContext" class="na-context-strip">
          <strong>Therapy Notes context</strong>
          <span v-if="therapyContext.therapySummary">{{ therapyContext.therapySummary }}</span>
          <span v-if="therapyContext.therapyCalendarLabel"> · {{ therapyContext.therapyCalendarLabel }}</span>
        </div>

        <div v-if="viewingChartNote" class="na-context-strip" :class="viewingChartNote.standalone ? 'na-context-strip--warn' : 'na-context-strip--soft'">
          <strong>{{ viewingChartNote.standalone ? 'Standalone note' : 'Chart note' }}</strong>
          <span v-if="viewingChartNote.standalone">
            — copy sections for Therapy Notes. Not linked to a scheduled session or claim.
          </span>
          <span v-else> — opened from the clinical chart (read-only copy).</span>
          <span v-if="viewingChartNote.title"> · {{ viewingChartNote.title }}</span>
        </div>

        <div class="na-context-strip na-context-strip--soft">
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
        </div>

        <NoteAidLibraryPanel
          v-if="showLibraryPanel"
          :categories="libraryCategories"
          :user-id="libraryUserId"
          @select="onLibrarySelect"
        >
          <template #before>
            <div class="na-library-client-bar">
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
              <NoteAidClientContextPanel
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
                @import-plan="showPlanImportReview = true"
                @import-intake="showIntakeImportReview = true"
                @import-demographics="showDemographicsImport = true"
              />
            </div>
          </template>
        </NoteAidLibraryPanel>

        <template v-else>
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
                :class="{ on: notePathway === 'soap' }"
                @click="notePathway = 'soap'"
              >
                SOAP / freeform
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
          </div>
          <div class="na-aid-bar-actions">
            <button type="button" class="na-change-aid" @click="openAllPendingSessionNotes">
              Open all pending
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
          Note tenant: {{ agencyLookup[noteAidAgencyId] || selectedClient.agency_name || `Tenant #${noteAidAgencyId}` }}
        </p>

        <header class="na-wizard-head">
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

        <nav class="na-wizard-steps" aria-label="Note creation steps">
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
        <div v-if="noteWizardStep === 1" class="na-wizard-step1">
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
                <label v-if="!selectedClientId" class="na-label" for="na-initials">Client Initials</label>
                <input
                  v-if="!selectedClientId"
                  id="na-initials"
                  ref="initialsInputEl"
                  v-model="initials"
                  type="text"
                  class="na-input"
                  maxlength="16"
                  placeholder="e.g., A.M."
                />
                <p v-else class="na-field-hint">Client linked — initials come from the chart client, not manual entry.</p>
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
                  @import-plan="showPlanImportReview = true"
                  @import-intake="showIntakeImportReview = true"
                  @import-demographics="showDemographicsImport = true"
                />
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
                    <span>Diagnosis available</span>
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
                <p class="na-snapshot-name">{{ clientDisplayName(selectedClient) || initials || '—' }}</p>
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
        <div v-else class="na-wizard-step2">
          <aside class="na-write-overview">
            <div class="na-card na-card--tight">
              <div class="na-card-head-row">
                <h3 class="na-card-title">Session overview</h3>
                <button type="button" class="na-link-btn na-link-btn--sm" @click="noteWizardStep = 1">Edit</button>
              </div>
              <dl class="na-snapshot-dl">
                <div><dt>Client</dt><dd>{{ clientDisplayName(selectedClient) || initials || '—' }}</dd></div>
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
          v-if="showObjectiveRatings && notePathway !== 'csNoteBuild'"
          :goals="activeTreatmentGoals"
          :disabled="generating"
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

        <section v-if="!useCsNoteBuildPathway" class="na-input-panel">
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
            :placeholder="selectedAidGuidance || 'Paste or type your session details here…'"
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
              title="Document interactive complexity factors when clinically supported"
            >
              <span>Interactive Complexity</span>
              <span class="na-switch" :class="{ on: includeInteractiveComplexity }">
                <input v-model="includeInteractiveComplexity" type="checkbox" />
                <span class="na-switch-thumb" />
              </span>
            </label>
            <button class="na-generate" type="button" :disabled="generateDisabled" @click="generateNote">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M12 2l1.2 6.3L19 12l-5.8 3.7L12 22l-1.2-6.3L5 12l5.8-3.7L12 2z"/>
              </svg>
              {{ generating ? 'Generating…' : 'Generate Note' }}
            </button>
          </div>
          <small v-if="generateError" class="error">{{ generateError }}</small>
        </section>

        <section v-else class="na-input-panel na-input-panel--cs">
          <div class="na-input-footer">
            <span class="na-char-count">CSNoteBuild pathway</span>
            <label
              v-if="showInteractiveComplexityOption"
              class="na-toggle-row na-toggle-row--inline"
            >
              <span>Interactive Complexity</span>
              <span class="na-switch" :class="{ on: includeInteractiveComplexity }">
                <input v-model="includeInteractiveComplexity" type="checkbox" />
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
          </div>
        </div>

        <!-- Keep output after either step when present (visible on write step) -->
        <template v-if="noteWizardStep === 2">

        <section v-if="displayPanels.length" class="na-output">
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
          </div>

          <NoteAidStructuredChartPanel
            v-if="showStructuredChartPanel && !chartNoteReadOnly"
            :diagnoses="chartDiagnoses"
            v-model:diagnostic-justification="chartDiagnosticJustification"
            v-model:mse="chartMentalStatus"
            v-model:risk="chartRiskAssessment"
            v-model:medications="chartMedications"
            :skip-mse="skipMentalStatusExam"
            @mse-all-normal="setMseAllNormal"
            @mse-all-not-assessed="setMseAllNotAssessed"
          />

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
              @click="approveNoteOutput"
            >
              {{ approvingNote
                ? 'Signing…'
                : (activeWorkQueueItemId ? 'Confirm accuracy & sign' : 'Approve to clinical record') }}
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
              :disabled="generating || !String(inputText || '').trim()"
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
      </main>

      <NoteAidWorkQueuePanel
        v-if="canUseTool && !(libraryExpanded && !libraryCollapsed)"
        :items="workQueueItems"
        :active-id="activeWorkQueueItemId"
        @add-todo="showTodoImportModal = true"
        @generate="generateNote"
        @next="advanceWorkQueue"
        @clear="clearWorkQueue"
        @select="activateWorkQueueItem"
      />
    </div>

    <div
      v-if="canUseTool && !showLibraryPanel"
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
      @close="showClientSetupDrawer = false"
      @skip="showClientSetupDrawer = false"
      @import-plan="showClientSetupDrawer = false; showPlanImportReview = true"
      @import-intake="showClientSetupDrawer = false; showIntakeImportReview = true"
      @import-demographics="showClientSetupDrawer = false; showDemographicsImport = true"
    />
    <NoteAidTreatmentPlanImportReview
      v-if="effectiveClientId && noteAidAgencyId"
      :open="showPlanImportReview"
      :agency-id="noteAidAgencyId"
      :client-id="effectiveClientId"
      :initial-text="pastedPlanText"
      @close="showPlanImportReview = false"
      @saved="onPlanImportSaved"
    />
    <NoteAidIntakeImportReview
      v-if="effectiveClientId"
      :open="showIntakeImportReview"
      :client-id="effectiveClientId"
      :initial-text="pastedIntakeText || intakeSummary"
      @close="showIntakeImportReview = false"
      @finalized="onIntakeImportFinalized"
    />
    <NoteAidDemographicsImportReview
      v-if="effectiveClientId"
      :open="showDemographicsImport"
      :client-id="effectiveClientId"
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

  </div>
</template>

<script setup>
import NoteAidClientPicker from '../../components/clinical/NoteAidClientPicker.vue';
import NoteAidObjectiveRatings from '../../components/clinical/NoteAidObjectiveRatings.vue';
import NoteAidClientContextPanel from '../../components/clinical/NoteAidClientContextPanel.vue';
import NoteAidCsNoteBuildPanel from '../../components/clinical/NoteAidCsNoteBuildPanel.vue';
import NoteAidCreateClientModal from '../../components/clinical/NoteAidCreateClientModal.vue';
import NoteAidClientSetupDrawer from '../../components/clinical/NoteAidClientSetupDrawer.vue';
import NoteAidDocumentationQueue from '../../components/clinical/NoteAidDocumentationQueue.vue';
import NoteAidTreatmentPlanImportReview from '../../components/clinical/NoteAidTreatmentPlanImportReview.vue';
import NoteAidIntakeImportReview from '../../components/clinical/NoteAidIntakeImportReview.vue';
import NoteAidDemographicsImportReview from '../../components/clinical/NoteAidDemographicsImportReview.vue';
import NoteAidWorkQueuePanel from '../../components/clinical/NoteAidWorkQueuePanel.vue';
import NoteAidTodoListImportModal from '../../components/clinical/NoteAidTodoListImportModal.vue';
import NoteAidSessionContextStrip from '../../components/clinical/NoteAidSessionContextStrip.vue';
import NoteAidStructuredChartPanel from '../../components/clinical/NoteAidStructuredChartPanel.vue';
import { loadWorkQueue, saveWorkQueue } from '../../utils/noteAidWorkQueue.js';
import {
  DOC_STATUS,
  deriveWorkQueueDocStatus
} from '../../utils/noteAidDocumentationStatus.js';
import {
  consumeNoteAidWorkQueueStash,
  suggestPsychotherapyCodeForDuration,
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
  aidAllowsInteractiveComplexity,
  aidKind,
  findNoteAidById,
  findNoteAidByToolOrCode,
  orderNoteAidCategoriesForHcbs
} from '../../config/noteAidWorkspace.js';
import { rememberRecentAid, loadNoteLibraryUiPrefs, saveNoteLibraryUiPrefs } from '../../utils/noteAidLibraryPrefs.js';
import { isClinicalChartEnabled, parseAgencyFeatureFlags } from '../../config/medicalBillingAccess.js';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import ClinicalArtifactRetentionPanel from '../../components/clinical/ClinicalArtifactRetentionPanel.vue';
import NoteAidLibraryPanel from '../../components/clinical/NoteAidLibraryPanel.vue';
import ClinicalNoteLibrarySidebar from '../../components/clinical/ClinicalNoteLibrarySidebar.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

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
    (bookingContext.value?.clientId || sessionOfficeEventId.value || effectiveClientId.value)
    && (
      bookingContext.value?.officeEventId
      || bookingContext.value?.clinicalSessionId
      || sessionOfficeEventId.value
      || sessionClinicalSessionId.value
    )
  )
);
const retentionClientId = computed(
  () => Number(selectedClientId.value || bookingContext.value?.clientId || 0) || null
);
const effectiveClientId = computed(
  () => Number(selectedClientId.value || bookingContext.value?.clientId || 0) || null
);
const activeTreatmentGoals = computed(() => activePlanGoals(latestTreatmentPlan.value));
const primaryChartDiagnosis = computed(() => {
  const list = chartDiagnoses.value || [];
  const primary = list.find((d) => d && Number(d.is_primary) === 1 && (d.is_active == null || Number(d.is_active) === 1));
  if (primary) return primary;
  return list.find((d) => d && (d.is_active == null || Number(d.is_active) === 1)) || null;
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
  if (c.demographics_phi_enc || c.demographicsPhiEnc) return true;
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
  if (intakeImportedOnce.value) return true;
  if (primaryChartDiagnosis.value) return true;
  const s = String(intakeSummary.value || '');
  return /intake narrative/i.test(s) && s.length > 80;
});

const planOnFile = computed(
  () => planImportedOnce.value || (activeTreatmentGoals.value || []).length > 0
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
const showDemographicsImport = ref(false);
const showTodoImportModal = ref(false);
const workQueueItems = ref([]);
const sessionOfficeEventId = ref(null);
const sessionClinicalSessionId = ref(null);
const sessionDurationMinutes = ref(null);
const sessionLocationLabel = ref('');
const sessionParticipants = ref('Client Only');
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
const agencyLookup = computed(() => {
  const map = {};
  for (const a of agencyStore.userAgencies || []) {
    const id = Number(a?.id || 0);
    if (id) map[id] = a.name || a.organization_name || `Tenant #${id}`;
  }
  return map;
});
const isProgressAid = computed(() => aidKind(selectedAid.value) === 'progress');

const csNoteBuildAgencyEnabled = computed(() => {
  const flags = parseFeatureFlags(agencyStore.currentAgency?.feature_flags || agencyStore.currentAgency?.featureFlags);
  return isTruthyFlag(flags.csNoteBuildEnabled);
});

const showCsNoteBuildPathway = computed(() => {
  if (!isProgressAid.value) return false;
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'super_admin' || csNoteBuildAgencyEnabled.value;
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
    goalIds
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
const skipMentalStatusExam = computed(() => {
  const code = String(actualServiceCode.value || '').toUpperCase();
  return code === 'H0004';
});
const showStructuredChartPanel = computed(
  () => !!(showSessionContextStrip.value || canApproveToClinicalRecord.value)
);
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
const sessionParticipantsFlag = computed(() => {
  if (sessionParticipants.value !== 'Client Only') return false;
  const blob = [
    inputText.value,
    revisionInstruction.value,
    JSON.stringify(outputObj.value || {})
  ].join('\n');
  return participantsLikelyIncludeOthers(blob);
});
const canConfirmAndSign = computed(() => {
  if (sessionParticipantsFlag.value) return false;
  if (!skipMentalStatusExam.value) {
    const domains = chartMentalStatus.value?.domains || {};
    const hasAny = Object.keys(domains).length > 0;
    if (!hasAny && !chartMentalStatus.value?.allNormal && !chartMentalStatus.value?.allNotAssessed) {
      return false;
    }
  }
  return true;
});
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
const canClearLinkedClient = computed(() => {
  if (sessionOfficeEventId.value) return false;
  if (bookingContext.value?.officeEventId || bookingContext.value?.clinicalSessionId) return false;
  const draftRow = (recentDrafts.value || []).find((d) => String(d.id) === String(draftId.value));
  if (draftRow?.office_event_id || draftRow?.clinical_session_id) return false;
  return true;
});
const inputText = ref('');
const includeInteractiveComplexity = ref(false);
const notePathway = ref('soap'); // 'soap' | 'csNoteBuild'
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
const libraryExpanded = ref(false);

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
const chartNoteReadOnly = computed(() => !!viewingChartNote.value);
const lastSavedAt = ref('');
let autosaveTimer = null;
let autosaveBusy = false;

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
const noteAidCategories = NOTE_AID_CATEGORIES;

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

function aidIsEligible(aid) {
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
  const cat = noteAidCategories.find((c) => c.id === selectedNoteCategory.value);
  if (!cat) return [];
  return (cat.aids || []).filter((aid) => aidIsEligible(aid));
});

const selectedAid = computed(() => {
  const hit = findNoteAidById(selectedAidId.value);
  return hit?.aid || null;
});

const selectedAidGuidance = computed(() => String(selectedAid.value?.guidance || '').trim());
const selectedAidForcesAutoSelect = computed(() => !!selectedAid.value?.autoSelect);
const selectedCategoryLabel = computed(() => {
  const cat = noteAidCategories.find((c) => c.id === selectedNoteCategory.value);
  return cat?.label || '';
});
const showLibraryPanel = computed(() => !String(selectedAidId.value || '').trim() && !draftId.value);
const libraryUserId = computed(() => authStore.user?.id || null);
const showInteractiveComplexityOption = computed(() => aidAllowsInteractiveComplexity(selectedAid.value));
const libraryCategories = computed(() => {
  const filtered = (noteAidCategories || []).map((cat) => ({
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
const showBillingCodePicker = computed(() => {
  if (forceAutoSelect.value) return false;
  if (selectedAidForcesAutoSelect.value) return false;
  // Optional override when the selected gem carries a billing code / code group.
  return !!(selectedAid.value?.serviceCode || selectedAid.value?.codeGroupId);
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

const noteTypePrimaryCode = (selection) => {
  const v = String(selection || '').trim();
  if (!v || v === '__other__') return '';
  const opt = (noteTypeOptions.value || []).find((o) => o.value === v);
  if (opt?.primary) return opt.primary;
  const group = NOTE_TYPE_GROUPS.find((g) => g.id === v);
  if (group) return group.primary;
  return v.toUpperCase();
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
  selectedAidId.value = aid?.id || '';
}

function changeNoteAid() {
  selectedAidId.value = '';
  selectedNoteCategory.value = '';
  noteWizardStep.value = 1;
}

watch(selectedAidId, (aidId) => {
  const aid = findNoteAidById(aidId)?.aid;
  if (aidKind(aid) === 'progress') {
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
    selectedServiceCode.value = aid.codeGroupId || aid.serviceCode;
    otherServiceCode.value = '';
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
  if (generating.value) return true;
  if (recording.value || recordingBusy.value) return true;
  const hasText = !!String(inputText.value || '').trim();
  const hasAudio = !!audioBlob.value;
  if (!hasText && !hasAudio) return true;
  // Need a gem/aid unless credential tier forces Code Decider.
  if (!forceAutoSelect.value && !selectedToolId.value) return true;
  return false;
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

const regenerateButtonLabel = computed(() => {
  if (generating.value) return 'Regenerating…';
  if (hasRevisionAdditions.value) return 'Regenerate with new additions';
  return 'Regenerate note';
});

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
  if (!canUseTool.value || autosaveBusy) return;
  const shouldPersistInputText = !audioBlob.value && transcriptSource.value !== 'audio';
  let rawInput = shouldPersistInputText ? String(inputText.value || '') : null;
  // Never persist ciphertext envelopes back into the form field.
  if (rawInput && looksEncryptedEnvelope(rawInput)) {
    rawInput = '';
    inputText.value = '';
  }

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
    inputText: rawInput,
    clientId: effectiveClientId.value || null,
    officeEventId:
      Number(bookingContext.value?.officeEventId || sessionOfficeEventId.value || 0) || null,
    clinicalSessionId:
      Number(bookingContext.value?.clinicalSessionId || sessionClinicalSessionId.value || 0) || null
  };

  // Create only after the clinician enters real content; update existing drafts freely
  // (including DOS-only changes once a draft exists).
  const hasMeaningfulContent =
    !!String(payload.serviceCode || '').trim() ||
    !!String(payload.programId || '').trim() ||
    !!String(payload.initials || '').trim() ||
    !!String(payload.inputText || '').trim() ||
    !!String(payload.clientId || '').trim() ||
    !!String(payload.dateOfService || '').trim();

  // Create only after the clinician enters real content; update existing drafts freely.
  if (!draftId.value && !hasMeaningfulContent) return;
  // Don't spawn empty drafts from DOS alone.
  if (!draftId.value && !String(payload.initials || '').trim() && !String(payload.inputText || '').trim() && !payload.clientId) {
    return;
  }

  autosaveBusy = true;
  try {
    if (!draftId.value) {
      const res = await api.post('/clinical-notes/drafts', payload, { skipGlobalLoading: true });
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
      }
    } else {
      await api.patch(`/clinical-notes/drafts/${draftId.value}`, payload, { skipGlobalLoading: true });
      recentDrafts.value = (recentDrafts.value || []).map((d) =>
        String(d.id) === String(draftId.value)
          ? {
              ...d,
              date_of_service: payload.dateOfService || d.date_of_service,
              initials: payload.initials ?? d.initials,
              client_id: payload.clientId ?? d.client_id,
              service_code: payload.serviceCode ?? d.service_code
            }
          : d
      );
    }
    lastSavedAt.value = new Date().toLocaleString();
  } catch {
    // best-effort: do not block the user
  } finally {
    autosaveBusy = false;
  }
};

async function saveDraftNow() {
  if (savingDraftManual.value) return;
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

async function deleteCurrentDraft() {
  if (!canDeleteCurrentDraft.value || deletingCurrentDraft.value) return;
  if (!window.confirm('Delete this draft note? This cannot be undone.')) return;
  deletingCurrentDraft.value = true;
  try {
    await api.post(
      '/clinical-notes/drafts/delete',
      {
        agencyId: noteAidAgencyId.value || currentAgencyId.value,
        draftIds: [Number(draftId.value)]
      },
      { skipGlobalLoading: true }
    );
    const id = draftId.value;
    draftId.value = null;
    currentDraftCreatedAt.value = null;
    outputObj.value = null;
    inputText.value = '';
    recentDrafts.value = (recentDrafts.value || []).filter((d) => String(d.id) !== String(id));
    approvalMessage.value = 'Draft deleted.';
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
    await api.post(
      '/clinical-notes/drafts/delete',
      {
        agencyId: currentAgencyId.value,
        draftIds: [Number(draftIdToDelete)]
      },
      { skipGlobalLoading: true }
    );
    if (String(draftId.value) === String(draftIdToDelete)) {
      draftId.value = null;
      currentDraftCreatedAt.value = null;
      outputObj.value = null;
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
  if (useCsNoteBuildPathway.value) {
    if (csGenerateDisabled.value) return;
  } else if (generateDisabled.value) {
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
      isTelehealth: csIsTelehealth.value
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

  if (showObjectiveRatings.value && !useCsNoteBuildPathway.value) {
    const needed = [];
    for (const g of activeTreatmentGoals.value) {
      for (const o of g.objectives || []) needed.push(String(o.id));
    }
    const rated = new Set(
      (sessionObjectiveRatings.value || []).map((r) => String(r.objectiveId))
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
    if (!shouldAutoSelectCode && selectedToolId.value) {
      fd.append('toolId', useCsNoteBuildPathway.value ? 'clinical_cs_note_build' : String(selectedToolId.value));
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
    if (showSessionContextStrip.value) {
      const sessionBits = [
        'Session documentation context (clinician-confirmed):',
        `Participants: ${sessionParticipants.value || 'Client Only'}`,
        sessionDurationMinutes.value != null ? `Duration minutes: ${sessionDurationMinutes.value}` : null,
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
    }
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
    fd.append('inputText', String(inputText.value || ''));
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
    await loadRecent();
    markActiveWorkQueueItemCompleted();
    sidebarTab.value = DOC_STATUS.COMPLETED;
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
  if (!ok) notePathway.value = 'soap';
});

watch(showCsNoteBuildPathway, (ok) => {
  if (!ok) notePathway.value = 'soap';
});

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
  if (!agencyId || !officeEventId || !clientId) {
    throw new Error('Missing appointment context (agencyId, officeEventId, or clientId). Open Note Aid from a booked schedule slot or a billing medical-record session.');
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

const approveNoteOutput = async () => {
  if (!mergedSectionEntries.value.length) return;
  if (approvingNote.value) return;
  if (!canConfirmAndSign.value) {
    approvalError.value = sessionParticipantsFlag.value
      ? 'Update Participants — session content suggests others were present.'
      : 'Complete required chart sections before signing.';
    return;
  }
  const ok = window.confirm(
    activeWorkQueueItemId.value
      ? 'Confirm this note is accurate and sign it?'
      : 'Approve this note and clear transcript/audio from this form?'
  );
  if (!ok) return;
  try {
    approvingNote.value = true;
    approvalError.value = '';
    approvalMessage.value = '';
    const sessionId = await ensureClinicalSessionForApproval();
    const approvedPayload = buildApprovedPayloadText();
    if (!approvedPayload) throw new Error('No approved note content available to persist.');
    const serviceCodeForMetadata = actualServiceCode.value || null;
    const title = `${bookingContext.value.noteType} ${serviceCodeForMetadata ? `(${serviceCodeForMetadata}) ` : ''}${new Date().toISOString().slice(0, 10)}`.trim();
    const structuredChart = {
      diagnosticJustification: chartDiagnosticJustification.value || null,
      mentalStatusExam: skipMentalStatusExam.value ? null : chartMentalStatus.value,
      riskAssessment: chartRiskAssessment.value,
      medications: chartMedications.value,
      participants: sessionParticipants.value,
      durationMinutes: sessionDurationMinutes.value,
      skippedMseReason: skipMentalStatusExam.value ? 'H0004' : null
    };
    const createRes = await api.post(`/clinical-data/sessions/${sessionId}/notes`, {
      title,
      notePayload: approvedPayload,
      noteType: bookingContext.value.noteType,
      templateVersion: bookingContext.value.templateVersion,
      serviceCode: serviceCodeForMetadata,
      officeEventId: bookingContext.value.officeEventId || sessionOfficeEventId.value || undefined,
      source: (bookingContext.value.officeEventId || sessionOfficeEventId.value)
        ? 'note_aid_approval'
        : 'billing_import_note_approval',
      primaryDiagnosisId: primaryChartDiagnosis.value?.id || null,
      diagnosticJustification:
        chartDiagnosticJustification.value || primaryChartDiagnosis.value?.justification || null,
      metadata: {
        generatedBy: 'clinical_note_generator',
        model: outputObj.value?.meta?.model || null,
        toolId: outputObj.value?.meta?.toolId || null,
        approvedAt: new Date().toISOString(),
        primaryDiagnosisId: primaryChartDiagnosis.value?.id || null,
        dateOfService: dateOfService.value ? String(dateOfService.value).slice(0, 10) : null,
        officeEventId: bookingContext.value.officeEventId || sessionOfficeEventId.value || null,
        structuredChart
      }
    });

    const noteId = Number(createRes?.data?.note?.id || 0);
    if (noteId) {
      try {
        await api.post(`/medical-billing/notes/${noteId}/sign`, {}, { skipGlobalLoading: true });
      } catch (signErr) {
        console.warn('[NoteAid] provider sign after approve failed', signErr?.message || signErr);
      }
    }

    inputText.value = '';
    transcriptSource.value = '';
    liveTranscript.value = '';
    clearAudio();
    revisionInstruction.value = '';
    approvalMessage.value = activeWorkQueueItemId.value
      ? 'Confirmed, signed, and saved to clinical records.'
      : 'Approved and persisted to clinical records. Transcript/audio cleared from this form.';
    if (activeWorkQueueItemId.value) {
      advanceWorkQueueAfterSign();
    } else {
      markActiveWorkQueueItemSigned();
    }
    sidebarTab.value = DOC_STATUS.SIGNED;
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
        current.objectives.push({
          objectiveIndex: p.index || current.objectives.length + 1,
          objectiveText: p.text || ''
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
    await api.post('/medical-billing/treatment-plans', {
      agencyId: noteAidAgencyId.value || currentAgencyId.value,
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
    const res = await api.get('/clinical-notes/recent', {
      params: {
        agencyId: currentAgencyId.value,
        allAccessible: '1',
        days: 2555,
        archiveStatus: 'all'
      },
      skipGlobalLoading: true,
      timeout: 15000
    });
    recentDrafts.value = Array.isArray(res?.data?.drafts) ? res.data.drafts : [];
    selectedDraftIds.value = selectedDraftIds.value.filter((id) =>
      recentDrafts.value.some((d) => String(d.id) === String(id))
    );
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
  await Promise.all([loadContext(), loadPrograms()]);
  if (seq !== bootstrapSeq) return;
  applyBookingContextPrefill();
  applyTherapyContextPrefill();
  const bookingClientId = Number(bookingContext.value?.clientId || 0);
  if (bookingClientId && !selectedClientId.value) {
    selectedClientId.value = bookingClientId;
    selectedClient.value = { id: bookingClientId };
    loadClientTreatmentPlan(bookingClientId);
    loadClientIntakeSummary(bookingClientId);
  }

  // Deep-link from client file: open updater with chart preload.
  const launchAid = String(route.query?.noteAid || route.query?.note_aid || '').trim();
  const launchIntentQ = String(route.query?.launchIntent || route.query?.launch_intent || '')
    .trim()
    .toLowerCase();
  if (launchAid === 'psychotherapy_plan' || launchIntentQ === 'update_treatment_plan') {
    const qClient = Number(route.query?.clientId || route.query?.client_id || 0);
    if (qClient) {
      selectedClientId.value = qClient;
      selectedClient.value = { id: qClient };
      await loadClientTreatmentPlan(qClient);
      await loadClientIntakeSummary(qClient);
    }
    await openTreatmentPlanUpdater({
      renewalReason:
        launchIntentQ === 'update_treatment_plan'
          ? 'Opened from client file — update treatment plan using chart diagnosis, goals, and ratings.'
          : ''
    });
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
  clientGuardianNames.value = [];
  dismissPhiNameWarn.value = false;
  clientPlanError.value = '';
  pastedPlanText.value = '';
  pastedIntakeText.value = '';
  pastedDemographicsText.value = '';
  intakeImportedOnce.value = false;
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
  const aid = Number(noteAidAgencyId.value || currentAgencyId.value || 0);
  if (!cid || !aid) {
    latestTreatmentPlan.value = null;
    chartDiagnoses.value = [];
    chartObjectiveRatings.value = [];
    return;
  }
  loadingClientPlan.value = true;
  clientPlanError.value = '';
  try {
    const res = await api.get(`/medical-billing/clients/${cid}/chart`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    latestTreatmentPlan.value = res?.data?.latestPlan || null;
    chartDiagnoses.value = Array.isArray(res?.data?.diagnoses) ? res.data.diagnoses : [];
    chartObjectiveRatings.value = Array.isArray(res?.data?.objectiveRatings)
      ? res.data.objectiveRatings
      : [];
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
    if (draftStatus === 'final' || draftRes?.data?.draft?.finalizedAt) {
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
  await hydrateSelectedClient(selectedClientId.value);
  await loadClientAgencyContext(selectedClientId.value);
  await Promise.all([
    loadClientTreatmentPlan(selectedClientId.value),
    loadClientIntakeSummary(selectedClientId.value),
    loadClientGuardianNames(selectedClientId.value)
  ]);
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
  try {
    const res = await api.get(`/clients/${cid}`, { skipGlobalLoading: true });
    const row = normalizeNoteAidClientRow(res?.data?.client || res?.data, agencyLookup.value);
    if (row) {
      const enc = res?.data?.client?.demographics_phi_enc || res?.data?.demographics_phi_enc;
      selectedClient.value = {
        ...row,
        demographics_phi_enc: enc || row.demographics_phi_enc || null,
        date_of_birth: row.date_of_birth || res?.data?.client?.date_of_birth,
        contact_phone: row.contact_phone || res?.data?.client?.contact_phone,
        email: row.email || res?.data?.client?.email,
        address_street: row.address_street || res?.data?.client?.address_street,
        address_city: row.address_city || res?.data?.client?.address_city,
        address_state: row.address_state || res?.data?.client?.address_state
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
  resetClientClinicalContext();
};

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
  if (selectedClientId.value || initialsMatchDismissed.value || typed.length < 2) {
    initialsMatchSuggestions.value = [];
    initialsMatchSearched.value = false;
    return;
  }
  try {
    const res = await api.get('/clients', {
      params: { search: typed, per_page: 12, page: 1 },
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
  initialsMatchDismissed.value = false;
  initialsMatchSearched.value = false;
  if (initialsMatchTimer) clearTimeout(initialsMatchTimer);
  initialsMatchTimer = setTimeout(searchInitialsMatches, 280);
});

const onPlanImportSaved = async (plan) => {
  showPlanImportReview.value = false;
  pastedPlanText.value = '';
  planImportedOnce.value = true;
  if (effectiveClientId.value) await loadClientTreatmentPlan(effectiveClientId.value);
  approvalMessage.value = plan?.id
    ? 'Treatment plan saved to chart.'
    : 'Treatment plan import completed.';
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
      const row = normalizeNoteAidClientRow(res?.data?.client || res?.data, agencyLookup.value);
      if (row) selectedClient.value = { ...row, demographics_phi_enc: true };
    }
  } catch {
    if (selectedClient.value) {
      selectedClient.value = { ...selectedClient.value, demographics_phi_enc: true };
    }
  }
  approvalMessage.value = 'Demographics encrypted and saved to the client chart.';
  clientContextPanelRef.value?.switchTab?.('demographics');
};

function persistWorkQueue() {
  saveWorkQueue(authStore.user?.id, workQueueItems.value);
}

function normalizeWorkQueueItemStatus(item) {
  if (!item) return item;
  const docStatus = deriveWorkQueueDocStatus(item);
  return { ...item, status: docStatus, docStatus };
}

function patchActiveWorkQueueStatus(status, extra = {}) {
  const id = activeWorkQueueItemId.value;
  if (!id) return;
  workQueueItems.value = (workQueueItems.value || []).map((item) =>
    item.id === id
      ? {
          ...item,
          status,
          docStatus: status,
          draftId: draftId.value || item.draftId || null,
          updatedAt: new Date().toISOString(),
          ...extra
        }
      : item
  );
  persistWorkQueue();
}

function markActiveWorkQueueItemCompleted() {
  patchActiveWorkQueueStatus(DOC_STATUS.COMPLETED, {
    completedAt: new Date().toISOString()
  });
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
  workQueueItems.value = (Array.isArray(items) ? items : []).map((i) => ({
    ...i,
    status: DOC_STATUS.NOT_STARTED,
    docStatus: DOC_STATUS.NOT_STARTED
  }));
  activeWorkQueueItemId.value = null;
  persistWorkQueue();
  const first = workQueueItems.value.find(
    (i) => deriveWorkQueueDocStatus(i) === DOC_STATUS.NOT_STARTED
  );
  if (first) activateWorkQueueItem(first);
}

function advanceWorkQueue() {
  // Skip without signing — return current to not_started if still unfinished
  const id = activeWorkQueueItemId.value;
  if (id) {
    workQueueItems.value = (workQueueItems.value || []).map((item) => {
      if (item.id !== id) return item;
      const cur = deriveWorkQueueDocStatus(item);
      if (cur === DOC_STATUS.STARTED) {
        return { ...item, status: DOC_STATUS.NOT_STARTED, docStatus: DOC_STATUS.NOT_STARTED };
      }
      return item;
    });
    persistWorkQueue();
  }
  const next = (workQueueItems.value || []).find(
    (i) => deriveWorkQueueDocStatus(i) === DOC_STATUS.NOT_STARTED
  );
  if (next) activateWorkQueueItem(next);
  else activeWorkQueueItemId.value = null;
}

function advanceWorkQueueAfterSign() {
  markActiveWorkQueueItemSigned();
  activeWorkQueueItemId.value = null;
  const next = (workQueueItems.value || []).find(
    (i) => deriveWorkQueueDocStatus(i) === DOC_STATUS.NOT_STARTED
  );
  if (next) activateWorkQueueItem(next);
}

function onLibrarySidebarSelect(row) {
  if (!row) return;
  libraryExpanded.value = false;
  if (row.source === 'work_queue' && row.raw) {
    activateWorkQueueItem(row.raw);
    sidebarTab.value = DOC_STATUS.STARTED;
    return;
  }
  const draft = row.raw || row;
  if (draft?.id && row.source !== 'work_queue') {
    loadDraftIntoWorkspace(draft);
    const st = row.docStatus || DOC_STATUS.STARTED;
    if (st === DOC_STATUS.SIGNED) sidebarTab.value = DOC_STATUS.SIGNED;
    else if (st === DOC_STATUS.COMPLETED) sidebarTab.value = DOC_STATUS.COMPLETED;
    else sidebarTab.value = DOC_STATUS.STARTED;
  }
}

async function activateWorkQueueItem(item) {
  if (!item) return;
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
    // Demote other in-progress items back to not_started (still on both panels until finished)
    if (deriveWorkQueueDocStatus(row) === DOC_STATUS.STARTED && row.id !== item.id) {
      // Keep as started — user asked started items stay visible in both; don't demote siblings
      return row;
    }
    return row;
  });
  activeWorkQueueItemId.value = item.id;
  sidebarTab.value = DOC_STATUS.STARTED;
  persistWorkQueue();

  showProgressSessionPicker.value = false;
  progressEntryMode.value = item.officeEventId ? 'appointment' : 'client';
  dateOfService.value = item.date || todayIsoDate();
  sessionOfficeEventId.value = item.officeEventId || null;
  sessionClinicalSessionId.value = item.clinicalSessionId || null;
  sessionDurationMinutes.value = item.durationMinutes || null;
  sessionLocationLabel.value = item.locationLabel || '';
  sessionParticipants.value = item.participantsSummary || 'Client Only';
  sessionPatientDob.value = item.clientDob ? String(item.clientDob).slice(0, 10) : '';
  sessionScheduledStart.value = item.scheduledStart || null;
  sessionScheduledEnd.value = item.scheduledEnd || null;
  sessionCodeSwitchBanner.value = '';
  chartMentalStatus.value = defaultMentalStatusExam();
  chartRiskAssessment.value = defaultRiskAssessment();
  chartMedications.value = defaultMedicationsBlock();
  const clientId = Number(item.clientId || 0) || null;
  if (clientId) {
    selectedClientId.value = clientId;
    selectedClient.value = {
      id: clientId,
      full_name: item.clientName,
      agency_id: item.agencyId,
      initials: deriveInitialsFromNameSafe(item.clientName)
    };
    initials.value = deriveInitialsFromNameSafe(item.clientName);
    await loadClientTreatmentPlan(clientId);
    await loadClientIntakeSummary(clientId);
    chartDiagnosticJustification.value = primaryChartDiagnosis.value?.justification || '';
  } else {
    initials.value = deriveInitialsFromNameSafe(item.clientName);
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

  if (item.officeEventId || item.clientId) {
    const nextQuery = { ...route.query, launchIntent: 'work_queue' };
    if (item.clientId) nextQuery.clientId = String(item.clientId);
    if (item.officeEventId) nextQuery.officeEventId = String(item.officeEventId);
    if (item.clinicalSessionId) nextQuery.clinicalSessionId = String(item.clinicalSessionId);
    if (item.serviceCode) nextQuery.serviceCode = String(item.serviceCode);
    if (item.date) nextQuery.dateOfService = String(item.date).slice(0, 10);
    router.replace({ query: nextQuery }).catch(() => {});
  }

  configExpanded.value = true;
  noteWizardStep.value = 1;
  draftId.value = null;
  outputObj.value = null;
  inputText.value = '';
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
  selectedNoteCategory.value = 'psychotherapy';
  selectedAidId.value = 'psychotherapy_plan';

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
    diagnosticJustification: primaryChartDiagnosis.value?.justification || ''
  });
  clientContextPanelRef.value?.switchTab?.('goals');
  await openTreatmentPlanUpdater({
    renewalReason: intakeText
      ? 'Build or update treatment plan from intake and chart diagnoses.'
      : 'Build treatment plan from chart diagnoses.'
  });
  showPlanImportReview.value = true;
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

const loadDraftIntoWorkspace = async (d) => {
  if (!d) return;
  viewingChartNote.value = null;
  draftId.value = d.id || null;
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
  dateOfService.value = d.date_of_service ? String(d.date_of_service).slice(0, 10) : todayIsoDate();
  initials.value = d.initials || '';
  const draftClientId = Number(d.client_id || 0) || null;
  if (draftClientId && draftClientId !== Number(selectedClientId.value || 0)) {
    selectedClientId.value = draftClientId;
    selectedClient.value = {
      id: draftClientId,
      agency_id: d.client_agency_id || null,
      agency_name: d.agency_name || null,
      initials: d.initials || '',
      full_name: d.client_full_name || null
    };
    await hydrateSelectedClient(draftClientId);
    await loadClientAgencyContext(draftClientId);
    loadClientTreatmentPlan(draftClientId);
    loadClientIntakeSummary(draftClientId);
  } else if (draftClientId) {
    await loadClientAgencyContext(draftClientId);
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
  noteWizardStep.value = outputObj.value ? 2 : 1;
  newNoteMenuOpen.value = false;
  showProgressSessionPicker.value = false;
  progressEntryMode.value = 'client';
  activeWorkQueueItemId.value = null;
};

const loadClinicalNoteIntoWorkspace = async (noteId) => {
  const nid = Number(noteId || 0);
  if (!nid) return;
  const aid = Number(noteAidAgencyId.value || currentAgencyId.value || 0);
  if (!aid) return;
  try {
    const res = await api.get(`/medical-billing/notes/${nid}`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    const note = res?.data?.note;
    if (!note) {
      approvalError.value = 'Clinical note not found.';
      return;
    }
    viewingChartNote.value = {
      id: note.id,
      title: note.title || '',
      standalone: !!note.standalone,
      noteType: note.noteType || null
    };
    draftId.value = null;
    activeWorkQueueItemId.value = null;
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
  const libraryUi = loadNoteLibraryUiPrefs(authStore.user?.id);
  libraryCollapsed.value = libraryUi.collapsed;
  libraryExpanded.value = libraryUi.expanded;
  const queryDos = toDateOfService(route.query?.dateOfService || route.query?.date_of_service);
  if (queryDos) dateOfService.value = queryDos;
  else if (!dateOfService.value) dateOfService.value = todayIsoDate();
  if (String(route.query?.new || '') === '1' || String(route.query?.newNote || '') === '1') {
    startNewNote();
  }

  // Direct entry (bookmark / quick nav): hourly workers not clocked in get offered a Log Time start.
  // Launchers (Tools & Aids / nav) already prompt; skipPrompt when already linked to a session.
  if (!fromIndirectSession.value) {
    const { fromIndirectSession: linked } = await ensureHourlySessionForNoteAid();
    if (linked) {
      const nextQuery = { ...route.query, fromIndirectSession: '1', launchIntent: 'note' };
      router.replace({ query: nextQuery }).catch(() => {});
    }
  }

  if (canUseTool.value) {
    await bootstrapWorkspace();
    const stashed = consumeNoteAidWorkQueueStash();
    if (stashed?.length) {
      workQueueItems.value = stashed.map(normalizeWorkQueueItemStatus);
      persistWorkQueue();
      const first = workQueueItems.value.find(
        (i) => deriveWorkQueueDocStatus(i) === DOC_STATUS.NOT_STARTED
          || deriveWorkQueueDocStatus(i) === DOC_STATUS.STARTED
      ) || workQueueItems.value[0];
      if (first) await activateWorkQueueItem(first);
    } else {
      workQueueItems.value = loadWorkQueue(authStore.user?.id).map(normalizeWorkQueueItemStatus);
      const active = (workQueueItems.value || []).find(
        (i) => deriveWorkQueueDocStatus(i) === DOC_STATUS.STARTED
      );
      if (active) activeWorkQueueItemId.value = active.id;
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

  autosaveTimer = window.setInterval(() => {
    autosave();
  }, 30_000);
});

watch(sessionDurationMinutes, (mins) => {
  if (!showSessionContextStrip.value) return;
  const suggested = suggestPsychotherapyCodeForDuration(mins);
  if (!suggested) return;
  const current = String(actualServiceCode.value || '').toUpperCase();
  if (!['90832', '90834', '90837'].includes(current) && current) return;
  if (current === suggested) {
    sessionCodeSwitchBanner.value = '';
    return;
  }
  selectedServiceCode.value = suggested;
  sessionCodeSwitchBanner.value =
    `Duration ${mins} min is outside ${current || 'prior'} band — switched service code to ${suggested}.`;
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

onBeforeUnmount(() => {
  bootstrapSeq += 1;
  if (autosaveTimer) {
    window.clearInterval(autosaveTimer);
    autosaveTimer = null;
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

.na-topbar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(0, 2fr) auto;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid var(--na-border);
  backdrop-filter: blur(8px);
  position: relative;
  z-index: 2;
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

.na-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

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

.na-tagline {
  margin: 0;
  text-align: center;
  color: var(--na-muted);
  font-size: 0.95rem;
}

.na-tagline em {
  font-style: italic;
  color: var(--na-teal-dark);
}

.na-archive-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--na-border);
  background: white;
  color: var(--na-text);
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 600;
  cursor: pointer;
}

.na-archive-btn:hover {
  border-color: var(--na-teal);
  color: var(--na-teal);
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
  grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.na-write-overview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: sticky;
  top: 12px;
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
  .na-write-overview {
    position: static;
  }
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

@media (max-width: 960px) {
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
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: auto;
  }
  .na-shell--library-expanded {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr);
  }
  .na-shell--library-collapsed .cnl,
  .na-shell--library-collapsed :deep(.cnl) {
    max-height: none;
    border-bottom: 1px solid var(--na-border);
  }
  .na-main {
    min-height: 50vh;
    padding: 14px 16px 32px;
  }
  .na-sidebar {
    border-right: none;
    border-bottom: 1px solid var(--na-border);
    max-height: 360px;
  }
  .na-config,
  .na-date-grid {
    grid-template-columns: 1fr;
  }
}
</style>

