<template>
  <div class="pw-page">
    <div class="pw-header">
      <div class="pw-header-left">
        <button type="button" class="pw-back" @click="goBackToPayroll">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg>
          Back to Payroll
        </button>
        <h1>Payroll Wizard</h1>
        <p class="pw-subtitle">We'll guide you through each step to run payroll accurately.</p>
      </div>
      <div class="pw-header-right">
        <div class="pw-org-chip">
          <span class="pw-org-label">Organization</span>
          <strong>{{ agencyStore.currentAgency?.name || '—' }}</strong>
        </div>
        <button
          v-if="selectedPeriodId && hasSavedProgress"
          type="button"
          class="pw-resume-chip"
          title="Progress is saved for this pay period"
        >
          Resume ready
        </button>
      </div>
    </div>

    <div v-if="pageError" class="pw-error">{{ pageError }}</div>
    <div v-if="loading" class="pw-loading">Loading wizard…</div>

    <template v-else>
      <!-- Phase + sub-step navigation -->
      <div class="pw-nav card">
        <div class="pw-phases">
          <button
            v-for="(phase, i) in phases"
            :key="phase.key"
            type="button"
            class="pw-phase"
            :class="{
              active: currentPhaseIdx === i,
              done: currentPhaseIdx > i,
              upcoming: currentPhaseIdx < i
            }"
            :title="`Go to ${phase.title}`"
            @click="goToPhase(i)"
          >
            <div class="pw-phase-icon" v-html="phase.icon"></div>
            <div class="pw-phase-text">
              <div class="pw-phase-title">{{ i + 1 }}. {{ phase.title }}</div>
              <div class="pw-phase-sub">
                <template v-if="currentPhaseIdx === i">
                  {{ phaseStepPosition }} · {{ currentStep?.title }}
                </template>
                <template v-else>{{ phase.subtitle }}</template>
              </div>
            </div>
          </button>
        </div>

        <div class="pw-substeps" v-if="phaseSteps.length">
          <div class="pw-substeps-label">
            {{ currentPhase?.title }} —
            step {{ phaseStepIndex + 1 }} of {{ phaseSteps.length }}
          </div>
          <div class="pw-substeps-rail">
            <button
              v-for="(s, si) in phaseSteps"
              :key="s.key"
              type="button"
              class="pw-substep"
              :class="{
                active: s.globalIdx === stepIdx,
                done: s.globalIdx < stepIdx,
                upcoming: s.globalIdx > stepIdx
              }"
              @click="goToStep(s.globalIdx)"
            >
              <span class="pw-substep-num">{{ si + 1 }}</span>
              <span class="pw-substep-title">{{ s.title }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Main step card -->
      <div class="pw-main card">
        <div class="pw-step-label">
          Step {{ stepIdx + 1 }} of {{ steps.length }}
          <span class="pw-step-label-phase">· {{ currentPhase?.title }} {{ phaseStepPosition }}</span>
        </div>
        <h2 class="pw-step-title">{{ currentStep?.title }}</h2>
        <p class="pw-step-desc">{{ currentStep?.description }}</p>

        <div class="pw-step-grid" :class="{ 'pw-step-grid--wide': currentStep?.key === 'upload_reports' || showRawPanel || showClaimsPanel || showStagePanel }">
          <div class="pw-step-primary">
            <!-- Step 1: Upload reports (current + prior v2 + two-ago v3) -->
            <template v-if="currentStep?.key === 'upload_reports'">
              <div class="pw-upload-layout">
                <div class="pw-upload-card">
                  <div class="pw-upload-card-head">
                    <span class="pw-step-num">1</span>
                    <div>
                      <div class="pw-upload-card-title">Select Current Pay Period</div>
                      <div class="hint">This is the period you are running payroll for.</div>
                    </div>
                  </div>
                  <div class="field" style="margin-top: 12px;">
                    <label>Current pay period</label>
                    <select v-model="selectedPeriodId" @change="onPeriodChange">
                      <option :value="null" disabled>Select a pay period…</option>
                      <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                    </select>
                  </div>
                  <div v-if="selectedPeriod" class="pw-selection-card" style="margin-top: 12px;">
                    <div class="pw-selection-icon" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    </div>
                    <div>
                      <div class="pw-selection-label">Current Pay Period</div>
                      <div class="pw-selection-value">{{ periodRangeLabel(selectedPeriod) }}</div>
                      <div class="pw-selection-meta">Pay Date: {{ payDateLabel(selectedPeriod) }}</div>
                    </div>
                  </div>
                  <div class="pw-status-box" v-if="selectedPeriod" style="margin-top: 10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>
                    <div>
                      <strong>Pay Period Status</strong>
                      <div>{{ statusHelpText }}</div>
                    </div>
                  </div>
                </div>

                <div class="pw-upload-card">
                  <div class="pw-upload-card-head">
                    <span class="pw-step-num">2</span>
                    <div>
                      <div class="pw-upload-card-title">Upload Reports</div>
                      <div class="hint">Current file, then today’s version of last period (Run 2), then two periods ago (Run 3).</div>
                    </div>
                  </div>

                  <div class="pw-upload-slots" :key="`wizard-files-${uploadResetKey}`">
                    <!-- Current period slot -->
                    <div class="field">
                      <label>Current payroll file</label>
                      <div class="hint muted" style="margin-bottom: 6px;">
                        Import into <strong>{{ selectedPeriod ? periodRangeLabel(selectedPeriod) : 'current period' }}</strong>
                      </div>
                      <div v-if="existingImports.current && !uploadFiles.current" class="pw-existing-import">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>
                        <div class="pw-existing-import-info">
                          <span class="pw-existing-import-name">{{ existingImports.current.original_filename || 'Imported file' }}</span>
                          <span class="pw-existing-import-meta">{{ existingImports.current.row_count ?? '?' }} rows· {{ importUploadedLabel(existingImports.current) || 'previously uploaded' }}</span>
                        </div>
                        <label class="btn btn-secondary btn-xs pw-replace-btn" :class="{ disabled: uploading }">
                          Replace
                          <input type="file" style="display:none" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onUploadPick($event, 'current')" :disabled="!selectedPeriodId || uploading" />
                        </label>
                      </div>
                      <div v-else class="pw-file-row">
                        <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onUploadPick($event, 'current')" :disabled="!selectedPeriodId || uploading" />
                        <button v-if="uploadFiles.current" type="button" class="btn btn-secondary btn-sm" @click="clearUploadSlot('current')" :disabled="uploading">Clear</button>
                      </div>
                      <div v-if="uploadFiles.current" class="hint" style="margin-top: 4px;">Selected: <strong>{{ uploadFiles.current.name }}</strong></div>
                      <div v-if="uploadResults.current" class="hint pw-ok">{{ uploadResults.current }}</div>
                    </div>

                    <!-- Prior period slot (Run 2) -->
                    <div class="field">
                      <label>Last pay period — today’s report (Run 2)</label>
                      <div class="hint muted" style="margin-bottom: 6px;">
                        Version 2 for
                        <strong>{{ priorPeriod ? periodRangeLabel(priorPeriod) : 'prior period' }}</strong>
                      </div>
                      <div v-if="existingImports.prior && !uploadFiles.prior" class="pw-existing-import">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>
                        <div class="pw-existing-import-info">
                          <span class="pw-existing-import-name">{{ existingImports.prior.original_filename || 'Imported file' }}</span>
                          <span class="pw-existing-import-meta">{{ existingImports.prior.row_count ?? '?' }} rows · {{ importUploadedLabel(existingImports.prior) || 'previously uploaded' }}</span>
                        </div>
                        <label class="btn btn-secondary btn-xs pw-replace-btn" :class="{ disabled: !priorPeriod || uploading }">
                          Replace
                          <input type="file" style="display:none" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onUploadPick($event, 'prior')" :disabled="!priorPeriod || uploading" />
                        </label>
                      </div>
                      <div v-else class="pw-file-row">
                        <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onUploadPick($event, 'prior')" :disabled="!priorPeriod || uploading" />
                        <button v-if="uploadFiles.prior" type="button" class="btn btn-secondary btn-sm" @click="clearUploadSlot('prior')" :disabled="uploading">Clear</button>
                      </div>
                      <div v-if="!priorPeriod && selectedPeriodId" class="hint muted" style="margin-top: 4px;">No contiguous prior period found for this selection.</div>
                      <div v-if="uploadFiles.prior" class="hint" style="margin-top: 4px;">Selected: <strong>{{ uploadFiles.prior.name }}</strong></div>
                      <div v-if="uploadResults.prior" class="hint pw-ok">{{ uploadResults.prior }}</div>
                    </div>

                    <!-- Two-ago period slot (Run 3) -->
                    <div class="field">
                      <label>Two pay periods ago — today’s report (Run 3)</label>
                      <div class="hint muted" style="margin-bottom: 6px;">
                        Version 3 for
                        <strong>{{ twoAgoPeriod ? periodRangeLabel(twoAgoPeriod) : 'period two back' }}</strong>
                      </div>
                      <div v-if="existingImports.twoAgo && !uploadFiles.twoAgo" class="pw-existing-import">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>
                        <div class="pw-existing-import-info">
                          <span class="pw-existing-import-name">{{ existingImports.twoAgo.original_filename || 'Imported file' }}</span>
                          <span class="pw-existing-import-meta">{{ existingImports.twoAgo.row_count ?? '?' }} rows · {{ importUploadedLabel(existingImports.twoAgo) || 'previously uploaded' }}</span>
                        </div>
                        <label class="btn btn-secondary btn-xs pw-replace-btn" :class="{ disabled: !twoAgoPeriod || uploading }">
                          Replace
                          <input type="file" style="display:none" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onUploadPick($event, 'twoAgo')" :disabled="!twoAgoPeriod || uploading" />
                        </label>
                      </div>
                      <div v-else class="pw-file-row">
                        <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onUploadPick($event, 'twoAgo')" :disabled="!twoAgoPeriod || uploading" />
                        <button v-if="uploadFiles.twoAgo" type="button" class="btn btn-secondary btn-sm" @click="clearUploadSlot('twoAgo')" :disabled="uploading">Clear</button>
                      </div>
                      <div class="hint muted" style="margin-top: 4px;">Optional if you only need current + prior Run 2.</div>
                      <div v-if="uploadFiles.twoAgo" class="hint" style="margin-top: 4px;">Selected: <strong>{{ uploadFiles.twoAgo.name }}</strong></div>
                      <div v-if="uploadResults.twoAgo" class="hint pw-ok">{{ uploadResults.twoAgo }}</div>
                    </div>
                  </div>

                  <div class="pw-actions-stack" style="margin-top: 14px;">
                    <button
                      type="button"
                      class="btn btn-primary"
                      :disabled="!canUploadReports || uploading"
                      @click="uploadAllReports"
                    >
                      {{ uploading ? 'Uploading…' : 'Upload selected reports' }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-secondary"
                      :disabled="!selectedPeriodId || uploading"
                      @click="markCompleteAndNext"
                    >
                      Skip uploads (already imported)
                    </button>
                  </div>
                  <div v-if="uploadError" class="pw-error" style="margin-top: 10px;">{{ uploadError }}</div>
                </div>
              </div>
            </template>

            <!-- Generic guided steps -->
            <template v-else>
              <!-- Inline Raw Import panel -->
              <template v-if="showRawPanel">
                <div class="pw-inline-panel">
                  <PayrollRawImportPanel
                    :key="`${rawPanelPeriodId}-${rawPanelMode}`"
                    :period-id="rawPanelPeriodId"
                    :period-label="rawPanelPeriodLabel"
                    :period-status="rawPanelPeriodStatus"
                    :initial-mode="rawPanelMode"
                    :embedded="true"
                    @close="closeRawPanel"
                  />
                  <div class="pw-inline-panel-footer">
                    <button type="button" class="btn btn-secondary btn-sm" @click="closeRawPanel">Collapse</button>
                    <button type="button" class="btn btn-secondary btn-sm" @click="openRawOnPayrollPage">Open full Raw Import on Payroll page</button>
                  </div>
                </div>
              </template>

              <!-- Inline Claims panel -->
              <template v-else-if="showClaimsPanel">
                <div class="pw-inline-panel">
                  <PayrollClaimsPanel
                    :key="`claims-${selectedPeriodId}`"
                    :agency-id="agencyId"
                    :period-id="selectedPeriodId"
                    :period-label="periodRangeLabel(selectedPeriod)"
                    :period-status="selectedPeriod?.status || ''"
                  />
                  <div class="pw-inline-panel-footer">
                    <button type="button" class="btn btn-secondary btn-sm" @click="closeClaimsPanel">Collapse</button>
                    <button type="button" class="btn btn-secondary btn-sm" @click="openClaimsOnPayrollPage">Open full Stage on Payroll page</button>
                  </div>
                </div>
              </template>

              <!-- Inline Manual Pay / Adjustments panel -->
              <template v-else-if="showStagePanel">
                <div class="pw-inline-panel">
                  <PayrollStagePanel
                    :key="`stage-${selectedPeriodId}`"
                    :agency-id="agencyId"
                    :period-id="selectedPeriodId"
                    :period-label="periodRangeLabel(selectedPeriod)"
                    :period-status="selectedPeriod?.status || ''"
                  />
                  <div class="pw-inline-panel-footer">
                    <button type="button" class="btn btn-secondary btn-sm" @click="closeStagePanel">Collapse</button>
                    <button type="button" class="btn btn-secondary btn-sm" @click="openStageOnPayrollPage">Open full Stage on Payroll page</button>
                  </div>
                </div>
              </template>

              <template v-else>
                <ul class="pw-checklist">
                  <li v-for="(item, idx) in (currentStep?.checklist || [])" :key="idx">{{ item }}</li>
                </ul>

                <div class="pw-actions-stack">
                  <button
                    v-for="action in (currentStep?.actions || [])"
                    :key="action.id"
                    type="button"
                    :class="action.primary ? 'btn btn-primary' : 'btn btn-secondary'"
                    :disabled="!selectedPeriodId || actionDisabled(action)"
                    @click="runStepAction(action)"
                  >
                    {{ action.label }}
                  </button>
                  <button
                    v-if="currentStep?.skippable"
                    type="button"
                    class="btn btn-secondary"
                    @click="markCompleteAndNext"
                  >
                    Skip this step
                  </button>
                </div>

                <div v-if="actionMessage" class="pw-action-msg" :class="{ error: actionError }">{{ actionMessage }}</div>
              </template>
            </template>
          </div>

          <div class="pw-step-side" v-if="currentStep?.key !== 'upload_reports' && !showRawPanel && !showClaimsPanel && !showStagePanel">
            <div class="pw-tip">
              <div class="pw-tip-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12c.8.8 1.2 1.7 1.2 2.7V17h5.6v-.3c0-1 .4-1.9 1.2-2.7A7 7 0 0 0 12 2z"/></svg>
              </div>
              <div>
                <strong>Tip</strong>
                <p>{{ currentStep?.tip || 'Complete this step carefully before continuing. Progress is saved automatically.' }}</p>
              </div>
            </div>

            <div class="pw-progress-note" v-if="selectedPeriodId">
              <strong>Saved progress</strong>
              <p class="muted">
                {{ hasSavedProgress ? `Last saved ${lastSavedLabel}. You can leave and resume anytime.` : 'Progress will save when you continue.' }}
              </p>
            </div>
          </div>

          <div class="pw-step-side" v-else>
            <div class="pw-tip">
              <div class="pw-tip-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12c.8.8 1.2 1.7 1.2 2.7V17h5.6v-.3c0-1 .4-1.9 1.2-2.7A7 7 0 0 0 12 2z"/></svg>
              </div>
              <div>
                <strong>Tip</strong>
                <p>{{ currentStep?.tip }}</p>
              </div>
            </div>
            <div class="pw-timeline" v-if="selectedPeriod">
              <h3>What these files mean</h3>
              <div class="pw-timeline-item" :class="{ done: !!existingImports.current }">
                <span class="pw-timeline-dot" :class="{ empty: !existingImports.current }"></span>
                <div>
                  <strong>Current</strong>
                  <div class="muted">{{ periodRangeLabel(selectedPeriod) }} — new payroll import</div>
                  <div v-if="existingImports.current" class="pw-timeline-imported">✔ {{ existingImports.current.row_count ?? '?' }} rows imported</div>
                  <div v-else-if="loadingExistingImports" class="muted" style="font-size:11px">Checking…</div>
                  <div v-else class="muted" style="font-size:11px;color:#c97a00">⚠ Not yet imported</div>
                </div>
              </div>
              <div class="pw-timeline-item" :class="{ done: !!existingImports.prior }">
                <span class="pw-timeline-dot" :class="{ empty: !priorPeriod }"></span>
                <div>
                  <strong>Prior (Run 2)</strong>
                  <div class="muted">{{ priorPeriod ? periodRangeLabel(priorPeriod) : '—' }} — catch late notes from last period</div>
                  <div v-if="existingImports.prior" class="pw-timeline-imported">✔ {{ existingImports.prior.row_count ?? '?' }} rows imported</div>
                  <div v-else-if="priorPeriod && !loadingExistingImports" class="muted" style="font-size:11px;color:#c97a00">⚠ Not yet imported</div>
                </div>
              </div>
              <div class="pw-timeline-item" :class="{ done: !!existingImports.twoAgo }">
                <span class="pw-timeline-dot" :class="{ empty: !twoAgoPeriod }"></span>
                <div>
                  <strong>Two ago (Run 3)</strong>
                  <div class="muted">{{ twoAgoPeriod ? periodRangeLabel(twoAgoPeriod) : '—' }} — catch remaining late notes</div>
                  <div v-if="existingImports.twoAgo" class="pw-timeline-imported">✔ {{ existingImports.twoAgo.row_count ?? '?' }} rows imported</div>
                  <div v-else-if="twoAgoPeriod && !loadingExistingImports" class="muted" style="font-size:11px">— optional</div>
                </div>
              </div>
            </div>
            <div class="pw-progress-note" v-if="selectedPeriodId">
              <strong>Saved progress</strong>
              <p class="muted">
                {{ hasSavedProgress ? `Last saved ${lastSavedLabel}. You can leave and resume anytime.` : 'Progress will save when you continue.' }}
              </p>
            </div>
          </div>
        </div>

        <div class="pw-footer-actions">
          <button type="button" class="btn btn-secondary" @click="goBackToPayroll">Cancel</button>
          <div class="pw-footer-right">
            <button type="button" class="btn btn-secondary" @click="goBack" :disabled="stepIdx <= 0 || saving">
              Back
            </button>
            <button
              type="button"
              class="btn btn-primary pw-continue"
              @click="goNext"
              :disabled="!canContinue || saving"
            >
              {{ stepIdx >= steps.length - 1 ? 'Finish' : 'Continue' }}
              <svg v-if="stepIdx < steps.length - 1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Bottom summary -->
      <div class="pw-summary card">
        <h3>What's included in this run?</h3>
        <div class="pw-summary-grid">
          <div class="pw-summary-item">
            <div class="pw-summary-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div>
              <div class="pw-summary-label">Active Providers</div>
              <div class="pw-summary-value">{{ summary.providers }}</div>
            </div>
          </div>
          <div class="pw-summary-item">
            <div class="pw-summary-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            </div>
            <div>
              <div class="pw-summary-label">Total Hours</div>
              <div class="pw-summary-value">{{ summary.hours }}</div>
            </div>
          </div>
          <div class="pw-summary-item">
            <div class="pw-summary-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div>
              <div class="pw-summary-label">Total Payroll</div>
              <div class="pw-summary-value">{{ summary.total }}</div>
            </div>
          </div>
          <div class="pw-summary-item">
            <div class="pw-summary-icon pw-summary-icon--alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            </div>
            <div>
              <div class="pw-summary-label">Phase</div>
              <div class="pw-summary-value">{{ currentPhase?.title || '—' }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useOrganizationStore } from '../../store/organization';
import PayrollRawImportPanel from '../../components/payroll/PayrollRawImportPanel.vue';
import PayrollClaimsPanel from '../../components/payroll/PayrollClaimsPanel.vue';
import PayrollStagePanel from '../../components/payroll/PayrollStagePanel.vue';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const organizationStore = useOrganizationStore();

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || organizationStore.organizationContext?.id || null;
});

const loading = ref(true);
const saving = ref(false);
const pageError = ref('');
const actionMessage = ref('');
const actionError = ref(false);

const periods = ref([]);
const selectedPeriodId = ref(null);
const selectedPeriod = ref(null);
const stepIdx = ref(0);
const wizardState = ref(null);
const summaries = ref([]);

const uploadFiles = ref({ current: null, prior: null, twoAgo: null });
const uploadResults = ref({ current: '', prior: '', twoAgo: '' });
const uploadError = ref('');
const uploading = ref(false);
const uploadResetKey = ref(0);
// Existing imports already on the server for each slot
const existingImports = ref({ current: null, prior: null, twoAgo: null });
const loadingExistingImports = ref(false);

// In-wizard Raw Import overlay (same APIs as Payroll page — stays in sync)
const showRawPanel = ref(false);
const rawPanelPeriodId = ref(null);
const rawPanelPeriodLabel = ref('');
const rawPanelPeriodStatus = ref('');
const rawPanelMode = ref('draft_audit');
const showClaimsPanel = ref(false);
const showStagePanel = ref(false);

/** Org-relevant periods only: schedule-aligned, past/current + at most one upcoming (matches Payroll history). */
const periodsForSelect = computed(() => {
  const source = periods.value || [];
  let all = source.filter((p) => Number(p.schedule_aligned) === 1).slice();
  // Fallback if alignment flags are missing for this org
  if (!all.length) all = source.slice();
  all.sort((a, b) => {
    const ae = String(a?.period_end || '');
    const be = String(b?.period_end || '');
    if (ae !== be) return be.localeCompare(ae);
    return (b?.id || 0) - (a?.id || 0);
  });
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const pastOrCurrent = all.filter((p) => String(p?.period_start || '') <= todayYmd);
  const future = all
    .filter((p) => String(p?.period_start || '') > todayYmd)
    .sort((a, b) => String(a?.period_start || '').localeCompare(String(b?.period_start || '')));
  const next = future.length ? [future[0]] : [];
  const list = [...pastOrCurrent, ...next];
  // Keep a deep-linked / already-selected period visible even if filtered out
  const selId = selectedPeriodId.value;
  if (selId && !list.some((p) => Number(p.id) === Number(selId))) {
    const sel = source.find((p) => Number(p.id) === Number(selId));
    if (sel) list.push(sel);
  }
  return list;
});

const findContiguousPrior = (fromPeriod) => {
  const start = String(fromPeriod?.period_start || '').slice(0, 10);
  if (!start) return null;
  const d = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 1);
  const end = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return (periods.value || []).find((p) => String(p?.period_end || '').slice(0, 10) === end) || null;
};

const priorPeriod = computed(() => findContiguousPrior(selectedPeriod.value));
const twoAgoPeriod = computed(() => findContiguousPrior(priorPeriod.value));

const canUploadReports = computed(() => {
  if (!selectedPeriodId.value || !agencyId.value) return false;
  return !!(uploadFiles.value.current || uploadFiles.value.prior || uploadFiles.value.twoAgo);
});

/** Fetch existing imports for all three slots so the UI shows what's already on the server. */
const loadExistingImports = async () => {
  const ids = {
    current: selectedPeriod.value?.id || null,
    prior: priorPeriod.value?.id || null,
    twoAgo: twoAgoPeriod.value?.id || null,
  };
  if (!ids.current) {
    existingImports.value = { current: null, prior: null, twoAgo: null };
    return;
  }
  loadingExistingImports.value = true;
  try {
    const fetchSlot = async (periodId) => {
      if (!periodId) return null;
      try {
        const resp = await api.get(`/payroll/periods/${periodId}/imports`);
        const list = resp.data?.imports || [];
        // slot_number 1 = current, 2 = prior (Run 2), 3 = two-ago (Run 3)
        return list;
      } catch {
        return null;
      }
    };
    const [currentList, priorList, twoAgoList] = await Promise.all([
      fetchSlot(ids.current),
      fetchSlot(ids.prior),
      fetchSlot(ids.twoAgo),
    ]);
    // Match the run this wizard slot expects — not "any latest import" on that period.
    // Prior still has Run 1 from when it was current; two-ago may have Run 1/2. Those must
    // not look like Version 2 / Version 3 already done.
    // slot_number 1 = current Run 1, 2 = prior Run 2, 3 = two-ago Run 3
    existingImports.value = {
      current: (currentList || []).find((i) => Number(i.slot_number) === 1) || null,
      prior:   (priorList || []).find((i) => Number(i.slot_number) === 2) || null,
      twoAgo:  (twoAgoList || []).find((i) => Number(i.slot_number) === 3) || null,
    };
  } finally {
    loadingExistingImports.value = false;
  }
};

const onUploadPick = (evt, slot) => {
  const file = evt.target.files?.[0] || null;
  uploadFiles.value = { ...uploadFiles.value, [slot]: file };
  uploadResults.value = { ...uploadResults.value, [slot]: '' };
  uploadError.value = '';
};

const clearUploadSlot = (slot) => {
  uploadFiles.value = { ...uploadFiles.value, [slot]: null };
  uploadResults.value = { ...uploadResults.value, [slot]: '' };
  uploadResetKey.value += 1;
  // Re-show the existing import banner if one was present
  // (clearUploadSlot is called after "Clear" — banner will reappear since uploadFiles slot is null again)
};

const importFileToPeriod = async (periodId, file, label, existingImport = null) => {
  const fd = new FormData();
  fd.append('file', file);
  // When this wizard slot already has its expected run, replace that import.
  // Otherwise POST /import assigns the next free slot (Run 2 / Run 3 catch-up).
  const resp = existingImport?.id
    ? await api.post(`/payroll/periods/${periodId}/imports/${existingImport.id}/replace`, fd)
    : await api.post(`/payroll/periods/${periodId}/import`, fd);
  const inserted = resp.data?.inserted ?? resp.data?.rowCount ?? '?';
  return existingImport?.id
    ? `${label}: replaced with ${inserted} rows.`
    : `${label}: imported ${inserted} rows.`;
};

const uploadAllReports = async () => {
  if (!canUploadReports.value) return;
  uploading.value = true;
  uploadError.value = '';
  try {
    const results = { ...uploadResults.value };

    if (uploadFiles.value.current && selectedPeriodId.value) {
      results.current = await importFileToPeriod(
        selectedPeriodId.value,
        uploadFiles.value.current,
        'Current',
        existingImports.value.current
      );
      uploadFiles.value = { ...uploadFiles.value, current: null };
    }

    if (uploadFiles.value.prior && priorPeriod.value?.id) {
      results.prior = await importFileToPeriod(
        priorPeriod.value.id,
        uploadFiles.value.prior,
        'Prior Run 2',
        existingImports.value.prior
      );
      uploadFiles.value = { ...uploadFiles.value, prior: null };
    }

    if (uploadFiles.value.twoAgo && twoAgoPeriod.value?.id) {
      results.twoAgo = await importFileToPeriod(
        twoAgoPeriod.value.id,
        uploadFiles.value.twoAgo,
        'Two-ago Run 3',
        existingImports.value.twoAgo
      );
      uploadFiles.value = { ...uploadFiles.value, twoAgo: null };
    }

    uploadResults.value = results;
    uploadResetKey.value += 1;

    // Persist prior ids for later wizard steps / deep-links
    wizardState.value = {
      ...(wizardState.value || {}),
      priorPeriodId: priorPeriod.value?.id || null,
      twoAgoPeriodId: twoAgoPeriod.value?.id || null,
      completed: {
        ...((wizardState.value?.completed && typeof wizardState.value.completed === 'object') ? wizardState.value.completed : {}),
        upload_reports: true
      }
    };
    await loadPeriodDetails();
    await saveProgress();
    await loadExistingImports();
  } catch (e) {
    uploadError.value = e?.response?.data?.error?.message || e?.message || 'Upload failed';
  } finally {
    uploading.value = false;
  }
};

const iconCalendar = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
const iconReview = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/></svg>`;
const iconAdjust = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><circle cx="19" cy="11" r="2"/><path d="M19 8v1M19 13v1M17.2 9.2l.7.7M20.1 12.1l.7.7M16.5 11H17.5M20.5 11H21.5M17.2 12.8l.7-.7M20.1 9.9l.7-.7"/></svg>`;
const iconPreview = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;
const iconSubmit = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;

const phases = [
  { key: 'uploads', title: 'Upload Reports', subtitle: 'Current + prior catch-up files', icon: iconCalendar, stepKeys: ['upload_reports'] },
  { key: 'prior', title: 'Prior Catch-up', subtitle: 'Draft audit & compare', icon: iconReview, stepKeys: ['draft_audit_prior', 'batch_catchup'] },
  { key: 'review', title: 'Review Data', subtitle: 'Drafts & process codes', icon: iconAdjust, stepKeys: ['drafts', 'h0031', 'h0032', 'h2014', '90853', 'h2032'] },
  { key: 'stage', title: 'Adjustments', subtitle: 'Claims, stage & to-dos', icon: iconPreview, stepKeys: ['claims', 'stage'] },
  { key: 'submit', title: 'Run & Post', subtitle: 'Calculate and publish', icon: iconSubmit, stepKeys: ['run', 'preview', 'post'] }
];

const steps = [
  {
    key: 'upload_reports',
    title: 'Upload Reports',
    description: 'Select the current pay period, then upload the current billing file plus today’s versions of the prior periods (Run 2 last period, Run 3 two periods ago).',
    tip: 'Start with the current payroll file. Then add today’s export of last period (becomes Run 2) and, if needed, two periods ago (becomes Run 3). Prior files catch late notes into this run.',
    skippable: false
  },
  {
    key: 'draft_audit_prior',
    title: 'Draft Audit Prior Period',
    description: 'If you uploaded prior Run 2, review draft-payable decisions on the prior period before comparing.',
    tip: 'Mark unpaid drafts on the prior period so late notes are tracked correctly.',
    checklist: [
      'Review Raw Import for the prior period (stays in this wizard)',
      'Review draft / unpaid rows',
      'Close the panel when finished'
    ],
    actions: [
      { id: 'open_raw_prior', label: 'Review Draft Audit (Prior)', primary: true, open: 'raw', mode: 'draft_audit', usePrior: true },
      { id: 'done', label: 'Mark done & continue', primary: false, complete: true }
    ],
    skippable: true
  },
  {
    key: 'batch_catchup',
    title: 'Compare & Add Late Notes',
    description: 'Compare prior runs and add only the differences into the current pay period.',
    tip: 'Use Process Changes on the Payroll page to compare and apply late notes to the current period.',
    checklist: [
      'Open Process Changes',
      'Select prior period(s) and compare runs',
      'Add selected differences into the current period'
    ],
    actions: [
      { id: 'open_process', label: 'Open Process Changes', primary: true, open: 'process' },
      { id: 'done', label: 'Mark done & continue', primary: false, complete: true }
    ],
    skippable: true
  },
  {
    key: 'drafts',
    title: 'Draft Audit (Current Period)',
    description: 'Review draft-payable decisions in Raw Import and mark unpaid drafts as needed.',
    tip: 'Do this before processing H-codes so unpaid drafts are tracked correctly.',
    checklist: ['Review Draft Audit in this wizard', 'Review and mark unpaid drafts', 'Close when finished'],
    actions: [
      { id: 'open_raw', label: 'Review Draft Audit', primary: true, open: 'raw', mode: 'draft_audit' },
      { id: 'done', label: 'Mark done & continue', primary: false, complete: true }
    ],
    skippable: false
  },
  {
    key: 'h0031',
    title: 'Process H0031',
    description: 'Update H0031 minutes and mark the process Done in Raw Import.',
    tip: 'Unpaid H0031 rows are highlighted — update minutes before continuing.',
    checklist: ['Process H0031 in this wizard', 'Update minutes', 'Mark Done'],
    actions: [
      { id: 'open_raw', label: 'Process H0031', primary: true, open: 'raw', mode: 'process_h0031' },
      { id: 'done', label: 'Mark done & continue', primary: false, complete: true }
    ],
    skippable: false
  },
  {
    key: 'h0032',
    title: 'Process H0032',
    description: 'Update H0032 minutes and mark Done.',
    tip: 'Complete each service-code process before running payroll.',
    checklist: ['Process H0032 in this wizard', 'Update minutes', 'Mark Done'],
    actions: [
      { id: 'open_raw', label: 'Process H0032', primary: true, open: 'raw', mode: 'process_h0032' },
      { id: 'done', label: 'Mark done & continue', primary: false, complete: true }
    ],
    skippable: false
  },
  {
    key: 'h2014',
    title: 'Process H2014',
    description: 'Update H2014 minutes and mark Done.',
    tip: 'Complete each service-code process before running payroll.',
    checklist: ['Process H2014 in this wizard', 'Update minutes', 'Mark Done'],
    actions: [
      { id: 'open_raw', label: 'Process H2014', primary: true, open: 'raw', mode: 'process_h2014' },
      { id: 'done', label: 'Mark done & continue', primary: false, complete: true }
    ],
    skippable: false
  },
  {
    key: '90853',
    title: 'Process 90853',
    description: 'Update 90853 (group therapy) minutes and mark Done.',
    tip: 'Complete each service-code process before running payroll.',
    checklist: ['Process 90853 in this wizard', 'Update minutes', 'Mark Done'],
    actions: [
      { id: 'open_raw', label: 'Process 90853', primary: true, open: 'raw', mode: 'process_90853' },
      { id: 'done', label: 'Mark done & continue', primary: false, complete: true }
    ],
    skippable: false
  },
  {
    key: 'h2032',
    title: 'Process H2032',
    description: 'Update H2032 minutes and mark Done.',
    tip: 'After all H-codes are Done, review employee-submitted claims next.',
    checklist: ['Process H2032 in this wizard', 'Update minutes', 'Mark Done'],
    actions: [
      { id: 'open_raw', label: 'Process H2032', primary: true, open: 'raw', mode: 'process_h2032' },
      { id: 'done', label: 'Mark done & continue', primary: false, complete: true }
    ],
    skippable: false
  },
  {
    key: 'claims',
    title: 'Approve Submitted Claims',
    description: 'Review and approve time claims, mileage, reimbursements, and MedCancel that employees submitted for this pay period.',
    tip: 'Pending claims block a clean run. Approve what belongs in this period, or reject / leave the rest.',
    checklist: [
      'Review Time Claims, Mileage, Reimbursements, and MedCancel',
      'Approve items that belong in this pay period',
      'Reject or leave for later anything that does not'
    ],
    actions: [
      { id: 'open_claims', label: 'Review Pending Claims', primary: true, open: 'claims' },
      { id: 'done', label: 'Mark done & continue', primary: false, complete: true }
    ],
    skippable: false
  },
  {
    key: 'stage',
    title: 'Payroll Stage',
    description: 'Add manual pay (individual or bulk), edit per-provider adjustments, and clear blocking To-Dos before you run.',
    tip: 'Use Manual Add for one-offs, Manual Bulk for meeting attendees, and Provider Adjustments for mileage/bonus/PTO per person.',
    checklist: [
      'Add manual pay lines (individual or bulk)',
      'Edit provider adjustments as needed',
      'Complete blocking To-Dos on the full Stage if any remain'
    ],
    actions: [
      { id: 'open_stage_inline', label: 'Edit Manual Pay & Adjustments', primary: true, open: 'stage_inline' },
      { id: 'open_stage', label: 'Open full Stage on Payroll page', primary: false, open: 'stage' },
      { id: 'open_todos', label: 'Manage To-Dos', primary: false, open: 'todos' },
      { id: 'done', label: 'Mark done & continue', primary: false, complete: true }
    ],
    skippable: false
  },
  {
    key: 'run',
    title: 'Run Payroll',
    description: 'Calculate provider totals for this pay period. Blocked if To-Dos or required submissions are pending.',
    tip: 'Run results stay private until you post. You can re-run after staging fixes.',
    checklist: ['Confirm stage is complete', 'Click Run Payroll', 'Review totals'],
    actions: [
      { id: 'open_run', label: 'Run Payroll on Payroll page', primary: true, open: 'run' },
      { id: 'done', label: 'Already ran — continue', primary: false, complete: true }
    ],
    skippable: false
  },
  {
    key: 'preview',
    title: 'Preview Post',
    description: 'Preview what providers will see and which notifications will send on post.',
    tip: 'Use Preview Post before publishing so there are no surprises.',
    checklist: ['Open Preview Post', 'Spot-check a few providers', 'Confirm notifications look right'],
    actions: [
      { id: 'open_preview', label: 'Open Preview Post', primary: true, open: 'preview' },
      { id: 'done', label: 'Mark done & continue', primary: false, complete: true }
    ],
    skippable: false
  },
  {
    key: 'post',
    title: 'Post Payroll',
    description: 'Post payroll to make it visible to providers. This locks the period as posted.',
    tip: 'Only post when you are confident. You can unpost later from the Payroll page if needed.',
    checklist: ['Confirm run looks correct', 'Post Payroll', 'Verify providers can see results'],
    actions: [
      { id: 'open_post', label: 'Post Payroll on Payroll page', primary: true, open: 'post' },
      { id: 'done', label: 'Already posted — finish', primary: false, complete: true }
    ],
    skippable: false
  }
];

const currentStep = computed(() => steps[stepIdx.value] || steps[0]);

const currentPhaseIdx = computed(() => {
  const key = currentStep.value?.key;
  const idx = phases.findIndex((p) => (p.stepKeys || []).includes(key));
  return idx >= 0 ? idx : 0;
});

const currentPhase = computed(() => phases[currentPhaseIdx.value] || phases[0]);

const phaseSteps = computed(() => {
  const keys = currentPhase.value?.stepKeys || [];
  return keys.map((key) => {
    const globalIdx = steps.findIndex((s) => s.key === key);
    return {
      key,
      title: steps[globalIdx]?.title || key,
      globalIdx: globalIdx >= 0 ? globalIdx : 0
    };
  });
});

const phaseStepIndex = computed(() => {
  const key = currentStep.value?.key;
  const idx = phaseSteps.value.findIndex((s) => s.key === key);
  return idx >= 0 ? idx : 0;
});

const phaseStepPosition = computed(() => {
  const n = phaseSteps.value.length;
  if (!n) return '';
  return `${phaseStepIndex.value + 1}/${n}`;
});

const goToStep = async (idx) => {
  if (!Number.isFinite(idx) || idx < 0 || idx >= steps.length) return;
  if (idx === stepIdx.value) return;
  showRawPanel.value = false;
  showClaimsPanel.value = false;
  showStagePanel.value = false;
  await saveProgress();
  stepIdx.value = idx;
  await saveProgress();
};

const goToPhase = async (phaseIdx) => {
  const phase = phases[phaseIdx];
  if (!phase?.stepKeys?.length) return;
  const firstKey = phase.stepKeys[0];
  const globalIdx = steps.findIndex((s) => s.key === firstKey);
  if (globalIdx >= 0) await goToStep(globalIdx);
};

const hasSavedProgress = computed(() => {
  const s = wizardState.value;
  return !!(s && (s.stepKey || Number.isFinite(Number(s.stepIdx))));
});

const lastSavedLabel = computed(() => {
  const at = wizardState.value?.updatedAt;
  if (!at) return 'previously';
  try {
    return new Date(at).toLocaleString();
  } catch {
    return String(at);
  }
});

const periodStatus = computed(() => String(selectedPeriod.value?.status || '').toLowerCase());

const statusHelpText = computed(() => {
  const st = periodStatus.value;
  if (st === 'posted' || st === 'finalized') return 'Posted: this period is locked for providers.';
  if (st === 'ran') return 'Ran: totals are calculated. Preview, then post when ready.';
  if (st === 'staged' || st === 'raw_imported') return `${st === 'staged' ? 'Staged' : 'Imported'}: you can continue staging and run payroll.`;
  return 'Draft: start by importing the billing report for this period.';
});

const canContinue = computed(() => {
  if (currentStep.value?.key === 'upload_reports') {
    // Period required; uploads can be done now or skipped if already imported
    return !!selectedPeriodId.value;
  }
  return !!selectedPeriodId.value;
});

const summary = computed(() => {
  const rows = summaries.value || [];
  const providers = rows.length;
  const hours = rows.reduce((sum, r) => sum + Number(r.total_hours || 0), 0);
  const total = rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
  return {
    providers: providers || '—',
    hours: providers ? hours.toFixed(1) : '—',
    total: providers ? `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
  };
});

const periodRangeLabel = (p) => {
  if (!p) return '—';
  const a = String(p.period_start || '').slice(0, 10);
  const b = String(p.period_end || '').slice(0, 10);
  return a && b ? `${a} → ${b}` : (a || b || `Period #${p.id}`);
};

const shortRange = (p) => {
  const a = String(p?.period_start || '').slice(0, 10);
  const b = String(p?.period_end || '').slice(0, 10);
  if (!a || !b) return periodRangeLabel(p);
  const fmt = (ymd) => {
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  return `${fmt(a)} – ${fmt(b)}`;
};

const payDateLabel = (p) => {
  const end = String(p?.period_end || '').slice(0, 10);
  if (!end) return '—';
  const d = new Date(`${end}T00:00:00`);
  if (Number.isNaN(d.getTime())) return end;
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

/** Format the upload timestamp for an existing import record. */
const importUploadedLabel = (imp) => {
  if (!imp) return '';
  const ts = imp.created_at || imp.uploaded_at || imp.importedAt || '';
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

const payrollBasePath = () => {
  const slug = String(route.params?.organizationSlug || agencyStore.currentAgency?.slug || '').trim();
  return slug ? `/${slug}/admin/payroll` : '/admin/payroll';
};

const wizardPath = (periodId) => {
  const base = `${payrollBasePath()}/wizard`;
  return periodId ? `${base}/${periodId}` : base;
};

const goBackToPayroll = async () => {
  await saveProgress();
  await router.push({ path: payrollBasePath(), query: selectedPeriodId.value ? { periodId: String(selectedPeriodId.value) } : {} });
};

const actionDisabled = () => false;

const resolveToolPeriod = (usePrior = false) => {
  if (usePrior) {
    const priorId = wizardState.value?.priorPeriodId || priorPeriod.value?.id;
    if (priorId) {
      const p = (periods.value || []).find((x) => Number(x.id) === Number(priorId));
      return p || { id: priorId, period_start: '', period_end: '', status: '' };
    }
  }
  return selectedPeriod.value || (periods.value || []).find((x) => Number(x.id) === Number(selectedPeriodId.value)) || null;
};

const openRawInWizard = async ({ mode = 'draft_audit', usePrior = false } = {}) => {
  await saveProgress();
  const p = resolveToolPeriod(usePrior);
  if (!p?.id) {
    actionError.value = true;
    actionMessage.value = usePrior
      ? 'No prior pay period found. Upload reports first or pick a period with a contiguous prior.'
      : 'Select a pay period first.';
    return;
  }
  rawPanelPeriodId.value = p.id;
  rawPanelPeriodLabel.value = periodRangeLabel(p);
  rawPanelPeriodStatus.value = p.status || selectedPeriod.value?.status || '';
  // If using prior and we only have an id, try to load status
  if (usePrior && !p.status) {
    try {
      const resp = await api.get(`/payroll/periods/${p.id}`);
      const full = resp.data?.period;
      if (full) {
        rawPanelPeriodLabel.value = periodRangeLabel(full);
        rawPanelPeriodStatus.value = full.status || '';
      }
    } catch {
      /* ignore */
    }
  }
  rawPanelMode.value = mode || 'draft_audit';
  showClaimsPanel.value = false;
  showStagePanel.value = false;
  showRawPanel.value = true;
};

const closeRawPanel = () => {
  showRawPanel.value = false;
};

const openClaimsInWizard = async () => {
  await saveProgress();
  if (!selectedPeriodId.value) {
    actionError.value = true;
    actionMessage.value = 'Select a pay period first.';
    return;
  }
  showRawPanel.value = false;
  showStagePanel.value = false;
  showClaimsPanel.value = true;
};

const closeClaimsPanel = () => {
  showClaimsPanel.value = false;
};

const openClaimsOnPayrollPage = async () => {
  await saveProgress();
  showClaimsPanel.value = false;
  await openOnPayroll({ open: 'stage' });
};

const openStageInWizard = async () => {
  await saveProgress();
  if (!selectedPeriodId.value) {
    actionError.value = true;
    actionMessage.value = 'Select a pay period first.';
    return;
  }
  showRawPanel.value = false;
  showClaimsPanel.value = false;
  showStagePanel.value = true;
};

const closeStagePanel = () => {
  showStagePanel.value = false;
};

const openStageOnPayrollPage = async () => {
  await saveProgress();
  showStagePanel.value = false;
  await openOnPayroll({ open: 'stage' });
};

const openRawOnPayrollPage = async () => {
  const periodId = rawPanelPeriodId.value || selectedPeriodId.value;
  await saveProgress();
  const query = {
    periodId: String(periodId),
    wizardOpen: 'raw',
    rawMode: rawPanelMode.value || 'draft_audit',
    wizardReturn: '1',
    wizardStep: currentStep.value?.key || ''
  };
  showRawPanel.value = false;
  await router.push({ path: payrollBasePath(), query });
};

const openOnPayroll = async ({ open, mode = null, usePrior = false }) => {
  await saveProgress();
  const query = {
    periodId: String(selectedPeriodId.value),
    wizardOpen: open
  };
  if (mode) query.rawMode = mode;
  if (usePrior) {
    const priorId = wizardState.value?.priorPeriodId || priorPeriod.value?.id;
    if (priorId) query.periodId = String(priorId);
  }
  query.wizardReturn = '1';
  query.wizardStep = currentStep.value?.key || '';
  await router.push({ path: payrollBasePath(), query });
};

const markStepComplete = async (key) => {
  const completed = {
    ...(wizardState.value?.completed && typeof wizardState.value.completed === 'object' ? wizardState.value.completed : {}),
    [key]: true
  };
  wizardState.value = { ...(wizardState.value || {}), completed };
  await saveProgress();
};

const markCompleteAndNext = async () => {
  await markStepComplete(currentStep.value?.key);
  await goNext();
};

const runStepAction = async (action) => {
  actionMessage.value = '';
  actionError.value = false;
  try {
    if (action.complete) {
      await markCompleteAndNext();
      return;
    }
    // Raw Import / Draft Audit / H-code tools stay in the wizard (shared APIs with Payroll page)
    if (action.open === 'raw') {
      await openRawInWizard({ mode: action.mode || 'draft_audit', usePrior: !!action.usePrior });
      return;
    }
    if (action.open === 'claims') {
      await openClaimsInWizard();
      return;
    }
    if (action.open === 'stage_inline') {
      await openStageInWizard();
      return;
    }
    if (action.open) {
      await openOnPayroll(action);
      return;
    }
  } catch (e) {
    actionError.value = true;
    actionMessage.value = e?.response?.data?.error?.message || e?.message || 'Action failed';
  }
};

const saveProgress = async () => {
  if (!selectedPeriodId.value) return;
  try {
    saving.value = true;
    const state = {
      ...(wizardState.value && typeof wizardState.value === 'object' ? wizardState.value : {}),
      stepIdx: stepIdx.value,
      stepKey: currentStep.value?.key || null,
      priorPeriodId: priorPeriod.value?.id || wizardState.value?.priorPeriodId || null,
      twoAgoPeriodId: twoAgoPeriod.value?.id || wizardState.value?.twoAgoPeriodId || null,
      updatedAt: new Date().toISOString()
    };
    const resp = await api.put(`/payroll/periods/${selectedPeriodId.value}/wizard-progress`, { state });
    wizardState.value = resp.data?.state || state;
  } catch (e) {
    console.warn('Failed to save wizard progress', e);
  } finally {
    saving.value = false;
  }
};

const loadProgress = async () => {
  if (!selectedPeriodId.value) {
    stepIdx.value = 0;
    wizardState.value = null;
    return;
  }
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/wizard-progress`);
    const state = resp.data?.state || null;
    wizardState.value = state && typeof state === 'object' ? state : null;
    let idx = Number(wizardState.value?.stepIdx || 0);
    let key = String(wizardState.value?.stepKey || '').trim();
    // Migrate old step keys from previous wizard versions
    if (key === 'select_period' || key === 'upload_prior_run1' || key === 'upload_current') {
      key = 'upload_reports';
    }
    if (key) {
      const byKey = steps.findIndex((s) => s.key === key);
      if (byKey >= 0) idx = byKey;
    }
    // Optional return from payroll tool: jump to wizardStep query
    const returnStep = String(route.query.wizardStep || '').trim();
    if (returnStep) {
      const byReturn = steps.findIndex((s) => s.key === returnStep);
      if (byReturn >= 0) idx = byReturn;
    }
    stepIdx.value = Number.isFinite(idx) && idx >= 0 ? Math.min(idx, steps.length - 1) : 0;
  } catch (e) {
    wizardState.value = null;
    stepIdx.value = 0;
  }
};

const loadPeriodDetails = async () => {
  if (!selectedPeriodId.value) {
    selectedPeriod.value = null;
    summaries.value = [];
    return;
  }
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}`);
    selectedPeriod.value = resp.data?.period || periods.value.find((p) => p.id === selectedPeriodId.value) || null;
    summaries.value = resp.data?.summaries || [];
  } catch {
    selectedPeriod.value = periods.value.find((p) => Number(p.id) === Number(selectedPeriodId.value)) || null;
    summaries.value = [];
  }
};

const loadPeriods = async () => {
  if (!agencyId.value) return;
  try {
    await api.post('/payroll/periods/ensure-future', { months: 6, pastPeriods: 2 }, { params: { agencyId: agencyId.value } });
    const resp = await api.get('/payroll/periods', { params: { agencyId: agencyId.value, alignedOnly: 'false' } });
    periods.value = resp.data || [];
  } catch (e) {
    pageError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load pay periods';
    periods.value = [];
  }
};

const onPeriodChange = async () => {
  stepIdx.value = 0;
  uploadFiles.value = { current: null, prior: null, twoAgo: null };
  uploadResults.value = { current: '', prior: '', twoAgo: '' };
  uploadError.value = '';
  uploadResetKey.value += 1;
  existingImports.value = { current: null, prior: null, twoAgo: null };
  await loadPeriodDetails();
  await loadProgress();
  await loadExistingImports();
  // Keep prior ids in sync for deep-links even before upload
  wizardState.value = {
    ...(wizardState.value || {}),
    priorPeriodId: priorPeriod.value?.id || null,
    twoAgoPeriodId: twoAgoPeriod.value?.id || null
  };
  await saveProgress();
  const path = wizardPath(selectedPeriodId.value);
  if (route.path !== path) {
    await router.replace({ path, query: {} });
  }
};

const goNext = async () => {
  if (!canContinue.value) return;
  showRawPanel.value = false;
  showClaimsPanel.value = false;
  showStagePanel.value = false;
  await saveProgress();
  if (stepIdx.value >= steps.length - 1) {
    await goBackToPayroll();
    return;
  }
  stepIdx.value += 1;
  await saveProgress();
};

const goBack = async () => {
  if (stepIdx.value <= 0) return;
  showRawPanel.value = false;
  showClaimsPanel.value = false;
  showStagePanel.value = false;
  await saveProgress();
  stepIdx.value -= 1;
  await saveProgress();
};

const bootstrap = async () => {
  loading.value = true;
  pageError.value = '';
  try {
    await loadPeriods();
    const fromRoute = Number(route.params.periodId || route.query.periodId || 0) || null;
    const fromStorage = (() => {
      try {
        if (!agencyId.value) return null;
        const raw = localStorage.getItem(`payroll:lastPeriodId:${agencyId.value}`);
        return Number(raw || 0) || null;
      } catch {
        return null;
      }
    })();
    selectedPeriodId.value = fromRoute || fromStorage || (periodsForSelect.value[0]?.id ?? periods.value[0]?.id ?? null);
    if (selectedPeriodId.value) {
      await loadPeriodDetails();
      await loadProgress();
      loadExistingImports().catch(() => {/* non-critical */});
      // Prefer return step from payroll tool deep-link
      try {
        const returnStep = sessionStorage.getItem('payroll:wizardReturnStep');
        if (returnStep) {
          const byReturn = steps.findIndex((s) => s.key === returnStep);
          if (byReturn >= 0) stepIdx.value = byReturn;
          sessionStorage.removeItem('payroll:wizardReturnStep');
          await saveProgress();
        }
      } catch {
        // ignore
      }
      await saveProgress();
      try {
        localStorage.setItem(`payroll:lastPeriodId:${agencyId.value}`, String(selectedPeriodId.value));
      } catch {
        // ignore
      }
    }
  } finally {
    loading.value = false;
  }
};

watch(agencyId, async (id, prev) => {
  if (id && id !== prev) await bootstrap();
});

onMounted(bootstrap);
</script>

<style scoped>
.pw-page {
  --pw-forest: #1E3A34;
  --pw-forest-hover: #16302b;
  --pw-mint: #E8F5E9;
  --pw-mint-border: #C8E6C9;
  --pw-radius: 12px;
  --pw-shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04);
  max-width: min(1480px, 100%);
  width: 100%;
  margin: 0 auto;
  padding: 8px 16px 40px;
  background: transparent;
  box-sizing: border-box;
}

.pw-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.pw-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--pw-forest);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
}
.pw-header h1 {
  margin: 0;
  font-size: 1.85rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary, #1D2633);
}
.pw-subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}
.pw-header-right {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.pw-org-chip,
.pw-resume-chip {
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 8px 14px;
  box-shadow: var(--pw-shadow);
}
.pw-org-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 120px;
}
.pw-org-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pw-resume-chip {
  background: var(--pw-mint);
  border-color: var(--pw-mint-border);
  color: var(--pw-forest);
  font-weight: 700;
  font-size: 13px;
}

.card {
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--pw-radius);
  box-shadow: var(--pw-shadow);
  padding: 18px 20px;
  margin-bottom: 14px;
}

.pw-nav {
  margin-bottom: 14px;
  padding: 14px 18px 12px;
}
.pw-phases {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  align-items: stretch;
}
.pw-phase {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  position: relative;
  opacity: 0.55;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: opacity 0.15s, background 0.15s, border-color 0.15s;
}
.pw-phase:hover {
  opacity: 0.9;
  background: #f8fafc;
}
.pw-phase.active,
.pw-phase.done {
  opacity: 1;
}
.pw-phase.active {
  background: rgba(30, 58, 52, 0.06);
  border-color: var(--pw-mint-border, #b7d4c4);
}
.pw-phase-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.pw-phase.active .pw-phase-icon {
  background: var(--pw-forest);
  color: #fff;
  box-shadow: 0 0 0 4px rgba(30, 58, 52, 0.12);
}
.pw-phase.done .pw-phase-icon {
  background: var(--pw-mint);
  color: var(--pw-forest);
  border: 1px solid var(--pw-mint-border);
}
.pw-phase-text {
  min-width: 0;
  flex: 1 1 auto;
}
.pw-phase-title {
  font-size: 13px;
  font-weight: 750;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-phase-sub {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-phase.active .pw-phase-sub {
  color: var(--pw-forest);
  font-weight: 600;
}

.pw-substeps {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.pw-substeps-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pw-forest);
  margin-bottom: 8px;
}
.pw-substeps-rail {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pw-substep {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  color: var(--text-secondary, #64748b);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.pw-substep:hover {
  border-color: var(--pw-mint-border, #b7d4c4);
  color: var(--pw-forest);
}
.pw-substep.active {
  background: var(--pw-forest);
  border-color: var(--pw-forest);
  color: #fff;
}
.pw-substep.done {
  background: var(--pw-mint, #e8f5ee);
  border-color: var(--pw-mint-border, #b7d4c4);
  color: var(--pw-forest);
}
.pw-substep-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  font-size: 10px;
  font-weight: 800;
}
.pw-substep.active .pw-substep-num {
  background: rgba(255, 255, 255, 0.22);
}
.pw-substep-title {
  white-space: nowrap;
}

.pw-step-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--pw-forest);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.pw-step-label-phase {
  font-weight: 600;
  color: var(--text-secondary, #64748b);
  text-transform: none;
  letter-spacing: 0;
}
.pw-step-title {
  margin: 0 0 6px;
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.pw-step-desc {
  margin: 0 0 18px;
  color: var(--text-secondary);
  font-size: 0.95rem;
  max-width: 640px;
}

.pw-step-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 20px;
  margin-bottom: 18px;
}
.pw-step-grid--wide {
  grid-template-columns: 1.7fr 0.9fr;
}

.pw-upload-layout {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pw-upload-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 14px 16px;
  background: #f8faf9;
}
.pw-upload-card-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.pw-step-num {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--pw-forest);
  color: #fff;
  font-weight: 800;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pw-upload-card-title {
  font-weight: 750;
  font-size: 14px;
}
.pw-upload-slots {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 12px;
}
.pw-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pw-ok {
  color: var(--success, #2F8F83);
  margin-top: 4px;
}

/* Existing import status banner (shown when a file is already on the server) */
.pw-existing-import {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f0faf5;
  border: 1px solid #b2dfce;
  border-radius: 8px;
  padding: 8px 12px;
  color: #1E3A34;
}
.pw-existing-import > svg {
  flex-shrink: 0;
  color: #2F8F83;
}
.pw-existing-import-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pw-existing-import-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-existing-import-meta {
  font-size: 11px;
  color: #4a7c6a;
}
.btn-xs {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 5px;
  cursor: pointer;
}
.pw-replace-btn {
  flex-shrink: 0;
  cursor: pointer;
}
.pw-replace-btn.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.field select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: #fff;
  font: inherit;
}

.pw-selection-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-top: 14px;
  padding: 14px;
  border-radius: 12px;
  border: 1.5px solid var(--pw-forest);
  background: var(--pw-mint);
}
.pw-selection-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #fff;
  color: var(--pw-forest);
  display: flex;
  align-items: center;
  justify-content: center;
}
.pw-selection-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--pw-forest);
}
.pw-selection-value {
  font-weight: 750;
  margin-top: 2px;
}
.pw-selection-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.pw-status-box {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--pw-mint);
  border: 1px solid var(--pw-mint-border);
  font-size: 13px;
  color: var(--text-primary);
}
.pw-status-box svg {
  color: var(--pw-forest);
  flex: 0 0 auto;
  margin-top: 2px;
}

.pw-checklist {
  margin: 0 0 14px;
  padding-left: 18px;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.55;
}
.pw-actions-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pw-action-msg {
  margin-top: 10px;
  font-size: 13px;
  color: var(--success, #2F8F83);
}
.pw-action-msg.error {
  color: var(--danger, #CC3D3D);
}

.pw-timeline h3 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 750;
}
.pw-timeline-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 14px;
  font-size: 13px;
}
.pw-timeline-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--pw-forest);
  flex: 0 0 auto;
  margin-top: 2px;
  position: relative;
}
.pw-timeline-dot.empty {
  background: #fff;
  border: 2px solid var(--border, #cbd5e1);
}
.pw-timeline-item .muted {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.pw-timeline-imported {
  font-size: 11px;
  color: #2F8F83;
  font-weight: 600;
  margin-top: 2px;
}

.pw-tip {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8faf9;
  border: 1px solid var(--border, #e2e8f0);
  margin-top: 8px;
}
.pw-tip-icon {
  color: var(--pw-forest);
  flex: 0 0 auto;
}
.pw-tip strong {
  display: block;
  font-size: 13px;
  margin-bottom: 4px;
}
.pw-tip p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45;
}
.pw-progress-note {
  margin-top: 12px;
  font-size: 13px;
}
.pw-progress-note strong {
  display: block;
  margin-bottom: 4px;
}

.pw-footer-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border, #e2e8f0);
  flex-wrap: wrap;
}
.pw-footer-right {
  display: flex;
  gap: 8px;
  align-items: center;
}
.pw-continue {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--pw-forest) !important;
  border-color: var(--pw-forest) !important;
  color: #fff !important;
  padding: 10px 16px !important;
  font-weight: 700 !important;
}
.pw-continue:hover:not(:disabled) {
  background: var(--pw-forest-hover) !important;
}

.btn {
  padding: 8px 12px;
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  color: var(--text-primary);
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--pw-forest);
  border-color: var(--pw-forest);
  color: #fff;
}
.btn-secondary:hover:not(:disabled) {
  background: var(--pw-mint);
  border-color: var(--pw-mint-border);
}

.pw-summary h3 {
  margin: 0 0 14px;
  font-size: 1rem;
  font-weight: 750;
}
.pw-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.pw-summary-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 4px 8px;
  border-right: 1px solid var(--border, #e2e8f0);
}
.pw-summary-item:last-child {
  border-right: none;
}
.pw-summary-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--pw-mint);
  color: var(--pw-forest);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.pw-summary-icon--alert {
  background: #FCE8E6;
  color: #C62828;
}
.pw-summary-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.pw-summary-value {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.pw-error {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
}
.pw-loading {
  color: var(--text-secondary);
  padding: 24px 0;
}

@media (max-width: 900px) {
  .pw-phases {
    grid-template-columns: 1fr;
  }
  .pw-step-grid,
  .pw-step-grid--wide {
    grid-template-columns: 1fr;
  }
  .pw-summary-grid {
    grid-template-columns: 1fr 1fr;
  }
  .pw-summary-item {
    border-right: none;
    border-bottom: 1px solid var(--border, #e2e8f0);
    padding-bottom: 10px;
  }
}
@media (max-width: 640px) {
  .pw-summary-grid {
    grid-template-columns: 1fr;
  }
  .pw-phase-sub {
    display: none;
  }
}

/* In-wizard Raw Import — inline expansion inside the step */
.pw-inline-panel {
  margin-top: 16px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.pw-inline-panel :deep(.rip-panel) {
  padding: 16px 18px;
  max-height: 540px;
  overflow-y: auto;
}
.pw-inline-panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 18px 12px;
  border-top: 1px solid var(--border, #e2e8f0);
  background: #f8fafc;
}
</style>
