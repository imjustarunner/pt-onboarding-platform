<template>
  <section class="challenge-weekly-tasks">
    <div class="tasks-header">
      <h2>Weekly Challenges</h2>
      <div class="tasks-week-selector">
        <label>Week of</label>
        <input v-model="weekStart" type="date" @change="load" />
        <button
          v-if="byeWeekAllowed"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="declaringBye || hasByeDeclaredForWeek"
          @click="declareByeWeek"
        >
          {{ declaringBye ? 'Declaring…' : hasByeDeclaredForWeek ? 'Bye Week Declared' : 'Declare Bye Week' }}
        </button>
      </div>
    </div>

    <div v-if="byeWeekAllowed" class="hint" style="margin-bottom: 8px;">
      You can use up to {{ maxByeWeeks }} bye week(s). Declared so far: {{ byeWeeks.length }}.
    </div>

    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="tasks-content">
      <div v-if="tasks.length" class="tasks-list">
        <div
          v-for="t in tasks"
          :key="t.id"
          class="task-card"
          @click="openDetail(t)"
        >
          <!-- Header row: name + mode badge -->
          <div class="task-card-header">
            <h4>{{ t.name }}</h4>
            <span :class="['mode-badge', modeBadgeClass(t.mode)]">{{ modeLabel(t.mode) }}</span>
          </div>

          <p v-if="t.description" class="task-desc">{{ t.description }}</p>

          <!-- Full-team: show member completion grid -->
          <template v-if="t.mode === 'full_team'">
            <div class="full-team-members">
              <div
                v-for="m in myTeamMembers"
                :key="m.provider_user_id"
                class="member-pill"
                :class="{ 'member-done': hasTaggedWorkout(t.id, m.provider_user_id) }"
              >
                <span class="pill-check">{{ hasTaggedWorkout(t.id, m.provider_user_id) ? '✓' : '○' }}</span>
                {{ m.first_name }} {{ m.last_name }}
              </div>
              <div v-if="!myTeamMembers.length" class="hint-sm">Team members will appear here once assigned to a team.</div>
            </div>
            <!-- Current user can tag their workout to this task -->
            <div class="task-actions" @click.stop>
              <button
                v-if="isOnMyTeam && !hasTaggedWorkout(t.id, myUserId)"
                class="btn btn-primary btn-sm"
                @click="promptTagWorkout(t)"
              >
                Tag My Workout
              </button>
              <span v-else-if="hasTaggedWorkout(t.id, myUserId)" class="badge-done">You've tagged a workout ✓</span>
            </div>
          </template>

          <!-- Volunteer / Captain-assigns modes -->
          <template v-else>
            <div v-if="myTeamAssignment(t.id)" class="task-assignment" @click.stop>
              <div class="assignee-row">
                <span class="assignee-label">Assigned to:</span>
                <span class="assignee-name">{{ assigneeName(myTeamAssignment(t.id)) }}</span>
                <span v-if="myTeamAssignment(t.id).is_completed" class="badge-done">Done ✓</span>
                <span v-else-if="myTeamAssignment(t.id).volunteered" class="badge-volunteered">Volunteered</span>
              </div>
              <!-- The assigned person marks it complete -->
              <button
                v-if="isMyAssignment(myTeamAssignment(t.id)) && !myTeamAssignment(t.id).is_completed"
                class="btn btn-primary btn-sm"
                @click="openCompleteModal(myTeamAssignment(t.id))"
              >
                Mark Complete
              </button>
            </div>
            <div v-else class="task-unassigned" @click.stop>
              <span class="unassigned-label">No one assigned yet</span>
              <div class="assign-actions">
                <!-- Volunteer button for any member -->
                <button
                  v-if="t.mode === 'volunteer_or_elect' && isOnMyTeam"
                  class="btn btn-outline btn-sm"
                  :disabled="volunteering[t.id]"
                  @click="volunteer(t)"
                >
                  {{ volunteering[t.id] ? 'Volunteering…' : 'Volunteer' }}
                </button>
                <!-- Captain assignment dropdown -->
                <template v-if="isCaptain && myTeam">
                  <select v-model="captainPick[t.id]" class="captain-select" @click.stop>
                    <option value="">— Assign a member —</option>
                    <option v-for="m in myTeamMembers" :key="m.provider_user_id" :value="m.provider_user_id">
                      {{ m.first_name }} {{ m.last_name }}
                    </option>
                  </select>
                  <button
                    class="btn btn-secondary btn-sm"
                    :disabled="!captainPick[t.id] || assigning[t.id]"
                    @click="captainAssign(t)"
                  >
                    {{ assigning[t.id] ? 'Assigning…' : 'Assign' }}
                  </button>
                </template>
              </div>
            </div>
          </template>

          <div class="task-card-footer" @click.stop>
            <button class="btn-link" @click="openDetail(t)">View details →</button>
          </div>
        </div>
      </div>
      <div v-else class="empty-hint">No weekly challenges set for this week. The program manager will add them shortly.</div>
    </div>

    <!-- Mark Complete modal -->
    <div v-if="showCompleteModal" class="modal-overlay" @click.self="showCompleteModal = false">
      <div class="modal-content">
        <h3>Mark Challenge Complete</h3>
        <p v-if="completingAssignment">{{ completingAssignment.task_name }}</p>
        <div class="form-group">
          <label>Notes (optional)</label>
          <textarea v-model="completeNotes" rows="3" placeholder="Add any notes or proof link…" />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" @click="showCompleteModal = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="completing" @click="submitComplete">
            {{ completing ? 'Saving…' : 'Mark Complete' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Task Detail Modal -->
    <ChallengeTaskDetailModal
      v-if="detailTask"
      :challenge-id="challengeId"
      :task="detailTask"
      @close="detailTask = null"
    />
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import ChallengeTaskDetailModal from './ChallengeTaskDetailModal.vue';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  myUserId: { type: [String, Number], default: null },
  isCaptain: { type: Boolean, default: false }
});

const weekStart = ref(getThisWeekSunday());
const loading = ref(false);
const tasks = ref([]);
const assignments = ref([]);
const myTeam = ref(null);
const myTeamMembers = ref([]);
const taggedWorkouts = ref([]); // workouts for current week (for full-team tag detection)
const byeWeekAllowed = ref(false);
const maxByeWeeks = ref(1);
const byeWeeks = ref([]);
const declaringBye = ref(false);
const volunteering = ref({});
const assigning = ref({});
const captainPick = ref({});
const showCompleteModal = ref(false);
const completingAssignment = ref(null);
const completeNotes = ref('');
const completing = ref(false);
const detailTask = ref(null);

const hasByeDeclaredForWeek = computed(() =>
  (byeWeeks.value || []).some((b) => String(b.week_start_date || '').slice(0, 10) === String(weekStart.value || '').slice(0, 10))
);

const isOnMyTeam = computed(() => !!myTeam.value);

function getThisWeekSunday() {
  const d = new Date();
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay());
  return sun.toISOString().slice(0, 10);
}

function modeLabel(mode) {
  if (mode === 'full_team') return 'Full Team';
  if (mode === 'captain_assigns') return 'Captain Assigns';
  return 'Volunteer';
}

function modeBadgeClass(mode) {
  if (mode === 'full_team') return 'badge-full-team';
  if (mode === 'captain_assigns') return 'badge-captain';
  return 'badge-volunteer';
}

const myTeamAssignment = (taskId) =>
  assignments.value.find(
    (a) => Number(a.task_id) === Number(taskId) && myTeam.value && Number(a.team_id) === Number(myTeam.value.id)
  ) || null;

const assigneeName = (a) =>
  a ? `${a.provider_first_name || ''} ${a.provider_last_name || ''}`.trim() || '—' : '—';

const isMyAssignment = (a) => a && Number(a.provider_user_id) === Number(props.myUserId);

const hasTaggedWorkout = (taskId, userId) =>
  taggedWorkouts.value.some(
    (w) => Number(w.weekly_task_id) === Number(taskId) && Number(w.user_id) === Number(userId)
  );

const openCompleteModal = (a) => {
  completingAssignment.value = a;
  completeNotes.value = '';
  showCompleteModal.value = true;
};

const openDetail = (t) => {
  detailTask.value = t;
};

const promptTagWorkout = (t) => {
  detailTask.value = t;
};

const submitComplete = async () => {
  if (!completingAssignment.value || !props.challengeId) return;
  completing.value = true;
  try {
    await api.post(
      `/learning-program-classes/${props.challengeId}/weekly-assignments/${completingAssignment.value.id}/complete`,
      { notes: completeNotes.value }
    );
    showCompleteModal.value = false;
    completingAssignment.value = null;
    await load();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to mark complete');
  } finally {
    completing.value = false;
  }
};

const volunteer = async (task) => {
  if (!myTeam.value) return alert('You are not on a team yet.');
  volunteering.value = { ...volunteering.value, [task.id]: true };
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/weekly-assignments`, {
      taskId: task.id,
      teamId: myTeam.value.id,
      providerUserId: props.myUserId,
      volunteered: true
    });
    await load();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to volunteer');
  } finally {
    volunteering.value = { ...volunteering.value, [task.id]: false };
  }
};

const captainAssign = async (task) => {
  const memberId = captainPick.value[task.id];
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
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to assign member');
  } finally {
    assigning.value = { ...assigning.value, [task.id]: false };
  }
};

const declareByeWeek = async () => {
  if (!props.challengeId || !byeWeekAllowed.value) return;
  declaringBye.value = true;
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/bye-weeks/declare`, {
      week: weekStart.value
    });
    await load();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to declare bye week');
  } finally {
    declaringBye.value = false;
  }
};

const load = async () => {
  if (!props.challengeId) return;
  loading.value = true;
  try {
    const [tasksRes, assignRes, classRes, byeRes, myTeamsRes] = await Promise.all([
      api.get(`/learning-program-classes/${props.challengeId}/weekly-tasks`, {
        params: { week: weekStart.value }, skipGlobalLoading: true
      }),
      api.get(`/learning-program-classes/${props.challengeId}/weekly-assignments`, {
        params: { week: weekStart.value }, skipGlobalLoading: true
      }),
      api.get(`/learning-program-classes/${props.challengeId}`, { skipGlobalLoading: true }),
      api.get(`/learning-program-classes/${props.challengeId}/bye-weeks/my`, { skipGlobalLoading: true }),
      api.get('/challenges/my-teams', { skipGlobalLoading: true }).catch(() => ({ data: { teams: [] } }))
    ]);

    tasks.value = Array.isArray(tasksRes.data?.tasks) ? tasksRes.data.tasks : [];
    assignments.value = Array.isArray(assignRes.data?.assignments) ? assignRes.data.assignments : [];
    byeWeeks.value = Array.isArray(byeRes.data?.byeWeeks) ? byeRes.data.byeWeeks : [];

    const settings = classRes.data?.class?.season_settings_json && typeof classRes.data.class.season_settings_json === 'object'
      ? classRes.data.class.season_settings_json
      : {};
    const bye = settings.byeWeek || {};
    byeWeekAllowed.value = bye.allowByeWeek === true;
    maxByeWeeks.value = Number(bye.maxByeWeeksPerParticipant ?? 1);

    // Find current user's team in this challenge
    const allMyTeams = Array.isArray(myTeamsRes.data?.teams) ? myTeamsRes.data.teams : [];
    const found = allMyTeams.find((t) => Number(t.challenge_id) === Number(props.challengeId));
    myTeam.value = found || null;

    // Load team members for captain assignment + full-team display
    if (myTeam.value?.team_id) {
      try {
        const membRes = await api.get(
          `/learning-program-classes/${props.challengeId}/teams/${myTeam.value.team_id}/members`,
          { skipGlobalLoading: true }
        );
        myTeamMembers.value = Array.isArray(membRes.data?.members) ? membRes.data.members : [];
      } catch {
        myTeamMembers.value = [];
      }

      // For full-team tasks, load tagged workouts for the week
      if (tasks.value.some((t) => t.mode === 'full_team')) {
        try {
          const wRes = await api.get(
            `/learning-program-classes/${props.challengeId}/workouts`,
            { params: { week: weekStart.value, teamId: myTeam.value.team_id, hasTask: true }, skipGlobalLoading: true }
          ).catch(() => ({ data: { workouts: [] } }));
          taggedWorkouts.value = Array.isArray(wRes.data?.workouts) ? wRes.data.workouts : [];
        } catch {
          taggedWorkouts.value = [];
        }
      }
    } else {
      myTeamMembers.value = [];
      taggedWorkouts.value = [];
    }
  } catch {
    tasks.value = [];
    assignments.value = [];
    byeWeeks.value = [];
    byeWeekAllowed.value = false;
  } finally {
    loading.value = false;
  }
};

watch(() => props.challengeId, load, { immediate: true });
watch(() => props.isCaptain, load);
watch(weekStart, load);

defineExpose({ load });
</script>

<style scoped>
.challenge-weekly-tasks { }

.tasks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.tasks-header h2 { margin: 0; font-size: 1.1em; }

.tasks-week-selector { display: flex; align-items: center; gap: 8px; }
.tasks-week-selector input { padding: 6px 10px; border: 1px solid var(--border, #ccc); border-radius: 4px; }

.tasks-list { display: flex; flex-direction: column; gap: 14px; }

.task-card {
  padding: 14px 16px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: var(--surface, #fff);
}
.task-card:hover { border-color: var(--primary, #1976d2); box-shadow: 0 2px 8px rgba(0,0,0,0.07); }

.task-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}
.task-card-header h4 { margin: 0; font-size: 1em; flex: 1; }

.mode-badge {
  font-size: 0.72em;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
  letter-spacing: 0.02em;
}
.badge-full-team { background: #fff3e0; color: #e65100; }
.badge-captain { background: #e3f2fd; color: #1565c0; }
.badge-volunteer { background: #e8f5e9; color: #2e7d32; }

.task-desc { margin: 4px 0 10px 0; font-size: 0.88em; color: var(--text-muted, #666); }

/* Full-team member grid */
.full-team-members {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.member-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.83em;
  background: #f5f5f5;
  border: 1px solid #ddd;
  color: var(--text-secondary, #555);
}
.member-pill.member-done { background: #e8f5e9; border-color: #a5d6a7; color: #2e7d32; }
.pill-check { font-size: 0.85em; }
.hint-sm { font-size: 0.82em; color: var(--text-muted, #888); }

/* Volunteer / assigned */
.task-assignment { }
.assignee-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.assignee-label { font-size: 0.82em; color: var(--text-muted, #777); }
.assignee-name { font-weight: 600; font-size: 0.92em; }
.badge-done { background: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 4px; font-size: 0.82em; }
.badge-volunteered { background: #e3f2fd; color: #1565c0; padding: 2px 8px; border-radius: 4px; font-size: 0.82em; }

.task-unassigned { }
.unassigned-label { font-size: 0.88em; color: var(--text-muted, #888); display: block; margin-bottom: 8px; }
.assign-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.captain-select { padding: 5px 8px; border: 1px solid var(--border, #ccc); border-radius: 4px; font-size: 0.88em; }

.task-actions { margin-top: 8px; }

.task-card-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-light, #f0f0f0);
}
.btn-link {
  background: none;
  border: none;
  color: var(--primary, #1976d2);
  font-size: 0.82em;
  cursor: pointer;
  padding: 0;
}
.btn-link:hover { text-decoration: underline; }
.btn-outline {
  background: transparent;
  border: 1px solid var(--primary, #1976d2);
  color: var(--primary, #1976d2);
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 0.85em;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-outline:hover { background: rgba(25, 118, 210, 0.07); }
.btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }

.empty-hint, .loading-inline { padding: 12px; color: var(--text-muted, #666); font-size: 0.9em; }
.hint { font-size: 0.85em; color: var(--text-muted, #777); }

/* Complete modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { background: var(--surface, #fff); border-radius: 10px; padding: 24px; min-width: 320px; max-width: 480px; width: 90%; }
.modal-content h3 { margin: 0 0 12px 0; }
.modal-content .form-group { margin-bottom: 16px; }
.modal-content label { display: block; font-size: 0.88em; margin-bottom: 4px; }
.modal-content textarea { width: 100%; padding: 8px; border: 1px solid var(--border, #ccc); border-radius: 4px; resize: vertical; }
.form-actions { display: flex; gap: 12px; margin-top: 16px; justify-content: flex-end; }
</style>
