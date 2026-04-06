<template>
  <div v-if="open" class="modal-overlay" @click.self="requestClose">
    <div class="modal-content modal-wide">
      <div class="modal-header">
        <h2>Add New Season</h2>
        <button type="button" class="btn-close" @click="requestClose" aria-label="Close">×</button>
      </div>

      <!-- Cancel confirmation strip -->
      <div v-if="confirmingClose" class="confirm-strip">
        <span>Discard this season?</span>
        <div class="confirm-strip-actions">
          <button type="button" class="btn btn-secondary btn-sm" @click="confirmingClose = false">Stay</button>
          <button type="button" class="btn btn-danger btn-sm" @click="confirmClose">Yes, discard</button>
        </div>
      </div>

      <div class="modal-body">
        <p class="hint">Establish the terms of your next season (e.g., Winter Run '26, Winter Fit Club).</p>
        <form v-if="!success" @submit.prevent="submit" class="add-season-form">
          <div class="form-group">
            <label>Season name *</label>
            <input v-model="form.className" type="text" required placeholder="e.g., Winter Run '26, Winter Fit Club" class="form-input" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="form.description" rows="3" placeholder="Optional season description" class="form-input" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Status</label>
              <select v-model="form.status" class="form-input">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div class="form-group">
              <label>Start date</label>
              <input v-model="form.startsAt" type="datetime-local" class="form-input" />
            </div>
            <div class="form-group">
              <label>End date</label>
              <input v-model="form.endsAt" type="datetime-local" class="form-input" />
            </div>
          </div>
          <div class="form-group participation-agreement-section">
            <label class="section-label">Season Participation Agreement</label>
            <p class="section-hint">
              Members will see this in the season portal. Use it for the season's rules, commandments, or guidelines that
              workouts, uploads, comments, and participation need to follow.
            </p>
            <div class="form-row">
              <div class="form-group">
                <label>Reuse a prior set</label>
                <div class="inline-action-row">
                  <select v-model="selectedAgreementTemplateKey" class="form-input">
                    <option value="">Keep this season's current draft</option>
                    <option
                      v-for="option in agreementTemplateOptions"
                      :key="option.key"
                      :value="option.key"
                    >
                      {{ formatAgreementTemplateOption(option) }}
                    </option>
                  </select>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="!selectedAgreementTemplateKey"
                    @click="applyAgreementTemplate"
                  >
                    Apply
                  </button>
                </div>
                <small>Repeated rule sets appear once using the most recent season that used them.</small>
              </div>
              <div class="form-group">
                <label>Display label</label>
                <input
                  v-model="form.agreementLabel"
                  type="text"
                  class="form-input"
                  placeholder="e.g., Season Guidelines, Commandments, Rules of the Season"
                />
              </div>
            </div>
            <div class="form-group">
              <label>Intro / agreement text</label>
              <textarea
                v-model="form.agreementIntroText"
                rows="3"
                class="form-input"
                placeholder="Explain what members are agreeing to by joining and posting in this season."
              />
            </div>
            <div class="form-group">
              <label>Guidelines list</label>
              <textarea
                v-model="form.agreementItemsText"
                rows="6"
                class="form-input"
                placeholder="One guideline per line"
              />
              <small>Managers can reject workouts or uploads that do not meet these season standards.</small>
            </div>
          </div>
          <div class="form-group">
            <label>Activity types (comma-separated)</label>
            <input v-model="form.activityTypesText" type="text" placeholder="e.g., running, cycling, workout_session, steps" class="form-input" />
            <small>Leave blank for default options.</small>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Weekly goal minimum</label>
              <input v-model.number="form.weeklyGoalMinimum" type="number" min="0" placeholder="Optional" class="form-input" />
            </div>
            <div class="form-group">
              <label>Team min points/week</label>
              <input v-model.number="form.teamMinPointsPerWeek" type="number" min="0" placeholder="Optional" class="form-input" />
            </div>
            <div class="form-group">
              <label>Individual min points/week</label>
              <input v-model.number="form.individualMinPointsPerWeek" type="number" min="0" placeholder="Optional" class="form-input" />
            </div>
          </div>

          <!-- Recognition Categories -->
          <div class="form-group">
            <label class="section-label">Recognition Categories</label>
            <p class="section-hint">Configure who gets recognized. Each category can have its own period, metric, and winner rule.</p>
            <RecognitionCategoryBuilder
              v-model="form.recognitionCategories"
              :custom-field-definitions="customFieldDefs"
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Event category</label>
              <select v-model="form.eventCategory" class="form-input">
                <option value="run_ruck">Run/Ruck (distance based)</option>
                <option value="fitness">Fitness (calories based)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Weekly challenge assignment mode</label>
              <select v-model="form.challengeAssignmentMode" class="form-input">
                <option value="volunteer_or_elect">Volunteer or elect</option>
                <option value="captain_assigns">Captain assigns</option>
              </select>
            </div>
            <div class="form-group">
              <label>Week ends Sunday at (HH:MM)</label>
              <input v-model="form.weekEndsSundayAt" type="time" class="form-input" />
            </div>
            <div class="form-group">
              <label>Week timezone</label>
              <input v-model="form.weekTimeZone" type="text" class="form-input" placeholder="e.g., America/New_York" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Run miles per point</label>
              <input v-model.number="form.runMilesPerPoint" type="number" min="0.1" step="0.1" class="form-input" />
            </div>
            <div class="form-group">
              <label>Ruck miles per point</label>
              <input v-model.number="form.ruckMilesPerPoint" type="number" min="0.1" step="0.1" class="form-input" />
            </div>
            <div class="form-group">
              <label>Calories per point (fitness)</label>
              <input v-model.number="form.caloriesPerPoint" type="number" min="1" step="1" class="form-input" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Start miles minimum per person (week 1)</label>
              <input v-model.number="form.runRuckStartMilesPerPerson" type="number" min="0" step="0.1" class="form-input" />
            </div>
            <div class="form-group">
              <label>Weekly increase miles per person</label>
              <input v-model.number="form.runRuckWeeklyIncreaseMilesPerPerson" type="number" min="0" step="0.1" class="form-input" />
            </div>
            <div class="form-group" v-if="form.eventCategory === 'run_ruck'">
              <label>Max rucks per participant per week</label>
              <input v-model.number="form.maxRucksPerWeek" type="number" min="0" step="1" class="form-input" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Number of teams</label>
              <input v-model.number="form.teamCount" type="number" min="1" class="form-input" />
            </div>
            <div class="form-group">
              <label>Captains can rename teams</label>
              <select v-model="form.allowCaptainRenameTeam" class="form-input">
                <option :value="true">Yes</option>
                <option :value="false">No</option>
              </select>
            </div>
            <div class="form-group">
              <label>If locked, captains can add nickname suffix</label>
              <select v-model="form.allowCaptainNicknameSuffixWhenLocked" class="form-input">
                <option :value="false">No</option>
                <option :value="true">Yes</option>
              </select>
            </div>
            <div class="form-group">
              <label>Preset team names (comma-separated)</label>
              <input v-model="form.presetTeamNamesText" type="text" class="form-input" placeholder="e.g., Team Alpha, Team Bravo" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Allow bye week</label>
              <select v-model="form.allowByeWeek" class="form-input">
                <option :value="false">No</option>
                <option :value="true">Yes</option>
              </select>
            </div>
            <div class="form-group">
              <label>Max bye weeks per participant</label>
              <input v-model.number="form.maxByeWeeksPerParticipant" type="number" min="0" class="form-input" />
            </div>
            <div class="form-group">
              <label>Require advance declaration</label>
              <select v-model="form.requireAdvanceByeDeclaration" class="form-input">
                <option :value="true">Yes</option>
                <option :value="false">No</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Enable postseason</label>
              <select v-model="form.postseasonEnabled" class="form-input">
                <option :value="false">No</option>
                <option :value="true">Yes</option>
              </select>
            </div>
            <div class="form-group">
              <label>Regular season weeks</label>
              <input v-model.number="form.regularSeasonWeeks" type="number" min="1" class="form-input" />
            </div>
            <div class="form-group">
              <label>Break week before playoffs</label>
              <select v-model="form.postseasonHasBreakWeek" class="form-input">
                <option :value="false">No</option>
                <option :value="true">Yes</option>
              </select>
            </div>
            <div v-if="form.postseasonHasBreakWeek" class="form-group">
              <label>Break week number</label>
              <input v-model.number="form.postseasonBreakWeekNumber" type="number" min="1" class="form-input" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Playoff week number</label>
              <input v-model.number="form.playoffWeekNumber" type="number" min="1" class="form-input" />
            </div>
            <div class="form-group">
              <label>Championship week number</label>
              <input v-model.number="form.championshipWeekNumber" type="number" min="1" class="form-input" />
            </div>
            <div class="form-group">
              <label>Playoff seeds</label>
              <input v-model.number="form.playoffSeedCount" type="number" min="2" class="form-input" />
            </div>
            <div class="form-group">
              <label>Playoff matchup mode</label>
              <select v-model="form.playoffMatchupMode" class="form-input">
                <option value="1v4_2v3">1 vs 4 and 2 vs 3</option>
                <option value="seeded_bracket">Seeded bracket</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Workout approval mode</label>
              <select v-model="form.workoutModerationMode" class="form-input">
                <option value="all">Approve every workout</option>
                <option value="treadmill_only">Approve treadmill only</option>
                <option value="none">No manager approval required</option>
              </select>
            </div>
            <div class="form-group">
              <label>Treadmill photo proof required</label>
              <select v-model="form.treadmillPhotoRequired" class="form-input">
                <option :value="true">Yes</option>
                <option :value="false">No</option>
              </select>
            </div>
            <div class="form-group">
              <label>Enable treadmillpocalypse</label>
              <select v-model="form.treadmillpocalypseEnabled" class="form-input">
                <option :value="false">No</option>
                <option :value="true">Yes</option>
              </select>
            </div>
            <div class="form-group">
              <label>Treadmillpocalypse starts week</label>
              <input v-model="form.treadmillpocalypseStartsAtWeek" type="date" class="form-input" />
            </div>
            <div v-if="form.treadmillpocalypseEnabled" class="form-group">
              <label>Treadmillpocalypse icon</label>
              <IconSelector
                v-model="form.treadmillpocalypseIconId"
                :summitStatsClubId="props.clubId"
                :context="`treadmillpocalypse-${props.clubId}`"
              />
            </div>
          </div>
          <div class="form-group">
            <label>Record board metrics</label>
            <div class="checkbox-group">
              <label v-for="opt in recordMetricOptions" :key="`metric-${opt.value}`">
                <input v-model="form.recordMetrics" type="checkbox" :value="opt.value" />
                {{ opt.label }}
              </label>
            </div>
          </div>
          <div v-if="error" class="error-msg">{{ error }}</div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="requestClose">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving || !form.className.trim()">
              {{ saving ? 'Creating…' : 'Create Season' }}
            </button>
          </div>
        </form>
        <div v-else class="success-msg">
          <p>{{ successMessage }}</p>
          <button type="button" class="btn btn-primary" @click="handleDone">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import RecognitionCategoryBuilder from '../challenge/RecognitionCategoryBuilder.vue';
import IconSelector from '../admin/IconSelector.vue';
import {
  agreementItemsToTextarea,
  agreementTextareaToItems,
  collectUniqueParticipationAgreementSnapshots,
  defaultParticipationAgreement,
  formatParticipationAgreementSeasonLabel
} from '../../utils/seasonParticipationAgreement';

const props = defineProps({
  open: { type: Boolean, default: false },
  clubId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'created']);

const confirmingClose = ref(false);
const customFieldDefs = ref([]);
const priorSeasons = ref([]);
const selectedAgreementTemplateKey = ref('');

const recordMetricOptions = [
  { value: 'longest_run', label: 'Longest Run' },
  { value: 'fastest_mile', label: 'Fastest Mile' },
  { value: 'longest_ruck', label: 'Longest Ruck' },
  { value: 'highest_points_workout', label: 'Highest Points (Single Workout)' },
  { value: 'longest_trail_run', label: 'Longest Trail Run' },
  { value: 'fastest_5k', label: 'Fastest 5K' },
  { value: 'longest_walk', label: 'Longest Walk' },
  { value: 'longest_duration_workout', label: 'Longest Workout Duration' },
  { value: 'highest_calories_workout', label: 'Highest Calories (Single Workout)' }
];

const defaultForm = () => ({
  ...defaultAgreementFormFields(),
  className: '',
  description: '',
  status: 'draft',
  startsAt: '',
  endsAt: '',
  activityTypesText: '',
  weeklyGoalMinimum: null,
  teamMinPointsPerWeek: null,
  individualMinPointsPerWeek: null,
  recognitionCategories: [],
  eventCategory: 'run_ruck',
  challengeAssignmentMode: 'volunteer_or_elect',
  weekEndsSundayAt: '23:59',
  weekTimeZone: 'UTC',
  runMilesPerPoint: 1,
  ruckMilesPerPoint: 1,
  caloriesPerPoint: 100,
  runRuckStartMilesPerPerson: 0,
  runRuckWeeklyIncreaseMilesPerPerson: 2,
  maxRucksPerWeek: 0,
  teamCount: 2,
  allowCaptainRenameTeam: true,
  allowCaptainNicknameSuffixWhenLocked: false,
  presetTeamNamesText: '',
  allowByeWeek: false,
  maxByeWeeksPerParticipant: 1,
  requireAdvanceByeDeclaration: true,
  postseasonEnabled: false,
  regularSeasonWeeks: 10,
  postseasonHasBreakWeek: false,
  postseasonBreakWeekNumber: 11,
  playoffWeekNumber: 11,
  championshipWeekNumber: 12,
  playoffSeedCount: 4,
  playoffMatchupMode: '1v4_2v3',
  workoutModerationMode: 'treadmill_only',
  treadmillPhotoRequired: true,
  treadmillpocalypseEnabled: false,
  treadmillpocalypseStartsAtWeek: '',
  treadmillpocalypseIconId: null,
  recordMetrics: []
});

const form = ref(defaultForm());
const saving = ref(false);
const error = ref('');
const success = ref(false);
const successMessage = ref('');
const agreementTemplateOptions = computed(() => collectUniqueParticipationAgreementSnapshots(priorSeasons.value));

function defaultAgreementFormFields() {
  const agreement = defaultParticipationAgreement();
  return {
    agreementLabel: agreement.label,
    agreementIntroText: agreement.introText,
    agreementItemsText: agreementItemsToTextarea(agreement.items)
  };
}

function buildParticipationAgreementPayload(source = {}) {
  return {
    label: String(source.agreementLabel || '').trim(),
    introText: String(source.agreementIntroText || '').trim(),
    items: agreementTextareaToItems(source.agreementItemsText)
  };
}

function applyAgreementValues(agreement = {}) {
  form.value.agreementLabel = agreement?.label || '';
  form.value.agreementIntroText = agreement?.introText || '';
  form.value.agreementItemsText = agreementItemsToTextarea(agreement?.items || []);
}

function applyAgreementTemplate() {
  const snapshot = agreementTemplateOptions.value.find((option) => option.key === selectedAgreementTemplateKey.value);
  if (!snapshot) return;
  applyAgreementValues(snapshot.agreement);
}

function formatAgreementTemplateOption(option) {
  return formatParticipationAgreementSeasonLabel(option);
}

watch(() => props.open, (open) => {
  if (open) {
    confirmingClose.value = false;
    loadCustomFields();
    loadPriorSeasons();
  } else {
    form.value = defaultForm();
    error.value = '';
    success.value = false;
    successMessage.value = '';
    confirmingClose.value = false;
    priorSeasons.value = [];
    selectedAgreementTemplateKey.value = '';
  }
});

async function loadCustomFields() {
  if (!props.clubId) return;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${props.clubId}/custom-fields`, { skipGlobalLoading: true, skipAuthRedirect: true });
    customFieldDefs.value = Array.isArray(data?.fields) ? data.fields : [];
  } catch {
    customFieldDefs.value = [];
  }
}

async function loadPriorSeasons() {
  if (!props.clubId) {
    priorSeasons.value = [];
    return;
  }
  try {
    const { data } = await api.get('/learning-program-classes', {
      params: { organizationId: Number(props.clubId), includeArchived: true },
      skipGlobalLoading: true
    });
    priorSeasons.value = Array.isArray(data?.classes) ? data.classes : [];
  } catch {
    priorSeasons.value = [];
  }
}

function requestClose() {
  if (success.value) { emit('close'); return; }
  const hasInput = form.value.className.trim() || form.value.description.trim() ||
    form.value.startsAt || form.value.endsAt;
  if (!hasInput) { emit('close'); return; }
  confirmingClose.value = true;
}

function confirmClose() {
  confirmingClose.value = false;
  emit('close');
}

const submit = async () => {
  if (!props.clubId) return;
  saving.value = true;
  error.value = '';
  try {
    const atText = String(form.value.activityTypesText || '').trim();
    let activityTypesJson = null;
    if (atText) {
      const arr = atText.split(',').map((s) => s.trim()).filter(Boolean);
      if (arr.length) activityTypesJson = arr;
    }
    const startsAt = form.value.startsAt ? new Date(form.value.startsAt).toISOString() : null;
    const endsAt = form.value.endsAt ? new Date(form.value.endsAt).toISOString() : null;

    const cats = Array.isArray(form.value.recognitionCategories) ? form.value.recognitionCategories : [];
    const mastersThreshold = (() => {
      const m = cats.find(c => c.type === 'masters');
      return m ? (m.ageThreshold ?? 53) : 53;
    })();

    const seasonSettingsJson = {
      event: {
        category: form.value.eventCategory || 'run_ruck',
        challengeAssignmentMode: form.value.challengeAssignmentMode || 'volunteer_or_elect'
      },
      schedule: {
        weekEndsSundayAt: form.value.weekEndsSundayAt || '23:59',
        weekTimeZone: form.value.weekTimeZone || 'UTC'
      },
      scoring: {
        weeklyMinimumPointsPerAthlete: form.value.individualMinPointsPerWeek ?? 0,
        teamWeeklyTargetPoints: form.value.teamMinPointsPerWeek ?? 0,
        runMilesPerPoint: Number(form.value.runMilesPerPoint ?? 1),
        ruckMilesPerPoint: Number(form.value.ruckMilesPerPoint ?? 1),
        caloriesPerPoint: Number(form.value.caloriesPerPoint ?? 100)
      },
      teams: {
        teamCount: Number(form.value.teamCount ?? 2),
        presetTeamNames: String(form.value.presetTeamNamesText || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        allowCaptainRenameTeam: form.value.allowCaptainRenameTeam !== false,
        allowCaptainNicknameSuffixWhenLocked: form.value.allowCaptainNicknameSuffixWhenLocked === true
      },
      participation: {
        individualMinPointsPerWeek: Number(form.value.individualMinPointsPerWeek ?? 0),
        teamMinPointsPerWeek: Number(form.value.teamMinPointsPerWeek ?? 0),
        runRuckStartMilesPerPerson: Number(form.value.runRuckStartMilesPerPerson ?? 0),
        runRuckWeeklyIncreaseMilesPerPerson: Number(form.value.runRuckWeeklyIncreaseMilesPerPerson ?? 2),
        maxRucksPerWeek: Number(form.value.maxRucksPerWeek ?? 0)
      },
      participationAgreement: buildParticipationAgreementPayload(form.value),
      byeWeek: {
        allowByeWeek: form.value.allowByeWeek === true,
        maxByeWeeksPerParticipant: Number(form.value.maxByeWeeksPerParticipant ?? 1),
        requireAdvanceDeclaration: form.value.requireAdvanceByeDeclaration !== false
      },
      postseason: {
        enabled: form.value.postseasonEnabled === true,
        regularSeasonWeeks: Number(form.value.regularSeasonWeeks ?? 10),
        hasBreakWeek: form.value.postseasonHasBreakWeek === true,
        breakWeekNumber: form.value.postseasonHasBreakWeek === true
          ? Number(form.value.postseasonBreakWeekNumber ?? 11)
          : null,
        playoffWeekNumber: Number(form.value.playoffWeekNumber ?? 11),
        championshipWeekNumber: Number(form.value.championshipWeekNumber ?? 12),
        playoffSeedCount: Number(form.value.playoffSeedCount ?? 4),
        playoffMatchupMode: form.value.playoffMatchupMode || '1v4_2v3'
      },
      treadmill: {
        photoProofRequired: form.value.treadmillPhotoRequired !== false
      },
      treadmillpocalypse: {
        enabled: form.value.treadmillpocalypseEnabled === true,
        startsAtWeek: form.value.treadmillpocalypseStartsAtWeek || null,
        icon: form.value.treadmillpocalypseIconId ? `icon:${form.value.treadmillpocalypseIconId}` : null
      },
      workoutModeration: {
        mode: form.value.workoutModerationMode || 'treadmill_only'
      },
      records: {
        metrics: Array.isArray(form.value.recordMetrics) ? form.value.recordMetrics : []
      }
    };

    const payload = {
      organizationId: Number(props.clubId),
      className: String(form.value.className || '').trim(),
      description: form.value.description || null,
      status: form.value.status,
      startsAt,
      endsAt,
      activityTypesJson,
      weeklyGoalMinimum: form.value.weeklyGoalMinimum ?? null,
      teamMinPointsPerWeek: form.value.teamMinPointsPerWeek ?? null,
      individualMinPointsPerWeek: form.value.individualMinPointsPerWeek ?? null,
      mastersAgeThreshold: mastersThreshold,
      recognitionCategoriesJson: cats.length ? cats : null,
      seasonSettingsJson
    };
    await api.post('/learning-program-classes', payload, { skipGlobalLoading: true });
    success.value = true;
    successMessage.value = `"${form.value.className}" has been created. You can add teams and participants from Season Management.`;
    emit('created');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to create season';
  } finally {
    saving.value = false;
  }
};

const handleDone = () => {
  emit('close');
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1400;
}

.modal-content {
  background: white;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  width: 96%;
  max-width: 520px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-content.modal-wide {
  max-width: 680px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
}

/* Cancel confirmation strip */
.confirm-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  background: #fef3c7;
  border-bottom: 1px solid #fde68a;
  font-size: 14px;
  font-weight: 600;
  color: #92400e;
  flex-shrink: 0;
}
.confirm-strip-actions {
  display: flex;
  gap: 8px;
}

.modal-body {
  padding: 20px;
  overflow: auto;
  flex: 1;
}

.hint {
  margin: 0 0 20px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.section-label {
  display: block;
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 4px;
}

.section-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
}

.participation-agreement-section {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #f8fafc;
}

.inline-action-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.inline-action-row .form-input {
  flex: 1;
}

.add-season-form .form-group {
  margin-bottom: 16px;
}

.add-season-form label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 14px;
}

.form-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.form-row .form-group {
  flex: 1;
  min-width: 140px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

.add-season-form small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  cursor: pointer;
}

.error-msg {
  color: #b91c1c;
  font-size: 13px;
  margin-bottom: 12px;
}

.success-msg {
  text-align: center;
}

.success-msg p {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.btn-sm { padding: 5px 12px; font-size: 13px; }
.btn-danger { background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer; }
.btn-danger:hover { background: #b91c1c; }
</style>
