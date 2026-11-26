<template>
  <div v-if="open" :class="inPage ? 'na-plan-embedded' : 'na-modal-backdrop'">
    <div :class="inPage ? 'na-plan-paper' : 'na-modal na-modal--wide'" :role="inPage ? 'region' : 'dialog'" :aria-labelledby="planHeadingId">
      <header class="na-modal-head">
        <div>
          <component :is="fullPage ? 'h1' : 'h3'" :id="planHeadingId">
            {{ intakeDate ? 'Initial treatment plan' : (props.mode === 'generated' ? 'Review generated treatment plan' : (isUpdaterMode ? 'Update treatment plan' : (isDraftEditor ? 'Edit treatment plan draft' : 'Review imported treatment plan'))) }}
          </component>
          <p v-if="clientLabel || intakeDate" class="na-plan-client">
            <strong v-if="clientLabel">{{ clientLabel }}</strong>
            <span v-if="intakeDate">Intake date {{ intakeDate }}</span>
          </p>
        </div>
        <div class="na-plan-navigation">
          <button v-if="returnToChart" type="button" class="na-btn-outline" :disabled="saving" @click="emit('return-to-chart')">Back to client chart</button>
          <button type="button" class="na-link-btn" :disabled="saving" @click="emit('close')">{{ inPage ? (intakeDate ? 'Back to My Work' : 'Back') : 'Close' }}</button>
        </div>
      </header>

      <nav v-if="inPage && model" class="na-plan-sections-nav" aria-label="Treatment plan sections">
        <button v-for="section in planSections" :key="section.key" type="button" @click="jumpToSection(section.key)">
          {{ section.label }}
          <span v-if="issuesBySection[section.key]?.length" class="na-plan-section-count" :aria-label="`${issuesBySection[section.key].length} fields to complete`">{{ issuesBySection[section.key].length }}</span>
        </button>
      </nav>
      <details v-if="isUpdaterMode || !isDraftEditor" class="na-plan-assist" :open="!model">
        <summary>{{ isUpdaterMode ? 'Suggest revisions with Narriva' : 'Import an existing plan' }}</summary>
        <template v-if="isUpdaterMode">
          <label class="na-label">Changes to consider
            <textarea v-model="providerNarrative" class="na-textarea" rows="3" placeholder="Describe changes to the goals, objectives, or care plan." />
          </label>
          <label class="na-label">Replacement source text (optional)
            <textarea v-model="pasteText" class="na-textarea" rows="3" placeholder="Paste the current plan if you need to revise another version." />
          </label>
          <div class="na-modal-actions na-modal-actions--start">
            <button type="button" class="na-btn-primary" :disabled="proposingUpdate || !model" @click="runUpdaterPropose">
              {{ proposingUpdate ? 'Reviewing sessions and ratings…' : 'Suggest revisions from sessions and ratings' }}
            </button>
          </div>
        </template>
        <template v-else>
          <label class="na-label">Paste plan text
            <textarea v-model="pasteText" class="na-textarea" rows="5" placeholder="Paste treatment plan…" />
          </label>
          <div class="na-modal-actions na-modal-actions--start">
            <button type="button" class="na-btn-outline" :disabled="parsing || !pasteText.trim()" @click="parse">
              {{ parsing ? 'Parsing…' : 'Parse into review' }}
            </button>
          </div>
        </template>
      </details>
      <p v-if="changeSummary" class="hint hint-block">{{ changeSummary }}</p>
      <button v-if="hasProposedObjectiveChanges" type="button" class="na-btn-outline" @click="applyAllRenewalChanges">Apply suggested objective changes</button>

      <p v-if="loadingPlan" class="muted" role="status">Loading plan…</p>
      <p v-if="!model && error" class="error" role="alert">{{ error }}</p>
      <details v-if="importedSourceText" class="hint hint-block"><summary>Original imported treatment plan</summary><pre style="white-space:pre-wrap">{{ importedSourceText }}</pre></details>

      <template v-if="model">
        <div v-if="planAuthoring" class="narriva-plan-actions">
          <button type="button" class="na-btn-primary narriva-plan-button" :disabled="suggestingPlan || !!rewriteKey || saving" @click="runNarrivaPlan()">
            <img :src="NARRIVA_BRAND.icon" alt="" />
            {{ suggestingPlan ? 'Preparing suggestions…' : 'Make this Narriva Compliant' }}
          </button>
          <label class="na-check"><input v-model="includeOtherQuestions" type="checkbox" /> Include third-person rating questions</label>
          <p class="hint">Narriva starts with three goals and three 1–10 objectives. Keep at least two goals with a 1–10 objective and enter each baseline from your assessment.</p>
          <p v-if="draftNotice || suggestingPlan" role="status">{{ suggestingPlan ? 'Preparing the treatment plan for review…' : draftNotice }}</p>
        </div>
        <section class="na-plan-section" :id="sectionId('overview')" tabindex="-1">
          <h2>Plan overview</h2>
          <p class="hint hint-block">The provider and supervisor sign the plan before it goes to the client for approval.</p>
          <label class="na-label">
            Effective date
            <input v-model="model.effectiveDate" type="date" class="na-input" :aria-invalid="!model.effectiveDate" required />
            <span v-if="!model.effectiveDate" class="na-field-error">Choose an effective date.</span>
            <span v-if="importedDraftId || importedSourceText" class="hint">Choose the effective date for the plan being finalized. <button type="button" class="na-btn-outline" @click="model.effectiveDate=todayIsoDate()">Use today</button><button v-if="sourceEffectiveDate" type="button" class="na-btn-outline" @click="model.effectiveDate=sourceEffectiveDate">Keep source date ({{ sourceEffectiveDate }})</button></span>
          </label>
          <p v-if="renewalPolicy" class="hint hint-block" data-plan-review-policy>
            Agency review interval: {{ renewalPolicy.renewAfterDays }} days.
            <template v-if="renewalPolicy.flagEnabled">Review reminder after {{ renewalPolicy.flagAfterDays }} days.</template>
            <template v-else>Review reminders are disabled in agency settings.</template>
            <template v-if="renewalPolicy.renewByDate">Renewal deadline: {{ renewalPolicy.renewByDate }}.</template>
          </p>
          <p v-else class="hint hint-block">{{ renewalPolicyError || 'Loading agency review schedule…' }}</p>
          <p v-if="model.sourceReviewSchedule" class="hint hint-block" data-source-review-schedule>
            Imported text requests review after {{ model.sourceReviewSchedule.renewAfterDays }} days<span v-if="model.sourceReviewSchedule.flagAfterDays"> and a reminder after {{ model.sourceReviewSchedule.flagAfterDays }} days</span>.
            The agency schedule above applies; importing text does not change agency settings.
          </p>

          <label class="na-label">
            Presenting problem
            <textarea v-model="model.presentingProblem" class="na-textarea na-reading-text" rows="4" />
          </label>
        </section>

        <section class="na-plan-section" :id="sectionId('diagnoses')" tabindex="-1">
          <h2>Diagnoses</h2>
          <ClinicalDiagnosisSearch
            v-model="diagnosisQuery"
            :agency-id="agencyId"
            :date-of-service="model.effectiveDate"
            :filter-results="isNewDiagnosis"
            label="Add diagnosis"
            @select="addChartDiagnosis"
          />
          <p v-if="!model.diagnoses.length" class="hint hint-block">No diagnosis is included in this plan.</p>
          <article v-for="(d, di) in model.diagnoses" :key="d.icd10Code" class="na-plan-diagnosis">
            <div class="na-plan-diagnosis-row">
              <div class="na-plan-diagnosis-title">
                <code>{{ d.icd10Code }}</code> <strong>{{ d.description || 'Diagnosis' }}</strong>
                <span v-if="d.isPrimary" class="na-plan-primary">Primary</span>
              </div>
              <div class="na-plan-diagnosis-actions">
                <button v-if="!d.isPrimary" type="button" class="na-link-btn" @click="setPrimary(di)">Make primary</button>
                <button v-if="di > 1" type="button" class="na-link-btn" :aria-label="`Move ${d.icd10Code} up`" @click="moveDx(di, -1)">↑</button>
                <button v-if="di > 0 && di < model.diagnoses.length - 1" type="button" class="na-link-btn" :aria-label="`Move ${d.icd10Code} down`" @click="moveDx(di, 1)">↓</button>
                <button type="button" class="na-link-btn na-btn-danger" :aria-label="`Remove ${d.icd10Code}`" @click="removeDiagnosis(di)">Remove</button>
              </div>
            </div>
            <label class="na-label">
              Clinical justification for {{ d.icd10Code }}
              <textarea v-model="d.justification" class="na-textarea na-reading-text" rows="3" :required="inPage" :aria-invalid="inPage && !d.justification.trim()" />
              <span v-if="inPage && !d.justification.trim()" class="na-field-error">Add the findings that support this diagnosis.</span>
            </label>
          </article>
          <details v-if="model.legacyDiagnosisNarrative" class="na-plan-assist">
            <summary>Original diagnostic narrative</summary>
            <p class="na-clinical-text">{{ model.legacyDiagnosisNarrative }}</p>
          </details>
        </section>

        <section class="na-plan-section" :id="sectionId('goals')" tabindex="-1">
          <div class="na-import-block-head">
            <div>
              <h2>Goals, objectives and interventions</h2>
              <p class="hint hint-block">Set a target date for each objective. Link interventions under the objective they support.</p>
            </div>
            <div class="na-import-block-actions">
              <label class="na-label na-label--inline">
                Apply duration to all
                <select v-model.number="bulkDurationMonths" class="na-input na-input--duration">
                  <option :value="0">Choose…</option>
                  <option v-for="m in durationPresets" :key="`bulk-${m}`" :value="m">{{ durationLabel(m) }}</option>
                </select>
              </label>
              <button type="button" class="na-btn-outline na-btn-outline--sm" :disabled="!bulkDurationMonths" @click="applyDurationToAll">
                Push to all goals
              </button>
              <button type="button" class="na-link-btn" @click="addGoal">Add goal</button>
            </div>
          </div>

          <div v-for="(suggestion, index) in newFocusSuggestions" :key="`focus-${index}`" class="na-rewrite-banner">
            <strong>Possible new treatment focus: {{ suggestion.theme }}</strong>
            <p>{{ suggestion.suggestedGoal }}</p><p>{{ suggestion.rationale }}</p>
            <p class="hint">Based on {{ suggestion.evidence?.length || 0 }} recent signed sessions. Review clinical fit and supply the baseline, target, and timeframe.</p>
            <button type="button" class="na-btn-outline" @click="addSuggestedFocus(suggestion, index)">Add for review</button>
          </div>
          <div v-for="(g, gi) in model.goals" :key="g.editorKey" class="na-import-card na-import-card--goal">
            <div class="na-plan-goal-heading">
              <h3>Goal {{ gi + 1 }}</h3>
              <button type="button" class="na-link-btn na-btn-danger" @click="model.goals.splice(gi, 1)">Remove goal</button>
            </div>
            <label class="na-label">
              Goal statement
              <textarea v-model="g.goalText" class="na-textarea na-textarea--goal" rows="3" placeholder="Goal text" :aria-invalid="!g.goalText.trim()" required @input="g.reviewed=false" />
            </label>


            <div class="na-import-row na-import-row--goal-meta">
              <label class="na-label na-label--inline">
                Duration
                <select v-model.number="g.durationMonths" :class="['na-input na-input--duration',{'na-duration-required':goalsMissingDuration.includes(gi+1)}]" :aria-invalid="goalsMissingDuration.includes(gi+1)" :aria-label="`Duration for goal ${gi+1}`" @change="onGoalDurationChange(g)">
                  <option :value="null">Select…</option>
                  <option v-for="m in durationPresets" :key="`g-${gi}-d-${m}`" :value="m">{{ durationLabel(m) }}</option>
                </select>
              </label>
              <strong v-if="goalsMissingDuration.includes(gi+1)" class="na-required-text">Choose a duration</strong>
              <span v-if="g.durationMonths" class="na-duration-preview">
                Target date: {{ formatDurationPreview(g.durationMonths, model.effectiveDate) }}
              </span>
              <span v-else-if="g.parsedDateHint" class="na-duration-hint muted tiny">
                Paste had date {{ g.parsedDateHint }} — pick a duration instead
              </span>
            </div>

            <p v-if="!g.objectives.length" class="na-field-error">Add at least one objective to this goal.</p>
            <div v-for="(o, oi) in g.objectives" :key="o.editorKey" class="na-import-obj">
              <h4>Objective {{ gi + 1 }}.{{ oi + 1 }}</h4>
              <label class="na-label">
                Objective statement
                <textarea
                  v-model="o.objectiveText"
                  class="na-textarea na-textarea--objective"
                  rows="4"
                  placeholder="Describe the measurable action or change"
                  :aria-invalid="!o.objectiveText.trim()" required
                  @blur="reparseObjectiveScales(o)" @input="o.reviewed=false"
                />
              </label>

              <div v-if="planAuthoring" class="na-objective-controls">
                <label class="na-label">Objective target date
                  <input v-model="o.projectedCompletion" class="na-input" type="date" :min="model.effectiveDate" :aria-invalid="invalidObjectiveDate(o, g)" required @input="o.reviewed=false" />
                  <span v-if="invalidObjectiveDate(o, g)" class="na-field-error">Enter a date on or after the plan’s effective date.</span>
                </label>
                <label class="na-check"><input v-model="o.skipScale" type="checkbox" @change="o.reviewed=false" /> Use an alternate measure for this objective</label>
                <label v-if="o.skipScale" class="na-label">Alternate measure and reason
                  <input v-model="o.scaleExemption" class="na-input" maxlength="230" :aria-invalid="!o.scaleExemption.trim()" required @input="o.reviewed=false" />
                  <span v-if="!o.scaleExemption.trim()" class="na-field-error">Describe the alternate measure and why it is used.</span>
                </label>
              </div>
              <div v-if="!o.skipScale" class="na-import-scale">
                <label class="na-label na-label--scale">
                  Baseline (1–10)
                  <input v-model.number="o.scaleCurrent" class="na-input na-input--scale" :aria-invalid="!scoreEntered(o.scaleCurrent)" required type="number" min="1" max="10" @input="o.scaleEdited = true; onScaleEdit(o)" />
                  <span v-if="!scoreEntered(o.scaleCurrent)" class="na-field-error">Baseline required</span>
                </label>
                <span class="na-scale-arrow" aria-hidden="true">→</span>
                <label class="na-label na-label--scale">
                  Target (1–10)
                  <input v-model.number="o.scaleTarget" class="na-input na-input--scale" :aria-invalid="invalidTarget(o)" required type="number" min="1" max="10" @input="o.scaleEdited = true; onScaleEdit(o)" />
                  <span v-if="invalidTarget(o)" class="na-field-error">Use a target different from the baseline.</span>
                </label>
                <label class="na-label na-label--scale">Direction
                  <select v-model="o.scaleDirection" class="na-input na-input--direction" @change="onScaleEdit(o)">
                    <option :value="null">Select direction</option>
                    <option value="increase">Increase</option>
                    <option value="decrease">Decrease</option>
                  </select>
                </label>
              </div>
              <div v-if="planAuthoring && !o.skipScale" class="na-objective-questions">
                <label class="na-label">Client rating question
                  <span class="hint hint-inline">This is what the client sees when rating this objective at check-in. Keep the question and the 1–10 anchors consistent so the client can compare progress over time.</span>
                  <textarea v-model="o.kioskPrompt" class="na-textarea" rows="2" maxlength="500" :aria-invalid="!o.kioskPrompt.trim()" required @input="o.reviewed=false" />
                  <span v-if="!o.kioskPrompt.trim()" class="na-field-error">Enter the question shown to the client.</span>
                </label>
                <label v-if="includeOtherQuestions" class="na-label">Third-person rating question (optional)
                  <textarea v-model="o.kioskPromptOther" class="na-textarea" rows="2" maxlength="500" @input="o.reviewed=false" />
                </label>
                <details v-if="o.originalText" class="hint"><summary>Original objective</summary><p>{{ o.originalText }}</p></details>
                <button v-if="objectiveNeedsNarrivaRewrite(o)" type="button" class="na-btn-outline" :disabled="suggestingPlan || !!rewriteKey || saving || !o.objectiveText.trim()" @click="runNarrivaPlan(gi, oi)">
                  {{ rewriteKey === `${gi}-${oi}` ? 'Preparing suggestion…' : 'Rewrite on a 1–10 scale' }}
                </button>
              </div>
              <div v-if="o.renewalRecommendation" class="na-rewrite-banner">
                <strong>Renewal recommendation</strong>
                <p>{{ o.renewalRecommendation }}</p>
                <p v-if="o.suggestedObjective">Suggested objective: {{ o.suggestedObjective }}</p>
                <p v-if="o.suggestedInterventions.length">Suggested interventions: {{ o.suggestedInterventions.join(', ') }}</p>
                <button v-if="o.suggestedObjective || o.suggestedInterventions.length" type="button" class="na-btn-outline" @click="applyRenewalChange(g, o)">Accept suggested changes</button>
              </div>
              <NoteAidInterventionPicker
                v-model="o.interventions"
                :agency-id="agencyId"
                :options="interventionOptions"
                :goal-text="g.goalText"
                :objective-text="o.objectiveText"
                @update:model-value="o.reviewed=false"
                @ai-used="aiContentUsed = true; attestAiReviewed = false"
                @catalog-updated="catalogNames = $event"
              />
              <div class="na-import-obj-actions">
                <span class="muted tiny na-scale-hint">{{ directionHint(o) }}</span>
                <button type="button" class="na-link-btn" @click="g.objectives.splice(oi, 1)">Remove</button>
              </div>



              <div v-if="!planAuthoring && objectiveNeedsRewrite(o)" class="na-rewrite-banner">
                <span>This objective is not on a clear 1–10 scale yet.</span>
                <button
                  type="button"
                  class="na-btn-outline na-btn-outline--sm"
                  :disabled="rewriteKey === `${gi}-${oi}`"
                  @click="suggestRewrite(gi, oi)"
                >
                  {{ rewriteKey === `${gi}-${oi}` ? 'Updating…' : 'Suggest 1–10 rewrite (AI)' }}
                </button>
                <button
                  type="button"
                  class="na-btn-outline na-btn-outline--sm"
                  :disabled="rewriteKey === `${gi}-${oi}`"
                  @click="toggleParamEditor(gi, oi)"
                >
                  Update with new parameters
                </button>
              </div>

              <div v-if="o.showParamEditor" class="na-param-editor">
                <label class="na-label">
                  Parameters for AI rewrite
                  <textarea
                    v-model="o.paramInstructions"
                    class="na-textarea"
                    rows="3"
                    placeholder="e.g. Make current anxiety an 8 and target a 3; emphasize CBT thought-challenging…"
                  />
                </label>
                <div class="na-suggestion-actions">
                  <button
                    type="button"
                    class="na-btn-primary na-btn-outline--sm"
                    :disabled="rewriteKey === `${gi}-${oi}` || !String(o.paramInstructions || '').trim()"
                    @click="suggestRewrite(gi, oi, { withParams: true })"
                  >
                    {{ rewriteKey === `${gi}-${oi}` ? 'Rewriting…' : 'Rewrite with parameters' }}
                  </button>
                  <button type="button" class="na-link-btn" @click="o.showParamEditor = false">Cancel</button>
                </div>
              </div>

              <p v-if="o.lastRewriteNote" class="na-rewrite-applied muted tiny">{{ o.lastRewriteNote }}</p>
            </div>
            <button type="button" class="na-btn-outline na-btn-outline--sm" @click="addObjective(gi)">Add objective</button>
          </div>
        </section>

        <section class="na-plan-section" :id="sectionId('care')" tabindex="-1">
          <h2>Frequency and discharge</h2>
          <NoteAidFrequencySelect v-model="model.prescribedFrequency" :agency-id="agencyId" />

          <label class="na-label">
            Discharge criteria and planning
            <textarea
              v-model="model.dischargePlan"
              class="na-textarea"
              rows="4"
              :aria-invalid="!model.dischargePlan.trim()"
              required
              placeholder="Required — criteria for step-down / discharge"
            />
          </label>
          <div v-if="!String(model.dischargePlan || '').trim()" class="na-rewrite-banner">
            <span class="na-field-error">Enter discharge criteria.</span>
            <button
              type="button"
              class="na-btn-outline na-btn-outline--sm"
              :disabled="suggestingDischarge"
              @click="suggestDischarge"
            >
              {{ suggestingDischarge ? 'Suggesting…' : 'Suggest discharge criteria (AI)' }}
            </button>
          </div>

        </section>

        <section class="na-plan-section" :id="sectionId('review')" tabindex="-1">
          <h2>Review and save</h2>
        <details v-if="isDraftEditor" class="na-revision-block">
          <summary>Revise with Narriva</summary>
          <label class="na-label" for="na-plan-addendum">
            Additional information / revision instructions
          </label>
          <textarea
            id="na-plan-addendum"
            v-model="addendum"
            class="na-textarea"
            rows="3"
            placeholder="Tell Note Workspace what to add or revise on this treatment plan…"
          />
          <button
            type="button"
            class="na-btn-outline"
            :disabled="regenerating || !addendum.trim()"
            @click="regenerateFromAddendum"
          >
            {{ regenerating ? 'Regenerating…' : 'Apply revisions with Narriva' }}
          </button>
        </details>

        <div v-if="attemptedFinalize && finalizationIssues.length" ref="finalizationAlert" class="error" role="alert" tabindex="-1">
          <strong>Complete these items before signing</strong>
          <ul>
            <li v-for="issue in finalizationIssues" :key="issue.message">
              <button type="button" class="na-link-btn" @click="jumpToSection(issue.section)">{{ issue.message }}</button>
            </li>
          </ul>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <label v-if="aiContentUsed" class="na-sign-check" :class="{ 'na-sign-check--reviewed': attestAiReviewed }">
          <input v-model="attestAiReviewed" type="checkbox" />
          <span><strong>{{ attestAiReviewed ? 'Review confirmed' : 'Confirm your review' }}</strong><span class="na-sign-check-description">I reviewed the full treatment plan with Narriva superintelligence assistance and confirm it is accurate.</span></span>
        </label>
        <div class="na-modal-actions">
          <button type="button" class="na-btn-outline" @click="emit('close')">Cancel</button>
          <button
            v-if="!embedded && isDraftEditor && Number(props.planId || 0)"
            type="button"
            class="na-btn-outline na-btn-danger"
            :disabled="saving || discarding"
            @click="discardDraft"
          >
            {{ discarding ? 'Discarding…' : 'Discard draft' }}
          </button>
          <p v-if="goalsMissingDuration.length" role="status">Choose a duration of 1–36 months for goals {{ goalsMissingDuration.join(', ') }} before finalizing. You can save an incomplete draft.</p>
          <template v-if="isDraftEditor || isUpdaterMode || allowImportedDraft">
            <button type="button" class="na-btn-outline" :disabled="saving" @click="save({ finalize: false })">
              {{ saving && !finalizing ? 'Saving…' : (allowImportedDraft ? 'Save for review' : 'Save draft') }}
            </button>
            <button
              type="button"
              class="na-btn-primary"
              :disabled="saving || suggestingPlan || !!rewriteKey"
              @click="save({ finalize: true })"
            >
              {{ finalizing ? 'Preparing…' : (inPage ? 'Prepare for signature' : isUpdaterMode ? 'Prepare updated plan for signature' : 'Finalize treatment plan') }}
            </button>
          </template>
          <button
            v-else
            type="button"
            class="na-btn-primary"
            :disabled="saving || suggestingPlan || !!rewriteKey"
            @click="save({ finalize: true })"
          >
            {{ saving ? 'Saving…' : 'Confirm &amp; save to chart' }}
          </button>
        </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue';
import api from '../../services/api';
import { NARRIVA_BRAND } from '../../config/narrivaBrand.js';
import { todayCalendarDate } from '../../utils/formatDate.js';
import NoteAidInterventionPicker from './NoteAidInterventionPicker.vue';
import NoteAidFrequencySelect from './NoteAidFrequencySelect.vue';
import ClinicalDiagnosisSearch from './ClinicalDiagnosisSearch.vue';
import { intakeDiagnoses } from '../../utils/noteAidIntakeIntegration.js';
import { CLINICAL_INTERVENTION_SEED } from '../../config/clinicalInterventionSeed.js';
import {
  DURATION_PRESETS,
  DEFAULT_MEASUREMENT_METHOD,
  completionDateFromDurationMonths,
  durationLabel,
  formatDurationPreview,
  isObjectiveScaleValid,
  parseScalePair,
  inferScaleDirection,
  setObjectiveCompletionTime
} from '../../utils/treatmentPlanDuration.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  embedded: Boolean,
  fullPage: Boolean,
  clientLabel: String,
  intakeDate: String,
  returnToChart: Boolean,
  agencyId: { type: [Number, String], required: true },
  clientId: { type: [Number, String], required: true },
  initialText: { type: String, default: '' },
  allowImportedDraft: { type: Boolean, default: false },
  planId: { type: [Number, String], default: null },
  mode: { type: String, default: 'import' },
  initialPlan: { type: Object, default: null },
  sourceIntakeNoteId: { type: Number, default: null },
  renewalReason: { type: String, default: '' },
  progressExcerpt: { type: String, default: '' }
});

const emit = defineEmits(['close', 'saved', 'draft-updated', 'return-to-chart']);

const inPage = computed(() => props.fullPage || props.embedded);
const planHeadingId = `treatment-plan-${useId()}`;
const planSections = [
  { key: 'overview', label: 'Overview' },
  { key: 'diagnoses', label: 'Diagnoses' },
  { key: 'goals', label: 'Goals' },
  { key: 'care', label: 'Frequency and discharge' },
  { key: 'review', label: 'Review and save' }
];
const sectionId = section => `${planHeadingId}-${section}`;
function jumpToSection(section) {
  const target = document.getElementById(sectionId(section));
  target?.focus({ preventScroll: true });
  target?.scrollIntoView?.({ block: 'start' });
}
let editorKey = 0;
const diagnosisQuery = ref('');
const pasteText = ref('');
const providerNarrative = ref('');
const changeSummary = ref('');
const model = ref(null);
const newFocusSuggestions = ref([]);
function addSuggestedFocus(suggestion, index) {
  if (!model.value) return;
  model.value.goals.push(mapGoal({ goalText: suggestion.suggestedGoal, objectives: [{ objectiveText: suggestion.suggestedObjective, scaleCurrent: null, scaleTarget: null }] }, model.value.effectiveDate));
  newFocusSuggestions.value.splice(index, 1);
}
const importedSourceText = ref('');
const parsing = ref(false);
const proposingUpdate = ref(false);
const saving = ref(false);
const finalizing = ref(false);
const discarding = ref(false);
const regenerating = ref(false);
const loadingPlan = ref(false);
const error = ref('');
const addendum = ref('');
const bulkDurationMonths = ref(0);
const rewriteKey = ref('');
const suggestingDischarge = ref(false);
const durationPresets = DURATION_PRESETS;
const loadedPlanId = ref(null);
const importedDraftId = ref(null);
const aiContentUsed = ref(false);
const draftRevision = ref(0), draftNotice = ref('');
const suggestingPlan = ref(false), includeOtherQuestions = ref(false);
const usesChartDraft = ref(false);
const attemptedFinalize = ref(false);
const finalizationAlert = ref(null);
const scoreEntered = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 10;
const invalidTarget = objective => !scoreEntered(objective.scaleTarget) || Number(objective.scaleCurrent) === Number(objective.scaleTarget);
function invalidObjectiveDate(objective, goal) {
  const date = objective.projectedCompletion || goal.projectedCompletion;
  return !date || date < model.value.effectiveDate;
}
const objectiveNeedsNarrivaRewrite = objective => !objective.skipScale &&
  !(scoreEntered(objective.scaleTarget) && String(objective.kioskPrompt || '').trim());
const planAuthoring = computed(() => props.embedded || usesChartDraft.value || isUpdaterMode.value || !!props.sourceIntakeNoteId);
const hasProposedObjectiveChanges = computed(() => model.value?.goals.some(goal => goal.objectives.some(o =>
  o.renewalRecommendation && (o.suggestedObjective || o.suggestedInterventions.length))));
let editScope = 0;
onBeforeUnmount(() => { editScope += 1; });
const attestAiReviewed = ref(false);
const renewalPolicy = ref(null), renewalPolicyError = ref('');
let renewalPolicyRequest = 0;
watch(() => [props.open, props.agencyId], async ([open, agencyId]) => {
  const request = ++renewalPolicyRequest;
  renewalPolicy.value = null; renewalPolicyError.value = '';
  if (!open || !Number(agencyId)) return;
  try {
    const { data } = await api.get(`/medical-billing/agencies/${Number(agencyId)}/treatment-plan-renewal`, { skipGlobalLoading: true });
    if (request === renewalPolicyRequest) renewalPolicy.value = data?.policy || null;
  } catch {
    if (request === renewalPolicyRequest) renewalPolicyError.value = 'The agency review schedule could not be loaded. Check treatment-plan settings before finalizing.';
  }
}, { immediate: true });

const catalogNames = ref([]);
const interventionOptions = computed(() => [...new Set([...CLINICAL_INTERVENTION_SEED, ...catalogNames.value])]);
let catalogLoadSequence = 0;
watch(() => [props.open, props.agencyId], async ([open, agencyId]) => {
  const sequence = ++catalogLoadSequence;
  catalogNames.value = [];
  if (!open || !Number(agencyId)) return;
  try {
    const result = await api.get('/medical-billing/interventions', { params: { agencyId: Number(agencyId) }, skipGlobalLoading: true });
    if (sequence === catalogLoadSequence) catalogNames.value = Array.isArray(result?.data?.all) ? result.data.all : [];
  } catch { /* Default catalog remains selectable when the catalog cannot be loaded. */ }
}, { immediate: true });

function todayIsoDate() {
  return todayCalendarDate();
}

const isUpdaterMode = computed(
  () => String(props.mode || '').toLowerCase() === 'update' || String(props.mode || '').toLowerCase() === 'updater'
);

const isDraftEditor = computed(
  () => !isUpdaterMode.value
    && (props.mode === 'draft' || !!Number(props.planId || 0) || !!props.initialPlan)
);

function directionHint(o) {
  const cur = Number(o.scaleCurrent);
  const tgt = Number(o.scaleTarget);
  // Number(null|'') === 0 — require real 1–10 ints so empty target never shows "5 → 0 decrease".
  if (!Number.isInteger(cur) || !Number.isInteger(tgt) || cur < 1 || cur > 10 || tgt < 1 || tgt > 10) {
    return '';
  }
  const dir = o.scaleDirection || (tgt > cur ? 'increase' : tgt < cur ? 'decrease' : '');
  if (!dir) return `${cur} → ${tgt}`;
  return `${cur} → ${tgt} ${dir}`;
}

function objectiveNeedsRewrite(o) {
  return !isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget);
}

function onScaleEdit(o) {
  o.reviewed=false;
  o.scaleNeedsRewrite = !isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget);
  if (isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget)) {
    const cur = Number(o.scaleCurrent);
    const tgt = Number(o.scaleTarget);
    o.scaleDirection = tgt > cur ? 'increase' : 'decrease';
    o.measurementMethod = DEFAULT_MEASUREMENT_METHOD;
  }
}

function reparseObjectiveScales(o) {
  if (!o || o.scaleEdited || o.skipScale) return;
  if (isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget)) {
    onScaleEdit(o);
    return;
  }
  const parsed = parseScalePair(o.objectiveText || '');
  if (parsed.scaleCurrent != null) o.scaleCurrent = parsed.scaleCurrent;
  if (parsed.scaleTarget != null) o.scaleTarget = parsed.scaleTarget;
  if (isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget)) {
    o.scaleDirection = inferScaleDirection(o.scaleCurrent, o.scaleTarget, o.scaleDirection);
    o.measurementMethod = DEFAULT_MEASUREMENT_METHOD;
  }
  onScaleEdit(o);
}

function syncGoalCompletion(goal) {
  const months = Number(goal.durationMonths);
  if (months > 0) goal.projectedCompletion = completionDateFromDurationMonths(months, model.value?.effectiveDate || todayIsoDate()) || null;
  goal.durationLabel = months >= 1 ? durationLabel(months) : null;
}

function onGoalDurationChange(goal) {
  syncGoalCompletion(goal);
  if (!Number(goal.durationMonths)) return;
  for (const objective of goal.objectives || []) {
    if (planAuthoring.value) {
      if (!objective.projectedCompletion) objective.projectedCompletion=goal.projectedCompletion;
      objective.reviewed=false;
      continue;
    }
    objective.objectiveText = setObjectiveCompletionTime(objective.objectiveText, goal.durationMonths);
  }
}

function applyDurationToAll() {
  const months = Number(bulkDurationMonths.value);
  if (!months || !model.value?.goals?.length) return;
  for (const g of model.value.goals) {
    g.durationMonths = months;
    onGoalDurationChange(g);
  }
}

function mapGoal(g, effectiveDate, { deriveScores = true } = {}) {
  const stored=String(g.projectedCompletion||g.projected_completion||'').slice(0,10);
  const restoredMonths=effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(stored) ? DURATION_PRESETS.find(months=>completionDateFromDurationMonths(months,effectiveDate)===stored) : null;
  const months = g.durationMonths != null ? Number(g.durationMonths) : restoredMonths || null;
  return {
    editorKey: ++editorKey,
    id: g.id, status: g.status, superseded_at: g.superseded_at, reviewed: g.reviewed === true,
    goalText: g.goalText || g.goal_text || '',
    durationMonths: Number.isFinite(months) && months > 0 ? months : null,
    durationLabel: g.durationLabel || (months ? durationLabel(months) : null),
    parsedDateHint: g.parsedDateHint || null,
    projectedCompletion:
      g.projectedCompletion || g.projected_completion || completionDateFromDurationMonths(months, effectiveDate || todayIsoDate()) || null,
    objectives: (g.objectives || []).map((o) => {
      const text = o.objectiveText || o.objective_text || '';
      let scaleCurrent = o.scaleCurrent ?? o.scale_current ?? null;
      let scaleTarget = o.scaleTarget ?? o.scale_target ?? null;
      if (deriveScores && !isObjectiveScaleValid(scaleCurrent, scaleTarget) && text) {
        const parsed = parseScalePair(text);
        if (parsed.scaleCurrent != null) scaleCurrent = parsed.scaleCurrent;
        if (parsed.scaleTarget != null) scaleTarget = parsed.scaleTarget;
      }
      const scaleDirection = o.scaleDirection
        || o.scale_direction
        || inferScaleDirection(scaleCurrent, scaleTarget);
      return {
        editorKey: ++editorKey,
        id: o.id, status: o.status, superseded_at: o.superseded_at, scaleEdited: !deriveScores,
        reviewed: o.reviewed === true,
        projectedCompletion: String(o.projectedCompletion || o.projected_completion || (usesChartDraft.value ? stored : '')).slice(0,10),
        durationMonths: o.durationMonths || null,
        skipScale: o.skipScale === true || !!o.scaleExemption || String(o.measurement_method || '').startsWith('Alternate measure:'),
        scaleExemption: o.scaleExemption || String(o.measurement_method || '').match(/^Alternate measure:\s*(.+)$/)?.[1] || '',
        kioskPrompt: o.kioskPrompt || o.kiosk_prompt || '',
        kioskPromptOther: o.kioskPromptOther || o.kiosk_prompt_other || '',
        objectiveText: text,
        renewalRecommendation: o.renewalRecommendation || '',
        suggestedObjective: o.suggestedObjective || '',
        suggestedInterventions: o.suggestedInterventions || [],
        scaleCurrent,
        scaleTarget,
        scaleDirection,
        measurementMethod: o.measurementMethod || o.measurement_method || DEFAULT_MEASUREMENT_METHOD,
        scaleNeedsRewrite: !isObjectiveScaleValid(scaleCurrent, scaleTarget),
        interventions: Array.isArray(o.interventions)
          ? o.interventions.filter(Boolean)
          : [],
        pendingSuggestion: null,
        showParamEditor: false,
        paramInstructions: '',
        lastRewriteNote: ''
      };
    })
  };
}

const sourceEffectiveDate=ref('');
function applyPlanRecord(plan) {
  if (!plan) return;
  newFocusSuggestions.value = Array.isArray(plan.newFocusSuggestions) ? plan.newFocusSuggestions : [];
  sourceEffectiveDate.value=(plan.effective_date||plan.effectiveDate||'').toString().slice(0,10);
  importedSourceText.value = plan.recordsImportSource?.text || '';
  const sourceParsed = plan.recordsImportSource?.parsed || {};
  const sourceDiagnoses = sourceParsed.diagnoses?.length ? sourceParsed.diagnoses : plan.diagnoses || [];
  loadedPlanId.value = plan.id || null;
  usesChartDraft.value = !isUpdaterMode.value && (props.embedded || !!(plan.status === 'draft' && (plan.chartDraft || props.sourceIntakeNoteId) && !plan.providerApproved));
  importedDraftId.value = plan.status === 'draft' && (String(plan.source_tool_id || '').startsWith('client_records_import:') || plan.source_tool_id === 'client_creation_record_import') ? plan.id : null;
  const linkedDiagnoses = plan.planDiagnoses || plan.plan_diagnoses || [];
  const sharedJustification = plan.diagnostic_justification || plan.diagnosticJustification || sourceParsed.diagnosticJustification || '';
  const discharge = String(plan.discharge_plan || plan.dischargePlan || '');
  const presentMatch = discharge.match(/Presenting Problem\n([\s\S]*?)(?=\n\n(?:Prescribed Frequency|Discharge Criteria)|$)/i);
  const freqMatch = discharge.match(/Prescribed Frequency(?: of Treatment)?\n([\s\S]*?)(?=\n\nDischarge Criteria|$)/i);
  const discMatch = discharge.match(/Discharge Criteria\s*\/\s*Planning\n([\s\S]*)$/i)
    || discharge.match(/Discharge Plan\n([\s\S]*)$/i);
  model.value = reactive({
    effectiveDate: String(plan.source_tool_id||'').startsWith('client_records_import:') ? todayIsoDate() : (plan.effective_date || plan.effectiveDate || '').toString().slice(0, 10) || todayIsoDate(),
    presentingProblem: plan.presenting_problem || presentMatch?.[1]?.trim() || plan.presentingProblem || '',
    prescribedFrequency: freqMatch?.[1]?.trim() || plan.prescribedFrequency || plan.prescribed_frequency || '',
    dischargePlan: discMatch?.[1]?.trim()
      || plan.dischargePlan
      || (!presentMatch && !freqMatch ? discharge : '')
      || '',
    ...planDiagnosisFields(linkedDiagnoses.length ? linkedDiagnoses : sourceDiagnoses, sharedJustification, { imported: !linkedDiagnoses.length && !!plan.recordsImportSource }),
    goals: (plan.goals || []).map((g) => mapGoal(g, (plan.effective_date || plan.effectiveDate || '').toString().slice(0,10)))
  });
  draftRevision.value = Number(plan.chartDraft?.revision) || 0;
  const working = plan.chartDraft?.value;
  if (working && plan.status === 'draft') {
    const diagnosisFields = planDiagnosisFields(working.diagnoses, working.diagnosticJustification);
    model.value = reactive({
      ...model.value,
      ...working,
      ...diagnosisFields,
      legacyDiagnosisNarrative: working.legacyDiagnosisNarrative || diagnosisFields.legacyDiagnosisNarrative || model.value.legacyDiagnosisNarrative,
      goals: working.goals.map(g => mapGoal(g, working.effectiveDate, { deriveScores: false }))
    });
  }
  if (plan.chartDraft?.value) includeOtherQuestions.value = model.value.goals.some(goal => goal.objectives.some(o=>o.kioskPromptOther));
  if (!model.value.goals.length) addGoal();
}

function planDiagnosisFields(rows = [], shared = '', { imported = false } = {}) {
  const codes = new Map();
  const narrative = String(shared || '').trim();
  for (const row of rows || []) {
    const code = String(row?.icd10Code || row?.icd10_code || row?.code || '').trim().toUpperCase();
    if (!code || codes.has(code)) continue;
    codes.set(code, {
      icd10Code: code,
      description: row.description || '',
      justification: String(row.justification || '').trim(),
      isPrimary: Number(row.isPrimary ?? row.is_primary) === 1
    });
  }
  const diagnoses = [...codes.values()];
  const tagged = /(?:^|\n)\s*(?:\d+[.)]\s*)?[A-TV-Z]\d[\dA-Z](?:\.[A-Z0-9]{1,4})?\s*[:–—-]/i.test(narrative);
  const byCode = new Map(tagged ? intakeDiagnoses({ Diagnosis: diagnoses.map(row => row.icd10Code).join('\n'), 'Diagnostic Justification': narrative })
    .map(row => [row.icd10_code, row.justification]) : []);
  for (const row of diagnoses) {
    const codeSpecific = byCode.get(row.icd10Code);
    if (codeSpecific && codeSpecific !== narrative && (!row.justification || row.justification === narrative)) row.justification = codeSpecific;
    if (diagnoses.length === 1 && !row.justification && !tagged) row.justification = narrative;
    if (imported && diagnoses.length > 1 && row.justification === narrative) row.justification = '';
  }
  const primary = diagnoses.findIndex(row => row.isPrimary);
  if (primary > 0) diagnoses.unshift(...diagnoses.splice(primary, 1));
  diagnoses.forEach((row, index) => { row.isPrimary = index === 0; });
  return { diagnoses, legacyDiagnosisNarrative: narrative && !tagged && !diagnoses.some(row => row.justification === narrative) ? narrative : '' };
}

function primaryJustification() {
  return model.value?.diagnoses[0]?.justification.trim() || '';
}

function setPrimary(index) {
  const rows = model.value.diagnoses;
  rows.unshift(...rows.splice(index, 1));
  rows.forEach((row, i) => { row.isPrimary = i === 0; });
}
function moveDx(index, delta) {
  const rows = model.value.diagnoses;
  const next = index + delta;
  if (next < 1 || next >= rows.length) return;
  const [item] = rows.splice(index, 1);
  rows.splice(next, 0, item);
}
function removeDiagnosis(index) {
  model.value.diagnoses.splice(index, 1);
  if (model.value.diagnoses.length) setPrimary(0);
}
function isNewDiagnosis(row) {
  return !model.value?.diagnoses.some(d => d.icd10Code === row.code);
}
function addChartDiagnosis(diagnosis) {
  diagnosisQuery.value = '';
  if (!model.value || !isNewDiagnosis(diagnosis)) return;
  model.value.diagnoses.push({
    icd10Code: diagnosis.code,
    description: diagnosis.description,
    justification: '',
    isPrimary: model.value.diagnoses.length === 0
  });
}

function addGoal() {
  if (!model.value) return;
  model.value.goals.push({
    editorKey: ++editorKey,
    goalText: '',
    durationMonths: null,
    durationLabel: null,
    parsedDateHint: null,
    projectedCompletion: null,
    objectives: []
  });
}

function addObjective(gi) {
  model.value.goals[gi].objectives.push({
    editorKey: ++editorKey,
    objectiveText: '',
    scaleCurrent: null,
    scaleTarget: null,
    scaleDirection: null,
    measurementMethod: DEFAULT_MEASUREMENT_METHOD,
    scaleNeedsRewrite: true,
    reviewed:false, projectedCompletion:'', durationMonths:null, skipScale:false, scaleExemption:'', kioskPrompt:'', kioskPromptOther:'',
    interventions: [],
    pendingSuggestion: null,
    showParamEditor: false,
    paramInstructions: '',
    lastRewriteNote: ''
  });
}

function toggleParamEditor(gi, oi) {
  const o = model.value?.goals?.[gi]?.objectives?.[oi];
  if (!o) return;
  o.showParamEditor = !o.showParamEditor;
}

function applySuggestionToObjective(o, suggestion) {
  if (!o || !suggestion) return;
  o.objectiveText = suggestion.objectiveText;
  o.scaleCurrent = suggestion.scaleCurrent;
  o.scaleTarget = suggestion.scaleTarget;
  o.scaleDirection = suggestion.scaleDirection;
  o.measurementMethod = DEFAULT_MEASUREMENT_METHOD;
  o.scaleNeedsRewrite = !isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget);
  o.pendingSuggestion = null;
  o.showParamEditor = false;
  o.paramInstructions = '';
  o.lastRewriteNote = `Updated ${suggestion.scaleCurrent} → ${suggestion.scaleTarget} (${suggestion.scaleDirection})${
    suggestion.source === 'heuristic' ? ' · offline fallback' : ''
  }. ${suggestion.explanation || ''}`.trim();
}

async function suggestRewrite(gi, oi, { withParams = false } = {}) {
  const o = model.value?.goals?.[gi]?.objectives?.[oi];
  if (!o || !String(o.objectiveText || '').trim()) return;
  const instructions = withParams ? String(o.paramInstructions || '').trim() : '';
  if (withParams && !instructions) {
    error.value = 'Enter parameters for the AI rewrite first.';
    return;
  }
  rewriteKey.value = `${gi}-${oi}`;
  error.value = '';
  try {
    const res = await api.post(
      '/medical-billing/treatment-plans/normalize-objective',
      {
        agencyId: Number(props.agencyId),
        clientId: Number(props.clientId),
        objectiveText: o.objectiveText,
        clinicianInstructions: instructions || undefined
      },
      { skipGlobalLoading: true, timeout: 90000 }
    );
    const suggestion = res?.data?.suggestion || null;
    if (!suggestion) {
      error.value = 'Could not generate a suggestion for this objective.';
      return;
    }
    applySuggestionToObjective(o, suggestion);
    aiContentUsed.value = true;
    attestAiReviewed.value = false;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'AI suggestion failed';
  } finally {
    rewriteKey.value = '';
  }
}

function draftPayload(goals = model.value.goals) {
  return {
    ...Object.fromEntries(['effectiveDate','presentingProblem','prescribedFrequency','dischargePlan','diagnoses','legacyDiagnosisNarrative'].map(field=>[field,model.value[field]])),
    diagnosticJustification: primaryJustification(),
    goals: goals.map(goal=>({
      goalText:goal.goalText, durationMonths:goal.durationMonths, projectedCompletion:goal.projectedCompletion, reviewed:goal.reviewed,
      objectives:goal.objectives.map(o=>({
        objectiveText:o.objectiveText, scaleCurrent:o.scaleCurrent ?? null, scaleTarget:o.scaleTarget ?? null, scaleDirection:o.scaleDirection,
        skipScale:o.skipScale, scaleExemption:o.skipScale?o.scaleExemption:'', projectedCompletion:o.projectedCompletion || goal.projectedCompletion || null,
        durationMonths:o.durationMonths, kioskPrompt:o.kioskPrompt, kioskPromptOther:planAuthoring.value && !includeOtherQuestions.value ? '' : o.kioskPromptOther,
        interventions:o.interventions, reviewed:o.reviewed
      }))
    }))
  };
}

async function runNarrivaPlan(gi, oi, revisionInstructions = '') {
  if (!model.value || suggestingPlan.value || rewriteKey.value || saving.value) return;
  const single = gi != null;
  const selected = single ? model.value.goals[gi]?.objectives[oi] : null;
  const working = model.value;
  const selectedGoals = single ? [{...working.goals[gi],objectives:[selected]}] : working.goals;
  const payload = draftPayload(selectedGoals);
  const includeOther = includeOtherQuestions.value;
  const snapshot = JSON.stringify(payload);
  const run = editScope;
  suggestingPlan.value = !single;
  rewriteKey.value = single ? `${gi}-${oi}` : '';
  error.value = '';
  draftNotice.value = '';
  try {
    const {data}=await api.post('/medical-billing/treatment-plans/narriva-suggestions',{
      agencyId:Number(props.agencyId),clientId:Number(props.clientId),planId:loadedPlanId.value,chartDraft:usesChartDraft.value,
      sourceIntakeNoteId: props.sourceIntakeNoteId || undefined, draft:payload, includeOther, completePlan:!single, revisionInstructions
    },{skipGlobalLoading:true,timeout:90000});
    if (run!==editScope || model.value!==working || (single && working.goals[gi]?.objectives[oi]!==selected)) return;
    if (JSON.stringify(draftPayload(selectedGoals))!==snapshot || includeOtherQuestions.value!==includeOther) throw new Error('The draft changed while Narriva was working. Request suggestions again for the updated text.');
    const proposal = data?.proposal || {};
    const revisionRefs = Array.from(revisionInstructions.matchAll(/\b(?:goal|objective)\s+(\d+(?:\.\d+)?)/gi), match=>match[1]);
    const goals = single ? selectedGoals : working.goals;
    for (const goalSuggestion of proposal.goals || []) {
      const index = Number(goalSuggestion.ref) - 1;
      if (single || !Number.isInteger(index) || index < 0 || index > Math.max(2, goals.length - 1)) continue;
      while (goals.length <= index) addGoal();
      if (!goals[index].goalText.trim()) goals[index].goalText = goalSuggestion.goalText;
    }
    for (const suggestion of proposal.objectives || []) {
      const [goalIndex, objectiveIndex] = String(suggestion.ref).split('.').map(value=>Number(value)-1);
      const goal = goals[goalIndex];
      if (!goal || !Number.isInteger(objectiveIndex) || objectiveIndex < 0 || objectiveIndex > goal.objectives.length) continue;
      if (!goal.objectives[objectiveIndex] && !single && suggestion.objectiveText) addObjective(goalIndex);
      const o = goal.objectives[objectiveIndex];
      if (!o) continue;
      const reviseObjective = !revisionRefs.length || revisionRefs.includes(String(goalIndex+1)) || revisionRefs.includes(suggestion.ref);
      if (suggestion.objectiveText && (single || reviseObjective || !o.objectiveText.trim())) {
        o.originalText ||= o.objectiveText;
        const duration = o.durationMonths || goal.durationMonths;
        o.objectiveText = duration ? setObjectiveCompletionTime(suggestion.objectiveText, duration) : suggestion.objectiveText;
      }
      if (!o.skipScale) {
        if (!scoreEntered(o.scaleTarget) && scoreEntered(suggestion.target) && Number(suggestion.target)!==Number(o.scaleCurrent)) o.scaleTarget=suggestion.target;
        o.kioskPrompt ||= suggestion.clientQuestion || '';
        o.kioskPromptOther = includeOther ? o.kioskPromptOther || suggestion.otherQuestion || '' : '';
        // Suggested target text is never evidence of a starting score.
        o.scaleEdited = true;
        onScaleEdit(o);
      }
      if (!o.projectedCompletion) {
        o.durationMonths ||= goal.durationMonths || suggestion.durationMonths;
        o.projectedCompletion = goal.projectedCompletion || completionDateFromDurationMonths(o.durationMonths, working.effectiveDate) || '';
      }
      o.interventions=[...new Set([...(o.interventions || []),...(suggestion.interventions || [])])];
      o.reviewed=false;
      (single ? working.goals[gi] : goal).reviewed=false;
    }
    if (!single && !working.dischargePlan.trim()) working.dischargePlan = proposal.dischargePlan || '';
    aiContentUsed.value=true;
    attestAiReviewed.value=false;
    draftNotice.value='Review the proposed plan and enter any missing baselines before signing.';
    return true;
  } catch(e) {
    if (run===editScope) error.value=e.response?.data?.error?.message || e.message || 'Narriva suggestions are unavailable.';
  } finally {
    if (run===editScope) { suggestingPlan.value=false; rewriteKey.value=''; }
  }
}

async function suggestDischarge() {
  if (!model.value) return;
  suggestingDischarge.value = true;
  error.value = '';
  try {
    const res = await api.post(
      '/medical-billing/treatment-plans/suggest-discharge',
      {
        agencyId: Number(props.agencyId),
        clientId: Number(props.clientId),
        presentingProblem: model.value.presentingProblem || '',
        prescribedFrequency: model.value.prescribedFrequency || '',
        diagnoses: model.value.diagnoses || [],
        goals: (model.value.goals || []).map((g) => ({ goalText: g.goalText }))
      },
      { skipGlobalLoading: true, timeout: 90000 }
    );
    const suggestion = res?.data?.suggestion;
    if (!suggestion?.dischargePlan) {
      error.value = 'Could not generate discharge criteria.';
      return;
    }
    model.value.dischargePlan = suggestion.dischargePlan;
    aiContentUsed.value = true;
    attestAiReviewed.value = false;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Discharge suggestion failed';
  } finally {
    suggestingDischarge.value = false;
  }
}

function approveSuggestion(gi, oi) {
  const o = model.value?.goals?.[gi]?.objectives?.[oi];
  const s = o?.pendingSuggestion;
  if (!o || !s) return;
  applySuggestionToObjective(o, s);
}

function discardSuggestion(gi, oi) {
  const o = model.value?.goals?.[gi]?.objectives?.[oi];
  if (o) o.pendingSuggestion = null;
}

async function parseText(text) {
  parsing.value = true;
  error.value = '';
  try {
    const res = await api.post(
      '/medical-billing/treatment-plans/parse',
      {
        agencyId: Number(props.agencyId),
        clientId: Number(props.clientId),
        text
      },
      { skipGlobalLoading: true }
    );
    const parsed = res?.data?.parsed || {};
    const diagnoses = parsed.diagnoses?.map((row, index) => ({ ...row, isPrimary: index === (parsed.primaryDiagnosisIndex || 0) })) || [];
    const diagnosisFields = diagnoses.length ? planDiagnosisFields(diagnoses, parsed.diagnosticJustification, { imported: true }) :
      { diagnoses: model.value?.diagnoses || [], legacyDiagnosisNarrative: parsed.diagnosticJustification || model.value?.legacyDiagnosisNarrative || '' };
    model.value = reactive({
      effectiveDate: parsed.effectiveDate || model.value?.effectiveDate || todayIsoDate(),
      sourceReviewSchedule: parsed.sourceReviewSchedule || null,
      presentingProblem: parsed.presentingProblem || model.value?.presentingProblem || '',
      prescribedFrequency: parsed.prescribedFrequency || model.value?.prescribedFrequency || '',
      dischargePlan: parsed.dischargePlan || model.value?.dischargePlan || '',
      ...diagnosisFields,
      goals: (parsed.goals || []).map(g => mapGoal(g, parsed.effectiveDate || model.value?.effectiveDate || todayIsoDate()))
    });
    if (!model.value.goals.length) addGoal();
    if (!String(model.value.effectiveDate || '').trim()) {
      model.value.effectiveDate = todayIsoDate();
    }
    if (!String(model.value.dischargePlan || '').trim()) {
      error.value = 'Discharge criteria / planning is missing — use Suggest discharge criteria before saving.';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Parse failed';
  } finally {
    parsing.value = false;
  }
}

async function parse() {
  await parseText(pasteText.value);
}

function applyRenewalChange(goal, objective) {
  if (objective.suggestedObjective) {
    objective.originalText ||= objective.objectiveText;
    objective.objectiveText = objective.suggestedObjective;
  }
  objective.interventions = [...new Set([...objective.interventions, ...objective.suggestedInterventions])];
  objective.renewalRecommendation = '';
  objective.reviewed = false;
  goal.reviewed = false;
}

function applyAllRenewalChanges() {
  for (const goal of model.value.goals) {
    for (const objective of goal.objectives) {
      if (objective.renewalRecommendation && (objective.suggestedObjective || objective.suggestedInterventions.length)) applyRenewalChange(goal, objective);
    }
  }
}

async function runUpdaterPropose() {
  if (!model.value || proposingUpdate.value) return;
  const scope = editScope;
  const existingSourceDate = sourceEffectiveDate.value;
  proposingUpdate.value = true;
  error.value = '';
  changeSummary.value = '';
  try {
    const currentPlan = model.value
      ? {
          presentingProblem: model.value.presentingProblem,
          prescribedFrequency: model.value.prescribedFrequency,
          dischargePlan: model.value.dischargePlan,
          diagnosticJustification: primaryJustification(),
          diagnoses: model.value.diagnoses,
          goals: model.value.goals,
          effectiveDate: model.value.effectiveDate
        }
      : props.initialPlan;
    const res = await api.post(
      '/medical-billing/treatment-plans/propose-update',
      {
        agencyId: Number(props.agencyId),
        clientId: Number(props.clientId),
        currentPlan: { ...currentPlan, id: props.planId || loadedPlanId.value },
        providerNarrative: providerNarrative.value || addendum.value || '',
        pasteRewriteSource: pasteText.value || '',
        progressExcerpt: props.progressExcerpt || '',
        renewalReason: props.renewalReason || ''
      },
      { skipGlobalLoading: true, timeout: 120000 }
    );
    if (scope !== editScope) return;
    const proposed = res?.data?.proposed;
    if (!proposed) throw new Error('No update proposal returned');
    const diagnoses = model.value.diagnoses;
    const legacyDiagnosisNarrative = model.value.legacyDiagnosisNarrative;
    applyPlanRecord({ ...proposed, planDiagnoses: diagnoses, diagnostic_justification: primaryJustification() });
    model.value.legacyDiagnosisNarrative = legacyDiagnosisNarrative;
    sourceEffectiveDate.value = existingSourceDate;
    changeSummary.value = String(res?.data?.changeSummary || '').trim();
    if (res?.data?.aiUsed) {
      aiContentUsed.value = true;
      attestAiReviewed.value = false;
    }
  } catch (e) {
    if (scope === editScope) error.value = e.response?.data?.error?.message || e.message || 'Could not propose treatment plan update';
  } finally {
    if (scope === editScope) proposingUpdate.value = false;
  }
}

async function regenerateFromAddendum() {
  const extra = String(addendum.value || '').trim();
  if (!extra) return;
  regenerating.value = true;
  error.value = '';
  try {
    if (await runNarrivaPlan(null, null, extra) && addendum.value.trim() === extra) addendum.value = '';
  } finally {
    regenerating.value = false;
  }
}

async function loadPlan() {
  if (props.initialPlan?.goals && (!String(props.initialPlan.source_tool_id || '').startsWith('client_records_import:') || props.initialPlan.recordsImportSource)) {
    applyPlanRecord(props.initialPlan);
    return;
  }
  const pid = Number(props.planId || props.initialPlan?.id || 0);
  if (!pid) return;
  const scope = editScope;
  loadingPlan.value = true;
  error.value = '';
  try {
    const res = await api.get(`/medical-billing/treatment-plans/${pid}`, {
      params: {
        agencyId: Number(props.agencyId),
        clientId: Number(props.clientId)
      },
      skipGlobalLoading: true
    });
    if (scope === editScope) applyPlanRecord(res?.data?.plan);
  } catch (e) {
    if (scope === editScope) error.value = e.response?.data?.error?.message || e.message || 'Could not load treatment plan';
  } finally {
    if (scope === editScope) loadingPlan.value = false;
  }
}

watch(
  () => [props.open,props.clientId,props.agencyId,props.planId],
  ([open]) => {
    editScope++;
    if (!open) return;
    pasteText.value = props.initialText || '';
    providerNarrative.value = props.renewalReason || '';
    changeSummary.value = '';
    model.value = null;
    importedSourceText.value = '';
    error.value = '';
    addendum.value = '';
    diagnosisQuery.value = '';
    attemptedFinalize.value = false;
    bulkDurationMonths.value = 0;
    rewriteKey.value = '';
    draftNotice.value = '';
    draftRevision.value = 0;
    usesChartDraft.value = false;
    suggestingPlan.value = false;
    proposingUpdate.value = false;
    includeOtherQuestions.value = false;
    loadedPlanId.value = null;
    importedDraftId.value = null;
    aiContentUsed.value = !!props.initialPlan?.aiGenerated;
    attestAiReviewed.value = false;
    if (isUpdaterMode.value || isDraftEditor.value) {
      const scope = editScope;
      void loadPlan().then(() => {
        if (scope !== editScope) return;
        if (props.sourceIntakeNoteId && !props.planId && !props.initialPlan?.goals?.some(goal => goal.goalText?.trim())) {
          void runNarrivaPlan();
        }
        if (isUpdaterMode.value && (props.progressExcerpt || props.renewalReason || pasteText.value.trim())) {
          // Auto-propose when updater opens with context; provider still reviews.
          void runUpdaterPropose();
        }
      });
    } else if (pasteText.value.trim()) {
      parse();
    }
  }, {immediate:true}
);

const goalsMissingDuration=computed(()=>(model.value?.goals||[]).map((g,i)=>({goal:g,index:i+1})).filter(({goal})=>!(planAuthoring.value && goal.objectives.length && goal.objectives.every(o=>o.projectedCompletion)) && (!Number.isInteger(Number(goal.durationMonths))||Number(goal.durationMonths)<1||Number(goal.durationMonths)>36)).map(({index})=>index));
const finalizationIssues = computed(() => {
  if (!model.value) return [];
  const draft = draftPayload();
  const issues = [];
  const add = (section, message) => issues.push({ section, message });
  if (!draft.effectiveDate) add('overview', 'Choose an effective date.');
  if (inPage.value) for (const diagnosis of draft.diagnoses) {
    if (!diagnosis.justification.trim()) add('diagnoses', `Enter clinical justification for ${diagnosis.icd10Code}.`);
  }
  if (!draft.goals.length) add('goals', 'Add a treatment goal.');
  for (const [gi, goal] of draft.goals.entries()) {
    if (!goal.goalText.trim()) add('goals', `Enter the title for goal ${gi+1}.`);
    if (!goal.objectives.length) add('goals', `Add an objective to goal ${gi+1}.`);
    for (const [oi, objective] of goal.objectives.entries()) {
      const label = `Objective ${gi+1}.${oi+1}`;
      if (!objective.objectiveText.trim()) add('goals', `${label} needs text.`);
      if (planAuthoring.value && invalidObjectiveDate(objective, goal)) {
        add('goals', `${label} needs a target date on or after the effective date.`);
      }
      if (objective.skipScale) {
        if (!objective.scaleExemption.trim()) add('goals', `${label} needs an alternate measure and reason.`);
      } else {
        if (!scoreEntered(objective.scaleCurrent)) add('goals', `${label} needs a baseline from 1 to 10.`);
        if (invalidTarget(objective)) add('goals', `${label} needs a target from 1 to 10 different from its baseline.`);
        if (planAuthoring.value && !String(objective.kioskPrompt || '').trim()) add('goals', `${label} needs a client rating question.`);
      }
    }
  }
  if (goalsMissingDuration.value.length) add('goals', `Choose a duration or objective dates for goals ${goalsMissingDuration.value.join(', ')}.`);
  if (planAuthoring.value && draft.goals.filter(goal=>goal.objectives.some(o=>!o.skipScale && isObjectiveScaleValid(o.scaleCurrent,o.scaleTarget))).length < 2) {
    add('goals', 'Keep at least two goals with a complete 1–10 objective.');
  }
  if (!draft.dischargePlan.trim()) add('care', 'Enter discharge criteria.');
  if (aiContentUsed.value && !attestAiReviewed.value) add('review', 'Confirm that you reviewed the full plan.');
  return issues;
});
const issuesBySection = computed(() => Object.fromEntries(
  planSections.map(({ key }) => [key, finalizationIssues.value.filter(issue => issue.section === key)])
));
watch(() => model.value ? JSON.stringify(draftPayload()) : '', () => { attestAiReviewed.value=false; });

async function save({ finalize = true } = {}) {
  if (!model.value || saving.value || suggestingPlan.value || rewriteKey.value) return;
  attemptedFinalize.value = finalize;
  error.value = '';
  if (finalize && finalizationIssues.value.length) {
    await nextTick();
    finalizationAlert.value?.focus();
    return;
  }
  saving.value = true;
  finalizing.value = !!finalize;
  try {
    for (const g of model.value.goals || []) {
      if (!g.durationMonths && g.projectedCompletion && !planAuthoring.value) continue;
      if (g.durationMonths) syncGoalCompletion(g);
      if (planAuthoring.value) {
        const dates=g.objectives.map(o=>o.projectedCompletion || g.projectedCompletion).filter(Boolean).sort();
        g.projectedCompletion=dates.at(-1) || null;
      }
    }

    const primary = (model.value.diagnoses || []).find((d) => d.isPrimary) || model.value.diagnoses?.[0];
    if (usesChartDraft.value) {
      const {data}=await api.put(`/medical-billing/treatment-plans/${loadedPlanId.value}/chart-draft`,{
        agencyId:Number(props.agencyId),clientId:Number(props.clientId),revision:draftRevision.value,draft:draftPayload()
      });
      draftRevision.value=data.revision;
      draftNotice.value='Draft saved.';
      emit('draft-updated', { revision: data.revision, value: data.value || draftPayload() });
      if (!finalize) return;
    }
    const asDraft = !finalize;
    const res = await api.post('/medical-billing/treatment-plans', {
      agencyId: Number(props.agencyId),
      clientId: Number(props.clientId),
      title: props.mode === 'generated' ? `${props.initialPlan?.title || 'Generated Treatment Plan'}${asDraft ? ' Draft' : ''}` : (asDraft ? 'Treatment Plan Draft' : (isDraftEditor.value ? 'Treatment Plan' : 'Imported Treatment Plan')),
      status: asDraft ? 'draft' : 'active',
      finalize: !asDraft,
      narrivaRevision:isUpdaterMode.value && !asDraft,
      ...(usesChartDraft.value ? {narrivaChartDraft:true,chartDraftPlanId:loadedPlanId.value,draftRevision:draftRevision.value} :
        importedDraftId.value && !asDraft ? {sourceDraftPlanId:importedDraftId.value} : {}),
      effectiveDate: model.value.effectiveDate || null,
      dischargePlan: model.value.dischargePlan || null,
      presentingProblem: model.value.presentingProblem || null,
      prescribedFrequency: model.value.prescribedFrequency || null,
      sourceToolId: props.allowImportedDraft ? 'client_creation_record_import' : props.mode === 'generated' ? (props.initialPlan?.sourceToolId || 'note_aid_generated_plan') : (asDraft ? 'intake_packet_bootstrap' : 'note_aid_plan_import'),
      icd10Code: primary?.icd10Code || null,
      diagnosisDescription: primary?.description || null,
      diagnosticJustification: primaryJustification() || null,
      diagnoses: model.value.diagnoses.map(d => ({ ...d, justification: d.justification.trim() })),
      goals: model.value.goals.map((g, i) => ({
        goalIndex: i + 1,
        goalText: g.goalText,
        durationMonths:g.durationMonths,
        projectedCompletion: g.projectedCompletion || completionDateFromDurationMonths(g.durationMonths, model.value.effectiveDate) || null,
        objectives: (g.objectives || []).map((o, j) => ({
          objectiveIndex: j + 1,
          objectiveText: o.objectiveText,
          scaleCurrent: o.skipScale ? null : o.scaleCurrent,
          scaleTarget: o.skipScale ? null : o.scaleTarget,
          scaleDirection: o.scaleDirection,
          projectedCompletion: o.projectedCompletion || (planAuthoring.value ? g.projectedCompletion : null),
          scaleExemption: o.skipScale ? o.scaleExemption : '',
          skipScale:o.skipScale === true,
          kioskPrompt: o.skipScale ? null : o.kioskPrompt, kioskPromptOther: o.skipScale || (planAuthoring.value && !includeOtherQuestions.value) ? null : o.kioskPromptOther,
          measurementMethod: o.skipScale ? `Alternate measure: ${o.scaleExemption || ''}` : DEFAULT_MEASUREMENT_METHOD,
          interventions: Array.isArray(o.interventions) ? o.interventions : []
        }))
      }))
    });
    emit('saved', res?.data?.plan || null, { finalized: !!finalize });
  } catch (e) {
    const code = e.response?.data?.error?.code;
    if (code === 'intake_not_finalized') {
      error.value = 'Finalize the intake note before finalizing the treatment plan.';
    } else {
      error.value = e.response?.data?.error?.message || e.message || 'Save failed';
    }
  } finally {
    saving.value = false;
    finalizing.value = false;
  }
}

async function discardDraft() {
  const pid = Number(props.planId || loadedPlanId.value || 0);
  const agencyId = Number(props.agencyId || 0);
  const clientId = Number(props.clientId || 0);
  if (!pid || !agencyId || !clientId || discarding.value) return;
  if (!window.confirm('Discard this treatment plan draft?')) {
    return;
  }
  discarding.value = true;
  error.value = '';
  try {
    await api.post(`/medical-billing/treatment-plans/${pid}/discard`, {
      agencyId,
      clientId
    }, { skipGlobalLoading: true });
    emit('saved', null);
    emit('close');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Discard failed';
  } finally {
    discarding.value = false;
  }
}
</script>

<style scoped>
.na-plan-navigation {display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.na-duration-required { border-color: #b42318; background: #fff6f5; }
.na-required-text { color: #a1261c; font-size: .85rem; }
.na-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 90;
  padding: 24px 16px;
  overflow: auto;
}
.na-modal {
  background: #fff;
  border-radius: 14px;
  width: min(720px, 100%);
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.na-modal--wide { width: min(960px, 100%); }
.na-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.na-modal-head h3 { margin: 0; }
.na-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 10px;
}
.na-label--inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
  flex-wrap: wrap;
}
.na-label--scale {
  min-width: 88px;
  margin-bottom: 0;
}
.hint-inline {
  font-weight: 500;
  color: #64748b;
}
.hint-block {
  margin: 4px 0 12px;
  font-weight: 500;
  color: #64748b;
  font-size: 0.78rem;
  max-width: 720px;
}
.na-input, .na-textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.na-input--grow { flex: 1; min-width: 140px; }
.na-input--duration { width: auto; min-width: 110px; }
.na-input--scale { width: 64px; }
.na-input--direction { width: auto; min-width: 110px; }
.na-textarea--goal, .na-textarea--objective { width: 100%; box-sizing: border-box; }
.na-import-block { margin: 12px 0; }
.na-import-block-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.na-import-block-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.na-import-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
  background: #f8fafc;
}
.na-import-card--goal { background: #fff; }
.na-import-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.na-import-row--goal-meta { margin: 8px 0; }
.na-import-obj {
  border-top: 1px dashed #e2e8f0;
  padding-top: 8px;
  margin-top: 8px;
}
.na-import-scale {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 6px 0;
}
.na-scale-arrow { color: #64748b; font-weight: 700; }
.na-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
}
.na-rewrite-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  padding: 8px;
  margin: 6px 0;
  font-size: 0.82rem;
}
.na-suggestion-card {
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  border-radius: 8px;
  padding: 8px;
  margin: 6px 0;
}
.na-suggestion-label { margin: 0 0 4px; font-weight: 700; font-size: 0.8rem; }
.na-suggestion-text { margin: 0 0 6px; white-space: pre-wrap; }
.na-suggestion-actions { display: flex; gap: 8px; }
.na-revision-block {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.na-revision-block .na-label { margin-bottom: 0; }
.na-revision-block .na-textarea { display: block; width: 100%; min-height: 120px; box-sizing: border-box; resize: vertical; }
.na-revision-block .na-btn-outline { align-self: flex-end; }
.na-field-error { color:#b42318; font-size:.85rem; }
.na-input[aria-invalid="true"], .na-textarea[aria-invalid="true"] { border-color:#b42318; background:#fff3f2; }
.na-sign-check { display: flex; align-items: flex-start; gap: 12px; padding: 16px; margin: 16px 0; border: 2px solid #cbd5e1; border-radius: 10px; background: #f8fafc; cursor: pointer; }
.na-sign-check input { width: 24px; height: 24px; flex: 0 0 24px; margin: 2px 0 0; accent-color: #13766e; cursor: pointer; }
.na-sign-check strong { display: block; margin-bottom: 4px; }
.na-sign-check-description { display: block; line-height: 1.5; }
.na-sign-check--reviewed { border-color: #13766e; background: #effcf8; }
.na-sign-check:focus-within { outline: 3px solid #93c5fd; outline-offset: 2px; }
@media (max-width: 600px) { .na-revision-block .na-btn-outline { align-self: stretch; } }
.na-modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 14px;
}
.na-modal-actions--start { justify-content: flex-start; }
.na-textarea--warn {
  border-color: #f59e0b !important;
  background: #fffbeb;
}
.na-param-editor {
  margin-top: 8px;
  padding: 10px;
  border: 1px dashed #94a3b8;
  border-radius: 10px;
  background: #f8fafc;
}
.na-rewrite-applied {
  margin: 6px 0 0;
  color: #0f766e;
}
.na-btn-primary, .na-btn-outline, .na-link-btn, .na-btn-outline--sm {
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 650;
  cursor: pointer;
  font: inherit;
}
.na-btn-outline--sm { padding: 6px 10px; font-size: 0.8rem; }
.na-btn-primary {
  background: #166534;
  color: #fff;
  border: 0;
}
.na-btn-outline {
  background: #fff;
  border: 1px solid #cbd5e1;
  color: #0f172a;
}
.na-btn-danger {
  color: #b91c1c !important;
  border-color: #fecaca !important;
}
.na-link-btn {
  border: 0;
  background: transparent;
  color: #166534;
}
.muted, .hint { color: #64748b; }
.tiny { font-size: 0.75rem; }
.error { color: #b91c1c; }
.na-duration-preview { font-size: 0.8rem; color: #334155; }
</style>

<style scoped>
.na-plan-paper {
  width: 100%;
  max-width: 1360px;
  box-sizing: border-box;
  margin-inline: auto;
  padding: clamp(12px, 2vw, 24px);
  background: #fff;
  border: 1px solid #cbd9e5;
  border-radius: 6px;
  min-width: 0;
  color: #172c42;
}
.na-plan-paper .na-modal-head { gap: 12px; }
.na-plan-paper .na-modal-head h1,
.na-plan-paper .na-modal-head h3 { margin: 0; font-size: clamp(1.25rem, 2vw, 1.7rem); }
.na-plan-client, .na-plan-navigation {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
}
.na-plan-client { margin: 6px 0 0; color: #465e74; font-size: .88rem; }
.na-plan-sections-nav {
  position: sticky;
  top: var(--na-plan-nav-top, 0px);
  z-index: 4;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  padding: 5px 0;
  background: #fff;
  border-bottom: 1px solid #cbd9e5;
}
.na-plan-sections-nav button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 4px 7px;
  border: 0;
  border-radius: 4px;
  color: #174d77;
  background: #edf4fa;
  font: inherit;
  font-size: .84rem;
  cursor: pointer;
}
.na-plan-section-count {
  min-width: 1.2em;
  padding-inline: 3px;
  border-radius: 3px;
  background: #ffebe8;
  color: #a1261c;
  text-align: center;
  font-weight: 700;
}
.na-plan-section {
  margin-block: 13px;
  padding: 12px;
  border: 1px solid #cbd9e5;
  border-top: 2px solid #7195b5;
  border-radius: 4px;
  scroll-margin-top: 65px;
  background: #fff;
}
.na-plan-section:focus { outline: 2px solid #7195b5; outline-offset: 2px; }
.na-plan-section h2 { margin: 0 0 6px; font-size: 1.13rem; }
.na-plan-section h3 { margin: 0; font-size: 1rem; }
.na-plan-section h4 { margin: 0 0 6px; font-size: .96rem; }
.na-plan-section .hint-block { margin: 0 0 7px; }
.na-plan-section .na-label { margin-block: 7px; }
.na-plan-section .na-input, .na-plan-section .na-textarea { border-radius: 4px; }
.na-plan-section .na-label > input[type="date"] { max-width: 200px; }
.na-plan-section .na-textarea { font-weight: 400; }
.na-plan-section .na-reading-text, .na-plan-section .na-textarea--goal, .na-plan-section .na-textarea--objective {
  field-sizing: content;
  min-height: 4.25rem;
}
.na-plan-diagnosis {
  padding: 7px 9px;
  margin-top: 6px;
  border: 1px solid #d3dfea;
  border-radius: 4px;
  background: #f7fafc;
}
.na-plan-diagnosis .na-label { margin: 5px 0 0; }
.na-plan-diagnosis-row, .na-plan-goal-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 3px 12px;
}
.na-plan-diagnosis-title { min-width: 0; overflow-wrap: anywhere; }
.na-plan-diagnosis-title code { color: #174d77; margin-inline-end: 5px; }
.na-plan-primary {
  display: inline-block;
  padding: 1px 4px;
  margin-inline-start: 5px;
  color: #155449;
  background: #e3f2ee;
  font-size: .78rem;
}
.na-plan-diagnosis-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; }
.na-plan-diagnosis-actions .na-link-btn, .na-plan-goal-heading .na-link-btn { padding: 3px 7px; font-size: .85rem; }
.na-plan-section :deep(.frequency-select) { max-width: 34rem; font-size: .82rem; font-weight: 600; }
.na-plan-section :deep(.frequency-select select), .na-plan-section :deep(.frequency-select input) { border-radius: 4px; padding: 7px 9px; }
.na-plan-section :deep(.cds) { max-width: 34rem; }
.na-plan-section :deep(.cds input) { padding: 7px 9px; border-radius: 4px; }
.na-plan-section .na-import-card { border: 1px solid #cbd9e5; border-radius: 4px; padding: 10px; background: #f6f9fc; }
.na-plan-section .na-import-obj { border: 1px solid #d1deea; border-left: 3px solid #7195b5; padding: 8px 10px; margin-bottom: 8px; background: #fff; }
.na-plan-section .na-input[aria-invalid="true"], .na-plan-section .na-textarea[aria-invalid="true"] { border-color: #b42318; background: #fff6f5; }
.na-plan-section .na-required-text { color: #a1261c; }
.na-plan-assist { margin-block: 10px; padding: 7px 9px; border: 1px solid #cfdeeb; border-radius: 4px; background: #f5f8fb; }
.na-plan-assist summary { color: #174d77; font-weight: 650; cursor: pointer; }
.na-clinical-text { margin: 6px 0 0; white-space: pre-wrap; }
@media (max-width: 600px) {
  .na-plan-paper .na-modal-head { flex-wrap: wrap; }
  .na-plan-paper { padding: 8px; }
  .na-plan-section { padding: 8px; scroll-margin-top: 106px; }
}
.narriva-plan-actions { margin:16px 0; }
.narriva-plan-button { display:inline-flex; align-items:center; gap:8px; }
.narriva-plan-button img { width:23px; height:23px; object-fit:contain; background:white; padding:2px; border-radius:4px; }
.na-objective-controls,.na-objective-questions { display:grid; gap:8px; margin:12px 0; }
.na-objective-questions button { justify-self:start; }
</style>
