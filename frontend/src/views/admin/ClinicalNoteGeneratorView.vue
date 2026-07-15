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

    <div v-if="!canUseTool" class="na-shell na-shell--empty">
      <div class="na-empty-card">
        <strong>Not available</strong>
        <p>
          This tool is not enabled for your current organization.
          Ask an admin to enable <strong>Clinical Note Generator</strong> or <strong>Note Aid</strong> in Organization Settings.
        </p>
      </div>
    </div>

    <div v-else class="na-shell">
      <aside class="na-sidebar">
        <button type="button" class="na-new-note" @click="startNewNote">
          <span aria-hidden="true">+</span> New Note
        </button>

        <div class="na-side-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="sidebarTab === 'active'"
            :class="{ active: sidebarTab === 'active' }"
            @click="setSidebarTab('active')"
          >
            Active
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="sidebarTab === 'archived'"
            :class="{ active: sidebarTab === 'archived' }"
            @click="setSidebarTab('archived')"
          >
            Archived
          </button>
        </div>

        <div class="na-search-row">
          <input
            v-model="draftSearch"
            type="search"
            class="na-search"
            placeholder="Search notes…"
            aria-label="Search notes"
          />
        </div>

        <div class="na-draft-list" aria-label="Note drafts">
          <div v-if="recentLoading" class="na-side-muted">Loading…</div>
          <div v-else-if="recentError" class="na-side-error">{{ recentError }}</div>
          <div v-else-if="!sidebarDateGroups.length" class="na-side-muted">
            {{ sidebarTab === 'archived' ? 'No archived notes yet.' : 'No active notes yet.' }}
          </div>
          <div v-for="group in sidebarDateGroups" :key="group.key" class="na-date-group">
            <button
              type="button"
              class="na-date-group-header"
              :class="{ open: isDateGroupOpen(group.key) }"
              :aria-expanded="isDateGroupOpen(group.key)"
              @click="toggleDateGroup(group.key)"
            >
              <div class="na-draft-date">
                <span class="na-draft-month">{{ group.month }}</span>
                <span class="na-draft-day">{{ group.day }}</span>
              </div>
              <div class="na-date-group-meta">
                <strong>{{ group.label }}</strong>
                <span>{{ group.drafts.length }} note{{ group.drafts.length === 1 ? '' : 's' }}</span>
              </div>
              <span class="na-draft-chevron" :class="{ open: isDateGroupOpen(group.key) }" aria-hidden="true">›</span>
            </button>
            <div v-show="isDateGroupOpen(group.key)" class="na-date-group-notes">
              <button
                v-for="d in group.drafts"
                :key="d.id"
                type="button"
                class="na-draft-row"
                :class="{ selected: String(draftId) === String(d.id) }"
                @click="loadDraftIntoWorkspace(d)"
              >
                <div class="na-draft-meta">
                  <div class="na-draft-top">
                    <strong>{{ d.initials || '—' }}</strong>
                    <span>{{ draftTimeLabel(d.created_at) }}</span>
                  </div>
                  <div class="na-draft-type">{{ draftNoteTypeLabel(d) }}</div>
                  <div class="na-draft-dos">
                    DOS: {{ d.date_of_service ? String(d.date_of_service).slice(0, 10) : '—' }}
                  </div>
                </div>
                <span class="na-draft-chevron" aria-hidden="true">›</span>
              </button>
            </div>
          </div>
        </div>

        <div class="na-side-footer">
          <span>{{ filteredSidebarDrafts.length }} note{{ filteredSidebarDrafts.length === 1 ? '' : 's' }}</span>
          <span class="na-ttl-hint">Deletes after 7 days</span>
        </div>
      </aside>

      <main class="na-main">
        <div class="na-privacy">
          <strong>Privacy notice:</strong>
          Drafts (including archived) are permanently deleted after 7 days. Copy into your EHR before then.
        </div>

        <div v-if="therapyContext" class="na-context-strip">
          <strong>Therapy Notes context</strong>
          <span v-if="therapyContext.therapySummary">{{ therapyContext.therapySummary }}</span>
          <span v-if="therapyContext.therapyCalendarLabel"> · {{ therapyContext.therapyCalendarLabel }}</span>
        </div>

        <div class="na-context-strip na-context-strip--soft">
          <span><strong>Credential:</strong> {{ loadingContext ? 'Loading…' : (providerCredentialText || 'Not set') }}</span>
          <span><strong>Tier:</strong> {{ derivedTier }}</span>
          <span v-if="lastSavedAt"><strong>Saved:</strong> {{ lastSavedAt }}</span>
          <span v-else-if="draftId" class="muted">Draft #{{ draftId }}</span>
        </div>

        <section class="na-config">
          <div class="na-step">
            <div class="na-step-num">1</div>
            <div class="na-step-body">
              <label class="na-label">Note Type</label>
              <select v-model="selectedServiceCode" class="na-input" :disabled="autoSelectCode || forceAutoSelect">
                <option value="" disabled>Select a note type</option>
                <option v-for="code in serviceCodeOptions" :key="code" :value="code">{{ serviceCodeOptionLabel(code) }}</option>
                <option v-if="canUseOtherCode" value="__other__">Other (enter code)</option>
              </select>
              <input
                v-if="selectedServiceCode === '__other__'"
                v-model="otherServiceCode"
                class="na-input"
                style="margin-top: 8px;"
                placeholder="e.g., 90834"
              />
              <label class="na-check" style="margin-top: 8px;">
                <input v-model="autoSelectCode" type="checkbox" :disabled="forceAutoSelect" />
                <span>Let AI choose the best code</span>
              </label>
            </div>
          </div>

          <div class="na-step">
            <div class="na-step-num">2</div>
            <div class="na-step-body">
              <label class="na-label">Date of Service</label>
              <input v-model="dateOfService" type="date" class="na-input" />
            </div>
          </div>

          <div class="na-step">
            <div class="na-step-num">3</div>
            <div class="na-step-body">
              <label class="na-label">Client Initials</label>
              <input v-model="initials" type="text" class="na-input" maxlength="16" placeholder="e.g., A.M." />
            </div>
          </div>

          <div class="na-step">
            <div class="na-step-num">4</div>
            <div class="na-step-body">
              <label class="na-label">Options</label>
              <label class="na-toggle-row">
                <span>Include Interactive Complexity</span>
                <span class="na-switch" :class="{ on: includeInteractiveComplexity }">
                  <input v-model="includeInteractiveComplexity" type="checkbox" />
                  <span class="na-switch-thumb" />
                </span>
              </label>
              <div v-if="showProgramDropdown" style="margin-top: 10px;">
                <span class="na-field-hint">Program (H2014 only)</span>
                <select v-model="selectedProgramId" class="na-input">
                  <option value="">No program</option>
                  <option v-for="p in programs" :key="p.id" :value="String(p.id)">{{ formatProgramLabel(p) }}</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section class="na-input-panel">
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
            v-model="inputText"
            class="na-textarea"
            rows="8"
            maxlength="12000"
            placeholder="Paste or type your session details here…"
          />

          <div v-if="inputMode === 'speak'" class="na-speak-tools">
            <div class="consent-box">
              <label class="na-label" style="margin-bottom: 6px;">Recording purpose</label>
              <div class="purpose-toggle" role="radiogroup" aria-label="Recording purpose">
                <button
                  type="button"
                  class="purpose-btn"
                  :class="{ active: !isSessionRecording }"
                  @click="recordingPurpose = 'dictation'"
                >
                  Dictation only
                </button>
                <button
                  type="button"
                  class="purpose-btn"
                  :class="{ active: isSessionRecording }"
                  @click="recordingPurpose = 'session'"
                >
                  Session recording
                </button>
              </div>

              <template v-if="isSessionRecording">
                <label class="na-check" style="margin-top: 10px;">
                  <input v-model="clientPresentInRecording" type="checkbox" />
                  <span>Client will be present in this recording.</span>
                </label>
                <div v-if="clientPresentInRecording" class="consent-step">
                  <label class="na-field-hint">Is client consent already on file?</label>
                  <select v-model="clientConsentOnFile" class="na-input">
                    <option value="">Select an option</option>
                    <option value="yes">Yes</option>
                    <option value="no">No — capture now</option>
                  </select>
                  <div v-if="clientConsentOnFile === 'no'" class="consent-followup">
                    <div class="na-actions">
                      <button
                        class="btn btn-secondary btn-sm"
                        type="button"
                        :disabled="!canLaunchConsentSession || consentSessionLaunching"
                        @click="launchConsentSigningSession('client')"
                      >
                        {{ consentSessionLaunching ? 'Launching…' : 'Open client consent signing' }}
                      </button>
                    </div>
                  </div>
                </div>
                <label class="na-check" style="margin-top: 10px;">
                  <input v-model="additionalParticipantPresent" type="checkbox" />
                  <span>Another person will be present in the recording.</span>
                </label>
                <div v-if="additionalParticipantPresent" class="consent-step">
                  <label class="na-field-hint">Is additional-participant consent on file?</label>
                  <select v-model="additionalParticipantConsentOnFile" class="na-input">
                    <option value="">Select an option</option>
                    <option value="yes">Yes</option>
                    <option value="no">No — capture now</option>
                  </select>
                </div>
                <div v-if="requiresConsentTemplateSelection" class="consent-step">
                  <label class="na-field-hint">Consent/agreement template</label>
                  <select v-model="selectedAudioAgreementTemplateId" class="na-input" :disabled="!audioAgreementTemplates.length">
                    <option value="">Select an agreement template</option>
                    <option v-for="t in audioAgreementTemplates" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
                  </select>
                </div>
              </template>
              <small v-if="recordingConsentError" class="error">{{ recordingConsentError }}</small>
              <small v-if="consentSessionError" class="error">{{ consentSessionError }}</small>
            </div>

            <div class="na-actions">
              <button class="btn btn-primary recording-now-btn" type="button" :disabled="recordingBusy" @click="openRecordSessionModal">
                {{ recording ? 'Recording in progress' : 'Record Session modal' }}
              </button>
              <button class="btn btn-secondary" type="button" :disabled="recordingBusy" @click="toggleRecording">
                {{ recording ? 'Stop recording' : (isSessionRecording ? 'Record session audio' : 'Record dictation') }}
              </button>
              <button class="btn btn-secondary" type="button" :disabled="!audioBlob || recording" @click="clearAudio">
                Clear recording
              </button>
              <button class="btn btn-secondary" type="button" :disabled="!canServerTranscribe" @click="transcribeAudioServer">
                {{ serverTranscribing ? 'Transcribing…' : 'Transcribe (server)' }}
              </button>
            </div>
            <small v-if="recording" class="hint">
              Recording… {{ transcribing ? 'Transcribing live.' : speechSupported ? 'Transcription starting…' : 'Transcription not supported in this browser.' }}
            </small>
            <small v-if="liveTranscript" class="hint">Live transcript: {{ liveTranscript }}</small>
            <small v-if="audioBlob" class="hint">
              Audio captured ({{ audioMimeType || 'unknown type' }}, {{ audioDurationLabel }})
            </small>
            <small v-if="serverTranscribeError" class="error">{{ serverTranscribeError }}</small>
          </div>

          <div class="na-input-footer">
            <span class="na-char-count">{{ String(inputText || '').length }} / 12000</span>
            <button class="na-generate" type="button" :disabled="generateDisabled" @click="generateNote">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M12 2l1.2 6.3L19 12l-5.8 3.7L12 22l-1.2-6.3L5 12l5.8-3.7L12 2z"/>
              </svg>
              {{ generating ? 'Generating…' : 'Generate Note' }}
            </button>
          </div>
          <small v-if="generateError" class="error">{{ generateError }}</small>
        </section>

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
            <span v-if="includeInteractiveComplexity" class="na-tag na-tag--accent">Interactive Complexity</span>
          </div>

          <div class="na-soap-list">
            <div v-for="panel in displayPanels" :key="panel.id" class="na-soap-card">
              <button type="button" class="na-soap-header" @click="togglePanelCollapsed(panel.id)">
                <span class="na-soap-title">
                  <span v-if="panel.letter" class="na-soap-letter">{{ panel.letter }}</span>
                  {{ panel.title }}
                </span>
                <span class="na-soap-actions" @click.stop>
                  <button type="button" class="na-mini-btn" @click="toggleSectionEdit(panel.id)">
                    {{ sectionEditing[panel.id] ? 'Done' : 'Edit' }}
                  </button>
                  <button type="button" class="na-mini-btn" :disabled="!panelText(panel)" @click="copyText(panelText(panel))">
                    Copy
                  </button>
                  <span class="na-chevron" :class="{ open: !isPanelCollapsed(panel.id) }">▾</span>
                </span>
              </button>
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

          <div class="na-interventions">
            <h3>Intervention Types Used</h3>
            <div class="na-intervention-grid">
              <label v-for="opt in interventionOptions" :key="opt" class="na-check">
                <input v-model="selectedInterventionTypes" type="checkbox" :value="opt" />
                <span>{{ opt }}</span>
              </label>
            </div>
          </div>

          <div class="field" style="margin-bottom: 12px;">
            <label class="na-field-hint">Retry instruction (optional)</label>
            <textarea
              v-model="revisionInstruction"
              class="na-textarea"
              rows="2"
              placeholder="Tell Note Aid what to revise while keeping the same transcript…"
            />
          </div>

          <div class="na-output-actions">
            <button type="button" class="na-btn-primary" :disabled="!displayPanels.length" @click="copyFullNote">
              Copy Full Note
            </button>
            <button
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
              :disabled="!displayPanels.length || approvingNote"
              @click="approveNoteOutput"
            >
              {{ approvingNote ? 'Approving…' : 'Approve to clinical record' }}
            </button>
            <button
              type="button"
              class="na-link-btn"
              :disabled="generating || !String(inputText || '').trim()"
              @click="generateNote"
            >
              {{ generating ? 'Regenerating…' : 'Retry with same transcript' }}
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
      </main>
    </div>

    <div v-if="recordSessionModalOpen" class="record-session-modal-overlay" @click="closeRecordSessionModal">
      <div class="record-session-modal" @click.stop>
        <h2 style="margin-top: 0;">Record Session</h2>
        <p class="muted" style="margin-bottom: 10px;">
          Use focused recording mode for this booked session. Complete consent selections first if required, then press Recording Now.
        </p>
        <button
          class="btn btn-primary recording-now-btn recording-now-cta"
          type="button"
          :disabled="recordingBusy"
          @click="startRecordingFromModal"
        >
          {{ recording ? 'Stop Recording Now' : 'Recording Now' }}
        </button>
        <small v-if="recordingConsentError" class="error" style="display: block;">{{ recordingConsentError }}</small>
        <div class="na-actions" style="justify-content: flex-end; margin-top: 14px;">
          <button class="btn btn-secondary" type="button" @click="closeRecordSessionModal">
            Continue in Note Aid
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import ClinicalArtifactRetentionPanel from '../../components/clinical/ClinicalArtifactRetentionPanel.vue';
import {
  INTERVENTION_TYPE_OPTIONS,
  buildDisplaySections,
  extractSections,
  formatDraftListDate,
  formatDraftListTime,
  formatFullNoteCopy,
  inferInterventionTypes,
  todayIsoDate
} from '../../utils/noteAidUiHelpers';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();

const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

const currentAgencyId = computed(() => agencyStore.currentAgency?.id || null);
const bookingContext = computed(() => {
  const officeEventId = Number(route.query?.officeEventId || route.query?.office_event_id || 0) || null;
  const clientId = Number(route.query?.clientId || route.query?.client_id || 0) || null;
  const noteType = String(route.query?.noteType || route.query?.note_type || 'PROGRESS_NOTE').trim() || 'PROGRESS_NOTE';
  const templateVersion = String(route.query?.templateVersion || route.query?.template_version || 'v1').trim() || 'v1';
  const serviceCode = String(route.query?.serviceCode || route.query?.service_code || '').trim().toUpperCase();
  return {
    officeEventId,
    clientId,
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
  () => !!(bookingContext.value?.officeEventId && bookingContext.value?.clientId)
);
const retentionClientId = computed(() => Number(bookingContext.value?.clientId || 0) || null);
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
const selectedServiceCode = ref('');
const otherServiceCode = ref('');
const selectedProgramId = ref('');
const dateOfService = ref('');
const initials = ref('');
const inputText = ref('');
const includeInteractiveComplexity = ref(true);
const inputMode = ref('type'); // type | speak
const sidebarTab = ref('active'); // active | archived
const draftSearch = ref('');
const openDateGroups = ref({});
const selectedInterventionTypes = ref([]);
const interventionOptions = INTERVENTION_TYPE_OPTIONS;
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
const isSessionRecording = computed(() => recordingPurpose.value === 'session');
const recordSessionModalOpen = ref(false);
const recordSessionIntentHandled = ref(false);
const consentSessionLaunching = ref(false);
const consentSessionError = ref('');
const canLaunchConsentSession = computed(() =>
  !!String(selectedAudioAgreementTemplateId.value || '').trim() && !!currentAgencyId.value
);

// Draft state
const draftId = ref(null);
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

// Output state
const generating = ref(false);
const generateError = ref('');
const outputObj = ref(null);
const copied = ref(false);
const revisionInstruction = ref('');
const approvalMessage = ref('');
const approvalError = ref('');
const approvingNote = ref(false);
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
  '90846',
  '90847',
  // Supervision accrual codes used elsewhere in the system
  '99414',
  '99416'
];

const SERVICE_CODE_DESCRIPTIONS = {
  '90791': 'Psychiatric diagnostic intake/assessment.',
  '90832': 'Individual therapy, 16-37 minutes.',
  '90834': 'Individual therapy, 38-52 minutes.',
  '90837': 'Individual therapy, 53+ minutes.',
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

const serviceCodeOptions = computed(() => {
  const raw = eligibleServiceCodes.value;
  const list = Array.isArray(raw) ? raw : STATIC_COMMON_CODES;
  return Array.from(new Set(list.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))).sort();
});

const serviceCodeDescription = (code) => SERVICE_CODE_DESCRIPTIONS[String(code || '').trim().toUpperCase()] || '';
const serviceCodeOptionLabel = (code) => {
  const normalized = String(code || '').trim().toUpperCase();
  const desc = serviceCodeDescription(normalized);
  return desc ? `${normalized} — ${desc}` : normalized;
};

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
};

const applyBookingContextPrefill = () => {
  if (bookingPrefillApplied.value) return;
  const prefilledCode = String(bookingContext.value?.serviceCode || '').trim().toUpperCase();
  if (!prefilledCode) {
    bookingPrefillApplied.value = true;
    return;
  }
  if (forceAutoSelect.value) return;
  const options = serviceCodeOptions.value || [];
  if (options.includes(prefilledCode)) {
    selectedServiceCode.value = prefilledCode;
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
  return String(selectedServiceCode.value || '').trim().toUpperCase();
});

const showProgramDropdown = computed(() => actualServiceCode.value === 'H2014');
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

const noteTypeDisplayLabel = computed(() => {
  const code = actualServiceCode.value || outputObj.value?.meta?.serviceCode || '';
  if (!code) return 'Progress Note';
  return serviceCodeOptionLabel(code);
});

const isCurrentDraftArchived = computed(() => !!currentDraftArchivedAt.value);

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
  const code = String(d?.service_code || '').trim();
  if (!code) return 'Progress Note';
  return serviceCodeDescription(code) ? `${code} Note` : `${code}`;
};

watch(outputObj, () => {
  Object.keys(sectionOverrides).forEach((k) => delete sectionOverrides[k]);
  Object.keys(sectionEditing).forEach((k) => delete sectionEditing[k]);
  Object.keys(collapsedPanels).forEach((k) => delete collapsedPanels[k]);
  const sections = extractSections(outputObj.value);
  const interventionsText =
    sections.Interventions ||
    sections['Interventions Used'] ||
    '';
  selectedInterventionTypes.value = inferInterventionTypes(interventionsText);
  if (outputObj.value?.meta?.includeInteractiveComplexity != null) {
    includeInteractiveComplexity.value = !!outputObj.value.meta.includeInteractiveComplexity;
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
  } catch {
    // ignore
  }
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
    eligibleServiceCodes.value = res?.data?.eligibleServiceCodes ?? null;
    audioAgreementTemplates.value = Array.isArray(res?.data?.audioAgreementTemplates) ? res.data.audioAgreementTemplates : [];
  } catch (e) {
    contextError.value = e.response?.data?.error?.message || 'Failed to load user context';
    providerCredentialText.value = '';
    derivedTier.value = 'unknown';
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
    agencyId: currentAgencyId.value,
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
    inputText: rawInput
  };

  // Default Date of Service alone must NOT spawn a new draft every interval/click cycle.
  const hasMeaningfulContent =
    !!String(payload.serviceCode || '').trim() ||
    !!String(payload.programId || '').trim() ||
    !!String(payload.initials || '').trim() ||
    !!String(payload.inputText || '').trim();

  // Create only after the clinician enters real content; update existing drafts freely.
  if (!draftId.value && !hasMeaningfulContent) return;

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
    }
    lastSavedAt.value = new Date().toLocaleString();
  } catch {
    // best-effort: do not block the user
  } finally {
    autosaveBusy = false;
  }
};

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
        stopTranscription();
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
      stopTranscription();
    };
    mr.start();
    startTranscription();
    recording.value = true;
    recordingBusy.value = false;
  } catch {
    recording.value = false;
    recordingBusy.value = false;
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
  if (generateDisabled.value) return;
  if (!canUseTool.value) return;
  try {
    generating.value = true;
    generateError.value = '';

    const fd = new FormData();
    fd.append('agencyId', String(currentAgencyId.value));
    fd.append('recordingPurpose', String(recordingPurpose.value || 'dictation'));
    const shouldAutoSelectCode = autoSelectCode.value || forceAutoSelect.value || !actualServiceCode.value;
    if (!shouldAutoSelectCode && actualServiceCode.value) {
      fd.append('serviceCode', actualServiceCode.value);
    }
    fd.append('autoSelectCode', String(shouldAutoSelectCode));
    if (selectedProgram.value?.isCustom && selectedProgram.value?.name) {
      fd.append('programLabel', String(selectedProgram.value.name));
    } else if (showProgramDropdown.value && selectedProgramId.value) {
      fd.append('programId', String(selectedProgramId.value));
    }
    if (transcriptSource.value) fd.append('transcriptSource', transcriptSource.value);
    if (showProgramDropdown.value && selectedProgramId.value) fd.append('programId', String(selectedProgramId.value));
    if (dateOfService.value) fd.append('dateOfService', String(dateOfService.value));
    fd.append('dateWritten', String(effectiveCreatedDate.value));
    if (initials.value) fd.append('initials', String(initials.value));
    fd.append('includeInteractiveComplexity', String(!!includeInteractiveComplexity.value));
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

    await loadRecent();
  } catch (e) {
    const base = e.response?.data?.error?.message || 'Failed to generate note';
    const details = e.response?.data?.error?.details;
    generateError.value = details ? `${base} (${details})` : base;
  } finally {
    generating.value = false;
  }
};

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
  const agencyId = Number(currentAgencyId.value || 0);
  const officeEventId = Number(bookingContext.value.officeEventId || 0);
  const clientId = Number(bookingContext.value.clientId || 0);
  if (!agencyId || !officeEventId || !clientId) {
    throw new Error('Missing appointment context (agencyId, officeEventId, or clientId). Open Note Aid from a booked schedule slot.');
  }
  const res = await api.post('/clinical-data/sessions/bootstrap', {
    agencyId,
    clientId,
    officeEventId,
    sourceTimezone: 'America/New_York'
  });
  const sessionId = Number(res?.data?.session?.id || 0) || null;
  if (!sessionId) throw new Error('Could not resolve clinical session context.');
  return sessionId;
};

const approveNoteOutput = async () => {
  if (!mergedSectionEntries.value.length) return;
  if (approvingNote.value) return;
  const ok = window.confirm('Approve this note and clear transcript/audio from this form?');
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
    await api.post(`/clinical-data/sessions/${sessionId}/notes`, {
      title,
      notePayload: approvedPayload,
      noteType: bookingContext.value.noteType,
      templateVersion: bookingContext.value.templateVersion,
      serviceCode: serviceCodeForMetadata,
      officeEventId: bookingContext.value.officeEventId,
      source: 'note_aid_approval',
      metadata: {
        generatedBy: 'clinical_note_generator',
        model: outputObj.value?.meta?.model || null,
        toolId: outputObj.value?.meta?.toolId || null,
        approvedAt: new Date().toISOString()
      }
    });

    inputText.value = '';
    transcriptSource.value = '';
    liveTranscript.value = '';
    clearAudio();
    revisionInstruction.value = '';
    approvalMessage.value = 'Approved and persisted to clinical records. Transcript/audio cleared from this form.';
  } catch (e) {
    approvalError.value = e.response?.data?.error?.message || e.message || 'Failed to persist approved note';
  } finally {
    approvingNote.value = false;
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
      params: { agencyId: currentAgencyId.value, days: 7, archiveStatus: 'all' },
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
    selectedInterventionTypes.value = [];
    includeInteractiveComplexity.value = true;
  }

  // Critical path in parallel; draft list is soft and must not block the form.
  await Promise.all([loadContext(), loadPrograms()]);
  if (seq !== bootstrapSeq) return;
  applyBookingContextPrefill();
  applyTherapyContextPrefill();
  loadRecent();
};

const setSidebarTab = async (tab) => {
  sidebarTab.value = tab === 'archived' ? 'archived' : 'active';
  openDateGroups.value = {};
  await loadRecent();
};

const focusArchivedShelf = async () => {
  await setSidebarTab('archived');
};

const startNewNote = () => {
  draftId.value = null;
  currentDraftArchivedAt.value = null;
  currentDraftCreatedAt.value = null;
  lastSavedAt.value = '';
  selectedServiceCode.value = '';
  otherServiceCode.value = '';
  selectedProgramId.value = '';
  dateOfService.value = todayIsoDate();
  initials.value = '';
  inputText.value = '';
  includeInteractiveComplexity.value = true;
  inputMode.value = 'type';
  outputObj.value = null;
  revisionInstruction.value = '';
  selectedInterventionTypes.value = [];
  clearAudio();
  transcriptSource.value = '';
  liveTranscript.value = '';
  approvalMessage.value = '';
  approvalError.value = '';
  archiveMessage.value = '';
  generateError.value = '';
  sidebarTab.value = 'active';
  openDateGroups.value = { [todayIsoDate()]: true };
};

const loadDraftIntoWorkspace = (d) => {
  if (!d) return;
  draftId.value = d.id || null;
  currentDraftArchivedAt.value = d.archived_at || null;
  currentDraftCreatedAt.value = d.created_at || null;
  selectedServiceCode.value = d.service_code || '';
  otherServiceCode.value = '';
  if (d.service_code && !(serviceCodeOptions.value || []).includes(String(d.service_code).toUpperCase())) {
    selectedServiceCode.value = '__other__';
    otherServiceCode.value = String(d.service_code);
  }
  selectedProgramId.value = d.program_id ? String(d.program_id) : '';
  dateOfService.value = d.date_of_service ? String(d.date_of_service).slice(0, 10) : todayIsoDate();
  initials.value = d.initials || '';
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
  if (outputObj.value?.meta?.includeInteractiveComplexity != null) {
    includeInteractiveComplexity.value = !!outputObj.value.meta.includeInteractiveComplexity;
  }
  const dayKey = draftCreatedKey(d.created_at);
  openDateGroups.value = { ...openDateGroups.value, [dayKey]: true };
  archiveMessage.value = '';
};

const archiveCurrentDraft = async () => {
  if (!draftId.value || !currentAgencyId.value || archivingDraft.value) return;
  const nextArchived = !isCurrentDraftArchived.value;
  try {
    archivingDraft.value = true;
    archiveMessage.value = '';
    const res = await api.post(
      `/clinical-notes/drafts/${draftId.value}/archive`,
      { agencyId: currentAgencyId.value, archived: nextArchived },
      { skipGlobalLoading: true }
    );
    currentDraftArchivedAt.value = res?.data?.draft?.archived_at || (nextArchived ? new Date().toISOString() : null);
    archiveMessage.value = nextArchived
      ? 'Moved to Archive. Still deletes after 7 days — copy to your EHR if needed.'
      : 'Restored to Active.';
    if (nextArchived) sidebarTab.value = 'archived';
    else sidebarTab.value = 'active';
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
    includeInteractiveComplexity: includeInteractiveComplexity.value,
    interventionTypes: selectedInterventionTypes.value
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
  if (!dateOfService.value) dateOfService.value = todayIsoDate();
  if (String(route.query?.new || '') === '1' || String(route.query?.newNote || '') === '1') {
    startNewNote();
  }
  if (canUseTool.value) {
    await bootstrapWorkspace();
  }

  autosaveTimer = window.setInterval(() => {
    autosave();
  }, 30_000);
});

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
}, { deep: true });

watch([canUseTool, isRecordSessionIntent], ([enabled, recordIntent]) => {
  if (!enabled || !recordIntent || recordSessionIntentHandled.value) return;
  openRecordSessionModal();
  recordSessionIntentHandled.value = true;
});

watch(currentAgencyId, async (next, prev) => {
  // Ignore initial assignment and null flickers during agency store refresh.
  if (!next || prev == null) return;
  if (String(next) === String(prev)) return;
  await bootstrapWorkspace({ resetForm: true });
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
  margin: -20px 0 0;
  background: linear-gradient(180deg, #eef7f5 0%, var(--na-canvas) 28%, #f8fafc 100%);
  color: var(--na-text);
  display: flex;
  flex-direction: column;
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
  position: sticky;
  top: 0;
  z-index: 5;
}

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
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 0;
  width: 100%;
  flex: 1;
  min-height: 0;
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
  padding: 18px 28px 40px;
  width: 100%;
  max-width: none;
  min-width: 0;
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

.na-config {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 14px 0;
}

.na-step {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  background: white;
  border: 1px solid var(--na-border);
  border-radius: 14px;
  padding: 14px;
}

.na-step-num {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--na-teal-soft);
  color: var(--na-teal-dark);
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.85rem;
}

.na-label {
  display: block;
  font-weight: 700;
  margin-bottom: 8px;
}

.na-field-hint {
  display: block;
  font-size: 0.75rem;
  color: var(--na-muted);
  margin-bottom: 4px;
}

.na-input,
.na-textarea {
  width: 100%;
  border: 1px solid var(--na-border);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  background: white;
}

.na-textarea {
  resize: vertical;
  min-height: 140px;
  line-height: 1.45;
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
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
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
}

.na-output-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.na-output-head h2,
.na-output--empty h2,
.na-interventions h3 {
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
  border: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
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

.na-interventions {
  margin: 16px 0 12px;
}

.na-intervention-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px 12px;
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
}

.btn-primary,
.recording-now-btn {
  background: var(--na-teal);
  border-color: var(--na-teal);
  color: white;
}

.btn-secondary {
  background: white;
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
  .na-shell {
    grid-template-columns: 1fr;
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

