<template>
  <section class="weekly-challenges-shell">
    <div class="weekly-hero">
      <div>
        <p class="weekly-eyebrow">This Week's Mission Board</p>
        <h2>Weekly Challenges</h2>
        <p class="weekly-subtitle">
          Fresh challenge drops for every season participant. Claim one for yourself, or assign one if you're leading your team.
        </p>
      </div>

      <div class="weekly-controls">
        <label class="week-picker">
          <span>Week</span>
          <select v-model="selectedWeekIdx" class="week-select">
            <option v-for="(w, i) in seasonWeeks" :key="w.date" :value="i">{{ w.label }}</option>
            <option v-if="!seasonWeeks.length" :value="0" disabled>No weeks available</option>
          </select>
        </label>

        <button
          v-if="byeWeekAllowed"
          type="button"
          class="btn btn-secondary"
          :disabled="declaringBye || hasByeDeclaredForWeek"
          @click="declareByeWeek"
        >
          {{ declaringBye ? 'Declaring…' : hasByeDeclaredForWeek ? 'Bye week declared' : 'Declare Bye Week' }}
        </button>
      </div>
    </div>

    <div v-if="byeWeekAllowed" class="bye-banner">
      <strong>Bye weeks:</strong> {{ byeWeeks.length }} of {{ maxByeWeeks }} used.
    </div>

    <div v-if="loading" class="weekly-state-card">
      Loading weekly challenges…
    </div>

    <template v-else>
      <div v-if="props.isManager && tasks.length && !isPublishedForMembers" class="publish-banner">
        Members will see this challenge drop on <strong>{{ publishAtLabel }}</strong>.
      </div>

      <div v-if="!tasks.length && !isPublishedForMembers && publishAtLabel" class="weekly-state-card">
        <strong>Challenge drop scheduled.</strong>
        <span>These weekly challenges unlock for members on {{ publishAtLabel }}.</span>
      </div>

      <div v-else-if="!tasks.length" class="weekly-state-card">
        No weekly challenges have been posted for this week yet.
      </div>

      <div v-else class="weekly-grid">
        <article
          v-for="task in tasks"
          :key="task.id"
          class="challenge-card"
          :style="cardTheme(task)"
        >
          <div class="challenge-card-glow"></div>

          <div class="challenge-card-main">
            <div class="challenge-icon-shell" :style="iconTheme(task)">
              <img v-if="resolvedIconUrl(task.icon)" :src="resolvedIconUrl(task.icon)" class="challenge-icon-img" alt="" />
              <span v-else class="challenge-icon-emoji">{{ emojiIcon(task) }}</span>
            </div>

            <div class="challenge-copy">
              <div class="challenge-topline">
                <div>
                  <div class="challenge-kicker">{{ sectionLabel(task) }}</div>
                  <h3>{{ task.name }}</h3>
                </div>
                <span :class="['mode-pill', `mode-pill--${modeClass(task.mode)}`]">{{ modeLabel(task.mode) }}</span>
              </div>

              <p v-if="task.description" class="challenge-description">{{ task.description }}</p>

              <div class="challenge-chips">
                <span v-for="chip in taskChips(task)" :key="`${task.id}-${chip}`" class="challenge-chip">
                  {{ chip }}
                </span>
              </div>

              <div class="challenge-status-row">
                <template v-if="task.mode === 'full_team'">
                  <div class="challenge-status-card">
                    <span class="status-label">Team progress</span>
                    <strong>{{ fullTeamTaggedCount(task.id) }}/{{ Math.max(myTeamMembers.length, 1) }} tagged</strong>
                    <span>{{ fullTeamStatusCopy }}</span>
                  </div>
                </template>

                <template v-else-if="myTeamAssignment(task.id)">
                  <div class="challenge-status-card">
                    <span class="status-label">{{ myTeamAssignment(task.id)?.volunteered ? 'Claimed by' : 'Assigned to' }}</span>
                    <strong>{{ assigneeName(myTeamAssignment(task.id)) }}</strong>
                    <span v-if="isMyAssignment(myTeamAssignment(task.id))">You're cleared to tag a qualifying workout.</span>
                    <span v-else>One member handles this challenge for your team.</span>
                  </div>
                </template>

                <template v-else>
                  <div class="challenge-status-card">
                    <span class="status-label">Status</span>
                    <strong>No one assigned yet</strong>
                    <span>{{ unassignedCopy(task) }}</span>
                  </div>
                </template>

                <div v-if="showCaptainAssign(task)" class="captain-assign-panel">
                  <label class="captain-assign-label">Captain assign</label>
                  <div class="captain-assign-row">
                    <select v-model="captainPick[task.id]" class="captain-select">
                      <option value="">Choose a teammate</option>
                      <option
                        v-for="member in myTeamMembers"
                        :key="member.provider_user_id"
                        :value="String(member.provider_user_id)"
                      >
                        {{ member.first_name }} {{ member.last_name }}
                      </option>
                    </select>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="!captainPick[task.id] || assigning[task.id]"
                      @click="captainAssign(task)"
                    >
                      {{ assigning[task.id] ? 'Saving…' : myTeamAssignment(task.id) ? 'Reassign' : 'Assign' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="challenge-card-actions">
            <button
              v-if="canClaimTask(task)"
              type="button"
              class="claim-btn"
              :disabled="volunteering[task.id]"
              @click="claimTask(task)"
            >
              {{ volunteering[task.id] ? 'Claiming…' : 'Claim This Challenge' }}
            </button>

            <button
              v-else-if="canTagTask(task)"
              type="button"
              class="tag-btn"
              @click="emitTagTask(task)"
            >
              Tag Qualifying Workout
            </button>

            <span v-else-if="task.mode === 'captain_assigns' && !showCaptainAssign(task)" class="action-hint">
              Your captain will assign one teammate for this challenge.
            </span>
            <span v-else-if="task.mode === 'volunteer_or_elect' && myTeamAssignment(task.id) && !isMyAssignment(myTeamAssignment(task.id))" class="action-hint">
              This one has already been claimed for your team.
            </span>
            <span v-else-if="!isOnMyTeam" class="action-hint">
              Join a team to participate in weekly challenges.
            </span>

            <button type="button" class="btn-link" @click="openDetail(task)">View details</button>
          </div>
        </article>
      </div>
    </template>

    <div
      v-if="showSplashModal && splashTasks.length"
      class="weekly-splash-overlay"
      @click.self="dismissWeeklySplash"
    >
      <div class="weekly-splash-card">
        <div class="weekly-splash-header">
          <div>
            <span class="weekly-splash-kicker">Challenge Drop</span>
            <h3>New weekly challenges are live</h3>
            <p>{{ selectedWeekLabel }}</p>
          </div>
          <button type="button" class="weekly-splash-close" @click="dismissWeeklySplash">×</button>
        </div>

        <div class="weekly-splash-grid">
          <div
            v-for="task in splashTasks"
            :key="`splash-${task.id}`"
            class="weekly-splash-task"
            :style="cardTheme(task)"
          >
            <div class="weekly-splash-task-head">
              <div class="challenge-icon-shell challenge-icon-shell--sm" :style="iconTheme(task)">
                <img v-if="resolvedIconUrl(task.icon)" :src="resolvedIconUrl(task.icon)" class="challenge-icon-img" alt="" />
                <span v-else class="challenge-icon-emoji">{{ emojiIcon(task) }}</span>
              </div>
              <div>
                <strong>{{ task.name }}</strong>
                <div class="weekly-splash-type">{{ modeLabel(task.mode) }}</div>
              </div>
            </div>
            <p class="weekly-splash-desc">{{ task.description || 'Ready for your team this week.' }}</p>
            <button
              v-if="canClaimTask(task)"
              type="button"
              class="claim-btn claim-btn--compact"
              :disabled="volunteering[task.id]"
              @click="claimTask(task)"
            >
              {{ volunteering[task.id] ? 'Claiming…' : 'Claim It' }}
            </button>
          </div>
        </div>

        <div class="weekly-splash-actions">
          <button type="button" class="btn btn-secondary" @click="dismissWeeklySplash">Dismiss</button>
        </div>
      </div>
    </div>

    <ChallengeTaskDetailModal
      v-if="detailTask"
      :challenge-id="challengeId"
      :task="detailTask"
      @close="detailTask = null"
    />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import ChallengeTaskDetailModal from './ChallengeTaskDetailModal.vue';
import { useSeasonWeeks } from '../../composables/useSeasonWeeks.js';
import { challengeProofPolicyLabel } from '../../utils/challengeProofPolicies.js';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  myUserId: { type: [String, Number], default: null },
  isCaptain: { type: Boolean, default: false },
  isManager: { type: Boolean, default: false },
  seasonStartsAt: { type: [String, Date], default: null },
  seasonEndsAt: { type: [String, Date], default: null }
});

const emit = defineEmits(['tag-task']);

const { seasonWeeks, selectedWeekIdx, weekStartDate: weekStart } = useSeasonWeeks(
  computed(() => props.seasonStartsAt),
  { defaultToLatest: false, seasonEndsAtRef: computed(() => props.seasonEndsAt) }
);

const loading = ref(false);
const tasks = ref([]);
const assignments = ref([]);
const myTeam = ref(null);
const myTeamMembers = ref([]);
const taggedWorkouts = ref([]);
const byeWeekAllowed = ref(false);
const maxByeWeeks = ref(1);
const byeWeeks = ref([]);
const declaringBye = ref(false);
const volunteering = ref({});
const assigning = ref({});
const captainPick = ref({});
const detailTask = ref(null);
const publishAt = ref('');
const isPublishedForMembers = ref(true);
const showWeeklySplash = ref(false);
const showSplashModal = ref(false);
const iconUrlCache = ref({});

const hasByeDeclaredForWeek = computed(() =>
  (byeWeeks.value || []).some((b) => String(b.week_start_date || '').slice(0, 10) === String(weekStart.value || '').slice(0, 10))
);

const isOnMyTeam = computed(() => !!myTeam.value);

const publishAtLabel = computed(() => {
  if (!publishAt.value) return '';
  const dt = new Date(publishAt.value);
  if (!Number.isFinite(dt.getTime())) return '';
  return dt.toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
});

const selectedWeekLabel = computed(() => seasonWeeks.value[selectedWeekIdx.value]?.label || 'This week');

const fullTeamStatusCopy = computed(() => (
  isOnMyTeam.value
    ? 'Any teammate can tag a qualifying workout.'
    : 'Once you join a team, your card will track team-wide progress.'
));

const splashStorageKey = computed(() => {
  const uid = Number(props.myUserId || 0);
  const cid = Number(props.challengeId || 0);
  const wk = String(weekStart.value || '').slice(0, 10);
  const published = String(publishAt.value || '').slice(0, 19);
  return `sstc-weekly-splash:${cid}:${uid}:${wk}:${published}`;
});

const splashTasks = computed(() => (tasks.value || []).slice(0, 3));

const normalizeTeamRow = (team) => {
  if (!team || typeof team !== 'object') return null;
  const teamId = team.teamId ?? team.team_id ?? team.id ?? null;
  const challengeId = team.challengeId ?? team.challenge_id ?? null;
  if (!teamId || !challengeId) return null;
  return {
    ...team,
    id: Number(teamId),
    teamId: Number(teamId),
    challengeId: Number(challengeId)
  };
};

function modeLabel(mode) {
  if (mode === 'full_team') return 'Full Team';
  if (mode === 'captain_assigns') return 'Captain Assigns';
  return 'Self-Claim';
}

function modeClass(mode) {
  if (mode === 'full_team') return 'team';
  if (mode === 'captain_assigns') return 'captain';
  return 'claim';
}

function sectionLabel(task) {
  if (task.mode === 'full_team') return 'Team-wide challenge';
  if (task.mode === 'captain_assigns') return 'Captain-led challenge';
  return 'Self-elect challenge';
}

function emojiIcon(task) {
  const icon = String(task?.icon || '').trim();
  if (icon && !icon.startsWith('icon:')) return icon;
  const activity = String(task?.activity_type || task?.activityType || '').toLowerCase();
  if (activity.includes('ruck')) return '🥾';
  if (activity.includes('run')) return '🏃';
  if (activity.includes('walk')) return '🚶';
  if (activity.includes('bike')) return '🚴';
  if (activity.includes('fitness')) return '💪';
  return '🎯';
}

function activityTheme(task) {
  const activity = String(task?.activity_type || task?.activityType || '').toLowerCase();
  if (activity.includes('ruck')) return { accent: '#7c4d1d', soft: '#f8ede1', glow: 'rgba(124, 77, 29, 0.18)' };
  if (activity.includes('run')) return { accent: '#d94841', soft: '#fff0eb', glow: 'rgba(217, 72, 65, 0.18)' };
  if (activity.includes('walk')) return { accent: '#168a72', soft: '#e9fbf7', glow: 'rgba(22, 138, 114, 0.18)' };
  if (activity.includes('bike')) return { accent: '#0f6cc5', soft: '#edf5ff', glow: 'rgba(15, 108, 197, 0.18)' };
  if (activity.includes('fitness')) return { accent: '#6a42d8', soft: '#f1edff', glow: 'rgba(106, 66, 216, 0.18)' };
  return { accent: '#ef7f1a', soft: '#fff5e8', glow: 'rgba(239, 127, 26, 0.18)' };
}

function cardTheme(task) {
  const theme = activityTheme(task);
  return {
    '--challenge-accent': theme.accent,
    '--challenge-soft': theme.soft,
    '--challenge-glow': theme.glow
  };
}

function iconTheme(task) {
  const theme = activityTheme(task);
  return {
    background: `linear-gradient(145deg, ${theme.accent} 0%, ${theme.accent}cc 100%)`,
    boxShadow: `0 18px 40px ${theme.glow}`
  };
}

function modeCopy(task) {
  if (task.mode === 'full_team') return 'Everyone on the team can contribute.';
  if (task.mode === 'captain_assigns') return 'One teammate gets selected by the captain.';
  return 'The first teammate to volunteer claims the spot.';
}

function proofChip(task) {
  return challengeProofPolicyLabel(task?.proof_policy || 'none', { short: true });
}

function criteriaObject(task) {
  const raw = task?.criteria_json ?? task?.criteriaJson;
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function taskChips(task) {
  const chips = [];
  const activity = String(task?.activity_type || task?.activityType || '').trim();
  if (activity) chips.push(activity);
  const criteria = criteriaObject(task);
  if (criteria?.distance?.minMiles) chips.push(`${criteria.distance.minMiles}+ mi`);
  if (criteria?.duration?.minMinutes) chips.push(`${criteria.duration.minMinutes}+ min`);
  if (criteria?.timeOfDay?.start && criteria?.timeOfDay?.end) chips.push(`${criteria.timeOfDay.start}–${criteria.timeOfDay.end}`);
  if (criteria?.splitRuns?.count) chips.push(`${criteria.splitRuns.count} runs/day`);
  chips.push(proofChip(task));
  return chips.filter(Boolean).slice(0, 5);
}

function myTeamAssignment(taskId) {
  return assignments.value.find(
    (a) => Number(a.task_id) === Number(taskId) && myTeam.value && Number(a.team_id) === Number(myTeam.value.id)
  ) || null;
}

function assigneeName(assignment) {
  if (!assignment) return '—';
  return `${assignment.provider_first_name || ''} ${assignment.provider_last_name || ''}`.trim() || '—';
}

function isMyAssignment(assignment) {
  return !!assignment && Number(assignment.provider_user_id) === Number(props.myUserId);
}

function fullTeamTaggedCount(taskId) {
  return taggedWorkouts.value.filter((w) => Number(w.weekly_task_id) === Number(taskId)).length;
}

function canClaimTask(task) {
  return isOnMyTeam.value
    && task.mode === 'volunteer_or_elect'
    && !myTeamAssignment(task.id);
}

function showCaptainAssign(task) {
  return !!(props.isCaptain && myTeam.value && task.mode !== 'full_team');
}

function canTagTask(task) {
  if (!isOnMyTeam.value) return false;
  if (task.mode === 'full_team') return true;
  return isMyAssignment(myTeamAssignment(task.id));
}

function unassignedCopy(task) {
  if (!isOnMyTeam.value) return 'Join a team to take part.';
  return modeCopy(task);
}

function openDetail(task) {
  detailTask.value = task;
}

function emitTagTask(task) {
  emit('tag-task', task);
}

function isIconRef(icon) {
  return typeof icon === 'string' && icon.startsWith('icon:');
}

function queueIconResolve(iconRef) {
  if (!isIconRef(iconRef)) return;
  const id = Number.parseInt(String(iconRef).replace('icon:', ''), 10);
  if (!id || iconUrlCache.value[id]) return;
  api.get(`/icons/${id}`, { skipGlobalLoading: true }).then(({ data }) => {
    const raw = data?.url || data?.file_path || null;
    if (raw) {
      iconUrlCache.value = {
        ...iconUrlCache.value,
        [id]: toUploadsUrl(raw) || raw
      };
    }
  }).catch(() => {});
}

function resolvedIconUrl(iconRef) {
  if (!isIconRef(iconRef)) return null;
  const id = Number.parseInt(String(iconRef).replace('icon:', ''), 10);
  if (!id) return null;
  if (!iconUrlCache.value[id]) queueIconResolve(iconRef);
  return iconUrlCache.value[id] || null;
}

function maybeShowSplash() {
  if (props.isManager) {
    showSplashModal.value = false;
    return;
  }
  if (!showWeeklySplash.value || !isPublishedForMembers.value || !tasks.value.length) {
    showSplashModal.value = false;
    return;
  }
  try {
    showSplashModal.value = localStorage.getItem(splashStorageKey.value) !== 'dismissed';
  } catch {
    showSplashModal.value = true;
  }
}

function dismissWeeklySplash() {
  showSplashModal.value = false;
  try {
    localStorage.setItem(splashStorageKey.value, 'dismissed');
  } catch {
    // ignore localStorage failures
  }
}

async function claimTask(task) {
  if (!myTeam.value) {
    window.alert('You need to join a team before claiming a weekly challenge.');
    return;
  }
  volunteering.value = { ...volunteering.value, [task.id]: true };
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/weekly-assignments`, {
      taskId: task.id,
      teamId: myTeam.value.id,
      providerUserId: props.myUserId,
      volunteered: true
    });
    dismissWeeklySplash();
    await load();
  } catch (err) {
    window.alert(err?.response?.data?.error?.message || 'Failed to claim challenge');
  } finally {
    volunteering.value = { ...volunteering.value, [task.id]: false };
  }
}

async function captainAssign(task) {
  const memberId = Number(captainPick.value[task.id] || 0);
  if (!memberId || !myTeam.value) return;
  assigning.value = { ...assigning.value, [task.id]: true };
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/weekly-assignments`, {
      taskId: task.id,
      teamId: myTeam.value.id,
      providerUserId: memberId,
      volunteered: false
    });
    captainPick.value = { ...captainPick.value, [task.id]: '' };
    await load();
  } catch (err) {
    window.alert(err?.response?.data?.error?.message || 'Failed to assign challenge');
  } finally {
    assigning.value = { ...assigning.value, [task.id]: false };
  }
}

async function declareByeWeek() {
  if (!props.challengeId || !byeWeekAllowed.value) return;
  declaringBye.value = true;
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/bye-weeks/declare`, {
      week: weekStart.value
    });
    await load();
  } catch (err) {
    window.alert(err?.response?.data?.error?.message || 'Failed to declare bye week');
  } finally {
    declaringBye.value = false;
  }
}

async function load() {
  if (!props.challengeId) return;
  loading.value = true;
  try {
    const [tasksRes, assignRes, classRes, byeRes, myTeamsRes] = await Promise.all([
      api.get(`/learning-program-classes/${props.challengeId}/weekly-tasks`, {
        params: { week: weekStart.value },
        skipGlobalLoading: true
      }),
      api.get(`/learning-program-classes/${props.challengeId}/weekly-assignments`, {
        params: { week: weekStart.value },
        skipGlobalLoading: true
      }),
      api.get(`/learning-program-classes/${props.challengeId}`, { skipGlobalLoading: true }),
      api.get(`/learning-program-classes/${props.challengeId}/bye-weeks/my`, { skipGlobalLoading: true }),
      api.get('/learning-program-classes/my/summary', { skipGlobalLoading: true }).catch(() => ({ data: { teams: [] } }))
    ]);

    tasks.value = Array.isArray(tasksRes.data?.tasks) ? tasksRes.data.tasks : [];
    assignments.value = Array.isArray(assignRes.data?.assignments) ? assignRes.data.assignments : [];
    byeWeeks.value = Array.isArray(byeRes.data?.byeWeeks) ? byeRes.data.byeWeeks : [];
    publishAt.value = String(tasksRes.data?.publishAt || assignRes.data?.publishAt || '');
    isPublishedForMembers.value = tasksRes.data?.isPublishedForMembers !== false;
    showWeeklySplash.value = tasksRes.data?.showWeeklySplash !== false;

    for (const task of tasks.value) {
      if (isIconRef(task?.icon)) queueIconResolve(task.icon);
    }

    const settings = classRes.data?.class?.season_settings_json && typeof classRes.data.class.season_settings_json === 'object'
      ? classRes.data.class.season_settings_json
      : {};
    const bye = settings.byeWeek || {};
    byeWeekAllowed.value = bye.allowByeWeek === true;
    maxByeWeeks.value = Number(bye.maxByeWeeksPerParticipant ?? 1);

    const allMyTeams = Array.isArray(myTeamsRes.data?.teams)
      ? myTeamsRes.data.teams.map(normalizeTeamRow).filter(Boolean)
      : [];
    myTeam.value = allMyTeams.find((team) => Number(team.challengeId) === Number(props.challengeId)) || null;

    if (myTeam.value?.id) {
      try {
        const membRes = await api.get(
          `/learning-program-classes/${props.challengeId}/teams/${myTeam.value.id}/members`,
          { skipGlobalLoading: true }
        );
        myTeamMembers.value = Array.isArray(membRes.data?.members) ? membRes.data.members : [];
      } catch {
        myTeamMembers.value = [];
      }

      if (tasks.value.some((task) => task.mode === 'full_team')) {
        try {
          const workoutRes = await api.get(
            `/learning-program-classes/${props.challengeId}/workouts`,
            { params: { week: weekStart.value, teamId: myTeam.value.id, hasTask: true }, skipGlobalLoading: true }
          );
          taggedWorkouts.value = Array.isArray(workoutRes.data?.workouts) ? workoutRes.data.workouts : [];
        } catch {
          taggedWorkouts.value = [];
        }
      } else {
        taggedWorkouts.value = [];
      }
    } else {
      myTeamMembers.value = [];
      taggedWorkouts.value = [];
    }

    maybeShowSplash();
  } catch {
    tasks.value = [];
    assignments.value = [];
    myTeam.value = null;
    myTeamMembers.value = [];
    taggedWorkouts.value = [];
    byeWeeks.value = [];
    byeWeekAllowed.value = false;
    publishAt.value = '';
    isPublishedForMembers.value = true;
    showSplashModal.value = false;
  } finally {
    loading.value = false;
  }
}

watch(() => props.challengeId, load, { immediate: true });
watch(() => props.isCaptain, load);
watch(weekStart, load);
watch([showWeeklySplash, isPublishedForMembers, tasks, splashStorageKey], maybeShowSplash);

defineExpose({ load });
</script>

<style scoped>
.weekly-challenges-shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.weekly-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 28px;
  border-radius: 28px;
  background:
    radial-gradient(circle at top right, rgba(255, 148, 58, 0.20), transparent 28%),
    radial-gradient(circle at bottom left, rgba(38, 119, 214, 0.12), transparent 26%),
    linear-gradient(135deg, #ffffff 0%, #fffaf2 100%);
  border: 1px solid rgba(234, 120, 35, 0.12);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.07);
}

.weekly-eyebrow {
  margin: 0 0 8px;
  font-size: 0.76rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #ef7f1a;
  font-weight: 800;
}

.weekly-hero h2 {
  margin: 0;
  font-size: clamp(1.8rem, 3vw, 2.5rem);
  line-height: 1.04;
  color: #1f2742;
}

.weekly-subtitle {
  max-width: 700px;
  margin: 10px 0 0;
  color: #66738f;
  line-height: 1.6;
}

.weekly-controls {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.week-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 250px;
}

.week-picker span {
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #78839d;
}

.week-select,
.captain-select {
  width: 100%;
  min-height: 46px;
  border-radius: 16px;
  border: 1px solid #d6deea;
  background: rgba(255, 255, 255, 0.94);
  padding: 0 16px;
  font-weight: 600;
  color: #2a3353;
}

.bye-banner,
.publish-banner,
.weekly-state-card {
  padding: 16px 18px;
  border-radius: 18px;
  background: #fff;
  border: 1px solid #e7edf5;
  color: #5f6c87;
}

.bye-banner {
  background: linear-gradient(135deg, #f6fbff 0%, #eef6ff 100%);
}

.publish-banner {
  background: linear-gradient(135deg, #fff7eb 0%, #fff1dc 100%);
  color: #8a5313;
  border-color: rgba(239, 127, 26, 0.18);
}

.weekly-state-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.weekly-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 18px;
}

.challenge-card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 100%;
  padding: 22px;
  border-radius: 26px;
  border: 1px solid color-mix(in srgb, var(--challenge-accent) 22%, #ffffff);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.96)),
    linear-gradient(135deg, var(--challenge-soft), #ffffff);
  box-shadow: 0 18px 50px var(--challenge-glow);
}

.challenge-card-glow {
  position: absolute;
  inset: auto -50px -60px auto;
  width: 180px;
  height: 180px;
  border-radius: 999px;
  background: var(--challenge-glow);
  filter: blur(28px);
  pointer-events: none;
}

.challenge-card-main {
  position: relative;
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.challenge-icon-shell {
  width: 96px;
  height: 96px;
  border-radius: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  border: 4px solid rgba(255, 255, 255, 0.7);
}

.challenge-icon-shell--sm {
  width: 58px;
  height: 58px;
  border-radius: 18px;
}

.challenge-icon-img {
  width: 76%;
  height: 76%;
  object-fit: contain;
}

.challenge-icon-emoji {
  font-size: 2.4rem;
  line-height: 1;
}

.challenge-copy {
  min-width: 0;
}

.challenge-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.challenge-kicker {
  margin-bottom: 6px;
  color: var(--challenge-accent);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.challenge-topline h3 {
  margin: 0;
  color: #1f2742;
  font-size: 1.5rem;
  line-height: 1.08;
}

.mode-pill {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.mode-pill--claim {
  background: #ecf8ee;
  color: #2f8f4d;
}

.mode-pill--captain {
  background: #edf5ff;
  color: #2066be;
}

.mode-pill--team {
  background: #fff0e5;
  color: #d16b1d;
}

.challenge-description {
  margin: 12px 0 0;
  color: #63708b;
  line-height: 1.65;
}

.challenge-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.challenge-chip {
  padding: 8px 12px;
  border-radius: 999px;
  background: #f5f7fb;
  border: 1px solid #e2e8f2;
  color: #51607d;
  font-size: 0.88rem;
  font-weight: 600;
}

.challenge-status-row {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 18px;
}

.challenge-status-card,
.captain-assign-panel {
  position: relative;
  z-index: 1;
  padding: 16px 18px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--challenge-soft) 60%, #ffffff);
  border: 1px solid color-mix(in srgb, var(--challenge-accent) 18%, #ffffff);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-label,
.captain-assign-label {
  color: #74819c;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.challenge-status-card strong {
  color: #1f2742;
  font-size: 1.06rem;
}

.captain-assign-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-top: 8px;
}

.challenge-card-actions {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: space-between;
}

.claim-btn,
.tag-btn {
  min-height: 48px;
  padding: 0 20px;
  border: none;
  border-radius: 16px;
  font-weight: 800;
  font-size: 0.94rem;
  cursor: pointer;
}

.claim-btn {
  color: #fff;
  background: linear-gradient(135deg, var(--challenge-accent), color-mix(in srgb, var(--challenge-accent) 68%, #000000));
  box-shadow: 0 16px 26px var(--challenge-glow);
}

.claim-btn:disabled {
  opacity: 0.65;
  cursor: wait;
}

.claim-btn--compact {
  min-height: 40px;
  width: 100%;
  justify-content: center;
}

.tag-btn {
  background: #1f2742;
  color: #fff;
}

.action-hint {
  color: #70809b;
  font-size: 0.92rem;
}

.btn-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--challenge-accent);
  font-weight: 800;
  cursor: pointer;
}

.weekly-splash-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.62);
  backdrop-filter: blur(10px);
}

.weekly-splash-card {
  width: min(980px, 100%);
  max-height: 90vh;
  overflow: auto;
  border-radius: 28px;
  padding: 26px;
  background:
    radial-gradient(circle at top right, rgba(255, 148, 58, 0.18), transparent 28%),
    linear-gradient(135deg, #ffffff 0%, #f7fbff 100%);
  box-shadow: 0 26px 80px rgba(15, 23, 42, 0.28);
}

.weekly-splash-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.weekly-splash-kicker {
  display: inline-block;
  margin-bottom: 8px;
  color: #ef7f1a;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.weekly-splash-header h3 {
  margin: 0;
  font-size: 2rem;
  color: #1f2742;
}

.weekly-splash-header p {
  margin: 8px 0 0;
  color: #61708a;
}

.weekly-splash-close {
  border: none;
  background: transparent;
  font-size: 2rem;
  line-height: 1;
  color: #8b96aa;
  cursor: pointer;
}

.weekly-splash-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-top: 22px;
}

.weekly-splash-task {
  padding: 18px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--challenge-accent) 18%, #ffffff);
  background: rgba(255, 255, 255, 0.86);
}

.weekly-splash-task-head {
  display: flex;
  gap: 12px;
  align-items: center;
}

.weekly-splash-type {
  margin-top: 4px;
  color: var(--challenge-accent);
  font-size: 0.82rem;
  font-weight: 700;
}

.weekly-splash-desc {
  color: #627089;
  line-height: 1.55;
  min-height: 72px;
}

.weekly-splash-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

@media (max-width: 820px) {
  .weekly-hero,
  .challenge-card-main {
    grid-template-columns: 1fr;
  }

  .weekly-hero {
    padding: 22px;
  }

  .challenge-icon-shell {
    width: 84px;
    height: 84px;
  }

  .captain-assign-row {
    grid-template-columns: 1fr;
  }

  .challenge-card-actions {
    align-items: stretch;
  }

  .claim-btn,
  .tag-btn {
    width: 100%;
  }
}
</style>
